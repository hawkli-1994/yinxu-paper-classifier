import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { ProjectRecord, SupplementalFileInput, SupplementalMaterialRecord, SupplementalNoteInput } from '../shared/contracts';
import { inspectPdf } from './pdf-service';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);
const MAX_SUPPLEMENT_BYTES = 200 * 1024 * 1024;

const now = (): string => new Date().toISOString();
const supplementsDirectory = (project: ProjectRecord): string => join(project.rootPath, 'supplements');
const manifestPath = (project: ProjectRecord): string => join(supplementsDirectory(project), 'manifest.json');

export const listSupplementalMaterials = async (project: ProjectRecord): Promise<SupplementalMaterialRecord[]> => {
  try {
    return JSON.parse(await readFile(manifestPath(project), 'utf8')) as SupplementalMaterialRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

const saveManifest = async (project: ProjectRecord, materials: SupplementalMaterialRecord[]): Promise<void> => {
  await mkdir(supplementsDirectory(project), { recursive: true });
  const targetPath = manifestPath(project);
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(materials, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, targetPath);
};

const extractSupplementText = async (path: string, extension: string): Promise<{ text: string; status: SupplementalMaterialRecord['status']; statusDetail?: string }> => {
  if (extension === '.pdf') {
    const inspection = await inspectPdf(path);
    return {
      text: inspection.pages.map((page) => `<!-- supplement-page:${page.page} -->\n${page.text}`).join('\n\n'),
      status: inspection.pagesNeedingOcr.length > 0 ? 'needs_review' : 'ready',
      statusDetail: inspection.pagesNeedingOcr.length > 0 ? `第 ${inspection.pagesNeedingOcr.join('、')} 页文本较少，可能需要人工核验。` : undefined
    };
  }
  return { text: await readFile(path, 'utf8'), status: 'ready' };
};

export const addSupplementalFiles = async (
  project: ProjectRecord,
  inputs: readonly SupplementalFileInput[]
): Promise<SupplementalMaterialRecord[]> => {
  const current = await listSupplementalMaterials(project);
  const filesDirectory = join(supplementsDirectory(project), 'files');
  const extractedDirectory = join(supplementsDirectory(project), 'extracted');
  await Promise.all([mkdir(filesDirectory, { recursive: true }), mkdir(extractedDirectory, { recursive: true })]);

  for (const input of inputs) {
    const extension = extname(input.path).toLocaleLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('补充材料目前只支持 PDF、TXT 和 Markdown。');
    const info = await stat(input.path);
    if (!info.isFile()) throw new Error('补充材料必须是文件。');
    if (info.size > MAX_SUPPLEMENT_BYTES) throw new Error('单份补充材料不能超过 200 MB。');
    const content = await readFile(input.path);
    const id = randomUUID();
    const storedPath = join(filesDirectory, `${id}${extension}`);
    const extractedTextPath = join(extractedDirectory, `${id}.md`);
    await copyFile(input.path, storedPath);
    let extraction: Awaited<ReturnType<typeof extractSupplementText>>;
    try {
      extraction = await extractSupplementText(storedPath, extension);
    } catch (error) {
      extraction = { text: '', status: 'failed', statusDetail: error instanceof Error ? error.message : '补充材料文本提取失败。' };
    }
    await writeFile(extractedTextPath, extraction.text, 'utf8');
    current.push({
      id,
      kind: input.kind,
      sourceType: 'file',
      title: basename(input.path),
      sourceLabel: input.sourceLabel?.trim().slice(0, 200) || '本地上传',
      originalFileName: basename(input.path),
      storedPath,
      extractedTextPath,
      sha256: createHash('sha256').update(content).digest('hex'),
      size: info.size,
      status: extraction.status,
      statusDetail: extraction.statusDetail,
      createdAt: now()
    });
  }
  await saveManifest(project, current);
  return current;
};

export const addSupplementalNote = async (
  project: ProjectRecord,
  input: SupplementalNoteInput
): Promise<SupplementalMaterialRecord[]> => {
  const title = input.title.trim().slice(0, 160);
  const content = input.content.trim().slice(0, 50_000);
  if (!title || !content) throw new Error('手动补充说明必须填写标题和内容。');
  const current = await listSupplementalMaterials(project);
  const notesDirectory = join(supplementsDirectory(project), 'notes');
  const extractedDirectory = join(supplementsDirectory(project), 'extracted');
  await Promise.all([mkdir(notesDirectory, { recursive: true }), mkdir(extractedDirectory, { recursive: true })]);
  const id = randomUUID();
  const text = `# ${title}\n\n${content}\n`;
  const storedPath = join(notesDirectory, `${id}.md`);
  const extractedTextPath = join(extractedDirectory, `${id}.md`);
  await Promise.all([writeFile(storedPath, text, 'utf8'), writeFile(extractedTextPath, text, 'utf8')]);
  current.push({
    id,
    kind: input.kind,
    sourceType: 'note',
    title,
    sourceLabel: input.sourceLabel?.trim().slice(0, 200) || '用户手动补充',
    storedPath,
    extractedTextPath,
    sha256: createHash('sha256').update(text).digest('hex'),
    size: Buffer.byteLength(text),
    status: 'ready',
    createdAt: now()
  });
  await saveManifest(project, current);
  return current;
};

export const removeSupplementalMaterial = async (project: ProjectRecord, materialId: string): Promise<SupplementalMaterialRecord[]> => {
  const current = await listSupplementalMaterials(project);
  const index = current.findIndex((material) => material.id === materialId && !material.removedAt);
  if (index < 0) throw new Error('补充材料不存在或已移除。');
  current[index] = { ...current[index]!, removedAt: now() };
  await saveManifest(project, current);
  return current;
};

export const activeSupplementalMaterials = (materials: readonly SupplementalMaterialRecord[]): SupplementalMaterialRecord[] =>
  materials.filter((material) => !material.removedAt);
