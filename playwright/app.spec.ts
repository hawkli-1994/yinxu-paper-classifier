import { test, expect, _electron as electron } from '@playwright/test';

test('renders the settings workflow in the packaged Electron renderer', async () => {
  test.setTimeout(45_000);
  const app = await electron.launch({ args: ['.'] });
  try {
    const window = await app.firstWindow();
    const consoleIssues: string[] = [];
    window.on('console', (entry) => {
      if (entry.type() === 'error' || entry.type() === 'warning') consoleIssues.push(entry.text());
    });

    await expect(window).toHaveTitle('殷墟论文分类助手');
    await expect(window.locator('vite-error-overlay')).toHaveCount(0);
    await expect(window.getByRole('heading', { name: '模型与 OCR 设置' })).toBeVisible();
    await expect(window.getByText('北京容芯致远科技有限公司')).toBeVisible();
    await expect(window.getByRole('button', { name: 'PaddleOCR-VL-1.5（自动转 PNG）' })).toBeVisible();
    await expect(window.getByRole('button', { name: '注册 / 获取 Key' })).toBeVisible();
    await expect(window.getByText('Pi Agent 模型')).toBeVisible();
    await expect(window.getByText('个人分类偏好')).toBeVisible();
    await expect(window.getByLabel('个人规则提示词')).toBeVisible();
    await expect(window.getByText('模型厂商', { exact: true })).toBeVisible();
    const provider = window.getByLabel('模型厂商');
    await provider.click();
    await expect(window.getByText('常用云端', { exact: true })).toBeVisible();
    await provider.press('Enter');
    await expect(window.getByText('适合中文论文阅读、归纳与结构化输出的 Pi 内置 Provider。')).toBeVisible();
    await expect(window.getByRole('button', { name: '获取 DeepSeek API Key' })).toBeVisible();
    await window.getByRole('button', { name: 'deepseek-v4-pro' }).click();
    await expect(window.getByRole('textbox', { name: /模型 ID/ })).toHaveValue('deepseek-v4-pro');

    await provider.click();
    await provider.fill('Kimi Coding Plan');
    await provider.press('Enter');
    await expect(window.getByText('专用端点：https://api.kimi.com/coding/；不会使用 Moonshot 按量余额。')).toBeVisible();
    await window.getByRole('button', { name: 'kimi-for-coding' }).click();
    await expect(window.getByRole('textbox', { name: /模型 ID/ })).toHaveValue('kimi-for-coding');

    await provider.click();
    await provider.fill('自定义兼容端点');
    await provider.press('Enter');
    await expect(window.getByLabel('Base URL')).toBeVisible();

    const importNavigation = window.getByRole('menuitem', { name: '导入论文' });
    await expect(importNavigation).toHaveCount(1);
    await importNavigation.click();
    await expect(window.getByRole('heading', { name: '导入论文' })).toBeVisible();
    await expect(window.getByRole('button', { name: '选择 PDF' })).toBeVisible();

    await window.getByRole('menuitem', { name: '规则与记忆' }).click();
    await expect(window.getByRole('heading', { name: '规则与记忆' })).toBeVisible();
    await expect(window.getByText('新建个人规则')).toBeVisible();
    await expect(window.getByText('待确认候选（0）')).toBeVisible();

    const sidebar = window.locator('.academic-sider');
    const content = window.locator('.academic-content');
    const initialSidebarTop = await sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().top));
    await content.hover();
    await window.mouse.wheel(0, 900);
    await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(initialSidebarTop);
    expect(await window.evaluate(() => document.scrollingElement?.scrollTop ?? -1)).toBe(0);
    expect(await sidebar.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
    const relevantConsoleIssues = consoleIssues.filter((issue) => !issue.includes('Electron Security Warning (Insecure Content-Security-Policy)'));
    expect(relevantConsoleIssues).toEqual([]);
  } finally {
    await app.close();
  }
});
