import { randomUUID } from 'node:crypto';
import {
  convertMinor,
  type RecordItem,
  type RecordPage,
  type recordInput,
  type recordListQuery,
} from '@slavotax/shared';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db';
import {
  accounts,
  categories,
  labels,
  type RecordRow,
  recordLabels,
  records,
  type UserRow,
} from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { toRecord } from './dto';
import { getRateMap } from './rates';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;
export type RecordInputParsed = z.output<typeof recordInput>;
export type RecordListParsed = z.output<typeof recordListQuery>;

async function getOwnedAccount(tx: Tx, userId: string, accountId: string) {
  const [account] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!account) throw notFound('Account');
  return account;
}

async function assertCategory(tx: Tx, userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [cat] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (!cat) throw notFound('Category');
}

async function assertLabels(tx: Tx, userId: string, labelIds: string[] | undefined) {
  if (!labelIds?.length) return [];
  const unique = [...new Set(labelIds)];
  const rows = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.userId, userId), inArray(labels.id, unique)));
  if (rows.length !== unique.length) throw notFound('Label');
  return unique;
}

interface InsertMeta {
  ids?: { main?: string; counterpart?: string };
  createdAt?: Date;
  plannedPaymentId?: string | null;
  plannedDueDate?: string | null;
}

/** Inserts the row(s) for a record input. Returns the created rows (transfer = 2 rows). */
async function insertRecordRows(
  tx: Tx,
  user: UserRow,
  input: RecordInputParsed,
  meta: InsertMeta = {},
): Promise<RecordRow[]> {
  const account = await getOwnedAccount(tx, user.id, input.accountId);
  const labelIds = await assertLabels(tx, user.id, input.labelIds);
  const occurredAt = new Date(input.occurredAt);
  const base = {
    userId: user.id,
    occurredAt,
    note: input.note ?? null,
    payee: input.payee ?? null,
    plannedPaymentId: meta.plannedPaymentId ?? null,
    plannedDueDate: meta.plannedDueDate ?? null,
    ...(meta.createdAt ? { createdAt: meta.createdAt } : {}),
  };

  let rows: RecordRow[];
  if (input.type === 'transfer') {
    if (input.toAccountId === input.accountId) {
      throw badRequest('Choose two different accounts for a transfer');
    }
    const target = await getOwnedAccount(tx, user.id, input.toAccountId);
    let toAmount = input.toAmount;
    if (toAmount === undefined) {
      if (target.currency === account.currency) {
        toAmount = input.amount;
      } else {
        const rates = await getRateMap(tx, user.id, user.baseCurrency);
        toAmount = convertMinor(input.amount, account.currency, target.currency, rates);
      }
    }
    const group = randomUUID();
    rows = await tx
      .insert(records)
      .values([
        {
          ...base,
          id: meta.ids?.main ?? randomUUID(),
          accountId: account.id,
          type: 'transfer',
          amount: -input.amount,
          currency: account.currency,
          categoryId: null,
          transferGroupId: group,
          counterpartAccountId: target.id,
        },
        {
          ...base,
          id: meta.ids?.counterpart ?? randomUUID(),
          accountId: target.id,
          type: 'transfer',
          amount: toAmount,
          currency: target.currency,
          categoryId: null,
          transferGroupId: group,
          counterpartAccountId: account.id,
        },
      ])
      .returning();
  } else {
    await assertCategory(tx, user.id, input.categoryId);
    rows = await tx
      .insert(records)
      .values({
        ...base,
        id: meta.ids?.main ?? randomUUID(),
        accountId: account.id,
        type: input.type,
        amount: input.type === 'expense' ? -input.amount : input.amount,
        currency: account.currency,
        categoryId: input.categoryId ?? null,
      })
      .returning();
  }

  if (labelIds.length) {
    await tx
      .insert(recordLabels)
      .values(rows.flatMap((r) => labelIds.map((labelId) => ({ recordId: r.id, labelId }))));
  }
  return rows;
}

