import { describe, expect, it } from 'vitest';
import { BRAND_LIST, brandById, recognizeBrand, searchBrands } from '../src/brands';
import { CATEGORY_TEMPLATE } from '../src/categories';

const id = (payee: string) => recognizeBrand(payee)?.id;

describe('recognizeBrand', () => {
  it('recognises shops in bank texts, Cyrillic and with accents', () => {
    expect(id('LIDL BULGARIA EOOD 1234')).toBe('lidl');
    expect(id('Лидл')).toBe('lidl');
    expect(id('KAUFLAND BULGARIA EOOD I KO KD')).toBe('kaufland');
    expect(id('Била')).toBe('billa');
    expect(id('LC WAIKIKI MALL SOFIA')).toBe('lc-waikiki');
    expect(id('Pull & Bear')).toBe('pull-and-bear');
    expect(id('H&M Paradise')).toBe('hm');
    expect(id("McDonald's 123")).toBe('mcdonalds');
    expect(id('Česká spořitelna')).toBe('ceska-sporitelna');
  });

  it('matches short and generic names only as the payee or its first word', () => {
    expect(id('dm')).toBe('dm');
    expect(id('DM Drogerie Markt')).toBe('dm');
    expect(id('A1 Bulgaria')).toBe('a1');
    expect(id('Admin fees')).toBeUndefined();
    expect(id('House')).toBe('house');
    expect(id('Coffee House')).toBeUndefined();
    expect(id('Metro Cash & Carry')).toBe('metro');
    expect(id('Paid at the metro')).toBeUndefined();
    expect(id('')).toBeUndefined();
    expect(id('Some small shop')).toBeUndefined();
  });

  it('prefers the longest match', () => {
    expect(id('Orange Center Mall')).toBe('orange-center');
  });
});

describe('searchBrands', () => {
  it('suggests brands that start with the typed text', () => {
    expect(searchBrands('kau').map((b) => b.id)).toContain('kaufland');
    expect(searchBrands('кау').map((b) => b.id)).toContain('kaufland');
    expect(searchBrands('l')).toEqual([]);
  });
});

describe('BRAND_LIST', () => {
  it('has unique ids and valid categories', () => {
    const ids = BRAND_LIST.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BRAND_LIST) expect(b.id).toMatch(/^[a-z0-9-]+$/);
    const keys = new Set(
      CATEGORY_TEMPLATE.flatMap((g) => [g.key, ...g.children.map((c) => `${g.key}.${c.key}`)]),
    );
    for (const b of BRAND_LIST) if (b.category) expect(keys, b.id).toContain(b.category);
    expect(brandById('dsk')?.country).toBe('BG');
  });
});
