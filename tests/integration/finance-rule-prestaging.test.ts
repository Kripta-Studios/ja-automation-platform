import { describe, expect, it } from 'vitest';
import { V3AccessDeniedError, V3ValidationError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.js';

describe('project finance rule pre-staging', () => {
  it('lets Owner stage rules before membership while retaining role and currency checks', () => {
    const value = createB5LifecycleSecurityFixture();
    try {
      const owner = stepUpB5Principal(value.sqlite, value.owner, 'prestaging');
      const workerId = 'b5-outsider';
      expect(
        value.sqlite
          .prepare('SELECT 1 FROM project_member WHERE project_id=? AND user_id=?')
          .get(value.project.id, workerId),
      ).toBeUndefined();
      expect(
        value.v3.createInternalCostRule(owner, {
          workerId,
          projectId: value.project.id,
          currency: 'EUR',
          hourlyRateMinor: 2800n,
          effectiveFrom: '2026-10-01',
          effectiveTo: '2026-10-31',
        }).id,
      ).toBeTruthy();
      expect(
        value.v3.createCompensationRule(owner, {
          workerId,
          projectId: value.project.id,
          currency: 'EUR',
          ruleType: 'Hourly',
          rateBasis: 'hourly',
          rateMinor: 2000n,
          effectiveFrom: '2026-10-01',
          effectiveTo: '2026-10-31',
        }).id,
      ).toBeTruthy();
      expect(() =>
        value.v3.createInternalCostRule(value.manager, {
          workerId,
          projectId: value.project.id,
          currency: 'EUR',
          hourlyRateMinor: 2800n,
          effectiveFrom: '2026-11-01',
        }),
      ).toThrow(V3AccessDeniedError);
      expect(() =>
        value.v3.createCompensationRule(owner, {
          workerId,
          projectId: value.project.id,
          currency: 'USD',
          ruleType: 'Hourly',
          rateBasis: 'hourly',
          rateMinor: 2000n,
          effectiveFrom: '2026-11-01',
        }),
      ).toThrow(V3ValidationError);
    } finally {
      closeB5LifecycleSecurityFixture(value);
    }
  });
});
