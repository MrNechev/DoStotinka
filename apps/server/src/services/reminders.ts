import { addDays, formatMoney, type NotifyFormat } from '@slavotax/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../db';
import { accounts, plannedPayments, type UserRow, users } from '../db/schema';
import { safeTimeZone, toLocalDate } from '../lib/dates';
import { upcoming } from './planned';

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
    overdueTitle: (n: number) => `Slavotax: ${n} overdue ${n === 1 ? 'payment' : 'payments'}`,
    dueTitle: (n: number) => `Slavotax: ${n} ${n === 1 ? 'payment' : 'payments'} due soon`,
    testTitle: 'Slavotax test reminder',
    testLine: 'Reminders work. Nothing is due today or tomorrow.',
  },
  bg: {
    overdueSince: (d: string) => `просрочено от ${d}`,
    today: 'днес',
    tomorrow: 'утре',
    overdueTitle: (n: number) =>
      `Slavotax: ${n} ${n === 1 ? 'просрочено плащане' : 'просрочени плащания'}`,
    dueTitle: (n: number) =>
      `Slavotax: ${n} ${n === 1 ? 'предстоящо плащане' : 'предстоящи плащания'}`,
    testTitle: 'Slavotax: тестово напомняне',
    testLine: 'Напомнянията работят. Днес и утре няма плащания.',
  },
};
const texts = (language: string) => (language === 'bg' ? TEXTS.bg : TEXTS.en);

export function testReminder(language: string): ReminderMessage {
  const tx = texts(language);
  return { title: tx.testTitle, lines: [tx.testLine], count: 0 };
}

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
): Promise<ReminderMessage> {
  const tz = safeTimeZone(user.timezone);
  const today = toLocalDate(now, tz);
  const tomorrow = addDays(today, 1);
  const occurrences = (await upcoming(db, user, 2, tz)).filter((o) => o.dueDate <= tomorrow);
  if (!occurrences.length) return { title: 'Slavotax', lines: [], count: 0 };

  const plans = await db
    .select({ plan: plannedPayments, currency: accounts.currency })
    .from(plannedPayments)
    .innerJoin(accounts, eq(accounts.id, plannedPayments.accountId))
    .where(eq(plannedPayments.userId, user.id));
  const byId = new Map(plans.map((p) => [p.plan.id, p]));
  const locale =
    !user.locale || user.locale === 'en' || user.locale === 'auto' ? 'en-GB' : user.locale;

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

/** Sends the daily reminder to every user whose reminder hour has passed. */
export async function processReminders(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(users)
    .where(and(isNotNull(users.notifyUrl), eq(users.isDemo, false)));
  let sent = 0;
  for (const user of rows) {
    try {
      const tz = safeTimeZone(user.timezone);
      const today = toLocalDate(now, tz);
      if (user.lastNotifiedOn === today || localHour(now, tz) < user.notifyHour) continue;
      const message = await buildReminder(db, user, now);
      if (message.count > 0) {
        await sendReminder(user.notifyUrl!, user.notifyFormat as NotifyFormat, message);
        sent++;
      }
      await db.update(users).set({ lastNotifiedOn: today }).where(eq(users.id, user.id));
    } catch {
      // Try again on the next run; one failing endpoint must not block the others.
    }
  }
  return sent;
}
