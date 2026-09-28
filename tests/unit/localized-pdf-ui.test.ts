import { describe, expect, it } from 'vitest';
import {
  canRetryLocalizedPdf,
  localizedPdfCollectionUrl,
  localizedPdfDownloadUrl,
  localizedPdfLocaleOptions,
  localizedPdfOwnerTypes,
  mergeLocalizedPdfVariant,
  normalizeLocalizedPdfLocale,
  type LocalizedPdfVariant,
} from '../../apps/portal/src/lib/portal/ui/localized-pdf/localized-pdf';

const variant = (overrides: Partial<LocalizedPdfVariant> = {}): LocalizedPdfVariant => ({
  variantId: 'variant-es',
  locale: 'es',
  status: 'queued',
  retryable: null,
  errorCode: null,
  semanticFilename: 'period-report-es.pdf',
  ...overrides,
});

describe('localized PDF UI contract helpers', () => {
  it('normalizes the three supported locale forms to the portal locale', () => {
    expect(normalizeLocalizedPdfLocale('en-US')).toBe('en');
    expect(normalizeLocalizedPdfLocale('es-ES')).toBe('es');
    expect(normalizeLocalizedPdfLocale('pt-BR')).toBe('pt');
    expect(normalizeLocalizedPdfLocale('pt')).toBe('pt');
    expect(normalizeLocalizedPdfLocale('fr-FR')).toBe('en');
  });

  it('publishes stable language options for the selector', () => {
    expect(localizedPdfLocaleOptions).toEqual([
      { value: 'en', labelKey: 'English' },
      { value: 'es', labelKey: 'Spanish' },
      { value: 'pt', labelKey: 'Portuguese' },
    ]);
  });

  it('keeps the five report owners on the shared API contract', () => {
    expect(localizedPdfOwnerTypes).toEqual([
      'invoice',
      'period_report_revision',
      'accounting_pack_revision',
      'daily_report',
      'technical_report',
    ]);
  });

  it('upserts a returned variant without changing another locale', () => {
    const current = [variant({ variantId: 'variant-en', locale: 'en' }), variant()];
    const updated = mergeLocalizedPdfVariant(current, variant({ status: 'ready' }));
    expect(updated).toHaveLength(2);
    expect(updated.find((item) => item.locale === 'es')?.status).toBe('ready');
    expect(updated.find((item) => item.locale === 'en')?.variantId).toBe('variant-en');
  });

  it('allows retry only for failed variants explicitly marked retryable', () => {
    expect(canRetryLocalizedPdf(variant({ status: 'failed', retryable: true }))).toBe(true);
    expect(canRetryLocalizedPdf(variant({ status: 'failed', retryable: false }))).toBe(false);
    expect(canRetryLocalizedPdf(variant({ status: 'ready', retryable: true }))).toBe(false);
  });

  it('encodes owner identity and variant identity in API URLs', () => {
    expect(localizedPdfCollectionUrl('/j-aautomation', 'daily_report', 'daily/1')).toBe(
      '/j-aautomation/app/api/localized-pdf?ownerType=daily_report&ownerId=daily%2F1',
    );
    expect(localizedPdfDownloadUrl('/j-aautomation', 'variant/1')).toBe(
      '/j-aautomation/app/api/localized-pdf/variant%2F1/download',
    );
  });
});
