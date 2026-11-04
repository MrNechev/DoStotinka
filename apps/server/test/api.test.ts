import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});

const iso = (d: string) => new Date(d).toISOString();

describe('auth', () => {
  it('registers, reads the profile and logs out', async () => {
    const { call, email } = await registerUser(ctx.app);
    const me = await call('GET', '/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.baseCurrency).toBe('EUR');

    const out = await call('POST', '/api/auth/logout');
    expect(out.status).toBe(204);
    const after = await call('GET', '/api/me');
    expect(after.status).toBe(401);
  });

  it('rejects duplicate e-mails and wrong passwords', async () => {
    const { email } = await registerUser(ctx.app);
    const dup = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'X', email, password: 'another password' },
    });
    expect(dup.statusCode).toBe(409);

    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'wrong password' },
    });
    expect(bad.statusCode).toBe(401);

    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'correct horse battery', issueToken: true },
    });
    expect(ok.statusCode).toBe(200);
    const token = ok.json().token as string;
    expect(token).toBeTruthy();
    const viaBearer = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(viaBearer.statusCode).toBe(200);
  });

  it('validates input', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: '', email: 'not-an-email', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it('respects ALLOW_REGISTRATION=false', async () => {
    const closed = await createTestApp({ ALLOW_REGISTRATION: 'false' });
    const res = await closed.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'A', email: 'closed@example.com', password: 'long enough password' },
    });
    expect(res.statusCode).toBe(403);
    await closed.close();
  });
});

describe('categories', () => {
  it('seeds a comprehensive default category tree', async () => {
    const { call } = await registerUser(ctx.app);
    const res = await call<any[]>('GET', '/api/categories');
    expect(res.status).toBe(200);
    const top = res.body.filter((c) => !c.parentId);
    expect(top.length).toBeGreaterThan(20);
    expect(res.body.length).toBeGreaterThan(200);
    expect(top.some((c) => c.kind === 'income')).toBe(true);
  });

  it('moves records to the parent when a subcategory is deleted', async () => {
    const { call } = await registerUser(ctx.app);
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const food = cats.find((c) => c.systemKey === 'food')!;
    const custom = await call('POST', '/api/categories', {
      name: 'Ice cream',
      icon: 'cake',
      parentId: food.id,
    });
    expect(custom.status).toBe(201);
    const acc = await call('POST', '/api/accounts', {
      name: 'Cash',
      type: 'cash',
      currency: 'EUR',
      color: '#22C55E',
    });
    const rec = await call<any[]>('POST', '/api/records', {
      type: 'expense',
      accountId: acc.body.id,
      amount: 350,
      categoryId: custom.body.id,
      occurredAt: new Date().toISOString(),
    });
    expect((await call('DELETE', `/api/categories/${custom.body.id}`)).status).toBe(204);
    const after = await call('GET', `/api/records/${rec.body[0].id}`);
    expect(after.body.categoryId).toBe(food.id);
  });
});