export async function createRecord(
  db: Database,
  user: UserRow,
  input: RecordInputParsed,
  meta: InsertMeta = {},
): Promise<RecordItem[]> {
  const rows = await db.transaction((tx) => insertRecordRows(tx, user, input, meta));
  return decorate(db, rows);
}

/** Returns the record together with its transfer counterpart (if any). */
async function getRecordGroup(tx: Tx, userId: string, id: string): Promise<RecordRow[]> {
  const [row] = await tx
    .select()
    .from(records)
    .where(and(eq(records.id, id), eq(records.userId, userId)));
  if (!row) throw notFound('Record');
  if (!row.transferGroupId) return [row];
  return tx
    .select()
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.transferGroupId, row.transferGroupId)));
}

export async function getRecord(db: Database, userId: string, id: string): Promise<RecordItem> {
  const group = await getRecordGroup(db, userId, id);
  const items = await decorate(db, group);
  return items.find((r) => r.id === id)!;
}

export async function updateRecord(
  db: Database,
  user: UserRow,
  id: string,
  input: RecordInputParsed,
): Promise<RecordItem[]> {
  const rows = await db.transaction(async (tx) => {
    const group = await getRecordGroup(tx, user.id, id);
    const main =
      group.find((r) => r.amount < 0 && r.type === 'transfer') ?? group.find((r) => r.id === id)!;
    const other = group.find((r) => r.id !== main.id);
    await tx.delete(records).where(
      inArray(
        records.id,
        group.map((r) => r.id),
      ),
    );
    return insertRecordRows(tx, user, input, {
      ids: { main: main.id, counterpart: other?.id },
      createdAt: main.createdAt,
      plannedPaymentId: main.plannedPaymentId,
      plannedDueDate: main.plannedDueDate,
    });
  });
  return decorate(db, rows);
}

export async function deleteRecord(db: Database, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const group = await getRecordGroup(tx, userId, id);
    await tx.delete(records).where(
      inArray(
        records.id,
        group.map((r) => r.id),
      ),
    );
  });
}

export async function deleteRecords(db: Database, userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: records.id, group: records.transferGroupId })
      .from(records)
      .where(and(eq(records.userId, userId), inArray(records.id, ids)));
    if (!rows.length) return 0;
    const groups = rows.map((r) => r.group).filter((g): g is string => !!g);
    const conditions: SQL[] = [
      inArray(
        records.id,
        rows.map((r) => r.id),
      ),
    ];
    if (groups.length) conditions.push(inArray(records.transferGroupId, groups));
    const deleted = await tx
      .delete(records)
      .where(and(eq(records.userId, userId), or(...conditions)))
      .returning({ id: records.id });
    return deleted.length;
  });
}

/** Adds label ids and transfer counterpart amounts to raw rows. */
export async function decorate(db: Tx, rows: RecordRow[]): Promise<RecordItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const labelRows = await db.select().from(recordLabels).where(inArray(recordLabels.recordId, ids));
  const labelMap = new Map<string, string[]>();
  for (const lr of labelRows) {
    const list = labelMap.get(lr.recordId) ?? [];
    list.push(lr.labelId);
    labelMap.set(lr.recordId, list);
  }

  const groups = [...new Set(rows.map((r) => r.transferGroupId).filter((g): g is string => !!g))];
  const counterpart = new Map<string, number>();
  if (groups.length) {
    const siblings = await db
      .select({ id: records.id, group: records.transferGroupId, amount: records.amount })
      .from(records)
      .where(inArray(records.transferGroupId, groups));
    for (const r of rows) {
      if (!r.transferGroupId) continue;
      const sib = siblings.find((s) => s.group === r.transferGroupId && s.id !== r.id);
      if (sib) counterpart.set(r.id, sib.amount);
    }
  }
  return rows.map((r) =>
    toRecord(r, {
      labelIds: labelMap.get(r.id) ?? [],
      counterpartAmount: counterpart.get(r.id) ?? null,
    }),
  );
}

