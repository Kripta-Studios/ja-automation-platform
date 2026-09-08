import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function runAlert(
  value: B5LifecycleSecurityFixture,
  key: string,
  alertType: 'missing_time' | 'business_notifications' | 'overdue',
  workDate?: string,
): void {
  value.v3.enqueueJob(
    'alert_dispatch',
    key,
    workDate === undefined ? { alertType } : { alertType, workDate },
  );
  const result = value.v3.runDueJobs(1);
  expect(result).toEqual(expect.objectContaining({ processed: 1, failed: 0 }));
}

type NotificationRow = Readonly<{
  user_id: string;
  kind: string;
  subject_id: string;
}>;

function notifications(value: B5LifecycleSecurityFixture, userId?: string): NotificationRow[] {
  return (
    userId === undefined
      ? value.sqlite
          .prepare(
            'SELECT user_id,kind,subject_id FROM notification ORDER BY user_id,kind,subject_id',
          )
          .all()
      : value.sqlite
          .prepare(
            'SELECT user_id,kind,subject_id FROM notification WHERE user_id=? ORDER BY kind,subject_id',
          )
          .all(userId)
  ) as NotificationRow[];
}

function insertSchedule(
  value: B5LifecycleSecurityFixture,
  id: string,
  effectiveFrom: string,
  sundayMinutes: number,
): void {
  value.sqlite
    .prepare(
      `INSERT INTO schedule(
         id,project_id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,
         thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      value.project.id,
      'Europe/Madrid',
      480,
      480,
      480,
      480,
      480,
      480,
      sundayMinutes,
      effectiveFrom,
    );
}

describe('ASTRA effective missing-time notifications', () => {
  it('uses the effective schedule and valid assignment mask, then deduplicates retries', () => {
    const value = fixture();
    value.sqlite
      .prepare(
        "UPDATE project_member SET workday_mask='1111111' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    insertSchedule(value, 'schedule-sunday-on', '2026-08-09', 480);

    runAlert(value, 'missing-time-sunday-on', 'missing_time', '2026-08-09');
    expect(notifications(value, 'b5-worker')).toEqual([
      expect.objectContaining({
        kind: 'missing_time',
        subject_id: `missing-time:${value.project.id}:b5-worker:2026-08-09`,
      }),
    ]);

    // The effective schedule for the following Sunday turns the expected day
    // off, so the older configured Sunday schedule must not be reused.
    insertSchedule(value, 'schedule-sunday-off', '2026-08-16', 0);
    runAlert(value, 'missing-time-sunday-off', 'missing_time', '2026-08-16');
    expect(
      notifications(value, 'b5-worker').filter((row) => row.subject_id.endsWith(':2026-08-16')),
    ).toHaveLength(0);

    // An invalid mask is treated as unknown expected work, which avoids
    // inventing a reminder from malformed assignment data.
    value.sqlite
      .prepare(
        "UPDATE project_member SET workday_mask='not-a-mask' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    runAlert(value, 'missing-time-invalid-mask', 'missing_time', '2026-08-17');
    expect(
      notifications(value, 'b5-worker').filter((row) => row.subject_id.endsWith(':2026-08-17')),
    ).toHaveLength(0);

    // Re-running the exact source day uses the notification unique key and
    // creates neither a second notification nor a second email request.
    value.sqlite
      .prepare(
        "UPDATE project_member SET workday_mask='1111111' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    runAlert(value, 'missing-time-sunday-retry', 'missing_time', '2026-08-09');
    expect(
      notifications(value, 'b5-worker').filter((row) => row.subject_id.endsWith(':2026-08-09')),
    ).toHaveLength(1);
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM outbox_event WHERE topic='notification.email.requested'",
        )
        .get() as { count: number },
    ).toEqual({ count: 1 });

    // A legacy notification can survive an interrupted outbox write.  The
    // next scan repairs that delivery row without creating a second notice.
    value.sqlite
      .prepare("DELETE FROM outbox_event WHERE topic='notification.email.requested'")
      .run();
    runAlert(value, 'missing-time-sunday-outbox-repair', 'missing_time', '2026-08-09');
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM outbox_event WHERE topic='notification.email.requested'",
        )
        .get() as { count: number },
    ).toEqual({ count: 1 });
    expect(
      notifications(value, 'b5-worker').filter((row) => row.subject_id.endsWith(':2026-08-09')),
    ).toHaveLength(1);
  });

  it('suppresses missing time for absent schedules, inactive projects, expired assignments, leave, and submitted time', () => {
    const value = fixture();
    value.sqlite
      .prepare(
        "UPDATE project_member SET workday_mask='1111111' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);

    // The fixture schedule ends before this date; no effective schedule means
    // no inferred Sunday or weekday exception.
    value.sqlite
      .prepare("UPDATE schedule SET effective_to='2026-08-20' WHERE project_id=?")
      .run(value.project.id);
    runAlert(value, 'missing-time-no-effective-schedule', 'missing_time', '2026-08-21');

    insertSchedule(value, 'schedule-active', '2026-08-21', 480);
    value.sqlite.prepare("UPDATE project SET status='paused' WHERE id=?").run(value.project.id);
    runAlert(value, 'missing-time-paused-project', 'missing_time', '2026-08-21');
    value.sqlite.prepare("UPDATE project SET status='closed' WHERE id=?").run(value.project.id);
    runAlert(value, 'missing-time-closed-project', 'missing_time', '2026-08-21');
    value.sqlite.prepare("UPDATE project SET status='active' WHERE id=?").run(value.project.id);

    value.sqlite
      .prepare(
        "UPDATE project_member SET ends_on='2026-08-20' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    runAlert(value, 'missing-time-expired-assignment', 'missing_time', '2026-08-21');
    value.sqlite
      .prepare("UPDATE project_member SET ends_on=NULL WHERE project_id=? AND user_id='b5-worker'")
      .run(value.project.id);

    value.sqlite
      .prepare(
        'INSERT INTO worker_availability(id,worker_id,starts_at,ends_at,availability,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        'availability-full-day',
        'b5-worker',
        '2026-08-22T00:00:00.000Z',
        '2026-08-23T00:00:00.000Z',
        'unavailable',
        'Full-day leave',
        new Date().toISOString(),
        new Date().toISOString(),
      );
    runAlert(value, 'missing-time-full-day-leave', 'missing_time', '2026-08-22');

    const draft = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-23',
      category: 'regular',
      minutes: 60,
      summary: 'Draft time remains incomplete',
    });
    runAlert(value, 'missing-time-draft', 'missing_time', '2026-08-23');
    expect(
      notifications(value, 'b5-worker').some(
        (row) => row.subject_id === `missing-time:${value.project.id}:b5-worker:2026-08-23`,
      ),
    ).toBe(true);

    const submitted = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-24',
      category: 'regular',
      minutes: 60,
      summary: 'Submitted time suppresses reminder',
    });
    value.repository.submitTime(value.worker, submitted.id, submitted.version);
    runAlert(value, 'missing-time-submitted', 'missing_time', '2026-08-24');
    expect(
      notifications(value, 'b5-worker').some((row) => row.subject_id.endsWith(':2026-08-24')),
    ).toBe(false);
    expect(draft.version).toBe(1);
  });

  it('exposes safe app-relative targets and a scoped title in the notification DTO', () => {
    const value = fixture();
    const timestamp = new Date().toISOString();
    // A worker may join an existing project after its original start date.
    value.sqlite
      .prepare(
        "UPDATE project_member SET starts_on='2026-08-01' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    value.sqlite
      .prepare('INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)')
      .run(
        'notification-safe-target',
        'b5-worker',
        'missing_time',
        `missing-time:${value.project.id}:b5-worker:2026-08-09`,
        timestamp,
      );
    value.sqlite
      .prepare('INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)')
      .run(
        'notification-unsafe-target',
        'b5-worker',
        'assignment_published',
        '../../external.example',
        timestamp,
      );
    const rows = value.repository.listNotifications(value.worker) as Array<{
      id: string;
      target: string | null;
      title: string;
    }>;
    expect(rows.find((row) => row.id === 'notification-safe-target')).toEqual(
      expect.objectContaining({
        target: `/app/projects/${value.project.id}`,
        title: 'Submit time for this project/date',
        record_date: '2026-08-09',
      }),
    );
    expect(rows.find((row) => row.id === 'notification-unsafe-target')).toEqual(
      expect.objectContaining({ target: null }),
    );

    value.sqlite
      .prepare(
        "UPDATE project_member SET ends_on='2026-08-08' WHERE project_id=? AND user_id='b5-worker'",
      )
      .run(value.project.id);
    const withdrawn = value.repository.listNotifications(value.worker) as Array<{
      id: string;
      source_id: string | null;
      target: string | null;
      project_id: string | null;
      record_title: string | null;
    }>;
    expect(withdrawn.find((row) => row.id === 'notification-safe-target')).toEqual(
      expect.objectContaining({
        source_id: null,
        target: null,
        project_id: null,
        record_title: null,
      }),
    );
  });
});

describe('ASTRA scoped business notifications', () => {
  it('denies stale role claims and hides finance-only source details after demotion', () => {
    const value = fixture();
    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare('INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)')
      .run(
        'finance-cap-history',
        value.finance.userId,
        'cap_exception',
        `project:${value.project.id}:cap:v1`,
        timestamp,
      );
    value.sqlite
      .prepare("UPDATE user SET role='project_manager' WHERE id=?")
      .run(value.finance.userId);
    value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: value.finance.userId,
      startsOn: '2026-01-01',
      canReview: true,
    });
    expect(() => value.repository.listNotifications(value.finance)).toThrow(/role/i);
    const manager = value.repository.principalFor(value.finance.userId);
    const rows = value.repository.listNotifications(manager);
    expect(rows.find((row) => row.id === 'finance-cap-history')).toMatchObject({
      target: null,
      source_id: null,
      record_title: null,
      project_id: null,
    });
  });

  it('notifies active operational reviewers for submitted records and only the owner after return', () => {
    const value = fixture();
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-18',
      category: 'regular',
      minutes: 60,
      summary: 'Approval request',
    });
    value.repository.submitTime(value.worker, time.id, time.version);
    const expense = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-18',
      vendor: 'Approval vendor',
      category: 'travel',
      description: 'Approval expense',
      currency: 'EUR',
      amountMinor: 100n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    value.repository.submitExpense(value.worker, expense.id, expense.version);
    const daily = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-18',
      summary: 'Approval daily report',
      tasksCompleted: 'Completed',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    value.repository.submitReport(value.worker, 'daily', daily.id, daily.version);
    const technical = value.repository.createTechnicalReport(value.worker, {
      projectId: value.project.id,
      reportDate: '2026-08-18',
      systemName: 'Approval system',
      changeSummary: 'Approval technical report',
      safetyRelated: false,
    });
    value.repository.submitReport(value.worker, 'technical', technical.id, technical.version);

    runAlert(value, 'business-approval-requested', 'business_notifications');
    for (const userId of ['b5-owner', 'b5-finance', 'b5-manager']) {
      expect(notifications(value, userId).map((row) => row.kind)).toEqual(
        expect.arrayContaining([
          'approval_requested_time',
          'approval_requested_expense',
          'approval_requested_daily',
          'approval_requested_technical',
        ]),
      );
    }
    expect(notifications(value, 'b5-worker')).toHaveLength(0);
    expect(notifications(value, 'b5-outsider')).toHaveLength(0);

    value.sqlite
      .prepare(
        "UPDATE time_entry SET approval_state='needs_changes',version=version+1,updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), time.id);
    runAlert(value, 'business-approval-returned', 'business_notifications');
    expect(notifications(value, 'b5-worker').map((row) => row.kind)).toContain(
      'approval_returned_time',
    );
    expect(notifications(value, 'b5-manager').map((row) => row.kind)).not.toContain(
      'approval_returned_time',
    );

    const beforeRetry = notifications(value, 'b5-worker').filter(
      (row) => row.kind === 'approval_returned_time',
    ).length;
    runAlert(value, 'business-approval-returned-retry', 'business_notifications');
    expect(
      notifications(value, 'b5-worker').filter((row) => row.kind === 'approval_returned_time'),
    ).toHaveLength(beforeRetry);

    const payloads = value.sqlite
      .prepare("SELECT payload_json FROM outbox_event WHERE topic='notification.email.requested'")
      .all() as Array<{ payload_json: string }>;
    for (const row of payloads) {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        'kind',
        'notificationId',
        'subjectId',
        'userId',
      ]);
    }
  });

  it('covers period, signature, overdue, receipt, budget, cap, and worker payment triggers', () => {
    const value = fixture();
    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        `INSERT INTO billing_rule(
           id,project_id,stream_type,enabled,cadence_type,currency,effective_from,version,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'billing-rule-notification',
        value.project.id,
        'labor',
        1,
        'monthly',
        'EUR',
        '2026-01-01',
        1,
        timestamp,
        timestamp,
      );
    value.sqlite
      .prepare(
        `INSERT INTO billing_period(
           id,billing_rule_id,period_start,period_end,state,reasons_json,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'billing-period-notification',
        'billing-rule-notification',
        '2026-08-01',
        '2026-08-31',
        'ready',
        '[]',
        timestamp,
        timestamp,
        1,
      );
    const reportId = 'period-report-notification';
    value.sqlite
      .prepare(
        `INSERT INTO period_report(
           id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
           created_by,created_at,updated_at,snapshot_version,snapshot_sha256
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        reportId,
        value.project.id,
        '2026-08-01',
        '2026-08-31',
        'customer',
        'period_summary',
        'approved',
        '{}',
        value.owner.userId,
        timestamp,
        timestamp,
        1,
        'a'.repeat(64),
      );

    const submittedReceipt = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-19',
      vendor: 'Receipt vendor',
      category: 'other',
      description: 'Receipt is required by source state',
      currency: 'EUR',
      amountMinor: 200n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    value.repository.submitExpense(value.worker, submittedReceipt.id, submittedReceipt.version);
    value.sqlite
      .prepare(
        "UPDATE expense SET receipt_required=1,approval_state='approved',version=version+1,updated_at=? WHERE id=?",
      )
      .run(timestamp, submittedReceipt.id);

    const approvedTime = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Budget source',
    });
    value.sqlite
      .prepare(
        "UPDATE time_entry SET approval_state='approved',version=version+1,updated_at=? WHERE id=?",
      )
      .run(timestamp, approvedTime.id);
    value.sqlite
      .prepare(
        'UPDATE project SET labor_budget_minutes=60,po_cap_minor=50,version=version+1,updated_at=? WHERE id=?',
      )
      .run(timestamp, value.project.id);

    value.sqlite
      .prepare(
        `INSERT INTO invoice(
           id,project_id,invoice_number,stream_type,state,currency,total_minor,issued_at,due_at,
           snapshot_json,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'invoice-notification',
        value.project.id,
        'INV-NOTIFICATION',
        'labor',
        'issued',
        'EUR',
        100,
        timestamp,
        '2000-01-01T00:00:00.000Z',
        '{}',
        timestamp,
        timestamp,
        1,
      );

    const settlementRule = 'compensation-rule-notification';
    value.sqlite
      .prepare(
        `INSERT INTO compensation_rule(
           id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        settlementRule,
        'b5-worker',
        value.project.id,
        'EUR',
        100,
        'hourly',
        '2026-01-01',
        timestamp,
        timestamp,
      );
    value.sqlite
      .prepare(
        `INSERT INTO compensation_settlement(
           id,worker_id,project_id,compensation_rule_id,period_start,period_end,source_basis,
           source_amount_minor,amount_minor,currency,state,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'settlement-notification',
        'b5-worker',
        value.project.id,
        settlementRule,
        '2026-08-01',
        '2026-08-31',
        'approved_time',
        60,
        100,
        'EUR',
        'approved',
        timestamp,
        timestamp,
      );

    runAlert(value, 'business-financial-first', 'business_notifications');
    expect(notifications(value, 'b5-owner').map((row) => row.kind)).toEqual(
      expect.arrayContaining(['period_ready', 'signature_outstanding']),
    );
    expect(notifications(value, 'b5-finance').map((row) => row.kind)).toEqual(
      expect.arrayContaining(['period_ready', 'budget_exception', 'cap_exception']),
    );
    expect(notifications(value, 'b5-manager').map((row) => row.kind)).toContain(
      'signature_outstanding',
    );
    expect(notifications(value, 'b5-worker').map((row) => row.kind)).toEqual(
      expect.arrayContaining(['missing_receipt', 'settlement_status_changed']),
    );

    runAlert(value, 'business-overdue-transition', 'overdue');
    expect(notifications(value, 'b5-owner').map((row) => row.kind)).toContain('invoice_overdue');

    value.sqlite
      .prepare(
        "UPDATE billing_period SET state='blocked',version=version+1,updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), 'billing-period-notification');
    value.sqlite
      .prepare(
        "UPDATE expense SET reimbursement_state='reimbursed',version=version+1,updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), submittedReceipt.id);
    runAlert(value, 'business-financial-state-change', 'business_notifications');
    expect(notifications(value, 'b5-owner').map((row) => row.kind)).toContain('period_blocked');
    expect(notifications(value, 'b5-worker').map((row) => row.kind)).toContain(
      'worker_payment_status',
    );
  });
});
