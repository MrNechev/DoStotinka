import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let prices: Server;
let vwce = 110;
const asked: string[] = [];

beforeAll(async () => {
  prices = createServer((req, res) => {
    asked.push(req.url!);
    const url = new URL(req.url!, 'http://x');
    const json = (status: number, body: unknown) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/v8/finance/chart/VWCE.DE') {
      return json(200, {
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: vwce,
                currency: 'EUR',
                longName: 'Vanguard FTSE All-World',
                instrumentType: 'ETF',
              },
            },
          ],
        },
      });
    }
    if (url.pathname === '/v8/finance/chart/VUSA.L') {
      return json(200, {
        chart: { result: [{ meta: { regularMarketPrice: 8000, currency: 'GBp' } }] },
      });
    }
    if (url.pathname.startsWith('/v8/finance/chart/'))
      return json(404, { chart: { error: 'Not Found' } });
    if (url.pathname === '/api/v3/simple/price') {
      const ids = url.searchParams.get('ids');
      return json(200, ids === 'bitcoin' ? { bitcoin: { eur: 50000 } } : {});
    }
    json(404, {});
  });
  await new Promise<void>((r) => prices.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(prices.address() as AddressInfo).port}`;
  ctx = await createTestApp({ YAHOO_FINANCE_URL: base, COINGECKO_URL: base });
});
afterAll(async () => {
  await ctx.close();
  prices.close();
});

async function setup() {
  const u = await registerUser(ctx.app);
  const account = (type: string, name: string, initialBalance = 0) =>
    u.call('POST', '/api/accounts', {
      name,
      type,
      currency: 'EUR',
      color: '#3B82F6',
      initialBalance,
    });
  const broker = (await account('investment', 'Broker', 100000)).body;
  const cash = (await account('checking', 'Bank', 50000)).body;
  return { ...u, broker, cash, account };
}

describe('holdings', () => {
  it('look up prices, add their gain to the account and update prices', async () => {
    const u = await setup();
    const quote = await u.call('GET', '/api/holdings/quote?source=yahoo&symbol=VWCE.DE');
    expect(quote.body).toEqual({
      symbol: 'VWCE.DE',
      price: 110,
      currency: 'EUR',
      name: 'Vanguard FTSE All-World',
      kind: 'etf',
    });
    // London prices in pence become pounds.
    expect(
      (await u.call('GET', '/api/holdings/quote?source=yahoo&symbol=VUSA.L')).body,
    ).toMatchObject({ price: 80, currency: 'GBP' });
    expect((await u.call('GET', '/api/holdings/quote?source=yahoo&symbol=NOPE')).status).toBe(400);
    expect(
      (await u.call('GET', '/api/holdings/quote?source=coingecko&symbol=Bitcoin&currency=EUR'))
        .body,
    ).toMatchObject({ price: 50000 });

    // Only in investment accounts.
    const base = {
      name: 'VWCE',
      symbol: 'VWCE.DE',
      kind: 'etf',
      quantity: 10,
      price: 100,
      currency: 'EUR',
      costBasis: 100000,
      priceSource: 'yahoo',
    };
    expect((await u.call('POST', '/api/holdings', { ...base, accountId: u.cash.id })).status).toBe(
      400,
    );
    expect(
      (await u.call('POST', '/api/holdings', { ...base, accountId: u.broker.id, symbol: null }))
        .status,
    ).toBe(400);
    const created = await u.call('POST', '/api/holdings', { ...base, accountId: u.broker.id });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ value: 100000, gain: 0 });

    vwce = 120;
    const refreshed = await u.call('POST', '/api/holdings/refresh');
    expect(refreshed.body).toEqual({ updated: 1, failed: [] });
    const [h] = (await u.call<any[]>('GET', '/api/holdings')).body;
    expect(h).toMatchObject({ price: 120, value: 120000, gain: 20000 });

    const accounts = (await u.call<any[]>('GET', '/api/accounts')).body;
    const broker = accounts.find((a) => a.id === u.broker.id);
    // The balance stays what the records say; the value includes the gain.
    expect(broker).toMatchObject({ balance: 100000, holdingsGain: 20000, value: 120000 });

    // Others cannot see or change it.
    const other = await registerUser(ctx.app);
    expect((await other.call<any[]>('GET', '/api/holdings')).body).toEqual([]);
    expect((await other.call('DELETE', `/api/holdings/${h.id}`)).status).toBe(404);
    expect((await u.call('DELETE', `/api/holdings/${h.id}`)).status).toBe(204);
  });
});

describe('net worth', () => {
  it('adds accounts, investment gains and open debts', async () => {
    const u = await setup();
    const car = (await u.account('asset', 'Car', 900000)).body;
    expect(car.type).toBe('asset');
    await u.account('loan', 'Mortgage', -400000);
    await u.call('POST', '/api/holdings', {
      accountId: u.broker.id,
      name: 'Bitcoin',
      symbol: 'bitcoin',
      kind: 'crypto',
      quantity: 0.1,
      price: 50000,
      currency: 'EUR',
      costBasis: 400000,
      priceSource: 'coingecko',
    });
    // Money lent to a friend (not through an account).
    const debt = await u.call('POST', '/api/debts', {
      direction: 'lent',
      person: 'Ivan',
      currency: 'EUR',
      amount: 20000,
      date: '2026-01-10',
    });
    expect(debt.status).toBe(201);

    const nw = (await u.call('GET', '/api/net-worth?months=3&tz=UTC')).body;
    // Broker 1000 + gain 100 (5000 − 4000), bank 500, car 9000, mortgage −4000, lent 200.
    expect(nw).toMatchObject({
      currency: 'EUR',
      investmentGain: 100000,
      total: 100000 + 100000 + 50000 + 900000 - 400000 + 20000,
      liabilities: -400000,
    });
    const groups = Object.fromEntries(nw.groups.map((g: any) => [g.key, g.amount]));
    expect(groups).toMatchObject({
      investment: 200000,
      asset: 900000,
      loan: -400000,
      lent: 20000,
      checking: 50000,
    });
    expect(nw.history).toHaveLength(4);
    // Today = accounts + gain (without debts).
    expect(nw.history.at(-1).value).toBe(nw.total - 20000);
  });

  it('keeps holdings in the backup', async () => {
    const u = await setup();
    await u.call('POST', '/api/holdings', {
      accountId: u.broker.id,
      name: 'Gold',
      kind: 'other',
      quantity: 2.5,
      price: 2000.5,
      currency: 'EUR',
      costBasis: 450000,
    });
    const backup = (await u.call('GET', '/api/export/backup.json')).body;
    expect(backup.holdings).toHaveLength(1);
    expect((await u.call('POST', '/api/me/restore', backup)).status).toBe(200);
    const [h] = (await u.call<any[]>('GET', '/api/holdings')).body;
    expect(h).toMatchObject({
      name: 'Gold',
      quantity: 2.5,
      price: 2000.5,
      value: 500125,
      priceSource: 'manual',
    });
  });
});
