import { z } from 'zod';
import { isSupportedCurrency } from './currencies';
import { FREQUENCIES, isIsoDate } from './recurrence';

// ───────────────────────────── Primitives ─────────────────────────────

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

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => isSupportedCurrency(v), { message: 'Unsupported currency' });

export const isoDate = z.string().refine(isIsoDate, { message: 'Expected a date (YYYY-MM-DD)' });
export const isoDateTime = z.iso.datetime({ offset: true });
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour like #22C55E');
export const iconName = z.string().regex(/^[a-z0-9-]{1,48}$/, 'Invalid icon name');
export const uuid = z.uuid();
/** Integer amount in minor units (cents). */
export const minorAmount = z.number().int().min(-1e15).max(1e15);
export const positiveMinorAmount = z.number().int().positive().max(1e15);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Comma separated list of UUIDs in a query string → string[]. */
export const uuidList = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const parts = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      if (!uuid.safeParse(p).success) {
        ctx.addIssue({ code: 'custom', message: `Invalid id: ${p}` });
        return z.NEVER;
      }
    }
    return parts;
  });

// ───────────────────────────── Auth & user ─────────────────────────────

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const registerInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.email().trim().toLowerCase().max(254),
  password: passwordSchema,
  baseCurrency: currencyCode.optional(),
  timezone: z.string().max(64).optional(),
});
export type RegisterInput = z.input<typeof registerInput>;

export const loginInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
  /** Return a bearer token in the response body (for API / mobile clients). */
  issueToken: z.boolean().optional(),
});
export type LoginInput = z.input<typeof loginInput>;

export const THEMES = ['system', 'light', 'dark'] as const;

export const updateProfileInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().trim().toLowerCase().max(254).optional(),
  baseCurrency: currencyCode.optional(),
  timezone: z.string().max(64).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
  theme: z.enum(THEMES).optional(),
  locale: z.string().max(16).optional(),
});
export type UpdateProfileInput = z.input<typeof updateProfileInput>;

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const deleteAccountInput = z.object({
  password: z.string().min(1).max(200),
});

// ───────────────────────────── Accounts ─────────────────────────────

export const accountInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: z.enum(ACCOUNT_TYPES),
  currency: currencyCode,
  initialBalance: minorAmount.default(0),
  color: hexColor,
  icon: iconName.optional().nullable(),
  excludeFromStats: z.boolean().default(false),
  archived: z.boolean().default(false),
  note: optionalText(500),
});
export type AccountInput = z.input<typeof accountInput>;

export const accountUpdateInput = accountInput.partial();
export type AccountUpdateInput = z.input<typeof accountUpdateInput>;

export const adjustBalanceInput = z.object({
  /** The desired current balance in minor units. */
  balance: minorAmount,
  /** When true a correction record is created, otherwise the starting balance is changed. */
  createRecord: z.boolean().default(false),
  occurredAt: isoDateTime.optional(),
});

export const reorderInput = z.object({ ids: z.array(uuid).max(500) });

// ───────────────────────────── Categories ─────────────────────────────

export const categoryInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  kind: z.enum(CATEGORY_KINDS).default('expense'),
  parentId: uuid.optional().nullable(),
  icon: iconName,
  color: hexColor.optional().nullable(),
});
export type CategoryInput = z.input<typeof categoryInput>;

export const categoryUpdateInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  icon: iconName.optional(),
  color: hexColor.optional().nullable(),
  archived: z.boolean().optional(),
  parentId: uuid.optional().nullable(),
});
export type CategoryUpdateInput = z.input<typeof categoryUpdateInput>;

// ───────────────────────────── Records ─────────────────────────────

const recordCommon = {
  accountId: uuid,
  amount: positiveMinorAmount,
  occurredAt: isoDateTime,
  note: optionalText(500),
  payee: optionalText(120),
  labelIds: z.array(uuid).max(20).optional(),
};

export const expenseIncomeInput = z.object({
  type: z.enum(['expense', 'income']),
  ...recordCommon,
  categoryId: uuid.nullable().optional(),
});

