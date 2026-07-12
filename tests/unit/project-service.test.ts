import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, readProject, updateProjectMetadata } from '../../src/main/project-service';
import { createFixturePdf } from '../fixtures/pdf';

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'yinxu-project-'));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project service', () => {
  it('creates a project with copied source and imported status', async () => {
    const root = await makeRoot();
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);

    const project = await createProject(source, root, '2.3.4');

    expect(project.status).toBe('imported');
    expect(project.knowledgeVersion).toBe('2.3.4');
    await expect(access(project.sourcePdfPath)).resolves.toBeUndefined();
    expect(await readFile(project.sourcePdfPath)).toEqual(await readFile(source));
  });

  it('persists the actual Agent and OCR run metadata for audit export', async () => {
    const root = await makeRoot();
    const source = join(root, 'sample.pdf');
    await createFixturePdf(source);
    const project = await createProject(source, root, '2.3.4');

    await updateProjectMetadata(project, {
      agentProvider: 'deepseek',
      agentModel: 'deepseek-chat',
      thinkingLevel: 'medium',
      ocrModel: 'deepseek-ai/DeepSeek-OCR'
    });

    expect(await readProject(project.rootPath)).toMatchObject({
      agentProvider: 'deepseek',
      agentModel: 'deepseek-chat',
      thinkingLevel: 'medium',
      ocrModel: 'deepseek-ai/DeepSeek-OCR'
    });
  });
});
