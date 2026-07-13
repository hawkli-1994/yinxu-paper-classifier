import { dialog, ipcMain, shell, type WebContents } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { AppSettings, CreateProjectInput, KnowledgePackage, LocalFileSelection, PaperResult, ProjectPreparation, ProjectRecord, ProjectWorkspace, ReviewFeedbackInput, RunEvent, SettingsInput, SettingsView, SupplementalFileInput, SupplementalNoteInput } from '../shared/contracts';
import { getAgentCredentialKey, getProviderPreset } from '../shared/provider-config';
import { normalizePaperResult } from '../shared/result-normalizer';
import { paperResultToDraft, summarizeReviewChanges } from '../shared/review-model';
import { isAuthorMetadataOnlyFeedback } from '../shared/feedback-policy';
import { createAgentRun } from './agent-service';
import { createElectronCredentialVault } from './credentials-service';
import { exportWorkbook } from './export-service';
import { getProjectDirectory } from './paths';
import { buildTextPreparationReport, inspectPdf, writeExtractedText } from './pdf-service';
import { processPagesWithOcrMode } from './ocr-service';
import {
  activateResultRevision,
  completeClassificationRun,
  createClassificationRun,
  createProject,
  failClassificationRun,
  listProjectSummaries,
  loadProjectWorkspace,
  markProjectMaterialsUpdated,
  readProject,
  readResultRevision,
  saveFinalResult,
  saveReviewRevision,
  updateProjectMetadata
} from './project-service';
import { loadSettings, saveSettings } from './settings-service';
import {
  approveCandidateRule,
  clearFeedbackMemory,
  createPersonalRule,
  deletePersonalRule,
  exportMemory,
  getMemorySnapshot,
  recordReviewFeedback,
  rejectCandidateRule,
  retrieveMemoryContext,
  rollbackGlobalMemorySettings,
  rollbackPersonalRule,
  updateGlobalMemorySettings,
  updatePersonalRule
} from './memory-service';
import { activeSupplementalMaterials, addSupplementalFiles, addSupplementalNote, listSupplementalMaterials, removeSupplementalMaterial } from './supplement-service';
import { acquireClassificationLock, getActiveClassification } from './classification-lock';

const getResult = async (project: ProjectRecord): Promise<PaperResult> => {
  if (project.activeRevisionId) return readResultRevision(project, project.activeRevisionId);
  try {
    return JSON.parse(await readFile(join(project.rootPath, 'result', 'final-result.json'), 'utf8')) as PaperResult;
  } catch {
    return JSON.parse(await readFile(join(project.rootPath, 'result', 'agent-result.json'), 'utf8')) as PaperResult;
  }
};

const toFileSelection = async (path: string): Promise<LocalFileSelection> => ({
  path,
  name: basename(path),
  extension: extname(path).toLocaleLowerCase(),
  size: (await stat(path)).size
});

const assertProjectNotClassifying = (projectId: string): void => {
  if (getActiveClassification()?.projectId === projectId) throw new Error('当前项目正在分类，请等待本次运行结束后再修改材料、复核或切换版本。');
};

