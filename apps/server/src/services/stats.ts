import {
  addDays,
  addMonthsClamped,
  type BalanceResponse,
  type CashflowResponse,
  type CategoryStatsResponse,
  convertMinor,
  type Interval,
  type RateMap,
  type StatsSummary,
  type TimeseriesResponse,
} from '@slavotax/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../db';
import type { UserRow } from '../db/schema';
import { toLocalDate } from '../lib/dates';
import { getRateMap } from './rates';

export interface StatsScope {
  from: Date;
  to: Date;
  accountIds?: string[];
  tz: string;
  /** Range to compare with; defaults to the same length right before `from`. */
  compareFrom?: Date;
  compareTo?: Date;
}

function comparison(scope: StatsScope): { from: Date; to: Date } {
  if (scope.compareFrom && scope.compareTo && scope.compareTo > scope.compareFrom) {
    return { from: scope.compareFrom, to: scope.compareTo };
  }
  const length = scope.to.getTime() - scope.from.getTime();
  return { from: new Date(scope.from.getTime() - length), to: scope.from };
}

interface Ctx {
  db: Database;
  user: UserRow;
  rates: RateMap;
  base: string;
}

async function context(db: Database, user: UserRow): Promise<Ctx> {
  const base = user.baseCurrency;
  return { db, user, base, rates: await getRateMap(db, user.id, base) };
}

function accountScope(userId: string, accountIds?: string[]): SQL {
  if (accountIds?.length) {
    return sql`r.account_id in (${sql.join(
      accountIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}) and r.user_id = ${userId}::uuid`;
  }
  return sql`r.user_id = ${userId}::uuid and r.account_id in (select id from accounts where user_id = ${userId}::uuid and not exclude_from_stats)`;
}