function encodeCursor(row: { occurredAt: Date; id: string }): string {
  return Buffer.from(`${row.occurredAt.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { occurredAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const occurredAt = new Date(iso);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

/** Expands category ids so that selecting a parent also matches its subcategories. */
export async function expandCategoryIds(db: Tx, userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), inArray(categories.parentId, ids)));
  return [...new Set([...ids, ...children.map((c) => c.id)])];
}

/** WHERE conditions shared by the record list and its summary. */
async function filterConditions(
  db: Database,
  userId: string,
  q: Omit<RecordListParsed, 'limit' | 'cursor'>,
): Promise<SQL[]> {
  const conditions: SQL[] = [eq(records.userId, userId)];
  if (q.from) conditions.push(gte(records.occurredAt, new Date(q.from)));
  if (q.to) conditions.push(lt(records.occurredAt, new Date(q.to)));
  if (q.accountIds?.length) conditions.push(inArray(records.accountId, q.accountIds));
  if (q.types?.length) conditions.push(inArray(records.type, q.types));
  if (q.categoryIds?.length) {
    const expanded = await expandCategoryIds(db, userId, q.categoryIds);
    conditions.push(inArray(records.categoryId, expanded));
  }
  if (q.labelIds?.length) {
    conditions.push(
      inArray(
        records.id,
        db
          .select({ id: recordLabels.recordId })
          .from(recordLabels)
          .where(inArray(recordLabels.labelId, q.labelIds)),
      ),
    );
  }
  if (q.minAmount !== undefined) conditions.push(gte(sql`abs(${records.amount})`, q.minAmount));
  if (q.maxAmount !== undefined) conditions.push(lte(sql`abs(${records.amount})`, q.maxAmount));
  if (q.search) {
    const pattern = `%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const searchConditions: SQL[] = [
      ilike(records.note, pattern),
      ilike(records.payee, pattern),
      inArray(
        records.categoryId,
        db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.userId, userId), ilike(categories.name, pattern))),
      ),
    ];
    conditions.push(or(...searchConditions)!);
  }
  return conditions;
}

