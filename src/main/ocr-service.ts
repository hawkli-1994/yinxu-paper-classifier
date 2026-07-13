import {
  DEEPSEEK_OCR_MODEL_ID,
  DEEPSEEK_OCR_PROMPT_PROFILE,
  SILICONFLOW_OCR_BASE_URL,
  type PageText
} from '../shared/contracts';
import { extractSinglePagePdf } from './pdf-service';

export const DEEPSEEK_OCR_PROMPT = '<image>\nFree OCR.';
const OCR_REQUEST_TIMEOUT_MS = 120_000;

export class RetryableOcrError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

export interface OcrConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface OcrRecognitionResult {
  text: string;
  traceId?: string;
  finishReason?: string;
}

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
      await delay(Math.max(250 * 2 ** (attempt - 1), error.retryAfterMs ?? 0));
    }
  }
  throw lastError;
};

interface ChatCompletionPayload {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown };
  }>;
  error?: { message?: unknown };
}

const getErrorDetail = (payload: ChatCompletionPayload): string | undefined =>
  typeof payload.error?.message === 'string' ? payload.error.message.trim().slice(0, 300) : undefined;

const getRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.ceil(seconds * 1000));
  const target = Date.parse(value);
  if (!Number.isFinite(target)) return undefined;
  return Math.min(60_000, Math.max(0, target - Date.now()));
};

/** Calls the SiliconFlow DeepSeek-OCR PDF interface using its documented prompt and payload order. */
export const ocrPdfWithDeepSeek = async (pdfBytes: Uint8Array, config: OcrConfig): Promise<OcrRecognitionResult> => {
  if (config.baseUrl.replace(/\/+$/, '') !== SILICONFLOW_OCR_BASE_URL) {
    throw new Error('OCR 服务地址必须使用硅基流动官方接口。');
  }
  if (config.model !== DEEPSEEK_OCR_MODEL_ID) {
    throw new Error(`当前版本仅支持官方 ${DEEPSEEK_OCR_MODEL_ID} 云端流水线。`);
  }

  return retry(async () => {
    let response: Response;
    try {
      response = await fetch(`${SILICONFLOW_OCR_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(OCR_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: DEEPSEEK_OCR_MODEL_ID,
          stream: false,
          temperature: 0,
          max_tokens: 8192,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`
                  }
                },
                { type: 'text', text: DEEPSEEK_OCR_PROMPT }
              ]
            }
          ]
        })
      });
    } catch (error) {
      if (error instanceof RetryableOcrError) throw error;
      throw new RetryableOcrError('无法连接云端 OCR 服务，系统将自动重试。');
    }

    let payload: ChatCompletionPayload = {};
    try {
      payload = await response.json() as ChatCompletionPayload;
    } catch {
      // The status-specific error below is more useful than a JSON parser error.
    }
    const traceId = response.headers.get('x-siliconcloud-trace-id') ?? undefined;
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableOcrError(
        `云端 OCR 暂时不可用（状态码 ${response.status}${traceId ? `，追踪编号 ${traceId}` : ''}）。`,
        response.status === 429 ? getRetryAfterMs(response.headers.get('retry-after')) : undefined
      );
    }
    if (!response.ok) {
      const detail = getErrorDetail(payload);
      throw new Error(`云端 OCR 请求失败（状态码 ${response.status}${detail ? `：${detail}` : ''}）。`);
    }

    const choice = payload.choices?.[0];
    const text = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
    const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
    if (finishReason === 'length') {
      throw new RetryableOcrError(`云端 OCR 输出被截断${traceId ? `（追踪编号 ${traceId}）` : ''}。`);
    }
    if (!text) {
      throw new RetryableOcrError(`云端 OCR 未返回可用文本${traceId ? `（追踪编号 ${traceId}）` : ''}。`);
    }
    return { text, traceId, finishReason };
  });
};

