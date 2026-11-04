import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

/** A tiny OpenID Connect provider: discovery, JWKS and a token endpoint checking PKCE. */
function fakeProvider() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const codes = new Map<string, { nonce: string; challenge: string; claims: object }>();
  let issuer = '';
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const idToken = (claims: object) => {
    const head = b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' });
    const now = Math.floor(Date.now() / 1000);
    const body = b64({ iss: issuer, aud: 'dostotinka', iat: now, exp: now + 300, ...claims });
    const signature = sign('sha256', Buffer.from(`${head}.${body}`), privateKey);
    return `${head}.${body}.${signature.toString('base64url')}`;
  };
  const server: Server = createServer((req, res) => {
    const json = (status: number, body: object) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/auth`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (req.url === '/jwks') return json(200, { keys: [jwk] });
    if (req.url === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
      });
      req.on('end', () => {
        const form = new URLSearchParams(raw);
        const entry = codes.get(form.get('code') ?? '');
        const verifier = form.get('code_verifier') ?? '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!entry || entry.challenge !== challenge) return json(400, { error: 'invalid_grant' });
        codes.delete(form.get('code')!);
        json(200, {
          access_token: 'at',
          token_type: 'Bearer',
          expires_in: 300,
          id_token: idToken({ nonce: entry.nonce, ...entry.claims }),
        });
      });
      return;
    }
    json(404, {});
  });
  return {
    codes,
    listen: () =>
      new Promise<string>((resolve) =>
        server.listen(0, '127.0.0.1', () => {
          issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          resolve(issuer);
        }),
      ),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let idp: ReturnType<typeof fakeProvider>;
let ctx: Awaited<ReturnType<typeof createTestApp>>;
let issuerUrl = '';

beforeAll(async () => {
  idp = fakeProvider();
  issuerUrl = await idp.listen();
  ctx = await createTestApp({
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_CLIENT_ID: 'dostotinka',
    OIDC_CLIENT_SECRET: 'secret',
    PUBLIC_URL: 'http://money.test',
  });
});
afterAll(async () => {
  await ctx.close();
  await idp.close();
});

/** Runs the browser part of the flow and returns the callback response. */
async function ssoLogin(claims: object, tamper?: (q: URLSearchParams) => void, session?: string) {
  const sessionCookie: Record<string, string> = session ? { dostotinka_session: session } : {};
  const start = await ctx.app.inject({
    method: 'GET',
    url: session ? '/api/auth/oidc/start?link=1' : '/api/auth/oidc/start',
    cookies: sessionCookie,
  });
  expect(start.statusCode).toBe(302);
  const auth = new URL(start.headers.location as string);
  expect(auth.searchParams.get('redirect_uri')).toBe('http://money.test/api/auth/oidc/callback');
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
  const cookie = start.cookies.find((c) => c.name === 'dostotinka_oidc')!;
  const code = `code-${Math.random()}`;
  idp.codes.set(code, {
    nonce: auth.searchParams.get('nonce')!,
    challenge: auth.searchParams.get('code_challenge')!,
    claims,
  });
  const query = new URLSearchParams({ code, state: auth.searchParams.get('state')! });
  tamper?.(query);
  return ctx.app.inject({
    method: 'GET',
    url: `/api/auth/oidc/callback?${query}`,
    cookies: { dostotinka_oidc: cookie.value, ...sessionCookie },
  });
}

const me = async (res: Awaited<ReturnType<typeof ssoLogin>>) => {
  const session = res.cookies.find((c) => c.name === 'dostotinka_session')!;
  const r = await ctx.app.inject({
    method: 'GET',
    url: '/api/me',
    cookies: { dostotinka_session: session.value },
  });
  return r.json().user;
};

describe('single sign-on', () => {
  it('announces itself in the public config', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json().sso).toEqual({ enabled: true, buttonText: 'Log in with SSO' });
  });

  it('creates a user on the first login and recognises them later', async () => {
    const email = `sso${Date.now()}@example.com`;
    const first = await ssoLogin({ sub: 'alice-1', email, email_verified: true, name: 'Alice' });
    expect(first.statusCode).toBe(302);
    expect(first.headers.location).toBe('http://money.test/');
    const user = await me(first);
    expect(user).toMatchObject({ email, name: 'Alice' });

    // Same subject, changed e-mail at the provider: still the same user.
    const again = await ssoLogin({ sub: 'alice-1', email: `new-${email}` });
    expect((await me(again)).id).toBe(user.id);
  });

  it('never hands an existing account to an SSO login with the same e-mail', async () => {
    // Anybody could have changed their DoStotinka e-mail to this address.
    const existing = await registerUser(ctx.app);
    const refused = await ssoLogin({ sub: 'bob-1', email: existing.email, email_verified: true });
    expect(refused.headers.location).toBe('http://money.test/login?sso_error=account_exists');
    expect(refused.cookies.find((c) => c.name === 'dostotinka_session')).toBeUndefined();
  });

  it('lets a logged-in user connect and disconnect SSO', async () => {
    const existing = await registerUser(ctx.app);
    const linked = await ssoLogin(
      { sub: 'carol-1', email: 'other@idp.test' },
      undefined,
      existing.cookie,
    );
    expect(linked.headers.location).toBe('http://money.test/settings?sso=linked');
    expect((await existing.call('GET', '/api/me')).body.user.ssoLinked).toBe(true);
    // From now on the SSO login opens this account.
    expect((await me(await ssoLogin({ sub: 'carol-1' }))).id).toBe(existing.user.id);
    // The same identity cannot be connected to a second account.
    const second = await registerUser(ctx.app);
    const taken = await ssoLogin({ sub: 'carol-1' }, undefined, second.cookie);
    expect(taken.headers.location).toBe('http://money.test/settings?sso_error=already_linked');
    expect((await existing.call('DELETE', '/api/me/oidc')).status).toBe(204);
    expect((await existing.call('GET', '/api/me')).body.user.ssoLinked).toBe(false);
  });

  it('links by e-mail only when enabled and verified', async () => {
    const linking = await createTestApp({
      OIDC_ISSUER_URL: issuerUrl,
      OIDC_CLIENT_ID: 'dostotinka',
      OIDC_CLIENT_SECRET: 'secret',
      PUBLIC_URL: 'http://money.test',
      OIDC_LINK_BY_EMAIL: 'true',
    });
    const original = ctx;
    ctx = linking;
    try {
      const existing = await registerUser(ctx.app);
      // A provider that does not say the address is verified is not trusted.
      const noClaim = await ssoLogin({ sub: 'dan-1', email: existing.email });
      expect(noClaim.headers.location).toBe('http://money.test/login?sso_error=account_exists');
      const ok = await ssoLogin({ sub: 'dan-1', email: existing.email, email_verified: true });
      expect((await me(ok)).id).toBe(existing.user.id);
    } finally {
      ctx = original;
      await linking.close();
    }
  });

  it('rejects a forged state', async () => {
    const res = await ssoLogin({ sub: 'mallory', email: 'm@example.com' }, (q) =>
      q.set('state', 'forged'),
    );
    expect(res.headers.location).toBe('http://money.test/login?sso_error=failed');
    expect(res.cookies.find((c) => c.name === 'dostotinka_session')).toBeUndefined();
  });

  it('requires the login cookie', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/oidc/callback?code=x' });
    expect(res.headers.location).toBe('http://money.test/login?sso_error=expired');
  });
});
