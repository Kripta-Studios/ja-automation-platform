import {
  documentLanguage as canonicalDocumentLanguage,
  portalText,
  portalCatalog,
  type DocumentLanguage,
  type PortalLocale,
} from '$lib/portal-i18n';

import {
  PORTAL_LOCALE_STORAGE_KEY,
  PORTAL_LOCALE_LEGACY_KEY,
  PORTAL_LOCALE_VERSION_KEY,
  PORTAL_LOCALE_MAX_AGE,
  resolvePortalLocalePreference,
} from '$lib/i18n/context';

function browserCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

/** Cookie precedence matches SSR; local storage is only a legacy migration fallback. */
export function resolveStandaloneLocale(
  queryValue?: string | null,
  serverLocale?: PortalLocale | null,
): PortalLocale {
  if (typeof window === 'undefined') return resolvePortalLocalePreference(queryValue, serverLocale);
  let saved: string | null = null;
  let legacy: string | null = null;
  let migrated = browserCookie(PORTAL_LOCALE_VERSION_KEY) === '2';
  try {
    saved = window.localStorage.getItem(PORTAL_LOCALE_STORAGE_KEY);
    legacy = window.localStorage.getItem(PORTAL_LOCALE_LEGACY_KEY);
    migrated = migrated || window.localStorage.getItem(PORTAL_LOCALE_VERSION_KEY) === '2';
  } catch {
    // Cookie persistence remains available when browser storage is blocked.
  }
  // Previous shell selectors only wrote the legacy key. Honor that explicit
  // selection once before synchronizing both keys and setting the version marker.
  return resolvePortalLocalePreference(
    queryValue,
    migrated ? null : legacy,
    browserCookie(PORTAL_LOCALE_STORAGE_KEY),
    browserCookie(PORTAL_LOCALE_LEGACY_KEY),
    saved,
    legacy,
    serverLocale,
  );
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
    window.localStorage.setItem(PORTAL_LOCALE_STORAGE_KEY, locale);
    window.localStorage.setItem(PORTAL_LOCALE_LEGACY_KEY, locale);
    window.localStorage.setItem(PORTAL_LOCALE_VERSION_KEY, '2');
  } catch {
    // The page remains usable with an in-memory locale when storage is blocked.
  }
  if (typeof document !== 'undefined') {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    for (const key of [PORTAL_LOCALE_STORAGE_KEY, PORTAL_LOCALE_LEGACY_KEY])
      document.cookie = `${key}=${encodeURIComponent(locale)}; Path=/; Max-Age=${PORTAL_LOCALE_MAX_AGE}; SameSite=Lax${secure}`;
    document.cookie = `${PORTAL_LOCALE_VERSION_KEY}=2; Path=/; Max-Age=${PORTAL_LOCALE_MAX_AGE}; SameSite=Lax${secure}`;
  }
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
    if (
      Object.prototype.hasOwnProperty.call(portalCatalog[locale], result.messageKey) &&
      translated !== result.messageKey
    )
      return translated;
    if (
      locale === 'en' &&
      typeof result.message === 'string' &&
      result.message.trim() &&
      !result.message.startsWith('action.')
    )
      return result.message;
    return standaloneText(locale, fallbackKey);
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
