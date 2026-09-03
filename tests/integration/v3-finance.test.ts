import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3AccessDeniedError, V3Repository, createDatabase } from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const restoreDeploymentIdentities: Array<() => void> = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
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

function steppedUpPrincipal(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  principal: Principal,
  label: string,
): Principal {
  const now = new Date().toISOString();
  const sessionId = `v3-finance-${principal.userId}-${label}`;
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

function configureExpenseAuthority(
  repository: PortalRepository,
  v3: V3Repository,
  owner: Principal,
  finance: Principal,
  projectId: string,
  currency: 'USD' | 'EUR' | 'GBP' | 'CAD',
  label: string,
): { id: string } {
  const legacy = repository.createLegalEntity(owner, {
    code: `EXP-${label}`,
    legalName: `Expense authority ${label}`,
    currency,
    billingAddress: '100 Canonical Finance Way',
    companyIdentifiers: `TAX-${label}`,
  });
  const revision = v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: legacy.id,
    effectiveFrom: '2026-01-01',
    legalName: `Expense authority ${label}`,
    taxIdentifier: `TAX-${label}`,
    registrationIdentifier: `REG-${label}`,
    addressLine1: '100 Canonical Finance Way',
    locality: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: currency,
    timezone: 'UTC',
    reason: 'Bind deterministic Finance authority for expense classification',
    idempotencyKey: `v3-finance:${label}:revision`,
  });
  v3.assignCanonicalLegalEntityToProject(finance, {
    projectId,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Bind deterministic Finance authority for expense classification',
    idempotencyKey: `v3-finance:${label}:assignment`,
  });
  return legacy;
}

// Customer reports may carry operational hours and activity, but must not
// carry finance/commercial DTO keys or hidden money-bearing metadata.
const customerForbiddenSnapshotKeys = [
  'commercialSummary',
  'commercialCalculation',
  'financialSummary',
  'amount',
  'currency',
  'treatment',
  'clientTreatment',
  'billingTreatment',
  'billingAmountMinor',
  'billingState',
  'billingLockId',
  'markupBps',
  'taxAmountMinor',
  'fxRateBps',
  'projectCurrencyAmountMinor',
  'reimbursementAmountMinor',
  'reimbursementState',
  'reimbursementReference',
  'invoiceId',
  'financeApprovedBy',
  'financeApprovedAt',
  'laborRevenueMinor',
  'expenseRevenueMinor',
  'milestoneRevenueMinor',
  'operationalRevenueCandidateMinor',
  'candidateSubtotalMinor',
  'invoicedNetMinor',
  'invoicedGrossMinor',
  'paidMinor',
  'receivableMinor',
  'approvedUnbilledWipMinor',
  'unapprovedWipMinor',
  'dailyMinimumTopUpMinor',
  'directLaborCostMinor',
  'approvedCostMinor',
  'contributionMarginMinor',
  'contributionMarginBps',
] as const;

function expectNoCustomerFinanceKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries())
      expectNoCustomerFinanceKeys(child, `${path}[${index}]`);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    expect(customerForbiddenSnapshotKeys).not.toContain(key);
    expectNoCustomerFinanceKeys(child, `${path}.${key}`);
  }
}

