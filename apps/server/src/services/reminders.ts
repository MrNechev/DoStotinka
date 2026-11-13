import { addDays, formatMoney, type NotifyFormat, previousMonth } from '@dostotinka/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../db';
import { accounts, categories, plannedPayments, type UserRow, users } from '../db/schema';
import { safeTimeZone, toLocalDate } from '../lib/dates';
import { dataOwnerOf } from './household';
import { upcoming } from './planned';
import { monthlyReview, reviewMessage } from './review';

export interface ReminderMessage {
  title: string;
  lines: string[];
  count: number;
}

const TEXTS = {
  en: {
    overdueSince: (d: string) => `overdue since ${d}`,
    today: 'today',
    tomorrow: 'tomorrow',
    overdueTitle: (n: number) => `DoStotinka: ${n} overdue ${n === 1 ? 'payment' : 'payments'}`,
    dueTitle: (n: number) => `DoStotinka: ${n} ${n === 1 ? 'payment' : 'payments'} due soon`,
    testTitle: 'DoStotinka test reminder',
    testLine: 'Reminders work. Nothing is due today or tomorrow.',
  },
  bg: {
    overdueSince: (d: string) => `просрочено от ${d}`,
    today: 'днес',
    tomorrow: 'утре',
    overdueTitle: (n: number) =>
      `DoStotinka: ${n} ${n === 1 ? 'просрочено плащане' : 'просрочени плащания'}`,
    dueTitle: (n: number) =>
      `DoStotinka: ${n} ${n === 1 ? 'предстоящо плащане' : 'предстоящи плащания'}`,
    testTitle: 'DoStotinka: тестово напомняне',
    testLine: 'Напомнянията работят. Днес и утре няма плащания.',
  },
};
const texts = (language: string) => (language === 'bg' ? TEXTS.bg : TEXTS.en);

export function testReminder(language: string): ReminderMessage {
  const tx = texts(language);
  return { title: tx.testTitle, lines: [tx.testLine], count: 0 };
}

const localeOf = (user: UserRow) =>
  !user.locale || user.locale === 'en' || user.locale === 'auto' ? 'en-GB' : user.locale;

function localHour(now: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(
      now,
    ),
  );
}

/** Overdue payments and those due today or tomorrow, as a short text. */
export async function buildReminder(
  db: Database,
  user: UserRow,
  now = new Date(),
  /** Whose planned payments: the household owner for members. */
  dataUser: UserRow = user,
): Promise<ReminderMessage> {
  const tz = safeTimeZone(user.timezone);
  const today = toLocalDate(now, tz);
  const tomorrow = addDays(today, 1);
  const occurrences = (await upcoming(db, dataUser, 2, tz)).filter((o) => o.dueDate <= tomorrow);
  if (!occurrences.length) return { title: 'DoStotinka', lines: [], count: 0 };

  const plans = await db
    .select({ plan: plannedPayments, currency: accounts.currency })
    .from(plannedPayments)
    .innerJoin(accounts, eq(accounts.id, plannedPayments.accountId))
    .where(eq(plannedPayments.userId, dataUser.id));
  const byId = new Map(plans.map((p) => [p.plan.id, p]));
  const locale = localeOf(user);

  const lines: string[] = [];
  let overdue = 0;
  for (const o of occurrences) {
    const entry = byId.get(o.plannedPaymentId);
    if (!entry) continue;
    const { plan, currency } = entry;
    const sign = plan.type === 'expense' ? -1 : 1;
    const amount = formatMoney(sign * plan.amount, currency, {
      locale,
      signDisplay: plan.type === 'transfer' ? 'never' : 'exceptZero',
    });
    const tx = texts(user.language);
    const when =
      o.dueDate < today ? tx.overdueSince(o.dueDate) : o.dueDate === today ? tx.today : tx.tomorrow;
    if (o.dueDate < today) overdue++;
    lines.push(`${o.dueDate < today ? '⚠️' : '•'} ${plan.name}: ${amount} (${when})`);
  }
  const count = lines.length;
  const tx = texts(user.language);
  const title = overdue > 0 ? tx.overdueTitle(overdue) : tx.dueTitle(count);
  return { title, lines, count };
}

/** Delivers a message to ntfy, Gotify, Discord, Slack or a generic JSON webhook. */
export async function sendReminder(
  url: string,
  format: NotifyFormat,
  message: ReminderMessage,
): Promise<void> {
  const body = message.lines.join('\n');
  let init: RequestInit;
  switch (format) {
    case 'ntfy':
      init = {
        method: 'POST',
        headers: {
          // HTTP headers are ASCII: other characters are sent RFC 2047 encoded (supported by ntfy).
          Title: /^[\x20-\x7e]*$/.test(message.title)
            ? message.title
            : `=?UTF-8?B?${Buffer.from(message.title).toString('base64')}?=`,
          Tags: 'moneybag',
        },
        body,
      };
      break;
    case 'gotify':
      init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: message.title, message: body, priority: 5 }),
      };
      break;
    case 'discord':
      init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: `**${message.title}**\n${body}` }),
      };
      break;
    case 'slack':
      init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `*${message.title}*\n${body}` }),
      };
      break;
    default:
      init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: message.title, message: body, lines: message.lines }),
      };
  }
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`The reminder service answered with HTTP ${res.status}`);
}

/** The monthly review of `month` as a message (null when the month had no records). */
export async function buildReviewMessage(
  db: Database,
  user: UserRow,
  dataUser: UserRow,
  month: string,
  now = new Date(),
): Promise<ReminderMessage | null> {
  const tz = safeTimeZone(user.timezone);
  const review = await monthlyReview(db, dataUser, month, tz, now);
  const names = new Map(
    (
      await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, dataUser.id))
    ).map((c) => [c.id, c.name]),
  );
  const uncategorised = user.language === 'bg' ? 'Без категория' : 'Uncategorised';
  return reviewMessage(review, user.language, localeOf(user), (id) =>
    id ? (names.get(id) ?? uncategorised) : uncategorised,
  );
}

/**
 * Sends the daily reminder to every user whose reminder hour has passed – and, in the first days
 * of a month, the review of the month before to those who asked for it.
 */
export async function processReminders(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(users)
    .where(and(isNotNull(users.notifyUrl), eq(users.isDemo, false)));
  let sent = 0;
  for (const user of rows) {
    const tz = safeTimeZone(user.timezone);
    const today = toLocalDate(now, tz);
    if (localHour(now, tz) < user.notifyHour) continue;
    const dataUser = user.householdOwnerId ? await dataOwnerOf(db, user) : user;
    if (user.lastNotifiedOn !== today) {
      try {
        const message = await buildReminder(db, user, now, dataUser);
        if (message.count > 0) {
          await sendReminder(user.notifyUrl!, user.notifyFormat as NotifyFormat, message);
          sent++;
        }
        await db.update(users).set({ lastNotifiedOn: today }).where(eq(users.id, user.id));
      } catch {
        // Try again on the next run; one failing endpoint must not block the others.
      }
    }
    const month = previousMonth(today.slice(0, 7));
    if (
      user.notifyMonthlyReview &&
      user.lastReviewMonth !== month &&
      Number(today.slice(8, 10)) <= 3
    ) {
      try {
        const message = await buildReviewMessage(db, user, dataUser, month, now);
        if (message) {
          await sendReminder(user.notifyUrl!, user.notifyFormat as NotifyFormat, message);
          sent++;
        }
        await db.update(users).set({ lastReviewMonth: month }).where(eq(users.id, user.id));
      } catch {
        // Next run.
      }
    }
  }
  return sent;
}
