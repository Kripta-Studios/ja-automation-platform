import {
  acceptLanguageLocale,
  resolvePortalLocalePreference,
  PORTAL_LOCALE_MAX_AGE,
} from '$lib/i18n/context';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, request, url }) => {
  // An explicit choice (?lang or the saved cookie) wins; a first visit (for
  // example signing in on a new phone) follows the browser's accept-language
  // so a Spanish or Brazilian worker is not dropped into English.
  const locale = resolvePortalLocalePreference(
    url.searchParams.get('lang'),
    cookies.get('ja.portal.locale'),
    cookies.get('ja-portal-locale'),
    acceptLanguageLocale(request.headers.get('accept-language')),
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
