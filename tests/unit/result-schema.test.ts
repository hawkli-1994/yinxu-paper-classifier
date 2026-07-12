import { describe, expect, it } from 'vitest';
import { DraftValidationError, parseAgentDraft } from '../../src/shared/result-schema';
import { makeAgentDraft } from '../fixtures/paper-result';

describe('agent draft schema', () => {
  it('accepts the complete evidence-rich draft', () => {
    expect(parseAgentDraft(makeAgentDraft()).primaryCategoryCode).toBe('B41');
  });

  it('rejects missing fields and model-owned final confidence', () => {
    const invalid = { ...makeAgentDraft(), confidence: 99 } as Record<string, unknown>;
    delete invalid.fieldAssessments;

    expect(() => parseAgentDraft(invalid)).toThrow(DraftValidationError);
    try {
      parseAgentDraft(invalid);
    } catch (error) {
      expect((error as DraftValidationError).issues.join(' ')).toContain('fieldAssessments');
      expect((error as DraftValidationError).issues.join(' ')).toContain('confidence');
    }
  });
});