describe('accounts and records', () => {
  it('tracks balances through expenses, income and transfers', async () => {
    const { call } = await registerUser(ctx.app);
    const bank = (
      await call('POST', '/api/accounts', {
        name: 'Bank',
        type: 'checking',
        currency: 'EUR',
        initialBalance: 100000,
        color: '#3B82F6',
      })
    ).body;
    const cash = (
      await call('POST', '/api/accounts', {
        name: 'Cash',
        type: 'cash',
        currency: 'EUR',
        initialBalance: 5000,
        color: '#22C55E',
      })
    ).body;
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const groceries = cats.find((c) => c.systemKey === 'food.groceries')!;
    const salary = cats.find((c) => c.systemKey === 'salary.salary')!;

    const exp = await call('POST', '/api/records', {
      type: 'expense',
      accountId: bank.id,
      amount: 2550,
      categoryId: groceries.id,
      occurredAt: iso('2026-03-10T18:00:00Z'),
      note: 'Weekly shopping',
    });
    expect(exp.status).toBe(201);
    expect(exp.body[0].amount).toBe(-2550);

    await call('POST', '/api/records', {
      type: 'income',
      accountId: bank.id,
      amount: 250000,
      categoryId: salary.id,
      occurredAt: iso('2026-03-25T09:00:00Z'),
    });
    const tr = await call<any[]>('POST', '/api/records', {
      type: 'transfer',
      accountId: bank.id,
      toAccountId: cash.id,
      amount: 10000,
      occurredAt: iso('2026-03-26T09:00:00Z'),
      note: 'ATM',
    });
    expect(tr.status).toBe(201);
    expect(tr.body).toHaveLength(2);
    expect(tr.body[0].transferGroupId).toBe(tr.body[1].transferGroupId);

    const accounts = (await call<any[]>('GET', '/api/accounts')).body;
    const b = accounts.find((a) => a.id === bank.id)!;
    const c = accounts.find((a) => a.id === cash.id)!;
    expect(b.balance).toBe(100000 - 2550 + 250000 - 10000);
    expect(c.balance).toBe(5000 + 10000);

    // Editing one side of the transfer updates both.
    const outSide = tr.body.find((r: any) => r.amount < 0);
    const upd = await call<any[]>('PUT', `/api/records/${outSide.id}`, {
      type: 'transfer',
      accountId: bank.id,
      toAccountId: cash.id,
      amount: 20000,
      occurredAt: iso('2026-03-26T09:00:00Z'),
    });
    expect(upd.status).toBe(200);
    const afterEdit = (await call<any[]>('GET', '/api/accounts')).body;
    expect(afterEdit.find((a) => a.id === cash.id)!.balance).toBe(25000);

    // Deleting one side removes the whole transfer.
    expect((await call('DELETE', `/api/records/${outSide.id}`)).status).toBe(204);
    const afterDelete = (await call<any[]>('GET', '/api/accounts')).body;
    expect(afterDelete.find((a) => a.id === cash.id)!.balance).toBe(5000);
    expect(afterDelete.find((a) => a.id === bank.id)!.balance).toBe(100000 - 2550 + 250000);

    // Listing & filtering
    const list = await call('GET', `/api/records?accountIds=${bank.id}&types=expense`);
    expect(list.body.items).toHaveLength(1);
    const search = await call('GET', '/api/records?search=weekly');
    expect(search.body.items).toHaveLength(1);
    const byParent = await call('GET', `/api/records?categoryIds=${groceries.parentId}`);
    expect(byParent.body.items).toHaveLength(1);
  });

  it('adjusts the balance with or without a correction record', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'Wallet',
        type: 'cash',
        currency: 'EUR',
        initialBalance: 1000,
        color: '#22C55E',
      })
    ).body;
    const silent = await call('POST', `/api/accounts/${acc.id}/adjust-balance`, { balance: 5000 });
    expect(silent.body.balance).toBe(5000);
    expect(silent.body.recordCount).toBe(0);
    const withRecord = await call('POST', `/api/accounts/${acc.id}/adjust-balance`, {
      balance: 4200,
      createRecord: true,
    });
    expect(withRecord.body.balance).toBe(4200);
    expect(withRecord.body.recordCount).toBe(1);
  });

  it('paginates with a cursor', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'cash',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    for (let i = 0; i < 7; i++) {
      await call('POST', '/api/records', {
        type: 'expense',
        accountId: acc.id,
        amount: 100 + i,
        occurredAt: iso(`2026-01-0${i + 1}T10:00:00Z`),
      });
    }
    const p1 = await call('GET', '/api/records?limit=3');
    expect(p1.body.items).toHaveLength(3);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await call('GET', `/api/records?limit=3&cursor=${p1.body.nextCursor}`);
    const p3 = await call('GET', `/api/records?limit=3&cursor=${p2.body.nextCursor}`);
    expect(p3.body.items).toHaveLength(1);
    expect(p3.body.nextCursor).toBeNull();
    const all = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((r: any) => r.amount);
    expect(all).toEqual([-106, -105, -104, -103, -102, -101, -100]);
  });

  it('isolates data between users', async () => {
    const a = await registerUser(ctx.app);
    const b = await registerUser(ctx.app);
    const acc = (
      await a.call('POST', '/api/accounts', {
        name: 'Secret',
        type: 'cash',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    expect((await b.call('GET', `/api/accounts/${acc.id}`)).status).toBe(404);
    const rec = await b.call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 100,
      occurredAt: new Date().toISOString(),
    });
    expect(rec.status).toBe(404);
    expect((await b.call<any[]>('GET', '/api/accounts')).body).toHaveLength(0);
  });
});

