import {
  PAPER_FIELD_NAMES,
  type AgentPaperDraft,
  type OcrQuality,
  type MemoryTrace,
  type PageText,
  type PaperFields,
  type FieldAssessments,
  type PaperFieldName,
  type PaperResult,
  type ReviewHistoryEntry,
  type ValidationIssue
} from './contracts';
import { getCategoryPath, isValidLeafCategory } from './taxonomy';
import { calculateConfidence, findUniqueEvidencePage, validatePaperResult } from './validation';

export class PaperResultValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Paper result failed validation: ${issues.map((issue) => issue.message).join('；')}`);
    this.name = 'PaperResultValidationError';
  }
}

export interface NormalizeResultContext {
  ocrQuality: OcrQuality;
  reviewed?: boolean;
  manualEvidenceConfirmed?: boolean;
  reviewHistory?: ReviewHistoryEntry[];
  memoryTrace?: MemoryTrace;
}

const visualFields = new Set<PaperFieldName>([
  '视觉素材等级', '可复原维度', '几何精度等级', '生图用途分类', '风格锚点', '可动态化场景',
  '学术可信度', '适用工具链', 'ControlNet条件', '训练数据价值', '版权使用范围', '数字化成果类型'
]);

const emptyAssessment = () => ({ score: 0, reason: '旧版结果未包含该字段，待补充。', evidence: [] });

const correctEvidencePage = <T extends { page: number; quote: string }>(evidence: T, pages: readonly PageText[]): T => {
  const citedPage = pages.find((page) => page.page === evidence.page);
  if (citedPage && findUniqueEvidencePage(evidence.quote, [citedPage]) !== undefined) return evidence;
  const uniquePage = findUniqueEvidencePage(evidence.quote, pages);
  return uniquePage === undefined ? evidence : { ...evidence, page: uniquePage };
};

export const normalizePaperResult = (
  draft: AgentPaperDraft,
  pages: readonly PageText[],
  context: NormalizeResultContext
): PaperResult => {
  if (!isValidLeafCategory(draft.primaryCategoryCode)) {
    throw new PaperResultValidationError([{ code: 'INVALID_PRIMARY_CATEGORY', message: '主分类必须是有效的三级分类。' }]);
  }
  const path = getCategoryPath(draft.primaryCategoryCode);
  // Older project snapshots do not have newer structured metadata fields.
  const fields = Object.fromEntries(PAPER_FIELD_NAMES.map((name) => [name, draft.fields[name] ?? ''])) as PaperFields;
  fields.一级分类 = `${path[0]?.code} ${path[0]?.label}`;
  fields.二级分类 = `${path[1]?.code} ${path[1]?.label}`;
  fields.三级细分类 = `${path[2]?.code} ${path[2]?.label}`;
  fields.文件路径 = 'source/original.pdf';

  const fieldAssessments = Object.fromEntries(PAPER_FIELD_NAMES.map((name) => [
    name,
    structuredClone(draft.fieldAssessments[name] ?? emptyAssessment())
  ])) as FieldAssessments;
  for (const assessment of Object.values(fieldAssessments)) {
    assessment.evidence = assessment.evidence.map((evidence) => correctEvidencePage(evidence, pages));
  }
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
    normalizationIssues.push({ code: 'INVALID_CROSS_REFERENCE', message: '已移除无效或与主分类重复的互见分类。' });
  }
  const crossReferenceCategoryCodes = [...new Set(draft.crossReferenceCategoryCodes)]
    .filter((code) => code !== draft.primaryCategoryCode && isValidLeafCategory(code))
    .slice(0, 3);

  const candidateCodes = draft.candidates.map((candidate) => candidate.code);
  if (draft.candidates.some((candidate) => !isValidLeafCategory(candidate.code) || candidate.score < 0 || candidate.score > 1)) {
    normalizationIssues.push({ code: 'INVALID_CANDIDATE', message: '已移除无效的候选分类。' });
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
    normalizationIssues.push({ code: 'PRIMARY_NOT_CANDIDATE', message: '主分类未包含在原候选列表中，系统已自动补充。' });
    candidates.unshift({ code: draft.primaryCategoryCode, score: context.reviewed ? 1 : 0.5, reason: context.reviewed ? '由人工复核确定。' : '系统根据主分类代码自动补充。' });
  }

  const provisional: PaperResult = {
    ...draft,
    evidence: draft.evidence.map((evidence) => correctEvidencePage(evidence, pages)),
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
  const validationIssues = validatePaperResult(provisional, pages);
  // OCR can legitimately diverge from a readable source PDF. A reviewer may explicitly
  // attest to the source evidence; keep the normal validation for every other problem.
  const issues = [
    ...normalizationIssues,
    ...validationIssues.filter((issue) => !(
      context.reviewed
      && context.manualEvidenceConfirmed
      && (issue.code === 'UNVERIFIABLE_EVIDENCE' || issue.code === 'UNVERIFIABLE_FIELD_EVIDENCE')
    ))
  ];
  if (context.reviewed && issues.length > 0) throw new PaperResultValidationError(issues);
  const confidence = calculateConfidence(provisional, issues);
  return { ...provisional, confidence: confidence.score, confidenceBand: confidence.band, validationIssues: issues };
};
