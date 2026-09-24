import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  projectPeriodExplanation,
} from '@ja/database';
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

function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return {
    ...value,
    finance: stepUpB5Principal(value.sqlite, value.finance, 'project-period-explanation'),
  };
}

function explanation(value: ReturnType<typeof fixture>) {
  const periodStart = '2026-08-20';
  const periodEnd = '2026-08-20';
  const finance = value.v3.projectFinance(value.finance, value.project.id, periodStart, periodEnd);
  return projectPeriodExplanation(value.sqlite, value.finance, {
    projectId: value.project.id,
    periodStart,
    periodEnd,
    finance,
  });
}

function bindCanonicalLegalEntity(value: ReturnType<typeof fixture>): void {
  const legalEntity = value.repository.createLegalEntity(value.owner, {
    code: 'EXPLAIN',
    legalName: 'Explanation Test Entity',
    currency: 'EUR',
    billingAddress: 'Test Street 1, Madrid',
    companyIdentifiers: 'ES-EXPLANATION-TEST',
  });
  const revision = value.v3.createCanonicalLegalEntityRevision(value.finance, {
    legacyLegalEntityId: legalEntity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Explanation Test Entity S.L.',
    taxIdentifier: 'ESB12345678',
    registrationIdentifier: 'EXPLANATION-TEST-001',
    addressLine1: 'Test Street 1',
    locality: 'Madrid',
    region: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'EUR',
    timezone: 'Europe/Madrid',
    reason: 'Authorize the isolated explanation expense',
    idempotencyKey: 'project-period-explanation:canonical-revision',
  });
  value.v3.assignCanonicalLegalEntityToProject(value.finance, {
    projectId: value.project.id,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Bind the isolated explanation project to the test legal entity',
    idempotencyKey: 'project-period-explanation:canonical-assignment',
  });
}

