import { FIXED_EUR_RATES, isSupportedCurrency, type RateMap } from '@slavotax/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '../db';
import { accounts, exchangeRates, referenceRates } from '../db/schema';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;

/** Units of each currency per 1 EUR from the cached ECB data plus fixed legacy rates. */
export async function loadPerEur(db: Tx): Promise<Map<string, number>> {
  const rows = await db.select().from(referenceRates);
  const map = new Map<string, number>([['EUR', 1]]);
  for (const r of rows) map.set(r.currency, Number(r.perEur));
  for (const [code, rate] of Object.entries(FIXED_EUR_RATES)) map.set(code, rate);
  return map;
}

/** Value of 1 unit of `currency` in `base` according to reference data (or null). */
export function referenceRate(
  perEur: Map<string, number>,
  currency: string,
  base: string,
): { rate: number; source: 'ecb' | 'fixed' } | null {
  const c = perEur.get(currency);
  const b = perEur.get(base);
  if (!c || !b) return null;
  const fixed = currency in FIXED_EUR_RATES && (base === 'EUR' || base in FIXED_EUR_RATES);
  return { rate: b / c, source: fixed ? 'fixed' : 'ecb' };
}

/** Rate map (currency → value in base currency) for a user, always including the base. */
export async function getRateMap(db: Tx, userId: string, base: string): Promise<RateMap> {
  const rows = await db
    .select({ currency: exchangeRates.currency, rate: exchangeRates.rate })
    .from(exchangeRates)
    .where(eq(exchangeRates.userId, userId));
  const map: Record<string, number> = {};
  for (const r of rows) map[r.currency] = Number(r.rate);
  map[base] = 1;
  return map;
}

/** Makes sure the user has an exchange rate for `currency` (creating a sensible default). */
export async function ensureRate(db: Tx, userId: string, base: string, currency: string) {
  if (currency === base || !isSupportedCurrency(currency)) return;
  const [existing] = await db
    .select({ currency: exchangeRates.currency })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.userId, userId), eq(exchangeRates.currency, currency)));
  if (existing) return;
  const ref = referenceRate(await loadPerEur(db), currency, base);
  await db
    .insert(exchangeRates)
    .values({
      userId,
      currency,
      rate: ref?.rate ?? 1,
      source: ref?.source ?? 'default',
    })
    .onConflictDoNothing();
}

/** Re-applies reference rates to all non-manual rates of a user. */
export async function applyReferenceRates(db: Tx, userId: string, base: string): Promise<number> {
  const perEur = await loadPerEur(db);
  const rows = await db
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.userId, userId), ne(exchangeRates.source, 'manual')));
  let updated = 0;
  for (const row of rows) {
    const ref = referenceRate(perEur, row.currency, base);
    if (!ref) continue;
    await db
      .update(exchangeRates)
      .set({ rate: ref.rate, source: ref.source, updatedAt: new Date() })
      .where(and(eq(exchangeRates.userId, userId), eq(exchangeRates.currency, row.currency)));
    updated++;
  }
  return updated;
}

/**
 * Rebases all stored rates when the user changes the base currency.
 * new_rate(c) = old_rate(c) / old_rate(newBase)
 */
export async function rebaseRates(db: Tx, userId: string, oldBase: string, newBase: string) {
  if (oldBase === newBase) return;
  const map = await getRateMap(db, userId, oldBase);
  const perEur = await loadPerEur(db);
  const pivot = map[newBase] ?? referenceRate(perEur, newBase, oldBase)?.rate ?? null;
  await db.delete(exchangeRates).where(eq(exchangeRates.userId, userId));
  const used = await db
    .selectDistinct({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const currencies = new Set([...Object.keys(map), ...used.map((u) => u.currency)]);
  currencies.delete(newBase);
  const values = [...currencies].map((currency) => {
    const ref = referenceRate(perEur, currency, newBase);
    if (ref) return { userId, currency, rate: ref.rate, source: ref.source };
    const old = map[currency];
    if (pivot && old) return { userId, currency, rate: old / pivot, source: 'manual' };
    return { userId, currency, rate: 1, source: 'default' };
  });
  if (values.length) await db.insert(exchangeRates).values(values);
}

/** Downloads the ECB daily reference rates into the shared cache. */
export async function refreshReferenceRates(db: Database, url: string): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ECB responded with ${res.status}`);
  const xml = await res.text();
  const dateMatch = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml);
  const date = dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);
  const rates: { currency: string; perEur: number }[] = [];
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const perEur = Number(m[2]);
    if (perEur > 0) rates.push({ currency: m[1]!, perEur });
  }
  if (!rates.length) throw new Error('No rates found in ECB response');
  for (const r of rates) {
    await db
      .insert(referenceRates)
      .values({ currency: r.currency, perEur: r.perEur, date })
      .onConflictDoUpdate({
        target: referenceRates.currency,
        set: { perEur: r.perEur, date, updatedAt: new Date() },
      });
  }
  return rates.length;
}

export async function usedCurrencies(db: Tx, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return rows.map((r) => r.currency).sort();
}
