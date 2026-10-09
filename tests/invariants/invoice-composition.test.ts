import { afterEach, describe, expect, it } from 'vitest';
import { ReadinessError } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'selection-invariant');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'selection-invariant');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'selection-invariant');
  f.v3.createClientLaborRate(finance, {
    projectId: f.project.id,
    workerId: f.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 12345n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-08-01',
  });
  const entity = f.repository.createLegalEntity(owner, {
    code: 'SELINV',
    legalName: 'Selected issuer',
    currency: 'EUR',
    billingAddress: 'Madrid test address',
    companyIdentifiers: 'SELECTED-ISSUER',
  });
  const revision = f.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Selected issuer',
    taxIdentifier: 'SELECTED-ISSUER',
    addressLine1: 'Madrid test address',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Explicit fixture invoice authority',
    idempotencyKey: 'selected-issuer-revision',
  });
  f.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: f.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Full fixture period issuing authority',
    idempotencyKey: 'selected-issuer-assignment',
  });
  f.repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: 'SELINV',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00Z',
  });
  const rule = f.repository.createBillingRule(finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-08-01',
  });
  const source = (date: string) => {
    const row = f.repository.createTimeEntry(worker, {
      projectId: f.project.id,
      workDate: date,
      category: 'regular',
      minutes: 60,
      summary: 'Selected actual labor',
    });
    f.repository.submitTime(worker, row.id, row.version);
    f.repository.operationalApproveTime(f.manager, row.id, 'approved');
    f.repository.financeApproveTime(finance, row.id, true);
    return {
      type: 'time' as const,
      id: row.id,
      version: Number(
        f.sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(row.id)!.version,
      ),
    };
  };
  return { f, finance, owner, source, rule };
}

describe('selected invoice historical and allocation invariants', () => {
  it('issues only selected sources, keeps retry identity and issued selection immutable, and allows the next same-period invoice', () => {
    const { f, finance, source, rule } = fixture();
    const chosen = source('2026-08-20');
    const other = source('2026-08-21');
    const input = {
      projectId: f.project.id,
      billingRuleId: rule.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      sources: [chosen],
      requestKey: 'selected-issued-invariant',
    };
    const draft = f.repository.createSelectedInvoiceDraft(finance, input);
    f.repository.approveInvoiceDraft(finance, draft.id);
    expect(f.repository.issueInvoice(finance, draft.id)).toMatchObject({ issued: true });
    const before = f.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(draft.id)!;
    expect(f.sqlite.prepare('SELECT invoice_id FROM time_entry WHERE id=?').get(chosen.id)).toEqual(
      { invoice_id: draft.id },
    );
    expect(f.sqlite.prepare('SELECT invoice_id FROM time_entry WHERE id=?').get(other.id)).toEqual({
      invoice_id: null,
    });
    expect(f.repository.createSelectedInvoiceDraft(finance, input)).toMatchObject({
      id: draft.id,
      existingState: 'issued',
      created: false,
    });
    expect(() =>
      f.repository.createSelectedInvoiceDraft(finance, {
        ...input,
        requestKey: 'selected-duplicate-invariant',
      }),
    ).toThrow(ReadinessError);
    expect(() =>
      f.sqlite
        .prepare('UPDATE invoice SET source_selection_json=? WHERE id=?')
        .run(JSON.stringify([other]), draft.id),
    ).toThrow('selection is immutable');
    expect(() =>
      f.repository.refreshSelectedInvoiceDraft(finance, draft.id, Number(before.version)),
    ).toThrow('Only an unissued');
    const next = f.repository.createSelectedInvoiceDraft(finance, {
      ...input,
      sources: [other],
      requestKey: 'selected-next-invariant',
    });
    expect(next.id).not.toBe(draft.id);
    expect(f.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(draft.id)).toEqual(before);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('shows a capped residual truthfully and recovers it through the canonical whole-period route', () => {
    const { f, finance, owner, source, rule } = fixture();
    f.sqlite
      .prepare("UPDATE project SET billing_model='capped_tm',po_cap_minor=5000 WHERE id=?")
      .run(f.project.id);
    const chosen = source('2026-08-20');
    const scope = {
      projectId: f.project.id,
      billingRuleId: rule.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    };
    const invoice = f.repository.createSelectedInvoiceDraft(finance, {
      ...scope,
      sources: [chosen],
      requestKey: 'selected-cap-invariant',
    });
    f.repository.approveInvoiceDraft(finance, invoice.id);
    f.repository.issueInvoice(finance, invoice.id);
    f.repository.updateProject(owner, { projectId: f.project.id, poCapMinor: 30000n });
    const inventory = f.repository.invoiceCompositionSources(finance, scope);
    expect(inventory.sources.find((row) => row.id === chosen.id)).toMatchObject({
      billingState: 'partially_billed',
      remainingAmountMinor: '7345',
      blockers: expect.arrayContaining([
        { code: 'source_requires_remaining_period_billing', sourceId: chosen.id },
      ]),
    });
    expect(
      f.repository.invoiceCompositionPreview(finance, { ...scope, sources: [chosen] }),
    ).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([
        { code: 'source_requires_remaining_period_billing', sourceId: chosen.id },
      ]),
    });
    const residual = f.repository.createInvoiceDraft(
      finance,
      rule.id,
      scope.periodStart,
      scope.periodEnd,
    );
    expect(
      f.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(residual.id),
    ).toEqual({ subtotal_minor: 7345 });
    expect(
      f.repository
        .invoiceCompositionSources(finance, scope)
        .sources.find((row) => row.id === chosen.id),
    ).toMatchObject({
      billingState: 'draft',
      blockers: expect.arrayContaining([{ code: 'source_already_reserved', sourceId: chosen.id }]),
    });
    f.repository.approveInvoiceDraft(finance, residual.id);
    f.repository.issueInvoice(finance, residual.id);
    expect(
      f.sqlite
        .prepare(
          "SELECT SUM(allocated_minor) amount FROM invoice_commercial_source_manifest WHERE source_type='time' AND source_id=?",
        )
        .get(chosen.id),
    ).toEqual({ amount: 12345 });
    expect(
      f.sqlite
        .prepare('SELECT invoice_id,billing_status FROM time_entry WHERE id=?')
        .get(chosen.id),
    ).toEqual({ invoice_id: residual.id, billing_status: 'locked' });
  });
});
