import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema';
import { isNewer } from '../src/services/update-check';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let server: Server;
let release: Record<string, unknown> | null = {
  tag_name: 'v99.1.0',
  html_url: 'https://github.com/x/y/releases/tag/v99.1.0',
  published_at: '2026-11-01T10:00:00Z',
};
let lastUserAgent = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    lastUserAgent = String(req.headers['user-agent']);
    if (!release) {
      res.writeHead(500).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(release));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  ctx = await createTestApp({ UPDATE_CHECK_URL: `http://127.0.0.1:${port}/latest` });
});
afterAll(async () => {
  await ctx.close();
  server.close();
});

describe('isNewer', () => {
  it('compares versions numerically', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('1.0.0', '0.99.9')).toBe(true);
    expect(isNewer('0.9.0', '0.9.0')).toBe(false);
    expect(isNewer('0.8.1', '0.9.0')).toBe(false);
    expect(isNewer('v0.9.1', '0.9.0-beta')).toBe(true);
    expect(isNewer('nonsense', '0.9.0')).toBe(false);
  });
});

describe('update check', () => {
  it('tells administrators about a new version', async () => {
    const admin = await registerUser(ctx.app);
    await ctx.db.update(users).set({ isAdmin: true }).where(eq(users.email, admin.email));
    const before = (await admin.call('GET', '/api/admin/settings')).body.update;
    expect(before).toMatchObject({ enabled: true });

    const checked = await admin.call('POST', '/api/admin/update-check');
    expect(checked.status).toBe(200);
    expect(checked.body.update).toMatchObject({
      latest: '99.1.0',
      available: true,
      url: 'https://github.com/x/y/releases/tag/v99.1.0',
    });
    expect(lastUserAgent).toBe('DoStotinka-update-check');

    // An older or equal release is no update.
    release = { tag_name: `v${ctx.config.version}` };
    expect((await admin.call('POST', '/api/admin/update-check')).body.update.available).toBe(false);
    release = null;
    expect((await admin.call('POST', '/api/admin/update-check')).status).toBe(400);

    const user = await registerUser(ctx.app);
    expect((await user.call('POST', '/api/admin/update-check')).status).toBe(403);
  });
});
