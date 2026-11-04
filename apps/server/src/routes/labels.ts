import { labelInput } from '@dostotinka/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { labels } from '../db/schema';
import { notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { toLabel } from '../services/dto';

const idParams = z.object({ id: z.uuid() });

export const labelRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get('/', { schema: { tags: ['labels'], summary: 'List labels' } }, async (req) => {
    const user = currentUser(req);
    const rows = await db
      .select()
      .from(labels)
      .where(eq(labels.userId, user.id))
      .orderBy(asc(labels.name));
    return rows.map(toLabel);
  });

  app.post(
    '/',
    { schema: { tags: ['labels'], summary: 'Create a label', body: labelInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const [row] = await db
        .insert(labels)
        .values({ ...req.body, userId: user.id })
        .returning();
      return reply.status(201).send(toLabel(row!));
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['labels'],
        summary: 'Update a label',
        params: idParams,
        body: labelInput.partial(),
      },
    },
    async (req) => {
      const user = currentUser(req);
      const patch = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) {
        const [current] = await db
          .select()
          .from(labels)
          .where(and(eq(labels.id, req.params.id), eq(labels.userId, user.id)));
        if (!current) throw notFound('Label');
        return toLabel(current);
      }
      const [row] = await db
        .update(labels)
        .set(patch)
        .where(and(eq(labels.id, req.params.id), eq(labels.userId, user.id)))
        .returning();
      if (!row) throw notFound('Label');
      return toLabel(row);
    },
  );

  app.delete(
    '/:id',
    { schema: { tags: ['labels'], summary: 'Delete a label', params: idParams } },
    async (req, reply) => {
      const user = currentUser(req);
      const [row] = await db
        .delete(labels)
        .where(and(eq(labels.id, req.params.id), eq(labels.userId, user.id)))
        .returning({ id: labels.id });
      if (!row) throw notFound('Label');
      return reply.status(204).send();
    },
  );
};
