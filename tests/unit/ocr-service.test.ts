import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { inspectPdfBytes } from '../../src/main/pdf-service';
import { getOcrInputMediaType, getOcrInstruction, ocrPagesIndividually, ocrPdf, processPagesWithOcrMode, RetryableOcrError, retry } from '../../src/main/ocr-service';

describe('OCR retry', () => {
  it('uses PNG input for PaddleOCR-VL-1.5 and preserves PDF input for DeepSeek-OCR', () => {
    expect(getOcrInputMediaType('PaddlePaddle/PaddleOCR-VL-1.5')).toBe('image/png');
    expect(getOcrInputMediaType('deepseek-ai/DeepSeek-OCR')).toBe('application/pdf');
    expect(getOcrInstruction('PaddlePaddle/PaddleOCR-VL-1.5')).toBe('OCR:');
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

  it('sends one-page PDFs and maps each OCR response only to its source page', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const text of ['embedded page one', 'scan placeholder two', 'scan placeholder three']) {
      const page = document.addPage([595, 842]);
      page.drawText(text, { x: 48, y: 780, size: 14, font });
    }
    const bytes = await document.save();
    const pageCounts: number[] = [];
    let call = 0;

    const pages = await ocrPagesIndividually(
      bytes,
      [
        { page: 1, text: 'embedded page one', source: 'embedded' },
        { page: 2, text: '', source: 'embedded' },
        { page: 3, text: '', source: 'embedded' }
      ],
      [2, 3],
      { baseUrl: 'https://example.com/v1', apiKey: 'key', model: 'ocr' },
      async (singlePage) => {
        pageCounts.push((await inspectPdfBytes(singlePage)).pageCount);
        call += 1;
        return call === 1 ? 'only page two OCR' : 'only page three OCR';
      }
    );

    expect(pageCounts).toEqual([1, 1]);
    expect(pages[0]?.text).toBe('embedded page one');
    expect(pages[1]).toMatchObject({ page: 2, text: 'only page two OCR', source: 'ocr' });
    expect(pages[2]).toMatchObject({ page: 3, text: 'only page three OCR', source: 'ocr' });
    expect(pages[1]?.text).not.toContain('page three');
  });

  it('rasterizes a single-page PDF before calling an image-only OCR model', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([595, 842]);
    page.drawText('Paddle OCR source', { x: 48, y: 780, size: 14, font });
    const originalFetch = globalThis.fetch;
    let imageUrl = '';
    let instruction = '';
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: Array<{ text?: string; image_url?: { url: string } }> }> };
      instruction = body.messages[0]?.content[0]?.text ?? '';
      imageUrl = body.messages[0]?.content[1]?.image_url?.url ?? '';
      return new Response(JSON.stringify({ choices: [{ message: { content: '识别完成' } }] }), { status: 200 });
    };

    try {
      await expect(ocrPdf(await document.save(), {
        baseUrl: 'https://example.com/v1',
        apiKey: 'key',
        model: 'PaddlePaddle/PaddleOCR-VL-1.5'
      })).resolves.toBe('识别完成');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(instruction).toBe('OCR:');
  });

  it('treats local mode as a hard no-cloud policy', async () => {
    let calls = 0;
    const result = await processPagesWithOcrMode({
      mode: 'local',
      pdfBytes: new Uint8Array(),
      pages: [{ page: 1, text: '', source: 'embedded' }],
      pagesNeedingOcr: [1]
    }, async () => {
      calls += 1;
      return '不应调用';
    });

    expect(calls).toBe(0);
    expect(result.cloudAttemptedPages).toEqual([]);
    expect(result.localFallbackPages).toEqual([1]);
  });

  it('requires cloud mode to OCR every page without local fallback', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    document.addPage();
    const calls: number[] = [];
    const result = await processPagesWithOcrMode({
      mode: 'cloud',
      pdfBytes: await document.save(),
      pages: [
        { page: 1, text: '本地第一页', source: 'embedded' },
        { page: 2, text: '本地第二页', source: 'embedded' }
      ],
      pagesNeedingOcr: [],
      config: { baseUrl: 'https://example.com/v1', apiKey: 'key', model: 'ocr' }
    }, async () => {
      calls.push(calls.length + 1);
      return `云端识别第${calls.length + 1}页${'甲'.repeat(60)}`;
    });

    expect(calls).toHaveLength(2);
    expect(result.cloudAttemptedPages).toEqual([1, 2]);
    expect(result.cloudAppliedPages).toEqual([1, 2]);
    expect(result.localFallbackPages).toEqual([]);
    expect(result.pages.every((page) => page.source === 'ocr')).toBe(true);
    await expect(processPagesWithOcrMode({
      mode: 'cloud',
      pdfBytes: await document.save(),
      pages: [{ page: 1, text: '', source: 'embedded' }],
      pagesNeedingOcr: [1]
    })).rejects.toThrow('必须先配置 OCR API Key');
  });

  it('uses cloud first in auto mode and falls back when the response has model artifacts', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const input = {
      mode: 'auto' as const,
      pdfBytes: await document.save(),
      pages: [{ page: 1, text: '本地残留文字', source: 'embedded' as const }],
      pagesNeedingOcr: [1],
      config: { baseUrl: 'https://example.com/v1', apiKey: 'key', model: 'ocr' }
    };
    const accepted = await processPagesWithOcrMode(input, async () => `殷墟祭祀卜辞研究${'甲'.repeat(60)}`);
    let rejectedCalls = 0;
    const rejected = await processPagesWithOcrMode(input, async () => {
      rejectedCalls += 1;
      return `<|LOC_1_2|>${'乱码'.repeat(50)}`;
    });

    expect(accepted.cloudAppliedPages).toEqual([1]);
    expect(accepted.localFallbackPages).toEqual([]);
    expect(rejected.cloudAttemptedPages).toEqual([1]);
    expect(rejected.cloudAppliedPages).toEqual([]);
    expect(rejected.localFallbackPages).toEqual([1]);
    expect(rejected.pages[0]?.text).toBe('本地残留文字');
    expect(rejectedCalls).toBe(3);
  });

  it('retries a low-quality automatic OCR response before falling back', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    let calls = 0;
    const result = await processPagesWithOcrMode({
      mode: 'auto',
      pdfBytes: await document.save(),
      pages: [{ page: 1, text: '', source: 'embedded' }],
      pagesNeedingOcr: [1],
      config: { baseUrl: 'https://example.com/v1', apiKey: 'key', model: 'ocr' }
    }, async () => {
      calls += 1;
      return calls === 1 ? '<|LOC_1_2|>乱码' : `殷墟甲骨卜辞研究${'甲'.repeat(60)}`;
    });

    expect(calls).toBe(2);
    expect(result.cloudAppliedPages).toEqual([1]);
    expect(result.localFallbackPages).toEqual([]);
    expect(result.pages[0]?.source).toBe('ocr');
  });
});
