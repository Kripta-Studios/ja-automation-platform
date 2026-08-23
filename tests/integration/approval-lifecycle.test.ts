import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { approvalDecisionSchema, reportDecisionSchema } from '@ja/schemas';
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

function submittedTime(value: B5LifecycleSecurityFixture): string {
  const time = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes: 600,
    summary: 'Commissioning shift',
  });
  value.repository.submitTime(value.worker, time.id, time.version);
  return time.id;
}

function submittedExpense(value: B5LifecycleSecurityFixture): string {
  const expense = value.repository.createExpense(value.worker, {
    projectId: value.project.id,
    spentOn: '2026-08-20',
    vendor: 'Hotel Essential',
    category: 'hotel',
    description: 'Project lodging',
    currency: 'EUR',
    amountMinor: 10_000n,
    whoPaid: 'worker',
    clientTreatment: 'reimbursable',
    receiptRequired: false,
  });
  value.repository.submitExpense(value.worker, expense.id, expense.version);
  return expense.id;
}

function submittedDaily(value: B5LifecycleSecurityFixture): string {
  const report = value.repository.createDailyReport(value.worker, {
    projectId: value.project.id,
    workDate: '2026-08-20',
    summary: 'Daily operational truth',
    tasksCompleted: 'Commissioning tasks',
    downtimeMinutes: 0,
    safetyRelated: false,
  });
  value.repository.submitReport(value.worker, 'daily', report.id, report.version);
  return report.id;
}

function submittedTechnical(value: B5LifecycleSecurityFixture): string {
  const report = value.repository.createTechnicalReport(value.worker, {
    projectId: value.project.id,
    reportDate: '2026-07-04',
    systemName: 'PLC-01',
    changeSummary: 'Adjusted conveyor interlock',
    safetyRelated: false,
  });
  value.repository.submitReport(value.worker, 'technical', report.id, report.version);
  return report.id;
}

function stepUpOwner(value: B5LifecycleSecurityFixture) {
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'approval-owner-session',
      'approval-owner-token',
      value.owner.userId,
      expiresAt,
      timestamp,
      timestamp,
      timestamp,
    );
  return { ...value.owner, sessionId: 'approval-owner-session' };
}

