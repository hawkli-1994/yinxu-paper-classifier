import {
  PAPER_FIELD_NAMES,
  type AgentPaperDraft,
  type OcrQuality,
  type MemoryTrace,
  type PageText,
  type PaperFieldName,
  type PaperResult,
  type ReviewHistoryEntry,
  type ValidationIssue
} from './contracts';
import { getCategoryPath, isValidLeafCategory } from './taxonomy';
import { calculateConfidence, validatePaperResult } from './validation';

export class PaperResultValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Paper result failed validation: ${issues.map((issue) => issue.message).join('；')}`);
    this.name = 'PaperResultValidationError';
  }
}

export interface NormalizeResultContext {
  ocrQuality: OcrQuality;
  reviewed?: boolean;
  reviewHistory?: ReviewHistoryEntry[];
  memoryTrace?: MemoryTrace;
}

const visualFields = new Set<PaperFieldName>(PAPER_FIELD_NAMES.slice(12, 24));

export const normalizePaperResult = (
  draft: AgentPaperDraft,
  pages: readonly PageText[],
  context: NormalizeResultContext
): PaperResult => {
  if (!isValidLeafCategory(draft.primaryCategoryCode)) {
    throw new PaperResultValidationError([{ code: 'INVALID_PRIMARY_CATEGORY', message: '主分类必须是有效的三级分类。' }]);
  }
  const path = getCategoryPath(draft.primaryCategoryCode);
  const fields = { ...draft.fields };
  fields.一级分类 = `${path[0]?.code} ${path[0]?.label}`;
  fields.二级分类 = `${path[1]?.code} ${path[1]?.label}`;
  fields.三级细分类 = `${path[2]?.code} ${path[2]?.label}`;
  fields.文件路径 = 'source/original.pdf';

  const fieldAssessments = structuredClone(draft.fieldAssessments);
  for (const name of visualFields) {
    if (!context.reviewed && fieldAssessments[name].evidence.length === 0) {
      fields[name] = '';
      fieldAssessments[name] = {
        ...fieldAssessments[name],
        score: Math.min(fieldAssessments[name].score, 0.39),
        reason: fieldAssessments[name].reason || '当前文本没有可核验的视觉证据。'
      };
    }
  }
  for (const [index, name] of ['一级分类', '二级分类', '三级细分类'].entries() as ArrayIterator<[number, PaperFieldName]>) {
    fieldAssessments[name] = { score: 1, reason: `由主分类代码 ${draft.primaryCategoryCode} 确定。`, evidence: [] };
    fields[name] = `${path[index]?.code} ${path[index]?.label}`;
  }
  fieldAssessments.文件路径 = { score: 1, reason: '由项目目录确定。', evidence: [] };

  const normalizationIssues: ValidationIssue[] = [];
  if (draft.crossReferenceCategoryCodes.length > 3) {
    normalizationIssues.push({ code: 'TOO_MANY_CROSS_REFERENCES', message: '互见分类最多只能保留 3 个。' });
  }
  if (draft.crossReferenceCategoryCodes.some((code) => !isValidLeafCategory(code) || code === draft.primaryCategoryCode)) {
    normalizationIssues.push({ code: 'INVALID_CROSS_REFERENCE', message: '已移除非法或与主类重复的互见分类。' });
  }
  const crossReferenceCategoryCodes = [...new Set(draft.crossReferenceCategoryCodes)]
    .filter((code) => code !== draft.primaryCategoryCode && isValidLeafCategory(code))
    .slice(0, 3);

  const candidateCodes = draft.candidates.map((candidate) => candidate.code);
  if (draft.candidates.some((candidate) => !isValidLeafCategory(candidate.code) || candidate.score < 0 || candidate.score > 1)) {
    normalizationIssues.push({ code: 'INVALID_CANDIDATE', message: '已移除非法候选分类。' });
  }
  if (new Set(candidateCodes).size !== candidateCodes.length) {
    normalizationIssues.push({ code: 'DUPLICATE_CANDIDATE', message: '已合并重复候选分类。' });
  }
  const seenCandidates = new Set<string>();
  const candidates = draft.candidates
    .filter((candidate) => isValidLeafCategory(candidate.code) && candidate.score >= 0 && candidate.score <= 1)
    .filter((candidate) => {
      if (seenCandidates.has(candidate.code)) return false;
      seenCandidates.add(candidate.code);
      return true;
    })
    .sort((left, right) => right.score - left.score);
  if (!candidates.some((candidate) => candidate.code === draft.primaryCategoryCode)) {
    normalizationIssues.push({ code: 'PRIMARY_NOT_CANDIDATE', message: '主分类原先未出现在候选列表，程序已补入。' });
    candidates.unshift({ code: draft.primaryCategoryCode, score: context.reviewed ? 1 : 0.5, reason: context.reviewed ? '人工复核选择。' : '程序根据主分类代码补入。' });
  }

  const provisional: PaperResult = {
    ...draft,
    fields,
    fieldAssessments,
    crossReferenceCategoryCodes,
    candidates,
    ocrQuality: context.ocrQuality,
    confidence: 0,
    confidenceBand: 'red',
    reviewStatus: context.reviewed ? 'confirmed' : 'needs_review',
    reviewHistory: context.reviewHistory ?? [],
    validationIssues: [],
    memoryTrace: context.memoryTrace
  };
  const issues = [...normalizationIssues, ...validatePaperResult(provisional, pages)];
  if (context.reviewed && issues.length > 0) throw new PaperResultValidationError(issues);
  const confidence = calculateConfidence(provisional, issues);
  return { ...provisional, confidence: confidence.score, confidenceBand: confidence.band, validationIssues: issues };
};
