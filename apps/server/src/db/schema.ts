import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const money = (name: string) => bigint(name, { mode: 'number' });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const accountTypeEnum = pgEnum('account_type', [
  'cash',
  'food_voucher',
  'checking',
  'savings',
  'credit_card',
  'deposit',
  'investment',
  'loan',
  'other',
]);
export const recordTypeEnum = pgEnum('record_type', ['expense', 'income', 'transfer']);
export const categoryKindEnum = pgEnum('category_kind', ['expense', 'income']);
export const frequencyEnum = pgEnum('frequency', ['once', 'daily', 'weekly', 'monthly', 'yearly']);
export const debtDirectionEnum = pgEnum('debt_direction', ['lent', 'borrowed']);
export const budgetPeriodEnum = pgEnum('budget_period', ['week', 'month', 'year']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    baseCurrency: varchar('base_currency', { length: 3 }).notNull().default('EUR'),
    timezone: text('timezone').notNull().default('UTC'),
    weekStartsOn: smallint('week_starts_on').notNull().default(1),
    theme: text('theme').notNull().default('system'),
    locale: text('locale').notNull().default('en'),
    /** UI language, used for texts generated on the server (reminders). */
    language: varchar('language', { length: 5 }).notNull().default('en'),
    isDemo: boolean('is_demo').notNull().default(false),
    isAdmin: boolean('is_admin').notNull().default(false),
    /** `sub` claim of the linked single sign-on (OpenID Connect) identity. */
    oidcSubject: text('oidc_subject').unique(),
    /** Two-factor authentication (TOTP): the active secret (base32) – null = disabled. */
    totpSecret: text('totp_secret'),
    /** Secret shown during setup, activated once a code from it is confirmed. */
    totpPendingSecret: text('totp_pending_secret'),
    /** Last accepted time step – codes cannot be used twice. */
    totpLastStep: integer('totp_last_step'),
    /** SHA-256 hashes of the unused recovery codes. */
    recoveryCodes: jsonb('recovery_codes').$type<string[]>().notNull().default([]),
    /** Reminder delivery: where and how to send daily planned-payment reminders. */
    notifyUrl: text('notify_url'),
    notifyFormat: text('notify_format').notNull().default('ntfy'),
    notifyHour: smallint('notify_hour').notNull().default(8),
    lastNotifiedOn: date('last_notified_on', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token – the raw token is never stored. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    /** Set for personal API tokens (long-lived, created in Settings). */
    name: text('name'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull().default('checking'),
    currency: varchar('currency', { length: 3 }).notNull(),
    initialBalance: money('initial_balance').notNull().default(0),
    color: varchar('color', { length: 7 }).notNull(),
    icon: text('icon'),
    excludeFromStats: boolean('exclude_from_stats').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    kind: categoryKindEnum('kind').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: varchar('color', { length: 7 }),
    archived: boolean('archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Stable key of the default template this category was created from. */
    systemKey: text('system_key'),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: 'categories_parent_fk',
    }).onDelete('cascade'),
    index('categories_user_idx').on(t.userId),
    index('categories_parent_idx').on(t.parentId),
    uniqueIndex('categories_user_system_key_idx')
      .on(t.userId, t.systemKey)
      .where(sql`${t.systemKey} is not null`),
  ],
);

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: varchar('color', { length: 7 }).notNull(),
    ...timestamps,
  },
  (t) => [index('labels_user_idx').on(t.userId)],
);

export const plannedPayments = pgTable(
  'planned_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: recordTypeEnum('type').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    toAccountId: uuid('to_account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    /** Positive amount in the account currency (minor units). */
    amount: money('amount').notNull(),
    note: text('note'),
    payee: text('payee'),
    frequency: frequencyEnum('frequency').notNull(),
    interval: integer('interval').notNull().default(1),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    nextDueDate: date('next_due_date', { mode: 'string' }),
    /** Create the record automatically on the due date instead of waiting for confirmation. */
    autoConfirm: boolean('auto_confirm').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('planned_payments_user_idx').on(t.userId)],
);

/**
 * Money lent to or borrowed from a person. Money movements are records linked via
 * `records.debt_id` (they change account balances but are not income or expenses); an amount
 * that never went through an account is kept in `opening_amount`.
 */