describe('statistics', () => {
  it('aggregates in the base currency using exchange rates', async () => {
    const { call } = await registerUser(ctx.app);
    const eur = (
      await call('POST', '/api/accounts', {
        name: 'EUR',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const usd = (
      await call('POST', '/api/accounts', {
        name: 'USD',
        type: 'checking',
        currency: 'USD',
        color: '#6366F1',
      })
    ).body;
    await call('PUT', '/api/currencies/rates', { rates: [{ currency: 'USD', rate: 0.5 }] });
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const restaurants = cats.find((c) => c.systemKey === 'food.restaurants')!;
    const fuel = cats.find((c) => c.systemKey === 'vehicle.fuel')!;

    await call('POST', '/api/records', {
      type: 'expense',
      accountId: eur.id,
      amount: 3000,
      categoryId: restaurants.id,
      occurredAt: iso('2026-02-03T12:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: usd.id,
      amount: 4000,
      categoryId: restaurants.id,
      occurredAt: iso('2026-02-04T12:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: eur.id,
      amount: 6000,
      categoryId: fuel.id,
      occurredAt: iso('2026-02-04T15:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'income',
      accountId: eur.id,
      amount: 50000,
      occurredAt: iso('2026-02-10T09:00:00Z'),
    });
    // Transfers never count as income/expense.
    await call('POST', '/api/records', {
      type: 'transfer',
      accountId: eur.id,
      toAccountId: usd.id,
      amount: 1000,
      toAmount: 2000,
      occurredAt: iso('2026-02-11T09:00:00Z'),
    });

    const q = `from=${encodeURIComponent('2026-02-01T00:00:00Z')}&to=${encodeURIComponent('2026-03-01T00:00:00Z')}&tz=UTC`;
    const summary = (await call('GET', `/api/stats/summary?${q}`)).body;
    expect(summary.expense).toBe(3000 + 2000 + 6000);
    expect(summary.income).toBe(50000);
    expect(summary.net).toBe(50000 - 11000);

    const byCat = (await call('GET', `/api/stats/categories?${q}`)).body;
    expect(byCat.total).toBe(11000);
    expect(byCat.items[0].categoryId).toBe(fuel.parentId);
    expect(byCat.items[0].amount).toBe(6000);
    expect(byCat.items[1].categoryId).toBe(restaurants.parentId);
    expect(byCat.items[1].amount).toBe(5000);

    const drill = (await call('GET', `/api/stats/categories?${q}&parentId=${restaurants.parentId}`))
      .body;
    expect(drill.items).toEqual([
      expect.objectContaining({ categoryId: restaurants.id, amount: 5000, count: 2 }),
    ]);

    const series = (await call('GET', `/api/stats/timeseries?${q}&interval=day`)).body;
    expect(series.points).toHaveLength(28);
    const feb4 = series.points.find((p: any) => p.date === '2026-02-04');
    expect(feb4.total).toBe(8000);

    const accountOnly = (await call('GET', `/api/stats/summary?${q}&accountIds=${usd.id}`)).body;
    expect(accountOnly.expense).toBe(2000);

    const balance = (await call('GET', `/api/stats/balance?${q}&interval=week`)).body;
    const last = balance.points[balance.points.length - 1];
    // EUR: -3000 - 6000 + 50000 - 1000 = 40000 ; USD: -4000 + 2000 = -2000 → -1000 EUR
    expect(last.balance).toBe(40000 - 1000);
  });
});

describe('planned payments', () => {
  it('pays and skips occurrences', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'Bank',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const rent = cats.find((c) => c.systemKey === 'housing.rent')!;
    const created = await call('POST', '/api/planned-payments', {
      name: 'Rent',
      type: 'expense',
      accountId: acc.id,
      categoryId: rent.id,
      amount: 75000,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-01-31',
    });
    expect(created.status).toBe(201);
    expect(created.body.nextDueDate).toBe('2026-01-31');

    const paid = await call('POST', `/api/planned-payments/${created.body.id}/pay`, {
      occurredAt: iso('2026-02-01T10:00:00Z'),
    });
    expect(paid.status).toBe(200);
    expect(paid.body.records[0].amount).toBe(-75000);
    expect(paid.body.records[0].plannedPaymentId).toBe(created.body.id);
    expect(paid.body.plannedPayment.nextDueDate).toBe('2026-02-28');
    expect(paid.body.plannedPayment.paidCount).toBe(1);

    const skipped = await call('POST', `/api/planned-payments/${created.body.id}/skip`);
    expect(skipped.body.nextDueDate).toBe('2026-03-31');

    const upcoming = await call<any[]>('GET', '/api/planned-payments/upcoming?days=0&tz=UTC');
    expect(upcoming.body.every((o) => o.overdue)).toBe(true);
    expect(upcoming.body[0].dueDate).toBe('2026-03-31');
  });

  it('supports one-time transfers', async () => {
    const { call } = await registerUser(ctx.app);
    const a = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const b = (
      await call('POST', '/api/accounts', {
        name: 'B',
        type: 'savings',
        currency: 'EUR',
        color: '#10B981',
      })
    ).body;
    const p = (
      await call('POST', '/api/planned-payments', {
        name: 'Move to savings',
        type: 'transfer',
        accountId: a.id,
        toAccountId: b.id,
        amount: 10000,
        frequency: 'once',
        startDate: '2026-05-01',
      })
    ).body;
    const paid = await call('POST', `/api/planned-payments/${p.id}/pay`, {});
    expect(paid.body.records).toHaveLength(2);
    expect(paid.body.plannedPayment.nextDueDate).toBeNull();
  });
});

describe('budgets', () => {
  it('reports spending for the current period', async () => {
    const { call } = await registerUser(ctx.app, { timezone: 'UTC' });
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const food = cats.find((c) => c.systemKey === 'food')!;
    const groceries = cats.find((c) => c.systemKey === 'food.groceries')!;
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 12345,
      categoryId: groceries.id,
      occurredAt: new Date().toISOString(),
    });
    const budget = await call('POST', '/api/budgets', {
      name: 'Food',
      amount: 40000,
      period: 'month',
      categoryIds: [food.id],
    });
    expect(budget.status).toBe(201);
    const list = await call<any[]>('GET', '/api/budgets?tz=UTC');
    expect(list.body[0].spent).toBe(12345);
    expect(list.body[0].remaining).toBe(40000 - 12345);
  });
});

describe('export', () => {
  it('exports CSV with formula injection protection', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 1999,
      occurredAt: iso('2026-01-05T10:00:00Z'),
      note: '=HYPERLINK("evil")',
    });
    const res = await call('GET', '/api/export/records.csv?tz=UTC');
    expect(res.status).toBe(200);
    const text = res.raw.body;
    expect(text).toContain('2026-01-05 10:00,A,expense,,,-19.99,EUR');
    expect(text).toContain(`"'=HYPERLINK(""evil"")"`);
  });
});

describe('import', () => {
  it('imports records into new and existing accounts and skips duplicates', async () => {
    const { call } = await registerUser(ctx.app);
    const existing = (
      await call('POST', '/api/accounts', {
        name: 'Bank',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const groceries = cats.find((c) => c.systemKey === 'food.groceries')!;
    const payload = {
      accounts: [
        { key: 'Bank', existingId: existing.id },
        {
          key: 'Wallet',
          create: { name: 'Wallet', type: 'cash', currency: 'BGN', color: '#22C55E' },
        },
      ],
      records: [
        {
          accountKey: 'Bank',
          type: 'expense',
          amount: 1250,
          occurredAt: iso('2025-03-01T10:00:00Z'),
          categoryId: groceries.id,
          labels: ['Imported'],
        },
        {
          accountKey: 'Bank',
          type: 'income',
          amount: 200000,
          occurredAt: iso('2025-03-02T10:00:00Z'),
          note: 'Salary',
        },
        {
          accountKey: 'Bank',
          type: 'transfer',
          amount: 5000,
          toAccountKey: 'Wallet',
          toAmount: 9779,
          occurredAt: iso('2025-03-03T10:00:00Z'),
        },
      ],
    };
    const first = await call('POST', '/api/import/records', payload);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ imported: 3, skipped: 0, accountsCreated: 1, labelsCreated: 1 });

    const accounts = (await call<any[]>('GET', '/api/accounts')).body;
    expect(accounts.find((a) => a.id === existing.id)!.balance).toBe(-1250 + 200000 - 5000);
    expect(accounts.find((a) => a.name === 'Wallet')!.balance).toBe(9779);

    // Importing the same file again only creates the new account mapping, no duplicate records.
    const again = await call('POST', '/api/import/records', {
      ...payload,
      accounts: [
        { key: 'Bank', existingId: existing.id },
        { key: 'Wallet', existingId: accounts.find((a) => a.name === 'Wallet')!.id },
      ],
    });
    expect(again.body.imported).toBe(0);
    expect(again.body.skipped).toBe(3);
  });

  it('summarizes filtered records', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const fuel = cats.find((c) => c.systemKey === 'vehicle.fuel')!;
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 6000,
      categoryId: fuel.id,
      occurredAt: iso('2026-01-02T10:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 4000,
      occurredAt: iso('2026-01-03T10:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'income',
      accountId: acc.id,
      amount: 10000,
      occurredAt: iso('2026-01-04T10:00:00Z'),
    });
    const all = (await call('GET', '/api/records/summary')).body;
    expect(all).toMatchObject({ income: 10000, expense: 10000, net: 0, count: 3 });
    const vehicle = (await call('GET', `/api/records/summary?categoryIds=${fuel.parentId}`)).body;
    expect(vehicle).toMatchObject({ income: 0, expense: 6000, count: 1 });
  });
});

