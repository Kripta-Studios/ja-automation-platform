import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { V3ConflictError, V3Repository, PortalRepository, createDatabase } from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
const restoreDeploymentIdentities: Array<() => void> = [];

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
  role: Role,
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(id, id, `${id}@example.com`, role, 'active', 1, now, now);
}

type CompensationFixture = Readonly<{
  sqlite: ReturnType<typeof createDatabase>['sqlite'];
  repository: PortalRepository;
  v3: V3Repository;
  owner: Principal;
  finance: Principal;
  manager: Principal;
  worker: Principal;
  clientId: string;
}>;

function fixture(): CompensationFixture {
  const directory = mkdtempSync(join(tmpdir(), 'ja-worker-compensation-essential-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  databases.push(sqlite);
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  seedUser(sqlite, 'owner', 'owner_admin');
  seedUser(sqlite, 'finance', 'finance_admin');
  seedUser(sqlite, 'manager', 'project_manager');
  seedUser(sqlite, 'worker', 'worker');
  seedUser(sqlite, 'other-worker', 'worker');
  seedB5ServiceActorBinding(sqlite, 'owner');
  const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
  const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
  const manager: Principal = {
    userId: 'manager',
    role: 'project_manager',
    projectIds: new Set(),
  };
  const worker: Principal = { userId: 'worker', role: 'worker', projectIds: new Set() };
  const client = repository.createClient(owner, {
    legalName: 'Essential Compensation Client',
    displayName: 'Essential Compensation Client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '1 Compensation Way',
    billingEmail: 'billing@example.com',
    paymentTermsDays: 30,
  });
  return { sqlite, repository, v3, owner, finance, manager, worker, clientId: client.id };
}

function addProject(value: CompensationFixture, name: string) {
  const project = value.repository.createProject(value.owner, {
    clientId: value.clientId,
    name,
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
    expectedMinutesPerDay: 600,
  });
  value.repository.assignWorker(value.owner, {
    projectId: project.id,
    workerId: 'manager',
    startsOn: '2026-08-01',
    canReview: true,
  });
  value.repository.assignWorker(value.owner, {
    projectId: project.id,
    workerId: 'worker',
    startsOn: '2026-08-01',
  });
  value.manager.projectIds.add(project.id);
  value.worker.projectIds.add(project.id);
  return project;
}

function approvedTime(
  value: CompensationFixture,
  projectId: string,
  workDate: string,
  summary = 'Approved compensation source',
) {
  const row = value.repository.createTimeEntry(value.worker, {
    projectId,
    workDate,
    category: 'regular',
    minutes: 60,
    summary,
  });
  value.repository.submitTime(value.worker, row.id, row.version);
  value.repository.operationalApproveTime(value.manager, row.id, 'approved');
  value.repository.financeApproveTime(value.finance, row.id, true);
  return row;
}

describe('Client Essential worker compensation truth', () => {
  it('uses source work dates for assignment membership and excludes future or expired rows', () => {
    const value = fixture();
    const project = addProject(value, 'Effective assignment compensation');
    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      effectiveFrom: '2026-08-01',
    });
    approvedTime(value, project.id, '2026-08-05', 'Expired assignment source');
    approvedTime(value, project.id, '2026-08-15', 'Future assignment source');

    value.sqlite
      .prepare("UPDATE project_member SET ends_on='2026-08-10' WHERE project_id=? AND user_id=?")
      .run(project.id, 'worker');
    const expired = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(expired.approvedMinutes).toBe(60);
    expect(expired.estimatedApprovedMinor).toBe('6000');

    value.sqlite
      .prepare(
        "UPDATE project_member SET starts_on='2026-08-10',ends_on=NULL WHERE project_id=? AND user_id=?",
      )
      .run(project.id, 'worker');
    const future = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(future.approvedMinutes).toBe(60);
    expect(future.estimatedApprovedMinor).toBe('6000');
    expect(future.projectProgress).toEqual([
      expect.objectContaining({
        projectId: project.id,
        actualMinutes: 60,
        estimatedApprovedMinor: '6000',
      }),
    ]);
  });

  it('reconciles hourly, daily, fixed, percentage, pending and project totals without double count', () => {
    const value = fixture();
    const hourlyProject = addProject(value, 'Hourly compensation');
    const dailyProject = addProject(value, 'Daily compensation');
    const fixedProject = addProject(value, 'Fixed compensation');
    const percentageProject = addProject(value, 'Percentage compensation');
    const pendingProject = addProject(value, 'Pending daily compensation');

    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: hourlyProject.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      effectiveFrom: '2026-08-01',
    });
    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: dailyProject.id,
      currency: 'USD',
      ruleType: 'Daily',
      rateMinor: 12_000n,
      rateBasis: 'daily',
      effectiveFrom: '2026-08-01',
    });
    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: fixedProject.id,
      currency: 'USD',
      ruleType: 'FixedProjectAmount',
      rateMinor: 15_000n,
      effectiveFrom: '2026-08-01',
    });
    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: percentageProject.id,
      currency: 'USD',
      ruleType: 'PercentageOfEligibleClientLabor',
      percentageBps: 1_000,
      percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
      effectiveFrom: '2026-08-01',
    });
    value.v3.createClientLaborRate(value.finance, {
      projectId: percentageProject.id,
      workerId: 'worker',
      currency: 'USD',
      hourlyRateMinor: 20_000n,
      effectiveFrom: '2026-08-01',
      eligibleForPercentage: true,
    });
    value.v3.createCompensationRule(value.finance, {
      workerId: 'worker',
      projectId: pendingProject.id,
      currency: 'USD',
      ruleType: 'Daily',
      rateMinor: 9_000n,
      rateBasis: 'daily',
      effectiveFrom: '2026-08-01',
    });

    approvedTime(value, hourlyProject.id, '2026-08-02');
    approvedTime(value, dailyProject.id, '2026-08-02');
    approvedTime(value, fixedProject.id, '2026-08-02');
    approvedTime(value, percentageProject.id, '2026-08-02');
    const pending = value.repository.createTimeEntry(value.worker, {
      projectId: pendingProject.id,
      workDate: '2026-08-02',
      category: 'regular',
      minutes: 60,
      summary: 'Pending daily compensation source',
    });
    expect(pending.version).toBe(1);

    const pay = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(pay).toMatchObject({
      approvedMinutes: 240,
      pendingMinutes: 60,
      estimatedApprovedMinor: '35000',
      estimatedPendingMinor: '9000',
    });
    const approvedProjectTotal = pay.projectProgress.reduce(
      (sum, row) => sum + BigInt(row.estimatedApprovedMinor),
      0n,
    );
    const pendingProjectTotal = pay.projectProgress.reduce(
      (sum, row) => sum + BigInt(row.estimatedPendingMinor),
      0n,
    );
    expect(approvedProjectTotal.toString()).toBe(pay.estimatedApprovedMinor);
    expect(pendingProjectTotal.toString()).toBe(pay.estimatedPendingMinor);
    expect(pay.projectProgress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId: hourlyProject.id, estimatedApprovedMinor: '6000' }),
        expect.objectContaining({ projectId: dailyProject.id, estimatedApprovedMinor: '12000' }),
        expect.objectContaining({ projectId: fixedProject.id, estimatedApprovedMinor: '15000' }),
        expect.objectContaining({
          projectId: percentageProject.id,
          estimatedApprovedMinor: '2000',
        }),
        expect.objectContaining({ projectId: pendingProject.id, estimatedPendingMinor: '9000' }),
      ]),
    );
    expect(JSON.stringify(pay)).not.toMatch(
      /clientRate|internalCost|contribution|margin|other-worker/i,
    );
  });

  it('makes finalized reimbursement retries idempotent and rejects changed final truth', () => {
    const value = fixture();
    const project = addProject(value, 'Reimbursement compensation');
    const expense = value.repository.createExpense(value.worker, {
      projectId: project.id,
      spentOn: '2026-08-03',
      vendor: 'Hotel',
      category: 'hotel',
      description: 'Worker reimbursement',
      currency: 'USD',
      amountMinor: 12_345n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      receiptRequired: false,
    });
    value.repository.submitExpense(value.worker, expense.id, expense.version);
    value.repository.operationalApproveExpense(value.manager, expense.id, 'approved');
    value.repository.financeApproveExpense(value.finance, expense.id);

    const first = value.v3.recordReimbursement(value.finance, {
      expenseId: expense.id,
      amountMinor: 12_000n,
      reference: 'PAY-ESSENTIAL-1',
    });
    const second = value.v3.recordReimbursement(value.finance, {
      expenseId: expense.id,
      amountMinor: 12_000n,
      reference: 'PAY-ESSENTIAL-1',
    });
    expect(second).toEqual(first);
    expect(() =>
      value.v3.recordReimbursement(value.finance, {
        expenseId: expense.id,
        amountMinor: 11_999n,
        reference: 'PAY-ESSENTIAL-1',
      }),
    ).toThrow(V3ConflictError);
    expect(() =>
      value.v3.recordReimbursement(value.finance, {
        expenseId: expense.id,
        amountMinor: 12_000n,
        reference: 'PAY-ESSENTIAL-2',
      }),
    ).toThrow(V3ConflictError);
    expect(
      value.sqlite
        .prepare(
          'SELECT reimbursement_amount_minor,reimbursement_reference,reimbursement_state FROM expense WHERE id=?',
        )
        .get(expense.id),
    ).toEqual({
      reimbursement_amount_minor: 12_000,
      reimbursement_reference: 'PAY-ESSENTIAL-1',
      reimbursement_state: 'reimbursed',
    });
  });
});
