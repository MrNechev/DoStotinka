import { householdInviteInput } from '@dostotinka/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessionUser } from '../plugins/auth';
import {
  acceptInvite,
  cancelInvite,
  householdState,
  invite,
  leaveHousehold,
  removeMember,
} from '../services/household';

const idParams = z.object({ id: z.uuid() });

/** Sharing data with other users of this server (always about the person who is logged in). */
export const householdRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app;

  app.get(
    '/',
    { schema: { tags: ['household'], summary: 'Members, invitations and my role' } },
    async (req) => householdState(db, sessionUser(req)),
  );

  app.post(
    '/invites',
    {
      schema: {
        tags: ['household'],
        summary: 'Invite someone (by e-mail) to share your data',
        body: householdInviteInput,
      },
    },
    async (req) => {
      await invite(db, sessionUser(req), req.body.email);
      return householdState(db, sessionUser(req));
    },
  );

  app.delete(
    '/invites/:id',
    {
      schema: {
        tags: ['household'],
        summary: 'Cancel (owner) or decline (invited person) an invitation',
        params: idParams,
      },
    },
    async (req) => {
      await cancelInvite(db, sessionUser(req), req.params.id);
      return householdState(db, sessionUser(req));
    },
  );

  app.post(
    '/invites/:id/accept',
    {
      schema: { tags: ['household'], summary: 'Join the household', params: idParams },
    },
    async (req) => {
      await acceptInvite(db, sessionUser(req), req.params.id);
      return { ok: true };
    },
  );

  app.post(
    '/leave',
    { schema: { tags: ['household'], summary: 'Leave the household – your own data comes back' } },
    async (req) => {
      await leaveHousehold(db, sessionUser(req));
      return { ok: true };
    },
  );

  app.delete(
    '/members/:id',
    {
      schema: { tags: ['household'], summary: 'Remove a member (owner)', params: idParams },
    },
    async (req) => {
      await removeMember(db, sessionUser(req), req.params.id);
      return householdState(db, sessionUser(req));
    },
  );
};
