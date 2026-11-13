import { applyRuleInput, renamePayeeInput, ruleInput, ruleOrderInput } from '@dostotinka/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import {
  applyRuleToHistory,
  createRule,
  deleteRule,
  listPayeeUsage,
  listRules,
  renamePayee,
  reorderRules,
  updateRule,
} from '../services/rules';

const idParams = z.object({ id: z.uuid() });

export const ruleRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get('/', { schema: { tags: ['rules'], summary: 'Rules, in the order they apply' } }, (req) =>
    listRules(db, currentUser(req).id),
  );

  app.post(
    '/',
    { schema: { tags: ['rules'], summary: 'Create a rule', body: ruleInput } },
    async (req, reply) =>
      reply.status(201).send(await createRule(db, currentUser(req).id, req.body)),
  );

  app.put(
    '/:id',
    { schema: { tags: ['rules'], summary: 'Replace a rule', params: idParams, body: ruleInput } },
    (req) => updateRule(db, currentUser(req).id, req.params.id, req.body),
  );

  app.delete(
    '/:id',
    { schema: { tags: ['rules'], summary: 'Delete a rule', params: idParams } },
    async (req, reply) => {
      await deleteRule(db, currentUser(req).id, req.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/order',
    { schema: { tags: ['rules'], summary: 'Change the order of the rules', body: ruleOrderInput } },
    (req) => reorderRules(db, currentUser(req).id, req.body.ids),
  );

  app.post(
    '/:id/apply',
    {
      schema: {
        tags: ['rules'],
        summary: 'Apply a rule to the existing records (or count them with dryRun)',
        params: idParams,
        body: applyRuleInput,
      },
    },
    (req) => applyRuleToHistory(db, currentUser(req).id, req.params.id, req.body),
  );
};

export const payeeRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get('/', { schema: { tags: ['rules'], summary: 'All payees with their use' } }, (req) =>
    listPayeeUsage(db, currentUser(req).id),
  );

  app.post(
    '/rename',
    {
      schema: {
        tags: ['rules'],
        summary: 'Rename a payee in all records (renaming to an existing payee merges them)',
        body: renamePayeeInput,
      },
    },
    (req) => renamePayee(db, currentUser(req).id, req.body.from, req.body.to),
  );
};
