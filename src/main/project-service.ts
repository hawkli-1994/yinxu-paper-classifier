import { createHash, randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  ClassificationRunRecord,
  PaperResult,
  ProjectPreparation,
  ProjectRecord,
  ProjectStatus,
  ProjectSummary,
  ProjectWorkspace,
  ResultRevisionRecord,
  SupplementalMaterialRecord,
  ThinkingLevel
} from '../shared/contracts';
import { getProjectDirectory, getProjectsDirectory } from './paths';
import { activeSupplementalMaterials, listSupplementalMaterials } from './supplement-service';

const PROJECT_SCHEMA_VERSION = 2;
const now = (): string => new Date().toISOString();
const runsDirectory = (project: ProjectRecord): string => join(project.rootPath, 'runs');
const revisionsDirectory = (project: ProjectRecord): string => join(project.rootPath, 'revisions');
const revisionsManifestPath = (project: ProjectRecord): string => join(revisionsDirectory(project), 'manifest.json');

const writeJsonAtomically = async (targetPath: string, value: unknown): Promise<void> => {
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, targetPath);
};

const writeProject = async (project: ProjectRecord): Promise<ProjectRecord> => {
  await writeJsonAtomically(join(project.rootPath, 'project.json'), project);
  return project;
};

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export const createProject = async (sourcePath: string, appRoot: string, knowledgeVersion: string): Promise<ProjectRecord> => {
  const source = await readFile(sourcePath);
  const id = randomUUID();
  const rootPath = getProjectDirectory(appRoot, id);
  const sourceDirectory = join(rootPath, 'source');
  const resultDirectory = join(rootPath, 'result');
  const createdAt = now();
  const sourcePdfPath = join(sourceDirectory, 'original.pdf');

  await Promise.all([
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(resultDirectory, { recursive: true }),
    mkdir(join(rootPath, 'supplements'), { recursive: true }),
    mkdir(join(rootPath, 'runs'), { recursive: true }),
    mkdir(join(rootPath, 'revisions'), { recursive: true })
  ]);
  await copyFile(sourcePath, sourcePdfPath);

  const project: ProjectRecord = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    rootPath,
    sourcePdfPath,
    sourceFileName: basename(sourcePath),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    status: 'imported',
    createdAt,
    updatedAt: createdAt,
    knowledgeVersion
  };
  return writeProject(project);
};

const listRuns = async (project: ProjectRecord): Promise<ClassificationRunRecord[]> => {
  try {
    const entries = await readdir(runsDirectory(project), { withFileTypes: true });
    const runs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readJson<ClassificationRunRecord | undefined>(join(runsDirectory(project), entry.name, 'run.json'), undefined)));
    return runs.filter((run): run is ClassificationRunRecord => Boolean(run)).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

const listRevisions = (project: ProjectRecord): Promise<ResultRevisionRecord[]> => readJson(revisionsManifestPath(project), []);

const createResultRevision = async (
  project: ProjectRecord,
  runId: string,
  kind: ResultRevisionRecord['kind'],
  result: PaperResult,
  summary: string,
  parentRevisionId?: string
): Promise<ResultRevisionRecord> => {
  await mkdir(revisionsDirectory(project), { recursive: true });
  const id = randomUUID();
  const resultPath = join(revisionsDirectory(project), `${id}.json`);
  const revision: ResultRevisionRecord = { id, projectId: project.id, runId, kind, parentRevisionId, resultPath, summary, createdAt: now() };
  const revisions = await listRevisions(project);
  await Promise.all([writeJsonAtomically(resultPath, result), writeJsonAtomically(revisionsManifestPath(project), [...revisions, revision])]);
  return revision;
};

