import type { BrandInfo, PayeeUsage } from '@dostotinka/shared';
import { type Brand, payeeBrand, suggestBrands } from '@/lib/brand-icons';
import { matchNotes } from '@/lib/notes';

export interface PayeeSuggestion {
  name: string;
  /** Logo, when the payee is a known shop or service. */
  brand?: Brand;
  /** Known shop without logo (category hint only). */
  info?: BrandInfo;
  /** Used before (otherwise a known shop). */
  used: boolean;
}

/**
 * Payees for what was typed: the user's own payees first (most used first), then known shops
 * and services that were not used yet.
 */
export function matchPayees(usage: PayeeUsage[], typed: string, max = 6): PayeeSuggestion[] {
  const own = matchNotes(
    usage.map((u) => ({ note: u.payee, count: u.count })),
    typed,
    max,
  ).map((name) => ({ name, brand: payeeBrand(name), used: true }));
  const taken = new Set(own.map((s) => s.name.toLocaleLowerCase()));
  const takenBrands = new Set(own.map((s) => s.brand?.key).filter(Boolean));
  const typedLower = typed.trim().toLocaleLowerCase();
  const brands: PayeeSuggestion[] = [];
  for (const b of suggestBrands(typed, max)) {
    const key = 'key' in b ? b.key : b.id;
    if (taken.has(b.name.toLocaleLowerCase()) || takenBrands.has(key)) continue;
    if (b.name.toLocaleLowerCase() === typedLower) continue;
    brands.push(
      'src' in b ? { name: b.name, brand: b, used: false } : { name: b.name, info: b, used: false },
    );
  }
  return [...own, ...brands].slice(0, max);
}
