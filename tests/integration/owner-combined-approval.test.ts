import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError, ReadinessError } from '@ja/database';
import {
  acceptOwnerFinanceApproval,
  ownerFinanceCatchupCandidates,
} from '../../packages/database/src/domains/approval/owner-finance-approval.ts';
import { runImmediateTransaction } from '../../packages/database/src/core/transaction.ts';
import {
  stepUpB5Principal,
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture));
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return {
    ...value,
    worker: stepUpB5Principal(value.sqlite, value.worker, 'combined'),
    liveOwner: stepUpB5Principal(value.sqlite, value.owner, 'combined'),
    liveFinance: stepUpB5Principal(value.sqlite, value.finance, 'combined'),
  };
}
function time(value: B5LifecycleSecurityFixture, date = '2026-08-20') {
  const row = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate: date,
    category: 'regular',
    minutes: 120,
    summary: `Actual work ${date}`,
  });
  value.repository.submitTime(value.worker, row.id, row.version);
  return row.id;
}
function expense(value: B5LifecycleSecurityFixture) {
  const row = value.repository.createExpense(value.worker, {
    projectId: value.project.id,
    spentOn: '2026-08-20',
    vendor: 'Hotel',
    category: 'hotel',
    description: 'Actual lodging',
    currency: 'EUR',
    amountMinor: 12_345n,
    whoPaid: 'worker',
    receiptRequired: false,
  });
  value.repository.submitExpense(value.worker, row.id, row.version);
  return row.id;
}
function financeState(
  value: B5LifecycleSecurityFixture,
  type: 'time_entry' | 'expense',
  id: string,
) {
  return value.sqlite
    .prepare(
      `SELECT approval_state,finance_approved_by,finance_approved_at,version FROM ${type} WHERE id=?`,
    )
    .get(id);
}
function historicalOwnerApproval(
  value: B5LifecycleSecurityFixture,
  type: 'time_entry' | 'expense',
  id: string,
) {
  // Simulate a genuine pre-policy operational Owner approval, using the current
  // PM path then restoring its stored Owner provenance before any Finance step.
  if (type === 'time_entry') value.repository.operationalApproveTime(value.manager, id, 'approved');
  else value.repository.operationalApproveExpense(value.manager, id, 'approved');
  value.sqlite.prepare(`UPDATE ${type} SET approved_by=? WHERE id=?`).run(value.owner.userId, id);
  value.sqlite
    .prepare(
      `INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,occurred_at)
    SELECT ?,? ,id,'submitted','approved',approved_by,approved_at FROM ${type} WHERE id=?`,
    )
    .run(`historical-${id}`, type === 'time_entry' ? 'time' : 'expense', id);
}

