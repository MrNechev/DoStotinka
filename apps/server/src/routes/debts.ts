import { debtInput, debtMovementInput, debtUpdateInput } from '@slavotax/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import { addDebtMovement, createDebt, deleteDebt, listDebts, updateDebt } from '../services/debts';

const idParams = z.object({ id: z.uuid() });

export const debtRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get('/', { schema: { tags: ['debts'], summary: 'Money lent and borrowed' } }, async (req) =>
    listDebts(db, currentUser(req)),
  );

  app.post(
    '/',
    {
      schema: {
        tags: ['debts'],
        summary: 'Lend or borrow money (with an account, a record moves the money)',
        body: debtInput,
      },
    },
    async (req, reply) => reply.status(201).send(await createDebt(db, currentUser(req), req.body)),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['debts'],
        summary: 'Rename, change the due date or note, close or reopen a debt',
        params: idParams,
        body: debtUpdateInput,
      },
    },
    async (req) => updateDebt(db, currentUser(req), req.params.id, req.body),
  );

  app.post(
    '/:id/movements',
    {
      schema: {
        tags: ['debts'],
        summary: 'Record a repayment or more money lent/borrowed',
        params: idParams,
        body: debtMovementInput,
      },
    },
    async (req, reply) =>
      reply.status(201).send(await addDebtMovement(db, currentUser(req), req.params.id, req.body)),
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['debts'],
        summary: 'Delete a debt and the records of its money movements',
        params: idParams,
      },
    },
    async (req, reply) => {
      await deleteDebt(db, currentUser(req).id, req.params.id);
      return reply.status(204).send();
    },
  );
};
