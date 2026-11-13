import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});

async function setup() {
  const u = await registerUser(ctx.app);
  const account = (
    await u.call('POST', '/api/accounts', {
      name: 'Card',
      type: 'checking',
      currency: 'EUR',
      color: '#3B82F6',
    })
  ).body;
  const cats = (await u.call<any[]>('GET', '/api/categories')).body;
  const expenseCat = cats.find((c) => c.kind === 'expense' && c.parentId)!;
  const otherExpense = cats.find(
    (c) => c.kind === 'expense' && c.parentId && c.id !== expenseCat.id,
  )!;
  const incomeCat = cats.find((c) => c.kind === 'income')!;
  const label = (await u.call('POST', '/api/labels', { name: 'Food', color: '#22C55E' })).body;
  const expense = (extra: Record<string, unknown>) =>
    u.call('POST', '/api/records', {
      type: 'expense',
      accountId: account.id,
      amount: 1000,
      occurredAt: new Date().toISOString(),
      ...extra,
    });
  return { ...u, account, expenseCat, otherExpense, incomeCat, label, expense };
}

describe('rules', () => {
  it('are created, validated, ordered and deleted', async () => {
    const u = await setup();
    expect((await u.call('POST', '/api/rules', { pattern: 'lidl' })).status).toBe(400);
    expect(
      (await u.call('POST', '/api/rules', { pattern: 'lidl', categoryId: crypto.randomUUID() }))
        .status,
    ).toBe(400);
    // An income category on an expense rule does not fit.
    expect(
      (
        await u.call('POST', '/api/rules', {
          pattern: 'lidl',
          recordType: 'expense',
          categoryId: u.incomeCat.id,
        })
      ).status,
    ).toBe(400);
    const a = await u.call('POST', '/api/rules', { pattern: 'lidl', setPayee: 'Lidl' });
    const b = await u.call('POST', '/api/rules', { pattern: 'billa', setPayee: 'Billa' });
    expect(a.status).toBe(201);
    expect(b.body.position).toBeGreaterThan(a.body.position);
    const ordered = await u.call<any[]>('POST', '/api/rules/order', {
      ids: [b.body.id, a.body.id],
    });
    expect(ordered.body.map((r) => r.id)).toEqual([b.body.id, a.body.id]);
    const updated = await u.call('PUT', `/api/rules/${a.body.id}`, {
      pattern: 'lidl',
      setPayee: 'LIDL',
      enabled: false,
    });
    expect(updated.body).toMatchObject({ setPayee: 'LIDL', enabled: false });
    // Other users cannot see or change them.
    const other = await registerUser(ctx.app);
    expect((await other.call<any[]>('GET', '/api/rules')).body).toEqual([]);
    expect((await other.call('DELETE', `/api/rules/${a.body.id}`)).status).toBe(404);
    expect((await u.call('DELETE', `/api/rules/${a.body.id}`)).status).toBe(204);
    expect((await u.call<any[]>('GET', '/api/rules')).body).toHaveLength(1);
  });

  it('fill in transactions from phone notifications', async () => {
    const u = await setup();
    await u.call('POST', '/api/rules', {
      pattern: 'lidl',
      categoryId: u.expenseCat.id,
      setPayee: 'Lidl',
      setNote: 'Groceries at Lidl',
      labelIds: [u.label.id],
    });
    await u.call('PATCH', '/api/automatic-import', { notificationsEnabled: true });
    const source = (await u.call('POST', '/api/automatic-import/sources', { name: 'Phone' })).body;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/ingest/notification',
      headers: { authorization: `Bearer ${source.token}` },
      payload: { app: 'com.revolut.revolut', title: 'LIDL BULGARIA 1234', text: 'You paid €12.50' },
    });
    expect(res.json()).toMatchObject({ status: 'created' });
    const [item] = (await u.call<any[]>('GET', '/api/inbox')).body;
    expect(item).toMatchObject({
      payee: 'Lidl',
      categoryId: u.expenseCat.id,
      note: 'Groceries at Lidl',
      labelIds: [u.label.id],
    });
    const confirmed = await u.call('POST', `/api/inbox/${item.id}/confirm`, {
      accountId: u.account.id,
    });
    expect(confirmed.status).toBe(200);
    const records = (await u.call<any>('GET', '/api/records')).body.items;
    expect(records[0]).toMatchObject({
      payee: 'Lidl',
      note: 'Groceries at Lidl',
      categoryId: u.expenseCat.id,
      labelIds: [u.label.id],
    });
  });

  it('fill in CSV imports unless switched off, keeping categories from the file', async () => {
    const u = await setup();
    await u.call('POST', '/api/rules', {
      pattern: 'kaufland',
      categoryId: u.expenseCat.id,
      setPayee: 'Kaufland',
    });
    const row = (payee: string, categoryId?: string) => ({
      accountKey: 'card',
      type: 'expense',
      amount: 500,
      occurredAt: new Date(Date.now() - Math.random() * 1e9).toISOString(),
      payee,
      ...(categoryId ? { categoryId } : {}),
    });
    const imported = await u.call('POST', '/api/import/records', {
      accounts: [{ key: 'card', existingId: u.account.id }],
      records: [row('KAUFLAND 001'), row('KAUFLAND 002', u.otherExpense.id), row('Billa')],
    });
    expect(imported.body.imported).toBe(3);
    const items = (await u.call<any>('GET', '/api/records')).body.items;
    const byCategory = items.map((r: any) => [r.payee, r.categoryId]).sort();
    expect(byCategory).toEqual(
      [
        ['Billa', null],
        ['Kaufland', u.expenseCat.id],
        ['Kaufland', u.otherExpense.id],
      ].sort(),
    );
    await u.call('POST', '/api/import/records', {
      accounts: [{ key: 'card', existingId: u.account.id }],
      records: [row('KAUFLAND 003')],
      applyRules: false,
    });
    const all = (await u.call<any>('GET', '/api/records')).body.items;
    expect(all.some((r: any) => r.payee === 'KAUFLAND 003' && r.categoryId === null)).toBe(true);
  });

  it('can be applied to the existing records', async () => {
    const u = await setup();
    await u.expense({ payee: 'SHELL 12', note: null });
    await u.expense({ payee: 'Shell Sofia', categoryId: u.otherExpense.id, note: 'mine' });
    await u.expense({ payee: 'OMV' });
    const rule = (
      await u.call('POST', '/api/rules', {
        pattern: 'shell',
        field: 'payee',
        categoryId: u.expenseCat.id,
        setPayee: 'Shell',
        setNote: 'Fuel',
      })
    ).body;
    const dry = await u.call('POST', `/api/rules/${rule.id}/apply`, { dryRun: true });
    expect(dry.body).toEqual({ matched: 2, changed: 2 });
    expect(
      (await u.call<any>('GET', '/api/records')).body.items.filter((r: any) => r.payee === 'Shell'),
    ).toHaveLength(0);
    const done = await u.call('POST', `/api/rules/${rule.id}/apply`, {});
    expect(done.body).toEqual({ matched: 2, changed: 2 });
    const items = (await u.call<any>('GET', '/api/records')).body.items;
    const shell = items.filter((r: any) => r.payee === 'Shell');
    expect(shell).toHaveLength(2);
    // Existing category and note are kept without overwriteCategory.
    expect(shell.map((r: any) => [r.categoryId, r.note]).sort()).toEqual(
      [
        [u.expenseCat.id, 'Fuel'],
        [u.otherExpense.id, 'mine'],
      ].sort(),
    );
    const again = await u.call('POST', `/api/rules/${rule.id}/apply`, { overwriteCategory: true });
    expect(again.body).toEqual({ matched: 2, changed: 1 });
  });
});

