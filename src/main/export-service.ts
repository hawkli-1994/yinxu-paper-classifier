import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PAPER_FIELD_NAMES, type PaperResult, type ProjectRecord } from '../shared/contracts';
import { listCategories } from '../shared/taxonomy';

const imageHeaders = ['图像编号', '来源论文编号', '原图号', '图像类型', '描绘对象', '视角信息', '是否带比例尺', '几何可复用等级', '纹理可复用等级', 'AI训练可用性', 'ControlNet适配类型', '图像分辨率', '背景纯净度', '纹饰提取价值', '学术可信度', '版权来源', '文件路径', '备注'];

const spreadsheetColumn = (index: number): string => {
  let value = index;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const exportFileName = (project: ProjectRecord, result: PaperResult): string => {
  const label = `${result.fields.编号 || project.id}_${result.fields.作者 || '未署名'}_${result.fields.题名 || '未命名论文'}`;
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '');
  const uniqueSuffix = randomUUID().slice(0, 8);
  return `${label.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}_${timestamp}_${uniqueSuffix}.xlsx`;
};

export const getWorkbookExportFileName = (project: ProjectRecord, result: PaperResult): string => exportFileName(project, result);

export const exportWorkbook = async (project: ProjectRecord, result: PaperResult, targetPath?: string): Promise<string> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '殷墟论文分类助手';
  workbook.created = new Date();

  const classification = workbook.addWorksheet('论文分类结果', { views: [{ state: 'frozen', ySplit: 1 }] });
  classification.addRow([...PAPER_FIELD_NAMES]);
  classification.addRow(PAPER_FIELD_NAMES.map((name) => result.fields[name]));
  classification.autoFilter = { from: 'A1', to: `${spreadsheetColumn(PAPER_FIELD_NAMES.length)}2` };
  classification.columns.forEach((column, index) => {
    column.width = index === 2 ? 42 : 20;
  });
  classification.getRow(1).font = { bold: true };

  const directory = workbook.addWorksheet('三级分类目录', { views: [{ state: 'frozen', ySplit: 1 }] });
  directory.addRow(['一级分类', '二级分类', '三级细分类']);
  for (const node of listCategories().filter((item) => item.level === 3)) {
    const path = (() => {
      const parents = listCategories();
      const second = parents.find((item) => item.code === node.parentCode);
      const first = parents.find((item) => item.code === second?.parentCode);
      return [first, second, node];
    })();
    directory.addRow(path.map((item) => (item ? `${item.code} ${item.label}` : '')));
  }
  directory.getRow(1).font = { bold: true };
  directory.columns.forEach((column) => {
    column.width = 42;
  });

  const notes = workbook.addWorksheet('处理说明');
  notes.addRows([
    ['项目编号', project.id],
    ['知识包版本', project.knowledgeVersion],
    ['AI 模型服务', project.agentProvider ?? '未记录'],
    ['Agent 模型', project.agentModel ?? '未记录'],
    ['思考强度', project.thinkingLevel ?? '未记录'],
    ['OCR 模型', project.ocrModel ?? '未记录'],
    ['OCR质量', result.ocrQuality],
    ['主分类', result.primaryCategoryCode],
    ['互见分类', result.crossReferenceCategoryCodes.join('、') || '无'],
    ['候选分类', result.candidates.map((candidate) => `${candidate.code} ${Math.round(candidate.score * 100)}%：${candidate.reason}`).join('\n')],
    ['规则冲突', result.ruleConflicts.join('；') || '无'],
    ['校验问题', result.validationIssues.map((issue) => issue.message).join('\n') || '无'],
    ['置信度', result.confidence],
    ['复核状态', result.reviewStatus],
    ['分类证据', result.evidence.map((item) => `第${item.page}页：${item.quote}\n理由：${item.reason}`).join('\n\n')],
    ['人工修改记录', result.reviewHistory.map((entry) => `${entry.at} ${entry.summary}`).join('\n') || '无'],
    ['说明', 'AI 结果需由使用者复核。']
  ]);
  notes.getColumn(1).width = 18;
  notes.getColumn(2).width = 80;
  notes.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const assessments = workbook.addWorksheet('字段评估', { views: [{ state: 'frozen', ySplit: 1 }] });
  assessments.addRow(['字段', '当前值', '分数', '等级', '判断理由', '字段证据']);
  for (const name of PAPER_FIELD_NAMES) {
    const assessment = result.fieldAssessments[name] ?? { score: 0, reason: '旧版结果未包含该字段，待补充。', evidence: [] };
    assessments.addRow([
      name,
      result.fields[name] ?? '',
      assessment.score,
      assessment.score >= 0.85 ? '绿' : assessment.score >= 0.6 ? '黄' : '红',
      assessment.reason,
      assessment.evidence.map((item) => `第${item.page}页：${item.quote}`).join('\n')
    ]);
  }
  assessments.getRow(1).font = { bold: true };
  assessments.columns = [{ width: 20 }, { width: 44 }, { width: 10 }, { width: 10 }, { width: 46 }, { width: 60 }];
  assessments.getColumn(6).alignment = { wrapText: true, vertical: 'top' };

  const images = workbook.addWorksheet('图像素材库', { views: [{ state: 'frozen', ySplit: 1 }] });
  images.addRow(imageHeaders);
  images.getRow(1).font = { bold: true };
  images.columns.forEach((column) => {
    column.width = 22;
  });

  const exportDirectory = join(project.rootPath, 'export');
  if (!targetPath) await mkdir(exportDirectory, { recursive: true });
  const outputPath = targetPath ?? join(exportDirectory, exportFileName(project, result));
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
};
