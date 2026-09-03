import {
  documentLanguage as canonicalDocumentLanguage,
  normalizePortalLocale,
  portalText,
  type DocumentLanguage,
  type PortalLocale,
} from '$lib/portal-i18n';

/**
 * Resolve the same locale sources used by the authenticated shell for pages
 * that intentionally render outside PortalShell (auth, detail and print
 * routes). The query string wins so a shared link can select its language;
 * both historic and canonical storage keys are accepted while deployments
 * roll forward.
 */
export function resolveStandaloneLocale(
  queryValue?: string | null,
  serverLocale?: PortalLocale | null,
): PortalLocale {
  if (queryValue) return normalizePortalLocale(queryValue);
  if (typeof window === 'undefined') return serverLocale ?? 'en';
  let saved: string | null = null;
  try {
    saved =
      window.localStorage.getItem('ja.portal.locale') ??
      window.localStorage.getItem('ja-portal-locale');
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return normalizePortalLocale(saved ?? serverLocale ?? 'en');
}

export function documentLanguage(locale: PortalLocale): DocumentLanguage {
  return canonicalDocumentLanguage(locale);
}

export function applyStandaloneDocumentLocale(locale: PortalLocale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = documentLanguage(locale);
}

export function persistStandaloneLocale(locale: PortalLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('ja.portal.locale', locale);
    window.localStorage.setItem('ja-portal-locale', locale);
  } catch {
    // The page remains usable with an in-memory locale when storage is blocked.
  }
  if (typeof document !== 'undefined')
    document.cookie = `ja.portal.locale=${encodeURIComponent(locale)}; Path=/; SameSite=Lax`;
}

/**
 * Translation boundary for standalone pages. Keeping this small and
 * framework-neutral lets pages remain usable during SSR and also keeps
 * customer-entered values untouched: callers only pass catalog keys here.
 */
export function standaloneText(
  locale: PortalLocale,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const value = portalText(locale, key);
  if (!params) return value;
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`,
  );
}

type StandaloneActionResult = {
  success?: boolean;
  messageKey?: unknown;
  messageParams?: unknown;
  message?: unknown;
};

/** Translate action feedback without exposing a legacy English payload. */
export function standaloneActionMessage(locale: PortalLocale, value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const result = value as StandaloneActionResult;
  const fallbackKey = result.success === true ? 'Changes saved' : 'action.error.unavailable';
  if (typeof result.messageKey === 'string' && result.messageKey.trim()) {
    const rawParams = result.messageParams;
    const params =
      rawParams && typeof rawParams === 'object'
        ? Object.fromEntries(
            Object.entries(rawParams as Record<string, unknown>)
              .filter(
                ([, parameter]) => typeof parameter === 'string' || typeof parameter === 'number',
              )
              .map(([name, parameter]) => [name, parameter as string | number]),
          )
        : undefined;
    const translated = standaloneText(locale, result.messageKey, params);
    return locale !== 'en' && translated === result.messageKey
      ? standaloneText(locale, fallbackKey)
      : translated;
  }
  if (typeof result.message !== 'string') return '';
  // Legacy actions may still return a literal message while their contracts
  // roll forward. Preserve that compatibility for English, but never expose
  // an unknown English diagnostic in a translated standalone page.
  if (locale === 'en') return result.message;
  const translated = standaloneText(locale, result.message);
  if (translated !== result.message) return translated;
  return standaloneText(locale, fallbackKey);
}
