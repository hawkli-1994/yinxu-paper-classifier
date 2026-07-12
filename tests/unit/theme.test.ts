import { describe, expect, it } from 'vitest';
import { academicTheme } from '../../src/renderer/theme';

describe('academic theme', () => {
  it('uses the approved primary and paper background tokens', () => {
    expect(academicTheme.token?.colorPrimary).toBe('#2F4A5A');
    expect(academicTheme.token?.colorBgLayout).toBe('#F4F1EA');
  });
});
