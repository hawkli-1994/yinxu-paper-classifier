import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import paperSchema from '../../resources/yinxu-classifier/paper-schema.json';
import type { AgentPaperDraft } from './contracts';

export class DraftValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Agent draft failed schema validation: ${issues.join('；')}`);
    this.name = 'DraftValidationError';
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile<AgentPaperDraft>(paperSchema);

const describeError = (error: ErrorObject): string => {
  const extra = error.keyword === 'additionalProperties' && 'additionalProperty' in error.params ? ` ${String(error.params.additionalProperty)}` : '';
  return `${error.instancePath || '/'} ${error.message ?? error.keyword}${extra}`.trim();
};

export const parseAgentDraft = (value: unknown): AgentPaperDraft => {
  if (!validate(value)) throw new DraftValidationError((validate.errors ?? []).map(describeError));
  return structuredClone(value);
};

export const parseAgentDraftJson = (text: string): AgentPaperDraft => {
  try {
    return parseAgentDraft(JSON.parse(text));
  } catch (error) {
    if (error instanceof DraftValidationError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new DraftValidationError([`agent-result.json 不是有效 JSON：${detail}`]);
  }
};
