import { afterEach, describe, expect, it } from 'vitest';
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

describe('requested integrity implementation', () => {
  it('rejects a durable job with no registered capability before it can be queued', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    expect(() =>
      fixture.v3.enqueueJob('unregistered_kind', 'requested-integrity-job', {
        test: true,
      }),
    ).toThrow(/unregistered durable job kind/i);
    expect(
      fixture.sqlite
        .prepare('SELECT COUNT(*) AS count FROM job WHERE kind=?')
        .get('unregistered_kind'),
    ).toEqual({ count: 0 });
  });

  it('closes a financial rule interval before creating its successor', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const finance = stepUpB5Principal(fixture.sqlite, fixture.finance, 'rule-successor');
    const created = fixture.v3.createCompensationRule(finance, {
      workerId: fixture.worker.userId,
      projectId: fixture.project.id,
      currency: 'EUR',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });

    const successor = fixture.v3.supersedeCompensationRule(finance, created.id, {
      workerId: fixture.worker.userId,
      projectId: fixture.project.id,
      currency: 'EUR',
      rateMinor: 7_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-09-01',
    });
    expect(
      fixture.sqlite
        .prepare('SELECT effective_to FROM compensation_rule WHERE id=?')
        .get(created.id),
    ).toEqual({ effective_to: '2026-08-31' });
    expect(successor.previousId).toBe(created.id);

    fixture.v3.deactivateCompensationRule(finance, successor.id, '2026-12-31');
    expect(
      fixture.sqlite
        .prepare('SELECT effective_to FROM compensation_rule WHERE id=?')
        .get(successor.id),
    ).toEqual({ effective_to: '2026-12-31' });
  });
});
