import { loadConfig } from '../config';
import { createDatabase } from './index';
import { runMigrations } from './migrate';

const config = loadConfig();
const { db, client } = createDatabase(config.databaseUrl, { max: 1 });
await runMigrations(db);
await client.end();
console.log('Migrations applied');
