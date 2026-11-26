import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  AssignmentExtrasRepository,
  ConflictError,
  SupplierExpenseRuleRepository,
  V3ValidationError,
  effectiveSupplierExpenseRule,
  supplierExpenseRulesForViewer,
} from '@ja/database';
import {
  approveSettlement,
  markSettlementPaid,
  settlementDetail,
} from '../../apps/portal/src/lib/server/subcontractor-settlement.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

/**
 * Decision D4 (2026-11-26): who carries an external technician's expenses, per project and
 * per person (person > project > the behaviour before: J&A reimburses). Supplier-carried
 * expenses are never owed to the technician by J&A; what J&A paid for him is deducted once
 * from the supplier's settlement. Owner and Finance set it; nobody else.
 */
const fixtures: Array<ReturnType<typeof createB5LifecycleSecurityFixture>> = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

const stamp = '2026-11-01T00:00:00.000Z';
const week = { start: '2026-11-16', end: '2026-11-22' };

function setup() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const finance = stepUpB5Principal(f.sqlite, f.finance, 'd4');
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'd4');
  // b5-worker is a supplier's external technician; b5-outsider stays a J&A worker.
  f.sqlite
    .prepare(
      "INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES('sup-d4','D4 Supplier','active',?,?)",
    )
    .run(stamp, stamp);
  f.sqlite
    .prepare(
      "INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,'sup-d4','external_technician',?,?)",
    )
    .run(f.worker.userId, stamp, stamp);
  f.repository.assignWorker(f.owner, {
    projectId: f.project.id,
    workerId: f.outsider.userId,
    startsOn: '2026-01-01',
  });
  const member = (userId: string) =>
    (
      f.sqlite
        .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=?')
        .get(f.project.id, userId) as { id: string }
    ).id;
  let sequence = 0;
  const expense = (
    workerId: string,
    spentOn: string,
    amountMinor: number,
    whoPaid = 'worker',
    extra: Record<string, unknown> = {},
  ) => {
    sequence += 1;
    const id = `d4-expense-${sequence}`;
    f.sqlite
      .prepare(
        `INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
           approval_state,created_at,updated_at,vendor,description,who_paid,finance_approved_at,reimbursement_state,
           reimbursed_at)
         VALUES(?,?,?,?,'hotel','EUR',?,'non_billable','approved',?,?,'Hotel','Stay',?,?,?,?)`,
      )
      .run(
        id,
        f.project.id,
        workerId,
        spentOn,
        amountMinor,
        stamp,
        stamp,
        whoPaid,
        stamp,
        String(extra.reimbursementState ?? 'pending'),
        (extra.reimbursedAt as string | null) ?? null,
      );
    return id;
  };
  const rules = new SupplierExpenseRuleRepository(f.sqlite);
  const rule = (workerId: string, onDate: string) =>
    effectiveSupplierExpenseRule(f.sqlite, { projectId: f.project.id, workerId, onDate });
  return { f, finance, owner, member, expense, rules, rule };
}

function hours(env: ReturnType<typeof setup>) {
  const { f } = env;
  f.sqlite
    .prepare(
      `INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at)
       VALUES('d4-pay',?,?,'EUR',5000,'hourly','2026-01-01',?,?)`,
    )
    .run(f.worker.userId, f.project.id, stamp, stamp);
  for (const day of ['2026-11-16', '2026-11-17'])
    f.sqlite
      .prepare(
        `INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at)
         VALUES(?,?,?,?,'regular',480,'approved','billable',?,?)`,
      )
      .run(`d4-time-${day}`, f.project.id, f.worker.userId, day, stamp, stamp);
}

