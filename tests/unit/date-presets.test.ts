import { describe, expect, it } from 'vitest';
import { datePresetRange } from '../../apps/portal/src/lib/portal/ui/date-presets';

describe('calendar date shortcuts', () => {
  it('uses Monday to Sunday, including Sunday and a year boundary', () => {
    expect(datePresetRange('week', new Date(2027, 0, 3, 23))).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
    expect(datePresetRange('week', new Date(2026, 8, 21))).toEqual({
      from: '2026-09-21',
      to: '2026-09-27',
    });
  });
  it('uses the actual last day of a month including leap years', () => {
    expect(datePresetRange('month', new Date(2028, 1, 29))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(datePresetRange('last-month', new Date(2028, 2, 31))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(datePresetRange('last-month', new Date(2027, 0, 31))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });
  it('keeps the user calendar day at midnight and through DST changes', () => {
    expect(datePresetRange('today', new Date(2026, 2, 29, 0, 1))).toEqual({
      from: '2026-03-29',
      to: '2026-03-29',
    });
    expect(datePresetRange('week', new Date(2026, 2, 29, 23))).toEqual({
      from: '2026-03-23',
      to: '2026-03-29',
    });
  });
});
