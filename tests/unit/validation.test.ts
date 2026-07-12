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

  it('verifies evidence across PDF spacing, full-width text, ASCII punctuation, and control characters', () => {
    const result = makePaperResult({
      evidence: [
        {
          page: 1,
          quote: '文章分析了河南省图书馆对安阳殷墟的发掘情况，探讨了殷墟发掘的作用和意义。',
          reason: '研究目标'
        },
        {
          page: 2,
          quote: '比较合理的殷墟文化分期应当综合现有殷墟出土陶器、甲骨文和青铜器的分期研究成果',
          reason: '核心结论'
        }
      ]
    });
    const issues = validatePaperResult(result, [
      { page: 1, text: '文 章 分 析 了 河 南 省 图 书 馆 对 安 阳 殷 墟 的 发 掘 情 况 , 探 讨 了 殷 墟 发 掘 的 作 用 和 意 义 .' },
      { page: 2, text: '比 较 合 理 的 殷 墟 文 化 分 期 应 当 综 合 现 有 殷 墟 出 土 陶 器 \u0082 甲 骨 文 和 青 铜 器 的 分 期 研 究 成 果' }
    ]);

    expect(issues).not.toContainEqual(expect.objectContaining({ code: 'UNVERIFIABLE_EVIDENCE' }));
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

  it('does not award perfect confidence when field evidence is unverifiable', () => {
    const result = makePaperResult();
    const confidence = calculateConfidence(result, [
      { code: 'UNVERIFIABLE_FIELD_EVIDENCE', message: '出处字段的第 2 页证据无法核对。' },
      { code: 'UNVERIFIABLE_FIELD_EVIDENCE', message: '时段字段的第 5 页证据无法核对。' }
    ]);

    expect(confidence.score).toBe(90);
    expect(confidence.band).toBe('green');
  });
});
