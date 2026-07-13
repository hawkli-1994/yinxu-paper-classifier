import { expect, test, _electron as electron } from '@playwright/test';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';

const createSmokePaper = async (targetPath: string): Promise<void> => {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = [
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
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 42,
      y: 792 - index * 35,
      size: index === 0 ? 15 : 11,
      font
    });
  });
  await writeFile(targetPath, await document.save());
};

test('installed Windows app completes cloud OCR, Kimi classification, and export', async () => {
  test.skip(process.platform !== 'win32', 'This smoke test exercises the installed Windows application.');

  const executablePath = process.env.YINXU_SMOKE_EXECUTABLE;
  const kimiApiKey = process.env.KIMI_API_KEY;
  const ocrApiKey = process.env.OCR_API_KEY;
  expect(executablePath, 'YINXU_SMOKE_EXECUTABLE must point to the installed application').toBeTruthy();
  expect(kimiApiKey, 'KIMI_API_KEY is required').toBeTruthy();
  expect(ocrApiKey, 'OCR_API_KEY is required').toBeTruthy();
  await access(executablePath!);

  const fixtureRoot = await mkdtemp(join(tmpdir(), 'yinxu-windows-smoke-'));
  const userData = join(fixtureRoot, 'user-data');
  const paperPath = join(fixtureRoot, 'yinxu-oracle-bone-study.pdf');
  await createSmokePaper(paperPath);

  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`]
  });

  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('殷墟论文分类助手');
    await expect(window.locator('vite-error-overlay')).toHaveCount(0);

    const outcome = await window.evaluate(async ({ paperPath, kimiApiKey, ocrApiKey }) => {
      const current = await window.yinxu.getSettings();
      const saved = await window.yinxu.saveSettings({
        agent: {
          provider: 'kimi-coding',
          modelId: 'kimi-for-coding',
          thinkingLevel: 'medium'
        },
        ocr: {
          mode: 'cloud',
          baseUrl: 'https://api.siliconflow.cn/v1',
          model: 'PaddlePaddle/PaddleOCR-VL-1.5'
        },
        memory: current.memory,
        agentApiKey: kimiApiKey,
        ocrApiKey
      });
      if (!saved.hasAgentKey || !saved.hasOcrKey) throw new Error('Windows credential storage did not retain both API keys.');

      const created = await window.yinxu.createProject({
        sourcePdfPath: paperPath,
        supplementalFiles: [],
        supplementalNotes: []
      });
      if (!created.preparation.ocrApplied) throw new Error('Cloud OCR was required but was not applied.');
      if (created.preparation.textReport?.ocrMode !== 'cloud') throw new Error('Project did not retain the forced cloud OCR policy.');
      if (!created.preparation.textReport?.cloudAttemptedPages?.includes(1)) throw new Error('Cloud OCR did not attempt page 1.');
      if (created.preparation.textReport?.localFallbackPages?.length) throw new Error('Forced cloud OCR unexpectedly used a local fallback.');

      const classified = await window.yinxu.runClassification(created.project.id);
      if (!classified.result) throw new Error('Classification completed without a structured result.');
      const completedRun = classified.runs.find((run) => run.status === 'completed');
      if (!completedRun) throw new Error('No completed classification run was recorded.');
      const workbookPath = await window.yinxu.exportWorkbook(created.project.id);

      return {
        projectId: created.project.id,
        ocrAppliedPages: created.preparation.textReport?.ocrAppliedPages ?? [],
        provider: completedRun.agentProvider,
        model: completedRun.agentModel,
        primaryCategoryCode: classified.result.primaryCategoryCode,
        candidateCount: classified.result.candidates.length,
        evidenceCount: classified.result.evidence.length,
        workbookPath
      };
    }, { paperPath, kimiApiKey: kimiApiKey!, ocrApiKey: ocrApiKey! });

    expect(outcome.ocrAppliedPages).toContain(1);
    expect(outcome.provider).toBe('kimi-coding');
    expect(outcome.model).toBe('kimi-for-coding');
    expect(outcome.primaryCategoryCode).not.toBe('');
    expect(outcome.candidateCount).toBeGreaterThan(0);
    expect(outcome.evidenceCount).toBeGreaterThan(0);
    await access(outcome.workbookPath);
  } finally {
    await app.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
