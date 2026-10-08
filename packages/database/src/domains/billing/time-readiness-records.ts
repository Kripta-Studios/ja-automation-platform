import type { DatabaseSync } from 'node:sqlite';

/** Diagnostic truth stays visible while a proposed correction blocks billing.
 * Count the original until its replacement is approved; never add both.
 */
export function billingTimeReadinessRecords(
  sqlite: DatabaseSync,
  projectId: string,
  periodStart: string,
  periodEnd: string,
) {
  return sqlite
    .prepare(
      `
    SELECT time_entry.id,work_date workDate,minutes,approval_state approvalState,
           billability_state billabilityState,invoice_id invoiceId,
           EXISTS (
             SELECT 1 FROM record_correction_link link
             JOIN time_entry correction ON correction.id=link.correction_id
             WHERE link.record_type='time_entry' AND link.original_id=time_entry.id
               AND correction.approval_state IN ('draft','submitted','needs_changes')
           ) pendingCorrection
    FROM time_entry
    WHERE project_id=? AND work_date BETWEEN ? AND ?
      AND approval_state NOT IN ('rejected','void')
      AND NOT EXISTS (
        SELECT 1 FROM record_correction_link link
        JOIN time_entry correction ON correction.id=link.correction_id
        WHERE link.record_type='time_entry'
          AND ((link.original_id=time_entry.id AND correction.approval_state IN ('approved','locked'))
            OR (link.correction_id=time_entry.id AND correction.approval_state NOT IN ('approved','locked')))
      )
    ORDER BY work_date,id
  `,
    )
    .all(projectId, periodStart, periodEnd) as Array<{
    id: string;
    workDate: string;
    minutes: number;
    approvalState: string;
    billabilityState: string;
    invoiceId: string | null;
    pendingCorrection: number;
  }>;
}

/** Nearby dates use the same correction projection as the selected period. */
export function nearbyBillingTimeDates(
  sqlite: DatabaseSync,
  projectId: string,
  periodStart: string,
  periodEnd: string,
) {
  return sqlite
    .prepare(
      `
    SELECT work_date workDate,SUM(minutes) minutes FROM time_entry
    WHERE project_id=? AND (work_date<? OR work_date>?)
      AND approval_state IN ('approved','locked') AND invoice_id IS NULL
      AND billability_state IN ('pending','billable')
      AND NOT EXISTS (
        SELECT 1 FROM record_correction_link link
        JOIN time_entry correction ON correction.id=link.correction_id
        WHERE link.record_type='time_entry'
          AND ((link.original_id=time_entry.id AND correction.approval_state IN ('approved','locked'))
            OR (link.correction_id=time_entry.id AND correction.approval_state NOT IN ('approved','locked')))
      )
      AND NOT EXISTS (
        SELECT 1 FROM record_correction_link link
        JOIN time_entry correction ON correction.id=link.correction_id
        WHERE link.record_type='time_entry' AND link.original_id=time_entry.id
          AND correction.approval_state IN ('draft','submitted','needs_changes')
      )
      AND NOT EXISTS (
        SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
        WHERE source.source_type='time' AND source.source_id=time_entry.id
          AND invoice.state NOT IN ('void','cancelled','superseded')
      )
    GROUP BY work_date
    ORDER BY ABS(julianday(work_date)-julianday(?)),work_date LIMIT 3
  `,
    )
    .all(projectId, periodStart, periodEnd, periodStart) as Array<{
    workDate: string;
    minutes: number;
  }>;
}
