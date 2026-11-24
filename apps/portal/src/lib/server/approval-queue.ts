/**
 * Approvals at scale: one server function for the "to approve" numbers and the
 * paginated Approvals page. Every row comes from the authorized repository
 * queue first (`listApprovalQueue`), is narrowed to visible projects, and only
 * then decorated with operational context for the rows actually sent.
 * Project managers never receive expense money.
 */
import type { openPortalRepository } from './portal-repository';
import { isSupplierTimeEntry } from '@ja/database';
import { projectVisibility, visibleProjectRecords } from '$lib/portal/project-visibility';
import {
  isPendingApproval,
  pendingApprovalSummary,
  type ApprovalPendingSummary,
} from '$lib/portal/home-inbox';
import {
  APPROVAL_BATCH_LIMIT,
  APPROVAL_PAGE_SIZE,
  APPROVED_PAGE_SIZE,
  filterQueueRows,
  groupQueueRows,
  parseApprovalQueueQuery,
  queueFilterOptions,
  queueTotals,
  rowMatchesTab,
  type ApprovalQueuePage,
  type ApprovalTab,
  type ApprovalWorkerSummary,
} from '$lib/portal/approval-queue-page';
import { personDisplayName } from '$lib/portal/display-name';
import { expenseEstimate } from './expense-estimate';
import { projectManagerApprovalQueueProjection } from '../../routes/app/[section]/role-projections';

type PortalContext = ReturnType<typeof openPortalRepository>;
type Row = Record<string, unknown>;
type Visible = ReturnType<typeof projectVisibility<Record<string, unknown>>>;

const text = (value: unknown): string => (value == null ? '' : String(value));

function roleRows(context: PortalContext, rows: readonly Row[]): Row[] {
  return context.principal.role === 'project_manager'
    ? projectManagerApprovalQueueProjection(rows)
    : [...rows];
}

/**
 * Exact expense amount and currency for the people who decide on it: owner,
 * Finance and the project's PM (T10: the PM approved expenses blind while the
 * project hub already shows him the same amounts). Reimbursement, billing and
 * payment details stay owner/Finance only.
 */
function withExpenseMoney(context: PortalContext, rows: Row[]): Row[] {
  if (!['owner_admin', 'finance_admin', 'project_manager'].includes(context.principal.role))
    return rows;
  const ids = rows.filter((row) => row.type === 'expense').map((row) => text(row.id));
  const money = new Map<
    string,
    { currency: string; amount_minor: string; project_currency: string; spent_on: string }
  >();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    for (const row of context.sqlite
      .prepare(
        `SELECT e.id,e.currency,CAST(e.amount_minor AS TEXT) amount_minor,p.currency project_currency,e.spent_on
           FROM expense e JOIN project p ON p.id=e.project_id
          WHERE e.id IN (${batch.map(() => '?').join(',')})`,
      )
      .all(...batch) as Array<{
      id: string;
      currency: string;
      amount_minor: string;
      project_currency: string;
      spent_on: string;
    }>)
      money.set(row.id, row);
  }
  return rows.map((row) => {
    const found = row.type === 'expense' ? money.get(text(row.id)) : undefined;
    if (!found) return row;
    // ECB indicative amount in the project currency (T36), never stored.
    const estimate = expenseEstimate(
      context.sqlite,
      found.amount_minor,
      found.currency,
      found.project_currency,
      found.spent_on,
    );
    return {
      ...row,
      expense_currency: found.currency,
      expense_amount_minor: found.amount_minor,
      ...(estimate
        ? {
            expense_estimate_minor: estimate.minor,
            expense_estimate_currency: estimate.currency,
            expense_estimate_rate_date: estimate.rateDate,
          }
        : {}),
    };
  });
}

export type PendingApprovals = {
  visible: Visible;
  /** Authorized, visible rows in submitted / needs_changes (operational and report stages). */
  rows: Row[];
  /** The one "to approve" definition: submitted records waiting for this reviewer. */
  summary: ApprovalPendingSummary;
  /**
   * The part of `summary` this viewer can actually approve (P1): everything for
   * the owner; never their own records for anyone else, and for a project
   * manager never supplier-workforce time (owner-only). Home and the nav badge
   * show this number, so they never promise an approval the viewer cannot make.
   */
  reviewable: ApprovalPendingSummary;
};