describe('bulk editing', () => {
  it('changes category, account and labels of many records', async () => {
    const { call } = await registerUser(ctx.app);
    const a = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const b = (
      await call('POST', '/api/accounts', {
        name: 'B',
        type: 'cash',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    const usd = (
      await call('POST', '/api/accounts', {
        name: 'USD',
        type: 'cash',
        currency: 'USD',
        color: '#6366F1',
      })
    ).body;
    const label = (await call('POST', '/api/labels', { name: 'Trip', color: '#14B8A6' })).body;
    const cats = (await call<any[]>('GET', '/api/categories')).body;
    const taxi = cats.find((c) => c.systemKey === 'transport.taxi')!;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await call<any[]>('POST', '/api/records', {
        type: 'expense',
        accountId: a.id,
        amount: 1000 + i,
        occurredAt: iso(`2026-02-0${i + 1}T10:00:00Z`),
      });
      ids.push(r.body[0].id);
    }
    const res = await call('POST', '/api/records/bulk-update', {
      ids,
      categoryId: taxi.id,
      accountId: b.id,
      addLabelIds: [label.id],
    });
    expect(res.body.updated).toBe(3);
    const list = (await call('GET', `/api/records?accountIds=${b.id}`)).body.items;
    expect(list).toHaveLength(3);
    expect(list.every((r: any) => r.categoryId === taxi.id && r.labelIds.includes(label.id))).toBe(
      true,
    );

    const cross = await call('POST', '/api/records/bulk-update', { ids, accountId: usd.id });
    expect(cross.status).toBe(400);

    await call('POST', '/api/records/bulk-update', { ids, removeLabelIds: [label.id] });
    const after = (await call('GET', `/api/records?accountIds=${b.id}`)).body.items;
    expect(after.every((r: any) => r.labelIds.length === 0)).toBe(true);
  });
});

describe('automatic planned payments', () => {
  it('records due occurrences automatically', async () => {
    const { processAutoConfirm } = await import('../src/services/planned');
    const { call } = await registerUser(ctx.app, { timezone: 'Europe/Sofia' });
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'Bank',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const plan = (
      await call('POST', '/api/planned-payments', {
        name: 'Streaming',
        type: 'expense',
        accountId: acc.id,
        amount: 1299,
        frequency: 'monthly',
        startDate: '2026-01-10',
        autoConfirm: true,
      })
    ).body;
    expect(plan.autoConfirm).toBe(true);
    const created = await processAutoConfirm(ctx.db, new Date('2026-04-15T12:00:00Z'));
    expect(created).toBeGreaterThanOrEqual(4);
    const after = (await call('GET', `/api/planned-payments/${plan.id}`)).body;
    expect(after.nextDueDate).toBe('2026-05-10');
    expect(after.paidCount).toBe(4);
    const records = (await call('GET', `/api/records?accountIds=${acc.id}`)).body.items;
    expect(records).toHaveLength(4);
    expect(new Date(records[0].occurredAt).toISOString()).toBe('2026-04-10T05:00:00.000Z');
    // Running again does nothing.
    expect(await processAutoConfirm(ctx.db, new Date('2026-04-15T12:00:00Z'))).toBe(0);
  });
});

describe('search', () => {
  it('finds records by amount', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 1399,
      occurredAt: iso('2026-01-02T10:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 4500,
      occurredAt: iso('2026-01-03T10:00:00Z'),
    });
    expect((await call('GET', '/api/records?search=13.99')).body.items).toHaveLength(1);
    expect((await call('GET', '/api/records?search=13,99')).body.items).toHaveLength(1);
    expect((await call('GET', '/api/records?search=45')).body.items).toHaveLength(1);
  });
});

