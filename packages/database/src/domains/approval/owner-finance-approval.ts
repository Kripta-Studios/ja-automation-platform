import type { DatabaseSync } from 'node:sqlite';
import { recordAuditEvent, type AuditPrincipal } from '../../core/audit.ts';

export type OwnerFinanceRecordType = 'time_entry' | 'expense';
export type OwnerFinanceApprovalOrigin =
  | 'invoice_composition'
  | 'operational_approval'
  | 'catchup'
  | 'policy_reconciliation';

/** Finance acceptance is independent of rating/classification. It never supplies
 * a price, conversion, commercial treatment, or other missing configuration. */
export function acceptOwnerFinanceApproval(
  sqlite: DatabaseSync,
  principal: AuditPrincipal,
  type: OwnerFinanceRecordType,
  id: string,
  origin: OwnerFinanceApprovalOrigin,
  initiatingOwnerId = principal.userId,
): boolean {
  const table = type;
  const row = sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row || row.approval_state !== 'approved') return false;
  if (
    row.invoice_id !== null ||
    row.billing_lock_id !== null ||
    (type === 'time_entry' && (row.billing_status !== 'unlocked' || row.locked_at !== null)) ||
    (type === 'expense' && row.billing_state !== 'unlocked') ||
    sqlite
      .prepare(
        `SELECT 1 FROM record_correction_link link
      JOIN ${table} correction ON correction.id=link.correction_id
      WHERE link.record_type=? AND link.original_id=?
        AND correction.approval_state NOT IN ('rejected','void')`,
      )
      .get(type, id) ||
    sqlite
      .prepare(
        `SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
      WHERE source.source_type=? AND source.source_id=?
        AND (source.locked_at IS NOT NULL OR invoice.state NOT IN ('void','cancelled','superseded'))`,
      )
      .get(type === 'time_entry' ? 'time' : 'expense', id)
  )
    return false;
  if (row.finance_approved_at !== null) return true;
  // Never reinterpret an explicit Finance decision, including non-billable time.
  const billabilityState = row.billability_state === 'pending' ? 'billable' : row.billability_state;
  const timestamp = new Date().toISOString();
  const changed = sqlite
    .prepare(
      `UPDATE ${table}
    SET ${type === 'time_entry' ? "billability_state=CASE WHEN billability_state='pending' THEN 'billable' ELSE billability_state END," : ''}
        finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1
    WHERE id=? AND version=? AND finance_approved_at IS NULL`,
    )
    .run(principal.userId, timestamp, timestamp, id, Number(row.version));
  if (changed.changes !== 1) return false;
  recordAuditEvent(
    sqlite,
    principal,
    type === 'time_entry' ? 'time.finance_review' : 'expense.finance_approve',
    type,
    id,
    {
      combinedOwnerApproval: true,
      origin,
      policyReconciliation: origin === 'policy_reconciliation',
      initiatingOwnerId,
      originalApprovedBy: row.approved_by,
      originalApprovedAt: row.approved_at,
      projectId: row.project_id,
      ...(type === 'time_entry'
        ? { billable: billabilityState === 'billable' }
        : {
            commercialClassificationState: row.commercial_classification_state,
          }),
      before: {
        financeApprovedBy: null,
        financeApprovedAt: null,
        ...(type === 'time_entry' ? { billabilityState: row.billability_state } : {}),
      },
      after: {
        financeApprovedBy: principal.userId,
        financeApprovedAt: timestamp,
        ...(type === 'time_entry' ? { billabilityState } : {}),
      },
    },
  );
  return true;
}

export function ownerFinanceCatchupCandidates(sqlite: DatabaseSync, projectId?: string) {
  return (['time_entry', 'expense'] as const).flatMap((type) => {
    const time = type === 'time_entry';
    return sqlite
      .prepare(
        `SELECT record.id,record.project_id projectId,
        record.approved_by approvedBy,record.approved_at approvedAt
      FROM ${type} record JOIN user owner ON owner.id=record.approved_by
      WHERE owner.role='owner_admin' AND owner.status='active'
        AND record.approval_state='approved' AND record.approved_at IS NOT NULL
        AND record.finance_approved_at IS NULL
        AND EXISTS (SELECT 1 FROM approval_event approval
          WHERE approval.entity_type=? AND approval.entity_id=record.id
            AND approval.to_state='approved' AND approval.actor_id=record.approved_by
            AND approval.occurred_at=record.approved_at)
        ${time ? "AND record.billability_state='pending' AND record.billing_status='unlocked' AND record.locked_at IS NULL" : "AND record.billing_state='unlocked'"}
        AND record.invoice_id IS NULL AND record.billing_lock_id IS NULL
        AND (? IS NULL OR record.project_id=?)
        AND NOT EXISTS (SELECT 1 FROM record_correction_link link
          JOIN ${type} correction ON correction.id=link.correction_id
          WHERE link.record_type=? AND link.original_id=record.id
            AND correction.approval_state NOT IN ('rejected','void'))
        AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
          WHERE source.source_type=? AND source.source_id=record.id
            AND (source.locked_at IS NOT NULL OR invoice.state NOT IN ('void','cancelled','superseded')))
      ORDER BY record.id`,
      )
      .all(
        time ? 'time' : 'expense',
        projectId ?? null,
        projectId ?? null,
        type,
        time ? 'time' : 'expense',
      )
      .map((row) => ({ type, ...row })) as Array<{
      type: OwnerFinanceRecordType;
      id: string;
      projectId: string;
      approvedBy: string;
      approvedAt: string;
    }>;
  });
}

/** Owner acceptance replaces the review step, not its required commercial
 * configuration. Mirror the existing Finance action's effective coverage. */
export function ownerTimeFinanceConfigurationReasons(sqlite: DatabaseSync, id: string) {
  const row = sqlite
    .prepare(
      `SELECT time.project_id,time.worker_id,time.work_date,project.currency
    FROM time_entry time JOIN project ON project.id=time.project_id
    JOIN user owner ON owner.id=time.finance_approved_by
    WHERE time.id=? AND owner.role='owner_admin' AND time.finance_approved_at IS NOT NULL`,
    )
    .get(id) as
    | { project_id: string; worker_id: string; work_date: string; currency: string }
    | undefined;
  if (!row) return [];
  return (
    [
      ['internal_cost_rule', 'missing_internal_cost'],
      ['compensation_rule', 'missing_compensation_rule'],
    ] as const
  ).flatMap(([table, code]) =>
    sqlite
      .prepare(
        `SELECT 1 FROM ${table}
      WHERE worker_id=? AND currency=? AND (project_id=? OR project_id IS NULL)
        AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) LIMIT 1`,
      )
      .get(row.worker_id, row.currency, row.project_id, row.work_date, row.work_date)
      ? []
      : [{ code, sourceId: id }],
  );
}
