import {
  AuthError,
  InvalidRequestError,
  Model,
  NetworkError,
  PaddleOCRAPIError,
  PaddleOCRClient,
  PollTimeoutError,
  RateLimitError,
  RequestTimeoutError,
  ServiceUnavailableError,
  type DocParsingRequest,
  type DocParsingResult
} from '@paddleocr/api-sdk';
import {
  PADDLE_OCR_BASE_URL,
  PADDLE_OCR_MODEL_ID,
  PADDLE_OCR_PIPELINE_PROFILE,
  type PageText
} from '../shared/contracts';

const OCR_REQUEST_TIMEOUT_MS = 300_000;
const OCR_JOB_TIMEOUT_MS = 600_000;

export class RetryableOcrError extends Error {}

export interface OcrConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
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
      await delay(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
};

export const PADDLE_DOCUMENT_PARSING_REQUEST = {
  model: Model.PaddleOCRVL16,
  options: {
    // PaddleOCR-VL normally drops running headers and footers from Markdown.
    // Scholarly PDFs often put the journal, issue, and pagination there, so keep
    // those regions while continuing to suppress page numbers and footnotes.
    markdownIgnoreLabels: ['number', 'footnote', 'aside_text'],
    useDocOrientationClassify: true,
    useDocUnwarping: true,
    useLayoutDetection: true,
    useChartRecognition: true,
    temperature: 0,
    prettifyMarkdown: true
  }
} satisfies Pick<DocParsingRequest, 'model' | 'options'>;

export interface PaddleDocumentParser {
  parseDocument(request: DocParsingRequest): Promise<DocParsingResult>;
}

export type PaddleClientFactory = (config: OcrConfig) => PaddleDocumentParser;

const createOfficialPaddleClient: PaddleClientFactory = (config) => new PaddleOCRClient({
  token: config.apiKey,
  baseUrl: PADDLE_OCR_BASE_URL,
  requestTimeout: OCR_REQUEST_TIMEOUT_MS,
  pollTimeout: OCR_JOB_TIMEOUT_MS
});

const providerErrorDetail = (error: unknown): string =>
  error instanceof Error ? error.message.replace(/^HTTP \d+:\s*/u, '').trim().slice(0, 300) : String(error).slice(0, 300);

const callOfficialPaddleApi = async (
  filePath: string,
  config: OcrConfig,
  createClient: PaddleClientFactory
): Promise<DocParsingResult> => {
  try {
    return await createClient(config).parseDocument({
      filePath,
      ...PADDLE_DOCUMENT_PARSING_REQUEST
    });
  } catch (error) {
    if (
      error instanceof RateLimitError ||
      error instanceof ServiceUnavailableError ||
      error instanceof NetworkError ||
      error instanceof RequestTimeoutError ||
      error instanceof PollTimeoutError
    ) {
      throw new RetryableOcrError(`PaddleOCR 官方云端服务暂时不可用：${providerErrorDetail(error)}`);
    }
    if (error instanceof AuthError) {
      throw new Error('PaddleOCR 官方 Access Token 无效或已失效，请在“设置”中更新后重试。');
    }
    if (error instanceof InvalidRequestError) {
      throw new Error(`PaddleOCR 官方云端请求无效：${providerErrorDetail(error)}`);
    }
    if (error instanceof PaddleOCRAPIError) {
      throw new Error(`PaddleOCR 官方云端识别失败：${providerErrorDetail(error)}`);
    }
    throw error;
  }
};

/** Uses PaddleOCR's official TypeScript SDK and hosted document-parsing API. */
export const parsePdfWithOfficialPaddle = async (
  filePath: string,
  config: OcrConfig,
  createClient: PaddleClientFactory = createOfficialPaddleClient
): Promise<DocParsingResult> => {
  if (config.baseUrl.replace(/\/+$/, '') !== PADDLE_OCR_BASE_URL) {
    throw new Error('OCR 服务地址必须使用 PaddleOCR 官方云端接口。');
  }
  if (config.model !== PADDLE_OCR_MODEL_ID) {
    throw new Error(`当前版本仅支持 ${PADDLE_OCR_MODEL_ID} 官方云端文档解析。`);
  }
  if (!config.apiKey.trim()) {
    throw new Error('导入 PDF 前必须配置 PaddleOCR 官方 Access Token。');
  }
  return retry(() => callOfficialPaddleApi(filePath, config, createClient));
};

const artifactPattern = /<\|(?:LOC|REF|DET|end|begin|grounding)[^>]*\|>|�/i;
const hasExcessiveRepetition = (text: string): boolean => /(.)\1{11,}/u.test(text) || /(.{2,12})\1{7,}/u.test(text);

export interface CloudOcrProcessingInput {
  filePath: string;
  pages: readonly PageText[];
  config?: OcrConfig;
}

export interface CloudOcrProcessingResult {
  pages: PageText[];
  cloudAttemptedPages: number[];
  cloudAppliedPages: number[];
}

export type PaddleDocumentRecognizer = (filePath: string, config: OcrConfig) => Promise<DocParsingResult>;

/** Every PDF page is parsed by PaddleOCR's official hosted service. There is no local fallback. */
export const processPagesWithCloudOcr = async (
  input: CloudOcrProcessingInput,
  recognize: PaddleDocumentRecognizer = parsePdfWithOfficialPaddle
): Promise<CloudOcrProcessingResult> => {
  if (!input.config?.apiKey) throw new Error('导入 PDF 前必须配置 PaddleOCR 官方 Access Token。');
  const pageNumbers = input.pages.map((page) => page.page);
  const result = await recognize(input.filePath, input.config);
  if (result.pages.length !== pageNumbers.length) {
    throw new Error(`PaddleOCR 官方云端返回 ${result.pages.length} 页，但原 PDF 共 ${pageNumbers.length} 页，已停止导入。`);
  }

  const pages = result.pages.map((page, index): PageText => {
    const text = page.markdownText.trim();
    if (artifactPattern.test(text) || hasExcessiveRepetition(text)) {
      throw new Error(`第 ${index + 1} 页的 PaddleOCR 结果包含异常控制符或明显重复，已停止导入以避免使用错误文本。`);
    }
    return {
      page: pageNumbers[index]!,
      text,
      source: 'ocr',
      ocrTraceId: result.jobId,
      ocrFinishReason: 'completed',
      ocrAttempts: 1
    };
  });

  return {
    pages,
    cloudAttemptedPages: pageNumbers,
    cloudAppliedPages: pages.map((page) => page.page)
  };
};

export const OCR_AUDIT_METADATA = {
  provider: 'paddleocr-official' as const,
  model: PADDLE_OCR_MODEL_ID,
  promptProfile: PADDLE_OCR_PIPELINE_PROFILE
};
