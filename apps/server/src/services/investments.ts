import {
  convertMinor,
  currencyDecimals,
  type Holding,
  type HoldingKind,
  type holdingInput,
  holdingValue,
  isSupportedCurrency,
  type NetWorth,
  type PriceSource,
  type Quote,
} from '@dostotinka/shared';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Config } from '../config';
import type { Database } from '../db';
import {
  accounts,
  debts,
  type HoldingRow,
  holdings,
  investmentSnapshots,
  type UserRow,
  users,
} from '../db/schema';
import { safeTimeZone, toLocalDate, zonedTimeToUtc } from '../lib/dates';
import { badRequest, notFound } from '../lib/errors';
import { presentDebts } from './debts';
import { getRateMap } from './rates';

type Input = z.output<typeof holdingInput>;

export function toHolding(h: HoldingRow): Holding {
  const value = holdingValue(h.quantity, h.price, currencyDecimals(h.currency));
  return {
    id: h.id,
    accountId: h.accountId,
    name: h.name,
    symbol: h.symbol,
    kind: h.kind as HoldingKind,
    quantity: h.quantity,
    price: h.price,
    currency: h.currency,
    costBasis: h.costBasis,
    priceSource: h.priceSource as PriceSource,
    priceUpdatedAt: h.priceUpdatedAt?.toISOString() ?? null,
    value,
    gain: value - h.costBasis,
    createdAt: h.createdAt.toISOString(),
  };
}

export async function listHoldings(db: Database, userId: string): Promise<Holding[]> {
  const rows = await db
    .select()
    .from(holdings)
    .where(eq(holdings.userId, userId))
    .orderBy(asc(holdings.name));
  return rows.map(toHolding);
}

async function checkAccount(db: Database, userId: string, accountId: string) {
  const [account] = await db
    .select({ type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!account) throw badRequest('Unknown account');
  if (account.type !== 'investment') throw badRequest('Holdings belong to an investment account');
}

function values(input: Input) {
  if (!isSupportedCurrency(input.currency)) throw badRequest('Unsupported currency');
  return {
    accountId: input.accountId,
    name: input.name,
    symbol: input.symbol,
    kind: input.kind,
    quantity: input.quantity,
    price: input.price,
    currency: input.currency,
    costBasis: input.costBasis,
    priceSource: input.priceSource,
  };
}

export async function createHolding(db: Database, user: UserRow, input: Input): Promise<Holding> {
  await checkAccount(db, user.id, input.accountId);
  const [row] = await db
    .insert(holdings)
    .values({ ...values(input), userId: user.id, priceUpdatedAt: new Date() })
    .returning();
  await snapshotInvestments(db, user);
  return toHolding(row!);
}

export async function updateHolding(
  db: Database,
  user: UserRow,
  id: string,
  input: Input,
): Promise<Holding> {
  await checkAccount(db, user.id, input.accountId);
  const [existing] = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)));
  if (!existing) throw notFound('Holding');
  const next = values(input);
  const [row] = await db
    .update(holdings)
    .set({
      ...next,
      priceUpdatedAt: next.price !== existing.price ? new Date() : existing.priceUpdatedAt,
    })
    .where(eq(holdings.id, id))
    .returning();
  await snapshotInvestments(db, user);
  return toHolding(row!);
}

export async function deleteHolding(db: Database, user: UserRow, id: string): Promise<void> {
  const rows = await db
    .delete(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)))
    .returning({ id: holdings.id });
  if (!rows.length) throw notFound('Holding');
  await snapshotInvestments(db, user);
}

// ───────────────────────────── Prices ─────────────────────────────

/** Currencies quoted in their minor unit by Yahoo (London pence, Israeli agorot …). */
const MINOR_QUOTES: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ILA: 'ILS', ZAc: 'ZAR' };

const YAHOO_KINDS: Record<string, HoldingKind> = {
  EQUITY: 'stock',
  ETF: 'etf',
  MUTUALFUND: 'fund',
  CRYPTOCURRENCY: 'crypto',
};

