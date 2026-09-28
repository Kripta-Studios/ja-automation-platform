import { describe, expect, it } from 'vitest';
import { V3ConflictError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.js';

describe('assignment commercial lock after recorded time', () => {
  it('rejects fallback and rule-reference changes without changing the assignment', () => {
    const fixture = createB5LifecycleSecurityFixture();
    try {
      const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'commercial-lock');
      const clientRule = fixture.v3.createClientLaborRate(finance, {
        projectId: fixture.project.id,
        workerId: fixture.worker.userId,
        currency: 'EUR',
        hourlyRateMinor: 5_500n,
        effectiveFrom: '2026-01-01',
      });
      const assignment = fixture.sqlite
        .prepare(
          'SELECT id,version,client_bill_rule_id,allow_global_compensation_fallback FROM project_member WHERE project_id=? AND user_id=?',
        )
        .get(fixture.project.id, fixture.worker.userId) as {
        id: string;
        version: number;
        client_bill_rule_id: string | null;
        allow_global_compensation_fallback: number;
      };
      fixture.repository.createTimeEntry(fixture.worker, {
        projectId: fixture.project.id,
        workDate: '2026-08-10',
        category: 'regular',
        minutes: 480,
        summary: 'Recorded assignment work',
      });

      expect(() =>
        fixture.v3.setAssignmentCommercialFallback(finance, {
          projectMemberId: assignment.id,
          expectedVersion: assignment.version,
          allowGlobalCompensation: true,
          allowGlobalInternalCost: false,
        }),
      ).toThrow(V3ConflictError);
      expect(() =>
        fixture.v3.setAssignmentCommercialRuleReferences(finance, {
          projectMemberId: assignment.id,
          expectedVersion: assignment.version,
          clientBillRuleId: clientRule.id,
          workerCompensationRuleId: null,
          internalCostRuleId: null,
        }),
      ).toThrow(V3ConflictError);
      expect(
        fixture.sqlite
          .prepare(
            'SELECT id,version,client_bill_rule_id,allow_global_compensation_fallback FROM project_member WHERE id=?',
          )
          .get(assignment.id),
      ).toEqual(assignment);
    } finally {
      closeB5LifecycleSecurityFixture(fixture);
    }
  });
});
