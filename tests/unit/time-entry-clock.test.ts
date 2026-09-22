import { describe, expect, it } from 'vitest';
import { intervalMinutes, localToday } from '../../apps/portal/src/lib/portal/ui/time-entry-clock';

describe('time entry calendar and clock', () => {
  it('uses local calendar fields, including month/year boundaries', () => {
    expect(localToday(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('calculates net actual minutes without guessing overnight shifts', () => {
    expect(intervalMinutes('09:00', '13:00', 15)).toBe(225);
    expect(intervalMinutes('00:00', '00:01')).toBe(1);
    for (const [start, end, pause] of [
      ['23:00', '01:00', 0],
      ['09:00', '09:00', 0],
      ['24:00', '25:00', 0],
      ['09:00', '10:00', 60],
      ['09:00', '10:00', -1],
      ['09:00', '10:00', 0.5],
    ] as const)
      expect(intervalMinutes(start, end, pause)).toBeNull();
  });
});