describe('D4 supplier expense rule precedence', () => {
  it('keeps the old behaviour when nothing is set and never applies to J&A workers', () => {
    const env = setup();
    expect(env.rule(env.f.worker.userId, '2026-11-17')).toMatchObject({
      carrier: 'ja',
      source: 'default',
      supplierName: 'D4 Supplier',
    });
    env.rules.setProjectRule(env.finance, {
      projectId: env.f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-11-01',
    });
    expect(env.rule(env.f.outsider.userId, '2026-11-17')).toBeNull();
  });

  it('person beats project, project beats default, and each applies from its date', () => {
    const env = setup();
    const { f } = env;
    env.rules.setProjectRule(env.owner, {
      projectId: f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-11-10',
    });
    expect(env.rule(f.worker.userId, '2026-11-09')).toMatchObject({
      carrier: 'ja',
      source: 'default',
    });
    expect(env.rule(f.worker.userId, '2026-11-10')).toMatchObject({
      carrier: 'supplier',
      source: 'project',
      effectiveFrom: '2026-11-10',
    });
    env.rules.setPersonRule(env.finance, {
      projectMemberId: env.member(f.worker.userId),
      carrier: 'ja',
      effectiveFrom: '2026-11-15',
    });
    expect(env.rule(f.worker.userId, '2026-11-14')).toMatchObject({
      source: 'project',
      carrier: 'supplier',
    });
    expect(env.rule(f.worker.userId, '2026-11-15')).toMatchObject({
      source: 'person',
      carrier: 'ja',
    });
    // Back to the project rule (person = not set) from a later day.
    env.rules.setPersonRule(env.finance, {
      projectMemberId: env.member(f.worker.userId),
      carrier: null,
      effectiveFrom: '2026-11-20',
    });
    expect(env.rule(f.worker.userId, '2026-11-21')).toMatchObject({
      source: 'project',
      carrier: 'supplier',
    });
    const view = env.rules.view(env.finance, f.project.id, '2026-11-25');
    expect(view.project).toEqual({ carrier: 'supplier', effectiveFrom: '2026-11-10' });
    expect(view.technicians).toEqual([
      expect.objectContaining({
        workerId: f.worker.userId,
        person: null,
        effective: expect.objectContaining({ source: 'project' }),
      }),
    ]);
    const audit = f.sqlite
      .prepare(
        "SELECT action,actor_id FROM audit_event WHERE action LIKE '%supplier_expense_rule_set' ORDER BY rowid",
      )
      .all();
    expect(audit).toEqual([
      { action: 'project.supplier_expense_rule_set', actor_id: f.owner.userId },
      { action: 'assignment.supplier_expense_rule_set', actor_id: f.finance.userId },
      { action: 'assignment.supplier_expense_rule_set', actor_id: f.finance.userId },
    ]);
  });

  it('saves the person choice from the Extras block and refuses it for J&A workers', () => {
    const env = setup();
    const { f } = env;
    const extras = new AssignmentExtrasRepository(f.sqlite);
    const saved = extras.set(env.finance, {
      projectMemberId: env.member(f.worker.userId),
      expectedVersion: 0,
      supplierExpenses: 'supplier',
    });
    expect(saved.supplierExpenses).toBe('supplier');
    expect(extras.get(env.finance, env.member(f.outsider.userId)).supplierExpenses).toBeNull();
    expect(() =>
      extras.set(env.finance, {
        projectMemberId: env.member(f.outsider.userId),
        expectedVersion: 0,
        supplierExpenses: 'supplier',
      }),
    ).toThrow(/supplier’s technician/u);
  });
});

describe('D4 permissions', () => {
  it('only Owner and Finance may set the rule (server-side)', () => {
    const env = setup();
    const { f } = env;
    for (const principal of [f.manager, f.worker, stepUpB5Principal(f.sqlite, f.manager, 'd4-pm')])
      expect(() =>
        env.rules.setProjectRule(principal, { projectId: f.project.id, carrier: 'supplier' }),
      ).toThrow(AccessDeniedError);
    expect(() =>
      env.rules.setPersonRule(stepUpB5Principal(f.sqlite, f.manager, 'd4-pm2'), {
        projectMemberId: env.member(f.worker.userId),
        carrier: 'supplier',
      }),
    ).toThrow(AccessDeniedError);
    expect(() => env.rules.view(f.manager, f.project.id)).toThrow(AccessDeniedError);
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_expense_rule').get()).toEqual({
      n: 0,
    });
  });

  it('a technician and his coordinator read only who pays, for their own scope', () => {
    const env = setup();
    const { f } = env;
    env.rules.setProjectRule(env.finance, {
      projectId: f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-01-01',
    });
    expect(supplierExpenseRulesForViewer(f.sqlite, f.worker, '2026-11-20')).toEqual([
      expect.objectContaining({
        projectId: f.project.id,
        carrier: 'supplier',
        supplierName: 'D4 Supplier',
      }),
    ]);
    expect(supplierExpenseRulesForViewer(f.sqlite, f.outsider, '2026-11-20')).toEqual([]);
  });
});

