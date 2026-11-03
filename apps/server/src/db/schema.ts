import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
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

export const accountTypeEnum = pgEnum('account_type', [
  'cash',
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
    isDemo: boolean('is_demo').notNull().default(false),
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
    ...timestamps,
  },
  (t) => [
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