/** The current price of a ticker (Yahoo Finance) or coin (CoinGecko). */
export async function fetchQuote(
  config: Config,
  source: 'yahoo' | 'coingecko',
  symbol: string,
  currency: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Quote> {
  const headers = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (DoStotinka)' };
  const signal = AbortSignal.timeout(15_000);
  if (source === 'yahoo') {
    const url = `${config.YAHOO_FINANCE_URL}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetchImpl(url, { headers, signal });
    if (res.status === 404) throw badRequest(`Yahoo Finance does not know “${symbol}”`);
    if (!res.ok) throw new Error(`Yahoo Finance answered with HTTP ${res.status}`);
    const body = (await res.json()) as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            currency?: string;
            longName?: string;
            shortName?: string;
            instrumentType?: string;
          };
        }[];
      };
    };
    const meta = body.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number' || !meta.currency) {
      throw badRequest(`No price for “${symbol}”`);
    }
    const minor = MINOR_QUOTES[meta.currency];
    return {
      symbol,
      price: minor ? meta.regularMarketPrice / 100 : meta.regularMarketPrice,
      currency: (minor ?? meta.currency).toUpperCase(),
      name: meta.longName ?? meta.shortName ?? null,
      kind: YAHOO_KINDS[meta.instrumentType ?? ''] ?? null,
    };
  }
  const id = symbol.toLowerCase();
  const vs = currency.toLowerCase();
  const url = `${config.COINGECKO_URL}/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(vs)}`;
  const res = await fetchImpl(url, { headers, signal });
  if (!res.ok) throw new Error(`CoinGecko answered with HTTP ${res.status}`);
  const body = (await res.json()) as Record<string, Record<string, number>>;
  const price = body[id]?.[vs];
  if (typeof price !== 'number') throw badRequest(`CoinGecko does not know “${symbol}”`);
  return { symbol: id, price, currency: currency.toUpperCase(), name: null, kind: 'crypto' };
}

/**
 * Updates the prices of all holdings with an automatic source (of one user or everybody).
 * Each ticker is asked for once. Returns the number of holdings updated.
 */
export async function refreshPrices(
  db: Database,
  config: Config,
  userId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ updated: number; failed: string[] }> {
  const rows = await db
    .select()
    .from(holdings)
    .where(
      and(ne(holdings.priceSource, 'manual'), userId ? eq(holdings.userId, userId) : undefined),
    );
  const groups = new Map<string, HoldingRow[]>();
  for (const h of rows) {
    if (!h.symbol) continue;
    const key = `${h.priceSource}|${h.symbol.toLowerCase()}|${h.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  let updated = 0;
  const failed: string[] = [];
  for (const list of groups.values()) {
    const first = list[0]!;
    try {
      const quote = await fetchQuote(
        config,
        first.priceSource as 'yahoo' | 'coingecko',
        first.symbol!,
        first.currency,
        fetchImpl,
      );
      // A price in another currency than the holding would be wrong.
      if (quote.currency !== first.currency) {
        failed.push(first.symbol!);
        continue;
      }
      await db
        .update(holdings)
        .set({ price: quote.price, priceUpdatedAt: new Date() })
        .where(
          inArray(
            holdings.id,
            list.map((h) => h.id),
          ),
        );
      updated += list.length;
    } catch {
      failed.push(first.symbol!);
    }
  }
  const owners = [...new Set(rows.map((h) => h.userId))];
  for (const id of owners) {
    const [owner] = await db.select().from(users).where(eq(users.id, id));
    if (owner) await snapshotInvestments(db, owner);
  }
  return { updated, failed };
}

// ───────────────────────────── Gains & net worth ─────────────────────────────

/** Unrealised gain of the holdings per account, in the account currency. */
export async function holdingGains(db: Database, user: UserRow): Promise<Map<string, number>> {
  const rows = await db
    .select({ holding: holdings, accountCurrency: accounts.currency })
    .from(holdings)
    .innerJoin(accounts, eq(accounts.id, holdings.accountId))
    .where(eq(holdings.userId, user.id));
  const gains = new Map<string, number>();
  if (!rows.length) return gains;
  const rates = await getRateMap(db, user.id, user.baseCurrency);
  for (const { holding, accountCurrency } of rows) {
    const h = toHolding(holding);
    const gain = convertMinor(h.gain, h.currency, accountCurrency, rates);
    gains.set(holding.accountId, (gains.get(holding.accountId) ?? 0) + gain);
  }
  return gains;
}

/** Stores today's total gain (main currency) for the net worth chart. */
export async function snapshotInvestments(db: Database, user: UserRow): Promise<void> {
  const rows = await db.select().from(holdings).where(eq(holdings.userId, user.id));
  const rates = await getRateMap(db, user.id, user.baseCurrency);
  const gain = rows.reduce((sum, row) => {
    const h = toHolding(row);
    return sum + convertMinor(h.gain, h.currency, user.baseCurrency, rates);
  }, 0);
  const date = toLocalDate(new Date(), safeTimeZone(user.timezone));
  await db
    .insert(investmentSnapshots)
    .values({ userId: user.id, date, gain })
    .onConflictDoUpdate({
      target: [investmentSnapshots.userId, investmentSnapshots.date],
      set: { gain },
    });
}

/** Last day of each of the `months` months up to now (YYYY-MM-DD), plus today. */
function monthEnds(today: string, months: number): string[] {
  const dates: string[] = [];
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < months; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    dates.unshift(`${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
  }
  dates.push(today);
  return dates;
}

/**
 * Net worth: the value of all accounts (balances plus investment gains) and the money lent minus
 * the money borrowed – with the history of the last `months` month ends.
 */
export async function netWorth(
  db: Database,
  user: UserRow,
  tz: string,
  months: number,
): Promise<NetWorth> {
  const base = user.baseCurrency;
  const [rates, accountRows, debtRows, gains, snapshots] = await Promise.all([
    getRateMap(db, user.id, base),
    db.execute(sql`
      select a.id, a.type, a.currency, a.archived,
        a.initial_balance + coalesce((select sum(r.amount) from records r where r.account_id = a.id), 0) as balance
      from accounts a where a.user_id = ${user.id}::uuid
    `) as unknown as Promise<
      { id: string; type: string; currency: string; archived: boolean; balance: string }[]
    >,
    db.select().from(debts).where(eq(debts.userId, user.id)),
    holdingGains(db, user),
    db
      .select()
      .from(investmentSnapshots)
      .where(eq(investmentSnapshots.userId, user.id))
      .orderBy(asc(investmentSnapshots.date)),
  ]);
  const toBase = (v: number, currency: string) => convertMinor(v, currency, base, rates);

  const groups = new Map<string, number>();
  let assets = 0;
  let liabilities = 0;
  let investmentGain = 0;
  const add = (key: string, amount: number) => {
    if (!amount) return;
    groups.set(key, (groups.get(key) ?? 0) + amount);
    if (amount > 0) assets += amount;
    else liabilities += amount;
  };
  for (const a of accountRows) {
    const gain = gains.get(a.id) ?? 0;
    investmentGain += toBase(gain, a.currency);
    add(a.type, toBase(Number(a.balance) + gain, a.currency));
  }
  for (const d of await presentDebts(db, user, debtRows)) {
    if (d.outstanding <= 0) continue;
    const amount = toBase(d.outstanding, d.currency);
    add(d.direction === 'lent' ? 'lent' : 'borrowed', d.direction === 'lent' ? amount : -amount);
  }

  // History: account balances at each month end + the investment gain known at that day.
  const today = toLocalDate(new Date(), tz);
  const dates = monthEnds(today, Math.max(1, Math.min(months, 120)));
  const ends = dates.map((d) => {
    const next = new Date(`${d}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return d === today
      ? new Date()
      : zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
  });
  const balanceRows = (await db.execute(sql`
    select e.idx, a.currency,
      sum(a.initial_balance + coalesce((select sum(r.amount) from records r
        where r.account_id = a.id and r.occurred_at < e.at), 0))::bigint as balance
    from accounts a
    cross join unnest(${sql.raw(`array[${ends.map((e) => `'${e.toISOString()}'::timestamptz`).join(',')}]`)}) with ordinality as e(at, idx)
    where a.user_id = ${user.id}::uuid
    group by e.idx, a.currency
  `)) as unknown as { idx: string; currency: string; balance: string }[];
  const byIndex = new Map<number, number>();
  for (const r of balanceRows) {
    const i = Number(r.idx) - 1;
    byIndex.set(i, (byIndex.get(i) ?? 0) + toBase(Number(r.balance), r.currency));
  }
  const gainAt = (date: string) => {
    let value = 0;
    for (const s of snapshots) {
      if (s.date > date) break;
      value = s.gain;
    }
    return value;
  };
  const history = dates.map((date, i) => ({
    date,
    value: (byIndex.get(i) ?? 0) + (i === dates.length - 1 ? investmentGain : gainAt(date)),
  }));

  return {
    currency: base,
    total: assets + liabilities,
    assets,
    liabilities,
    investmentGain,
    groups: [...groups.entries()]
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount),
    history,
  };
}
