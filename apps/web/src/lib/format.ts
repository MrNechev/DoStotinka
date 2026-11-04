import { formatMoney as fm, getCurrency } from '@dostotinka/shared';
import { format, isThisYear, isToday, isYesterday, parseISO } from 'date-fns';
import { t, tn } from '@/i18n';
import { fmt, fmtCap } from './date';

let currentLocale: string | undefined;

/** Sets the locale used for number formatting ('auto'/'en' = browser default). */
export function setNumberLocale(locale: string | undefined) {
  currentLocale = !locale || locale === 'auto' || locale === 'en' ? undefined : locale;
}

export function money(
  minor: number,
  currency: string,
  opts: { sign?: 'auto' | 'always' | 'exceptZero' | 'never'; compact?: boolean } = {},
) {
  return fm(minor, currency, {
    locale: currentLocale,
    signDisplay: opts.sign,
    compact: opts.compact,
  });
}

/** Compact axis label like "€1.2K". */
export function moneyAxis(minor: number, currency: string) {
  const value = minor / 10 ** getCurrency(currency).decimals;
  try {
    return new Intl.NumberFormat(currentLocale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${Math.round(value)}`;
  }
}

export function percent(value: number, digits = 0) {
  return new Intl.NumberFormat(currentLocale, {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(value);
}

export function numberFmt(value: number, digits = 2) {
  return new Intl.NumberFormat(currentLocale, { maximumFractionDigits: digits }).format(value);
}

/** "Today", "Yesterday", "Mon, 3 Nov" or "Mon, 3 Nov 2025". */
export function dayLabel(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isToday(d)) return t('Today');
  if (isYesterday(d)) return t('Yesterday');
  return fmtCap(d, isThisYear(d) ? 'EEEE, d MMMM' : 'EEE, d MMM yyyy');
}

export function shortDate(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return fmt(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy');
}

export function longDate(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return fmt(d, 'd MMMM yyyy');
}

export function timeLabel(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm');
}

/** Relative description of a due date: "in 3 days", "today", "2 days overdue". */
export function dueLabel(dueDate: string, today = format(new Date(), 'yyyy-MM-dd')) {
  const a = parseISO(today).getTime();
  const b = parseISO(dueDate).getTime();
  const days = Math.round((b - a) / 86_400_000);
  if (days === 0) return t('Due today');
  if (days === 1) return t('Due tomorrow');
  if (days > 1) return tn(days, 'Due in {n} day', 'Due in {n} days');
  if (days === -1) return t('1 day overdue');
  return tn(-days, '{n} day overdue', '{n} days overdue');
}

export function changeRatio(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

/** "1 record", "3 records" – translated via the `{n} …` dictionary keys. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return tn(n, `{n} ${singular}`, `{n} ${pluralForm}`);
}

/** "Every month", "Every 2 weeks" … in the UI language. */
export function recurrenceLabel(rule: { frequency: string; interval: number }) {
  const n = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'once':
      return t('One-time');
    case 'daily':
      return n === 1 ? t('Every day') : t('Every {n} days', { n });
    case 'weekly':
      return n === 1 ? t('Every week') : t('Every {n} weeks', { n });
    case 'monthly':
      return n === 1
        ? t('Every month')
        : n === 3
          ? t('Every quarter')
          : t('Every {n} months', { n });
    default:
      return n === 1 ? t('Every year') : t('Every {n} years', { n });
  }
}
