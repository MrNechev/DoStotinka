import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config';
import type { Database } from '../db';
import { sessions, type UserRow, users } from '../db/schema';
import { generateToken, sha256 } from '../lib/crypto';
import { forbidden, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'slavotax_session';
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
    sessionId: string | null;
  }
}

function readToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookie = req.cookies?.[SESSION_COOKIE];
  return cookie || null;
}

export function registerAuth(app: FastifyInstance, db: Database, config: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    const token = readToken(req);
    if (!token) return;
    const id = sha256(token);
    const now = new Date();
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
      .limit(1);
    if (!row) return;
    req.user = row.user;
    req.sessionId = id;
    if (now.getTime() - row.session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      // Browser sessions slide; named API tokens keep their own (long) expiry.
      const expiresAt = row.session.name
        ? row.session.expiresAt
        : new Date(now.getTime() + config.SESSION_TTL_DAYS * 86_400_000);
      await db.update(sessions).set({ lastUsedAt: now, expiresAt }).where(eq(sessions.id, id));
    }
  });
}

export async function requireAuth(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
}

export async function requireAdmin(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  if (!req.user.isAdmin) throw forbidden('Administrator rights required');
}

/** Returns the authenticated user or throws 401 (for use inside protected handlers). */
export function currentUser(req: FastifyRequest): UserRow {
  if (!req.user) throw unauthorized();
  return req.user;
}

export async function createSession(
  db: Database,
  config: Config,
  userId: string,
  req: FastifyRequest,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    ip: req.ip ?? null,
  });
  return { token, expiresAt };
}

export function setSessionCookie(
  reply: FastifyReply,
  req: FastifyRequest,
  config: Config,
  token: string,
  expiresAt: Date,
) {
  const secure =
    config.COOKIE_SECURE === 'auto' ? req.protocol === 'https' : config.COOKIE_SECURE === 'true';
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
