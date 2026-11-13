import {
  appLabel,
  type CreatedNotificationSource,
  cleanPayee,
  type IngestResult,
  type NotificationApp,
  type NotificationIngest,
  type NotificationSource,
  parseLooseAmount,
  parseNotification,
  toMinor,
} from '@dostotinka/shared';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db';
import {
  accounts,
  inboxItems,
  type NotificationAppRow,
  type NotificationSourceRow,
  notificationApps,
  notificationSources,
  type UserRow,
  users,
} from '../db/schema';
import { generateToken, sha256 } from '../lib/crypto';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { addInboxItem } from './inbox';

export function toSource(s: NotificationSourceRow): NotificationSource {
  return {
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    autoConfirm: s.autoConfirm,
    lastReceivedAt: s.lastReceivedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toApp(a: NotificationAppRow): NotificationApp {
  return {
    id: a.id,
    app: a.app,
    label: appLabel(a.app),
    accountId: a.accountId,
    enabled: a.enabled,
    lastSeenAt: a.lastSeenAt.toISOString(),
  };
}

/** Phone tokens start with a prefix so they are recognisable (and never valid as API tokens). */
const TOKEN_PREFIX = 'dsn_';

export async function createSource(
  db: Database,
  userId: string,
  name: string,
): Promise<CreatedNotificationSource> {
  const token = `${TOKEN_PREFIX}${generateToken()}`;
  const [row] = await db
    .insert(notificationSources)
    .values({ userId, name, tokenHash: sha256(token) })
    .returning();
  return { ...toSource(row!), token };
}

function parseTime(value: string | number | undefined, now: Date): Date {
  if (value === undefined || value === '') return now;
  let d: Date;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    d = new Date(value);
  }
  // Clocks of phones can be off – never accept times far in the future or very old ones.
  if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + 10 * 60_000) return now;
  if (d.getTime() < now.getTime() - 30 * 86_400_000) return now;
  return d;
}

/** Finds the user and source of a phone token. */
export async function authenticateSource(
  db: Database,
  token: string | null,
): Promise<{ source: NotificationSourceRow; user: UserRow }> {
  if (!token?.startsWith(TOKEN_PREFIX)) throw unauthorized();
  const [row] = await db
    .select({ source: notificationSources, user: users })
    .from(notificationSources)
    .innerJoin(users, eq(users.id, notificationSources.userId))
    .where(eq(notificationSources.tokenHash, sha256(token)));
  if (!row) throw unauthorized();
  return row;
}

/**
 * Receives one notification from a phone automation and turns it into an inbox item.
 * Notifications that are not a transaction are kept for a while as "ignored" so the user can see
 * what arrived (helps when setting up an automation).
 */
export async function ingestNotification(
  db: Database,
  source: NotificationSourceRow,
  user: UserRow,
  body: NotificationIngest,
  now = new Date(),
): Promise<IngestResult> {
  if (!user.importNotifications) {
    throw forbidden('Importing phone notifications is switched off in DoStotinka');
  }
  if (!source.enabled) throw forbidden('This phone is paused in DoStotinka');
  await db
    .update(notificationSources)
    .set({ lastReceivedAt: now })
    .where(eq(notificationSources.id, source.id));

  const app = (body.app?.trim() || 'unknown').slice(0, 200);
  const [rule] = await db
    .insert(notificationApps)
    .values({ userId: user.id, app, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [notificationApps.userId, notificationApps.app],
      set: { lastSeenAt: now },
    })
    .returning();
  if (!rule!.enabled) return { status: 'ignored' };

  const occurredAt = parseTime(body.time, now);
  const title = body.title?.trim() ?? '';
  const text = body.text?.trim() ?? '';

  // Structured data (iOS Shortcuts, own scripts) wins over parsing the text.
  let parsed: {
    type: 'expense' | 'income';
    amount: string;
    currency: string | null;
    payee: string | null;
  } | null = null;
  if (body.amount !== undefined && body.amount !== '') {
    const loose = parseLooseAmount(body.amount);
    if (loose) {
      parsed = {
        type: body.type ?? (loose.sign === '+' ? 'income' : 'expense'),
        amount: loose.amount,
        currency: body.currency?.toUpperCase() ?? loose.currency,
        payee: cleanPayee(body.merchant ?? title) ?? null,
      };
    }
  } else {
    parsed = parseNotification({ app, title, text });
    if (parsed && body.type) parsed.type = body.type;
    if (parsed && body.currency && !parsed.currency) parsed.currency = body.currency.toUpperCase();
    if (parsed && body.merchant) parsed.payee = cleanPayee(body.merchant) ?? parsed.payee;
  }

  // The same notification can be posted twice (retries, notification updates).
  const minute = Math.floor(occurredAt.getTime() / 60_000);
  const externalId = sha256(
    JSON.stringify([app, title, text, body.amount ?? null, body.merchant ?? null, minute]),
  );
  // Many apps repeat the title at the start of the text – show it only once.
  const description =
    (title && text.toLowerCase().startsWith(title.toLowerCase())
      ? text
      : [title, text].filter(Boolean).join(' – ')
    ).slice(0, 1000) || null;

  if (!parsed) {
    await db
      .insert(inboxItems)
      .values({
        userId: user.id,
        origin: 'notification',
        notificationSourceId: source.id,
        app,
        accountId: rule!.accountId,
        type: 'expense',
        amount: null,
        currency: null,
        occurredAt,
        description,
        externalId,
        status: 'ignored',
      })
      .onConflictDoNothing();
    return { status: 'ignored' };
  }

  let account = null;
  if (rule!.accountId) {
    [account] = await db
      .select({ id: accounts.id, currency: accounts.currency })
      .from(accounts)
      .where(and(eq(accounts.id, rule!.accountId), eq(accounts.userId, user.id)));
  }
  const currency = parsed.currency ?? account?.currency ?? user.baseCurrency;
  const amount = toMinor(Number(parsed.amount), currency);
  if (!Number.isFinite(amount) || amount <= 0) return { status: 'ignored' };

  const result = await addInboxItem(
    db,
    user,
    {
      origin: 'notification',
      notificationSourceId: source.id,
      app,
      accountId: account?.id ?? null,
      type: parsed.type,
      amount,
      currency,
      occurredAt,
      payee: parsed.payee,
      description,
      externalId,
    },
    { autoConfirm: source.autoConfirm },
  );
  if (result.status === 'exists') return { status: 'duplicate' };
  return { status: result.status, itemId: result.item.id };
}

export async function getOwnedSource(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(notificationSources)
    .where(and(eq(notificationSources.id, id), eq(notificationSources.userId, userId)));
  if (!row) throw notFound('Phone');
  return row;
}
