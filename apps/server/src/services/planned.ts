import {
  nextOccurrence,
  occurrencesBetween,
  type PlannedPayment,
  type plannedPaymentInput,
  type plannedPaymentPayInput,
  type RecurrenceRule,
  type UpcomingOccurrence,
} from '@slavotax/shared';
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db';
import {
  accounts,
  categories,
  type PlannedPaymentRow,
  plannedPayments,
  records,
  type UserRow,
  users,
} from '../db/schema';
import { safeTimeZone, toLocalDate, zonedTimeToUtc } from '../lib/dates';
import { badRequest, conflict, notFound } from '../lib/errors';
import { toPlannedPayment } from './dto';
import { createRecord } from './records';

type PlannedInput = z.output<typeof plannedPaymentInput>;
type PayInput = z.output<typeof plannedPaymentPayInput>;

const ruleOf = (
  p: Pick<PlannedPaymentRow, 'frequency' | 'interval' | 'startDate' | 'endDate'>,
): RecurrenceRule => ({
  frequency: p.frequency,
  interval: p.interval,
  startDate: p.startDate,
  endDate: p.endDate,
});

async function validateRefs(db: Database, userId: string, input: PlannedInput) {
  const ids = [input.accountId, input.toAccountId].filter((x): x is string => !!x);
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.id, ids)));
  if (owned.length !== new Set(ids).size) throw notFound('Account');
  if (input.type === 'transfer' && input.toAccountId === input.accountId) {
    throw badRequest('Choose two different accounts for a transfer');
  }
  if (input.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, input.categoryId)));
    if (!cat) throw notFound('Category');
  }
}

