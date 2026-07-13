import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import {
  DEEPSEEK_OCR_MODEL_ID,
  SILICONFLOW_OCR_BASE_URL
} from '../../src/shared/contracts';
import { inspectPdfBytes } from '../../src/main/pdf-service';
import {
  DEEPSEEK_OCR_PROMPT,
  RetryableOcrError,
  ocrPagesIndividually,
  ocrPdfWithDeepSeek,
  processPagesWithCloudOcr,
  retry
} from '../../src/main/ocr-service';

const config = {
  baseUrl: SILICONFLOW_OCR_BASE_URL,
  apiKey: 'test-key',
  model: DEEPSEEK_OCR_MODEL_ID
};

describe('official cloud OCR pipeline', () => {
  it('uses the documented SiliconFlow DeepSeek-OCR PDF payload and records trace metadata', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '殷墟甲骨卜辞识别结果' } }]
      }), {
        status: 200,
        headers: { 'x-siliconcloud-trace-id': 'trace-123' }
      });
    };

    try {
      await expect(ocrPdfWithDeepSeek(await document.save(), config)).resolves.toEqual({
        text: '殷墟甲骨卜辞识别结果',
        traceId: 'trace-123',
        finishReason: 'stop'
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requestUrl).toBe(`${SILICONFLOW_OCR_BASE_URL}/chat/completions`);
    expect(requestBody).toMatchObject({
      model: DEEPSEEK_OCR_MODEL_ID,
      stream: false,
      temperature: 0,
      max_tokens: 8192
    });
    const messages = requestBody.messages as Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
    expect(messages[0]?.content[0]?.type).toBe('image_url');
    expect(messages[0]?.content[0]?.image_url?.url).toMatch(/^data:application\/pdf;base64,/);
    expect(messages[0]?.content[1]).toEqual({ type: 'text', text: DEEPSEEK_OCR_PROMPT });
  });

  it('rejects custom OCR endpoints and unsupported model IDs', async () => {
    await expect(ocrPdfWithDeepSeek(new Uint8Array(), { ...config, baseUrl: 'https://example.com/v1' }))
      .rejects.toThrow('硅基流动官方接口');
    await expect(ocrPdfWithDeepSeek(new Uint8Array(), { ...config, model: 'PaddlePaddle/PaddleOCR-VL-1.5' }))
      .rejects.toThrow('当前版本仅支持官方');
  });

  it('retries temporary OCR failures three times', async () => {
    let attempts = 0;
    const value = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new RetryableOcrError('429');
        return 'ok';
      },
      3,
      async () => undefined
    );

    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('respects a provider Retry-After delay when it exceeds exponential backoff', async () => {
    const delays: number[] = [];
    let attempts = 0;
    await retry(async () => {
      attempts += 1;
      if (attempts === 1) throw new RetryableOcrError('429', 2_000);
      return 'ok';
    }, 3, async (milliseconds) => { delays.push(milliseconds); });

    expect(delays).toEqual([2_000]);
  });

  it('sends isolated one-page PDFs and maps every cloud result to its source page', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const text of ['page one', 'page two', 'page three']) {
      const page = document.addPage([595, 842]);
      page.drawText(text, { x: 48, y: 780, size: 14, font });
    }
    const bytes = await document.save();
    const pageCounts: number[] = [];
    let call = 0;

    const pages = await ocrPagesIndividually(
      bytes,
      [
        { page: 1, text: 'embedded one', source: 'embedded' },
        { page: 2, text: 'embedded two', source: 'embedded' },
        { page: 3, text: 'embedded three', source: 'embedded' }
      ],
      config,
      async (singlePage) => {
        pageCounts.push((await inspectPdfBytes(singlePage)).pageCount);
        call += 1;
        return { text: `云端识别第${call}页：殷墟甲骨卜辞祭祀研究材料、方法、结论与考古背景。`.repeat(3), traceId: `trace-${call}`, finishReason: 'stop' };
      }
    );

    expect(pageCounts).toEqual([1, 1, 1]);
    expect(pages.map((page) => page.source)).toEqual(['ocr', 'ocr', 'ocr']);
    expect(pages[0]?.text).toContain('第1页');
    expect(pages[1]?.text).toContain('第2页');
    expect(pages[2]?.text).toContain('第3页');
    expect(pages[2]?.ocrTraceId).toBe('trace-3');
  });

  it('requires an API key and sends every page to cloud OCR without a local fallback', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    document.addPage();
    const calls: number[] = [];
    const input = {
      pdfBytes: await document.save(),
      pages: [
        { page: 1, text: '本地文本层第一页', source: 'embedded' as const },
        { page: 2, text: '本地文本层第二页', source: 'embedded' as const }
      ]
    };

    await expect(processPagesWithCloudOcr(input)).rejects.toThrow('必须配置云端 OCR API Key');
    const result = await processPagesWithCloudOcr({ ...input, config }, async () => {
      calls.push(calls.length + 1);
      return { text: `云端识别第${calls.length}页：殷墟甲骨卜辞祭祀研究材料、方法、结论与考古背景。`.repeat(3), finishReason: 'stop' };
    });

    expect(calls).toHaveLength(2);
    expect(result.cloudAttemptedPages).toEqual([1, 2]);
    expect(result.cloudAppliedPages).toEqual([1, 2]);
    expect(result.pages.every((page) => page.source === 'ocr')).toBe(true);
    expect(result.pages[0]?.text).not.toContain('本地文本层');
  });

  it('retries short quality results and retains the best cloud result for review', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    let calls = 0;
    const result = await processPagesWithCloudOcr({
      pdfBytes: await document.save(),
      pages: [{ page: 1, text: '', source: 'embedded' }],
      config
    }, async () => {
      calls += 1;
      return { text: calls === 2 ? '较长但仍不足四十字的云端结果' : '短结果', traceId: `trace-${calls}` };
    });

    expect(calls).toBe(3);
    expect(result.pages[0]).toMatchObject({
      source: 'ocr',
      text: '较长但仍不足四十字的云端结果',
      ocrTraceId: 'trace-2',
      ocrAttempts: 3
    });
  });

  it('stops the import when repeated cloud results contain model control artifacts', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    let calls = 0;
    await expect(processPagesWithCloudOcr({
      pdfBytes: await document.save(),
      pages: [{ page: 1, text: '', source: 'embedded' }],
      config
    }, async () => {
      calls += 1;
      return { text: `<|LOC_1_2|>${'乱码'.repeat(50)}` };
    })).rejects.toThrow('异常控制符');
    expect(calls).toBe(3);
  });
});