describe('Client Essential approval lifecycle', () => {
  it('requires a trimmed nonblank reason in schemas and repository boundaries', () => {
    const value = fixture();
    const timeId = submittedTime(value);
    const expenseId = submittedExpense(value);
    const dailyId = submittedDaily(value);
    const technicalId = submittedTechnical(value);

    expect(
      approvalDecisionSchema.safeParse({
        id: timeId,
        type: 'time',
        decision: 'rejected',
        reason: '   ',
      }).success,
    ).toBe(false);
    expect(
      reportDecisionSchema.safeParse({
        id: dailyId,
        type: 'daily',
        decision: 'needs_changes',
        reason: '   ',
      }).success,
    ).toBe(false);

    expect(() =>
      value.repository.operationalApproveTime(value.manager, timeId, 'rejected', '   '),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.operationalApproveExpense(value.manager, expenseId, 'needs_changes', ' '),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.reviewReport(value.manager, 'daily', dailyId, 'needs_changes', ' '),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.reviewReport(value.manager, 'technical', technicalId, 'needs_changes', ' '),
    ).toThrow(ValidationError);

    expect(
      value.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(timeId),
    ).toEqual({ approval_state: 'submitted' });
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(expenseId),
    ).toEqual({ approval_state: 'submitted' });
  });

  it('stores the reason and exposes the native technical report date in operational reads', () => {
    const value = fixture();
    const timeId = submittedTime(value);
    const technicalId = submittedTechnical(value);

    value.repository.operationalApproveTime(
      value.manager,
      timeId,
      'needs_changes',
      '  Explain the overlap  ',
    );
    expect(
      value.sqlite
        .prepare("SELECT reason FROM approval_event WHERE entity_type='time' AND entity_id=?")
        .get(timeId),
    ).toEqual({ reason: 'Explain the overlap' });

    const ownReports = value.repository.listOwnReports(value.worker);
    expect(ownReports.find((row) => row.id === technicalId)).toMatchObject({ date: '2026-07-04' });
    const overview = value.repository.projectOverview(value.worker, value.project.id);
    expect(
      (overview.reports as Array<Record<string, unknown>>).find((row) => row.id === technicalId),
    ).toMatchObject({ date: '2026-07-04' });
  });

  it('creates PM and step-up Owner correction drafts without changing approved originals', () => {
    const value = fixture();
    const timeId = submittedTime(value);
    const dailyId = submittedDaily(value);
    value.repository.operationalApproveTime(value.manager, timeId, 'approved');
    value.repository.reviewReport(value.manager, 'daily', dailyId, 'approved');
    const timeBefore = value.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(timeId);
    const dailyBefore = value.sqlite.prepare('SELECT * FROM daily_report WHERE id=?').get(dailyId);
    expect(
      value.repository.listApprovalQueue(value.manager).find((row) => row.id === timeId),
    ).toMatchObject({ review_stage: 'correction' });
    expect(
      value.repository.listApprovalQueue(value.owner).find((row) => row.id === dailyId),
    ).toMatchObject({ review_stage: 'owner_override', date: '2026-08-20' });

    const correction = value.repository.createCorrectionDraft(value.manager, {
      recordType: 'time_entry',
      originalId: timeId,
      requestId: 'approval-pm-correction-time',
      reason: 'Correct approved shift allocation',
      patch: { minutes: 540 },
    });
    expect(() =>
      value.repository.createCorrectionDraft(value.manager, {
        recordType: 'time_entry',
        originalId: timeId,
        requestId: 'approval-pm-forged-finance-field',
        reason: 'Attempt to change a Finance-owned field',
        patch: { client_rate_minor: 999_999 },
      }),
    ).toThrow(ValidationError);
    const owner = stepUpOwner(value);
    expect(() =>
      value.repository.createCorrectionDraft(owner, {
        recordType: 'daily_report',
        originalId: dailyId,
        requestId: 'approval-owner-must-use-override',
        reason: 'An Owner correction must remain an explicit override',
      }),
    ).toThrow(AccessDeniedError);
    const override = value.repository.ownerOverrideCorrectionDraft(owner, {
      recordType: 'daily_report',
      originalId: dailyId,
      requestId: 'approval-owner-override-daily',
      reason: 'Owner-authorized correction after client clarification',
      patch: { summary: 'Corrected daily operational truth' },
    });

    expect(
      value.sqlite
        .prepare('SELECT approval_state,minutes FROM time_entry WHERE id=?')
        .get(correction.id),
    ).toEqual({
      approval_state: 'draft',
      minutes: 540,
    });
    expect(
      value.sqlite
        .prepare('SELECT approval_state,summary FROM daily_report WHERE id=?')
        .get(override.id),
    ).toEqual({ approval_state: 'draft', summary: 'Corrected daily operational truth' });
    expect(value.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(timeId)).toEqual(
      timeBefore,
    );
    expect(value.sqlite.prepare('SELECT * FROM daily_report WHERE id=?').get(dailyId)).toEqual(
      dailyBefore,
    );
    expect(value.repository.listApprovalQueue(value.manager).some((row) => row.id === timeId)).toBe(
      false,
    );
    expect(value.repository.listApprovalQueue(value.owner).some((row) => row.id === dailyId)).toBe(
      false,
    );

    const audit = value.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='correction.create' AND entity_id=?",
      )
      .get(override.id) as { details_json: string };
    expect(JSON.parse(audit.details_json)).toMatchObject({
      originalId: dailyId,
      reason: 'Owner-authorized correction after client clarification',
      ownerOverride: true,
    });
  });

  it('rejects unauthorized or non-step-up Owner override and immutable locked sources', () => {
    const value = fixture();
    const timeId = submittedTime(value);
    const expenseId = submittedExpense(value);
    value.repository.operationalApproveTime(value.manager, timeId, 'approved');
    value.repository.operationalApproveExpense(value.manager, expenseId, 'approved');
    const input = {
      recordType: 'time_entry' as const,
      originalId: timeId,
      requestId: 'approval-owner-authorization',
      reason: 'Owner override authorization test',
    };

    expect(() => value.repository.ownerOverrideCorrectionDraft(value.manager, input)).toThrow(
      AccessDeniedError,
    );
    expect(() => value.repository.createCorrectionDraft(value.finance, input)).toThrow(
      AccessDeniedError,
    );
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => value.repository.ownerOverrideCorrectionDraft(value.owner, input)).toThrow(
        AccessDeniedError,
      );

      const owner = stepUpOwner(value);
      value.sqlite
        .prepare("UPDATE time_entry SET billing_status='locked',locked_at=?,locked_by=? WHERE id=?")
        .run(new Date().toISOString(), owner.userId, timeId);
      value.sqlite.prepare("UPDATE expense SET billing_state='locked' WHERE id=?").run(expenseId);
      expect(() => value.repository.ownerOverrideCorrectionDraft(owner, input)).toThrow(
        ConflictError,
      );
      expect(() =>
        value.repository.ownerOverrideCorrectionDraft(owner, {
          recordType: 'expense',
          originalId: expenseId,
          requestId: 'approval-owner-locked-expense',
          reason: 'Locked expense must remain immutable',
        }),
      ).toThrow(ConflictError);
      expect(
        value.sqlite.prepare('SELECT count(*) count FROM record_correction_link').get(),
      ).toEqual({ count: 0 });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
