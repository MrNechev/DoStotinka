// Plain constants shared by server and web (kept free of runtime dependencies).

export const ACCOUNT_TYPES = [
  'cash',
  'checking',
  'savings',
  'credit_card',
  'deposit',
  'investment',
  'loan',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  checking: 'Bank account',
  savings: 'Savings account',
  credit_card: 'Credit card',
  deposit: 'Deposit',
  investment: 'Investment',
  loan: 'Loan / mortgage',
  other: 'Other',
};

export const RECORD_TYPES = ['expense', 'income', 'transfer'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const CATEGORY_KINDS = ['expense', 'income'] as const;

export const BUDGET_PERIODS = ['week', 'month', 'year'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const INTERVALS = ['day', 'week', 'month'] as const;
export type Interval = (typeof INTERVALS)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
