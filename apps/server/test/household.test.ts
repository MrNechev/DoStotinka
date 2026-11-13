import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});

const account = (name: string, currency = 'EUR') => ({
  name,
  type: 'checking',
  currency,
  color: '#3B82F6',
});

async function joinHousehold() {
  const owner = await registerUser(ctx.app, { name: 'Owner' });
  const member = await registerUser(ctx.app, { name: 'Member' });
  const ownerAccount = (await owner.call('POST', '/api/accounts', account('Joint account'))).body;
  const memberOwn = (await member.call('POST', '/api/accounts', account('My private'))).body;
  const invited = await owner.call('POST', '/api/household/invites', { email: member.email });
  expect(invited.status).toBe(200);
  const state = (await member.call('GET', '/api/household')).body;
  expect(state.role).toBe('none');
  expect(state.incoming).toHaveLength(1);
  expect(state.incoming[0].owner.name).toBe('Owner');
  const accepted = await member.call(
    'POST',
    `/api/household/invites/${state.incoming[0].id}/accept`,
  );
  expect(accepted.status).toBe(200);
  return { owner, member, ownerAccount, memberOwn };
}

describe('households', () => {
  it('lets members work with the owner’s data and gives their own back when leaving', async () => {
    const { owner, member, ownerAccount, memberOwn } = await joinHousehold();

    const memberAccounts = (await member.call<any[]>('GET', '/api/accounts')).body;
    expect(memberAccounts.map((a) => a.id)).toEqual([ownerAccount.id]);
    const me = (await member.call('GET', '/api/me')).body.user;
    expect(me.householdOwner).toMatchObject({ name: 'Owner' });
    expect(me.name).toBe('Member');

    // A record added by the member shows up for the owner.
    const rec = await member.call('POST', '/api/records', {
      type: 'expense',
      accountId: ownerAccount.id,
      amount: 1234,
      occurredAt: new Date().toISOString(),
    });
    expect(rec.status).toBe(201);
    const ownerRecords = (await owner.call<any>('GET', '/api/records')).body.items;
    expect(ownerRecords.map((r: any) => r.amount)).toContain(-1234);
    // The member's own account is hidden, not reachable.
    expect((await member.call('GET', `/api/accounts/${memberOwn.id}`)).status).toBe(404);

    const ownerState = (await owner.call('GET', '/api/household')).body;
    expect(ownerState.role).toBe('owner');
    expect(ownerState.members.map((m: any) => m.name)).toEqual(['Member']);
    const memberState = (await member.call('GET', '/api/household')).body;
    expect(memberState).toMatchObject({ role: 'member', owner: { name: 'Owner' } });

    expect((await member.call('POST', '/api/household/leave')).status).toBe(200);
    const after = (await member.call<any[]>('GET', '/api/accounts')).body;
    expect(after.map((a) => a.id)).toEqual([memberOwn.id]);
    expect((await owner.call('GET', '/api/household')).body.role).toBe('none');
  });

  it('keeps personal settings personal and owner-only actions for the owner', async () => {
    const { owner, member } = await joinHousehold();
    // Theme and language are personal.
    const themed = await member.call('PATCH', '/api/me', { theme: 'dark' });
    expect(themed.status).toBe(200);
    expect((await owner.call('GET', '/api/me')).body.user.theme).not.toBe('dark');
    // The main currency belongs to the shared data.
    expect((await member.call('PATCH', '/api/me', { baseCurrency: 'USD' })).status).toBe(403);
    expect((await member.call('GET', '/api/me')).body.user.baseCurrency).toBe('EUR');
    // Members cannot invite others or restore backups over the shared data.
    expect(
      (await member.call('POST', '/api/household/invites', { email: 'x@example.com' })).status,
    ).toBe(400);
    const backup = (await owner.call('GET', '/api/export/backup.json')).body;
    expect((await member.call('POST', '/api/me/restore', backup)).status).toBe(403);
  });

  it('lets the owner remove members and handles invitations safely', async () => {
    const { owner, member } = await joinHousehold();
    expect((await owner.call('DELETE', `/api/household/members/${member.user.id}`)).status).toBe(
      200,
    );
    expect((await member.call('GET', '/api/me')).body.user.householdOwner).toBeNull();

    // Decline by the invited person, cancel by the owner, nobody else.
    await owner.call('POST', '/api/household/invites', { email: member.email });
    const stranger = await registerUser(ctx.app);
    const pending = (await member.call('GET', '/api/household')).body.incoming[0];
    expect((await stranger.call('DELETE', `/api/household/invites/${pending.id}`)).status).toBe(
      404,
    );
    expect(
      (await stranger.call('POST', `/api/household/invites/${pending.id}/accept`)).status,
    ).toBe(404);
    expect((await member.call('DELETE', `/api/household/invites/${pending.id}`)).status).toBe(200);
    expect((await owner.call('GET', '/api/household')).body.invites).toHaveLength(0);

    // Someone whose data others share cannot join another household.
    const third = await registerUser(ctx.app);
    await owner.call('POST', '/api/household/invites', { email: third.email });
    const inv = (await third.call('GET', '/api/household')).body.incoming[0];
    await third.call('POST', `/api/household/invites/${inv.id}/accept`);
    await member.call('POST', '/api/household/invites', { email: owner.email });
    const ownerInv = (await owner.call('GET', '/api/household')).body.incoming[0];
    expect((await owner.call('POST', `/api/household/invites/${ownerInv.id}/accept`)).status).toBe(
      400,
    );
    expect(
      (await owner.call('POST', '/api/household/invites', { email: owner.email })).status,
    ).toBe(400);
  });

  it('gives members their own data back when the owner deletes their account', async () => {
    const { owner, member, memberOwn } = await joinHousehold();
    const del = await owner.call('DELETE', '/api/me', { password: 'correct horse battery' });
    expect([200, 204]).toContain(del.status);
    const accounts = (await member.call<any[]>('GET', '/api/accounts')).body;
    expect(accounts.map((a) => a.id)).toEqual([memberOwn.id]);
  });
});