describe('D4 reimbursements', () => {
  it('a supplier-carried expense is not owed to the technician; J&A mode still is', () => {
    const env = setup();
    const { f } = env;
    const before = env.expense(f.worker.userId, '2026-11-05', 4000);
    const after = env.expense(f.worker.userId, '2026-11-18', 6000);
    const internal = env.expense(f.outsider.userId, '2026-11-18', 7000);
    env.rules.setProjectRule(env.finance, {
      projectId: f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-11-10',
    });
    const queue = f.v3.listReimbursementQueue(env.finance).map((row) => row.id);
    expect(queue).toEqual(expect.arrayContaining([before, internal]));
    expect(queue).not.toContain(after);
    expect(() =>
      f.v3.recordReimbursement(env.finance, { expenseId: after, reference: 'D4-REF' }),
    ).toThrow(V3ValidationError);
    expect(
      f.v3.recordReimbursement(env.finance, { expenseId: before, reference: 'D4-REF-1' }),
    ).toMatchObject({ state: 'reimbursed' });
    // The pay estimate of the technician (owner review) leaves the supplier-carried expense out.
    const pay = f.v3.ownerWorkerPay(env.owner, f.worker.userId, '2026-11-01', '2026-11-30');
    const reimbursed = pay.currencyBreakdown.reduce(
      (sum: bigint, row: { approvedReimbursementMinor: string }) =>
        sum + BigInt(row.approvedReimbursementMinor),
      0n,
    );
    expect(reimbursed).toBe(4000n);
  });

  it('classification resolves no worker reimbursement for a supplier-carried expense', () => {
    const env = setup();
    const { f } = env;
    f.sqlite
      .prepare(
        `INSERT INTO assignment_expense_policy(id,project_member_id,payer,category,effective_from,effective_to,
           worker_reimbursement,client_recovery,markup_bps,version,reason,created_by_user_id,created_at)
         VALUES('d4-policy',?,'worker',NULL,'2026-01-01',NULL,'at_cost','at_cost',0,1,'D4 policy',?,?)`,
      )
      .run(env.member(f.worker.userId), f.finance.userId, stamp);
    const policies = new AssignmentExpensePolicyRepository(f.sqlite);
    const context = {
      projectId: f.project.id,
      workerId: f.worker.userId,
      spentOn: '2026-11-18',
      category: 'hotel',
      whoPaid: 'worker',
    };
    expect(policies.resolve(context).policy).toMatchObject({ workerReimbursement: 'at_cost' });
    env.rules.setPersonRule(env.finance, {
      projectMemberId: env.member(f.worker.userId),
      carrier: 'supplier',
      effectiveFrom: '2026-11-01',
    });
    // J&A owes nothing; billing the client stays as configured (independent).
    expect(policies.resolve(context).policy).toMatchObject({
      workerReimbursement: 'none',
      clientRecovery: 'at_cost',
    });
  });

  it('refuses a date over expenses already reimbursed to the technician', () => {
    const env = setup();
    const { f } = env;
    env.expense(f.worker.userId, '2026-11-18', 6000, 'worker', {
      reimbursementState: 'reimbursed',
      reimbursedAt: stamp,
    });
    expect(() =>
      env.rules.setProjectRule(env.finance, {
        projectId: f.project.id,
        carrier: 'supplier',
        effectiveFrom: '2026-11-10',
      }),
    ).toThrow(ConflictError);
    env.rules.setProjectRule(env.finance, {
      projectId: f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-11-19',
    });
  });
});