describe('goals', () => {
  it('tracks manual and account-based goals', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'Savings',
        type: 'savings',
        currency: 'EUR',
        initialBalance: 50000,
        color: '#10B981',
      })
    ).body;
    const manual = (
      await call('POST', '/api/goals', {
        name: 'Bike',
        targetAmount: 100000,
        targetDate: '2099-01-01',
      })
    ).body;
    expect(manual.currentAmount).toBe(0);
    expect(manual.monthlyNeeded).toBeGreaterThan(0);
    const after = (await call('POST', `/api/goals/${manual.id}/contribute`, { amount: 100000 }))
      .body;
    expect(after.progress).toBe(1);
    expect(after.achievedAt).not.toBeNull();
    expect(after.monthlyNeeded).toBe(0);

    await call('POST', '/api/records', {
      type: 'income',
      accountId: acc.id,
      amount: 10000,
      occurredAt: iso('2026-01-02T10:00:00Z'),
    });
    const linked = (
      await call('POST', '/api/goals', { name: 'Fund', targetAmount: 200000, accountId: acc.id })
    ).body;
    expect(linked.currentAmount).toBe(60000);
    expect(linked.progress).toBe(0.3);
    expect((await call('POST', `/api/goals/${linked.id}/contribute`, { amount: 100 })).status).toBe(
      400,
    );
    expect((await call('DELETE', `/api/goals/${linked.id}`)).status).toBe(204);
    expect((await call<any[]>('GET', '/api/goals')).body).toHaveLength(1);
  });
});

describe('administration', () => {
  it('lets admins manage users and registration', async () => {
    const { eq } = await import('drizzle-orm');
    const { users } = await import('../src/db/schema');
    const admin = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    expect((await other.call('GET', '/api/admin/users')).status).toBe(403);
    await ctx.db.update(users).set({ isAdmin: true }).where(eq(users.email, admin.email));

    const list = await admin.call<any[]>('GET', '/api/admin/users');
    expect(list.status).toBe(200);
    expect(list.body.some((u) => u.email === other.email)).toBe(true);

    const created = await admin.call('POST', '/api/admin/users', {
      name: 'Partner',
      email: `partner${Date.now()}@example.com`,
      password: 'first password',
    });
    expect(created.status).toBe(201);
    const login = (email: string, password: string) =>
      ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    const partnerEmail = (await admin.call<any[]>('GET', '/api/admin/users')).body.find(
      (u) => u.name === 'Partner',
    ).email;
    expect((await login(partnerEmail, 'first password')).statusCode).toBe(200);

    expect(
      (
        await admin.call('PATCH', `/api/admin/users/${created.body.id}`, {
          password: 'second password',
        })
      ).status,
    ).toBe(204);
    expect((await login(partnerEmail, 'first password')).statusCode).toBe(401);
    expect((await login(partnerEmail, 'second password')).statusCode).toBe(200);

    // Registration can be closed from the UI.
    expect(
      (await admin.call('PATCH', '/api/admin/settings', { registrationEnabled: false })).body
        .registrationEnabled,
    ).toBe(false);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/config' })).json().registrationEnabled,
    ).toBe(false);
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'X', email: 'blocked@example.com', password: 'long enough password' },
    });
    expect(blocked.statusCode).toBe(403);
    await admin.call('PATCH', '/api/admin/settings', { registrationEnabled: true });

    expect((await admin.call('DELETE', `/api/admin/users/${admin.user.id}`)).status).toBe(400);
    expect((await admin.call('DELETE', `/api/admin/users/${created.body.id}`)).status).toBe(204);
    expect((await login(partnerEmail, 'second password')).statusCode).toBe(401);
  });
});

describe('review regressions', () => {
  it('PATCH /accounts only changes the fields that were sent', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'Old',
        type: 'savings',
        currency: 'EUR',
        initialBalance: 50000,
        color: '#10B981',
        archived: true,
        excludeFromStats: true,
        note: 'keep me',
      })
    ).body;
    const res = await call('PATCH', `/api/accounts/${acc.id}`, { name: 'New' });
    expect(res.body).toMatchObject({
      name: 'New',
      initialBalance: 50000,
      archived: true,
      excludeFromStats: true,
      note: 'keep me',
    });
  });

  it('editing a finished planned payment does not reopen paid occurrences', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const input = {
      name: 'Course',
      type: 'expense',
      accountId: acc.id,
      amount: 1000,
      frequency: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-03-01',
    };
    const plan = (await call('POST', '/api/planned-payments', input)).body;
    for (let i = 0; i < 3; i++) await call('POST', `/api/planned-payments/${plan.id}/pay`, {});
    expect((await call('GET', `/api/planned-payments/${plan.id}`)).body.nextDueDate).toBeNull();
    const extended = (
      await call('PUT', `/api/planned-payments/${plan.id}`, { ...input, endDate: '2026-06-01' })
    ).body;
    expect(extended.nextDueDate).toBe('2026-04-01');
  });

  it('confirming the same occurrence twice creates only one record', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const plan = (
      await call('POST', '/api/planned-payments', {
        name: 'Rent',
        type: 'expense',
        accountId: acc.id,
        amount: 1000,
        frequency: 'monthly',
        startDate: '2026-01-01',
      })
    ).body;
    const [a, b] = await Promise.all([
      call('POST', `/api/planned-payments/${plan.id}/pay`, { dueDate: '2026-01-01' }),
      call('POST', `/api/planned-payments/${plan.id}/pay`, { dueDate: '2026-01-01' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, expect.any(Number)].sort());
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect((await call('GET', `/api/records?accountIds=${acc.id}`)).body.items).toHaveLength(1);
  });

  it('import converts cross-currency transfers and keeps identical rows of the file', async () => {
    const { call } = await registerUser(ctx.app);
    await call('PUT', '/api/currencies/rates', { rates: [{ currency: 'CZK', rate: 0.04 }] });
    const res = await call('POST', '/api/import/records', {
      accounts: [
        { key: 'EUR', create: { name: 'EUR', currency: 'EUR' } },
        { key: 'CZK', create: { name: 'CZK', currency: 'CZK' } },
      ],
      records: [
        {
          accountKey: 'EUR',
          type: 'transfer',
          toAccountKey: 'CZK',
          amount: 10000,
          occurredAt: iso('2026-01-01T12:00:00Z'),
        },
        {
          accountKey: 'EUR',
          type: 'expense',
          amount: 200,
          occurredAt: iso('2026-01-02T12:00:00Z'),
          labels: ['Bus', 'bus'],
        },
        {
          accountKey: 'EUR',
          type: 'expense',
          amount: 200,
          occurredAt: iso('2026-01-02T12:00:00Z'),
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    const accounts = (await call<any[]>('GET', '/api/accounts')).body;
    expect(accounts.find((a) => a.name === 'CZK')!.balance).toBe(250000);
    expect(accounts.find((a) => a.name === 'EUR')!.balance).toBe(-10000 - 400);
  });

  it('rejects empty time zones and invalid cursors, accepts empty patches', async () => {
    const { call } = await registerUser(ctx.app);
    expect((await call('PATCH', '/api/me', { timezone: '' })).status).toBe(400);
    expect((await call('PATCH', '/api/me', { timezone: '+01:00' })).status).toBe(400);
    expect((await call('PATCH', '/api/me', {})).status).toBe(200);
    const label = (await call('POST', '/api/labels', { name: 'X', color: '#3B82F6' })).body;
    expect((await call('PATCH', `/api/labels/${label.id}`, {})).status).toBe(200);
    const badCursor = Buffer.from('2025-01-01T00:00:00Z|abc').toString('base64url');
    expect((await call('GET', `/api/records?cursor=${badCursor}`)).status).toBe(400);
  });

  it('compares with an explicit period and includes goals in the backup', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 75000,
      occurredAt: iso('2026-03-01T10:00:00Z'),
    });
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 75000,
      occurredAt: iso('2026-04-01T10:00:00Z'),
    });
    const q = (extra: string) =>
      `/api/stats/summary?from=${encodeURIComponent('2026-04-01T00:00:00Z')}&to=${encodeURIComponent('2026-05-01T00:00:00Z')}&tz=UTC${extra}`;
    // Default: the 30 days before April 1st miss March 1st.
    expect((await call('GET', q(''))).body.previous.expense).toBe(0);
    const calendar = await call(
      'GET',
      q(
        `&compareFrom=${encodeURIComponent('2026-03-01T00:00:00Z')}&compareTo=${encodeURIComponent('2026-04-01T00:00:00Z')}`,
      ),
    );
    expect(calendar.body.previous.expense).toBe(75000);

    await call('POST', '/api/goals', { name: 'Trip', targetAmount: 1000 });
    const backup = (await call('GET', '/api/export/backup.json')).body;
    expect(backup.goals).toHaveLength(1);
  });
});

