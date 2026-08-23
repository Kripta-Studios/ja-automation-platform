import { describe, expect, it } from 'vitest';
import { createPortalLocaleController, documentLanguage, normalizePortalLocale } from './context';

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
