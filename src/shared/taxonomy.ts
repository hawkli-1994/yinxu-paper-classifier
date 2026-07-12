import taxonomyData from '../../resources/yinxu-classifier/taxonomy.json';

export type CategoryLevel = 1 | 2 | 3;

export interface TaxonomyNode {
  code: string;
  label: string;
  level: CategoryLevel;
  parentCode: string | null;
}

const taxonomy = taxonomyData as TaxonomyNode[];
const byCode = new Map(taxonomy.map((node) => [node.code, node]));

export const listCategories = (): readonly TaxonomyNode[] => taxonomy;

export const listLeafCategories = (): TaxonomyNode[] => taxonomy.filter((node) => node.level === 3);

export const isValidLeafCategory = (code: string): boolean => byCode.get(code)?.level === 3;

export const getCategoryPath = (code: string): TaxonomyNode[] => {
  const leaf = byCode.get(code);
  if (!leaf) throw new Error(`Unknown category: ${code}`);

  const path: TaxonomyNode[] = [leaf];
  let current = leaf;
  while (current.parentCode) {
    const parent = byCode.get(current.parentCode);
    if (!parent) throw new Error(`Broken taxonomy parent: ${current.parentCode}`);
    path.unshift(parent);
    current = parent;
  }
  return path;
};

export const listChildren = (parentCode: string): TaxonomyNode[] => taxonomy.filter((node) => node.parentCode === parentCode);
