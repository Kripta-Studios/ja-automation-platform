import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AccessDeniedError, PortalRepository, V3Repository, createDatabase } from '@ja/database';
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
      // A passing test may already have closed the handle; cleanup must remain idempotent.
    }
  }
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: Role,
): void {
  const timestamp = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.com`,
      role,
      'active',
      timestamp,
      timestamp,
    );
}

function stepUpFinance(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  principal: Principal,
): Principal {
  const now = new Date().toISOString();
  const sessionId = 'portal-workflow-finance-step-up';
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

describe('V3 operational and billing workflow', () => {
  it('runs time, expense, approval, pay, invoice, payment and finance flows with enforced visibility', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-workflow-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'manager', 'project_manager');
    seedUser(sqlite, 'worker', 'worker');
    seedUser(sqlite, 'outsider', 'worker');

    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance = stepUpFinance(sqlite, {
      userId: 'finance',
      role: 'finance_admin',
      projectIds: new Set(),
    });

    const client = repository.createClient(owner, {
      legalName: 'Example Manufacturing LLC',
      displayName: 'Example Manufacturing',
      currency: 'USD',
      timezone: 'America/New_York',
      billingEmail: 'ap@example.com',
      billingAddress: 'Example Manufacturing billing address',
      paymentTermsDays: 30,
    });
    expect(client.clientNumber).toBe('C-0001');
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Controls commissioning',
      timezone: 'America/New_York',
      currency: 'USD',
      billingModel: 'tm_daily_minimum',
      expectedMinutesPerDay: 600,
      clientDailyMinimumMinutes: 600,
      poNumber: 'PO-APPROVED',
    });
    expect(project.projectNumber).toBe('C-0001-P-001');
    const canonicalLegacyEntity = repository.createLegalEntity(owner, {
      code: 'JA-CANONICAL',
      legalName: 'J&A Automation Canonical Entity',
      currency: 'USD',
      billingAddress: 'Canonical billing address',
      companyIdentifiers: 'Canonical company identifiers',
    });
    const canonicalRevision = v3.createCanonicalLegalEntityRevision(finance, {
      legacyLegalEntityId: canonicalLegacyEntity.id,
      effectiveFrom: '2026-01-01',
      legalName: 'J&A Automation Canonical Entity S.L.',
      taxIdentifier: 'ESCANONICAL123',
      registrationIdentifier: 'CANONICAL-REG-001',
      addressLine1: 'Canonical billing address',
      locality: 'Madrid',
      region: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
      baseCurrency: 'USD',
      timezone: 'America/New_York',
      reason: 'Bind portal workflow expense classification to canonical authority',
      idempotencyKey: 'portal-workflow:canonical-entity:revision',
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: project.id,
      legalEntityRevisionId: canonicalRevision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind portal workflow project to canonical authority',
      idempotencyKey: 'portal-workflow:canonical-entity:assignment',
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
      plannedMinutes: 12_000,
    });
    const manager = repository.principalFor('manager');
    const worker = repository.principalFor('worker');
    const outsider = repository.principalFor('outsider');

    repository.createCompensationRule(finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      rateMinor: 5_000n,
      rateBasis: 'hourly',
      dailyGuaranteeMinutes: 600,
      effectiveFrom: '2026-08-01',
    });
    repository.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: 'worker',
      currency: 'USD',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-08-01',
    });
    repository.createInternalCostRule(finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      hourlyRateMinor: 3_000n,
      effectiveFrom: '2026-08-01',
    });

    const regular = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 180,
      summary: 'Commissioned conveyor controls',
    });
    const standby = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'standby',
      minutes: 420,
      summary: 'Waited for mechanical completion',
    });
    repository.submitTime(worker, regular.id, regular.version);
    repository.submitTime(worker, standby.id, standby.version);
    repository.operationalApproveTime(manager, regular.id, 'approved');
    repository.operationalApproveTime(manager, standby.id, 'approved');
    repository.financeApproveTime(finance, regular.id, true);
    repository.financeApproveTime(finance, standby.id, true);

    expect(() =>
      repository.createTimeEntry(outsider, {
        projectId: project.id,
        workDate: '2026-08-03',
        category: 'regular',
        minutes: 60,
        summary: 'Cross-project attempt',
      }),
    ).toThrow(AccessDeniedError);

    const expense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-04',
      vendor: 'Hotel Example',
      category: 'hotel',
      description: 'Project lodging',
      currency: 'USD',
      amountMinor: 25_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    const classifiedExpense = repository.classifyExpenseCommercially(finance, {
      expenseId: expense.id,
      expectedVersion: expense.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance classified project lodging for reimbursement at cost',
      idempotencyKey: 'portal-workflow:expense-classification:lodging:v1',
    });
    repository.submitExpense(worker, expense.id, classifiedExpense.version);
    repository.operationalApproveExpense(manager, expense.id, 'approved');
    repository.financeApproveExpense(finance, expense.id);

    const allIn = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-05',
      vendor: 'Rental Example',
      category: 'rental_car',
      description: 'Project vehicle included in fixed scope',
      currency: 'USD',
      amountMinor: 10_000n,
      whoPaid: 'company',
      receiptRequired: false,
    });
    const classifiedAllIn = repository.classifyExpenseCommercially(finance, {
      expenseId: allIn.id,
      expectedVersion: allIn.version,
      clientTreatment: 'all_in',
      billingTreatment: 'all_in',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance classified the company-paid rental as all-in project cost',
      idempotencyKey: 'portal-workflow:expense-classification:all-in:v1',
    });
    repository.submitExpense(worker, allIn.id, classifiedAllIn.version);
    repository.operationalApproveExpense(manager, allIn.id, 'approved');
    repository.financeApproveExpense(finance, allIn.id);

    const pay = repository.workerPay(worker, '2026-08-01', '2026-08-16');
    expect(pay.approvedMinutes).toBe(600);
    expect(pay.estimatedApprovedMinor).toBe('50000');
    expect(pay.approvedReimbursementMinor).toBe('25000');
    expect(() => repository.workerPay(outsider, '2026-08-01', '2026-08-16')).not.toThrow();

    repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: canonicalLegacyEntity.id,
      prefix: 'JA-US',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const laborTax = repository.createTaxProfile(finance, {
      name: 'Labor profile A',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Configured labor tax', basisPoints: 500 }],
    });
    const expenseTax = repository.createTaxProfile(finance, {
      name: 'Expense profile B',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Configured expense tax', basisPoints: 200 }],
    });
    const laborRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: canonicalLegacyEntity.id,
      streamType: 'labor',
      cadenceType: 'fourteen_day',
      anchorDate: '2026-08-03',
      taxProfileId: laborTax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const expenseRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: canonicalLegacyEntity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      taxProfileId: expenseTax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    expect(() =>
      repository.createBillingRule(finance, {
        projectId: project.id,
        legalEntityId: canonicalLegacyEntity.id,
        streamType: 'labor',
        cadenceType: 'monthly',
        taxProfileId: laborTax.id,
        currency: 'USD',
        effectiveFrom: '2026-08-01',
        templateId: 'free-text-template',
      }),
    ).toThrow(/unsupported invoice template/i);

    expect(
      repository.billingReadiness(finance, laborRule.id, '2026-08-03', '2026-08-16').state,
    ).toBe('ready');
    const laborDraft = repository.createInvoiceDraft(
      finance,
      laborRule.id,
      '2026-08-03',
      '2026-08-16',
    );
    repository.approveInvoiceDraft(finance, laborDraft.id);
    const issuedLabor = repository.issueInvoice(finance, laborDraft.id);
    expect(issuedLabor.invoiceNumber).toBe('JA-US-2026-000001');
    expect(
      JSON.parse(
        (
          sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(laborDraft.id) as {
            snapshot_json: string;
          }
        ).snapshot_json,
      ).template,
    ).toMatchObject({ id: 'labor-detailed', version: 1 });
    expect(repository.issueInvoice(finance, laborDraft.id)).toEqual({
      invoiceNumber: issuedLabor.invoiceNumber,
      issued: false,
    });

    const expenseDraft = repository.createInvoiceDraft(
      finance,
      expenseRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    repository.approveInvoiceDraft(finance, expenseDraft.id);
    const issuedExpense = repository.issueInvoice(finance, expenseDraft.id);
    expect(issuedExpense.invoiceNumber).toBe('JA-US-2026-000002');
    expect(
      JSON.parse(
        (
          sqlite.prepare('SELECT snapshot_json FROM invoice WHERE id=?').get(expenseDraft.id) as {
            snapshot_json: string;
          }
        ).snapshot_json,
      ).template,
    ).toMatchObject({ id: 'expenses-detailed', version: 1 });
    const expenseSources = sqlite
      .prepare("SELECT source_id FROM invoice_source WHERE invoice_id=? AND source_type='expense'")
      .all(expenseDraft.id) as Array<{ source_id: string }>;
    expect(expenseSources.map((row) => row.source_id)).toEqual([expense.id]);

    const paymentReceivedAt = (
      sqlite.prepare('SELECT issued_at FROM invoice WHERE id=?').get(laborDraft.id) as {
        issued_at: string;
      }
    ).issued_at;
    const firstPayment = repository.recordPayment(finance, {
      invoiceId: laborDraft.id,
      amountMinor: 50_000n,
      currency: 'USD',
      receivedAt: paymentReceivedAt,
      reference: 'BANK-1',
      idempotencyKey: 'payment-bank-1',
    });
    expect(
      repository.recordPayment(finance, {
        invoiceId: laborDraft.id,
        amountMinor: 50_000n,
        currency: 'USD',
        receivedAt: paymentReceivedAt,
        reference: 'BANK-1',
        idempotencyKey: 'payment-bank-1',
      }),
    ).toEqual({ id: firstPayment.id, created: false });

    const financeView = repository.projectFinance(finance, project.id);
    expect(financeView.approvedCostMinor).toBe('65000');
    expect(financeView.revenueCandidateMinor).toBe('125000');
    expect(financeView.contributionMarginMinor).toBe('60000');
    expect(() => repository.projectFinance(worker, project.id)).toThrow(AccessDeniedError);
    expect(() =>
      sqlite.prepare('UPDATE time_entry SET minutes=1 WHERE id=?').run(regular.id),
    ).toThrow(/immutable/);
    expect(
      (sqlite.prepare('SELECT count(*) count FROM audit_event').get() as { count: number }).count,
    ).toBeGreaterThan(20);
    sqlite.close();
  });

  it('shows a weekly time window and copies only the prior layout into zero-minute drafts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-timesheet-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'worker', 'worker');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const client = repository.createClient(owner, {
      legalName: 'Timesheet Client',
      displayName: 'Timesheet Client',
      currency: 'USD',
      timezone: 'America/New_York',
      billingEmail: 'billing-timesheet@example.com',
      billingAddress: 'Timesheet Client billing address',
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Weekly layout project',
      timezone: 'America/New_York',
      currency: 'USD',
      billingModel: 'tm',
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    const worker = repository.principalFor('worker');
    const sourceMonday = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      activityCode: 'LAYOUT',
      minutes: 480,
      summary: 'Panel checkout',
    });
    repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-04',
      category: 'standby',
      activityCode: 'WAIT',
      minutes: 60,
      summary: 'Production clearance',
    });
    const week = repository.listOwnTimeWeek(worker, '2026-08-03');
    expect(week.rows).toHaveLength(2);
    expect(week.weekEnd).toBe('2026-08-09');
    const copied = repository.copyOwnTimeLayout(worker, '2026-08-03', '2026-08-10');
    expect(copied).toMatchObject({ created: 2, skipped: 0, targetWeekStart: '2026-08-10' });
    const target = repository.listOwnTimeWeek(worker, '2026-08-10').rows as Array<{
      work_date: string;
      category: string;
      activity_code: string | null;
      minutes: number;
      activity_summary: string;
      approval_state: string;
    }>;
    expect(
      target.map((row) => [row.work_date, row.category, row.activity_code, row.minutes]),
    ).toEqual([
      ['2026-08-10', 'regular', 'LAYOUT', 0],
      ['2026-08-11', 'standby', 'WAIT', 0],
    ]);
    expect(target.every((row) => row.approval_state === 'draft')).toBe(true);
    expect(
      (
        sqlite.prepare('SELECT minutes FROM time_entry WHERE id=?').get(sourceMonday.id) as {
          minutes: number;
        }
      ).minutes,
    ).toBe(480);
    expect(repository.copyOwnTimeLayout(worker, '2026-08-03', '2026-08-10')).toMatchObject({
      created: 0,
      skipped: 2,
    });
    sqlite.close();
  });
});
