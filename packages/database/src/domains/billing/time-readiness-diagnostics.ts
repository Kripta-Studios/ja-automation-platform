export type TimeReadinessStatus =
  | 'pending_submission'
  | 'pending_operational_approval'
  | 'pending_finance_review'
  | 'finance_nonbillable'
  | 'already_billed'
  | 'reserved_in_draft'
  | 'reserved_in_approved_invoice'
  | 'pending_correction'
  | 'excluded_by_policy'
  | 'missing_client_rate'
  | 'eligible';

export type TimeReadinessSource = Readonly<{
  id: string;
  workDate: string;
  minutes: number;
  approvalState: string;
  billabilityState: string;
  invoiceId: string | null;
  billingState?: string | null;
  clientBillable: boolean;
  pendingCorrection?: boolean;
}>;

export type TimeReadinessGroup = Readonly<{
  status: TimeReadinessStatus;
  recordCount: number;
  minutes: number;
}>;
export type TimeReadinessRecord = Readonly<{
  sourceId: string;
  workDate: string;
  minutes: number;
  status: TimeReadinessStatus;
}>;

/** One operational record counts once, even if commercial policy splits it into slices. */
export function summarizeTimeReadiness(
  sources: readonly TimeReadinessSource[],
  reservedIds: ReadonlySet<string>,
  missingRateIds: ReadonlySet<string>,
): {
  recordCount: number;
  minutes: number;
  groups: TimeReadinessGroup[];
  records: TimeReadinessRecord[];
} {
  const groups = new Map<TimeReadinessStatus, { recordCount: number; minutes: number }>();
  const records: TimeReadinessRecord[] = [];
  for (const row of sources) {
    let status: TimeReadinessStatus;
    if (row.pendingCorrection) status = 'pending_correction';
    else if (['draft', 'needs_changes'].includes(row.approvalState)) status = 'pending_submission';
    else if (!['approved', 'locked'].includes(row.approvalState))
      status = 'pending_operational_approval';
    else if (
      (row.billingState && !['draft', 'approved'].includes(row.billingState)) ||
      row.invoiceId !== null
    )
      status = 'already_billed';
    else if (row.billingState === 'approved') status = 'reserved_in_approved_invoice';
    else if (row.billingState === 'draft' || reservedIds.has(row.id)) status = 'reserved_in_draft';
    else if (row.billabilityState === 'pending') status = 'pending_finance_review';
    else if (row.billabilityState !== 'billable') status = 'finance_nonbillable';
    else if (!row.clientBillable) status = 'excluded_by_policy';
    else if (missingRateIds.has(row.id)) status = 'missing_client_rate';
    else status = 'eligible';
    const group = groups.get(status) ?? { recordCount: 0, minutes: 0 };
    group.recordCount++;
    group.minutes += row.minutes;
    groups.set(status, group);
    records.push({ sourceId: row.id, workDate: row.workDate, minutes: row.minutes, status });
  }
  return {
    recordCount: sources.length,
    minutes: sources.reduce((total, row) => total + row.minutes, 0),
    groups: [...groups].map(([status, values]) => ({ status, ...values })),
    records,
  };
}
