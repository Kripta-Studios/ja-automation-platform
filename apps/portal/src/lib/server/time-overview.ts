/**
 * Hours overview (review) built on the server: the browser receives totals,
 * the top rows/columns and one page of drill-down entries, never the whole
 * period. Input rows come from the already authorized `listTimeForScope`
 * result, so nothing here widens what a role can see. Operational fields only
 * (no money).
 */
import { DAY_WARN_MINUTES, personName } from '$lib/portal/sections/time-hours';
import { mondayOf } from './portal-week';
import { isRealIsoDate } from './iso-date';

import type {
  OverviewBucket,
  OverviewEntry,
  OverviewLine,
  OverviewStatus,
  TimeOverviewData,
  TimeOverviewGroup,
} from '$lib/portal/time-overview-types';
import { OTHER_KEY, OTHERS_ROW } from '$lib/portal/time-overview-types';
export { OTHER_KEY, OTHERS_ROW };

export type { TimeOverviewData } from '$lib/portal/time-overview-types';

export const OVERVIEW_ROWS = 15;
export const OVERVIEW_COLUMNS = 10;
export const OVERVIEW_PAGE = 25;



const statusOf = (state: unknown): OverviewStatus => {
  const value = String(state);
  if (value === 'approved' || value === 'locked') return 'approved';
  if (value === 'submitted') return 'submitted';
  if (value === 'needs_changes') return 'needs_changes';
  return 'draft';
};
const emptyBucket = (): OverviewBucket => ({
  minutes: 0,
  entries: 0,
  by: { draft: 0, submitted: 0, approved: 0, needs_changes: 0 },
});
const add = (bucket: OverviewBucket, entry: OverviewEntry) => {
  bucket.minutes += entry.minutes;
  bucket.entries += 1;
  bucket.by[statusOf(entry.approval_state)] += entry.minutes;
};
const fold = (target: OverviewBucket, source: OverviewBucket) => {
  target.minutes += source.minutes;
  target.entries += source.entries;
  for (const key of Object.keys(source.by) as OverviewStatus[]) target.by[key] += source.by[key];
};

/** Accent- and case-insensitive text for search. */
export const foldText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase();