export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    direction: debtDirectionEnum('direction').notNull(),
    person: text('person').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    /** Positive amount owed before any linked record (minor units of `currency`). */
    openingAmount: money('opening_amount').notNull().default(0),
    date: date('date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    note: text('note'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('debts_user_idx').on(t.userId)],
);

export const records = pgTable(
  'records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: recordTypeEnum('type').notNull(),
    /** Signed amount in the account currency (minor units). */
    amount: money('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    note: text('note'),
    payee: text('payee'),
    /** Shared by both sides of a transfer. */
    transferGroupId: uuid('transfer_group_id'),
    counterpartAccountId: uuid('counterpart_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    plannedPaymentId: uuid('planned_payment_id').references(() => plannedPayments.id, {
      onDelete: 'set null',
    }),
    /** Due date of the planned payment occurrence this record settled. */
    plannedDueDate: date('planned_due_date', { mode: 'string' }),
    /** Lending, borrowing or a repayment – excluded from income/expense statistics. */
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [
    index('records_debt_idx').on(t.debtId),
    index('records_user_date_idx').on(t.userId, t.occurredAt),
    index('records_account_date_idx').on(t.accountId, t.occurredAt),
    index('records_category_idx').on(t.categoryId),
    index('records_transfer_idx').on(t.transferGroupId),
    index('records_planned_idx').on(t.plannedPaymentId),
  ],
);

export const recordLabels = pgTable(
  'record_labels',
  {
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.labelId] }),
    index('record_labels_label_idx').on(t.labelId),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    amount: money('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    period: budgetPeriodEnum('period').notNull().default('month'),
    categoryIds: uuid('category_ids').array().notNull().default(sql`'{}'::uuid[]`),
    accountIds: uuid('account_ids').array().notNull().default(sql`'{}'::uuid[]`),
    color: varchar('color', { length: 7 }).notNull().default('#22C55E'),
    ...timestamps,
  },
  (t) => [index('budgets_user_idx').on(t.userId)],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetAmount: money('target_amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    /** Manually saved amount (used when no account is linked). */
    savedAmount: money('saved_amount').notNull().default(0),
    /** When set, the goal's progress is the balance of this account. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    targetDate: date('target_date', { mode: 'string' }),
    color: varchar('color', { length: 7 }).notNull().default('#10B981'),
    icon: text('icon').notNull().default('piggy-bank'),
    note: text('note'),
    achievedAt: timestamp('achieved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('goals_user_idx').on(t.userId)],
);

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    /** Value of 1 unit of `currency` in the user's base currency. */
    rate: numeric('rate', { precision: 30, scale: 12, mode: 'number' }).notNull(),
    source: text('source').notNull().default('manual'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.currency] })],
);

/** Saved record values the user can apply in the record editor. */
export const recordTemplates = pgTable(
  'record_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: recordTypeEnum('type').notNull(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    toAccountId: uuid('to_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    /** Positive amount in the account currency (minor units); null = entered each time. */
    amount: money('amount'),
    note: text('note'),
    payee: text('payee'),
    labelIds: jsonb('label_ids').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index('record_templates_user_idx').on(t.userId)],
);

/**
 * Files (receipts, invoices) attached to records. There is deliberately no foreign key to
 * `records`: editing a record replaces its rows (keeping their ids), which would cascade. Orphans
 * are removed when records are deleted and by a periodic sweep.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recordId: uuid('record_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attachments_record_idx').on(t.recordId),
    index('attachments_user_idx').on(t.userId),
  ],
);

/** Server-wide settings changed by administrators (key → JSON value). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Global cache of the latest ECB reference rates (EUR based). */
export const referenceRates = pgTable('reference_rates', {
  currency: varchar('currency', { length: 3 }).primaryKey(),
  /** Units of `currency` per 1 EUR. */
  perEur: numeric('per_eur', { precision: 30, scale: 12, mode: 'number' }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
export type PlannedPaymentRow = typeof plannedPayments.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type LabelRow = typeof labels.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type RecordTemplateRow = typeof recordTemplates.$inferSelect;
export type DebtRow = typeof debts.$inferSelect;
