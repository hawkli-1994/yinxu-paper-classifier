import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateResultRevision,
  completeClassificationRun,
  createClassificationRun,
  createProject,
  deleteProject,
  listProjectSummaries,
  loadProjectWorkspace,
  readProject,
  readResultRevision,
  saveReviewRevision,
  updateProjectMetadata
} from '../../src/main/project-service';
import { addSupplementalNote } from '../../src/main/supplement-service';
import { createFixturePdf } from '../fixtures/pdf';
import { makePaperResult } from '../fixtures/paper-result';

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'yinxu-project-'));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project service', () => {
  it('creates a project with copied source and imported status', async () => {
    const root = await makeRoot();
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);

    const project = await createProject(source, root, '2.3.4');

    expect(project.status).toBe('imported');
    expect(project.knowledgeVersion).toBe('2.3.4');
    await expect(access(project.sourcePdfPath)).resolves.toBeUndefined();
    expect(await readFile(project.sourcePdfPath)).toEqual(await readFile(source));
  });

  it('updates the recorded knowledge package when an existing project is classified again', async () => {
    const root = await makeRoot();
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '2.0.0');
    const updated = await updateProjectMetadata(project, { knowledgeVersion: '2.0.1' });

    expect(updated.knowledgeVersion).toBe('2.0.1');
    expect((await readProject(updated.rootPath)).knowledgeVersion).toBe('2.0.1');
  });

  it('permanently deletes a project directory without affecting the imported source file', async () => {
    const root = await makeRoot();
    const source = join(root, 'delete-me.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '2.3.4');

    await deleteProject(root, project.id);

    await expect(access(project.rootPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(source)).resolves.toBeUndefined();
    await expect(listProjectSummaries(root)).resolves.toEqual([]);
  });

  it('persists the actual Agent and OCR run metadata for audit export', async () => {
    const root = await makeRoot();
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '2.3.4');

    await updateProjectMetadata(project, {
      agentProvider: 'deepseek',
      agentModel: 'deepseek-chat',
      thinkingLevel: 'medium',
      ocrModel: 'PaddleOCR-VL-1.6'
    });

    expect(await readProject(project.rootPath)).toMatchObject({
      agentProvider: 'deepseek',
      agentModel: 'deepseek-chat',
      thinkingLevel: 'medium',
      ocrModel: 'PaddleOCR-VL-1.6'
    });
  });

  it('keeps every classification run and result revision instead of overwriting older work', async () => {
    const root = await makeRoot();
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);
    let project = await createProject(source, root, '2.0.1');
    const materials = await addSupplementalNote(project, {
      title: '作者身份说明',
      content: '作者现工作单位为某高校，本说明仅用于作者元数据核验。',
      kind: 'author_metadata',
      sourceLabel: '用户补充'
    });
    const metadata = {
      agentProvider: 'moonshot',
      agentModel: 'kimi-k2.5',
      thinkingLevel: 'medium' as const,
      knowledgeVersion: '2.0.1',
      ocrModel: 'PaddleOCR-VL-1.6'
    };

    const first = await createClassificationRun(project, metadata, materials);
    const firstResult = makePaperResult({ fields: { ...makePaperResult().fields, 题名: '第一次分类结果' } });
    project = await completeClassificationRun(first.project, first.run, first.runDirectory, firstResult);
    const firstRevisionId = project.activeRevisionId!;

    const second = await createClassificationRun(project, metadata, materials);
    const secondResult = makePaperResult({ fields: { ...makePaperResult().fields, 题名: '第二次分类结果' } });
    project = await completeClassificationRun(second.project, second.run, second.runDirectory, secondResult);
    const secondRevisionId = project.activeRevisionId!;
    project = await saveReviewRevision(
      project,
      { ...secondResult, reviewStatus: 'confirmed', fields: { ...secondResult.fields, 题名: '人工复核结果' } },
      '人工复核并修正题名'
    );

    const workspace = await loadProjectWorkspace(root, project.id);
    expect(workspace.runs).toHaveLength(2);
    expect(workspace.revisions).toHaveLength(3);
    expect(workspace.result?.fields.题名).toBe('人工复核结果');
    expect(workspace.runs.every((run) => run.supplementIds[0] === materials[0]?.id)).toBe(true);
    expect(workspace.runs.every((run) => run.supplementHashes[0] === materials[0]?.sha256)).toBe(true);
    expect(await readFile(workspace.runs[0]!.supplementContextPath!, 'utf8')).toContain('作者现工作单位为某高校');
    expect((await readResultRevision(project, firstRevisionId)).fields.题名).toBe('第一次分类结果');
    expect((await readResultRevision(project, secondRevisionId)).fields.题名).toBe('第二次分类结果');

    const restored = await activateResultRevision(project, firstRevisionId);
    expect((await loadProjectWorkspace(root, restored.id)).result?.fields.题名).toBe('第一次分类结果');
    await expect(access(workspace.revisions[0]!.resultPath)).resolves.toBeUndefined();

    const summaries = await listProjectSummaries(root);
    expect(summaries).toMatchObject([{ id: project.id, title: '第一次分类结果', supplementCount: 1, runCount: 2 }]);
  });

  it('recovers a classification left running after the app was interrupted', async () => {
    const root = await makeRoot();
    const source = join(root, 'interrupted.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '2.0.1');
    const created = await createClassificationRun(project, {
      agentProvider: 'moonshot',
      agentModel: 'kimi-k2.5',
      thinkingLevel: 'medium',
      knowledgeVersion: '2.0.1',
      ocrModel: 'PaddleOCR-VL-1.6'
    }, []);

    const workspace = await loadProjectWorkspace(root, project.id);

    expect(workspace.project.status).toBe('imported');
    expect(workspace.project.activeRunId).toBeUndefined();
    expect(workspace.runs[0]).toMatchObject({ id: created.run.id, status: 'cancelled' });
    expect(workspace.runs[0]?.error).toContain('应用关闭或异常中断');
  });

  it('migrates a legacy project result into an auditable run and revision when reopened', async () => {
    const root = await makeRoot();
    const source = join(root, 'legacy.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '1.0.0');
    const legacyResult = makePaperResult({ fields: { ...makePaperResult().fields, 题名: '旧版结果' } });
    const legacyProject = { ...project } as Record<string, unknown>;
    delete legacyProject.schemaVersion;
    delete legacyProject.activeRunId;
    delete legacyProject.activeRevisionId;
    await Promise.all([
      writeFile(join(project.rootPath, 'project.json'), JSON.stringify(legacyProject, null, 2), 'utf8'),
      writeFile(join(project.rootPath, 'result', 'final-result.json'), JSON.stringify(legacyResult, null, 2), 'utf8')
    ]);

    const migrated = await readProject(project.rootPath);
    const workspace = await loadProjectWorkspace(root, migrated.id);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.activeRunId).toMatch(/^legacy-/);
    expect(migrated.activeRevisionId).toBeTruthy();
    expect(workspace.runs).toHaveLength(1);
    expect(workspace.revisions).toHaveLength(1);
    expect(workspace.result?.fields.题名).toBe('旧版结果');
  });
});