export type OcrRecognizer = (pdfBytes: Uint8Array, config: OcrConfig) => Promise<OcrRecognitionResult>;

const artifactPattern = /<\|(?:LOC|REF|DET|end|begin|grounding)[^>]*\|>|�/i;
const hasExcessiveRepetition = (text: string): boolean => /(.)\1{11,}/u.test(text) || /(.{2,12})\1{7,}/u.test(text);

const scoreRecognition = (text: string): number => {
  const compactLength = text.replace(/\s/g, '').length;
  const artifactCount = text.match(/<\|(?:LOC|REF|DET|end|begin|grounding)[^>]*\|>|�/gi)?.length ?? 0;
  return compactLength - artifactCount * 10_000 - (hasExcessiveRepetition(text) ? 10_000 : 0);
};

const recognizePage = async (
  singlePagePdf: Uint8Array,
  pageNumber: number,
  config: OcrConfig,
  recognize: OcrRecognizer
): Promise<PageText> => {
  let best: OcrRecognitionResult | undefined;
  let attempts = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    attempts = attempt;
    const candidate = await recognize(singlePagePdf, config);
    if (!best || scoreRecognition(candidate.text) > scoreRecognition(best.text)) best = candidate;
    const compactLength = candidate.text.replace(/\s/g, '').length;
    if (compactLength >= 40 && !artifactPattern.test(candidate.text) && !hasExcessiveRepetition(candidate.text)) {
      return {
        page: pageNumber,
        text: candidate.text.trim(),
        source: 'ocr',
        ocrTraceId: candidate.traceId,
        ocrFinishReason: candidate.finishReason,
        ocrAttempts: attempts
      };
    }
  }

  if (!best || artifactPattern.test(best.text) || hasExcessiveRepetition(best.text)) {
    throw new Error(`第 ${pageNumber} 页的云端 OCR 结果包含异常控制符或明显重复，已停止导入以避免使用错误文本。`);
  }
  return {
    page: pageNumber,
    text: best.text.trim(),
    source: 'ocr',
    ocrTraceId: best.traceId,
    ocrFinishReason: best.finishReason,
    ocrAttempts: attempts
  };
};

export const ocrPagesIndividually = async (
  pdfBytes: Uint8Array,
  pages: readonly PageText[],
  config: OcrConfig,
  recognize: OcrRecognizer = ocrPdfWithDeepSeek
): Promise<PageText[]> => {
  const recognized: PageText[] = [];
  for (const page of pages) {
    const singlePagePdf = await extractSinglePagePdf(pdfBytes, page.page);
    recognized.push(await recognizePage(singlePagePdf, page.page, config, recognize));
  }
  return recognized;
};

export interface CloudOcrProcessingInput {
  pdfBytes: Uint8Array;
  pages: readonly PageText[];
  config?: OcrConfig;
}

export interface CloudOcrProcessingResult {
  pages: PageText[];
  cloudAttemptedPages: number[];
  cloudAppliedPages: number[];
}

/** Every PDF page is recognized by the configured cloud OCR service. There is no local fallback. */
export const processPagesWithCloudOcr = async (
  input: CloudOcrProcessingInput,
  recognize: OcrRecognizer = ocrPdfWithDeepSeek
): Promise<CloudOcrProcessingResult> => {
  if (!input.config?.apiKey) throw new Error('导入 PDF 前必须配置云端 OCR API Key。');
  const pageNumbers = input.pages.map((page) => page.page);
  const pages = await ocrPagesIndividually(input.pdfBytes, input.pages, input.config, recognize);
  return {
    pages,
    cloudAttemptedPages: pageNumbers,
    cloudAppliedPages: pages.map((page) => page.page)
  };
};

export const OCR_AUDIT_METADATA = {
  provider: 'siliconflow' as const,
  model: DEEPSEEK_OCR_MODEL_ID,
  promptProfile: DEEPSEEK_OCR_PROMPT_PROFILE
};
