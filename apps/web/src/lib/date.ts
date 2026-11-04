import { format as dfFormat, formatDistanceToNow, parseISO } from 'date-fns';
import { dateLocale } from '@/i18n';

/** `date-fns` format using the UI language (month and weekday names). */
export function fmt(date: Date | number, pattern: string): string {
  return dfFormat(date, pattern, { locale: dateLocale });
}

/** Like `fmt` but with an upper-case first letter (month names are lower case in some languages). */
export function fmtCap(date: Date | number, pattern: string): string {
  const s = fmt(date, pattern);
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/** "3 minutes ago" in the UI language. */
export function ago(date: Date | string): string {
  return formatDistanceToNow(typeof date === 'string' ? parseISO(date) : date, {
    addSuffix: true,
    locale: dateLocale,
  });
}
