import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError, ReadinessError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const base = createB5LifecycleSecurityFixture();
  const value = {
    ...base,
    owner: stepUpB5Principal(base.sqlite, base.owner, 'finance-entity-owner'),
    finance: stepUpB5Principal(base.sqlite, base.finance, 'finance-entity-finance'),
  };
  fixtures.push(value);
  // This regression suite exercises the lifecycle-aware repository contract against the
  // legacy fixture schema.  Keep the fixture's hand-built legal-entity shape aligned with the
  // contract without weakening the production query that requires an active/archived status.
  const legalEntityColumns = value.sqlite
    .prepare("PRAGMA table_info('legal_entity')")
    .all() as Array<{ name: string }>;
  if (!legalEntityColumns.some((column) => column.name === 'status'))
    value.sqlite.exec(
      "ALTER TABLE legal_entity ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived'))",
    );
  return value;
}

function seedApprovedMilestone(
  value: B5LifecycleSecurityFixture,
  name: string,
  dueOn: string,
): void {
  const milestone = value.repository.createProjectMilestone(value.owner, {
    projectId: value.project.id,
    name,
    amountMinor: 10_000n,
    dueOn,
  });
  value.repository.submitProjectMilestone(value.owner, milestone.id, milestone.version);
  value.repository.reviewProjectMilestone(value.finance, milestone.id, 'approved');
}

