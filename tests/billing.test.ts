import { describe, expect, it } from 'vitest';
import {
  anchoredFourteenDayPeriod,
  monthlyPeriod,
  monthlyPeriodWithCutoff,
  semiMonthlyPeriod,
} from '@ja/billing-engine';
describe('billing cadences', () => {
  it('uses explicit 14-day anchor', () =>
    expect(anchoredFourteenDayPeriod('2026-08-17', '2026-08-03')).toEqual({
      start: '2026-08-17',
      end: '2026-08-30',
    }));
  it('handles dates before anchor', () =>
    expect(anchoredFourteenDayPeriod('2026-08-02', '2026-08-03')).toEqual({
      start: '2026-07-20',
      end: '2026-08-02',
    }));
  it('handles leap month and semi-month', () => {
    expect(monthlyPeriod('2028-02-20').end).toBe('2028-02-29');
    expect(semiMonthlyPeriod('2026-04-16')).toEqual({ start: '2026-04-16', end: '2026-04-30' });
  });
  it('supports recurring monthly cutoffs without invalid calendar dates', () => {
    expect(monthlyPeriodWithCutoff('2026-08-20', 25)).toEqual({
      start: '2026-07-26',
      end: '2026-08-25',
    });
    expect(monthlyPeriodWithCutoff('2026-08-26', 25)).toEqual({
      start: '2026-08-26',
      end: '2026-09-25',
    });
    expect(monthlyPeriodWithCutoff('2028-03-01', 28)).toEqual({
      start: '2028-02-29',
      end: '2028-03-28',
    });
  });
});
