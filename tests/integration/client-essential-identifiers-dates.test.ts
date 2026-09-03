import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.unstubAllEnvs();
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

/**
 * WP-03 contract seam.  These commands are deliberately resolved at runtime
 * while the server contract is being introduced: a missing command produces a
 * focused RED failure instead of making the whole test file untypeable.
 */
function command<TResult>(target: object, name: string, ...args: readonly unknown[]): TResult {
  const candidate = (target as Record<string, unknown>)[name];
  if (typeof candidate !== 'function')
    throw new Error(`Client Essential command is not implemented: ${name}`);
  return (candidate as (...values: readonly unknown[]) => TResult).apply(target, args);
}

type InvoicePlanningInput = Readonly<{
  invoiceId: string;
  plannedIssueOn: string | null;
  expectedCollectionOn: string | null;
  expectedVersion: number;
}>;

type ExpensePlanningInput = Readonly<{
  expenseId: string;
  expectedReimbursementOn: string | null;
  expectedRecoveryOn: string | null;
  expectedVersion: number;
}>;

type SettlementPlanningInput = Readonly<{
  settlementId: string;
  expectedPaymentOn: string | null;
}>;

function seedInvoice(value: B5LifecycleSecurityFixture): string {
  const id = 'wp03-planning-invoice';
  const timestamp = '2026-08-24T10:00:00.000Z';
  value.sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,
         subtotal_minor,tax_minor,total_minor,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, value.project.id, null, 'labor', 'draft', 'EUR', 0, 0, 0, timestamp, timestamp, 1);
  return id;
}

