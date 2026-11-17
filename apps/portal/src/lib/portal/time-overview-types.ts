/** Server-built Hours overview payload (see lib/server/time-overview.ts). */
export type OverviewStatus = 'draft' | 'submitted' | 'approved' | 'needs_changes';
export type OverviewBucket = {
  minutes: number;
  entries: number;
  by: Record<OverviewStatus, number>;
};
export type OverviewLine = { key: string; label: string; bucket: OverviewBucket };
export type OverviewEntry = {
  id: string;
  worker_id: string;
  worker_name: string;
  project_id: string;
  project_number: string;
  project_name: string;
  work_date: string;
  category: string;
  minutes: number;
  approval_state: string;
  /** Optional per-day detail (shown in the drill-down when present). */
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number | null;
  note?: string;
};
export type OverviewSheet = {
  id: string;
  projectId: string;
  workerId: string;
  weekStart: string;
  filename: string;
};
export type TimeOverviewGroup = 'worker' | 'project' | 'day';
export type TimeOverviewData = {
  period: string;
  from: string;
  to: string;
  workerId: string;
  status: string;
  find: string;
  group: TimeOverviewGroup;
  show: number;
  total: OverviewBucket;
  rowCount: number;
  rows: OverviewLine[];
  others: { count: number; bucket: OverviewBucket } | null;
  columns: OverviewLine[];
  otherColumn: { count: number; bucket: OverviewBucket } | null;
  /** `${rowKey}|${columnKey}`; the "Other" column uses columnKey `~other`. */
  cells: Record<string, OverviewBucket>;
  anomalies: { over12: number; weekend: number; missing: number };
  workers: Array<[string, string]>;
  drill: {
    a: string;
    b: string;
    bucket: OverviewBucket;
    page: number;
    pageSize: number;
    count: number;
    entries: OverviewEntry[];
    workerId: string;
    firstDate: string;
    hasSubmitted: boolean;
    /** Signed activity sheets for the worker/project weeks on this page. */
    sheets?: OverviewSheet[];
  } | null;
};


/** Keys used by the overview for the aggregated "Other" column and "Others" row. */
export const OTHER_KEY = '~other';
export const OTHERS_ROW = '~others';
