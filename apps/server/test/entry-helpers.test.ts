import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});

async function userWithAccount() {
  const u = await registerUser(ctx.app);
  const account = (
    await u.call('POST', '/api/accounts', {
      name: 'Cash',
      type: 'cash',
      currency: 'EUR',
      color: '#3B82F6',
    })
  ).body;
  const expense = (amount: number, note: string | null, extra: Record<string, unknown> = {}) =>
    u.call('POST', '/api/records', {
      type: 'expense',
      accountId: account.id,
      amount,
      note,
      occurredAt: new Date().toISOString(),
      ...extra,
    });
  return { ...u, account, expense };
}

describe('note suggestions', () => {
  it('lists notes written before, most used first, without blanks', async () => {
    const u = await userWithAccount();
    for (const note of ['Kaufland', ' Kaufland ', 'Kaufland', 'Lidl', 'x', null]) {
      expect((await u.expense(500, note)).status).toBe(201);
    }
    const notes = (await u.call<any[]>('GET', '/api/records/notes')).body;
    expect(notes).toEqual([
      { note: 'Kaufland', count: 3 },
      { note: 'Lidl', count: 1 },
    ]);
    // Only the user's own notes.
    const other = await registerUser(ctx.app);
    expect((await other.call<any[]>('GET', '/api/records/notes')).body).toEqual([]);
  });

  it('is a personal setting that is on by default', async () => {
    const u = await registerUser(ctx.app);
    expect(u.user.noteSuggestions).toBe(true);
    const off = await u.call('PATCH', '/api/me', { noteSuggestions: false });
    expect(off.body.user.noteSuggestions).toBe(false);
    expect((await u.call('GET', '/api/me')).body.user.noteSuggestions).toBe(false);
  });
});

describe('templates', () => {
  it('can leave out the amount', async () => {
    const u = await userWithAccount();
    const tpl = await u.call('POST', '/api/templates', {
      name: 'Lidl',
      type: 'expense',
      accountId: u.account.id,
      note: 'Lidl',
      amount: null,
    });
    expect(tpl.status).toBe(201);
    expect(tpl.body.amount).toBeNull();
    expect(tpl.body.note).toBe('Lidl');
  });
});

describe('offline entry', () => {
  it('creates a record sent twice with the same client id only once', async () => {
    const u = await userWithAccount();
    const clientId = crypto.randomUUID();
    const first = await u.expense(1500, 'Coffee', { clientId });
    expect(first.status).toBe(201);
    expect(first.body[0].id).toBe(clientId);
    const again = await u.expense(1500, 'Coffee', { clientId });
    expect(again.status).toBe(200);
    expect(again.body[0].id).toBe(clientId);
    expect((await u.call<any>('GET', '/api/records')).body.items).toHaveLength(1);

    // Transfers: both sides come back.
    const savings = (
      await u.call('POST', '/api/accounts', {
        name: 'Savings',
        type: 'savings',
        currency: 'EUR',
        color: '#22C55E',
      })
    ).body;
    const transfer = {
      type: 'transfer',
      accountId: u.account.id,
      toAccountId: savings.id,
      amount: 1000,
      occurredAt: new Date().toISOString(),
      clientId: crypto.randomUUID(),
    };
    expect((await u.call('POST', '/api/records', transfer)).status).toBe(201);
    const repeated = await u.call<any[]>('POST', '/api/records', transfer);
    expect(repeated.status).toBe(200);
    expect(repeated.body).toHaveLength(2);

    // Another user cannot use (or learn about) the id.
    const other = await registerUser(ctx.app);
    const otherAccount = (
      await other.call('POST', '/api/accounts', {
        name: 'Cash',
        type: 'cash',
        currency: 'EUR',
        color: '#3B82F6',
      })
    ).body;
    const stolen = await other.call('POST', '/api/records', {
      type: 'expense',
      accountId: otherAccount.id,
      amount: 100,
      occurredAt: new Date().toISOString(),
      clientId,
    });
    expect(stolen.status).toBe(409);
  });
});
