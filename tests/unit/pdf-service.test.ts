import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { buildTextPreparationReport, countUsableTextCharacters, extractPdfTextWithMuPdf, extractSinglePagePdf, inspectPdf, toPdfJsFactoryUrl, writeExtractedText } from '../../src/main/pdf-service';
import { createFixturePdf } from '../fixtures/pdf';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PDF inspection', () => {
  it('normalizes Windows PDF.js resource directories as slash-terminated factory URLs', () => {
    expect(toPdfJsFactoryUrl('C:\\Program Files\\殷墟论文分类助手\\resources\\app.asar\\node_modules\\pdfjs-dist\\cmaps\\')).toBe(
      'C:/Program Files/殷墟论文分类助手/resources/app.asar/node_modules/pdfjs-dist/cmaps/'
    );
    expect(toPdfJsFactoryUrl('/opt/app/pdfjs-dist/wasm')).toBe('/opt/app/pdfjs-dist/wasm/');
  });

  it('does not count page markers or whitespace as usable classification text', () => {
    expect(countUsableTextCharacters(['<!-- page:1 -->\n  ', '甲骨 卜辞'])).toBe(4);
  });

  it('returns extracted text and flags short pages for OCR', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-pdf-'));
    roots.push(root);
    const file = join(root, 'sample.pdf');
    await createFixturePdf(file, 'short');

    const inspection = await inspectPdf(file);

    expect(inspection.pageCount).toBe(1);
    expect(inspection.pages[0]?.text).toContain('short');
    expect(inspection.pagesNeedingOcr).toEqual([1]);
  });

  it('extracts exactly one requested page for page-preserving OCR', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const text of ['first page text that is long enough for extraction', 'second page text that must stay isolated']) {
      const page = document.addPage([595, 842]);
      page.drawText(text, { x: 48, y: 780, size: 14, font });
    }

    const singlePage = await extractSinglePagePdf(await document.save(), 2);
    const loaded = await PDFDocument.load(singlePage);
    const root = await mkdtemp(join(tmpdir(), 'yinxu-pdf-'));
    roots.push(root);
    const file = join(root, 'single.pdf');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(file, singlePage));
    const inspection = await inspectPdf(file);

    expect(loaded.getPageCount()).toBe(1);
    expect(inspection.pages[0]?.text).toContain('second page text');
    expect(inspection.pages[0]?.text).not.toContain('first page text');
  });

  it('ships a local MuPDF text extractor without requiring Python', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-pdf-'));
    roots.push(root);
    const file = join(root, 'mupdf.pdf');
    await createFixturePdf(file, 'MuPDF local fallback keeps academic text available');

    const pages = extractPdfTextWithMuPdf(new Uint8Array(await readFile(file)));

    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('MuPDF local fallback');
  });

  it('writes complete bounded chunks and a deterministic text-quality report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-text-'));
    roots.push(root);
    const pages = [
      { page: 1, text: `第一页${'甲'.repeat(80)}`, source: 'embedded' as const },
      { page: 2, text: '第二页云端识别文本：本文讨论殷墟甲骨材料、祭祀制度、出土背景、释读方法以及相关学术结论，内容完整且不存在异常重复。', source: 'ocr' as const },
      { page: 3, text: `第三页${'丙'.repeat(80)}`, source: 'embedded' as const }
    ];
    const report = buildTextPreparationReport(pages, [2]);

    await writeExtractedText(root, pages, report, 120);
    const chunk1 = await readFile(join(root, 'extracted', 'chunks', 'chunk-0001.md'), 'utf8');
    const chunk2 = await readFile(join(root, 'extracted', 'chunks', 'chunk-0002.md'), 'utf8');
    const chunk3 = await readFile(join(root, 'extracted', 'chunks', 'chunk-0003.md'), 'utf8');
    const savedReport = JSON.parse(await readFile(join(root, 'extracted', 'report.json'), 'utf8'));

    expect(`${chunk1}${chunk2}${chunk3}`).toContain('第一页');
    expect(`${chunk1}${chunk2}${chunk3}`).toContain('第二页');
    expect(`${chunk1}${chunk2}${chunk3}`).toContain('第三页');
    expect(Math.max(chunk1.length, chunk2.length, chunk3.length)).toBeLessThanOrEqual(120);
    expect(savedReport).toEqual(report);
    expect(report.ocrAppliedPages).toEqual([2]);
    expect(report.quality).toBe('high');
  });

  it('marks an OCR page for review when it switches to Latin text in an otherwise Chinese paper', () => {
    const report = buildTextPreparationReport([
      { page: 1, text: `殷墟卜辞祭祀研究${'甲'.repeat(60)}`, source: 'ocr' },
      { page: 2, text: 'This unrelated English output should not be treated as a valid Chinese OCR page.'.repeat(3), source: 'ocr' }
    ], [1, 2]);

    expect(report.quality).toBe('low');
    expect(report.pages[1]).toMatchObject({ needsReview: true, qualityFlags: ['language_mismatch'] });
  });

  it('rejects OCR model control tokens even when the response is long', () => {
    const report = buildTextPreparationReport([
      { page: 1, text: `<|LOC_1_2|>${'殷墟'.repeat(80)}`, source: 'ocr' }
    ], [1]);

    expect(report.quality).toBe('low');
    expect(report.pages[0]?.qualityFlags).toContain('model_artifact');
  });
});
