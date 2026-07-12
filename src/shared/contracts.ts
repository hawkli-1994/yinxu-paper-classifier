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
  '作者姓名识别错误',
  '作者单位或身份错误',
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
  feedbackScope?: 'classification' | 'author_metadata' | 'mixed';
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

export type ProjectStatus = 'imported' | 'materials_updated' | 'processing' | 'review_required' | 'confirmed' | 'failed';

export type SupplementKind = 'author_metadata' | 'bibliography' | 'expert_note' | 'appendix' | 'other';
export type SupplementStatus = 'ready' | 'needs_review' | 'failed';

export interface LocalFileSelection {
  path: string;
  name: string;
  extension: string;
  size: number;
}

export interface SupplementalFileInput {
  path: string;
  kind: SupplementKind;
  sourceLabel?: string;
}

export interface SupplementalNoteInput {
  title: string;
  content: string;
  kind: SupplementKind;
  sourceLabel?: string;
}

export interface SupplementalMaterialRecord {
  id: string;
  kind: SupplementKind;
  sourceType: 'file' | 'note';
  title: string;
  sourceLabel: string;
  originalFileName?: string;
  storedPath: string;
  extractedTextPath: string;
  sha256: string;
  size: number;
  status: SupplementStatus;
  statusDetail?: string;
  createdAt: string;
  removedAt?: string;
}

export interface CreateProjectInput {
  sourcePdfPath: string;
  supplementalFiles: SupplementalFileInput[];
  supplementalNotes: SupplementalNoteInput[];
}

export interface ClassificationRunRecord {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  agentProvider: string;
  agentModel: string;
  thinkingLevel: ThinkingLevel;
  knowledgeVersion: string;
  ocrModel: string;
  supplementIds: string[];
  supplementHashes: string[];
  supplementContextPath?: string;
  sessionPath: string;
  resultRevisionId?: string;
  error?: string;
}

export interface ResultRevisionRecord {
  id: string;
  projectId: string;
  runId: string;
  kind: 'agent' | 'review';
  parentRevisionId?: string;
  resultPath: string;
  summary: string;
  createdAt: string;
}

export interface ProjectRecord {
  schemaVersion?: 1 | 2;
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
  activeRunId?: string;
  activeRevisionId?: string;
  archivedAt?: string;
}

export interface ProjectSummary {
  id: string;
  sourceFileName: string;
  title: string;
  author: string;
  status: ProjectStatus;
  updatedAt: string;
  supplementCount: number;
  runCount: number;
}

export interface ProjectWorkspace {
  project: ProjectRecord;
  preparation: ProjectPreparation;
  supplements: SupplementalMaterialRecord[];
  runs: ClassificationRunRecord[];
  revisions: ResultRevisionRecord[];
  result?: PaperResult;
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
  runId?: string;
  phase: 'started' | 'agent' | 'validated' | 'failed';
  detail: string;
}

export interface DesktopApi {
  getSettings(): Promise<SettingsView>;
  saveSettings(input: SettingsInput): Promise<SettingsView>;
  openProviderApiKeyPage(provider: string): Promise<void>;
  openOcrSignupPage(): Promise<void>;
  selectPrimaryPaper(): Promise<LocalFileSelection | undefined>;
  selectSupplementalFiles(): Promise<LocalFileSelection[]>;
  createProject(input: CreateProjectInput): Promise<ProjectWorkspace>;
  listProjects(): Promise<ProjectSummary[]>;
  openProject(projectId: string): Promise<ProjectWorkspace>;
  getProject(projectId: string): Promise<ProjectRecord>;
  getSourcePdf(projectId: string): Promise<Uint8Array>;
  addSupplementalFiles(projectId: string, files: SupplementalFileInput[]): Promise<ProjectWorkspace>;
  addSupplementalNote(projectId: string, note: SupplementalNoteInput): Promise<ProjectWorkspace>;
  removeSupplementalMaterial(projectId: string, materialId: string): Promise<ProjectWorkspace>;
  runClassification(projectId: string): Promise<ProjectWorkspace>;
  saveReview(projectId: string, result: PaperResult, feedback?: ReviewFeedbackInput): Promise<ProjectWorkspace>;
  activateResultRevision(projectId: string, revisionId: string): Promise<ProjectWorkspace>;
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
