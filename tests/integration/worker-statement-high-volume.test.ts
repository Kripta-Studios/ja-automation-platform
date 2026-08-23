import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, createDatabase } from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const { GET: workerStatementGet } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/[format]/+server.js');

let directory: string;
let restoreIdentity: (() => void) | undefined;
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const previousDatabasePath = process.env.JA_DATABASE_PATH;

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: Role,
): Principal {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@worker-statement.test`, role, 'active', 1, now, now);
  return { userId: id, role, projectIds: new Set() };
}

function event(role: Role, query: string) {
  return {
    locals: {
      user: {
        id: role === 'worker' ? 'worker' : role,
        name: 'Own Worker',
        email: 'worker@test',
        role,
        status: 'active',
      },
      session: {
        id: `${role}-session`,
        userId: role === 'worker' ? 'worker' : role,
        expiresAt: new Date(),
      },
      correlationId: `${role}-correlation`,
    },
    params: { format: 'csv' },
    url: new URL(`http://localhost/app/api/worker-statement/csv?${query}`),
  } as never;
}

type Fixture = Readonly<{
  repository: PortalRepository;
  sqlite: ReturnType<typeof createDatabase>['sqlite'];
  worker: Principal;
  projectId: string;
}>;

function fixture(): Fixture {
  restoreIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-worker-statement-volume-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  const database = createDatabase();
  const { sqlite } = database;
  databases.push(sqlite);
  const repository = new PortalRepository(sqlite);
  const owner = seedUser(sqlite, 'owner', 'owner_admin');
  const workerSeed = seedUser(sqlite, 'worker', 'worker');
  const client = repository.createClient(owner, {
    legalName: 'Worker Statement Client',
    displayName: 'Worker Statement Client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '1 Worker Statement Way',
    billingEmail: 'worker-statement@example.test',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Worker Statement Project',
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
  });
  repository.assignWorker(owner, {
    projectId: project.id,
    workerId: workerSeed.userId,
    startsOn: '2026-01-01',
  });
  const worker = repository.principalFor(workerSeed.userId);
  return { repository, sqlite, worker, projectId: project.id };
}

function createExpense(
  value: Fixture,
  worker: Principal,
  index: number,
  spentOn: string,
  amountMinor = 100n,
) {
  return value.repository.createExpense(worker, {
    projectId: value.projectId,
    spentOn,
    vendor: `Statement Vendor ${index}`,
    category: 'travel',
    description: `Statement expense ${index}`,
    currency: 'USD',
    amountMinor,
    whoPaid: 'worker',
    clientTreatment: 'reimbursable',
    paymentMethod: 'personal_card',
    receiptRequired: false,
  });
}

beforeEach(() => {
  directory = '';
  restoreIdentity = undefined;
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  restoreIdentity?.();
  restoreIdentity = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('worker statement high-volume exports', () => {
  it('does not let lifetime rows outside the period trigger the old 250-row truncation path', async () => {
    const value = fixture();
    const worker = value.worker;
    for (let index = 0; index < 260; index++) createExpense(value, worker, index, '2026-07-15');
    const inPeriod = createExpense(value, worker, 260, '2026-08-01', 123456789012345n);
    createExpense(value, worker, 261, '2026-08-31');

    const response = workerStatementGet(
      event('worker', 'periodStart=2026-08-01&periodEnd=2026-08-31&workerId=other-worker'),
    ) as Response;
    expect(response.status).toBe(200);
    const body = await response.text();
    const rows = body.trim().split('\r\n');
    expect(rows).toHaveLength(1 + 2 + 2);
    expect(body).toContain(inPeriod.id);
    expect(body).toContain('123456789012345');
    expect(body).not.toContain('Statement Vendor 0');
  });

  it('exports every requested-period row beyond 250 and excludes rejected/void expenses', async () => {
    const value = fixture();
    const worker = value.worker;
    for (let index = 0; index < 251; index++) createExpense(value, worker, index, '2026-08-15');
    const rejected = createExpense(value, worker, 251, '2026-08-15');
    const voided = createExpense(value, worker, 252, '2026-08-15');
    value.sqlite
      .prepare("UPDATE expense SET approval_state='rejected' WHERE id=?")
      .run(rejected.id);
    value.sqlite.prepare("UPDATE expense SET approval_state='void' WHERE id=?").run(voided.id);

    const response = workerStatementGet(
      event('worker', 'periodStart=2026-08-15&periodEnd=2026-08-15'),
    ) as Response;
    expect(response.status).toBe(200);
    const body = await response.text();
    const rows = body.trim().split('\r\n');
    expect(rows).toHaveLength(1 + 2 + 251);
    expect(body).not.toContain(rejected.id);
    expect(body).not.toContain(voided.id);
  });

  it('rejects invalid or unbounded periods before querying the statement', () => {
    fixture();
    for (const query of [
      'periodStart=2026-08-01',
      'periodEnd=2026-08-31',
      'periodStart=2026-08-01&periodStart=2026-08-02&periodEnd=2026-08-31',
      'periodStart=2026-02-30&periodEnd=2026-03-01',
      'periodStart=2026-09-01&periodEnd=2026-08-31',
    ])
      expect(() => workerStatementGet(event('worker', query))).toThrowError();
  });
});
