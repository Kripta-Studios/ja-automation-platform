import { afterEach, describe, expect, it } from 'vitest';
import { WorkerStatementRepository } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

// T25 (audit 2026-11-22): a project manager's own My Pay statement used to fail with
// "invalid worker statement artifact" (a database guard admitted only role 'worker').
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

function request(f: B5LifecycleSecurityFixture, principal: B5LifecycleSecurityFixture['worker']) {
  return new WorkerStatementRepository(f.sqlite).requestArtifacts(principal, {
    snapshot: {
      worker: { id: principal.userId, name: 'Own statement' },
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      lines: [],
    },
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    templateVersion: 'statement-v1',
    generationVersion: 'g1',
  });
}

describe('worker statement for a project manager (T25)', () => {
  it('queues the project manager’s own statement like a worker’s', () => {
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    const managerArtifacts = request(f, f.manager);
    expect(managerArtifacts.length).toBeGreaterThan(0);
    expect(managerArtifacts.every((artifact) => artifact.status === 'queued')).toBe(true);
    expect(request(f, f.worker).length).toBe(managerArtifacts.length);
  });
});
