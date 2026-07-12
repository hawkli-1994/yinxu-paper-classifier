import { dialog, ipcMain, shell, type WebContents } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings, KnowledgePackage, PaperResult, ProjectPreparation, ProjectRecord, ReviewFeedbackInput, RunEvent, SettingsInput, SettingsView } from '../shared/contracts';
import { getAgentCredentialKey, getProviderPreset } from '../shared/provider-config';
import { normalizePaperResult } from '../shared/result-normalizer';
import { paperResultToDraft, summarizeReviewChanges } from '../shared/review-model';
import { createAgentRun } from './agent-service';
import { createElectronCredentialVault } from './credentials-service';
import { exportWorkbook } from './export-service';
import { getProjectDirectory } from './paths';
import { buildTextPreparationReport, inspectPdf, writeExtractedText } from './pdf-service';
import { ocrPagesIndividually } from './ocr-service';
import { createProject, readProject, saveFinalResult, updateProjectMetadata, updateProjectStatus } from './project-service';
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
  rollbackPersonalRule,
  updatePersonalRule
} from './memory-service';

const getResult = async (project: ProjectRecord): Promise<PaperResult> => {
  try {
    return JSON.parse(await readFile(join(project.rootPath, 'result', 'final-result.json'), 'utf8')) as PaperResult;
  } catch {
    return JSON.parse(await readFile(join(project.rootPath, 'result', 'agent-result.json'), 'utf8')) as PaperResult;
  }
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
  let pages = inspection.pages;
  let ocrApplied = false;
  const vault = createElectronCredentialVault(appRoot);
  const ocrKey = await vault.get('ocr:siliconflow');

  if (inspection.pagesNeedingOcr.length > 0 && ocrKey) {
    pages = await ocrPagesIndividually(new Uint8Array(await readFile(project.sourcePdfPath)), pages, inspection.pagesNeedingOcr, {
      baseUrl: settings.ocr.baseUrl,
      apiKey: ocrKey,
      model: settings.ocr.model
    });
    ocrApplied = true;
  }

  const textReport = buildTextPreparationReport(pages, ocrApplied ? inspection.pagesNeedingOcr : []);
  await writeExtractedText(project.rootPath, pages, textReport);
  const preparedProject = await updateProjectMetadata(project, { ocrModel: settings.ocr.model });
  return { project: preparedProject, pageCount: inspection.pageCount, pagesNeedingOcr: inspection.pagesNeedingOcr, ocrApplied, textReport };
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
    if (input.agentApiKey?.trim() && input.agent.provider) await vault.set(getAgentCredentialKey(input.agent), input.agentApiKey.trim());
    if (input.ocrApiKey?.trim()) await vault.set('ocr:siliconflow', input.ocrApiKey.trim());
    await saveSettings(appRoot, settings);
    return toSettingsView(appRoot, settings);
  });

  ipcMain.handle('project:select-and-create', async (): Promise<ProjectPreparation | undefined> => {
    const selection = await dialog.showOpenDialog({
      title: '选择殷墟研究论文 PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF 文献', extensions: ['pdf'] }]
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return undefined;
    const project = await createProject(sourcePath, appRoot, knowledgePackage.version);
    return prepareProject(appRoot, project, await loadSettings(appRoot));
  });

  ipcMain.handle('project:get', async (_event, projectId: string): Promise<ProjectRecord> => readProject(getProjectDirectory(appRoot, projectId)));

  ipcMain.handle('project:get-source-pdf', async (_event, projectId: string): Promise<Uint8Array> => {
    const project = await readProject(getProjectDirectory(appRoot, projectId));
    return new Uint8Array(await readFile(project.sourcePdfPath));
  });

  ipcMain.handle('classification:run', async (event, projectId: string): Promise<PaperResult> => {
    let project = await readProject(getProjectDirectory(appRoot, projectId));
    project = await updateProjectStatus(project, 'processing');
    const settings = await loadSettings(appRoot);
    const vault = createElectronCredentialVault(appRoot);
    const apiKey = settings.agent.provider ? await vault.get(getAgentCredentialKey(settings.agent)) : undefined;
    if (!settings.agent.provider || !settings.agent.modelId || !apiKey) throw new Error('请先在设置中完成 Agent Provider、模型和 API Key 配置。');
    project = await updateProjectMetadata(project, {
      agentProvider: settings.agent.provider,
      agentModel: settings.agent.modelId,
      thinkingLevel: settings.agent.thinkingLevel,
      ocrModel: settings.ocr.model,
      knowledgeVersion: knowledgePackage.version
    });
    const webContents: WebContents = event.sender;
    const send = (runEvent: Omit<RunEvent, 'projectId'>): void => webContents.send('classification:event', { projectId, ...runEvent } satisfies RunEvent);

    try {
      const paperText = await readFile(join(project.rootPath, 'extracted', 'full-text.md'), 'utf8');
      const memoryContext = await retrieveMemoryContext(appRoot, paperText, settings.memory);
      const result = await createAgentRun(project, knowledgePackage.path, {
        provider: settings.agent.provider,
        modelId: settings.agent.modelId,
        thinkingLevel: settings.agent.thinkingLevel,
        baseUrl: settings.agent.baseUrl,
        runtimeApiKey: apiKey,
        agentDirectory: join(appRoot, 'agent'),
        memoryContext
      }, send);
      await updateProjectStatus(project, 'review_required');
      return result;
    } catch (error) {
      await updateProjectStatus(project, 'failed');
      send({ phase: 'failed', detail: error instanceof Error ? error.message : '分类失败。' });
      throw error;
    }
  });

  ipcMain.handle('review:save', async (_event, projectId: string, result: PaperResult, feedback?: ReviewFeedbackInput): Promise<PaperResult> => {
    const project = await readProject(getProjectDirectory(appRoot, projectId));
    const before = await getResult(project);
    const textReport = JSON.parse(await readFile(join(project.rootPath, 'extracted', 'report.json'), 'utf8')) as { quality: PaperResult['ocrQuality'] };
    const reviewHistory = [
      ...(before.reviewHistory ?? []),
      { at: new Date().toISOString(), summary: summarizeReviewChanges(before, result) }
    ];
    const normalized = normalizePaperResult(paperResultToDraft(result), await readPreparedPages(project), {
      ocrQuality: textReport.quality,
      reviewed: true,
      reviewHistory,
      memoryTrace: before.memoryTrace
    });
    await saveFinalResult(project, normalized);
    await recordReviewFeedback(appRoot, project, before, normalized, feedback ?? { errorTypes: [], reason: '', rememberAsCandidate: false });
    await updateProjectStatus(project, 'confirmed');
    return normalized;
  });

  ipcMain.handle('workbook:export', async (_event, projectId: string): Promise<string> => {
    const project = await readProject(getProjectDirectory(appRoot, projectId));
    return exportWorkbook(project, await getResult(project));
  });

  ipcMain.handle('memory:get', async () => getMemorySnapshot(appRoot));
  ipcMain.handle('memory:rule-create', async (_event, input) => createPersonalRule(appRoot, input));
  ipcMain.handle('memory:rule-update', async (_event, ruleId, input) => updatePersonalRule(appRoot, ruleId, input));
  ipcMain.handle('memory:rule-delete', async (_event, ruleId) => deletePersonalRule(appRoot, ruleId));
  ipcMain.handle('memory:rule-rollback', async (_event, ruleId) => rollbackPersonalRule(appRoot, ruleId));
  ipcMain.handle('memory:candidate-approve', async (_event, candidateId) => approveCandidateRule(appRoot, candidateId));
  ipcMain.handle('memory:candidate-reject', async (_event, candidateId) => rejectCandidateRule(appRoot, candidateId));
  ipcMain.handle('memory:feedback-clear', async () => clearFeedbackMemory(appRoot));
  ipcMain.handle('memory:export', async () => exportMemory(appRoot));
};
