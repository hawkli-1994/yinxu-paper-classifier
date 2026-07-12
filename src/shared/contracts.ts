export const APP_NAME = '殷墟论文分类助手';

export const isWindowsSupported = (platform: NodeJS.Platform): boolean => platform === 'win32';

export const PAPER_FIELD_NAMES = [
  '编号',
  '作者',
  '题名',
  '出处',
  '文献类型',
  '一级分类',
  '二级分类',
  '三级细分类',
  '核心材料载体',
  '核心研究时段',
  '出土地点',
  '关键词',
  '视觉素材等级',
  '可复原维度',
  '几何精度等级',
  '生图用途分类',
  '风格锚点',
  '可动态化场景',
  '学术可信度',
  '适用工具链',
  'ControlNet条件',
  '训练数据价值',
  '版权使用范围',
  '数字化成果类型',
  '文件路径',
  '备注'
] as const;

export type PaperFieldName = (typeof PAPER_FIELD_NAMES)[number];
export type PaperFields = Record<PaperFieldName, string>;
export type ConfidenceBand = 'green' | 'yellow' | 'red';
export type OcrQuality = 'high' | 'low' | 'unknown';
export type ReviewStatus = 'needs_review' | 'confirmed';

export interface Evidence {
  page: number;
  quote: string;
  reason: string;
}

export interface ClassificationCandidate {
  code: string;
  score: number;
  reason: string;
}

export interface FieldAssessment {
  score: number;
  reason: string;
  evidence: Evidence[];
}

export type FieldAssessments = Record<PaperFieldName, FieldAssessment>;

export interface AgentPaperDraft {
  fields: PaperFields;
  primaryCategoryCode: string;
  crossReferenceCategoryCodes: string[];
  candidates: ClassificationCandidate[];
  evidence: Evidence[];
  ruleConflicts: string[];
  abstract: string;
  fieldAssessments: FieldAssessments;
}

export interface ReviewHistoryEntry {
  at: string;
  summary: string;
}

export const FEEDBACK_ERROR_TYPES = [
  '主分类错误',
  '互见分类错误',
  '标签定义不准确',
  '史实或年代错误',
  '类别重叠',
  '缺少合适类别',
  '证据不足',
  '术语不规范',
  '字段提取错误'
] as const;

export type FeedbackErrorType = (typeof FEEDBACK_ERROR_TYPES)[number];

export interface ReviewFeedbackInput {
  errorTypes: FeedbackErrorType[];
  reason: string;
  rememberAsCandidate: boolean;
}

export interface RuleRevision {
  revision: number;
  title: string;
  text: string;
  enabled: boolean;
  triggerKeywords: string[];
  fromCategoryCode?: string;
  targetCategoryCode?: string;
  changedAt: string;
}

export interface PersonalRule {
  id: string;
  title: string;
  text: string;
  enabled: boolean;
  revision: number;
  source: 'manual' | 'feedback';
  triggerKeywords: string[];
  fromCategoryCode?: string;
  targetCategoryCode?: string;
  confidence: number;
  appliedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  createdAt: string;
  updatedAt: string;
  history: RuleRevision[];
}

export interface PersonalRuleInput {
  title: string;
  text: string;
  enabled: boolean;
  triggerKeywords: string[];
  fromCategoryCode?: string;
  targetCategoryCode?: string;
}

