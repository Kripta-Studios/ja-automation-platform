import { describe, expect, it } from 'vitest';
import {
  calendarDate,
  calendarMonthDays,
  eventOccursOnDate,
  eventsOnCalendarDate,
  shiftCalendarMonth,
  type PlanningEvent,
} from '../apps/portal/src/lib/portal/calendar';

const event = (startsAt: string, endsAt?: string): PlanningEvent => ({
  id: 'event',
  title: 'Availability',
  startsAt,
  endsAt,
});

describe('UTC planning calendar', () => {
  it('builds a Monday-first leap-year grid spanning adjacent months', () => {
    const days = calendarMonthDays('2024-02-15');
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual({ date: '2024-01-29', inMonth: false });
    expect(days.filter((day) => day.inMonth)).toHaveLength(29);
    expect(days.at(-1)).toEqual({ date: '2024-03-10', inMonth: false });
    expect(new Set(days.map((day) => day.date)).size).toBe(42);
  });

  it('clamps month-end navigation and crosses year boundaries', () => {
    expect(shiftCalendarMonth('2024-01-31', 1)).toBe('2024-02-29');
    expect(shiftCalendarMonth('2025-01-31', 1)).toBe('2025-02-28');
    expect(shiftCalendarMonth('2026-12-31', 1)).toBe('2027-01-31');
    expect(shiftCalendarMonth('2026-01-31', -1)).toBe('2025-12-31');
  });

  it('includes both endpoint days for date-only ranges', () => {
    const range = event('2026-09-18', '2026-09-20');
    expect(
      ['2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21'].map((day) =>
        eventOccursOnDate(range, day),
      ),
    ).toEqual([false, true, true, false]);
    expect(eventOccursOnDate(event('2026-09-18', '2026-09-18'), '2026-09-18')).toBe(true);
  });

  it('excludes exact-midnight timestamp ends and includes actual midnight overlap', () => {
    expect(
      eventOccursOnDate(event('2026-09-18T08:00:00Z', '2026-09-19T00:00:00Z'), '2026-09-19'),
    ).toBe(false);
    expect(
      eventOccursOnDate(event('2026-09-18T08:00:00Z', '2026-09-19T00:00:01Z'), '2026-09-19'),
    ).toBe(true);
  });

  it('uses UTC boundaries across timezone offsets and DST changes', () => {
    expect(calendarDate('2026-03-29T00:30:00+02:00')).toBe('2026-03-28');
    expect(eventOccursOnDate(event('2026-03-29T00:30:00+02:00'), '2026-03-28')).toBe(true);
    expect(eventOccursOnDate(event('2026-03-29T00:30:00+02:00'), '2026-03-29')).toBe(false);
    expect(calendarDate('2026-03-29T23:30:00')).toBe('2026-03-29');
    expect(eventOccursOnDate(event('2026-03-29T23:30:00'), '2026-03-30')).toBe(false);
  });

  it('omits invalid, reversed and empty timestamp intervals', () => {
    for (const item of [
      event('invalid'),
      event('2026-02-30'),
      event('2026-09-20', '2026-09-18'),
      event('2026-09-18T08:00:00Z', '2026-09-18T08:00:00Z'),
    ]) {
      expect(eventOccursOnDate(item, '2026-09-18')).toBe(false);
    }
    expect(() => calendarDate('2026-02-30')).toThrow(RangeError);
  });

  it('returns only overlapping events without mutating inputs', () => {
    const rows = [
      { ...event('2026-09-18T18:00:00Z'), id: 'late' },
      { ...event('2026-09-19'), id: 'tomorrow' },
      { ...event('2026-09-18T08:00:00Z'), id: 'early' },
    ];
    expect(eventsOnCalendarDate(rows, '2026-09-18').map((row) => row.id)).toEqual([
      'early',
      'late',
    ]);
    expect(rows.map((row) => row.id)).toEqual(['late', 'tomorrow', 'early']);
  });

  it('orders timestamp events by actual instant across different timezone offsets', () => {
    const rows = [
      { ...event('2026-09-18T08:00:00-04:00'), id: 'later' },
      { ...event('2026-09-18T09:00:00Z'), id: 'earlier' },
    ];
    expect(eventsOnCalendarDate(rows, '2026-09-18').map((row) => row.id)).toEqual([
      'earlier',
      'later',
    ]);
  });
});