describe('project period calculation explanation', () => {
  it('explains canonical time and expense amounts, effective terms and source state without recalculating them', () => {
    const value = fixture();
    const date = '2026-08-20';
    bindCanonicalLegalEntity(value);
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-08-01',
    });
    value.v3.createCompensationRule(value.finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 3_000n,
      effectiveFrom: '2026-08-01',
    });
    value.v3.createInternalCostRule(value.finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      hourlyRateMinor: 3_000n,
      effectiveFrom: '2026-08-01',
    });
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: date,
      category: 'regular',
      minutes: 480,
      summary: 'Explanation source time',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');
    value.repository.financeApproveTime(value.finance, time.id, true);

    const membership = value.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, value.worker.userId) as { id: string };
    new AssignmentExpensePolicyRepository(value.sqlite).create(value.finance, {
      projectMemberId: membership.id,
      payer: 'worker',
      category: 'hotel',
      effectiveFrom: '2026-08-01',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
      reason: 'Explain worker-paid accommodation recovery',
    });
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: date,
      vendor: 'Explanation Hotel',
      category: 'hotel',
      description: 'Accommodation for explanation',
      currency: 'EUR',
      amountMinor: 4_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    const classified = value.repository.classifyExpenseCommercially(value.finance, {
      expenseId: expense.id,
      expectedVersion: expense.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Apply the effective hotel policy to the explanation source',
      idempotencyKey: 'project-period-explanation:expense',
    });
    value.repository.submitExpense(value.worker, expense.id, classified.version);
    value.repository.operationalApproveExpense(value.manager, expense.id, 'approved');
    value.repository.financeApproveExpense(value.finance, expense.id);

    const result = explanation(value);
    expect(result.totals).toMatchObject({
      actualMinutes: 480,
      approvedMinutes: 480,
      billableMinutes: 480,
      laborRevenueMinor: '44000',
      expenseRevenueMinor: '4000',
      operationalRevenueCandidateMinor: '48000',
      sourceRevenueMinor: '48000',
      sourceRevenueReconcilesToOperationalCandidate: true,
    });
    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({
      workerId: value.worker.userId,
      actualMinutes: 480,
      approvedMinutes: 480,
      billableMinutes: 480,
      customerRevenueMinor: '44000',
      workerCompensationMinor: '24000',
      internalCostMinor: '24000',
      expenseRevenueMinor: '4000',
      expenseCostMinor: '4000',
      approvedOperationalSources: 2,
    });
    expect(result.people[0]?.time[0]).toMatchObject({
      id: time.id,
      sourceState: 'approved_operational',
      clientRevenueMinor: '44000',
      workerCompensationMinor: '24000',
      compensationRuleType: 'Hourly',
      clientRateStatus: 'configured',
    });
    expect(result.people[0]?.expenses[0]).toMatchObject({
      id: expense.id,
      sourceState: 'approved_operational',
      revenueMinor: '4000',
      expensePolicy: {
        payer: 'worker',
        category: 'hotel',
        workerReimbursement: 'at_cost',
        clientRecovery: 'at_cost',
        markupBps: 0,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        version: 1,
      },
      reimbursementAmountMinor: '4000',
    });
  });

  it('keeps pending time in canonical WIP and out of approved operational-source reconciliation', () => {
    const value = fixture();
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-08-01',
    });
    const pending = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Pending explanation source',
    });
    value.repository.submitTime(value.worker, pending.id, pending.version);
    const result = explanation(value);
    expect(result.totals).toMatchObject({
      operationalRevenueCandidateMinor: '0',
      sourceRevenueMinor: '0',
      unapprovedWipMinor: '5500',
      sourceRevenueReconcilesToOperationalCandidate: true,
    });
    expect(result.people[0]?.time).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pending.id, sourceState: 'pending' })]),
    );
    expect(result.people[0]?.customerRevenueMinor).toBe('0');
  });

  it('includes an approved un-invoiced milestone in the same canonical reconciliation', () => {
    const value = fixture();
    const milestone = value.repository.createProjectMilestone(value.owner, {
      projectId: value.project.id,
      name: 'Explanation milestone',
      amountMinor: 12_500n,
      dueOn: '2026-08-20',
    });
    value.repository.submitProjectMilestone(value.owner, milestone.id, milestone.version);
    value.repository.reviewProjectMilestone(value.manager, milestone.id, 'approved');
    const result = explanation(value);
    expect(result.totals).toMatchObject({
      operationalRevenueCandidateMinor: '12500',
      sourceMilestoneRevenueMinor: '12500',
      sourceRevenueMinor: '12500',
      sourceRevenueReconcilesToOperationalCandidate: true,
    });
    expect(result.milestones).toEqual([
      expect.objectContaining({
        id: milestone.id,
        sourceState: 'approved_operational',
        revenueMinor: '12500',
      }),
    ]);
  });

  it('keeps fixed and internal customer candidates distinct from reconciled operational sources', () => {
    const value = fixture();
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-08-01',
    });
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 480,
      summary: 'Fixed/internal distinction',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');
    value.repository.financeApproveTime(value.finance, time.id, true);
    value.sqlite
      .prepare("UPDATE project SET billing_model='internal' WHERE id=?")
      .run(value.project.id);
    const internal = explanation(value);
    expect(internal.totals).toMatchObject({
      sourceRevenueMinor: '44000',
      operationalRevenueCandidateMinor: '44000',
      revenueCandidateMinor: '0',
      sourceRevenueReconcilesToOperationalCandidate: true,
      canonicalCandidateDiffFromOperationalMinor: '-44000',
    });
    expect(internal.people[0]?.time[0]).toMatchObject({
      id: time.id,
      // This is deliberately operational approval, not invoice readiness.
      sourceState: 'approved_operational',
    });
    value.sqlite
      .prepare("UPDATE project SET billing_model='all_in',fixed_price_minor=50000 WHERE id=?")
      .run(value.project.id);
    const fixed = explanation(value);
    expect(fixed.totals).toMatchObject({
      sourceRevenueMinor: '44000',
      operationalRevenueCandidateMinor: '44000',
      revenueCandidateMinor: '50000',
      sourceRevenueReconcilesToOperationalCandidate: true,
      canonicalCandidateDiffFromOperationalMinor: '6000',
    });
  });

  it('preserves canonical mixed-date source amounts without re-resolving mutable rule provenance', () => {
    const value = fixture();
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-20',
    });
    value.v3.createClientLaborRate(value.finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 7_000n,
      effectiveFrom: '2026-08-21',
    });
    for (const [workDate, summary] of [
      ['2026-08-20', 'First rate'],
      ['2026-08-21', 'Changed rate'],
    ]) {
      const entry = value.repository.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate,
        category: 'regular',
        minutes: 480,
        summary,
      });
      value.repository.submitTime(value.worker, entry.id, entry.version);
      value.repository.operationalApproveTime(value.manager, entry.id, 'approved');
      value.repository.financeApproveTime(value.finance, entry.id, true);
    }
    const finance = value.v3.projectFinance(
      value.finance,
      value.project.id,
      '2026-08-20',
      '2026-08-21',
    );
    const result = projectPeriodExplanation(value.sqlite, value.finance, {
      projectId: value.project.id,
      periodStart: '2026-08-20',
      periodEnd: '2026-08-21',
      finance,
    });
    expect(result.totals).toMatchObject({
      sourceRevenueMinor: '100000',
      operationalRevenueCandidateMinor: '100000',
      sourceRevenueReconcilesToOperationalCandidate: true,
    });
    expect(result.people[0]?.time.map((row) => row.clientRevenueMinor).sort()).toEqual([
      '44000',
      '56000',
    ]);
    expect(result.people[0]?.time.every((row) => row.clientRateStatus === 'configured')).toBe(true);
  });

  it('does not expose a pay explanation to a worker or project manager principal', () => {
    const value = fixture();
    const finance = value.v3.projectFinance(
      value.finance,
      value.project.id,
      '2026-08-20',
      '2026-08-20',
    );
    for (const principal of [value.worker, value.manager]) {
      expect(() =>
        projectPeriodExplanation(value.sqlite, principal, {
          projectId: value.project.id,
          periodStart: '2026-08-20',
          periodEnd: '2026-08-20',
          finance,
        }),
      ).toThrow(AccessDeniedError);
    }
  });
});
