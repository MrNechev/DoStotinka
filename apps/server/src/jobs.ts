import { and, eq, lt, ne } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config';
import type { Database } from './db';
import { exchangeRates, sessions, users } from './db/schema';
import { ensureDemo } from './demo/seed';
import { sweepOrphanAttachments } from './services/attachments';
import { processBankSync } from './services/bank-import';
import { purgeInbox } from './services/inbox';
import { processAutoConfirm } from './services/planned';
import { applyReferenceRates, refreshReferenceRates } from './services/rates';
import { processReminders } from './services/reminders';
import { checkForUpdate, isNewer } from './services/update-check';

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
      await purgeInbox(db);
      const files = await sweepOrphanAttachments(db);
      if (files) log.info({ files }, 'Removed attachments of deleted records');
    } catch (err) {
      log.warn({ err }, 'Cleanup failed');
    }
  };
  timers.push(setInterval(cleanupSessions, 12 * HOUR));
  void cleanupSessions();

  const autoConfirm = async () => {
    try {
      const created = await processAutoConfirm(db);
      if (created) log.info({ created }, 'Recorded automatic planned payments');
    } catch (err) {
      log.warn({ err }, 'Automatic planned payments failed');
    }
  };
  timers.push(setInterval(autoConfirm, 0.25 * HOUR));
  timers.push(setTimeout(autoConfirm, 10_000));

  if (config.NOTIFICATIONS_ENABLED) {
    const reminders = async () => {
      try {
        const sent = await processReminders(db);
        if (sent) log.info({ sent }, 'Sent planned-payment reminders');
      } catch (err) {
        log.warn({ err }, 'Reminders failed');
      }
    };
    timers.push(setInterval(reminders, 0.25 * HOUR));
    timers.push(setTimeout(reminders, 20_000));
  }

  if (config.AUTOMATIC_IMPORT) {
    const bankSync = async () => {
      try {
        const { synced, failed } = await processBankSync(db, config);
        if (synced || failed) log.info({ synced, failed }, 'Bank connections synced');
      } catch (err) {
        log.warn({ err }, 'Bank sync failed');
      }
    };
    timers.push(setInterval(bankSync, 0.25 * HOUR));
    timers.push(setTimeout(bankSync, 30_000));
  }

  if (config.EXCHANGE_RATES_AUTO_UPDATE) {
    timers.push(setInterval(() => void updateAllRates(db, config, log), 6 * HOUR));
    timers.push(setTimeout(() => void updateAllRates(db, config, log), 5_000));
  }

  if (config.UPDATE_CHECK && config.NODE_ENV !== 'test') {
    const updates = async () => {
      try {
        const { latest } = await checkForUpdate(db, config);
        if (isNewer(latest, config.version)) {
          log.info({ latest, running: config.version }, 'A new DoStotinka version is available');
        }
      } catch (err) {
        log.debug({ err }, 'Update check failed');
      }
    };
    timers.push(setInterval(updates, 24 * HOUR));
    timers.push(setTimeout(updates, 60_000));
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
