import type { ConfidenceBand, PageText, PaperResult, ValidationIssue } from './contracts';
import { isValidLeafCategory } from './taxonomy';

export interface ConfidenceResult {
  score: number;
  band: ConfidenceBand;
}

const normalizeEvidence = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}\p{Control}\p{Format}]+/gu, '');

export const findUniqueEvidencePage = (quote: string, pages: readonly PageText[]): number | undefined => {
  const normalizedQuote = normalizeEvidence(quote);
  if (!normalizedQuote) return undefined;
  const matches = pages.filter((page) => normalizeEvidence(page.text).includes(normalizedQuote));
  return matches.length === 1 ? matches[0]?.page : undefined;
};

const hasAmbiguousCandidates = (result: PaperResult): boolean => {
  const [first, second] = result.candidates;
  return Boolean(first && second && first.score - second.score < 0.15);
};

const missingKeyMetadataCount = (result: PaperResult): number => {
  const required = [result.fields.作者, result.fields.题名, result.fields.出处, result.abstract];
  return required.filter((value) => value.trim().length === 0).length;
};

export const validatePaperResult = (result: PaperResult, pages: readonly PageText[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!isValidLeafCategory(result.primaryCategoryCode)) {
    issues.push({ code: 'INVALID_PRIMARY_CATEGORY', message: '主分类必须是有效的三级分类。' });
  }

  if (result.crossReferenceCategoryCodes.length > 3) {
    issues.push({ code: 'TOO_MANY_CROSS_REFERENCES', message: '互见分类最多只能保留 3 个。' });
  }

  if (result.crossReferenceCategoryCodes.some((code) => !isValidLeafCategory(code) || code === result.primaryCategoryCode)) {
    issues.push({ code: 'INVALID_CROSS_REFERENCE', message: '互见分类必须是与主分类不同的有效三级分类。' });
  }

  const candidateCodes = result.candidates.map((candidate) => candidate.code);
  if (result.candidates.some((candidate) => !isValidLeafCategory(candidate.code) || candidate.score < 0 || candidate.score > 1)) {
    issues.push({ code: 'INVALID_CANDIDATE', message: '候选分类必须是有效三级分类，且分数在 0 到 1 之间。' });
  }
  if (new Set(candidateCodes).size !== candidateCodes.length) {
    issues.push({ code: 'DUPLICATE_CANDIDATE', message: '候选分类不得重复。' });
  }
  if (!candidateCodes.includes(result.primaryCategoryCode)) {
    issues.push({ code: 'PRIMARY_NOT_CANDIDATE', message: '主分类必须出现在候选分类中。' });
  }

  if (result.evidence.length < 2) {
    issues.push({ code: 'MISSING_EVIDENCE', message: '分类结果必须提供至少两条证据。' });
  }

  for (const evidence of result.evidence) {
    const page = pages.find((candidate) => candidate.page === evidence.page);
    if (!page || findUniqueEvidencePage(evidence.quote, [page]) === undefined) {
      issues.push({ code: 'UNVERIFIABLE_EVIDENCE', message: `第 ${evidence.page} 页证据无法在提取文本中核对。` });
    }
  }

  for (const [field, assessment] of Object.entries(result.fieldAssessments)) {
    for (const evidence of assessment.evidence) {
      const page = pages.find((candidate) => candidate.page === evidence.page);
      if (!page || findUniqueEvidencePage(evidence.quote, [page]) === undefined) {
        issues.push({ code: 'UNVERIFIABLE_FIELD_EVIDENCE', message: `${field}字段的第 ${evidence.page} 页证据无法核对。` });
      }
    }
  }

  if (missingKeyMetadataCount(result) > 0) {
    issues.push({ code: 'MISSING_KEY_METADATA', message: '作者、题名、出处和摘要是分类所需的关键元数据。' });
  }

  return issues;
};

export const calculateConfidence = (result: PaperResult, issues: readonly ValidationIssue[]): ConfidenceResult => {
  if (issues.some((issue) => issue.code === 'INVALID_PRIMARY_CATEGORY')) {
    return { score: 0, band: 'red' };
  }

  let score = 100;
  if (result.ocrQuality === 'low') score -= 25;
  if (result.evidence.length === 0) score -= 30;
  else if (result.evidence.length < 2) score -= 20;
  if (issues.some((issue) => issue.code === 'UNVERIFIABLE_EVIDENCE')) score -= 30;
  const unverifiableFieldEvidenceCount = issues.filter((issue) => issue.code === 'UNVERIFIABLE_FIELD_EVIDENCE').length;
  score -= Math.min(unverifiableFieldEvidenceCount * 5, 20);
  if (hasAmbiguousCandidates(result)) score -= 15;
  if (result.ruleConflicts.length > 0) score -= 25;
  if (issues.some((issue) => issue.code === 'INVALID_CANDIDATE' || issue.code === 'PRIMARY_NOT_CANDIDATE')) score -= 25;
  if (issues.some((issue) => issue.code === 'INVALID_CROSS_REFERENCE' || issue.code === 'TOO_MANY_CROSS_REFERENCES')) score -= 15;
  const lowKeyAssessments = ['作者', '题名', '出处', '文献类型', '核心材料载体']
    .filter((name) => result.fieldAssessments[name as keyof typeof result.fieldAssessments].score < 0.6).length;
  score -= Math.min(lowKeyAssessments * 5, 20);
  score -= Math.min(missingKeyMetadataCount(result) * 5, 20);
  score = Math.max(0, score);

  return {
    score,
    band: score >= 85 ? 'green' : score >= 70 ? 'yellow' : 'red'
  };
};
