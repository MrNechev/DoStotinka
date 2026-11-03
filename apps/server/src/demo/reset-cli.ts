import { loadConfig } from '../config';
import { createDatabase } from '../db';
import { runMigrations } from '../db/migrate';
import { ensureDemo } from './seed';

const config = loadConfig();
const { db, client } = createDatabase(config.databaseUrl, { max: 2 });
await runMigrations(db);
await ensureDemo(db, config, true);
await client.end();
console.log(`Demo data regenerated for ${config.DEMO_EMAIL}`);
