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

export async function listRecords(
  db: Database,
  userId: string,
  q: RecordListParsed,
): Promise<RecordPage> {
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
