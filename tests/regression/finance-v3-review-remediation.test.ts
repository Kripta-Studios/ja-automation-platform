import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3ConflictError, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const restoreDeploymentIdentities: (() => void)[] = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: 'owner_admin' | 'finance_admin' | 'project_manager' | 'worker',
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.com`,
      role,
      'active',
      1,
      now,
      now,
    );
}

function withRecentStepUp(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  principal: Principal,
  suffix: string,
): Principal {
  const now = new Date().toISOString();
  const sessionId = `finance-review-${principal.userId}-${suffix}`;
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      sessionId,
      `${sessionId}-token`,
      principal.userId,
      new Date(Date.now() + 3_600_000).toISOString(),
      now,
      now,
      now,
    );
  return { ...principal, sessionId };
}

describe('V3 finance review remediation', () => {
  it('downloads a ready format when another Accounting Pack format failed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-finance-pack-review-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'finance', 'finance_admin');
    seedB5ServiceActorBinding(sqlite, 'finance');
    const finance = withRecentStepUp(
      sqlite,
      { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
      'settlement',
    );
    const pack = v3.createAccountingPack(finance, '2120-01-01', '2120-01-31');
    const hash = 'a'.repeat(64);

    v3.recordAccountingPackExport(finance, pack.id, 'xlsx', 'exports/pack.xlsx', hash, 4);
    v3.recordAccountingPackExportFailure(finance, pack.id, 'pdf', 'renderer unavailable');

    expect(v3.accountingPackExport(finance, pack.id, 'xlsx')).toMatchObject({
      storageKey: 'exports/pack.xlsx',
      sha256: hash,
      byteLength: 4,
    });
    expect(() => v3.accountingPackExport(finance, pack.id, 'pdf')).toThrow(/pdf export failed/i);

    expect(() => v3.accountingPackExport(finance, pack.id, 'expense_csv')).toThrow(/not ready/i);
  });

  it('keeps settled compensation immutable and makes identical retries idempotent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-finance-settlement-review-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'manager', 'project_manager');
    seedUser(sqlite, 'worker', 'worker');
    seedB5ServiceActorBinding(sqlite, 'owner');

    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance = withRecentStepUp(
      sqlite,
      { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
      'settlement',
    );
    const client = repository.createClient(owner, {
      legalName: 'Settlement Review Client',
      displayName: 'Settlement Review Client',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'billing@example.com',
      billingAddress: '100 Settlement Review Way',
      paymentTermsDays: 30,
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Settlement Review Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      expectedMinutesPerDay: 600,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    const manager = repository.principalFor('manager');
    const worker = repository.principalFor('worker');
    const rule = v3.createCompensationRule(finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      effectiveFrom: '2026-08-01',
    });
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-02',
      category: 'regular',
      minutes: 60,
      summary: 'Settlement review work',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);

    const first = v3.settleCompensation(finance, {
      workerId: 'worker',
      projectId: project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    });
    const beforeRetry = sqlite
      .prepare(
        'SELECT id,source_basis,source_amount_minor,percentage_bps,amount_minor,currency,state,settled_at,updated_at FROM compensation_settlement WHERE id=?',
      )
      .get(first[0].id);

    expect(
      v3.settleCompensation(finance, {
        workerId: 'worker',
        projectId: project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toEqual(first);
    expect(
      sqlite
        .prepare(
          'SELECT id,source_basis,source_amount_minor,percentage_bps,amount_minor,currency,state,settled_at,updated_at FROM compensation_settlement WHERE id=?',
        )
        .get(first[0].id),
    ).toEqual(beforeRetry);

    sqlite.prepare('UPDATE compensation_rule SET rate_minor=7000 WHERE id=?').run(rule.id);
    expect(() =>
      v3.settleCompensation(finance, {
        workerId: 'worker',
        projectId: project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow(V3ConflictError);
    expect(
      sqlite
        .prepare(
          'SELECT amount_minor,state,settled_at,updated_at FROM compensation_settlement WHERE id=?',
        )
        .get(first[0].id),
    ).toEqual({
      amount_minor: 6000,
      state: 'settled',
      settled_at: (beforeRetry as { settled_at: string }).settled_at,
      updated_at: (beforeRetry as { updated_at: string }).updated_at,
    });
  });
});
