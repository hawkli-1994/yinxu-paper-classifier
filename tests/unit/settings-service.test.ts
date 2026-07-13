import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '../../src/main/settings-service';
import { DEEPSEEK_OCR_MODEL_ID, SILICONFLOW_OCR_BASE_URL } from '../../src/shared/contracts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('settings service', () => {
  it('starts with provider-neutral defaults and persists model choices without keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-settings-'));
    roots.push(root);

    expect((await loadSettings(root)).agent).toMatchObject({ provider: '' });
    expect((await loadSettings(root)).ocr).toEqual({ mode: 'cloud', baseUrl: SILICONFLOW_OCR_BASE_URL, model: DEEPSEEK_OCR_MODEL_ID });
    await saveSettings(root, {
      agent: { provider: 'openai', modelId: 'gpt-test', thinkingLevel: 'medium' },
      ocr: { mode: 'cloud', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-OCR' },
      memory: { enabled: true, globalGuidance: '核心问题优先', revision: 1, history: [] }
    });

    expect(await loadSettings(root)).toEqual({
      agent: { provider: 'openai', modelId: 'gpt-test', thinkingLevel: 'medium' },
      ocr: { mode: 'cloud', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-OCR' },
      memory: { enabled: true, globalGuidance: '核心问题优先', revision: 1, history: [] }
    });
  });

  it('preserves a custom endpoint only for the custom provider', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-settings-'));
    roots.push(root);

    await saveSettings(root, {
      agent: {
        provider: 'custom-openai-compatible',
        modelId: 'campus-model',
        baseUrl: ' https://llm.example.com/v1/ ',
        thinkingLevel: 'medium'
      },
      ocr: { mode: 'cloud', baseUrl: SILICONFLOW_OCR_BASE_URL, model: DEEPSEEK_OCR_MODEL_ID },
      memory: { enabled: false, globalGuidance: '', revision: 0, history: [] }
    });

    expect((await loadSettings(root)).agent.baseUrl).toBe('https://llm.example.com/v1');
  });

  it('migrates former local, automatic, custom endpoint, and Paddle settings to the supported cloud pipeline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-settings-'));
    roots.push(root);
    await mkdir(join(root, 'config'), { recursive: true });
    await writeFile(join(root, 'config', 'settings.json'), JSON.stringify({
      ocr: {
        mode: 'local',
        baseUrl: 'https://untrusted.example.com/v1',
        model: 'PaddlePaddle/PaddleOCR-VL-1.5'
      }
    }));

    expect((await loadSettings(root)).ocr).toEqual({
      mode: 'cloud',
      baseUrl: SILICONFLOW_OCR_BASE_URL,
      model: DEEPSEEK_OCR_MODEL_ID
    });
  });

  it('migrates the former hidden personal prompt into global guidance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-settings-'));
    roots.push(root);
    await mkdir(join(root, 'config'), { recursive: true });
    await writeFile(join(root, 'config', 'settings.json'), JSON.stringify({
      memory: { enabled: true, personalRulesPrompt: '旧版长期偏好' }
    }));

    expect((await loadSettings(root)).memory).toMatchObject({ enabled: true, globalGuidance: '旧版长期偏好', revision: 1, history: [] });
  });
});
