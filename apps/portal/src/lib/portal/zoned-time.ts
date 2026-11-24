/**
 * Wall-clock times in a named time zone (D13/T31): planning and availability
 * are entered and shown in the project's (or the person's) time zone, and
 * stored as UTC instants. No external library: Intl gives the zone offset.
 */

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u;

function validZone(timeZone: string | undefined | null): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Offset of `timeZone` at `instant`, in minutes east of UTC. */
export function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const zone = validZone(timeZone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** "2026-11-24T08:00" typed in `timeZone` → "2026-11-24T14:00:00.000Z". */
export function zonedLocalToUtcIso(local: string, timeZone: string | undefined | null): string {
  const match = LOCAL.exec(local ?? '');
  if (!match) return '';
  const zone = validZone(timeZone);
  const wall = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  // Two passes settle the offset around daylight-saving changes.
  let instant = wall - zoneOffsetMinutes(zone, new Date(wall)) * 60000;
  instant = wall - zoneOffsetMinutes(zone, new Date(instant)) * 60000;
  return new Date(instant).toISOString();
}

/** A stored UTC instant → "2026-11-24T08:00" on the wall clock of `timeZone`. */
export function utcToZonedLocal(value: string, timeZone: string | undefined | null): string {
  const raw = String(value ?? '');
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/u.test(raw) ? `${raw}Z` : raw;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return raw.slice(0, 16);
  const shifted = new Date(instant.getTime() + zoneOffsetMinutes(validZone(timeZone), instant) * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** "America/Mexico_City (UTC−06:00)" for labels next to time inputs. */
export function zoneLabel(timeZone: string | undefined | null, at: Date = new Date()): string {
  const zone = validZone(timeZone);
  const offset = zoneOffsetMinutes(zone, at);
  const sign = offset < 0 ? '−' : '+';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${zone.replaceAll('_', ' ')} (UTC${sign}${hh}:${mm})`;
}
