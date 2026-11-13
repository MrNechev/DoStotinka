import type { HouseholdPerson, HouseholdState } from '@dostotinka/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db';
import { householdInvites, type UserRow, users } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';

/**
 * Households: members log in with their own account but work with the data of the owner (all
 * accounts, records, budgets …). Joining hides the member's own data, leaving brings it back.
 */

const person = (u: Pick<UserRow, 'id' | 'name' | 'email'>): HouseholdPerson => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

/** The household owner of a member (or the user itself). */
export async function dataOwnerOf(db: Database, user: UserRow): Promise<UserRow> {
  if (!user.householdOwnerId) return user;
  const [owner] = await db.select().from(users).where(eq(users.id, user.householdOwnerId));
  return owner ?? user;
}

export async function householdState(db: Database, user: UserRow): Promise<HouseholdState> {
  const incoming = await db
    .select({ invite: householdInvites, owner: users })
    .from(householdInvites)
    .innerJoin(users, eq(users.id, householdInvites.ownerId))
    .where(sql`lower(${householdInvites.email}) = lower(${user.email})`);
  const incomingList = incoming
    .filter((i) => i.owner.id !== user.id)
    .map((i) => ({
      id: i.invite.id,
      owner: person(i.owner),
      createdAt: i.invite.createdAt.toISOString(),
    }));

  if (user.householdOwnerId) {
    const [owner] = await db.select().from(users).where(eq(users.id, user.householdOwnerId));
    const members = owner
      ? await db.select().from(users).where(eq(users.householdOwnerId, owner.id))
      : [];
    return {
      role: 'member',
      owner: owner ? person(owner) : null,
      members: members.map(person),
      invites: [],
      incoming: incomingList,
    };
  }
  const [members, invites] = await Promise.all([
    db.select().from(users).where(eq(users.householdOwnerId, user.id)),
    db.select().from(householdInvites).where(eq(householdInvites.ownerId, user.id)),
  ]);
  return {
    role: members.length ? 'owner' : 'none',
    owner: members.length ? person(user) : null,
    members: members.map(person),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      createdAt: i.createdAt.toISOString(),
    })),
    incoming: incomingList,
  };
}

export async function invite(db: Database, owner: UserRow, email: string): Promise<void> {
  if (owner.isDemo) throw forbidden('The demo account cannot share its data');
  if (owner.householdOwnerId) {
    throw badRequest('Only the owner of the household can invite people');
  }
  if (email.toLowerCase() === owner.email.toLowerCase()) {
    throw badRequest('You cannot invite yourself');
  }
  const [invitee] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (invitee?.householdOwnerId === owner.id) throw conflict('This person is already a member');
  await db
    .insert(householdInvites)
    .values({ ownerId: owner.id, email: email.toLowerCase() })
    .onConflictDoNothing();
}

export async function cancelInvite(db: Database, user: UserRow, id: string): Promise<void> {
  const [row] = await db.select().from(householdInvites).where(eq(householdInvites.id, id));
  // The owner cancels, the invited person declines.
  if (!row || (row.ownerId !== user.id && row.email.toLowerCase() !== user.email.toLowerCase())) {
    throw notFound('Invitation');
  }
  await db.delete(householdInvites).where(eq(householdInvites.id, id));
}

export async function acceptInvite(db: Database, user: UserRow, id: string): Promise<void> {
  if (user.isDemo) throw forbidden('The demo account cannot join a household');
  const [row] = await db.select().from(householdInvites).where(eq(householdInvites.id, id));
  if (!row || row.email.toLowerCase() !== user.email.toLowerCase()) throw notFound('Invitation');
  const [owner] = await db.select().from(users).where(eq(users.id, row.ownerId));
  if (!owner || owner.householdOwnerId) {
    await db.delete(householdInvites).where(eq(householdInvites.id, id));
    throw badRequest('This household no longer exists');
  }
  const [ownMembers] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.householdOwnerId, user.id));
  if (ownMembers && ownMembers.n > 0) {
    throw badRequest('Others share your data – remove them from your household first');
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ householdOwnerId: owner.id }).where(eq(users.id, user.id));
    await tx.delete(householdInvites).where(eq(householdInvites.id, id));
    // Invitations this user had sent are void now.
    await tx.delete(householdInvites).where(eq(householdInvites.ownerId, user.id));
  });
}

export async function leaveHousehold(db: Database, user: UserRow): Promise<void> {
  if (!user.householdOwnerId) throw badRequest('You are not a member of a household');
  await db.update(users).set({ householdOwnerId: null }).where(eq(users.id, user.id));
}

export async function removeMember(db: Database, owner: UserRow, memberId: string): Promise<void> {
  const rows = await db
    .update(users)
    .set({ householdOwnerId: null })
    .where(and(eq(users.id, memberId), eq(users.householdOwnerId, owner.id)))
    .returning({ id: users.id });
  if (!rows.length) throw notFound('Member');
}
