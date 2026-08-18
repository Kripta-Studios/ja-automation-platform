import { redirect } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (locals.user.status === 'suspended' || locals.user.status === 'offboarded')
    redirect(303, '/j-aautomation/app/login?reason=access-revoked');
  const context = openPortalRepository(locals);
  try {
    if (context.principal.role === 'worker')
      return {
        user: locals.user,
        section: 'today',
        records: context.repository.listPlanning(context.principal),
        projects: context.repository.listAssignedProjects(context.principal),
      };
    return {
      user: locals.user,
      section: 'today',
      dashboard: context.repository.dashboard(context.principal),
      projects: context.repository.listAssignedProjects(context.principal),
      records: context.repository.listApprovalQueue(context.principal),
    };
  } finally {
    context.sqlite.close();
  }
};