export async function listRecords(
  db: Database,
  userId: string,
  q: RecordListParsed,
): Promise<RecordPage> {
  const conditions = await filterConditions(db, userId, q);
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    if (!c) throw badRequest('Invalid cursor');
    conditions.push(
      or(
        lt(records.occurredAt, c.occurredAt),
        and(eq(records.occurredAt, c.occurredAt), lt(records.id, c.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(records)
    .where(and(...conditions))
    .orderBy(desc(records.occurredAt), desc(records.id))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  return {
    items: await decorate(db, page),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
  };
}

/** Distinct payees used before, most frequent first (for autocomplete). */
export async function listPayees(db: Database, userId: string, search?: string): Promise<string[]> {
  const conditions: SQL[] = [eq(records.userId, userId), isNotNull(records.payee)];
  if (search)
    conditions.push(ilike(records.payee, `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`));
  const rows = await db
    .select({ payee: records.payee, n: sql<number>`count(*)::int` })
    .from(records)
    .where(and(...conditions))
    .groupBy(records.payee)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  return rows.map((r) => r.payee!).filter(Boolean);
}

export interface RecordSummary {
  currency: string;
  income: number;
  expense: number;
  net: number;
  count: number;
  transferCount: number;
}

/** Totals (converted to the base currency) for the records matching a filter. */
export async function summarizeRecords(
  db: Database,
  user: UserRow,
  q: Omit<RecordListParsed, 'limit' | 'cursor'>,
): Promise<RecordSummary> {
  const conditions = await filterConditions(db, user.id, q);
  const rows = await db
    .select({
      type: records.type,
      currency: records.currency,
      total: sql<number>`coalesce(sum(${records.amount}), 0)::bigint`.mapWith(Number),
      count: sql<number>`count(*)::int`,
    })
    .from(records)
    .where(and(...conditions))
    .groupBy(records.type, records.currency);
  const rates = await getRateMap(db, user.id, user.baseCurrency);
  const result: RecordSummary = {
    currency: user.baseCurrency,
    income: 0,
    expense: 0,
    net: 0,
    count: 0,
    transferCount: 0,
  };
  for (const r of rows) {
    const value = convertMinor(r.total, r.currency, user.baseCurrency, rates);
    if (r.type === 'income') result.income += value;
    else if (r.type === 'expense') result.expense -= value;
    else result.transferCount += r.count;
    result.count += r.count;
  }
  result.net = result.income - result.expense;
  return result;
}

export interface BulkUpdate {
  ids: string[];
  categoryId?: string | null;
  accountId?: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/** Applies the same change to many records. Returns the number of records touched. */
export async function bulkUpdateRecords(
  db: Database,
  userId: string,
  input: BulkUpdate,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: records.id,
        type: records.type,
        currency: records.currency,
        groupId: records.transferGroupId,
      })
      .from(records)
      .where(and(eq(records.userId, userId), inArray(records.id, input.ids)));
    if (!rows.length) return 0;
    const plain = rows.filter((r) => r.type !== 'transfer').map((r) => r.id);

    if (input.categoryId !== undefined && plain.length) {
      await assertCategory(tx, userId, input.categoryId);
      await tx
        .update(records)
        .set({ categoryId: input.categoryId })
        .where(inArray(records.id, plain));
    }
    if (input.accountId !== undefined && plain.length) {
      const account = await getOwnedAccount(tx, userId, input.accountId);
      const currencies = new Set(rows.filter((r) => r.type !== 'transfer').map((r) => r.currency));
      if (currencies.size > 1 || !currencies.has(account.currency)) {
        throw badRequest('Records can only be moved to an account with the same currency');
      }
      await tx.update(records).set({ accountId: account.id }).where(inArray(records.id, plain));
    }
    // Labels apply to both sides of transfers.
    const groupIds = rows.map((r) => r.groupId).filter((g): g is string => !!g);
    let targetIds = rows.map((r) => r.id);
    if (groupIds.length) {
      const siblings = await tx
        .select({ id: records.id })
        .from(records)
        .where(and(eq(records.userId, userId), inArray(records.transferGroupId, groupIds)));
      targetIds = [...new Set([...targetIds, ...siblings.map((s) => s.id)])];
    }
    if (input.addLabelIds?.length) {
      const labelIds = await assertLabels(tx, userId, input.addLabelIds);
      await tx
        .insert(recordLabels)
        .values(targetIds.flatMap((recordId) => labelIds.map((labelId) => ({ recordId, labelId }))))
        .onConflictDoNothing();
    }
    if (input.removeLabelIds?.length) {
      await tx
        .delete(recordLabels)
        .where(
          and(
            inArray(recordLabels.recordId, targetIds),
            inArray(recordLabels.labelId, input.removeLabelIds),
          ),
        );
    }
    return rows.length;
  });
}

export interface RecordSuggestion {
  type: 'expense' | 'income';
  accountId: string;
  categoryId: string | null;
  payee: string | null;
  lastAmount: number;
  count: number;
}

/** Most frequent recent combinations of type/account/category/payee (for quick entry). */
export async function recordSuggestions(
  db: Database,
  userId: string,
  limit = 8,
): Promise<RecordSuggestion[]> {
  const rows = (await db.execute(sql`
    select r.type, r.account_id, r.category_id, r.payee,
      count(*)::int as n,
      (array_agg(abs(r.amount) order by r.occurred_at desc))[1] as last_amount
    from records r
    join accounts a on a.id = r.account_id and not a.archived
    where r.user_id = ${userId}::uuid
      and r.type in ('expense', 'income')
      and r.planned_payment_id is null
      and r.occurred_at > now() - interval '90 days'
    group by r.type, r.account_id, r.category_id, r.payee
    having count(*) >= 2
    order by n desc, max(r.occurred_at) desc
    limit ${limit}
  `)) as unknown as {
    type: 'expense' | 'income';
    account_id: string;
    category_id: string | null;
    payee: string | null;
    n: number;
    last_amount: string;
  }[];
  return rows.map((r) => ({
    type: r.type,
    accountId: r.account_id,
    categoryId: r.category_id,
    payee: r.payee,
    lastAmount: Number(r.last_amount),
    count: r.n,
  }));
}
