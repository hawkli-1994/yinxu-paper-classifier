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
