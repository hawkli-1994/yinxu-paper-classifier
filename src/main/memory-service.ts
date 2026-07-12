import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  CandidateRule,
  FeedbackEvent,
  MemorySnapshot,
  MemoryTrace,
  PaperResult,
  PersonalRule,
  PersonalRuleInput,
  ProjectRecord,
  ReviewFeedbackInput,
  RuleRevision
} from '../shared/contracts';
import { summarizeReviewChanges } from '../shared/review-model';
import { isValidLeafCategory } from '../shared/taxonomy';
import { getExportsDirectory, getMemoryDirectory } from './paths';

const MEMORY_SCHEMA_VERSION = 1;
const MAX_RETRIEVED_RULES = 8;
const MAX_RETRIEVED_FEEDBACK = 3;

const now = (): string => new Date().toISOString();
const rulesPath = (root: string): string => join(getMemoryDirectory(root), 'personal-rules.json');
const candidatesPath = (root: string): string => join(getMemoryDirectory(root), 'candidate-rules.json');
const feedbackPath = (root: string): string => join(getMemoryDirectory(root), 'feedback.jsonl');

const loadJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
};

const writeJsonAtomically = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
};

const loadRules = (root: string): Promise<PersonalRule[]> => loadJson(rulesPath(root), []);
const loadCandidates = (root: string): Promise<CandidateRule[]> => loadJson(candidatesPath(root), []);

const loadFeedback = async (root: string): Promise<FeedbackEvent[]> => {
  try {
    const content = await readFile(feedbackPath(root), 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as FeedbackEvent];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

const normalizeKeywords = (keywords: readonly string[]): string[] =>
  [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 20);

const sanitizeRuleInput = (input: PersonalRuleInput): PersonalRuleInput => {
  const title = input.title.trim().slice(0, 120);
  const text = input.text.trim().slice(0, 4000);
  if (!title || !text) throw new Error('个人规则必须填写标题和规则内容。');
  const fromCategoryCode = input.fromCategoryCode?.trim() || undefined;
  const targetCategoryCode = input.targetCategoryCode?.trim() || undefined;
  if (fromCategoryCode && !isValidLeafCategory(fromCategoryCode)) throw new Error('原分类代码必须是有效的三级分类。');
  if (targetCategoryCode && !isValidLeafCategory(targetCategoryCode)) throw new Error('建议分类代码必须是有效的三级分类。');
  return {
    title,
    text,
    enabled: input.enabled,
    triggerKeywords: normalizeKeywords(input.triggerKeywords),
    fromCategoryCode,
    targetCategoryCode
  };
};

const revisionOf = (rule: PersonalRule): RuleRevision => ({
  revision: rule.revision,
  title: rule.title,
  text: rule.text,
  enabled: rule.enabled,
  triggerKeywords: rule.triggerKeywords,
  fromCategoryCode: rule.fromCategoryCode,
  targetCategoryCode: rule.targetCategoryCode,
  changedAt: rule.updatedAt
});

const saveRules = async (root: string, rules: PersonalRule[]): Promise<void> => {
  await mkdir(getMemoryDirectory(root), { recursive: true });
  await writeJsonAtomically(rulesPath(root), rules);
};

const saveCandidates = async (root: string, candidates: CandidateRule[]): Promise<void> => {
  await mkdir(getMemoryDirectory(root), { recursive: true });
  await writeJsonAtomically(candidatesPath(root), candidates);
};

export const getMemorySnapshot = async (root: string): Promise<MemorySnapshot> => {
  const [rules, candidateRules, feedback] = await Promise.all([loadRules(root), loadCandidates(root), loadFeedback(root)]);
  return {
    rules: [...rules].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    candidateRules: [...candidateRules].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    feedbackCount: feedback.length,
    recentFeedback: feedback.slice(-20).reverse()
  };
};

export const createPersonalRule = async (root: string, input: PersonalRuleInput): Promise<MemorySnapshot> => {
  const normalized = sanitizeRuleInput(input);
  const timestamp = now();
  const rules = await loadRules(root);
  rules.push({
    id: randomUUID(),
    ...normalized,
    revision: 1,
    source: 'manual',
    confidence: 0.75,
    appliedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    history: []
  });
  await saveRules(root, rules);
  return getMemorySnapshot(root);
};

export const updatePersonalRule = async (root: string, ruleId: string, input: PersonalRuleInput): Promise<MemorySnapshot> => {
  const normalized = sanitizeRuleInput(input);
  const rules = await loadRules(root);
  const index = rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) throw new Error('个人规则不存在。');
  const current = rules[index]!;
  rules[index] = {
    ...current,
    ...normalized,
    revision: current.revision + 1,
    updatedAt: now(),
    history: [...current.history, revisionOf(current)]
  };
  await saveRules(root, rules);
  return getMemorySnapshot(root);
};

export const deletePersonalRule = async (root: string, ruleId: string): Promise<MemorySnapshot> => {
  const rules = await loadRules(root);
  const next = rules.filter((rule) => rule.id !== ruleId);
  if (next.length === rules.length) throw new Error('个人规则不存在。');
  await saveRules(root, next);
  return getMemorySnapshot(root);
};

export const rollbackPersonalRule = async (root: string, ruleId: string): Promise<MemorySnapshot> => {
  const rules = await loadRules(root);
  const index = rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) throw new Error('个人规则不存在。');
  const current = rules[index]!;
  const previous = current.history.at(-1);
  if (!previous) throw new Error('该规则没有可回滚的历史版本。');
  rules[index] = {
    ...current,
    title: previous.title,
    text: previous.text,
    enabled: previous.enabled,
    triggerKeywords: previous.triggerKeywords,
    fromCategoryCode: previous.fromCategoryCode,
    targetCategoryCode: previous.targetCategoryCode,
    revision: current.revision + 1,
    updatedAt: now(),
    history: current.history.slice(0, -1)
  };
  await saveRules(root, rules);
  return getMemorySnapshot(root);
};