describe('payees', () => {
  it('lists payees and renames or merges them', async () => {
    const u = await setup();
    await u.expense({ payee: 'LIDL 1' });
    await u.expense({ payee: 'LIDL 1' });
    await u.expense({ payee: 'Lidl' });
    const list = (await u.call<any[]>('GET', '/api/payees')).body;
    expect(list.map((p) => [p.payee, p.count])).toEqual([
      ['LIDL 1', 2],
      ['Lidl', 1],
    ]);
    const merged = await u.call('POST', '/api/payees/rename', { from: 'LIDL 1', to: 'Lidl' });
    expect(merged.body).toEqual({ changed: 2 });
    expect((await u.call<any[]>('GET', '/api/payees')).body).toMatchObject([
      { payee: 'Lidl', count: 3 },
    ]);
  });
});

describe('backup', () => {
  it('includes the rules', async () => {
    const u = await setup();
    await u.call('POST', '/api/rules', {
      pattern: 'lidl',
      categoryId: u.expenseCat.id,
      labelIds: [u.label.id],
      accountId: u.account.id,
    });
    const backup = (await u.call('GET', '/api/export/backup.json')).body;
    expect(backup.rules).toHaveLength(1);
    const restored = await u.call('POST', '/api/me/restore', backup);
    expect(restored.status).toBe(200);
    const [rule] = (await u.call<any[]>('GET', '/api/rules')).body;
    const accounts = (await u.call<any[]>('GET', '/api/accounts')).body;
    const labels = (await u.call<any[]>('GET', '/api/labels')).body;
    expect(rule.accountId).toBe(accounts[0].id);
    expect(rule.labelIds).toEqual([labels[0].id]);
    expect(rule.categoryId).not.toBeNull();
  });
});
