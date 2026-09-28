import { resolvePortalLocalePreference, PORTAL_LOCALE_MAX_AGE } from '$lib/i18n/context';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, request, url }) => {
  // accept-language is intentionally inspected but not used as fallback so portal routes default to English
  const _header = request.headers.get('accept-language');
  const locale = resolvePortalLocalePreference(
    url.searchParams.get('lang'),
    cookies.get('ja.portal.locale'),
    cookies.get('ja-portal-locale'),
  );
  if (url.searchParams.has('lang')) {
    for (const key of ['ja.portal.locale', 'ja-portal-locale'])
      cookies.set(key, locale, {
        path: '/',
        maxAge: PORTAL_LOCALE_MAX_AGE,
        sameSite: 'lax',
        httpOnly: false,
        secure: url.protocol === 'https:',
      });
  }
  return {
    locale,
    offlineEnabled: process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() !== 'false',
  };
};
