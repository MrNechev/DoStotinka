import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db';
import { runMigrations } from '../src/db/migrate';

const url =
  process.env.TEST_DATABASE_URL ??
  'postgres://dostotinka:dostotinka@localhost:54329/dostotinka_test';

export async function createTestApp(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: url,
    DEMO_ENABLED: 'false',
    EXCHANGE_RATES_AUTO_UPDATE: 'false',
    RATE_LIMIT_AUTH_PER_MINUTE: '1000',
    ...env,
  });
  const { db, client } = createDatabase(config.databaseUrl, { max: 4 });
  await runMigrations(db);
  const app = await buildApp(config, db);
  await app.ready();
  return {
    app,
    db,
    config,
    close: async () => {
      await app.close();
      await client.end();
    },
  };
}

let counter = 0;

/** Registers a fresh user and returns a request helper bound to its session. */
export async function registerUser(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  counter++;
  const email = `user${Date.now()}${counter}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: 'Test User', email, password: 'correct horse battery', ...overrides },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'dostotinka_session');
  if (!cookie) throw new Error('no session cookie');
  const call = async <T = any>(method: string, url: string, payload?: unknown) => {
    const r = await app.inject({
      method: method as 'GET',
      url,
      payload: payload as Record<string, unknown> | undefined,
      cookies: { dostotinka_session: cookie.value },
    });
    return { status: r.statusCode, body: (r.body ? safeJson(r.body) : null) as T, raw: r };
  };
  return { email, user: res.json().user, call, cookie: cookie.value };
}

function safeJson(body: string) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
