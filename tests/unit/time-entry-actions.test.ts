import { describe, expect, it } from 'vitest';
import {
  canDeleteTimeDraft,
  decimalHoursToMinutes,
  formatDecimalHours,
  monthCalendarDates,
  nextIsoDate,
  weekDates,
} from '../../apps/portal/src/lib/portal/sections/time-entry-actions.js';

describe('time entry form helpers', () => {
  it('advances saved work dates across month and year boundaries', () => {
    expect(nextIsoDate('2026-09-25')).toBe('2026-09-26');
    expect(nextIsoDate('2026-12-31')).toBe('2027-01-01');
    expect(() => nextIsoDate('2026-02-30')).toThrow('Invalid ISO date');
  });

  it('converts decimal hours to nearest whole minute', () => {
    expect(decimalHoursToMinutes('7.5')).toBe(450);
    expect(decimalHoursToMinutes('1.25')).toBe(75);
    expect(decimalHoursToMinutes('0.01')).toBe(1);
    expect(decimalHoursToMinutes('24.01')).toBeNull();
    expect(decimalHoursToMinutes('1.234')).toBeNull();
    expect(formatDecimalHours(90)).toBe('1.50h');
    expect(formatDecimalHours(1)).toBe('0.02h');
  });

  it('allows the owner to delete only never-submitted unlinked drafts', () => {
    expect(
      canDeleteTimeDraft(
        { worker_id: 'other-worker', approval_state: 'draft', correction_linked: 0 },
        'owner',
        true,
      ),
    ).toBe(true);
    expect(
      canDeleteTimeDraft(
        { worker_id: 'other-worker', approval_state: 'submitted', correction_linked: 0 },
        'owner',
        true,
      ),
    ).toBe(false);
    expect(
      canDeleteTimeDraft(
        { worker_id: 'other-worker', approval_state: 'draft', correction_linked: 1 },
        'owner',
        true,
      ),
    ).toBe(false);
  });

  it('uses stable seven-day weeks and Monday-first month calendar cells', () => {
    expect(weekDates('2026-09-21')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(monthCalendarDates('2026-09')[0]).toBe('2026-08-31');
    expect(monthCalendarDates('2026-09')).toHaveLength(42);
  });
});
