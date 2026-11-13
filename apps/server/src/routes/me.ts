import {
  type CreatedToken,
  changePasswordInput,
  deleteAccountInput,
  NOTIFY_FORMATS,
  type NotifyFormat,
  passwordConfirmInput,
  type ReminderSettings,
  reminderSettingsInput,
  type Session,
  type TwoFactorSetup,
  twoFactorEnableInput,
  updateProfileInput,
} from '@dostotinka/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessions, type UserRow, users } from '../db/schema';
import { generateToken, hashPassword, sha256, verifyPassword } from '../lib/crypto';
import { isValidTimeZone } from '../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { generateRecoveryCodes, generateSecret, otpauthUrl, verifyTotp } from '../lib/totp';
import { clearSessionCookie, currentUser, sessionUser } from '../plugins/auth';
import { toUser } from '../services/dto';
import { rebaseRates } from '../services/rates';
import { buildReminder, sendReminder, testReminder } from '../services/reminders';
import { backupSchema, restoreBackup } from '../services/restore';

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { tags: ['user'], summary: 'Current user' } }, async (req) => ({
    user: toUser(sessionUser(req), currentUser(req)),
  }));

  app.patch(
    '/',
    {
      schema: { tags: ['user'], summary: 'Update profile & preferences', body: updateProfileInput },
    },
    async (req) => {
      const user = sessionUser(req);
      const input = req.body;
      if (user.isDemo) {
        // The demo account is shared by all visitors: its profile stays as it is. The theme and
        // note suggestions are applied in the browser only.
        const { theme: _theme, noteSuggestions: _notes, ...rest } = input;
        if (Object.values(rest).some((v) => v !== undefined)) {
          throw forbidden('The settings of the shared demo account cannot be changed');
        }
        return { user: toUser(user, currentUser(req)) };
      }
      if (
        user.householdOwnerId &&
        input.baseCurrency !== undefined &&
        input.baseCurrency !== currentUser(req).baseCurrency
      ) {
        throw forbidden('The main currency is set by the owner of the household');
      }
      if (user.householdOwnerId) input.baseCurrency = undefined;
      if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) {
        throw badRequest('Unknown time zone');
      }
      if (Object.values(input).every((v) => v === undefined)) {
        return { user: toUser(user, currentUser(req)) };
      }
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
      return { user: toUser(updated, currentUser(req)) };
    },
  );

  app.post(
    '/password',
    { schema: { tags: ['user'], summary: 'Change password', body: changePasswordInput } },
    async (req, reply) => {
      const user = sessionUser(req);
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
    const user = sessionUser(req);
    const rows = await app.db
      .select()
      .from(sessions)
      .where(
        // Demo visitors share one user – they must not see each other's sessions.
        user.isDemo
          ? and(eq(sessions.userId, user.id), eq(sessions.id, req.sessionId ?? ''))
          : eq(sessions.userId, user.id),
      )
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
      const user = sessionUser(req);
      if (user.isDemo) throw forbidden('Restoring a backup is not available for the demo account');
      if (user.householdOwnerId) {
        throw forbidden('Only the owner of the household can restore a backup');
      }
      return restoreBackup(app.db, user, req.body);
    },
  );

  const reminderSettings = (u: UserRow): ReminderSettings => ({
    url: u.notifyUrl,
    format: (NOTIFY_FORMATS as readonly string[]).includes(u.notifyFormat)
      ? (u.notifyFormat as ReminderSettings['format'])
      : 'ntfy',
    hour: u.notifyHour,
    lastSentOn: u.lastNotifiedOn,
  });
  const assertReminders = (u: UserRow) => {
    if (!app.config.NOTIFICATIONS_ENABLED) throw forbidden('Reminders are disabled on this server');
    if (u.isDemo) throw forbidden('Reminders are not available for the demo account');
  };

  app.get('/reminders', { schema: { tags: ['user'], summary: 'Reminder settings' } }, async (req) =>
    reminderSettings(sessionUser(req)),
  );

  app.put(
    '/reminders',
    {
      schema: {
        tags: ['user'],
        summary: 'Configure daily planned-payment reminders',
        body: reminderSettingsInput,
      },
    },
    async (req) => {
      const user = sessionUser(req);
      assertReminders(user);
      const [row] = await app.db
        .update(users)
        .set({
          notifyUrl: req.body.url,
          notifyFormat: req.body.format,
          notifyHour: req.body.hour,
          lastNotifiedOn: null,
        })
        .where(eq(users.id, user.id))
        .returning();
      return reminderSettings(row!);
    },
  );

  app.post(
    '/reminders/test',
    { schema: { tags: ['user'], summary: 'Send a test reminder now' } },
    async (req) => {
      const user = sessionUser(req);
      assertReminders(user);
      if (!user.notifyUrl) throw badRequest('Save a reminder URL first');
      const message = await buildReminder(app.db, user, new Date(), currentUser(req));
      const test = message.count ? message : testReminder(user.language);
      try {
        await sendReminder(user.notifyUrl, user.notifyFormat as NotifyFormat, test);
      } catch (err) {
        throw badRequest(
          `Could not deliver the reminder: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
      return { sent: true, items: message.count };
    },
  );

  // ───── Two-factor authentication ─────

  const assertPassword = async (u: UserRow, password: string) => {
    if (!(await verifyPassword(u.passwordHash, password))) {
      throw badRequest('Password is incorrect');
    }
  };
  const newRecoveryCodes = () => {
    const codes = generateRecoveryCodes();
    return { codes, hashes: codes.map((c) => sha256(c)) };
  };

  app.post(
    '/2fa/setup',
    { schema: { tags: ['user'], summary: 'Start setting up two-factor login (returns a secret)' } },
    async (req) => {
      const user = sessionUser(req);
      if (user.isDemo) throw forbidden('Two-factor login is not available for the demo account');
      if (user.totpSecret) throw conflict('Two-factor login is already enabled');
      const secret = generateSecret();
      await app.db.update(users).set({ totpPendingSecret: secret }).where(eq(users.id, user.id));
      const setup: TwoFactorSetup = { secret, otpauthUrl: otpauthUrl(secret, user.email) };
      return setup;
    },
  );

  app.post(
    '/2fa/enable',
    {
      schema: {
        tags: ['user'],
        summary: 'Confirm the first code and enable two-factor login (returns recovery codes)',
        body: twoFactorEnableInput,
      },
    },
    async (req) => {
      const user = sessionUser(req);
      if (user.totpSecret) throw conflict('Two-factor login is already enabled');
      if (!user.totpPendingSecret) throw badRequest('Start the setup first');
      await assertPassword(user, req.body.password);
      const step = verifyTotp(user.totpPendingSecret, req.body.code);
      if (step === null) throw badRequest('The code is not valid');
      const { codes, hashes } = newRecoveryCodes();
      await app.db
        .update(users)
        .set({
          totpSecret: user.totpPendingSecret,
          totpPendingSecret: null,
          totpLastStep: step,
          recoveryCodes: hashes,
        })
        .where(eq(users.id, user.id));
      return { recoveryCodes: codes };
    },
  );

  app.post(
    '/2fa/recovery-codes',
    {
      schema: {
        tags: ['user'],
        summary: 'Replace the recovery codes with new ones',
        body: passwordConfirmInput,
      },
    },
    async (req) => {
      const user = sessionUser(req);
      if (!user.totpSecret) throw badRequest('Two-factor login is not enabled');
      await assertPassword(user, req.body.password);
      const { codes, hashes } = newRecoveryCodes();
      await app.db.update(users).set({ recoveryCodes: hashes }).where(eq(users.id, user.id));
      return { recoveryCodes: codes };
    },
  );

  app.post(
    '/2fa/disable',
    {
      schema: {
        tags: ['user'],
        summary: 'Switch off two-factor login',
        body: passwordConfirmInput,
      },
    },
    async (req, reply) => {
      const user = sessionUser(req);
      await assertPassword(user, req.body.password);
      await app.db
        .update(users)
        .set({ totpSecret: null, totpPendingSecret: null, totpLastStep: null, recoveryCodes: [] })
        .where(eq(users.id, user.id));
      return reply.status(204).send();
    },
  );

  app.delete(
    '/oidc',
    { schema: { tags: ['user'], summary: 'Disconnect single sign-on from the account' } },
    async (req, reply) => {
      const user = sessionUser(req);
      await app.db.update(users).set({ oidcSubject: null }).where(eq(users.id, user.id));
      return reply.status(204).send();
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
      const user = sessionUser(req);
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
      const user = sessionUser(req);
      const rows = await app.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.userId, user.id));
      const match = rows.find((s) => s.id.startsWith(req.params.id));
      if (user.isDemo && match && match.id !== req.sessionId) throw notFound('Session');
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
      const user = sessionUser(req);
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
