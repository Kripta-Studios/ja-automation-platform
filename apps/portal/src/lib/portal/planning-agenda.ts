import type { PortalRow } from './portal-data';

export type AgendaAssignment = { row: PortalRow; startsAt: number; endsAt: number };

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u.exec(
    value,
  );
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return null;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Planning controls and the existing calendar use UTC; do not reinterpret their dates. */
export function planningAgenda(rows: readonly PortalRow[], now: Date = new Date()) {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!Number.isFinite(dayStart)) throw new RangeError('A valid agenda date is required');
  const dayEnd = dayStart + 86_400_000;
  const today: AgendaAssignment[] = [];
  const upcoming: AgendaAssignment[] = [];
  let invalidCount = 0;
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const startsAt = timestamp(row.starts_at);
    const endsAt = timestamp(row.ends_at);
    if (startsAt === null || endsAt === null || endsAt <= startsAt) {
      invalidCount += 1;
      continue;
    }
    const assignment = { row, startsAt, endsAt };
    if (endsAt > dayStart && startsAt < dayEnd) today.push(assignment);
    else if (startsAt >= dayEnd) upcoming.push(assignment);
  }
  const chronological = (a: AgendaAssignment, b: AgendaAssignment) =>
    a.startsAt - b.startsAt ||
    a.endsAt - b.endsAt ||
    String(a.row.id).localeCompare(String(b.row.id));
  return { today: today.sort(chronological), upcoming: upcoming.sort(chronological), invalidCount };
}

export function planningInterval(assignment: AgendaAssignment, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  });
  const startDay = new Date(assignment.startsAt).toISOString().slice(0, 10);
  const endDay = new Date(assignment.endsAt).toISOString().slice(0, 10);
  const start = `${date.format(assignment.startsAt)} · ${time.format(assignment.startsAt)}`;
  const end =
    startDay === endDay
      ? time.format(assignment.endsAt)
      : `${date.format(assignment.endsAt)} · ${time.format(assignment.endsAt)}`;
  return `${start} – ${end} UTC`;
}
