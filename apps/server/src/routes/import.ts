import { importInput } from '@dostotinka/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
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
};