describe('filtered export', () => {
  it('exports only the records matching the filters', async () => {
    const { call } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    await call('POST', '/api/records', {
      type: 'expense',
      accountId: acc.id,
      amount: 100,
      occurredAt: iso('2026-01-02T10:00:00Z'),
      note: 'coffee',
    });
    await call('POST', '/api/records', {
      type: 'income',
      accountId: acc.id,
      amount: 5000,
      occurredAt: iso('2026-01-03T10:00:00Z'),
      note: 'salary',
    });
    const res = await call('GET', '/api/export/records.csv?types=expense&tz=UTC');
    const lines = res.raw.body.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('coffee');
  });
});

describe('API tokens', () => {
  it('creates a token that authenticates API calls and can be revoked', async () => {
    const { call } = await registerUser(ctx.app);
    const created = await call('POST', '/api/me/tokens', { name: 'iPhone Shortcut' });
    expect(created.status).toBe(201);
    const auth = { authorization: `Bearer ${created.body.token}` };
    const acc = await ctx.app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: auth,
      payload: { name: 'Via API', type: 'cash', currency: 'EUR', color: '#22C55E' },
    });
    expect(acc.statusCode).toBe(201);
    const sessions = (await call<any[]>('GET', '/api/me/sessions')).body;
    const token = sessions.find((s) => s.name === 'iPhone Shortcut');
    expect(token).toBeTruthy();
    expect(new Date(token.expiresAt).getFullYear()).toBeGreaterThan(new Date().getFullYear() + 5);
    expect((await call('DELETE', `/api/me/sessions/${token.id}`)).status).toBe(204);
    const after = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: auth });
    expect(after.statusCode).toBe(401);
  });
});

