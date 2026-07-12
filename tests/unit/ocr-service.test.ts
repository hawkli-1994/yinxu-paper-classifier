import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { inspectPdfBytes } from '../../src/main/pdf-service';
import { getOcrInputMediaType, ocrPagesIndividually, ocrPdf, RetryableOcrError, retry } from '../../src/main/ocr-service';

describe('OCR retry', () => {
  it('uses PNG input for PaddleOCR-VL-1.5 and preserves PDF input for DeepSeek-OCR', () => {
    expect(getOcrInputMediaType('PaddlePaddle/PaddleOCR-VL-1.5')).toBe('image/png');
    expect(getOcrInputMediaType('deepseek-ai/DeepSeek-OCR')).toBe('application/pdf');
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
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: Array<{ image_url?: { url: string } }> }> };
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
  });
});
