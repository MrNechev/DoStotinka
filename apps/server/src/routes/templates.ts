import { type RecordTemplate, templateInput } from '@dostotinka/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db';
import {
  accounts,
  categories,
  labels,
  type RecordTemplateRow,
  recordTemplates,
} from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';

const idParams = z.object({ id: z.uuid() });
const MAX_TEMPLATES = 100;
type Input = z.output<typeof templateInput>;

export function toTemplate(t: RecordTemplateRow): RecordTemplate {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    categoryId: t.categoryId,
    amount: t.amount,
    note: t.note,
    payee: t.payee,
    labelIds: t.labelIds,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Checks that referenced accounts, category and labels belong to the user; returns DB values. */
async function values(db: Database, userId: string, input: Input) {
  const accountIds = [input.accountId, input.toAccountId].filter((id): id is string => !!id);
  if (accountIds.length) {
    const owned = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), inArray(accounts.id, accountIds)));
    if (owned.length !== new Set(accountIds).size) throw badRequest('Unknown account');
  }
  const isTransfer = input.type === 'transfer';
  if (isTransfer && input.accountId && input.accountId === input.toAccountId) {
    throw badRequest('Choose two different accounts for a transfer');
  }
  if (input.categoryId && !isTransfer) {
    const [owned] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, input.categoryId)));
    if (!owned) throw badRequest('Unknown category');
  }
  const labelIds = [...new Set(input.labelIds)];
  if (labelIds.length) {
    const owned = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.userId, userId), inArray(labels.id, labelIds)));
    if (owned.length !== labelIds.length) throw badRequest('Unknown label');
  }
  return {
    name: input.name,
    type: input.type,
    accountId: input.accountId ?? null,
    toAccountId: isTransfer ? (input.toAccountId ?? null) : null,
    categoryId: isTransfer ? null : (input.categoryId ?? null),
    amount: input.amount ?? null,
    note: input.note ?? null,
    payee: isTransfer ? null : (input.payee ?? null),
    labelIds,
  };
}

export const templateRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get('/', { schema: { tags: ['templates'], summary: 'Record templates' } }, async (req) => {
    const rows = await db
      .select()
      .from(recordTemplates)
      .where(eq(recordTemplates.userId, currentUser(req).id))
      .orderBy(asc(recordTemplates.name));
    return rows.map(toTemplate);
  });

  app.post(
    '/',
    { schema: { tags: ['templates'], summary: 'Save a record template', body: templateInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const [{ value: existing } = { value: 0 }] = await db
        .select({ value: count() })
        .from(recordTemplates)
        .where(eq(recordTemplates.userId, user.id));
      if (existing >= MAX_TEMPLATES) {
        throw badRequest(`You can have at most ${MAX_TEMPLATES} templates`);
      }
      const [row] = await db
        .insert(recordTemplates)
        .values({ userId: user.id, ...(await values(db, user.id, req.body)) })
        .returning();
      return reply.status(201).send(toTemplate(row!));
    },
  );

  app.put(
    '/:id',
    {
      schema: {
        tags: ['templates'],
        summary: 'Replace a record template',
        params: idParams,
        body: templateInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const [row] = await db
        .update(recordTemplates)
        .set(await values(db, user.id, req.body))
        .where(and(eq(recordTemplates.id, req.params.id), eq(recordTemplates.userId, user.id)))
        .returning();
      if (!row) throw notFound('Template');
      return toTemplate(row);
    },
  );

  app.delete(
    '/:id',
    { schema: { tags: ['templates'], summary: 'Delete a record template', params: idParams } },
    async (req, reply) => {
      const user = currentUser(req);
      const deleted = await db
        .delete(recordTemplates)
        .where(and(eq(recordTemplates.id, req.params.id), eq(recordTemplates.userId, user.id)))
        .returning({ id: recordTemplates.id });
      if (!deleted.length) throw notFound('Template');
      return reply.status(204).send();
    },
  );
};