describe('backup & restore', () => {
  it('restores a backup into another user with all relations', async () => {
    const source = await registerUser(ctx.app);
    const a = (
      await source.call('POST', '/api/accounts', {
        name: 'Bank',
        type: 'checking',
        currency: 'EUR',
        initialBalance: 10000,
        color: '#3B82F6',
      })
    ).body;
    const b = (
      await source.call('POST', '/api/accounts', {
        name: 'Cash',
        type: 'cash',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    const cats = (await source.call<any[]>('GET', '/api/categories')).body;
    const food = cats.find((c) => c.systemKey === 'food')!;
    const custom = (
      await source.call('POST', '/api/categories', {
        name: 'Ice cream',
        icon: 'cake',
        parentId: food.id,
      })
    ).body;
    const label = (await source.call('POST', '/api/labels', { name: 'Summer', color: '#F97316' }))
      .body;
    await source.call('POST', '/api/records', {
      type: 'expense',
      accountId: a.id,
      amount: 450,
      categoryId: custom.id,
      labelIds: [label.id],
      occurredAt: iso('2026-07-01T10:00:00Z'),
    });
    await source.call('POST', '/api/records', {
      type: 'transfer',
      accountId: a.id,
      toAccountId: b.id,
      amount: 2000,
      occurredAt: iso('2026-07-02T10:00:00Z'),
    });
    await source.call('POST', '/api/planned-payments', {
      name: 'Rent',
      type: 'expense',
      accountId: a.id,
      amount: 5000,
      frequency: 'monthly',
      startDate: '2026-08-01',
    });
    await source.call('POST', '/api/budgets', {
      name: 'Food',
      amount: 30000,
      period: 'month',
      categoryIds: [food.id],
    });
    await source.call('POST', '/api/goals', { name: 'Bike', targetAmount: 50000, accountId: b.id });
    const backup = (await source.call('GET', '/api/export/backup.json')).body;

    const target = await registerUser(ctx.app);
    await target.call('POST', '/api/accounts', {
      name: 'Will be replaced',
      type: 'cash',
      currency: 'EUR',
      color: '#22C55E',
    });
    const res = await target.call('POST', '/api/me/restore', backup);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accounts: 2,
      records: 3,
      plannedPayments: 1,
      budgets: 1,
      goals: 1,
    });

    const accounts = (await target.call<any[]>('GET', '/api/accounts')).body;
    expect(accounts.map((x) => x.name).sort()).toEqual(['Bank', 'Cash']);
    expect(accounts.find((x) => x.name === 'Bank')!.balance).toBe(10000 - 450 - 2000);
    expect(accounts.find((x) => x.name === 'Cash')!.balance).toBe(2000);
    const records = (await target.call('GET', '/api/records')).body.items;
    const iceCream = records.find((r: any) => r.amount === -450);
    const targetCats = (await target.call<any[]>('GET', '/api/categories')).body;
    expect(targetCats.find((c) => c.id === iceCream.categoryId)!.name).toBe('Ice cream');
    expect(iceCream.labelIds).toHaveLength(1);
    const transfer = records.filter((r: any) => r.type === 'transfer');
    expect(transfer).toHaveLength(2);
    expect(transfer[0].transferGroupId).toBe(transfer[1].transferGroupId);
    expect(transfer[0].transferGroupId).not.toBe(
      records.find((r: any) => r.type === 'transfer' && r.id)?.id,
    );
    const goals = (await target.call<any[]>('GET', '/api/goals')).body;
    expect(goals[0].currentAmount).toBe(2000);
    // The source user's data is untouched.
    expect((await source.call<any[]>('GET', '/api/accounts')).body).toHaveLength(2);
  });

  it('rejects files that are not Slavotax backups', async () => {
    const { call } = await registerUser(ctx.app);
    expect((await call('POST', '/api/me/restore', { hello: 'world' })).status).toBe(400);
  });
});

describe('demo account', () => {
  it('keeps visitors apart and the shared profile unchanged', async () => {
    const demo = await createTestApp({
      DEMO_ENABLED: 'true',
      DEMO_EMAIL: `demo${Date.now()}@example.com`,
    });
    const { ensureDemo } = await import('../src/demo/seed');
    await ensureDemo(demo.db, demo.config, true);
    const login = async () => {
      const res = await demo.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} });
      const cookie = res.cookies.find((c) => c.name === 'slavotax_session')!.value;
      return (method: string, url: string, payload?: unknown) =>
        demo.app.inject({
          method: method as 'GET',
          url,
          payload: payload as never,
          cookies: { slavotax_session: cookie },
        });
    };
    const visitorA = await login();
    const visitorB = await login();
    const sessions = (await visitorA('GET', '/api/me/sessions')).json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].current).toBe(true);
    expect((await visitorB('PATCH', '/api/me', { baseCurrency: 'USD' })).statusCode).toBe(403);
    expect((await visitorB('PATCH', '/api/me', { theme: 'dark' })).statusCode).toBe(200);
    expect((await visitorA('GET', '/api/me')).json().user.theme).toBe('system');
    const accounts = (await visitorA('GET', '/api/accounts')).json();
    expect(accounts.length).toBeGreaterThan(3);
    await demo.close();
  });
});

