import { expect, test, _electron as electron, type Page } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@pdfme/pdf-lib';
import type { ClassificationRunRecord, CreateProjectInput, ProjectWorkspace } from '../src/shared/contracts';

const classificationAttemptTimeoutMs = 6 * 60_000;
const classificationCancellationTimeoutMs = 30_000;

const scannedPaperLines = [
  'Yinxu Oracle Bone Inscriptions',
  'A Contextual Study',
  'Author: Li Ming',
  'This paper studies divination inscriptions from Yinxu.',
  'The objects were excavated at Xiaotun in Anyang.',
  'The corpus records sacrifice, weather, and warfare.',
  'The main materials are cattle scapulae.',
  'Turtle plastrons are also included in the corpus.',
  'We compare charges and prognostications.',
  'Verification statements are examined separately.',
  'Crack notation helps reconstruct inscription groups.',
  'Archaeological find spots provide material context.',
  'Fragment joins are recorded with each transcription.',
  'The evidence concerns Shang royal divination.',
  'The primary subject is oracle bone inscriptions.',
  'Keywords: Yinxu, oracle bones, divination, Shang.'
];

const createScannedPaper = async (targetPath: string): Promise<void> => {
  const canvas = createCanvas(1200, 1680);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111111';
  scannedPaperLines.forEach((line, index) => {
    context.font = index < 2 ? 'bold 52px Arial' : '42px Arial';
    context.fillText(line, 58, 100 + index * 96);
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

const saveCloudSettings = async (
  window: Page,
  kimiApiKey: string,
  ocrApiKey: string
): Promise<{ hasAgentKey: boolean; hasOcrKey: boolean }> =>
  window.evaluate(async ({ kimiApiKey, ocrApiKey }) => {
    const current = await window.yinxu.getSettings();
    const saved = await window.yinxu.saveSettings({
      agent: {
        provider: 'kimi-coding',
        modelId: 'kimi-for-coding',
        thinkingLevel: 'medium'
      },
      ocr: {
        mode: 'cloud',
        baseUrl: 'https://paddleocr.aistudio-app.com',
        model: 'PaddleOCR-VL-1.6'
      },
      memory: current.memory,
      agentApiKey: kimiApiKey,
      ocrApiKey
    });
    return { hasAgentKey: saved.hasAgentKey, hasOcrKey: saved.hasOcrKey };
  }, { kimiApiKey, ocrApiKey });

const runClassificationWithRetry = async (
  window: Page,
  projectId: string,
  scenario: string
): Promise<{
  workspace: Awaited<ReturnType<typeof globalThis.window.yinxu.runClassification>>;
  attempts: number;
}> => {
  for (let attempts = 1; attempts <= 2; attempts += 1) {
    let attemptTimedOut = false;
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    const heartbeat = setInterval(() => {
      console.log(`[${scenario}] classification attempt ${attempts} is still running.`);
    }, 60_000);
    const classification = window.evaluate(
      async (id) => globalThis.window.yinxu.runClassification(id),
      projectId
    );
    const timeout = new Promise<never>((_resolve, reject) => {
      attemptTimer = setTimeout(() => {
        attemptTimedOut = true;
        reject(new Error(`Classification attempt exceeded ${classificationAttemptTimeoutMs}ms.`));
      }, classificationAttemptTimeoutMs);
    });

    try {
      return { workspace: await Promise.race([classification, timeout]), attempts };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (attemptTimedOut) {
        console.warn(`[${scenario}] classification attempt ${attempts} timed out; cancelling the run.`);
        const cancellation = window.evaluate(
          async (id) => globalThis.window.yinxu.cancelClassification(id),
          projectId
        );

        let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
        const cancellationTimeout = new Promise<never>((_resolve, reject) => {
          cancellationTimer = setTimeout(
            () => reject(new Error('Timed out while waiting for the cancelled classification run to stop.')),
            classificationCancellationTimeoutMs
          );
        });
        try {
          await Promise.race([
            Promise.all([cancellation, classification.catch(() => undefined)]),
            cancellationTimeout
          ]);
        } finally {
          if (cancellationTimer) clearTimeout(cancellationTimer);
        }
      }

      const retryable = attemptTimedOut || detail.includes('DraftValidationError');
      if (!retryable || attempts >= 2) throw error;
      console.warn(`[${scenario}] retrying classification after attempt ${attempts}.`);
    } finally {
      clearInterval(heartbeat);
      if (attemptTimer) clearTimeout(attemptTimer);
    }
  }

  throw new Error('Classification retry loop ended unexpectedly.');
};

const runClassificationScenario = async (options: {
  scenario: string;
  paperPath: string;
  kimiApiKey: string;
  ocrApiKey: string;
  supplementalFiles?: CreateProjectInput['supplementalFiles'];
  supplementalNotes?: CreateProjectInput['supplementalNotes'];
  verifyPreparation: (preparation: {
    ocrApplied: boolean;
    pagesNeedingOcr: number[];
    textReport?: {
      ocrMode?: 'cloud';
      ocrProvider?: string;
      ocrModel?: string;
      ocrPromptProfile?: string;
      ocrAppliedPages: number[];
      cloudAttemptedPages?: number[];
      pages: Array<{ source: 'embedded' | 'ocr' | 'mixed'; characterCount: number; ocrAttempts?: number }>;
    };
  }) => void;
  verifySupplements?: (created: ProjectWorkspace, classified: ProjectWorkspace, completedRun: ClassificationRunRecord) => Promise<void> | void;
}): Promise<{ projectId: string; workbookPath: string; workspace: ProjectWorkspace; window: Page; close: () => Promise<void> }> => {
  const executablePath = process.env.YINXU_SMOKE_EXECUTABLE!;
  const fixtureRoot = await mkdtemp(join(tmpdir(), `yinxu-${options.scenario}-smoke-`));
  const userData = join(fixtureRoot, 'user-data');
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${userData}`] });

  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('殷墟论文分类助手');
    await expect(window.locator('vite-error-overlay')).toHaveCount(0);

    const exportPaths = [
      join(fixtureRoot, `${options.scenario}-classification.xlsx`),
      join(fixtureRoot, `${options.scenario}-classification-second.xlsx`)
    ];
    await app.evaluate(({ dialog }, paths) => {
      let nextPath = 0;
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: paths[Math.min(nextPath++, paths.length - 1)]
      });
    }, exportPaths);

    console.log(`[${options.scenario}] configuring providers.`);
    const saved = await saveCloudSettings(window, options.kimiApiKey, options.ocrApiKey);
    expect(saved.hasAgentKey).toBe(true);
    expect(saved.hasOcrKey).toBe(true);

    console.log(`[${options.scenario}] importing and preparing the paper.`);
    const created = await window.evaluate(
      async (input) => globalThis.window.yinxu.createProject(input),
      {
        sourcePdfPath: options.paperPath,
        supplementalFiles: options.supplementalFiles ?? [],
        supplementalNotes: options.supplementalNotes ?? []
      }
    );
    console.log(JSON.stringify({
      stage: 'ocr-only',
      ocrMode: created.preparation.textReport?.ocrMode,
      ocrProvider: created.preparation.textReport?.ocrProvider,
      ocrModel: created.preparation.textReport?.ocrModel,
      ocrPromptProfile: created.preparation.textReport?.ocrPromptProfile,
      cloudAttemptedPages: created.preparation.textReport?.cloudAttemptedPages ?? [],
      ocrAppliedPages: created.preparation.textReport?.ocrAppliedPages ?? [],
      pageSources: created.preparation.textReport?.pages.map((page) => page.source) ?? [],
      characterCounts: created.preparation.textReport?.pages.map((page) => page.characterCount) ?? []
    }));
    options.verifyPreparation(created.preparation);
    console.log(`[${options.scenario}] paper prepared; starting classification.`);
    const classification = await runClassificationWithRetry(window, created.project.id, options.scenario);
    const classified = classification.workspace;
    if (!classified.result) throw new Error('Classification completed without a structured result.');
    const completedRun = classified.runs.find((run) => run.status === 'completed');
    if (!completedRun) throw new Error('No completed classification run was recorded.');
    await options.verifySupplements?.(created, classified, completedRun);
    console.log(`[${options.scenario}] classification completed; exporting the workbook.`);
    const workbookPath = await window.evaluate(
      async (projectId) => globalThis.window.yinxu.exportWorkbook(projectId),
      created.project.id
    );
    if (!workbookPath) throw new Error('The workbook save dialog did not return a target path.');
    const outcome = {
      projectId: created.project.id,
      preparation: created.preparation,
      provider: completedRun.agentProvider,
      model: completedRun.agentModel,
      primaryCategoryCode: classified.result.primaryCategoryCode,
      candidateCount: classified.result.candidates.length,
      evidenceCount: classified.result.evidence.length,
      classificationAttempts: classification.attempts,
      workbookPath
    };

    console.log(JSON.stringify({
      ocrMode: outcome.preparation.textReport?.ocrMode,
      ocrProvider: outcome.preparation.textReport?.ocrProvider,
      ocrModel: outcome.preparation.textReport?.ocrModel,
      ocrPromptProfile: outcome.preparation.textReport?.ocrPromptProfile,
      pagesNeedingReview: outcome.preparation.pagesNeedingOcr,
      cloudAttemptedPages: outcome.preparation.textReport?.cloudAttemptedPages ?? [],
      ocrAppliedPages: outcome.preparation.textReport?.ocrAppliedPages ?? [],
      pageSources: outcome.preparation.textReport?.pages.map((page) => page.source) ?? [],
      primaryCategoryCode: outcome.primaryCategoryCode,
      evidenceCount: outcome.evidenceCount,
      classificationAttempts: outcome.classificationAttempts
    }));

    expect(outcome.provider).toBe('kimi-coding');
    expect(outcome.model).toBe('kimi-for-coding');
    expect(outcome.primaryCategoryCode).not.toBe('');
    expect(outcome.candidateCount).toBeGreaterThan(0);
    expect(outcome.evidenceCount).toBeGreaterThan(0);
    await access(outcome.workbookPath);

    return {
      projectId: outcome.projectId,
      workbookPath: outcome.workbookPath,
      workspace: classified,
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
  expect(process.env.PADDLEOCR_API_KEY, 'PADDLEOCR_API_KEY is required').toBeTruthy();
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

test('official PaddleOCR cloud pipeline processes the paper and supplementary materials before classification', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-paddle-cloud-paper-'));
  const paperPath = join(fixtureRoot, 'scanned-yinxu-paper.pdf');
  const supplementalPdfPath = join(fixtureRoot, 'scanned-yinxu-appendix.pdf');
  const supplementalTextPath = join(fixtureRoot, 'expert-feedback.txt');
  await Promise.all([
    createScannedPaper(paperPath),
    createScannedPaper(supplementalPdfPath),
    writeFile(supplementalTextPath, '专家意见：作者信息应以论文署名与补充材料为准，不应根据固定名单推断机构身份。', 'utf8')
  ]);
  try {
    const scenario = await runClassificationScenario({
      scenario: 'paddle-cloud',
      paperPath,
      kimiApiKey: process.env.KIMI_API_KEY!,
      ocrApiKey: process.env.PADDLEOCR_API_KEY!,
      supplementalFiles: [
        { path: supplementalTextPath, kind: 'expert_note', sourceLabel: '测试专家意见' },
        { path: supplementalPdfPath, kind: 'appendix', sourceLabel: '测试论文附录' }
      ],
      supplementalNotes: [{
        title: '测试手工补充说明',
        content: '本条说明用于验证补充材料会随本次分类运行生成只读快照。',
        kind: 'other',
        sourceLabel: 'Windows 冒烟测试'
      }],
      verifyPreparation: (preparation) => {
        expect(preparation.textReport?.ocrMode).toBe('cloud');
        expect(preparation.textReport?.ocrProvider).toBe('paddleocr-official');
        expect(preparation.textReport?.ocrModel).toBe('PaddleOCR-VL-1.6');
        expect(preparation.textReport?.ocrPromptProfile).toBe('paddleocr-official-document-parsing-v1.6');
        expect(preparation.textReport?.cloudAttemptedPages).toEqual([1]);
        expect(preparation.textReport?.ocrAppliedPages).toEqual([1]);
        expect(preparation.ocrApplied).toBe(true);
        expect(preparation.textReport?.pages[0]?.source).toBe('ocr');
        expect(preparation.textReport?.pages[0]?.characterCount).toBeGreaterThan(40);
        expect(preparation.textReport?.pages[0]?.ocrAttempts).toBeGreaterThanOrEqual(1);
      },
      verifySupplements: async (created, _classified, completedRun) => {
        expect(created.supplements).toHaveLength(3);
        expect(created.supplements.map((material) => material.sourceType).sort()).toEqual(['file', 'file', 'note']);
        const pdfSupplement = created.supplements.find((material) => material.originalFileName === 'scanned-yinxu-appendix.pdf');
        expect(pdfSupplement?.status).not.toBe('failed');
        expect(completedRun.supplementIds).toHaveLength(3);
        expect(completedRun.supplementHashes).toHaveLength(3);
        expect(completedRun.supplementContextPath).toBeTruthy();
        const context = await readFile(completedRun.supplementContextPath!, 'utf8');
        expect(context).toContain('专家意见：作者信息应以论文署名与补充材料为准');
        expect(context).toContain('本条说明用于验证补充材料会随本次分类运行生成只读快照');
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
