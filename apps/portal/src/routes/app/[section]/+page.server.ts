import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sectionActions } from './section-actions';
import { sectionLoad } from './section-load';
import { supplierCoordinatorOwnRecordRedirect } from '$lib/server/supplier-route-access';

export const load: PageServerLoad = (event) => {
  // D3: a supplier coordinator has no own J&A timesheet or expense claims;
  // his Time/Expenses entries lead to the supplier team's hours instead.
  const destination = supplierCoordinatorOwnRecordRedirect(
    event.params.section,
    event.locals.user?.workforceProfile,
  );
  if (destination) {
    // Keep the page language the person chose (?lang=es) across the redirect.
    const target = new URL(
      `${event.url.pathname.replace(/\/app\/.*$/u, '')}/app/${destination}`,
      event.url,
    );
    const lang = event.url.searchParams.get('lang');
    if (lang) target.searchParams.set('lang', lang);
    redirect(303, `${target.pathname}${target.search}`);
  }
  return sectionLoad(event);
};
export const actions: Actions = sectionActions;
