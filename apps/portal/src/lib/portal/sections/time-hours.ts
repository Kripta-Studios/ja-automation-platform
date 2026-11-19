import { personDisplayName } from '../display-name';
/**
 * Parse the hours a person types into the timesheet.
 * Accepted: "8", "7.5", "7,5", "7:30", "7h30", "7h", "0". Returns integer
 * minutes, null for an empty value, or undefined when the text is invalid or
 * above 24 h. Any whole minute is valid: "9:20", "9.33" and "9.3333" are all
 * 560 minutes; decimals are rounded to the nearest minute ("7.3" = 7 h 18 min).
 */
export function parseHoursText(value: unknown): number | null | undefined {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '');
  if (!raw) return null;
  const clock = /^(\d{1,2})(?::|h)([0-5]\d)?(?:m(?:in)?)?$/u.exec(raw);
  if (clock && (raw.includes(':') ? clock[2] !== undefined : true)) {
    const minutes = Number(clock[1]) * 60 + Number(clock[2] ?? 0);
    return minutes > 1440 ? undefined : minutes;
  }
  // Up to 4 decimals so a value the app itself showed or saved ("9.3333")
  // is always accepted again; any whole minute is valid (no quarter-hour rule).
  const decimal = /^(\d{1,2})(?:[.,](\d{1,4}))?$/u.exec(raw);
  if (!decimal) return undefined;
  const tenThousandths = Number(decimal[1]) * 10_000 + Number((decimal[2] ?? '').padEnd(4, '0'));
  if (tenThousandths > 240_000) return undefined;
  return Math.round((tenThousandths * 3) / 500);
}

/**
 * Hours as the person reads them on the capture screens: "8" for whole hours,
 * otherwise H:MM ("8:30", "7:05"). Same notation everywhere (input, totals,
 * confirmations) so 8 h 30 min never shows as "8.5" next to "8:30".
 */
export function clockHoursText(minutes: unknown): string {
  const value = Number(minutes);
  if (!Number.isSafeInteger(value)) return '—';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const h = Math.floor(absolute / 60);
  const m = absolute % 60;
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`;
}

/** "7 h 18 min" style text for a minute count (used to confirm what was typed). */
export function hoursAndMinutesText(minutes: number, unit = { h: 'h', min: 'min' }): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ${unit.h} ${m} ${unit.min}` : `${h} ${unit.h}`;
}

/** Today's ISO date in an IANA time zone (falls back to UTC). */
export function isoDateInZone(zone: string | undefined, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export const DAY_WARN_MINUTES = 12 * 60;
export const DAY_MAX_MINUTES = 24 * 60;

/** Show a login-style username ("gabriel.lamoglia") as a person's name. */
export function personName(value: unknown): string {
  return personDisplayName(value);
}

/** "7:00", "07:00", "7.00" or "700" -> canonical "07:00"; '' -> null; undefined = invalid. */
export function parseClockText(value: unknown): string | null | undefined {
  const raw = String(value ?? '').trim().replace(/[.h]/u, ':');
  if (!raw) return null;
  const match = /^(\d{1,2}):?([0-5]\d)$/u.exec(raw) ?? /^(\d{1,2})$/u.exec(raw);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Worked minutes for an optional start/end/break detail. An end at or before
 * the start is an overnight shift that ends the next day (kept on the start
 * date). Returns undefined when the times are invalid or the break is too long.
 */
export function shiftMinutes(
  start: string,
  end: string,
  breakMinutes: number,
): number | undefined {
  const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  const raw = toMinutes(end) - toMinutes(start);
  if (raw === 0) return undefined;
  const elapsed = raw > 0 ? raw : raw + 1440;
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes >= elapsed)
    return undefined;
  return elapsed - breakMinutes;
}

export type CellDetail = {
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  note: string;
};

/**
 * Validate the optional per-day detail sent with a week cell.
 * Returns the canonical detail plus the computed minutes when start/end are
 * given, or an error key. Never required: an absent detail is `null`.
 */
export function parseCellDetail(
  raw: unknown,
):
  | { ok: true; detail: CellDetail | null; minutes?: number }
  | { ok: false; error: 'clock' | 'pair' | 'break' | 'shift' } {
  if (raw === undefined || raw === null) return { ok: true, detail: null };
  if (typeof raw !== 'object') return { ok: false, error: 'clock' };
  const value = raw as Record<string, unknown>;
  const start = parseClockText(value.start);
  const end = parseClockText(value.end);
  if (start === undefined || end === undefined) return { ok: false, error: 'clock' };
  if ((start === null) !== (end === null)) return { ok: false, error: 'pair' };
  const breakText = String(value.breakMinutes ?? '').trim();
  const breakMinutes = breakText === '' ? 0 : Number(breakText);
  if (!/^\d{0,4}$/u.test(breakText) || breakMinutes > 1440) return { ok: false, error: 'break' };
  const note = String(value.note ?? '').trim().slice(0, 500);
  if (start === null || end === null)
    return { ok: true, detail: { startTime: null, endTime: null, breakMinutes: null, note } };
  const minutes = shiftMinutes(start, end, breakMinutes);
  if (minutes === undefined) return { ok: false, error: breakMinutes ? 'break' : 'shift' };
  return { ok: true, detail: { startTime: start, endTime: end, breakMinutes, note }, minutes };
}

/**
 * One-line supporting detail for a time entry ("13:00–23:00 · −40 min ·
 * Minus line support"), '' when the entry has none. Shared by the Hours
 * overview drill-down and available for invoice supporting detail.
 */
export function timeDetailText(row: {
  start_time?: unknown;
  end_time?: unknown;
  break_minutes?: unknown;
  activity_summary?: unknown;
  note?: unknown;
}): string {
  const parts: string[] = [];
  if (row.start_time && row.end_time) {
    parts.push(`${String(row.start_time)}–${String(row.end_time)}`);
    if (Number(row.break_minutes ?? 0) > 0) parts.push(`−${Number(row.break_minutes)} min`);
  }
  const note = String(row.note ?? row.activity_summary ?? '').trim();
  if (note) parts.push(note);
  return parts.join(' · ');
}
