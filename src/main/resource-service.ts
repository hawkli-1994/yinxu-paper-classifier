import { app } from 'electron';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgePackage } from '../shared/contracts';

const bundledKnowledgePath = (): string => {
  return app.isPackaged ? join(process.resourcesPath, 'yinxu-classifier') : join(process.cwd(), 'resources', 'yinxu-classifier');
};

export const getBundledGitBashPath = (): string =>
  join(app.isPackaged ? process.resourcesPath : join(process.cwd(), 'resources'), 'git-bash', 'usr', 'bin', 'bash.exe');

export const copyKnowledgePackage = async (source: string, appRoot: string): Promise<KnowledgePackage> => {
  const version = (await readFile(join(source, 'VERSION'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid knowledge package version: ${version}`);
  const target = join(appRoot, 'knowledge', `yinxu-classifier-${version}`);
  await mkdir(join(appRoot, 'knowledge'), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  return { path: target, version };
};

export const ensureKnowledgePackage = async (appRoot: string): Promise<KnowledgePackage> => copyKnowledgePackage(bundledKnowledgePath(), appRoot);