const shift = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Period window from the URL (`period`, `from`, `to`). */
export function overviewPeriod(
  params: URLSearchParams,
  today = new Date().toISOString().slice(0, 10),
): { period: string; from: string; to: string } {
  const thisMonday = mondayOf(today);
  const requested = params.get('period') ?? 'this_week';
  const period = ['this_week', 'last_week', 'this_month', 'last_month', 'custom'].includes(requested)
    ? requested
    : 'this_week';
  let from = thisMonday;
  let to = shift(thisMonday, 6);
  if (period === 'last_week') {
    from = shift(thisMonday, -7);
    to = shift(thisMonday, -1);
  } else if (period === 'this_month') {
    from = `${today.slice(0, 7)}-01`;
    to = shift(`${shift(`${today.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  } else if (period === 'last_month') {
    const lastMonthEnd = shift(`${today.slice(0, 7)}-01`, -1);
    from = `${lastMonthEnd.slice(0, 7)}-01`;
    to = lastMonthEnd;
  } else if (period === 'custom') {
    const f = params.get('from') ?? '';
    const tt = params.get('to') ?? '';
    if (isRealIsoDate(f)) from = f;
    if (isRealIsoDate(tt) && tt >= from) to = tt;
    else to = from > to ? from : to;
  }
  return { period, from, to };
}

export type OverviewFilters = { workerId: string; status: string; find: string };

export function overviewFilters(params: URLSearchParams): OverviewFilters {
  return {
    workerId: params.get('rworker')?.trim() || '',
    status: params.get('status')?.trim() || '',
    find: (params.get('find') ?? '').trim().slice(0, 100),
  };
}

/** Rows that count in the overview, projected to operational fields. */
export function overviewEntries(
  rows: ReadonlyArray<Record<string, unknown>>,
  filters: OverviewFilters,
): { entries: OverviewEntry[]; workers: Array<[string, string]> } {
  const needle = foldText(filters.find);
  const workers = new Map<string, string>();
  const entries: OverviewEntry[] = [];
  for (const row of rows) {
    if (['void', 'rejected'].includes(String(row.approval_state))) continue;
    // A returned entry superseded by its correction counts once, as the correction.
    if (row.active_correction_id) continue;
    const workerName = personName(row.worker_name ?? row.worker_id ?? '');
    workers.set(String(row.worker_id), workerName);
    if (filters.workerId && String(row.worker_id) !== filters.workerId) continue;
    if (
      filters.status &&
      String(row.approval_state) !== filters.status &&
      !(filters.status === 'approved' && String(row.approval_state) === 'locked')
    )
      continue;
    if (
      needle &&
      ![workerName, row.project_number, row.project_name].some((value) =>
        foldText(value).includes(needle),
      )
    )
      continue;
    entries.push({
      id: String(row.id),
      worker_id: String(row.worker_id),
      worker_name: workerName,
      project_id: String(row.project_id),
      project_number: String(row.project_number ?? ''),
      project_name: String(row.project_name ?? ''),
      work_date: String(row.work_date),
      category: String(row.category ?? ''),
      minutes: Number(row.minutes ?? 0),
      approval_state: String(row.approval_state),
    });
  }
  return {
    entries,
    workers: [...workers.entries()].sort((x, y) => x[1].localeCompare(y[1])),
  };
}

const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
const projectLabel = (entry: OverviewEntry) =>
  [entry.project_number, entry.project_name].filter(Boolean).join(' · ');

export function buildTimeOverview(input: {
  entries: OverviewEntry[];
  workers: Array<[string, string]>;
  period: { period: string; from: string; to: string };
  filters: OverviewFilters;
  params: URLSearchParams;
  today?: string;
}): TimeOverviewData {
  const { entries, period, filters, params } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let d = period.from; d <= period.to && dates.length < 400; d = shift(d, 1)) dates.push(d);
  const requestedGroup = params.get('group');
  const group: TimeOverviewGroup =
    requestedGroup === 'project' ? 'project' : requestedGroup === 'day' && dates.length <= 42 ? 'day' : 'worker';
  const show = Math.min(
    500,
    Math.max(OVERVIEW_ROWS, Math.ceil((Number(params.get('show')) || OVERVIEW_ROWS) / OVERVIEW_ROWS) * OVERVIEW_ROWS),
  );

  const byWorker = group !== 'project';
  const keyA = (e: OverviewEntry) => (byWorker ? e.worker_id : e.project_id);
  const keyB = (e: OverviewEntry) => (group === 'day' ? e.work_date : byWorker ? e.project_id : e.worker_id);
  const labelA = (e: OverviewEntry) => (byWorker ? e.worker_name : projectLabel(e));
  const labelB = (e: OverviewEntry) => (group === 'day' ? e.work_date : byWorker ? projectLabel(e) : e.worker_name);

  const total = emptyBucket();
  const aTotals = new Map<string, OverviewLine>();
  const bTotals = new Map<string, OverviewLine>();
  const perDay = new Map<string, number>();
  for (const entry of entries) {
    add(total, entry);
    const a = keyA(entry);
    const b = keyB(entry);
    if (!aTotals.has(a)) aTotals.set(a, { key: a, label: labelA(entry), bucket: emptyBucket() });
    if (!bTotals.has(b)) bTotals.set(b, { key: b, label: labelB(entry), bucket: emptyBucket() });
    add(aTotals.get(a)!.bucket, entry);
    add(bTotals.get(b)!.bucket, entry);
    const dayKey = `${entry.worker_id}|${entry.work_date}`;
    perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + entry.minutes);
  }
  const byHours = (x: OverviewLine, y: OverviewLine) =>
    y.bucket.minutes - x.bucket.minutes || x.label.localeCompare(y.label);
  const allRows = [...aTotals.values()].sort(byHours);
  const rows = allRows.slice(0, show);
  const shownRows = new Set(rows.map((row) => row.key));
  let columns: OverviewLine[];
  if (group === 'day') {
    columns = dates.map(
      (date) => bTotals.get(date) ?? { key: date, label: date, bucket: emptyBucket() },
    );
  } else {
    columns = [...bTotals.values()].sort(byHours).slice(0, OVERVIEW_COLUMNS);
  }
  const shownColumns = new Set(columns.map((column) => column.key));
  const hiddenColumns = [...bTotals.values()].filter((column) => !shownColumns.has(column.key));
  let otherColumn: TimeOverviewData['otherColumn'] = null;
  if (hiddenColumns.length) {
    const bucket = emptyBucket();
    for (const column of hiddenColumns) fold(bucket, column.bucket);
    otherColumn = { count: hiddenColumns.length, bucket };
  }
  let others: TimeOverviewData['others'] = null;
  if (allRows.length > rows.length) {
    const bucket = emptyBucket();
    for (const row of allRows.slice(show)) fold(bucket, row.bucket);
    others = { count: allRows.length - rows.length, bucket };
  }
  const columnOf = (entry: OverviewEntry) =>
    shownColumns.has(keyB(entry)) ? keyB(entry) : OTHER_KEY;
  const cells: Record<string, OverviewBucket> = {};
  for (const entry of entries) {
    const a = keyA(entry);
    if (!shownRows.has(a)) continue;
    const key = `${a}|${columnOf(entry)}`;
    add((cells[key] ??= emptyBucket()), entry);
  }

  let over12 = 0;
  let weekend = 0;
  let missing = 0;
  const activeWorkers = new Set<string>();
  for (const [key, minutes] of perDay) {
    const [worker, date] = key.split('|') as [string, string];
    activeWorkers.add(worker);
    if (minutes > DAY_WARN_MINUTES) over12 += 1;
    if (minutes > 0 && isWeekend(date)) weekend += 1;
  }
  for (const worker of activeWorkers)
    for (const date of dates)
      if (date <= today && !isWeekend(date) && !perDay.get(`${worker}|${date}`)) missing += 1;

  // Drill-down: one page of entries for the selected cell, row or column.
  let drill: TimeOverviewData['drill'] = null;
  const cell = params.get('cell') ?? '';
  const separator = cell.indexOf('|');
  if (separator > 0) {
    const a = cell.slice(0, separator);
    const b = cell.slice(separator + 1);
    const matchA = (entry: OverviewEntry) =>
      a === '*' || (a === OTHERS_ROW ? !shownRows.has(keyA(entry)) : keyA(entry) === a);
    const matchB = (entry: OverviewEntry) =>
      b === '*' || (b === OTHER_KEY ? !shownColumns.has(keyB(entry)) : keyB(entry) === b);
    const matching = entries
      .filter((entry) => matchA(entry) && matchB(entry))
      .sort(
        (x, y) =>
          x.work_date.localeCompare(y.work_date) ||
          x.worker_name.localeCompare(y.worker_name) ||
          x.id.localeCompare(y.id),
      );
    if (matching.length) {
      const pages = Math.max(1, Math.ceil(matching.length / OVERVIEW_PAGE));
      const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get('cpage')) || 1)));
      const bucket = emptyBucket();
      for (const entry of matching) add(bucket, entry);
      const workerIds = new Set(matching.map((entry) => entry.worker_id));
      drill = {
        a,
        b,
        bucket,
        page,
        pageSize: OVERVIEW_PAGE,
        count: matching.length,
        entries: matching.slice((page - 1) * OVERVIEW_PAGE, page * OVERVIEW_PAGE),
        workerId: workerIds.size === 1 ? [...workerIds][0]! : '',
        firstDate: matching[0]!.work_date,
        hasSubmitted: matching.some((entry) => entry.approval_state === 'submitted'),
      };
    }
  }

  return {
    ...period,
    ...filters,
    group,
    show,
    total,
    rowCount: allRows.length,
    rows,
    others,
    columns,
    otherColumn,
    cells,
    anomalies: { over12, weekend, missing },
    workers: input.workers,
    drill,
  };
}

/** All filtered entries (export), sorted by date then worker. */
export function sortedOverviewEntries(entries: OverviewEntry[]): OverviewEntry[] {
  return [...entries].sort(
    (x, y) => x.work_date.localeCompare(y.work_date) || x.worker_name.localeCompare(y.worker_name),
  );
}
