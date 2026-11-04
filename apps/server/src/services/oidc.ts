import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import * as client from 'openid-client';
import type { Config } from '../config';
import type { Database } from '../db';
import { type UserRow, users } from '../db/schema';
import { generateToken, hashPassword } from '../lib/crypto';
import { safeTimeZone } from '../lib/dates';
import { seedDefaultCategories } from './categories';
import { realUserCount } from './settings';

export const oidcEnabled = (config: Config) => !!(config.OIDC_ISSUER_URL && config.OIDC_CLIENT_ID);

const configurations = new Map<string, Promise<client.Configuration>>();

/** Discovers the provider once (and again after a failure). */
export function oidcConfiguration(config: Config): Promise<client.Configuration> {
  const issuer = config.OIDC_ISSUER_URL!;
  const key = `${issuer}|${config.OIDC_CLIENT_ID}`;
  let pending = configurations.get(key);
  if (!pending) {
    pending = client
      .discovery(
        new URL(issuer),
        config.OIDC_CLIENT_ID!,
        config.OIDC_CLIENT_SECRET || undefined,
        config.OIDC_CLIENT_SECRET ? undefined : client.None(),
        // Plain HTTP is only accepted for providers on the local network / in tests.
        issuer.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((err) => {
        configurations.delete(key);
        throw err;
      });
    configurations.set(key, pending);
  }
  return pending;
}

/** Base URL of the app as seen by the browser. */
export function publicBaseUrl(config: Config, req: FastifyRequest): string {
  if (config.PUBLIC_URL) return config.PUBLIC_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.host}`;
}

export const callbackPath = '/api/auth/oidc/callback';

// ───── Login state (signed cookie) ─────

export interface LoginState {
  state: string;
  nonce: string;
  verifier: string;
  expires: number;
  /** Set when a logged-in user connects SSO to their account (Settings). */
  linkUserId?: string;
}

/** Key for signing the short-lived login cookie; a restart only invalidates logins in progress. */
const signingKey = randomBytes(32);

export function sealState(value: LoginState): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  const mac = createHmac('sha256', signingKey).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function openState(cookie: string | undefined): LoginState | null {
  if (!cookie) return null;
  const [body, mac] = cookie.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', signingKey).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as LoginState;
    return value.expires > Date.now() ? value : null;
  } catch {
    return null;
  }
}

export async function startLogin(config: Config, redirectUri: string, linkUserId?: string) {
  const conf = await oidcConfiguration(config);
  const verifier = client.randomPKCECodeVerifier();
  const state: LoginState = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    verifier,
    expires: Date.now() + 10 * 60_000,
    ...(linkUserId ? { linkUserId } : {}),
  };
  const url = client.buildAuthorizationUrl(conf, {
    redirect_uri: redirectUri,
    scope: config.OIDC_SCOPE,
    response_type: 'code',
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state: state.state,
    nonce: state.nonce,
  });
  return { url: url.href, state };
}

export class SsoError extends Error {
  constructor(
    public readonly code:
      | 'failed'
      | 'not_allowed'
      | 'no_email'
      | 'account_exists'
      | 'already_linked',
  ) {
    super(code);
  }
}

/** Exchanges the code and returns the identity of the user. */
export async function finishLogin(config: Config, currentUrl: URL, state: LoginState) {
  const conf = await oidcConfiguration(config);
  const tokens = await client.authorizationCodeGrant(conf, currentUrl, {
    pkceCodeVerifier: state.verifier,
    expectedState: state.state,
    expectedNonce: state.nonce,
    idTokenExpected: true,
  });
  let claims: Record<string, unknown> = { ...tokens.claims() };
  // Some providers only put the e-mail into the userinfo response. A linked user does not need it,
  // so a missing or failing userinfo endpoint is not an error here.
  if (!claims.email && tokens.access_token && conf.serverMetadata().userinfo_endpoint) {
    try {
      const info = await client.fetchUserInfo(conf, tokens.access_token, String(claims.sub));
      claims = { ...info, ...claims, email: info.email, email_verified: info.email_verified };
    } catch {
      /* continue without e-mail */
    }
  }
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null;
  const name =
    (typeof claims.name === 'string' && claims.name) ||
    (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
    email?.split('@')[0] ||
    'User';
  return {
    // `sub` is only unique per provider – keep the issuer with it.
    subject: `${String(claims.iss)}|${String(claims.sub)}`,
    email,
    // Only an explicit `true` counts; providers that omit the claim may not verify addresses.
    emailVerified: claims.email_verified === true,
    name: name.slice(0, 100),
  };
}

/**
 * Finds the user of an SSO identity: by the linked subject, then – only with OIDC_LINK_BY_EMAIL – by
 * verified e-mail (which links the account), or creates a new user when automatic registration is
 * on. Without automatic linking an existing account must connect SSO in Settings first, otherwise
 * anybody who changed their Slavotax e-mail to a colleague's address would receive their login.
 */
export async function userForIdentity(
  db: Database,
  config: Config,
  identity: Awaited<ReturnType<typeof finishLogin>>,
  timezone?: string,
): Promise<UserRow> {
  const [linked] = await db.select().from(users).where(eq(users.oidcSubject, identity.subject));
  if (linked) return linked;
  if (!identity.email) throw new SsoError('no_email');

  const [byEmail] = await db.select().from(users).where(eq(users.email, identity.email));
  if (byEmail) {
    if (byEmail.isDemo || !config.OIDC_LINK_BY_EMAIL || !identity.emailVerified) {
      throw new SsoError('account_exists');
    }
    const [row] = await db
      .update(users)
      .set({ oidcSubject: identity.subject })
      .where(eq(users.id, byEmail.id))
      .returning();
    return row!;
  }

  if (!config.OIDC_AUTO_REGISTER) throw new SsoError('not_allowed');
  const firstUser = (await realUserCount(db)) === 0;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email: identity.email!,
        name: identity.name,
        // Nobody knows this password; an administrator can set one if needed.
        passwordHash: await hashPassword(generateToken()),
        oidcSubject: identity.subject,
        timezone: safeTimeZone(timezone),
        isAdmin: firstUser,
      })
      .returning();
    await seedDefaultCategories(tx, created!.id);
    return created!;
  });
}

/** Connects an SSO identity to a logged-in user (Settings → Security). */
export async function linkIdentity(db: Database, userId: string, subject: string): Promise<void> {
  const [other] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.oidcSubject, subject));
  if (other && other.id !== userId) throw new SsoError('already_linked');
  await db.update(users).set({ oidcSubject: subject }).where(eq(users.id, userId));
}
