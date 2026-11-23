import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * T18: any /app URL that matches no route (for example /app/billing/invoices)
 * answers inside the app layout with the styled "Page not found" instead of
 * SvelteKit's bare root error document. Lowest route priority: it never
 * shadows a real page or endpoint.
 */
export const load: PageServerLoad = () => {
  error(404, 'page.not_found');
};
