import {
  type AdminSettings,
  type AdminUser,
  adminCreateUserInput,
  adminSettingsInput,
  adminUpdateUserInput,
} from '@dostotinka/shared';
import { and, asc, count, eq, max, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { accounts, records, sessions, users } from '../db/schema';
import { hashPassword } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import { seedDefaultCategories } from '../services/categories';
import { registrationOpen, setSetting } from '../services/settings';

const idParams = z.object({ id: z.uuid() });

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config } = app;

  const settings = async (): Promise<AdminSettings> => ({
    registrationEnabled: await registrationOpen(db, config),
    registrationDefault: config.ALLOW_REGISTRATION,
    demoEnabled: config.DEMO_ENABLED,
    version: config.version,
  });

  app.get(
    '/users',
    { schema: { tags: ['admin'], summary: 'All users of this server' } },
    async () => {
      const [rows, accountCounts, recordCounts, activity] = await Promise.all([
        db.select().from(users).orderBy(asc(users.createdAt)),
        db.select({ userId: accounts.userId, n: count() }).from(accounts).groupBy(accounts.userId),
        db.select({ userId: records.userId, n: count() }).from(records).groupBy(records.userId),
        db
          .select({ userId: sessions.userId, last: max(sessions.lastUsedAt) })
          .from(sessions)
          .groupBy(sessions.userId),
      ]);
      const accountsOf = new Map(accountCounts.map((r) => [r.userId, r.n]));
      const recordsOf = new Map(recordCounts.map((r) => [r.userId, r.n]));
      const activeOf = new Map(activity.map((r) => [r.userId, r.last]));
      return rows.map(
        (u): AdminUser => ({
          id: u.id,
          name: u.name,
          email: u.email,
          isAdmin: u.isAdmin,
          isDemo: u.isDemo,
          twoFactorEnabled: !!u.totpSecret,
          createdAt: u.createdAt.toISOString(),
          lastActiveAt: activeOf.get(u.id)?.toISOString() ?? null,
          accountCount: accountsOf.get(u.id) ?? 0,
          recordCount: recordsOf.get(u.id) ?? 0,
        }),
      );
    },
  );

  app.post(
    '/users',
    { schema: { tags: ['admin'], summary: 'Create a user', body: adminCreateUserInput } },
    async (req, reply) => {
      const input = req.body;
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email));
      if (existing) throw conflict('An account with this e-mail already exists');
      const passwordHash = await hashPassword(input.password);
      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            name: input.name,
            email: input.email,
            passwordHash,
            isAdmin: input.isAdmin,
            baseCurrency: input.baseCurrency ?? currentUser(req).baseCurrency,
            timezone: currentUser(req).timezone,
          })
          .returning();
        await seedDefaultCategories(tx, user!.id);
        return user!;
      });
      return reply.status(201).send({ id: created.id });
    },
  );

  app.patch(
    '/users/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Update a user',
        params: idParams,
        body: adminUpdateUserInput,
      },
    },
    async (req, reply) => {
      const me = currentUser(req);
      const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!target) throw notFound('User');
      if (target.isDemo) throw badRequest('The demo account cannot be changed');
      if (req.body.isAdmin === false && target.id === me.id) {
        throw badRequest('You cannot remove your own administrator rights');
      }
      const patch: Partial<typeof users.$inferInsert> = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.isAdmin !== undefined) patch.isAdmin = req.body.isAdmin;
      if (req.body.password) patch.passwordHash = await hashPassword(req.body.password);
      if (req.body.disableTwoFactor) {
        Object.assign(patch, {
          totpSecret: null,
          totpPendingSecret: null,
          totpLastStep: null,
          recoveryCodes: [],
        });
      }
      if (Object.keys(patch).length)
        await db.update(users).set(patch).where(eq(users.id, target.id));
      // A password reset signs the user out everywhere.
      if (req.body.password && target.id !== me.id)
        await db.delete(sessions).where(eq(sessions.userId, target.id));
      return reply.status(204).send();
    },
  );

  app.delete(
    '/users/:id',
    { schema: { tags: ['admin'], summary: 'Delete a user and all their data', params: idParams } },
    async (req, reply) => {
      const me = currentUser(req);
      if (req.params.id === me.id)
        throw badRequest('Use Settings → Delete account to delete yourself');
      const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!target) throw notFound('User');
      if (target.isDemo)
        throw badRequest('Disable the demo account with DEMO_ENABLED=false instead');
      if (target.isAdmin) {
        const [{ n } = { n: 0 }] = await db
          .select({ n: count() })
          .from(users)
          .where(and(eq(users.isAdmin, true), ne(users.id, target.id)));
        if (n === 0) throw badRequest('At least one administrator must remain');
      }
      await db.delete(users).where(eq(users.id, target.id));
      return reply.status(204).send();
    },
  );

  app.get('/settings', { schema: { tags: ['admin'], summary: 'Server settings' } }, async () =>
    settings(),
  );

  app.patch(
    '/settings',
    { schema: { tags: ['admin'], summary: 'Change server settings', body: adminSettingsInput } },
    async (req) => {
      await setSetting(db, 'registrationEnabled', req.body.registrationEnabled);
      return settings();
    },
  );
};
