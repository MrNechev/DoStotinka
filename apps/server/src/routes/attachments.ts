import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { badRequest, forbidden } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import {
  ATTACHMENT_TYPES,
  addAttachment,
  deleteAttachment,
  getAttachmentFile,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
} from '../services/attachments';

const idParams = z.object({ id: z.uuid() });

/** Receipts and other files attached to records. */
export const attachmentRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  // Uploads are the raw file bytes with their own Content-Type (no multipart). Such requests need a
  // CORS preflight, so they cannot be forged by other sites. Unknown types are rejected below with
  // a readable message instead of a bare 415.
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer', bodyLimit: MAX_ATTACHMENT_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.get(
    '/records/:id/attachments',
    { schema: { tags: ['attachments'], summary: 'Files attached to a record', params: idParams } },
    async (req) => listAttachments(db, currentUser(req).id, req.params.id),
  );

  app.post(
    '/records/:id/attachments',
    {
      bodyLimit: MAX_ATTACHMENT_BYTES,
      schema: {
        tags: ['attachments'],
        summary: `Attach a file to a record. Send the raw file as the body with its Content-Type (${ATTACHMENT_TYPES.join(', ')}; at most 10 MB).`,
        params: idParams,
        querystring: z.object({ name: z.string().max(255).optional() }),
      },
    },
    async (req, reply) => {
      const user = currentUser(req);
      if (user.isDemo) throw forbidden('Attachments are not available for the demo account');
      const contentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!Buffer.isBuffer(req.body)) throw badRequest('Send the file as the request body');
      const created = await addAttachment(db, user.id, req.params.id, {
        data: req.body,
        contentType,
        fileName: req.query.name,
      });
      return reply.status(201).send(created);
    },
  );

  app.get(
    '/attachments/:id',
    {
      schema: {
        tags: ['attachments'],
        summary: 'Download an attached file',
        params: idParams,
        querystring: z.object({ download: z.stringbool().optional() }),
      },
    },
    async (req, reply) => {
      const file = await getAttachmentFile(db, currentUser(req).id, req.params.id);
      const disposition = req.query.download ? 'attachment' : 'inline';
      reply
        .header('content-type', file.contentType)
        .header(
          'content-disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        )
        // Files never change – a new upload gets a new id.
        .header('cache-control', 'private, max-age=31536000, immutable');
      if (file.contentType.startsWith('image/')) {
        reply.header(
          'content-security-policy',
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        );
      } else {
        // Built-in PDF viewers refuse to run under the restrictive API policy. The type is fixed
        // and checked on upload, and `nosniff` stops browsers from treating it as HTML.
        reply.removeHeader('content-security-policy');
      }
      return reply.send(file.data);
    },
  );

  app.delete(
    '/attachments/:id',
    { schema: { tags: ['attachments'], summary: 'Delete an attached file', params: idParams } },
    async (req, reply) => {
      await deleteAttachment(db, currentUser(req).id, req.params.id);
      return reply.status(204).send();
    },
  );
};