/** Whether the viewer may decide this pending row (presentation; the server re-checks). */
export function viewerCanDecide(context: PortalContext, row: Row): boolean {
  if (context.principal.role === 'owner_admin') return true;
  if (text(row.worker_id) === context.principal.userId) return false;
  if (
    context.principal.role === 'project_manager' &&
    row.type === 'time' &&
    isSupplierTimeEntry(context.sqlite, text(row.id))
  )
    return false;
  return true;
}

/**
 * The single source of the pending numbers shown in the nav badge, on Home, in
 * the Approvals tabs and in "Approve all".
 */
export function readPendingApprovals(
  context: PortalContext,
  options: { includeArchived?: boolean; visible?: Visible } = {},
): PendingApprovals {
  const visible =
    options.visible ??
    projectVisibility(
      context.repository.listAssignedProjects(context.principal) as Record<string, unknown>[],
      options.includeArchived ?? false,
    );
  const rows = withExpenseMoney(
    context,
    roleRows(
      context,
      visibleProjectRecords(
        context.repository.listApprovalQueue(context.principal, { view: 'pending' }),
        visible.projectIds,
      ),
    ),
  );
  return {
    visible,
    rows,
    summary: pendingApprovalSummary(rows),
    reviewable: pendingApprovalSummary(
      rows.filter((row) => isPendingApproval(row) && viewerCanDecide(context, row)),
    ),
  };
}

/**
 * Supplier-workforce hours waiting on a PM's projects. They never reach the
 * PM queue (owner-only approval), so the PM is told who approves them (P8).
 */
function ownerOnlyTime(
  context: PortalContext,
  projectIds: ReadonlySet<string> | readonly string[],
): { count: number; ownerName: string } | null {
  if (context.principal.role !== 'project_manager') return null;
  const ids = [...projectIds].map(String).filter((id) => context.principal.projectIds.has(id));
  if (!ids.length) return null;
  const rows = context.sqlite
    .prepare(
      `SELECT id FROM time_entry WHERE approval_state='submitted' AND worker_id<>?
          AND project_id IN (${ids.map(() => '?').join(',')}) LIMIT 500`,
    )
    .all(context.principal.userId, ...ids) as Array<{ id: string }>;
  const count = rows.filter((row) => isSupplierTimeEntry(context.sqlite, String(row.id))).length;
  if (!count) return null;
  const owner = context.sqlite
    .prepare(
      "SELECT name,email FROM user WHERE role='owner_admin' AND status='active' ORDER BY created_at LIMIT 1",
    )
    .get() as { name: string | null; email: string | null } | undefined;
  return { count, ownerName: owner ? personDisplayName(owner.name, owner.email) : '' };
}

/** Who approves a PM's own time and expenses (the owner), named on the queue (T83). */
function ownApprover(context: PortalContext): string {
  if (context.principal.role !== 'project_manager') return '';
  const owner = context.sqlite
    .prepare(
      "SELECT name,email FROM user WHERE role='owner_admin' AND status='active' ORDER BY created_at LIMIT 1",
    )
    .get() as { name: string | null; email: string | null } | undefined;
  return owner ? personDisplayName(owner.name, owner.email) : '';
}

type Labels = {
  workerName: (id: string) => string;
  projectLabel: (id: string) => string;
  projectSearch: (id: string) => string;
  identity: (id: string) => Record<string, unknown>;
};

function queueLabels(context: PortalContext, rows: readonly Row[]): Labels {
  const workerIds = [...new Set(rows.map((row) => text(row.worker_id)).filter(Boolean))];
  const names = new Map<string, string>();
  for (let offset = 0; offset < workerIds.length; offset += 500) {
    const batch = workerIds.slice(offset, offset + 500);
    for (const row of context.sqlite
      .prepare(`SELECT id,name,email FROM user WHERE id IN (${batch.map(() => '?').join(',')})`)
      .all(...batch) as Array<{ id: string; name: string | null; email: string | null }>)
      names.set(row.id, personDisplayName(row.name ?? '', row.email ?? '') || text(row.name));
  }
  const projectIds = [...new Set(rows.map((row) => text(row.project_id)).filter(Boolean))];
  const projects = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < projectIds.length; offset += 500) {
    const batch = projectIds.slice(offset, offset + 500);
    for (const row of context.sqlite
      .prepare(
        `SELECT p.id,p.name project_name,p.project_number,c.display_name client_name
           FROM project p JOIN client c ON c.id=p.client_id
          WHERE p.id IN (${batch.map(() => '?').join(',')})`,
      )
      .all(...batch) as Array<Record<string, unknown>>)
      projects.set(text(row.id), row);
  }
  return {
    workerName: (id) => names.get(id) ?? '',
    projectLabel: (id) => {
      const project = projects.get(id);
      return project
        ? [project.project_number, project.project_name].filter(Boolean).map(text).join(' · ')
        : '';
    },
    projectSearch: (id) => {
      const project = projects.get(id);
      return project
        ? [project.project_number, project.project_name, project.client_name].map(text).join(' ')
        : '';
    },
    identity: (id) => {
      const project = projects.get(id);
      return project
        ? {
            project_name: project.project_name,
            project_number: project.project_number,
            client_name: project.client_name,
          }
        : {};
    },
  };
}

