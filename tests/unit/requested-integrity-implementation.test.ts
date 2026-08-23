import { afterEach, describe, expect, it } from 'vitest';
import { runDueConfiguredDurableJobs } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

describe('requested integrity implementation', () => {
  it('fails a durable job with no registered handler instead of marking it complete', async () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const job = fixture.v3.enqueueJob('unregistered_kind', 'requested-integrity-job', {
      test: true,
    });

    const outcomes = await runDueConfiguredDurableJobs(fixture.sqlite, 1);
    expect(outcomes[0]).toMatchObject({
      jobId: job.id,
      outcome: 'failure',
      errorCode: expect.stringMatching(/no handler/i),
    });
    expect(fixture.sqlite.prepare('SELECT state FROM job WHERE id=?').get(job.id)).toEqual({
      state: 'pending',
    });
  });

  it('closes a financial rule interval before creating its successor', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const created = fixture.v3.createCompensationRule(fixture.finance, {
      workerId: fixture.worker.userId,
      projectId: fixture.project.id,
      currency: 'EUR',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });

    const successor = fixture.v3.supersedeCompensationRule(fixture.finance, created.id, {
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

    fixture.v3.deactivateCompensationRule(fixture.finance, successor.id, '2026-12-31');
    expect(
      fixture.sqlite
        .prepare('SELECT effective_to FROM compensation_rule WHERE id=?')
        .get(successor.id),
    ).toEqual({ effective_to: '2026-12-31' });
  });
});
