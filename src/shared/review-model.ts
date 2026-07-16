import type { AgentPaperDraft, Evidence, PaperFieldName, PaperResult } from './contracts';
import { getCategoryPath, isValidLeafCategory } from './taxonomy';

export const updateReviewPrimaryCategory = (result: PaperResult, code: string): PaperResult => {
  if (!isValidLeafCategory(code)) return result;
  const path = getCategoryPath(code);
  const existingCandidate = result.candidates.find((candidate) => candidate.code === code);
  const candidates = [
    { code, score: 1, reason: '人工复核选择。' },
    ...result.candidates.filter((candidate) => candidate.code !== code)
  ];
  if (existingCandidate) candidates[0] = { ...existingCandidate, score: 1, reason: '人工复核选择。' };
  return {
    ...result,
    primaryCategoryCode: code,
    crossReferenceCategoryCodes: result.crossReferenceCategoryCodes.filter((candidate) => candidate !== code),
    candidates,
    fields: {
      ...result.fields,
      一级分类: `${path[0]?.code} ${path[0]?.label}`,
      二级分类: `${path[1]?.code} ${path[1]?.label}`,
      三级细分类: `${path[2]?.code} ${path[2]?.label}`
    }
  };
};

export const updateReviewCrossReferences = (result: PaperResult, codes: readonly string[]): PaperResult => ({
  ...result,
  crossReferenceCategoryCodes: [...new Set(codes)]
    .filter((code) => code !== result.primaryCategoryCode && isValidLeafCategory(code))
    .slice(0, 3)
});

export const updateReviewField = (result: PaperResult, name: PaperFieldName, value: string): PaperResult => ({
  ...result,
  fields: { ...result.fields, [name]: value },
  fieldAssessments: {
    ...result.fieldAssessments,
    [name]: { ...(result.fieldAssessments[name] ?? { evidence: [] }), score: 1, reason: '人工复核修改。' }
  }
});

export const updateReviewEvidence = (result: PaperResult, index: number, patch: Partial<Evidence>): PaperResult => ({
  ...result,
  evidence: result.evidence.map((evidence, candidateIndex) => (candidateIndex === index ? { ...evidence, ...patch } : evidence))
});

export const addReviewEvidence = (result: PaperResult): PaperResult => ({
  ...result,
  evidence: [...result.evidence, { page: 1, quote: '', reason: '' }]
});

export const removeReviewEvidence = (result: PaperResult, index: number): PaperResult =>
  result.evidence.length <= 2 ? result : { ...result, evidence: result.evidence.filter((_, candidateIndex) => candidateIndex !== index) };

/** Removes citations that OCR cannot support while preserving the reviewed field value. */
export const clearReviewFieldEvidence = (result: PaperResult, fields: readonly PaperFieldName[]): PaperResult => {
  const targetFields = new Set(fields);
  return {
    ...result,
    fieldAssessments: Object.fromEntries(
      Object.entries(result.fieldAssessments).map(([name, assessment]) => {
        if (!targetFields.has(name as PaperFieldName)) return [name, assessment];
        return [name, {
          ...assessment,
          score: Math.min(assessment.score, 0.59),
          reason: `${assessment.reason || '人工复核。'} 原证据无法由当前 OCR 文本逐字核对，已移除，待以原 PDF 复核。`,
          evidence: []
        }];
      })
    ) as PaperResult['fieldAssessments']
  };
};

export const paperResultToDraft = (result: PaperResult): AgentPaperDraft => ({
  fields: result.fields,
  primaryCategoryCode: result.primaryCategoryCode,
  crossReferenceCategoryCodes: result.crossReferenceCategoryCodes,
  candidates: result.candidates,
  evidence: result.evidence,
  ruleConflicts: result.ruleConflicts,
  abstract: result.abstract,
  fieldAssessments: result.fieldAssessments
});

export const summarizeReviewChanges = (before: PaperResult, after: PaperResult): string => {
  const changes: string[] = [];
  if (before.primaryCategoryCode !== after.primaryCategoryCode) changes.push(`主分类 ${before.primaryCategoryCode} -> ${after.primaryCategoryCode}`);
  if (JSON.stringify(before.crossReferenceCategoryCodes) !== JSON.stringify(after.crossReferenceCategoryCodes)) changes.push('调整互见分类');
  const changedFields = (Object.keys(after.fields) as PaperFieldName[]).filter((name) => before.fields[name] !== after.fields[name]);
  if (changedFields.length > 0) changes.push(`修改字段：${changedFields.join('、')}`);
  if (JSON.stringify(before.evidence) !== JSON.stringify(after.evidence)) changes.push('修改分类证据');
  return changes.length > 0 ? changes.join('；') : '人工复核确认，无字段修改';
};
