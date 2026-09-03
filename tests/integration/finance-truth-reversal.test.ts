import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PortalRepository,
  V3ConflictError,
  V3Repository,
  V3ValidationError,
  createDatabase,
} from '@ja/database';
import type { Principal, Role } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const restoreDeploymentIdentities: Array<() => void> = [];
const databases: Array<ReturnType<typeof createDatabase>['sqlite']> = [];

beforeEach(() => restoreDeploymentIdentities.push(installB5TestDeploymentIdentity()));

afterEach(() => {
  vi.useRealTimers();
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // The assertion failure is more useful than a duplicate-close error.
    }
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: Role,
): { id: string } {
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

function stepUpFinance(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  principal: Principal,
): Principal {
  const now = new Date().toISOString();
  const sessionId = `finance-step-up-${principal.userId}`;
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

function establishCanonicalAuthority(
  repository: PortalRepository,
  v3: V3Repository,
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  owner: Principal,
  finance: Principal,
  projectId: string,
): void {
  const legacy = repository.createLegalEntity(owner, {
    code: 'TRUTH-CANONICAL',
    legalName: 'Finance Truth Canonical Entity',
    currency: 'USD',
    billingAddress: 'Canonical finance test address',
    companyIdentifiers: 'TRUTH-CANONICAL-TAX',
  });
  const revision = v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: legacy.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Finance Truth Canonical Entity S.L.',
    taxIdentifier: 'ESTRUTH123456',
    registrationIdentifier: 'TRUTH-REG-001',
    addressLine1: 'Canonical finance test address',
    locality: 'Madrid',
    region: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
    baseCurrency: 'USD',
    timezone: 'UTC',
    reason: 'Bind finance truth fixtures to canonical legal-entity authority',
    idempotencyKey: 'finance-truth:canonical-entity:revision',
  });
  v3.assignCanonicalLegalEntityToProject(finance, {
    projectId,
    legalEntityRevisionId: revision.revisionId,
    effectiveFrom: '2026-01-01',
    reason: 'Bind finance truth project to canonical legal-entity authority',
    idempotencyKey: 'finance-truth:canonical-entity:assignment',
  });
  expect(
    sqlite
      .prepare('SELECT 1 FROM project_legal_entity_assignment WHERE project_id=?')
      .get(projectId),
  ).toBeTruthy();
  return legacy;
}

