import { randomBytes } from 'node:crypto';
import {
  addDays,
  type Bank,
  type BankAccountLink,
  type BankConnection,
  cleanPayee,
  toMinor,
} from '@dostotinka/shared';
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { Config } from '../config';
import type { Database } from '../db';
import {
  accounts,
  type BankAccountRow,
  type BankConnectionRow,
  bankAccounts,
  bankConnections,
  bankCredentials,
  type UserRow,
  users,
} from '../db/schema';
import { safeTimeZone, toLocalDate } from '../lib/dates';
import { badRequest, notFound } from '../lib/errors';
import { decrypt, encrypt, encryptionKey } from '../lib/secrets';
import {
  type EbAccount,
  EnableBankingClient,
  EnableBankingError,
  loadPrivateKey,
  pickBalance,
  remittanceText,
  transactionDate,
  transactionDirection,
  transactionKey,
} from './enable-banking';
import { addInboxItem } from './inbox';
import { sendReminder } from './reminders';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** PSD2 allows about four unattended fetches a day. */
export const SYNC_INTERVAL_MS = 6 * HOUR;
const MANUAL_SYNC_GAP_MS = 10 * 60_000;
const CONSENT_DAYS = 180;

export function toBankAccount(a: BankAccountRow): BankAccountLink {
  return {
    id: a.id,
    name: a.name,
    iban: a.iban,
    currency: a.currency,
    accountId: a.accountId,
    enabled: a.enabled,
    importFrom: a.importFrom,
    lastBookingDate: a.lastBookingDate,
    balance: a.balance,
    balanceAt: a.balanceAt?.toISOString() ?? null,
  };
}