async function present(
  db: Database,
  userId: string,
  rows: PlannedPaymentRow[],
): Promise<PlannedPayment[]> {
  if (!rows.length) return [];
  const accountRows = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const currencyOf = new Map(accountRows.map((a) => [a.id, a.currency]));
  const statRows = await db
    .select({
      id: records.plannedPaymentId,
      count: sql<number>`count(distinct coalesce(${records.transferGroupId}, ${records.id}))::int`,
      last: sql<string | null>`max(${records.occurredAt})`,
    })
    .from(records)
    .where(
      and(
        eq(records.userId, userId),
        inArray(
          records.plannedPaymentId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(records.plannedPaymentId);
  const stats = new Map(statRows.map((s) => [s.id, s]));
  return rows.map((r) => {
    const s = stats.get(r.id);
    return toPlannedPayment(r, currencyOf.get(r.accountId) ?? 'EUR', {
      paidCount: s?.count ?? 0,
      lastPaidAt: s?.last ? new Date(s.last) : null,
    });
  });
}

export async function listPlanned(db: Database, userId: string): Promise<PlannedPayment[]> {
  const rows = await db
    .select()
    .from(plannedPayments)
    .where(eq(plannedPayments.userId, userId))
    .orderBy(sql`${plannedPayments.nextDueDate} asc nulls last`, asc(plannedPayments.name));
  return present(db, userId, rows);
}

async function getOwned(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(plannedPayments)
    .where(and(eq(plannedPayments.id, id), eq(plannedPayments.userId, userId)));
  if (!row) throw notFound('Planned payment');
  return row;
}

export async function getPlanned(db: Database, userId: string, id: string) {
  const row = await getOwned(db, userId, id);
  return (await present(db, userId, [row]))[0]!;
}

export async function createPlanned(db: Database, userId: string, input: PlannedInput) {
  await validateRefs(db, userId, input);
  const nextDueDate = nextOccurrence(
    ruleOf({ ...input, endDate: input.endDate ?? null }),
    input.startDate,
    true,
  );
  const [row] = await db
    .insert(plannedPayments)
    .values({
      userId,
      name: input.name,
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === 'transfer' ? (input.toAccountId ?? null) : null,
      categoryId: input.type === 'transfer' ? null : (input.categoryId ?? null),
      amount: input.amount,
      note: input.note,
      payee: input.payee,
      frequency: input.frequency,
      interval: input.interval,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextDueDate,
      autoConfirm: input.autoConfirm,
    })
    .returning();
  return (await present(db, userId, [row!]))[0]!;
}

export async function updatePlanned(db: Database, userId: string, id: string, input: PlannedInput) {
  const existing = await getOwned(db, userId, id);
  await validateRefs(db, userId, input);
  const rule = ruleOf({ ...input, endDate: input.endDate ?? null });
  const scheduleChanged =
    existing.frequency !== input.frequency ||
    existing.interval !== input.interval ||
    existing.startDate !== input.startDate ||
    existing.endDate !== (input.endDate ?? null);
  let nextDueDate = existing.nextDueDate;
  if (scheduleChanged) {
    // Keep already settled occurrences settled: continue from the previous position.
    if (existing.nextDueDate) {
      const from = input.startDate > existing.nextDueDate ? input.startDate : existing.nextDueDate;
      nextDueDate = nextOccurrence(rule, from, true);
    } else {
      // The schedule had finished: everything up to its old end was paid or skipped.
      const settledUntil = existing.endDate ?? existing.startDate;
      nextDueDate =
        input.startDate > settledUntil
          ? nextOccurrence(rule, input.startDate, true)
          : nextOccurrence(rule, settledUntil, false);
    }
  }
  const [row] = await db
    .update(plannedPayments)
    .set({
      name: input.name,
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === 'transfer' ? (input.toAccountId ?? null) : null,
      categoryId: input.type === 'transfer' ? null : (input.categoryId ?? null),
      amount: input.amount,
      note: input.note,
      payee: input.payee,
      frequency: input.frequency,
      interval: input.interval,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextDueDate,
      autoConfirm: input.autoConfirm,
    })
    .where(eq(plannedPayments.id, existing.id))
    .returning();
  return (await present(db, userId, [row!]))[0]!;
}

export async function deletePlanned(db: Database, userId: string, id: string) {
  const existing = await getOwned(db, userId, id);
  await db.delete(plannedPayments).where(eq(plannedPayments.id, existing.id));
}

const dueIs = (value: string | null) =>
  value === null ? isNull(plannedPayments.nextDueDate) : eq(plannedPayments.nextDueDate, value);

/**
 * Atomically moves the schedule from `from` to `to` (compare-and-set). Returns false when another
 * request (a double click, the auto-confirm job …) already settled this occurrence.
 */
async function moveDue(db: Database, id: string, from: string | null, to: string | null) {
  const rows = await db
    .update(plannedPayments)
    .set({ nextDueDate: to })
    .where(and(eq(plannedPayments.id, id), dueIs(from)))
    .returning({ id: plannedPayments.id });
  return rows.length > 0;
}

/** Claims the next due occurrence of a plan; throws 409 when it is already settled. */
async function claimNext(db: Database, row: PlannedPaymentRow) {
  if (!row.nextDueDate) throw badRequest('This planned payment has no open occurrences');
  const next = nextOccurrence(ruleOf(row), row.nextDueDate, false);
  if (!(await moveDue(db, row.id, row.nextDueDate, next))) {
    throw conflict('This occurrence has already been confirmed or skipped');
  }
  return { due: row.nextDueDate, next };
}

/** Confirms the next due occurrence: creates the record and advances the schedule. */
export async function payPlanned(db: Database, user: UserRow, id: string, input: PayInput) {
  const row = await getOwned(db, user.id, id);
  if (!row.nextDueDate) throw badRequest('This planned payment has no open occurrences');
  if (input.dueDate && input.dueDate !== row.nextDueDate) {
    throw badRequest('Only the next due occurrence can be confirmed');
  }
  const { due, next } = await claimNext(db, row);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const base = {
    accountId: input.accountId ?? row.accountId,
    amount: input.amount ?? row.amount,
    occurredAt,
    note: input.note ?? row.note ?? row.name,
    payee: row.payee,
  };
  let created: Awaited<ReturnType<typeof createRecord>>;
  try {
    created =
      row.type === 'transfer'
        ? await createRecord(
            db,
            user,
            { ...base, type: 'transfer', toAccountId: row.toAccountId!, toAmount: input.toAmount },
            { plannedPaymentId: row.id, plannedDueDate: due },
          )
        : await createRecord(
            db,
            user,
            { ...base, type: row.type, categoryId: row.categoryId },
            { plannedPaymentId: row.id, plannedDueDate: due },
          );
  } catch (err) {
    // Give the occurrence back when the record could not be created.
    await moveDue(db, row.id, next, due);
    throw err;
  }
  return { records: created, plannedPayment: await getPlanned(db, user.id, id) };
}

export async function skipPlanned(db: Database, userId: string, id: string) {
  const row = await getOwned(db, userId, id);
  await claimNext(db, row);
  return getPlanned(db, userId, id);
}

/** Lists open occurrences (overdue + upcoming within `days`). */
export async function upcoming(
  db: Database,
  user: UserRow,
  days: number,
  tz: string,
): Promise<UpcomingOccurrence[]> {
  const rows = await db.select().from(plannedPayments).where(eq(plannedPayments.userId, user.id));
  const today = toLocalDate(new Date(), tz);
  const horizon = new Date(Date.now() + days * 86_400_000);
  const until = toLocalDate(horizon, tz);
  const result: UpcomingOccurrence[] = [];
  for (const row of rows) {
    if (!row.nextDueDate) continue;
    for (const dueDate of occurrencesBetween(ruleOf(row), row.nextDueDate, until, 100)) {
      result.push({ plannedPaymentId: row.id, dueDate, overdue: dueDate < today });
    }
  }
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Records all due occurrences of planned payments marked as automatic.
 * Runs periodically; each occurrence is recorded at 08:00 on its due date (user's time zone).
 */
export async function processAutoConfirm(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .select({ plan: plannedPayments, user: users })
    .from(plannedPayments)
    .innerJoin(users, eq(users.id, plannedPayments.userId))
    .where(
      and(
        eq(plannedPayments.autoConfirm, true),
        isNotNull(plannedPayments.nextDueDate),
        lte(plannedPayments.nextDueDate, toLocalDate(new Date(now.getTime() + 86_400_000), 'UTC')),
      ),
    );
  let created = 0;
  for (const { plan, user } of rows) {
    try {
      created += await autoConfirmPlan(db, plan, user, now);
    } catch {
      // One broken plan (e.g. a deleted account) must not block everybody else's.
    }
  }
  return created;
}

async function autoConfirmPlan(db: Database, plan: PlannedPaymentRow, user: UserRow, now: Date) {
  const tz = safeTimeZone(user.timezone);
  const today = toLocalDate(now, tz);
  let created = 0;
  let due = plan.nextDueDate;
  for (let guard = 0; due && due <= today && guard < 400; guard++) {
    const occurredAt = zonedTimeToUtc(
      Number(due.slice(0, 4)),
      Number(due.slice(5, 7)),
      Number(due.slice(8, 10)),
      8,
      0,
      tz,
    );
    const res = await payPlanned(db, user, plan.id, {
      dueDate: due,
      occurredAt: occurredAt.toISOString(),
      note: null,
    });
    created++;
    due = res.plannedPayment.nextDueDate;
  }
  return created;
}