/** Operational detail for the rows actually sent (no rates, cost or billing fields). */
function decorator(context: PortalContext, labels: Labels) {
  const isProjectManager = context.principal.role === 'project_manager';
  const dailyTitle = context.sqlite.prepare(
    'SELECT summary title FROM daily_report WHERE id=? AND project_id=? AND worker_id=?',
  );
  const technicalTitle = context.sqlite.prepare(
    'SELECT system_name title FROM technical_report WHERE id=? AND project_id=? AND author_id=?',
  );
  const dailyDetail = context.sqlite.prepare(
    `SELECT tasks_completed tasks,problems_found problems,open_items open_items,blockers,next_day_plan next_day,
            safety_notes safety,downtime_minutes downtime FROM daily_report
      WHERE id=? AND project_id=? AND worker_id=?`,
  );
  const technicalDetail = context.sqlite.prepare(
    `SELECT change_summary change,validation_result validation,open_risk risk,
            production_impact impact FROM technical_report
      WHERE id=? AND project_id=? AND author_id=?`,
  );
  const expenseIdentity = context.sqlite.prepare(
    `SELECT e.category,e.vendor,e.description,e.amount_minor,e.currency,e.version,
            e.receipt_document_id,d.media_type receipt_media_type
       FROM expense e
       LEFT JOIN document d ON d.id=e.receipt_document_id
      WHERE e.id=? AND e.project_id=? AND e.worker_id=?`,
  );
  const timeDetail = context.sqlite.prepare(
    'SELECT category,start_time,end_time,break_minutes,activity_summary,version FROM time_entry WHERE id=? AND project_id=? AND worker_id=?',
  );
  const latestReviewReason = context.sqlite.prepare(
    "SELECT reason FROM approval_event WHERE entity_type=? AND entity_id=? AND to_state='needs_changes' ORDER BY occurred_at DESC LIMIT 1",
  );
  return (row: Row): Row => {
    const keys = [text(row.id), text(row.project_id), text(row.worker_id)] as const;
    const expense =
      row.type === 'expense'
        ? (expenseIdentity.get(...keys) as
            | {
                category: string;
                vendor: string | null;
                description: string | null;
                amount_minor: string | number;
                currency: string;
                version: number;
                receipt_document_id: string | null;
                receipt_media_type: string | null;
              }
            | undefined)
        : undefined;
    const time =
      row.type === 'time'
        ? (timeDetail.get(...keys) as
            | {
                category: string;
                start_time: string | null;
                end_time: string | null;
                break_minutes: number | null;
                activity_summary: string | null;
                version: number;
              }
            | undefined)
        : undefined;
    const reviewReason =
      row.approval_state === 'needs_changes' && ['time', 'expense'].includes(text(row.type))
        ? (latestReviewReason.get(text(row.type), text(row.id)) as
            | { reason: string | null }
            | undefined)
        : undefined;
    const report = row.type === 'daily' || row.type === 'technical';
    return {
      ...row,
      ...(time
        ? {
            time_category: time.category,
            start_time: time.start_time,
            end_time: time.end_time,
            break_minutes: time.break_minutes,
            activity_summary: text(time.activity_summary).slice(0, 500),
            record_version: time.version,
          }
        : {}),
      ...(reviewReason?.reason ? { review_reason: reviewReason.reason } : {}),
      ...(expense
        ? {
            record_version: expense.version,
            receipt_document_id: expense.receipt_document_id ?? '',
            receipt_media_type: expense.receipt_media_type ?? '',
            expense_category: expense.category,
            expense_label: expense.vendor?.trim() || expense.description || '',
            ...(!isProjectManager
              ? {
                  expense_amount_minor: String(expense.amount_minor),
                  expense_currency: expense.currency,
                }
              : {}),
          }
        : {}),
      ...(report
        ? {
            report_detail: Object.fromEntries(
              Object.entries(
                ((row.type === 'daily' ? dailyDetail : technicalDetail).get(...keys) ?? {}) as Row,
              )
                .filter(
                  ([, detail]) =>
                    detail !== null && String(detail).trim() !== '' && String(detail) !== '0',
                )
                .map(([key, detail]) => [key, String(detail).slice(0, 2000)]),
            ),
            report_title: text(
              (row.type === 'daily' ? dailyTitle : technicalTitle).get(...keys)?.title,
            ),
          }
        : {}),
      worker_name: labels.workerName(text(row.worker_id)),
      ...labels.identity(text(row.project_id)),
    };
  };
}

