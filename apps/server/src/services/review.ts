import {
  convertMinor,
  formatMoney,
  type MonthlyReview,
  nextMonth,
  previousMonth,
  type ReviewCategory,
  type ReviewRecord,
} from '@dostotinka/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db';
import { budgets, categories, type UserRow } from '../db/schema';
import { toLocalDate, zonedTimeToUtc } from '../lib/dates';
import { spentFor } from './budgets';
import { getRateMap } from './rates';
import type { ReminderMessage } from './reminders';

const HISTORY_MONTHS = 6;

const monthStart = (month: string, tz: string) =>
  zonedTimeToUtc(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1, 0, 0, tz);

/** Months between two YYYY-MM values (b − a). */
const monthsBetween = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 +
  Number(b.slice(5, 7)) -
  Number(a.slice(5, 7));

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Accounts that count in statistics. */
const scope = (userId: string) =>
  sql`r.user_id = ${userId}::uuid and r.account_id in (select id from accounts where user_id = ${userId}::uuid and not exclude_from_stats)`;

/**
 * The review of `month` (YYYY-MM) for the data of `user`, in the time zone `tz`: totals, the
 * categories and payees money went to, what was different from the 6 months before, the largest
 * payments and how the monthly budgets ended.
 */
export async function monthlyReview(
  db: Database,
  user: UserRow,
  month: string,
  tz: string,
  now = new Date(),
): Promise<MonthlyReview> {
  const start = monthStart(month, tz);
  const end = monthStart(nextMonth(month), tz);
  let historyMonth = month;
  for (let i = 0; i < HISTORY_MONTHS; i++) historyMonth = previousMonth(historyMonth);
  const historyStart = monthStart(historyMonth, tz);
  const base = user.baseCurrency;

  const [rates, rows, firstRow, categoryRows, balanceRows, budgetRows] = await Promise.all([
    getRateMap(db, user.id, base),
    db.execute(sql`
      select r.id, r.type, r.amount, r.currency, r.occurred_at, r.category_id, r.payee, r.note
      from records r
      where ${scope(user.id)}
        and r.type in ('income', 'expense')
        and r.debt_id is null
        and r.occurred_at >= ${historyStart.toISOString()}::timestamptz
        and r.occurred_at < ${end.toISOString()}::timestamptz
    `) as unknown as Promise<
      {
        id: string;
        type: 'income' | 'expense';
        amount: string;
        currency: string;
        occurred_at: string | Date;
        category_id: string | null;
        payee: string | null;
        note: string | null;
      }[]
    >,
    db.execute(sql`
      select min(r.occurred_at) as first from records r
      where ${scope(user.id)} and r.type in ('income', 'expense')
    `) as unknown as Promise<{ first: string | Date | null }[]>,
    db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.userId, user.id)),
    db.execute(sql`
      select a.currency,
        sum(a.initial_balance + coalesce((select sum(r.amount) from records r
          where r.account_id = a.id and r.occurred_at < ${start.toISOString()}::timestamptz), 0))::bigint as before,
        sum(a.initial_balance + coalesce((select sum(r.amount) from records r
          where r.account_id = a.id and r.occurred_at < ${new Date(Math.min(end.getTime(), now.getTime())).toISOString()}::timestamptz), 0))::bigint as after
      from accounts a
      where a.user_id = ${user.id}::uuid and not a.exclude_from_stats
      group by a.currency
    `) as unknown as Promise<{ currency: string; before: string; after: string }[]>,
    db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, user.id), eq(budgets.period, 'month'))),
  ]);

  const toBase = (amount: number, currency: string) => convertMinor(amount, currency, base, rates);
  const parentOf = new Map(categoryRows.map((c) => [c.id, c.parentId]));
  const rootOf = (id: string | null) => {
    let current = id;
    for (let i = 0; current && parentOf.get(current) && i < 10; i++)
      current = parentOf.get(current)!;
    return current;
  };

  const first = firstRow[0]?.first
    ? toLocalDate(new Date(firstRow[0].first), tz).slice(0, 7)
    : null;
  // Months of history that had records at all (a new user has no "usual" yet).
  const months = first ? Math.max(0, Math.min(HISTORY_MONTHS, monthsBetween(first, month))) : 0;

  let income = 0;
  let expense = 0;
  let recordCount = 0;
  let historyIncome = 0;
  let historyExpense = 0;
  const byCategory = new Map<string | null, { amount: number; history: number }>();
  const historyAmounts = new Map<string | null, number[]>();
  const payees = new Map<string, { name: string; amount: number; count: number }>();
  const expenses: ReviewRecord[] = [];

  for (const r of rows) {
    const at = new Date(r.occurred_at);
    const value = Math.abs(toBase(Number(r.amount), r.currency));
    const inMonth = at >= start;
    const root = r.type === 'expense' ? rootOf(r.category_id) : null;
    if (inMonth) {
      recordCount++;
      if (r.type === 'income') {
        income += value;
        continue;
      }
      expense += value;
      const c = byCategory.get(root) ?? { amount: 0, history: 0 };
      c.amount += value;
      byCategory.set(root, c);
      const name = (r.payee || r.note || '').trim();
      if (name) {
        const key = name.toLocaleLowerCase();
        const p = payees.get(key) ?? { name, amount: 0, count: 0 };
        p.amount += value;
        p.count++;
        payees.set(key, p);
      }
      expenses.push({
        recordId: r.id,
        occurredAt: at.toISOString(),
        amount: value,
        payee: r.payee,
        note: r.note,
        categoryId: r.category_id,
        unusual: false,
      });
    } else if (months > 0) {
      if (r.type === 'income') {
        historyIncome += value;
        continue;
      }
      historyExpense += value;
      const c = byCategory.get(root) ?? { amount: 0, history: 0 };
      c.history += value;
      byCategory.set(root, c);
      // Unusual payments are judged within their own (sub)category.
      const list = historyAmounts.get(r.category_id) ?? [];
      list.push(value);
      historyAmounts.set(r.category_id, list);
    }
  }

  const typicalOf = (history: number) => (months ? Math.round(history / months) : 0);
  const categoryList: ReviewCategory[] = [...byCategory.entries()].map(([categoryId, c]) => ({
    categoryId,
    amount: c.amount,
    typical: typicalOf(c.history),
  }));

  // Notable differences: at least a quarter of the usual amount and 3 % of the month's spending.
  const threshold = Math.max(expense, typicalOf(historyExpense)) * 0.03;
  const changes = months
    ? categoryList
        .filter((c) => {
          const diff = Math.abs(c.amount - c.typical);
          return diff >= threshold && diff >= c.typical * 0.25 && diff > 0;
        })
        .sort((a, b) => Math.abs(b.amount - b.typical) - Math.abs(a.amount - a.typical))
        .slice(0, 5)
    : [];

  const largest = expenses
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((e) => {
      const history = historyAmounts.get(e.categoryId) ?? [];
      return { ...e, unusual: history.length >= 3 && e.amount >= 3 * median(history) };
    });

  const budgetResults = await Promise.all(
    budgetRows.map(async (b) => ({
      id: b.id,
      name: b.name,
      currency: b.currency,
      amount: b.amount,
      spent: await spentFor(db, user, b, start, end),
    })),
  );

  let balanceStart = 0;
  let balanceEnd = 0;
  for (const b of balanceRows) {
    balanceStart += toBase(Number(b.before), b.currency);
    balanceEnd += toBase(Number(b.after), b.currency);
  }

  return {
    month,
    partial: end > now,
    currency: base,
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    typical: { income: typicalOf(historyIncome), expense: typicalOf(historyExpense), months },
    balanceStart,
    balanceEnd,
    recordCount,
    categories: categoryList.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount),
    changes,
    payees: [...payees.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
    largest,
    budgets: budgetResults.sort((a, b) => b.spent / (b.amount || 1) - a.spent / (a.amount || 1)),
    firstMonth: first,
  };
}

