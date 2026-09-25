import { randomBytes } from 'node:crypto';
import {
  AssignmentExpensePolicyRepository,
  CrewLeaderRepository,
  MailIdentityRepository,
  listInvoiceEmailDeliveries,
} from '@ja/database';
import { error, redirect } from '@sveltejs/kit';
import { defaultLookbackPeriod } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import { mondayOf, weeklyView, type WeeklyProjectSchedule } from '$lib/server/portal-week';
import { workerPayOutstanding } from '$lib/server/worker-pay-outstanding';
import { listProjectSettlementWorkers } from '$lib/server/finance-settlement-workers';
import type { PageServerLoad } from './$types';
import {
  projectManagerApprovalQueueProjection,
  projectManagerMilestoneProjection,
  projectManagerSearchProjection,
  projectManagerSearchSuggestionsProjection,
} from './role-projections';
import { listMailboxAccounts } from '$lib/server/mail-directory';

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
      user: { ...locals.user, workforceProfile: restrictedProfile?.profile },
      section,
      searchQuery,
      searchSuggestions: restrictedProfile
        ? []
        : isProjectManager
          ? projectManagerSearchSuggestionsProjection(
              context.repository.searchSuggestions(context.principal),
            )
          : context.repository.searchSuggestions(context.principal),
      searchResults:
        !restrictedProfile && searchQuery.length >= 2
          ? isProjectManager
            ? projectManagerSearchProjection(
                context.repository.search(context.principal, searchQuery),
              )
            : context.repository.search(context.principal, searchQuery)
          : [],
    };
    switch (section) {
      case 'time': {
        const timeProjects = context.repository.listAssignedProjects(context.principal);
        const timeProjectIds = timeProjects.map((project) => String(project.id));
        const timeAssignments = timeProjectIds.length
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
              .filter((assignment) =>
                context.principal.role === 'worker'
                  ? String(assignment.worker_id) === context.principal.userId
                  : (common.workers as Array<{ id: string }>).some(
                      (worker) => String(worker.id) === String(assignment.worker_id),
                    ),
              )
          : [];
        const weekStart = mondayOf(url.searchParams.get('week'));
        const weekEnd = context.repository.listOwnTimeWeek(context.principal, weekStart).weekEnd;
        const week =
          context.principal.role === 'worker'
            ? context.repository.listOwnTimeWeek(context.principal, weekStart)
            : {
                weekStart,
                weekEnd,
                rows: context.repository.listTimeForScope(context.principal, {
                  from: weekStart,
                  to: weekEnd,
                }),
              };
        const weeklySchedules: WeeklyProjectSchedule[] =
          context.principal.role !== 'worker'
            ? []
            : (context.sqlite
                .prepare(
                  `SELECT pm.project_id,
                          pm.starts_on AS assignment_starts_on,
                          pm.ends_on AS assignment_ends_on,
                          s.effective_from,s.effective_to,
                          s.monday_minutes,s.tuesday_minutes,s.wednesday_minutes,
                          s.thursday_minutes,s.friday_minutes,s.saturday_minutes,s.sunday_minutes
                     FROM project_member pm
                     JOIN project p ON p.id=pm.project_id
                LEFT JOIN schedule s
                       ON s.project_id=pm.project_id
                      AND s.effective_from <= ?
                      AND (s.effective_to IS NULL OR s.effective_to >= ?)
                    WHERE pm.user_id=?
                      AND pm.status='active'
                      AND p.status IN ('active','planned','paused')
                      AND pm.starts_on <= ?
                      AND (pm.ends_on IS NULL OR pm.ends_on >= ?)
                    ORDER BY pm.project_id,s.effective_from DESC`,
                )
                .all(
                  week.weekEnd,
                  weekStart,
                  context.principal.userId,
                  week.weekEnd,
                  weekStart,
                ) as WeeklyProjectSchedule[]);
        const timesheet = weeklyView(
          week.rows as Array<Record<string, unknown>>,
          weekStart,
          weeklySchedules,
        );
        const weeklyPay =
          context.principal.role === 'worker' && !restrictedProfile
            ? context.v3.workerPay(context.principal, weekStart, week.weekEnd)
            : undefined;
        const category = url.searchParams.get('category')?.trim() || undefined;
        const projectId = url.searchParams.get('project')?.trim() || undefined;
        const workerId = url.searchParams.get('worker')?.trim() || undefined;
        const from = url.searchParams.get('from')?.trim() || undefined;
        const to = url.searchParams.get('to')?.trim() || undefined;
        return {
          ...common,
          projects: timeProjects,
          timeAssignments,
          records: context.repository
            .listTimeForScope(context.principal, {
              category,
              projectId,
              from,
              to,
            })
            .filter((row) => !workerId || String(row.worker_id) === workerId),
          calendarRecords:
            context.principal.role === 'owner_admin'
              ? context.repository.listTimeForScope(context.principal)
              : undefined,
          weekDraftRecords: week.rows,
          timeFilter: {
            category: category ?? '',
            projectId: projectId ?? '',
            workerId: workerId ?? '',
            from: from ?? '',
            to: to ?? '',
          },
          weekStart,
          weekEnd: week.weekEnd,
          timesheet,
          weeklyPay,
        };
      }
      case 'reports':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnReports(context.principal),
          technicalChanges: restrictedProfile
            ? []
            : context.v3.listTechnicalChanges(context.principal),
          periodReports: restrictedProfile ? [] : context.v3.listPeriodReports(context.principal),
        };
      case 'expenses': {
        const records = context.repository.listExpensesForScope(context.principal);
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
        return {
          ...common,
          projects: [...assignedProjects, ...delegatedProjects],
          records,
        };
      }
      case 'documents':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          documents: context.repository.listDocuments(context.principal),
        };
      case 'pay': {
        if (context.principal.role === 'owner_admin')
          redirect(303, `/j-aautomation/app/manage/worker-pay${url.search}`);
        if (!['worker', 'project_manager'].includes(context.principal.role))
          error(403, 'Worker or project manager role required');
        const lookback = defaultLookbackPeriod();
        const periodStart = url.searchParams.get('start') ?? lookback.periodStart;
        const periodEnd = url.searchParams.get('end') ?? lookback.periodEnd;

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
          .map((row) => {
            const detail = context.repository.expenseDetail(context.principal, row.id);
            return {
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
              expectedReimbursementOn:
                detail.expected_reimbursement_on === null ||
                detail.expected_reimbursement_on === undefined
                  ? null
                  : String(detail.expected_reimbursement_on),
              reimbursedAt:
                detail.reimbursed_at === null || detail.reimbursed_at === undefined
                  ? null
                  : String(detail.reimbursed_at),
            };
          });

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
        const visibleProjects = unavailableLinkedProject
          ? [...authorizedProjects, unavailableLinkedProject]
          : authorizedProjects;
        const authorizedAssignments =
          context.principal.role !== 'worker'
            ? context.repository.listAssignments(context.principal)
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
                          p.start_date,p.planned_end_date,p.actual_end_date,p.version,
                          p.site_name,p.country,c.client_number,c.display_name client_name
                     FROM project p
                     LEFT JOIN client c ON c.id=p.client_id
                    WHERE p.id IN (${projectIds.map(() => '?').join(',')})
                    ORDER BY p.project_number`,
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
            ? context.repository.listAllWorkers(context.principal).map((worker) => ({
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
        return {
          ...common,
          projects: directoryProjects,
          clients:
            context.principal.role === 'owner_admin' ||
            context.principal.role === 'finance_admin' ||
            context.principal.role === 'auditor_read_only'
              ? context.repository.listClients(context.principal)
              : [],
          contacts:
            context.principal.role === 'worker'
              ? []
              : context.repository.listAllClientContacts(context.principal),
          workers: projectWorkers,
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
          assignments: authorizedAssignments.map((assignment) => ({
            ...assignment,
            actual_minutes: actualMinutesByAssignment.get(String(assignment.id ?? '')) ?? 0,
          })),
        };
      }
      case 'approvals': {
        const approvalIdentity = context.sqlite.prepare(
          `SELECT p.name project_name,p.project_number,c.display_name client_name
             FROM project p
             JOIN client c ON c.id=p.client_id
            WHERE p.id=?`,
        );
        return {
          ...common,
          records: (isProjectManager
            ? projectManagerApprovalQueueProjection(
                context.repository.listApprovalQueue(context.principal),
              )
            : context.repository.listApprovalQueue(context.principal)
          ).map((row) => ({
            ...row,
            worker_name:
              context.sqlite
                .prepare('SELECT name FROM user WHERE id=?')
                .get(String(row.worker_id ?? ''))?.name ?? '',
            ...(approvalIdentity.get(String(row.project_id ?? '')) ?? {}),
          })),
          milestones: (isProjectManager
            ? projectManagerMilestoneProjection(
                context.repository.listMilestonesForReview(context.principal),
              )
            : context.repository.listMilestonesForReview(context.principal)
          ).map((row) => ({
            ...row,
            ...(approvalIdentity.get(String(row.project_id ?? '')) ?? {}),
          })),
          technicalChanges:
            context.principal.role === 'owner_admin' || context.principal.role === 'project_manager'
              ? context.v3.listTechnicalChanges(context.principal, true)
              : [],
        };
      }
      case 'planning':
        return {
          ...common,
          records: context.repository
            .listPlanning(context.principal)
            .filter(
              (row) =>
                (!url.searchParams.get('project') ||
                  String(row.project_id) === url.searchParams.get('project')) &&
                (!url.searchParams.get('worker') ||
                  String(row.worker_id) === url.searchParams.get('worker')),
            ),
          projects: context.repository.listAssignedProjects(context.principal),
          skills: context.repository.listSkills(context.principal),
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listPlanningWorkerOptions(context.principal)
              : [],
          assignments:
            context.principal.role !== 'worker'
              ? context.repository.listAssignments(context.principal)
              : [],
        };
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
      case 'billing':
        return {
          ...common,
          billingRules: context.repository.listBillingRules(context.principal),
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
          projects: context.repository.listFinanceProjects(context.principal),
          legalEntities: context.repository.listLegalEntities(context.principal),
          taxProfiles: context.repository.listTaxProfiles(context.principal),
          contacts: context.repository.listAllClientContacts(context.principal),
        };
      case 'finance': {
        const projects = context.repository.listFinanceProjects(context.principal);
        const selected =
          url.searchParams.get('project') ?? (projects[0] as { id?: string } | undefined)?.id ?? '';
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
        const commercialTermsSummary = selected
          ? (
              context.sqlite
                .prepare(
                  `SELECT pm.id,pm.user_id,u.name,pm.version,pm.starts_on,pm.ends_on,
                          p.currency project_currency,
                          pm.client_bill_rule_id,pm.worker_compensation_rule_id,
                          pm.internal_cost_rule_id,
                          pm.allow_global_compensation_fallback,
                          pm.allow_global_internal_cost_fallback,
                          pm.worker_expense_reimbursement_override
                     FROM project_member pm
                     JOIN user u ON u.id=pm.user_id
                     JOIN project p ON p.id=pm.project_id
                    WHERE pm.project_id=? AND pm.status='active' AND u.status='active'
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
              return {
                assignmentId: member.id,
                assignmentVersion: member.version,
                assignmentStartsOn: member.starts_on,
                assignmentEndsOn: member.ends_on,
                projectCurrency: member.project_currency,
                workerId: member.user_id,
                workerName: member.name,
                clientBillRuleId: member.client_bill_rule_id,
                workerCompensationRuleId: member.worker_compensation_rule_id,
                internalCostRuleId: member.internal_cost_rule_id,
                allowGlobalCompensation: member.allow_global_compensation_fallback === 1,
                allowGlobalInternalCost: member.allow_global_internal_cost_fallback === 1,
                workerExpenseReimbursementOverride: member.worker_expense_reimbursement_override,
                clientRateMinor: terms.clientLaborRate?.hourlyRateMinor ?? null,
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
        return {
          ...common,
          projects,
          workers:
            canManageCanonicalAuthority && selected
              ? listProjectSettlementWorkers(context.sqlite, selected, financeToday)
              : [],
          selectedProjectId: selected,
          projectExpenseReimbursement: selected
            ? context.sqlite
                .prepare(
                  'SELECT version,worker_expense_reimbursement_default mode FROM project WHERE id=?',
                )
                .get(selected)
            : null,
          finance: selected ? context.v3.projectFinance(context.principal, selected) : null,
          // Finance receives the complete, server-authorized expense source set for the
          // selected project. Worker and PM loaders never expose this projection; the
          // repository's role-aware list method is the authorization boundary.
          financeExpenses: selected
            ? context.repository
                .listExpensesForScope(context.principal)
                .filter(
                  (expense) =>
                    String(expense.project_id ?? expense.projectId ?? '') === String(selected),
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
          // Include global worker rules alongside project-specific rules. The selected project
          // still scopes the finance summary and create forms, while this register makes every
          // effective rule visible to an authorized finance administrator.
          compensationRules: context.v3.listCompensationRules(context.principal),
          clientLaborRates: context.v3.listClientLaborRates(context.principal),
          internalCostRules: context.v3.listInternalCostRules(context.principal),
          portfolio: context.v3.financePortfolio(context.principal),
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
          assignmentExpensePolicies:
            selected && canManageCanonicalAuthority
              ? new AssignmentExpensePolicyRepository(context.sqlite).listForProject(
                  context.principal,
                  selected,
                )
              : [],
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
      case 'audit':
        return { ...common, audit: context.repository.listAuditEvents(context.principal) };
      default:
        return { ...common, records: [] };
    }
  } finally {
    context.sqlite.close();
  }
};
