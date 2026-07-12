import { describe, expect, it } from 'vitest';
import { normalizePaperResult, PaperResultValidationError } from '../../src/shared/result-normalizer';
import { makeAgentDraft } from '../fixtures/paper-result';

const pages = [
  { page: 1, text: '本文讨论殷墟卜辞中的祭祀制度。研究对象是祭祀辞例。', source: 'embedded' as const },
  { page: 2, text: '结论认为祭祀辞例具有稳定的分类特征。', source: 'ocr' as const }
];

describe('paper result normalization', () => {
  it('overwrites category paths, source path, visual guesses and final confidence', () => {
    const draft = makeAgentDraft({
      fields: {
        ...makeAgentDraft().fields,
        一级分类: '错误一级类',
        二级分类: '错误二级类',
        三级细分类: '错误三级类',
        视觉素材等级: 'S级可训练',
        文件路径: '/invented/path.pdf'
      },
      fieldAssessments: {
        ...makeAgentDraft().fieldAssessments,
        视觉素材等级: { score: 0.98, reason: '模型猜测', evidence: [] }
      }
    });

    const result = normalizePaperResult(draft, pages, { ocrQuality: 'low' });

    expect(result.fields.一级分类).toBe('B 甲骨文字与甲骨学类');
    expect(result.fields.二级分类).toBe('B4 卜辞事类专题');
    expect(result.fields.三级细分类).toContain('B41 祭祀类');
    expect(result.fields.文件路径).toBe('source/original.pdf');
    expect(result.fields.视觉素材等级).toBe('');
    expect(result.fieldAssessments.视觉素材等级.score).toBeLessThanOrEqual(0.39);
    expect(result.ocrQuality).toBe('low');
    expect(result.confidence).toBeLessThan(100);
    expect(result.reviewStatus).toBe('needs_review');
  });

  it('returns an editable red result for invalid candidates and evidence on the wrong page', () => {
    const draft = makeAgentDraft({
      candidates: [
        { code: 'B99', score: 0.9, reason: 'invalid' },
        { code: 'B41', score: 0.8, reason: 'valid' }
      ],
      evidence: [
        { page: 2, quote: '本文讨论殷墟卜辞中的祭祀制度。', reason: 'wrong page' },
        { page: 2, quote: '结论认为祭祀辞例具有稳定的分类特征。', reason: 'right page' }
      ]
    });

    const result = normalizePaperResult(draft, pages, { ocrQuality: 'high' });
    expect(result.validationIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['INVALID_CANDIDATE', 'UNVERIFIABLE_EVIDENCE']));
    expect(result.confidenceBand).toBe('red');
    expect(result.reviewStatus).toBe('needs_review');
    expect(() => normalizePaperResult(draft, pages, { ocrQuality: 'high', reviewed: true })).toThrow(PaperResultValidationError);
  });

  it('normalizes duplicate cross references and confirms a reviewed result', () => {
    const result = normalizePaperResult(
      makeAgentDraft({ crossReferenceCategoryCodes: ['C32', 'C32'] }),
      pages,
      { ocrQuality: 'high', reviewed: true, reviewHistory: [{ at: '2026-07-11T00:00:00.000Z', summary: '人工调整主分类。' }] }
    );

    expect(result.crossReferenceCategoryCodes).toEqual(['C32']);
    expect(result.reviewStatus).toBe('confirmed');
    expect(result.reviewHistory).toHaveLength(1);
  });

  it('preserves a visual field explicitly confirmed by the human reviewer', () => {
    const base = makeAgentDraft();
    const result = normalizePaperResult(
      {
        ...base,
        fields: { ...base.fields, 视觉素材等级: 'A级可参考' },
        fieldAssessments: { ...base.fieldAssessments, 视觉素材等级: { score: 1, reason: '人工复核修改。', evidence: [] } }
      },
      pages,
      { ocrQuality: 'high', reviewed: true }
    );

    expect(result.fields.视觉素材等级).toBe('A级可参考');
    expect(result.fieldAssessments.视觉素材等级.score).toBe(1);
  });

  it('preserves the retrieved memory trace for audit and review', () => {
    const memoryTrace = { personalPromptApplied: true, appliedRuleIds: ['rule-1'], relevantFeedbackIds: ['feedback-1'], conflicts: [] };
    const result = normalizePaperResult(makeAgentDraft(), pages, { ocrQuality: 'high', memoryTrace });
    expect(result.memoryTrace).toEqual(memoryTrace);
  });
});