export const approveCandidateRule = async (root: string, candidateId: string): Promise<MemorySnapshot> => {
  const [rules, candidates] = await Promise.all([loadRules(root), loadCandidates(root)]);
  const index = candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index < 0) throw new Error('候选规则不存在。');
  const candidate = candidates[index]!;
  if (candidate.status !== 'pending') throw new Error('候选规则已处理。');
  const timestamp = now();
  const ruleId = randomUUID();
  rules.push({
    id: ruleId,
    title: candidate.title,
    text: candidate.text,
    enabled: true,
    revision: 1,
    source: 'feedback',
    triggerKeywords: candidate.triggerKeywords,
    fromCategoryCode: candidate.fromCategoryCode,
    targetCategoryCode: candidate.targetCategoryCode,
    confidence: 0.67,
    appliedCount: 0,
    acceptedCount: 1,
    rejectedCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    history: []
  });
  candidates[index] = { ...candidate, status: 'approved', linkedRuleId: ruleId, updatedAt: timestamp };
  await Promise.all([saveRules(root, rules), saveCandidates(root, candidates)]);
  return getMemorySnapshot(root);
};

export const rejectCandidateRule = async (root: string, candidateId: string): Promise<MemorySnapshot> => {
  const candidates = await loadCandidates(root);
  const index = candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index < 0) throw new Error('候选规则不存在。');
  const candidate = candidates[index]!;
  candidates[index] = { ...candidate, status: 'rejected', updatedAt: now() };
  await saveCandidates(root, candidates);
  return getMemorySnapshot(root);
};

const parsePaperKeywords = (value: string): string[] =>
  normalizeKeywords(value.split(/[；;，,、\s]+/));

const updateAppliedRuleStats = async (
  root: string,
  ruleIds: readonly string[],
  correctedCategoryCode: string,
  categoryChanged: boolean
): Promise<void> => {
  if (ruleIds.length === 0) return;
  const ruleIdSet = new Set(ruleIds);
  const rules = await loadRules(root);
  let changed = false;
  for (const rule of rules) {
    if (!ruleIdSet.has(rule.id)) continue;
    const accepted = !categoryChanged || !rule.targetCategoryCode || rule.targetCategoryCode === correctedCategoryCode;
    rule.appliedCount += 1;
    rule.acceptedCount += accepted ? 1 : 0;
    rule.rejectedCount += accepted ? 0 : 1;
    rule.confidence = Number(((rule.acceptedCount + 1) / (rule.acceptedCount + rule.rejectedCount + 2)).toFixed(3));
    rule.updatedAt = now();
    changed = true;
  }
  if (changed) await saveRules(root, rules);
};

