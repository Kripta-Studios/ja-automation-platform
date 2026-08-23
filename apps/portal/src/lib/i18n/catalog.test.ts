import { describe, expect, it } from 'vitest';
import {
  INVARIANT_TRANSLATION_KEYS,
  isCoverageInvariantKey,
  portalCatalog,
  portalCatalogKeys,
  translate,
  type PortalTranslationKey,
} from './catalog';

describe('portal locale catalog', () => {
  it('keeps the three catalogs in exact key parity', () => {
    const keys = new Set(portalCatalogKeys);

    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(Object.keys(portalCatalog[locale]).sort()).toEqual([...keys].sort());
    }
  });

  it('does not leave English copy in ES or PT outside the explicit invariant allowlist', () => {
    for (const key of portalCatalogKeys) {
      if (INVARIANT_TRANSLATION_KEYS.has(key) || isCoverageInvariantKey(key)) continue;
      expect(portalCatalog.es[key]).not.toBe(portalCatalog.en[key]);
      expect(portalCatalog.pt[key]).not.toBe(portalCatalog.en[key]);
    }
  });

  it('interpolates named parameters without changing source content', () => {
    const key = 'Hello, {name}' as PortalTranslationKey;
    expect(translate('es', key, { name: 'Ana' })).toBe('Hola, Ana');
    expect(translate('pt', key, { name: 'João' })).toBe('Olá, João');
    expect(translate('en', key, { name: 'Sam' })).toBe('Hello, Sam');
  });

  it('keeps missing runtime keys safe for legacy callers', () => {
    expect(translate('es', 'customer-entered-value')).toBe('customer-entered-value');
  });
});
