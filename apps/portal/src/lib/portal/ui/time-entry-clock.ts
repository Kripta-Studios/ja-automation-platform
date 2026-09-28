/** The form's current calendar day, in the user's local timezone (not UTC). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function intervalMinutes(start: string, end: string, pause = 0): number | null {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
  if (!clock.test(start) || !clock.test(end) || !Number.isInteger(pause) || pause < 0) return null;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const result = minutes(end) - minutes(start) - pause;
  return result > 0 ? result : null;
}

/** Convert a visible decimal-hour amount into the canonical whole minutes. */
export function durationMinutes(hours: string): number | null {
  const normalized = hours.trim().replace(',', '.');
  if (!/^(?:\d{1,2})(?:\.\d{1,4})?$/u.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 24) return null;
  return Math.round(value * 60);
}
