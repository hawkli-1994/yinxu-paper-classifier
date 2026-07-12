import { describe, expect, it } from 'vitest';
import { APP_NAME, isWindowsSupported } from '../../src/shared/contracts';

describe('application shell', () => {
  it('names the Windows app and accepts supported Windows releases', () => {
    expect(APP_NAME).toBe('殷墟论文分类助手');
    expect(isWindowsSupported('win32')).toBe(true);
    expect(isWindowsSupported('darwin')).toBe(false);
  });
});
