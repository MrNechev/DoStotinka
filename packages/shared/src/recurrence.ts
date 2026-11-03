/**
 * Recurrence helpers for planned (scheduled) payments.
 * All dates are plain calendar dates in `YYYY-MM-DD` format (no time zone).
 */
export const FREQUENCIES = ['once', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface RecurrenceRule {
  frequency: Frequency;
  /** Repeat every N periods (e.g. every 2 weeks). Ignored for `once`. */
  interval: number;
  startDate: string;
  endDate?: string | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

function parse(date: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function fmt(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear().toString().padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date);
  return fmt(y, m, d + days);
}

/** Adds months keeping the given anchor day (clamped to the month length). */
export function addMonthsClamped(date: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parse(date);
  const total = y * 12 + m + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return fmt(ny, nm, day);
}

function diffDays(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m, pb.d) - Date.UTC(pa.y, pa.m, pa.d)) / 86_400_000);
}

/** Returns the n-th (0-based) occurrence of the rule, ignoring the end date. */
export function occurrenceAt(rule: RecurrenceRule, n: number): string {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const start = rule.startDate;
  switch (rule.frequency) {
    case 'once':
      return start;
    case 'daily':
      return addDays(start, n * interval);
    case 'weekly':
      return addDays(start, n * interval * 7);
    case 'monthly':
      return addMonthsClamped(start, n * interval, parse(start).d);
    case 'yearly':
      return addMonthsClamped(start, n * interval * 12, parse(start).d);
  }
}

function withinEnd(rule: RecurrenceRule, date: string): boolean {
  return !rule.endDate || date <= rule.endDate;
}

/**
 * Returns the first occurrence strictly after `date` (or on/after when `inclusive`),
 * or `null` when the schedule has ended.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  date: string,
  inclusive = false,
): string | null {
  const ok = (d: string) => (inclusive ? d >= date : d > date);
  if (rule.frequency === 'once') {
    return ok(rule.startDate) && withinEnd(rule, rule.startDate) ? rule.startDate : null;
  }
  if (ok(rule.startDate)) {
    return withinEnd(rule, rule.startDate) ? rule.startDate : null;
  }
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  // Estimate the index, then walk forward until we pass `date`.
  let n: number;
  const days = diffDays(rule.startDate, date);
  switch (rule.frequency) {
    case 'daily':
      n = Math.floor(days / interval);
      break;
    case 'weekly':
      n = Math.floor(days / (7 * interval));
      break;
    case 'monthly':
      n = Math.floor(days / (31 * interval));
      break;
    case 'yearly':
      n = Math.floor(days / (366 * interval));
      break;
  }
  n = Math.max(0, n - 1);
  for (let guard = 0; guard < 10_000; guard++, n++) {
    const occ = occurrenceAt(rule, n);
    if (ok(occ)) return withinEnd(rule, occ) ? occ : null;
  }
  return null;
}

/** Lists the occurrences in the inclusive range [from, to]. */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: string,
  to: string,
  limit = 1000,
): string[] {
  const result: string[] = [];
  let current = nextOccurrence(rule, from, true);
  while (current && current <= to && result.length < limit) {
    result.push(current);
    current = nextOccurrence(rule, current, false);
  }
  return result;
}

export function describeRecurrence(rule: Pick<RecurrenceRule, 'frequency' | 'interval'>): string {
  const n = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'once':
      return 'One-time';
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly':
      return n === 1 ? 'Every week' : `Every ${n} weeks`;
    case 'monthly':
      return n === 1 ? 'Every month' : n === 3 ? 'Every quarter' : `Every ${n} months`;
    case 'yearly':
      return n === 1 ? 'Every year' : `Every ${n} years`;
  }
}
