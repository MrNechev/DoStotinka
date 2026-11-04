import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CATEGORY_KINDS,
  INTERVALS,
  RECORD_TYPES,
  type RecordType,
  THEMES,
} from './constants';
import { isSupportedCurrency } from './currencies';
import { FREQUENCIES, isIsoDate } from './recurrence';

// ───────────────────────────── Primitives ─────────────────────────────

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
  /** Code from the authenticator app (or a recovery code) when two-factor login is enabled. */
  code: z.string().trim().max(20).optional(),
});
export type LoginInput = z.input<typeof loginInput>;

export const updateProfileInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().trim().toLowerCase().max(254).optional(),
  baseCurrency: currencyCode.optional(),
  timezone: z.string().min(1).max(64).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
  theme: z.enum(THEMES).optional(),
  locale: z.string().max(16).optional(),
  language: z.enum(['en', 'bg']).optional(),
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

/** Partial update: fields that are not sent stay unchanged (no defaults are applied). */
export const accountUpdateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  currency: currencyCode.optional(),
  initialBalance: minorAmount.optional(),
  color: hexColor.optional(),
  icon: iconName.nullable().optional(),
  excludeFromStats: z.boolean().optional(),
  archived: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
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
  /** Records of one debt (lending, borrowing and repayments). */
  debtId: uuid.optional(),
  /** Match `categoryIds` exactly instead of including their subcategories. */
  exactCategories: z.stringbool().optional(),
  /** Records without a category (combined with `categoryIds` as "or"). */
  uncategorized: z.stringbool().optional(),
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
    /** Record automatically on the due date. */
    autoConfirm: z.boolean().default(false),
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

export const statsQuery = z.object({
  from: isoDateTime,
  to: isoDateTime,
  accountIds: uuidList,
  tz: z.string().max(64).default('UTC'),
  /** Period to compare with (defaults to the same length right before `from`). */
  compareFrom: isoDateTime.optional(),
  compareTo: isoDateTime.optional(),
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

// ───────────────────────────── Import ─────────────────────────────

export const importAccountInput = z.object({
  /** Name of the account in the imported file (used by records to reference it). */
  key: z.string().min(1).max(120),
  /** Existing account to import into … */
  existingId: uuid.optional(),
  /** … or an account that should be created. */
  create: z
    .object({
      name: z.string().trim().min(1).max(60),
      type: z.enum(ACCOUNT_TYPES).default('checking'),
      currency: currencyCode,
      color: hexColor.default('#3B82F6'),
    })
    .optional(),
});

export const importRecordInput = z.object({
  accountKey: z.string().min(1).max(120),
  type: z.enum(RECORD_TYPES),
  amount: positiveMinorAmount,
  occurredAt: isoDateTime,
  categoryId: uuid.nullable().optional(),
  note: optionalText(500),
  payee: optionalText(120),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  /** For transfers: key of the destination account and the amount it received. */
  toAccountKey: z.string().min(1).max(120).optional(),
  toAmount: positiveMinorAmount.optional(),
});

export const importInput = z.object({
  accounts: z.array(importAccountInput).min(1).max(200),
  records: z.array(importRecordInput).min(1).max(50_000),
  /** Skip rows that already exist (same account, time and amount). */
  skipDuplicates: z.boolean().default(true),
});
export type ImportInput = z.input<typeof importInput>;
export type ImportRecordInput = z.input<typeof importRecordInput>;

export interface ImportResult {
  imported: number;
  skipped: number;
  accountsCreated: number;
  labelsCreated: number;
}

export const bulkUpdateInput = z
  .object({
    ids: z.array(uuid).min(1).max(2000),
    /** New category for expenses/incomes (null = uncategorized). Transfers are left untouched. */
    categoryId: uuid.nullable().optional(),
    /** Move expenses/incomes to another account with the same currency. */
    accountId: uuid.optional(),
    addLabelIds: z.array(uuid).max(20).optional(),
    removeLabelIds: z.array(uuid).max(20).optional(),
  })
  .refine(
    (v) =>
      v.categoryId !== undefined ||
      v.accountId !== undefined ||
      !!v.addLabelIds?.length ||
      !!v.removeLabelIds?.length,
    { message: 'Nothing to change' },
  );
export type BulkUpdateInput = z.input<typeof bulkUpdateInput>;

// ───────────────────────────── Goals ─────────────────────────────

export const goalInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  targetAmount: positiveMinorAmount,
  currency: currencyCode.optional(),
  accountId: uuid.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  savedAmount: minorAmount.optional(),
  color: hexColor.optional(),
  icon: iconName.optional(),
  note: optionalText(500),
});
export type GoalInput = z.input<typeof goalInput>;

