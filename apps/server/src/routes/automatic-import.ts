import {
  type AutomaticImportState,
  automaticImportSettingsInput,
  bankAccountUpdate,
  bankCallbackInput,
  bankConnectInput,
  bankConnectionUpdate,
  bankCredentialsInput,
  inboxBulkInput,
  inboxConfirmInput,
  inboxListQuery,
  inboxUpdateInput,
  notificationAppUpdate,
  notificationIngest,
  notificationSourceInput,
  notificationSourceUpdate,
} from '@dostotinka/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  accounts,
  bankAccounts,
  bankConnections,
  bankCredentials,
  inboxItems,
  notificationApps,
  notificationSources,
  type UserRow,
  users,
} from '../db/schema';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import {
  callbackUrl,
  deleteConnection,
  deleteCredentials,
  finishConnection,
  getOwnedConnection,
  listBanks,
  listConnections,
  saveCredentials,
  startConnection,
  syncConnection,
  toBankAccount,
} from '../services/bank-import';
import {
  bulkInbox,
  confirmAsTransfer,
  confirmInboxItem,
  dismissInboxItem,
  ignoreMatch,
  linkToMatch,
  listInbox,
  pendingCount,
  restoreInboxItem,
  updateInboxItem,
} from '../services/inbox';
import {
  authenticateSource,
  createSource,
  getOwnedSource,
  ingestNotification,
  toApp,
  toSource,
} from '../services/notification-import';

const idParams = z.object({ id: z.uuid() });

/** Origin of the app as the browser sees it (for the bank redirect URL). */
function originOf(req: FastifyRequest, publicUrl?: string): string {
  if (publicUrl) return new URL(publicUrl).origin;
  return `${req.protocol}://${req.headers.host ?? 'localhost'}`;
}

function notDemo(user: UserRow): UserRow {
  if (user.isDemo) {
    throw forbidden('Automatic import is not available in the shared demo account');
  }
  return user;
}

