import { describe, expect, it } from 'vitest';
import { makePaperResult } from '../fixtures/paper-result';
import { calculateConfidence, validatePaperResult } from '../../src/shared/validation';

describe('paper result validation', () => {
  it('rejects a non-leaf primary category', () => {
    const issues = validatePaperResult(
      { ...makePaperResult(), primaryCategoryCode: 'B4' },
      [{ page: 1, text: '本文讨论殷墟卜辞中的祭祀制度。' }]
    );
    expect(issues).toContainEqual(expect.objectContaining({ code: 'INVALID_PRIMARY_CATEGORY' }));
  });

  it('rejects evidence not present on its cited page', () => {
    const issues = validatePaperResult(
      makePaperResult({ evidence: [{ page: 1, quote: '不存在的引文', reason: 'test' }] }),
      [{ page: 1, text: '本文讨论殷墟卜辞中的祭祀制度。' }]
    );
    expect(issues).toContainEqual(expect.objectContaining({ code: 'UNVERIFIABLE_EVIDENCE' }));
  });

  it('downgrades a low-quality ambiguous result to red', () => {
    const result = makePaperResult({
      ocrQuality: 'low',
      candidates: [
        { code: 'B41', score: 0.7, reason: '祭祀' },
        { code: 'C32', score: 0.62, reason: '祖先崇拜' }
      ],
      ruleConflicts: ['数字化论文应优先检查 D2']
    });
    const confidence = calculateConfidence(result, []);
    expect(confidence.score).toBeLessThan(70);
    expect(confidence.band).toBe('red');
  });
});
