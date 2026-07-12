import type { PageText, PaperFieldName, PaperResult } from './contracts';
import { getCategoryPath, isValidLeafCategory } from './taxonomy';

export interface QualityEvaluationCase {
  id: string;
  expected: {
    primaryCategoryCode: string;
    requiredFields?: PaperFieldName[];
    shouldAbstain?: boolean;
  };
  actual: PaperResult;
  pages: PageText[];
}

export interface QualityMetrics {
  total: number;
  top1Accuracy: number;
  hierarchicalAccuracy: number;
  evidenceValidity: number;
  fieldCompleteness: number;
  abstentionAccuracy: number | null;
}

const average = (values: readonly number[]): number => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const normalized = (value: string): string => value.replace(/[\s\u3000]+/g, '').replace(/[，。；：、“”‘’]/g, '');

const hierarchyScore = (expected: string, actual: string): number => {
  if (!isValidLeafCategory(expected) || !isValidLeafCategory(actual)) return 0;
  const expectedPath = getCategoryPath(expected).map((node) => node.code);
  const actualPath = getCategoryPath(actual).map((node) => node.code);
  if (expectedPath[2] === actualPath[2]) return 1;
  if (expectedPath[1] === actualPath[1]) return 2 / 3;
  if (expectedPath[0] === actualPath[0]) return 1 / 3;
  return 0;
};

export const evaluateQuality = (cases: readonly QualityEvaluationCase[]): QualityMetrics => {
  const top1: number[] = [];
  const hierarchy: number[] = [];
  const evidence: number[] = [];
  const fields: number[] = [];
  const abstention: number[] = [];

  for (const item of cases) {
    top1.push(item.expected.primaryCategoryCode === item.actual.primaryCategoryCode ? 1 : 0);
    hierarchy.push(hierarchyScore(item.expected.primaryCategoryCode, item.actual.primaryCategoryCode));
    for (const citation of item.actual.evidence) {
      const page = item.pages.find((candidate) => candidate.page === citation.page);
      evidence.push(page && normalized(page.text).includes(normalized(citation.quote)) ? 1 : 0);
    }
    for (const field of item.expected.requiredFields ?? []) fields.push(item.actual.fields[field].trim() ? 1 : 0);
    if (item.expected.shouldAbstain !== undefined) {
      const predictedAbstention = item.actual.confidenceBand === 'red' || item.actual.confidence < 70;
      abstention.push(predictedAbstention === item.expected.shouldAbstain ? 1 : 0);
    }
  }

  return {
    total: cases.length,
    top1Accuracy: average(top1),
    hierarchicalAccuracy: average(hierarchy),
    evidenceValidity: average(evidence),
    fieldCompleteness: average(fields),
    abstentionAccuracy: abstention.length > 0 ? average(abstention) : null
  };
};
