import { describe, expect, it } from 'vitest';
import { accountingPackFinalizationReadiness } from '../../apps/portal/src/lib/portal/accounting-pack-finalization';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';

const emptySources = {
  sourceItemCount: 0,
  invoiceSourceCount: 0,
  paymentCount: 0,
  approvedTimeEntryCount: 0,
  approvedExpenseCount: 0,
};

describe('Accounting Pack finalization guidance', () => {
  it('requires a current issuer-specific revision even when exports and reconciliation are ready', () => {
    const reconciliation = {
      ...emptySources,
      reconciles: true,
      canonicalRevision: { status: 'partial', revisions: [], missingCurrencies: ['USD'] },
    };
    const before = structuredClone(reconciliation);
    const result = accountingPackFinalizationReadiness(reconciliation);
    expect(result.ready).toBe(false);
    expect(result.message).toContain('This empty period');
    expect(result.message).toContain('You can still download formats marked Ready.');
    expect(reconciliation).toEqual(before);
  });

  it('allows a current revision without reinterpreting source money', () => {
    expect(
      accountingPackFinalizationReadiness({
        canonicalRevision: { status: 'current', revisions: [{ revisionId: 'confirmed-revision' }] },
      }),
    ).toEqual({ ready: true, message: '' });
  });

  it.each([
    {},
    { canonicalRevision: null },
    { canonicalRevision: { status: 'current', revisions: [] } },
    { canonicalRevision: { status: 'current', revisions: 'unavailable' } },
    { canonicalRevision: { status: 'blocked', revisions: [] } },
    { canonicalRevision: { status: 'unconfigured', revisions: [] } },
    { canonicalRevision: { status: 'partial', revisions: [] }, sourceItemCount: 1 },
  ])('keeps incomplete versions unavailable without claiming an empty period', (reconciliation) => {
    const result = accountingPackFinalizationReadiness(reconciliation);
    expect(result.ready).toBe(false);
    expect(result.message).not.toContain('This empty period');
  });

  it.each(['es', 'pt'] as const)('localizes all finalization guidance in %s', (locale) => {
    const messages = [
      'Finalization unavailable',
      'Review invoice issuers',
      accountingPackFinalizationReadiness({
        ...emptySources,
        canonicalRevision: { status: 'partial', revisions: [] },
      }).message,
      accountingPackFinalizationReadiness({
        canonicalRevision: { status: 'partial', revisions: [] },
      }).message,
      accountingPackFinalizationReadiness({}).message,
    ];
    for (const message of messages) {
      expect(translate(locale, message)).not.toBe(message);
      expect(translate(locale, message)).not.toMatch(/canonical|canonicalRevision/u);
    }
  });
});
