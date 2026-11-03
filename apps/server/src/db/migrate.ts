import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './index';

/** Locates the migrations folder both in development (src) and in the bundled build (dist). */
export function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(here, '../drizzle'),
    path.resolve(here, '../../drizzle'),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(path.join(p, 'meta/_journal.json')));
  if (!found)
    throw new Error(`Could not find migrations folder (looked in ${candidates.join(', ')})`);
  return found;
}

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
