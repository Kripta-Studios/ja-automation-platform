import { describe, expect, it } from 'vitest';
import { timesheetWeekday } from '../../apps/portal/src/lib/portal/timesheet-weekday';

describe('weekly time localized calendar-day captions', () => {
  it.each([
    ['en', 'Mon'],
    ['es', 'lun'],
    ['pt', 'seg.'],
  ] as const)('shows Monday in %s for the unchanged ISO date', (locale, expected) => {
    expect(timesheetWeekday('2026-09-28', locale)).toBe(expected);
  });

  it('localizes year and leap-day boundaries without shifting the UTC calendar day', () => {
    expect(timesheetWeekday('2026-01-01', 'es')).toBe('jue');
    expect(timesheetWeekday('2024-02-29', 'pt')).toBe('qui.');
  });

  it.each(['', 'not-a-date', '2026-02-29', '2026-02-30', '2026-13-01', '2026-09-28T23:00:00Z'])(
    'does not invent a weekday for invalid date %s',
    (date) => {
      expect(timesheetWeekday(date, 'es')).toBe('—');
    },
  );
});
