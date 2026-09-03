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
      searchQuery.length >= 2 ? context.repository.search(context.principal, searchQuery) : [];
    const repositorySearchSuggestions = context.repository.searchSuggestions(context.principal);
    const isProjectManager = context.principal.role === 'project_manager';
    const searchResults = isProjectManager
      ? projectManagerSearchProjection(repositorySearchResults)
      : repositorySearchResults;
    const searchSuggestions = isProjectManager
      ? projectManagerSearchSuggestionsProjection(repositorySearchSuggestions)
      : repositorySearchSuggestions;
    if (context.principal.role === 'worker')
      return {
        user: locals.user,
        section: 'today',
        searchQuery,
        searchResults,
        searchSuggestions,
        records: context.repository.listPlanning(context.principal),
        projects: context.repository.listAssignedProjects(context.principal),
      };
    const dashboard = context.repository.dashboard(context.principal);
    return {
      user: locals.user,
      section: 'today',
      searchQuery,
      searchResults,
      searchSuggestions,
      dashboard: isProjectManager ? projectManagerDashboardProjection(dashboard) : dashboard,
      projects: context.repository.listAssignedProjects(context.principal),
      records: context.repository.listApprovalQueue(context.principal),
    };
  } finally {
    context.sqlite.close();
  }
};
