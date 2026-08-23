import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from './b5-test-environment.js';

export type B5LifecycleSecurityFixture = ReturnType<typeof createB5LifecycleSecurityFixture>;

export function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

export function seedB5User(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: Role,
): void {
  const timestamp = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@example.test`, role, 'active', timestamp, timestamp);
}

export function createB5LifecycleSecurityFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ja-b5-lifecycle-'));
  const restoreDeploymentIdentity = installB5TestDeploymentIdentity();
  let sqlite: ReturnType<typeof createDatabase>['sqlite'];
  try {
    sqlite = createDatabase(join(directory, 'app.db')).sqlite;
  } catch (error) {
    restoreDeploymentIdentity();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  try {
    seedB5User(sqlite, 'b5-owner', 'owner_admin');
    seedB5User(sqlite, 'b5-manager', 'project_manager');
    seedB5User(sqlite, 'b5-worker', 'worker');
    seedB5User(sqlite, 'b5-outsider', 'worker');
    seedB5User(sqlite, 'b5-finance', 'finance_admin');
    seedB5ServiceActorBinding(sqlite, 'b5-owner');

    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    const owner: Principal = {
      userId: 'b5-owner',
      role: 'owner_admin',
      projectIds: new Set(),
    };
    const finance: Principal = {
      userId: 'b5-finance',
      role: 'finance_admin',
      projectIds: new Set(),
    };

    const client = repository.createClient(owner, {
      legalName: 'B5 Fixture Client SL',
      displayName: 'B5 Fixture Client',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: 'billing-b5@example.test',
      billingAddress: 'B5 Fixture Client, Calle de Prueba 1, Madrid',
      paymentTermsDays: 30,
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'B5 lifecycle fixture',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'b5-manager',
      startsOn: '2026-01-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'b5-worker',
      startsOn: '2026-01-01',
    });

    const manager = repository.principalFor('b5-manager');
    const worker = repository.principalFor('b5-worker');
    const outsider = repository.principalFor('b5-outsider');

    return {
      directory,
      sqlite,
      restoreDeploymentIdentity,
      repository,
      v3,
      owner,
      finance,
      manager,
      worker,
      outsider,
      client,
      project,
    };
  } catch (error) {
    try {
      sqlite.close();
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } finally {
        restoreDeploymentIdentity();
      }
    }
    throw error;
  }
}

export function closeB5LifecycleSecurityFixture(fixture: B5LifecycleSecurityFixture): void {
  try {
    fixture.sqlite.close();
  } finally {
    try {
      rmSync(fixture.directory, { recursive: true, force: true });
    } finally {
      fixture.restoreDeploymentIdentity();
    }
  }
}
