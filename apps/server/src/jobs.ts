import { and, eq, lt, ne } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config';
import type { Database } from './db';
import { exchangeRates, sessions, users } from './db/schema';
import { ensureDemo } from './demo/seed';
import { applyReferenceRates, refreshReferenceRates } from './services/rates';

const HOUR = 3_600_000;

async function updateAllRates(db: Database, config: Config, log: FastifyBaseLogger) {
  try {
    const count = await refreshReferenceRates(db, config.EXCHANGE_RATES_URL);
    const owners = await db
      .selectDistinct({ id: users.id, base: users.baseCurrency })
      .from(users)
      .innerJoin(exchangeRates, eq(exchangeRates.userId, users.id))
      .where(ne(exchangeRates.source, 'manual'));
    for (const u of owners) await applyReferenceRates(db, u.id, u.base);
    log.info({ currencies: count, users: owners.length }, 'Exchange rates updated');
  } catch (err) {
    log.warn({ err }, 'Exchange rate update failed');
  }
}

/** Starts background jobs. Returns a function that stops them. */
export function startJobs(db: Database, config: Config, log: FastifyBaseLogger): () => void {
  const timers: NodeJS.Timeout[] = [];

  const cleanupSessions = async () => {
    try {
      await db.delete(sessions).where(and(lt(sessions.expiresAt, new Date())));
    } catch (err) {
      log.warn({ err }, 'Session cleanup failed');
    }
  };
  timers.push(setInterval(cleanupSessions, 12 * HOUR));
  void cleanupSessions();

  if (config.EXCHANGE_RATES_AUTO_UPDATE) {
    timers.push(setInterval(() => void updateAllRates(db, config, log), 6 * HOUR));
    timers.push(setTimeout(() => void updateAllRates(db, config, log), 5_000));
  }

  if (config.DEMO_ENABLED && config.DEMO_RESET_HOURS > 0) {
    timers.push(
      setInterval(async () => {
        try {
          await ensureDemo(db, config, true);
          log.info('Demo data regenerated');
        } catch (err) {
          log.error({ err }, 'Demo reset failed');
        }
      }, config.DEMO_RESET_HOURS * HOUR),
    );
  }

  for (const t of timers) t.unref();
  return () => {
    for (const t of timers) clearInterval(t);
  };
}
