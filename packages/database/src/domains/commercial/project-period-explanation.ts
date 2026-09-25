import type { DatabaseSync } from 'node:sqlite';
import { type Principal } from '@ja/domain';
import { assertActiveAccount } from '../../core/authorization.ts';
import { AccessDeniedError, ValidationError } from '../../repository.ts';

/**
 * A read-only explanation assembled from the canonical V3 finance projection.
 *
 * This deliberately does not calculate money.  The projection supplied by V3 is
 * the authority for every amount, while this module groups its source rows.
 * It intentionally does not re-resolve mutable rate rules: this release's
 * projection does not carry an immutable rule-selection snapshot. Keeping that
 * distinction prevents the explanation from becoming a second, subtly
 * different invoice engine or overstating current configuration as history.
 */

type CanonicalRow = Readonly<Record<string, unknown>>;

export type CanonicalProjectFinance = Readonly<{
  currency: string;
  actualMinutes?: number;
  approvedMinutes?: number;
  billableMinutes?: number;
  unapprovedMinutes?: number;
  laborRevenueMinor?: string;
  expenseRevenueMinor?: string;
  operationalRevenueCandidateMinor?: string;
  revenueCandidateMinor?: string;
  workerCompensationMinor?: string;
  approvedCostMinor?: string;
  invoicedMinor?: string;
  paidMinor?: string;
  approvedUnbilledWipMinor?: string;
  unapprovedWipMinor?: string;
  dailyMinimumTopUpMinor?: string;
  dailyMinimumAdjustments?: readonly CanonicalRow[];
  timeEconomics?: readonly CanonicalRow[];
  expenseEconomics?: readonly CanonicalRow[];
  reasons?: readonly Readonly<{ code?: string; sourceId?: string }>[];
}>;

export type ProjectPeriodExplanationInput = Readonly<{
  projectId: string;
  periodStart: string;
  periodEnd: string;
  finance: CanonicalProjectFinance;
}>;

type ExpenseStatusRow = Readonly<{
  id: string;
  invoice_id: string | null;
  billing_state: string | null;
  assignment_expense_policy_id: string | null;
  reimbursement_amount_minor: string | null;
  reimbursement_state: string | null;
  expense_policy_required: number;
  payer: string | null;
  category: string | null;
  worker_reimbursement: string | null;
  client_recovery: string | null;
  markup_bps: number | null;
  effective_from: string | null;
  effective_to: string | null;
  version: number | null;
}>;

// This is a source-processing state, deliberately not an invoice-readiness
// state. Fixed, hybrid and internal commercial models can have approved
// operational sources while canonical approved-unbilled WIP is zero or needs
// allocation. Invoice readiness remains the billing engine's responsibility.
type SourceState = 'approved_operational' | 'invoiced' | 'excluded' | 'pending';

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result || null;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function minor(value: unknown): bigint {
  const raw = text(value).trim();
  return /^-?\d+$/u.test(raw) ? BigInt(raw) : 0n;
}

function sourceStateForTime(row: CanonicalRow): SourceState {
  if (nullableText(row.invoiceId)) return 'invoiced';
  if (!row.approved) return 'pending';
  if (
    text(row.billabilityState) === 'billable' &&
    Boolean(row.clientRateConfigured) &&
    text(row.billingStatus || 'unlocked') === 'unlocked'
  )
    return 'approved_operational';
  return 'excluded';
}

function sourceStateForExpense(
  row: CanonicalRow,
  status: ExpenseStatusRow | undefined,
): SourceState {
  if (status?.invoice_id) return 'invoiced';
  if (text(row.financeApprovalState) !== 'approved') return 'pending';
  if (minor(row.revenueMinor) > 0n && (status?.billing_state ?? 'unlocked') === 'unlocked')
    return 'approved_operational';
  return 'excluded';
}

