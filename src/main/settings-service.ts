import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  PADDLE_OCR_BASE_URL,
  PADDLE_OCR_MODEL_ID,
  type AppSettings,
  type GlobalMemorySettings
} from '../shared/contracts';
import { isCustomProvider, normalizeAgentBaseUrl } from '../shared/provider-config';

const defaultSettings: AppSettings = {
  agent: { provider: '', modelId: '', thinkingLevel: 'medium' },
  ocr: { mode: 'cloud', baseUrl: PADDLE_OCR_BASE_URL, model: PADDLE_OCR_MODEL_ID },
  memory: { enabled: true, globalGuidance: '', revision: 0, history: [] }
};

const settingsPath = (root: string): string => join(root, 'config', 'settings.json');

type LegacyMemorySettings = Partial<GlobalMemorySettings> & { personalRulesPrompt?: string };
type StoredSettings = Partial<Omit<AppSettings, 'memory'>> & { memory?: LegacyMemorySettings };

const normalizeMemorySettings = (memory?: LegacyMemorySettings): GlobalMemorySettings => {
  const globalGuidance = (memory?.globalGuidance ?? memory?.personalRulesPrompt ?? '').trim().slice(0, 8000);
  return {
    enabled: memory?.enabled ?? defaultSettings.memory.enabled,
    globalGuidance,
    revision: Math.max(0, memory?.revision ?? (globalGuidance ? 1 : 0)),
    updatedAt: memory?.updatedAt,
    history: Array.isArray(memory?.history) ? memory.history : []
  };
};

const normalizeSettings = (settings: StoredSettings): AppSettings => ({
  agent: {
    ...defaultSettings.agent,
    ...settings.agent,
    provider: settings.agent?.provider?.trim() ?? '',
    modelId: settings.agent?.modelId?.trim() ?? '',
    baseUrl: isCustomProvider(settings.agent?.provider ?? '') ? normalizeAgentBaseUrl(settings.agent?.baseUrl) : undefined
  },
  ocr: {
    mode: 'cloud',
    baseUrl: PADDLE_OCR_BASE_URL,
    model: PADDLE_OCR_MODEL_ID
  },
  memory: normalizeMemorySettings(settings.memory)
});

export const loadSettings = async (root: string): Promise<AppSettings> => {
  try {
    return normalizeSettings(JSON.parse(await readFile(settingsPath(root), 'utf8')) as StoredSettings);
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
