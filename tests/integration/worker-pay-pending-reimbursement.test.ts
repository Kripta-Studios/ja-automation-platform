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

// Round 2 (verify NEW-2): a sent-back entry that the worker corrected and resubmitted is
// superseded (rejected) and its correction is submitted. My Pay counts the correction as
// waiting instead of dropping both; a correction of an APPROVED entry still waits behind it.
describe('My Pay counts resubmitted corrections of sent-back hours (round 2)', () => {
  const link = (f: B5LifecycleSecurityFixture, id: string, original: string, correction: string) =>
    f.sqlite
      .prepare(
        `INSERT INTO record_correction_link(id,tenant_id,record_type,original_id,correction_id,request_id,request_payload_sha256,actor_user_id,reason,created_at,correlation_id)
         VALUES(?,(SELECT tenant_id FROM deployment_identity WHERE singleton=1),'time_entry',?,?,?,?,?,'Corrected after review',?,?)`,
      )
      .run(id, original, correction, `req-${id}`, 'a'.repeat(64), f.worker.userId, stamp, `corr-${id}`);
  const time = (f: B5LifecycleSecurityFixture, id: string, date: string, minutes: number, state: string) =>
    f.sqlite
      .prepare(
        `INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at)
         VALUES(?,?,?,?,'regular',?,?,'billable',?,?)`,
      )
      .run(id, f.project.id, f.worker.userId, date, minutes, state, stamp, stamp);

  it('shows the resubmitted correction as waiting and keeps an approved original until its correction is approved', () => {
    const f = fixture();
    time(f, 't-superseded', '2026-11-18', 540, 'needs_changes');
    time(f, 't-resubmitted', '2026-11-18', 480, 'draft');
    link(f, 'l1', 't-superseded', 't-resubmitted');
    // A pending correction of the approved Nov 2 entry: the approved 8 h still count.
    time(f, 't-approved-fix', '2026-11-02', 420, 'draft');
    link(f, 'l2', 't-approved', 't-approved-fix');
    // Sending the corrections supersedes the sent-back original (migration 0083 trigger).
    f.sqlite
      .prepare("UPDATE time_entry SET approval_state='submitted' WHERE id IN ('t-resubmitted','t-approved-fix')")
      .run();
    expect(
      f.sqlite.prepare("SELECT approval_state FROM time_entry WHERE id='t-superseded'").get(),
    ).toMatchObject({ approval_state: 'rejected' });
    const pay = f.v3.workerPay(f.worker, '2026-11-01', '2026-11-30');
    expect(pay.pendingMinutes).toBe(540 + 480);
    expect(pay.approvedMinutes).toBe(480);
  });
});

describe('My Pay shows an approved, not yet classified refund as still to be paid (round 2)', () => {
  it('lists it in the statement expenses and the outstanding refunds at the receipt amount', async () => {
    const { workerPayOutstanding } = await import(
      '../../apps/portal/src/lib/server/worker-pay-outstanding.ts'
    );
    const f = fixture();
    const expenses = f.repository.listWorkerStatementExpenses(f.worker, '2026-11-01', '2026-11-30');
    expect(expenses.find((row) => row.id === 'e-approved')).toMatchObject({
      reimbursementAmountMinor: '2000',
      approvalState: 'approved',
    });
    expect(workerPayOutstanding([], expenses)).toEqual([
      { currency: 'EUR', settlementMinor: '0', reimbursementMinor: '2000' },
    ]);
  });
});
