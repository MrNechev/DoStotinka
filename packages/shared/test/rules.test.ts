import { describe, expect, it } from 'vitest';
import { applyRules, type Rule, ruleInput, ruleMatches } from '../src/rules';

let n = 0;
const rule = (r: Partial<Rule>): Rule => ({
  id: `r${++n}`,
  name: '',
  enabled: true,
  position: n,
  field: 'any',
  match: 'contains',
  pattern: 'lidl',
  recordType: null,
  accountId: null,
  categoryId: null,
  setPayee: null,
  setNote: null,
  labelIds: [],
  createdAt: '',
  ...r,
});

describe('ruleMatches', () => {
  it('matches case- and space-insensitively in payee, note or description', () => {
    const r = rule({ pattern: 'Lidl  Bulgaria' });
    expect(ruleMatches(r, { type: 'expense', payee: 'LIDL BULGARIA EOOD 1234' })).toBe(true);
    expect(ruleMatches(r, { type: 'expense', description: 'Плащане при lidl bulgaria' })).toBe(
      true,
    );
    expect(ruleMatches(r, { type: 'expense', payee: 'Kaufland' })).toBe(false);
  });

  it('respects the field, the kind of match, type, account and the switch', () => {
    expect(ruleMatches(rule({ field: 'note' }), { type: 'expense', payee: 'Lidl' })).toBe(false);
    expect(ruleMatches(rule({ match: 'starts' }), { type: 'expense', payee: 'Lidl Sofia' })).toBe(
      true,
    );
    expect(ruleMatches(rule({ match: 'starts' }), { type: 'expense', payee: 'At Lidl' })).toBe(
      false,
    );
    expect(ruleMatches(rule({ match: 'equals' }), { type: 'expense', note: ' lidl ' })).toBe(true);
    expect(ruleMatches(rule({ recordType: 'income' }), { type: 'expense', payee: 'Lidl' })).toBe(
      false,
    );
    expect(
      ruleMatches(rule({ accountId: 'a' }), { type: 'expense', accountId: 'b', payee: 'Lidl' }),
    ).toBe(false);
    expect(ruleMatches(rule({ enabled: false }), { type: 'expense', payee: 'Lidl' })).toBe(false);
    expect(ruleMatches(rule({}), { type: 'transfer', payee: 'Lidl' })).toBe(false);
  });

  it('matches Cyrillic', () => {
    expect(
      ruleMatches(rule({ pattern: 'КАУФЛАНД' }), { type: 'expense', note: 'Кауфланд Младост' }),
    ).toBe(true);
  });
});

describe('applyRules', () => {
  it('applies rules in order, keeps existing values and adds up labels', () => {
    const rules = [
      rule({ position: 2, categoryId: 'second', labelIds: ['l2'] }),
      rule({
        position: 1,
        categoryId: 'groceries',
        setPayee: 'Lidl',
        setNote: 'Lidl',
        labelIds: ['l1'],
      }),
      rule({ position: 3, pattern: 'kaufland', categoryId: 'other' }),
    ];
    const out = applyRules(rules, { type: 'expense', payee: 'LIDL 123' });
    expect(out).toMatchObject({
      categoryId: 'groceries',
      payee: 'Lidl',
      note: 'Lidl',
      labelIds: ['l1', 'l2'],
    });
    expect(out.ruleIds).toHaveLength(2);
    const kept = applyRules(rules, {
      type: 'expense',
      payee: 'LIDL',
      note: 'Mine',
      categoryId: 'set',
    });
    expect(kept).toMatchObject({ categoryId: 'set', note: 'Mine' });
    expect(applyRules(rules, { type: 'expense', payee: 'Billa' })).toMatchObject({
      categoryId: null,
      payee: 'Billa',
      ruleIds: [],
    });
  });
});

describe('ruleInput', () => {
  it('needs a pattern and at least one action', () => {
    expect(ruleInput.safeParse({ pattern: 'lidl' }).success).toBe(false);
    expect(ruleInput.safeParse({ pattern: ' ', setPayee: 'x' }).success).toBe(false);
    expect(ruleInput.parse({ pattern: 'lidl', setPayee: 'Lidl' })).toMatchObject({
      field: 'any',
      match: 'contains',
      enabled: true,
    });
  });
});
