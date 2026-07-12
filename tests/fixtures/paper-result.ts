import { PAPER_FIELD_NAMES, type AgentPaperDraft, type PaperResult } from '../../src/shared/contracts';

const fields = {
  编号: 'B4-023',
  作者: '示例作者',
  题名: '殷墟卜辞祭祀制度研究',
  出处: '考古，2026年第1期，第1-20页',
  文献类型: '期刊论文',
  一级分类: '甲骨文字与甲骨学类',
  二级分类: '卜辞事类专题',
  三级细分类: '祭祀类',
  核心材料载体: '甲骨',
  核心研究时段: '武丁一期',
  出土地点: '小屯',
  关键词: '甲骨；祭祀；卜辞',
  视觉素材等级: '',
  可复原维度: '',
  几何精度等级: '',
  生图用途分类: '',
  风格锚点: '',
  可动态化场景: '',
  学术可信度: '',
  适用工具链: '',
  ControlNet条件: '',
  训练数据价值: '',
  版权使用范围: '',
  数字化成果类型: '',
  文件路径: 'source/original.pdf',
  备注: ''
} as const;

export const makePaperResult = (overrides: Partial<PaperResult> = {}): PaperResult => ({
  fields: { ...fields },
  primaryCategoryCode: 'B41',
  crossReferenceCategoryCodes: [],
  candidates: [
    { code: 'B41', score: 0.92, reason: '祭祀是论文核心事类。' },
    { code: 'C32', score: 0.42, reason: '祖先崇拜是次要解释方向。' }
  ],
  evidence: [
    { page: 1, quote: '本文讨论殷墟卜辞中的祭祀制度。', reason: '研究目标说明核心事类。' },
    { page: 2, quote: '结论认为祭祀辞例具有稳定的分类特征。', reason: '结论支持主分类。' }
  ],
  fieldAssessments: Object.fromEntries(
    PAPER_FIELD_NAMES.map((name) => [name, { score: fields[name] ? 0.9 : 0.2, reason: fields[name] ? '原文可核对。' : '正文没有直接依据。', evidence: [] }])
  ) as unknown as PaperResult['fieldAssessments'],
  ocrQuality: 'high',
  ruleConflicts: [],
  abstract: '本文系统讨论殷墟卜辞中的祭祀制度，并比较不同祭祀辞例的分类特征。',
  confidence: 100,
  confidenceBand: 'green',
  reviewStatus: 'needs_review',
  reviewHistory: [],
  validationIssues: [],
  ...overrides
});

export const makeAgentDraft = (overrides: Partial<AgentPaperDraft> = {}): AgentPaperDraft => {
  const result = makePaperResult();
  return {
    fields: result.fields,
    primaryCategoryCode: result.primaryCategoryCode,
    crossReferenceCategoryCodes: result.crossReferenceCategoryCodes,
    candidates: result.candidates,
    evidence: result.evidence,
    ruleConflicts: result.ruleConflicts,
    abstract: result.abstract,
    fieldAssessments: result.fieldAssessments,
    ...overrides
  };
};
