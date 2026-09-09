import { afterEach, describe, expect, it } from 'vitest';
import { V3ValidationError } from '@ja/database';
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
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function approveTime(value: B5LifecycleSecurityFixture, workDate: string, summary: string): void {
  const entry = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate,
    category: 'regular',
    minutes: 60,
    summary,
  });
  value.repository.submitTime(value.worker, entry.id, entry.version);
  value.repository.operationalApproveTime(value.manager, entry.id, 'approved');
}

describe('Finance open-ended effective-date rules', () => {
  it('normalizes blank global compensation scope and blank expiry, while a bounded project rule expires', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'open-compensation');
    const global = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: '',
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 2_500n,
      effectiveFrom: '2026-08-01',
      effectiveTo: '',
    });
    const bounded = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 5_000n,
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-24',
    });

    expect(
      value.sqlite
        .prepare('SELECT project_id,effective_to FROM compensation_rule WHERE id=?')
        .get(global.id),
    ).toEqual({ project_id: null, effective_to: null });
    expect(
      value.sqlite
        .prepare('SELECT project_id,effective_to FROM compensation_rule WHERE id=?')
        .get(bounded.id),
    ).toEqual({ project_id: value.project.id, effective_to: '2026-08-24' });

    approveTime(value, '2026-08-24', 'Bounded compensation is still effective');
    approveTime(value, '2026-08-25', 'Open compensation resumes after expiry');
    expect(value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31')).toMatchObject({
      approvedMinutes: 120,
      estimatedApprovedMinor: '7500',
      estimatedPendingMinor: '0',
    });
  });

  it('normalizes blank global internal-cost scope and resolves the open rule after a bounded rule expires', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'open-internal-cost');
    const global = value.v3.createInternalCostRule(finance, {
      workerId: value.worker.userId,
      projectId: '',
      currency: 'EUR',
      hourlyRateMinor: 1_400n,
      effectiveFrom: '2026-08-01',
      effectiveTo: '',
    });
    const bounded = value.v3.createInternalCostRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      hourlyRateMinor: 2_700n,
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-24',
    });

    expect(
      value.sqlite
        .prepare('SELECT project_id,effective_to FROM internal_cost_rule WHERE id=?')
        .get(global.id),
    ).toEqual({ project_id: null, effective_to: null });
    expect(
      value.sqlite
        .prepare('SELECT project_id,effective_to FROM internal_cost_rule WHERE id=?')
        .get(bounded.id),
    ).toEqual({ project_id: value.project.id, effective_to: '2026-08-24' });
    expect(
      value.v3.resolveInternalCostRate(
        finance,
        value.project.id,
        value.worker.userId,
        'regular',
        '2026-08-24',
      ),
    ).toMatchObject({ id: bounded.id, effectiveRateMinor: '2700' });
    expect(
      value.v3.resolveInternalCostRate(
        finance,
        value.project.id,
        value.worker.userId,
        'regular',
        '2026-08-25',
      ),
    ).toMatchObject({ id: global.id, effectiveRateMinor: '1400' });
  });

  it('keeps a blank-expiry assignment override effective after a higher-priority bounded override expires', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'open-assignment-override');
    const overrideRule = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 9_000n,
      effectiveFrom: '2026-08-01',
    });
    const defaultRule = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 3_000n,
      effectiveFrom: '2026-08-02',
    });
    const assignment = value.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, value.worker.userId) as { id: string };
    const openOverride = value.v3.createAssignmentRateOverride(finance, {
      projectMemberId: assignment.id,
      compensationRuleId: overrideRule.id,
      internalCostRuleId: '',
      clientLaborRateId: '',
      effectiveFrom: '2026-08-01',
      effectiveTo: '',
    });
    const boundedOverride = value.v3.createAssignmentRateOverride(finance, {
      projectMemberId: assignment.id,
      compensationRuleId: defaultRule.id,
      internalCostRuleId: '',
      clientLaborRateId: '',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-24',
      priority: 10,
    });

    expect(
      value.sqlite
        .prepare(
          'SELECT compensation_rule_id,internal_cost_rule_id,client_labor_rate_id,effective_to FROM assignment_rate_override WHERE id=?',
        )
        .get(openOverride.id),
    ).toEqual({
      compensation_rule_id: overrideRule.id,
      internal_cost_rule_id: null,
      client_labor_rate_id: null,
      effective_to: null,
    });
    expect(
      value.sqlite
        .prepare('SELECT effective_to FROM assignment_rate_override WHERE id=?')
        .get(boundedOverride.id),
    ).toEqual({ effective_to: '2026-08-24' });

    approveTime(value, '2026-08-24', 'Bounded assignment override is effective');
    approveTime(value, '2026-08-25', 'Open assignment override remains effective');
    expect(value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31')).toMatchObject({
      approvedMinutes: 120,
      estimatedApprovedMinor: '12000',
      estimatedPendingMinor: '0',
    });
  });

  it('rejects whitespace and calendar-invalid end dates rather than treating them as open ended', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'invalid-open-ended-values');
    const valid = value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 1_000n,
      effectiveFrom: '2026-08-01',
    });
    const assignment = value.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
      .get(value.project.id, value.worker.userId) as { id: string };

    expect(() =>
      value.v3.createCompensationRule(finance, {
        workerId: value.worker.userId,
        projectId: '',
        currency: 'EUR',
        ruleType: 'Hourly',
        rateMinor: 1_000n,
        effectiveFrom: '2026-08-01',
        effectiveTo: ' ',
      }),
    ).toThrow(V3ValidationError);
    expect(() =>
      value.v3.createInternalCostRule(finance, {
        workerId: value.worker.userId,
        projectId: '',
        currency: 'EUR',
        hourlyRateMinor: 1_000n,
        effectiveFrom: '2026-08-01',
        effectiveTo: ' ',
      }),
    ).toThrow(V3ValidationError);
    expect(() =>
      value.v3.createAssignmentRateOverride(finance, {
        projectMemberId: assignment.id,
        compensationRuleId: valid.id,
        effectiveFrom: '2026-08-01',
        effectiveTo: ' ',
      }),
    ).toThrow(V3ValidationError);
    expect(() =>
      value.v3.createCompensationRule(finance, {
        workerId: value.worker.userId,
        projectId: value.project.id,
        currency: 'EUR',
        ruleType: 'Hourly',
        rateMinor: 1_000n,
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-07-31',
      }),
    ).toThrow(/End date must follow the effective date/);
  });
});
