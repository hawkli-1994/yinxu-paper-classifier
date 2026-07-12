import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppSettings } from '../shared/contracts';
import { isCustomProvider, normalizeAgentBaseUrl } from '../shared/provider-config';

const defaultSettings: AppSettings = {
  agent: { provider: '', modelId: '', thinkingLevel: 'medium' },
  ocr: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'PaddlePaddle/PaddleOCR-VL-1.5' }
};

const settingsPath = (root: string): string => join(root, 'config', 'settings.json');

const normalizeSettings = (settings: AppSettings): AppSettings => ({
  ...settings,
  agent: {
    ...settings.agent,
    provider: settings.agent.provider.trim(),
    modelId: settings.agent.modelId.trim(),
    baseUrl: isCustomProvider(settings.agent.provider) ? normalizeAgentBaseUrl(settings.agent.baseUrl) : undefined
  }
});

export const loadSettings = async (root: string): Promise<AppSettings> => {
  try {
    return normalizeSettings(JSON.parse(await readFile(settingsPath(root), 'utf8')) as AppSettings);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(defaultSettings);
    throw error;
  }
};

export const saveSettings = async (root: string, settings: AppSettings): Promise<void> => {
  const target = settingsPath(root);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, 'utf8');
};
