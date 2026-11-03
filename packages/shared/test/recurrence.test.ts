import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  isIsoDate,
  nextOccurrence,
  occurrencesBetween,
  type RecurrenceRule,
} from '../src/recurrence';

describe('isIsoDate', () => {
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('20260101')).toBe(false);
  });
});

describe('addMonthsClamped', () => {
  it('clamps to the end of shorter months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-03-15', -3)).toBe('2025-12-15');
  });
});

describe('nextOccurrence', () => {
  const monthly: RecurrenceRule = { frequency: 'monthly', interval: 1, startDate: '2026-01-31' };

  it('keeps the anchor day for monthly schedules', () => {
    expect(nextOccurrence(monthly, '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence(monthly, '2026-02-28')).toBe('2026-03-31');
    expect(nextOccurrence(monthly, '2026-03-31')).toBe('2026-04-30');
  });

  it('returns the start date when it is in the future', () => {
    expect(nextOccurrence(monthly, '2025-06-01')).toBe('2026-01-31');
  });

  it('respects inclusive lookups', () => {
    expect(nextOccurrence(monthly, '2026-03-31', true)).toBe('2026-03-31');
  });

  it('stops after the end date', () => {
    const rule: RecurrenceRule = { ...monthly, endDate: '2026-03-15' };
    expect(nextOccurrence(rule, '2026-02-28')).toBeNull();
  });

  it('handles one-time payments', () => {
    const once: RecurrenceRule = { frequency: 'once', interval: 1, startDate: '2026-05-01' };
    expect(nextOccurrence(once, '2026-04-30')).toBe('2026-05-01');
    expect(nextOccurrence(once, '2026-05-01')).toBeNull();
  });

  it('handles weekly and daily intervals', () => {
    const weekly: RecurrenceRule = { frequency: 'weekly', interval: 2, startDate: '2026-01-05' };
    expect(nextOccurrence(weekly, '2026-01-05')).toBe('2026-01-19');
    expect(nextOccurrence(weekly, '2026-03-01')).toBe('2026-03-02');
    const daily: RecurrenceRule = { frequency: 'daily', interval: 3, startDate: '2026-01-01' };
    expect(nextOccurrence(daily, '2026-01-02')).toBe('2026-01-04');
  });

  it('handles leap years for yearly schedules', () => {
    const yearly: RecurrenceRule = { frequency: 'yearly', interval: 1, startDate: '2028-02-29' };
    expect(nextOccurrence(yearly, '2028-02-29')).toBe('2029-02-28');
    expect(nextOccurrence(yearly, '2031-06-01')).toBe('2032-02-29');
  });
});

describe('occurrencesBetween', () => {
  it('lists every occurrence inside the range', () => {
    const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, startDate: '2026-01-10' };
    expect(occurrencesBetween(rule, '2026-02-01', '2026-05-10')).toEqual([
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
      '2026-05-10',
    ]);
  });
});
