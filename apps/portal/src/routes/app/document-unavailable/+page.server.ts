import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * T18: a private document opened in the browser (typed URL, old link) that is
 * missing or outside the person's access lands here instead of on a raw JSON
 * body. It renders the app's styled "Page not found" inside the shell; the
 * error page reads `?from=` to name the Documents section. Nothing is loaded,
 * and missing vs. not allowed stays indistinguishable.
 */
export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  error(404, 'document.unavailable');
};
