/** The monthly review: what happened in one month compared with the months before. */

export interface ReviewCategory {
  /** Top-level category (null = uncategorised). */
  categoryId: string | null;
  amount: number;
  /** Average of the months before (see `typical.months`). */
  typical: number;
}

export interface ReviewPayee {
  /** Payee, or the note when a record has no payee. */
  name: string;
  amount: number;
  count: number;
}

export interface ReviewRecord {
  recordId: string;
  occurredAt: string;
  /** In the main currency. */
  amount: number;
  payee: string | null;
  note: string | null;
  categoryId: string | null;
  /** Much more than usual for its category. */
  unusual: boolean;
}

export interface ReviewBudget {
  id: string;
  name: string;
  currency: string;
  amount: number;
  spent: number;
}

export interface MonthlyReview {
  /** YYYY-MM */
  month: string;
  /** The month is not over yet. */
  partial: boolean;
  currency: string;
  income: number;
  expense: number;
  net: number;
  /** Share of the income that was not spent (null without income). */
  savingsRate: number | null;
  /** Average of up to 6 months before (only months since the first record). */
  typical: { income: number; expense: number; months: number };
  /** Balance of all accounts (that count in statistics) at the start and end of the month. */
  balanceStart: number;
  balanceEnd: number;
  recordCount: number;
  /** Expenses per top-level category, largest first. */
  categories: ReviewCategory[];
  /** Categories with the biggest differences to the usual months. */
  changes: ReviewCategory[];
  payees: ReviewPayee[];
  /** The largest expenses. */
  largest: ReviewRecord[];
  /** Monthly budgets and how they ended. */
  budgets: ReviewBudget[];
  /** First month with records (YYYY-MM) – for browsing. */
  firstMonth: string | null;
}

/** "2026-11" → "2026-10". */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** "2026-11" → "2026-12". */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
