import { bulkUpdateInput, recordInput, recordListQuery } from '@slavotax/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import {
  bulkUpdateRecords,
  createRecord,
  deleteRecord,
  deleteRecords,
  getRecord,
  listPayees,
  listRecords,
  summarizeRecords,
  updateRecord,
} from '../services/records';

const idParams = z.object({ id: z.uuid() });

export const recordRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    {
      schema: {
        tags: ['records'],
        summary: 'List records (newest first, cursor paginated)',
        querystring: recordListQuery,
      },
    },
    async (req) => listRecords(db, currentUser(req).id, req.query),
  );

  app.get(
    '/summary',
    {
      schema: {
        tags: ['records'],
        summary: 'Income/expense totals of the records matching the filter (base currency)',
        querystring: recordListQuery,
      },
    },
    async (req) => summarizeRecords(db, currentUser(req), req.query),
  );

  app.get(
    '/payees',
    {
      schema: {
        tags: ['records'],
        summary: 'Previously used payees',
        querystring: z.object({ search: z.string().max(100).optional() }),
      },
    },
    async (req) => listPayees(db, currentUser(req).id, req.query.search),
  );

  app.get(
    '/:id',
    { schema: { tags: ['records'], summary: 'Get a record', params: idParams } },
    async (req) => getRecord(db, currentUser(req).id, req.params.id),
  );

  app.post(
    '/',
    {
      schema: {
        tags: ['records'],
        summary: 'Create an expense, income or transfer (transfers create two linked records)',
        body: recordInput,
      },
    },
    async (req, reply) => {
      const items = await createRecord(db, currentUser(req), req.body);
      return reply.status(201).send(items);
    },
  );

  app.put(
    '/:id',
    {
      schema: {
        tags: ['records'],
        summary: 'Replace a record',
        params: idParams,
        body: recordInput,
      },
    },
    async (req) => updateRecord(db, currentUser(req), req.params.id, req.body),
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['records'],
        summary: 'Delete a record (and its transfer counterpart)',
        params: idParams,
      },
    },
    async (req, reply) => {
      await deleteRecord(db, currentUser(req).id, req.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/bulk-update',
    {
      schema: {
        tags: ['records'],
        summary: 'Change category, account or labels of several records',
        body: bulkUpdateInput,
      },
    },
    async (req) => ({ updated: await bulkUpdateRecords(db, currentUser(req).id, req.body) }),
  );

  app.post(
    '/bulk-delete',
    {
      schema: {
        tags: ['records'],
        summary: 'Delete several records',
        body: z.object({ ids: z.array(z.uuid()).min(1).max(1000) }),
      },
    },
    async (req) => ({ deleted: await deleteRecords(db, currentUser(req).id, req.body.ids) }),
  );
};
