/**
 * Project hub figures (owner round 2026-11-16): compact per-person summaries,
 * pending approvals and invoice rows for one project.
 *
 * Callers MUST have passed `repository.projectOverview(principal, projectId)`
 * first (object-level authorization). This module only narrows the projection
 * further by role: workers see their own rows, money from invoices and the
 * all-time finance projection is returned only to finance-visible roles.
 */
import { projectCalendarDate } from '@ja/database';
import type { openPortalRepository } from './portal-repository';

type Context = ReturnType<typeof openPortalRepository>;

/** Excludes superseded originals and unapproved corrections, like projectOverview. */
const liveTime = `approval_state NOT IN ('rejected','void')
  AND NOT EXISTS (
    SELECT 1 FROM record_correction_link rcl
      JOIN time_entry correction ON correction.id=rcl.correction_id
     WHERE rcl.record_type='time_entry'
       AND ((rcl.original_id=t.id AND correction.approval_state='approved')
         OR (rcl.correction_id=t.id AND correction.approval_state<>'approved')))`;

export type HubPersonHours = {
  workerId: string;
  name: string;
  monthMinutes: number;
  totalMinutes: number;
  waitingMinutes: number;
  draftMinutes: number;
  approvedMinutes: number;
};
export type HubMoney = { currency: string; amountMinor: string };
export type HubPersonExpenses = {
  workerId: string;
  name: string;
  count: number;
  waitingCount: number;
  missingReceipts: number;
  month: HubMoney[];
  total: HubMoney[];
};
export type HubInvoice = {
  id: string;
  number: string | null;
  state: string;
  currency: string;
  totalMinor: string;
  outstandingMinor: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  dueAt: string | null;
};
export type HubAssignment = {
  id: string;
  version: number;
  workerId: string;
  name: string;
  role: string | null;
  startsOn: string;
  endsOn: string | null;
  /** Assignment PO (migration 0081); null: the project PO applies. */
  poNumber: string | null;
};
export type ProjectHubData = {
  today: string;
  monthStart: string;
  managerName: string | null;
  /** Client default PO (project PO falls back to it on invoices). */
  clientPo: string | null;
  /**
   * The client's invoice identity, for the billing-data checks in "What needs you"
   * (see lib/portal/client-billing-issues.ts). Finance-visible roles only.
   */
  clientBilling: {
    clientId: string;
    billingAddress: string | null;
    billingEmail: string | null;
    taxId: string | null;
  } | null;
  hours: { monthMinutes: number; totalMinutes: number; people: HubPersonHours[] };
  expenses: { month: HubMoney[]; people: HubPersonExpenses[] };
  pending: { timeCount: number; timeMinutes: number; expenseCount: number; reportCount: number };
  assignments: HubAssignment[];
  invoices: HubInvoice[] | null;
  finance: {
    currency: string;
    approvedUnbilledMinor: string;
    unbilledMinutes: number;
    receivableMinor: string;
    budgetMinor: string | null;
    budgetConsumedBps: string | null;
    missingRate: boolean;
    openDrafts: number;
    overdue: number;
  } | null;
};

const closedInvoiceStates = new Set(['draft', 'approved', 'void', 'credited', 'cancelled', 'superseded', 'paid']);

function sumByCurrency(rows: Array<{ currency: string; amount: string }>): HubMoney[] {
  const totals = new Map<string, bigint>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0n) + BigInt(row.amount));
  return [...totals].map(([currency, amount]) => ({ currency, amountMinor: amount.toString() }));
}