const migrateLegacyProject = async (project: ProjectRecord): Promise<ProjectRecord> => {
  if (project.schemaVersion === PROJECT_SCHEMA_VERSION) return project;
  await Promise.all([mkdir(runsDirectory(project), { recursive: true }), mkdir(revisionsDirectory(project), { recursive: true }), mkdir(join(project.rootPath, 'supplements'), { recursive: true })]);
  const finalPath = join(project.rootPath, 'result', 'final-result.json');
  const agentPath = join(project.rootPath, 'result', 'agent-result.json');
  const legacyResultPath = await pathExists(finalPath) ? finalPath : await pathExists(agentPath) ? agentPath : undefined;
  let activeRunId: string | undefined;
  let activeRevisionId: string | undefined;
  if (legacyResultPath) {
    const result = JSON.parse(await readFile(legacyResultPath, 'utf8')) as PaperResult;
    const runId = `legacy-${project.createdAt.replace(/[^0-9]/g, '').slice(0, 14) || randomUUID()}`;
    const runPath = join(runsDirectory(project), runId);
    await mkdir(join(runPath, 'session'), { recursive: true });
    const revision = await createResultRevision(project, runId, result.reviewStatus === 'confirmed' ? 'review' : 'agent', result, '从旧版项目迁移的结果');
    const run: ClassificationRunRecord = {
      id: runId,
      projectId: project.id,
      status: 'completed',
      startedAt: project.createdAt,
      completedAt: project.updatedAt,
      agentProvider: project.agentProvider ?? 'legacy',
      agentModel: project.agentModel ?? 'legacy',
      thinkingLevel: project.thinkingLevel ?? 'medium',
      knowledgeVersion: project.knowledgeVersion,
      ocrModel: project.ocrModel ?? '',
      supplementIds: [],
      supplementHashes: [],
      sessionPath: join(runPath, 'session'),
      resultRevisionId: revision.id
    };
    await writeJsonAtomically(join(runPath, 'run.json'), run);
    activeRunId = runId;
    activeRevisionId = revision.id;
  }
  return writeProject({ ...project, schemaVersion: PROJECT_SCHEMA_VERSION, activeRunId, activeRevisionId });
};

export const readProject = async (projectRoot: string): Promise<ProjectRecord> => {
  const project = JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf8')) as ProjectRecord;
  return migrateLegacyProject(project);
};

export const updateProjectStatus = async (project: ProjectRecord, status: ProjectStatus): Promise<ProjectRecord> =>
  writeProject({ ...project, status, updatedAt: now() });

export const updateProjectMetadata = async (
  project: ProjectRecord,
  metadata: Partial<Pick<ProjectRecord, 'agentProvider' | 'agentModel' | 'thinkingLevel' | 'ocrModel' | 'knowledgeVersion' | 'activeRunId' | 'activeRevisionId'>>
): Promise<ProjectRecord> => writeProject({ ...project, ...metadata, updatedAt: now() });

export const markProjectMaterialsUpdated = async (project: ProjectRecord): Promise<ProjectRecord> =>
  updateProjectStatus(project, project.activeRevisionId ? 'materials_updated' : 'imported');

export interface CreateRunMetadata {
  agentProvider: string;
  agentModel: string;
  thinkingLevel: ThinkingLevel;
  knowledgeVersion: string;
  ocrModel: string;
}

export const createClassificationRun = async (
  project: ProjectRecord,
  metadata: CreateRunMetadata,
  supplements: readonly SupplementalMaterialRecord[]
): Promise<{ project: ProjectRecord; run: ClassificationRunRecord; runDirectory: string }> => {
  const id = randomUUID();
  const runDirectory = join(runsDirectory(project), id);
  const sessionPath = join(runDirectory, 'session');
  await mkdir(sessionPath, { recursive: true });
  const supplementContextPath = join(runDirectory, 'supplement-context.md');
  const supplementSections = await Promise.all(supplements.map(async (material) => {
    const text = await readFile(material.extractedTextPath, 'utf8');
    return `## ${material.title}\n\n- ID: ${material.id}\n- 类型: ${material.kind}\n- 来源: ${material.sourceLabel}\n- SHA-256: ${material.sha256}\n\n${text.trim() || '（未提取到可用文本）'}`;
  }));
  await writeFile(
    supplementContextPath,
    `# 本次分类运行的补充材料快照\n\n${supplementSections.length ? supplementSections.join('\n\n---\n\n') : '本次运行没有补充材料。'}\n`,
    'utf8'
  );
  const run: ClassificationRunRecord = {
    id,
    projectId: project.id,
    status: 'running',
    startedAt: now(),
    ...metadata,
    supplementIds: supplements.map((material) => material.id),
    supplementHashes: supplements.map((material) => material.sha256),
    supplementContextPath,
    sessionPath
  };
  await writeJsonAtomically(join(runDirectory, 'run.json'), run);
  const updatedProject = await writeProject({
    ...project,
    status: 'processing',
    activeRunId: id,
    agentProvider: metadata.agentProvider,
    agentModel: metadata.agentModel,
    thinkingLevel: metadata.thinkingLevel,
    knowledgeVersion: metadata.knowledgeVersion,
    ocrModel: metadata.ocrModel,
    updatedAt: now()
  });
  return { project: updatedProject, run, runDirectory };
};

export const completeClassificationRun = async (
  project: ProjectRecord,
  run: ClassificationRunRecord,
  runDirectory: string,
  result: PaperResult
): Promise<ProjectRecord> => {
  const revision = await createResultRevision(project, run.id, 'agent', result, 'AI 分类结果');
  const completedRun: ClassificationRunRecord = { ...run, status: 'completed', completedAt: now(), resultRevisionId: revision.id };
  await writeJsonAtomically(join(runDirectory, 'run.json'), completedRun);
  return writeProject({ ...project, status: 'review_required', activeRunId: run.id, activeRevisionId: revision.id, updatedAt: now() });
};