function seedSettlement(value: B5LifecycleSecurityFixture): string {
  const id = 'wp03-planning-settlement';
  const timestamp = '2026-08-24T10:00:00.000Z';
  value.sqlite
    .prepare(
      `INSERT INTO compensation_rule(
         id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,version
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp03-compensation-rule',
      value.worker.userId,
      value.project.id,
      'EUR',
      6000,
      'hourly',
      '2026-01-01',
      1,
    );
  value.sqlite
    .prepare(
      `INSERT INTO compensation_settlement(
         id,worker_id,project_id,compensation_rule_id,period_start,period_end,
         source_basis,source_amount_minor,percentage_bps,amount_minor,currency,
         state,settled_at,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      value.worker.userId,
      value.project.id,
      'wp03-compensation-rule',
      '2026-08-01',
      '2026-08-31',
      'approved_labor',
      48_000,
      null,
      48_000,
      'EUR',
      'approved',
      null,
      timestamp,
      timestamp,
    );
  return id;
}

function seedExpense(value: B5LifecycleSecurityFixture): string {
  const id = 'wp03-planning-expense';
  const timestamp = '2026-08-24T10:00:00.000Z';
  value.sqlite
    .prepare(
      `INSERT INTO expense(
         id,project_id,worker_id,spent_on,category,currency,amount_minor,
         client_treatment,approval_state,created_at,updated_at,version,
         vendor,description,who_paid,receipt_required,reimbursement_state,
         billing_treatment,billing_state,commercial_classification_state
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      value.project.id,
      value.worker.userId,
      '2026-08-20',
      'travel',
      'EUR',
      12_345,
      'non_billable',
      'approved',
      timestamp,
      timestamp,
      1,
      'WP-03 Hotel',
      'Worker-paid travel fixture',
      'worker',
      0,
      'pending',
      'internal_non_billable',
      'unlocked',
      'unclassified',
    );
  return id;
}

describe('Client Essential CORE-02/09/11 identifiers and planned-versus-actual dates', () => {
  it('persists optional client codes and project cost centres through create, update and role-safe overview reads', () => {
    const value = fixture();
    const client = value.repository.createClient(value.owner, {
      clientCode: '  JNA-CLIENT-42  ',
      legalName: 'Identifier Client SL',
      displayName: 'Identifier Client',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: 'billing-identifiers@example.test',
      billingAddress: 'Identifier Client, Calle 42',
    });

    expect(client.clientCode).toBe('JNA-CLIENT-42');
    expect(value.repository.listClients(value.owner)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: client.id, client_code: 'JNA-CLIENT-42' }),
      ]),
    );

    const clientBeforeUpdate = value.sqlite
      .prepare('SELECT version FROM client WHERE id=?')
      .get(client.id) as { version: number };
    value.repository.updateClient(
      value.owner,
      client.id,
      { clientCode: 'JNA-CLIENT-UPDATED' },
      clientBeforeUpdate.version,
    );
    expect(
      value.sqlite.prepare('SELECT client_code FROM client WHERE id=?').get(client.id),
    ).toEqual({ client_code: 'JNA-CLIENT-UPDATED' });

    expect(() =>
      value.repository.createClient(value.owner, {
        clientCode: 'JNA-CLIENT-UPDATED',
        legalName: 'Duplicate Identifier Client SL',
        displayName: 'Duplicate Identifier Client',
        currency: 'EUR',
        timezone: 'Europe/Madrid',
        billingEmail: 'duplicate-identifiers@example.test',
        billingAddress: 'Duplicate Identifier Client, Calle 43',
      }),
    ).toThrow(ConflictError);

    const project = value.repository.createProject(value.owner, {
      clientId: client.id,
      costCenterCode: '  CC-ESSENTIAL-001  ',
      name: 'Identifier project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-08-01',
    });
    expect(
      value.sqlite.prepare('SELECT cost_center_code FROM project WHERE id=?').get(project.id),
    ).toEqual({ cost_center_code: 'CC-ESSENTIAL-001' });

    const projectBeforeUpdate = value.sqlite
      .prepare('SELECT version FROM project WHERE id=?')
      .get(project.id) as { version: number };
    value.repository.updateProject(value.owner, {
      projectId: project.id,
      version: projectBeforeUpdate.version,
      costCenterCode: 'CC-ESSENTIAL-UPDATED',
    });
    value.repository.assignWorker(value.owner, {
      projectId: project.id,
      workerId: 'b5-manager',
      startsOn: '2026-08-01',
      canReview: true,
    });
    const projectManager = value.repository.principalFor('b5-manager');
    expect(value.repository.projectOverview(value.owner, project.id).project).toMatchObject({
      cost_center_code: 'CC-ESSENTIAL-UPDATED',
    });
    expect(value.repository.projectOverview(projectManager, project.id).project).toMatchObject({
      cost_center_code: 'CC-ESSENTIAL-UPDATED',
    });
  });

  it('keeps invoice planned issue and expected collection dates separate from actual issue and payment dates', () => {
    const value = fixture();
    const invoiceId = seedInvoice(value);
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'invoice-planning');

    const result = command<Record<string, unknown>>(
      value.repository,
      'setInvoicePlanningDates',
      finance,
      {
        invoiceId,
        plannedIssueOn: '2026-09-10',
        expectedCollectionOn: '2026-10-10',
        expectedVersion: 1,
      } satisfies InvoicePlanningInput,
    );
    expect(result).toMatchObject({
      invoiceId,
      plannedIssueOn: '2026-09-10',
      expectedCollectionOn: '2026-10-10',
    });

    expect(
      value.sqlite
        .prepare(
          'SELECT planned_issue_on,expected_collection_on,issued_at,due_at FROM invoice WHERE id=?',
        )
        .get(invoiceId),
    ).toEqual({
      planned_issue_on: '2026-09-10',
      expected_collection_on: '2026-10-10',
      issued_at: null,
      due_at: null,
    });

    expect(value.repository.listInvoices(value.finance)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: invoiceId,
          planned_issue_on: '2026-09-10',
          expected_collection_on: '2026-10-10',
          issued_at: null,
        }),
      ]),
    );

    expect(() =>
      command(value.repository, 'setInvoicePlanningDates', value.manager, {
        invoiceId,
        plannedIssueOn: '2026-09-11',
        expectedCollectionOn: '2026-10-11',
        expectedVersion: 2,
      } satisfies InvoicePlanningInput),
    ).toThrow(AccessDeniedError);
  });

  it('keeps expected worker payment dates independent from compensation settlement actuals and scopes the projection', () => {
    const value = fixture();
    const settlementId = seedSettlement(value);
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'settlement-planning');

    const result = command<Record<string, unknown>>(
      value.v3,
      'setCompensationSettlementExpectedPaymentOn',
      finance,
      {
        settlementId,
        expectedPaymentOn: '2026-09-05',
      } satisfies SettlementPlanningInput,
    );
    expect(result).toMatchObject({ settlementId, expectedPaymentOn: '2026-09-05' });
    expect(
      value.sqlite
        .prepare('SELECT expected_payment_on,settled_at FROM compensation_settlement WHERE id=?')
        .get(settlementId),
    ).toEqual({ expected_payment_on: '2026-09-05', settled_at: null });

    expect(value.v3.listCompensationSettlements(value.worker)).toEqual([
      expect.objectContaining({
        id: settlementId,
        expectedPaymentOn: '2026-09-05',
        settledAt: null,
      }),
    ]);
    expect(value.v3.listCompensationSettlements(value.finance)).toEqual([
      expect.objectContaining({
        id: settlementId,
        expectedPaymentOn: '2026-09-05',
        settledAt: null,
      }),
    ]);
    expect(value.v3.listCompensationSettlements(value.manager)).toEqual([]);
  });

  it('keeps worker reimbursement planning separate from Finance recovery planning and actual reimbursement', () => {
    const value = fixture();
    const expenseId = seedExpense(value);
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'expense-planning');

    const result = command<Record<string, unknown>>(
      value.repository,
      'setExpensePlanningDates',
      finance,
      {
        expenseId,
        expectedReimbursementOn: '2026-09-05',
        expectedRecoveryOn: '2026-09-20',
        expectedVersion: 1,
      } satisfies ExpensePlanningInput,
    );
    expect(result).toMatchObject({
      expenseId,
      expectedReimbursementOn: '2026-09-05',
      expectedRecoveryOn: '2026-09-20',
    });
    expect(
      value.sqlite
        .prepare(
          'SELECT expected_reimbursement_on,expected_recovery_on,reimbursed_at,billing_state FROM expense WHERE id=?',
        )
        .get(expenseId),
    ).toEqual({
      expected_reimbursement_on: '2026-09-05',
      expected_recovery_on: '2026-09-20',
      reimbursed_at: null,
      billing_state: 'unlocked',
    });

    const workerRow = value.repository
      .listExpensesForScope(value.worker)
      .find((row) => row.id === expenseId);
    expect(workerRow).toEqual(
      expect.objectContaining({
        id: expenseId,
        expected_reimbursement_on: '2026-09-05',
      }),
    );
    expect(workerRow).not.toHaveProperty('expected_recovery_on');

    const managerRow = value.repository
      .listExpensesForScope(value.manager)
      .find((row) => row.id === expenseId);
    expect(managerRow).toBeDefined();
    expect(managerRow).not.toHaveProperty('expected_reimbursement_on');
    expect(managerRow).not.toHaveProperty('expected_recovery_on');

    const financeRow = value.repository
      .listExpensesForScope(value.finance)
      .find((row) => row.id === expenseId);
    expect(financeRow).toEqual(
      expect.objectContaining({
        id: expenseId,
        expected_reimbursement_on: '2026-09-05',
        expected_recovery_on: '2026-09-20',
        reimbursed_at: null,
      }),
    );
  });

  it('does not allow a PM to configure Finance-only expense recovery or invoice planning dates', () => {
    const value = fixture();
    const invoiceId = seedInvoice(value);
    const expenseId = seedExpense(value);

    expect(() =>
      command(value.repository, 'setInvoicePlanningDates', value.manager, {
        invoiceId,
        plannedIssueOn: '2026-09-10',
        expectedCollectionOn: '2026-10-10',
        expectedVersion: 1,
      } satisfies InvoicePlanningInput),
    ).toThrow(AccessDeniedError);
    expect(() =>
      command(value.repository, 'setExpensePlanningDates', value.manager, {
        expenseId,
        expectedReimbursementOn: '2026-09-05',
        expectedRecoveryOn: '2026-09-20',
        expectedVersion: 1,
      } satisfies ExpensePlanningInput),
    ).toThrow(AccessDeniedError);
  });

  it('requires a fresh production step-up for Finance planning mutations', () => {
    const value = fixture();
    const invoiceId = seedInvoice(value);
    const expenseId = seedExpense(value);
    const settlementId = seedSettlement(value);
    vi.stubEnv('NODE_ENV', 'production');
    const auditBefore = (
      value.sqlite.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }
    ).count;

    expect(() =>
      command(value.repository, 'setInvoicePlanningDates', value.finance, {
        invoiceId,
        plannedIssueOn: '2026-09-10',
        expectedCollectionOn: '2026-10-10',
        expectedVersion: 1,
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      command(value.repository, 'setExpensePlanningDates', value.finance, {
        expenseId,
        expectedReimbursementOn: '2026-09-05',
        expectedRecoveryOn: '2026-09-20',
        expectedVersion: 1,
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      command(value.v3, 'setCompensationSettlementExpectedPaymentOn', value.finance, {
        settlementId,
        expectedPaymentOn: '2026-09-05',
      }),
    ).toThrow(/step-up/u);
    expect(() =>
      value.v3.refreshPeriodReports(value.finance, {
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow(/step-up/u);
    expect(
      value.sqlite
        .prepare('SELECT planned_issue_on,version FROM invoice WHERE id=?')
        .get(invoiceId),
    ).toEqual({ planned_issue_on: null, version: 1 });
    expect(
      value.sqlite
        .prepare('SELECT expected_reimbursement_on,version FROM expense WHERE id=?')
        .get(expenseId),
    ).toEqual({ expected_reimbursement_on: null, version: 1 });
    expect(
      value.sqlite
        .prepare('SELECT expected_payment_on FROM compensation_settlement WHERE id=?')
        .get(settlementId),
    ).toEqual({ expected_payment_on: null });
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM period_report').get()).toEqual({
      count: 0,
    });
    expect(
      (value.sqlite.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number })
        .count,
    ).toBe(auditBefore);

    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'planning-step-up-session',
        'planning-step-up-token',
        value.finance.userId,
        new Date(Date.now() + 3_600_000).toISOString(),
        timestamp,
        timestamp,
        timestamp,
      );
    const steppedFinance = { ...value.finance, sessionId: 'planning-step-up-session' };
    expect(
      command(value.repository, 'setInvoicePlanningDates', steppedFinance, {
        invoiceId,
        plannedIssueOn: '2026-09-10',
        expectedCollectionOn: '2026-10-10',
        expectedVersion: 1,
      }),
    ).toMatchObject({ invoiceId, plannedIssueOn: '2026-09-10' });
    expect(
      value.v3.refreshPeriodReports(steppedFinance, {
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toEqual([]);
  });
});
