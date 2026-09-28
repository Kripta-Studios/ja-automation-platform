export type PlanningEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  href?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
};

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function calendarInstant(value: string): Date {
  // Older operational rows may omit a timezone; calendar timestamps remain UTC.
  return new Date(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value,
  );
}

/** Calendar days are UTC, independent of the browser's timezone or DST. */
export function calendarDate(value: string | Date): string {
  const date = typeof value === 'string' ? calendarInstant(value) : value;
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid calendar date');
  const result = date.toISOString().slice(0, 10);
  if (typeof value === 'string' && DATE_ONLY.test(value) && result !== value)
    throw new RangeError('Invalid calendar date');
  return result;
}

export function shiftCalendarMonth(date: string, amount: number): string {
  const current = new Date(`${calendarDate(date)}T00:00:00Z`);
  const day = current.getUTCDate();
  current.setUTCDate(1);
  current.setUTCMonth(current.getUTCMonth() + amount);
  const lastDay = new Date(current);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  current.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return calendarDate(current);
}

/** Six Monday-first weeks keep controls stable when navigating months. */
export function calendarMonthDays(date: string): { date: string; inMonth: boolean }[] {
  const first = new Date(`${calendarDate(date)}T00:00:00Z`);
  first.setUTCDate(1);
  const month = first.getUTCMonth();
  first.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first.getTime() + index * DAY_MS);
    return { date: calendarDate(day), inMonth: day.getUTCMonth() === month };
  });
}

/** Timestamp intervals have exclusive ends; date-only ends include that day.
 * Missing ends represent a single event on its start's UTC day. Invalid or
 * reversed intervals never appear, and events spanning midnight overlap both
 * days only when their exclusive end is later than midnight.
 */
export function eventOccursOnDate(event: PlanningEvent, date: string): boolean {
  try {
    const day = new Date(`${calendarDate(date)}T00:00:00Z`).getTime();
    calendarDate(event.startsAt);
    const start = calendarInstant(event.startsAt).getTime();
    if (!event.endsAt) return start >= day && start < day + DAY_MS;
    calendarDate(event.endsAt);
    const end =
      calendarInstant(event.endsAt).getTime() + (DATE_ONLY.test(event.endsAt) ? DAY_MS : 0);
    return end > start && start < day + DAY_MS && end > day;
  } catch {
    return false;
  }
}

export function eventsOnCalendarDate(events: PlanningEvent[], date: string): PlanningEvent[] {
  return events
    .filter((event) => eventOccursOnDate(event, date))
    .sort(
      (a, b) =>
        calendarInstant(a.startsAt).getTime() - calendarInstant(b.startsAt).getTime() ||
        a.title.localeCompare(b.title),
    );
}