export const transferInput = z.object({
  type: z.literal('transfer'),
  ...recordCommon,
  toAccountId: uuid,
  /** Amount received by the destination account (needed when currencies differ). */
  toAmount: positiveMinorAmount.optional(),
});

export const recordInput = z.discriminatedUnion('type', [expenseIncomeInput, transferInput]);
export type RecordInput = z.input<typeof recordInput>;

export const recordListQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  accountIds: uuidList,
  categoryIds: uuidList,
  labelIds: uuidList,
  types: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? (v
            .split(',')
            .filter((t) => (RECORD_TYPES as readonly string[]).includes(t)) as RecordType[])
        : undefined,
    ),
  search: z.string().trim().max(100).optional(),
  minAmount: z.coerce.number().int().optional(),
  maxAmount: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().max(200).optional(),
});
export type RecordListQuery = z.input<typeof recordListQuery>;

// ───────────────────────────── Labels ─────────────────────────────

export const labelInput = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor,
});
export type LabelInput = z.input<typeof labelInput>;

// ───────────────────────────── Planned payments ─────────────────────────────

export const plannedPaymentInput = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    type: z.enum(RECORD_TYPES),
    accountId: uuid,
    toAccountId: uuid.optional().nullable(),
    categoryId: uuid.optional().nullable(),
    amount: positiveMinorAmount,
    note: optionalText(500),
    payee: optionalText(120),
    frequency: z.enum(FREQUENCIES),
    interval: z.number().int().min(1).max(366).default(1),
    startDate: isoDate,
    endDate: isoDate.optional().nullable(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  })
  .refine((v) => v.type !== 'transfer' || !!v.toAccountId, {
    message: 'Choose the destination account',
    path: ['toAccountId'],
  });
export type PlannedPaymentInput = z.input<typeof plannedPaymentInput>;

export const plannedPaymentPayInput = z.object({
  /** Which due date is being confirmed (defaults to the next due date). */
  dueDate: isoDate.optional(),
  amount: positiveMinorAmount.optional(),
  toAmount: positiveMinorAmount.optional(),
  accountId: uuid.optional(),
  occurredAt: isoDateTime.optional(),
  note: optionalText(500),
});

// ───────────────────────────── Budgets ─────────────────────────────

export const budgetInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  amount: positiveMinorAmount,
  period: z.enum(BUDGET_PERIODS),
  categoryIds: z.array(uuid).max(200).default([]),
  accountIds: z.array(uuid).max(200).default([]),
  color: hexColor.optional(),
});
export type BudgetInput = z.input<typeof budgetInput>;

// ───────────────────────────── Stats ─────────────────────────────

export const INTERVALS = ['day', 'week', 'month'] as const;
export type Interval = (typeof INTERVALS)[number];

export const statsQuery = z.object({
  from: isoDateTime,
  to: isoDateTime,
  accountIds: uuidList,
  tz: z.string().max(64).default('UTC'),
});
export type StatsQuery = z.input<typeof statsQuery>;

export const categoryStatsQuery = statsQuery.extend({
  type: z.enum(['expense', 'income']).default('expense'),
  /** When given, breaks down the subcategories of this top-level category. */
  parentId: uuid.optional(),
});

export const timeseriesQuery = statsQuery.extend({
  interval: z.enum(INTERVALS).default('day'),
  type: z.enum(['expense', 'income']).default('expense'),
  /** Optional filter to a single (top-level or sub) category. */
  categoryId: uuid.optional(),
});

export const balanceQuery = statsQuery.extend({
  interval: z.enum(INTERVALS).default('day'),
});

export const cashflowQuery = statsQuery.extend({
  interval: z.enum(INTERVALS).default('month'),
});

// ───────────────────────────── Currencies ─────────────────────────────

export const ratesUpdateInput = z.object({
  rates: z
    .array(
      z.object({
        currency: currencyCode,
        /** Value of 1 unit of `currency` expressed in the user's base currency. */
        rate: z.number().positive().max(1e9),
      }),
    )
    .max(200),
});
