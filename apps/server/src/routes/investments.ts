import { holdingInput, quoteQuery } from '@dostotinka/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { safeTimeZone } from '../lib/dates';
import { badRequest } from '../lib/errors';
import { currentUser, sessionUser } from '../plugins/auth';
import {
  createHolding,
  deleteHolding,
  fetchQuote,
  listHoldings,
  netWorth,
  refreshPrices,
  updateHolding,
} from '../services/investments';

const idParams = z.object({ id: z.uuid() });

export const holdingRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config } = app;

  app.get('/', { schema: { tags: ['investments'], summary: 'Holdings' } }, (req) =>
    listHoldings(db, currentUser(req).id),
  );

  app.post(
    '/',
    { schema: { tags: ['investments'], summary: 'Add a holding', body: holdingInput } },
    async (req, reply) =>
      reply.status(201).send(await createHolding(db, currentUser(req), req.body)),
  );

  app.put(
    '/:id',
    {
      schema: {
        tags: ['investments'],
        summary: 'Replace a holding',
        params: idParams,
        body: holdingInput,
      },
    },
    (req) => updateHolding(db, currentUser(req), req.params.id, req.body),
  );

  app.delete(
    '/:id',
    { schema: { tags: ['investments'], summary: 'Delete a holding', params: idParams } },
    async (req, reply) => {
      await deleteHolding(db, currentUser(req), req.params.id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/quote',
    {
      schema: {
        tags: ['investments'],
        summary: 'Look up the current price of a ticker (Yahoo Finance) or coin (CoinGecko)',
        querystring: quoteQuery,
      },
    },
    async (req) => {
      if (!config.PRICE_UPDATES) throw badRequest('Price updates are switched off (PRICE_UPDATES)');
      try {
        return await fetchQuote(config, req.query.source, req.query.symbol, req.query.currency);
      } catch (err) {
        if ((err as { statusCode?: number }).statusCode) throw err;
        req.log.warn({ err }, 'Price lookup failed');
        throw badRequest('The price service could not be reached – try again later');
      }
    },
  );

  app.post(
    '/refresh',
    { schema: { tags: ['investments'], summary: 'Update the automatic prices now' } },
    async (req) => {
      if (!config.PRICE_UPDATES) throw badRequest('Price updates are switched off (PRICE_UPDATES)');
      return refreshPrices(db, config, currentUser(req).id);
    },
  );
};

export const netWorthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      schema: {
        tags: ['investments'],
        summary: 'Net worth with its parts and history',
        querystring: z.object({
          months: z.coerce.number().int().min(1).max(120).default(24),
          tz: z.string().max(64).optional(),
        }),
      },
    },
    (req) =>
      netWorth(
        app.db,
        currentUser(req),
        safeTimeZone(req.query.tz, sessionUser(req).timezone),
        req.query.months,
      ),
  );
};
