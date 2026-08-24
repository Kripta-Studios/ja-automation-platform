import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  value.v3.createClientLaborRate(value.finance, {
    projectId: value.project.id,
    workerId: value.worker.userId,
    currency: 'EUR',
    hourlyRateMinor: 6_000n,
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 20_000,
    effectiveFrom: '2026-08-01',
  });
  value.v3.createInternalCostRule(value.finance, {
    workerId: value.worker.userId,
    projectId: value.project.id,
    currency: 'EUR',
    hourlyRateMinor: 2_000n,
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 20_000,
    effectiveFrom: '2026-08-01',
  });
  value.v3.createCompensationRule(value.finance, {
    workerId: value.worker.userId,
    projectId: value.project.id,
    currency: 'EUR',
    ruleType: 'Hourly',
    rateMinor: 3_000n,
    overtimeMethod: 'BASE_RATE_MULTIPLIER',
    overtimeMultiplierBps: 20_000,
    travelMethod: 'BASE',
    effectiveFrom: '2026-08-01',
  });
  return value;
}

function approvedTime(
  value: B5LifecycleSecurityFixture,
  workDate: string,
  minutes: number,
  category: 'regular' | 'commissioning' | 'overtime' | 'travel' = 'regular',
) {
  const row = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate,
    category,
    minutes,
    summary: `${category} policy consumption ${workDate}`,
  });
  value.repository.submitTime(value.worker, row.id, row.version);
  value.repository.operationalApproveTime(value.manager, row.id, 'approved');
  value.repository.financeApproveTime(value.finance, row.id, true);
  return row;
}

function finance(value: B5LifecycleSecurityFixture, workDate: string) {
  return value.v3.projectFinance(value.finance, value.project.id, workDate, workDate);
}

