import { expect, test, _electron as electron } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixturePdf } from '../tests/fixtures/pdf';

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
    await expect(window.getByRole('button', { name: '新建第一个论文项目' })).toBeVisible();
    await window.getByRole('button', { name: '新建第一个论文项目' }).click();
    await expect(window.getByRole('dialog', { name: '新建论文项目' })).toBeVisible();
    await expect(window.getByRole('button', { name: '选择主论文' })).toBeVisible();
    await expect(window.getByRole('button', { name: '选择补充材料' })).toBeVisible();
    await window.getByRole('button', { name: '同时添加手工补充说明' }).click();
    await expect(window.getByLabel('补充内容')).toBeVisible();
    await window.getByRole('button', { name: '取消' }).click();

    const projectIds = await window.evaluate(async ({ firstPaper, secondPaper, expertFeedback }) => {
      const first = await window.yinxu.createProject({
        sourcePdfPath: firstPaper,
        supplementalFiles: [{ path: expertFeedback, kind: 'expert_note', sourceLabel: '博士生反馈' }],
        supplementalNotes: Array.from({ length: 8 }, (_, index) => ({
          title: `项目说明 ${index + 1}`,
          content: `这是用于当前论文项目的第 ${index + 1} 条补充材料。`,
          kind: index === 0 ? 'author_metadata' : 'other',
          sourceLabel: '用户手工补充'
        }))
      });
      const second = await window.yinxu.createProject({ sourcePdfPath: secondPaper, supplementalFiles: [], supplementalNotes: [] });
      return { first: first.project.id, second: second.project.id };
    }, { firstPaper, secondPaper, expertFeedback });

    await window.reload();
    await expect(window.locator('.project-list-item')).toHaveCount(2);
    await expect(window.getByRole('heading', { name: '殷墟青铜礼器研究' })).toBeVisible();
    await expect(window.getByRole('tab', { name: '资料' })).toBeVisible();

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

    await window.getByRole('tab', { name: '历史版本' }).click();
    await expect(window.getByText('尚无分类运行')).toBeVisible();
    await expect(window.getByText('尚无结果版本')).toBeVisible();
    await window.getByRole('button', { name: '设置' }).click();
    await expect(window.getByRole('heading', { name: '模型与 OCR 设置' })).toBeVisible();
    await expect(window.getByText('Pi Agent 模型')).toBeVisible();
    await window.getByRole('button', { name: '规则与记忆' }).click();
    await expect(window.getByRole('heading', { name: '规则与记忆' })).toBeVisible();

    await window.locator('.project-list-item', { hasText: '殷墟甲骨祭祀研究' }).click();
    await expect(window.getByText('补充材料 9 份')).toBeVisible();
    expect(await window.evaluate(async (id) => (await window.yinxu.openProject(id)).supplements.filter((item) => !item.removedAt).length, projectIds.first)).toBe(9);

    await window.getByRole('tab', { name: '资料' }).click();
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
