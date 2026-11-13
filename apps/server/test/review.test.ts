import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processReminders } from '../src/services/reminders';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let hook: Server;
let hookUrl = '';
const received: any[] = [];

beforeAll(async () => {
  ctx = await createTestApp();
  hook = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.writeHead(200).end();
    });
  });
  await new Promise<void>((r) => hook.listen(0, '127.0.0.1', r));
  hookUrl = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/hook`;
});
afterAll(async () => {
  await ctx.close();
  hook.close();
});

/** A user (time zone UTC) with records in October 2026 and the six months before. */
async function setup() {
  const u = await registerUser(ctx.app);
  await u.call('PATCH', '/api/me', { timezone: 'UTC' });
  const account = (
    await u.call('POST', '/api/accounts', {
      name: 'Card',
      type: 'checking',
      currency: 'EUR',
      color: '#3B82F6',
      initialBalance: 100000,
    })
  ).body;
  const cats = (await u.call<any[]>('GET', '/api/categories')).body;
  const group = (name: RegExp) =>
    cats.find((c) => !c.parentId && c.kind === 'expense' && name.test(c.name))!;
  const food = group(/food/i);
  const foodSub = cats.find((c) => c.parentId === food.id)!;
  const transport = group(/transport/i);
  const salaryCat = cats.find((c) => c.kind === 'income')!;
  const add = (
    type: 'expense' | 'income',
    amount: number,
    date: string,
    extra: Record<string, unknown> = {},
  ) =>
    u.call('POST', '/api/records', {
      type,
      accountId: account.id,
      amount,
      occurredAt: `${date}T12:00:00Z`,
      ...extra,
    });
  // April–September: salary 2000, food 3 × 100, transport 50.
  for (const m of ['04', '05', '06', '07', '08', '09']) {
    await add('income', 200000, `2026-${m}-01`, { categoryId: salaryCat.id });
    for (const d of ['05', '12', '19'])
      await add('expense', 10000, `2026-${m}-${d}`, { categoryId: foodSub.id, payee: 'Lidl' });
    await add('expense', 5000, `2026-${m}-10`, { categoryId: transport.id });
  }
  // October: same salary, food 3 × 100 + one 900 dinner, transport 0, note-only shop.
  await add('income', 200000, '2026-10-01', { categoryId: salaryCat.id });
  for (const d of ['05', '12', '19'])
    await add('expense', 10000, `2026-10-${d}`, { categoryId: foodSub.id, payee: 'Lidl' });
  await add('expense', 90000, '2026-10-20', { categoryId: foodSub.id, note: 'Wedding dinner' });
  await add('expense', 2000, '2026-10-21', { note: 'Kaufland' });
  await add('expense', 2000, '2026-10-22', { note: 'kaufland' });
  return { ...u, account, food, transport };
}

describe('monthly review', () => {
  it('compares the month with the months before', async () => {
    const u = await setup();
    await u.call('POST', '/api/budgets', {
      name: 'Food',
      amount: 50000,
      period: 'month',
      categoryIds: [u.food.id],
    });
    const res = await u.call('GET', '/api/stats/review?month=2026-10&tz=UTC');
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r).toMatchObject({
      month: '2026-10',
      partial: false,
      income: 200000,
      expense: 124000,
      net: 76000,
      typical: { income: 200000, expense: 35000, months: 6 },
      recordCount: 7,
      firstMonth: '2026-04',
    });
    expect(r.savingsRate).toBeCloseTo(0.38);
    // Food (top level) first; the uncategorised Kaufland notes next.
    expect(r.categories[0]).toMatchObject({
      categoryId: u.food.id,
      amount: 120000,
      typical: 30000,
    });
    expect(r.categories.find((c: any) => c.categoryId === null)).toMatchObject({ amount: 4000 });
    // Food went up, transport disappeared.
    expect(r.changes.map((c: any) => c.categoryId)).toEqual(
      expect.arrayContaining([u.food.id, u.transport.id]),
    );
    expect(r.largest[0]).toMatchObject({ amount: 90000, note: 'Wedding dinner', unusual: true });
    expect(r.largest[1]).toMatchObject({ amount: 10000, unusual: false });
    // Payees fall back to the note, case-insensitively.
    expect(r.payees[0]).toMatchObject({ name: 'Wedding dinner', amount: 90000 });
    expect(r.payees).toContainEqual({ name: 'Lidl', amount: 30000, count: 3 });
    expect(r.payees).toContainEqual({ name: 'Kaufland', amount: 4000, count: 2 });
    expect(r.budgets).toEqual([
      expect.objectContaining({ name: 'Food', amount: 50000, spent: 120000 }),
    ]);
    expect(r.balanceEnd - r.balanceStart).toBe(76000);
  });

  it('has no "usual" for the first month and validates the month', async () => {
    const u = await setup();
    const first = (await u.call('GET', '/api/stats/review?month=2026-04&tz=UTC')).body;
    expect(first.typical).toEqual({ income: 0, expense: 0, months: 0 });
    expect(first.changes).toEqual([]);
    expect((await u.call('GET', '/api/stats/review?month=2026-13')).status).toBe(400);
    const empty = (await (await registerUser(ctx.app)).call('GET', '/api/stats/review')).body;
    expect(empty).toMatchObject({ recordCount: 0, firstMonth: null });
  });

  it('is sent with the reminders at the start of the month when switched on', async () => {
    const u = await setup();
    await u.call('PATCH', '/api/me', { language: 'en' });
    await u.call('POST', '/api/budgets', {
      name: 'Food',
      amount: 50000,
      period: 'month',
      categoryIds: [u.food.id],
    });
    const saved = await u.call('PUT', '/api/me/reminders', {
      url: hookUrl,
      format: 'json',
      hour: 8,
      monthlyReview: true,
    });
    expect(saved.body.monthlyReview).toBe(true);
    received.length = 0;
    await processReminders(ctx.db, new Date('2026-11-01T09:00:00Z'));
    const review = received.find((m) => /October 2026/.test(m.title));
    expect(review).toBeDefined();
    expect(review.message).toMatch(/Income/);
    expect(review.message).toMatch(/Budgets over the limit: Food/);
    // Only once per month.
    received.length = 0;
    await processReminders(ctx.db, new Date('2026-11-01T15:00:00Z'));
    expect(received.find((m) => /October 2026/.test(m.title))).toBeUndefined();
  });
});