export const recordReviewFeedback = async (
  root: string,
  project: ProjectRecord,
  before: PaperResult,
  after: PaperResult,
  input: ReviewFeedbackInput
): Promise<FeedbackEvent> => {
  const timestamp = now();
  const event: FeedbackEvent = {
    id: randomUUID(),
    projectId: project.id,
    paperHash: project.sourceSha256,
    paperTitle: after.fields.题名,
    paperKeywords: parsePaperKeywords(after.fields.关键词),
    ontologyVersion: project.knowledgeVersion,
    original: {
      primaryCategoryCode: before.primaryCategoryCode,
      crossReferenceCategoryCodes: before.crossReferenceCategoryCodes
    },
    corrected: {
      primaryCategoryCode: after.primaryCategoryCode,
      crossReferenceCategoryCodes: after.crossReferenceCategoryCodes
    },
    errorTypes: [...new Set(input.errorTypes)],
    reason: input.reason.trim().slice(0, 2000),
    summary: summarizeReviewChanges(before, after),
    appliedRuleIds: before.memoryTrace?.appliedRuleIds ?? [],
    createdAt: timestamp
  };
  await mkdir(getMemoryDirectory(root), { recursive: true });
  await appendFile(feedbackPath(root), `${JSON.stringify(event)}\n`, 'utf8');

  const categoryChanged = before.primaryCategoryCode !== after.primaryCategoryCode;
  await updateAppliedRuleStats(root, event.appliedRuleIds, after.primaryCategoryCode, categoryChanged);

  if (input.rememberAsCandidate && (categoryChanged || event.errorTypes.length > 0 || event.reason)) {
    const candidates = await loadCandidates(root);
    const subject = event.paperKeywords.slice(0, 4).join('、') || event.paperTitle || '相似论文';
    const categoryText = categoryChanged
      ? `将主分类由 ${before.primaryCategoryCode} 调整为 ${after.primaryCategoryCode}`
      : '保留本次人工复核经验';
    const reason = event.reason || event.errorTypes.join('、') || event.summary;
    candidates.push({
      id: randomUUID(),
      feedbackId: event.id,
      title: `${subject}的复核经验`,
      text: `处理与「${subject}」相似的论文时，${categoryText}。复核依据：${reason}`,
      triggerKeywords: event.paperKeywords.slice(0, 8),
      fromCategoryCode: categoryChanged ? before.primaryCategoryCode : undefined,
      targetCategoryCode: categoryChanged ? after.primaryCategoryCode : undefined,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await saveCandidates(root, candidates);
  }
  return event;
};

const normalizedText = (value: string): string => value.toLocaleLowerCase().replace(/\s+/g, '');

const keywordScore = (keywords: readonly string[], documentText: string): number => {
  if (keywords.length === 0) return 0.2;
  const normalizedDocument = normalizedText(documentText);
  const matches = keywords.filter((keyword) => normalizedDocument.includes(normalizedText(keyword))).length;
  return matches / keywords.length;
};

export interface RetrievedMemoryContext {
  personalPrompt: string;
  rules: PersonalRule[];
  feedback: FeedbackEvent[];
  trace: MemoryTrace;
}

export const retrieveMemoryContext = async (
  root: string,
  paperText: string,
  settings: { enabled: boolean; personalRulesPrompt: string }
): Promise<RetrievedMemoryContext> => {
  if (!settings.enabled) {
    return {
      personalPrompt: '',
      rules: [],
      feedback: [],
      trace: { personalPromptApplied: false, appliedRuleIds: [], relevantFeedbackIds: [], conflicts: [] }
    };
  }
  const [rules, feedback] = await Promise.all([loadRules(root), loadFeedback(root)]);
  const matchedRules = rules
    .filter((rule) => rule.enabled)
    .map((rule) => ({ rule, score: keywordScore(rule.triggerKeywords, paperText) * 0.75 + rule.confidence * 0.25 }))
    .filter(({ rule, score }) => rule.triggerKeywords.length === 0 || score >= 0.25)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RETRIEVED_RULES)
    .map(({ rule }) => rule);

  const relevantFeedback = feedback
    .map((item) => ({ item, score: keywordScore(item.paperKeywords, paperText) }))
    .filter(({ item, score }) => item.paperKeywords.length > 0 && score > 0)
    .sort((left, right) => right.score - left.score || right.item.createdAt.localeCompare(left.item.createdAt))
    .slice(0, MAX_RETRIEVED_FEEDBACK)
    .map(({ item }) => item);

  const conflicts: string[] = [];
  for (let leftIndex = 0; leftIndex < matchedRules.length; leftIndex += 1) {
    const left = matchedRules[leftIndex]!;
    if (!left.targetCategoryCode) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < matchedRules.length; rightIndex += 1) {
      const right = matchedRules[rightIndex]!;
      if (!right.targetCategoryCode || left.targetCategoryCode === right.targetCategoryCode) continue;
      const sharedKeywords = left.triggerKeywords.filter((keyword) => right.triggerKeywords.includes(keyword));
      if (sharedKeywords.length === 0 && left.triggerKeywords.length > 0 && right.triggerKeywords.length > 0) continue;
      conflicts.push(`个人规则「${left.title}」建议 ${left.targetCategoryCode}，但「${right.title}」建议 ${right.targetCategoryCode}`);
    }
  }

  const personalPrompt = settings.personalRulesPrompt.trim().slice(0, 8000);
  return {
    personalPrompt,
    rules: matchedRules,
    feedback: relevantFeedback,
    trace: {
      personalPromptApplied: Boolean(personalPrompt),
      appliedRuleIds: matchedRules.map((rule) => rule.id),
      relevantFeedbackIds: relevantFeedback.map((item) => item.id),
      conflicts
    }
  };
};

export const clearFeedbackMemory = async (root: string): Promise<MemorySnapshot> => {
  await mkdir(getMemoryDirectory(root), { recursive: true });
  await writeFile(feedbackPath(root), '', 'utf8');
  return getMemorySnapshot(root);
};

export const exportMemory = async (root: string): Promise<string> => {
  const snapshot = await getMemorySnapshot(root);
  const exportsDirectory = getExportsDirectory(root);
  await mkdir(exportsDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetPath = join(exportsDirectory, `agent-memory-${stamp}.json`);
  await writeFile(targetPath, `${JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION, exportedAt: now(), ...snapshot }, null, 2)}\n`, 'utf8');
  return targetPath;
};