// ───────────────────────────── Notification ─────────────────────────────

const MONTHS = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  bg: [
    'януари',
    'февруари',
    'март',
    'април',
    'май',
    'юни',
    'юли',
    'август',
    'септември',
    'октомври',
    'ноември',
    'декември',
  ],
};

/** The review as a short message for ntfy, Gotify, Discord … (null when nothing happened). */
export function reviewMessage(
  review: MonthlyReview,
  language: string,
  locale: string,
  categoryName: (id: string | null) => string,
): ReminderMessage | null {
  if (!review.recordCount) return null;
  const bg = language === 'bg';
  const money = (v: number) => formatMoney(v, review.currency, { locale });
  const monthName = `${(bg ? MONTHS.bg : MONTHS.en)[Number(review.month.slice(5, 7)) - 1]} ${review.month.slice(0, 4)}`;
  const lines: string[] = [];
  lines.push(
    bg
      ? `Приходи ${money(review.income)} · разходи ${money(review.expense)} · остават ${money(review.net)}`
      : `Income ${money(review.income)} · expenses ${money(review.expense)} · left ${money(review.net)}`,
  );
  if (review.typical.months) {
    const diff = review.expense - review.typical.expense;
    const pct = review.typical.expense
      ? Math.round((Math.abs(diff) / review.typical.expense) * 100)
      : 0;
    if (pct >= 5) {
      lines.push(
        bg
          ? `Разходите са с ${pct}% ${diff > 0 ? 'повече' : 'по-малко'} от обикновено.`
          : `You spent ${pct}% ${diff > 0 ? 'more' : 'less'} than usual.`,
      );
    }
  }
  const top = review.categories.slice(0, 3);
  if (top.length) {
    lines.push(
      `${bg ? 'Най-много' : 'Most'}: ${top.map((c) => `${categoryName(c.categoryId)} ${money(c.amount)}`).join(', ')}`,
    );
  }
  for (const c of review.changes.slice(0, 2)) {
    lines.push(
      `${categoryName(c.categoryId)}: ${money(c.amount)} (${bg ? 'обикновено' : 'usually'} ${money(c.typical)})`,
    );
  }
  const over = review.budgets.filter((b) => b.spent > b.amount);
  if (over.length) {
    lines.push(
      `${bg ? 'Надхвърлени бюджети' : 'Budgets over the limit'}: ${over.map((b) => b.name).join(', ')}`,
    );
  }
  return {
    title: bg ? `DoStotinka: преглед на ${monthName}` : `DoStotinka: your ${monthName} review`,
    lines,
    count: review.recordCount,
  };
}
