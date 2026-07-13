import ExcelJS from 'exceljs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportWorkbook } from '../../src/main/export-service';
import { createProject } from '../../src/main/project-service';
import { PAPER_FIELD_NAMES } from '../../src/shared/contracts';
import { makePaperResult } from '../fixtures/paper-result';
import { createFixturePdf } from '../fixtures/pdf';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Excel export', () => {
  it('exports the exact A-Z column order and all required worksheets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-export-'));
    roots.push(root);
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '1.0.0');

    const output = await exportWorkbook(project, makePaperResult());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(output);
    const classification = workbook.getWorksheet('论文分类结果');
    const notes = workbook.getWorksheet('处理说明');
    const images = workbook.getWorksheet('图像素材库');

    const headerValues = classification?.getRow(1).values;
    expect(Array.isArray(headerValues) ? headerValues.slice(1) : []).toEqual(PAPER_FIELD_NAMES);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['论文分类结果', '三级分类目录', '处理说明', '字段评估', '图像素材库']);
    expect(images?.getRow(1).values).toEqual([
      undefined,
      '图像编号', '来源论文编号', '原图号', '图像类型', '描绘对象', '视角信息', '是否带比例尺', '几何可复用等级', '纹理可复用等级',
      'AI训练可用性', 'ControlNet适配类型', '图像分辨率', '背景纯净度', '纹饰提取价值', '学术可信度', '版权来源', '文件路径', '备注'
    ]);
    const noteLabels = new Set(Array.from({ length: notes?.rowCount ?? 0 }, (_, index) => notes?.getCell(index + 1, 1).value));
    for (const label of ['OCR质量', '候选分类', '互见分类', '规则冲突', '人工修改记录']) expect(noteLabels).toContain(label);
  });

  it('creates a new file for every export instead of overwriting an Excel-locked file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-export-locked-'));
    roots.push(root);
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '1.0.0');
    const result = makePaperResult();

    const first = await exportWorkbook(project, result);
    const second = await exportWorkbook(project, result);

    expect(second).not.toBe(first);
    await expect(access(first)).resolves.toBeUndefined();
    await expect(access(second)).resolves.toBeUndefined();
  });
});
