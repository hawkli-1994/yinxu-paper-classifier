import { describe, expect, it } from 'vitest';
import { evaluateQuality } from '../../src/shared/quality-evaluator';
import { makePaperResult } from '../fixtures/paper-result';

describe('quality evaluator', () => {
  it('reports taxonomy, evidence, field and abstention metrics', () => {
    const metrics = evaluateQuality([
      {
        id: 'correct',
        expected: { primaryCategoryCode: 'B41', requiredFields: ['作者', '题名'], shouldAbstain: false },
        actual: makePaperResult(),
        pages: [
          { page: 1, text: '本文讨论殷墟卜辞中的祭祀制度。' },
          { page: 2, text: '结论认为祭祀辞例具有稳定的分类特征。' }
        ]
      },
      {
        id: 'same-branch-error',
        expected: { primaryCategoryCode: 'B42', requiredFields: ['作者', '出处'], shouldAbstain: true },
        actual: makePaperResult({
          primaryCategoryCode: 'B41',
          confidenceBand: 'red',
          confidence: 40,
          fields: { ...makePaperResult().fields, 出处: '' },
          evidence: [{ page: 1, quote: '不存在的引文', reason: '错误证据' }, makePaperResult().evidence[1]!]
        }),
        pages: [
          { page: 1, text: '这是另一篇论文。' },
          { page: 2, text: '结论认为祭祀辞例具有稳定的分类特征。' }
        ]
      }
    ]);

    expect(metrics.total).toBe(2);
    expect(metrics.top1Accuracy).toBe(0.5);
    expect(metrics.hierarchicalAccuracy).toBeCloseTo(5 / 6);
    expect(metrics.evidenceValidity).toBe(0.75);
    expect(metrics.fieldCompleteness).toBe(0.75);
    expect(metrics.abstentionAccuracy).toBe(1);
  });
});