describe('Client Essential effective commercial policy consumption', () => {
  it('derives exact Work/Commissioning overtime boundaries without changing actual time or legacy overtime', () => {
    const value = fixture();
    value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-01',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 60,
      travelClientBillable: true,
      customerSignoffRequired: false,
    });

    approvedTime(value, '2026-08-01', 30);
    approvedTime(value, '2026-08-02', 60, 'commissioning');
    approvedTime(value, '2026-08-03', 30);
    approvedTime(value, '2026-08-03', 60, 'commissioning');
    approvedTime(value, '2026-08-04', 30, 'overtime');

    expect(finance(value, '2026-08-01')).toMatchObject({
      actualMinutes: 30,
      approvedMinutes: 30,
      overtimeMinutes: 0,
      laborRevenueMinor: '3000',
    });
    expect(finance(value, '2026-08-02')).toMatchObject({
      actualMinutes: 60,
      approvedMinutes: 60,
      overtimeMinutes: 0,
      laborRevenueMinor: '6000',
    });
    expect(finance(value, '2026-08-03')).toMatchObject({
      actualMinutes: 90,
      approvedMinutes: 90,
      overtimeMinutes: 30,
      laborRevenueMinor: '12000',
      directLaborCostMinor: '4000',
      workerCompensationMinor: '6000',
    });
    expect(finance(value, '2026-08-04')).toMatchObject({
      actualMinutes: 30,
      approvedMinutes: 30,
      overtimeMinutes: 30,
      laborRevenueMinor: '6000',
      directLaborCostMinor: '2000',
      workerCompensationMinor: '3000',
    });
    expect(value.v3.workerPay(value.worker, '2026-08-03', '2026-08-03')).toMatchObject({
      approvedMinutes: 90,
      estimatedApprovedMinor: '6000',
    });

    value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-10',
      overtimeEnabled: false,
      overtimeThresholdMinutes: null,
      travelClientBillable: true,
      customerSignoffRequired: false,
    });
    approvedTime(value, '2026-08-10', 90, 'commissioning');
    expect(finance(value, '2026-08-10')).toMatchObject({
      actualMinutes: 90,
      overtimeMinutes: 0,
      laborRevenueMinor: '9000',
    });

    value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-20',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 120,
      travelClientBillable: true,
      customerSignoffRequired: false,
    });
    approvedTime(value, '2026-08-20', 90);
    expect(finance(value, '2026-08-20')).toMatchObject({
      actualMinutes: 90,
      overtimeMinutes: 0,
      laborRevenueMinor: '9000',
    });
    // A later immutable policy version must not reinterpret an earlier source date.
    expect(finance(value, '2026-08-03')).toMatchObject({
      actualMinutes: 90,
      overtimeMinutes: 30,
      laborRevenueMinor: '12000',
    });
  });

  it('keeps Travel client billability, worker compensation, and minimum billing independent', () => {
    const value = fixture();
    value.sqlite
      .prepare('UPDATE project SET client_daily_minimum_minutes=120 WHERE id=?')
      .run(value.project.id);
    value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-01',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 600,
      travelClientBillable: false,
      customerSignoffRequired: false,
    });
    approvedTime(value, '2026-08-01', 30);
    approvedTime(value, '2026-08-02', 60, 'travel');

    const minimum = finance(value, '2026-08-01');
    expect(minimum).toMatchObject({
      actualMinutes: 30,
      approvedMinutes: 30,
      billableMinutes: 120,
      workerCompensationMinor: '1500',
      laborRevenueMinor: '12000',
    });
    const travelNotBillable = finance(value, '2026-08-02');
    expect(travelNotBillable).toMatchObject({
      actualMinutes: 60,
      billableMinutes: 0,
      laborRevenueMinor: '0',
      workerCompensationMinor: '3000',
    });

    value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-03',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 600,
      travelClientBillable: true,
      customerSignoffRequired: false,
    });
    approvedTime(value, '2026-08-03', 60, 'travel');
    const travelBillable = finance(value, '2026-08-03');
    expect(travelBillable).toMatchObject({
      actualMinutes: 60,
      billableMinutes: 120,
      laborRevenueMinor: '12000',
      workerCompensationMinor: '3000',
    });
    expect(value.v3.workerPay(value.worker, '2026-08-02', '2026-08-03')).toMatchObject({
      approvedMinutes: 120,
      estimatedApprovedMinor: '6000',
    });
  });

  it('snapshots derived invoice slices once per source and locks only policy-billable Travel', () => {
    const value = fixture();
    const firstPolicy = value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-01',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 60,
      travelClientBillable: false,
      customerSignoffRequired: false,
    });
    value.repository.createProjectCommercialPolicy(value.finance, {
      projectId: value.project.id,
      effectiveFrom: '2026-08-04',
      overtimeEnabled: true,
      overtimeThresholdMinutes: 120,
      travelClientBillable: true,
      customerSignoffRequired: false,
    });

    const derived = approvedTime(value, '2026-08-01', 90);
    const explicitOvertime = approvedTime(value, '2026-08-02', 30, 'overtime');
    const excludedTravel = approvedTime(value, '2026-08-03', 60, 'travel');
    const laterRegular = approvedTime(value, '2026-08-04', 90);
    const includedTravel = approvedTime(value, '2026-08-05', 60, 'travel');

    const legalEntity = value.repository.createLegalEntity(value.owner, {
      code: 'POL',
      legalName: 'Policy consumption entity',
      currency: 'EUR',
      billingAddress: 'Policy billing address',
      companyIdentifiers: 'POL-EU-1',
    });
    const taxProfile = value.repository.createTaxProfile(value.finance, {
      name: 'Policy zero tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Zero tax', basisPoints: 0 }],
    });
    const billingRule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: legalEntity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: taxProfile.id,
      currency: 'EUR',
      effectiveFrom: '2026-08-01',
    });

    expect(
      value.repository.billingReadiness(value.finance, billingRule.id, '2026-08-01', '2026-08-05'),
    ).toMatchObject({ state: 'ready' });
    const draft = value.repository.createInvoiceDraft(
      value.finance,
      billingRule.id,
      '2026-08-01',
      '2026-08-05',
    );
    expect(
      value.v3.projectFinance(value.finance, value.project.id, '2026-08-01', '2026-08-05'),
    ).toMatchObject({
      actualMinutes: 330,
      approvedMinutes: 330,
      billableMinutes: 270,
      overtimeMinutes: 60,
      laborRevenueMinor: '33000',
    });
    expect(
      value.sqlite.prepare('SELECT subtotal_minor FROM invoice WHERE id=?').get(draft.id),
    ).toMatchObject({ subtotal_minor: 33_000 });
    const lines = value.sqlite
      .prepare(
        `SELECT source_id,quantity_numerator,subtotal_minor,snapshot_json
         FROM invoice_line WHERE invoice_id=? AND source_type='time' ORDER BY rowid`,
      )
      .all(draft.id) as Array<{
      source_id: string;
      quantity_numerator: number;
      subtotal_minor: number;
      snapshot_json: string;
    }>;
    expect(lines).toHaveLength(5);
    expect(lines.filter((line) => line.source_id === derived.id)).toHaveLength(2);
    expect(
      lines
        .filter((line) => line.source_id === derived.id)
        .map((line) => JSON.parse(line.snapshot_json))
        .map((snapshot) => ({
          category: snapshot.commercialCategory,
          minutes: snapshot.commercialSliceMinutes,
          policyId: snapshot.commercialPolicyId,
          sourceEntryId: snapshot.sourceEntryId,
        })),
    ).toEqual([
      {
        category: 'regular',
        minutes: 60,
        policyId: firstPolicy.id,
        sourceEntryId: derived.id,
      },
      {
        category: 'overtime',
        minutes: 30,
        policyId: firstPolicy.id,
        sourceEntryId: derived.id,
      },
    ]);
    expect(lines.some((line) => line.source_id === excludedTravel.id)).toBe(false);
    expect(lines.some((line) => line.source_id === explicitOvertime.id)).toBe(true);
    expect(lines.some((line) => line.source_id === laterRegular.id)).toBe(true);
    expect(lines.some((line) => line.source_id === includedTravel.id)).toBe(true);
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=? AND source_type='time'",
        )
        .get(draft.id),
    ).toMatchObject({ count: 4 });

    const refreshed = value.repository.createInvoiceDraft(
      value.finance,
      billingRule.id,
      '2026-08-01',
      '2026-08-05',
    );
    expect(refreshed).toMatchObject({ created: false, refreshed: true });
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM invoice_source WHERE invoice_id=? AND source_type='time'",
        )
        .get(refreshed.id),
    ).toMatchObject({ count: 4 });
    expect(
      value.sqlite
        .prepare(
          'SELECT COUNT(DISTINCT source_id) distinct_count,COUNT(*) count FROM invoice_source WHERE invoice_id=?',
        )
        .get(refreshed.id),
    ).toMatchObject({ distinct_count: 4, count: 4 });

    expect(
      value.v3.closeBillingPeriod(value.finance, billingRule.id, '2026-08-01', '2026-08-05'),
    ).toMatchObject({ closed: true });
    const lockStates = value.sqlite
      .prepare('SELECT id,billing_status,billing_lock_id FROM time_entry WHERE id IN (?,?,?,?,?)')
      .all(
        derived.id,
        explicitOvertime.id,
        excludedTravel.id,
        laterRegular.id,
        includedTravel.id,
      ) as Array<{ id: string; billing_status: string; billing_lock_id: string | null }>;
    const byId = new Map(lockStates.map((row) => [row.id, row]));
    expect(byId.get(excludedTravel.id)).toMatchObject({
      billing_status: 'unlocked',
      billing_lock_id: null,
    });
    for (const id of [derived.id, explicitOvertime.id, laterRegular.id, includedTravel.id]) {
      expect(byId.get(id)?.billing_status).toBe('locked');
      expect(byId.get(id)?.billing_lock_id).not.toBeNull();
    }
    expect(finance(value, '2026-08-01').actualMinutes).toBe(90);
  });

  it('reduces active cap consumption as BigInt beyond MAX_SAFE_INTEGER', () => {
    const value = fixture();
    value.sqlite
      .prepare("UPDATE project SET billing_model='capped_tm',po_cap_minor=? WHERE id=?")
      .run(Number.MAX_SAFE_INTEGER, value.project.id);
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'CAP',
      legalName: 'Exact cap entity',
      currency: 'EUR',
      billingAddress: 'Exact cap address',
      companyIdentifiers: 'CAP-1',
    });
    const tax = value.repository.createTaxProfile(value.finance, {
      name: 'Cap zero tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Zero', basisPoints: 0 }],
    });
    const rule = value.repository.createBillingRule(value.finance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    const timestamp = new Date().toISOString();
    const half = 4_503_599_627_370_496;
    for (const [index, id] of ['cap-history-1', 'cap-history-2'].entries()) {
      value.sqlite
        .prepare(
          `INSERT INTO invoice(id,project_id,billing_rule_id,stream_type,state,currency,
            subtotal_minor,tax_minor,total_minor,period_start,period_end,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          value.project.id,
          rule.id,
          'labor',
          'draft',
          'EUR',
          half,
          0,
          half,
          `2026-0${index + 1}-01`,
          `2026-0${index + 1}-28`,
          timestamp,
          timestamp,
        );
    }
    expect(
      value.repository.billingReadiness(value.finance, rule.id, '2026-08-01', '2026-08-31'),
    ).toMatchObject({
      state: 'incomplete',
      reasons: expect.arrayContaining([{ code: 'cap_exhausted' }]),
    });
    expect(() =>
      value.repository.createInvoiceDraft(value.finance, rule.id, '2026-08-01', '2026-08-31'),
    ).toThrow(/Billing period is not ready/u);
  });
});
