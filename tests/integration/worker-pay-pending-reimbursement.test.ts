import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

// T13 (audit 2026-11-22): approved worker-paid expenses reach the reimbursement queue even
// before their client-billing classification, and My Pay "waiting for approval" is only
// what the worker sent (submitted hours and expenses), never drafts or sent-back hours.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

const stamp = '2026-11-01T00:00:00.000Z';
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  f.sqlite
    .prepare(
      `INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at)
       VALUES('pay-rule',?,?,'EUR',5000,'hourly','2026-01-01',?,?)`,
    )
    .run(f.worker.userId, f.project.id, stamp, stamp);
  const time = f.sqlite.prepare(
    `INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at)
     VALUES(?,?,?,?,'regular',?,?,'billable',?,?)`,
  );
  time.run(
    't-approved',
    f.project.id,
    f.worker.userId,
    '2026-11-02',
    480,
    'approved',
    stamp,
    stamp,
  );
  time.run('t-sent', f.project.id, f.worker.userId, '2026-11-03', 540, 'submitted', stamp, stamp);
  time.run('t-draft', f.project.id, f.worker.userId, '2026-11-04', 150, 'draft', stamp, stamp);
  time.run(
    't-back',
    f.project.id,
    f.worker.userId,
    '2026-11-05',
    450,
    'needs_changes',
    stamp,
    stamp,
  );
  const expense = f.sqlite.prepare(
    `INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,approval_state,who_paid,reimbursement_state,billing_treatment,expense_policy_required,commercial_classification_state,created_at,updated_at)
     VALUES(?,?,?,?,'meals','EUR',?,'reimbursable',?,'worker','pending','reimbursable_at_cost',1,'unclassified',?,?)`,
  );
  expense.run(
    'e-sent',
    f.project.id,
    f.worker.userId,
    '2026-11-03',
    3550,
    'submitted',
    stamp,
    stamp,
  );
  expense.run(
    'e-approved',
    f.project.id,
    f.worker.userId,
    '2026-11-02',
    2000,
    'approved',
    stamp,
    stamp,
  );
  return f;
}

describe('worker reimbursements and My Pay (T13)', () => {
  it('lists an approved but unclassified worker-paid expense as needing classification', () => {
    const f = fixture();
    const finance = stepUpB5Principal(f.sqlite, f.finance, 'reimburse');
    const queue = f.v3.listReimbursementQueue(finance, f.project.id);
    expect(queue.map((row) => row.id)).toEqual(['e-approved']);
    expect(queue[0]).toMatchObject({
      needsClassification: true,
      reimbursementAmountMinor: '2000',
      currency: 'EUR',
    });
  });

  it('counts only sent hours and expenses as waiting and shows sent-back hours apart', () => {
    const f = fixture();
    const pay = f.v3.workerPay(f.worker, '2026-11-01', '2026-11-30');
    expect(pay.pendingMinutes).toBe(540);
    expect(pay.returnedMinutes).toBe(450);
    expect(pay.estimatedPendingMinor).toBe('45000');
    expect(pay.pendingReimbursementMinor).toBe('3550');
    expect(pay.approvedReimbursementMinor).toBe('2000');
  });
});
