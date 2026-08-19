import { redirect } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (locals.user.status === 'suspended' || locals.user.status === 'offboarded')
    redirect(303, '/j-aautomation/app/login?reason=access-revoked');
  const context = openPortalRepository(locals);
  try {
    const searchQuery = url.searchParams.get('q')?.trim() ?? '';
    const searchResults =
      searchQuery.length >= 2 ? context.repository.search(context.principal, searchQuery) : [];
    if (context.principal.role === 'worker')
      return {
        user: locals.user,
        section: 'today',
        searchQuery,
        searchResults,
        records: context.repository.listPlanning(context.principal),
        projects: context.repository.listAssignedProjects(context.principal),
      };
    return {
      user: locals.user,
      section: 'today',
      searchQuery,
      searchResults,
      dashboard: context.repository.dashboard(context.principal),
      projects: context.repository.listAssignedProjects(context.principal),
      records: context.repository.listApprovalQueue(context.principal),
    };
  } finally {
    context.sqlite.close();
  }
};