/** Settings, phones and bank connections (behind the normal login). */
export const automaticImportRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config } = app;

  app.addHook('preHandler', async () => {
    if (!config.AUTOMATIC_IMPORT) throw notFound('Automatic import');
  });

  app.get(
    '/',
    { schema: { tags: ['automatic import'], summary: 'Settings, phones and bank connections' } },
    async (req): Promise<AutomaticImportState> => {
      const user = currentUser(req);
      const [sources, apps, creds, connections] = await Promise.all([
        db
          .select()
          .from(notificationSources)
          .where(eq(notificationSources.userId, user.id))
          .orderBy(notificationSources.createdAt),
        db
          .select()
          .from(notificationApps)
          .where(eq(notificationApps.userId, user.id))
          .orderBy(desc(notificationApps.lastSeenAt)),
        db.select().from(bankCredentials).where(eq(bankCredentials.userId, user.id)),
        listConnections(db, user.id),
      ]);
      return {
        available: true,
        notificationsEnabled: user.importNotifications,
        bankEnabled: user.importBank,
        sources: sources.map(toSource),
        apps: apps.map(toApp),
        bank: {
          configured: creds.length > 0,
          applicationId: creds[0]?.applicationId ?? null,
          redirectUrl: creds[0]?.redirectUrl ?? callbackUrl(originOf(req, config.PUBLIC_URL)),
          connections,
        },
      };
    },
  );

  app.patch(
    '/',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Switch phone notifications or bank import on/off',
        body: automaticImportSettingsInput,
      },
    },
    async (req) => {
      const user = notDemo(currentUser(req));
      await db
        .update(users)
        .set({
          ...(req.body.notificationsEnabled !== undefined
            ? { importNotifications: req.body.notificationsEnabled }
            : {}),
          ...(req.body.bankEnabled !== undefined ? { importBank: req.body.bankEnabled } : {}),
        })
        .where(eq(users.id, user.id));
      return { ok: true };
    },
  );

  // ─── Phones (notification sources) ───

  app.post(
    '/sources',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Add a phone – returns its secret token once',
        body: notificationSourceInput,
      },
    },
    async (req, reply) => {
      const user = notDemo(currentUser(req));
      reply.status(201);
      return createSource(db, user.id, req.body.name);
    },
  );

  app.patch(
    '/sources/:id',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Rename, pause or set auto-confirm of a phone',
        params: idParams,
        body: notificationSourceUpdate,
      },
    },
    async (req) => {
      const user = currentUser(req);
      await getOwnedSource(db, user.id, req.params.id);
      const [row] = await db
        .update(notificationSources)
        .set(req.body)
        .where(eq(notificationSources.id, req.params.id))
        .returning();
      return toSource(row!);
    },
  );

  app.delete(
    '/sources/:id',
    { schema: { tags: ['automatic import'], summary: 'Remove a phone', params: idParams } },
    async (req, reply) => {
      const user = currentUser(req);
      await getOwnedSource(db, user.id, req.params.id);
      await db.delete(notificationSources).where(eq(notificationSources.id, req.params.id));
      reply.status(204);
    },
  );

  app.patch(
    '/apps/:id',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Choose the account of an app’s notifications or ignore the app',
        params: idParams,
        body: notificationAppUpdate,
      },
    },
    async (req) => {
      const user = currentUser(req);
      if (req.body.accountId) {
        const [acc] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, req.body.accountId), eq(accounts.userId, user.id)));
        if (!acc) throw notFound('Account');
      }
      const [row] = await db
        .update(notificationApps)
        .set(req.body)
        .where(and(eq(notificationApps.id, req.params.id), eq(notificationApps.userId, user.id)))
        .returning();
      if (!row) throw notFound('App');
      if (req.body.accountId) {
        // Waiting notifications of this app that had no account yet get it now.
        await db
          .update(inboxItems)
          .set({ accountId: req.body.accountId })
          .where(
            and(
              eq(inboxItems.userId, user.id),
              eq(inboxItems.app, row.app),
              eq(inboxItems.status, 'pending'),
              isNull(inboxItems.accountId),
            ),
          );
      }
      return toApp(row);
    },
  );

  app.delete(
    '/apps/:id',
    { schema: { tags: ['automatic import'], summary: 'Forget an app', params: idParams } },
    async (req, reply) => {
      const user = currentUser(req);
      await db
        .delete(notificationApps)
        .where(and(eq(notificationApps.id, req.params.id), eq(notificationApps.userId, user.id)));
      reply.status(204);
    },
  );

  // ─── Open banking (Enable Banking) ───

  app.put(
    '/bank/credentials',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Save your Enable Banking application (ID + private key)',
        body: bankCredentialsInput,
      },
    },
    async (req) => {
      const user = notDemo(currentUser(req));
      return saveCredentials(db, config, user.id, req.body, originOf(req, config.PUBLIC_URL));
    },
  );

  app.delete(
    '/bank/credentials',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Remove the Enable Banking application and all bank connections',
      },
    },
    async (req, reply) => {
      await deleteCredentials(db, config, currentUser(req).id);
      reply.status(204);
    },
  );

  app.get(
    '/bank/banks',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Banks available in a country',
        querystring: z.object({ country: z.string().length(2).toUpperCase() }),
      },
    },
    async (req) => listBanks(db, config, currentUser(req).id, req.query.country),
  );

  app.post(
    '/bank/connections',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Start connecting a bank – returns the URL of the bank’s consent page',
        body: bankConnectInput,
      },
    },
    async (req) => startConnection(db, config, notDemo(currentUser(req)), req.body),
  );

  app.post(
    '/bank/callback',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Finish connecting a bank with the code from the redirect',
        body: bankCallbackInput,
      },
    },
    async (req) => finishConnection(db, config, notDemo(currentUser(req)), req.body),
  );

  app.patch(
    '/bank/connections/:id',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Pause a bank connection or set auto-confirm',
        params: idParams,
        body: bankConnectionUpdate,
      },
    },
    async (req) => {
      const user = currentUser(req);
      await getOwnedConnection(db, user.id, req.params.id);
      await db.update(bankConnections).set(req.body).where(eq(bankConnections.id, req.params.id));
      return { ok: true };
    },
  );

  app.post(
    '/bank/connections/:id/sync',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Fetch new transactions now',
        params: idParams,
      },
    },
    async (req) => {
      const user = currentUser(req);
      await getOwnedConnection(db, user.id, req.params.id);
      return syncConnection(db, config, req.params.id, { manual: true });
    },
  );

  app.delete(
    '/bank/connections/:id',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Disconnect a bank (also ends the consent)',
        params: idParams,
      },
    },
    async (req, reply) => {
      await deleteConnection(db, config, currentUser(req).id, req.params.id);
      reply.status(204);
    },
  );

  app.patch(
    '/bank/accounts/:id',
    {
      schema: {
        tags: ['automatic import'],
        summary: 'Choose the DoStotinka account of a bank account',
        params: idParams,
        body: bankAccountUpdate,
      },
    },
    async (req) => {
      const user = currentUser(req);
      if (req.body.accountId) {
        const [acc] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, req.body.accountId), eq(accounts.userId, user.id)));
        if (!acc) throw notFound('Account');
      }
      const [row] = await db
        .update(bankAccounts)
        .set(req.body)
        .where(and(eq(bankAccounts.id, req.params.id), eq(bankAccounts.userId, user.id)))
        .returning();
      if (!row) throw notFound('Bank account');
      return toBankAccount(row);
    },
  );
};