function setup(options: { canonicalAuthority?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ja-finance-truth-'));
  directories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  databases.push(sqlite);
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  seedUser(sqlite, 'owner', 'owner_admin');
  seedUser(sqlite, 'finance', 'finance_admin');
  seedUser(sqlite, 'manager', 'project_manager');
  seedUser(sqlite, 'worker', 'worker');
  const owner = stepUpFinance(sqlite, {
    userId: 'owner',
    role: 'owner_admin',
    projectIds: new Set(),
  });
  const financeBase: Principal = {
    userId: 'finance',
    role: 'finance_admin',
    projectIds: new Set(),
  };
  const finance = stepUpFinance(sqlite, financeBase);
  const client = repository.createClient(owner, {
    legalName: 'Finance Truth Client',
    displayName: 'Finance Truth Client',
    currency: 'USD',
    timezone: 'UTC',
    billingAddress: '100 Finance Truth Way',
    billingEmail: 'billing-truth@example.com',
    paymentTermsDays: 30,
  });
  const project = repository.createProject(owner, {
    clientId: client.id,
    name: 'Finance Truth Project',
    timezone: 'UTC',
    currency: 'USD',
    billingModel: 'tm',
    expectedMinutesPerDay: 600,
    laborBudgetMinutes: 600,
  });
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
  v3.createClientLaborRate(finance, {
    projectId: project.id,
    workerId: 'worker',
    currency: 'USD',
    hourlyRateMinor: 10_000n,
    effectiveFrom: '2026-08-01',
  });
  v3.createInternalCostRule(finance, {
    projectId: project.id,
    workerId: 'worker',
    currency: 'USD',
    hourlyRateMinor: 4_000n,
    effectiveFrom: '2026-08-01',
  });
  v3.createCompensationRule(finance, {
    projectId: project.id,
    workerId: 'worker',
    currency: 'USD',
    ruleType: 'Hourly',
    rateMinor: 3_000n,
    rateBasis: 'hourly',
    effectiveFrom: '2026-08-01',
  });
  const legalEntity =
    options.canonicalAuthority === false
      ? repository.createLegalEntity(owner, {
          code: 'TRUTH-HISTORICAL',
          legalName: 'Finance Truth Historical Entity',
          currency: 'USD',
          billingAddress: 'Historical finance test address',
          companyIdentifiers: 'TRUTH-HISTORICAL-TAX',
        })
      : establishCanonicalAuthority(repository, v3, sqlite, owner, finance, project.id);
  return {
    sqlite,
    repository,
    v3,
    owner,
    finance,
    manager,
    worker,
    project,
    workerAssignment,
    legalEntity,
  };
}

describe('Client Essential finance truth and payment reversals', () => {
  it('attributes historical project costs through one unambiguous billing rule without a canonical assignment', () => {
    const { sqlite, repository, v3, finance, manager, worker, project, legalEntity } = setup({
      canonicalAuthority: false,
    });
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Historical approved source',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);

    const expense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-04',
      vendor: 'Historical hotel',
      category: 'hotel',
      description: 'Historical approved expense',
      currency: 'USD',
      amountMinor: 2_000n,
      whoPaid: 'company',
      receiptRequired: false,
    });
    sqlite
      .prepare(
        `UPDATE expense
            SET client_treatment='non_billable',billing_treatment='internal_non_billable',
                approval_state='approved',project_currency_amount_minor=amount_minor,
                reimbursement_state='not_applicable',updated_at=?
          WHERE id=?`,
      )
      .run(new Date().toISOString(), expense.id);

    const tax = repository.createTaxProfile(finance, {
      name: 'Historical zero tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Zero tax', basisPoints: 0 }],
    });
    repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: legalEntity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const pack = v3.createAccountingPack(finance, '2026-08-01', '2026-08-31');
    const snapshot = pack.snapshot as {
      sourceItems: Array<{ itemKind: string; sourceId: string; legalEntityId: string | null }>;
      workerCostSegments: Array<{ projectId: string; legalEntityId: string | null }>;
    };
    expect(snapshot.sourceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKind: 'time',
          sourceId: time.id,
          legalEntityId: legalEntity.id,
        }),
        expect.objectContaining({
          itemKind: 'expense',
          sourceId: expense.id,
          legalEntityId: legalEntity.id,
        }),
      ]),
    );
    expect(snapshot.workerCostSegments).toEqual([
      expect.objectContaining({ projectId: project.id, legalEntityId: legalEntity.id }),
    ]);
    expect(pack.reconciliation).toMatchObject({
      canonicalRevision: { status: 'current', missingCurrencies: [] },
    });
    expect(sqlite.prepare('SELECT COUNT(*) count FROM accounting_pack_revision').get()).toEqual({
      count: 1,
    });
  });

  it('keeps pending work outside actuals and reconciles approved-unbilled WIP to source rows', () => {
    const { repository, v3, finance, manager, worker, project } = setup();
    const approved = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Approved source-backed hour',
    });
    repository.submitTime(worker, approved.id, approved.version);
    repository.operationalApproveTime(manager, approved.id, 'approved');
    repository.financeApproveTime(finance, approved.id, true);
    const pending = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-04',
      category: 'overtime',
      minutes: 30,
      summary: 'Pending overtime',
    });

    const view = v3.projectFinance(finance, project.id);
    expect(view).toMatchObject({
      actualMinutes: 60,
      approvedMinutes: 60,
      unapprovedMinutes: 30,
      overtimeMinutes: 0,
      hoursConsumedBps: '1000',
      approvedUnbilledWipMinor: '10000',
      approvedUnbilledWipStatus: 'source_backed',
      approvedUnbilledWipReconciles: true,
      unapprovedWipMinor: '5000',
    });
    expect(view.approvedUnbilledSources).toEqual([
      expect.objectContaining({
        sourceType: 'time',
        sourceId: approved.id,
        amountMinor: '10000',
      }),
    ]);
    expect(view.approvedUnbilledSources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: pending.id })]),
    );

    const expense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-05',
      vendor: 'Finance-pending hotel',
      category: 'hotel',
      description: 'Operationally approved before finance review',
      currency: 'USD',
      amountMinor: 2_000n,
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
      reason: 'Finance classified the approved operational hotel for recovery at cost',
      idempotencyKey: 'finance-truth:expense-classification:v1',
    });
    repository.submitExpense(worker, expense.id, classifiedExpense.version);
    repository.operationalApproveExpense(manager, expense.id, 'approved');
    const beforeFinanceApproval = v3.projectFinance(finance, project.id);
    expect(beforeFinanceApproval).toMatchObject({
      expenseRevenueMinor: '0',
      approvedCostMinor: '6000',
      approvedUnbilledWipMinor: '10000',
      unapprovedWipMinor: '7000',
      approvedUnbilledWipReconciles: true,
    });
    expect(beforeFinanceApproval.approvedUnbilledSources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: expense.id })]),
    );
    expect(beforeFinanceApproval.expenseEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expense.id,
          financeApprovalState: 'pending',
          revenueMinor: '0',
          pendingFinanceRevenueMinor: '2000',
          costMinor: '2000',
        }),
      ]),
    );
    repository.financeApproveExpense(finance, expense.id);
    const afterFinanceApproval = v3.projectFinance(finance, project.id);
    expect(afterFinanceApproval).toMatchObject({
      expenseRevenueMinor: '2000',
      approvedCostMinor: '6000',
      approvedUnbilledWipMinor: '12000',
      unapprovedWipMinor: '5000',
      approvedUnbilledWipReconciles: true,
    });
    expect(afterFinanceApproval.approvedUnbilledSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'expense',
          sourceId: expense.id,
          amountMinor: '2000',
        }),
      ]),
    );
  });

  it('appends exact idempotent reversals without mutating payments and excludes void AR', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-08-20T12:00:00.000Z');
    const {
      sqlite,
      repository,
      v3,
      owner,
      finance,
      manager,
      worker,
      project,
      workerAssignment,
      legalEntity,
    } = setup();
    const collectedRule = v3.createCompensationRule(finance, {
      projectId: project.id,
      workerId: 'worker',
      currency: 'USD',
      ruleType: 'PercentageOfEligibleClientLabor',
      percentageBps: 5_000,
      percentageBasis: 'COLLECTED_ELIGIBLE_LABOR',
      settlementTrigger: 'ON_CLIENT_PAYMENT',
      effectiveFrom: '2026-08-01',
    });
    v3.createAssignmentRateOverride(finance, {
      projectMemberId: workerAssignment.id,
      compensationRuleId: collectedRule.id,
      effectiveFrom: '2026-08-01',
      priority: 100,
    });
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Invoice source hour',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);
    repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: legalEntity.id,
      prefix: 'JA-TRUTH',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const tax = repository.createTaxProfile(finance, {
      name: 'No tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Zero tax', basisPoints: 0 }],
    });
    const rule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: legalEntity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    sqlite.prepare('UPDATE project SET technical_reporting_required=1 WHERE id=?').run(project.id);
    const outsidePeriodReport = repository.createTechnicalReport(owner, {
      projectId: project.id,
      reportDate: '2026-07-31',
      systemName: 'PLC outside billing period',
      changeSummary: 'Created during August but operationally belongs to July',
      safetyRelated: false,
    });
    repository.submitReport(
      owner,
      'technical',
      outsidePeriodReport.id,
      outsidePeriodReport.version,
    );
    repository.reviewReport(manager, 'technical', outsidePeriodReport.id, 'approved');
    expect(v3.billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31').reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_approved_technical_report' }),
      ]),
    );
    const inPeriodReport = repository.createTechnicalReport(worker, {
      projectId: project.id,
      reportDate: '2026-08-03',
      systemName: 'PLC inside billing period',
      changeSummary: 'Native report date qualifies for the August period',
      safetyRelated: false,
    });
    repository.submitReport(worker, 'technical', inPeriodReport.id, inPeriodReport.version);
    repository.reviewReport(manager, 'technical', inPeriodReport.id, 'approved');
    expect(
      v3
        .billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31')
        .reasons.some((reason) => reason.code === 'missing_approved_technical_report'),
    ).toBe(false);
    expect(v3.billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31')).toMatchObject({
      state: 'ready',
      reasons: [],
    });
    const invoice = repository.createInvoiceDraft(finance, rule.id, '2026-08-01', '2026-08-31');
    repository.approveInvoiceDraft(finance, invoice.id);
    repository.issueInvoice(finance, invoice.id);
    const rejectedTime = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-04',
      category: 'regular',
      minutes: 15,
      summary: 'Rejected non-billable source',
    });
    repository.submitTime(worker, rejectedTime.id, rejectedTime.version);
    repository.operationalApproveTime(manager, rejectedTime.id, 'rejected', 'Duplicate entry');
    const approvedDaily = repository.createDailyReport(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      summary: 'Approved daily report for the real labor source',
      tasksCompleted: 'Completed the invoiced work',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    repository.submitReport(worker, 'daily', approvedDaily.id, approvedDaily.version);
    repository.reviewReport(manager, 'daily', approvedDaily.id, 'approved');
    sqlite.prepare('UPDATE project SET daily_report_required=1 WHERE id=?').run(project.id);
    expect(
      v3
        .billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31')
        .reasons.some((reason) => reason.sourceId === rejectedTime.id),
    ).toBe(false);
    expect(
      repository
        .billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31')
        .reasons.some((reason) => reason.sourceId === rejectedTime.id),
    ).toBe(false);
    expect(
      v3
        .billingReadiness(finance, rule.id, '2026-08-01', '2026-08-31')
        .reasons.some((reason) => reason.sourceId === `daily-report:${project.id}:2026-08-04`),
    ).toBe(false);
    const expenseRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: legalEntity.id,
      streamType: 'expense',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const rejectedExpense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-06',
      vendor: 'Rejected vendor charge',
      category: 'hotel',
      description: 'Rejected expense must not block billing readiness',
      currency: 'USD',
      amountMinor: 100n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      receiptRequired: false,
    });
    repository.submitExpense(worker, rejectedExpense.id, rejectedExpense.version);
    repository.operationalApproveExpense(
      manager,
      rejectedExpense.id,
      'rejected',
      'Duplicate expense',
    );
    const voidExpense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-07',
      vendor: 'Voided vendor charge',
      category: 'hotel',
      description: 'Voided expense must not block billing readiness',
      currency: 'USD',
      amountMinor: 100n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      receiptRequired: false,
    });
    repository.submitExpense(worker, voidExpense.id, voidExpense.version);
    repository.deleteExpense(owner, voidExpense.id, voidExpense.version + 1);
    const expenseReadiness = v3.billingReadiness(
      finance,
      expenseRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      expenseReadiness.reasons.some(
        (reason) => reason.sourceId === rejectedExpense.id || reason.sourceId === voidExpense.id,
      ),
    ).toBe(false);
    expect(
      repository
        .billingReadiness(finance, expenseRule.id, '2026-08-01', '2026-08-31')
        .reasons.some(
          (reason) => reason.sourceId === rejectedExpense.id || reason.sourceId === voidExpense.id,
        ),
    ).toBe(false);
    const total = BigInt(
      (
        sqlite.prepare('SELECT total_minor FROM invoice WHERE id=?').get(invoice.id) as {
          total_minor: number;
        }
      ).total_minor,
    );
    const invoiceVersionBeforeCollections = (
      sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(invoice.id) as {
        version: number;
      }
    ).version;
    const issuedAt = (
      sqlite.prepare('SELECT issued_at FROM invoice WHERE id=?').get(invoice.id) as {
        issued_at: string;
      }
    ).issued_at;
    const firstPaymentAt = issuedAt;
    const secondPaymentAt = issuedAt;
    const partialReversalAt = issuedAt;
    const overReversalAt = issuedAt;
    const first = v3.recordPayment(finance, {
      invoiceId: invoice.id,
      amountMinor: 7_000n,
      currency: 'USD',
      receivedAt: firstPaymentAt,
      reference: 'BANK-1',
      idempotencyKey: 'finance-truth-payment-1',
    });
    expect(
      v3.recordPayment(finance, {
        invoiceId: invoice.id,
        amountMinor: 7_000n,
        currency: 'USD',
        receivedAt: firstPaymentAt,
        reference: 'BANK-1',
        idempotencyKey: 'finance-truth-payment-1',
      }),
    ).toMatchObject({ id: first.id, created: false });
    expect(() =>
      v3.recordPayment(finance, {
        invoiceId: invoice.id,
        amountMinor: 7_000n,
        currency: 'USD',
        receivedAt: secondPaymentAt,
        reference: 'BANK-1-CHANGED',
        idempotencyKey: 'finance-truth-payment-1',
      }),
    ).toThrow(V3ConflictError);
    expect(() =>
      v3.recordPayment(finance, {
        invoiceId: invoice.id,
        amountMinor: 1n,
        currency: 'USD',
        receivedAt: '2026-08-20T02:00:00+02:00',
        idempotencyKey: 'finance-truth-offset-payment',
      }),
    ).toThrow(V3ValidationError);
    const second = v3.recordPayment(finance, {
      invoiceId: invoice.id,
      amountMinor: total - 7_000n,
      currency: 'USD',
      receivedAt: secondPaymentAt,
      reference: 'BANK-2',
      idempotencyKey: 'finance-truth-payment-2',
    });
    expect(() =>
      v3.voidInvoice(
        owner,
        invoice.id,
        'A paid invoice cannot be voided before collections are reversed',
        'finance-truth-paid-void-blocked',
      ),
    ).toThrow(/collections must be fully reversed/i);
    expect(
      sqlite
        .prepare('SELECT COUNT(*) count FROM invoice_event WHERE idempotency_key=?')
        .get('finance-truth-paid-void-blocked'),
    ).toEqual({ count: 0 });
    const paymentBefore = sqlite.prepare('SELECT * FROM payment WHERE id=?').get(second.id);
    expect(() =>
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: 1n,
        effectiveAt: new Date(Date.parse(issuedAt) - 1).toISOString(),
        reasonCode: 'entry_correction',
        reason: 'A reversal cannot predate its original payment',
        idempotencyKey: 'finance-truth-backdated-reversal',
      }),
    ).toThrow(V3ValidationError);
    expect(() =>
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: 1n,
        effectiveAt: '2026-08-22T02:00:00+02:00',
        reasonCode: 'bank_return',
        reason: 'Offset timestamps are not canonical',
        idempotencyKey: 'finance-truth-offset-reversal',
      }),
    ).toThrow(V3ValidationError);
    const partial = v3.reversePayment(finance, {
      paymentId: second.id,
      amountMinor: 100n,
      effectiveAt: partialReversalAt,
      reasonCode: 'bank_return',
      reason: 'Bank returned a partial amount',
      idempotencyKey: 'finance-truth-reversal-1',
    });
    expect(partial).toMatchObject({
      created: true,
      invoiceId: invoice.id,
      reversedMinor: '100',
      netCollectedMinor: (total - 100n).toString(),
      outstandingMinor: '100',
      state: 'partially_paid',
    });
    expect(
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: 100n,
        effectiveAt: partialReversalAt,
        reasonCode: 'bank_return',
        reason: 'Bank returned a partial amount',
        idempotencyKey: 'finance-truth-reversal-1',
      }),
    ).toMatchObject({ id: partial.id, created: false });
    expect(() =>
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: 101n,
        effectiveAt: partialReversalAt,
        reasonCode: 'bank_return',
        reason: 'Conflicting command replay',
        idempotencyKey: 'finance-truth-reversal-1',
      }),
    ).toThrow(V3ConflictError);
    expect(() =>
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: total,
        effectiveAt: overReversalAt,
        reasonCode: 'bank_return',
        reason: 'Attempt to reverse too much',
        idempotencyKey: 'finance-truth-over-reversal',
      }),
    ).toThrow(V3ValidationError);
    expect(sqlite.prepare('SELECT * FROM payment WHERE id=?').get(second.id)).toEqual(
      paymentBefore,
    );
    expect(() =>
      sqlite.prepare('UPDATE payment SET reference=? WHERE id=?').run('mutated', second.id),
    ).toThrow(/payment immutable/);
    expect(() =>
      sqlite
        .prepare('UPDATE invoice_payment_reversal_event SET reason_text=? WHERE id=?')
        .run('mutated', partial.id),
    ).toThrow(/payment reversal immutable/);

    expect(
      v3.settleCompensation(finance, {
        workerId: 'worker',
        projectId: project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toEqual([
      expect.objectContaining({
        ruleId: collectedRule.id,
        sourceAmountMinor: (total - 100n).toString(),
        amountMinor: ((total - 100n) / 2n).toString(),
      }),
    ]);

    const ledger = v3.masterLedger(finance, { projectId: project.id });
    expect(ledger[0]).toMatchObject({
      grossPaymentsMinor: total.toString(),
      paymentReversalsMinor: '100',
      netCollectedMinor: (total - 100n).toString(),
      collectedMinor: (total - 100n).toString(),
      outstandingMinor: '100',
      paymentStatus: 'partially_paid',
      directCostMinor: '4000',
      directCostComplete: true,
      directCostMissingSourceIds: [],
    });
    expect(ledger[0]?.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: second.id,
          reversedMinor: '100',
          netAmountMinor: (total - 7_100n).toString(),
        }),
      ]),
    );

    const internalRate = sqlite
      .prepare('SELECT id FROM internal_cost_rule WHERE project_id=? AND worker_id=? LIMIT 1')
      .get(project.id, 'worker') as { id: string };
    sqlite
      .prepare('UPDATE internal_cost_rule SET hourly_rate_minor=? WHERE id=?')
      .run(99_999, internalRate.id);
    expect(v3.masterLedger(finance, { projectId: project.id, end: '2026-08-31' })[0]).toMatchObject(
      {
        directCostMinor: '4000',
        directCostComplete: true,
        directCostMissingSourceIds: [],
      },
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-09-03T00:00:00.000Z');
    sqlite
      .prepare('UPDATE session SET step_up_at=?,expires_at=? WHERE id IN (?,?)')
      .run(
        '2026-09-03T00:00:00.000Z',
        '2026-09-04T00:00:00.000Z',
        finance.sessionId,
        owner.sessionId,
      );
    const postPeriodPayment = v3.recordPayment(finance, {
      invoiceId: invoice.id,
      amountMinor: 100n,
      currency: 'USD',
      receivedAt: '2026-09-01T00:00:00.000Z',
      reference: 'BANK-POST-PERIOD',
      idempotencyKey: 'finance-truth-post-period-payment',
    });
    expect(
      v3.reversePayment(finance, {
        paymentId: postPeriodPayment.id,
        amountMinor: 100n,
        effectiveAt: '2026-09-02T00:00:00.000Z',
        reasonCode: 'bank_return',
        reason: 'Reverse post-period payment',
        idempotencyKey: 'finance-truth-reversal-4',
      }),
    ).toMatchObject({
      state: 'partially_paid',
      netCollectedMinor: (total - 100n).toString(),
      outstandingMinor: '100',
    });

    const pack = v3.createAccountingPack(finance, '2026-08-01', '2026-08-31');
    const packSnapshot = pack.snapshot as {
      collections: Array<Record<string, unknown>>;
      totals: Record<string, unknown>;
    };
    expect(packSnapshot.collections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionType: 'payment_reversal',
          reversalId: partial.id,
          amountCollectedInMonthMinor: '-100',
          totalCollectedToDateMinor: (total - 100n).toString(),
        }),
      ]),
    );
    expect(packSnapshot.totals.collectedMinor).toBe((total - 100n).toString());
    expect(pack.reconciliation).toMatchObject({
      paymentCount: 3,
      collectedInMonthByCurrency: { USD: (total - 100n).toString() },
      checks: { payments: true },
    });
    expect(
      sqlite
        .prepare(
          "SELECT j.state job_state,EXISTS(SELECT 1 FROM audit_event a WHERE a.entity_type='accounting_pack_run' AND a.entity_id=?) audited FROM job j WHERE j.kind='accounting_pack_artifact_render' AND j.idempotency_key=?",
        )
        .get(pack.id, `accounting-pack:${pack.id}`),
    ).toEqual({ job_state: 'queued', audited: 1 });

    expect(
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: total - 7_100n,
        effectiveAt: issuedAt,
        reasonCode: 'bank_return',
        reason: 'Reverse the remaining second payment amount',
        idempotencyKey: 'finance-truth-reversal-2',
      }),
    ).toMatchObject({
      state: 'partially_paid',
      netCollectedMinor: '7000',
      outstandingMinor: (total - 7_000n).toString(),
    });
    expect(
      v3.reversePayment(finance, {
        paymentId: first.id,
        amountMinor: 7_000n,
        effectiveAt: issuedAt,
        reasonCode: 'bank_return',
        reason: 'Reverse the complete first payment',
        idempotencyKey: 'finance-truth-reversal-3',
      }),
    ).toMatchObject({
      state: 'issued',
      netCollectedMinor: '0',
      outstandingMinor: total.toString(),
    });
    expect(v3.masterLedger(finance, { projectId: project.id, end: '2026-08-31' })[0]).toMatchObject(
      {
        // The September payment/reversal pair is booked but not effective in the
        // current August as-of view.
        grossPaymentsMinor: total.toString(),
        paymentReversalsMinor: total.toString(),
        netCollectedMinor: '0',
        collectedMinor: '0',
        outstandingMinor: total.toString(),
        paymentStatus: 'unpaid',
      },
    );
    expect(v3.masterLedger(finance, { projectId: project.id, end: '2026-09-30' })[0]).toMatchObject(
      {
        grossPaymentsMinor: (total + 100n).toString(),
        paymentReversalsMinor: (total + 100n).toString(),
        netCollectedMinor: '0',
        paymentStatus: 'unpaid',
      },
    );

    v3.voidInvoice(owner, invoice.id, 'Customer invoice cancelled', 'finance-truth-void');
    expect(
      (
        sqlite.prepare('SELECT version FROM invoice WHERE id=?').get(invoice.id) as {
          version: number;
        }
      ).version,
    ).toBe(invoiceVersionBeforeCollections + 8);
    expect(() =>
      v3.voidInvoice(owner, invoice.id, 'Customer invoice cancelled', 'finance-truth-void'),
    ).not.toThrow();
    expect(() =>
      v3.voidInvoice(owner, invoice.id, 'Different reason', 'finance-truth-void'),
    ).toThrow(V3ConflictError);
    expect(() =>
      v3.voidInvoice(owner, invoice.id, 'Customer invoice cancelled', 'finance-truth-void-2'),
    ).toThrow(V3ValidationError);
    expect(
      v3.reversePayment(finance, {
        paymentId: second.id,
        amountMinor: 100n,
        effectiveAt: partialReversalAt,
        reasonCode: 'bank_return',
        reason: 'Bank returned a partial amount',
        idempotencyKey: 'finance-truth-reversal-1',
      }),
    ).toMatchObject({ id: partial.id, created: false, state: 'void' });
    expect(v3.masterLedger(finance, { projectId: project.id })[0]).toMatchObject({
      billingStatus: 'void',
      collectedMinor: '0',
      outstandingMinor: '0',
      paymentStatus: 'void',
      grossPaymentsMinor: (total + 100n).toString(),
      paymentReversalsMinor: (total + 100n).toString(),
    });
    const projectFinance = v3.projectFinance(finance, project.id);
    expect(projectFinance).toMatchObject({
      invoicedMinor: '0',
      paidMinor: '0',
      receivableMinor: '0',
    });
    expect(
      (
        sqlite
          .prepare('SELECT count(*) count FROM finance_command WHERE operation=?')
          .get('payment.reverse') as { count: number }
      ).count,
    ).toBe(4);
    expect(
      (
        sqlite
          .prepare(
            "SELECT count(*) count FROM finance_change_event WHERE entity_kind='invoice_payment_reversal'",
          )
          .get() as { count: number }
      ).count,
    ).toBe(4);
    expect(first.created).toBe(true);
  });

  it('accumulates reimbursement and Accounting Pack money beyond JS safe integer exactly', () => {
    const { repository, v3, finance, manager, worker, project } = setup();
    for (const [index, amountMinor] of [5_000_000_000_000_000n, 5_000_000_000_000_001n].entries()) {
      const expense = repository.createExpense(worker, {
        projectId: project.id,
        spentOn: `2026-08-0${index + 6}`,
        vendor: `Exact vendor ${index + 1}`,
        category: 'materials',
        description: 'Large exact reimbursement test value',
        currency: 'USD',
        amountMinor,
        whoPaid: 'worker',
        clientTreatment: 'non_billable',
        billingTreatment: 'internal_non_billable',
        receiptRequired: false,
      });
      repository.submitExpense(worker, expense.id, expense.version);
      repository.operationalApproveExpense(manager, expense.id, 'approved');
      repository.financeApproveExpense(finance, expense.id);
    }
    const expected = '10000000000000001';
    expect(v3.workerPay(worker, '2026-08-01', '2026-08-31')).toMatchObject({
      approvedReimbursementMinor: expected,
    });
    const pack = v3.createAccountingPack(finance, '2026-08-01', '2026-08-31');
    expect((pack.snapshot as { totals: { directCostMinor: string } }).totals.directCostMinor).toBe(
      expected,
    );
  });

  it('cuts authoritative finance sources into the canonical Accounting Pack revision', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-08-20T12:00:00.000Z');
    const { sqlite, repository, v3, finance, manager, worker, project, legalEntity } = setup();
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate: '2026-08-03',
      category: 'regular',
      minutes: 60,
      summary: 'Authoritative Accounting Pack time source',
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);
    const expense = repository.createExpense(worker, {
      projectId: project.id,
      spentOn: '2026-08-04',
      vendor: 'Authoritative Accounting Pack expense source',
      category: 'hotel',
      description: 'Direct project cost source',
      currency: 'USD',
      amountMinor: 2_000n,
      whoPaid: 'worker',
      clientTreatment: 'non_billable',
      billingTreatment: 'internal_non_billable',
      receiptRequired: false,
    });
    repository.submitExpense(worker, expense.id, expense.version);
    repository.operationalApproveExpense(manager, expense.id, 'approved');
    repository.financeApproveExpense(finance, expense.id);
    repository.createInvoiceNumberPolicy(repository.principalFor('owner'), {
      legalEntityId: legalEntity.id,
      prefix: 'PACK',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const tax = repository.createTaxProfile(finance, {
      name: 'Accounting Pack source tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const rule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: legalEntity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-08-01',
    });
    const invoice = repository.createInvoiceDraft(finance, rule.id, '2026-08-01', '2026-08-31');
    repository.approveInvoiceDraft(finance, invoice.id);
    repository.issueInvoice(finance, invoice.id);
    const issuedAt = (
      sqlite.prepare('SELECT issued_at FROM invoice WHERE id=?').get(invoice.id) as {
        issued_at: string;
      }
    ).issued_at;
    const paymentAt = issuedAt;
    const reversalAt = issuedAt;
    const payment = v3.recordPayment(finance, {
      invoiceId: invoice.id,
      amountMinor: 10_000n,
      currency: 'USD',
      receivedAt: paymentAt,
      reference: 'PACK-SOURCE-PAYMENT',
      idempotencyKey: 'finance-truth-pack-payment',
    });
    const reversal = v3.reversePayment(finance, {
      paymentId: payment.id,
      amountMinor: 1_000n,
      effectiveAt: reversalAt,
      reasonCode: 'bank_return',
      reason: 'Accounting Pack source reversal',
      idempotencyKey: 'finance-truth-pack-reversal',
    });
    const pack = v3.createAccountingPack(finance, '2026-08-01', '2026-08-31');
    expect(pack.reconciliation).toMatchObject({ reconciles: true });
    const revision = sqlite
      .prepare(
        `SELECT revision_id,source_cut_id FROM accounting_pack_revision_snapshot
         WHERE period_start=? AND period_end=? ORDER BY created_at DESC LIMIT 1`,
      )
      .get('2026-08-01', '2026-08-31') as
      | { revision_id: string; source_cut_id: string }
      | undefined;
    expect(revision).toBeTruthy();
    const sourceItems = sqlite
      .prepare(
        `SELECT item_kind,item_id,item_version,amount_minor,currency
         FROM finance_source_cut_item WHERE cut_id=? ORDER BY item_kind,item_id`,
      )
      .all(revision!.source_cut_id) as Array<{
      item_kind: string;
      item_id: string;
      item_version: number;
      amount_minor: number | null;
      currency: string;
    }>;
    expect(sourceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_kind: 'invoice', item_id: invoice.id }),
        expect.objectContaining({ item_kind: 'time', item_id: time.id }),
        expect.objectContaining({ item_kind: 'expense', item_id: expense.id }),
        expect.objectContaining({ item_kind: 'payment', item_id: payment.id }),
        expect.objectContaining({ item_kind: 'payment_reversal', item_id: reversal.id }),
        expect.objectContaining({ item_kind: 'compensation' }),
        expect.objectContaining({ item_kind: 'direct_cost' }),
        expect.objectContaining({ item_kind: 'commercial_manifest' }),
      ]),
    );
  });
});