export const goalContributionInput = z.object({
  /** Positive to add savings, negative to take money out. */
  amount: minorAmount.refine((v) => v !== 0, 'Amount cannot be zero'),
});

// ───────────────────────────── Debts ─────────────────────────────

export const DEBT_DIRECTIONS = ['lent', 'borrowed'] as const;
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

/** Money lent to or borrowed from someone. */
export const debtInput = z
  .object({
    direction: z.enum(DEBT_DIRECTIONS),
    person: z.string().trim().min(1, 'Name is required').max(80),
    amount: positiveMinorAmount,
    /** Day the money was lent or borrowed. */
    date: isoDate,
    /** Account the money left or arrived in; without one only the amount owed is tracked. */
    accountId: uuid.nullable().optional(),
    /** Currency of a debt without an account (defaults to the base currency). */
    currency: currencyCode.optional(),
    dueDate: isoDate.nullable().optional(),
    note: optionalText(500),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.date, {
    message: 'The due date cannot be before the date',
    path: ['dueDate'],
  });
export type DebtInput = z.input<typeof debtInput>;

export const debtUpdateInput = z.object({
  person: z.string().trim().min(1).max(80).optional(),
  dueDate: isoDate.nullable().optional(),
  note: optionalText(500),
  /** Close (settled or forgiven) or reopen the debt. */
  closed: z.boolean().optional(),
});
export type DebtUpdateInput = z.input<typeof debtUpdateInput>;

/** A repayment, or more money lent/borrowed, moving through an account. */
export const debtMovementInput = z.object({
  kind: z.enum(['repayment', 'increase']),
  amount: positiveMinorAmount,
  accountId: uuid,
  occurredAt: isoDateTime,
  note: optionalText(500),
});
export type DebtMovementInput = z.input<typeof debtMovementInput>;

// ───────────────────────────── Record templates ─────────────────────────────

/** A saved set of record values ("Coffee at work", "Rent") applied in the record editor. */
export const templateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: z.enum(RECORD_TYPES),
  accountId: uuid.nullable().optional(),
  toAccountId: uuid.nullable().optional(),
  categoryId: uuid.nullable().optional(),
  /** Positive amount in the account currency; empty = enter it each time. */
  amount: positiveMinorAmount.nullable().optional(),
  note: optionalText(500),
  payee: optionalText(120),
  labelIds: z.array(uuid).max(20).default([]),
});
export type TemplateInput = z.input<typeof templateInput>;

// ───────────────────────────── Administration ─────────────────────────────

export const adminCreateUserInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase().max(254),
  password: passwordSchema,
  isAdmin: z.boolean().default(false),
  baseCurrency: currencyCode.optional(),
});
export type AdminCreateUserInput = z.input<typeof adminCreateUserInput>;

export const adminUpdateUserInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isAdmin: z.boolean().optional(),
  password: passwordSchema.optional(),
  /** Switch off two-factor login (when the user lost their device and recovery codes). */
  disableTwoFactor: z.literal(true).optional(),
});

export const twoFactorCodeInput = z.object({ code: z.string().trim().min(1).max(20) });
export const passwordConfirmInput = z.object({ password: z.string().min(1).max(200) });
export type AdminUpdateUserInput = z.input<typeof adminUpdateUserInput>;

export const adminSettingsInput = z.object({
  registrationEnabled: z.boolean(),
});

// ───────────────────────────── Reminders ─────────────────────────────

export const NOTIFY_FORMATS = ['ntfy', 'gotify', 'discord', 'slack', 'json'] as const;
export type NotifyFormat = (typeof NOTIFY_FORMATS)[number];

export const reminderSettingsInput = z.object({
  /** Where reminders are sent; null switches them off. */
  url: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .nullable(),
  format: z.enum(NOTIFY_FORMATS).default('ntfy'),
  /** Local hour (0–23) after which the daily reminder is sent. */
  hour: z.number().int().min(0).max(23).default(8),
});
export type ReminderSettingsInput = z.input<typeof reminderSettingsInput>;
