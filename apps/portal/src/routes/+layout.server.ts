import { normalizePortalLocale, type PortalLocale } from '$lib/portal-i18n';
import type { LayoutServerLoad } from './$types';

function preferredLanguage(header: string | null): string | undefined {
  return header
    ?.split(',')
    .map((entry) => entry.split(';', 1)[0]?.trim())
    .find(Boolean);
}

export const load: LayoutServerLoad = ({ cookies, request, url }) => {
  const requested =
    url.searchParams.get('lang') ??
    cookies.get('ja.portal.locale') ??
    cookies.get('ja-portal-locale') ??
    preferredLanguage(request.headers.get('accept-language'));
  const locale: PortalLocale = normalizePortalLocale(requested);
  return { locale };
};
