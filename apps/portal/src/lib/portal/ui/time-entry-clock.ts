import { parseHoursText } from '../sections/time-hours';

/** The form's current calendar day, in the user's local timezone (not UTC). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Net minutes between start and end, less the break. An end earlier than the
 * start is an overnight shift that ends the next day (same rule as the server's
 * effective-entry check and the Time sheet); equal start and end is no shift.
 */
export function intervalMinutes(start: string, end: string, pause = 0): number | null {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
  if (!clock.test(start) || !clock.test(end) || !Number.isInteger(pause) || pause < 0) return null;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (minutes(end) === minutes(start)) return null;
  const elapsed = (minutes(end) - minutes(start) + 1440) % 1440;
  const result = elapsed - pause;
  return result > 0 ? result : null;
}

/** True when the interval ends on the next calendar day (overnight shift). */
export function endsNextDay(start: string, end: string): boolean {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
  return clock.test(start) && clock.test(end) && end < start;
}

/**
 * Convert visible hours into canonical whole minutes with the same any-minute
 * parser as the Time screen: "7.5", "7,5", "8:15", "7h30" (0–24 h). Null when
 * empty or invalid.
 */
export function durationMinutes(hours: string): number | null {
  const minutes = parseHoursText(hours);
  return minutes === undefined ? null : minutes;
}
