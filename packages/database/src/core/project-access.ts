import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { AccessDeniedError } from '../repository.ts';
import { assertLiveSession } from './authorization.ts';

type RecordDates =
  | 'current'
  | 'daily'
  | 'technical'
  | 'planning'
  | 'notification'
  | 'object'
  | 'time'
  | 'expense';
const occurrenceDates: Readonly<Record<RecordDates, readonly string[]>> = {
  current: [],
  daily: ['d.work_date'],
  technical: ['t.report_date'],
  time: ['t.work_date'],
  expense: ['e.spent_on'],
  planning: ['date(pa.starts_at)', 'date(COALESCE(pa.ends_at,pa.starts_at))'],
  notification: ['COALESCE((SELECT record_date FROM notification_source),scope_day.local_today)'],
  object: ['COALESCE((SELECT object_date FROM requested_project_object),scope_day.local_today)'],
};

export type WorkerOperationalProjectScope = Readonly<{
  withClause: string;
  predicate: string;
  parameters: readonly string[];
  withParameters: readonly string[];
  predicateParameters: readonly string[];
}>;

/** Internal query predicate for the fixed project alias `p`, before ORDER/LIMIT.
 * Current membership and supplier authority use one captured instant, converted
 * independently in each project timezone. It never falls back to a UTC date.
 */
export function workerOperationalProjectScope(
  sqlite: DatabaseSync,
  principal: Principal,
  recordDates: RecordDates = 'current',
  instant = new Date(),
): WorkerOperationalProjectScope {
  if (principal.role !== 'worker' || !Number.isFinite(instant.valueOf()))
    throw new AccessDeniedError('Current worker project access required');
  assertLiveSession(sqlite, principal, AccessDeniedError, instant.valueOf());
  const actor = sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(principal.userId) as
    | { role: string; status: string }
    | undefined;
  if (!actor || actor.role !== 'worker' || actor.status !== 'active')
    throw new AccessDeniedError('Active account required');
  if (!Object.hasOwn(occurrenceDates, recordDates))
    throw new AccessDeniedError('Current worker project access required');
  const timezones = sqlite
    .prepare(
      `SELECT DISTINCT p.timezone FROM project p
       JOIN project_member pm ON pm.project_id=p.id
       WHERE pm.user_id=? AND pm.status='active'
         AND p.status IN ('active','planned','paused')`,
    )
    .all(principal.userId) as Array<{ timezone: string }>;
  const days: Array<readonly [string, string]> = [];
  for (const { timezone } of timezones) {
    try {
      if (typeof timezone !== 'string' || !timezone.trim()) continue;
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(instant);
      const part = (name: string) => parts.find((item) => item.type === name)?.value;
      const year = part('year');
      const month = part('month');
      const day = part('day');
      if (year && month && day) days.push([timezone, `${year}-${month}-${day}`]);
    } catch {
      // Invalid project timezone never acquires current access by guessing UTC.
    }
  }
  const supplierOccurrenceConditions = occurrenceDates[recordDates]
    .map((date) => `AND g.starts_on<=${date} AND (g.ends_on IS NULL OR g.ends_on>=${date})`)
    .join('\n');
  return {
    withClause: `WITH current_project_days(timezone,local_today) AS (${days.length ? `VALUES ${days.map(() => '(?,?)').join(',')}` : 'SELECT NULL,NULL WHERE 0'})`,
    predicate: `p.status IN ('active','planned','paused') AND EXISTS (
      SELECT 1 FROM current_project_days scope_day
      JOIN project_member scope_pm ON scope_pm.project_id=p.id
      WHERE scope_day.timezone=p.timezone AND scope_pm.user_id=?
        AND scope_pm.status='active'
        AND scope_pm.starts_on<=scope_day.local_today
        AND (scope_pm.ends_on IS NULL OR scope_pm.ends_on>=scope_day.local_today)
        AND (
          NOT EXISTS (SELECT 1 FROM supplier_user_profile sp
                      WHERE sp.user_id=scope_pm.user_id AND sp.profile='supplier_coordinator')
          OR EXISTS (
            SELECT 1 FROM supplier_user_profile sp
            JOIN supplier_project_grant g ON g.supplier_id=sp.supplier_id
                                        AND g.coordinator_id=sp.user_id
            JOIN supplier s ON s.id=sp.supplier_id
            WHERE sp.user_id=scope_pm.user_id AND sp.profile='supplier_coordinator'
              AND g.project_id=p.id AND g.status='active' AND s.status='active'
              AND g.starts_on<=scope_day.local_today
              AND (g.ends_on IS NULL OR g.ends_on>=scope_day.local_today)
              ${supplierOccurrenceConditions}
          )
        )
    )`,
    parameters: [...days.flat(), principal.userId],
    withParameters: days.flat(),
    predicateParameters: [principal.userId],
  };
}
