import { eq } from 'drizzle-orm';
import type { Config } from '../config';
import type { Database } from '../db';
import { accounts, users } from '../db/schema';
import { hashPassword } from '../lib/crypto';
import { generateDemoData } from './generate';

/**
 * Creates the demo user if missing and (re)generates its data.
 * `force` regenerates even when data already exists (used by the periodic reset).
 */
export async function ensureDemo(db: Database, config: Config, force = false): Promise<boolean> {
  const email = config.DEMO_EMAIL.toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (user && !user.isDemo) {
    // Never touch a real account that happens to use the demo e-mail.
    return false;
  }
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        name: 'Demo User',
        passwordHash: await hashPassword(config.DEMO_PASSWORD),
        baseCurrency: 'EUR',
        timezone: 'Europe/Sofia',
        isDemo: true,
      })
      .returning();
  }
  const demo = user!;
  const [anyAccount] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, demo.id))
    .limit(1);
  if (anyAccount && !force) return false;
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ baseCurrency: 'EUR', timezone: 'Europe/Sofia', name: 'Demo User', weekStartsOn: 1 })
      .where(eq(users.id, demo.id));
    await generateDemoData(tx, demo.id);
  });
  return true;
}
