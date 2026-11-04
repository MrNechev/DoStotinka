import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { HttpError } from '../lib/errors';
import { createSession, setSessionCookie } from '../plugins/auth';
import {
  callbackPath,
  finishLogin,
  linkIdentity,
  oidcEnabled,
  openState,
  publicBaseUrl,
  SsoError,
  sealState,
  startLogin,
  userForIdentity,
} from '../services/oidc';

const STATE_COOKIE = 'dostotinka_oidc';

/** Single sign-on with OpenID Connect (authorization code flow with PKCE). */
export const oidcRoutes: FastifyPluginAsync = async (app) => {
  const rateLimit = { max: app.config.RATE_LIMIT_AUTH_PER_MINUTE, timeWindow: '1 minute' };
  const cookieOptions = (secure: boolean) => ({
    path: '/api/auth/oidc',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
  });
  const isSecure = (base: string) =>
    app.config.COOKIE_SECURE === 'auto'
      ? base.startsWith('https://')
      : app.config.COOKIE_SECURE === 'true';
  const fail = (reply: FastifyReply, base: string, code: string) =>
    reply.redirect(`${base}/login?sso_error=${code}`);

  app.get(
    '/start',
    {
      schema: { tags: ['auth'], summary: 'Start a single sign-on login (redirects)' },
      config: { rateLimit },
    },
    async (req, reply) => {
      if (!oidcEnabled(app.config)) throw new HttpError(404, 'Single sign-on is not configured');
      const base = publicBaseUrl(app.config, req);
      // `?link=1`: a logged-in user connects SSO to their account.
      const link = (req.query as Record<string, string | undefined>).link === '1';
      if (link && (!req.user || req.user.isDemo)) return reply.redirect(`${base}/login`);
      try {
        const { url, state } = await startLogin(
          app.config,
          `${base}${callbackPath}`,
          link ? req.user!.id : undefined,
        );
        reply.setCookie(STATE_COOKIE, sealState(state), {
          ...cookieOptions(isSecure(base)),
          maxAge: 600,
        });
        return reply.redirect(url);
      } catch (err) {
        req.log.warn({ err }, 'Single sign-on: provider discovery failed');
        return fail(reply, base, 'unavailable');
      }
    },
  );

  app.get(
    '/callback',
    {
      schema: { tags: ['auth'], summary: 'Single sign-on callback (redirects)' },
      config: { rateLimit },
    },
    async (req, reply) => {
      if (!oidcEnabled(app.config)) throw new HttpError(404, 'Single sign-on is not configured');
      const base = publicBaseUrl(app.config, req);
      const state = openState(req.cookies[STATE_COOKIE]);
      reply.clearCookie(STATE_COOKIE, cookieOptions(isSecure(base)));
      if (!state) return fail(reply, base, 'expired');
      const query = req.query as Record<string, string | undefined>;
      if (state.linkUserId) {
        // Connecting SSO from Settings: only for the user who started it, still logged in.
        const settings = (q: string) => reply.redirect(`${base}/settings?${q}`);
        if (query.error) return settings('sso_error=cancelled');
        if (req.user?.id !== state.linkUserId) return fail(reply, base, 'expired');
        try {
          const identity = await finishLogin(app.config, new URL(`${base}${req.url}`), state);
          await linkIdentity(app.db, state.linkUserId, identity.subject);
          return settings('sso=linked');
        } catch (err) {
          if (err instanceof SsoError) return settings(`sso_error=${err.code}`);
          req.log.warn({ err }, 'Single sign-on: connecting the account failed');
          return settings('sso_error=failed');
        }
      }
      if (query.error) return fail(reply, base, 'cancelled');
      try {
        const identity = await finishLogin(app.config, new URL(`${base}${req.url}`), state);
        const user = await userForIdentity(app.db, app.config, identity);
        const session = await createSession(app.db, app.config, user.id, req);
        setSessionCookie(reply, req, app.config, session.token, session.expiresAt);
        return reply.redirect(`${base}/`);
      } catch (err) {
        if (err instanceof SsoError) return fail(reply, base, err.code);
        req.log.warn({ err }, 'Single sign-on failed');
        return fail(reply, base, 'failed');
      }
    },
  );
};
