import { plannedPaymentInput, plannedPaymentPayInput } from '@dostotinka/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { safeTimeZone } from '../lib/dates';
import { currentUser } from '../plugins/auth';
import {
  createPlanned,
  deletePlanned,
  getPlanned,
  listPlanned,
  payPlanned,
  skipPlanned,
  upcoming,
  updatePlanned,
} from '../services/planned';

const idParams = z.object({ id: z.uuid() });

export const plannedRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get('/', { schema: { tags: ['planned'], summary: 'List planned payments' } }, async (req) =>
    listPlanned(db, currentUser(req).id),
  );

  app.get(
    '/upcoming',
    {
      schema: {
        tags: ['planned'],
        summary: 'Overdue and upcoming occurrences',
        querystring: z.object({
          days: z.coerce.number().int().min(0).max(400).default(30),
          tz: z.string().max(64).optional(),
        }),
      },
    },
    async (req) => {
      const user = currentUser(req);
      return upcoming(db, user, req.query.days, safeTimeZone(req.query.tz, user.timezone));
    },
  );

  app.get(
    '/:id',
    { schema: { tags: ['planned'], summary: 'Get a planned payment', params: idParams } },
    async (req) => getPlanned(db, currentUser(req).id, req.params.id),
  );

  app.post(
    '/',
    {
      schema: { tags: ['planned'], summary: 'Create a planned payment', body: plannedPaymentInput },
    },
    async (req, reply) =>
      reply.status(201).send(await createPlanned(db, currentUser(req).id, req.body)),
  );

  app.put(
    '/:id',
    {
      schema: {
        tags: ['planned'],
        summary: 'Update a planned payment',
        params: idParams,
        body: plannedPaymentInput,
      },
    },
    async (req) => updatePlanned(db, currentUser(req).id, req.params.id, req.body),
  );

  app.delete(
    '/:id',
    { schema: { tags: ['planned'], summary: 'Delete a planned payment', params: idParams } },
    async (req, reply) => {
      await deletePlanned(db, currentUser(req).id, req.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/pay',
    {
      schema: {
        tags: ['planned'],
        summary: 'Mark the next occurrence as paid (creates a record)',
        params: idParams,
        body: plannedPaymentPayInput,
      },
    },
    async (req) => payPlanned(db, currentUser(req), req.params.id, req.body),
  );

  app.post(
    '/:id/skip',
    { schema: { tags: ['planned'], summary: 'Skip the next occurrence', params: idParams } },
    async (req) => skipPlanned(db, currentUser(req).id, req.params.id),
  );
};
