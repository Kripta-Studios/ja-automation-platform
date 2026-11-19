import type { DatabaseSync } from 'node:sqlite';

/** Per project: approved expenses whose invoice amount is set on New invoice, per receipt currency. */
export type ExpensesWaiting = Map<
  string,
  { count: number; totals: Map<string, bigint>; counts: Map<string, number> }
>;

/**
 * "Ready to invoice" expenses that have no billing amount yet, shared by Home and Money so
 * both screens say the same thing: approved by the reviewer, not on any live invoice
 * (drafts included) and not classified yet (the owner decides Reimbursable / All-in / Not
 * charged on New invoice), or re-billable but without a billing amount yet (e.g. a foreign
 * receipt still to convert). Re-billable expenses with a billing amount are already in the
 * ready amount itself, so they are never counted twice.
 * Amounts are exact integer minor units in the receipt currency; nothing is converted.
 * Callers pass only projects the viewer may see.
 */
export function approvedExpensesWaiting(sqlite: DatabaseSync, projectIds: readonly string[]): ExpensesWaiting {
  const waiting: ExpensesWaiting = new Map();
  if (!projectIds.length) return waiting;
  const rows = sqlite
    .prepare(
      `SELECT project_id projectId,currency,COUNT(*) n,CAST(SUM(amount_minor) AS TEXT) total FROM expense
        WHERE project_id IN (SELECT value FROM json_each(?))
          AND approval_state='approved' AND invoice_id IS NULL
          AND (commercial_classification_state='unclassified'
            OR (COALESCE(NULLIF(billing_treatment,''),client_treatment) LIKE 'reimbursable%'
                OR COALESCE(NULLIF(billing_treatment,''),client_treatment)='allowance_per_diem')
               AND who_paid<>'client' AND billing_amount_minor IS NULL)
          AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                 WHERE source.source_type='expense' AND source.source_id=expense.id
                   AND invoice.state NOT IN ('void','cancelled','superseded'))
        GROUP BY project_id,currency`,
    )
    .all(JSON.stringify([...new Set(projectIds)])) as Array<{
    projectId: string;
    currency: string;
    n: number;
    total: string;
  }>;
  for (const row of rows) {
    const entry = waiting.get(row.projectId) ?? {
      count: 0,
      totals: new Map<string, bigint>(),
      counts: new Map<string, number>(),
    };
    entry.count += Number(row.n) || 0;
    entry.counts.set(row.currency, (entry.counts.get(row.currency) ?? 0) + (Number(row.n) || 0));
    if (/^-?\d+$/u.test(String(row.total)))
      entry.totals.set(row.currency, (entry.totals.get(row.currency) ?? 0n) + BigInt(row.total));
    waiting.set(row.projectId, entry);
  }
  return waiting;
}
