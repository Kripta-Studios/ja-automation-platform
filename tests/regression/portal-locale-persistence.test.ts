import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePortalLocalePreference } from '../../apps/portal/src/lib/i18n/context';
import {
  persistStandaloneLocale,
  standaloneActionMessage,
  resolveStandaloneLocale,
} from '../../apps/portal/src/routes/app/standalone-locale';

function browser(preferences: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  const storage = new Map(Object.entries(preferences));
  const jar = new Map(Object.entries(cookies));
  const writes: string[] = [];
  const documentLike = {
    get cookie() {
      return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(value: string) {
      writes.push(value);
      const pair = value.split(';')[0]!;
      const equal = pair.indexOf('=');
      jar.set(pair.slice(0, equal), pair.slice(equal + 1));
    },
  };
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    location: { protocol: 'https:' },
  });
  vi.stubGlobal('document', documentLike);
  return { storage, jar, writes };
}
afterEach(() => vi.unstubAllGlobals());

describe('portal language survives navigation and authentication boundaries', () => {
  it('never renders unknown action keys and preserves English legacy feedback only in English', () => {
    const result = {
      success: true,
      messageKey: 'action.notRegisteredAnywhere',
      message: 'Closeout draft prepared',
    };
    expect(standaloneActionMessage('en', result)).toBe('Closeout draft prepared');
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(
        standaloneActionMessage(locale, { success: true, messageKey: result.messageKey }),
      ).not.toContain('action.');
      expect(
        standaloneActionMessage(locale, { success: false, messageKey: result.messageKey }),
      ).not.toContain('action.');
      if (locale !== 'en') expect(standaloneActionMessage(locale, result)).not.toBe(result.message);
    }
  });

  it('defaults to English without preference and ignores invalid values', () => {
    expect(resolvePortalLocalePreference()).toBe('en');
    expect(resolvePortalLocalePreference('unknown', '', 'pt-BR')).toBe('pt');
    expect(resolveStandaloneLocale(null, 'es')).toBe('es');
    browser();
    expect(resolveStandaloneLocale()).toBe('en');
  });

  it.each(['en', 'es', 'pt'] as const)(
    'persists selected %s over stale canonical and legacy values',
    (selected) => {
      const state = browser(
        { 'ja.portal.locale': 'es', 'ja-portal-locale': 'pt' },
        { 'ja.portal.locale': 'es', 'ja-portal-locale': 'pt' },
      );
      // The authenticated selector, standalone pages and logout all call this same writer.
      persistStandaloneLocale(selected);
      expect(state.storage.get('ja.portal.locale')).toBe(selected);
      expect(state.storage.get('ja-portal-locale')).toBe(selected);
      expect(state.jar.get('ja.portal.locale')).toBe(selected);
      expect(state.jar.get('ja-portal-locale')).toBe(selected);
      expect(
        state.writes.every(
          (value) => value.includes('Max-Age=31536000') && value.includes('Secure'),
        ),
      ).toBe(true);
      expect(resolveStandaloneLocale(null, 'es')).toBe(selected);
      // A fresh SSR request after logout sees the same cookie preference.
      expect(
        resolvePortalLocalePreference(
          null,
          state.jar.get('ja.portal.locale'),
          state.jar.get('ja-portal-locale'),
        ),
      ).toBe(selected);
    },
  );

  it('uses explicit links first, then SSR cookies, and migrates storage only without cookies', () => {
    browser(
      { 'ja.portal.locale': 'es', 'ja-portal-locale': 'pt', 'ja.portal.locale.version': '2' },
      { 'ja.portal.locale': 'en' },
    );
    expect(resolveStandaloneLocale(null, 'en')).toBe('en');
    expect(resolveStandaloneLocale('pt-BR', 'en')).toBe('pt');
    expect(resolveStandaloneLocale('invalid', 'en')).toBe('en');
    browser({ 'ja-portal-locale': 'pt' });
    expect(resolveStandaloneLocale(null, 'en')).toBe('pt');
  });

  it('migrates the last selection from the old shell before stale canonical Spanish', () => {
    const state = browser(
      { 'ja.portal.locale': 'es', 'ja-portal-locale': 'en' },
      { 'ja.portal.locale': 'es' },
    );
    const migrated = resolveStandaloneLocale(null, 'es');
    expect(migrated).toBe('en');
    persistStandaloneLocale(migrated);
    expect(state.storage.get('ja.portal.locale.version')).toBe('2');
    expect(state.jar.get('ja.portal.locale')).toBe('en');
    expect(resolveStandaloneLocale(null, 'es')).toBe('en');
  });

  it('does not remigrate stale readable storage when writes fail after selecting English', () => {
    const state = browser(
      { 'ja.portal.locale': 'es', 'ja-portal-locale': 'es' },
      { 'ja.portal.locale': 'es' },
    );
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => state.storage.get(key) ?? null,
        setItem: () => {
          throw new Error('Storage quota exceeded');
        },
      },
    });
    expect(resolveStandaloneLocale(null, 'es')).toBe('es');
    persistStandaloneLocale('en');
    expect(state.storage.get('ja-portal-locale')).toBe('es');
    expect(state.jar.get('ja.portal.locale')).toBe('en');
    expect(state.jar.get('ja.portal.locale.version')).toBe('2');
    expect(resolveStandaloneLocale(null, 'en')).toBe('en');
  });

  it('retains cookie persistence when localStorage is unavailable', () => {
    const state = browser({}, { 'ja.portal.locale': 'es' });
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage blocked');
      },
    });
    expect(resolveStandaloneLocale(null, 'en')).toBe('es');
    persistStandaloneLocale('en');
    expect(state.jar.get('ja.portal.locale')).toBe('en');
    expect(resolveStandaloneLocale(null, 'es')).toBe('en');
  });
});
