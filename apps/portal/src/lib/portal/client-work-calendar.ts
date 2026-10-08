export type ClientCalendarEntry = Readonly<{
  work_date: string;
  project_id: string;
  client_id: string;
  project_number: string;
  project_name: string;
  site_name: string | null;
  worker_id: string;
  worker_name: string;
  minutes: number;
  approval_state: string;
}>;

const DAY_MS = 86_400_000;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validCalendarMonth(value: string): boolean {
  const match = MONTH_PATTERN.exec(value);
  if (!match || Number(match[1]) < 1900) return false;
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 7) === value;
}

export function normalizeCalendarMonth(value: string | null | undefined, now = new Date()): string {
  if (value && validCalendarMonth(value)) return value;
  return now.toISOString().slice(0, 7);
}

/** The visible calendar is Monday-first and always has six complete weeks. */
export function clientCalendarWindow(month: string): { from: string; to: string } {
  if (!validCalendarMonth(month)) throw new RangeError('Invalid calendar month');
  const first = new Date(`${month}-01T00:00:00.000Z`);
  first.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(first.getTime() + 41 * DAY_MS);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export function clientCalendarMonthDays(month: string): Array<{ date: string; inMonth: boolean }> {
  if (!validCalendarMonth(month)) throw new RangeError('Invalid calendar month');
  const { from } = clientCalendarWindow(month);
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const first = new Date(`${from}T00:00:00.000Z`);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first.getTime() + index * DAY_MS);
    return {
      date: day.toISOString().slice(0, 10),
      inMonth: day.getUTCMonth() === monthIndex,
    };
  });
}

export type ClientCalendarWorkerGroup = Readonly<{
  id: string;
  name: string;
  minutes: number;
  approvalStates: readonly string[];
}>;

export type ClientCalendarProjectGroup = Readonly<{
  id: string;
  projectNumber: string;
  name: string;
  siteName: string | null;
  minutes: number;
  workers: readonly ClientCalendarWorkerGroup[];
}>;

export function groupClientCalendarEntries(
  entries: readonly ClientCalendarEntry[],
  date: string,
): ClientCalendarProjectGroup[] {
  if (!DATE_PATTERN.test(date)) return [];
  const projects = new Map<
    string,
    {
      projectNumber: string;
      name: string;
      siteName: string | null;
      minutes: number;
      workers: Map<string, { name: string; minutes: number; approvalStates: Set<string> }>;
    }
  >();
  for (const entry of entries) {
    const minutes = Number(entry.minutes);
    if (
      entry.work_date !== date ||
      !entry.project_id ||
      !entry.worker_id ||
      !Number.isSafeInteger(minutes) ||
      minutes <= 0 ||
      ['rejected', 'void'].includes(entry.approval_state)
    )
      continue;
    const project = projects.get(entry.project_id) ?? {
      projectNumber: entry.project_number,
      name: entry.project_name,
      siteName: entry.site_name,
      minutes: 0,
      workers: new Map(),
    };
    const worker = project.workers.get(entry.worker_id) ?? {
      name: entry.worker_name,
      minutes: 0,
      approvalStates: new Set<string>(),
    };
    worker.minutes += minutes;
    worker.approvalStates.add(entry.approval_state);
    project.minutes += minutes;
    project.workers.set(entry.worker_id, worker);
    projects.set(entry.project_id, project);
  }
  return [...projects.entries()]
    .map(([id, project]) => ({
      id,
      projectNumber: project.projectNumber,
      name: project.name,
      siteName: project.siteName,
      minutes: project.minutes,
      workers: [...project.workers.entries()]
        .map(([workerId, worker]) => ({
          id: workerId,
          name: worker.name,
          minutes: worker.minutes,
          approvalStates: [...worker.approvalStates].sort(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort(
      (left, right) =>
        left.projectNumber.localeCompare(right.projectNumber) ||
        left.name.localeCompare(right.name),
    );
}

export function calendarMinutesForDate(
  entries: readonly ClientCalendarEntry[],
  date: string,
): number {
  return groupClientCalendarEntries(entries, date).reduce(
    (total, project) => total + project.minutes,
    0,
  );
}

export function formatCalendarHours(minutes: number, locale = 'en-US'): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60)} h`;
}
