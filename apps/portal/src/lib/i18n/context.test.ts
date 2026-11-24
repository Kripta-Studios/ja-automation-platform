import { describe, expect, it } from 'vitest';
import {
  acceptLanguageLocale,
  createPortalLocaleController,
  documentLanguage,
  normalizePortalLocale,
} from './context';

describe('portal locale context contract', () => {
  it.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['es-ES', 'es'],
    ['pt-BR', 'pt'],
    ['PT_br', 'pt'],
    ['unknown', 'en'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizePortalLocale(input)).toBe(expected);
  });

  it.each([
    ['en', 'en-US'],
    ['es', 'es-ES'],
    ['pt', 'pt-BR'],
  ] as const)('maps %s to the document language %s', (locale, expected) => {
    expect(documentLanguage(locale)).toBe(expected);
  });

  it('persists and broadcasts locale changes through a small framework-neutral store', () => {
    const storage = new Map<string, string>();
    const controller = createPortalLocaleController({ locale: 'en', storage });
    const seen: string[] = [];
    const unsubscribe = controller.subscribe((locale) => seen.push(locale));

    controller.set('pt-BR');
    controller.set('es-ES');
    unsubscribe();

    expect(controller.get()).toBe('es');
    expect(storage.get('ja.portal.locale')).toBe('es');
    expect(seen).toEqual(['en', 'pt', 'es']);
  });
});

describe('accept-language first-visit fallback (audit T78 / technician-19)', () => {
  it('picks the best supported language by q-value', () => {
    expect(acceptLanguageLocale('es-ES,es;q=0.9,en;q=0.8')).toBe('es');
    expect(acceptLanguageLocale('de-DE,pt-BR;q=0.7,en;q=0.5')).toBe('pt');
    expect(acceptLanguageLocale('fr;q=1, en;q=0.1')).toBe('en');
    expect(acceptLanguageLocale('de, fr')).toBeNull();
    expect(acceptLanguageLocale(null)).toBeNull();
  });
});

