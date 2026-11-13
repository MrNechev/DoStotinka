import type { ServerConfig } from '@dostotinka/shared';
import { CURRENCIES } from '@dostotinka/shared';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { oidcEnabled } from '../services/oidc';
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
        automaticImport: app.config.AUTOMATIC_IMPORT,
        demo: {
          enabled: app.config.DEMO_ENABLED,
          email: app.config.DEMO_ENABLED ? app.config.DEMO_EMAIL : null,
        },
        sso: { enabled: oidcEnabled(app.config), buttonText: app.config.OIDC_BUTTON_TEXT },
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
