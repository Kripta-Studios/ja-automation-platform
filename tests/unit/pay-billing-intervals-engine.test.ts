import { describe, expect, it } from 'vitest';
import { adjacentPeriodForCadence, nextPeriodForCadence } from '@ja/billing-engine';

describe('next period for a pay or billing interval', () => {
  it('starts after the last covered day', () => {
    expect(nextPeriodForCadence('monthly', '2026-11-25', { lastCoveredEnd: '2026-10-31' })).toEqual(
      { start: '2026-11-01', end: '2026-11-30' },
    );
    expect(
      nextPeriodForCadence('weekly', '2026-11-25', {
        lastCoveredEnd: '2026-11-15',
        firstOpenDate: '2026-11-12',
      }),
    ).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    // Covered ahead of today: the period after the covered one.
    expect(nextPeriodForCadence('weekly', '2026-11-25', { lastCoveredEnd: '2026-11-29' })).toEqual({
      start: '2026-11-30',
      end: '2026-12-06',
    });
    // Nothing open since the last covered week: the week in progress.
    expect(nextPeriodForCadence('weekly', '2026-11-25', { lastCoveredEnd: '2026-11-08' })).toEqual({
      start: '2026-11-23',
      end: '2026-11-29',
    });
  });
  it('uses the first open work when it is later than what was covered', () => {
    expect(
      nextPeriodForCadence('monthly', '2026-11-25', {
        lastCoveredEnd: '2026-08-31',
        firstOpenDate: '2026-10-04',
      }),
    ).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });
  it('falls back to the period in progress', () => {
    expect(nextPeriodForCadence('semi_monthly', '2026-11-25')).toEqual({
      start: '2026-11-16',
      end: '2026-11-30',
    });
    expect(nextPeriodForCadence('monthly', '2026-11-25', { monthlyCutoffDay: 25 })).toEqual({
      start: '2026-10-26',
      end: '2026-11-25',
    });
  });
  it('counts every 2 weeks from the anchor, or from the default Monday', () => {
    expect(nextPeriodForCadence('every_14_days', '2026-11-25')).toEqual({
      start: '2026-11-23',
      end: '2026-12-06',
    });
    expect(
      nextPeriodForCadence('every_14_days', '2026-11-25', { anchorDate: '2026-11-02' }),
    ).toEqual({ start: '2026-11-16', end: '2026-11-29' });
  });
  it('has no period for milestone or manual billing', () => {
    expect(nextPeriodForCadence('milestone', '2026-11-25')).toBeNull();
    expect(nextPeriodForCadence('manual', '2026-11-25')).toBeNull();
    expect(() => nextPeriodForCadence('manual', '2026-02-30')).toThrow();
  });
  it('moves to the previous and next period', () => {
    const november = { start: '2026-11-01', end: '2026-11-30' };
    expect(adjacentPeriodForCadence('monthly', november, -1)).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(adjacentPeriodForCadence('monthly', november, 1)).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    });
  });
});
