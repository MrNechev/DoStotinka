import type { Interval } from '@dostotinka/shared';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfDay,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { t } from '@/i18n';
import { fmt, fmtCap } from './date';

export const PERIOD_PRESETS = [
  { id: '7d', label: t('Last 7 days'), short: '7D' },
  { id: '30d', label: t('Last 30 days'), short: '30D' },
  { id: '12w', label: t('Last 12 weeks'), short: '12W' },
  { id: '6m', label: t('Last 6 months'), short: '6M' },
  { id: '1y', label: t('Last 12 months'), short: '1Y' },
  { id: 'week', label: t('Week'), short: 'Week' },
  { id: 'month', label: t('Month'), short: 'Month' },
  { id: 'year', label: t('Year'), short: 'Year' },
  { id: 'all', label: t('All time'), short: 'All' },
  { id: 'custom', label: t('Custom range'), short: 'Custom' },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['id'];

export interface PeriodState {
  preset: PeriodPreset;
  /** For calendar presets (week/month/year): 0 = current, -1 = previous … */
  offset: number;
  /** Custom range (inclusive), YYYY-MM-DD. */
  from?: string;
  to?: string;
}

export interface ResolvedPeriod {
  from: Date;
  /** Exclusive end. */
  to: Date;
  label: string;
  interval: Interval;
  days: number;
  navigable: boolean;
}

export function autoInterval(days: number): Interval {
  if (days <= 35) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

/** Parses a `YYYY-MM-DD` day; undefined for anything else (e.g. a hand-edited URL). */
function parseDay(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = parseISO(value);
  return isValid(d) && format(d, 'yyyy-MM-dd') === value ? d : undefined;
}

export function resolvePeriod(
  state: PeriodState,
  opts: {
    weekStartsOn?: 0 | 1 | 6;
    firstRecord?: string | null;
    /** Date of the newest record – "All time" also covers records dated in the future. */
    lastRecord?: string | null;
    now?: Date;
  } = {},
): ResolvedPeriod {
  const now = opts.now ?? new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekStartsOn = opts.weekStartsOn ?? 1;
  let from: Date;
  let to: Date = tomorrow;
  let label: string;
  let navigable = false;

  switch (state.preset) {
    case '7d':
      from = subDays(today, 6);
      label = t('Last 7 days');
      break;
    case '30d':
      from = subDays(today, 29);
      label = t('Last 30 days');
      break;
    case '12w':
      from = subWeeks(startOfWeek(today, { weekStartsOn }), 11);
      label = t('Last 12 weeks');
      break;
    case '6m':
      from = subMonths(startOfMonth(today), 5);
      label = t('Last 6 months');
      break;
    case '1y':
      from = subMonths(startOfMonth(today), 11);
      label = t('Last 12 months');
      break;
    case 'week': {
      from = addWeeks(startOfWeek(today, { weekStartsOn }), state.offset);
      to = addWeeks(from, 1);
      const end = subDays(to, 1);
      label =
        state.offset === 0
          ? t('This week')
          : state.offset === -1
            ? t('Last week')
            : `${fmt(from, 'd MMM')} – ${fmt(end, from.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy')}`;
      navigable = true;
      break;
    }
    case 'month':
      from = addMonths(startOfMonth(today), state.offset);
      to = addMonths(from, 1);
      label = fmtCap(from, from.getFullYear() === now.getFullYear() ? 'MMMM' : 'MMMM yyyy');
      navigable = true;
      break;
    case 'year':
      from = addYears(startOfYear(today), state.offset);
      to = addYears(from, 1);
      label = format(from, 'yyyy');
      navigable = true;
      break;
    case 'all': {
      const first = opts.firstRecord ? parseISO(opts.firstRecord) : null;
      const last = opts.lastRecord ? parseISO(opts.lastRecord) : null;
      from = first && isValid(first) ? startOfMonth(first) : subMonths(startOfMonth(today), 11);
      if (last && isValid(last) && last >= tomorrow) to = addDays(startOfDay(last), 1);
      label = t('All time');
      break;
    }
    case 'custom': {
      const customFrom = parseDay(state.from);
      const customTo = parseDay(state.to);
      from = customFrom ? startOfDay(customFrom) : subDays(today, 29);
      to = customTo ? addDays(startOfDay(customTo), 1) : tomorrow;
      if (to <= from) to = addDays(from, 1);
      const last = subDays(to, 1);
      const sameYear = from.getFullYear() === last.getFullYear();
      label =
        differenceInCalendarDays(last, from) === 0
          ? fmtCap(from, 'EEE, d MMM yyyy')
          : `${fmt(from, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${fmt(last, 'd MMM yyyy')}`;
      break;
    }
  }
  const days = Math.max(1, differenceInCalendarDays(to, from));
  return { from, to, label, interval: autoInterval(days), days, navigable };
}

export function periodToParams(state: PeriodState): Record<string, string> {
  const p: Record<string, string> = { period: state.preset };
  if (state.offset) p.offset = String(state.offset);
  if (state.preset === 'custom') {
    if (state.from) p.from = state.from;
    if (state.to) p.to = state.to;
  }
  return p;
}

export function periodFromParams(params: URLSearchParams, fallback: PeriodState): PeriodState {
  const preset = params.get('period') as PeriodPreset | null;
  if (!preset || !PERIOD_PRESETS.some((p) => p.id === preset)) return fallback;
  const offset = Number(params.get('offset') ?? 0);
  return {
    preset,
    offset: Number.isInteger(offset) && Math.abs(offset) < 1000 ? offset : 0,
    from: parseDay(params.get('from') ?? undefined) ? params.get('from')! : undefined,
    to: parseDay(params.get('to') ?? undefined) ? params.get('to')! : undefined,
  };
}

export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');

/** Label for a chart bucket. */
export function bucketLabel(date: string, interval: Interval, long = false): string {
  const d = parseISO(date);
  if (interval === 'month') return fmtCap(d, long ? 'MMMM yyyy' : "MMM ''yy");
  if (interval === 'week')
    return long ? t('Week of {date}', { date: fmt(d, 'd MMM yyyy') }) : fmt(d, 'd MMM');
  return fmtCap(d, long ? 'EEE, d MMM yyyy' : 'd MMM');
}

/**
 * The period to compare with. Calendar periods compare with the previous week/month/year –
 * while a period is still running only the same elapsed part ("month to date").
 * Rolling periods (last 30 days …) use the server default: the same length right before.
 */
export function comparisonRange(
  state: PeriodState,
  resolved: ResolvedPeriod,
  now = new Date(),
): { compareFrom: string; compareTo: string } | undefined {
  const shift =
    state.preset === 'week'
      ? (d: Date) => addWeeks(d, -1)
      : state.preset === 'month'
        ? (d: Date) => addMonths(d, -1)
        : state.preset === 'year'
          ? (d: Date) => addYears(d, -1)
          : null;
  if (!shift) return undefined;
  // Rounded to the hour so the query key stays stable between renders.
  const hour = startOfHour(now);
  const ongoing = resolved.to > hour && resolved.from <= hour;
  return {
    compareFrom: shift(resolved.from).toISOString(),
    compareTo: shift(ongoing ? hour : resolved.to).toISOString(),
  };
}

export { endOfDay };
