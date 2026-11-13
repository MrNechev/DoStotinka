import { generateKeyPairSync, verify } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bankConnections } from '../src/db/schema';
import { processBankSync, syncConnection } from '../src/services/bank-import';
import { createTestApp, registerUser } from './helpers';

// ───────────────────────────── Mock Enable Banking ─────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const APP_ID = '11111111-2222-3333-4444-555555555555';

interface MockState {
  redirectUrls: string[];
  transactions: Record<string, unknown>[][]; // pages
  sessionExpired: boolean;
  requests: string[];
  authBodies: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
}
const mock: MockState = {
  redirectUrls: [],
  transactions: [],
  sessionExpired: false,
  requests: [],
  authBodies: [],
  accounts: [],
};

function checkJwt(req: IncomingMessage): boolean {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const ok = verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'));
  return (
    ok &&
    header.alg === 'RS256' &&
    header.kid === APP_ID &&
    payload.iss === 'enablebanking.com' &&
    payload.aud === 'api.enablebanking.com' &&
    payload.exp - payload.iat <= 86_400
  );
}

let server: Server;
let baseUrl: string;

async function startMock() {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const url = new URL(req.url ?? '/', 'http://x');
    mock.requests.push(`${req.method} ${url.pathname}${url.search}`);
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (!checkJwt(req)) return send(401, { code: 401, message: 'Invalid JWT' });
    if (req.method === 'GET' && url.pathname === '/application') {
      return send(200, {
        name: 'Mine',
        kid: APP_ID,
        environment: 'PRODUCTION',
        redirect_urls: mock.redirectUrls,
        active: true,
        countries: ['BG'],
        services: ['AIS'],
      });
    }
    if (req.method === 'GET' && url.pathname === '/aspsps') {
      return send(200, {
        aspsps: [
          {
            name: 'DSK Bank',
            country: 'BG',
            logo: 'https://x/dsk.png',
            maximum_consent_validity: 15552000,
            psu_types: ['personal'],
            beta: false,
          },
          {
            name: 'United Bulgarian Bank',
            country: 'BG',
            logo: null,
            maximum_consent_validity: 7776000,
            psu_types: ['personal'],
            beta: false,
          },
        ],
      });
    }
    if (req.method === 'POST' && url.pathname === '/auth') {
      mock.authBodies.push(body);
      return send(200, {
        url: `https://bank.example/consent?state=${body.state}`,
        authorization_id: '7c8c0a7e-0000-4000-8000-000000000001',
        psu_id_hash: 'x',
      });
    }
    if (req.method === 'POST' && url.pathname === '/sessions') {
      if (body.code !== 'good-code')
        return send(400, { code: 400, message: 'Wrong code', error: 'WRONG_AUTHORIZATION_CODE' });
      return send(200, {
        session_id: 'session-1',
        accounts: mock.accounts,
        aspsp: { name: 'DSK Bank', country: 'BG' },
        psu_type: 'personal',
        access: { valid_until: new Date(Date.now() + 179 * 86_400_000).toISOString() },
      });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
      return send(200, { message: 'OK' });
    }
    const m = url.pathname.match(/^\/accounts\/([^/]+)\/(transactions|balances)$/);
    if (m) {
      if (mock.sessionExpired) {
        return send(401, { code: 401, message: 'Session expired', error: 'EXPIRED_SESSION' });
      }
      if (m[2] === 'balances') {
        return send(200, {
          balances: [
            {
              name: 'Available',
              balance_amount: { amount: '999.00', currency: 'EUR' },
              balance_type: 'ITAV',
            },
            {
              name: 'Booked',
              balance_amount: { amount: '1000.50', currency: 'EUR' },
              balance_type: 'CLBD',
            },
          ],
        });
      }
      const page = Number(url.searchParams.get('continuation_key') ?? 0);
      const next = page + 1 < mock.transactions.length ? String(page + 1) : null;
      return send(200, { transactions: mock.transactions[page] ?? [], continuation_key: next });
    }
    send(404, { code: 404, message: 'Not found' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  await startMock();
  ctx = await createTestApp({
    ENABLE_BANKING_API_URL: baseUrl,
    ENCRYPTION_KEY: 'test-key-0123456789',
  });
});
afterAll(async () => {
  await ctx.close();
  server.close();
});
beforeEach(() => {
  mock.redirectUrls = ['https://money.example.com/bank-callback'];
  mock.transactions = [];
  mock.sessionExpired = false;
  mock.requests = [];
  mock.authBodies = [];
  mock.accounts = [
    {
      uid: 'acc-uid-1',
      account_id: { iban: 'BG80BNBG96611020345678' },
      details: 'Current account',
      currency: 'EUR',
      identification_hash: 'hash-1',
      identification_hashes: ['hash-1'],
      cash_account_type: 'CACC',
    },
  ];
});

// ───────────────────────────── Helpers ─────────────────────────────

async function setup() {
  const u = await registerUser(ctx.app);
  const account = async (name: string, currency = 'EUR', icon?: string) =>
    (
      await u.call('POST', '/api/accounts', {
        name,
        type: 'checking',
        currency,
        color: '#3B82F6',
        ...(icon ? { icon } : {}),
      })
    ).body;
  return { ...u, account };
}

async function addPhone(call: Awaited<ReturnType<typeof setup>>['call']) {
  expect(
    (await call('PATCH', '/api/automatic-import', { notificationsEnabled: true })).status,
  ).toBe(200);
  const created = await call('POST', '/api/automatic-import/sources', { name: 'My phone' });
  expect(created.status).toBe(201);
  return created.body.token as string;
}

function post(
  token: string | null,
  payload: unknown,
  opts: { contentType?: string; query?: string } = {},
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/ingest/notification${opts.query ?? ''}`,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': opts.contentType ?? 'application/json',
    },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

const now = () => new Date().toISOString();

// ───────────────────────────── Phone notifications ─────────────────────────────

describe('phone notifications', () => {
  it('needs the switch, a valid phone token and accepts JSON, form and query data', async () => {
    const u = await setup();
    const created = await u.call('POST', '/api/automatic-import/sources', { name: 'Phone' });
    const token = created.body.token as string;
    expect(token).toMatch(/^dsn_/);

    const off = await post(token, {
      app: 'com.revolut.revolut',
      title: 'Lidl',
      text: 'You paid €12.50',
    });
    expect(off.statusCode).toBe(403);
    await u.call('PATCH', '/api/automatic-import', { notificationsEnabled: true });

    expect((await post(null, { text: 'Paid €1' })).statusCode).toBe(401);
    expect((await post('dsn_wrong', { text: 'Paid €1' })).statusCode).toBe(401);
    // The phone token is no API token.
    const asApi = await ctx.app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(asApi.statusCode).toBe(401);

    const json = await post(token, {
      app: 'com.revolut.revolut',
      title: 'Lidl',
      text: 'You paid €12.50',
    });
    expect(json.json()).toMatchObject({ status: 'created' });
    // The same notification again (automation retry) is not imported twice.
    const again = await post(token, {
      app: 'com.revolut.revolut',
      title: 'Lidl',
      text: 'You paid €12.50',
    });
    expect(again.json()).toEqual({ status: 'duplicate' });

    const form = await post(
      token,
      new URLSearchParams({
        app: 'SMS',
        title: 'DSK',
        text: 'Pokupka 35,20 EUR, BILLA SOFIA',
      }).toString(),
      { contentType: 'application/x-www-form-urlencoded' },
    );
    expect(form.json()).toMatchObject({ status: 'created' });

    const query = await ctx.app.inject({
      method: 'POST',
      url: `/api/ingest/notification?token=${token}&app=Shortcuts&merchant=Costa&amount=${encodeURIComponent('€4,80')}`,
    });
    expect(query.json()).toMatchObject({ status: 'created' });

    const ignored = await post(token, {
      app: 'SMS',
      title: 'DSK',
      text: 'Код за потвърждение 123456',
    });
    expect(ignored.json()).toEqual({ status: 'ignored' });

    const pending = (await u.call<any[]>('GET', '/api/inbox')).body;
    expect(pending.map((i) => [i.payee, i.amount, i.currency, i.type])).toEqual(
      expect.arrayContaining([
        ['Lidl', 1250, 'EUR', 'expense'],
        ['Billa', 3520, 'EUR', 'expense'],
        ['Costa', 480, 'EUR', 'expense'],
      ]),
    );
    expect(pending).toHaveLength(3);
    const ignoredList = (await u.call<any[]>('GET', '/api/inbox?status=ignored')).body;
    expect(ignoredList[0].description).toContain('Код за потвърждение');
    expect((await u.call('GET', '/api/inbox/count')).body).toEqual({ pending: 3 });

    const state = (await u.call('GET', '/api/automatic-import')).body;
    expect(state.apps.map((a: any) => a.label).sort()).toEqual(['Revolut', 'SMS', 'Shortcuts']);
    expect(state.sources[0].lastReceivedAt).toBeTruthy();

    // Paused phone.
    await u.call('PATCH', `/api/automatic-import/sources/${created.body.id}`, { enabled: false });
    expect((await post(token, { text: 'Paid €3.00 at X' })).statusCode).toBe(403);
    // Removed phone.
    await u.call('DELETE', `/api/automatic-import/sources/${created.body.id}`);
    expect((await post(token, { text: 'Paid €3.00 at X' })).statusCode).toBe(401);
  });

  it('maps apps to accounts, suggests categories and confirms records', async () => {
    const u = await setup();
    const revolut = await u.account('Revolut');
    const cats = (await u.call<any[]>('GET', '/api/categories')).body;
    const groceries = cats.find((c) => c.name === 'Groceries');
    // History: "Kaufland" was groceries before.
    await u.call('POST', '/api/records', {
      type: 'expense',
      accountId: revolut.id,
      amount: 1000,
      categoryId: groceries.id,
      payee: 'Kaufland',
      occurredAt: '2026-01-10T10:00:00Z',
    });
    const token = await addPhone(u.call);
    await post(token, { app: 'com.revolut.revolut', title: 'Netflix', text: 'You paid €9.99' });
    const state = (await u.call('GET', '/api/automatic-import')).body;
    const appRow = state.apps.find((a: any) => a.app === 'com.revolut.revolut');
    expect(
      (await u.call('PATCH', `/api/automatic-import/apps/${appRow.id}`, { accountId: revolut.id }))
        .status,
    ).toBe(200);

    const r = await post(token, {
      app: 'com.revolut.revolut',
      title: '🛒 Kaufland',
      text: 'You paid €23.40',
    });
    const item = (await u.call<any[]>('GET', '/api/inbox')).body.find(
      (i) => i.id === r.json().itemId,
    );
    expect(item).toMatchObject({
      accountId: revolut.id,
      categoryId: groceries.id,
      payee: 'Kaufland',
    });

    const confirmed = await u.call('POST', `/api/inbox/${item.id}/confirm`, {});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmed');
    const record = (await u.call('GET', `/api/records/${confirmed.body.recordId}`)).body;
    expect(record).toMatchObject({ amount: -2340, categoryId: groceries.id, payee: 'Kaufland' });
    // Confirming twice fails.
    expect((await u.call('POST', `/api/inbox/${item.id}/confirm`, {})).status).toBe(400);

    // The earlier Netflix item got the account when the app was mapped.
    const netflix = (await u.call<any[]>('GET', '/api/inbox')).body.find(
      (i) => i.payee === 'Netflix',
    );
    expect(netflix.accountId).toBe(revolut.id);
    // Without an account a confirmation is refused.
    await u.call('PATCH', `/api/inbox/${netflix.id}`, { accountId: null });
    expect((await u.call('POST', `/api/inbox/${netflix.id}/confirm`, {})).status).toBe(400);
    const ok = await u.call('POST', `/api/inbox/${netflix.id}/confirm`, {
      accountId: revolut.id,
      payee: 'Netflix Premium',
    });
    expect(ok.body.status).toBe('confirmed');

    // Auto-confirm: records appear without review.
    await u.call('PATCH', `/api/automatic-import/sources/${state.sources[0].id}`, {
      autoConfirm: true,
    });
    const auto = await post(token, {
      app: 'com.revolut.revolut',
      title: 'Kaufland',
      text: 'You paid €5.10',
    });
    expect(auto.json().status).toBe('confirmed');
    const list = (await u.call<any>('GET', `/api/records?accountIds=${revolut.id}`)).body;
    expect(list.items.some((x: any) => x.amount === -510 && x.categoryId === groceries.id)).toBe(
      true,
    );

    // Ignoring an app.
    await u.call('PATCH', `/api/automatic-import/apps/${appRow.id}`, { enabled: false });
    expect(
      (await post(token, { app: 'com.revolut.revolut', text: 'You paid €1.00' })).json(),
    ).toEqual({
      status: 'ignored',
    });
  });

  it('finds records entered by hand, duplicates from other apps and transfers', async () => {
    const u = await setup();
    const dsk = await u.account('DSK');
    const revolut = await u.account('Revolut');
    const token = await addPhone(u.call);
    const state = (await u.call('GET', '/api/automatic-import')).body;
    const time = new Date();
    // A coffee typed in by hand a moment ago.
    const manual = (
      await u.call('POST', '/api/records', {
        type: 'expense',
        accountId: dsk.id,
        amount: 350,
        occurredAt: new Date(time.getTime() - 5 * 60_000).toISOString(),
        payee: 'Coffee',
      })
    ).body[0];
    await post(token, { app: 'bg.dsk', title: 'Cafe', text: 'Плащане 3.50 EUR при CAFE' });
    await post(token, {
      app: 'com.revolut.revolut',
      title: 'Revolut',
      text: 'Top up €100.00 added',
    });
    const apps = (await u.call('GET', '/api/automatic-import')).body.apps;
    for (const [app, acc] of [
      ['bg.dsk', dsk.id],
      ['com.revolut.revolut', revolut.id],
      ['com.google.android.apps.walletnfcrel', dsk.id],
    ] as const) {
      const row = apps.find((a: any) => a.app === app);
      if (row) await u.call('PATCH', `/api/automatic-import/apps/${row.id}`, { accountId: acc });
    }
    // Account mapping applies to new notifications – these come with accounts.
    await post(token, {
      app: 'bg.dsk',
      title: 'Cafe',
      text: 'Плащане 3.50 EUR при CAFE BAR',
      time: time.toISOString(),
    });
    await post(token, {
      app: 'bg.dsk',
      title: 'DSK',
      text: 'Плащане 100.00 EUR към REVOLUT',
      time: time.toISOString(),
    });
    await post(token, {
      app: 'com.revolut.revolut',
      title: 'Revolut',
      text: 'Top up of €100.00 received',
      time: time.toISOString(),
    });
    // Google Wallet shows the same 3.50 payment – a duplicate of the DSK notification.
    const gw = await post(token, {
      app: 'com.google.android.apps.walletnfcrel',
      title: 'Cafe Bar',
      text: '€3.50 with Visa •••• 1234',
      time: time.toISOString(),
    });
    expect(gw.json().status).toBe('duplicate');

    const items = (await u.call<any[]>('GET', '/api/inbox')).body;
    const cafe = items.find((i) => i.payee === 'Cafe Bar');
    expect(cafe.match?.recordId).toBe(manual.id);
    const out = items.find((i) => i.accountId === dsk.id && i.amount === 10000);
    const into = items.find((i) => i.accountId === revolut.id && i.amount === 10000);
    expect(out.pair?.itemId).toBe(into.id);
    expect(into.pair?.itemId).toBe(out.id);

    // "It's the coffee I entered" – no new record.
    expect((await u.call('POST', `/api/inbox/${cafe.id}/link`)).status).toBe(200);
    const records = (await u.call<any>('GET', `/api/records?accountIds=${dsk.id}`)).body.items;
    expect(records.filter((r: any) => r.amount === -350)).toHaveLength(1);

    // Transfer DSK → Revolut.
    expect((await u.call('POST', `/api/inbox/${out.id}/transfer`)).status).toBe(200);
    const after = (await u.call<any>('GET', `/api/records?accountIds=${revolut.id}`)).body.items;
    expect(after.find((r: any) => r.type === 'transfer')).toMatchObject({
      amount: 10000,
      counterpartAccountId: dsk.id,
    });
    const done = (await u.call<any[]>('GET', '/api/inbox?status=done')).body;
    expect(done.filter((d) => d.status === 'confirmed').length).toBeGreaterThanOrEqual(2);
    void state;
  });

  it('converts foreign currency and keeps users apart', async () => {
    const u = await setup();
    const usd = await u.account('Dollars', 'USD');
    const token = await addPhone(u.call);
    await u.call('PUT', '/api/currencies/rates', { rates: [{ currency: 'USD', rate: 0.8 }] });
    const r = await post(token, { app: 'x', title: 'Shop', text: 'Paid €10.00 at Shop' });
    const id = r.json().itemId;
    const confirmed = await u.call('POST', `/api/inbox/${id}/confirm`, { accountId: usd.id });
    expect(confirmed.status).toBe(200);
    const record = (await u.call('GET', `/api/records/${confirmed.body.recordId}`)).body;
    expect(record.currency).toBe('USD');
    expect(record.note).toContain('€10.00');

    const other = await setup();
    expect((await other.call('POST', `/api/inbox/${id}/dismiss`)).status).toBe(404);
    expect((await other.call<any[]>('GET', '/api/inbox')).body).toHaveLength(0);
  });
});

// ───────────────────────────── Open banking ─────────────────────────────

async function connectBank(u: Awaited<ReturnType<typeof setup>>) {
  await u.call('PATCH', '/api/automatic-import', { bankEnabled: true });
  const saved = await u.call('PUT', '/api/automatic-import/bank/credentials', {
    applicationId: APP_ID,
    privateKey: PEM,
  });
  expect(saved.status).toBe(200);
  const start = await u.call('POST', '/api/automatic-import/bank/connections', {
    bankName: 'DSK Bank',
    country: 'BG',
  });
  expect(start.status).toBe(200);
  const state = new URL(start.body.url).searchParams.get('state')!;
  const done = await u.call('POST', '/api/automatic-import/bank/callback', {
    state,
    code: 'good-code',
  });
  expect(done.status).toBe(200);
  return done.body;
}

const tx = (over: Record<string, unknown>) => ({
  transaction_amount: { amount: '10.00', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: new Date().toISOString().slice(0, 10),
  remittance_information: null,
  ...over,
});

describe('open banking (Enable Banking)', () => {
  it('saves the application, connects a bank and imports booked transactions', async () => {
    const u = await setup();
    const dsk = await u.account('DSK main', 'EUR', 'brand-dsk');

    const bad = await u.call('PUT', '/api/automatic-import/bank/credentials', {
      applicationId: APP_ID,
      privateKey: `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(120)}\n-----END PRIVATE KEY-----`,
    });
    expect(bad.status).toBe(400);

    const connection = await connectBank(u);
    expect(connection.status).toBe('active');
    expect(connection.accounts).toHaveLength(1);
    // Pre-selected: the only EUR account with the DSK logo.
    expect(connection.accounts[0].accountId).toBe(dsk.id);
    expect(mock.authBodies[0]).toMatchObject({
      aspsp: { name: 'DSK Bank', country: 'BG' },
      redirect_url: 'https://money.example.com/bank-callback',
      psu_type: 'personal',
    });
    const state = (await u.call('GET', '/api/automatic-import')).body;
    expect(state.bank).toMatchObject({ configured: true, applicationId: APP_ID });
    expect(JSON.stringify(state)).not.toContain('PRIVATE KEY');

    const bankAccountId = connection.accounts[0].id;
    await u.call('PATCH', `/api/automatic-import/bank/accounts/${bankAccountId}`, {
      importFrom: '2026-01-01',
    });
    const today = new Date().toISOString().slice(0, 10);
    mock.transactions = [
      [
        tx({
          entry_reference: 'r1',
          creditor: { name: 'LIDL BULGARIA EOOD' },
          transaction_amount: { amount: '-12.30', currency: 'EUR' },
        }),
        tx({ entry_reference: 'r2', status: 'PDNG' }),
      ],
      [
        tx({
          entry_reference: 'r3',
          credit_debit_indicator: 'CRDT',
          debtor: { name: 'EMPLOYER LTD' },
          transaction_amount: { amount: '2000.00', currency: 'EUR' },
          remittance_information: ['Salary 10/2026'],
        }),
        tx({
          remittance_information: ['POS 4***1111 BILLA SOFIA'],
          transaction_amount: { amount: '7.00', currency: 'EUR' },
        }),
        tx({
          remittance_information: ['POS 4***1111 BILLA SOFIA'],
          transaction_amount: { amount: '7.00', currency: 'EUR' },
        }),
      ],
    ];
    const sync = await u.call(
      'POST',
      `/api/automatic-import/bank/connections/${connection.id}/sync`,
    );
    expect(sync.body).toEqual({ imported: 4, duplicates: 0 });
    expect(mock.requests.some((r) => r.includes('continuation_key=1'))).toBe(true);
    const items = (await u.call<any[]>('GET', '/api/inbox')).body;
    expect(items.map((i) => [i.type, i.amount, i.payee]).sort()).toEqual(
      [
        ['expense', 1230, 'Lidl'],
        ['expense', 700, 'Billa'],
        ['expense', 700, 'Billa'],
        ['income', 200000, 'Employer'],
      ].sort(),
    );
    expect(items.every((i) => i.accountId === dsk.id && i.sourceLabel === 'DSK Bank')).toBe(true);

    // Manual sync right away is refused (banks allow few syncs per day) …
    expect(
      (await u.call('POST', `/api/automatic-import/bank/connections/${connection.id}/sync`)).status,
    ).toBe(400);
    // … the next sync (later) does not import anything twice.
    const again = await syncConnection(ctx.db, ctx.config, connection.id, {
      now: new Date(Date.now() + 3_600_000),
    });
    expect(again).toEqual({ imported: 0, duplicates: 0 });
    const conn = (await u.call('GET', '/api/automatic-import')).body.bank.connections[0];
    expect(conn.accounts[0]).toMatchObject({ balance: 100050, lastBookingDate: today });
  });

  it('merges bank bookings with phone notifications and handles expired consents', async () => {
    const u = await setup();
    const dsk = await u.account('DSK');
    const token = await addPhone(u.call);
    const notified = await post(token, {
      app: 'bg.dsk',
      title: 'DSK',
      text: 'Плащане 42.00 EUR при SHELL',
      time: now(),
    });
    const apps = (await u.call('GET', '/api/automatic-import')).body.apps;
    await u.call('PATCH', `/api/automatic-import/apps/${apps[0].id}`, { accountId: dsk.id });
    // The notification arrived before the mapping – put it on the account.
    await u.call('PATCH', `/api/inbox/${notified.json().itemId}`, { accountId: dsk.id });
    const confirmed = await u.call('POST', `/api/inbox/${notified.json().itemId}/confirm`, {});
    expect(confirmed.status).toBe(200);

    const connection = await connectBank(u);
    await u.call('PATCH', `/api/automatic-import/bank/accounts/${connection.accounts[0].id}`, {
      accountId: dsk.id,
    });
    mock.transactions = [
      [
        tx({
          entry_reference: 'shell',
          transaction_amount: { amount: '42.00', currency: 'EUR' },
          creditor: { name: 'SHELL' },
        }),
      ],
    ];
    const sync = await syncConnection(ctx.db, ctx.config, connection.id);
    expect(sync).toEqual({ imported: 0, duplicates: 1 });
    expect((await u.call<any[]>('GET', '/api/inbox')).body).toHaveLength(0);
    const records = (await u.call<any>('GET', `/api/records?accountIds=${dsk.id}`)).body.items;
    expect(records).toHaveLength(1);

    // The bank ended the consent: the connection is marked as expired.
    mock.sessionExpired = true;
    await expect(
      syncConnection(ctx.db, ctx.config, connection.id, {
        manual: true,
        now: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(/Session expired/);
    const [row] = await ctx.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, connection.id));
    expect(row!.status).toBe('expired');

    // Renewing keeps the account link (matched by the bank's identification hash).
    mock.sessionExpired = false;
    const renew = await u.call('POST', '/api/automatic-import/bank/connections', {
      bankName: 'DSK Bank',
      country: 'BG',
      renewConnectionId: connection.id,
    });
    const state = new URL(renew.body.url).searchParams.get('state')!;
    mock.accounts[0]!.uid = 'acc-uid-2';
    const renewed = (
      await u.call('POST', '/api/automatic-import/bank/callback', { state, code: 'good-code' })
    ).body;
    expect(renewed.status).toBe('active');
    expect(renewed.accounts).toHaveLength(1);
    expect(renewed.accounts[0].accountId).toBe(dsk.id);
  });

  it('respects the switches, refused consents and the scheduler', async () => {
    const u = await setup();
    await u.account('DSK');
    const connection = await connectBank(u);
    // The user cancels at the bank.
    const start = await u.call('POST', '/api/automatic-import/bank/connections', {
      bankName: 'DSK Bank',
      country: 'BG',
    });
    const state = new URL(start.body.url).searchParams.get('state')!;
    const denied = await u.call('POST', '/api/automatic-import/bank/callback', {
      state,
      error: 'access_denied',
    });
    expect(denied.status).toBe(400);
    expect((await u.call('GET', '/api/automatic-import')).body.bank.connections).toHaveLength(1);

    // Switched off: no sync, also not from the scheduler.
    await u.call('PATCH', '/api/automatic-import', { bankEnabled: false });
    expect(
      (await u.call('POST', `/api/automatic-import/bank/connections/${connection.id}/sync`)).status,
    ).toBe(400);
    mock.requests = [];
    await processBankSync(ctx.db, ctx.config);
    expect(mock.requests.filter((r) => r.includes('/transactions'))).toHaveLength(0);

    // Disconnecting ends the session at Enable Banking.
    expect(
      (await u.call('DELETE', `/api/automatic-import/bank/connections/${connection.id}`)).status,
    ).toBe(204);
    expect(mock.requests).toContain('DELETE /sessions/session-1');
    expect((await u.call('GET', '/api/automatic-import')).body.bank.connections).toHaveLength(0);
  });

  it('refuses another user’s connection', async () => {
    const a = await setup();
    const connection = await connectBank(a);
    const b = await setup();
    expect(
      (await b.call('POST', `/api/automatic-import/bank/connections/${connection.id}/sync`)).status,
    ).toBe(404);
    expect(
      (await b.call('DELETE', `/api/automatic-import/bank/connections/${connection.id}`)).status,
    ).toBe(404);
    expect(
      (
        await b.call('PATCH', `/api/automatic-import/bank/accounts/${connection.accounts[0].id}`, {
          enabled: false,
        })
      ).status,
    ).toBe(404);
  });
});

describe('switched off by the administrator', () => {
  it('hides the feature and refuses notifications', async () => {
    const off = await createTestApp({ AUTOMATIC_IMPORT: 'false' });
    try {
      const u = await registerUser(off.app);
      expect((await u.call('GET', '/api/automatic-import')).status).toBe(404);
      expect(
        (await off.app.inject({ method: 'GET', url: '/api/config' })).json().automaticImport,
      ).toBe(false);
      const r = await off.app.inject({
        method: 'POST',
        url: '/api/ingest/notification',
        headers: { authorization: 'Bearer dsn_x' },
        payload: { text: 'Paid €1 at Shop' },
      });
      expect(r.statusCode).toBe(404);
    } finally {
      await off.close();
    }
  });
});
