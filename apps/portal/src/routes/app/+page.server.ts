import { invoiceSourceHolders } from '$lib/server/invoice-source-holders';
import { readCashMovements } from '$lib/server/cash-calendar';
import { ownerFinanceSummary } from '$lib/portal/owner-finance';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  projectManagerDashboardProjection,
  projectManagerSearchProjection,
  projectManagerSearchSuggestionsProjection,
} from './[section]/role-projections';
import type { PageServerLoad } from './$types';
import { portalLandingForRole } from '$lib/portal-navigation';
import { projectVisibility, visibleProjectRecords } from '$lib/portal/project-visibility';
import { readPendingApprovals } from '$lib/server/approval-queue';
import { homeProjectFinance } from '$lib/server/home-project-finance';
import {
  isPendingApproval,
  readyToInvoiceSummary,
  splitUnbilledSources,
  workerWeekStatus,
  type HomeInbox,
  type ProjectGlance,
} from '$lib/portal/home-inbox';
import { mondayOf } from '$lib/server/portal-week';
import { assistantCanonicalOwner } from '$lib/server/assistant-canonical-owner';
export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (locals.user.status === 'suspended' || locals.user.status === 'offboarded')
    redirect(303, '/j-aautomation/app/login?reason=access-revoked');
  if (locals.user.role === 'finance_admin' || locals.user.role === 'auditor_read_only') {
    const destination = new URL(portalLandingForRole(base, locals.user.role), url);
    const query = url.searchParams.get('q')?.trim();
    if (query) destination.searchParams.set('q', query);
    redirect(303, `${destination.pathname}${destination.search}`);
  }
  const context = openPortalRepository(locals);
  try {
    const searchQuery = url.searchParams.get('q')?.trim() ?? '';
    const repositorySearchResults =
      searchQuery.length >= 2
        ? context.repository.search(context.principal, searchQuery, { includeArchived: false })
        : [];
    const repositorySearchSuggestions = context.repository.searchSuggestions(
      context.principal,
      24,
      { includeArchived: false },
    );
    const isProjectManager = context.principal.role === 'project_manager';
    const searchResults = isProjectManager
      ? projectManagerSearchProjection(repositorySearchResults)
      : repositorySearchResults;
    const searchSuggestions = isProjectManager
      ? projectManagerSearchSuggestionsProjection(repositorySearchSuggestions)
      : repositorySearchSuggestions;
    const visible = projectVisibility(context.repository.listAssignedProjects(context.principal));
    if (context.principal.role === 'worker') {
      // Home shows the worker's own week next to "Log hours" / "Add expense".
      const today = new Date().toISOString().slice(0, 10);
      const weekStart = mondayOf(today);
      const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
      const weekEnd = weekEndDate.toISOString().slice(0, 10);
      const workerWeek = workerWeekStatus({
        weekStart,
        weekEnd,
        today,
        workerId: context.principal.userId,
        time: visibleProjectRecords(
          context.repository.listTimeForScope(context.principal, { from: weekStart, to: weekEnd }),
          visible.projectIds,
        ),
        expenses: visibleProjectRecords(
          context.repository.listExpensesForScope(context.principal),
          visible.projectIds,
        ),
      });
      return {
        workerWeek,
        user: { ...locals.user, canonicalOwner: assistantCanonicalOwner(locals.user) },
        section: 'today',
        searchQuery,
        searchResults,
        searchSuggestions,
        records: visibleProjectRecords(
          context.repository.listPlanning(context.principal),
          visible.projectIds,
        ),
        projects: visible.projects,
      };
    }
    const dashboard = context.repository.dashboard(context.principal);
    // One pending definition for Home, the nav badge and Approvals.
    const pendingApprovals = readPendingApprovals(context, { visible });
    const approvalRows = pendingApprovals.rows;
    const isOwner = context.principal.role === 'owner_admin';
    // Owner: one finance read per open project feeds "Ready to invoice" and the project glance.
    const openProjects = isOwner
      ? visible.projects.filter((project) =>
          ['active', 'closing', 'paused'].includes(String(project.status)),
        )
      : [];
    // Who holds each approved source: an unissued draft ("in draft") or a live invoice.
    const holders = openProjects.length
      ? invoiceSourceHolders(
          context.sqlite,
          new Set(openProjects.map((project) => String(project.id))),
        )
      : new Map<string, string>();
    const weekStart = mondayOf(new Date().toISOString().slice(0, 10));
    const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const weekMinutes = new Map<string, number>();
    if (openProjects.length)
      for (const row of context.sqlite
        .prepare(
          `SELECT project_id projectId,SUM(minutes) minutes FROM time_entry
            WHERE work_date BETWEEN ? AND ? AND approval_state IN ('submitted','approved','locked')
            GROUP BY project_id`,
        )
        .all(weekStart, weekEnd) as Array<{ projectId: string; minutes: number }>)
        weekMinutes.set(row.projectId, Number(row.minutes) || 0);
    // Logged hours no invoice holds yet, split the same way as "Hours to approve":
    // submitted = waiting for your approval (the invoice screen can approve and include
    // them); draft / sent back = the worker has not sent them yet (shown apart, never
    // counted as "to approve").
    const pendingMinutes = new Map<string, number>();
    const unsentMinutes = new Map<string, number>();
    if (openProjects.length)
      for (const row of context.sqlite
        .prepare(
          `SELECT project_id projectId,
                  SUM(CASE WHEN approval_state='submitted' THEN minutes ELSE 0 END) minutes,
                  SUM(CASE WHEN approval_state IN ('draft','needs_changes') THEN minutes ELSE 0 END) unsent
             FROM time_entry
            WHERE approval_state IN ('draft','submitted','needs_changes')
              AND invoice_id IS NULL AND billability_state<>'non_billable'
              AND NOT EXISTS (SELECT 1 FROM record_correction_link link JOIN time_entry correction ON correction.id=link.correction_id
                     WHERE link.record_type='time_entry' AND link.original_id=time_entry.id AND correction.approval_state NOT IN ('rejected','void'))
              AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                     WHERE source.source_type='time' AND source.source_id=time_entry.id
                       AND invoice.state NOT IN ('void','cancelled','superseded'))
            GROUP BY project_id`,
        )
        .all() as Array<{ projectId: string; minutes: number; unsent: number }>) {
        pendingMinutes.set(row.projectId, Number(row.minutes) || 0);
        unsentMinutes.set(row.projectId, Number(row.unsent) || 0);
      }
    const pendingByProject = new Map<string, number>();
    for (const row of approvalRows)
      if (isPendingApproval(row))
        pendingByProject.set(
          String(row.project_id),
          (pendingByProject.get(String(row.project_id)) ?? 0) + 1,
        );
    // Commercial references for the alerts, read for the already-authorized projects only.
    const projectTerms = openProjects.length
      ? context.sqlite.prepare(
          'SELECT po_number poNumber,billing_model billingModel FROM project WHERE id=?',
        )
      : null;
    const projectGlance: ProjectGlance[] = openProjects.flatMap((project) => {
      try {
        // Reused while the project's finance inputs are unchanged (see home-project-finance.ts).
        const finance = homeProjectFinance(context, String(project.id));
        const split = splitUnbilledSources(finance.approvedUnbilledSources ?? [], holders);
        return [
          {
            projectId: String(project.id),
            weekMinutes: weekMinutes.get(String(project.id)) ?? 0,
            pendingApprovals: pendingByProject.get(String(project.id)) ?? 0,
            currency: String(finance.currency ?? project.currency ?? ''),
            readyMinor: split.readyMinor,
            draftMinor: split.draftMinor,
            missingRate: (finance.alerts ?? []).includes('MISSING_RATE'),
            missingPo: (() => {
              const terms = projectTerms?.get(String(project.id)) as
                | { poNumber: string | null; billingModel: string | null }
                | undefined;
              return Boolean(
                terms && terms.billingModel !== 'internal' && !String(terms.poNumber ?? '').trim(),
              );
            })(),
          },
        ];
      } catch {
        return [];
      }
    });
    const projectLabel = new Map(
      openProjects.map((project) => [
        String(project.id),
        [project.project_number, project.name].filter(Boolean).join(' · '),
      ]),
    );
    const homeInbox: HomeInbox = {
      approvals: pendingApprovals.summary,
      // Work already on a draft is not "ready" again; it shows as "in a draft" instead.
      readyToInvoice: isOwner
        ? readyToInvoiceSummary(
            projectGlance.map((glance) => ({
              projectId: glance.projectId,
              label: projectLabel.get(glance.projectId) ?? glance.projectId,
              currency: glance.currency,
              minor: glance.readyMinor,
              draftMinor: glance.draftMinor,
              pendingMinutes: pendingMinutes.get(glance.projectId) ?? 0,
              unsentMinutes: unsentMinutes.get(glance.projectId) ?? 0,
            })),
          )
        : null,
      ...(isOwner ? { projects: projectGlance } : {}),
    };
    return {
      homeInbox,
      user: { ...locals.user, canonicalOwner: assistantCanonicalOwner(locals.user) },
      section: 'today',
      searchQuery,
      searchResults,
      searchSuggestions,
      ...(context.principal.role === 'owner_admin'
        ? {
            ownerFinance: ownerFinanceSummary(
              readCashMovements(context),
              new Date().toISOString().slice(0, 10),
              context.repository
                .listFinanceProjects(context.principal)
                .map((project) => String(project.currency)),
            ),
          }
        : {}),
      dashboard: isProjectManager ? projectManagerDashboardProjection(dashboard) : dashboard,
      projects: visible.projects,
      // Home shows counts only; the queue itself loads on Approvals.
      records: [],
    };
  } finally {
    context.sqlite.close();
  }
};