describe('finance entity reviewer regressions', () => {
  it('updates and archives tax profiles using only columns in the schema', () => {
    const value = fixture();
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'TAX-FIX',
      legalName: 'Tax Fix Entity',
      currency: 'EUR',
      billingAddress: 'Madrid',
      companyIdentifiers: 'ES-TAX-FIX',
    });
    const profile = value.repository.createTaxProfile(value.finance, {
      legalEntityId: entity.id,
      name: 'Initial tax profile',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'VAT', basisPoints: 2_100 }],
    });

    expect(() =>
      value.repository.updateTaxProfile(value.finance, profile.id, {
        name: 'Renamed tax profile',
      }),
    ).not.toThrow();
    expect(
      value.sqlite
        .prepare('SELECT name,status,effective_to,version FROM tax_profile WHERE id=?')
        .get(profile.id),
    ).toMatchObject({
      name: 'Renamed tax profile',
      status: 'active',
      effective_to: null,
      version: 2,
    });

    expect(() => value.repository.archiveTaxProfile(value.finance, profile.id)).not.toThrow();
    expect(
      value.sqlite
        .prepare('SELECT status,effective_to,version FROM tax_profile WHERE id=?')
        .get(profile.id),
    ).toMatchObject({ status: 'archived', version: 3 });
  });

  it('does not allow an archived legal entity to enter a new billing flow', () => {
    const value = fixture();
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'ARCHIVE-FIX',
      legalName: 'Archived Entity',
      currency: 'EUR',
      billingAddress: 'Madrid',
      companyIdentifiers: 'ES-ARCHIVE-FIX',
    });
    value.repository.createInvoiceNumberPolicy(value.owner, {
      legalEntityId: entity.id,
      prefix: 'ARCH',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const taxProfile = value.repository.createTaxProfile(value.finance, {
      legalEntityId: entity.id,
      name: 'Archived entity tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'VAT', basisPoints: 2_100 }],
    });
    const rule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'milestone',
      cadenceType: 'manual',
      taxProfileId: taxProfile.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    seedApprovedMilestone(value, 'Archived entity source', '2026-08-15');

    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-08-01', '2026-08-31'),
    ).toMatchObject({
      state: 'ready',
      reasons: [],
    });
    const draft = value.repository.createInvoiceDraft(
      value.finance,
      rule.id,
      '2026-08-01',
      '2026-08-31',
    );
    value.repository.approveInvoiceDraft(value.finance, draft.id);
    value.repository.archiveLegalEntity(value.owner, entity.id);

    const readiness = value.repository.billingReadiness(
      value.finance,
      rule.id,
      '2026-09-01',
      '2026-09-30',
    );
    expect(readiness.state).toBe('incomplete');
    expect(readiness.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'archived_legal_entity' })]),
    );
    expect(() =>
      value.repository.createInvoiceDraft(value.finance, rule.id, '2026-09-01', '2026-09-30'),
    ).toThrow(ReadinessError);
    expect(() =>
      value.repository.createInvoiceNumberPolicy(value.owner, {
        legalEntityId: entity.id,
        prefix: 'ARCH2',
        digits: 6,
        effectiveFrom: '2026-09-01',
        accountantApprovedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow(/archived|active legal entity/i);
    expect(() =>
      value.repository.createTaxProfile(value.finance, {
        legalEntityId: entity.id,
        name: 'Must not be created',
        currency: 'EUR',
        effectiveFrom: '2026-09-01',
        components: [{ name: 'VAT', basisPoints: 2_100 }],
      }),
    ).toThrow(/archived|active legal entity/i);
    expect(() =>
      value.repository.createBillingRule(value.finance, {
        projectId: value.project.id,
        legalEntityId: entity.id,
        streamType: 'other',
        cadenceType: 'manual',
        taxProfileId: taxProfile.id,
        currency: 'EUR',
        effectiveFrom: '2026-09-01',
      }),
    ).toThrow(/archived|active legal entity/i);
    expect(() => value.repository.issueInvoice(value.finance, draft.id)).toThrow(
      /archived legal entity/i,
    );
  });

  it('blocks currency changes that would reinterpret active finance configuration', () => {
    const value = fixture();
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'CURRENCY-FIX',
      legalName: 'Currency Entity',
      currency: 'EUR',
      billingAddress: 'Madrid',
      companyIdentifiers: 'ES-CURRENCY-FIX',
    });
    const profile = value.repository.createTaxProfile(value.finance, {
      legalEntityId: entity.id,
      name: 'Currency tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'VAT', basisPoints: 2_100 }],
    });
    const rule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'milestone',
      cadenceType: 'manual',
      taxProfileId: profile.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    expect(() =>
      value.repository.updateLegalEntity(value.owner, entity.id, { currency: 'USD' }),
    ).toThrow(ConflictError);
    expect(
      value.sqlite.prepare('SELECT currency,version FROM legal_entity WHERE id=?').get(entity.id),
    ).toEqual({ currency: 'EUR', version: 1 });

    value.repository.archiveTaxProfile(value.finance, profile.id);
    expect(() =>
      value.repository.updateLegalEntity(value.owner, entity.id, { currency: 'USD' }),
    ).toThrow(/billing rule|currency/i);
    expect(rule.id).toBeTruthy();
  });

  it('honours an explicitly closed billing period before cadence validation', () => {
    const value = fixture();
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'CLOSED-PERIOD',
      legalName: 'Closed Period Entity',
      currency: 'EUR',
      billingAddress: 'Madrid',
      companyIdentifiers: 'ES-CLOSED-PERIOD',
    });
    value.repository.createInvoiceNumberPolicy(value.owner, {
      legalEntityId: entity.id,
      prefix: 'CLOSE',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const taxProfile = value.repository.createTaxProfile(value.finance, {
      legalEntityId: entity.id,
      name: 'Closed period tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'VAT', basisPoints: 2_100 }],
    });
    // V3's period-close operation records the authoritative closed period. The
    // monthly rule deliberately does not match the explicitly closed 14-day
    // range, which reproduces the reviewer regression in PortalRepository.
    const rule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'milestone',
      cadenceType: 'monthly',
      taxProfileId: taxProfile.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    seedApprovedMilestone(value, 'Closed-period source', '2026-08-10');

    expect(
      value.v3.closeBillingPeriod(value.finance, rule.id, '2026-08-03', '2026-08-16').closed,
    ).toBe(true);
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-08-03', '2026-08-16'),
    ).toMatchObject({ state: 'already_closed', reasons: [] });
    expect(() =>
      value.repository.createInvoiceDraft(value.finance, rule.id, '2026-08-03', '2026-08-16'),
    ).not.toThrow();
  });

  it('allows a currency change only when no financial configuration or history is attached', () => {
    const value = fixture();
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'CURRENCY-EMPTY',
      legalName: 'Empty Currency Entity',
      currency: 'EUR',
      billingAddress: 'Madrid',
      companyIdentifiers: 'ES-CURRENCY-EMPTY',
    });

    expect(() =>
      value.repository.updateLegalEntity(value.owner, entity.id, { currency: 'USD' }),
    ).not.toThrow();
    expect(
      value.sqlite.prepare('SELECT currency,version FROM legal_entity WHERE id=?').get(entity.id),
    ).toEqual({ currency: 'USD', version: 2 });
  });
});