export function toConnection(c: BankConnectionRow, accs: BankAccountRow[]): BankConnection {
  return {
    id: c.id,
    bankName: c.bankName,
    bankCountry: c.bankCountry,
    status: c.status as BankConnection['status'],
    validUntil: c.validUntil?.toISOString() ?? null,
    enabled: c.enabled,
    autoConfirm: c.autoConfirm,
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastError: c.lastError,
    accounts: accs
      .filter((a) => a.connectionId === c.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(toBankAccount),
    createdAt: c.createdAt.toISOString(),
  };
}

/** Where Enable Banking sends the user back after confirming at the bank. */
export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/bank-callback`;
}

function ebError(err: unknown): never {
  if (err instanceof EnableBankingError) {
    throw badRequest(`Enable Banking: ${err.message}`);
  }
  throw err;
}

// ───────────────────────────── Credentials ─────────────────────────────

export async function getClient(db: Database, config: Config, userId: string) {
  const [creds] = await db.select().from(bankCredentials).where(eq(bankCredentials.userId, userId));
  if (!creds) throw badRequest('Set up your Enable Banking application first');
  const key = await encryptionKey(db, config);
  const client = new EnableBankingClient(config.ENABLE_BANKING_API_URL, {
    applicationId: creds.applicationId,
    privateKey: loadPrivateKey(decrypt(creds.privateKey, key)),
  });
  return { client, creds };
}

/** Checks the application with Enable Banking and stores it (key encrypted). */
export async function saveCredentials(
  db: Database,
  config: Config,
  userId: string,
  input: { applicationId: string; privateKey: string },
  origin: string,
) {
  let privateKey: ReturnType<typeof loadPrivateKey>;
  try {
    privateKey = loadPrivateKey(input.privateKey);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
  const client = new EnableBankingClient(config.ENABLE_BANKING_API_URL, {
    applicationId: input.applicationId,
    privateKey,
  });
  const app = await client.application().catch(ebError);
  const own = callbackUrl(origin);
  const urls = app.redirect_urls ?? [];
  const redirectUrl = urls.includes(own)
    ? own
    : (urls.find((u) => u.startsWith('https://')) ?? urls[0]);
  if (!redirectUrl) {
    throw badRequest(
      'The application has no redirect URL. Add one in the Enable Banking control panel first.',
    );
  }
  const key = await encryptionKey(db, config);
  const values = {
    applicationId: input.applicationId,
    privateKey: encrypt(input.privateKey, key),
    environment: app.environment ?? null,
    redirectUrls: urls,
    redirectUrl,
  };
  await db
    .insert(bankCredentials)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: bankCredentials.userId, set: values });
  return { environment: app.environment, active: app.active, redirectUrl };
}

export async function deleteCredentials(db: Database, config: Config, userId: string) {
  const connections = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId));
  if (connections.length) {
    const { client } = await getClient(db, config, userId).catch(() => ({ client: null }));
    for (const c of connections) {
      if (client && c.sessionId) await client.deleteSession(c.sessionId).catch(() => undefined);
    }
    await db.delete(bankConnections).where(eq(bankConnections.userId, userId));
  }
  await db.delete(bankCredentials).where(eq(bankCredentials.userId, userId));
}

export async function listBanks(
  db: Database,
  config: Config,
  userId: string,
  country: string,
): Promise<Bank[]> {
  const { client } = await getClient(db, config, userId);
  const banks = await client.aspsps(country).catch(ebError);
  return banks
    .map((b) => ({
      name: b.name,
      country: b.country,
      logo: b.logo ?? null,
      maxConsentDays: b.maximum_consent_validity
        ? Math.floor(b.maximum_consent_validity / 86_400)
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ───────────────────────────── Connecting ─────────────────────────────

/** Starts the consent at the bank. Returns the URL the browser has to open. */
export async function startConnection(
  db: Database,
  config: Config,
  user: UserRow,
  input: { bankName: string; country: string; renewConnectionId?: string },
): Promise<{ url: string; connectionId: string; redirectUrl: string }> {
  const { client, creds } = await getClient(db, config, user.id);
  if (!creds.redirectUrl) throw badRequest('The application has no redirect URL');
  const banks = await client.aspsps(input.country).catch(ebError);
  const bank = banks.find((b) => b.name === input.bankName);
  if (!bank) throw badRequest('This bank is not available');
  const maxDays = bank.maximum_consent_validity
    ? bank.maximum_consent_validity / 86_400
    : CONSENT_DAYS;
  const days = Math.max(1, Math.min(CONSENT_DAYS, maxDays) - 0.05);
  const validUntil = new Date(Date.now() + days * DAY);
  const state = randomBytes(24).toString('base64url');

  let connectionId: string;
  if (input.renewConnectionId) {
    const existing = await getOwnedConnection(db, user.id, input.renewConnectionId);
    connectionId = existing.id;
    await db
      .update(bankConnections)
      .set({ authState: state, bankName: bank.name, bankCountry: bank.country })
      .where(eq(bankConnections.id, existing.id));
  } else {
    // Unfinished attempts are replaced.
    await db
      .delete(bankConnections)
      .where(
        and(
          eq(bankConnections.userId, user.id),
          eq(bankConnections.status, 'pending'),
          isNull(bankConnections.sessionId),
        ),
      );
    const [row] = await db
      .insert(bankConnections)
      .values({
        userId: user.id,
        bankName: bank.name,
        bankCountry: bank.country,
        status: 'pending',
        authState: state,
      })
      .returning();
    connectionId = row!.id;
  }
  const auth = await client
    .startAuth({
      bankName: bank.name,
      country: bank.country,
      validUntil,
      redirectUrl: creds.redirectUrl,
      state,
      language: user.language === 'bg' ? 'bg' : 'en',
    })
    .catch(ebError);
  return { url: auth.url, connectionId, redirectUrl: creds.redirectUrl };
}

const BRAND_HINTS: [RegExp, string][] = [
  [/\bdsk\b|дск/i, 'brand-dsk'],
  [/united bulgarian|\bubb\b|обб/i, 'brand-ubb'],
  [/revolut/i, 'brand-revolut'],
];

/** Pre-selects the DoStotinka account when exactly one has the bank's logo and currency. */
async function guessAccount(
  db: Database,
  userId: string,
  bankName: string,
  currency: string | null,
) {
  const icon = BRAND_HINTS.find(([re]) => re.test(bankName))?.[1];
  if (!icon || !currency) return null;
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.icon, icon),
        eq(accounts.currency, currency),
        eq(accounts.archived, false),
      ),
    );
  return rows.length === 1 ? rows[0]!.id : null;
}

function accountName(a: EbAccount): string | null {
  return a.details ?? a.product ?? a.name ?? null;
}

/** Finishes the consent with the code the bank sent back. */
export async function finishConnection(
  db: Database,
  config: Config,
  user: UserRow,
  input: { state: string; code?: string; error?: string; errorDescription?: string },
): Promise<BankConnection> {
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.userId, user.id), eq(bankConnections.authState, input.state)));
  if (!connection) throw notFound('Bank connection');
  if (input.error || !input.code) {
    const message =
      input.error === 'access_denied'
        ? 'The access was not granted at the bank.'
        : (input.errorDescription ?? input.error ?? 'The bank did not return an authorisation.');
    if (connection.sessionId) {
      await db
        .update(bankConnections)
        .set({ authState: null, lastError: message })
        .where(eq(bankConnections.id, connection.id));
    } else {
      await db.delete(bankConnections).where(eq(bankConnections.id, connection.id));
    }
    throw badRequest(message);
  }
  const { client } = await getClient(db, config, user.id);
  const session = await client.createSession(input.code).catch(ebError);

  const today = toLocalDate(new Date(), safeTimeZone(user.timezone));
  const existing = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.connectionId, connection.id));
  for (const acc of session.accounts) {
    if (!acc.uid) continue;
    const identity = acc.identification_hash ?? acc.account_id?.iban ?? acc.uid;
    const currency = acc.currency && acc.currency !== 'XXX' ? acc.currency : null;
    const known = existing.find((e) => e.identity === identity);
    if (known) {
      await db
        .update(bankAccounts)
        .set({
          uid: acc.uid,
          name: accountName(acc) ?? known.name,
          currency: currency ?? known.currency,
        })
        .where(eq(bankAccounts.id, known.id));
    } else {
      await db.insert(bankAccounts).values({
        connectionId: connection.id,
        userId: user.id,
        uid: acc.uid,
        identity,
        name: accountName(acc),
        iban: acc.account_id?.iban ?? acc.account_id?.other?.identification ?? null,
        currency,
        accountId: await guessAccount(db, user.id, connection.bankName, currency),
        importFrom: today,
      });
    }
  }
  if (connection.sessionId && connection.sessionId !== session.session_id) {
    await client.deleteSession(connection.sessionId).catch(() => undefined);
  }
  const noAccounts = session.accounts.filter((a) => a.uid).length === 0;
  const [updated] = await db
    .update(bankConnections)
    .set({
      status: 'active',
      sessionId: session.session_id,
      validUntil: new Date(session.access.valid_until),
      authState: null,
      lastError: noAccounts
        ? 'The bank shared no accounts. In the free (restricted) mode of Enable Banking only accounts linked in its control panel are available.'
        : null,
      retryAfter: null,
      expiryNotifiedAt: null,
    })
    .where(eq(bankConnections.id, connection.id))
    .returning();
  const accs = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.connectionId, connection.id));
  return toConnection(updated!, accs);
}

export async function getOwnedConnection(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)));
  if (!row) throw notFound('Bank connection');
  return row;
}

export async function deleteConnection(db: Database, config: Config, userId: string, id: string) {
  const connection = await getOwnedConnection(db, userId, id);
  if (connection.sessionId) {
    try {
      const { client } = await getClient(db, config, userId);
      await client.deleteSession(connection.sessionId);
    } catch {
      /* the consent may already be gone */
    }
  }
  await db.delete(bankConnections).where(eq(bankConnections.id, id));
}

// ───────────────────────────── Syncing ─────────────────────────────

export interface SyncResult {
  imported: number;
  duplicates: number;
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Fetches new booked transactions and balances of one connection into the inbox. */
export async function syncConnection(
  db: Database,
  config: Config,
  connectionId: string,
  opts: { manual?: boolean; now?: Date } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const [row] = await db
    .select({ connection: bankConnections, user: users })
    .from(bankConnections)
    .innerJoin(users, eq(users.id, bankConnections.userId))
    .where(eq(bankConnections.id, connectionId));
  if (!row) throw notFound('Bank connection');
  const { connection, user } = row;
  if (!user.importBank) throw badRequest('Bank import is switched off');
  if (connection.status !== 'active' || !connection.sessionId) {
    throw badRequest('Connect the bank again first');
  }
  if (connection.validUntil && connection.validUntil < now) {
    await db
      .update(bankConnections)
      .set({ status: 'expired', lastError: 'The access expired – confirm it at the bank again.' })
      .where(eq(bankConnections.id, connection.id));
    throw badRequest('The access to this bank expired – connect it again');
  }
  if (
    opts.manual &&
    connection.lastSyncAt &&
    now.getTime() - connection.lastSyncAt.getTime() < MANUAL_SYNC_GAP_MS
  ) {
    throw badRequest('Synced a moment ago – banks allow only a few updates per day');
  }

  const { client } = await getClient(db, config, user.id);
  const links = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.connectionId, connection.id),
        eq(bankAccounts.enabled, true),
        isNotNull(bankAccounts.accountId),
      ),
    );
  const today = toLocalDate(now, safeTimeZone(user.timezone));
  const result: SyncResult = { imported: 0, duplicates: 0 };
  try {
    for (const link of links) {
      const overlap = link.lastBookingDate ? addDays(link.lastBookingDate, -5) : link.importFrom;
      let dateFrom = maxDate(link.importFrom, overlap)!;
      const oldest = addDays(today, -89);
      if (dateFrom < oldest) dateFrom = oldest;
      if (dateFrom > today) continue;

      const transactions = await client.transactions(link.uid, dateFrom);
      const seen = new Map<string, number>();
      let lastDate = link.lastBookingDate;
      const [account] = await db
        .select({ currency: accounts.currency })
        .from(accounts)
        .where(eq(accounts.id, link.accountId!));
      for (const t of transactions) {
        // Pending, cancelled, held or rejected payments are left for later syncs.
        if (t.status && t.status !== 'BOOK') continue;
        const date = transactionDate(t);
        const dir = transactionDirection(t);
        if (!date || !dir || date < link.importFrom) continue;
        const currency = t.transaction_amount.currency || link.currency || account?.currency;
        if (!currency) continue;
        const amount = toMinor(Number(dir.amount), currency);
        if (!amount) continue;

        let key = transactionKey(t, link.identity ?? link.id);
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        if (n) key = `${key}#${n}`;

        const counterparty = dir.type === 'expense' ? t.creditor?.name : t.debtor?.name;
        const description = remittanceText(t);
        const added = await addInboxItem(
          db,
          user,
          {
            origin: 'bank',
            bankAccountId: link.id,
            accountId: link.accountId,
            type: dir.type,
            amount,
            currency,
            occurredAt: new Date(`${date}T12:00:00Z`),
            payee: cleanPayee(counterparty) ?? cleanPayee(description?.split(' · ')[0]),
            description,
            externalId: key,
          },
          { autoConfirm: connection.autoConfirm },
        );
        if (added.status === 'created' || added.status === 'confirmed') result.imported++;
        if (added.status === 'duplicate') result.duplicates++;
        if (t.booking_date) lastDate = maxDate(lastDate, t.booking_date.slice(0, 10));
      }

      let balance: number | null = link.balance;
      let balanceAt = link.balanceAt;
      try {
        const b = pickBalance(await client.balances(link.uid));
        if (b && /^-?\d+(\.\d+)?$/.test(b.amount)) {
          balance = toMinor(Number(b.amount), b.currency || link.currency || 'EUR');
          balanceAt = now;
        }
      } catch {
        /* some banks refuse balances – transactions still count */
      }
      await db
        .update(bankAccounts)
        .set({ lastBookingDate: lastDate, balance, balanceAt })
        .where(eq(bankAccounts.id, link.id));
    }
    await db
      .update(bankConnections)
      .set({ lastSyncAt: now, lastError: null, retryAfter: null })
      .where(eq(bankConnections.id, connection.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof EnableBankingError && err.sessionEnded) {
      await db
        .update(bankConnections)
        .set({ status: 'expired', lastError: message, lastSyncAt: now })
        .where(eq(bankConnections.id, connection.id));
    } else {
      const wait = err instanceof EnableBankingError && err.rateLimited ? 6 * HOUR : HOUR;
      await db
        .update(bankConnections)
        .set({ lastError: message, lastSyncAt: now, retryAfter: new Date(now.getTime() + wait) })
        .where(eq(bankConnections.id, connection.id));
    }
    if (err instanceof EnableBankingError) throw badRequest(`Enable Banking: ${message}`);
    throw err;
  }
  return result;
}

