import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixturePdf } from '../tests/fixtures/pdf';
import { makePaperResult } from '../tests/fixtures/paper-result';

const captureAppWindow = async (app: ElectronApplication, targetPath: string): Promise<void> => {
  const page = await app.firstWindow();
  await page.bringToFront();
  await page.waitForTimeout(150);
  const dataUrl = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Electron window is unavailable.');
    return (await window.webContents.capturePage()).toDataURL();
  });
  await writeFile(targetPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
};

test('manages local paper projects, supplements, workspace tabs, and independent scrolling', async () => {
  test.setTimeout(60_000);
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-p05-e2e-'));
  const userData = join(fixtureRoot, 'user-data');
  const firstPaper = join(fixtureRoot, '殷墟甲骨祭祀研究.pdf');
  const secondPaper = join(fixtureRoot, '殷墟青铜礼器研究.pdf');
  const expertFeedback = join(fixtureRoot, '博士生反馈.txt');
  await Promise.all([
    createFixturePdf(firstPaper, 'Yinxu oracle bone ritual study with embedded text'),
    createFixturePdf(secondPaper, 'Yinxu bronze ritual vessel study with embedded text'),
    writeFile(expertFeedback, '作者分类不应机械地按照社科院院内和院外二分。', 'utf8')
  ]);

  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  try {
    const window = await app.firstWindow();
    const consoleIssues: string[] = [];
    window.on('console', (entry) => {
      if (entry.type() === 'error' || entry.type() === 'warning') consoleIssues.push(entry.text());
    });

    await expect(window).toHaveTitle('殷墟论文分类助手');
    await expect(window.locator('vite-error-overlay')).toHaveCount(0);
    await expect(window.getByText('北京容芯致远科技有限公司')).toBeVisible();
    await expect(window.getByRole('button', { name: '创建论文项目' })).toBeVisible();
    await window.getByRole('button', { name: '创建论文项目' }).click();
    await expect(window.getByRole('dialog', { name: '新建论文项目' })).toBeVisible();
    await expect(window.getByRole('button', { name: '选择主论文' })).toBeVisible();
    await expect(window.getByRole('button', { name: '选择补充材料' })).toBeVisible();
    await window.getByRole('button', { name: '添加手动补充说明' }).click();
    await expect(window.getByLabel('补充内容')).toBeVisible();
    await window.waitForTimeout(250);
    await window.screenshot({ path: '/tmp/yinxu-copy-new-project.png' });
    await window.getByRole('button', { name: '取消' }).click();

    const projectIds = await window.evaluate(async ({ firstPaper, secondPaper, expertFeedback }) => {
      const first = await window.yinxu.createProject({
        sourcePdfPath: firstPaper,
        supplementalFiles: [{ path: expertFeedback, kind: 'expert_note', sourceLabel: '博士生反馈' }],
        supplementalNotes: Array.from({ length: 8 }, (_, index) => ({
          title: `项目说明 ${index + 1}`,
          content: `这是用于当前论文项目的第 ${index + 1} 条补充材料。`,
          kind: index === 0 ? 'author_metadata' : 'other',
          sourceLabel: '用户手动补充'
        }))
      });
      const second = await window.yinxu.createProject({ sourcePdfPath: secondPaper, supplementalFiles: [], supplementalNotes: [] });
      return { first: first.project.id, second: second.project.id };
    }, { firstPaper, secondPaper, expertFeedback });

    await window.reload();
    await expect(window.locator('.project-list-item')).toHaveCount(2);
    await expect(window.getByRole('heading', { name: '殷墟青铜礼器研究' })).toBeVisible();
    await expect(window.getByRole('tab', { name: '论文资料' })).toBeVisible();

    await window.locator('.project-list-item', { hasText: '殷墟甲骨祭祀研究' }).click();
    await expect(window.getByRole('heading', { name: '殷墟甲骨祭祀研究' })).toBeVisible();
    await expect(window.getByText('博士生反馈.txt')).toBeVisible();
    await expect(window.getByText('作者信息', { exact: true })).toBeVisible();
    await expect(window.getByText('补充材料 9 份')).toBeVisible();

    const sidebar = window.locator('.project-sider');
    const tabContent = window.locator('.workspace-tabs .ant-tabs-body-holder');
    const initialSidebarTop = await sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().top));
    expect(await tabContent.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await tabContent.evaluate((element) => element.clientHeight));
    await tabContent.evaluate((element) => { element.scrollTop = 1000; });
    await expect.poll(() => tabContent.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(initialSidebarTop);
    expect(await window.evaluate(() => document.scrollingElement?.scrollTop ?? -1)).toBe(0);

    await window.getByRole('tab', { name: '分类记录' }).click();
    await expect(window.getByText('暂无分类任务')).toBeVisible();
    await expect(window.getByText('暂无结果版本')).toBeVisible();
    await window.getByRole('tab', { name: 'AI 分类' }).click();
    await expect(window.getByText('本次任务进度')).toBeVisible();
    await expect(window.getByText('尚未开始分类')).toBeVisible();
    await expect(window.getByText('开始后会在这里显示关键阶段，同一阶段只保留一条实时状态。')).toBeVisible();
    await captureAppWindow(app, '/tmp/yinxu-classification-progress.png');
    await window.getByRole('button', { name: '设置' }).click();
    await expect(window.getByRole('heading', { name: 'AI 模型与 OCR 设置' })).toBeVisible();
    await expect(window.getByText('AI 分类模型')).toBeVisible();
    await window.waitForTimeout(250);
    await window.screenshot({ path: '/tmp/yinxu-copy-settings.png' });
    await window.getByRole('button', { name: '全局规则与记忆' }).click();
    await expect(window.getByRole('heading', { name: '全局规则与记忆' })).toBeVisible();
    await window.waitForTimeout(250);
    await window.screenshot({ path: '/tmp/yinxu-copy-memory.png' });

    await window.locator('.project-list-item', { hasText: '殷墟甲骨祭祀研究' }).click();
    await expect(window.getByText('补充材料 9 份')).toBeVisible();
    expect(await window.evaluate(async (id) => (await window.yinxu.openProject(id)).supplements.filter((item) => !item.removedAt).length, projectIds.first)).toBe(9);

    await window.getByRole('tab', { name: '论文资料' }).click();
    await expect(window.getByText('博士生反馈.txt')).toBeVisible();
    await window.waitForTimeout(250);
    await window.screenshot({ path: '/tmp/yinxu-p05-workspace.png' });
    const relevantConsoleIssues = consoleIssues.filter((issue) => !issue.includes('Electron Security Warning (Insecure Content-Security-Policy)'));
    expect(relevantConsoleIssues).toEqual([]);
  } finally {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('searches and deletes efficiently from a 100-project history', async () => {
  test.setTimeout(60_000);
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-large-history-e2e-'));
  const userData = join(fixtureRoot, 'user-data');
  const projectsRoot = join(userData, 'projects');
  await mkdir(projectsRoot, { recursive: true });

  await Promise.all(Array.from({ length: 100 }, async (_, index) => {
    const ordinal = String(index + 1).padStart(3, '0');
    const id = `paper-project-${ordinal}`;
    const rootPath = join(projectsRoot, id);
    const sourceFileName = `殷墟甲骨专题 ${ordinal}.pdf`;
    const timestamp = new Date(Date.UTC(2026, 6, 13, 0, index)).toISOString();
    await Promise.all([
      mkdir(join(rootPath, 'runs'), { recursive: true }),
      mkdir(join(rootPath, 'revisions'), { recursive: true }),
      mkdir(join(rootPath, 'supplements'), { recursive: true }),
      mkdir(join(rootPath, 'extracted'), { recursive: true })
    ]);
    await writeFile(join(rootPath, 'project.json'), JSON.stringify({
      schemaVersion: 2,
      id,
      rootPath,
      sourcePdfPath: join(rootPath, 'source', 'original.pdf'),
      sourceFileName,
      sourceSha256: `fixture-${ordinal}`,
      status: index === 99 ? 'processing' : index % 10 === 0 ? 'confirmed' : index % 9 === 0 ? 'failed' : 'imported',
      createdAt: timestamp,
      updatedAt: timestamp,
      knowledgeVersion: 'test',
      ...(index === 99 ? { activeRunId: 'interrupted-run' } : {})
    }, null, 2), 'utf8');
    if (index === 99) {
      await mkdir(join(rootPath, 'runs', 'interrupted-run'), { recursive: true });
      await writeFile(join(rootPath, 'runs', 'interrupted-run', 'run.json'), JSON.stringify({
        id: 'interrupted-run',
        projectId: id,
        status: 'running',
        startedAt: timestamp,
        previousProjectStatus: 'imported',
        agentProvider: 'moonshot',
        agentModel: 'kimi-k2.5',
        thinkingLevel: 'medium',
        knowledgeVersion: 'test',
        ocrModel: 'test-ocr',
        supplementIds: [],
        supplementHashes: [],
        sessionPath: join(rootPath, 'runs', 'interrupted-run', 'session')
      }, null, 2), 'utf8');
    }
  }));

  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  try {
    const window = await app.firstWindow();
    await expect(window.locator('.project-list-item')).toHaveCount(100);
    await expect(window.getByText('论文项目 100/100')).toBeVisible();

    const search = window.getByLabel('搜索论文项目');
    await search.fill('甲骨 073');
    await expect(window.locator('.project-list-item')).toHaveCount(1);
    await expect(window.getByText('论文项目 1/100')).toBeVisible();
    await expect(window.locator('.project-list-item', { hasText: '殷墟甲骨专题 073' })).toBeVisible();
    await window.locator('.project-list-item', { hasText: '殷墟甲骨专题 073' }).click();
    await expect(window.getByRole('heading', { name: '殷墟甲骨专题 073' })).toBeVisible();
    await window.waitForTimeout(250);
    await captureAppWindow(app, '/tmp/yinxu-large-history-search.png');

    await window.getByRole('button', { name: '删除项目：殷墟甲骨专题 073' }).click();
    await expect(window.getByText('删除这个论文项目？')).toBeVisible();
    await expect(window.getByText('“殷墟甲骨专题 073”的论文、分类任务和历史结果将从本机永久删除。')).toBeVisible();
    await window.waitForTimeout(250);
    await captureAppWindow(app, '/tmp/yinxu-project-delete-confirmation.png');
    await window.getByRole('button', { name: '确认删除' }).click();
    await expect(window.getByText('论文项目 0/99')).toBeVisible();
    await expect(window.getByRole('heading', { name: '殷墟甲骨专题 072' })).toBeVisible();
    await expect.poll(() => window.evaluate(async () => (await window.yinxu.listProjects()).length)).toBe(99);
    await expect(access(join(projectsRoot, 'paper-project-073'))).rejects.toMatchObject({ code: 'ENOENT' });

    await search.fill('');
    await expect(window.locator('.project-list-item')).toHaveCount(99);
    await window.getByText('全部状态', { exact: true }).click();
    await window.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: '已确认' }).click();
    await expect(window.locator('.project-list-item')).toHaveCount(10);
    await expect(window.getByText('论文项目 10/99')).toBeVisible();

    await window.getByLabel('按项目状态筛选').click();
    await window.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: '全部状态' }).click();
    await window.locator('.project-list-item', { hasText: '殷墟甲骨专题 100' }).click();
    await window.getByRole('tab', { name: '分类记录' }).click();
    await expect(window.getByText('已取消', { exact: true })).toBeVisible();
    await expect(window.getByText('上次分类因应用关闭或异常中断，已自动结束。可以重新开始分类。')).toBeVisible();
    await captureAppWindow(app, '/tmp/yinxu-interrupted-recovery.png');
  } finally {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('exports Excel through Save As and keeps the completed path visible', async () => {
  test.setTimeout(60_000);
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-export-dialog-e2e-'));
  const userData = join(fixtureRoot, 'user-data');
  const projectId = 'export-project';
  const projectRoot = join(userData, 'projects', projectId);
  const sourcePath = join(projectRoot, 'source', 'original.pdf');
  const revisionId = 'confirmed-revision';
  const resultPath = join(projectRoot, 'revisions', `${revisionId}.json`);
  const targetPath = join(fixtureRoot, '用户选择的分类结果.xlsx');
  const createdAt = new Date().toISOString();
  const result = makePaperResult({ reviewStatus: 'confirmed' });

  await Promise.all([
    mkdir(join(projectRoot, 'source'), { recursive: true }),
    mkdir(join(projectRoot, 'runs'), { recursive: true }),
    mkdir(join(projectRoot, 'revisions'), { recursive: true }),
    mkdir(join(projectRoot, 'supplements'), { recursive: true }),
    mkdir(join(projectRoot, 'extracted'), { recursive: true })
  ]);
  await createFixturePdf(sourcePath, 'Yinxu export fixture');
  await Promise.all([
    writeFile(join(projectRoot, 'project.json'), JSON.stringify({
      schemaVersion: 2,
      id: projectId,
      rootPath: projectRoot,
      sourcePdfPath: sourcePath,
      sourceFileName: '待导出论文.pdf',
      sourceSha256: 'export-fixture',
      status: 'confirmed',
      createdAt,
      updatedAt: createdAt,
      knowledgeVersion: 'test',
      activeRunId: 'completed-run',
      activeRevisionId: revisionId
    }, null, 2), 'utf8'),
    writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8'),
    writeFile(join(projectRoot, 'revisions', 'manifest.json'), JSON.stringify([{
      id: revisionId,
      projectId,
      runId: 'completed-run',
      kind: 'review',
      resultPath,
      summary: '人工确认结果',
      createdAt
    }], null, 2), 'utf8')
  ]);

  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  try {
    await app.evaluate(({ dialog }, savePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });
    }, targetPath);
    const window = await app.firstWindow();
    await window.getByRole('tab', { name: '人工复核' }).click();
    await window.getByRole('button', { name: '导出 Excel' }).click();
    await expect(window.getByRole('dialog', { name: 'Excel 导出完成' })).toBeVisible();
    await expect(window.getByText(targetPath)).toBeVisible();
    await expect(access(targetPath)).resolves.toBeUndefined();
    await captureAppWindow(app, '/tmp/yinxu-export-complete.png');
  } finally {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
