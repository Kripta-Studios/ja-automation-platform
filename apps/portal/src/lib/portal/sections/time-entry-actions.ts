type TimeDeleteRow = Readonly<{
  worker_id?: unknown;
  approval_state?: unknown;
  correction_linked?: unknown;
}>;

/**
 * A SQLite EXISTS projection is numeric (0/1), while browser-provided data
 * may also preserve it as a boolean or string. A linked correction draft is
 * immutable history and must never receive a destructive affordance.
 */
export function canDeleteTimeDraft(
  row: TimeDeleteRow,
  currentUserId: string,
  isOwner = false,
): boolean {
  return (
    (String(row.worker_id) === currentUserId || isOwner) &&
    String(row.approval_state) === 'draft' &&
    Number(row.correction_linked ?? 0) !== 1
  );
}

export function nextIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('Invalid ISO date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Invalid ISO date');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Convert a decimal hour input without binary floating-point drift. */
export function decimalHoursToMinutes(value: string): number | null {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/u.exec(value.trim());
  if (!match) return null;
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (hundredths <= 0 || hundredths > 2400) return null;
  return Math.round((hundredths * 3) / 5);
}

export function formatDecimalHours(minutes: unknown): string {
  const value = Number(minutes ?? 0);
  if (!Number.isFinite(value)) return '—';
  return `${(Math.round((value * 100) / 60) / 100).toFixed(2)}h`;
}

export function weekDates(weekStart: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(weekStart)) return [];
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return [];
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function monthCalendarDates(month: string): string[] {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) return [];
  const first = new Date(`${month}-01T00:00:00.000Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
