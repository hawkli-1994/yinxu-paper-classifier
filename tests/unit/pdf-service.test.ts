import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { buildTextPreparationReport, extractSinglePagePdf, inspectPdf, renderPdfPageToPng, writeExtractedText } from '../../src/main/pdf-service';
import { createFixturePdf } from '../fixtures/pdf';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PDF inspection', () => {
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

  it('renders a PDF page as PNG for image-only OCR providers', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([595, 842]);
    page.drawText('rendered OCR page', { x: 48, y: 780, size: 14, font });

    const png = await renderPdfPageToPng(await document.save());

    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.byteLength).toBeGreaterThan(1000);
  });

  it('writes complete bounded chunks and a deterministic text-quality report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-text-'));
    roots.push(root);
    const pages = [
      { page: 1, text: `第一页${'甲'.repeat(80)}`, source: 'embedded' as const },
      { page: 2, text: `第二页${'乙'.repeat(80)}`, source: 'ocr' as const },
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
});