describe('V3 finance and privacy paths', () => {
  it('keeps percentage pay, overtime, expense treatment and finance economics exact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-v3-finance-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'manager', 'project_manager');
    seedUser(sqlite, 'worker-a', 'worker');
    seedUser(sqlite, 'worker-b', 'worker');
    seedUser(sqlite, 'outsider', 'worker');
    seedB5ServiceActorBinding(sqlite, 'owner');

    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance = steppedUpPrincipal(
      sqlite,
      { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
      'economics',
    );
    const client = repository.createClient(owner, {
      legalName: 'V3 Client',
      displayName: 'V3 Client',
      currency: 'USD',
      timezone: 'UTC',
      billingAddress: '100 V3 Client Way',
      billingEmail: 'ap@example.com',
      paymentTermsDays: 30,
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'V3 Commissioning',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      expectedMinutesPerDay: 600,
    });
    configureExpenseAuthority(repository, v3, owner, finance, project.id, 'USD', 'economics');
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker-a',
      startsOn: '2026-08-01',
    });
    const assignmentB = repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker-b',
      startsOn: '2026-08-01',
    });
    const manager = repository.principalFor('manager');
    const workerA = repository.principalFor('worker-a');
    const workerB = repository.principalFor('worker-b');

    v3.createCompensationRule(finance, {
      workerId: 'worker-a',
      projectId: project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 4_000n,
      rateBasis: 'hourly',
      effectiveFrom: '2026-08-01',
    });
    const percentageRule = v3.createCompensationRule(finance, {
      workerId: 'worker-b',
      projectId: project.id,
      currency: 'USD',
      ruleType: 'PercentageOfEligibleClientLabor',
      percentageBps: 5_500,
      percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
      settlementTrigger: 'ON_APPROVED_BILLABLE_LABOR',
      effectiveFrom: '2026-08-01',
    });
    const clientRegular = v3.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: 'worker-b',
      currency: 'USD',
      hourlyRateMinor: 8_000n,
      effectiveFrom: '2026-08-01',
    });
    v3.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: 'worker-a',
      currency: 'USD',
      hourlyRateMinor: 8_000n,
      effectiveFrom: '2026-08-01',
    });
    v3.createInternalCostRule(finance, {
      workerId: 'worker-a',
      projectId: project.id,
      currency: 'USD',
      hourlyRateMinor: 4_700n,
      effectiveFrom: '2026-08-01',
    });
    v3.createInternalCostRule(finance, {
      workerId: 'worker-b',
      projectId: project.id,
      currency: 'USD',
      hourlyRateMinor: 6_100n,
      overtimeMethod: 'FIXED_RATE',
      overtimeRateMinor: 7_000n,
      effectiveFrom: '2026-08-01',
    });

    expect(() =>
      v3.createAssignmentRateOverride(finance, {
        projectMemberId: assignmentB.id,
        clientLaborRateId: clientRegular.id,
        compensationRuleId: percentageRule.id,
        effectiveFrom: '2026-08-01',
      }),
    ).not.toThrow();
    const override = v3.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: 'worker-b',
      category: 'overtime',
      currency: 'USD',
      hourlyRateMinor: 12_000n,
      effectiveFrom: '2026-08-01',
      overtimeMethod: 'FIXED_RATE',
      overtimeRateMinor: 12_000n,
    });
    v3.createAssignmentRateOverride(finance, {
      projectMemberId: assignmentB.id,
      timeCategory: 'overtime',
      clientLaborRateId: override.id,
      effectiveFrom: '2026-08-01',
      priority: 10,
    });

    const aTime = repository.createTimeEntry(workerA, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 120,
      summary: 'Regular site work',
    });
    const bRegular = repository.createTimeEntry(workerB, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 480,
      summary: 'Commissioning work',
    });
    const bOvertime = repository.createTimeEntry(workerB, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'overtime',
      minutes: 120,
      summary: 'Overtime validation',
    });
    for (const row of [aTime, bRegular, bOvertime]) {
      const worker = row.id === aTime.id ? workerA : workerB;
      repository.submitTime(worker, row.id, row.version);
      repository.operationalApproveTime(manager, row.id, 'approved');
      repository.financeApproveTime(finance, row.id, true);
    }

    const workerPay = v3.workerPay(workerB, '2026-08-01', '2026-08-16');
    expect(workerPay.approvedMinutes).toBe(600);
    expect(workerPay.estimatedApprovedMinor).toBe('48400');
    expect(workerPay.settlementTriggers).toContain('ON_APPROVED_BILLABLE_LABOR');
    expect(JSON.stringify(workerPay)).not.toMatch(/clientRate|internalCost|contribution|margin/i);
    expect(() =>
      v3.workerPay(repository.principalFor('outsider'), '2026-08-01', '2026-08-16'),
    ).not.toThrow();

    const editableExpense = repository.createExpense(workerA, {
      projectId: project.id,
      spentOn: '2026-08-04',
      vendor: 'Editable hotel',
      category: 'hotel',
      description: 'Reimbursement amount follows a draft edit',
      currency: 'USD',
      amountMinor: 1_234n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    expect(
      sqlite
        .prepare('SELECT amount_minor,reimbursement_amount_minor FROM expense WHERE id=?')
        .get(editableExpense.id),
    ).toEqual({ amount_minor: 1234, reimbursement_amount_minor: 1234 });
    repository.updateExpense(workerA, {
      id: editableExpense.id,
      version: editableExpense.version,
      amountMinor: 2_345n,
    });
    expect(
      sqlite
        .prepare('SELECT amount_minor,reimbursement_amount_minor FROM expense WHERE id=?')
        .get(editableExpense.id),
    ).toEqual({ amount_minor: 2345, reimbursement_amount_minor: 2345 });

    const reimbursable = repository.createExpense(workerA, {
      projectId: project.id,
      spentOn: '2026-08-04',
      vendor: 'Hotel',
      category: 'hotel',
      description: 'Approved hotel',
      currency: 'USD',
      amountMinor: 10_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    const allIn = repository.createExpense(workerA, {
      projectId: project.id,
      spentOn: '2026-08-05',
      vendor: 'Rental car',
      category: 'rental_car',
      description: 'Included travel',
      currency: 'USD',
      amountMinor: 5_000n,
      whoPaid: 'company_card',
      receiptRequired: false,
    });
    const clientDirect = repository.createExpense(workerA, {
      projectId: project.id,
      spentOn: '2026-08-06',
      vendor: 'Client purchase',
      category: 'materials',
      description: 'Paid directly by the client',
      currency: 'USD',
      amountMinor: 7_500n,
      whoPaid: 'client',
      receiptRequired: false,
    });
    const classifications = [
      repository.classifyExpenseCommercially(finance, {
        expenseId: reimbursable.id,
        expectedVersion: reimbursable.version,
        clientTreatment: 'reimbursable',
        billingTreatment: 'reimbursable_plus_markup',
        markupBps: 1_000,
        taxBps: 0,
        reason: 'Finance classifies reimbursable hotel with configured markup',
        idempotencyKey: 'v3-finance:economics:reimbursable',
      }),
      repository.classifyExpenseCommercially(finance, {
        expenseId: allIn.id,
        expectedVersion: allIn.version,
        clientTreatment: 'all_in',
        billingTreatment: 'all_in',
        markupBps: 0,
        taxBps: 0,
        reason: 'Finance classifies rental car as all-in',
        idempotencyKey: 'v3-finance:economics:all-in',
      }),
      repository.classifyExpenseCommercially(finance, {
        expenseId: clientDirect.id,
        expectedVersion: clientDirect.version,
        clientTreatment: 'non_billable',
        billingTreatment: 'client_direct',
        markupBps: 0,
        taxBps: 0,
        reason: 'Finance records the customer-paid direct purchase',
        idempotencyKey: 'v3-finance:economics:client-direct',
      }),
    ];
    for (const [index, row] of [reimbursable, allIn, clientDirect].entries()) {
      repository.submitExpense(workerA, row.id, classifications[index]!.version);
      repository.operationalApproveExpense(manager, row.id, 'approved');
      repository.financeApproveExpense(finance, row.id);
    }

    const financeView = v3.projectFinance(finance, project.id);
    expect(financeView.laborRevenueMinor).toBe('104000');
    expect(financeView.expenseRevenueMinor).toBe('11000');
    expect(financeView.revenueCandidateMinor).toBe('115000');
    expect(financeView.directLaborCostMinor).toBe('72200');
    expect(financeView.approvedCostMinor).toBe('87200');
    expect(financeView.contributionMarginMinor).toBe('27800');
    expect(financeView.expenseEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: allIn.id, revenueMinor: '0', costMinor: '5000' }),
        expect.objectContaining({ id: reimbursable.id, revenueMinor: '11000', costMinor: '10000' }),
        expect.objectContaining({
          id: clientDirect.id,
          revenueMinor: '0',
          costMinor: '0',
          paidBy: 'client',
        }),
      ]),
    );
    const settled = v3.settleCompensation(finance, {
      workerId: 'worker-b',
      projectId: project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-16',
    });
    expect(settled).toEqual([
      expect.objectContaining({ amountMinor: '48400', currency: 'USD', state: 'settled' }),
    ]);
    expect(v3.listCompensationSettlements(finance, undefined, undefined, project.id)).toEqual([
      expect.objectContaining({
        workerId: 'worker-b',
        workerName: 'worker-b',
        amountMinor: '48400',
      }),
    ]);
    const workerSettlements = v3.listCompensationSettlements(workerB, '2026-08-01', '2026-08-16');
    expect(workerSettlements).toEqual([expect.objectContaining({ amountMinor: '48400' })]);
    expect(JSON.stringify(workerSettlements)).not.toMatch(/worker-a|sourceBasis|percentageBps/);
    expect(
      v3.recordReimbursement(finance, {
        expenseId: reimbursable.id,
        reference: 'PAY-2026-0001',
      }),
    ).toMatchObject({ expenseId: reimbursable.id, amountMinor: '10000', state: 'reimbursed' });
    expect(
      v3.recordReimbursement(finance, {
        expenseId: reimbursable.id,
        reference: 'PAY-2026-0001',
      }),
    ).toMatchObject({ expenseId: reimbursable.id, amountMinor: '10000', state: 'reimbursed' });

    const unauthorized = {
      userId: 'outsider',
      role: 'worker' as const,
      projectIds: new Set<string>(),
    };
    expect(() => v3.projectFinance(unauthorized, project.id)).toThrow(V3AccessDeniedError);
    expect(() =>
      v3.createAssignmentRateOverride(finance, {
        projectMemberId: assignmentB.id,
        internalCostRuleId: v3.createInternalCostRule(finance, {
          workerId: 'worker-a',
          projectId: project.id,
          currency: 'USD',
          hourlyRateMinor: 1n,
          effectiveFrom: '2026-08-01',
        }).id,
        effectiveFrom: '2026-08-01',
      }),
    ).toThrow(/unavailable/);
    expect(
      sqlite.prepare('SELECT 1 FROM compensation_rule WHERE id=?').get(percentageRule.id),
    ).toBeTruthy();
    sqlite.close();
  });

  it('closes locked streams, drafts once, reconciles payments, persists offline conflicts and keeps customer snapshots operational-only', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-v3-billing-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    seedUser(sqlite, 'manager', 'project_manager');
    seedUser(sqlite, 'worker', 'worker');
    seedB5ServiceActorBinding(sqlite, 'owner');
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance = steppedUpPrincipal(
      sqlite,
      { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
      'billing',
    );
    const client = repository.createClient(owner, {
      legalName: 'Billing Client',
      displayName: 'Billing Client',
      currency: 'USD',
      timezone: 'UTC',
      billingAddress: '200 Billing Client Way',
      billingEmail: 'billing-client@example.com',
      paymentTermsDays: 30,
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Billing Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'tm',
      expectedMinutesPerDay: 600,
    });
    const canonicalBillingEntity = configureExpenseAuthority(
      repository,
      v3,
      owner,
      finance,
      project.id,
      'USD',
      'billing',
    );
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    const workerAssignment = repository.assignWorker(owner, {
      projectId: project.id,
      workerId: 'worker',
      startsOn: '2026-08-01',
    });
    const manager = repository.principalFor('manager');
    const worker = repository.principalFor('worker');
    v3.createCompensationRule(finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 5_000n,
      rateBasis: 'hourly',
      effectiveFrom: '2026-08-01',
    });
    v3.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: 'worker',
      currency: 'USD',
      hourlyRateMinor: 10_000n,
      effectiveFrom: '2026-08-01',
    });
    const issueTriggeredPercentage = v3.createCompensationRule(finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      ruleType: 'PercentageOfEligibleClientLabor',
      percentageBps: 5_000,
      percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
      settlementTrigger: 'ON_INVOICE_ISSUE',
      effectiveFrom: '2026-08-01',
    });
    v3.createAssignmentRateOverride(finance, {
      projectMemberId: workerAssignment.id,
      compensationRuleId: issueTriggeredPercentage.id,
      effectiveFrom: '2026-08-01',
    });
    v3.createInternalCostRule(finance, {
      workerId: 'worker',
      projectId: project.id,
      currency: 'USD',
      hourlyRateMinor: 3_000n,
      effectiveFrom: '2026-08-01',
    });
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Billable hour',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);
    const expense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-03',
      vendor: 'Hotel',
      category: 'hotel',
      description: 'Billable hotel',
      currency: 'USD',
      amountMinor: 2_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    const expenseClassification = repository.classifyExpenseCommercially(finance, {
      expenseId: expense.id,
      expectedVersion: expense.version,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: 'Finance classifies the hotel for at-cost recovery',
      idempotencyKey: 'v3-finance:billing:expense',
    });
    repository.submitExpense(worker, expense.id, expenseClassification.version);
    repository.operationalApproveExpense(manager, expense.id, 'approved');
    repository.financeApproveExpense(finance, expense.id);

    repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: canonicalBillingEntity.id,
      prefix: 'JA-V3',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const laborTax = repository.createTaxProfile(finance, {
      name: 'Labor tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Labor tax', basisPoints: 500 }],
    });
    const expenseTax = repository.createTaxProfile(finance, {
      name: 'Expense tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Expense tax', basisPoints: 200 }],
    });
    const laborRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: canonicalBillingEntity.id,
      streamType: 'labor',
      cadenceType: 'every_14_days',
      anchorDate: '2026-08-03',
      taxProfileId: laborTax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const expenseRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: canonicalBillingEntity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      taxProfileId: expenseTax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const preCloseDraft = repository.createInvoiceDraft(
      finance,
      laborRule.id,
      '2026-08-03',
      '2026-08-16',
    );
    expect(
      (
        sqlite
          .prepare('SELECT source_version FROM invoice_source WHERE invoice_id=? AND source_id=?')
          .get(preCloseDraft.id, time.id) as { source_version: number }
      ).source_version,
    ).toBe(
      (
        sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(time.id) as {
          version: number;
        }
      ).version,
    );
    const reservedTimeVersion = (
      sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(time.id) as {
        version: number;
      }
    ).version;
    expect(() =>
      repository.updateTimeEntry(worker, {
        id: time.id,
        version: reservedTimeVersion,
        summary: 'Attempt to change a reserved invoice source',
      }),
    ).toThrow(/invoice time source|cannot be edited|changed|unlocked editable/);
    expect(() =>
      sqlite
        .prepare('UPDATE time_entry SET activity_summary=? WHERE id=?')
        .run('Direct SQL mutation must be rejected', time.id),
    ).toThrow(/draft invoice time source is immutable/);
    expect(
      v3.closeBillingPeriod(finance, laborRule.id, '2026-08-03', '2026-08-16', 'pt').closed,
    ).toBe(true);
    expect(v3.closeBillingPeriod(finance, expenseRule.id, '2026-08-03', '2026-08-16').closed).toBe(
      true,
    );
    expect(
      (
        sqlite.prepare('SELECT billing_status FROM time_entry WHERE id=?').get(time.id) as {
          billing_status: string;
        }
      ).billing_status,
    ).toBe('locked');
    expect(
      (
        sqlite.prepare('SELECT billing_state FROM expense WHERE id=?').get(expense.id) as {
          billing_state: string;
        }
      ).billing_state,
    ).toBe('locked');
    expect(
      JSON.parse(
        (
          sqlite
            .prepare(
              'SELECT snapshot_json FROM period_report WHERE project_id=? AND period_start=? ORDER BY audience LIMIT 1',
            )
            .get(project.id, '2026-08-03') as { snapshot_json: string }
        ).snapshot_json,
      ).locale,
    ).toBe('pt');
    const inPeriodTechnical = repository.createTechnicalReport(worker, {
      projectId: project.id,
      reportDate: '2026-08-10',
      systemName: 'PLC-A',
      changeSummary: 'In-period report',
    });
    const includedChange = v3.createTechnicalChange(worker, {
      projectId: project.id,
      technicalReportId: inPeriodTechnical.id,
      component: 'PLC-A',
      changeMade: 'In-period change',
    });
    const outsideTechnical = repository.createTechnicalReport(worker, {
      projectId: project.id,
      reportDate: '2026-08-20',
      systemName: 'PLC-B',
      changeSummary: 'Outside-period report',
    });
    const excludedChange = v3.createTechnicalChange(worker, {
      projectId: project.id,
      technicalReportId: outsideTechnical.id,
      component: 'PLC-B',
      changeMade: 'Outside-period change',
    });
    // Deliberately invert wall-clock creation dates. Period membership belongs
    // to the immutable parent report date, never technical_change.created_at.
    sqlite
      .prepare('UPDATE technical_change SET created_at=? WHERE id=?')
      .run('2099-01-01T00:00:00.000Z', includedChange.id);
    sqlite
      .prepare('UPDATE technical_change SET created_at=? WHERE id=?')
      .run('2026-08-10T00:00:00.000Z', excludedChange.id);
    const refreshedReports = v3.refreshPeriodReports(finance, {
      projectId: project.id,
      periodStart: '2026-08-03',
      periodEnd: '2026-08-16',
    });
    const internalReport = refreshedReports.find((report) => report.audience === 'internal');
    const customerReport = refreshedReports.find((report) => report.audience === 'customer');
    expect(internalReport?.snapshot).toEqual(
      expect.objectContaining({
        commercialSummary: expect.objectContaining({
          actualMinutes: 60,
          approvedMinutes: 60,
          billableMinutes: 60,
          laborRevenueMinor: '10000',
          expenseRevenueMinor: '2000',
          candidateSubtotalMinor: '12000',
        }),
        financialSummary: expect.objectContaining({
          directLaborCostMinor: '3000',
          approvedCostMinor: '5000',
          contributionMarginMinor: '7000',
        }),
      }),
    );
    expect(
      (internalReport?.snapshot.technicalChanges as Array<{ id: string }>).map((row) => row.id),
    ).toEqual([includedChange.id]);
    expect(internalReport).toBeDefined();
    if (!internalReport) throw new Error('Internal period report was not created');
    v3.recordPeriodReportPdf(
      finance,
      internalReport.id,
      'reports/period-before-refresh.pdf',
      'a'.repeat(64),
      4,
    );
    expect(v3.periodReportPdfMetadata(finance, internalReport.id).sha256).toBe('a'.repeat(64));
    v3.refreshPeriodReports(finance, {
      projectId: project.id,
      periodStart: '2026-08-03',
      periodEnd: '2026-08-16',
    });
    // An idempotent refresh preserves the finalized binding. A real source
    // change below advances the snapshot and invalidates the old PDF.
    expect(v3.periodReportPdfMetadata(finance, internalReport.id).sha256).toBe('a'.repeat(64));
    repository.createDailyReport(worker, {
      projectId: project.id,
      workDate: '2026-08-12',
      summary: 'Additional in-period operational evidence',
      tasksCompleted: 'Verified the refreshed report source binding',
      downtimeMinutes: 0,
    });
    v3.refreshPeriodReports(finance, {
      projectId: project.id,
      periodStart: '2026-08-03',
      periodEnd: '2026-08-16',
    });
    expect(() => v3.periodReportPdfMetadata(finance, internalReport.id)).toThrow(
      /Period report PDF is not ready/,
    );
    expect(
      (
        sqlite
          .prepare('SELECT source_version FROM invoice_source WHERE invoice_id=? AND source_id=?')
          .get(preCloseDraft.id, time.id) as { source_version: number }
      ).source_version,
    ).toBe(
      (
        sqlite.prepare('SELECT version FROM time_entry WHERE id=?').get(time.id) as {
          version: number;
        }
      ).version,
    );

    const laborDraft = repository.createInvoiceDraft(
      finance,
      laborRule.id,
      '2026-08-03',
      '2026-08-16',
    );
    const expenseDraft = repository.createInvoiceDraft(
      finance,
      expenseRule.id,
      '2026-08-03',
      '2026-08-16',
    );
    expect(
      (
        sqlite
          .prepare('SELECT count(*) count FROM invoice_line WHERE invoice_id=?')
          .get(expenseDraft.id) as { count: number }
      ).count,
    ).toBe(1);
    repository.approveInvoiceDraft(finance, laborDraft.id);
    repository.approveInvoiceDraft(finance, expenseDraft.id);
    expect(() =>
      v3.settleCompensation(finance, {
        workerId: 'worker',
        projectId: project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-16',
      }),
    ).toThrow(/No approved time is available/);
    const issuedLabor = repository.issueInvoice(finance, laborDraft.id);
    const issuedExpense = repository.issueInvoice(finance, expenseDraft.id);
    expect(issuedLabor.issued).toBe(true);
    expect(issuedExpense.issued).toBe(true);
    expect(
      v3.settleCompensation(finance, {
        workerId: 'worker',
        projectId: project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-16',
      }),
    ).toEqual([expect.objectContaining({ amountMinor: '5000', state: 'settled' })]);
    expect(() => repository.sendInvoice(finance, laborDraft.id, 'send-before-pdf')).toThrow(
      /PDF must be ready/,
    );
    v3.recordInvoicePdf(finance, laborDraft.id, 'invoices/JA-V3-000001.pdf', 'a'.repeat(64), 4);
    expect(repository.sendInvoice(finance, laborDraft.id, 'send-after-pdf')).toMatchObject({
      sent: true,
    });
    expect(repository.sendInvoice(finance, laborDraft.id, 'send-after-pdf')).toMatchObject({
      sent: false,
    });
    expect(repository.issueInvoice(finance, laborDraft.id)).toEqual({
      invoiceNumber: issuedLabor.invoiceNumber,
      issued: false,
    });
    const total = (
      sqlite.prepare('SELECT total_minor FROM invoice WHERE id=?').get(laborDraft.id) as {
        total_minor: number;
      }
    ).total_minor;
    const issuedAt = (
      sqlite.prepare('SELECT issued_at FROM invoice WHERE id=?').get(laborDraft.id) as {
        issued_at: string;
      }
    ).issued_at;
    const partialPaymentAt = issuedAt;
    const finalPaymentAt = issuedAt;
    const partial = v3.recordPayment(finance, {
      invoiceId: laborDraft.id,
      amountMinor: BigInt(total - 1),
      currency: 'USD',
      receivedAt: partialPaymentAt,
      idempotencyKey: 'v3-partial-payment',
    });
    expect(partial.state).toBe('partially_paid');
    expect(
      v3.recordPayment(finance, {
        invoiceId: laborDraft.id,
        amountMinor: 1n,
        currency: 'USD',
        receivedAt: finalPaymentAt,
        idempotencyKey: 'v3-final-payment',
      }).state,
    ).toBe('paid');
    const ledger = v3.masterLedger(finance, { projectId: project.id });
    expect(ledger).toHaveLength(2);
    expect(ledger.find((row) => row.invoiceId === laborDraft.id)?.paymentStatus).toBe('paid');
    expect(ledger.find((row) => row.invoiceId === expenseDraft.id)?.directCostMinor).toBe('2000');

    const pack = v3.createAccountingPack(finance, '2000-01-01', '2999-12-31', 'es');
    expect(pack.reconciliation).toMatchObject({ reconciles: true, paymentCount: 2 });
    expect((pack.snapshot as { locale?: string }).locale).toBe('es');
    expect(v3.createAccountingPack(finance, '2000-01-01', '2999-12-31').id).toBe(pack.id);
    const jobRun = v3.runDueJobs(10, {
      accounting_pack: () => undefined,
      invoice_pdf: () => undefined,
    });
    expect(jobRun.failed).toBe(0);
    expect(jobRun.processed).toBeGreaterThanOrEqual(3);

    const draft = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-22',
      category: 'regular',
      minutes: 30,
      summary: 'Offline draft',
    });
    const mutation = {
      mutationId: '0198be45-cd9c-7ab4-9a5a-a6c4966f9d31',
      entityType: 'time',
      entityId: draft.id,
      baseVersion: draft.version,
      payload: { minutes: 45, category: 'regular', summary: 'Offline edit' },
      attachments: [] as string[],
    };
    expect(() => v3.syncMutation(worker, mutation)).toThrow(/legacy offline read only/);
    expect(
      sqlite.prepare('SELECT version,minutes FROM time_entry WHERE id=?').get(draft.id),
    ).toEqual({ version: draft.version, minutes: 30 });
    try {
      expect(customerReport).toBeDefined();
      if (!customerReport) throw new Error('Customer period report was not created');
      expect(customerReport.snapshot).not.toHaveProperty('commercialSummary');
      expect(customerReport.snapshot).not.toHaveProperty('commercialCalculation');
      expect(customerReport.snapshot).not.toHaveProperty('financialSummary');
      expect(customerReport.snapshot).toEqual(
        expect.objectContaining({
          audience: 'customer',
          timeSummary: expect.arrayContaining([
            expect.objectContaining({
              date: '2026-08-03',
              category: 'regular',
              minutes: 60,
              activitySummary: 'Billable hour',
            }),
          ]),
        }),
      );
      expect(customerReport.snapshot).not.toHaveProperty('expenses');
      expectNoCustomerFinanceKeys(customerReport.snapshot);

      const legacyCustomerSnapshot = {
        project: {
          id: project.id,
          number: project.projectNumber,
          name: project.name,
          currency: 'USD',
        },
        periodStart: '2026-08-03',
        periodEnd: '2026-08-16',
        audience: 'customer',
        reportType: 'period_summary',
        locale: 'en',
        dailyReports: [
          {
            id: 'legacy-daily',
            date: '2026-08-03',
            summary: 'Legacy approved daily record',
            approvalState: 'approved',
            amountMinor: '999999',
          },
        ],
        timeSummary: [
          {
            date: '2026-08-03',
            category: 'regular',
            minutes: 60,
            activitySummary: 'Legacy approved activity',
            worker: 'Worker',
            approvalState: 'approved',
            currency: 'USD',
          },
        ],
        technicalReports: [],
        technicalChanges: [],
        commercialSummary: {
          currency: 'USD',
          candidateSubtotalMinor: '999999',
          sourceCounts: {
            dailyReports: 1,
            technicalReports: 0,
            technicalChanges: 0,
            timeEntries: 1,
            expenses: 1,
          },
        },
        expenses: [{ amount: '999999', currency: 'USD', treatment: 'reimbursable' }],
        generatedAt: new Date().toISOString(),
      };
      sqlite
        .prepare(
          'UPDATE period_report SET snapshot_version=snapshot_version+1,snapshot_json=?,snapshot_sha256=?,pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,approved_at=NULL WHERE id=?',
        )
        .run(
          JSON.stringify(legacyCustomerSnapshot),
          createHash('sha256').update(JSON.stringify(legacyCustomerSnapshot)).digest('hex'),
          'reports/legacy-customer-period.pdf',
          'b'.repeat(64),
          4,
          customerReport.id,
        );
      expect(() => v3.periodReportSnapshot(worker, customerReport.id)).toThrow(
        /regenerated from a safe snapshot/,
      );
      expect(() => v3.periodReportPdfMetadata(worker, customerReport.id)).toThrow(
        /regenerated from a safe snapshot/,
      );
    } finally {
      sqlite.close();
    }
  });

  it('delivers outbox events with leases, idempotency and durable failures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-v3-outbox-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const v3 = new V3Repository(sqlite);
    const now = new Date().toISOString();
    sqlite
      .prepare(
        'INSERT INTO public_inquiry(id,kind,payload_json,source_hash,created_at) VALUES(?,?,?,?,?)',
      )
      .run(
        'inquiry-1',
        'contact',
        JSON.stringify({ email: 'inquiry@example.com' }),
        'a'.repeat(64),
        now,
      );
    sqlite
      .prepare(
        'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'event-1',
        'public-inquiry.received',
        'inquiry-1',
        'outbox-key-1',
        JSON.stringify({ inquiryId: 'inquiry-1', kind: 'contact' }),
        now,
        now,
      );
    const received: string[] = [];
    await expect(
      v3.runDueOutbox(10, async (event) => {
        received.push(event.idempotencyKey);
        expect(event.payload).toEqual({ inquiryId: 'inquiry-1', kind: 'contact' });
      }),
    ).resolves.toMatchObject({ processed: 1, failed: 0, permanentlyFailed: 0 });
    expect(received).toEqual(['outbox-key-1']);
    expect(
      sqlite.prepare('SELECT delivered_at FROM outbox_event WHERE id=?').get('event-1'),
    ).toMatchObject({ delivered_at: expect.any(String) });
    expect(
      sqlite.prepare('SELECT delivered_at FROM public_inquiry WHERE id=?').get('inquiry-1'),
    ).toMatchObject({ delivered_at: expect.any(String) });
    await expect(
      v3.runDueOutbox(10, async (event) => received.push(event.idempotencyKey)),
    ).resolves.toMatchObject({ processed: 0, failed: 0 });
    expect(received).toHaveLength(1);

    sqlite
      .prepare(
        'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run('event-2', 'invoice.send.requested', 'invoice-1', 'outbox-key-2', '{}', now, now);
    await expect(
      v3.runDueOutbox(1, () => {
        throw new Error('receiver unavailable');
      }),
    ).resolves.toMatchObject({ processed: 0, failed: 1, permanentlyFailed: 0 });
    expect(
      sqlite
        .prepare('SELECT attempts,last_error,lease_until,failed_at FROM outbox_event WHERE id=?')
        .get('event-2'),
    ).toMatchObject({
      attempts: 1,
      last_error: 'receiver unavailable',
      lease_until: null,
      failed_at: null,
    });
    sqlite.close();
  });
});
