import { error, redirect } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    return {
      user: locals.user,
      record: context.repository.timeDetail(context.principal, params.id),
    };
  } catch {
    error(404, 'detail.timeEntry.notFound');
  } finally {
    context.sqlite.close();
  }
};
