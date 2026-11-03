import {
  balanceQuery,
  cashflowQuery,
  categoryStatsQuery,
  statsQuery,
  timeseriesQuery,
} from '@slavotax/shared';
import { eq, max, min } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { records } from '../db/schema';
import { safeTimeZone } from '../lib/dates';
import { badRequest } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import {
  balanceTrend,
  cashflow,
  categoryBreakdown,
  type StatsScope,
  summary,
  timeseries,
} from '../services/stats';

const MAX_RANGE_MS = 50 * 366 * 86_400_000;

function scopeOf(
  q: { from: string; to: string; accountIds?: string[]; tz: string },
  fallbackTz: string,
): StatsScope {
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (!(to > from)) throw badRequest('`to` must be after `from`');
  if (to.getTime() - from.getTime() > MAX_RANGE_MS)
    throw badRequest('The requested range is too long');
  return { from, to, accountIds: q.accountIds, tz: safeTimeZone(q.tz, fallbackTz) };
}

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/bounds',
    { schema: { tags: ['stats'], summary: 'Date of the first and last record' } },
    async (req) => {
      const user = currentUser(req);
      const [row] = await db
        .select({ first: min(records.occurredAt), last: max(records.occurredAt) })
        .from(records)
        .where(eq(records.userId, user.id));
      return { first: row?.first?.toISOString() ?? null, last: row?.last?.toISOString() ?? null };
    },
  );

  app.get(
    '/summary',
    {
      schema: {
        tags: ['stats'],
        summary: 'Income, expenses and balance for a period',
        querystring: statsQuery,
      },
    },
    async (req) => {
      const user = currentUser(req);
      return summary(db, user, scopeOf(req.query, user.timezone));
    },
  );

  app.get(
    '/categories',
    {
      schema: {
        tags: ['stats'],
        summary: 'Totals per category (top level or subcategories of `parentId`)',
        querystring: categoryStatsQuery,
      },
    },
    async (req) => {
      const user = currentUser(req);
      return categoryBreakdown(
        db,
        user,
        scopeOf(req.query, user.timezone),
        req.query.type,
        req.query.parentId,
      );
    },
  );

  app.get(
    '/timeseries',
    {
      schema: {
        tags: ['stats'],
        summary: 'Spending or income per day/week/month split by category',
        querystring: timeseriesQuery,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const q = req.query;
      return timeseries(db, user, scopeOf(q, user.timezone), q.interval, q.type, q.categoryId);
    },
  );

  app.get(
    '/cashflow',
    {
      schema: {
        tags: ['stats'],
        summary: 'Income vs expenses over time',
        querystring: cashflowQuery,
      },
    },
    async (req) => {
      const user = currentUser(req);
      return cashflow(db, user, scopeOf(req.query, user.timezone), req.query.interval);
    },
  );

  app.get(
    '/balance',
    { schema: { tags: ['stats'], summary: 'Balance trend over time', querystring: balanceQuery } },
    async (req) => {
      const user = currentUser(req);
      return balanceTrend(db, user, scopeOf(req.query, user.timezone), req.query.interval);
    },
  );
};
