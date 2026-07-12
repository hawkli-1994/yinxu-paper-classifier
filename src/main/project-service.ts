import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { PaperResult, ProjectRecord, ProjectStatus } from '../shared/contracts';
import { getProjectDirectory } from './paths';

const now = (): string => new Date().toISOString();

const writeJsonAtomically = async (targetPath: string, value: unknown): Promise<void> => {
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, targetPath);
};

export const createProject = async (sourcePath: string, appRoot: string, knowledgeVersion: string): Promise<ProjectRecord> => {
  const source = await readFile(sourcePath);
  const id = randomUUID();
  const rootPath = getProjectDirectory(appRoot, id);
  const sourceDirectory = join(rootPath, 'source');
  const resultDirectory = join(rootPath, 'result');
  const sessionDirectory = join(rootPath, 'session');
  const createdAt = now();
  const sourcePdfPath = join(sourceDirectory, 'original.pdf');

  await Promise.all([mkdir(sourceDirectory, { recursive: true }), mkdir(resultDirectory, { recursive: true }), mkdir(sessionDirectory, { recursive: true })]);
  await copyFile(sourcePath, sourcePdfPath);

  const project: ProjectRecord = {
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
  await writeJsonAtomically(join(rootPath, 'project.json'), project);
  return project;
};

export const readProject = async (projectRoot: string): Promise<ProjectRecord> => JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf8')) as ProjectRecord;

export const updateProjectStatus = async (project: ProjectRecord, status: ProjectStatus): Promise<ProjectRecord> => {
  const updated = { ...project, status, updatedAt: now() };
  await writeJsonAtomically(join(project.rootPath, 'project.json'), updated);
  return updated;
};

export const updateProjectMetadata = async (
  project: ProjectRecord,
  metadata: Partial<Pick<ProjectRecord, 'agentProvider' | 'agentModel' | 'thinkingLevel' | 'ocrModel'>>
): Promise<ProjectRecord> => {
  const updated = { ...project, ...metadata, updatedAt: now() };
  await writeJsonAtomically(join(project.rootPath, 'project.json'), updated);
  return updated;
};

export const saveAgentResult = async (project: ProjectRecord, result: PaperResult): Promise<void> => {
  await writeJsonAtomically(join(project.rootPath, 'result', 'agent-result.json'), result);
};

export const saveFinalResult = async (project: ProjectRecord, result: PaperResult): Promise<void> => {
  await writeJsonAtomically(join(project.rootPath, 'result', 'final-result.json'), result);
};
