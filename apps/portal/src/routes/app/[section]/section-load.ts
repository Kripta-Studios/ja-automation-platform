import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  AssignmentExpensePolicyRepository,
  CrewLeaderRepository,
  MailIdentityRepository,
  listInvoiceEmailDeliveries,
} from '@ja/database';
import { error, redirect } from '@sveltejs/kit';
import { defaultLookbackPeriod, isRealIsoDate } from '$lib/server/iso-date';
import type { ProblemData } from '$lib/problem/contract';
import { openPortalRepository } from '$lib/server/portal-repository';
import { mondayOf } from '$lib/server/portal-week';
import { workerPayOutstanding } from '$lib/server/worker-pay-outstanding';
import { listProjectSettlementWorkers } from '$lib/server/finance-settlement-workers';
import { buildMoneyOverview } from '$lib/server/money-overview';
import { buildRatesOverview } from '$lib/server/rates-overview';
import {
  buildTimeOverview,
  overviewEntries,
  overviewFilters,
  overviewPeriod,
  type TimeOverviewData,
} from '$lib/server/time-overview';
import { buildExpenseOverview, captureExpenses } from '$lib/server/expense-overview';
import {
  reviewFinanceReimbursement,
  withFinanceReimbursementSnapshot,
} from '$lib/server/finance-reimbursement-review';
import type { PageServerLoad } from './$types';
import type { PortalRow } from '$lib/portal/portal-data';
import {
  projectManagerApprovalQueueProjection,
  projectManagerMilestoneProjection,
  projectManagerSearchProjection,
  projectManagerSearchSuggestionsProjection,
} from './role-projections';
import { listMailboxAccounts } from '$lib/server/mail-directory';
import { loadTeamDirectoryExtras } from '$lib/server/team-directory-load';
import {
  includesArchivedProjectHistory,
  normalizeVisibleProjectSelection,
  projectVisibility,
  visibleProjectRecords,
} from '$lib/portal/project-visibility';
import { clientCalendarWindow, normalizeCalendarMonth } from '$lib/portal/client-work-calendar';
import { publishedAssignmentMatches } from '$lib/portal/sections/published-assignment-filter';

/** Own recent hours and last daily report, used to prefill a new daily report. */
function ownReportPrefill(
  sqlite: DatabaseSync,
  userId: string,
  visible: ReadonlySet<string>,
) {
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const recentTime = (
    sqlite
      .prepare(
        // Effective hours only, as on the Time screen: an entry superseded by a live
        // correction counts once, as the correction.
        `SELECT project_id projectId, work_date workDate, SUM(minutes) minutes
           FROM time_entry
          WHERE worker_id=? AND work_date>=? AND approval_state NOT IN ('void','rejected')
            AND NOT EXISTS (
              SELECT 1 FROM record_correction_link rcl
                JOIN time_entry correction ON correction.id=rcl.correction_id
               WHERE rcl.record_type='time_entry' AND rcl.original_id=time_entry.id
                 AND correction.approval_state NOT IN ('rejected','void'))
          GROUP BY project_id, work_date
          ORDER BY work_date DESC`,
      )
      .all(userId, since) as unknown as Array<{ projectId: string; workDate: string; minutes: number }>
  )
    .filter((row) => visible.has(String(row.projectId)))
    .map((row) => ({ ...row, minutes: Number(row.minutes) }));
  const last = (
    sqlite
      .prepare(
        `SELECT project_id projectId, work_date workDate, COALESCE(site_shift,'') siteShift,
                COALESCE(open_items,'') openItems, COALESCE(next_day_plan,'') nextDayPlan
           FROM daily_report
          WHERE worker_id=? AND approval_state<>'void'
          ORDER BY work_date DESC, created_at DESC
          LIMIT 5`,
      )
      .all(userId) as unknown as Array<{
      projectId: string;
      workDate: string;
      siteShift: string;
      openItems: string;
      nextDayPlan: string;
    }>
  ).find((row) => visible.has(String(row.projectId)));
  return { recentTime, lastDaily: last ?? null };
}

const sections = [
  'time',
  'reports',
  'expenses',
  'projects',
  'pay',
  'documents',
  'notifications',
  'profile',
  'planning',
  'approvals',
  'billing',
  'finance',
  'ledger',
  'accounting',
  'audit',
];

