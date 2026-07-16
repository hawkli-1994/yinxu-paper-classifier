import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthError, Model, type DocParsingResult } from '@paddleocr/api-sdk';
import { PDFDocument } from '@pdfme/pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PADDLE_OCR_BASE_URL,
  PADDLE_OCR_MODEL_ID
} from '../../src/shared/contracts';
import {
  PADDLE_DOCUMENT_PARSING_REQUEST,
  RetryableOcrError,
  parsePdfWithOfficialPaddle,
  processPagesWithCloudOcr,
  retry
} from '../../src/main/ocr-service';

const roots: string[] = [];
const config = {
  baseUrl: PADDLE_OCR_BASE_URL,
  apiKey: 'test-token',
  model: PADDLE_OCR_MODEL_ID
};

const createPdf = async (pageCount = 1): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'yinxu-paddle-ocr-'));
  roots.push(root);
  const path = join(root, '论文.pdf');
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) document.addPage();
  await writeFile(path, await document.save());
  return path;
};

const result = (jobId: string, texts: string[]): DocParsingResult => ({
  jobId,
  pages: texts.map((markdownText) => ({ markdownText, markdownImages: {}, outputImages: {} }))
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PaddleOCR official cloud pipeline', () => {
  it('keeps scholarly running headers and footers in the Markdown output', () => {
    expect(PADDLE_DOCUMENT_PARSING_REQUEST.options).toMatchObject({
      markdownIgnoreLabels: ['number', 'footnote', 'aside_text'],
      useDocOrientationClassify: true,
      useDocUnwarping: true,
      useLayoutDetection: true
    });
  });

  it('uses the official TypeScript SDK endpoint, model, options, and Access Token', async () => {
    const filePath = await createPdf();
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; authorization?: string; body?: BodyInit | null }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get('authorization') ?? undefined, body: init?.body });
      if (url === `${PADDLE_OCR_BASE_URL}/api/v2/ocr/jobs`) {
        return new Response(JSON.stringify({ code: 0, data: { jobId: 'job-123' } }), { status: 200 });
      }
      if (url === `${PADDLE_OCR_BASE_URL}/api/v2/ocr/jobs/job-123`) {
        return new Response(JSON.stringify({
          code: 0,
          data: { state: 'done', resultUrl: { jsonUrl: 'https://result.example/job-123.jsonl' } }
        }), { status: 200 });
      }
      return new Response(`${JSON.stringify({
        result: {
          layoutParsingResults: [{ markdown: { text: '殷墟甲骨卜辞识别结果', images: {} }, outputImages: {} }],
          dataInfo: { pageCount: 1 }
        }
      })}\n`, { status: 200 });
    };

    try {
      await expect(parsePdfWithOfficialPaddle(filePath, config)).resolves.toMatchObject({
        jobId: 'job-123',
        pages: [{ markdownText: '殷墟甲骨卜辞识别结果' }]
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requests.map((request) => request.url)).toEqual([
      `${PADDLE_OCR_BASE_URL}/api/v2/ocr/jobs`,
      `${PADDLE_OCR_BASE_URL}/api/v2/ocr/jobs/job-123`,
      'https://result.example/job-123.jsonl'
    ]);
    expect(requests.slice(0, 2).every((request) => request.authorization === 'Bearer test-token')).toBe(true);
    expect(requests[2]?.authorization).toBeUndefined();
    const form = requests[0]?.body as FormData;
    expect(form.get('model')).toBe(Model.PaddleOCRVL16);
    expect(JSON.parse(String(form.get('optionalPayload')))).toEqual(PADDLE_DOCUMENT_PARSING_REQUEST.options);
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('rejects custom endpoints, unsupported models, and missing tokens', async () => {
    const filePath = await createPdf();
    await expect(parsePdfWithOfficialPaddle(filePath, { ...config, baseUrl: 'https://example.com' }))
      .rejects.toThrow('PaddleOCR 官方云端接口');
    await expect(parsePdfWithOfficialPaddle(filePath, { ...config, model: 'unsupported-ocr-model' }))
      .rejects.toThrow('当前版本仅支持');
    await expect(parsePdfWithOfficialPaddle(filePath, { ...config, apiKey: '' }))
      .rejects.toThrow('Access Token');
  });

  it('converts official API authentication failures into actionable Chinese guidance', async () => {
    const filePath = await createPdf();
    await expect(parsePdfWithOfficialPaddle(filePath, config, () => ({
      parseDocument: async () => { throw new AuthError('Authentication failed'); }
    }))).rejects.toThrow('Access Token 无效或已失效');
  });

  it('retries temporary provider failures three times', async () => {
    let attempts = 0;
    const value = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new RetryableOcrError('temporary');
        return 'ok';
      },
      3,
      async () => undefined
    );

    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('maps every hosted document-parsing page to its source page without local fallback', async () => {
    const filePath = await createPdf(2);
    const input = {
      filePath,
      pages: [
        { page: 1, text: '本地文本层第一页', source: 'embedded' as const },
        { page: 2, text: '本地文本层第二页', source: 'embedded' as const }
      ]
    };

    await expect(processPagesWithCloudOcr(input)).rejects.toThrow('Access Token');
    const parsed = await processPagesWithCloudOcr({ ...input, config }, async (receivedPath, receivedConfig) => {
      expect(receivedPath).toBe(filePath);
      expect(receivedConfig).toEqual(config);
      return result('job-pages', [
        '云端识别第一页：殷墟甲骨卜辞祭祀研究。',
        '云端识别第二页：考古背景与材料释读方法。'
      ]);
    });

    expect(parsed.cloudAttemptedPages).toEqual([1, 2]);
    expect(parsed.cloudAppliedPages).toEqual([1, 2]);
    expect(parsed.pages.every((page) => page.source === 'ocr')).toBe(true);
    expect(parsed.pages.every((page) => page.ocrTraceId === 'job-pages')).toBe(true);
    expect(parsed.pages[0]?.text).not.toContain('本地文本层');
  });

  it('stops import when the official service returns a different page count', async () => {
    const filePath = await createPdf(2);
    await expect(processPagesWithCloudOcr({
      filePath,
      pages: [{ page: 1, text: '' }, { page: 2, text: '' }],
      config
    }, async () => result('job-incomplete', ['只有一页']))).rejects.toThrow('返回 1 页，但原 PDF 共 2 页');
  });

  it('stops import when hosted results contain control artifacts or obvious repetition', async () => {
    const filePath = await createPdf();
    await expect(processPagesWithCloudOcr({
      filePath,
      pages: [{ page: 1, text: '' }],
      config
    }, async () => result('job-artifact', [`<|LOC_1_2|>${'乱码'.repeat(50)}`])))
      .rejects.toThrow('异常控制符');
  });
});
