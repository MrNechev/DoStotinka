import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CATEGORY_KINDS,
  FREQUENCIES,
  RECORD_TYPES,
} from '@slavotax/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db';
import {
  accounts,
  attachments,
  budgets,
  categories,
  debts,
  exchangeRates,
  goals,
  labels,
  plannedPayments,
  recordLabels,
  records,
  recordTemplates,
  type UserRow,
  users,
} from '../db/schema';
import { isValidTimeZone } from '../lib/dates';

const id = z.string().min(1).max(100);
const nullableId = id.nullable().optional();
const text = z.string().max(2000);
const date = z.coerce.date();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().int().min(-1e15).max(1e15);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Shape of `GET /api/export/backup.json` (version 1). Unknown fields are ignored. */
export const backupSchema = z.object({
  format: z.literal('slavotax-backup'),
  version: z.literal(1),
  user: z
    .object({
      baseCurrency: z.string().length(3),
      timezone: z.string().max(64).optional(),
      weekStartsOn: z.number().int().optional(),
      theme: z.string().max(10).optional(),
      locale: z.string().max(16).optional(),
    })
    .optional(),
  accounts: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(60),
        type: z.enum(ACCOUNT_TYPES),
        currency: z.string().length(3),
        initialBalance: money,
        color,
        icon: z.string().max(48).nullable().optional(),
        excludeFromStats: z.boolean().default(false),
        archived: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
        note: text.nullable().optional(),
      }),
    )
    .max(1000),
  categories: z
    .array(
      z.object({
        id,
        parentId: nullableId,
        kind: z.enum(CATEGORY_KINDS),
        name: z.string().min(1).max(60),
        icon: z.string().max(48),
        color: color.nullable().optional(),
        archived: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
        systemKey: z.string().max(100).nullable().optional(),
      }),
    )
    .max(5000),
  labels: z.array(z.object({ id, name: z.string().min(1).max(40), color })).max(1000),
  records: z
    .array(
      z.object({
        id,
        accountId: id,
        type: z.enum(RECORD_TYPES),
        amount: money,
        currency: z.string().length(3),
        categoryId: nullableId,
        occurredAt: date,
        note: text.nullable().optional(),
        payee: z.string().max(120).nullable().optional(),
        transferGroupId: nullableId,
        counterpartAccountId: nullableId,
        plannedPaymentId: nullableId,
        plannedDueDate: day.nullable().optional(),
        debtId: nullableId,
        createdAt: date.optional(),
      }),
    )
    .max(500_000),
  debts: z
    .array(
      z.object({
        id,
        direction: z.enum(['lent', 'borrowed']),
        person: z.string().min(1).max(80),
        currency: z.string().length(3),
        openingAmount: money.default(0),
        date: day,
        dueDate: day.nullable().optional(),
        note: text.nullable().optional(),
        closedAt: date.nullable().optional(),
      }),
    )
    .max(10_000)
    .default([]),
  recordLabels: z
    .array(z.object({ recordId: id, labelId: id }))
    .max(1_000_000)
    .default([]),
  plannedPayments: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(80),
        type: z.enum(RECORD_TYPES),
        accountId: id,
        toAccountId: nullableId,
        categoryId: nullableId,
        amount: money,
        note: text.nullable().optional(),
        payee: z.string().max(120).nullable().optional(),
        frequency: z.enum(FREQUENCIES),
        interval: z.number().int().min(1).max(366),
        startDate: day,
        endDate: day.nullable().optional(),
        nextDueDate: day.nullable().optional(),
        autoConfirm: z.boolean().default(false),
      }),
    )
    .max(5000)
    .default([]),
  budgets: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(60),
        amount: money,
        currency: z.string().length(3),
        period: z.enum(BUDGET_PERIODS),
        categoryIds: z.array(id).default([]),
        accountIds: z.array(id).default([]),
        color,
      }),
    )
    .max(1000)
    .default([]),
  goals: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(60),
        targetAmount: money,
        currency: z.string().length(3),
        savedAmount: money.default(0),
        accountId: nullableId,
        targetDate: day.nullable().optional(),
        color,
        icon: z.string().max(48),
        note: text.nullable().optional(),
        achievedAt: date.nullable().optional(),
      }),
    )
    .max(1000)
    .default([]),
  templates: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        type: z.enum(['expense', 'income', 'transfer']),
        accountId: nullableId,
        toAccountId: nullableId,
        categoryId: nullableId,
        amount: money.nullable().optional(),
        note: text.nullable().optional(),
        payee: text.nullable().optional(),
        labelIds: z.array(id).max(20).default([]),
      }),
    )
    .max(1000)
    .default([]),
  exchangeRates: z
    .array(
      z.object({
        currency: z.string().length(3),
        rate: z.number().positive(),
        source: z.string().max(20),
      }),
    )
    .max(500)
    .default([]),
});
export type Backup = z.infer<typeof backupSchema>;