/** The Approvals page payload: pending by default, server-side search, filters and paging. */
export function loadApprovalQueuePage(
  context: PortalContext,
  url: URL,
  includeArchived: boolean,
  visible?: Visible,
): ApprovalQueuePage & { projects: Record<string, unknown>[] } {
  const pending = readPendingApprovals(context, { includeArchived, visible });
  const decidable = pending.rows.filter((row) => isPendingApproval(row));
  const fallbackTab: ApprovalTab | null = url.searchParams.get('tab')
    ? null
    : pending.summary.time.count === 0
      ? pending.summary.expenses.count
        ? 'expenses'
        : pending.summary.reports
          ? 'reports'
          : null
      : null;
  const query = parseApprovalQueueQuery(url.searchParams, fallbackTab);
  const isOwner = context.principal.role === 'owner_admin';
  const labels = queueLabels(context, pending.rows);
  const decorate = decorator(context, labels);
  const filters = {
    search: query.search,
    worker: query.worker,
    project: query.project,
    week: query.week,
  };
  const filterLabels = { worker: labels.workerName, projectSearch: labels.projectSearch };

  const tabRows = decidable.filter((row) => rowMatchesTab(row, query.tab));
  const options = queueFilterOptions(tabRows, {
    worker: labels.workerName,
    project: labels.projectLabel,
  });
  const matchingAll = filterQueueRows(tabRows, filters, filterLabels);
  // Y4: totals, groups and "Showing N of M" count only what this viewer can
  // decide. A reviewer's own hours/expenses (never self-approvable) are listed
  // apart, collapsed, so the list total matches the tab badge.
  const splitOwn = !isOwner && query.tab !== 'reports';
  const matchingTab = splitOwn
    ? matchingAll.filter((row) => viewerCanDecide(context, row))
    : matchingAll;
  const ownTab = splitOwn
    ? matchingAll
        .filter((row) => !viewerCanDecide(context, row))
        .sort((a, b) => text(b.date).localeCompare(text(a.date)))
    : [];

  // `show` pages the list that is open: the approved list in view=approved, else the queue.
  const pendingShow = query.view === 'approved' ? APPROVAL_PAGE_SIZE : query.show;
  let groups: ApprovalQueuePage['groups'] = [];
  let reports: Row[] = [];
  let groupCount = 0;
  if (query.tab === 'reports') {
    const sorted = [...matchingTab].sort((a, b) => text(a.date).localeCompare(text(b.date)));
    reports = sorted.slice(0, pendingShow).map(decorate);
  } else {
    const all = groupQueueRows(
      matchingTab,
      query.tab === 'time' ? 'time' : 'expense',
      labels.workerName,
    );
    groupCount = all.length;
    groups = all.slice(0, pendingShow).map((group) => ({
      key: group.key,
      kind: group.kind,
      workerId: group.workerId,
      workerName: group.workerName,
      weekStart: group.weekStart,
      rows: group.rows.map(decorate),
    }));
  }

  // "Approve all" acts on every matching submitted hour and expense, oldest first,
  // in batches of APPROVAL_BATCH_LIMIT (one transaction each).
  const approvable = filterQueueRows(
    decidable.filter((row) => row.type === 'time' || row.type === 'expense'),
    filters,
    filterLabels,
  ).sort(
    (a, b) => text(a.date).localeCompare(text(b.date)) || text(a.id).localeCompare(text(b.id)),
  );
  const ownable = isOwner
    ? []
    : approvable.filter((row) => text(row.worker_id) === context.principal.userId);
  const actionable = isOwner
    ? approvable
    : approvable.filter((row) => viewerCanDecide(context, row));
  const batchRows = actionable.slice(0, APPROVAL_BATCH_LIMIT);
  const versionOf = {
    time: context.sqlite.prepare('SELECT version FROM time_entry WHERE id=?'),
    expense: context.sqlite.prepare('SELECT version FROM expense WHERE id=?'),
  };
  const tokens = batchRows.flatMap((row) => {
    const version = (row.type === 'time' ? versionOf.time : versionOf.expense).get(
      text(row.id),
    )?.version;
    return version == null ? [] : [`${text(row.type)}:${text(row.id)}:${text(version)}`];
  });
  const byWorker = new Map<string, Row[]>();
  for (const row of batchRows) {
    const list = byWorker.get(text(row.worker_id)) ?? [];
    list.push(row);
    byWorker.set(text(row.worker_id), list);
  }
  const workers: ApprovalWorkerSummary[] = [...byWorker]
    .map(([workerId, list]) => ({
      workerId,
      workerName: labels.workerName(workerId),
      projects: [...new Set(list.map((row) => labels.projectLabel(text(row.project_id))))],
      ...queueTotals(list),
    }))
    .sort((a, b) => a.workerName.localeCompare(b.workerName));

  const waitingAll = filterQueueRows(
    pending.rows.filter(
      (row) => row.approval_state === 'needs_changes' && rowMatchesTab(row, query.tab),
    ),
    filters,
    filterLabels,
  ).sort((a, b) => text(b.date).localeCompare(text(a.date)));

  // Approved, not invoiced: only on request (it grows with every approved week).
  let approved: ApprovalQueuePage['approved'] = null;
  if (query.view === 'approved') {
    const rows = roleRows(
      context,
      visibleProjectRecords(
        context.repository.listApprovalQueue(context.principal, { view: 'approved' }),
        pending.visible.projectIds,
      ),
    ).filter((row) => rowMatchesTab(row, query.tab));
    const approvedLabels = queueLabels(context, rows);
    const matching = filterQueueRows(rows, filters, {
      worker: approvedLabels.workerName,
      projectSearch: approvedLabels.projectSearch,
    }).sort((a, b) => text(b.date).localeCompare(text(a.date)));
    approved = {
      count: matching.length,
      rows: matching.slice(0, query.show).map(decorator(context, approvedLabels)),
    };
  }

  const financeRows = ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(
    context.principal.role,
  )
    ? visibleProjectRecords(
        context.repository.listApprovalQueue(context.principal, { view: 'finance' }),
        pending.visible.projectIds,
      )
    : [];
  const financeLabels = queueLabels(context, financeRows);

  return {
    projects: pending.visible.projects.map((project) => ({
      id: project.id,
      name: project.name,
      project_number: project.project_number,
      status: project.status,
    })),
    query,
    pageSize: query.view === 'approved' ? APPROVED_PAGE_SIZE : APPROVAL_PAGE_SIZE,
    summary: pending.summary,
    reviewable: pending.reviewable,
    ownerOnlyTime: ownerOnlyTime(context, pending.visible.projectIds),
    ownApprover: ownApprover(context),
    options,
    filtersActive: Boolean(query.search || query.worker || query.project || query.week),
    matching: {
      ...queueTotals(matchingTab),
      reports: query.tab === 'reports' ? matchingTab.length : 0,
      groups: groupCount,
    },
    groups,
    reports,
    waiting: { count: waitingAll.length, rows: waitingAll.slice(0, 25).map(decorate) },
    ownEntries: {
      count: ownTab.length,
      minutes: queueTotals(ownTab).minutes,
      rows: ownTab.slice(0, 25).map(decorate),
    },
    approveAll: {
      matching: queueTotals(actionable),
      batch: queueTotals(batchRows),
      workers,
      tokens,
      ownExcluded: ownable.length,
    },
    approved,
    finance: {
      count: financeRows.length,
      rows: financeRows.slice(0, 50).map(decorator(context, financeLabels)),
    },
  };
}
