import { describe, expect, it } from 'vitest';
import { addReviewEvidence, updateReviewEvidence, updateReviewField, updateReviewPrimaryCategory, updateReviewCrossReferences } from '../../src/shared/review-model';
import { makePaperResult } from '../fixtures/paper-result';

describe('human review model', () => {
  it('updates the primary category path and keeps it out of cross references', () => {
    const result = updateReviewPrimaryCategory(
      makePaperResult({ crossReferenceCategoryCodes: ['C32', 'D21'] }),
      'C32'
    );

    expect(result.primaryCategoryCode).toBe('C32');
    expect(result.fields.一级分类).toBe('C 商代历史综合研究');
    expect(result.fields.二级分类).toBe('C3 宗教、思想、文化、习俗');
    expect(result.fields.三级细分类).toContain('C32 祖先崇拜');
    expect(result.crossReferenceCategoryCodes).toEqual(['D21']);
    expect(result.candidates[0]).toMatchObject({ code: 'C32', score: 1 });
  });

  it('limits valid distinct cross references to three', () => {
    const result = updateReviewCrossReferences(makePaperResult(), ['C32', 'C32', 'B41', 'D21', 'D22', 'not-a-code']);
    expect(result.crossReferenceCategoryCodes).toEqual(['C32', 'D21', 'D22']);
  });

  it('marks a manually edited field and supports evidence correction', () => {
    let result = updateReviewField(makePaperResult(), '出处', '人工核对后的出处');
    result = updateReviewEvidence(result, 0, { page: 3, quote: '人工核对引文', reason: '人工核对理由' });
    result = addReviewEvidence(result);

    expect(result.fields.出处).toBe('人工核对后的出处');
    expect(result.fieldAssessments.出处).toMatchObject({ score: 1, reason: '人工复核修改。' });
    expect(result.evidence[0]).toEqual({ page: 3, quote: '人工核对引文', reason: '人工核对理由' });
    expect(result.evidence.at(-1)).toEqual({ page: 1, quote: '', reason: '' });
  });
});
