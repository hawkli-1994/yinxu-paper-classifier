import { describe, expect, it } from 'vitest';
import { getCategoryPath, isValidLeafCategory, listLeafCategories } from '../../src/shared/taxonomy';

describe('taxonomy', () => {
  it('resolves the full path for B41', () => {
    expect(getCategoryPath('B41').map((node) => node.code)).toEqual(['B', 'B4', 'B41']);
  });

  it('accepts only known third-level categories as primary categories', () => {
    expect(isValidLeafCategory('D22')).toBe(true);
    expect(isValidLeafCategory('B4')).toBe(false);
    expect(isValidLeafCategory('B47')).toBe(false);
  });

  it('contains all 72 third-level categories from the template', () => {
    expect(listLeafCategories()).toHaveLength(72);
  });
});