export const failClassificationRun = async (
  project: ProjectRecord,
  run: ClassificationRunRecord,
  runDirectory: string,
  error: string
): Promise<ProjectRecord> => {
  await writeJsonAtomically(join(runDirectory, 'run.json'), { ...run, status: 'failed', completedAt: now(), error } satisfies ClassificationRunRecord);
  return writeProject({ ...project, status: 'failed', updatedAt: now() });
};

export const saveReviewRevision = async (project: ProjectRecord, result: PaperResult, summary: string): Promise<ProjectRecord> => {
  if (!project.activeRunId) throw new Error('当前项目没有可复核的分类运行。');
  const revision = await createResultRevision(project, project.activeRunId, 'review', result, summary, project.activeRevisionId);
  return writeProject({ ...project, status: 'confirmed', activeRevisionId: revision.id, updatedAt: now() });
};

export const readResultRevision = async (project: ProjectRecord, revisionId: string): Promise<PaperResult> => {
  const revision = (await listRevisions(project)).find((item) => item.id === revisionId);
  if (!revision) throw new Error('结果版本不存在。');
  return JSON.parse(await readFile(revision.resultPath, 'utf8')) as PaperResult;
};

export const activateResultRevision = async (project: ProjectRecord, revisionId: string): Promise<ProjectRecord> => {
  const revision = (await listRevisions(project)).find((item) => item.id === revisionId);
  if (!revision) throw new Error('结果版本不存在。');
  const result = JSON.parse(await readFile(revision.resultPath, 'utf8')) as PaperResult;
  return writeProject({
    ...project,
    activeRunId: revision.runId,
    activeRevisionId: revision.id,
    status: result.reviewStatus === 'confirmed' ? 'confirmed' : 'review_required',
    updatedAt: now()
  });
};

const readPreparation = async (project: ProjectRecord): Promise<ProjectPreparation> => {
  const report = await readJson<import('../shared/contracts').TextPreparationReport | undefined>(join(project.rootPath, 'extracted', 'report.json'), undefined);
  return {
    project,
    pageCount: report?.pageCount ?? 0,
    pagesNeedingOcr: report?.pages.filter((page) => page.needsReview).map((page) => page.page) ?? [],
    ocrApplied: Boolean(report?.ocrAppliedPages.length),
    textReport: report
  };
};

export const loadProjectWorkspace = async (appRoot: string, projectId: string): Promise<ProjectWorkspace> => {
  const project = await readProject(getProjectDirectory(appRoot, projectId));
  const [preparation, supplements, runs, revisions] = await Promise.all([
    readPreparation(project),
    listSupplementalMaterials(project),
    listRuns(project),
    listRevisions(project)
  ]);
  const result = project.activeRevisionId ? await readResultRevision(project, project.activeRevisionId) : undefined;
  return { project, preparation, supplements, runs, revisions: [...revisions].sort((left, right) => right.createdAt.localeCompare(left.createdAt)), result };
};

export const listProjectSummaries = async (appRoot: string): Promise<ProjectSummary[]> => {
  await mkdir(getProjectsDirectory(appRoot), { recursive: true });
  const entries = await readdir(getProjectsDirectory(appRoot), { withFileTypes: true });
  const summaries = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry): Promise<ProjectSummary | undefined> => {
    try {
      const project = await readProject(getProjectDirectory(appRoot, entry.name));
      const [materials, runs, result] = await Promise.all([
        listSupplementalMaterials(project),
        listRuns(project),
        project.activeRevisionId ? readResultRevision(project, project.activeRevisionId) : Promise.resolve(undefined)
      ]);
      return {
        id: project.id,
        sourceFileName: project.sourceFileName,
        title: result?.fields.题名 || project.sourceFileName.replace(/\.pdf$/i, ''),
        author: result?.fields.作者 || '尚未提取作者',
        status: project.status,
        updatedAt: project.updatedAt,
        supplementCount: activeSupplementalMaterials(materials).length,
        runCount: runs.length
      };
    } catch {
      return undefined;
    }
  }));
  return summaries.filter((summary): summary is ProjectSummary => Boolean(summary)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const saveAgentResult = async (project: ProjectRecord, result: PaperResult): Promise<void> => {
  await writeJsonAtomically(join(project.rootPath, 'result', 'agent-result.json'), result);
};

export const saveFinalResult = async (project: ProjectRecord, result: PaperResult): Promise<void> => {
  await writeJsonAtomically(join(project.rootPath, 'result', 'final-result.json'), result);
};