function assertFinanceExplanationAccess(sqlite: DatabaseSync, principal: Principal): void {
  assertActiveAccount(sqlite, principal, AccessDeniedError);
  const current = sqlite
    .prepare('SELECT role,status FROM user WHERE id=?')
    .get(principal.userId) as { role: string; status: string } | undefined;
  if (
    !current ||
    current.status !== 'active' ||
    !['owner_admin', 'finance_admin', 'auditor_read_only'].includes(current.role) ||
    current.role !== principal.role
  )
    throw new AccessDeniedError('Finance role required');
}

/**
 * Build a role-safe, period-specific explanation of canonical finance results.
 * The caller supplies the already-authorized V3 projection. Rule-level
 * provenance is deliberately marked unavailable until that projection carries
 * immutable selection snapshots.
 */
export function projectPeriodExplanation(
  sqlite: DatabaseSync,
  principal: Principal,
  input: ProjectPeriodExplanationInput,
) {
  assertFinanceExplanationAccess(sqlite, principal);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.periodStart) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.periodEnd)
  )
    throw new ValidationError('Explanation period must use ISO dates');
  if (input.periodEnd < input.periodStart)
    throw new ValidationError('Explanation period end must not precede its start');
  const project = sqlite
    .prepare('SELECT id,project_number,name,currency,billing_model FROM project WHERE id=?')
    .get(input.projectId) as
    | { id: string; project_number: string; name: string; currency: string; billing_model: string }
    | undefined;
  if (!project) throw new ValidationError('Project not found');

  const expenseStatus = new Map(
    (
      sqlite
        .prepare(
          `SELECT e.id,e.invoice_id,e.billing_state,e.assignment_expense_policy_id,
                  CAST(e.reimbursement_amount_minor AS TEXT) reimbursement_amount_minor,
                  e.reimbursement_state,e.expense_policy_required,
                  ep.payer,ep.category,ep.worker_reimbursement,ep.client_recovery,
                  ep.markup_bps,ep.effective_from,ep.effective_to,ep.version
             FROM expense e
             LEFT JOIN assignment_expense_policy ep ON ep.id=e.assignment_expense_policy_id
            WHERE e.project_id=? AND e.spent_on BETWEEN ? AND ?`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as ExpenseStatusRow[]
    ).map((row) => [row.id, row]),
  );
  const billingRules = sqlite
    .prepare(
      `SELECT id,stream_type,include_expenses,cadence_type,effective_from,effective_to,currency
         FROM billing_rule WHERE project_id=? AND enabled=1
         AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
         ORDER BY stream_type,effective_from,id`,
    )
    .all(input.projectId, input.periodEnd, input.periodStart) as Array<{
    id: string;
    stream_type: string;
    include_expenses: number;
    cadence_type: string;
    effective_from: string;
    effective_to: string | null;
    currency: string;
  }>;

  type PersonAccumulator = {
    workerId: string;
    workerName: string;
    actualMinutes: number;
    approvedMinutes: number;
    billableMinutes: number;
    customerRevenueMinor: bigint;
    workerCompensationMinor: bigint;
    internalCostMinor: bigint;
    expenseCostMinor: bigint;
    expenseRevenueMinor: bigint;
    approvedOperationalSources: number;
    invoicedSources: number;
    excludedSources: number;
    pendingSources: number;
    time: CanonicalRow[];
    expenses: CanonicalRow[];
  };
  const people = new Map<string, PersonAccumulator>();
  const personFor = (workerId: string, workerName: string): PersonAccumulator => {
    const existing = people.get(workerId);
    if (existing) return existing;
    const created: PersonAccumulator = {
      workerId,
      workerName,
      actualMinutes: 0,
      approvedMinutes: 0,
      billableMinutes: 0,
      customerRevenueMinor: 0n,
      workerCompensationMinor: 0n,
      internalCostMinor: 0n,
      expenseCostMinor: 0n,
      expenseRevenueMinor: 0n,
      approvedOperationalSources: 0,
      invoicedSources: 0,
      excludedSources: 0,
      pendingSources: 0,
      time: [],
      expenses: [],
    };
    people.set(workerId, created);
    return created;
  };
  const countState = (person: PersonAccumulator, state: SourceState) => {
    if (state === 'approved_operational') person.approvedOperationalSources += 1;
    else if (state === 'invoiced') person.invoicedSources += 1;
    else if (state === 'excluded') person.excludedSources += 1;
    else person.pendingSources += 1;
  };

  // Configuration must remain understandable before anyone logs a first hour.
  // Include every active worker assignment that overlaps the selected period.
  // Do not re-resolve their rates here: rate-rule provenance is not part of the
  // canonical finance DTO yet, so showing a mutable lookup as historical truth
  // would be misleading after an edit or concurrent configuration change.
  const assignedWorkers = sqlite
    .prepare(
      `SELECT pm.user_id,u.name
         FROM project_member pm JOIN user u ON u.id=pm.user_id
        WHERE pm.project_id=? AND pm.status='active' AND u.status='active' AND u.role='worker'
          AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
        ORDER BY u.name,pm.user_id`,
    )
    .all(input.projectId, input.periodEnd, input.periodStart) as Array<{
    user_id: string;
    name: string;
  }>;
  for (const worker of assignedWorkers) {
    personFor(worker.user_id, worker.name);
  }

  let sourceRevenue = 0n;
  let sourceLaborRevenue = 0n;
  let sourceExpenseRevenue = 0n;
  const timeSources = input.finance.timeEconomics ?? [];
  for (const row of timeSources) {
    const workerId = text(row.workerId);
    if (!workerId) continue;
    const workerName = text(row.workerName) || 'Unknown worker';
    const person = personFor(workerId, workerName);
    const actualMinutes = integer(row.actualMinutes);
    const approved = Boolean(row.approved);
    const billableMinutes = integer(row.clientBillableMinutes);
    const revenue = minor(row.clientRevenueMinor);
    const compensation = minor(row.workerCompensationMinor);
    const internalCost = minor(row.internalCostMinor);
    const state = sourceStateForTime(row);
    person.actualMinutes += actualMinutes;
    if (approved) person.approvedMinutes += actualMinutes;
    person.billableMinutes += billableMinutes;
    // Pending records expose a prospective WIP amount in the canonical
    // projection. They must not be presented as this person's operational
    // customer revenue before approval.
    if (approved) person.customerRevenueMinor += revenue;
    person.workerCompensationMinor += compensation;
    person.internalCostMinor += internalCost;
    // Pending records contribute canonical WIP, not operational revenue.
    if (approved) {
      sourceRevenue += revenue;
      sourceLaborRevenue += revenue;
    }
    countState(person, state);
    person.time.push({
      id: text(row.id),
      workDate: text(row.workDate),
      category: text(row.category),
      activityCode: nullableText(row.activityCode),
      actualMinutes,
      approved,
      approvalState: text(row.approvalState),
      billableMinutes,
      billingStatus: text(row.billingStatus || 'unlocked'),
      invoiceId: nullableText(row.invoiceId),
      sourceState: state,
      clientRevenueMinor: revenue.toString(),
      workerCompensationMinor: compensation.toString(),
      internalCostMinor: internalCost.toString(),
      clientRateConfigured: row.clientRateConfigured,
      internalCostConfigured: row.internalCostConfigured,
      compensationRuleType: nullableText(row.compensationRuleType),
      commercialPolicyId: nullableText(row.commercialPolicyId),
      clientRateStatus: row.clientRateConfigured ? 'configured' : 'unavailable',
      internalCostStatus: row.internalCostConfigured ? 'configured' : 'unavailable',
      formula:
        'Canonical time projection for recorded minutes. Immutable rate-rule provenance is unavailable in this release.',
    });
  }

  const expenseSources = input.finance.expenseEconomics ?? [];
  for (const row of expenseSources) {
    const workerId = text(row.workerId);
    if (!workerId) continue;
    const person = personFor(workerId, text(row.workerName) || 'Unknown worker');
    const status = expenseStatus.get(text(row.id));
    const revenue = minor(row.revenueMinor);
    const cost = minor(row.costMinor);
    const state = sourceStateForExpense(row, status);
    // V3 emits zero revenue while finance approval is still pending. Keep the
    // guard explicit so this grouping keeps the same meaning if that DTO grows
    // a prospective expense-WIP field later.
    if (text(row.financeApprovalState) === 'approved') person.expenseRevenueMinor += revenue;
    person.expenseCostMinor += cost;
    sourceRevenue += revenue;
    sourceExpenseRevenue += revenue;
    countState(person, state);
    person.expenses.push({
      id: text(row.id),
      spentOn: text(row.spentOn),
      category: text(row.category),
      approvalState: text(row.approvalState),
      financeApprovalState: text(row.financeApprovalState),
      sourceState: state,
      invoiceId: status?.invoice_id ?? null,
      billingState: status?.billing_state ?? 'unlocked',
      paidBy: text(row.paidBy),
      treatment: text(row.treatment),
      costMinor: cost.toString(),
      revenueMinor: revenue.toString(),
      financeProjectionState: text(row.financeProjectionState),
      reimbursementAmountMinor: status?.reimbursement_amount_minor ?? null,
      reimbursementState: status?.reimbursement_state ?? null,
      expensePolicyRequired: status?.expense_policy_required === 1,
      expensePolicy: status?.assignment_expense_policy_id
        ? {
            id: status.assignment_expense_policy_id,
            payer: status.payer,
            category: status.category,
            workerReimbursement: status.worker_reimbursement,
            clientRecovery: status.client_recovery,
            markupBps: status.markup_bps,
            effectiveFrom: status.effective_from,
            effectiveTo: status.effective_to,
            version: status.version,
          }
        : null,
      formula:
        'Canonical expense projection after the recorded payer, classification and effective expense policy.',
    });
  }

  const minimumAdjustments = (input.finance.dailyMinimumAdjustments ?? []).map((adjustment) => ({
    workerId: text(adjustment.workerId),
    workDate: text(adjustment.workDate),
    sourceTimeIds: Array.isArray(adjustment.sourceTimeIds)
      ? adjustment.sourceTimeIds.map((id) => text(id))
      : [],
    adjustmentMinutes: integer(adjustment.adjustmentMinutes),
    rateMinor: text(adjustment.rateMinor),
    revenueMinor: text(adjustment.revenueMinor),
    sourceType: text(adjustment.sourceType),
    formula: 'Contractual daily minimum applied once per worker and project day.',
  }));
  for (const adjustment of minimumAdjustments) {
    const person = people.get(adjustment.workerId);
    if (person) {
      person.billableMinutes += adjustment.adjustmentMinutes;
      person.customerRevenueMinor += minor(adjustment.revenueMinor);
    }
    sourceRevenue += minor(adjustment.revenueMinor);
    sourceLaborRevenue += minor(adjustment.revenueMinor);
  }

  // V3 includes approved/final, project-currency milestones that have not yet
  // been invoiced in operational revenue. Keep the same inclusion predicate so
  // a project with no time records still reconciles exactly.
  const milestones = (
    sqlite
      .prepare(
        `SELECT id,due_on,CAST(amount_minor AS TEXT) amount_minor,currency,approval_state,invoice_id
           FROM project_milestone
          WHERE project_id=? AND approval_state IN ('approved','final')
            AND (due_on IS NULL OR due_on BETWEEN ? AND ?)
          ORDER BY due_on,id`,
      )
      .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
      id: string;
      due_on: string | null;
      amount_minor: string;
      currency: string;
      approval_state: string;
      invoice_id: string | null;
    }>
  ).map((milestone) => {
    const sourceState: SourceState = milestone.invoice_id
      ? 'invoiced'
      : milestone.currency === project.currency
        ? 'approved_operational'
        : 'excluded';
    const revenue = sourceState === 'approved_operational' ? minor(milestone.amount_minor) : 0n;
    sourceRevenue += revenue;
    return {
      id: milestone.id,
      dueOn: milestone.due_on,
      amountMinor: milestone.amount_minor,
      currency: milestone.currency,
      approvalState: milestone.approval_state,
      invoiceId: milestone.invoice_id,
      sourceState,
      revenueMinor: revenue.toString(),
      formula: 'Canonical approved milestone revenue, included only while it remains un-invoiced.',
    };
  });

  const operationalRevenue = minor(input.finance.operationalRevenueCandidateMinor);
  const canonicalCandidateRevenue = minor(input.finance.revenueCandidateMinor);
  return {
    project: {
      id: project.id,
      number: project.project_number,
      name: project.name,
      currency: project.currency,
      billingModel: project.billing_model,
    },
    period: { start: input.periodStart, end: input.periodEnd },
    billingRules: billingRules.map((rule) => ({
      id: rule.id,
      streamType: rule.stream_type,
      includeExpenses: rule.include_expenses === 1,
      cadenceType: rule.cadence_type,
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to,
      currency: rule.currency,
    })),
    totals: {
      actualMinutes: integer(input.finance.actualMinutes),
      approvedMinutes: integer(input.finance.approvedMinutes),
      billableMinutes: integer(input.finance.billableMinutes),
      unapprovedMinutes: integer(input.finance.unapprovedMinutes),
      laborRevenueMinor: text(input.finance.laborRevenueMinor),
      expenseRevenueMinor: text(input.finance.expenseRevenueMinor),
      operationalRevenueCandidateMinor: operationalRevenue.toString(),
      revenueCandidateMinor: canonicalCandidateRevenue.toString(),
      workerCompensationMinor: text(input.finance.workerCompensationMinor),
      approvedCostMinor: text(input.finance.approvedCostMinor),
      invoicedMinor: text(input.finance.invoicedMinor),
      paidMinor: text(input.finance.paidMinor),
      approvedUnbilledWipMinor: text(input.finance.approvedUnbilledWipMinor),
      unapprovedWipMinor: text(input.finance.unapprovedWipMinor),
      sourceLaborRevenueMinor: sourceLaborRevenue.toString(),
      sourceExpenseRevenueMinor: sourceExpenseRevenue.toString(),
      sourceMilestoneRevenueMinor: milestones
        .reduce((total, milestone) => total + minor(milestone.revenueMinor), 0n)
        .toString(),
      sourceRevenueMinor: sourceRevenue.toString(),
      sourceRevenueReconcilesToOperationalCandidate: sourceRevenue === operationalRevenue,
      candidateRevenueDiffMinor: (operationalRevenue - sourceRevenue).toString(),
      // A fixed/all-in project can intentionally differ from its operational
      // source total.  State that fact instead of incorrectly calling it an error.
      canonicalCandidateDiffFromOperationalMinor: (
        canonicalCandidateRevenue - operationalRevenue
      ).toString(),
    },
    dailyMinimumAdjustments: minimumAdjustments,
    milestones,
    people: [...people.values()]
      .map((person) => ({
        workerId: person.workerId,
        workerName: person.workerName,
        actualMinutes: person.actualMinutes,
        approvedMinutes: person.approvedMinutes,
        billableMinutes: person.billableMinutes,
        customerRevenueMinor: person.customerRevenueMinor.toString(),
        workerCompensationMinor: person.workerCompensationMinor.toString(),
        internalCostMinor: person.internalCostMinor.toString(),
        expenseCostMinor: person.expenseCostMinor.toString(),
        expenseRevenueMinor: person.expenseRevenueMinor.toString(),
        approvedOperationalSources: person.approvedOperationalSources,
        invoicedSources: person.invoicedSources,
        excludedSources: person.excludedSources,
        pendingSources: person.pendingSources,
        time: person.time,
        expenses: person.expenses,
      }))
      .sort(
        (left, right) =>
          left.workerName.localeCompare(right.workerName) ||
          left.workerId.localeCompare(right.workerId),
      ),
    issues: (input.finance.reasons ?? []).map((reason) => ({
      code: text(reason.code),
      sourceId: nullableText(reason.sourceId),
    })),
  } as const;
}
