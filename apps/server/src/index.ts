import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db';
import { runMigrations } from './db/migrate';
import { ensureDemo } from './demo/seed';
import { startJobs } from './jobs';

async function waitForDatabase(check: () => Promise<unknown>, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await check();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Waiting for database (${i}/${attempts})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const config = loadConfig();
  const { db, client } = createDatabase(config.databaseUrl);
  await waitForDatabase(() => client`select 1`);
  await runMigrations(db);

  const app = await buildApp(config, db);

  if (config.DEMO_ENABLED) {
    try {
      // Regenerate on every start so the demo always ends "today".
      await ensureDemo(db, config, true);
      app.log.info(`Demo account ready: ${config.DEMO_EMAIL}`);
    } catch (err) {
      app.log.error({ err }, 'Could not prepare the demo account');
    }
  }

  const stopJobs = startJobs(db, config, app.log);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down`);
    stopJobs();
    await app.close();
    await client.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
