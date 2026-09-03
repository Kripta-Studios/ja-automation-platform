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

  it('renders payment reversal feedback in every supported locale', () => {
    const key = 'action.billing.paymentReversed' as PortalTranslationKey;
    expect(translate('en', key)).toBe('Payment reversal recorded.');
    expect(translate('es', key)).toBe('Reversión del pago registrada.');
    expect(translate('pt', key)).toBe('Estorno do pagamento registrado.');
  });

  it('explains invoice-draft readiness blockers and resolved periods', () => {
    const key = 'action.billing.readiness.noBillableSources' as PortalTranslationKey;
    expect(translate('en', key)).toMatch(/approved billable hours/i);
    expect(translate('es', key)).toMatch(/facturables aprobados/i);
    expect(translate('pt', key)).toMatch(/faturáveis aprovadas/i);
    expect(
      translate('en', 'action.billing.invoiceDraftCreatedForPeriod' as PortalTranslationKey, {
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
      }),
    ).toContain('2026-08-10 → 2026-08-16');
    expect(translate('en', 'action.validation.accountingPeriod' as PortalTranslationKey)).toMatch(
      /previous complete month/i,
    );
  });

  it('keeps missing runtime keys safe for legacy callers', () => {
    expect(translate('es', 'customer-entered-value')).toBe('customer-entered-value');
  });
});
