import { describe, expect, it } from 'vitest';
import { getFeedbackScope, isAuthorMetadataOnlyFeedback } from '../../src/shared/feedback-policy';

describe('feedback policy', () => {
  it('separates author metadata corrections from classification learning', () => {
    expect(getFeedbackScope({ errorTypes: ['作者姓名识别错误'] })).toBe('author_metadata');
    expect(isAuthorMetadataOnlyFeedback({ errorTypes: ['作者单位或身份错误'] })).toBe(true);
    expect(getFeedbackScope({ errorTypes: ['作者单位或身份错误', '主分类错误'] })).toBe('mixed');
    expect(getFeedbackScope({ errorTypes: ['主分类错误'] })).toBe('classification');
  });
});