const readPreparedPages = async (project: ProjectRecord): Promise<Array<{ page: number; text: string; source?: 'embedded' | 'ocr' | 'mixed' }>> =>
  (await readFile(join(project.rootPath, 'extracted', 'text.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const toSettingsView = async (appRoot: string, settings: AppSettings): Promise<SettingsView> => {
  const vault = createElectronCredentialVault(appRoot);
  return {
    ...settings,
    hasAgentKey: Boolean(settings.agent.provider && (await vault.get(getAgentCredentialKey(settings.agent)))),
    hasOcrKey: Boolean(await vault.get('ocr:siliconflow'))
  };
};

const prepareProject = async (appRoot: string, project: ProjectRecord, settings: AppSettings): Promise<ProjectPreparation> => {
  const inspection = await inspectPdf(project.sourcePdfPath);
  const vault = createElectronCredentialVault(appRoot);
  const ocrKey = await vault.get('ocr:siliconflow');
  const processed = await processPagesWithOcrMode({
    mode: settings.ocr.mode,
    pdfBytes: new Uint8Array(await readFile(project.sourcePdfPath)),
    pages: inspection.pages,
    pagesNeedingOcr: inspection.pagesNeedingOcr,
    config: ocrKey ? {
      baseUrl: settings.ocr.baseUrl,
      apiKey: ocrKey,
      model: settings.ocr.model
    } : undefined
  });
  const textReport = {
    ...buildTextPreparationReport(processed.pages, processed.cloudAppliedPages),
    ocrMode: settings.ocr.mode,
    cloudAttemptedPages: processed.cloudAttemptedPages,
    localFallbackPages: processed.localFallbackPages
  };
  await writeExtractedText(project.rootPath, processed.pages, textReport);
  const preparedProject = await updateProjectMetadata(project, { ocrModel: settings.ocr.model });
  return {
    project: preparedProject,
    pageCount: inspection.pageCount,
    ocrMode: settings.ocr.mode,
    pagesNeedingOcr: inspection.pagesNeedingOcr,
    ocrApplied: processed.cloudAppliedPages.length > 0,
    textReport
  };
};

export const registerIpcHandlers = (appRoot: string, knowledgePackage: KnowledgePackage): void => {
  ipcMain.handle('settings:get', async (): Promise<SettingsView> => toSettingsView(appRoot, await loadSettings(appRoot)));

  ipcMain.handle('system:open-provider-api-key-page', async (_event, provider: string): Promise<void> => {
    const targetUrl = getProviderPreset(provider)?.apiKeyUrl;
    if (!targetUrl) throw new Error('该 Provider 没有可打开的 API Key 页面。');
    await shell.openExternal(targetUrl);
  });

  ipcMain.handle('system:open-ocr-signup-page', async (): Promise<void> => {
    await shell.openExternal('https://cloud.siliconflow.cn/i/tN14aFYp');
  });

  ipcMain.handle('settings:save', async (_event, input: SettingsInput): Promise<SettingsView> => {
    const settings: AppSettings = { agent: input.agent, ocr: input.ocr, memory: input.memory };
    const vault = createElectronCredentialVault(appRoot);
    if (input.ocr.mode === 'cloud' && !input.ocrApiKey?.trim() && !(await vault.get('ocr:siliconflow'))) {
      throw new Error('选择“云端 OCR”时必须配置 OCR API Key。');
    }
    if (input.agentApiKey?.trim() && input.agent.provider) await vault.set(getAgentCredentialKey(input.agent), input.agentApiKey.trim());
    if (input.ocrApiKey?.trim()) await vault.set('ocr:siliconflow', input.ocrApiKey.trim());
    await saveSettings(appRoot, settings);
    return toSettingsView(appRoot, settings);
  });

  ipcMain.handle('project:select-primary', async (): Promise<LocalFileSelection | undefined> => {
    const selection = await dialog.showOpenDialog({
      title: '选择殷墟研究论文 PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF 文献', extensions: ['pdf'] }]
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return undefined;
    return toFileSelection(sourcePath);
  });

  ipcMain.handle('project:select-supplements', async (): Promise<LocalFileSelection[]> => {
    const selection = await dialog.showOpenDialog({
      title: '选择补充材料',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '补充材料', extensions: ['pdf', 'txt', 'md'] }]
    });
    if (selection.canceled) return [];
    return Promise.all(selection.filePaths.map(toFileSelection));
  });

  ipcMain.handle('project:create', async (_event, input: CreateProjectInput): Promise<ProjectWorkspace> => {
    if (extname(input.sourcePdfPath).toLocaleLowerCase() !== '.pdf') throw new Error('主论文必须是 PDF。');
    const settings = await loadSettings(appRoot);
    if (settings.ocr.mode === 'cloud') {
      const vault = createElectronCredentialVault(appRoot);
      if (!(await vault.get('ocr:siliconflow'))) throw new Error('当前为“云端 OCR”模式，请先在设置中配置 OCR API Key。');
    }
    let project = await createProject(input.sourcePdfPath, appRoot, knowledgePackage.version);
    const preparation = await prepareProject(appRoot, project, settings);
    project = preparation.project;
    if (input.supplementalFiles.length) await addSupplementalFiles(project, input.supplementalFiles);
    for (const note of input.supplementalNotes) await addSupplementalNote(project, note);
    return loadProjectWorkspace(appRoot, project.id);
  });

  ipcMain.handle('project:list', async () => listProjectSummaries(appRoot));
  ipcMain.handle('project:open', async (_event, projectId: string): Promise<ProjectWorkspace> => loadProjectWorkspace(appRoot, projectId));

  ipcMain.handle('project:get', async (_event, projectId: string): Promise<ProjectRecord> => readProject(getProjectDirectory(appRoot, projectId)));

  ipcMain.handle('project:get-source-pdf', async (_event, projectId: string): Promise<Uint8Array> => {
    const project = await readProject(getProjectDirectory(appRoot, projectId));
    return new Uint8Array(await readFile(project.sourcePdfPath));
  });

  ipcMain.handle('project:add-supplement-files', async (_event, projectId: string, files: SupplementalFileInput[]): Promise<ProjectWorkspace> => {
    assertProjectNotClassifying(projectId);
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    await addSupplementalFiles(project, files);
    project = await markProjectMaterialsUpdated(project);
    return loadProjectWorkspace(appRoot, project.id);
  });

  ipcMain.handle('project:add-supplement-note', async (_event, projectId: string, note: SupplementalNoteInput): Promise<ProjectWorkspace> => {
    assertProjectNotClassifying(projectId);
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    await addSupplementalNote(project, note);
    project = await markProjectMaterialsUpdated(project);
    return loadProjectWorkspace(appRoot, project.id);
  });

  ipcMain.handle('project:remove-supplement', async (_event, projectId: string, materialId: string): Promise<ProjectWorkspace> => {
    assertProjectNotClassifying(projectId);
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    await removeSupplementalMaterial(project, materialId);
    project = await markProjectMaterialsUpdated(project);
    return loadProjectWorkspace(appRoot, project.id);
  });

  ipcMain.handle('classification:run', async (event, projectId: string): Promise<ProjectWorkspace> => {
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    const settings = await loadSettings(appRoot);
    const vault = createElectronCredentialVault(appRoot);
    const apiKey = settings.agent.provider ? await vault.get(getAgentCredentialKey(settings.agent)) : undefined;
    if (!settings.agent.provider || !settings.agent.modelId || !apiKey) throw new Error('请先在设置中完成 Agent Provider、模型和 API Key 配置。');
    const releaseClassificationLock = acquireClassificationLock(projectId, 'pending');
    const webContents: WebContents = event.sender;
    let created: Awaited<ReturnType<typeof createClassificationRun>> | undefined;

    try {
      project = await updateProjectMetadata(project, {
        agentProvider: settings.agent.provider,
        agentModel: settings.agent.modelId,
        thinkingLevel: settings.agent.thinkingLevel,
        ocrModel: settings.ocr.model,
        knowledgeVersion: knowledgePackage.version
      });
      const supplements = activeSupplementalMaterials(await listSupplementalMaterials(project));
      created = await createClassificationRun(project, {
        agentProvider: settings.agent.provider,
        agentModel: settings.agent.modelId,
        thinkingLevel: settings.agent.thinkingLevel,
        knowledgeVersion: knowledgePackage.version,
        ocrModel: settings.ocr.model
      }, supplements);
      project = created.project;
      const send = (runEvent: Omit<RunEvent, 'projectId' | 'runId'>): void => webContents.send('classification:event', { projectId, runId: created!.run.id, ...runEvent } satisfies RunEvent);
      const paperText = await readFile(join(project.rootPath, 'extracted', 'full-text.md'), 'utf8');
      const memoryContext = await retrieveMemoryContext(appRoot, paperText, settings.memory);
      const result = await createAgentRun(project, knowledgePackage.path, {
        provider: settings.agent.provider,
        modelId: settings.agent.modelId,
        thinkingLevel: settings.agent.thinkingLevel,
        baseUrl: settings.agent.baseUrl,
        runtimeApiKey: apiKey,
        agentDirectory: join(appRoot, 'agent'),
        memoryContext,
        sessionDirectory: created.run.sessionPath,
        supplementContextPath: created.run.supplementContextPath!
      }, send);
      project = await completeClassificationRun(project, created.run, created.runDirectory, result);
      return loadProjectWorkspace(appRoot, project.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '分类失败。';
      if (created) {
        await failClassificationRun(project, created.run, created.runDirectory, detail);
        webContents.send('classification:event', { projectId, runId: created.run.id, phase: 'failed', detail } satisfies RunEvent);
      }
      throw error;
    } finally {
      releaseClassificationLock();
    }
  });

  ipcMain.handle('review:save', async (_event, projectId: string, result: PaperResult, feedback?: ReviewFeedbackInput): Promise<ProjectWorkspace> => {
    assertProjectNotClassifying(projectId);
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    const before = await getResult(project);
    const feedbackInput = feedback ?? { errorTypes: [], projectReason: '', memoryAction: 'global_memory', reusableLesson: '' };
    if (feedbackInput.memoryAction === 'candidate_rule' && !feedbackInput.reusableLesson.trim()) {
      throw new Error('生成全局候选规则时必须填写可复用经验。');
    }
    if (feedbackInput.memoryAction === 'candidate_rule' && isAuthorMetadataOnlyFeedback(feedbackInput)) {
      throw new Error('作者姓名、单位和身份反馈不能生成跨项目分类规则。');
    }
    const textReport = JSON.parse(await readFile(join(project.rootPath, 'extracted', 'report.json'), 'utf8')) as { quality: PaperResult['ocrQuality'] };
    const projectReason = feedbackInput.projectReason.trim().slice(0, 2000);
    const normalizedBase = normalizePaperResult(paperResultToDraft(result), await readPreparedPages(project), {
      ocrQuality: textReport.quality,
      reviewed: true,
      reviewHistory: before.reviewHistory ?? [],
      memoryTrace: before.memoryTrace
    });
    const changeSummary = summarizeReviewChanges(before, normalizedBase);
    const revisionSummary = projectReason ? `${changeSummary}；本论文复核说明：${projectReason}` : changeSummary;
    const normalized = {
      ...normalizedBase,
      reviewHistory: [...(before.reviewHistory ?? []), { at: new Date().toISOString(), summary: revisionSummary }]
    };
    await saveFinalResult(project, normalized);
    await recordReviewFeedback(appRoot, project, before, normalized, feedbackInput);
    project = await saveReviewRevision(project, normalized, revisionSummary);
    return loadProjectWorkspace(appRoot, project.id);
  });

  ipcMain.handle('project:activate-revision', async (_event, projectId: string, revisionId: string): Promise<ProjectWorkspace> => {
    assertProjectNotClassifying(projectId);
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    project = await activateResultRevision(project, revisionId);
    return loadProjectWorkspace(appRoot, project.id);
  });

  ipcMain.handle('workbook:export', async (_event, projectId: string): Promise<string> => {
    const project = await readProject(getProjectDirectory(appRoot, projectId));
    return exportWorkbook(project, await getResult(project));
  });

  ipcMain.handle('memory:get', async () => getMemorySnapshot(appRoot));
  ipcMain.handle('memory:settings-update', async (_event, input) => updateGlobalMemorySettings(appRoot, input));
  ipcMain.handle('memory:settings-rollback', async () => rollbackGlobalMemorySettings(appRoot));
  ipcMain.handle('memory:rule-create', async (_event, input) => createPersonalRule(appRoot, input));
  ipcMain.handle('memory:rule-update', async (_event, ruleId, input) => updatePersonalRule(appRoot, ruleId, input));
  ipcMain.handle('memory:rule-delete', async (_event, ruleId) => deletePersonalRule(appRoot, ruleId));
  ipcMain.handle('memory:rule-rollback', async (_event, ruleId) => rollbackPersonalRule(appRoot, ruleId));
  ipcMain.handle('memory:candidate-approve', async (_event, candidateId) => approveCandidateRule(appRoot, candidateId));
  ipcMain.handle('memory:candidate-reject', async (_event, candidateId) => rejectCandidateRule(appRoot, candidateId));
  ipcMain.handle('memory:feedback-clear', async () => clearFeedbackMemory(appRoot));
  ipcMain.handle('memory:export', async () => exportMemory(appRoot));
};
