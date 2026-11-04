import { describe, expect, it } from 'vitest';
import { periodFromParams, resolvePeriod } from './period';

const now = new Date(2026, 10, 4, 15, 30); // 4 Nov 2026, local time

describe('resolvePeriod', () => {
  it('covers records dated in the future for "All time"', () => {
    const r = resolvePeriod(
      { preset: 'all', offset: 0 },
      { now, firstRecord: '2025-03-10T08:00:00.000Z', lastRecord: '2026-11-20T08:00:00.000Z' },
    );
    expect(r.from).toEqual(new Date(2025, 2, 1));
    expect(r.to).toEqual(new Date(2026, 10, 21));
  });

  it('ends "All time" tomorrow when there is nothing in the future', () => {
    const r = resolvePeriod(
      { preset: 'all', offset: 0 },
      { now, firstRecord: '2025-03-10T08:00:00.000Z', lastRecord: '2026-11-01T08:00:00.000Z' },
    );
    expect(r.to).toEqual(new Date(2026, 10, 5));
  });

  it('falls back to the default range for invalid custom dates', () => {
    const r = resolvePeriod({ preset: 'custom', offset: 0, from: '2024-02-30', to: 'x' }, { now });
    expect(r.from).toEqual(new Date(2026, 9, 6));
    expect(r.to).toEqual(new Date(2026, 10, 5));
    expect(() => r.from.toISOString()).not.toThrow();
  });
});

describe('periodFromParams', () => {
  it('drops malformed values from the URL', () => {
    const state = periodFromParams(
      new URLSearchParams('period=custom&from=2024-02-30&to=2024-03-05&offset=abc'),
      { preset: '30d', offset: 0 },
    );
    expect(state).toEqual({ preset: 'custom', offset: 0, from: undefined, to: '2024-03-05' });
  });

  it('uses the fallback for unknown presets', () => {
    const fallback = { preset: '30d' as const, offset: 0 };
    expect(periodFromParams(new URLSearchParams('period=decade'), fallback)).toBe(fallback);
  });
});