export function projectHubData(
  context: Context,
  projectId: string,
  project: { timezone?: unknown; project_manager_id?: unknown },
  options: { financeVisible: boolean },
): ProjectHubData {
  const { sqlite, principal } = context;
  const ownOnly = principal.role === 'worker';
  let today: string;
  try {
    today = projectCalendarDate(String(project.timezone ?? 'UTC'));
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  const scope = ownOnly ? ' AND t.worker_id=?' : '';
  const scopeArgs = ownOnly ? [principal.userId] : [];

  const hourRows = sqlite
    .prepare(
      `SELECT t.worker_id workerId,u.name name,
              SUM(t.minutes) totalMinutes,
              SUM(CASE WHEN t.work_date>=? AND t.work_date<=? THEN t.minutes ELSE 0 END) monthMinutes,
              SUM(CASE WHEN t.approval_state IN ('submitted','needs_changes') THEN t.minutes ELSE 0 END) waitingMinutes,
              SUM(CASE WHEN t.approval_state='draft' THEN t.minutes ELSE 0 END) draftMinutes,
              SUM(CASE WHEN t.approval_state IN ('approved','locked') THEN t.minutes ELSE 0 END) approvedMinutes
         FROM time_entry t JOIN user u ON u.id=t.worker_id
        WHERE t.project_id=?${scope} AND ${liveTime}
        GROUP BY t.worker_id,u.name ORDER BY u.name`,
    )
    .all(monthStart, today, projectId, ...scopeArgs) as HubPersonHours[];
  const people = hourRows.map((row) => ({
    ...row,
    workerId: String(row.workerId),
    name: String(row.name ?? ''),
    totalMinutes: Number(row.totalMinutes ?? 0),
    monthMinutes: Number(row.monthMinutes ?? 0),
    waitingMinutes: Number(row.waitingMinutes ?? 0),
    draftMinutes: Number(row.draftMinutes ?? 0),
    approvedMinutes: Number(row.approvedMinutes ?? 0),
  }));

  const expenseScope = ownOnly ? ' AND e.worker_id=?' : '';
  const expenseRows = sqlite
    .prepare(
      `SELECT e.worker_id workerId,u.name name,e.currency currency,CAST(e.amount_minor AS TEXT) amount,
              e.spent_on spentOn,e.approval_state state,e.receipt_document_id receipt,
              COALESCE(e.receipt_required,0) receiptRequired
         FROM expense e JOIN user u ON u.id=e.worker_id
        WHERE e.project_id=?${expenseScope} AND e.approval_state NOT IN ('rejected','void')
        ORDER BY u.name`,
    )
    .all(projectId, ...scopeArgs) as Array<{
    workerId: string;
    name: string;
    currency: string;
    amount: string;
    spentOn: string;
    state: string;
    receipt: string | null;
    receiptRequired: number;
  }>;
  const byWorker = new Map<string, typeof expenseRows>();
  for (const row of expenseRows) {
    const list = byWorker.get(row.workerId) ?? [];
    list.push(row);
    byWorker.set(row.workerId, list);
  }
  const inMonth = (row: { spentOn: string }) => row.spentOn >= monthStart && row.spentOn <= today;
  const expensePeople: HubPersonExpenses[] = [...byWorker].map(([workerId, rows]) => ({
    workerId,
    name: String(rows[0]?.name ?? ''),
    count: rows.length,
    waitingCount: rows.filter((row) => ['submitted', 'needs_changes'].includes(row.state)).length,
    missingReceipts: rows.filter((row) => !row.receipt).length,
    month: sumByCurrency(rows.filter(inMonth)),
    total: sumByCurrency(rows),
  }));

  const pendingSql = (table: string, worker: string) =>
    `SELECT COUNT(*) count FROM ${table} WHERE project_id=? AND approval_state IN ('submitted')${ownOnly ? ` AND ${worker}=?` : ''}`;
  const pendingTime = sqlite
    .prepare(
      `SELECT COUNT(*) count,COALESCE(SUM(minutes),0) minutes FROM time_entry
        WHERE project_id=? AND approval_state='submitted'${ownOnly ? ' AND worker_id=?' : ''}`,
    )
    .get(projectId, ...scopeArgs) as { count: number; minutes: number };
  const pendingExpenses = sqlite
    .prepare(pendingSql('expense', 'worker_id'))
    .get(projectId, ...scopeArgs) as { count: number };
  const pendingDaily = sqlite
    .prepare(pendingSql('daily_report', 'worker_id'))
    .get(projectId, ...scopeArgs) as { count: number };
  const pendingTechnical = sqlite
    .prepare(pendingSql('technical_report', 'author_id'))
    .get(projectId, ...scopeArgs) as { count: number };

  // Who is on the project (name, role, dates; never pay): every non-worker role that
  // passed projectOverview sees the list. Finance and auditors read it; only the owner
  // and project managers get the add/end controls (the UI gates them and the
  // assignment actions re-check on the server).
  const canReadAssignments = principal.role !== 'worker';
  const assignments: HubAssignment[] = canReadAssignments
    ? (
        sqlite
          .prepare(
            `SELECT pm.id,pm.version,pm.user_id workerId,u.name,pm.assignment_role role,pm.starts_on startsOn,pm.ends_on endsOn,
                    ${sqlite.prepare("SELECT 1 FROM pragma_table_info('project_member') WHERE name='po_number'").get() ? 'pm.po_number' : 'NULL'} poNumber
               FROM project_member pm JOIN user u ON u.id=pm.user_id
              WHERE pm.project_id=? AND pm.status='active' ORDER BY u.name`,
          )
          .all(projectId) as HubAssignment[]
      ).map((row) => ({ ...row, id: String(row.id), version: Number(row.version) }))
    : [];

  const managerName = project.project_manager_id
    ? ((
        sqlite.prepare('SELECT name FROM user WHERE id=?').get(String(project.project_manager_id)) as
          | { name: string }
          | undefined
      )?.name ?? null)
    : null;

  const clientPo =
    principal.role === 'worker'
      ? null
      : ((
          sqlite
            .prepare(
              'SELECT c.po_reference po FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?',
            )
            .get(projectId) as { po: string | null } | undefined
        )?.po ?? null);

  let invoices: HubInvoice[] | null = null;
  let finance: ProjectHubData['finance'] = null;
  let clientBilling: ProjectHubData['clientBilling'] = null;
  if (options.financeVisible) {
    clientBilling =
      (sqlite
        .prepare(
          `SELECT c.id clientId,c.billing_address billingAddress,c.billing_email billingEmail,c.tax_id taxId
             FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?`,
        )
        .get(projectId) as ProjectHubData['clientBilling'] | undefined) ?? null;
    invoices = context.repository
      .listInvoices(principal)
      .filter((invoice) => String(invoice.project_id) === projectId)
      .map((invoice) => {
        const total = BigInt(String(invoice.total_minor ?? 0));
        const paid = BigInt(String((invoice as { paid_minor?: string }).paid_minor ?? 0));
        const state = String(invoice.state);
        return {
          id: String(invoice.id),
          number: invoice.invoice_number ? String(invoice.invoice_number) : null,
          state,
          currency: String(invoice.currency),
          totalMinor: total.toString(),
          outstandingMinor: closedInvoiceStates.has(state) ? '0' : (total - paid > 0n ? total - paid : 0n).toString(),
          periodStart: invoice.period_start ? String(invoice.period_start) : null,
          periodEnd: invoice.period_end ? String(invoice.period_end) : null,
          issuedAt: invoice.issued_at ? String(invoice.issued_at) : null,
          dueAt: invoice.due_at ? String(invoice.due_at) : null,
        };
      });
    const allTime = context.v3.projectFinance(principal, projectId) as Record<string, unknown>;
    const unbilled = sqlite
      .prepare(
        `SELECT COALESCE(SUM(minutes),0) minutes FROM time_entry
          WHERE project_id=? AND approval_state IN ('approved','locked') AND invoice_id IS NULL
            AND billability_state IN ('pending','billable')
            AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                   WHERE source.source_type='time' AND source.source_id=time_entry.id
                     AND invoice.state NOT IN ('void','cancelled','superseded'))`,
      )
      .get(projectId) as { minutes: number };
    const outstanding = invoices.reduce((sum, row) => sum + BigInt(row.outstandingMinor), 0n);
    finance = {
      currency: String(allTime.currency ?? ''),
      approvedUnbilledMinor: String(allTime.approvedUnbilledWipMinor ?? '0'),
      unbilledMinutes: Number(unbilled.minutes ?? 0),
      receivableMinor: outstanding.toString(),
      budgetMinor: allTime.budgetMinor == null ? null : String(allTime.budgetMinor),
      budgetConsumedBps:
        allTime.budgetConsumedBps == null ? null : String(allTime.budgetConsumedBps),
      missingRate: Array.isArray(allTime.alerts) && allTime.alerts.includes('MISSING_RATE'),
      openDrafts: invoices.filter((row) => row.state === 'draft' || row.state === 'approved').length,
      overdue: invoices.filter((row) => row.state === 'overdue').length,
    };
  }

  return {
    today,
    monthStart,
    managerName,
    clientPo,
    clientBilling,
    hours: {
      monthMinutes: people.reduce((sum, row) => sum + row.monthMinutes, 0),
      totalMinutes: people.reduce((sum, row) => sum + row.totalMinutes, 0),
      people,
    },
    expenses: { month: sumByCurrency(expenseRows.filter(inMonth)), people: expensePeople },
    pending: {
      timeCount: Number(pendingTime.count ?? 0),
      timeMinutes: Number(pendingTime.minutes ?? 0),
      expenseCount: Number(pendingExpenses.count ?? 0),
      reportCount: Number(pendingDaily.count ?? 0) + Number(pendingTechnical.count ?? 0),
    },
    assignments,
    invoices,
    finance,
  };
}

/** Neutral hub when the summary cannot be computed; the page still renders. */
export function emptyProjectHub(): ProjectHubData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    today,
    monthStart: `${today.slice(0, 7)}-01`,
    managerName: null,
    clientPo: null,
    clientBilling: null,
    hours: { monthMinutes: 0, totalMinutes: 0, people: [] },
    expenses: { month: [], people: [] },
    pending: { timeCount: 0, timeMinutes: 0, expenseCount: 0, reportCount: 0 },
    assignments: [],
    invoices: null,
    finance: null,
  };
}
