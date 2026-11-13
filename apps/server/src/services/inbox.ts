import {
  appLabel,
  convertMinor,
  formatMoney,
  type InboxConfirmInput,
  type InboxItem,
  type InboxStatus,
} from '@dostotinka/shared';
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../db';
import {
  accounts,
  bankAccounts,
  bankConnections,
  categories,
  type InboxItemRow,
  inboxItems,
  records,
  type UserRow,
} from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { getRateMap } from './rates';
import { insertRecordRows, type RecordInputParsed } from './records';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface NewInboxItem {
  origin: 'notification' | 'bank';
  notificationSourceId?: string | null;
  bankAccountId?: string | null;
  app?: string | null;
  accountId: string | null;
  type: 'expense' | 'income';
  amount: number;
  currency: string | null;
  occurredAt: Date;
  payee: string | null;
  description: string | null;
  externalId: string;
}

// ───────────────────────────── DTO ─────────────────────────────

export async function toInboxItems(db: Tx, rows: InboxItemRow[]): Promise<InboxItem[]> {
  if (!rows.length) return [];
  const matchIds = rows.map((r) => r.matchRecordId).filter((x): x is string => !!x);
  const pairIds = rows.map((r) => r.pairItemId).filter((x): x is string => !!x);
  const bankIds = rows.map((r) => r.bankAccountId).filter((x): x is string => !!x);
  const [matches, pairs, banks] = await Promise.all([
    matchIds.length
      ? db
          .select({
            id: records.id,
            occurredAt: records.occurredAt,
            payee: records.payee,
            note: records.note,
          })
          .from(records)
          .where(inArray(records.id, matchIds))
      : [],
    pairIds.length
      ? db
          .select({
            id: inboxItems.id,
            accountId: inboxItems.accountId,
            type: inboxItems.type,
            status: inboxItems.status,
          })
          .from(inboxItems)
          .where(inArray(inboxItems.id, pairIds))
      : [],
    bankIds.length
      ? db
          .select({ id: bankAccounts.id, bankName: bankConnections.bankName })
          .from(bankAccounts)
          .innerJoin(bankConnections, eq(bankConnections.id, bankAccounts.connectionId))
          .where(inArray(bankAccounts.id, bankIds))
      : [],
  ]);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const bankById = new Map(banks.map((b) => [b.id, b.bankName]));
  return rows.map((r) => {
    const m = r.matchRecordId ? matchById.get(r.matchRecordId) : undefined;
    const p = r.pairItemId ? pairById.get(r.pairItemId) : undefined;
    return {
      id: r.id,
      origin: r.origin as InboxItem['origin'],
      sourceLabel:
        r.origin === 'bank'
          ? ((r.bankAccountId && bankById.get(r.bankAccountId)) ?? 'Bank')
          : appLabel(r.app ?? ''),
      app: r.app,
      accountId: r.accountId,
      type: r.type as InboxItem['type'],
      amount: r.amount,
      currency: r.currency,
      occurredAt: r.occurredAt.toISOString(),
      payee: r.payee,
      description: r.description,
      status: r.status as InboxStatus,
      categoryId: r.categoryId,
      recordId: r.recordId,
      match: m
        ? { recordId: m.id, occurredAt: m.occurredAt.toISOString(), payee: m.payee, note: m.note }
        : null,
      pair:
        p && p.status === 'pending'
          ? { itemId: p.id, accountId: p.accountId, type: p.type as InboxItem['type'] }
          : null,
      duplicateOfId: r.duplicateOfId,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ───────────────────────────── Suggestions & matching ─────────────────────────────

/** The category used most often for this payee (learned from the user's own records). */
export async function suggestCategory(
  db: Tx,
  userId: string,
  payee: string | null,
  type: 'expense' | 'income',
): Promise<string | null> {
  if (!payee) return null;
  const [row] = await db
    .select({ categoryId: records.categoryId, n: sql<number>`count(*)::int` })
    .from(records)
    .innerJoin(categories, eq(categories.id, records.categoryId))
    .where(
      and(
        eq(records.userId, userId),
        eq(records.type, type),
        sql`lower(${records.payee}) = lower(${payee})`,
        eq(categories.archived, false),
      ),
    )
    .groupBy(records.categoryId)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${records.occurredAt})`))
    .limit(1);
  return row?.categoryId ?? null;
}

/** Signed record amount an item corresponds to, when its currency is the account currency. */
async function signedAmountInAccount(
  db: Tx,
  item: { accountId: string | null; amount: number | null; currency: string | null; type: string },
): Promise<number | null> {
  if (!item.accountId || item.amount === null) return null;
  const [acc] = await db
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.id, item.accountId));
  if (!acc || (item.currency && item.currency !== acc.currency)) return null;
  return item.type === 'expense' ? -item.amount : item.amount;
}

/**
 * An earlier inbox item for the same transaction from another source – e.g. the bank booking of
 * a payment that already came in as a phone notification, or Google Wallet + the bank app.
 */
async function findDuplicateItem(db: Tx, userId: string, item: InboxItemRow) {
  const window = item.origin === 'bank' ? 4 * DAY : 30 * 60_000;
  const from = new Date(item.occurredAt.getTime() - window);
  const to = new Date(item.occurredAt.getTime() + (item.origin === 'bank' ? 2 * DAY : window));
  const candidates = await db
    .select()
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, userId),
        ne(inboxItems.id, item.id),
        inArray(inboxItems.status, ['pending', 'confirmed']),
        eq(inboxItems.type, item.type),
        eq(inboxItems.amount, item.amount ?? -1),
        item.currency ? eq(inboxItems.currency, item.currency) : sql`true`,
        isNull(inboxItems.duplicateOfId),
        gte(inboxItems.occurredAt, from),
        lte(inboxItems.occurredAt, to),
        item.origin === 'bank'
          ? eq(inboxItems.origin, 'notification')
          : and(eq(inboxItems.origin, 'notification'), ne(inboxItems.app, item.app ?? '')),
        item.accountId
          ? or(eq(inboxItems.accountId, item.accountId), isNull(inboxItems.accountId))
          : sql`true`,
        // Each earlier item is claimed by at most one duplicate per origin.
        sql`not exists (select 1 from ${inboxItems} d where d.duplicate_of_id = ${inboxItems.id} and d.origin = ${item.origin})`,
      ),
    )
    .orderBy(
      sql`abs(extract(epoch from ${inboxItems.occurredAt} - ${item.occurredAt.toISOString()}::timestamptz))`,
    )
    .limit(1);
  return candidates[0] ?? null;
}

/** A record the user already entered by hand that looks like this transaction. */
async function findMatchingRecord(db: Tx, userId: string, item: InboxItemRow) {
  const signed = await signedAmountInAccount(db, item);
  if (signed === null || !item.accountId) return null;
  const window = item.origin === 'bank' ? 3 * DAY : DAY;
  const [match] = await db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.userId, userId),
        eq(records.accountId, item.accountId),
        eq(records.amount, signed),
        gte(records.occurredAt, new Date(item.occurredAt.getTime() - window)),
        lte(records.occurredAt, new Date(item.occurredAt.getTime() + window)),
        sql`not exists (select 1 from ${inboxItems} i where i.record_id = ${records.id})`,
      ),
    )
    .orderBy(
      sql`abs(extract(epoch from ${records.occurredAt} - ${item.occurredAt.toISOString()}::timestamptz))`,
    )
    .limit(1);
  return match?.id ?? null;
}

/** The other half of a transfer between two own accounts (money out here, in there). */
async function findPair(db: Tx, userId: string, item: InboxItemRow) {
  if (!item.accountId || item.amount === null) return null;
  const [pair] = await db
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, userId),
        eq(inboxItems.status, 'pending'),
        ne(inboxItems.id, item.id),
        ne(inboxItems.accountId, item.accountId),
        eq(inboxItems.type, item.type === 'expense' ? 'income' : 'expense'),
        eq(inboxItems.amount, item.amount),
        item.currency ? eq(inboxItems.currency, item.currency) : sql`true`,
        isNull(inboxItems.pairItemId),
        gte(inboxItems.occurredAt, new Date(item.occurredAt.getTime() - 3 * DAY)),
        lte(inboxItems.occurredAt, new Date(item.occurredAt.getTime() + 3 * DAY)),
      ),
    )
    .orderBy(
      sql`abs(extract(epoch from ${inboxItems.occurredAt} - ${item.occurredAt.toISOString()}::timestamptz))`,
    )
    .limit(1);
  return pair?.id ?? null;
}

// ───────────────────────────── Creating items ─────────────────────────────

export type AddResult =
  | { status: 'created' | 'confirmed' | 'duplicate'; item: InboxItemRow }
  | { status: 'exists' };

/**
 * Stores a new transaction in the inbox: skips repeats, merges duplicates from other sources,
 * links probable transfers, suggests a category and confirms it right away when allowed.
 */
export async function addInboxItem(
  db: Database,
  user: UserRow,
  data: NewInboxItem,
  opts: { autoConfirm?: boolean } = {},
): Promise<AddResult> {
  const [inserted] = await db
    .insert(inboxItems)
    .values({
      userId: user.id,
      origin: data.origin,
      notificationSourceId: data.notificationSourceId ?? null,
      bankAccountId: data.bankAccountId ?? null,
      app: data.app ?? null,
      accountId: data.accountId,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      occurredAt: data.occurredAt,
      payee: data.payee?.slice(0, 200) ?? null,
      description: data.description?.slice(0, 1000) ?? null,
      externalId: data.externalId,
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted) return { status: 'exists' };
  let item: InboxItemRow = inserted;

  const duplicate = await findDuplicateItem(db, user.id, item);
  if (duplicate) {
    item =
      (
        await db
          .update(inboxItems)
          .set({ status: 'duplicate', duplicateOfId: duplicate.id, recordId: duplicate.recordId })
          .where(eq(inboxItems.id, item.id))
          .returning()
      )[0] ?? item;
    if (!duplicate.accountId && data.accountId) {
      await db
        .update(inboxItems)
        .set({ accountId: data.accountId })
        .where(eq(inboxItems.id, duplicate.id));
    }
    return { status: 'duplicate', item };
  }

  const [categoryId, pairId, matchId] = await Promise.all([
    suggestCategory(db, user.id, item.payee, item.type as 'expense' | 'income'),
    findPair(db, user.id, item),
    findMatchingRecord(db, user.id, item),
  ]);
  item =
    (
      await db
        .update(inboxItems)
        .set({ categoryId, pairItemId: pairId, matchRecordId: matchId })
        .where(eq(inboxItems.id, item.id))
        .returning()
    )[0] ?? item;
  if (pairId) {
    await db.update(inboxItems).set({ pairItemId: item.id }).where(eq(inboxItems.id, pairId));
  }

  if (opts.autoConfirm && item.accountId && !pairId && !matchId) {
    try {
      await confirmInboxItem(db, user, item.id, {});
      const [done] = await db.select().from(inboxItems).where(eq(inboxItems.id, item.id));
      return { status: 'confirmed', item: done! };
    } catch {
      /* stays in the inbox */
    }
  }
  return { status: 'created', item };
}

// ───────────────────────────── Reading ─────────────────────────────

export async function listInbox(
  db: Database,
  userId: string,
  status: 'pending' | 'done' | 'ignored',
  limit: number,
): Promise<InboxItem[]> {
  const statuses =
    status === 'pending'
      ? ['pending']
      : status === 'ignored'
        ? ['ignored']
        : ['confirmed', 'dismissed', 'duplicate'];
  const rows = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, userId), inArray(inboxItems.status, statuses)))
    .orderBy(status === 'pending' ? desc(inboxItems.occurredAt) : desc(inboxItems.updatedAt))
    .limit(limit);
  return toInboxItems(db, rows);
}

export async function pendingCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, userId), eq(inboxItems.status, 'pending')));
  return row?.n ?? 0;
}

async function getItem(db: Tx, userId: string, id: string): Promise<InboxItemRow> {
  const [row] = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)));
  if (!row) throw notFound('Inbox item');
  return row;
}

// ───────────────────────────── Actions ─────────────────────────────

export async function updateInboxItem(
  db: Database,
  userId: string,
  id: string,
  input: {
    accountId?: string | null;
    type?: 'expense' | 'income';
    categoryId?: string | null;
    payee?: string | null;
  },
): Promise<InboxItem> {
  const item = await getItem(db, userId, id);
  if (item.status !== 'pending') throw badRequest('This transaction was already handled');
  if (input.accountId) {
    const [acc] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)));
    if (!acc) throw notFound('Account');
  }
  const [row] = await db
    .update(inboxItems)
    .set({
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.payee !== undefined ? { payee: input.payee } : {}),
    })
    .where(eq(inboxItems.id, id))
    .returning();
  return (await toInboxItems(db, [row!]))[0]!;
}

async function clearPair(tx: Tx, item: InboxItemRow) {
  if (item.pairItemId) {
    await tx
      .update(inboxItems)
      .set({ pairItemId: null })
      .where(or(eq(inboxItems.id, item.pairItemId), eq(inboxItems.id, item.id)));
  }
}

/** Creates the record for an inbox item. */
export async function confirmInboxItem(
  db: Database,
  user: UserRow,
  id: string,
  input: InboxConfirmInput,
): Promise<InboxItem> {
  const result = await db.transaction(async (tx) => {
    const item = await getItem(tx, user.id, id);
    if (item.status !== 'pending') throw badRequest('This transaction was already handled');
    const accountId = input.accountId ?? item.accountId;
    if (!accountId) throw badRequest('Choose an account for this transaction');
    const [account] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id)));
    if (!account) throw notFound('Account');
    if (item.amount === null && input.amount === undefined) throw badRequest('Enter the amount');

    let amount = input.amount ?? item.amount!;
    let note = input.note !== undefined ? input.note : null;
    if (input.amount === undefined && item.currency && item.currency !== account.currency) {
      const rates = await getRateMap(tx, user.id, user.baseCurrency);
      amount = Math.abs(convertMinor(item.amount!, item.currency, account.currency, rates));
      const paid = formatMoney(item.amount!, item.currency, { locale: 'en-GB' });
      note = note ? `${note} (${paid})` : `Paid ${paid}`;
    }
    if (amount <= 0) throw badRequest('Enter an amount greater than zero');
    const type = input.type ?? (item.type as 'expense' | 'income');
    const payee = input.payee !== undefined ? input.payee : item.payee;
    const record: RecordInputParsed & { type: 'expense' | 'income' } = {
      type,
      accountId,
      amount,
      occurredAt: input.occurredAt ?? item.occurredAt.toISOString(),
      categoryId: input.categoryId !== undefined ? input.categoryId : item.categoryId,
      payee: payee ? payee.slice(0, 120) : null,
      note: note ? note.slice(0, 500) : null,
      labelIds: [],
    };
    const [row] = await insertRecordRows(tx, user, record);
    await clearPair(tx, item);
    const [updated] = await tx
      .update(inboxItems)
      .set({
        status: 'confirmed',
        recordId: row!.id,
        accountId,
        type,
        payee: payee ?? null,
        categoryId: input.categoryId !== undefined ? input.categoryId : item.categoryId,
        matchRecordId: null,
        pairItemId: null,
      })
      .where(eq(inboxItems.id, id))
      .returning();
    // Later duplicates (e.g. the bank booking) point to the same record.
    await tx
      .update(inboxItems)
      .set({ recordId: row!.id })
      .where(and(eq(inboxItems.duplicateOfId, id), eq(inboxItems.userId, user.id)));
    return updated!;
  });
  return (await toInboxItems(db, [result]))[0]!;
}

/** Confirms an item and its pair as one transfer between the two accounts. */
export async function confirmAsTransfer(db: Database, user: UserRow, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await getItem(tx, user.id, id);
    if (item.status !== 'pending' || !item.pairItemId) throw badRequest('No transfer found');
    const pair = await getItem(tx, user.id, item.pairItemId);
    if (pair.status !== 'pending') throw badRequest('This transaction was already handled');
    const out = item.type === 'expense' ? item : pair;
    const into = item.type === 'expense' ? pair : item;
    if (!out.accountId || !into.accountId || out.amount === null || into.amount === null) {
      throw badRequest('Choose an account for both transactions');
    }
    const rows = await insertRecordRows(tx, user, {
      type: 'transfer',
      accountId: out.accountId,
      toAccountId: into.accountId,
      amount: out.amount,
      toAmount: into.amount,
      occurredAt: out.occurredAt.toISOString(),
      note: null,
      payee: null,
      labelIds: [],
    });
    const outRow = rows.find((r) => r.accountId === out.accountId)!;
    const inRow = rows.find((r) => r.accountId === into.accountId)!;
    for (const [it, row] of [
      [out, outRow],
      [into, inRow],
    ] as const) {
      await tx
        .update(inboxItems)
        .set({ status: 'confirmed', recordId: row.id, pairItemId: null, matchRecordId: null })
        .where(eq(inboxItems.id, it.id));
    }
  });
}

export async function dismissInboxItem(db: Database, userId: string, id: string): Promise<void> {
  const item = await getItem(db, userId, id);
  if (item.status !== 'pending' && item.status !== 'ignored') {
    throw badRequest('This transaction was already handled');
  }
  await clearPair(db, item);
  await db
    .update(inboxItems)
    .set({ status: 'dismissed', pairItemId: null })
    .where(eq(inboxItems.id, id));
}

/** "It's the record I already entered": links the item instead of creating a new record. */
export async function linkToMatch(db: Database, userId: string, id: string): Promise<void> {
  const item = await getItem(db, userId, id);
  if (item.status !== 'pending' || !item.matchRecordId) throw badRequest('Nothing to link');
  await clearPair(db, item);
  await db
    .update(inboxItems)
    .set({ status: 'duplicate', recordId: item.matchRecordId, matchRecordId: null })
    .where(eq(inboxItems.id, id));
}

/** "Not the same": forget the suggested match. */
export async function ignoreMatch(db: Database, userId: string, id: string): Promise<void> {
  await getItem(db, userId, id);
  await db.update(inboxItems).set({ matchRecordId: null }).where(eq(inboxItems.id, id));
}

/** Back from Done to the inbox (when a record was created by mistake it must be deleted first). */
export async function restoreInboxItem(db: Database, userId: string, id: string): Promise<void> {
  const item = await getItem(db, userId, id);
  if (item.status === 'pending') return;
  if (item.status === 'confirmed' && item.recordId) {
    throw badRequest('Delete the record first – then the transaction can be reviewed again');
  }
  await db
    .update(inboxItems)
    .set({ status: 'pending', recordId: null, duplicateOfId: null })
    .where(eq(inboxItems.id, id));
}

export async function bulkInbox(
  db: Database,
  user: UserRow,
  ids: string[],
  action: 'confirm' | 'dismiss',
): Promise<{ done: number; skipped: number }> {
  let done = 0;
  let skipped = 0;
  for (const id of ids) {
    try {
      if (action === 'confirm') await confirmInboxItem(db, user, id, {});
      else await dismissInboxItem(db, user.id, id);
      done++;
    } catch {
      skipped++;
    }
  }
  return { done, skipped };
}

/** Housekeeping: drop old ignored notifications and long-handled items. */
export async function purgeInbox(db: Database, now = new Date()): Promise<number> {
  const ignored = await db
    .delete(inboxItems)
    .where(
      and(
        eq(inboxItems.status, 'ignored'),
        lt(inboxItems.createdAt, new Date(now.getTime() - 14 * DAY)),
      ),
    )
    .returning({ id: inboxItems.id });
  const handled = await db
    .delete(inboxItems)
    .where(
      and(
        inArray(inboxItems.status, ['confirmed', 'dismissed', 'duplicate']),
        lt(inboxItems.updatedAt, new Date(now.getTime() - 400 * DAY)),
      ),
    )
    .returning({ id: inboxItems.id });
  return ignored.length + handled.length;
}
