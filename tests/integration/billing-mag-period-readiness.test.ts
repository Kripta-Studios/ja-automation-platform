import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import { billingReadinessReviewPath } from '../../apps/portal/src/lib/portal/billing-readiness.ts';
import { summarizeTimeReadiness } from '../../packages/database/src/domains/billing/time-readiness-diagnostics.ts';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'mag-owner');
  const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'mag-finance');
  const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'mag-worker');
  const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'mag-manager');
  const entity = fixture.repository.createLegalEntity(owner, {
    code: 'MAG',
    legalName: 'MAG issuer',
    currency: 'EUR',
    billingAddress: 'Madrid',
    companyIdentifiers: 'MAG-TEST',
  });
  const revision = fixture.v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'MAG issuer',
    taxIdentifier: 'MAG-TEST',
    addressLine1: 'Madrid',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Test issuer',
    idempotencyKey: 'mag-revision',
  });
  fixture.v3.assignCanonicalLegalEntityToProject(finance, {
    projectId: fixture.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Test assignment',
    idempotencyKey: 'mag-assignment',
  });
  fixture.v3.createClientLaborRate(finance, {
    projectId: fixture.project.id,
    workerId: fixture.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 5000n,
    overtimeMethod: 'NONE',
    effectiveFrom: '2026-01-01',
  });
  const rule = fixture.repository.createBillingRule(finance, {
    projectId: fixture.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  return { ...fixture, owner, finance, worker, manager, rule };
}

describe('MAG October 15 invoice readiness', () => {
  it('labels approved invoice reservations separately from draft reservations', () => {
    const f = setup();
    const entry = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-10-15',
      minutes: 360,
      category: 'regular',
      summary: 'Approved invoice source',
    });
    f.repository.submitTime(f.worker, entry.id, entry.version);
    f.repository.operationalApproveTime(f.manager, entry.id, 'approved');
    f.repository.financeApproveTime(f.finance, entry.id, true);
    const invoice = f.repository.createInvoiceDraft(
      f.finance,
      f.rule.id,
      '2026-10-15',
      '2026-10-15',
    );
    f.repository.approveInvoiceDraft(f.finance, invoice.id);
    const result = f.repository.billingReadiness(f.finance, f.rule.id, '2026-10-15', '2026-10-15');
    expect(result.timeReadiness?.groups).toEqual([
      { status: 'reserved_in_approved_invoice', recordCount: 1, minutes: 360 },
    ]);
    expect(result.existingInvoiceState).toBe('approved');
  });

  it('keeps original actual hours visible while a correction blocks billing, then counts only the approved replacement', () => {
    const f = setup();
    const entry = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-10-15',
      minutes: 360,
      category: 'regular',
      summary: 'Actual original hours',
    });
    f.repository.submitTime(f.worker, entry.id, entry.version);
    f.repository.operationalApproveTime(f.manager, entry.id, 'approved');
    f.repository.financeApproveTime(f.finance, entry.id, true);
    const correction = f.repository.createCorrectionDraft(f.worker, {
      recordType: 'time_entry',
      originalId: entry.id,
      requestId: 'mag-correction-visible',
      reason: 'Correct the duration',
      patch: { minutes: 420 },
    });
    expect(
      f.sqlite
        .prepare(
          'SELECT billability_state,finance_approved_by,finance_approved_at FROM time_entry WHERE id=?',
        )
        .get(correction.correctionId),
    ).toEqual({
      billability_state: 'pending',
      finance_approved_by: null,
      finance_approved_at: null,
    });
    const audit = f.sqlite
      .prepare(
        "SELECT actor_id,details_json FROM audit_event WHERE action='correction.create' AND entity_id=?",
      )
      .get(correction.correctionId) as { actor_id: string; details_json: string };
    expect(audit.actor_id).toBe(f.worker.userId);
    expect(JSON.parse(audit.details_json)).toMatchObject({
      financeReviewRequired: true,
      originalId: entry.id,
    });
    const pending = f.repository.billingReadiness(f.finance, f.rule.id, '2026-10-15', '2026-10-15');
    expect(pending.timeReadiness?.groups).toEqual([
      { status: 'pending_correction', recordCount: 1, minutes: 360 },
    ]);
    expect(pending.includedSourceCount).toBe(0);
    expect(pending.reasons).toContainEqual({
      code: 'pending_time_submission',
      sourceId: correction.correctionId,
    });
    f.repository.submitTime(f.worker, correction.correctionId, 1);
    f.repository.operationalApproveTime(f.manager, correction.correctionId, 'approved');
    const operational = f.repository.billingReadiness(
      f.finance,
      f.rule.id,
      '2026-10-15',
      '2026-10-15',
    );
    expect(operational.timeReadiness).toMatchObject({ recordCount: 1, minutes: 420 });
    expect(operational.includedSourceCount).toBe(0);
    f.repository.financeApproveTime(f.finance, correction.correctionId, true);
    const approved = f.repository.billingReadiness(
      f.finance,
      f.rule.id,
      '2026-10-15',
      '2026-10-15',
    );
    expect(approved.timeReadiness?.groups).toEqual([
      { status: 'eligible', recordCount: 1, minutes: 420 },
    ]);
  });

  it('nearby dates exclude superseded originals and pending corrections', () => {
    const f = setup();
    const entry = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-10-15',
      minutes: 360,
      category: 'regular',
      summary: 'Nearby date original',
    });
    f.repository.submitTime(f.worker, entry.id, entry.version);
    f.repository.operationalApproveTime(f.manager, entry.id, 'approved');
    const correction = f.repository.createCorrectionDraft(f.worker, {
      recordType: 'time_entry',
      originalId: entry.id,
      requestId: 'mag-correction-date',
      reason: 'Correct the worked date',
      patch: { workDate: '2026-10-16', minutes: 420 },
    });
    expect(
      f.repository.billingReadiness(f.finance, f.rule.id, '2026-10-14', '2026-10-14')
        .nearbyApprovedTimeDates,
    ).toEqual([]);
    f.repository.submitTime(f.worker, correction.correctionId, 1);
    f.repository.operationalApproveTime(f.manager, correction.correctionId, 'approved');
    expect(
      f.repository.billingReadiness(f.finance, f.rule.id, '2026-10-14', '2026-10-14')
        .nearbyApprovedTimeDates,
    ).toEqual([{ workDate: '2026-10-16', minutes: 420 }]);
  });

  it('accepts inclusive effective day 15 as the first partial monthly cycle and never widens draft sources to day 14', () => {
    const f = setup();
    const rule = f.repository.createBillingRule(f.finance, {
      projectId: f.project.id,
      legalEntityId: String(
        f.sqlite.prepare('SELECT legal_entity_id FROM billing_rule WHERE id=?').get(f.rule.id)
          ?.legal_entity_id,
      ),
      streamType: 'labor',
      cadenceType: 'monthly',
      currency: 'EUR',
      effectiveFrom: '2026-10-15',
    });
    const entries = ['2026-10-14', '2026-10-15'].map((workDate) => {
      const entry = f.repository.createTimeEntry(f.worker, {
        projectId: f.project.id,
        workDate,
        minutes: 360,
        category: 'regular',
        summary: 'Inclusive boundary hours',
      });
      f.repository.submitTime(f.worker, entry.id, entry.version);
      f.repository.operationalApproveTime(f.manager, entry.id, 'approved');
      f.repository.financeApproveTime(f.finance, entry.id, true);
      return entry;
    });
    const result = f.repository.billingReadiness(f.finance, rule.id, '2026-10-15', '2026-10-31');
    expect(result.reasons).toEqual([]);
    expect(result.includedSourceCount).toBe(1);
    const invoice = f.repository.createInvoiceDraft(f.finance, rule.id, '2026-10-15', '2026-10-31');
    expect(
      f.sqlite
        .prepare("SELECT source_id FROM invoice_source WHERE invoice_id=? AND source_type='time'")
        .all(invoice.id),
    ).toEqual([{ source_id: entries[1]!.id }]);
    expect(
      f.repository.billingReadiness(f.finance, rule.id, '2026-10-14', '2026-10-31').reasons,
    ).toContainEqual({ code: 'billing_rule_outside_effective_window' });
  });
  it('keeps billed hours and a Finance non-billable decision out of eligible hours', () => {
    const result = summarizeTimeReadiness(
      [
        {
          id: 'issued-source',
          workDate: '2026-10-15',
          minutes: 360,
          approvalState: 'approved',
          billabilityState: 'billable',
          invoiceId: null,
          billingState: 'issued',
          clientBillable: true,
        },
        {
          id: 'nonbillable-source',
          workDate: '2026-10-15',
          minutes: 120,
          approvalState: 'approved',
          billabilityState: 'non_billable',
          invoiceId: null,
          clientBillable: true,
        },
      ],
      new Set(),
      new Set(),
    );
    expect(result.groups).toEqual([
      { status: 'already_billed', recordCount: 1, minutes: 360 },
      { status: 'finance_nonbillable', recordCount: 1, minutes: 120 },
    ]);
    expect(result.groups.some((group) => group.status === 'eligible')).toBe(false);
  });

  it('shows six approved hours awaiting Finance on the inclusive worked date, then includes them only after a billable decision', () => {
    const f = setup();
    const entry = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-10-15',
      minutes: 360,
      category: 'regular',
      summary: 'MAG six hours',
    });
    f.repository.submitTime(f.worker, entry.id, entry.version);
    f.repository.operationalApproveTime(f.manager, entry.id, 'approved');

    const before = f.repository.billingReadiness(f.finance, f.rule.id, '2026-10-15', '2026-10-15');
    expect(before.timeReadiness).toMatchObject({
      recordCount: 1,
      minutes: 360,
      groups: [{ status: 'pending_finance_review', recordCount: 1, minutes: 360 }],
      records: [{ sourceId: entry.id, workDate: '2026-10-15', minutes: 360 }],
    });
    expect(before.reasons).toContainEqual({
      code: 'pending_time_finance_review',
      sourceId: entry.id,
    });
    expect(before.includedSourceCount).toBe(0);
    expect(
      billingReadinessReviewPath(['pending_time_finance_review'], f.project.id, {
        start: '2026-10-15',
        end: '2026-10-15',
      }),
    ).toBe(
      `/approvals?stage=finance&project=${f.project.id}&from=2026-10-15&to=2026-10-15#finance-review`,
    );
    expect(() =>
      f.repository.billingReadiness(f.worker, f.rule.id, '2026-10-15', '2026-10-15'),
    ).toThrow(AccessDeniedError);

    f.repository.financeApproveTime(f.finance, entry.id, true);
    const eligible = f.repository.billingReadiness(
      f.finance,
      f.rule.id,
      '2026-10-15',
      '2026-10-15',
    );
    expect(eligible.timeReadiness?.groups).toEqual([
      { status: 'eligible', recordCount: 1, minutes: 360 },
    ]);
    expect(eligible.includedSourceCount).toBe(1);
    expect(eligible.hasPositiveDraftAmount).toBe(true);

    const invoice = f.repository.createInvoiceDraft(
      f.finance,
      f.rule.id,
      '2026-10-15',
      '2026-10-15',
    );
    expect(invoice.id).toBeTruthy();
    const billed = f.repository.billingReadiness(f.finance, f.rule.id, '2026-10-15', '2026-10-15');
    expect(billed.timeReadiness?.groups).toEqual([
      { status: 'reserved_in_draft', recordCount: 1, minutes: 360 },
    ]);
    // A same-period draft remains rebuildable from its reserved source.
    expect(billed.includedSourceCount).toBe(1);
    expect(billed.existingInvoiceId).toBe(invoice.id);
    f.repository.createInvoiceDraft(f.finance, f.rule.id, '2026-10-15', '2026-10-15');
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) count FROM invoice WHERE billing_rule_id=? AND state='draft'")
        .get(f.rule.id),
    ).toEqual({ count: 1 });
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM invoice_source WHERE source_type='time' AND source_id=?",
        )
        .get(entry.id),
    ).toEqual({ count: 1 });
  });

  it('shows a nearby worked date when an empty selected period misses approved time', () => {
    const f = setup();
    const entry = f.repository.createTimeEntry(f.worker, {
      projectId: f.project.id,
      workDate: '2026-10-15',
      minutes: 360,
      category: 'regular',
      summary: 'MAG six hours',
    });
    f.repository.submitTime(f.worker, entry.id, entry.version);
    f.repository.operationalApproveTime(f.manager, entry.id, 'approved');
    const readiness = f.repository.billingReadiness(
      f.finance,
      f.rule.id,
      '2026-10-14',
      '2026-10-14',
    );
    expect(readiness.timeReadiness).toMatchObject({ recordCount: 0, minutes: 0 });
    expect(readiness.nearbyApprovedTimeDates).toEqual([{ workDate: '2026-10-15', minutes: 360 }]);
  });
});
