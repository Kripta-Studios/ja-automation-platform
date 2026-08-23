import { randomBytes } from 'node:crypto';
import { error, redirect } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { mondayOf, weeklyView } from '$lib/server/portal-week';
import type { PageServerLoad } from './$types';

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

export const sectionLoad: PageServerLoad = ({ locals, params, url }) => {
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
  const context = openPortalRepository(locals);
  try {
    const searchQuery = url.searchParams.get('q')?.trim() ?? '';
    const common = {
      user: locals.user,
      section,
      searchQuery,
      searchSuggestions: context.repository.searchSuggestions(context.principal),
      searchResults:
        searchQuery.length >= 2 ? context.repository.search(context.principal, searchQuery) : [],
    };
    switch (section) {
      case 'time': {
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
        const timesheet = weeklyView(week.rows as Array<Record<string, unknown>>, weekStart);
        const weeklyPay =
          context.principal.role === 'worker'
            ? context.v3.workerPay(context.principal, weekStart, week.weekEnd)
            : undefined;
        const category = url.searchParams.get('category')?.trim() || undefined;
        const projectId = url.searchParams.get('project')?.trim() || undefined;
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listTimeForScope(context.principal, {
            category,
            projectId,
          }),
          timeFilter: { category: category ?? '', projectId: projectId ?? '' },
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
          technicalChanges: context.v3.listTechnicalChanges(context.principal),
          periodReports: context.v3.listPeriodReports(context.principal),
        };
      case 'expenses': {
        const records = context.repository.listExpensesForScope(context.principal);
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
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
        const periodStart =
          url.searchParams.get('start') ?? `${new Date().toISOString().slice(0, 7)}-01`;
        const periodEnd =
          url.searchParams.get('end') ??
          new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0))
            .toISOString()
            .slice(0, 10);

        const pay = context.v3.workerPay(context.principal, periodStart, periodEnd);
        const settlements = context.v3.listCompensationSettlements(
          context.principal,
          periodStart,
          periodEnd,
        );

        return {
          ...common,
          periodStart,
          periodEnd,
          pay,
          settlements,
        };
      }
      case 'projects':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
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
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listAllWorkers(context.principal)
              : [],
          assignments:
            context.principal.role !== 'worker'
              ? context.repository.listAssignments(context.principal)
              : [],
        };
      case 'approvals':
        return {
          ...common,
          records: context.repository.listApprovalQueue(context.principal),
          milestones: context.repository.listMilestonesForReview(context.principal),
          technicalChanges:
            context.principal.role === 'owner_admin' || context.principal.role === 'project_manager'
              ? context.v3.listTechnicalChanges(context.principal, true)
              : [],
        };
      case 'planning':
        return {
          ...common,
          records: context.repository.listPlanning(context.principal),
          projects: context.repository.listAssignedProjects(context.principal),
          skills: context.repository.listSkills(context.principal),
          workers:
            context.principal.role !== 'worker'
              ? context.repository.listAllWorkers(context.principal)
              : [],
        };
      case 'profile': {
        // Owner/finance administrators can inspect and manage the workforce from this screen.
        // Keep the target selection server-side and constrained to the same active-worker list
        // used by the repository so a forged `?worker=` cannot broaden the data scope.
        const workforceAdmin = ['owner_admin', 'finance_admin'].includes(context.principal.role);
        const workers = workforceAdmin
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
        const targetWorkerId = workforceAdmin
          ? (validRequestedWorkerId ?? fallbackWorkerId)
          : context.principal.userId;
        const workerSkills = context.repository.listWorkerSkills(context.principal, targetWorkerId);
        return {
          ...common,
          workers: workers,
          selectedWorkerId: targetWorkerId,
          // `skills` is retained for existing worker-facing markup; `workerSkills` makes the
          // selected admin target explicit for the administrator-facing editor.
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
        // V3 owns authorization and effective-date filtering; the route only selects the current
        // project and serializes the already-authorized rows for the UI.
        return {
          ...common,
          projects,
          workers:
            context.principal.role === 'owner_admin' || context.principal.role === 'finance_admin'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
          selectedProjectId: selected,
          finance: selected ? context.v3.projectFinance(context.principal, selected) : null,
          // Include global worker rules alongside project-specific rules. The selected project
          // still scopes the finance summary and create forms, while this register makes every
          // effective rule visible to an authorized finance administrator.
          compensationRules: context.v3.listCompensationRules(context.principal),
          clientLaborRates: context.v3.listClientLaborRates(context.principal),
          internalCostRules: context.v3.listInternalCostRules(context.principal),
          portfolio: context.v3.financePortfolio(context.principal),
          settlements: selected
            ? context.v3.listCompensationSettlements(
                context.principal,
                undefined,
                undefined,
                selected,
              )
            : [],
          reimbursements: selected
            ? context.v3.listReimbursementQueue(context.principal, selected)
            : [],
        };
      }
      case 'ledger':
        return { ...common, ledger: context.v3.masterLedger(context.principal) };
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
