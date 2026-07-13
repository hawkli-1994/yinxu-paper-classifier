import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '../../src/main/project-service';
import {
  activeSupplementalMaterials,
  addSupplementalFiles,
  addSupplementalNote,
  listSupplementalMaterials,
  removeSupplementalMaterial
} from '../../src/main/supplement-service';
import { createFixturePdf } from '../fixtures/pdf';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('supplement service', () => {
  it('copies files and notes into the project, extracts text, and preserves removed records for audit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-supplement-'));
    roots.push(root);
    const source = join(root, 'paper.pdf');
    const noteFile = join(root, '博士生反馈.txt');
    await Promise.all([
      createFixturePdf(source),
      writeFile(noteFile, '唐际根不应按院内外二分，这是本项目的专家反馈。', 'utf8')
    ]);
    const project = await createProject(source, root, '2.0.1');

    let materials = await addSupplementalFiles(project, [{ path: noteFile, kind: 'expert_note', sourceLabel: '博士生反馈' }]);
    materials = await addSupplementalNote(project, {
      title: '作者信息补充',
      content: '作者单位以论文署名页为准。',
      kind: 'author_metadata',
      sourceLabel: '用户手工补充'
    });

    expect(materials).toHaveLength(2);
    expect(materials.map((item) => item.status)).toEqual(['ready', 'ready']);
    expect(await readFile(materials[0]!.extractedTextPath, 'utf8')).toContain('唐际根');
    expect(await readFile(materials[1]!.extractedTextPath, 'utf8')).toContain('作者单位以论文署名页为准');
    await expect(access(materials[0]!.storedPath)).resolves.toBeUndefined();

    await removeSupplementalMaterial(project, materials[0]!.id);
    const afterRemoval = await listSupplementalMaterials(project);
    expect(afterRemoval).toHaveLength(2);
    expect(afterRemoval[0]?.removedAt).toBeTruthy();
    expect(activeSupplementalMaterials(afterRemoval)).toHaveLength(1);
    await expect(access(materials[0]!.storedPath)).resolves.toBeUndefined();
  });

  it('rejects unsupported supplement formats', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-supplement-'));
    roots.push(root);
    const source = join(root, 'paper.pdf');
    const unsupported = join(root, '材料.docx');
    await Promise.all([createFixturePdf(source), writeFile(unsupported, 'not a docx', 'utf8')]);
    const project = await createProject(source, root, '2.0.1');

    await expect(addSupplementalFiles(project, [{ path: unsupported, kind: 'other' }])).rejects.toThrow('只支持 PDF、TXT 和 Markdown');
  });

  it('routes PDF supplements through the supplied cloud OCR extractor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-supplement-'));
    roots.push(root);
    const source = join(root, 'paper.pdf');
    const supplement = join(root, 'scanned-appendix.pdf');
    await Promise.all([createFixturePdf(source), createFixturePdf(supplement)]);
    const project = await createProject(source, root, '2.0.1');
    const receivedPaths: string[] = [];

    const materials = await addSupplementalFiles(
      project,
      [{ path: supplement, kind: 'appendix' }],
      async (path) => {
        receivedPaths.push(path);
        return { text: '<!-- supplement-page:1 -->\n云端 OCR 附录内容', status: 'ready' };
      }
    );

    expect(receivedPaths).toHaveLength(1);
    expect(receivedPaths[0]).toBe(materials[0]?.storedPath);
    expect(await readFile(materials[0]!.extractedTextPath, 'utf8')).toContain('云端 OCR 附录内容');
  });

  it('rejects a PDF supplement when cloud OCR fails instead of silently adding empty text', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-supplement-'));
    roots.push(root);
    const source = join(root, 'paper.pdf');
    const supplement = join(root, 'scanned-appendix.pdf');
    await Promise.all([createFixturePdf(source), createFixturePdf(supplement)]);
    const project = await createProject(source, root, '2.0.1');

    await expect(addSupplementalFiles(
      project,
      [{ path: supplement, kind: 'appendix' }],
      async () => { throw new Error('云端 OCR 鉴权失败'); }
    )).rejects.toThrow('云端 OCR 鉴权失败');
    expect(await listSupplementalMaterials(project)).toEqual([]);
  });
});
