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
        const week = context.repository.listOwnTimeWeek(context.principal, weekStart);
        const timesheet = weeklyView(week.rows as Array<Record<string, unknown>>, weekStart);
        const weeklyPay =
          context.principal.role === 'worker'
            ? context.v3.workerPay(context.principal, weekStart, week.weekEnd)
            : undefined;
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnTime(context.principal),
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
      case 'expenses':
        return {
          ...common,
          projects: context.repository.listAssignedProjects(context.principal),
          records: context.repository.listOwnExpenses(context.principal),
        };
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
        return {
          ...common,
          periodStart,
          periodEnd,
          pay: context.v3.workerPay(context.principal, periodStart, periodEnd),
          settlements: context.v3.listCompensationSettlements(
            context.principal,
            periodStart,
            periodEnd,
          ),
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
              ? context.repository.listActiveWorkers(context.principal)
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
              ? context.repository.listActiveWorkers(context.principal)
              : [],
        };
      case 'profile':
        return {
          ...common,
          skills: context.repository.listWorkerSkills(context.principal),
          availability: context.repository.listWorkerAvailability(context.principal),
        };
      case 'notifications':
        return { ...common, records: context.repository.listNotifications(context.principal) };
      case 'billing':
        return {
          ...common,
          billingRules: context.repository.listBillingRules(context.principal),
          invoices: context.repository.listInvoices(context.principal),
          projects: context.repository.listFinanceProjects(context.principal),
          legalEntities: context.repository.listLegalEntities(context.principal),
          taxProfiles: context.repository.listTaxProfiles(context.principal),
          contacts: context.repository.listAllClientContacts(context.principal),
        };
      case 'finance': {
        const projects = context.repository.listFinanceProjects(context.principal);
        const selected =
          url.searchParams.get('project') ?? (projects[0] as { id?: string } | undefined)?.id ?? '';
        return {
          ...common,
          projects,
          workers:
            context.principal.role === 'owner_admin' || context.principal.role === 'finance_admin'
              ? context.repository.listActiveWorkers(context.principal)
              : [],
          selectedProjectId: selected,
          finance: selected ? context.v3.projectFinance(context.principal, selected) : null,
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
          packs: context.v3.listAccountingPacks(context.principal),
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
