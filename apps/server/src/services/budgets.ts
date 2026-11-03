import {
  addDays,
  addMonthsClamped,
  type BudgetPeriod,
  type BudgetStatus,
  convertMinor,
} from '@slavotax/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../db';
import type { BudgetRow, UserRow } from '../db/schema';
import { toLocalDate, zonedTimeToUtc } from '../lib/dates';
import { toBudget } from './dto';
import { getRateMap } from './rates';
import { expandCategoryIds } from './records';

export function periodRange(
  period: BudgetPeriod,
  tz: string,
  weekStartsOn: number,
  now = new Date(),
  offset = 0,
): { start: string; end: string; startUtc: Date; endUtc: Date } {
  const today = toLocalDate(now, tz);
  let start: string;
  let end: string;
  if (period === 'week') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    start = addDays(today, -((dow - weekStartsOn + 7) % 7) + offset * 7);
    end = addDays(start, 7);
  } else if (period === 'month') {
    start = addMonthsClamped(`${today.slice(0, 7)}-01`, offset, 1);
    end = addMonthsClamped(start, 1, 1);
  } else {
    start = `${Number(today.slice(0, 4)) + offset}-01-01`;
    end = `${Number(today.slice(0, 4)) + offset + 1}-01-01`;
  }
  const toUtc = (d: string) =>
    zonedTimeToUtc(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)), 0, 0, tz);
  return { start, end, startUtc: toUtc(start), endUtc: toUtc(end) };
}

export async function spentFor(
  db: Database,
  user: UserRow,
  budget: Pick<BudgetRow, 'categoryIds' | 'accountIds' | 'currency'>,
  from: Date,
  to: Date,
): Promise<number> {
  const conditions: SQL[] = [
    sql`r.user_id = ${user.id}::uuid`,
    sql`r.type = 'expense'`,
    sql`r.occurred_at >= ${from.toISOString()}::timestamptz`,
    sql`r.occurred_at < ${to.toISOString()}::timestamptz`,
  ];
  if (budget.accountIds.length) {
    conditions.push(
      sql`r.account_id in (${sql.join(
        budget.accountIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  } else {
    conditions.push(
      sql`r.account_id in (select id from accounts where user_id = ${user.id}::uuid and not exclude_from_stats)`,
    );
  }
  if (budget.categoryIds.length) {
    const expanded = await expandCategoryIds(db, user.id, budget.categoryIds);
    conditions.push(
      sql`r.category_id in (${sql.join(
        expanded.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  const rows = (await db.execute(sql`
    select r.currency, sum(r.amount)::bigint as total
    from records r
    where ${sql.join(conditions, sql` and `)}
    group by r.currency
  `)) as unknown as { currency: string; total: string }[];
  const rates = await getRateMap(db, user.id, user.baseCurrency);
  return rows.reduce(
    (acc, r) => acc - convertMinor(Number(r.total), r.currency, budget.currency, rates),
    0,
  );
}

export async function budgetStatus(
  db: Database,
  user: UserRow,
  budget: BudgetRow,
  tz: string,
  offset = 0,
): Promise<BudgetStatus> {
  const range = periodRange(budget.period, tz, user.weekStartsOn, new Date(), offset);
  const spent = await spentFor(db, user, budget, range.startUtc, range.endUtc);
  const total = range.endUtc.getTime() - range.startUtc.getTime();
  const elapsed = Math.min(1, Math.max(0, (Date.now() - range.startUtc.getTime()) / total));
  return {
    ...toBudget(budget),
    periodStart: range.start,
    periodEnd: addDays(range.end, -1),
    spent,
    remaining: budget.amount - spent,
    ratio: budget.amount > 0 ? spent / budget.amount : 0,
    elapsed,
  };
}
