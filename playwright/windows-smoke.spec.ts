import { expect, test, _electron as electron, type Page } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';

type OcrMode = 'auto' | 'local' | 'cloud';

const paperLines = [
  'Yinxu Oracle Bone Divination Inscriptions: A Contextual Study',
  'Author: Li Ming',
  'Abstract',
  'This paper studies oracle bone divination inscriptions excavated at Xiaotun, Anyang.',
  'The corpus contains inscriptions concerning royal sacrifice, weather, hunting, and warfare.',
  'Our primary materials are inscribed cattle scapulae and turtle plastrons from Yinxu.',
  'The analysis compares charge, prognostication, verification, and crack notation in each text.',
  'Archaeological context and joins between fragments are used to reconstruct inscription groups.',
  'Section 1. Materials and archaeological context',
  'All examples discussed here come from scientifically excavated Yinxu oracle-bone deposits.',
  'The find spots, fragment numbers, transcription, and physical joins are recorded together.',
  'Section 2. Divination formulae',
  'Recurring formulae reveal how Shang royal diviners organized sacrifice and military inquiry.',
  'The evidence supports classifying this study primarily as research on oracle bone inscriptions.',
  'Conclusion',
  'Oracle-bone text, material form, and excavation context must be interpreted as one evidence set.',
  'Keywords: Yinxu; oracle bone inscriptions; divination; Xiaotun; Shang dynasty.'
];

const createEmbeddedTextPaper = async (targetPath: string): Promise<void> => {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  paperLines.forEach((line, index) => {
    page.drawText(line, {
      x: 42,
      y: 792 - index * 35,
      size: index === 0 ? 15 : 11,
      font
    });
  });
  await writeFile(targetPath, await document.save());
};

const createScannedPaper = async (targetPath: string): Promise<void> => {
  const canvas = createCanvas(1200, 1680);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111111';
  paperLines.forEach((line, index) => {
    context.font = index === 0 ? 'bold 31px Arial' : '25px Arial';
    context.fillText(line, 70, 110 + index * 82);
  });

  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const image = await document.embedPng(canvas.toBuffer('image/png'));
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  await writeFile(targetPath, await document.save());
};

