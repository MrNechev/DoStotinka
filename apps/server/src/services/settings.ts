import { and, count, eq } from 'drizzle-orm';
import type { Config } from '../config';
import type { Database } from '../db';
import { appSettings, users } from '../db/schema';

export async function getSetting<T>(db: Database, key: string): Promise<T | undefined> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row ? (row.value as T) : undefined;
}

export async function setSetting(db: Database, key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** Number of real (non-demo) users. */
export async function realUserCount(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.isDemo, false)));
  return row?.n ?? 0;
}

/**
 * Whether new users may sign up: the admin setting wins over the environment variable.
 * The very first user can always register (otherwise nobody could ever log in).
 */
export async function registrationOpen(db: Database, config: Config): Promise<boolean> {
  if ((await realUserCount(db)) === 0) return true;
  const setting = await getSetting<boolean>(db, 'registrationEnabled');
  return setting ?? config.ALLOW_REGISTRATION;
}
