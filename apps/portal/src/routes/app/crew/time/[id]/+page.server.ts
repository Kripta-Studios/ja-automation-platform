import { error, redirect } from '@sveltejs/kit';
import { AccessDeniedError, CrewLeaderRepository } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    return {
      record: new CrewLeaderRepository(context.sqlite).entryDetail(context.principal, params.id),
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) error(404, 'Crew time entry not found');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
