import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  PortalRepository,
  V3AccessDeniedError,
  V3Repository,
  createDatabase,
} from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];
let restoreDeploymentIdentity: (() => void) | undefined;
beforeAll(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
});
afterAll(() => restoreDeploymentIdentity?.());

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // A failed setup may already have closed the handle.
    }
  }
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

function seedConfiguredAlertActor(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  boundByUserId: string,
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO service_actor(id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'security-alert-service',
      'test-tenant',
      'test-deployment',
      'Security alert dispatcher',
      'active',
      JSON.stringify(['alert.dispatch']),
      now,
      now,
      1,
    );
  sqlite
    .prepare(
      'INSERT INTO deployment_service_actor_binding(singleton,tenant_id,deployment_id,service_actor_id,bound_at,bound_by_user_id,version) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      1,
      'test-tenant',
      'test-deployment',
      'security-alert-service',
      now,
      boundByUserId,
      1,
    );
}

describe('repository authorization and privacy', () => {
  it('allows auditor reads while rejecting auditor mutations and worker finance reads', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-security-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'auditor', 'auditor_read_only');
    seedUser(sqlite, 'worker', 'worker');
    seedUser(sqlite, 'pm', 'project_manager');
    seedConfiguredAlertActor(sqlite, 'owner');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const auditor: Principal = {
      userId: 'auditor',
      role: 'auditor_read_only',
      projectIds: new Set(),
    };
    const worker: Principal = { userId: 'worker', role: 'worker', projectIds: new Set() };
    const unassignedPm: Principal = {
      userId: 'pm',
      role: 'project_manager',
      projectIds: new Set(),
    };
    const client = repository.createClient(owner, {
      legalName: 'Security Client',
      displayName: 'Security Client',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'billing-security@example.test',
      billingAddress: 'Security Client billing address',
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
      'alert_dispatch',
      'test-missing-time:2026-08-18',
      { alertType: 'missing_time', workDate: '2026-08-18' },
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
    expect(() => v3.projectFinance(unassignedPm, project.id)).toThrow(V3AccessDeniedError);
    expect(() =>
      v3.resolveClientLaborRate(worker, project.id, 'worker', 'regular', '2026-08-18'),
    ).toThrow(V3AccessDeniedError);
    expect(() =>
      v3.resolveInternalCostRate(worker, project.id, 'worker', 'regular', '2026-08-18'),
    ).toThrow(V3AccessDeniedError);
  });

  it('redacts finance fields from worker and PM projections while retaining them for finance', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-security-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'worker', 'worker');
    seedUser(sqlite, 'pm', 'project_manager');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
    const client = repository.createClient(owner, {
      legalName: 'Privacy Client',
      displayName: 'Privacy Client',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'billing-privacy@example.test',
      billingAddress: 'Privacy Client billing address',
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Privacy Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      revenueBudgetMinor: 100_000n,
      poCapMinor: 120_000n,
      fixedPriceMinor: 90_000n,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker',
      startsOn: '2026-01-01',
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'pm',
      startsOn: '2026-01-01',
      canReview: true,
    });
    const worker = repository.principalFor('worker');
    const pm = repository.principalFor('pm');
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-18',
      category: 'regular',
      minutes: 480,
      summary: 'Commissioning work',
    });
    sqlite
      .prepare(
        "UPDATE time_entry SET billable_minutes=450,client_rate_minor=12500,compensation_amount_minor=8000,internal_cost_minor=5000,billing_status='locked',locked_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), time.id);
    const expense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-18',
      vendor: 'Railway',
      category: 'travel',
      description: 'Travel to site',
      currency: 'USD',
      amountMinor: 1_000n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_plus_markup',
      markupBps: 1_500,
      receiptRequired: false,
    });
    sqlite
      .prepare(
        "UPDATE expense SET billing_state='locked',billing_amount_minor=1150,finance_approved_by='finance',finance_approved_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), expense.id);
    const milestone = repository.createProjectMilestone(owner, {
      projectId: project.id,
      name: 'Commissioning gate',
      amountMinor: 25_000n,
    });

    const workerTime = repository.timeDetail(worker, time.id);
    const pmTime = repository.timeDetail(pm, time.id);
    const financeTime = repository.timeDetail(finance, time.id);
    for (const row of [workerTime, pmTime]) {
      expect(row).not.toHaveProperty('client_rate_minor');
      expect(row).not.toHaveProperty('compensation_amount_minor');
      expect(row).not.toHaveProperty('internal_cost_minor');
      expect(row).not.toHaveProperty('billing_status');
      expect(row).not.toHaveProperty('locked_at');
    }
    expect(financeTime).toEqual(
      expect.objectContaining({
        client_rate_minor: 12500,
        compensation_amount_minor: 8000,
        internal_cost_minor: 5000,
        billing_status: 'locked',
      }),
    );

    const workerExpense = repository.expenseDetail(worker, expense.id);
    const pmExpense = repository.expenseDetail(pm, expense.id);
    const financeExpense = repository.expenseDetail(finance, expense.id);
    for (const row of [workerExpense, pmExpense]) {
      expect(row).not.toHaveProperty('markup_bps');
      expect(row).not.toHaveProperty('billing_amount_minor');
      expect(row).not.toHaveProperty('billing_state');
      expect(row).not.toHaveProperty('invoice_id');
      expect(row).not.toHaveProperty('finance_approved_by');
      expect(row).not.toHaveProperty('finance_approved_at');
    }
    expect(financeExpense).toEqual(
      expect.objectContaining({
        markup_bps: 1500,
        billing_amount_minor: 1150,
        billing_state: 'locked',
        finance_approved_by: 'finance',
      }),
    );

    expect(repository.listExpensesForScope(worker)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expense.id,
          description: 'Travel to site',
          project_currency_amount_minor: 1000,
        }),
      ]),
    );

    const workerOverview = repository.projectOverview(worker, project.id);
    const pmOverview = repository.projectOverview(pm, project.id);
    const financeOverview = repository.projectOverview(finance, project.id);
    for (const overview of [workerOverview, pmOverview]) {
      expect(overview.project).not.toHaveProperty('billing_model');
      expect(overview.project).not.toHaveProperty('revenue_budget_minor');
      expect(overview.project).not.toHaveProperty('po_cap_minor');
      expect(overview.project).not.toHaveProperty('fixed_price_minor');
      expect(overview.milestones[0]).not.toHaveProperty('amount_minor');
      expect(overview.milestones[0]).not.toHaveProperty('invoice_id');
      expect(overview.expenses[0]).not.toHaveProperty('billing_treatment');
      expect(overview.expenses[0]).not.toHaveProperty('billing_amount_minor');
    }
    expect(financeOverview.project).toEqual(
      expect.objectContaining({ billing_model: 'tm', revenue_budget_minor: 100000 }),
    );
    expect(financeOverview.milestones).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: milestone.id, amount_minor: 25000 })]),
    );
  });
});