const launchSecondInstance = async (executablePath: string, userData: string): Promise<number | null> =>
  new Promise((resolve, reject) => {
    const process = spawn(executablePath, [`--user-data-dir=${userData}`], {
      stdio: 'ignore',
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      process.kill();
      reject(new Error('A second application instance remained active instead of exiting.'));
    }, 15_000);
    process.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

const saveModeSettings = async (
  window: Page,
  mode: OcrMode,
  kimiApiKey: string,
  ocrApiKey?: string
): Promise<{ hasAgentKey: boolean; hasOcrKey: boolean }> =>
  window.evaluate(async ({ mode, kimiApiKey, ocrApiKey }) => {
    const current = await window.yinxu.getSettings();
    const saved = await window.yinxu.saveSettings({
      agent: {
        provider: 'kimi-coding',
        modelId: 'kimi-for-coding',
        thinkingLevel: 'medium'
      },
      ocr: {
        mode,
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'PaddlePaddle/PaddleOCR-VL-1.5'
      },
      memory: current.memory,
      agentApiKey: kimiApiKey,
      ocrApiKey
    });
    return { hasAgentKey: saved.hasAgentKey, hasOcrKey: saved.hasOcrKey };
  }, { mode, kimiApiKey, ocrApiKey });

const runClassificationScenario = async (options: {
  mode: OcrMode;
  paperPath: string;
  kimiApiKey: string;
  ocrApiKey?: string;
  verifyPreparation: (preparation: {
    ocrApplied: boolean;
    pagesNeedingOcr: number[];
    textReport?: {
      ocrMode?: OcrMode;
      ocrAppliedPages: number[];
      cloudAttemptedPages?: number[];
      localFallbackPages?: number[];
      pages: Array<{ source: 'embedded' | 'ocr' | 'mixed'; characterCount: number }>;
    };
  }) => void;
}): Promise<{ projectId: string; workbookPath: string; window: Page; close: () => Promise<void> }> => {
  const executablePath = process.env.YINXU_SMOKE_EXECUTABLE!;
  const fixtureRoot = await mkdtemp(join(tmpdir(), `yinxu-${options.mode}-smoke-`));
  const userData = join(fixtureRoot, 'user-data');
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${userData}`] });

  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('殷墟论文分类助手');
    await expect(window.locator('vite-error-overlay')).toHaveCount(0);

    const saved = await saveModeSettings(window, options.mode, options.kimiApiKey, options.ocrApiKey);
    expect(saved.hasAgentKey).toBe(true);
    expect(saved.hasOcrKey).toBe(Boolean(options.ocrApiKey));

    const outcome = await window.evaluate(async (paperPath) => {
      const created = await window.yinxu.createProject({
        sourcePdfPath: paperPath,
        supplementalFiles: [],
        supplementalNotes: []
      });
      const classified = await window.yinxu.runClassification(created.project.id);
      if (!classified.result) throw new Error('Classification completed without a structured result.');
      const completedRun = classified.runs.find((run) => run.status === 'completed');
      if (!completedRun) throw new Error('No completed classification run was recorded.');
      const workbookPath = await window.yinxu.exportWorkbook(created.project.id);
      return {
        projectId: created.project.id,
        preparation: created.preparation,
        provider: completedRun.agentProvider,
        model: completedRun.agentModel,
        primaryCategoryCode: classified.result.primaryCategoryCode,
        candidateCount: classified.result.candidates.length,
        evidenceCount: classified.result.evidence.length,
        workbookPath
      };
    }, options.paperPath);

    options.verifyPreparation(outcome.preparation);
    expect(outcome.provider).toBe('kimi-coding');
    expect(outcome.model).toBe('kimi-for-coding');
    expect(outcome.primaryCategoryCode).not.toBe('');
    expect(outcome.candidateCount).toBeGreaterThan(0);
    expect(outcome.evidenceCount).toBeGreaterThan(0);
    await access(outcome.workbookPath);

    return {
      projectId: outcome.projectId,
      workbookPath: outcome.workbookPath,
      window,
      close: async () => {
        await app.close();
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(process.platform !== 'win32', 'This smoke test exercises the installed Windows application.');
  expect(process.env.YINXU_SMOKE_EXECUTABLE, 'YINXU_SMOKE_EXECUTABLE must point to the installed application').toBeTruthy();
  expect(process.env.KIMI_API_KEY, 'KIMI_API_KEY is required').toBeTruthy();
  expect(process.env.OCR_API_KEY, 'OCR_API_KEY is required').toBeTruthy();
});

test('installed app enforces a single writable instance', async () => {
  const executablePath = process.env.YINXU_SMOKE_EXECUTABLE!;
  await access(executablePath);
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-single-instance-smoke-'));
  const userData = join(fixtureRoot, 'user-data');
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${userData}`] });
  try {
    await app.firstWindow();
    expect(await launchSecondInstance(executablePath, userData)).toBe(0);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('local mode uses only on-device PDF parsing and completes classification', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-local-paper-'));
  const paperPath = join(fixtureRoot, 'embedded-yinxu-paper.pdf');
  await createEmbeddedTextPaper(paperPath);
  try {
    const scenario = await runClassificationScenario({
      mode: 'local',
      paperPath,
      kimiApiKey: process.env.KIMI_API_KEY!,
      verifyPreparation: (preparation) => {
        expect(preparation.textReport?.ocrMode).toBe('local');
        expect(preparation.ocrApplied).toBe(false);
        expect(preparation.textReport?.cloudAttemptedPages ?? []).toEqual([]);
        expect(preparation.textReport?.ocrAppliedPages ?? []).toEqual([]);
        expect(preparation.textReport?.localFallbackPages ?? []).toEqual([]);
        expect(preparation.textReport?.pages[0]?.source).toBe('embedded');
        expect(preparation.textReport?.pages[0]?.characterCount).toBeGreaterThan(40);
      }
    });
    await scenario.close();
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('cloud mode forces every page through SiliconFlow and completes classification', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-cloud-paper-'));
  const paperPath = join(fixtureRoot, 'embedded-yinxu-paper.pdf');
  await createEmbeddedTextPaper(paperPath);
  try {
    const scenario = await runClassificationScenario({
      mode: 'cloud',
      paperPath,
      kimiApiKey: process.env.KIMI_API_KEY!,
      ocrApiKey: process.env.OCR_API_KEY!,
      verifyPreparation: (preparation) => {
        expect(preparation.textReport?.ocrMode).toBe('cloud');
        expect(preparation.ocrApplied).toBe(true);
        expect(preparation.textReport?.cloudAttemptedPages).toEqual([1]);
        expect(preparation.textReport?.ocrAppliedPages).toEqual([1]);
        expect(preparation.textReport?.localFallbackPages).toEqual([]);
        expect(preparation.textReport?.pages[0]?.source).toBe('ocr');
      }
    });

    const secondWorkbookPath = await scenario.window.evaluate(
      async (projectId) => window.yinxu.exportWorkbook(projectId),
      scenario.projectId
    );
    expect(secondWorkbookPath).not.toBe(scenario.workbookPath);
    await access(secondWorkbookPath);
    await scenario.close();
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('automatic mode detects a scanned page, prefers cloud OCR, and completes classification', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-auto-paper-'));
  const paperPath = join(fixtureRoot, 'scanned-yinxu-paper.pdf');
  await createScannedPaper(paperPath);
  try {
    const scenario = await runClassificationScenario({
      mode: 'auto',
      paperPath,
      kimiApiKey: process.env.KIMI_API_KEY!,
      ocrApiKey: process.env.OCR_API_KEY!,
      verifyPreparation: (preparation) => {
        expect(preparation.textReport?.ocrMode).toBe('auto');
        // The workspace exposes unresolved pages after processing. A successful
        // automatic cloud pass therefore clears this list; cloudAttemptedPages
        // below proves that the scanned page was detected and submitted.
        expect(preparation.pagesNeedingOcr).toEqual([]);
        expect(preparation.ocrApplied).toBe(true);
        expect(preparation.textReport?.cloudAttemptedPages).toEqual([1]);
        expect(preparation.textReport?.ocrAppliedPages).toEqual([1]);
        expect(preparation.textReport?.localFallbackPages).toEqual([]);
        expect(preparation.textReport?.pages[0]?.source).toBe('ocr');
        expect(preparation.textReport?.pages[0]?.characterCount).toBeGreaterThan(40);
      }
    });
    await scenario.close();
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
