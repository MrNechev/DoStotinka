import { formatMoney as fm, getCurrency } from '@slavotax/shared';
import { format, isThisYear, isToday, isYesterday, parseISO } from 'date-fns';

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
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, isThisYear(d) ? 'EEEE, d MMMM' : 'EEE, d MMM yyyy');
}

export function shortDate(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy');
}

export function longDate(date: Date | string) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'd MMMM yyyy');
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
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${-days} days overdue`;
}

export function changeRatio(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}
