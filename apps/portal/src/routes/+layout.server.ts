import { normalizePortalLocale, type PortalLocale } from '$lib/portal-i18n';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, request, url }) => {
  // accept-language is intentionally inspected but not used as fallback so portal routes default to English
  const _header = request.headers.get('accept-language');
  const requested =
    url.searchParams.get('lang') ??
    cookies.get('ja.portal.locale') ??
    cookies.get('ja-portal-locale');
  const locale: PortalLocale = normalizePortalLocale(requested);
  return {
    locale,
    offlineEnabled: process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() !== 'false',
  };
};