export interface CandidateRule {
  id: string;
  feedbackId: string;
  title: string;
  text: string;
  triggerKeywords: string[];
  fromCategoryCode?: string;
  targetCategoryCode?: string;
  status: 'pending' | 'approved' | 'rejected';
  linkedRuleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackClassificationSnapshot {
  primaryCategoryCode: string;
  crossReferenceCategoryCodes: string[];
}

export interface FeedbackEvent {
  id: string;
  projectId: string;
  paperHash: string;
  paperTitle: string;
  paperKeywords: string[];
  ontologyVersion: string;
  original: FeedbackClassificationSnapshot;
  corrected: FeedbackClassificationSnapshot;
  errorTypes: FeedbackErrorType[];
  reason: string;
  summary: string;
  appliedRuleIds: string[];
  createdAt: string;
}

export interface MemoryTrace {
  personalPromptApplied: boolean;
  appliedRuleIds: string[];
  relevantFeedbackIds: string[];
  conflicts: string[];
}

export interface MemorySnapshot {
  rules: PersonalRule[];
  candidateRules: CandidateRule[];
  feedbackCount: number;
  recentFeedback: FeedbackEvent[];
}

export interface PageText {
  page: number;
  text: string;
  source?: 'embedded' | 'ocr' | 'mixed';
}

export interface TextPreparationPageReport {
  page: number;
  source: 'embedded' | 'ocr' | 'mixed';
  characterCount: number;
  needsReview: boolean;
  qualityFlags: Array<'too_short' | 'language_mismatch'>;
}

export interface TextPreparationReport {
  pageCount: number;
  ocrAppliedPages: number[];
  emptyPages: number[];
  quality: OcrQuality;
  pages: TextPreparationPageReport[];
}

export interface PaperResult extends AgentPaperDraft {
  ocrQuality: OcrQuality;
  confidence: number;
  confidenceBand: ConfidenceBand;
  reviewStatus: ReviewStatus;
  reviewHistory: ReviewHistoryEntry[];
  validationIssues: ValidationIssue[];
  memoryTrace?: MemoryTrace;
}

export interface ValidationIssue {
  code:
    | 'INVALID_PRIMARY_CATEGORY'
    | 'INVALID_CROSS_REFERENCE'
    | 'TOO_MANY_CROSS_REFERENCES'
    | 'INVALID_CANDIDATE'
    | 'DUPLICATE_CANDIDATE'
    | 'PRIMARY_NOT_CANDIDATE'
    | 'MISSING_EVIDENCE'
    | 'UNVERIFIABLE_EVIDENCE'
    | 'UNVERIFIABLE_FIELD_EVIDENCE'
    | 'MISSING_KEY_METADATA';
  message: string;
}

export type ProjectStatus = 'imported' | 'processing' | 'review_required' | 'confirmed' | 'failed';

export interface ProjectRecord {
  id: string;
  rootPath: string;
  sourcePdfPath: string;
  sourceFileName: string;
  sourceSha256: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  knowledgeVersion: string;
  agentProvider?: string;
  agentModel?: string;
  thinkingLevel?: ThinkingLevel;
  ocrModel?: string;
}

export interface KnowledgePackage {
  path: string;
  version: string;
}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface AppSettings {
  agent: {
    provider: string;
    modelId: string;
    thinkingLevel: ThinkingLevel;
    baseUrl?: string;
  };
  ocr: {
    baseUrl: string;
    model: string;
  };
  memory: {
    enabled: boolean;
    personalRulesPrompt: string;
  };
}

export interface SettingsInput extends AppSettings {
  agentApiKey?: string;
  ocrApiKey?: string;
}

export interface SettingsView extends AppSettings {
  hasAgentKey: boolean;
  hasOcrKey: boolean;
}

export interface ProjectPreparation {
  project: ProjectRecord;
  pageCount: number;
  pagesNeedingOcr: number[];
  ocrApplied: boolean;
  textReport?: TextPreparationReport;
}

export interface RunEvent {
  projectId: string;
  phase: 'started' | 'agent' | 'validated' | 'failed';
  detail: string;
}

export interface DesktopApi {
  getSettings(): Promise<SettingsView>;
  saveSettings(input: SettingsInput): Promise<SettingsView>;
  openProviderApiKeyPage(provider: string): Promise<void>;
  openOcrSignupPage(): Promise<void>;
  selectAndCreateProject(): Promise<ProjectPreparation | undefined>;
  getProject(projectId: string): Promise<ProjectRecord>;
  getSourcePdf(projectId: string): Promise<Uint8Array>;
  runClassification(projectId: string): Promise<PaperResult>;
  saveReview(projectId: string, result: PaperResult, feedback?: ReviewFeedbackInput): Promise<PaperResult>;
  exportWorkbook(projectId: string): Promise<string>;
  getMemorySnapshot(): Promise<MemorySnapshot>;
  createPersonalRule(input: PersonalRuleInput): Promise<MemorySnapshot>;
  updatePersonalRule(ruleId: string, input: PersonalRuleInput): Promise<MemorySnapshot>;
  deletePersonalRule(ruleId: string): Promise<MemorySnapshot>;
  rollbackPersonalRule(ruleId: string): Promise<MemorySnapshot>;
  approveCandidateRule(candidateId: string): Promise<MemorySnapshot>;
  rejectCandidateRule(candidateId: string): Promise<MemorySnapshot>;
  clearFeedbackMemory(): Promise<MemorySnapshot>;
  exportMemory(): Promise<string>;
  onRunEvent(listener: (event: RunEvent) => void): () => void;
}
