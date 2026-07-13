import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../../src/shared/contracts';
import {
  approveCandidateRule,
  createPersonalRule,
  exportMemory,
  getMemorySnapshot,
  recordReviewFeedback,
  retrieveMemoryContext,
  rollbackGlobalMemorySettings,
  rollbackPersonalRule,
  updateGlobalMemorySettings,
  updatePersonalRule
} from '../../src/main/memory-service';
import { makePaperResult } from '../fixtures/paper-result';

const roots: string[] = [];

const makeProject = (rootPath: string): ProjectRecord => ({
  id: 'paper-1',
  rootPath,
  sourcePdfPath: join(rootPath, 'source', 'original.pdf'),
  sourceFileName: 'paper.pdf',
  sourceSha256: 'paper-hash',
  status: 'review_required',
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  knowledgeVersion: '1.0.0'
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local Agent memory', () => {
  it('records selected cross-project feedback and only activates a generated rule after approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    const before = makePaperResult();
    const after = makePaperResult({ primaryCategoryCode: 'A33' });

    await recordReviewFeedback(root, makeProject(root), before, after, {
      errorTypes: ['主分类错误', '史实或年代错误'],
      projectReason: '本篇第3页证明主类错误。',
      memoryAction: 'candidate_rule',
      reusableLesson: '文章核心讨论祭祀坑的考古材料时，应按核心材料归类，而不是只看祭祀辞例。'
    });

    let snapshot = await getMemorySnapshot(root);
    expect(snapshot.feedbackCount).toBe(1);
    expect(snapshot.rules).toHaveLength(0);
    expect(snapshot.candidateRules[0]).toMatchObject({ status: 'pending', fromCategoryCode: 'B41', targetCategoryCode: 'A33' });

    snapshot = await approveCandidateRule(root, snapshot.candidateRules[0]!.id);
    expect(snapshot.rules[0]).toMatchObject({ source: 'feedback', enabled: true, targetCategoryCode: 'A33' });
    const context = await retrieveMemoryContext(root, '本文研究甲骨、祭祀与卜辞，同时讨论祭祀坑。', { enabled: true, globalGuidance: '以核心问题确定主类' });
    expect(context.trace.personalPromptApplied).toBe(true);
    expect(context.rules.map((rule) => rule.id)).toContain(snapshot.rules[0]!.id);
    expect(context.feedback).toHaveLength(1);
  });

  it('keeps revisions, supports rollback, and detects conflicting enabled rules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    let snapshot = await createPersonalRule(root, {
      title: '祭祀考古优先', text: '祭祀坑材料优先归入考古遗存。', enabled: true, scope: 'conditional', triggerKeywords: ['祭祀坑'], targetCategoryCode: 'A33'
    });
    const first = snapshot.rules[0]!;
    snapshot = await updatePersonalRule(root, first.id, {
      title: '祭祀卜辞优先', text: '祭祀辞例优先归入卜辞事类。', enabled: true, scope: 'conditional', triggerKeywords: ['祭祀坑'], targetCategoryCode: 'B41'
    });
    expect(snapshot.rules[0]!.history).toHaveLength(1);
    snapshot = await rollbackPersonalRule(root, first.id);
    expect(snapshot.rules[0]!.targetCategoryCode).toBe('A33');

    await createPersonalRule(root, {
      title: '另一条卜辞规则', text: '祭祀坑相关论文归入祭祀卜辞。', enabled: true, scope: 'conditional', triggerKeywords: ['祭祀坑'], targetCategoryCode: 'B41'
    });
    const context = await retrieveMemoryContext(root, '本文围绕祭祀坑展开研究。', { enabled: true, globalGuidance: '' });
    expect(context.trace.conflicts).toHaveLength(1);
  });

  it('keeps author identity corrections as audit feedback without teaching classification memory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    const before = makePaperResult();
    const after = makePaperResult({ fields: { ...before.fields, 作者: '人工核对后的作者姓名' } });

    await recordReviewFeedback(root, makeProject(root), before, after, {
      errorTypes: ['作者单位或身份错误'],
      projectReason: '原方案使用了静态院内外名单。',
      memoryAction: 'global_memory',
      reusableLesson: '作者身份类反馈不得参与主题分类。'
    });

    const snapshot = await getMemorySnapshot(root);
    expect(snapshot.feedbackCount).toBe(1);
    expect(snapshot.recentFeedback[0]?.feedbackScope).toBe('author_metadata');
    expect(snapshot.candidateRules).toHaveLength(0);
    const context = await retrieveMemoryContext(root, '本文讨论甲骨与祭祀。', { enabled: true, globalGuidance: '' });
    expect(context.feedback).toHaveLength(0);
    expect(context.trace.relevantFeedbackIds).toHaveLength(0);
  });

  it('sanitizes author details out of a mixed classification candidate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    const before = makePaperResult();
    const after = makePaperResult({ primaryCategoryCode: 'A33', fields: { ...before.fields, 作者: '人工核对后的作者姓名' } });

    await recordReviewFeedback(root, makeProject(root), before, after, {
      errorTypes: ['作者单位或身份错误', '主分类错误'],
      projectReason: '这段只用于人物纠错，不应进入后续 Agent 的分类记忆。',
      memoryAction: 'candidate_rule',
      reusableLesson: '遇到同类论文时，应按核心考古材料修正主分类。'
    });

    const snapshot = await getMemorySnapshot(root);
    expect(snapshot.recentFeedback[0]?.feedbackScope).toBe('mixed');
    expect(snapshot.candidateRules).toHaveLength(1);
    expect(snapshot.candidateRules[0]?.text).toContain('核心考古材料');
    expect(snapshot.candidateRules[0]?.text).not.toContain('人物纠错');
    const context = await retrieveMemoryContext(root, '本文讨论甲骨与祭祀。', { enabled: true, globalGuidance: '' });
    expect(context.feedback).toHaveLength(0);
  });

  it('keeps project-only review notes out of cross-project memory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    const before = makePaperResult();
    await recordReviewFeedback(root, makeProject(root), before, before, {
      errorTypes: ['字段提取错误'],
      projectReason: '本篇扫描页有一个错字。',
      memoryAction: 'project_only',
      reusableLesson: ''
    });

    expect((await getMemorySnapshot(root)).feedbackCount).toBe(0);
  });

  it('versions and rolls back the global guidance above all projects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    let snapshot = await updateGlobalMemorySettings(root, { enabled: true, globalGuidance: '第一版全局原则' });
    snapshot = await updateGlobalMemorySettings(root, { enabled: true, globalGuidance: '第二版全局原则' });
    expect(snapshot.settings).toMatchObject({ revision: 2, globalGuidance: '第二版全局原则' });
    expect(snapshot.settings.history).toHaveLength(1);

    snapshot = await rollbackGlobalMemorySettings(root);
    expect(snapshot.settings).toMatchObject({ revision: 3, globalGuidance: '第一版全局原则' });
  });

  it('requires an explicit safe scope for every cross-project rule', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    await expect(createPersonalRule(root, {
      title: '缺少条件', text: '只在相关论文中使用。', enabled: true, scope: 'conditional', triggerKeywords: []
    })).rejects.toThrow('至少需要填写触发关键词或适用的原主分类');

    const snapshot = await createPersonalRule(root, {
      title: '全局原则', text: '核心研究问题优先。', enabled: true, scope: 'all_papers', triggerKeywords: ['会被清除'], fromCategoryCode: 'B41'
    });
    expect(snapshot.rules[0]).toMatchObject({ scope: 'all_papers', triggerKeywords: [] });
    expect(snapshot.rules[0]?.fromCategoryCode).toBeUndefined();
  });

  it('exports a readable versioned snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-memory-'));
    roots.push(root);
    await createPersonalRule(root, { title: '通用规则', text: '核心研究问题优先。', enabled: true, scope: 'all_papers', triggerKeywords: [] });
    const path = await exportMemory(root);
    const exported = JSON.parse(await readFile(path, 'utf8')) as { schemaVersion: number; rules: unknown[] };
    expect(exported.schemaVersion).toBe(2);
    expect(exported.rules).toHaveLength(1);
  });
});
