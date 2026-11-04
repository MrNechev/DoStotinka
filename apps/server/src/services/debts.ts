import {
  convertMinor,
  type Debt,
  type debtInput,
  type debtMovementInput,
  type debtUpdateInput,
} from '@slavotax/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db';
import { accounts, type DebtRow, debts, records, type UserRow } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { sweepOrphanAttachments } from './attachments';
import { getRateMap } from './rates';
import { insertRecordRows } from './records';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;

/**
 * Adds totals computed from the linked records. Records move money in the account: lending and
 * repaying a borrowed debt take money out (negative amounts), borrowing and being repaid bring
 * money in. For a debt somebody owes me a negative amount increases it; for a debt I owe a
 * positive amount does.
 */
export async function presentDebts(db: Tx, user: UserRow, rows: DebtRow[]): Promise<Debt[]> {
  if (!rows.length) return [];
  const grows = sql`(${records.amount} < 0) = (${debts.direction} = 'lent')`;
  const sums = await db
    .select({
      debtId: records.debtId,
      currency: records.currency,
      grows:
        sql<number>`coalesce(sum(abs(${records.amount})) filter (where ${grows}), 0)::bigint`.mapWith(
          Number,
        ),
      shrinks:
        sql<number>`coalesce(sum(abs(${records.amount})) filter (where not ${grows}), 0)::bigint`.mapWith(
          Number,
        ),
      count: sql<number>`count(*)::int`,
    })
    .from(records)
    .innerJoin(debts, eq(debts.id, records.debtId))
    .where(
      inArray(
        records.debtId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(records.debtId, records.currency);
  const rates = await getRateMap(db, user.id, user.baseCurrency);
  return rows.map((d) => {
    let total = d.openingAmount;
    let repaid = 0;
    let recordCount = 0;
    for (const s of sums) {
      if (s.debtId !== d.id) continue;
      total += convertMinor(s.grows, s.currency, d.currency, rates);
      repaid += convertMinor(s.shrinks, s.currency, d.currency, rates);
      recordCount += s.count;
    }
    return {
      id: d.id,
      direction: d.direction,
      person: d.person,
      currency: d.currency,
      openingAmount: d.openingAmount,
      total,
      repaid,
      outstanding: Math.max(0, total - repaid),
      date: d.date,
      dueDate: d.dueDate,
      note: d.note,
      closedAt: d.closedAt?.toISOString() ?? null,
      recordCount,
      createdAt: d.createdAt.toISOString(),
    };
  });
}

export async function listDebts(db: Database, user: UserRow): Promise<Debt[]> {
  const rows = await db
    .select()
    .from(debts)
    .where(eq(debts.userId, user.id))
    .orderBy(asc(debts.date), asc(debts.createdAt));
  return presentDebts(db, user, rows);
}

async function getOwned(db: Tx, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)));
  if (!row) throw notFound('Debt');
  return row;
}

async function ownedAccount(db: Tx, userId: string, id: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  if (!account) throw notFound('Account');
  return account;
}

/** Noon of a day in UTC – a neutral time for records created from a date only. */
const noon = (day: string) => `${day}T12:00:00.000Z`;

export async function createDebt(
  db: Database,
  user: UserRow,
  input: z.output<typeof debtInput>,
): Promise<Debt> {
  return db.transaction(async (tx) => {
    const account = input.accountId ? await ownedAccount(tx, user.id, input.accountId) : null;
    const [debt] = await tx
      .insert(debts)
      .values({
        userId: user.id,
        direction: input.direction,
        person: input.person,
        currency: account?.currency ?? input.currency ?? user.baseCurrency,
        openingAmount: account ? 0 : input.amount,
        date: input.date,
        dueDate: input.dueDate ?? null,
        note: input.note ?? null,
      })
      .returning();
    if (account) {
      await insertRecordRows(
        tx,
        user,
        {
          type: input.direction === 'lent' ? 'expense' : 'income',
          accountId: account.id,
          amount: input.amount,
          occurredAt: noon(input.date),
          categoryId: null,
          payee: input.person,
          note: input.note ?? null,
          labelIds: [],
        },
        { debtId: debt!.id },
      );
    }
    const [presented] = await presentDebts(tx, user, [debt!]);
    return presented!;
  });
}

export async function updateDebt(
  db: Database,
  user: UserRow,
  id: string,
  input: z.output<typeof debtUpdateInput>,
): Promise<Debt> {
  const existing = await getOwned(db, user.id, id);
  const patch: Partial<typeof debts.$inferInsert> = {};
  if (input.person !== undefined) patch.person = input.person;
  if (input.dueDate !== undefined) {
    if (input.dueDate && input.dueDate < existing.date) {
      throw badRequest('The due date cannot be before the date');
    }
    patch.dueDate = input.dueDate;
  }
  if (input.note !== undefined) patch.note = input.note;
  if (input.closed !== undefined) patch.closedAt = input.closed ? new Date() : null;
  const [row] = Object.keys(patch).length
    ? await db.update(debts).set(patch).where(eq(debts.id, existing.id)).returning()
    : [existing];
  const [presented] = await presentDebts(db, user, [row!]);
  return presented!;
}

/** Records a repayment or more money lent/borrowed. Closes the debt once nothing is owed. */
export async function addDebtMovement(
  db: Database,
  user: UserRow,
  id: string,
  input: z.output<typeof debtMovementInput>,
): Promise<Debt> {
  return db.transaction(async (tx) => {
    const debt = await getOwned(tx, user.id, id);
    await ownedAccount(tx, user.id, input.accountId);
    // Money comes in when somebody repays me or when I borrow more.
    const incoming = (debt.direction === 'lent') === (input.kind === 'repayment');
    await insertRecordRows(
      tx,
      user,
      {
        type: incoming ? 'income' : 'expense',
        accountId: input.accountId,
        amount: input.amount,
        occurredAt: input.occurredAt,
        categoryId: null,
        payee: debt.person,
        note: input.note ?? null,
        labelIds: [],
      },
      { debtId: debt.id },
    );
    let [presented] = await presentDebts(tx, user, [debt]);
    const settled = presented!.outstanding === 0;
    if (settled !== !!debt.closedAt) {
      const [row] = await tx
        .update(debts)
        .set({ closedAt: settled ? new Date() : null })
        .where(eq(debts.id, debt.id))
        .returning();
      [presented] = await presentDebts(tx, user, [row!]);
    }
    return presented!;
  });
}

/** Deletes the debt together with its records (their money movements disappear as well). */
export async function deleteDebt(db: Database, userId: string, id: string): Promise<void> {
  const debt = await getOwned(db, userId, id);
  await db.transaction(async (tx) => {
    await tx.delete(debts).where(eq(debts.id, debt.id));
    await sweepOrphanAttachments(tx, userId);
  });
}
