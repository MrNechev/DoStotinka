import { convertMinor, type Goal, goalContributionInput, goalInput } from '@dostotinka/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db';
import { accounts, type GoalRow, goals, records, type UserRow } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { ensureRate, getRateMap } from '../services/rates';

const idParams = z.object({ id: z.uuid() });

/** Number of months left until the target date, counting the current month when it still fits. */
function monthsUntil(targetDate: string, now = new Date()): number {
  const [y, m, d] = targetDate.split('-').map(Number) as [number, number, number];
  let months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  if (d >= now.getDate()) months += 1;
  return Math.max(1, months);
}

async function present(db: Database, user: UserRow, rows: GoalRow[]): Promise<Goal[]> {
  if (!rows.length) return [];
  const rates = await getRateMap(db, user.id, user.baseCurrency);
  const [accountRows, sums] = await Promise.all([
    db
      .select({ id: accounts.id, currency: accounts.currency, initial: accounts.initialBalance })
      .from(accounts)
      .where(eq(accounts.userId, user.id)),
    db
      .select({
        accountId: records.accountId,
        sum: sql<number>`coalesce(sum(${records.amount}), 0)::bigint`.mapWith(Number),
      })
      .from(records)
      .where(eq(records.userId, user.id))
      .groupBy(records.accountId),
  ]);
  const sumOf = new Map(sums.map((s) => [s.accountId, s.sum]));
  const balances = accountRows.map((a) => ({
    id: a.id,
    currency: a.currency,
    balance: a.initial + (sumOf.get(a.id) ?? 0),
  }));
  const byId = new Map(balances.map((b) => [b.id, b]));
  return rows.map((g) => {
    const account = g.accountId ? byId.get(g.accountId) : undefined;
    const currentAmount = account
      ? convertMinor(account.balance, account.currency, g.currency, rates)
      : g.savedAmount;
    const remaining = Math.max(0, g.targetAmount - currentAmount);
    const months = g.targetDate ? monthsUntil(g.targetDate) : null;
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currency: g.currency,
      accountId: g.accountId,
      currentAmount,
      savedAmount: g.savedAmount,
      targetDate: g.targetDate,
      color: g.color,
      icon: g.icon,
      note: g.note,
      progress: g.targetAmount > 0 ? currentAmount / g.targetAmount : 0,
      monthlyNeeded: months === null ? null : Math.ceil(remaining / months),
      achievedAt: g.achievedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
    };
  });
}

async function getOwned(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row) throw notFound('Goal');
  return row;
}

async function assertAccount(db: Database, userId: string, accountId: string | null | undefined) {
  if (!accountId) return;
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!row) throw notFound('Account');
}

export const goalRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    { schema: { tags: ['goals'], summary: 'Savings goals with progress' } },
    async (req) => {
      const user = currentUser(req);
      const rows = await db
        .select()
        .from(goals)
        .where(eq(goals.userId, user.id))
        .orderBy(asc(goals.createdAt));
      return present(db, user, rows);
    },
  );

  app.post(
    '/',
    { schema: { tags: ['goals'], summary: 'Create a goal', body: goalInput } },
    async (req, reply) => {
      const user = currentUser(req);
      await assertAccount(db, user.id, req.body.accountId);
      const [row] = await db
        .insert(goals)
        .values({
          userId: user.id,
          name: req.body.name,
          targetAmount: req.body.targetAmount,
          currency: req.body.currency ?? user.baseCurrency,
          accountId: req.body.accountId ?? null,
          targetDate: req.body.targetDate ?? null,
          savedAmount: req.body.savedAmount ?? 0,
          color: req.body.color ?? '#10B981',
          icon: req.body.icon ?? 'piggy-bank',
          note: req.body.note ?? null,
        })
        .returning();
      await ensureRate(db, user.id, user.baseCurrency, row!.currency);
      return reply.status(201).send((await present(db, user, [row!]))[0]);
    },
  );

  app.put(
    '/:id',
    { schema: { tags: ['goals'], summary: 'Update a goal', params: idParams, body: goalInput } },
    async (req) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      await assertAccount(db, user.id, req.body.accountId);
      const [row] = await db
        .update(goals)
        .set({
          name: req.body.name,
          targetAmount: req.body.targetAmount,
          currency: req.body.currency ?? existing.currency,
          accountId: req.body.accountId ?? null,
          targetDate: req.body.targetDate ?? null,
          savedAmount: req.body.savedAmount ?? existing.savedAmount,
          color: req.body.color ?? existing.color,
          icon: req.body.icon ?? existing.icon,
          note: req.body.note ?? null,
        })
        .where(eq(goals.id, existing.id))
        .returning();
      await ensureRate(db, user.id, user.baseCurrency, row!.currency);
      return (await present(db, user, [row!]))[0];
    },
  );

  app.post(
    '/:id/contribute',
    {
      schema: {
        tags: ['goals'],
        summary: 'Add to (or take from) the manually saved amount',
        params: idParams,
        body: goalContributionInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      if (existing.accountId) {
        throw badRequest(
          'This goal follows an account balance – add a transfer to that account instead',
        );
      }
      const savedAmount = Math.max(0, existing.savedAmount + req.body.amount);
      const [row] = await db
        .update(goals)
        .set({
          savedAmount,
          achievedAt:
            savedAmount >= existing.targetAmount ? (existing.achievedAt ?? new Date()) : null,
        })
        .where(eq(goals.id, existing.id))
        .returning();
      return (await present(db, user, [row!]))[0];
    },
  );

  app.delete(
    '/:id',
    { schema: { tags: ['goals'], summary: 'Delete a goal', params: idParams } },
    async (req, reply) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      await db.delete(goals).where(eq(goals.id, existing.id));
      return reply.status(204).send();
    },
  );
};