function accountTableScope(userId: string, accountIds?: string[]): SQL {
  if (accountIds?.length) {
    return sql`a.user_id = ${userId}::uuid and a.id in (${sql.join(
      accountIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;
  }
  return sql`a.user_id = ${userId}::uuid and not a.exclude_from_stats`;
}

const conv = (ctx: Ctx, amount: number, currency: string) =>
  convertMinor(Number(amount), currency, ctx.base, ctx.rates);

// ───────────────────────────── Buckets ─────────────────────────────

export function bucketStart(date: string, interval: Interval): string {
  if (interval === 'day') return date;
  if (interval === 'month') return `${date.slice(0, 7)}-01`;
  // ISO week (Monday) – matches PostgreSQL date_trunc('week').
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export function nextBucket(date: string, interval: Interval): string {
  if (interval === 'day') return addDays(date, 1);
  if (interval === 'week') return addDays(date, 7);
  return addMonthsClamped(date, 1, 1);
}

/** All bucket start dates covering [from, to) in the given time zone. */
export function bucketsFor(scope: StatsScope, interval: Interval, capAtNow = false): string[] {
  const end = capAtNow ? new Date(Math.min(scope.to.getTime(), Date.now())) : scope.to;
  const first = bucketStart(toLocalDate(scope.from, scope.tz), interval);
  const last = toLocalDate(new Date(Math.max(scope.from.getTime(), end.getTime() - 1)), scope.tz);
  const result: string[] = [];
  for (let b = first; b <= last && result.length < 5000; b = nextBucket(b, interval)) {
    result.push(b);
  }
  return result;
}

const bucketExpr = (interval: Interval, tz: string) =>
  sql`to_char(date_trunc(${interval}, r.occurred_at at time zone ${tz}), 'YYYY-MM-DD')`;

// ───────────────────────────── Summary ─────────────────────────────

export async function summary(
  db: Database,
  user: UserRow,
  scope: StatsScope,
): Promise<StatsSummary> {
  const ctx = await context(db, user);
  const prev = comparison(scope);

  const totals = async (from: Date, to: Date) => {
    const rows = (await db.execute(sql`
      select r.type, r.currency, sum(r.amount)::bigint as total, count(*)::int as cnt
      from records r
      where ${accountScope(user.id, scope.accountIds)}
        and r.type in ('income', 'expense')
        and r.occurred_at >= ${from.toISOString()}::timestamptz
        and r.occurred_at < ${to.toISOString()}::timestamptz
      group by r.type, r.currency
    `)) as unknown as { type: string; currency: string; total: string; cnt: number }[];
    let income = 0;
    let expense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    for (const r of rows) {
      const v = conv(ctx, Number(r.total), r.currency);
      if (r.type === 'income') {
        income += v;
        incomeCount += r.cnt;
      } else {
        expense += -v;
        expenseCount += r.cnt;
      }
    }
    return { income, expense, net: income - expense, incomeCount, expenseCount };
  };

  const [current, previous, balanceRows] = await Promise.all([
    totals(scope.from, scope.to),
    totals(prev.from, prev.to),
    db.execute(sql`
      select a.currency,
        sum(a.initial_balance + coalesce((
          select sum(r.amount) from records r
          where r.account_id = a.id and r.occurred_at < ${scope.to.toISOString()}::timestamptz
        ), 0))::bigint as balance
      from accounts a
      where ${accountTableScope(user.id, scope.accountIds)}
      group by a.currency
    `) as unknown as Promise<{ currency: string; balance: string }[]>,
  ]);

  const balance = balanceRows.reduce((acc, r) => acc + conv(ctx, Number(r.balance), r.currency), 0);
  const elapsedEnd = Math.min(scope.to.getTime(), Date.now());
  const days = Math.max(1, Math.ceil((elapsedEnd - scope.from.getTime()) / 86_400_000));

  return {
    currency: ctx.base,
    ...current,
    previous: { income: previous.income, expense: previous.expense, net: previous.net },
    balance,
    avgDailyExpense: Math.round(current.expense / days),
  };
}

// ───────────────────────────── Categories ─────────────────────────────

export async function categoryBreakdown(
  db: Database,
  user: UserRow,
  scope: StatsScope,
  type: 'expense' | 'income',
  parentId?: string,
): Promise<CategoryStatsResponse> {
  const ctx = await context(db, user);
  const prev = comparison(scope);
  const inCurrent = sql`r.occurred_at >= ${scope.from.toISOString()}::timestamptz and r.occurred_at < ${scope.to.toISOString()}::timestamptz`;
  const inPrevious = sql`r.occurred_at >= ${prev.from.toISOString()}::timestamptz and r.occurred_at < ${prev.to.toISOString()}::timestamptz`;

  const groupExpr = parentId ? sql`c.id` : sql`coalesce(c.parent_id, c.id)`;
  const parentFilter = parentId
    ? sql`and (c.id = ${parentId}::uuid or c.parent_id = ${parentId}::uuid)`
    : sql``;

  const rows = (await db.execute(sql`
    select ${groupExpr} as category_id, r.currency,
      coalesce(sum(r.amount) filter (where ${inCurrent}), 0)::bigint as total,
      count(*) filter (where ${inCurrent})::int as cnt,
      coalesce(sum(r.amount) filter (where ${inPrevious}), 0)::bigint as prev
    from records r
    left join categories c on c.id = r.category_id
    where ${accountScope(user.id, scope.accountIds)}
      and r.type = ${type}
      and ((${inCurrent}) or (${inPrevious}))
      ${parentFilter}
    group by 1, 2
  `)) as unknown as {
    category_id: string | null;
    currency: string;
    total: string;
    cnt: number;
    prev: string;
  }[];

  const sign = type === 'expense' ? -1 : 1;
  const map = new Map<string | null, { amount: number; count: number; previousAmount: number }>();
  for (const r of rows) {
    const entry = map.get(r.category_id) ?? { amount: 0, count: 0, previousAmount: 0 };
    entry.amount += sign * conv(ctx, Number(r.total), r.currency);
    entry.previousAmount += sign * conv(ctx, Number(r.prev), r.currency);
    entry.count += r.cnt;
    map.set(r.category_id, entry);
  }
  const items = [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .filter((i) => i.amount !== 0 || i.count > 0 || i.previousAmount !== 0)
    .sort((a, b) => b.amount - a.amount);
  return {
    currency: ctx.base,
    total: items.reduce((acc, i) => acc + i.amount, 0),
    items,
  };
}

// ───────────────────────────── Time series ─────────────────────────────

export async function timeseries(
  db: Database,
  user: UserRow,
  scope: StatsScope,
  interval: Interval,
  type: 'expense' | 'income',
  categoryId?: string,
): Promise<TimeseriesResponse> {
  const ctx = await context(db, user);
  let groupExpr = sql`coalesce(c.parent_id, c.id)`;
  let categoryFilter = sql``;
  if (categoryId) {
    const [cat] = (await db.execute(
      sql`select parent_id from categories where id = ${categoryId}::uuid and user_id = ${user.id}::uuid`,
    )) as unknown as { parent_id: string | null }[];
    if (cat && cat.parent_id === null) {
      groupExpr = sql`c.id`;
      categoryFilter = sql`and (c.id = ${categoryId}::uuid or c.parent_id = ${categoryId}::uuid)`;
    } else {
      groupExpr = sql`c.id`;
      categoryFilter = sql`and c.id = ${categoryId}::uuid`;
    }
  }

  const rows = (await db.execute(sql`
    select ${bucketExpr(interval, scope.tz)} as bucket, ${groupExpr} as category_id, r.currency,
      sum(r.amount)::bigint as total
    from records r
    left join categories c on c.id = r.category_id
    where ${accountScope(user.id, scope.accountIds)}
      and r.type = ${type}
      and r.occurred_at >= ${scope.from.toISOString()}::timestamptz
      and r.occurred_at < ${scope.to.toISOString()}::timestamptz
      ${categoryFilter}
    group by 1, 2, 3
  `)) as unknown as {
    bucket: string;
    category_id: string | null;
    currency: string;
    total: string;
  }[];

  const sign = type === 'expense' ? -1 : 1;
  const buckets = bucketsFor(scope, interval);
  const points = new Map(
    buckets.map((b) => [b, { date: b, total: 0, byCategory: {} as Record<string, number> }]),
  );
  for (const r of rows) {
    const point = points.get(r.bucket);
    if (!point) continue;
    const v = sign * conv(ctx, Number(r.total), r.currency);
    const key = r.category_id ?? 'uncategorized';
    point.byCategory[key] = (point.byCategory[key] ?? 0) + v;
    point.total += v;
  }
  return { currency: ctx.base, interval, points: [...points.values()] };
}

export async function cashflow(
  db: Database,
  user: UserRow,
  scope: StatsScope,
  interval: Interval,
): Promise<CashflowResponse> {
  const ctx = await context(db, user);
  const rows = (await db.execute(sql`
    select ${bucketExpr(interval, scope.tz)} as bucket, r.type, r.currency, sum(r.amount)::bigint as total
    from records r
    where ${accountScope(user.id, scope.accountIds)}
      and r.type in ('income', 'expense')
      and r.occurred_at >= ${scope.from.toISOString()}::timestamptz
      and r.occurred_at < ${scope.to.toISOString()}::timestamptz
    group by 1, 2, 3
  `)) as unknown as { bucket: string; type: string; currency: string; total: string }[];

  const points = new Map(
    bucketsFor(scope, interval).map((b) => [b, { date: b, income: 0, expense: 0, net: 0 }]),
  );
  for (const r of rows) {
    const p = points.get(r.bucket);
    if (!p) continue;
    const v = conv(ctx, Number(r.total), r.currency);
    if (r.type === 'income') p.income += v;
    else p.expense += -v;
    p.net = p.income - p.expense;
  }
  return { currency: ctx.base, interval, points: [...points.values()] };
}

// ───────────────────────────── Balance ─────────────────────────────

export async function balanceTrend(
  db: Database,
  user: UserRow,
  scope: StatsScope,
  interval: Interval,
): Promise<BalanceResponse> {
  const ctx = await context(db, user);
  const [startRows, deltaRows] = await Promise.all([
    db.execute(sql`
      select a.currency,
        sum(a.initial_balance + coalesce((
          select sum(r.amount) from records r
          where r.account_id = a.id and r.occurred_at < ${scope.from.toISOString()}::timestamptz
        ), 0))::bigint as balance
      from accounts a
      where ${accountTableScope(user.id, scope.accountIds)}
      group by a.currency
    `) as unknown as Promise<{ currency: string; balance: string }[]>,
    db.execute(sql`
      select ${bucketExpr(interval, scope.tz)} as bucket, r.currency, sum(r.amount)::bigint as total
      from records r
      where ${accountScope(user.id, scope.accountIds)}
        and r.occurred_at >= ${scope.from.toISOString()}::timestamptz
        and r.occurred_at < ${scope.to.toISOString()}::timestamptz
      group by 1, 2
    `) as unknown as Promise<{ bucket: string; currency: string; total: string }[]>,
  ]);

  // Track balances per currency so conversion uses current rates consistently.
  const running = new Map<string, number>();
  for (const r of startRows) running.set(r.currency, Number(r.balance));
  const deltas = new Map<string, { currency: string; total: number }[]>();
  for (const r of deltaRows) {
    const list = deltas.get(r.bucket) ?? [];
    list.push({ currency: r.currency, total: Number(r.total) });
    deltas.set(r.bucket, list);
  }

  const points = bucketsFor(scope, interval, true).map((date) => {
    for (const d of deltas.get(date) ?? []) {
      running.set(d.currency, (running.get(d.currency) ?? 0) + d.total);
    }
    let balance = 0;
    for (const [currency, value] of running) balance += conv(ctx, value, currency);
    return { date, balance };
  });
  return { currency: ctx.base, interval, points };
}
