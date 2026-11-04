import { categoryInput, categoryUpdateInput, reorderInput } from '@dostotinka/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db';
import { categories, plannedPayments, records } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { toCategory } from '../services/dto';

const idParams = z.object({ id: z.uuid() });

async function getOwned(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  if (!row) throw notFound('Category');
  return row;
}

export const categoryRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    { schema: { tags: ['categories'], summary: 'List all categories (flat)' } },
    async (req) => {
      const user = currentUser(req);
      const rows = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, user.id))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
      return rows.map(toCategory);
    },
  );

  app.get(
    '/usage',
    { schema: { tags: ['categories'], summary: 'Number of records per category' } },
    async (req) => {
      const user = currentUser(req);
      const rows = await db
        .select({ id: records.categoryId, count: sql<number>`count(*)::int` })
        .from(records)
        .where(eq(records.userId, user.id))
        .groupBy(records.categoryId);
      return Object.fromEntries(rows.filter((r) => r.id).map((r) => [r.id!, r.count]));
    },
  );

  app.post(
    '/',
    { schema: { tags: ['categories'], summary: 'Create a category', body: categoryInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const input = req.body;
      let kind = input.kind;
      if (input.parentId) {
        const parent = await getOwned(db, user.id, input.parentId);
        if (parent.parentId) throw badRequest('Subcategories cannot have their own subcategories');
        kind = parent.kind;
      }
      const [{ max } = { max: -1 }] = await db
        .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)::int` })
        .from(categories)
        .where(
          and(
            eq(categories.userId, user.id),
            input.parentId
              ? eq(categories.parentId, input.parentId)
              : sql`${categories.parentId} is null`,
          ),
        );
      const [row] = await db
        .insert(categories)
        .values({
          userId: user.id,
          parentId: input.parentId ?? null,
          kind,
          name: input.name,
          icon: input.icon,
          color: input.color ?? (input.parentId ? null : '#64748B'),
          sortOrder: max + 1,
        })
        .returning();
      return reply.status(201).send(toCategory(row!));
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['categories'],
        summary: 'Update a category',
        params: idParams,
        body: categoryUpdateInput,
      },
    },
    async (req) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      const input = req.body;
      const patch: Partial<typeof categories.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.icon !== undefined) patch.icon = input.icon;
      if (input.color !== undefined) patch.color = input.color;
      if (input.archived !== undefined) patch.archived = input.archived;
      if (input.parentId !== undefined && input.parentId !== existing.parentId) {
        if (input.parentId) {
          if (input.parentId === existing.id)
            throw badRequest('A category cannot be its own parent');
          const parent = await getOwned(db, user.id, input.parentId);
          if (parent.parentId)
            throw badRequest('Subcategories cannot have their own subcategories');
          const [child] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.parentId, existing.id))
            .limit(1);
          if (child) throw badRequest('Move or delete the subcategories first');
          patch.kind = parent.kind;
        } else if (!existing.color) {
          patch.color = '#64748B';
        }
        patch.parentId = input.parentId;
      }
      const [row] = Object.keys(patch).length
        ? await db.update(categories).set(patch).where(eq(categories.id, existing.id)).returning()
        : [existing];
      if (input.archived !== undefined && !existing.parentId) {
        await db
          .update(categories)
          .set({ archived: input.archived })
          .where(eq(categories.parentId, existing.id));
      }
      return toCategory(row!);
    },
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['categories'],
        summary: 'Delete a category. Records of a subcategory move to its parent.',
        params: idParams,
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      const existing = await getOwned(db, user.id, req.params.id);
      await db.transaction(async (tx) => {
        if (existing.parentId) {
          await tx
            .update(records)
            .set({ categoryId: existing.parentId })
            .where(and(eq(records.userId, user.id), eq(records.categoryId, existing.id)));
          await tx
            .update(plannedPayments)
            .set({ categoryId: existing.parentId })
            .where(
              and(eq(plannedPayments.userId, user.id), eq(plannedPayments.categoryId, existing.id)),
            );
        }
        await tx.delete(categories).where(eq(categories.id, existing.id));
      });
      return reply.status(204).send();
    },
  );

  app.post(
    '/reorder',
    { schema: { tags: ['categories'], summary: 'Reorder sibling categories', body: reorderInput } },
    async (req, reply) => {
      const user = currentUser(req);
      const owned = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.userId, user.id), inArray(categories.id, req.body.ids)));
      const ownedIds = new Set(owned.map((o) => o.id));
      await db.transaction(async (tx) => {
        let i = 0;
        for (const id of req.body.ids) {
          if (!ownedIds.has(id)) continue;
          await tx.update(categories).set({ sortOrder: i++ }).where(eq(categories.id, id));
        }
      });
      return reply.status(204).send();
    },
  );
};
