import { afterEach, describe, expect, it } from 'vitest';
import { V3ConflictError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('effective assignment commercial terms', () => {
  it('keeps seven €55 customer rates and one €70 rate independent of each worker pay', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'mixed-rates');
    const workers = [
      'b5-worker',
      ...Array.from({ length: 7 }, (_, index) => `rate-worker-${index}`),
    ];
    for (const workerId of workers.slice(1)) {
      seedB5User(value.sqlite, workerId, 'worker');
      value.repository.assignWorker(value.owner, {
        projectId: value.project.id,
        workerId,
        startsOn: '2026-08-01',
      });
    }

    const selected = workers.map((workerId, index) => {
      const customerRateMinor = index === 7 ? 7_000n : 5_500n;
      const payRateMinor = index === 7 ? 4_500n : 3_000n;
      const clientRate = value.v3.createClientLaborRate(finance, {
        projectId: value.project.id,
        workerId,
        currency: 'EUR',
        hourlyRateMinor: customerRateMinor,
        effectiveFrom: '2026-08-01',
      });
      const compensation = value.v3.createCompensationRule(finance, {
        projectId: value.project.id,
        workerId,
        currency: 'EUR',
        ruleType: 'Hourly',
        rateMinor: payRateMinor,
        effectiveFrom: '2026-08-01',
      });
      value.v3.createInternalCostRule(finance, {
        projectId: value.project.id,
        workerId,
        currency: 'EUR',
        hourlyRateMinor: payRateMinor,
        effectiveFrom: '2026-08-01',
      });
      const terms = value.v3.resolveAssignmentCommercialTerms(
        finance,
        value.project.id,
        workerId,
        'regular',
        '2026-08-10',
      );
      expect(terms.issues).toEqual([]);
      expect(terms.clientLaborRate).toMatchObject({
        id: clientRate.id,
        hourlyRateMinor: customerRateMinor.toString(),
        provenance: {
          ruleId: clientRate.id,
          ruleVersion: 1,
          source: 'worker_project',
        },
      });
      expect(terms.workerCompensation).toMatchObject({
        id: compensation.id,
        rateMinor: payRateMinor.toString(),
        provenance: {
          ruleId: compensation.id,
          ruleVersion: 1,
          source: 'worker_project',
        },
      });
      expect(terms.internalCost?.provenance.source).toBe('worker_project');
      return terms;
    });

    expect(
      selected.reduce(
        (total, terms) => total + BigInt(terms.clientLaborRate!.hourlyRateMinor) * 8n,
        0n,
      ),
    ).toBe(364_000n);
    expect(
      selected.reduce(
        (total, terms) => total + BigInt(terms.workerCompensation!.rateMinor) * 8n,
        0n,
      ),
    ).toBe(204_000n);
    expect(() =>
      value.v3.resolveAssignmentCommercialTerms(
        value.worker,
        value.project.id,
        value.worker.userId,
        'regular',
        '2026-08-10',
      ),
    ).toThrow();
  });

  it('resolves date/category overrides and identifies missing or ambiguous terms', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'effective-rules');
    const context = [finance, value.project.id, value.worker.userId, 'regular'] as const;
    const initially = value.v3.resolveAssignmentCommercialTerms(...context, '2026-08-10');
    expect(initially.issues.map((item) => item.code)).toEqual([
      'missing_client_rate',
      'missing_compensation_rule',
      'missing_internal_cost_rule',
    ]);

    const projectDefault = value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-08-01',
    });
    const workerSpecific = value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 7_000n,
      effectiveFrom: '2026-08-15',
    });
    const globalPay = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 2_500n,
      effectiveFrom: '2026-08-01',
    });
    expect(value.v3.resolveAssignmentCommercialTerms(...context, '2026-08-14')).toMatchObject({
      workerCompensation: null,
      allowGlobalCompensation: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'missing_compensation_rule' }),
      ]),
    });
    const assignment = value.sqlite
      .prepare('SELECT id,version FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, value.worker.userId) as { id: string; version: number };
    const fallback = value.v3.setAssignmentCommercialFallback(finance, {
      projectMemberId: assignment.id,
      allowGlobalCompensation: true,
      allowGlobalInternalCost: false,
      expectedVersion: assignment.version,
    });
    expect(fallback.version).toBe(assignment.version + 1);
    expect(value.v3.resolveAssignmentCommercialTerms(...context, '2026-08-14')).toMatchObject({
      clientLaborRate: { id: projectDefault.id, provenance: { source: 'project_default' } },
      workerCompensation: { id: globalPay.id, provenance: { source: 'worker_global' } },
      allowGlobalCompensation: true,
      issues: [{ code: 'missing_internal_cost_rule' }],
    });
    expect(value.v3.resolveAssignmentCommercialTerms(...context, '2026-08-15')).toMatchObject({
      clientLaborRate: { id: workerSpecific.id, provenance: { source: 'worker_project' } },
    });

    const categoryRate = value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      category: 'overtime',
      currency: 'EUR',
      hourlyRateMinor: 9_000n,
      effectiveFrom: '2026-08-01',
    });
    const override = value.v3.createAssignmentRateOverride(finance, {
      projectMemberId: assignment.id,
      timeCategory: 'overtime',
      clientLaborRateId: categoryRate.id,
      effectiveFrom: '2026-08-01',
    });
    expect(
      value.v3.resolveAssignmentCommercialTerms(
        finance,
        value.project.id,
        value.worker.userId,
        'overtime',
        '2026-08-20',
      ),
    ).toMatchObject({
      clientLaborRate: {
        id: categoryRate.id,
        provenance: { source: 'assignment_override', overrideId: override.id },
      },
    });

    value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 6_900n,
      effectiveFrom: '2026-08-15',
    });
    const ambiguous = value.v3.resolveAssignmentCommercialTerms(...context, '2026-08-20');
    expect(ambiguous.clientLaborRate).toBeNull();
    expect(ambiguous.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ambiguous_client_rate', sourceIds: expect.any(Array) }),
      ]),
    );
    expect(() =>
      value.v3.resolveClientLaborRate(
        finance,
        value.project.id,
        value.worker.userId,
        'regular',
        '2026-08-20',
      ),
    ).toThrow(V3ConflictError);
  });

  it('uses direct assignment references after category overrides and rejects wrong scopes', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'direct-assignment-rules');
    const assignment = value.sqlite
      .prepare('SELECT id,version FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, value.worker.userId) as { id: string; version: number };
    const client = value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 5_500n,
      effectiveFrom: '2026-01-01',
    });
    const pay = value.v3.createCompensationRule(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 3_000n,
      effectiveFrom: '2026-01-01',
    });
    const cost = value.v3.createInternalCostRule(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 3_500n,
      effectiveFrom: '2026-01-01',
    });
    const bound = value.v3.setAssignmentCommercialRuleReferences(finance, {
      projectMemberId: assignment.id,
      expectedVersion: assignment.version,
      clientBillRuleId: client.id,
      workerCompensationRuleId: pay.id,
      internalCostRuleId: cost.id,
    });
    expect(bound.version).toBe(assignment.version + 1);
    expect(
      value.v3.resolveAssignmentCommercialTerms(
        finance,
        value.project.id,
        value.worker.userId,
        'regular',
        '2026-08-01',
      ),
    ).toMatchObject({
      clientLaborRate: {
        id: client.id,
        provenance: { source: 'assignment_rule', assignmentId: assignment.id },
      },
      workerCompensation: { id: pay.id, provenance: { source: 'assignment_rule' } },
      internalCost: { id: cost.id, provenance: { source: 'assignment_rule' } },
      issues: [],
    });

    const travelRate = value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      category: 'travel',
      currency: 'EUR',
      hourlyRateMinor: 7_000n,
      effectiveFrom: '2026-08-01',
    });
    value.v3.createAssignmentRateOverride(finance, {
      projectMemberId: assignment.id,
      timeCategory: 'travel',
      clientLaborRateId: travelRate.id,
      effectiveFrom: '2026-08-01',
    });
    expect(
      value.v3.resolveAssignmentCommercialTerms(
        finance,
        value.project.id,
        value.worker.userId,
        'travel',
        '2026-08-01',
      ).clientLaborRate,
    ).toMatchObject({ id: travelRate.id, provenance: { source: 'assignment_override' } });

    const future = value.v3.createClientLaborRate(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 6_000n,
      effectiveFrom: '2026-08-02',
    });
    expect(() =>
      value.v3.setAssignmentCommercialRuleReferences(finance, {
        projectMemberId: assignment.id,
        expectedVersion: bound.version,
        clientBillRuleId: future.id,
      }),
    ).toThrow(/full assignment scope and dates/u);
    expect(() =>
      value.v3.setAssignmentCommercialRuleReferences(finance, {
        projectMemberId: assignment.id,
        expectedVersion: assignment.version,
        clientBillRuleId: null,
      }),
    ).toThrow(V3ConflictError);
    const cleared = value.v3.setAssignmentCommercialRuleReferences(finance, {
      projectMemberId: assignment.id,
      expectedVersion: bound.version,
      clientBillRuleId: null,
    });
    expect(cleared).toMatchObject({
      clientBillRuleId: null,
      workerCompensationRuleId: pay.id,
      internalCostRuleId: cost.id,
    });
    expect(() =>
      value.v3.setAssignmentCommercialFallback(value.worker, {
        projectMemberId: assignment.id,
        expectedVersion: cleared.version,
        allowGlobalCompensation: true,
        allowGlobalInternalCost: true,
      }),
    ).toThrow();
  });

  it('does not settle percentage pay at zero when a billable source lacks its client rate', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'missing-percentage-rate');
    value.v3.createCompensationRule(finance, {
      projectId: value.project.id,
      workerId: value.worker.userId,
      currency: 'EUR',
      ruleType: 'PercentageOfEligibleClientLabor',
      percentageBps: 5_500,
      percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
      effectiveFrom: '2026-08-01',
    });
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-10',
      category: 'regular',
      minutes: 480,
      summary: 'Approved billable work with missing rate',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    value.repository.operationalApproveTime(value.manager, time.id, 'approved');
    value.repository.financeApproveTime(finance, time.id, true);
    const assignment = value.sqlite
      .prepare('SELECT id,version FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, value.worker.userId) as { id: string; version: number };
    expect(() =>
      value.v3.setAssignmentCommercialFallback(finance, {
        projectMemberId: assignment.id,
        expectedVersion: assignment.version,
        allowGlobalCompensation: true,
        allowGlobalInternalCost: true,
      }),
    ).toThrow(/after time has been recorded/u);
    expect(
      value.sqlite
        .prepare('SELECT allow_global_compensation_fallback,version FROM project_member WHERE id=?')
        .get(assignment.id),
    ).toEqual({ allow_global_compensation_fallback: 0, version: assignment.version });
    expect(() =>
      value.v3.settleCompensation(finance, {
        workerId: value.worker.userId,
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow(/Client labor rate is required before percentage compensation/u);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM compensation_settlement').get(),
    ).toEqual({ count: 0 });
  });
});
