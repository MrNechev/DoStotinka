import {
  accountInput,
  accountUpdateInput,
  adjustBalanceInput,
  reorderInput,
} from '@slavotax/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db';
import { accounts, categories, records } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { toAccount } from '../services/dto';
import { ensureRate } from '../services/rates';
import { createRecord } from '../services/records';

const idParams = z.object({ id: z.uuid() });

async function totals(db: Database, userId: string, accountId?: string) {
  const rows = await db
    .select({
      accountId: records.accountId,
      sum: sql<number>`coalesce(sum(${records.amount}), 0)::bigint`.mapWith(Number),
      count: sql<number>`count(*)::int`,
    })
    .from(records)
    .where(
      and(eq(records.userId, userId), accountId ? eq(records.accountId, accountId) : undefined),
    )
    .groupBy(records.accountId);
  return new Map(rows.map((r) => [r.accountId, { sum: r.sum, count: r.count }]));
}

async function getOwned(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  if (!row) throw notFound('Account');
  return row;
}

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    { schema: { tags: ['accounts'], summary: 'List accounts with balances' } },
    async (req) => {
      const user = currentUser(req);
      const [rows, t] = await Promise.all([
        db
          .select()
          .from(accounts)
          .where(eq(accounts.userId, user.id))
          .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt)),
        totals(db, user.id),
      ]);
      return rows.map((a) => toAccount(a, t.get(a.id)));
    },
  );

  app.get(
    '/:id',
    { schema: { tags: ['accounts'], summary: 'Get an account', params: idParams } },
    async (req) => {
      const user = currentUser(req);
      const row = await getOwned(db, user.id, req.params.id);
      return toAccount(row, (await totals(db, user.id, row.id)).get(row.id));
    },
  );

  app.post(
    '/',
    { schema: { tags: ['accounts'], summary: 'Create an account', body: accountInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const [{ max } = { max: -1 }] = await db
        .select({ max: sql<number>`coalesce(max(${accounts.sortOrder}), -1)::int` })
        .from(accounts)
        .where(eq(accounts.userId, user.id));
      const [row] = await db
        .insert(accounts)
        .values({ ...req.body, icon: req.body.icon ?? null, userId: user.id, sortOrder: max + 1 })
        .returning();
      await ensureRate(db, user.id, user.baseCurrency, row!.currency);
      return reply.status(201).send(toAccount(row!));
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Update an account',
        params: idParams,
        body: accountUpdateInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      const t = (await totals(db, user.id, existing.id)).get(existing.id);
      if (req.body.currency && req.body.currency !== existing.currency && (t?.count ?? 0) > 0) {
        throw badRequest('The currency cannot be changed once the account has records');
      }
      // Only touch the fields that were sent.
      const patch = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined));
      if (typeof patch.note === 'string' && !patch.note) patch.note = null;
      const [row] = Object.keys(patch).length
        ? await db.update(accounts).set(patch).where(eq(accounts.id, existing.id)).returning()
        : [existing];
      if (req.body.currency) await ensureRate(db, user.id, user.baseCurrency, req.body.currency);
      return toAccount(row!, t);
    },
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Delete an account and its records',
        params: idParams,
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      await db.delete(accounts).where(eq(accounts.id, existing.id));
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/adjust-balance',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Set the current balance of an account',
        params: idParams,
        body: adjustBalanceInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      const t = (await totals(db, user.id, existing.id)).get(existing.id);
      const current = existing.initialBalance + (t?.sum ?? 0);
      const diff = req.body.balance - current;
      if (diff !== 0) {
        if (req.body.createRecord) {
          const [missing] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(
                eq(categories.userId, user.id),
                eq(categories.systemKey, diff < 0 ? 'other.missing' : 'other_income.misc'),
              ),
            );
          await createRecord(db, user, {
            type: diff < 0 ? 'expense' : 'income',
            accountId: existing.id,
            amount: Math.abs(diff),
            occurredAt: req.body.occurredAt ?? new Date().toISOString(),
            categoryId: missing?.id ?? null,
            note: 'Balance adjustment',
            payee: null,
          });
        } else {
          await db
            .update(accounts)
            .set({ initialBalance: existing.initialBalance + diff })
            .where(eq(accounts.id, existing.id));
        }
      }
      const row = await getOwned(db, user.id, existing.id);
      return toAccount(row, (await totals(db, user.id, row.id)).get(row.id));
    },
  );

  app.post(
    '/reorder',
    { schema: { tags: ['accounts'], summary: 'Reorder accounts', body: reorderInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const owned = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, user.id), inArray(accounts.id, req.body.ids)));
      const ownedIds = new Set(owned.map((o) => o.id));
      await db.transaction(async (tx) => {
        let i = 0;
        for (const id of req.body.ids) {
          if (!ownedIds.has(id)) continue;
          await tx.update(accounts).set({ sortOrder: i++ }).where(eq(accounts.id, id));
        }
      });
      return reply.status(204).send();
    },
  );
};
