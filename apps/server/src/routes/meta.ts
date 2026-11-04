import type { ServerConfig } from '@slavotax/shared';
import { CURRENCIES } from '@slavotax/shared';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registrationOpen } from '../services/settings';

export const metaRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    { schema: { tags: ['meta'], summary: 'Health check' } },
    async (_req, reply) => {
      try {
        await app.db.execute(sql`select 1`);
        return { status: 'ok', version: app.config.version };
      } catch {
        return reply.status(503).send({ status: 'error', version: app.config.version });
      }
    },
  );

  app.get(
    '/config',
    { schema: { tags: ['meta'], summary: 'Public server configuration' } },
    async () => {
      const body: ServerConfig = {
        version: app.config.version,
        registrationEnabled: await registrationOpen(app.db, app.config),
        notificationsEnabled: app.config.NOTIFICATIONS_ENABLED,
        demo: {
          enabled: app.config.DEMO_ENABLED,
          email: app.config.DEMO_ENABLED ? app.config.DEMO_EMAIL : null,
        },
      };
      return body;
    },
  );

  app.get(
    '/currencies/supported',
    { schema: { tags: ['currencies'], summary: 'Supported currencies' } },
    async () => CURRENCIES,
  );
};
