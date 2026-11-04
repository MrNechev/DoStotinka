import { type CurrenciesResponse, type ExchangeRate, ratesUpdateInput } from '@dostotinka/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { budgets, exchangeRates, goals } from '../db/schema';
import { HttpError } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import {
  applyReferenceRates,
  ensureRate,
  refreshReferenceRates,
  usedCurrencies,
} from '../services/rates';

export const currencyRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  const load = async (userId: string, base: string): Promise<CurrenciesResponse> => {
    const [rows, used] = await Promise.all([
      db.select().from(exchangeRates).where(eq(exchangeRates.userId, userId)),
      usedCurrencies(db, userId),
    ]);
    return {
      baseCurrency: base,
      usedCurrencies: used,
      rates: rows
        .filter((r) => r.currency !== base)
        .map(
          (r): ExchangeRate => ({
            currency: r.currency,
            rate: Number(r.rate),
            source: r.source as ExchangeRate['source'],
            updatedAt: r.updatedAt.toISOString(),
          }),
        )
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    };
  };

  app.get(
    '/',
    { schema: { tags: ['currencies'], summary: 'Exchange rates of the user' } },
    async (req) => {
      const user = currentUser(req);
      return load(user.id, user.baseCurrency);
    },
  );

  app.put(
    '/rates',
    {
      schema: {
        tags: ['currencies'],
        summary: 'Set exchange rates manually',
        body: ratesUpdateInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      for (const r of req.body.rates) {
        if (r.currency === user.baseCurrency) continue;
        await db
          .insert(exchangeRates)
          .values({ userId: user.id, currency: r.currency, rate: r.rate, source: 'manual' })
          .onConflictDoUpdate({
            target: [exchangeRates.userId, exchangeRates.currency],
            set: { rate: r.rate, source: 'manual', updatedAt: new Date() },
          });
      }
      return load(user.id, user.baseCurrency);
    },
  );

  app.post(
    '/rates',
    {
      schema: {
        tags: ['currencies'],
        summary: 'Track an additional currency',
        body: z.object({ currency: z.string().length(3) }),
      },
    },
    async (req) => {
      const user = currentUser(req);
      await ensureRate(db, user.id, user.baseCurrency, req.body.currency.toUpperCase());
      return load(user.id, user.baseCurrency);
    },
  );

  app.delete(
    '/rates/:currency',
    {
      schema: {
        tags: ['currencies'],
        summary: 'Stop tracking a currency',
        params: z.object({ currency: z.string().length(3) }),
      },
    },
    async (req) => {
      const user = currentUser(req);
      const used = await usedCurrencies(db, user.id);
      const code = req.params.currency.toUpperCase();
      if (used.includes(code))
        throw new HttpError(400, 'This currency is used by one of your accounts');
      const [budget] = await db
        .select({ id: budgets.id })
        .from(budgets)
        .where(and(eq(budgets.userId, user.id), eq(budgets.currency, code)))
        .limit(1);
      const [goal] = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.userId, user.id), eq(goals.currency, code)))
        .limit(1);
      if (budget || goal) throw new HttpError(400, 'This currency is used by a budget or a goal');
      await db
        .delete(exchangeRates)
        .where(and(eq(exchangeRates.userId, user.id), eq(exchangeRates.currency, code)));
      return load(user.id, user.baseCurrency);
    },
  );

  app.post(
    '/refresh',
    {
      schema: {
        tags: ['currencies'],
        summary: 'Update rates from the European Central Bank reference rates',
        body: z.object({ overrideManual: z.boolean().default(false) }).optional(),
      },
    },
    async (req) => {
      const user = currentUser(req);
      try {
        await refreshReferenceRates(db, app.config.EXCHANGE_RATES_URL);
      } catch (err) {
        req.log.warn({ err }, 'Could not download reference rates');
        throw new HttpError(
          502,
          'Could not download exchange rates. Check the server internet connection.',
        );
      }
      if (req.body?.overrideManual) {
        await db
          .update(exchangeRates)
          .set({ source: 'ecb' })
          .where(and(eq(exchangeRates.userId, user.id), eq(exchangeRates.source, 'manual')));
      }
      await applyReferenceRates(db, user.id, user.baseCurrency);
      return load(user.id, user.baseCurrency);
    },
  );
};
