import { describe, expect, it } from 'vitest';
import { payeeBrand, recordBrand } from './brand-icons';
import { matchPayees } from './payees';

const usage = [
  { payee: 'Kaufland', count: 40, lastUsed: '', categoryId: 'c1' },
  { payee: 'Kafe Sofia', count: 3, lastUsed: '', categoryId: null },
];

describe('matchPayees', () => {
  it('suggests own payees first, then known shops not used yet, with logos', () => {
    const kau = matchPayees(usage, 'kau');
    expect(kau[0]).toMatchObject({ name: 'Kaufland', used: true });
    expect(kau[0]?.brand?.key).toBe('kaufland');
    // Kaufland is not suggested twice (as a shop).
    expect(kau.filter((s) => s.brand?.key === 'kaufland')).toHaveLength(1);
    const lid = matchPayees(usage, 'lid');
    expect(lid[0]).toMatchObject({ name: 'Lidl', used: false });
    expect(lid[0]?.brand?.src).toBeTruthy();
    expect(matchPayees(usage, 'к')).toEqual([]);
  });
});

describe('payee logos', () => {
  it('finds the logo of payees and short notes', () => {
    expect(payeeBrand('LIDL BULGARIA EOOD')?.key).toBe('lidl');
    expect(payeeBrand('Unknown corner shop')).toBeUndefined();
    expect(recordBrand(null, 'Kaufland')?.key).toBe('kaufland');
    expect(recordBrand(null, 'Bought bread and milk at the Kaufland near work')).toBeUndefined();
    // A payee wins over the note.
    expect(recordBrand('Billa', 'Kaufland')?.key).toBe('billa');
  });
});
