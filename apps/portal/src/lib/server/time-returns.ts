import type { DatabaseSync } from 'node:sqlite';

/**
 * Reviewer outcomes the worker must see on Time (audit 2026-11-22, T07):
 * - entries sent back for changes (any week), so the landing page can say
 *   "N records need changes" and link to each day;
 * - entries a reviewer rejected in the shown week, read-only with the note,
 *   instead of silently disappearing from the day and the week total.
 * A record replaced by its own correction, or a withdrawn correction draft,
 * is history, not a reviewer outcome, and is not listed.
 */
export type ReturnedTime = {
  id: string;
  project_id: string;
  work_date: string;
  category: string;
  minutes: number;
  approval_state: 'needs_changes' | 'rejected';
  review_reason: string | null;
};

const reviewReason = `(SELECT e.reason FROM approval_event e
   WHERE e.entity_type IN ('time','time_entry') AND e.entity_id=t.id
     AND e.to_state=t.approval_state
     AND (e.reason IS NULL OR (e.reason NOT LIKE 'Superseded by %' AND e.reason NOT LIKE 'Withdrawn %'))
   ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1)`;

const notReplaced = `NOT EXISTS (SELECT 1 FROM record_correction_link l JOIN time_entry c ON c.id=l.correction_id
   WHERE l.record_type='time_entry' AND l.original_id=t.id AND c.approval_state NOT IN ('rejected','void'))`;

function placeholders(values: readonly string[]): string {
  return values.map(() => '?').join(',');
}

/** Sent-back entries of one worker, oldest first, limited to visible projects. */
export function openReturnedTime(
  sqlite: DatabaseSync,
  workerId: string,
  projectIds: readonly string[],
  limit = 20,
): ReturnedTime[] {
  if (projectIds.length === 0) return [];
  return sqlite
    .prepare(
      `SELECT t.id,t.project_id,t.work_date,t.category,t.minutes,t.approval_state,${reviewReason} review_reason
         FROM time_entry t
        WHERE t.worker_id=? AND t.approval_state='needs_changes'
          AND t.project_id IN (${placeholders(projectIds)})
          AND ${notReplaced}
        ORDER BY t.work_date,t.id LIMIT ?`,
    )
    .all(workerId, ...projectIds, limit) as ReturnedTime[];
}

/** Reviewer-rejected entries in a date range (never-submitted withdrawn drafts excluded). */
export function rejectedTimeInRange(
  sqlite: DatabaseSync,
  workerId: string,
  projectIds: readonly string[],
  from: string,
  to: string,
): ReturnedTime[] {
  if (projectIds.length === 0) return [];
  return (
    sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.work_date,t.category,t.minutes,t.approval_state,${reviewReason} review_reason,
                EXISTS (SELECT 1 FROM record_correction_link l WHERE l.record_type='time_entry' AND l.original_id=t.id) replaced
           FROM time_entry t
          WHERE t.worker_id=? AND t.approval_state='rejected' AND t.submitted_at IS NOT NULL
            AND t.work_date BETWEEN ? AND ?
            AND NOT EXISTS (SELECT 1 FROM approval_event s
                             WHERE s.entity_type IN ('time','time_entry') AND s.entity_id=t.id
                               AND s.to_state='rejected' AND s.reason LIKE 'Superseded by %')
            AND t.project_id IN (${placeholders(projectIds)})
          ORDER BY t.work_date,t.id`,
      )
      .all(workerId, from, to, ...projectIds) as Array<ReturnedTime & { replaced: number }>
  )
    .filter((row) => !Number(row.replaced))
    .map(({ replaced: _replaced, ...row }) => row);
}

/**
 * Display name of the person who recorded each entry for someone else (crew
 * chief or supplier coordinator), so the worker sees "Recorded by …" (T76).
 * Entries the worker logged himself are not returned.
 */
export function timeRecorders(
  sqlite: DatabaseSync,
  entryIds: readonly string[],
  workerId: string,
): Map<string, string> {
  if (entryIds.length === 0) return new Map();
  const rows = sqlite
    .prepare(
      `SELECT rec.time_entry_id id,COALESCE(NULLIF(trim(u.name),''),u.email) name
         FROM (SELECT time_entry_id,recorded_by_user_id FROM crew_time_entry_recorder
               UNION ALL
               SELECT time_entry_id,recorded_by_user_id FROM supplier_time_entry_recorder) rec
         JOIN user u ON u.id=rec.recorded_by_user_id
        WHERE rec.time_entry_id IN (${placeholders(entryIds)}) AND rec.recorded_by_user_id<>?`,
    )
    .all(...entryIds, workerId) as Array<{ id: string; name: string }>;
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Project manager display name per project: who to ask about sent hours (T07/T83). */
export function projectManagerNames(
  sqlite: DatabaseSync,
  projectIds: readonly string[],
): Record<string, string> {
  if (projectIds.length === 0) return {};
  const rows = sqlite
    .prepare(
      `SELECT p.id,COALESCE(NULLIF(trim(u.name),''),u.email) name
         FROM project p JOIN user u ON u.id=p.project_manager_id
        WHERE p.id IN (${placeholders(projectIds)})`,
    )
    .all(...projectIds) as Array<{ id: string; name: string }>;
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}
