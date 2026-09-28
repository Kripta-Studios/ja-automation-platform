import { describe, expect, it } from 'vitest';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const keys = [
  'problem.billing.sessionExpired',
  'problem.billing.planningInvoiceLocked',
  'problem.billing.planningAttemptNotSaved',
  'problem.billing.taxProfileUnavailable',
  'problem.billing.taxProfileApprovedInvoiceBlocksArchive',
  'problem.billing.selectedIssuerUnavailable',
  'problem.billing.streamTaxProfileUnavailable',
  'problem.billing.streamTaxProfileIssuerMismatch',
  'problem.billing.streamTaxProfileCurrencyMismatch',
  'problem.billing.streamTaxProfileChanged',
  'problem.billing.adjustmentOriginalUnavailable',
  'problem.billing.creditRestoreStateBlocked',
  'problem.billing.creditRestoreChanged',
] as const;

describe('billing fallthrough translations', () => {
  it.each(keys)('resolves %s to readable prose in English, Spanish, and Portuguese', (key) => {
    const english = portalText('en', key);
    expect(english).not.toBe(key);
    expect(english.length).toBeGreaterThan(30);
    for (const locale of ['es', 'pt'] as const) {
      const translated = portalText(locale, key);
      expect(translated, `${locale} ${key}`).not.toBe(key);
      expect(translated, `${locale} ${key}`).not.toBe(english);
      expect(translated.length, `${locale} ${key}`).toBeGreaterThan(30);
    }
  });
});