export const sectionLoad: PageServerLoad = async ({ locals, params, url }) => {
  const section = params.section;
  if (!section || !sections.includes(section)) error(404, 'Page not found');
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (
    ['billing', 'finance', 'ledger', 'accounting'].includes(section) &&
    !['owner_admin', 'finance_admin', 'auditor_read_only'].includes(locals.user.role ?? '')
  )
    error(403, 'Finance access required');
  if (section === 'audit' && !['owner_admin', 'auditor_read_only'].includes(locals.user.role ?? ''))
    error(403, 'Audit access required');
  if (
    section === 'approvals' &&
    !['owner_admin', 'project_manager', 'finance_admin'].includes(locals.user.role ?? '')
  )
    error(403, 'Approval access required');
  const context = openPortalRepository(locals);
  try {
    const restrictedProfile = context.sqlite
      .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
      .get(context.principal.userId) as
      | { profile: 'external_technician' | 'supplier_coordinator' }
      | undefined;
    if (restrictedProfile && !['time', 'expenses', 'reports', 'profile'].includes(section))
      error(403, 'Operational account: access denied');
    const searchQuery = url.searchParams.get('q')?.trim() ?? '';
    const isProjectManager = context.principal.role === 'project_manager';
    const includeArchived = includesArchivedProjectHistory(url.searchParams);
    function normalizeProjectQuery(projectIds: ReadonlySet<string>): string {
      const requested = url.searchParams.get('project');
      const selected = normalizeVisibleProjectSelection(requested, projectIds);
      if (requested && !selected) {
        const canonical = new URL(url);
        canonical.searchParams.delete('project');
        redirect(303, `${canonical.pathname}${canonical.search}${canonical.hash}`);
      }
      return selected;
    }
    const canonicalOwner = (() => {
      if (context.principal.role !== 'owner_admin') return false;
      try {
        new MailIdentityRepository(context.sqlite).assertCanonicalOwner(context.principal);
        return true;
      } catch {
        return false;
      }
    })();
    const common = {
      workers:
        ['owner_admin', 'project_manager', 'finance_admin'].includes(context.principal.role) &&
        ['time', 'expenses', 'reports'].includes(section)
          ? context.repository
              .listAllWorkers(context.principal)
              .filter(
                (worker) =>
                  worker.status === 'active' &&
                  ['worker', 'project_manager'].includes(String(worker.role)),
              )
          : [],
      // Presentation only: lets the shell hide "Include archived" when nothing is archived.
      archivedProjectCount:
        !restrictedProfile &&
        ['owner_admin', 'project_manager', 'finance_admin', 'auditor_read_only'].includes(
          context.principal.role,
        )
          ? context.repository
              .listAssignedProjects(context.principal)
              .filter((project) => project.status === 'archived').length
          : 0,
      // canonicalOwner lets the Ctrl+K navigator offer owner-only People actions.
      user: { ...locals.user, workforceProfile: restrictedProfile?.profile, canonicalOwner },
      section,
      searchQuery,
      searchSuggestions: restrictedProfile
        ? []
        : isProjectManager
          ? projectManagerSearchSuggestionsProjection(
              context.repository.searchSuggestions(context.principal, 24, { includeArchived }),
            )
          : context.repository.searchSuggestions(context.principal, 24, { includeArchived }),
      searchResults:
        !restrictedProfile && searchQuery.length >= 2
          ? isProjectManager
            ? projectManagerSearchProjection(
                context.repository.search(context.principal, searchQuery, { includeArchived }),
              )
            : context.repository.search(context.principal, searchQuery, { includeArchived })
          : [],
    };
    switch (section) {
      case 'time': {
        // One week timesheet (rows = project + category, columns = days) and
        // a compact register. Planned/scheduled hours are never projected
        // into the sheet: only recorded actual time is returned.
        const timeScope = projectVisibility(
          context.repository.listAssignedProjects(context.principal),
          includeArchived,
        );
        const timeProjects = timeScope.projects;
        const selectedProject = normalizeProjectQuery(timeScope.projectIds);
        const timeProjectIds = timeProjects.map((project) => String(project.id));
        const allAssignments = (
          timeProjectIds.length
            ? context.sqlite
                .prepare(
                  `SELECT pm.project_id,pm.user_id AS worker_id,pm.starts_on,pm.ends_on
                     FROM project_member pm
                     JOIN project p ON p.id=pm.project_id
                    WHERE pm.project_id IN (${timeProjectIds.map(() => '?').join(',')})
                      AND pm.status='active'
                      AND p.status IN ('active','planned','paused')`,
                )
                .all(...timeProjectIds)
            : []
        ) as Array<Record<string, unknown>>;
        const delegating = ['owner_admin', 'project_manager'].includes(context.principal.role);
        const assignedWorkerIds = new Set(allAssignments.map((row) => String(row.worker_id)));
        const timeWorkers = delegating
          ? [
              ...(assignedWorkerIds.has(context.principal.userId) &&
              !(common.workers as Array<{ id: string }>).some(
                (worker) => String(worker.id) === context.principal.userId,
              )
                ? [{ id: context.principal.userId, name: locals.user.name ?? locals.user.email }]
                : []),
              ...(common.workers as Array<Record<string, unknown>>)
                .filter((worker) => assignedWorkerIds.has(String(worker.id)))
                .map((worker) => ({ id: String(worker.id), name: String(worker.name ?? '') })),
            ]
          : [];
        const requestedWorker = url.searchParams.get('worker')?.trim() ?? '';
        const timeWorkerId = !delegating
          ? context.principal.userId
          : timeWorkers.some((worker) => worker.id === requestedWorker)
            ? requestedWorker
            : context.principal.userId;
        const timeAssignments = allAssignments.filter(
          (assignment) => String(assignment.worker_id) === timeWorkerId,
        );
        // "One day" mode selects a day; the sheet loads that day's ISO week.
        const requestedDay = url.searchParams.get('day');
        const timeDay = requestedDay && isRealIsoDate(requestedDay) ? requestedDay : '';
        const weekStart = mondayOf(timeDay || url.searchParams.get('week'));
        const weekEnd = context.repository.listOwnTimeWeek(context.principal, weekStart).weekEnd;
        const weekEntries = visibleProjectRecords(
          context.repository.listTimeForScope(context.principal, {
            from: weekStart,
            to: weekEnd,
          }),
          timeScope.projectIds,
        )
          .filter(
            (row) =>
              String(row.worker_id) === timeWorkerId &&
              !['void', 'rejected'].includes(String(row.approval_state)) &&
              !row.active_correction_id,
          )
          .map((row) => {
            if (String(row.approval_state) !== 'needs_changes') return row;
            try {
              const detail = context.repository.timeDetail(context.principal, String(row.id));
              return { ...row, review_reason: detail.review_reason ?? null };
            } catch {
              return row;
            }
          });
        // Hours overview (review): owner, PM (own projects via repository scope),
        // finance and auditor read-only. Operational fields only, no money.
        const canReview = ['owner_admin', 'project_manager', 'finance_admin', 'auditor_read_only'].includes(
          context.principal.role,
        );
        const timeView = canReview && url.searchParams.get('view') === 'overview' ? 'overview' : 'capture';
        let overview: TimeOverviewData | undefined;
        if (timeView === 'overview') {
          const ovWindow = overviewPeriod(url.searchParams);
          const filters = overviewFilters(url.searchParams);
          const { entries, workers } = overviewEntries(
            visibleProjectRecords(
              context.repository.listTimeForScope(context.principal, {
                projectId: selectedProject || undefined,
                from: ovWindow.from,
                to: ovWindow.to,
              }),
              timeScope.projectIds,
            ),
            filters,
          );
          const known = new Map(workers);
          for (const worker of timeWorkers) if (!known.has(worker.id)) known.set(worker.id, worker.name);
          overview = buildTimeOverview({
            entries,
            workers: [...known.entries()].sort((x, y) => x[1].localeCompare(y[1])),
            period: ovWindow,
            filters,
            params: url.searchParams,
          });
        }
        return {
          ...common,
          projects: timeProjects,
          timeAssignments,
          timeWorkers,
          timeWorkerId,
          timeDay,
          timeView,
          canReviewTime: canReview,
          weekEntries,
          overview,
          timeFilter: {
            category: '',
            projectId: selectedProject ?? '',
            workerId: overview?.workerId ?? '',
            status: overview?.status ?? '',
            from: overview?.from ?? '',
            to: overview?.to ?? '',
          },
          weekStart,
          weekEnd,
        };
      }
      case 'reports': {
        const scope = projectVisibility(
          context.repository.listAssignedProjects(context.principal),
          includeArchived,
        );
        normalizeProjectQuery(scope.projectIds);
        return {
          ...common,
          assignments:
            ['owner_admin', 'project_manager'].includes(context.principal.role) &&
            !restrictedProfile
              ? visibleProjectRecords(
                  context.repository.listAssignments(context.principal),
                  scope.projectIds,
                )
              : [],
          projects: scope.projects,
          reportPrefill: ownReportPrefill(context.sqlite, context.principal.userId, scope.projectIds),
          records: visibleProjectRecords(
            context.repository.listOwnReports(context.principal),
            scope.projectIds,
          ),
          technicalChanges: restrictedProfile
            ? []
            : visibleProjectRecords(
                context.v3.listTechnicalChanges(context.principal),
                scope.projectIds,
              ),
          periodReports: restrictedProfile
            ? []
            : visibleProjectRecords(
                context.v3.listPeriodReports(context.principal),
                scope.projectIds,
              ),
        };
      }
      case 'expenses': {
        const authorizedRecords = context.repository.listExpensesForScope(context.principal);
        const weekStart = mondayOf(url.searchParams.get('week'));
        const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
        const weekEnd = weekEndDate.toISOString().slice(0, 10);
        const assignedProjects = context.repository.listAssignedProjects(context.principal);
        // A supplier coordinator may be delegated a crew on a project without
        // receiving the separate supplier-project grant used for their own
        // work. Add only currently authorized crew projects to expense intake;
        // the worker/date is checked again for every saved expense.
        const crewProjects =
          context.principal.role === 'worker'
            ? new CrewLeaderRepository(context.sqlite).projects(context.principal)
            : [];
        const assignedIds = new Set(assignedProjects.map((project) => String(project.id)));
        const delegatedProjects = crewProjects.flatMap((project) => {
          if (assignedIds.has(project.id)) return [];
          const row = context.sqlite
            .prepare(
              'SELECT id,project_number,name,status,currency,timezone,start_date,planned_end_date,actual_end_date,version FROM project WHERE id=?',
            )
            .get(project.id);
          return row ? [row] : [];
        });
        const scope = projectVisibility(
          [...assignedProjects, ...delegatedProjects],
          includeArchived,
        );
        normalizeProjectQuery(scope.projectIds);
        // Returned expenses show the reviewer's note in the list so the person
        // knows what to fix. Rows are already authorized; the note is the same
        // operational review reason the expense detail view returns.
        const reviewNote = (() => {
          let statement: ReturnType<typeof context.sqlite.prepare> | undefined;
          return {
            get: (id: string) =>
              (statement ??= context.sqlite.prepare(
                "SELECT reason FROM approval_event WHERE entity_type='expense' AND entity_id=? AND to_state IN ('needs_changes','rejected') AND (reason IS NULL OR reason NOT LIKE 'Superseded by append-only correction retry %') ORDER BY occurred_at DESC,id DESC LIMIT 1",
              )).get(id),
          };
        })();
        // The owner's capture list shows only expenses the owner entered (for
        // themselves or for someone else), never other people's own drafts.
        const createdByMe = (() => {
          if (context.principal.role !== 'owner_admin') return null;
          try {
            return new Set(
              (
                context.sqlite
                  .prepare(
                    "SELECT entity_id FROM audit_event WHERE actor_id=? AND action='expense.create' AND entity_type='expense'",
                  )
                  .all(context.principal.userId) as Array<{ entity_id: string }>
              ).map((row) => row.entity_id),
            );
          } catch {
            return null;
          }
        })();
        const visibleRecords = visibleProjectRecords(authorizedRecords, scope.projectIds);
        const canReviewExpenses = ['owner_admin', 'finance_admin', 'project_manager'].includes(
          context.principal.role,
        );
        const expenseView =
          canReviewExpenses && url.searchParams.get('view') === 'overview' ? 'overview' : 'capture';
        if (expenseView === 'overview') {
          // Review: aggregates, top groups and one opened group only (never every expense).
          return {
            ...common,
            projects: scope.projects,
            expenseView,
            records: [],
            expenseOverview: buildExpenseOverview(
              visibleRecords as Array<Record<string, unknown>>,
              url.searchParams,
            ),
            weekStart,
            weekEnd,
            weekDraftRecords: [],
          };
        }
        // Capture: only the person's own recent items (drafts and returned items always).
        const capture = captureExpenses(visibleRecords as Array<Record<string, unknown>>, {
          userId: context.principal.userId,
          createdByMe,
          weeks: Number(url.searchParams.get('weeks')) || 0,
          editId: url.searchParams.get('edit') ?? undefined,
        });
        const records = (capture.records as typeof visibleRecords)
          .map((row) => (createdByMe?.has(String(row.id)) ? { ...row, created_by_me: 1 } : row))
          .map((row) =>
            ['needs_changes', 'rejected'].includes(String(row.approval_state))
              ? {
                  ...row,
                  review_note:
                    (reviewNote.get(String(row.id)) as { reason: string | null } | undefined)
                      ?.reason ?? null,
                }
              : row,
          );
        return {
          ...common,
          projects: scope.projects,
          expenseView,
          records,
          expenseCapture: {
            weeks: capture.weeks,
            from: capture.from,
            olderCount: capture.olderCount,
          },
          weekStart,
          weekEnd,
          weekDraftRecords: visibleProjectRecords(
            records,
            projectVisibility(scope.projects).projectIds,
          ).filter(
            (row) =>
              row.approval_state === 'draft' &&
              String(row.spent_on) >= weekStart &&
              String(row.spent_on) <= weekEnd,
          ),
        };
      }
      case 'documents': {
        const scope = projectVisibility(
          context.repository.listAssignedProjects(context.principal),
          includeArchived,
        );
        const projects = scope.projects;
        const requestedProjectId = normalizeProjectQuery(scope.projectIds);
        const selectedDocumentProject =
          projects.find((project) => String(project.id) === requestedProjectId) ?? null;
        return {
          ...common,
          projects,
          selectedDocumentProject,
          documents: context.repository
            .listDocuments(
              context.principal,
              selectedDocumentProject ? String(selectedDocumentProject.id) : undefined,
            )
            .filter(
              (document) =>
                !document.project_id || scope.projectIds.has(String(document.project_id)),
            ),
          // Owner-only: archived documents (bytes retained) listed for restore.
          archivedDocuments:
            includeArchived && context.principal.role === 'owner_admin'
              ? context.repository.listArchivedDocuments(
                  context.principal,
                  selectedDocumentProject ? String(selectedDocumentProject.id) : undefined,
                )
              : [],
        };
      }
      case 'pay': {
        if (context.principal.role === 'owner_admin')
          redirect(303, `/j-aautomation/app/manage/worker-pay${url.search}`);
        if (!['worker', 'project_manager'].includes(context.principal.role))
          error(403, 'Worker or project manager role required');
        const lookback = defaultLookbackPeriod();
        const startValues = url.searchParams.getAll('start');
        const endValues = url.searchParams.getAll('end');
        const periodStart = startValues[0] ?? lookback.periodStart;
        const periodEnd = endValues[0] ?? lookback.periodEnd;
        const fieldErrors: Record<string, string[]> = {};
        if (startValues.length > 1 || !isRealIsoDate(periodStart))
          fieldErrors.start = ['problem.pay.startInvalid'];
        if (endValues.length > 1 || !isRealIsoDate(periodEnd))
          fieldErrors.end = ['problem.pay.endInvalid'];
        if (!fieldErrors.start && !fieldErrors.end && periodStart > periodEnd)
          fieldErrors.end = ['problem.pay.endBeforeStart'];
        if (Object.keys(fieldErrors).length) {
          const payPeriodProblem = {
            code: 'PAY_PERIOD_INVALID',
            messageKey: 'problem.pay.periodInvalid',
            message: 'Choose one valid From and Through date; Through must be on or after From.',
            params: {},
            fieldErrors,
            remedies: [{ id: 'correct_fields' }],
            correlationId: locals.correlationId || randomBytes(16).toString('hex'),
          } satisfies ProblemData;
          return { ...common, periodStart, periodEnd, payPeriodProblem };
        }

        const pay = context.v3.workerPay(context.principal, periodStart, periodEnd);
        const settlements = context.v3.listCompensationSettlements(
          context.principal,
          periodStart,
          periodEnd,
        );
        // My Pay is always the signed-in person's own statement. A PM can review
        // project-team work elsewhere, but that broader scope must never cross
        // this compensation boundary.
        const payActivities = context.repository
          .listWorkerStatementTime(context.principal, periodStart, periodEnd)
          .map((row) => ({
            id: String(row.id),
            projectNumber: String(row.project_number),
            projectName: String(row.project_name),
            date: String(row.work_date),
            category: String(row.category),
            activitySummary: String(row.activity_summary ?? ''),
            actualMinutes: Number(row.minutes),
            ...(row.start_time && row.end_time
              ? {
                  startTime: String(row.start_time),
                  endTime: String(row.end_time),
                  ...(row.break_minutes != null ? { breakMinutes: Number(row.break_minutes) } : {}),
                }
              : {}),
            approvalState: String(row.approval_state),
          }));
        const payExpenses = context.repository
          .listWorkerStatementExpenses(context.principal, periodStart, periodEnd)
          .map((row) => ({
            id: row.id,
            projectNumber: row.projectNumber,
            spentOn: row.spentOn,
            vendor: row.vendor,
            description: row.description,
            category: row.category,
            reimbursementAmountMinor: row.reimbursementAmountMinor,
            currency: row.currency,
            approvalState: row.approvalState,
            reimbursementState: row.reimbursementState,
            expectedReimbursementOn: row.expectedReimbursementOn,
            reimbursedAt: row.reimbursedAt,
          }));

        return {
          ...common,
          periodStart,
          periodEnd,
          pay,
          settlements,
          payActivities,
          payExpenses,
          payOutstanding: workerPayOutstanding(settlements, payExpenses),
        };
      }
      // The base project list is already role-scoped by the repository. Add
      // only the identity/site fields needed by the Clients directory using
      // those authorized ids; this keeps the directory useful without
      // widening the worker/PM projection to finance data.
      case 'projects': {
        const authorizedProjects = context.repository.listAssignedProjects(context.principal);
        // A direct assignment link must retain a project that became unavailable
        // after the link was created. Expose only the normal project-list columns,
        // and only when this manager still has an effective membership. This is
        // display access, never assignment permission.
        const linkedProjectId = url.searchParams.get('project')?.trim();
        const unavailableLinkedProject =
          context.principal.role === 'project_manager' &&
          url.searchParams.get('action') === 'assign-worker' &&
          linkedProjectId &&
          !authorizedProjects.some((project) => String(project.id) === linkedProjectId)
            ? context.sqlite
                .prepare(
                  `SELECT p.id,p.project_number,p.name,p.status,p.currency,p.timezone,
                          p.start_date,p.planned_end_date,p.actual_end_date,p.version
                     FROM project p
                     JOIN project_member pm ON pm.project_id=p.id
                    WHERE p.id=? AND p.status IN ('closing','closed')
                      AND pm.user_id=? AND pm.status='active'
                      AND pm.starts_on<=date('now')
                      AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
                    LIMIT 1`,
                )
                .get(linkedProjectId, context.principal.userId)
            : undefined;
        const projectHistory = includeArchived || url.searchParams.get('status') === 'archived';
        const directoryScope = projectVisibility(
          unavailableLinkedProject
            ? [...authorizedProjects, unavailableLinkedProject]
            : authorizedProjects,
          projectHistory,
        );
        const visibleProjects = directoryScope.projects;
        const authorizedAssignments =
          context.principal.role !== 'worker'
            ? visibleProjectRecords(
                context.repository.listAssignments(context.principal),
                directoryScope.projectIds,
              )
            : [];
        const assignmentIds = authorizedAssignments
          .map((assignment) => String(assignment.id ?? ''))
          .filter(Boolean);
        const actualMinutesByAssignment = new Map(
          (assignmentIds.length
            ? (context.sqlite
                .prepare(
                  `SELECT pm.id,
                          COALESCE(SUM(CASE
                            WHEN t.approval_state NOT IN ('rejected','void') THEN t.minutes
                            ELSE 0
                          END),0) actual_minutes
                     FROM project_member pm
                     LEFT JOIN time_entry t
                       ON t.project_id=pm.project_id
                      AND t.worker_id=pm.user_id
                      AND t.work_date>=pm.starts_on
                      AND (pm.ends_on IS NULL OR t.work_date<=pm.ends_on)
                    WHERE pm.id IN (${assignmentIds.map(() => '?').join(',')})
                    GROUP BY pm.id`,
                )
                .all(...assignmentIds) as Array<{ id: string; actual_minutes: number }>)
            : []
          ).map((row) => [row.id, row.actual_minutes]),
        );
        const projectIds = visibleProjects
          .map((project) => String(project.id ?? ''))
          .filter(Boolean);
        const directoryProjects = projectIds.length
          ? context.sqlite
              .prepare(
                `SELECT p.id,p.client_id,p.project_number,p.name,p.status,p.currency,p.timezone,
                          p.cost_center_code,p.po_number,
                          p.start_date,p.planned_end_date,p.actual_end_date,p.version,
                          p.site_name,p.country,c.client_number,c.display_name client_name
                     FROM project p
                     LEFT JOIN client c ON c.id=p.client_id
                    WHERE p.id IN (${projectIds.map(() => '?').join(',')})
                    ORDER BY p.project_number`,
              )
              .all(...projectIds)
          : [];
        const calendarMonth = normalizeCalendarMonth(url.searchParams.get('calendarMonth'));
        const calendarWindow = clientCalendarWindow(calendarMonth);
        const canViewClientWorkCalendar = [
          'owner_admin',
          'finance_admin',
          'project_manager',
        ].includes(context.principal.role);
        const calendarEntries = canViewClientWorkCalendar
          ? context.repository.listClientCalendarEntries(
              context.principal,
              calendarWindow.from,
              calendarWindow.to,
            )
          : [];
        const projectManagerClients =
          context.principal.role === 'project_manager' && projectIds.length
            ? context.sqlite
                .prepare(
                  `SELECT c.id,c.client_number,c.client_code,c.display_name,c.legal_name,c.status
                     FROM client c
                    WHERE EXISTS (
                      SELECT 1 FROM project p
                       WHERE p.client_id=c.id AND p.id IN (${projectIds.map(() => '?').join(',')})
                    )
                    ORDER BY c.client_number`,
                )
                .all(...projectIds)
            : [];
        let mailboxes: Awaited<ReturnType<typeof listMailboxAccounts>> = [];
        let mailboxesUnavailable = false;
        if (canonicalOwner) {
          try {
            mailboxes = await listMailboxAccounts(context.sqlite);
          } catch {
            mailboxesUnavailable = true;
          }
        }
        const portalAccessForUser = canonicalOwner
          ? context.sqlite.prepare(
              `SELECT
                 EXISTS(
                   SELECT 1 FROM account a
                    WHERE a.user_id=?
                      AND (a.provider_id<>'credential' OR length(COALESCE(a.password,''))>0)
                 ) OR EXISTS(SELECT 1 FROM passkey pk WHERE pk.user_id=?) has_portal_access`,
            )
          : null;
        const supplierDirectoryForUser = canonicalOwner
          ? context.sqlite.prepare(
              `SELECT profile workforce_profile,supplier_id,
                      d.phone,d.company,d.contact_name,d.notes
                 FROM supplier_user_profile p
                 LEFT JOIN supplier_contact_directory d ON d.user_id=p.user_id
                WHERE p.user_id=?`,
            )
          : null;
        const projectWorkers =
          context.principal.role !== 'worker'
            ? context.repository
                .listAllWorkers(context.principal)
                .filter(
                  (worker) =>
                    includeArchived ||
                    // The People directory filters status on the page itself.
                    url.searchParams.get('view') === 'team' ||
                    url.searchParams.get('includeInactive') === '1' ||
                    url.searchParams.get('status') === 'inactive' ||
                    worker.status === 'active',
                )
                .map((worker) => ({
                  ...worker,
                  ...(canonicalOwner
                    ? {
                        ...(supplierDirectoryForUser?.get(String(worker.id)) ?? {}),
                        ...(portalAccessForUser?.get(String(worker.id), String(worker.id)) ?? {}),
                      }
                    : {}),
                }))
            : [];
        const eligibleWorkerIds = projectWorkers
          .filter((worker) => worker.status === 'active')
          .map((worker) => String(worker.id));
        const workerExpertise = eligibleWorkerIds.length
          ? context.sqlite
              .prepare(
                `SELECT ws.worker_id,ws.skill_id
                   FROM worker_skill ws
                  WHERE ws.worker_id IN (${eligibleWorkerIds.map(() => '?').join(',')})`,
              )
              .all(...eligibleWorkerIds)
          : [];
        // People directory: week hours, pending counts, mailbox link and (Owner
        // only) the viewed person's pay terms. Scoped to visible projects.
        const teamExtras =
          url.searchParams.get('view') === 'team' && context.principal.role !== 'worker'
            ? loadTeamDirectoryExtras(context.sqlite, {
                role: context.principal.role,
                canonicalOwner,
                projectIds: [...directoryScope.projectIds],
                personId: url.searchParams.get('person'),
                projects: directoryProjects as Array<Record<string, unknown>>,
              })
            : null;
        return {
          ...common,
          ...(teamExtras ?? {}),
          projects: directoryProjects,
          clients:
            context.principal.role === 'owner_admin' ||
            context.principal.role === 'finance_admin' ||
            context.principal.role === 'auditor_read_only'
              ? context.repository
                  .listClients(context.principal)
                  .filter((client) => includeArchived || client.status !== 'archived')
              : projectManagerClients.filter(
                  (client) => includeArchived || client.status !== 'archived',
                ),
          contacts:
            context.principal.role === 'worker'
              ? []
              : context.repository.listAllClientContacts(context.principal),
          workers: projectWorkers,
          calendarEntries,
          calendarMonth,
          canViewWorkCalendar: canViewClientWorkCalendar,
          allSkills:
            context.principal.role !== 'worker'
              ? context.repository.listSkills(context.principal)
              : [],
          workerSkills: workerExpertise,
          suppliers: canonicalOwner
            ? context.sqlite
                .prepare("SELECT id,name FROM supplier WHERE status='active' ORDER BY name")
                .all()
            : [],
          mailboxes,
          mailboxesUnavailable,
          mailboxDirectoryStatus: mailboxesUnavailable ? 'unavailable' : 'ready',
          mailboxDirectoryError: mailboxesUnavailable
            ? 'The live Stalwart directory could not be reached.'
            : null,
          canonicalOwner,
          canManageMail: canonicalOwner,
          // Owner People directory: unused invitation links (pending or recently expired).
          invitations:
            canonicalOwner && url.searchParams.get('view') === 'team'
              ? context.v3.listOpenInvitations(context.principal)
              : [],
          assignmentToday: new Date().toISOString().slice(0, 10),
          assignments: authorizedAssignments.map((assignment) => ({
            ...assignment,
            actual_minutes: actualMinutesByAssignment.get(String(assignment.id ?? '')) ?? 0,
          })),
        };
      }
      case 'approvals': {
        const scope = projectVisibility(
          context.repository.listAssignedProjects(context.principal),
          includeArchived,
        );
        normalizeProjectQuery(scope.projectIds);
        const approvalIdentity = context.sqlite.prepare(
          `SELECT p.name project_name,p.project_number,c.display_name client_name
             FROM project p
             JOIN client c ON c.id=p.client_id
            WHERE p.id=?`,
        );
        // Titles are operational context, looked up only after queue-row authorization.
        const dailyApprovalTitle = context.sqlite.prepare(
          'SELECT summary title FROM daily_report WHERE id=? AND project_id=? AND worker_id=?',
        );
        const technicalApprovalTitle = context.sqlite.prepare(
          'SELECT system_name title FROM technical_report WHERE id=? AND project_id=? AND author_id=?',
        );
        // Operational report content for the in-queue "Read" preview (no money fields).
        const dailyApprovalDetail = context.sqlite.prepare(
          `SELECT tasks_completed tasks,problems_found problems,blockers,next_day_plan next_day,
                  safety_notes safety,downtime_minutes downtime FROM daily_report
            WHERE id=? AND project_id=? AND worker_id=?`,
        );
        const technicalApprovalDetail = context.sqlite.prepare(
          `SELECT change_summary change,validation_result validation,open_risk risk,
                  production_impact impact FROM technical_report
            WHERE id=? AND project_id=? AND author_id=?`,
        );
        const expenseApprovalIdentity = context.sqlite.prepare(
          `SELECT e.category,e.vendor,e.description,e.amount_minor,e.currency,e.version,
                  e.receipt_document_id,d.media_type receipt_media_type
             FROM expense e
             LEFT JOIN document d ON d.id=e.receipt_document_id
            WHERE e.id=? AND e.project_id=? AND e.worker_id=?`,
        );
        // Operational detail for grouped week review (no rates, cost or billing fields).
        const timeApprovalDetail = context.sqlite.prepare(
          'SELECT category,start_time,end_time,break_minutes,activity_summary,version FROM time_entry WHERE id=? AND project_id=? AND worker_id=?',
        );
        // The reviewer's latest note explains why a record is waiting for its author.
        const latestReviewReason = context.sqlite.prepare(
          "SELECT reason FROM approval_event WHERE entity_type=? AND entity_id=? AND to_state='needs_changes' ORDER BY occurred_at DESC LIMIT 1",
        );
        return {
          ...common,
          projects: scope.projects,
          records: visibleProjectRecords(
            isProjectManager
              ? projectManagerApprovalQueueProjection(
                  context.repository.listApprovalQueue(context.principal),
                )
              : context.repository.listApprovalQueue(context.principal),
            scope.projectIds,
          ).map((row) => {
            // Read identity only for an already-authorized queue row. PMs receive
            // operational category/vendor context without expense money.
            const expense =
              row.type === 'expense'
                ? (expenseApprovalIdentity.get(
                    String(row.id),
                    String(row.project_id),
                    String(row.worker_id),
                  ) as
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
                ? (timeApprovalDetail.get(
                    String(row.id),
                    String(row.project_id),
                    String(row.worker_id),
                  ) as
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
              row.approval_state === 'needs_changes' &&
              ['time', 'expense'].includes(String(row.type))
                ? (latestReviewReason.get(String(row.type), String(row.id)) as
                    | { reason: string | null }
                    | undefined)
                : undefined;
            return {
              ...row,
              ...(time
                ? {
                    time_category: time.category,
                    start_time: time.start_time,
                    end_time: time.end_time,
                    break_minutes: time.break_minutes,
                    activity_summary: time.activity_summary ?? '',
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
                          expense_amount_minor: expense.amount_minor,
                          expense_currency: expense.currency,
                        }
                      : {}),
                  }
                : {}),
              ...(['daily', 'technical'].includes(String(row.type))
                ? {
                    report_detail: Object.fromEntries(
                      Object.entries(
                        ((row.type === 'daily' ? dailyApprovalDetail : technicalApprovalDetail).get(
                          String(row.id),
                          String(row.project_id),
                          String(row.worker_id),
                        ) ?? {}) as Record<string, unknown>,
                      )
                        .filter(([, detail]) => detail !== null && String(detail).trim() !== '' && String(detail) !== '0')
                        .map(([key, detail]) => [key, String(detail).slice(0, 2000)]),
                    ),
                    report_title: String(
                      (row.type === 'daily' ? dailyApprovalTitle : technicalApprovalTitle).get(
                        String(row.id),
                        String(row.project_id),
                        String(row.worker_id),
                      )?.title ?? '',
                    ),
                  }
                : {}),
              worker_name:
                context.sqlite
                  .prepare('SELECT name FROM user WHERE id=?')
                  .get(String(row.worker_id ?? ''))?.name ?? '',
              ...(approvalIdentity.get(String(row.project_id ?? '')) ?? {}),
            };
          }),
          milestones: visibleProjectRecords(
            isProjectManager
              ? projectManagerMilestoneProjection(
                  context.repository.listMilestonesForReview(context.principal),
                )
              : context.repository.listMilestonesForReview(context.principal),
            scope.projectIds,
          ).map((row) => ({
            ...row,
            ...(approvalIdentity.get(String(row.project_id ?? '')) ?? {}),
          })),
          technicalChanges:
            context.principal.role === 'owner_admin' || context.principal.role === 'project_manager'
              ? visibleProjectRecords(
                  context.v3.listTechnicalChanges(context.principal, true),
                  scope.projectIds,
                )
              : [],
        };
      }
      case 'planning': {
        const scope = projectVisibility(
          context.repository.listAssignedProjects(context.principal),
          includeArchived,
        );
        const selectedProjectId = normalizeProjectQuery(scope.projectIds);
        const selectedWorkerId = url.searchParams.get('worker');
        // Published-schedule filters use workers represented in the authorized
        // schedule, including historical rows whose current assignment ended.
        // Derive options before the Worker filter so users can switch workers.
        const allRows = visibleProjectRecords(
          context.repository.listPlanning(context.principal),
          scope.projectIds,
        );
        const projectRows = allRows.filter(
          (row) => !selectedProjectId || String(row.project_id) === selectedProjectId,
        );
        const representedWorkers = new Map<string, string>();
        for (const row of projectRows) {
          const id = String(row.worker_id ?? '').trim();
          if (id) representedWorkers.set(id, String(row.worker_name ?? id));
        }
        const duplicateNames = new Map<string, number>();
        for (const name of representedWorkers.values())
          duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1);
        const planningFilterWorkers = [...representedWorkers].map(([id, name]) => ({
          id,
          name,
          label: (duplicateNames.get(name) ?? 0) > 1 ? `${name} · ${id}` : name,
        }));
        planningFilterWorkers.sort(
          (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        );
        // Scale: default to this week + next, one search box, server-side pages
        // of 25. Only the page rows are serialized; the calendar gets compact
        // events for a three-month window of the same filters.
        const PLANNING_PAGE_SIZE = 25;
        const shiftDays = (date: string, days: number) => {
          const value = new Date(`${date}T00:00:00.000Z`);
          value.setUTCDate(value.getUTCDate() + days);
          return value.toISOString().slice(0, 10);
        };
        const thisMonday = mondayOf(new Date().toISOString().slice(0, 10));
        const requestedWeek = url.searchParams.get('week') ?? '';
        const requestedPeriod = url.searchParams.get('period') ?? '';
        const planningPeriod =
          requestedWeek && isRealIsoDate(requestedWeek)
            ? 'week'
            : ['this_week', 'next_week', 'last_week', 'all'].includes(requestedPeriod)
              ? requestedPeriod
              : 'upcoming';
        const periodFrom =
          planningPeriod === 'week'
            ? mondayOf(requestedWeek)
            : planningPeriod === 'next_week'
              ? shiftDays(thisMonday, 7)
              : planningPeriod === 'last_week'
                ? shiftDays(thisMonday, -7)
                : planningPeriod === 'all'
                  ? ''
                  : thisMonday;
        const periodTo =
          planningPeriod === 'all'
            ? ''
            : shiftDays(periodFrom, planningPeriod === 'upcoming' ? 13 : 6);
        const planningSearch = (url.searchParams.get('find') ?? '').trim().slice(0, 120);
        const projectById = new Map(
          scope.projects.map((project) => [String(project.id), project as unknown as PortalRow]),
        );
        const filtered = projectRows.filter(
          (row) =>
            (!selectedWorkerId || String(row.worker_id) === selectedWorkerId) &&
            publishedAssignmentMatches(row as PortalRow, projectById.get(String(row.project_id)), {
              search: planningSearch,
              projectId: '',
              workerId: '',
            }),
        );
        const overlaps = (row: Record<string, unknown>, from: string, to: string) => {
          const start = String(row.starts_at ?? '').slice(0, 10);
          const end = String(row.ends_at ?? row.starts_at ?? '').slice(0, 10) || start;
          return (!to || start <= to) && (!from || end >= from);
        };
        const inScope = filtered
          .filter((row) => overlaps(row, periodFrom, periodTo))
          .sort(
            (left, right) =>
              String(left.starts_at).localeCompare(String(right.starts_at)) ||
              String(left.worker_name ?? '').localeCompare(String(right.worker_name ?? '')),
          );
        const pageCount = Math.max(1, Math.ceil(inScope.length / PLANNING_PAGE_SIZE));
        const planningPageNumber = Math.min(
          pageCount,
          Math.max(1, Math.floor(Number(url.searchParams.get('ppage') ?? '1')) || 1),
        );
        const pageRows = inScope.slice(
          (planningPageNumber - 1) * PLANNING_PAGE_SIZE,
          planningPageNumber * PLANNING_PAGE_SIZE,
        );
        const focusId = url.searchParams.get('focus') ?? '';
        const planningFocus = focusId
          ? (allRows.find((row) => String(row.id) === focusId) ?? null)
          : null;
        const calendarAnchor =
          url.searchParams.get('date') && isRealIsoDate(url.searchParams.get('date') ?? '')
            ? String(url.searchParams.get('date'))
            : periodFrom || thisMonday;
        const calendarFrom = `${shiftDays(calendarAnchor, -45).slice(0, 7)}-01`;
        const calendarTo = shiftDays(calendarAnchor, 75);
        const planningCalendar = filtered
          .filter((row) => overlaps(row, calendarFrom, calendarTo))
          .slice(0, 1500)
          .map((row) => ({
            id: row.id,
            project_id: row.project_id,
            project_number: row.project_number,
            worker_name: row.worker_name,
            planned_minutes: row.planned_minutes,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
          }));
        const manager = context.principal.role !== 'worker';
        return {
          ...common,
          records: pageRows,
          planningFocus,
          planningCalendar,
          planningList: {
            period: planningPeriod,
            from: periodFrom,
            to: periodTo,
            search: planningSearch,
            page: planningPageNumber,
            pageSize: PLANNING_PAGE_SIZE,
            total: inScope.length,
            allTotal: allRows.length,
          },
          planningFilterWorkers,
          projects: scope.projects,
          skills: context.repository.listSkills(context.principal),
          workers: manager ? context.repository.listPlanningWorkerOptions(context.principal) : [],
          // Only what the create/edit forms need to offer eligible workers.
          assignments: manager
            ? visibleProjectRecords(
                context.repository.listAssignments(context.principal),
                scope.projectIds,
              )
                .filter((assignment) => assignment.status === 'active')
                .map((assignment) => ({
                project_id: assignment.project_id,
                worker_id: assignment.worker_id ?? assignment.user_id,
                status: assignment.status,
                starts_on: assignment.starts_on,
                ends_on: assignment.ends_on,
              }))
            : [],
        };
      }
      case 'profile': {
        // Owner/finance administrators can inspect and manage the workforce from this screen.
        // Keep the target selection server-side and constrained to the same active-worker list
        // used by the repository so a forged `?worker=` cannot broaden the data scope.
        const workforceAdmin = ['owner_admin', 'finance_admin'].includes(context.principal.role);
        const canInspectWorkforce = workforceAdmin || context.principal.role === 'project_manager';
        const workers = canInspectWorkforce
          ? context.repository
              .listAllWorkers(context.principal)
              .filter(
                (worker) =>
                  worker.status === 'active' &&
                  ['worker', 'project_manager'].includes(String(worker.role)),
              )
          : [];
        const requestedWorkerId = url.searchParams.get('worker')?.trim();
        const validRequestedWorkerId =
          requestedWorkerId && workers.some((worker) => String(worker.id) === requestedWorkerId)
            ? requestedWorkerId
            : undefined;
        const fallbackWorkerId = String(
          workers.find((worker) => String(worker.id) === context.principal.userId)?.id ??
            workers[0]?.id ??
            context.principal.userId,
        );
        const targetWorkerId = canInspectWorkforce
          ? (validRequestedWorkerId ?? fallbackWorkerId)
          : context.principal.userId;
        const workerSkills = context.repository.listWorkerSkills(context.principal, targetWorkerId);
        return {
          ...common,
          workers: workers,
          selectedWorkerId: targetWorkerId,
          // `skills` is retained for existing worker-facing markup; `workerSkills` makes the
          // selected scoped target explicit for the editor.
          skills: workerSkills,
          workerSkills,
          allSkills: context.repository.listSkills(context.principal),
          availability: context.repository.listWorkerAvailability(
            context.principal,
            targetWorkerId,
          ),
        };
      }
      case 'notifications':
        return { ...common, records: context.repository.listNotifications(context.principal) };
      case 'billing': {
        const scope = projectVisibility(
          context.repository.listFinanceProjects(context.principal),
          includeArchived,
        );
        normalizeProjectQuery(scope.projectIds);
        return {
          ...common,
          billingRules: visibleProjectRecords(
            context.repository.listBillingRules(context.principal),
            scope.projectIds,
          ),
          invoiceEmailDeliveries:
            context.principal.role === 'auditor_read_only'
              ? []
              : listInvoiceEmailDeliveries(context.sqlite, context.principal),
          invoices: context.repository.listInvoices(context.principal).map((invoice) => ({
            ...invoice,
            // A command token belongs to the displayed payment form, not to invoice.version:
            // recording a payment must not consume the invoice concurrency version. A fresh
            // server token on the next rendered form permits a later partial payment while an
            // identical replay of the current form remains idempotent.
            paymentCommandToken: randomBytes(32).toString('base64url'),
          })),
          ledger: context.v3.masterLedger(context.principal),
          projects: scope.projects,
          legalEntities: context.repository.listLegalEntities(context.principal),
          taxProfiles: context.repository.listTaxProfiles(context.principal),
          contacts: context.repository.listAllClientContacts(context.principal),
        };
      }
      case 'finance': {
        const requestedFinanceView = (url.searchParams.get('view') ?? '').trim().toLowerCase();
        const financeView = ['economic', 'commercial'].includes(requestedFinanceView)
          ? requestedFinanceView
          : 'overview';
        const scope = projectVisibility(
          context.repository.listFinanceProjects(context.principal),
          includeArchived,
        );
        const projects = scope.projects;
        const requestedProject = normalizeProjectQuery(scope.projectIds);
        const selected = requestedProject || (projects[0] as { id?: string } | undefined)?.id || '';
        const canManageCanonicalAuthority = ['owner_admin', 'finance_admin'].includes(
          context.principal.role,
        );
        // V3 owns authorization and effective-date filtering; the route only selects the current
        // project and serializes the already-authorized rows for the UI.
        const settlements = selected
          ? context.v3.listCompensationSettlements(
              context.principal,
              undefined,
              undefined,
              selected,
            )
          : [];
        const settlementIds = new Set(settlements.map((settlement) => String(settlement.id)));
        const financeToday = new Date().toISOString().slice(0, 10);
        const requestedAsOf = url.searchParams.get('asOf') ?? '';
        const parsedAsOf = new Date(`${requestedAsOf}T00:00:00.000Z`);
        const commercialAsOf =
          /^\d{4}-\d{2}-\d{2}$/u.test(requestedAsOf) &&
          Number.isFinite(parsedAsOf.getTime()) &&
          parsedAsOf.toISOString().slice(0, 10) === requestedAsOf
            ? requestedAsOf
            : financeToday;
        const commercialCategory =
          url.searchParams.get('category')?.trim().slice(0, 80) || 'regular';
        // Retained inactive memberships can be reviewed within their recorded date interval.
        // A recorded end date is required, matching the commercial resolver's boundary.
        const commercialTermsSummary = selected
          ? (
              context.sqlite
                .prepare(
                  `SELECT pm.id,pm.user_id,u.name,pm.version,pm.starts_on,pm.ends_on,
                          pm.status assignment_status,u.status worker_status,
                          p.currency project_currency,
                          pm.client_bill_rule_id,pm.worker_compensation_rule_id,
                          pm.internal_cost_rule_id,
                          pm.allow_global_compensation_fallback,
                          pm.allow_global_internal_cost_fallback,
                          pm.worker_expense_reimbursement_override
                     FROM project_member pm
                     JOIN user u ON u.id=pm.user_id
                     JOIN project p ON p.id=pm.project_id
                    WHERE pm.project_id=?
                      AND ((pm.status='active' AND u.status='active')
                        OR (pm.status='inactive' AND pm.ends_on IS NOT NULL))
                      AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
                    ORDER BY u.name,pm.id`,
                )
                .all(selected, commercialAsOf, commercialAsOf) as Array<{
                id: string;
                user_id: string;
                name: string;
                version: number;
                starts_on: string;
                ends_on: string | null;
                assignment_status: string;
                worker_status: string;
                project_currency: string;
                client_bill_rule_id: string | null;
                worker_compensation_rule_id: string | null;
                internal_cost_rule_id: string | null;
                allow_global_compensation_fallback: number;
                allow_global_internal_cost_fallback: number;
                worker_expense_reimbursement_override: string | null;
              }>
            ).map((member) => {
              const terms = context.v3.resolveAssignmentCommercialTerms(
                context.principal,
                selected,
                member.user_id,
                commercialCategory,
                commercialAsOf,
              );
              const reimbursement = new AssignmentExpensePolicyRepository(
                context.sqlite,
              ).effectiveReimbursementPreference(selected, member.id, commercialAsOf);
              return {
                assignmentId: member.id,
                assignmentVersion: member.version,
                assignmentStartsOn: member.starts_on,
                assignmentEndsOn: member.ends_on,
                assignmentStatus: member.assignment_status,
                workerStatus: member.worker_status,
                canConfigure:
                  member.assignment_status === 'active' && member.worker_status === 'active',
                historicalReadOnly: member.assignment_status === 'inactive',
                projectCurrency: member.project_currency,
                workerId: member.user_id,
                workerName: member.name,
                clientBillRuleId: member.client_bill_rule_id,
                workerCompensationRuleId: member.worker_compensation_rule_id,
                internalCostRuleId: member.internal_cost_rule_id,
                allowGlobalCompensation: member.allow_global_compensation_fallback === 1,
                allowGlobalInternalCost: member.allow_global_internal_cost_fallback === 1,
                workerExpenseReimbursementOverride: reimbursement.workerOverride,
                workerExpenseReimbursementEffectiveFrom: reimbursement.overrideEffectiveFrom,
                clientRateMinor:
                  terms.clientLaborRate?.rateBasis === 'daily' ||
                  terms.clientLaborRate?.rateBasis === 'weekly'
                    ? terms.clientLaborRate.unitRateMinor
                    : (terms.clientLaborRate?.hourlyRateMinor ?? null),
                clientRateBasis: terms.clientLaborRate?.rateBasis ?? null,
                clientCurrency: terms.clientLaborRate?.currency ?? null,
                clientSource: terms.clientLaborRate?.provenance.source ?? null,
                clientRuleId: terms.clientLaborRate?.id ?? null,
                payRateMinor: terms.workerCompensation?.rateMinor ?? null,
                payCurrency: terms.workerCompensation?.currency ?? null,
                payMethod: terms.workerCompensation?.ruleType ?? null,
                paySource: terms.workerCompensation?.provenance.source ?? null,
                payRuleId: terms.workerCompensation?.id ?? null,
                internalRateMinor: terms.internalCost?.hourlyRateMinor ?? null,
                internalCurrency: terms.internalCost?.currency ?? null,
                issueCodes: terms.issues.map((issue) => issue.code),
              };
            })
          : [];
        const { assignmentExpensePolicies, reimbursementReview } =
          selected && canManageCanonicalAuthority
            ? withFinanceReimbursementSnapshot(context.sqlite, () => {
                const repository = new AssignmentExpensePolicyRepository(context.sqlite);
                // Reuse the existing live Finance guard before the internal resolver.
                const policies = repository.listForProject(context.principal, selected);
                return {
                  assignmentExpensePolicies: policies,
                  reimbursementReview: reviewFinanceReimbursement(
                    context.sqlite,
                    repository,
                    selected,
                    commercialTermsSummary.map((person) => ({
                      assignmentId: person.assignmentId,
                      workerId: person.workerId,
                      workerName: person.workerName,
                      startsOn: person.assignmentStartsOn,
                      endsOn: person.assignmentEndsOn,
                    })),
                    url.searchParams.has('policyPerson'),
                    {
                      assignmentId: url.searchParams.get('policyPerson') ?? '',
                      date:
                        url.searchParams.get('asOf') ??
                        (url.searchParams.has('policyPerson') ? '' : commercialAsOf),
                      payer:
                        url.searchParams.get('policyPayer') ??
                        (url.searchParams.has('policyPerson') ? '' : 'worker'),
                      category:
                        url.searchParams.get('policyCategory') ??
                        (url.searchParams.has('policyPerson') ? '' : 'parking'),
                    },
                  ),
                };
              })
            : { assignmentExpensePolicies: [], reimbursementReview: undefined };
        return {
          ...common,
          projects,
          workers:
            canManageCanonicalAuthority && selected
              ? listProjectSettlementWorkers(context.sqlite, selected, financeToday)
              : [],
          selectedProjectId: selected,
          projectExpenseReimbursement: selected
            ? {
                ...(context.sqlite
                  .prepare('SELECT version FROM project WHERE id=?')
                  .get(selected) ?? {}),
                mode: new AssignmentExpensePolicyRepository(
                  context.sqlite,
                ).effectiveReimbursementPreference(selected, '', commercialAsOf).projectDefault,
                effectiveFrom: new AssignmentExpensePolicyRepository(
                  context.sqlite,
                ).effectiveReimbursementPreference(selected, '', commercialAsOf)
                  .projectEffectiveFrom,
              }
            : null,
          reimbursementPreferenceAsOf: commercialAsOf,
          ...(reimbursementReview ? { reimbursementReview } : {}),
          reimbursementPreferenceHistory:
            selected && canManageCanonicalAuthority
              ? new AssignmentExpensePolicyRepository(context.sqlite).listReimbursementPreferences(
                  context.principal,
                  selected,
                )
              : [],
          finance: selected ? context.v3.projectFinance(context.principal, selected) : null,
          // Finance classification only acts on live expense source records.
          // Withdrawn and rejected expenses remain in operational history but
          // must not appear as classification work or skew inbox counts.
          // Worker and PM loaders never expose this projection; the repository's
          // role-aware list method is the authorization boundary.
          financeExpenses: selected
            ? context.repository
                .listExpensesForScope(context.principal)
                .filter(
                  (expense) =>
                    String(expense.project_id ?? expense.projectId ?? '') === String(selected) &&
                    !['void', 'rejected'].includes(String(expense.approval_state ?? '')),
                )
                .map((expense) => ({
                  ...expense,
                  policyPreview:
                    canManageCanonicalAuthority &&
                    Number(expense.expense_policy_required ?? 0) === 1
                      ? new AssignmentExpensePolicyRepository(context.sqlite).preview(
                          context.principal,
                          String(expense.id),
                        )
                      : null,
                }))
            : [],
          commercialPolicies: selected
            ? context.repository.listProjectCommercialPolicies(context.principal, selected)
            : [],
          // Keep global rules while restricting project-specific configuration to this mode.
          // Settlements, payments and invoice/ledger history retain their authoritative scopes.
          compensationRules: context.v3
            .listCompensationRules(context.principal)
            .filter((rule) => !rule.project_id || scope.projectIds.has(String(rule.project_id))),
          clientLaborRates: visibleProjectRecords(
            context.v3.listClientLaborRates(context.principal),
            scope.projectIds,
          ),
          internalCostRules: context.v3
            .listInternalCostRules(context.principal)
            .filter((rule) => !rule.project_id || scope.projectIds.has(String(rule.project_id))),
          portfolio: context.v3.financePortfolio(context.principal, undefined, undefined, {
            includeArchived,
          }),
          settlements,
          compensationPayments: settlementIds.size
            ? context.v3
                .listCompensationPaymentEvents(context.principal)
                .filter((payment) => settlementIds.has(String(payment.settlement_id)))
            : [],
          financeToday,
          commercialTermsSummary,
          commercialAsOf,
          commercialCategory,
          assignmentExpensePolicies,
          reimbursements: selected
            ? context.v3.listReimbursementQueue(context.principal, selected)
            : [],
          legalEntities: canManageCanonicalAuthority
            ? context.repository.listLegalEntities(context.principal)
            : [],
          canonicalLegalEntityOptions: canManageCanonicalAuthority
            ? context.v3.listCanonicalLegalEntityRevisionOptions(context.principal)
            : [],
          projectLegalEntityAssignments:
            canManageCanonicalAuthority && selected
              ? context.v3.listProjectLegalEntityAssignments(context.principal, selected)
              : [],
          canonicalAssignmentCommandToken: canManageCanonicalAuthority
            ? randomBytes(32).toString('base64url')
            : undefined,
          canonicalRevisionCommandToken: canManageCanonicalAuthority
            ? randomBytes(32).toString('base64url')
            : undefined,
          canonicalAuthorityAsOf: canManageCanonicalAuthority
            ? new Date().toISOString().slice(0, 10)
            : undefined,
          // Owner "Money" and "Rates" views: exact per-currency sums from the same
          // authorized repository reads; nothing is persisted or combined across currencies.
          ...(financeView === 'overview'
            ? {
                moneyOverview: buildMoneyOverview(
                  context.v3,
                  context.principal,
                  url.searchParams.get('period'),
                  { includeArchived },
                ),
              }
            : {}),
          ...(financeView === 'commercial'
            ? {
                ratesOverview: buildRatesOverview(
                  context.sqlite,
                  context.v3,
                  context.principal,
                  projects as Array<Record<string, unknown>>,
                ),
              }
            : {}),
        };
      }
      case 'ledger':
        return {
          ...common,
          ledger: context.v3.masterLedger(context.principal),
          financeToday: new Date().toISOString().slice(0, 10),
        };
      case 'accounting': {
        return {
          ...common,
          packs: context.v3.listAccountingPacks(context.principal).map((pack) => ({
            ...pack,
            artifacts: String(pack.export_types ?? '')
              .split(',')
              .map((type) => type.trim())
              .filter(Boolean),
          })),
        };
      }
      case 'audit': {
        const requestedView = url.searchParams.get('view');
        const auditView =
          requestedView === 'all' || requestedView === 'service' ? requestedView : 'business';
        const beforeAt = url.searchParams.get('beforeAt');
        const beforeId = url.searchParams.get('beforeId');
        if (
          Boolean(beforeAt) !== Boolean(beforeId) ||
          (beforeAt &&
            (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(beforeAt) ||
              Number.isNaN(Date.parse(beforeAt)))) ||
          (beforeId && !/^[0-9a-f-]{36}$/iu.test(beforeId))
        )
          error(400, 'Invalid audit history cursor');
        const pageSize = 50;
        const rows = context.repository.listAuditEvents(context.principal, {
          view: auditView,
          ...(beforeAt && beforeId ? { before: { occurredAt: beforeAt, id: beforeId } } : {}),
          limit: pageSize + 1,
        });
        const audit = rows.slice(0, pageSize);
        const last = audit.at(-1);
        return {
          ...common,
          audit,
          auditView,
          auditHasMore: rows.length > pageSize,
          auditNextCursor:
            rows.length > pageSize && last ? { occurredAt: last.occurred_at, id: last.id } : null,
          auditOlderPage: Boolean(beforeAt),
        };
      }
      default:
        return { ...common, records: [] };
    }
  } finally {
    context.sqlite.close();
  }
};
