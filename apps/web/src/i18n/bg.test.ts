import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ACCOUNT_TYPE_LABELS, CATEGORY_TEMPLATE } from '@slavotax/shared';
import { describe, expect, it } from 'vitest';
import { bg } from './bg';

const SRC = path.resolve(__dirname, '..');
const NOT_TRANSLATED = new Set([
  'Android',
  'Chrome',
  'Edge',
  'Firefox',
  'Linux',
  'Safari',
  'Windows',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'i18n' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [full] : [];
  });
}

const literal = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
const unquote = (s: string) => s.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');

function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.])t\(\s*${literal}`, 'g')))
      keys.add(unquote(m[1]!));
    for (const m of src.matchAll(
      new RegExp(String.raw`(?<![\w.])tn\(\s*[^,]+,\s*${literal}\s*,\s*${literal}`, 'g'),
    )) {
      keys.add(unquote(m[1]!));
      keys.add(unquote(m[2]!));
    }
    for (const m of src.matchAll(
      new RegExp(String.raw`(?<![\w.])plural\(\s*[^,]+,\s*${literal}(?:\s*,\s*${literal})?`, 'g'),
    )) {
      const one = unquote(m[1]!);
      keys.add(`{n} ${one}`);
      keys.add(`{n} ${m[2] ? unquote(m[2]) : `${one}s`}`);
    }
  }
  return keys;
}

describe('Bulgarian translation', () => {
  it('covers every UI string', () => {
    const missing = [...usedKeys()].filter((k) => !(k in bg) && !NOT_TRANSLATED.has(k));
    expect(missing).toEqual([]);
  });

  it('covers the default categories and account types', () => {
    const names = CATEGORY_TEMPLATE.flatMap((g) => [g.name, ...g.children.map((c) => c.name)]);
    const missing = [...names, ...Object.values(ACCOUNT_TYPE_LABELS)].filter((n) => !(n in bg));
    expect(missing).toEqual([]);
  });

  it('keeps the {placeholders} of every translation', () => {
    const broken = Object.entries(bg).filter(([en, translated]) => {
      const vars = (s: string) =>
        [...s.matchAll(/\{(\w+)\}/g)]
          .map((m) => m[1])
          .sort()
          .join(',');
      return vars(en) !== vars(translated);
    });
    expect(broken).toEqual([]);
  });
});
