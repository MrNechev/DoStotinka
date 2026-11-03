import type { CategoryKind } from './categories';
import type { AccountType, BudgetPeriod, Interval, RecordType } from './constants';
import type { Frequency } from './recurrence';

/** Public server configuration exposed to clients before login. */
export interface ServerConfig {
  version: string;
  registrationEnabled: boolean;
  demo: { enabled: boolean; email: string | null };
}

export interface User {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
  timezone: string;
  weekStartsOn: 0 | 1 | 6;
  theme: 'system' | 'light' | 'dark';
  locale: string;
  isDemo: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isDemo: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  accountCount: number;
  recordCount: number;
}

export interface AdminSettings {
  registrationEnabled: boolean;
  /** Value of ALLOW_REGISTRATION (used when no admin override is stored). */
  registrationDefault: boolean;
  demoEnabled: boolean;
  version: string;
}

export interface AuthResponse {
  user: User;
  /** Only present when `issueToken` was requested. */
  token?: string;
}

export interface Session {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
  /** Name of a personal API token (null for normal browser sessions). */
  name: string | null;
}

export interface CreatedToken {
  id: string;
  name: string;
  /** Shown only once. */
  token: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  /** Current balance in the account currency (minor units). */
  balance: number;
  color: string;
  icon: string | null;
  excludeFromStats: boolean;
  archived: boolean;
  sortOrder: number;
  note: string | null;
  recordCount: number;
  createdAt: string;
}

export interface Category {
  id: string;
  parentId: string | null;
  kind: CategoryKind;
  name: string;
  icon: string;
  /** Own colour; subcategories usually inherit the parent's colour (null). */
  color: string | null;
  archived: boolean;
  sortOrder: number;
  systemKey: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface RecordItem {
  id: string;
  accountId: string;
  type: RecordType;
  /** Signed amount in the account currency (minor units). Negative = money out. */
  amount: number;
  currency: string;
  categoryId: string | null;
  occurredAt: string;
  note: string | null;
  payee: string | null;
  labelIds: string[];
  transferGroupId: string | null;
  counterpartAccountId: string | null;
  /** Signed amount of the other side of a transfer (in its own currency). */
  counterpartAmount: number | null;
  plannedPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordPage {
  items: RecordItem[];
  nextCursor: string | null;
}

export interface PlannedPayment {
  id: string;
  name: string;
  type: RecordType;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amount: number;
  currency: string;
  note: string | null;
  payee: string | null;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  /** Next unpaid due date or null if the schedule has finished. */
  nextDueDate: string | null;
  /** Recorded automatically on the due date. */
  autoConfirm: boolean;
  paidCount: number;
  lastPaidAt: string | null;
  createdAt: string;
}

export interface UpcomingOccurrence {
  plannedPaymentId: string;
  dueDate: string;
  overdue: boolean;
}

export interface Budget {
  id: string;
  name: string;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  categoryIds: string[];
  accountIds: string[];
  color: string;
  createdAt: string;
}

export interface BudgetStatus extends Budget {
  periodStart: string;
  periodEnd: string;
  spent: number;
  remaining: number;
  /** 0..n where 1 = 100% of the budget used. */
  ratio: number;
  /** Fraction of the period that has elapsed (0..1). */
  elapsed: number;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currency: string;
  accountId: string | null;
  /** Saved so far: the linked account's balance (converted) or the manual amount. */
  currentAmount: number;
  savedAmount: number;
  targetDate: string | null;
  color: string;
  icon: string;
  note: string | null;
  /** 0..1+ */
  progress: number;
  /** Amount to save per month to reach the target on time (null without a date). */
  monthlyNeeded: number | null;
  achievedAt: string | null;
  createdAt: string;
}

export interface ExchangeRate {
  currency: string;
  /** Value of 1 unit of `currency` in the base currency. */
  rate: number;
  source: 'manual' | 'ecb' | 'fixed' | 'default';
  updatedAt: string;
}

export interface CurrenciesResponse {
  baseCurrency: string;
  rates: ExchangeRate[];
  /** Currencies used by the user's accounts. */
  usedCurrencies: string[];
}

// ───────────────────────────── Stats ─────────────────────────────

export interface StatsSummary {
  currency: string;
  income: number;
  expense: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  previous: { income: number; expense: number; net: number };
  /** Total balance of the selected accounts at the end of the period. */
  balance: number;
  /** Average daily spending in the period. */
  avgDailyExpense: number;
}

export interface CategoryStat {
  categoryId: string | null;
  amount: number;
  count: number;
  /** Amount in the previous period of equal length. */
  previousAmount: number;
}

export interface CategoryStatsResponse {
  currency: string;
  total: number;
  items: CategoryStat[];
}

export interface TimeseriesPoint {
  /** Bucket start date (YYYY-MM-DD) in the requested time zone. */
  date: string;
  total: number;
  /** Amount per top-level category id (or subcategory when filtered to a category). */
  byCategory: Record<string, number>;
}

export interface TimeseriesResponse {
  currency: string;
  interval: Interval;
  points: TimeseriesPoint[];
}

export interface CashflowPoint {
  date: string;
  income: number;
  expense: number;
  net: number;
}

export interface CashflowResponse {
  currency: string;
  interval: Interval;
  points: CashflowPoint[];
}

export interface BalancePoint {
  date: string;
  balance: number;
}

export interface BalanceResponse {
  currency: string;
  interval: Interval;
  points: BalancePoint[];
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}
