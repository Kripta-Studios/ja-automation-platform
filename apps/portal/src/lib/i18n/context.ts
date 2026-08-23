import {
  createTranslator,
  type DocumentLanguage,
  normalizePortalLocale as normalizeCatalogLocale,
  type PortalLocale,
  type PortalLocaleInput,
} from './catalog';

export const PORTAL_LOCALE_STORAGE_KEY = 'ja.portal.locale';

export function normalizePortalLocale(value: PortalLocaleInput): PortalLocale {
  return normalizeCatalogLocale(value);
}

export function documentLanguage(locale: PortalLocaleInput): DocumentLanguage {
  const normalized = normalizePortalLocale(locale);
  return normalized === 'es' ? 'es-ES' : normalized === 'pt' ? 'pt-BR' : 'en-US';
}

type LocaleStorage = Pick<Storage, 'getItem' | 'setItem'> | Map<string, string>;

function readStorage(storage: LocaleStorage | undefined): string | null {
  if (!storage) return null;
  return storage instanceof Map
    ? (storage.get(PORTAL_LOCALE_STORAGE_KEY) ?? null)
    : storage.getItem(PORTAL_LOCALE_STORAGE_KEY);
}

function writeStorage(storage: LocaleStorage | undefined, value: string): void {
  if (!storage) return;
  if (storage instanceof Map) storage.set(PORTAL_LOCALE_STORAGE_KEY, value);
  else storage.setItem(PORTAL_LOCALE_STORAGE_KEY, value);
}

export function setDocumentLanguage(
  locale: PortalLocaleInput,
  documentLike?: { documentElement: { lang: string } } | null,
): DocumentLanguage {
  const language = documentLanguage(locale);
  const target = documentLike ?? (typeof document === 'undefined' ? null : document);
  if (target) target.documentElement.lang = language;
  return language;
}

export function createPortalLocaleController(
  options: {
    locale?: PortalLocaleInput;
    storage?: LocaleStorage;
    documentLike?: { documentElement: { lang: string } } | null;
  } = {},
) {
  let current = normalizePortalLocale(options.locale ?? readStorage(options.storage) ?? 'en');
  const listeners = new Set<(locale: PortalLocale) => void>();
  setDocumentLanguage(current, options.documentLike);

  return {
    get: () => current,
    translate: (
      key: Parameters<ReturnType<typeof createTranslator>>[0],
      params?: Parameters<ReturnType<typeof createTranslator>>[1],
    ) => createTranslator(current)(key, params),
    set: (value: PortalLocaleInput) => {
      current = normalizePortalLocale(value);
      writeStorage(options.storage, current);
      setDocumentLanguage(current, options.documentLike);
      for (const listener of listeners) listener(current);
    },
    subscribe: (listener: (locale: PortalLocale) => void) => {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
  };
}
