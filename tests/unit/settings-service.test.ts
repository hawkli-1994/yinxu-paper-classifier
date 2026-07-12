import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '../../src/main/settings-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('settings service', () => {
  it('starts with provider-neutral defaults and persists model choices without keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-settings-'));
    roots.push(root);

    expect((await loadSettings(root)).agent).toMatchObject({ provider: '' });
    expect((await loadSettings(root)).ocr.model).toBe('PaddlePaddle/PaddleOCR-VL-1.5');
    await saveSettings(root, {
      agent: { provider: 'openai', modelId: 'gpt-test', thinkingLevel: 'medium' },
      ocr: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-OCR' }
    });

    expect(await loadSettings(root)).toEqual({
      agent: { provider: 'openai', modelId: 'gpt-test', thinkingLevel: 'medium' },
      ocr: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-OCR' }
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
      ocr: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-OCR' }
    });

    expect((await loadSettings(root)).agent.baseUrl).toBe('https://llm.example.com/v1');
  });
});
