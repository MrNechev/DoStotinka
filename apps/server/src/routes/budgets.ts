import { budgetInput } from '@dostotinka/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db';
import { budgets } from '../db/schema';
import { safeTimeZone } from '../lib/dates';
import { notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { budgetStatus } from '../services/budgets';
import { toBudget } from '../services/dto';

const idParams = z.object({ id: z.uuid() });
const tzQuery = z.object({
  tz: z.string().max(64).optional(),
  /** 0 = current period, -1 = previous period … */
  offset: z.coerce.number().int().min(-120).max(0).default(0),
});

async function getOwned(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)));
  if (!row) throw notFound('Budget');
  return row;
}

export const budgetRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    {
      schema: {
        tags: ['budgets'],
        summary: 'Budgets with their status for the current period',
        querystring: tzQuery,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const tz = safeTimeZone(req.query.tz, user.timezone);
      const rows = await db
        .select()
        .from(budgets)
        .where(eq(budgets.userId, user.id))
        .orderBy(asc(budgets.createdAt));
      return Promise.all(rows.map((b) => budgetStatus(db, user, b, tz, req.query.offset)));
    },
  );

  app.get(
    '/:id/history',
    {
      schema: {
        tags: ['budgets'],
        summary: 'Status of a budget for the last N periods',
        params: idParams,
        querystring: z.object({
          tz: z.string().max(64).optional(),
          periods: z.coerce.number().int().min(1).max(36).default(6),
        }),
      },
    },
    async (req) => {
      const user = currentUser(req);
      const tz = safeTimeZone(req.query.tz, user.timezone);
      const budget = await getOwned(db, user.id, req.params.id);
      const offsets = Array.from(
        { length: req.query.periods },
        (_, i) => -(req.query.periods - 1 - i),
      );
      return Promise.all(offsets.map((o) => budgetStatus(db, user, budget, tz, o)));
    },
  );

  app.post(
    '/',
    { schema: { tags: ['budgets'], summary: 'Create a budget', body: budgetInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const [row] = await db
        .insert(budgets)
        .values({
          ...req.body,
          color: req.body.color ?? '#22C55E',
          currency: user.baseCurrency,
          userId: user.id,
        })
        .returning();
      return reply.status(201).send(toBudget(row!));
    },
  );

  app.put(
    '/:id',
    {
      schema: {
        tags: ['budgets'],
        summary: 'Update a budget',
        params: idParams,
        body: budgetInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      const [row] = await db
        .update(budgets)
        .set({ ...req.body, color: req.body.color ?? existing.color })
        .where(eq(budgets.id, existing.id))
        .returning();
      return toBudget(row!);
    },
  );

  app.delete(
    '/:id',
    { schema: { tags: ['budgets'], summary: 'Delete a budget', params: idParams } },
    async (req, reply) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      await db.delete(budgets).where(eq(budgets.id, existing.id));
      return reply.status(204).send();
    },
  );
};
