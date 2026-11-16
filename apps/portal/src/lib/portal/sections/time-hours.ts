import { personDisplayName } from '../display-name';
/**
 * Parse the hours a person types into the timesheet.
 * Accepted: "8", "7.5", "7,5", "7:30", "7h30", "7h", "0". Returns integer
 * minutes, null for an empty value, or undefined when the text is invalid or
 * above 24 h. Decimal hours are exact to the hundredth ("7.3" = 7 h 18 min).
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
  const decimal = /^(\d{1,2})(?:[.,](\d{1,2}))?$/u.exec(raw);
  if (!decimal) return undefined;
  const hundredths = Number(decimal[1]) * 100 + Number((decimal[2] ?? '').padEnd(2, '0'));
  if (hundredths > 2400) return undefined;
  return Math.round((hundredths * 3) / 5);
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
