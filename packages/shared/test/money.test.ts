import { describe, expect, it } from 'vitest';
import {
  convertMinor,
  evaluateAmountExpression,
  formatMoney,
  parseAmountToMinor,
  toMajor,
  toMinor,
} from '../src/money';

describe('minor units', () => {
  it('converts between major and minor units respecting currency decimals', () => {
    expect(toMinor(12.34, 'EUR')).toBe(1234);
    expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
    expect(toMinor(1500, 'JPY')).toBe(1500);
    expect(toMinor(1.234, 'KWD')).toBe(1234);
    expect(toMajor(1234, 'EUR')).toBe(12.34);
  });
});

describe('evaluateAmountExpression', () => {
  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['12,5', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['10+5', 15],
    ['10 - 2.5', 7.5],
    ['3*4', 12],
    ['(1+2)*3', 9],
    ['20/4', 5],
    ['-5', -5],
  ])('%s → %d', (input, expected) => {
    expect(evaluateAmountExpression(input)).toBeCloseTo(expected, 10);
  });

  it.each(['', 'abc', '1..2', '5/0', '(1+2', '1+'])('rejects %s', (input) => {
    expect(evaluateAmountExpression(input)).toBeNull();
  });

  it('parses to minor units', () => {
    expect(parseAmountToMinor('19,99', 'EUR')).toBe(1999);
    expect(parseAmountToMinor('2.5+2.5', 'USD')).toBe(500);
  });
});

describe('convertMinor', () => {
  const rates = { EUR: 1, USD: 0.9, BGN: 1 / 1.95583 };
  it('returns the same amount for equal currencies', () => {
    expect(convertMinor(1000, 'EUR', 'EUR', rates)).toBe(1000);
  });
  it('converts into the base currency', () => {
    expect(convertMinor(10000, 'USD', 'EUR', rates)).toBe(9000);
    expect(convertMinor(195583, 'BGN', 'EUR', rates)).toBe(100000);
  });
  it('converts between two non-base currencies', () => {
    expect(convertMinor(9000, 'EUR', 'USD', rates)).toBe(10000);
  });
});

describe('formatMoney', () => {
  it('formats with currency symbol', () => {
    expect(formatMoney(123456, 'EUR', { locale: 'en-US' })).toBe('€1,234.56');
    expect(formatMoney(-500, 'USD', { locale: 'en-US' })).toBe('-$5.00');
  });
});

describe('category template', () => {
  it('only uses icons that the web app bundles', async () => {
    const { readFileSync } = await import('node:fs');
    const { CATEGORY_TEMPLATE } = await import('../src/categories');
    const registry = readFileSync(
      new URL('../../../apps/web/src/lib/icon-registry.ts', import.meta.url),
      'utf8',
    );
    const icons = new Set(
      CATEGORY_TEMPLATE.flatMap((g) => [g.icon, ...g.children.map((c) => c.icon)]),
    );
    const missing = [...icons].filter((i) => !new RegExp(`^\\s+'?${i}'?: `, 'm').test(registry));
    expect(missing).toEqual([]);
  });

  it('has unique keys', async () => {
    const { CATEGORY_TEMPLATE } = await import('../src/categories');
    const keys = CATEGORY_TEMPLATE.flatMap((g) => [
      g.key,
      ...g.children.map((c) => `${g.key}.${c.key}`),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
