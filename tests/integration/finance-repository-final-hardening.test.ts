import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: Array<ReturnType<typeof createB5LifecycleSecurityFixture>> = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setupInvoice(withCanonicalAssignment = true) {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'repository-final-hardening');
  const legalEntity = fixture.repository.createLegalEntity(fixture.owner, {
    code: 'REPO-HARDENING',
    legalName: 'Repository Hardening Entity',
    currency: 'EUR',
    billingAddress: 'Repository Hardening address',
    companyIdentifiers: 'Repository Hardening identifiers',
  });
  const canonical = fixture.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: legalEntity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Repository Hardening Entity',
    taxIdentifier: 'ESREPOHARDENING1',
    addressLine1: 'Repository Hardening address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Bind repository hardening fixture to canonical invoice authority',
    idempotencyKey: 'repository-hardening:canonical-revision',
  });
  if (withCanonicalAssignment)
    fixture.v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: fixture.project.id,
      legalEntityRevisionId: canonical.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind repository hardening project to canonical invoice authority',
      idempotencyKey: 'repository-hardening:canonical-assignment',
    });
  fixture.repository.createInvoiceNumberPolicy(fixture.owner, {
    legalEntityId: legalEntity.id,
    prefix: 'REPO',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00.000Z',
  });
  const taxProfile = fixture.repository.createTaxProfile(finance, {
    legalEntityId: legalEntity.id,
    name: 'No tax',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const billingRule = fixture.repository.createBillingRule(finance, {
    projectId: fixture.project.id,
    legalEntityId: legalEntity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: taxProfile.id,
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  fixture.v3.createClientLaborRate(finance, {
    projectId: fixture.project.id,
    workerId: 'b5-worker',
    currency: 'EUR',
    hourlyRateMinor: 10_000n,
    effectiveFrom: '2026-01-01',
  });
  const time = fixture.repository.createTimeEntry(fixture.worker, {
    projectId: fixture.project.id,
    workDate: '2026-08-03',
    category: 'regular',
    minutes: 60,
    summary: 'Repository hardening source',
  });
  fixture.repository.submitTime(fixture.worker, time.id, time.version);
  fixture.repository.operationalApproveTime(fixture.manager, time.id, 'approved');
  fixture.repository.financeApproveTime(finance, time.id, true);
  const draft = fixture.repository.createInvoiceDraft(
    finance,
    billingRule.id,
    '2026-08-01',
    '2026-08-31',
  );
  fixture.repository.approveInvoiceDraft(finance, draft.id);
  return { ...fixture, finance, canonicalRevisionId: canonical.revisionId, draftId: draft.id };
}

function issueState(fixture: ReturnType<typeof setupInvoice>) {
  return fixture.sqlite
    .prepare(
      `SELECT state,invoice_number,issued_at,source_lock_at,legal_entity_revision_id
         FROM invoice WHERE id=?`,
    )
    .get(fixture.draftId);
}

function expectNoIssueWrites(fixture: ReturnType<typeof setupInvoice>) {
  expect(issueState(fixture)).toEqual({
    state: 'approved',
    invoice_number: null,
    issued_at: null,
    source_lock_at: null,
    legal_entity_revision_id: null,
  });
  expect(
    fixture.sqlite
      .prepare(
        'SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=? AND locked_at IS NOT NULL',
      )
      .get(fixture.draftId),
  ).toEqual({ count: 0 });
  expect(
    fixture.sqlite
      .prepare(
        'SELECT COUNT(*) count FROM invoice_commercial_source_manifest WHERE invoice_id=? AND locked_at IS NOT NULL',
      )
      .get(fixture.draftId),
  ).toEqual({ count: 0 });
  expect(
    fixture.sqlite
      .prepare(
        "SELECT COUNT(*) count FROM outbox_event WHERE topic='invoice.issued' AND aggregate_id=?",
      )
      .get(fixture.draftId),
  ).toEqual({ count: 0 });
}

describe('PortalRepository final finance hardening', () => {
  it('fails closed when the project has no canonical legal-entity revision', () => {
    const fixture = setupInvoice(false);

    expect(() => fixture.repository.issueInvoice(fixture.finance, fixture.draftId)).toThrow(
      /canonical.*(legal.?entity|revision)|legal.?entity.*canonical/i,
    );
    expectNoIssueWrites(fixture);
  });

  it('rejects an approved invoice whose line projection is empty', () => {
    const fixture = setupInvoice();
    fixture.sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(fixture.draftId);

    expect(() => fixture.repository.issueInvoice(fixture.finance, fixture.draftId)).toThrow(
      /invoice.*line|line.*invoice/i,
    );
    expectNoIssueWrites(fixture);
  });

  it('rejects an approved invoice whose commercial manifest is empty', () => {
    const fixture = setupInvoice();
    fixture.sqlite
      .prepare('DELETE FROM invoice_commercial_source_manifest WHERE invoice_id=?')
      .run(fixture.draftId);

    expect(() => fixture.repository.issueInvoice(fixture.finance, fixture.draftId)).toThrow(
      /commercial.*manifest|manifest.*commercial/i,
    );
    expectNoIssueWrites(fixture);
  });

  it('rejects a forged commercial source hash without partially issuing', () => {
    const fixture = setupInvoice();
    fixture.sqlite
      .prepare('UPDATE invoice_commercial_source_manifest SET source_hash=? WHERE invoice_id=?')
      .run('f'.repeat(64), fixture.draftId);

    expect(() => fixture.repository.issueInvoice(fixture.finance, fixture.draftId)).toThrow(
      /hash|manifest/i,
    );
    expectNoIssueWrites(fixture);
  });

  it('preserves a large minor-unit value exactly through issue snapshots', () => {
    const fixture = setupInvoice();
    const high = '9007199254740993';
    const line = fixture.sqlite
      .prepare('SELECT id FROM invoice_line WHERE invoice_id=? ORDER BY rowid LIMIT 1')
      .get(fixture.draftId) as { id: string };
    const source = fixture.sqlite
      .prepare('SELECT source_link_id FROM invoice_source WHERE invoice_id=? LIMIT 1')
      .get(fixture.draftId) as { source_link_id: string };
    fixture.sqlite
      .prepare(
        'SELECT manifest_id FROM invoice_commercial_source_manifest WHERE invoice_id=? LIMIT 1',
      )
      .get(fixture.draftId);
    fixture.sqlite
      .prepare('UPDATE invoice_line SET subtotal_minor=?,unit_price_minor=? WHERE id=?')
      .run(high, high, line.id);
    fixture.sqlite
      .prepare('UPDATE invoice SET subtotal_minor=?,tax_minor=0,total_minor=? WHERE id=?')
      .run(high, high, fixture.draftId);
    fixture.sqlite
      .prepare(
        'UPDATE invoice_source SET allocated_net_minor=?,allocated_tax_minor=0,allocated_gross_minor=? WHERE source_link_id=?',
      )
      .run(high, high, source.source_link_id);
    fixture.sqlite
      .prepare(
        'UPDATE invoice_commercial_source_manifest SET original_minor=?,allocated_minor=?,remaining_minor=0 WHERE invoice_id=?',
      )
      .run(high, high, fixture.draftId);

    const result = fixture.repository.issueInvoice(fixture.finance, fixture.draftId);
    expect(result.issued).toBe(true);
    const snapshot = JSON.parse(
      (
        fixture.sqlite
          .prepare('SELECT snapshot_json FROM invoice WHERE id=?')
          .get(fixture.draftId) as {
          snapshot_json: string;
        }
      ).snapshot_json,
    ) as {
      calculation: { subtotalMinor: string; totalMinor: string };
      lines: Array<{ subtotal_minor: string; unit_price_minor: string }>;
      sources: Array<{ allocated_net_minor: string }>;
      commercialSourceManifest: Array<{ allocated_minor: string }>;
    };
    expect(snapshot.calculation).toEqual({
      currency: 'EUR',
      subtotalMinor: high,
      taxMinor: '0',
      totalMinor: high,
    });
    expect(snapshot.lines[0]).toMatchObject({ subtotal_minor: high, unit_price_minor: high });
    expect(snapshot.sources[0]).toMatchObject({ allocated_net_minor: high });
    expect(snapshot.commercialSourceManifest[0]).toMatchObject({ allocated_minor: high });
  });

  it('issues a fully canonical invoice with a complete source projection', () => {
    const fixture = setupInvoice();
    const result = fixture.repository.issueInvoice(fixture.finance, fixture.draftId);
    expect(result.issued).toBe(true);
    expect(
      fixture.sqlite
        .prepare('SELECT legal_entity_revision_id FROM invoice WHERE id=?')
        .get(fixture.draftId),
    ).toEqual({ legal_entity_revision_id: fixture.canonicalRevisionId });
  });
});
