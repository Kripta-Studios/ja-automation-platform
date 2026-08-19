import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  PortalRepository,
  V3AccessDeniedError,
  V3Repository,
  createDatabase,
} from '@ja/database';
import type { Principal, Role } from '@ja/domain';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: Role,
): void {
  const timestamp = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@example.com`, role, 'active', 1, timestamp, timestamp);
}

describe('repository authorization and privacy', () => {
  it('allows auditor reads while rejecting auditor mutations and worker finance reads', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-security-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'auditor', 'auditor_read_only');
    seedUser(sqlite, 'worker', 'worker');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const auditor: Principal = {
      userId: 'auditor',
      role: 'auditor_read_only',
      projectIds: new Set(),
    };
    const worker: Principal = { userId: 'worker', role: 'worker', projectIds: new Set() };
    const client = repository.createClient(owner, {
      legalName: 'Security Client',
      displayName: 'Security Client',
      currency: 'USD',
      timezone: 'UTC',
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Security Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      expectedMinutesPerDay: 600,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    const workerPrincipal = repository.principalFor('worker');

    v3.enqueueJob(
      'missing_time_reminder',
      'test-missing-time:2026-08-18',
      { workDate: '2026-08-18' },
      new Date().toISOString(),
    );
    expect(v3.runDueJobs(1).processed).toBe(1);
    expect(repository.listNotifications(workerPrincipal)).toEqual([
      expect.objectContaining({ kind: 'missing_time' }),
    ]);
    expect(
      sqlite
        .prepare("SELECT topic FROM outbox_event WHERE topic='notification.email.requested'")
        .all(),
    ).toHaveLength(1);

    expect(repository.search(owner, 'Security')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'project', id: project.id }),
        expect.objectContaining({ type: 'client', id: client.id }),
      ]),
    );
    expect(repository.search(workerPrincipal, 'Security')).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'project', id: project.id })]),
    );
    expect(repository.search(workerPrincipal, 'owner@example.com')).toEqual([]);

    expect(repository.listFinanceProjects(auditor)).toEqual([
      expect.objectContaining({ id: project.id, project_number: project.projectNumber }),
    ]);
    expect(repository.projectOverview(auditor, project.id)).toEqual(
      expect.objectContaining({ project: expect.objectContaining({ id: project.id }) }),
    );
    expect(v3.projectFinance(auditor, project.id)).toEqual(
      expect.objectContaining({ currency: 'USD', revenueCandidateMinor: '0' }),
    );
    expect(() =>
      repository.createProject(auditor, {
        clientId: client.id,
        name: 'Should fail',
        timezone: 'UTC',
        currency: 'USD',
        billingModel: 'tm',
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      v3.createTechnicalChange(auditor, {
        projectId: project.id,
        component: 'PLC',
        changeMade: 'Should fail',
        safetyImpact: false,
      }),
    ).toThrow(V3AccessDeniedError);
    expect(() => v3.projectFinance(worker, project.id)).toThrow(V3AccessDeniedError);
    sqlite.close();
  });
});