export interface RestoreResult {
  accounts: number;
  categories: number;
  records: number;
  plannedPayments: number;
  budgets: number;
  goals: number;
  templates: number;
  debts: number;
}

/** Replaces all data of `user` with the contents of a backup (all IDs are re-generated). */
export async function restoreBackup(
  db: Database,
  user: UserRow,
  backup: Backup,
): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    // Attachments are not part of a JSON backup; they belong to records that are replaced.
    for (const table of [
      attachments,
      recordTemplates,
      records,
      debts,
      plannedPayments,
      budgets,
      goals,
      labels,
      accounts,
      categories,
      exchangeRates,
    ]) {
      await tx.delete(table).where(eq(table.userId, user.id));
    }

    const remap = () => {
      const map = new Map<string, string>();
      return {
        map,
        get: (old: string | null | undefined) => (old ? (map.get(old) ?? null) : null),
        fresh: (old: string) => {
          const next = randomUUID();
          map.set(old, next);
          return next;
        },
      };
    };
    const acc = remap();
    const cat = remap();
    const lab = remap();
    const plan = remap();
    const rec = remap();
    const group = remap();
    const chunked = async <T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 1000) => {
      for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
    };

    if (backup.user) {
      const u = backup.user;
      await tx
        .update(users)
        .set({
          baseCurrency: u.baseCurrency,
          ...(u.timezone && isValidTimeZone(u.timezone) ? { timezone: u.timezone } : {}),
          ...(u.weekStartsOn === 0 || u.weekStartsOn === 1 || u.weekStartsOn === 6
            ? { weekStartsOn: u.weekStartsOn }
            : {}),
        })
        .where(eq(users.id, user.id));
    }

    const accountRows = backup.accounts.map((a) => ({
      id: acc.fresh(a.id),
      userId: user.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      initialBalance: a.initialBalance,
      color: a.color,
      icon: a.icon ?? null,
      excludeFromStats: a.excludeFromStats,
      archived: a.archived,
      sortOrder: a.sortOrder,
      note: a.note ?? null,
    }));
    await chunked(accountRows, (c) => tx.insert(accounts).values(c));

    // Parents first so the self reference can be resolved.
    for (const c of backup.categories) cat.fresh(c.id);
    const sortedCategories = [...backup.categories].sort(
      (a, b) => Number(!!a.parentId) - Number(!!b.parentId),
    );
    await chunked(
      sortedCategories.map((c) => ({
        id: cat.get(c.id)!,
        userId: user.id,
        parentId: cat.get(c.parentId),
        kind: c.kind,
        name: c.name,
        icon: c.icon,
        color: c.color ?? null,
        archived: c.archived,
        sortOrder: c.sortOrder,
        systemKey: c.systemKey ?? null,
      })),
      (c) => tx.insert(categories).values(c),
    );

    await chunked(
      backup.labels.map((l) => ({
        id: lab.fresh(l.id),
        userId: user.id,
        name: l.name,
        color: l.color,
      })),
      (c) => tx.insert(labels).values(c),
    );

    const plannedRows = backup.plannedPayments
      .filter((p) => acc.get(p.accountId))
      .map((p) => ({
        id: plan.fresh(p.id),
        userId: user.id,
        name: p.name,
        type: p.type,
        accountId: acc.get(p.accountId)!,
        toAccountId: acc.get(p.toAccountId),
        categoryId: cat.get(p.categoryId),
        amount: p.amount,
        note: p.note ?? null,
        payee: p.payee ?? null,
        frequency: p.frequency,
        interval: p.interval,
        startDate: p.startDate,
        endDate: p.endDate ?? null,
        nextDueDate: p.nextDueDate ?? null,
        autoConfirm: p.autoConfirm,
      }));
    await chunked(plannedRows, (c) => tx.insert(plannedPayments).values(c));

    const debt = remap();
    await chunked(
      backup.debts.map((d) => ({
        id: debt.fresh(d.id),
        userId: user.id,
        direction: d.direction,
        person: d.person,
        currency: d.currency,
        openingAmount: Math.max(0, d.openingAmount),
        date: d.date,
        dueDate: d.dueDate ?? null,
        note: d.note ?? null,
        closedAt: d.closedAt ?? null,
      })),
      (c) => tx.insert(debts).values(c),
    );

    const recordRows = backup.records
      .filter((r) => acc.get(r.accountId))
      .map((r) => ({
        id: rec.fresh(r.id),
        userId: user.id,
        accountId: acc.get(r.accountId)!,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        categoryId: cat.get(r.categoryId),
        occurredAt: r.occurredAt,
        note: r.note ?? null,
        payee: r.payee ?? null,
        transferGroupId: r.transferGroupId
          ? (group.get(r.transferGroupId) ?? group.fresh(r.transferGroupId))
          : null,
        counterpartAccountId: acc.get(r.counterpartAccountId),
        plannedPaymentId: plan.get(r.plannedPaymentId),
        plannedDueDate: r.plannedDueDate ?? null,
        debtId: debt.get(r.debtId),
        createdAt: r.createdAt ?? r.occurredAt,
      }));
    await chunked(recordRows, (c) => tx.insert(records).values(c));

    const links = backup.recordLabels
      .map((l) => ({ recordId: rec.get(l.recordId), labelId: lab.get(l.labelId) }))
      .filter((l): l is { recordId: string; labelId: string } => !!l.recordId && !!l.labelId);
    const uniqueLinks = [...new Map(links.map((l) => [`${l.recordId}|${l.labelId}`, l])).values()];
    await chunked(uniqueLinks, (c) => tx.insert(recordLabels).values(c), 2000);

    await chunked(
      backup.budgets.map((b) => ({
        userId: user.id,
        name: b.name,
        amount: b.amount,
        currency: b.currency,
        period: b.period,
        categoryIds: b.categoryIds.map((x) => cat.get(x)).filter((x): x is string => !!x),
        accountIds: b.accountIds.map((x) => acc.get(x)).filter((x): x is string => !!x),
        color: b.color,
      })),
      (c) => tx.insert(budgets).values(c),
    );

    await chunked(
      backup.goals.map((g) => ({
        userId: user.id,
        name: g.name,
        targetAmount: g.targetAmount,
        currency: g.currency,
        savedAmount: g.savedAmount,
        accountId: acc.get(g.accountId),
        targetDate: g.targetDate ?? null,
        color: g.color,
        icon: g.icon,
        note: g.note ?? null,
        achievedAt: g.achievedAt ?? null,
      })),
      (c) => tx.insert(goals).values(c),
    );

    await chunked(
      backup.templates.map((t) => ({
        userId: user.id,
        name: t.name,
        type: t.type,
        accountId: acc.get(t.accountId),
        toAccountId: acc.get(t.toAccountId),
        categoryId: cat.get(t.categoryId),
        amount: t.amount && t.amount > 0 ? t.amount : null,
        note: t.note ?? null,
        payee: t.payee ?? null,
        labelIds: t.labelIds.map((x) => lab.get(x)).filter((x): x is string => !!x),
      })),
      (c) => tx.insert(recordTemplates).values(c),
    );

    const rates = backup.exchangeRates.filter(
      (r) => r.currency !== (backup.user?.baseCurrency ?? user.baseCurrency),
    );
    if (rates.length) {
      await tx
        .insert(exchangeRates)
        .values(
          rates.map((r) => ({
            userId: user.id,
            currency: r.currency,
            rate: r.rate,
            source: r.source,
          })),
        )
        .onConflictDoNothing();
    }

    return {
      accounts: accountRows.length,
      categories: backup.categories.length,
      records: recordRows.length,
      plannedPayments: plannedRows.length,
      budgets: backup.budgets.length,
      goals: backup.goals.length,
      templates: backup.templates.length,
      debts: backup.debts.length,
    };
  });
}
