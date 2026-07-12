import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyKnowledgePackage } from '../../src/main/resource-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('knowledge package resource service', () => {
  it('derives both runtime path and project version from VERSION', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-knowledge-'));
    roots.push(root);
    const source = join(root, 'source');
    const appRoot = join(root, 'app');
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'VERSION'), '2.3.4\n');
    await writeFile(join(source, 'SKILL.md'), 'skill-body');

    const knowledge = await copyKnowledgePackage(source, appRoot);

    expect(knowledge.version).toBe('2.3.4');
    expect(knowledge.path).toBe(join(appRoot, 'knowledge', 'yinxu-classifier-2.3.4'));
    expect(await readFile(join(knowledge.path, 'SKILL.md'), 'utf8')).toBe('skill-body');
  });
});
