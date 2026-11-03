import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';
import {
  guessMapping,
  isWalletExport,
  parseAmountValue,
  parseDateValue,
  typeFromValue,
} from './import-formats';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and newlines', () => {
    const text = 'a;b;c\n1;"x;y";"he said ""hi"""\n2;"multi\nline";3\n';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', 'he said "hi"'],
      ['2', 'multi\nline', '3'],
    ]);
  });
  it('strips the BOM and ignores empty lines', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\r\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('import helpers', () => {
  it('parses dates in many formats', () => {
    expect(parseDateValue('2024-06-12 18:29:43', 'auto')).toEqual(
      new Date(2024, 5, 12, 18, 29, 43),
    );
    expect(parseDateValue('12.06.2024', 'auto')).toEqual(new Date(2024, 5, 12, 12, 0, 0));
    expect(parseDateValue('06/13/2024', 'auto')).toEqual(new Date(2024, 5, 13, 12, 0, 0));
    expect(parseDateValue('05/06/2024', 'mdy')).toEqual(new Date(2024, 4, 6, 12, 0, 0));
    expect(parseDateValue('2024-06-12T10:00:00Z', 'auto')?.toISOString()).toBe(
      '2024-06-12T10:00:00.000Z',
    );
    expect(parseDateValue('31.02.2024', 'auto')).toBeNull();
    expect(parseDateValue('nope', 'auto')).toBeNull();
  });
  it('parses amounts', () => {
    expect(parseAmountValue('-12.50')).toBe(-12.5);
    expect(parseAmountValue('1 234,56 €')).toBe(1234.56);
    expect(parseAmountValue('-1.234,56')).toBe(-1234.56);
    expect(parseAmountValue('(45.00)')).toBe(-45);
    expect(parseAmountValue('abc')).toBeNull();
  });
  it('detects the type', () => {
    expect(typeFromValue('Expenses', 12)).toBe('expense');
    expect(typeFromValue('Income', -12)).toBe('income');
    expect(typeFromValue('', -3)).toBe('expense');
  });
  it('recognises Wallet exports and guesses columns', () => {
    const headers = [
      'account',
      'category',
      'currency',
      'amount',
      'ref_currency_amount',
      'type',
      'payment_type',
      'note',
      'date',
      'transfer',
      'payee',
      'labels',
    ];
    expect(isWalletExport(headers)).toBe(true);
    const m = guessMapping(headers);
    expect(m).toMatchObject({
      account: 0,
      category: 1,
      currency: 2,
      amount: 3,
      type: 5,
      note: 7,
      date: 8,
      transfer: 9,
      payee: 10,
      labels: 11,
    });
  });
});