describe('Owner combined operational and Finance approval', () => {
  it('accepts time and unclassified expense in the same action, with separate truthful audits and no fabricated commercial values', () => {
    const value = fixture();
    const timeId = time(value);
    const expenseId = expense(value);
    const commercial = value.sqlite
      .prepare(
        `SELECT amount_minor,currency,client_treatment,billing_treatment,
      project_currency_amount_minor,billing_amount_minor,commercial_classification_state FROM expense WHERE id=?`,
      )
      .get(expenseId);
    value.repository.operationalApproveTime(value.liveOwner, timeId, 'approved');
    value.repository.operationalApproveExpense(value.liveOwner, expenseId, 'approved');
    for (const [type, id] of [
      ['time_entry', timeId],
      ['expense', expenseId],
    ] as const) {
      expect(financeState(value, type, id)).toMatchObject({
        approval_state: 'approved',
        finance_approved_by: value.owner.userId,
        finance_approved_at: expect.any(String),
        version: 4,
      });
      const audit = value.sqlite
        .prepare(
          `SELECT details_json FROM audit_event WHERE entity_id=?
        AND action=?`,
        )
        .get(id, type === 'time_entry' ? 'time.finance_review' : 'expense.finance_approve') as {
        details_json: string;
      };
      expect(JSON.parse(audit.details_json)).toMatchObject({
        combinedOwnerApproval: true,
        origin: 'operational_approval',
        originalApprovedBy: value.owner.userId,
      });
      expect(
        value.sqlite
          .prepare(
            "SELECT count(*) count FROM approval_event WHERE entity_id=? AND to_state='approved'",
          )
          .get(id),
      ).toEqual({ count: 1 });
    }
    expect(
      value.sqlite.prepare('SELECT billability_state FROM time_entry WHERE id=?').get(timeId),
    ).toEqual({ billability_state: 'billable' });
    expect(
      value.sqlite
        .prepare(
          `SELECT amount_minor,currency,client_treatment,billing_treatment,
      project_currency_amount_minor,billing_amount_minor,commercial_classification_state FROM expense WHERE id=?`,
        )
        .get(expenseId),
    ).toEqual(commercial);
  });

  it('retains PM/Finance separation, worker authorization and explicit nonbillable decisions', () => {
    const value = fixture();
    const id = time(value);
    expect(() => value.repository.operationalApproveTime(value.worker, id, 'approved')).toThrow(
      AccessDeniedError,
    );
    value.repository.operationalApproveTime(value.manager, id, 'approved');
    expect(financeState(value, 'time_entry', id)).toMatchObject({ finance_approved_at: null });
    expect(() => value.repository.financeApproveTime(value.manager, id, true)).toThrow(
      AccessDeniedError,
    );
    value.repository.financeApproveTime(value.liveFinance, id, false);
    expect(
      value.repository.catchUpOwnerFinanceApprovals(value.liveOwner, { dryRun: false }).count,
    ).toBe(0);
    expect(
      value.sqlite
        .prepare('SELECT billability_state,finance_approved_by FROM time_entry WHERE id=?')
        .get(id),
    ).toEqual({ billability_state: 'non_billable', finance_approved_by: value.finance.userId });
    const preset = time(value, '2026-08-21');
    value.sqlite
      .prepare("UPDATE time_entry SET billability_state='non_billable' WHERE id=?")
      .run(preset);
    value.repository.operationalApproveTime(value.liveOwner, preset, 'approved');
    expect(
      value.sqlite.prepare('SELECT billability_state FROM time_entry WHERE id=?').get(preset),
    ).toEqual({ billability_state: 'non_billable' });
    expect(financeState(value, 'time_entry', preset)).toMatchObject({
      finance_approved_by: value.owner.userId,
      finance_approved_at: expect.any(String),
    });
  });

  it('requires the current live Owner identity and rolls back operational approval when Finance cannot accept a locked source', () => {
    const value = fixture();
    const id = time(value);
    expect(() => value.repository.operationalApproveTime(value.owner, id, 'approved')).toThrow(
      AccessDeniedError,
    );
    const falseOwner = {
      ...value.manager,
      role: 'owner_admin' as const,
      sessionId: value.liveOwner.sessionId,
    };
    expect(() => value.repository.operationalApproveTime(falseOwner, id, 'approved')).toThrow(
      AccessDeniedError,
    );
    value.sqlite.prepare("UPDATE time_entry SET billing_status='locked' WHERE id=?").run(id);
    expect(() => value.repository.operationalApproveTime(value.liveOwner, id, 'approved')).toThrow(
      ConflictError,
    );
    expect(financeState(value, 'time_entry', id)).toMatchObject({
      approval_state: 'submitted',
      finance_approved_at: null,
      version: 2,
    });
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM approval_event WHERE entity_id=?').get(id),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite
        .prepare(
          "SELECT count(*) count FROM audit_event WHERE entity_id=? AND action IN ('time.approved','time.finance_review')",
        )
        .get(id),
    ).toEqual({ count: 0 });
  });

  it('accepts linked weekly sources and a correction through the same canonical transitions while preserving the original', () => {
    const value = fixture();
    const linked = value.repository.createTimeWithExpense(
      value.worker,
      {
        projectId: value.project.id,
        workDate: '2026-08-17',
        category: 'regular',
        minutes: 120,
        summary: 'Actual linked shift',
      },
      {
        vendor: 'Lunch',
        category: 'meals',
        description: 'Actual lunch',
        currency: 'EUR',
        amountMinor: 1500n,
        whoPaid: 'worker',
        receiptRequired: false,
      },
      'owner-combined-linked-week',
    );
    value.repository.submitTimeWeek(value.worker, value.worker.userId, '2026-08-17', [
      { id: linked.time.id, version: 1 },
    ]);
    value.repository.operationalApproveTime(value.liveOwner, linked.time.id, 'approved');
    value.repository.operationalApproveExpense(value.liveOwner, linked.expense.id, 'approved');
    expect(financeState(value, 'expense', linked.expense.id)).toMatchObject({
      finance_approved_by: value.owner.userId,
    });
    const original = financeState(value, 'time_entry', linked.time.id);
    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId: linked.time.id,
      requestId: 'owner-combined-correction',
      reason: 'Correct actual duration',
      patch: { minutes: 90 },
    });
    value.repository.submitTime(value.worker, correction.correctionId, 1);
    value.repository.operationalApproveTime(value.liveOwner, correction.correctionId, 'approved');
    expect(financeState(value, 'time_entry', correction.correctionId)).toMatchObject({
      finance_approved_by: value.owner.userId,
    });
    expect(financeState(value, 'time_entry', linked.time.id)).toEqual(original);
    const originalExpense = value.sqlite
      .prepare('SELECT * FROM expense WHERE id=?')
      .get(linked.expense.id);
    const expenseCorrection = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'expense',
      originalId: linked.expense.id,
      requestId: 'owner-combined-expense-correction',
      reason: 'Clarify the receipt',
      patch: { description: 'Actual lunch with clarified receipt' },
    });
    value.repository.submitExpense(value.worker, expenseCorrection.correctionId, 1);
    value.repository.operationalApproveExpense(
      value.liveOwner,
      expenseCorrection.correctionId,
      'approved',
    );
    expect(financeState(value, 'expense', expenseCorrection.correctionId)).toMatchObject({
      finance_approved_by: value.owner.userId,
    });
    expect(value.sqlite.prepare('SELECT * FROM expense WHERE id=?').get(linked.expense.id)).toEqual(
      originalExpense,
    );
  });

  it('repairs only genuine unlocked Owner approvals, defaults to dry-run, attributes historical Owner and is idempotent', () => {
    const value = fixture();
    const eligible = time(value);
    const expenseId = expense(value);
    historicalOwnerApproval(value, 'time_entry', eligible);
    historicalOwnerApproval(value, 'expense', expenseId);
    const locked = time(value, '2026-08-21');
    historicalOwnerApproval(value, 'time_entry', locked);
    value.sqlite.prepare("UPDATE time_entry SET billing_status='locked' WHERE id=?").run(locked);
    const corrected = time(value, '2026-08-22');
    historicalOwnerApproval(value, 'time_entry', corrected);
    value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId: corrected,
      requestId: 'catchup-pending-correction',
      reason: 'Correct the duration',
      patch: { minutes: 90 },
    });
    const invoiced = time(value, '2026-08-23');
    historicalOwnerApproval(value, 'time_entry', invoiced);
    const invoicedExpense = expense(value);
    historicalOwnerApproval(value, 'expense', invoicedExpense);
    const timestamp = new Date().toISOString();
    const snapshot = '{"historical":"immutable-issued-truth"}';
    value.sqlite
      .prepare(
        `INSERT INTO invoice(id,project_id,invoice_number,stream_type,state,currency,
      issued_at,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'owner-catchup-issued',
        value.project.id,
        'OWNER-CATCHUP-1',
        'labor',
        'issued',
        'EUR',
        timestamp,
        snapshot,
        timestamp,
        timestamp,
      );
    value.sqlite
      .prepare("UPDATE time_entry SET invoice_id=?,billing_status='invoiced' WHERE id=?")
      .run('owner-catchup-issued', invoiced);
    value.sqlite
      .prepare("UPDATE expense SET invoice_id=?,billing_state='invoiced' WHERE id=?")
      .run('owner-catchup-issued', invoicedExpense);
    const issuedTimeBefore = financeState(value, 'time_entry', invoiced);
    const issuedExpenseBefore = financeState(value, 'expense', invoicedExpense);
    expect(() => value.repository.catchUpOwnerFinanceApprovals(value.manager)).toThrow(
      AccessDeniedError,
    );
    expect(value.repository.catchUpOwnerFinanceApprovals(value.liveOwner)).toMatchObject({
      dryRun: true,
      count: 2,
    });
    expect(financeState(value, 'time_entry', eligible)).toMatchObject({
      finance_approved_at: null,
    });
    expect(
      value.repository.catchUpOwnerFinanceApprovals(value.liveOwner, { dryRun: false }).count,
    ).toBe(2);
    expect(
      value.repository.catchUpOwnerFinanceApprovals(value.liveOwner, { dryRun: false }).count,
    ).toBe(0);
    expect(financeState(value, 'time_entry', locked)).toMatchObject({ finance_approved_at: null });
    expect(financeState(value, 'time_entry', corrected)).toMatchObject({
      finance_approved_at: null,
    });
    expect(financeState(value, 'time_entry', invoiced)).toEqual(issuedTimeBefore);
    expect(financeState(value, 'expense', invoicedExpense)).toEqual(issuedExpenseBefore);
    expect(
      value.sqlite
        .prepare('SELECT snapshot_json FROM invoice WHERE id=?')
        .get('owner-catchup-issued'),
    ).toEqual({ snapshot_json: snapshot });
    expect(
      value.sqlite
        .prepare(
          "SELECT count(*) count FROM audit_event WHERE action IN ('time.finance_review','expense.finance_approve')",
        )
        .get(),
    ).toEqual({ count: 2 });
    const audit = value.sqlite
      .prepare(
        "SELECT actor_id,details_json FROM audit_event WHERE entity_id=? AND action='time.finance_review'",
      )
      .get(eligible) as { actor_id: string; details_json: string };
    expect(audit.actor_id).toBe(value.owner.userId);
    expect(JSON.parse(audit.details_json)).toMatchObject({
      origin: 'catchup',
      initiatingOwnerId: value.owner.userId,
    });
    const policyTime = time(value, '2026-08-24');
    historicalOwnerApproval(value, 'time_entry', policyTime);
    const policyCorrelation = 'owner-policy-reconciliation-test';
    runImmediateTransaction(value.sqlite, 'policy-test', () => {
      const candidates = ownerFinanceCatchupCandidates(value.sqlite, value.project.id);
      expect(candidates.map((row) => row.id)).toEqual([policyTime]);
      for (const candidate of candidates) {
        expect(
          acceptOwnerFinanceApproval(
            value.sqlite,
            {
              userId: candidate.approvedBy,
              correlationId: policyCorrelation,
            },
            candidate.type,
            candidate.id,
            'policy_reconciliation',
            'deployment-policy:test-commit',
          ),
        ).toBe(true);
      }
    });
    const policyAudit = value.sqlite
      .prepare(
        "SELECT actor_id,correlation_id,details_json FROM audit_event WHERE entity_id=? AND action='time.finance_review'",
      )
      .get(policyTime) as {
      actor_id: string;
      correlation_id: string;
      details_json: string;
    };
    expect(policyAudit).toMatchObject({
      actor_id: value.owner.userId,
      correlation_id: policyCorrelation,
    });
    expect(JSON.parse(policyAudit.details_json)).toMatchObject({
      policyReconciliation: true,
      origin: 'policy_reconciliation',
      initiatingOwnerId: 'deployment-policy:test-commit',
    });
    expect(ownerFinanceCatchupCandidates(value.sqlite)).toEqual([]);
  });

  it('keeps an autoaccepted legacy unclassified charge out of invoice sources and period locks', () => {
    const value = fixture();
    const id = expense(value);
    // Legacy intake may retain a customer charge while classification is pending.
    value.sqlite
      .prepare(
        "UPDATE expense SET billing_treatment='reimbursable_at_cost',client_treatment='reimbursable' WHERE id=?",
      )
      .run(id);
    value.repository.operationalApproveExpense(value.liveOwner, id, 'approved');
    const economics = value.v3.projectFinance(
      value.liveFinance,
      value.project.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(economics.approvedUnbilledSources).not.toContainEqual(
      expect.objectContaining({ sourceId: id }),
    );
    expect(economics.expenseEconomics).toContainEqual(
      expect.objectContaining({
        id,
        financeApprovalState: 'approved',
        financeProjectionState: 'incomplete',
        revenueMinor: '0',
      }),
    );
    const entity = value.repository.createLegalEntity(value.liveOwner, {
      code: 'OC',
      legalName: 'Owner combined entity',
      currency: 'EUR',
      billingAddress: 'Test street',
      companyIdentifiers: 'OC-1',
    });
    const tax = value.repository.createTaxProfile(value.liveFinance, {
      name: 'Zero',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Zero', basisPoints: 0 }],
    });
    const rule = value.repository.createBillingRule(value.liveFinance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'expense',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    const pendingTime = time(value);
    value.repository.operationalApproveTime(value.manager, pendingTime, 'approved');
    const laborRule = value.repository.createBillingRule(value.liveFinance, {
      projectId: value.project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    expect(
      value.repository.billingReadiness(value.liveFinance, laborRule.id, '2026-08-01', '2026-08-31')
        .reasons,
    ).toEqual(
      expect.arrayContaining([
        { code: 'pending_time_finance_review', sourceId: pendingTime },
        { code: 'missing_client_rate', sourceId: pendingTime },
      ]),
    );
    expect(
      value.repository.billingReadiness(value.liveFinance, rule.id, '2026-08-01', '2026-08-31')
        .reasons,
    ).toContainEqual({ code: 'missing_expense_classification', sourceId: id });
    const ownerTime = time(value, '2026-08-21');
    value.repository.operationalApproveTime(value.liveOwner, ownerTime, 'approved');
    expect(
      value.repository.billingReadiness(value.liveFinance, laborRule.id, '2026-08-01', '2026-08-31')
        .reasons,
    ).toEqual(
      expect.arrayContaining([
        { code: 'missing_internal_cost', sourceId: ownerTime },
        { code: 'missing_compensation_rule', sourceId: ownerTime },
      ]),
    );
    expect(financeState(value, 'time_entry', ownerTime)).toMatchObject({
      finance_approved_by: value.owner.userId,
    });
    expect(
      value.v3.billingReadiness(value.liveFinance, rule.id, '2026-08-01', '2026-08-31').reasons,
    ).toContainEqual({ code: 'missing_expense_classification', sourceId: id });
    expect(() =>
      value.repository.createInvoiceDraft(value.liveFinance, rule.id, '2026-08-01', '2026-08-31'),
    ).toThrow(ReadinessError);
    expect(
      value.v3.closeBillingPeriod(value.liveFinance, rule.id, '2026-08-01', '2026-08-31'),
    ).toMatchObject({ closed: false });
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM invoice_source WHERE source_id=?').get(id),
    ).toEqual({ count: 0 });
    expect(value.sqlite.prepare('SELECT billing_state FROM expense WHERE id=?').get(id)).toEqual({
      billing_state: 'unlocked',
    });
    // Already-classified migration history retains its original compatible
    // projection semantics and never needs a new commercial decision.
    value.sqlite
      .prepare("UPDATE expense SET commercial_classification_state='legacy_classified' WHERE id=?")
      .run(id);
    expect(
      value.repository.billingReadiness(value.liveFinance, rule.id, '2026-08-01', '2026-08-31')
        .reasons,
    ).not.toContainEqual({ code: 'missing_expense_classification', sourceId: id });
    expect(
      value.v3.projectFinance(value.liveFinance, value.project.id, '2026-08-01', '2026-08-31')
        .approvedUnbilledSources,
    ).toContainEqual(expect.objectContaining({ sourceId: id, amountMinor: '12345' }));
    const invoice = value.repository.createInvoiceDraft(
      value.liveFinance,
      rule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(
      value.sqlite
        .prepare(
          "SELECT source_id FROM invoice_source WHERE invoice_id=? AND source_type='expense'",
        )
        .all(invoice.id),
    ).toEqual([{ source_id: id }]);
  });
});
