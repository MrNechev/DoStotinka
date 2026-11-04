import type { Category } from '@dostotinka/shared';
import { t } from '@/i18n';

export const UNCATEGORIZED_COLOR = '#94A3B8';

export interface CategoryIndex {
  list: Category[];
  byId: Map<string, Category>;
  childrenOf: (parentId: string) => Category[];
  topLevel: (kind?: 'expense' | 'income', includeArchived?: boolean) => Category[];
  colorOf: (id: string | null | undefined) => string;
  iconOf: (id: string | null | undefined) => string;
  nameOf: (id: string | null | undefined) => string;
  /** "Food & Drinks › Groceries" */
  pathOf: (id: string | null | undefined) => string;
  parentOf: (id: string | null | undefined) => Category | undefined;
  /** Top-level ancestor id (or the id itself). */
  rootOf: (id: string | null | undefined) => string | null;
}

export function buildCategoryIndex(categories: Category[] = []): CategoryIndex {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const children = new Map<string, Category[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const list = children.get(c.parentId) ?? [];
    list.push(c);
    children.set(c.parentId, list);
  }
  const sortFn = (a: Category, b: Category) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  for (const list of children.values()) list.sort(sortFn);
  const tops = categories.filter((c) => !c.parentId).sort(sortFn);

  const parentOf = (id: string | null | undefined) => {
    const c = id ? byId.get(id) : undefined;
    return c?.parentId ? byId.get(c.parentId) : undefined;
  };
  const colorOf = (id: string | null | undefined) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return UNCATEGORIZED_COLOR;
    return c.color ?? parentOf(id)?.color ?? UNCATEGORIZED_COLOR;
  };
  return {
    list: categories,
    byId,
    childrenOf: (parentId) => children.get(parentId) ?? [],
    topLevel: (kind, includeArchived = false) =>
      tops.filter((c) => (!kind || c.kind === kind) && (includeArchived || !c.archived)),
    colorOf,
    iconOf: (id) => (id ? byId.get(id)?.icon : undefined) ?? 'circle-help',
    nameOf: (id) => (id ? byId.get(id)?.name : undefined) ?? t('Uncategorized'),
    pathOf: (id) => {
      const c = id ? byId.get(id) : undefined;
      if (!c) return t('Uncategorized');
      const p = parentOf(id);
      return p ? `${p.name} › ${c.name}` : c.name;
    },
    parentOf,
    rootOf: (id) => {
      const c = id ? byId.get(id) : undefined;
      if (!c) return null;
      return c.parentId ?? c.id;
    },
  };
}

/** Generates `count` distinguishable shades around a base colour (for subcategory charts). */
export function shades(base: string, count: number): string[] {
  const { h, s, l } = hexToHsl(base);
  if (count <= 1) return [base];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const light = Math.min(78, Math.max(28, l - 18 + t * 40));
    const hue = (h + (t - 0.5) * 24 + 360) % 360;
    return hslToHex(hue, Math.min(95, s), light);
  });
}

export function hexToHsl(hex: string) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return { h: 0, s: 0, l: 50 };
  const r = Number.parseInt(m[1]!, 16) / 255;
  const g = Number.parseInt(m[2]!, 16) / 255;
  const b = Number.parseInt(m[3]!, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Returns a translucent version of a hex colour for backgrounds. */
export function tint(hex: string, alpha = 0.14) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${Number.parseInt(m[1]!, 16)}, ${Number.parseInt(m[2]!, 16)}, ${Number.parseInt(m[3]!, 16)}, ${alpha})`;
}
