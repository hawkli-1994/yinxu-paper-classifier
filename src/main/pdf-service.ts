import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from '@pdfme/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mupdf from 'mupdf';
import type { PageText, TextPreparationReport } from '../shared/contracts';

const pdfJsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const pdfJsDocumentOptions = {
  useWorkerFetch: false,
  cMapUrl: `${join(pdfJsRoot, 'cmaps')}${sep}`,
  cMapPacked: true,
  standardFontDataUrl: `${join(pdfJsRoot, 'standard_fonts')}${sep}`,
  wasmUrl: `${join(pdfJsRoot, 'wasm')}${sep}`,
  useSystemFonts: true
} as const;

export interface PdfInspection {
  pageCount: number;
  pages: PageText[];
  pagesNeedingOcr: number[];
}

const textFromPdfPage = async (page: Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>): Promise<string> => {
  const content = await page.getTextContent();
  return content.items
    .map((item) => {
      if (!('str' in item)) return '';
      return `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`;
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const cleanEmbeddedText = (text: string): string =>
  text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const embeddedTextScore = (text: string): number => {
  const compactLength = text.replace(/\s/g, '').length;
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const replacementCharacters = text.match(/[�]/g)?.length ?? 0;
  const modelTokens = text.match(/<\|(?:LOC|REF|end)[^>]*\|>/gi)?.length ?? 0;
  return compactLength + chineseCharacters * 0.25 - replacementCharacters * 25 - modelTokens * 250;
};

export const extractPdfTextWithMuPdf = (content: Uint8Array): string[] => {
  const document = mupdf.Document.openDocument(content, 'application/pdf');
  try {
    const pages: string[] = [];
    for (let pageNumber = 0; pageNumber < document.countPages(); pageNumber += 1) {
      const page = document.loadPage(pageNumber);
      try {
        const structuredText = page.toStructuredText();
        try {
          pages.push(cleanEmbeddedText(structuredText.asText()));
        } finally {
          structuredText.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return pages;
  } finally {
    document.destroy();
  }
};

export const inspectPdfBytes = async (content: Uint8Array): Promise<PdfInspection> => {
  let muPdfPages: string[] = [];
  try {
    // PDF.js may transfer and detach its input buffer. Run MuPDF first and give
    // each engine its own copy so the local fallback is always real.
    muPdfPages = extractPdfTextWithMuPdf(new Uint8Array(content));
  } catch {
    // PDF.js remains the primary extractor; malformed or encrypted PDFs may not open in MuPDF.
  }
  const loadingTask = getDocument({ data: new Uint8Array(content), ...pdfJsDocumentOptions });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const pages: PageText[] = [];
  const pagesNeedingOcr: number[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const pdfJsText = await textFromPdfPage(page);
      const muPdfText = muPdfPages[pageNumber - 1] ?? '';
      const text = embeddedTextScore(muPdfText) > embeddedTextScore(pdfJsText) ? muPdfText : pdfJsText;
      pages.push({ page: pageNumber, text, source: 'embedded' });
      if (text.trim().length < 40) pagesNeedingOcr.push(pageNumber);
    }
  } finally {
    await loadingTask.destroy();
  }

  return { pageCount, pages, pagesNeedingOcr };
};

export const inspectPdf = async (sourcePath: string): Promise<PdfInspection> => inspectPdfBytes(new Uint8Array(await readFile(sourcePath)));

export const extractSinglePagePdf = async (content: Uint8Array, pageNumber: number): Promise<Uint8Array> => {
  const source = await PDFDocument.load(content);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > source.getPageCount()) {
    throw new Error(`PDF 页码超出范围：${pageNumber}。`);
  }
  const target = await PDFDocument.create();
  const [page] = await target.copyPages(source, [pageNumber - 1]);
  target.addPage(page);
  return target.save();
};

/** Renders an isolated PDF page for OCR providers that accept images but not PDF data URLs. */
export const renderPdfPageToPng = async (content: Uint8Array, pageNumber = 1, scale = 2): Promise<Uint8Array> => {
  const loadingTask = getDocument({ data: new Uint8Array(content), ...pdfJsDocumentOptions });
  const document = await loadingTask.promise;
  try {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) {
      throw new Error(`PDF 页码超出范围：${pageNumber}。`);
    }
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    await page.render({ canvas: null, canvasContext: context, viewport }).promise;
    return new Uint8Array(canvas.toBuffer('image/png'));
  } finally {
    await loadingTask.destroy();
  }
};

export const buildTextPreparationReport = (pages: readonly PageText[], ocrAppliedPages: readonly number[]): TextPreparationReport => {
  const ocrSet = new Set(ocrAppliedPages);
  const documentChineseCharacterCount = pages.reduce((total, page) => total + (page.text.match(/[\u3400-\u9fff]/g)?.length ?? 0), 0);
  const expectsChineseText = documentChineseCharacterCount >= 20;
  const pageReports = pages.map((page) => {
    const characterCount = page.text.replace(/\s/g, '').length;
    const source = page.source ?? (ocrSet.has(page.page) ? 'ocr' : 'embedded');
    const chineseCharacterCount = page.text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    const latinCharacterCount = page.text.match(/[A-Za-z]/g)?.length ?? 0;
    const modelArtifactCount = page.text.match(/<\|(?:LOC|REF|end)[^>]*\|>|�/gi)?.length ?? 0;
    const qualityFlags: Array<'too_short' | 'language_mismatch' | 'model_artifact'> = [];
    if (characterCount < 40) qualityFlags.push('too_short');
    if (modelArtifactCount > 0) qualityFlags.push('model_artifact');
    if (
      expectsChineseText &&
      (source === 'ocr' || source === 'mixed') &&
      chineseCharacterCount < 12 &&
      latinCharacterCount >= 24
    ) {
      qualityFlags.push('language_mismatch');
    }
    return { page: page.page, source, characterCount, needsReview: qualityFlags.length > 0, qualityFlags };
  });
  const emptyPages = pageReports.filter((page) => page.characterCount === 0).map((page) => page.page);
  const quality = pages.length === 0 ? 'unknown' : pageReports.some((page) => page.needsReview) ? 'low' : 'high';
  return { pageCount: pages.length, ocrAppliedPages: [...ocrAppliedPages], emptyPages, quality, pages: pageReports };
};

export const buildTextChunks = (pages: readonly PageText[], maxChars = 20_000): string[] => {
  if (maxChars < 80) throw new Error('单个文本分段的字符上限不能少于 80。');
  const sections: string[] = [];
  for (const page of pages) {
    const header = `<!-- page:${page.page} -->\n`;
    const contentLimit = maxChars - header.length;
    const text = page.text || '';
    if (text.length === 0) {
      sections.push(header.trimEnd());
      continue;
    }
    for (let offset = 0; offset < text.length; offset += contentLimit) {
      sections.push(`${header}${text.slice(offset, offset + contentLimit)}`);
    }
  }

  const chunks: string[] = [];
  let current = '';
  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = section;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

export const writeExtractedText = async (
  projectRoot: string,
  pages: readonly PageText[],
  report = buildTextPreparationReport(pages, pages.filter((page) => page.source === 'ocr' || page.source === 'mixed').map((page) => page.page)),
  maxChunkChars = 20_000
): Promise<void> => {
  const extractedDirectory = join(projectRoot, 'extracted');
  const chunksDirectory = join(extractedDirectory, 'chunks');
  await mkdir(extractedDirectory, { recursive: true });
  await rm(chunksDirectory, { recursive: true, force: true });
  await mkdir(chunksDirectory, { recursive: true });
  await writeFile(join(extractedDirectory, 'text.jsonl'), `${pages.map((page) => JSON.stringify(page)).join('\n')}\n`, 'utf8');
  await writeFile(join(extractedDirectory, 'full-text.md'), pages.map((page) => `<!-- page:${page.page} -->\n${page.text}`).join('\n\n'), 'utf8');
  await writeFile(join(extractedDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const chunks = buildTextChunks(pages, maxChunkChars);
  await Promise.all(chunks.map((chunk, index) => writeFile(join(chunksDirectory, `chunk-${String(index + 1).padStart(4, '0')}.md`), chunk, 'utf8')));
};