describe('reminders', () => {
  it('sends one daily reminder with due planned payments', async () => {
    const http = await import('node:http');
    const received: { headers: Record<string, unknown>; body: string }[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const { processReminders } = await import('../src/services/reminders');

    const { call } = await registerUser(ctx.app, { timezone: 'UTC' });
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    await call('POST', '/api/planned-payments', {
      name: 'Rent',
      type: 'expense',
      accountId: acc.id,
      amount: 75000,
      frequency: 'monthly',
      startDate: '2026-05-10',
    });
    const saved = await call('PUT', '/api/me/reminders', {
      url: `http://127.0.0.1:${port}/my-topic`,
      format: 'ntfy',
      hour: 7,
    });
    expect(saved.status).toBe(200);

    expect(await processReminders(ctx.db, new Date('2026-05-10T06:00:00Z'))).toBe(0); // before 07:00
    expect(await processReminders(ctx.db, new Date('2026-05-10T08:00:00Z'))).toBe(1);
    expect(await processReminders(ctx.db, new Date('2026-05-10T12:00:00Z'))).toBe(0); // once a day
    expect(received).toHaveLength(1);
    expect(received[0]!.body).toContain('Rent');
    expect(received[0]!.body).toContain('today');
    expect(String(received[0]!.headers.title)).toContain('due soon');

    const test = await call('POST', '/api/me/reminders/test');
    expect(test.status).toBe(200);
    expect(received).toHaveLength(2);

    await call('PUT', '/api/me/reminders', { url: null, format: 'ntfy', hour: 7 });
    expect((await call('POST', '/api/me/reminders/test')).status).toBe(400);
    server.close();
  });
});

describe('localized reminders', () => {
  it('uses the language of the user', async () => {
    const { buildReminder } = await import('../src/services/reminders');
    const { eq } = await import('drizzle-orm');
    const { users } = await import('../src/db/schema');
    const { call, user } = await registerUser(ctx.app, { timezone: 'UTC' });
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'A',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    await call('POST', '/api/planned-payments', {
      name: 'Наем',
      type: 'expense',
      accountId: acc.id,
      amount: 50000,
      frequency: 'monthly',
      startDate: '2026-05-10',
    });
    expect((await call('PATCH', '/api/me', { language: 'bg' })).body.user).toBeTruthy();
    const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
    const message = await buildReminder(ctx.db, row!, new Date('2026-05-10T09:00:00Z'));
    expect(message.title).toContain('предстоящо плащане');
    expect(message.lines[0]).toContain('днес');
  });
});

describe('attachments', () => {
  // Smallest valid PNG: 1×1 transparent pixel.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const upload = (cookie: string, recordId: string, body: Buffer, type: string, name?: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/attachments${name ? `?name=${encodeURIComponent(name)}` : ''}`,
      headers: { 'content-type': type },
      payload: body,
      cookies: { slavotax_session: cookie },
    });

  it('stores, serves and cleans up files attached to records', async () => {
    const { call, cookie } = await registerUser(ctx.app);
    const bank = (
      await call('POST', '/api/accounts', {
        name: 'Bank',
        type: 'checking',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const cash = (
      await call('POST', '/api/accounts', {
        name: 'Cash',
        type: 'cash',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    const expense = {
      type: 'expense',
      accountId: bank.id,
      amount: 1299,
      occurredAt: iso('2026-05-02T10:00:00Z'),
    };
    const rec = (await call<any[]>('POST', '/api/records', expense)).body[0];
    expect(rec.attachmentCount).toBe(0);

    const up = await upload(cookie, rec.id, png, 'image/png', 'Receipt "Lidl".png');
    expect(up.statusCode).toBe(201);
    const file = up.json();
    expect(file).toMatchObject({ recordId: rec.id, contentType: 'image/png', size: png.length });
    expect(file.fileName).toBe('Receipt Lidl.png');

    // Wrong or disguised types are refused.
    expect((await upload(cookie, rec.id, Buffer.from('<p>hi</p>'), 'text/html')).statusCode).toBe(
      400,
    );
    expect((await upload(cookie, rec.id, Buffer.from('<svg/>'), 'image/png')).statusCode).toBe(400);

    const dl = await ctx.app.inject({
      method: 'GET',
      url: `/api/attachments/${file.id}`,
      cookies: { slavotax_session: cookie },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['content-security-policy']).toContain('sandbox');
    expect(dl.rawPayload.equals(png)).toBe(true);

    // Other users can neither see nor delete it.
    const other = await registerUser(ctx.app);
    expect((await other.call('GET', `/api/attachments/${file.id}`)).status).toBe(404);
    expect((await other.call('GET', `/api/records/${rec.id}/attachments`)).status).toBe(404);
    expect((await other.call('DELETE', `/api/attachments/${file.id}`)).status).toBe(404);
    expect((await upload(other.cookie, rec.id, png, 'image/png')).statusCode).toBe(404);

    // Editing the record keeps its files.
    await call('PUT', `/api/records/${rec.id}`, { ...expense, amount: 1399 });
    expect((await call('GET', `/api/records/${rec.id}`)).body.attachmentCount).toBe(1);
    const page = (await call('GET', `/api/records?accountIds=${bank.id}`)).body;
    expect(page.items[0].attachmentCount).toBe(1);

    // Both sides of a transfer share the files, also after it becomes an expense.
    const tr = (
      await call<any[]>('POST', '/api/records', {
        type: 'transfer',
        accountId: bank.id,
        toAccountId: cash.id,
        amount: 5000,
        occurredAt: iso('2026-05-03T10:00:00Z'),
      })
    ).body;
    const incoming = tr.find((r: any) => r.amount > 0);
    const outgoing = tr.find((r: any) => r.amount < 0);
    expect((await upload(cookie, incoming.id, png, 'image/png')).statusCode).toBe(201);
    expect((await call('GET', `/api/records/${outgoing.id}`)).body.attachmentCount).toBe(1);
    expect((await call('GET', `/api/records/${incoming.id}/attachments`)).body).toHaveLength(1);
    await call('PUT', `/api/records/${incoming.id}`, {
      type: 'expense',
      accountId: cash.id,
      amount: 5000,
      occurredAt: iso('2026-05-03T10:00:00Z'),
    });
    const remaining = (await call('GET', `/api/records?accountIds=${cash.id}`)).body.items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attachmentCount).toBe(1);

    // Deleting a record deletes its files; deleting an account sweeps the rest.
    expect((await call('DELETE', `/api/records/${rec.id}`)).status).toBe(204);
    expect((await call('GET', `/api/attachments/${file.id}`)).status).toBe(404);
    const left = (await call<any[]>('GET', `/api/records/${remaining[0].id}/attachments`)).body;
    expect(left).toHaveLength(1);
    expect((await call('DELETE', `/api/accounts/${cash.id}`)).status).toBe(204);
    expect((await call('GET', `/api/attachments/${left[0].id}`)).status).toBe(404);
  });

  it('limits the number of files per record', async () => {
    const { call, cookie } = await registerUser(ctx.app);
    const acc = (
      await call('POST', '/api/accounts', {
        name: 'Cash',
        type: 'cash',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    const rec = (
      await call<any[]>('POST', '/api/records', {
        type: 'expense',
        accountId: acc.id,
        amount: 100,
        occurredAt: new Date().toISOString(),
      })
    ).body[0];
    for (let i = 0; i < 10; i++) {
      expect((await upload(cookie, rec.id, png, 'image/png')).statusCode).toBe(201);
    }
    expect((await upload(cookie, rec.id, png, 'image/png')).statusCode).toBe(400);
  });
});
