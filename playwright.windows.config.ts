import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright',
  testMatch: 'windows-smoke.spec.ts',
  timeout: 12 * 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  use: {
    // This test receives production credentials. Never persist a trace, video,
    // screenshot, or user-data directory that could contain them.
    trace: 'off',
    video: 'off',
    screenshot: 'off'
  }
});
