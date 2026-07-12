import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAPER_FIELD_NAMES } from '../../src/shared/contracts';

const root = join(process.cwd(), 'resources', 'yinxu-classifier');

describe('Yinxu methodology knowledge package', () => {
  it('routes the agent through every required reference and all text chunks', async () => {
    const skill = await readFile(join(root, 'SKILL.md'), 'utf8');

    expect(skill).toContain('references/classification-rules.md');
    expect(skill).toContain('references/field-guidance.md');
    expect(skill).toContain('references/classification-examples.md');
    expect(skill).toContain('special-rules.json');
    expect(skill).toMatch(/读取.*chunks.*全部/);
    expect(skill).toContain('不得输出最终置信度');
  });

  it('covers source rules and the six high-risk category conflicts', async () => {
    const rules = JSON.parse(await readFile(join(root, 'special-rules.json'), 'utf8')) as Array<{ id: string }>;
    const ids = new Set(rules.map((rule) => rule.id));

    for (const id of [
      'institution-author',
      'special-material',
      'source-vs-research',
      'extracted-chapter',
      'material-first',
      'digital-a13-vs-d21',
      'isotope-a24-vs-d26',
      'bronze-a21-vs-c21',
      'ritual-b41-vs-c31-c32',
      'burial-a3-vs-c34',
      'geography-b42-vs-c41-c42'
    ]) {
      expect(ids, `missing rule ${id}`).toContain(id);
    }
  });

  it('defines the complete agent draft contract without model-owned final confidence', async () => {
    const schema = JSON.parse(await readFile(join(root, 'paper-schema.json'), 'utf8')) as {
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    };
    const fields = schema.properties?.fields;
    const assessments = schema.properties?.fieldAssessments;

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(['fields', 'primaryCategoryCode', 'crossReferenceCategoryCodes', 'candidates', 'evidence', 'ruleConflicts', 'abstract', 'fieldAssessments'])
    );
    expect(Object.keys(fields?.properties ?? {})).toEqual([...PAPER_FIELD_NAMES]);
    expect(fields?.required).toEqual([...PAPER_FIELD_NAMES]);
    expect(Object.keys(assessments?.properties ?? {})).toEqual([...PAPER_FIELD_NAMES]);
    expect(schema.properties).not.toHaveProperty('confidence');
    expect(schema.properties).not.toHaveProperty('confidenceBand');
    expect(schema.properties).not.toHaveProperty('reviewStatus');
  });
});