describe('D4 supplier settlement', () => {
  it('deducts what J&A paid for a supplier-carried technician once, and never pays him', () => {
    const env = setup();
    const { f } = env;
    hours(env);
    env.rules.setProjectRule(env.finance, {
      projectId: f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-11-01',
    });
    const hotel = env.expense(f.worker.userId, '2026-11-17', 12000, 'company_card');
    const meal = env.expense(f.worker.userId, '2026-11-17', 3000, 'worker');
    const context = { sqlite: f.sqlite, v3: f.v3, principal: env.finance };
    const payee = 'supplier:sup-d4' as const;
    const draft = settlementDetail(context, { payee, ...week })!;
    expect(draft.expenses?.items.map((item) => [item.expenseId, item.treatment])).toEqual([
      [hotel, 'recharge'],
      [meal, 'supplier_pays_technician'],
    ]);
    expect(draft.expenses?.toDeduct).toEqual([{ currency: 'EUR', minor: '12000' }]);
    approveSettlement(context, { payee, ...week });
    const approved = settlementDetail(context, { payee, ...week })!;
    expect(approved.status).toBe('approved');
    expect(approved.remaining).toEqual([{ currency: 'EUR', minor: '80000' }]);
    expect(approved.expenses?.toDeduct).toEqual([{ currency: 'EUR', minor: '12000' }]);
    markSettlementPaid(context, {
      payee,
      ...week,
      paidOn: '2026-11-24',
      reference: 'CW47 D4',
      requestKey: 'd4-pay-1',
    });
    const events = f.sqlite
      .prepare(
        "SELECT reference,CAST(amount_minor AS TEXT) amount,payee_kind,payee_supplier_id FROM worker_compensation_payment_event WHERE event_type='payment' ORDER BY reference",
      )
      .all();
    expect(events).toEqual([
      {
        reference: 'CW47 D4',
        amount: '68000',
        payee_kind: 'supplier',
        payee_supplier_id: 'sup-d4',
      },
      {
        reference: 'Recharged expenses',
        amount: '12000',
        payee_kind: 'supplier',
        payee_supplier_id: 'sup-d4',
      },
    ]);
    expect(
      f.sqlite
        .prepare(
          'SELECT expense_id,CAST(amount_minor AS TEXT) amount FROM supplier_expense_recharge',
        )
        .all(),
    ).toEqual([{ expense_id: hotel, amount: '12000' }]);
    const paid = settlementDetail(context, { payee, ...week })!;
    expect(paid.status).toBe('paid');
    expect(paid.expenses?.deducted).toEqual([{ currency: 'EUR', minor: '12000' }]);
    expect(paid.expenses?.toDeduct).toEqual([]);
    expect(paid.expenses?.toRecover).toEqual([]);
    // Never twice: paying again records nothing, the expense cannot be linked again.
    markSettlementPaid(context, {
      payee,
      ...week,
      paidOn: '2026-11-25',
      reference: 'again',
      requestKey: 'd4-pay-2',
    });
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM worker_compensation_payment_event').get(),
    ).toEqual({ n: 2 });
    expect(() =>
      f.sqlite
        .prepare(
          `INSERT INTO supplier_expense_recharge(id,expense_id,supplier_id,settlement_id,payment_event_id,amount_minor,currency,created_by,created_at)
           SELECT 'dup',expense_id,supplier_id,settlement_id,payment_event_id,amount_minor,currency,created_by,created_at FROM supplier_expense_recharge`,
        )
        .run(),
    ).toThrow(/UNIQUE/u);
    // The technician is never owed the supplier-carried meal by J&A.
    expect(f.v3.listReimbursementQueue(env.finance).map((row) => row.id)).not.toContain(meal);
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM audit_event WHERE action='supplier.expense_recharge'")
        .get(),
    ).toEqual({ n: 1 });
    // A rule change may not reach back over a deducted expense.
    expect(() =>
      env.rules.setProjectRule(env.finance, {
        projectId: f.project.id,
        carrier: 'ja',
        effectiveFrom: '2026-11-15',
      }),
    ).toThrow(ConflictError);
  });

  it('with J&A reimbursing nothing is deducted and the full settlement is paid', () => {
    const env = setup();
    const { f } = env;
    hours(env);
    const hotel = env.expense(f.worker.userId, '2026-11-17', 12000, 'company_card');
    const context = { sqlite: f.sqlite, v3: f.v3, principal: env.finance };
    const payee = 'supplier:sup-d4' as const;
    approveSettlement(context, { payee, ...week });
    const detail = settlementDetail(context, { payee, ...week })!;
    expect(detail.expenses?.items).toEqual([
      expect.objectContaining({
        expenseId: hotel,
        treatment: 'ja_cost',
        carrier: 'ja',
        source: 'default',
      }),
    ]);
    expect(detail.expenses?.toDeduct).toEqual([]);
    markSettlementPaid(context, {
      payee,
      ...week,
      paidOn: '2026-11-24',
      reference: 'CW47',
      requestKey: 'd4-ja',
    });
    expect(
      f.sqlite
        .prepare(
          'SELECT CAST(SUM(amount_minor) AS TEXT) total FROM worker_compensation_payment_event',
        )
        .get(),
    ).toEqual({ total: '80000' });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_expense_recharge').get()).toEqual({
      n: 0,
    });
  });

  it('a recharge larger than the settlement stays to recover from the supplier', () => {
    const env = setup();
    const { f } = env;
    hours(env);
    env.rules.setProjectRule(env.finance, {
      projectId: f.project.id,
      carrier: 'supplier',
      effectiveFrom: '2026-11-01',
    });
    env.expense(f.worker.userId, '2026-11-17', 90000, 'company_direct');
    const context = { sqlite: f.sqlite, v3: f.v3, principal: env.finance };
    const payee = 'supplier:sup-d4' as const;
    approveSettlement(context, { payee, ...week });
    const detail = settlementDetail(context, { payee, ...week })!;
    expect(detail.expenses?.toDeduct).toEqual([]);
    expect(detail.expenses?.toRecover).toEqual([{ currency: 'EUR', minor: '90000' }]);
    markSettlementPaid(context, {
      payee,
      ...week,
      paidOn: '2026-11-24',
      reference: 'CW47',
      requestKey: 'd4-big',
    });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM supplier_expense_recharge').get()).toEqual({
      n: 0,
    });
  });
});
