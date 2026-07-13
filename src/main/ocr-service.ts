import type { OcrMode, PageText } from '../shared/contracts';
import { buildTextPreparationReport, extractSinglePagePdf, renderPdfPageToPng } from './pdf-service';

export class RetryableOcrError extends Error {}

export interface OcrConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const imageOnlyOcrModels = new Set(['PaddlePaddle/PaddleOCR-VL-1.5']);

export const getOcrInputMediaType = (model: string): 'application/pdf' | 'image/png' =>
  imageOnlyOcrModels.has(model) ? 'image/png' : 'application/pdf';

export type Delay = (milliseconds: number) => Promise<void>;

const defaultDelay: Delay = async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const retry = async <T>(operation: () => Promise<T>, maxAttempts = 3, delay: Delay = defaultDelay): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof RetryableOcrError) || attempt === maxAttempts) throw error;
      await delay(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
};

const getMessageText = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  return typeof content === 'string' ? content : undefined;
};

export const ocrPdf = async (pdfBytes: Uint8Array, config: OcrConfig): Promise<string> =>
  retry(async () => {
    const mediaType = getOcrInputMediaType(config.model);
    const inputBytes = mediaType === 'image/png' ? await renderPdfPageToPng(pdfBytes) : pdfBytes;
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '请逐页识别这份学术论文，输出保留页码的纯文本。' },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${Buffer.from(inputBytes).toString('base64')}` } }
            ]
          }
        ]
      })
    });

    if (response.status === 429 || response.status >= 500) throw new RetryableOcrError(`OCR request failed: ${response.status}`);
    if (!response.ok) throw new Error(`云端 OCR 请求失败，服务返回状态码 ${response.status}。`);
    const text = getMessageText(await response.json());
    if (!text) throw new Error('云端 OCR 未返回可用文本。');
    return text;
  });

export type OcrRecognizer = (pdfBytes: Uint8Array, config: OcrConfig) => Promise<string>;

export const ocrPagesIndividually = async (
  pdfBytes: Uint8Array,
  pages: readonly PageText[],
  pagesNeedingOcr: readonly number[],
  config: OcrConfig,
  recognize: OcrRecognizer = ocrPdf,
  mergeOriginal = true
): Promise<PageText[]> => {
  const replacements = new Map<number, PageText>();
  for (const pageNumber of pagesNeedingOcr) {
    const singlePagePdf = await extractSinglePagePdf(pdfBytes, pageNumber);
    const text = (await recognize(singlePagePdf, config)).trim();
    const original = pages.find((page) => page.page === pageNumber);
    replacements.set(pageNumber, {
      page: pageNumber,
      text: mergeOriginal && original?.text.trim() ? `${original.text.trim()}\n${text}`.trim() : text,
      source: mergeOriginal && original?.text.trim() ? 'mixed' : 'ocr'
    });
  }
  return pages.map((page) => replacements.get(page.page) ?? page);
};

export interface OcrModeProcessingInput {
  mode: OcrMode;
  pdfBytes: Uint8Array;
  pages: readonly PageText[];
  pagesNeedingOcr: readonly number[];
  config?: OcrConfig;
}

export interface OcrModeProcessingResult {
  pages: PageText[];
  cloudAttemptedPages: number[];
  cloudAppliedPages: number[];
  localFallbackPages: number[];
}

/** Applies the user's OCR choice as a hard execution policy. */
export const processPagesWithOcrMode = async (
  input: OcrModeProcessingInput,
  recognize: OcrRecognizer = ocrPdf
): Promise<OcrModeProcessingResult> => {
  if (input.mode === 'local') {
    return {
      pages: [...input.pages],
      cloudAttemptedPages: [],
      cloudAppliedPages: [],
      localFallbackPages: [...input.pagesNeedingOcr]
    };
  }

  if (input.mode === 'cloud') {
    if (!input.config?.apiKey) throw new Error('云端 OCR 模式必须先配置 OCR API Key。');
    const pageNumbers = input.pages.map((page) => page.page);
    const pages = await ocrPagesIndividually(input.pdfBytes, input.pages, pageNumbers, input.config, recognize, false);
    return {
      pages,
      cloudAttemptedPages: pageNumbers,
      cloudAppliedPages: pageNumbers,
      localFallbackPages: []
    };
  }

  if (!input.config?.apiKey || input.pagesNeedingOcr.length === 0) {
    return {
      pages: [...input.pages],
      cloudAttemptedPages: [],
      cloudAppliedPages: [],
      localFallbackPages: [...input.pagesNeedingOcr]
    };
  }

  let pages = [...input.pages];
  const cloudAttemptedPages: number[] = [];
  const cloudAppliedPages: number[] = [];
  const localFallbackPages: number[] = [];
  for (const pageNumber of input.pagesNeedingOcr) {
    cloudAttemptedPages.push(pageNumber);
    try {
      const candidatePages = await ocrPagesIndividually(input.pdfBytes, pages, [pageNumber], input.config, recognize, false);
      const pageReport = buildTextPreparationReport(candidatePages, [pageNumber]).pages.find((page) => page.page === pageNumber);
      if (!pageReport || pageReport.needsReview) {
        localFallbackPages.push(pageNumber);
        continue;
      }
      pages = candidatePages;
      cloudAppliedPages.push(pageNumber);
    } catch {
      localFallbackPages.push(pageNumber);
    }
  }

  return { pages, cloudAttemptedPages, cloudAppliedPages, localFallbackPages };
};
