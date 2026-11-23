import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * T18: destination of a denied page request from a supplier-workforce account
 * (hooks.server.ts). It renders the app's styled 403 inside the shell; the
 * error page reads `?from=` to name the section and to explain My Pay. No
 * record data is loaded here.
 */
export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  error(403, 'operational.route_restricted');
};
