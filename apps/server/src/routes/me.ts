import {
  type CreatedToken,
  changePasswordInput,
  deleteAccountInput,
  type Session,
  updateProfileInput,
} from '@slavotax/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessions, users } from '../db/schema';
import { generateToken, hashPassword, sha256, verifyPassword } from '../lib/crypto';
import { isValidTimeZone } from '../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { clearSessionCookie, currentUser } from '../plugins/auth';
import { toUser } from '../services/dto';
import { rebaseRates } from '../services/rates';
import { backupSchema, restoreBackup } from '../services/restore';

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { tags: ['user'], summary: 'Current user' } }, async (req) => ({
    user: toUser(currentUser(req)),
  }));

  app.patch(
    '/',
    {
      schema: { tags: ['user'], summary: 'Update profile & preferences', body: updateProfileInput },
    },
    async (req) => {
      const user = currentUser(req);
      const input = req.body;
      if (user.isDemo && input.email && input.email !== user.email) {
        throw forbidden('The e-mail of the demo account cannot be changed');
      }
      if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) {
        throw badRequest('Unknown time zone');
      }
      if (Object.values(input).every((v) => v === undefined)) return { user: toUser(user) };
      if (input.email && input.email !== user.email) {
        const [taken] = await app.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email));
        if (taken) throw conflict('An account with this e-mail already exists');
      }
      const updated = await app.db.transaction(async (tx) => {
        if (input.baseCurrency && input.baseCurrency !== user.baseCurrency) {
          await rebaseRates(tx, user.id, user.baseCurrency, input.baseCurrency);
        }
        const [row] = await tx.update(users).set(input).where(eq(users.id, user.id)).returning();
        return row!;
      });
      return { user: toUser(updated) };
    },
  );

  app.post(
    '/password',
    { schema: { tags: ['user'], summary: 'Change password', body: changePasswordInput } },
    async (req, reply) => {
      const user = currentUser(req);
      if (user.isDemo) throw forbidden('The password of the demo account cannot be changed');
      if (!(await verifyPassword(user.passwordHash, req.body.currentPassword))) {
        throw badRequest('Current password is incorrect');
      }
      await app.db
        .update(users)
        .set({ passwordHash: await hashPassword(req.body.newPassword) })
        .where(eq(users.id, user.id));
      // Sign out every other session.
      await app.db
        .delete(sessions)
        .where(and(eq(sessions.userId, user.id), ne(sessions.id, req.sessionId ?? '')));
      return reply.status(204).send();
    },
  );

  app.get('/sessions', { schema: { tags: ['user'], summary: 'Active sessions' } }, async (req) => {
    const user = currentUser(req);
    const rows = await app.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.lastUsedAt));
    return rows.map(
      (s): Session => ({
        id: s.id.slice(0, 16),
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        userAgent: s.userAgent,
        ip: s.ip,
        current: s.id === req.sessionId,
        name: s.name,
      }),
    );
  });

  app.post(
    '/restore',
    {
      bodyLimit: 100 * 1024 * 1024,
      schema: {
        tags: ['user'],
        summary: 'Replace all your data with a JSON backup (from GET /api/export/backup.json)',
        body: backupSchema,
      },
    },
    async (req) => {
      const user = currentUser(req);
      if (user.isDemo) throw forbidden('Restoring a backup is not available for the demo account');
      return restoreBackup(app.db, user, req.body);
    },
  );

  app.post(
    '/tokens',
    {
      schema: {
        tags: ['user'],
        summary: 'Create a personal API token (for scripts, automations and apps)',
        body: z.object({ name: z.string().trim().min(1).max(60) }),
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      if (user.isDemo) throw forbidden('API tokens are not available for the demo account');
      const token = generateToken();
      const id = sha256(token);
      await app.db.insert(sessions).values({
        id,
        userId: user.id,
        name: req.body.name,
        expiresAt: new Date(Date.now() + 10 * 365 * 86_400_000),
        userAgent: 'API token',
        ip: req.ip ?? null,
      });
      const body: CreatedToken = { id: id.slice(0, 16), name: req.body.name, token };
      return reply.status(201).send(body);
    },
  );

  app.delete(
    '/sessions/:id',
    {
      schema: {
        tags: ['user'],
        summary: 'Revoke a session',
        params: z.object({ id: z.string().regex(/^[0-9a-f]{16}$/) }),
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      const rows = await app.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.userId, user.id));
      const match = rows.find((s) => s.id.startsWith(req.params.id));
      if (!match) throw notFound('Session');
      await app.db.delete(sessions).where(eq(sessions.id, match.id));
      return reply.status(204).send();
    },
  );

  app.delete(
    '/',
    {
      schema: {
        tags: ['user'],
        summary: 'Delete the account and all data',
        body: deleteAccountInput,
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      if (user.isDemo) throw forbidden('The demo account cannot be deleted');
      if (!(await verifyPassword(user.passwordHash, req.body.password))) {
        throw badRequest('Password is incorrect');
      }
      await app.db.delete(users).where(eq(users.id, user.id));
      clearSessionCookie(reply);
      return reply.status(204).send();
    },
  );
};
