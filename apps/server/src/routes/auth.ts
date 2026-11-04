import { loginInput, registerInput } from '@dostotinka/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sessions, users } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { safeTimeZone } from '../lib/dates';
import { conflict, forbidden, HttpError, unauthorized } from '../lib/errors';
import { clearSessionCookie, createSession, setSessionCookie } from '../plugins/auth';
import { seedDefaultCategories } from '../services/categories';
import { toUser } from '../services/dto';
import { realUserCount, registrationOpen } from '../services/settings';
import { verifySecondFactor } from '../services/two-factor';

// A valid hash used to keep login timing constant for unknown e-mails.
let dummyHash: Promise<string> | null = null;

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const rateLimit = {
    max: app.config.RATE_LIMIT_AUTH_PER_MINUTE,
    timeWindow: '1 minute',
  };

  app.post(
    '/register',
    {
      schema: { tags: ['auth'], summary: 'Create a new user', body: registerInput },
      config: { rateLimit },
    },
    async (req, reply) => {
      if (!(await registrationOpen(app.db, app.config))) {
        throw forbidden('Registration is disabled on this server');
      }
      const firstUser = (await realUserCount(app.db)) === 0;
      const input = req.body;
      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email));
      if (existing) throw conflict('An account with this e-mail already exists');
      const passwordHash = await hashPassword(input.password);
      const user = await app.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            email: input.email,
            name: input.name,
            passwordHash,
            baseCurrency: input.baseCurrency ?? 'EUR',
            timezone: safeTimeZone(input.timezone),
            // The first account of a fresh installation administers the server.
            isAdmin: firstUser,
          })
          .returning();
        await seedDefaultCategories(tx, created!.id);
        return created!;
      });
      const session = await createSession(app.db, app.config, user.id, req);
      setSessionCookie(reply, req, app.config, session.token, session.expiresAt);
      return reply.status(201).send({ user: toUser(user) });
    },
  );

  app.post(
    '/login',
    {
      schema: { tags: ['auth'], summary: 'Log in with e-mail and password', body: loginInput },
      config: { rateLimit },
    },
    async (req, reply) => {
      const { email, password, issueToken } = req.body;
      const [user] = await app.db.select().from(users).where(eq(users.email, email));
      if (!user) {
        dummyHash ??= hashPassword('dostotinka-timing-protection');
        await verifyPassword(await dummyHash, password);
        throw unauthorized('Invalid e-mail or password');
      }
      if (!(await verifyPassword(user.passwordHash, password))) {
        throw unauthorized('Invalid e-mail or password');
      }
      await verifySecondFactor(app.db, user, req.body.code);
      const session = await createSession(app.db, app.config, user.id, req);
      setSessionCookie(reply, req, app.config, session.token, session.expiresAt);
      return { user: toUser(user), ...(issueToken ? { token: session.token } : {}) };
    },
  );

  app.post(
    '/demo',
    { schema: { tags: ['auth'], summary: 'Log in to the demo account' }, config: { rateLimit } },
    async (req, reply) => {
      if (!app.config.DEMO_ENABLED) throw new HttpError(404, 'The demo account is disabled');
      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.email, app.config.DEMO_EMAIL));
      if (!user?.isDemo) throw new HttpError(503, 'The demo account is not ready yet');
      const session = await createSession(app.db, app.config, user.id, req);
      setSessionCookie(reply, req, app.config, session.token, session.expiresAt);
      return { user: toUser(user) };
    },
  );

  app.post('/logout', { schema: { tags: ['auth'], summary: 'Log out' } }, async (req, reply) => {
    if (req.sessionId) await app.db.delete(sessions).where(eq(sessions.id, req.sessionId));
    clearSessionCookie(reply);
    return reply.status(204).send();
  });
};
