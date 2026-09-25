import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

describe('worker pay with source-currency reimbursements', () => {
  it('keeps EUR compensation and a USD receipt separate before and after payment', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const now = '2026-09-01T10:00:00.000Z';
    value.sqlite
      .prepare(
        "INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,version) VALUES('fx-pay-rule',?,?, 'EUR',6000,'hourly','2026-01-01',1)",
      )
      .run(value.worker.userId, value.project.id);
    value.sqlite
      .prepare(
        "INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at) VALUES('fx-pay-time',?,?,'2026-09-01','regular',60,'approved','billable',?,?)",
      )
      .run(value.project.id, value.worker.userId, now, now);
    value.sqlite
      .prepare(
        "INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,project_currency_amount_minor,reimbursement_amount_minor,client_treatment,approval_state,who_paid,reimbursement_state,billing_treatment,created_at,updated_at) VALUES('fx-pay-expense',?,?,'2026-09-01','travel','USD',12345,11111,11111,'reimbursable','approved','worker','pending','reimbursable_at_cost',?,?)",
      )
      .run(value.project.id, value.worker.userId, now, now);

    const before = value.v3.workerPay(value.worker, '2026-09-01', '2026-09-01');
    expect(before).toMatchObject({
      currency: 'MULTI',
      estimatedApprovedMinor: '0',
      approvedReimbursementMinor: '0',
      currencyBreakdown: [
        {
          currency: 'EUR',
          estimatedApprovedMinor: '6000',
          approvedReimbursementMinor: '0',
        },
        {
          currency: 'USD',
          estimatedApprovedMinor: '0',
          approvedReimbursementMinor: '12345',
        },
      ],
    });
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'fx-pay');
    value.v3.recordReimbursement(finance, {
      expenseId: 'fx-pay-expense',
      reference: 'FX bank transfer',
    });
    expect(value.v3.workerPay(value.worker, '2026-09-01', '2026-09-01').currencyBreakdown).toEqual(
      before.currencyBreakdown,
    );
    expect(value.v3.workerPay(value.worker, '2026-09-02', '2026-09-02')).toMatchObject({
      currency: 'USD',
      estimatedApprovedMinor: '0',
      approvedReimbursementMinor: '0',
    });
  });
});
