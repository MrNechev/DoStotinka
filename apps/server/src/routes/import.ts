import { type ImportProfile, importInput, importProfileInput } from '@dostotinka/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { importProfiles } from '../db/schema';
import { notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { importRecords } from '../services/import';

export const importRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/records',
    {
      bodyLimit: 30 * 1024 * 1024,
      schema: {
        tags: ['import'],
        summary: 'Import many records at once (the web app parses CSV files and sends them here)',
        body: importInput,
      },
    },
    async (req) => importRecords(app.db, currentUser(req), req.body),
  );

  const toProfile = (r: typeof importProfiles.$inferSelect): ImportProfile => ({
    id: r.id,
    name: r.name,
    headers: r.headers,
    settings: r.settings as ImportProfile['settings'],
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  });

  app.get(
    '/profiles',
    { schema: { tags: ['import'], summary: 'Saved CSV import profiles' } },
    async (req) => {
      const rows = await app.db
        .select()
        .from(importProfiles)
        .where(eq(importProfiles.userId, currentUser(req).id))
        .orderBy(desc(importProfiles.lastUsedAt), importProfiles.name);
      return rows.map(toProfile);
    },
  );

  app.post(
    '/profiles',
    {
      schema: {
        tags: ['import'],
        summary: 'Save an import profile (replaces the one with the same name)',
        body: importProfileInput,
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      const values = {
        headers: req.body.headers,
        settings: req.body.settings,
        lastUsedAt: new Date(),
      };
      const [row] = await app.db
        .insert(importProfiles)
        .values({ userId: user.id, name: req.body.name, ...values })
        .onConflictDoUpdate({ target: [importProfiles.userId, importProfiles.name], set: values })
        .returning();
      reply.status(201);
      return toProfile(row!);
    },
  );

  app.post(
    '/profiles/:id/used',
    {
      schema: {
        tags: ['import'],
        summary: 'Mark a profile as used',
        params: z.object({ id: z.uuid() }),
      },
    },
    async (req) => {
      const [row] = await app.db
        .update(importProfiles)
        .set({ lastUsedAt: new Date() })
        .where(
          and(eq(importProfiles.id, req.params.id), eq(importProfiles.userId, currentUser(req).id)),
        )
        .returning();
      if (!row) throw notFound('Import profile');
      return toProfile(row);
    },
  );

  app.delete(
    '/profiles/:id',
    {
      schema: {
        tags: ['import'],
        summary: 'Delete an import profile',
        params: z.object({ id: z.uuid() }),
      },
    },
    async (req, reply) => {
      const rows = await app.db
        .delete(importProfiles)
        .where(
          and(eq(importProfiles.id, req.params.id), eq(importProfiles.userId, currentUser(req).id)),
        )
        .returning({ id: importProfiles.id });
      if (!rows.length) throw notFound('Import profile');
      reply.status(204);
    },
  );
};