/** The inbox of imported transactions. */
export const inboxRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    {
      schema: {
        tags: ['inbox'],
        summary: 'Imported transactions (to review, done or ignored notifications)',
        querystring: inboxListQuery,
      },
    },
    async (req) => listInbox(db, currentUser(req).id, req.query.status, req.query.limit),
  );

  app.get(
    '/count',
    { schema: { tags: ['inbox'], summary: 'Number of transactions to review' } },
    async (req) => ({ pending: await pendingCount(db, currentUser(req).id) }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['inbox'],
        summary: 'Change account, type, category or payee before confirming',
        params: idParams,
        body: inboxUpdateInput,
      },
    },
    async (req) => updateInboxItem(db, currentUser(req).id, req.params.id, req.body),
  );

  app.post(
    '/:id/confirm',
    {
      schema: {
        tags: ['inbox'],
        summary: 'Create the record',
        params: idParams,
        body: inboxConfirmInput,
      },
    },
    async (req) => confirmInboxItem(db, currentUser(req), req.params.id, req.body ?? {}),
  );

  app.post(
    '/:id/transfer',
    {
      schema: {
        tags: ['inbox'],
        summary: 'Confirm the item and its pair as one transfer',
        params: idParams,
      },
    },
    async (req) => {
      await confirmAsTransfer(db, currentUser(req), req.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/:id/dismiss',
    { schema: { tags: ['inbox'], summary: 'Do not create a record', params: idParams } },
    async (req) => {
      await dismissInboxItem(db, currentUser(req).id, req.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/:id/link',
    {
      schema: {
        tags: ['inbox'],
        summary: 'It is the matching record that already exists – link it',
        params: idParams,
      },
    },
    async (req) => {
      await linkToMatch(db, currentUser(req).id, req.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/:id/unmatch',
    {
      schema: {
        tags: ['inbox'],
        summary: 'Not the same as the suggested record',
        params: idParams,
      },
    },
    async (req) => {
      await ignoreMatch(db, currentUser(req).id, req.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/:id/restore',
    { schema: { tags: ['inbox'], summary: 'Back to the inbox', params: idParams } },
    async (req) => {
      await restoreInboxItem(db, currentUser(req).id, req.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/bulk',
    {
      schema: { tags: ['inbox'], summary: 'Confirm or dismiss many items', body: inboxBulkInput },
    },
    async (req) => bulkInbox(db, currentUser(req), req.body.ids, req.body.action),
  );
};

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7).trim() || null;
  const q = (req.query as Record<string, unknown> | undefined)?.token;
  return typeof q === 'string' ? q : null;
}

/**
 * Public endpoint for phone automations. Authenticated with the phone's own token (header
 * `Authorization: Bearer …` or `?token=`), which can only add notifications – nothing else.
 * Accepts JSON, form fields or query parameters, so any automation app can use it.
 */
export const ingestRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config } = app;
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string', bodyLimit: 16_384 },
    (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );
  app.addContentTypeParser(
    'text/plain',
    { parseAs: 'string', bodyLimit: 16_384 },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(null, { text: body });
      }
    },
  );

  app.post(
    '/notification',
    {
      bodyLimit: 16_384,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['automatic import'],
        summary: 'Phone automations post a payment notification here',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      if (!config.AUTOMATIC_IMPORT) throw notFound('Automatic import');
      const { source, user } = await authenticateSource(db, bearer(req));
      const query = { ...(req.query as Record<string, unknown>) };
      delete query.token;
      const merged = { ...query, ...((req.body as Record<string, unknown> | undefined) ?? {}) };
      if (typeof merged.amount === 'string' && merged.amount.trim() === '') delete merged.amount;
      const parsed = notificationIngest.safeParse(merged);
      if (!parsed.success) {
        throw badRequest(
          'Invalid notification',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
      if (!parsed.data.title && !parsed.data.text && parsed.data.amount === undefined) {
        throw badRequest('Send the notification `title` and `text` (or `amount`)');
      }
      return ingestNotification(db, source, user, parsed.data);
    },
  );
};
