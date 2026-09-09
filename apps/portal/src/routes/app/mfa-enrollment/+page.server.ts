import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { portalLandingForRole } from '$lib/portal-navigation';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import type { PageServerLoad } from './$types';

/**
 * This is deliberately a minimal projection. The hook fences every other
 * portal route before its load function can open a repository or return data.
 */
export const load: PageServerLoad = ({ locals, url, cookies }) => {
  if (!locals.user) redirect(303, `${base}/app/login`);
  if (locals.user.mfaEnrolled) redirect(303, portalLandingForRole(base, locals.user.role));
  return {
    user: { name: locals.user.name, email: locals.user.email, role: locals.user.role },
    continueTo: portalLandingForRole(base, locals.user.role),
    // This optional setup route reads only request locale state and the
    // authenticated identity already resolved by hooks. The caller can always
    // continue to the ordinary role landing without enabling MFA.
    locale: resolvePortalLocalePreference(
      url.searchParams.get('lang'),
      cookies.get('ja.portal.locale'),
      cookies.get('ja-portal-locale'),
    ),
  };
};