const EXPIRY_TEXTS = {
  en: {
    title: 'DoStotinka: bank access expires soon',
    line: (bank: string, date: string) =>
      `The access to ${bank} ends on ${date}. Open DoStotinka → Automatic import and choose “Renew” to keep importing transactions.`,
  },
  bg: {
    title: 'DoStotinka: достъпът до банката изтича скоро',
    line: (bank: string, date: string) =>
      `Достъпът до ${bank} изтича на ${date}. Отворете DoStotinka → Автоматичен импорт и изберете „Поднови“, за да продължи импортът.`,
  },
};

/** Background job: syncs due connections, marks expired ones and warns before consents end. */
export async function processBankSync(
  db: Database,
  config: Config,
  now = new Date(),
): Promise<{ synced: number; failed: number }> {
  const rows = await db
    .select({ connection: bankConnections, user: users })
    .from(bankConnections)
    .innerJoin(users, eq(users.id, bankConnections.userId))
    .where(and(eq(bankConnections.status, 'active'), eq(users.importBank, true)));
  let synced = 0;
  let failed = 0;
  for (const { connection, user } of rows) {
    if (connection.validUntil && connection.validUntil < now) {
      await db
        .update(bankConnections)
        .set({ status: 'expired', lastError: 'The access expired – confirm it at the bank again.' })
        .where(eq(bankConnections.id, connection.id));
      continue;
    }
    if (
      connection.validUntil &&
      connection.validUntil.getTime() - now.getTime() < 7 * DAY &&
      !connection.expiryNotifiedAt &&
      user.notifyUrl &&
      config.NOTIFICATIONS_ENABLED
    ) {
      const tx = user.language === 'bg' ? EXPIRY_TEXTS.bg : EXPIRY_TEXTS.en;
      const date = toLocalDate(connection.validUntil, safeTimeZone(user.timezone));
      try {
        await sendReminder(user.notifyUrl, user.notifyFormat as never, {
          title: tx.title,
          lines: [tx.line(connection.bankName, date)],
          count: 1,
        });
        await db
          .update(bankConnections)
          .set({ expiryNotifiedAt: now })
          .where(eq(bankConnections.id, connection.id));
      } catch {
        /* tried again on the next run */
      }
    }
    if (!connection.enabled) continue;
    if (connection.retryAfter && connection.retryAfter > now) continue;
    if (
      connection.lastSyncAt &&
      now.getTime() - connection.lastSyncAt.getTime() < SYNC_INTERVAL_MS
    ) {
      continue;
    }
    try {
      await syncConnection(db, config, connection.id, { now });
      synced++;
    } catch {
      failed++;
    }
  }
  // Consents that were started but never finished.
  await db
    .delete(bankConnections)
    .where(
      and(
        eq(bankConnections.status, 'pending'),
        isNull(bankConnections.sessionId),
        lt(bankConnections.createdAt, new Date(now.getTime() - DAY)),
      ),
    );
  return { synced, failed };
}

/** Accounts at the bank whose DoStotinka account was deleted stay unlinked. */
export async function listConnections(db: Database, userId: string): Promise<BankConnection[]> {
  const [conns, accs] = await Promise.all([
    db
      .select()
      .from(bankConnections)
      .where(
        and(
          eq(bankConnections.userId, userId),
          or(isNotNull(bankConnections.sessionId), eq(bankConnections.status, 'active')),
        ),
      )
      .orderBy(bankConnections.createdAt),
    db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)),
  ]);
  return conns.map((c) => toConnection(c, accs));
}
