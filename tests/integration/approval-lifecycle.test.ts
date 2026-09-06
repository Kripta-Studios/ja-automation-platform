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

function authenticatedOwner(value: B5LifecycleSecurityFixture) {
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    )
    .run(
      'approval-owner-session',
      'approval-owner-token',
      value.owner.userId,
      expiresAt,
      timestamp,
      timestamp,
    );
  return { ...value.owner, sessionId: 'approval-owner-session' };
}

function authenticatedFinance(value: B5LifecycleSecurityFixture) {
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  value.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    )
    .run(
      'approval-finance-session',
      'approval-finance-token',
      value.finance.userId,
      expiresAt,
      timestamp,
      timestamp,
    );
  return { ...value.finance, sessionId: 'approval-finance-session' };
}

function seedRefreshablePeriodReports(value: B5LifecycleSecurityFixture) {
  const timestamp = new Date().toISOString();
  for (const audience of ['internal', 'customer'] as const) {
    value.sqlite
      .prepare(
        `INSERT INTO period_report(
           id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
           snapshot_version,created_by,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        `approval-lifecycle-${audience}-period-report`,
        value.project.id,
        '2026-08-01',
        '2026-08-31',
        audience,
        'periodic',
        'draft',
        '{}',
        1,
        value.finance.userId,
        timestamp,
        timestamp,
      );
  }
}

describe('Client Essential approval lifecycle', () => {
  it('revalidates source-date assignment inside report and technical-change submission', () => {
    const value = fixture();
    const daily = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary: 'Draft created while assigned',
      tasksCompleted: 'Prepared the daily draft',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const technical = value.repository.createTechnicalReport(value.worker, {
      projectId: value.project.id,
      reportDate: '2026-07-04',
      systemName: 'PLC-SEC',
      changeSummary: 'Draft technical truth',
      safetyRelated: false,
    });
    const change = value.v3.createTechnicalChange(value.worker, {
      projectId: value.project.id,
      technicalReportId: technical.id,
      component: 'Safety interlock',
      changeMade: 'Prepared a guarded change',
    });
    value.sqlite
      .prepare(
        "UPDATE project_member SET ends_on='2026-06-30' WHERE project_id=? AND user_id=? AND status='active'",
      )
      .run(value.project.id, value.worker.userId);

    expect(() =>
      value.repository.submitReport(value.worker, 'daily', daily.id, daily.version),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.submitReport(value.worker, 'technical', technical.id, technical.version),
    ).toThrow(AccessDeniedError);
    expect(() => value.v3.submitTechnicalChange(value.worker, change.id, change.version)).toThrow(
      /Effective project assignment required/u,
    );
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM daily_report WHERE id=?')
        .get(daily.id),
    ).toEqual({ approval_state: 'draft', version: daily.version });
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM technical_report WHERE id=?')
        .get(technical.id),
    ).toEqual({ approval_state: 'draft', version: technical.version });
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM technical_change WHERE id=?')
        .get(change.id),
    ).toEqual({ approval_state: 'draft', version: change.version });
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE entity_id IN (?,?,?) AND action LIKE '%.submit'",
        )
        .get(daily.id, technical.id, change.id),
    ).toEqual({ count: 0 });
  });

  it('requires current PM can_review membership for every operational review and queue', () => {
    const value = fixture();
    const timeId = submittedTime(value);
    const expenseId = submittedExpense(value);
    const dailyId = submittedDaily(value);
    const technicalId = submittedTechnical(value);
    const milestone = value.repository.createProjectMilestone(value.owner, {
      projectId: value.project.id,
      name: 'Review-gated milestone',
      amountMinor: 10_000n,
    });
    value.repository.submitProjectMilestone(value.owner, milestone.id, milestone.version);

    value.sqlite
      .prepare(
        "UPDATE project_member SET can_review=0 WHERE project_id=? AND user_id=? AND status='active'",
      )
      .run(value.project.id, value.manager.userId);

    expect(value.repository.listApprovalQueue(value.manager)).toEqual([]);
    expect(value.repository.listMilestonesForReview(value.manager)).toEqual([]);
    expect(() =>
      value.repository.operationalApproveTime(value.manager, timeId, 'approved'),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.operationalApproveExpense(value.manager, expenseId, 'approved'),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.reviewReport(value.manager, 'daily', dailyId, 'approved'),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.reviewReport(value.manager, 'technical', technicalId, 'approved'),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.reviewProjectMilestone(value.manager, milestone.id, 'approved'),
    ).toThrow(AccessDeniedError);
  });

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

  it('creates PM and Owner correction drafts without changing approved originals', () => {
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

    expect(() =>
      value.repository.createCorrectionDraft(value.manager, {
        recordType: 'time_entry',
        originalId: timeId,
        requestId: 'approval-pm-forged-finance-field',
        reason: 'Attempt to change a Finance-owned field',
        patch: { client_rate_minor: 999_999 },
      }),
    ).toThrow(ValidationError);
    const correction = value.repository.createCorrectionDraft(value.manager, {
      recordType: 'time_entry',
      originalId: timeId,
      requestId: 'approval-pm-correction-time',
      reason: 'Correct approved shift allocation',
      patch: { minutes: 540 },
    });
    const owner = authenticatedOwner(value);
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

  it('keeps an approved time source effective until its correction is approved, then permits a rejected retry', () => {
    const value = fixture();
    const originalId = submittedTime(value);
    value.repository.operationalApproveTime(value.manager, originalId, 'approved');

    expect(value.v3.workerPay(value.worker, '2026-08-20', '2026-08-20')).toMatchObject({
      approvedMinutes: 600,
      pendingMinutes: 0,
    });

    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId,
      requestId: 'time-correction-effective-source-draft',
      reason: 'Correct the approved shift minutes without hiding history',
      patch: { minutes: 540 },
    });

    // A draft correction is input under review, not yet a replacement of approved truth.
    expect(value.v3.workerPay(value.worker, '2026-08-20', '2026-08-20')).toMatchObject({
      approvedMinutes: 600,
      pendingMinutes: 0,
    });
    expect(
      value.v3.projectFinance(value.finance, value.project.id, '2026-08-20', '2026-08-20'),
    ).toMatchObject({ actualMinutes: 600 });
    expect(
      value.repository
        .listWorkerStatementTime(value.worker, '2026-08-20', '2026-08-20')
        .map((row) => row.id),
    ).toEqual([originalId]);
    value.repository.submitTime(value.worker, correction.correctionId, 1);
    expect(value.v3.workerPay(value.worker, '2026-08-20', '2026-08-20')).toMatchObject({
      approvedMinutes: 600,
      pendingMinutes: 0,
    });

    value.repository.operationalApproveTime(
      value.manager,
      correction.correctionId,
      'rejected',
      'Original approved time remains the effective source',
    );
    expect(value.v3.workerPay(value.worker, '2026-08-20', '2026-08-20')).toMatchObject({
      approvedMinutes: 600,
      pendingMinutes: 0,
    });
    expect(
      value.repository.listTimeForScope(value.worker).find((row) => row.id === originalId),
    ).toMatchObject({ id: originalId, approval_state: 'approved' });
    expect(
      value.repository.listApprovalQueue(value.manager).find((row) => row.id === originalId),
    ).toMatchObject({ id: originalId, review_stage: 'correction' });
    expect(
      value.repository.listApprovalQueue(value.finance).find((row) => row.id === originalId),
    ).toMatchObject({ id: originalId, review_stage: 'finance' });
    expect(
      value.sqlite
        .prepare(
          "SELECT count(*) count FROM approval_event WHERE entity_type='time' AND entity_id=?",
        )
        .get(correction.correctionId),
    ).toEqual({ count: 1 });

    let retry!: { correctionId: string };
    expect(() => {
      retry = value.repository.createCorrectionDraft(value.worker, {
        recordType: 'time_entry',
        originalId,
        requestId: 'time-correction-effective-source-retry',
        reason: 'Retry with corrected approved shift minutes',
        patch: { minutes: 570 },
      });
    }).not.toThrow();
    value.repository.submitTime(value.worker, retry.correctionId, 1);
    value.repository.operationalApproveTime(value.manager, retry.correctionId, 'approved');
    expect(value.v3.workerPay(value.worker, '2026-08-20', '2026-08-20')).toMatchObject({
      approvedMinutes: 570,
      pendingMinutes: 0,
    });
    expect(
      value.repository.listApprovalQueue(value.manager).find((row) => row.id === originalId),
    ).toBeUndefined();
  });

  it('holds the entire compensation period while a time correction is active', () => {
    const value = fixture();
    const finance = authenticatedFinance(value);
    value.v3.createCompensationRule(finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      effectiveFrom: '2026-08-01',
    });
    const originalId = submittedTime(value);
    const second = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Second approved period source',
    });
    value.repository.submitTime(value.worker, second.id, second.version);
    value.repository.operationalApproveTime(value.manager, originalId, 'approved');
    value.repository.operationalApproveTime(value.manager, second.id, 'approved');

    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId,
      requestId: 'compensation-period-correction-draft',
      reason: 'Correct the first approved source before settlement',
      patch: { minutes: 540 },
    });
    expect(() =>
      value.v3.settleCompensation(finance, {
        workerId: value.worker.userId,
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow(/active time correction/i);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM compensation_settlement').get(),
    ).toEqual({ count: 0 });

    value.repository.submitTime(value.worker, correction.correctionId, 1);
    value.repository.operationalApproveTime(
      value.manager,
      correction.correctionId,
      'rejected',
      'The original record remains correct',
    );
    const retry = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId,
      requestId: 'compensation-period-correction-retry',
      reason: 'Retry with the corrected first source',
      patch: { minutes: 540 },
    });
    value.repository.submitTime(value.worker, retry.correctionId, 1);
    value.repository.operationalApproveTime(value.manager, retry.correctionId, 'approved');

    expect(
      value.v3.settleCompensation(finance, {
        workerId: value.worker.userId,
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toEqual([
      expect.objectContaining({ amountMinor: '60000', sourceAmountMinor: '600', state: 'settled' }),
    ]);

    const held = fixture();
    const heldFinance = authenticatedFinance(held);
    held.v3.createCompensationRule(heldFinance, {
      workerId: held.worker.userId,
      projectId: held.project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 6_000n,
      effectiveFrom: '2026-08-01',
    });
    const heldOriginalId = submittedTime(held);
    held.repository.operationalApproveTime(held.manager, heldOriginalId, 'approved');
    const heldCorrection = held.repository.createCorrectionDraft(held.worker, {
      recordType: 'time_entry',
      originalId: heldOriginalId,
      requestId: 'compensation-needs-changes-hold',
      reason: 'Correction requires reviewer clarification',
      patch: { minutes: 540 },
    });
    held.repository.submitTime(held.worker, heldCorrection.correctionId, 1);
    held.repository.operationalApproveTime(
      held.manager,
      heldCorrection.correctionId,
      'needs_changes',
      'Clarify the corrected duration before settlement',
    );
    expect(() =>
      held.v3.settleCompensation(heldFinance, {
        workerId: held.worker.userId,
        projectId: held.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    ).toThrow(/active time correction/i);
    expect(held.sqlite.prepare('SELECT count(*) count FROM compensation_settlement').get()).toEqual(
      { count: 0 },
    );
  });

  it('keeps an approved worker expense effective until its correction is approved', () => {
    const value = fixture();
    const original = value.repository.createExpense(value.worker, {
      projectId: value.project.id,
      spentOn: '2026-08-20',
      vendor: 'Original worker-paid hotel',
      category: 'hotel',
      description: 'Original expense source',
      currency: 'EUR',
      amountMinor: 10_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    value.repository.submitExpense(value.worker, original.id, original.version);
    value.repository.operationalApproveExpense(value.manager, original.id, 'approved');
    const statement = () =>
      value.repository.listWorkerStatementExpenses(value.worker, '2026-08-20', '2026-08-20');
    expect(statement().map((row) => row.id)).toEqual([original.id]);
    expect(
      value.v3.listReimbursementQueue(value.finance, value.project.id).map((row) => row.id),
    ).toEqual([original.id]);

    const correction = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'expense',
      originalId: original.id,
      requestId: 'expense-effective-source-draft',
      reason: 'Correct the worker-paid receipt amount',
      patch: { amountMinor: 12_500 },
    });
    expect(statement().map((row) => row.id)).toEqual([original.id]);
    expect(value.v3.listReimbursementQueue(value.finance, value.project.id)).toEqual([]);
    value.repository.submitExpense(value.worker, correction.correctionId, 1);
    expect(statement().map((row) => row.id)).toEqual([original.id]);
    expect(value.v3.listReimbursementQueue(value.finance, value.project.id)).toEqual([]);

    value.repository.operationalApproveExpense(
      value.manager,
      correction.correctionId,
      'rejected',
      'Original receipt remains authoritative',
    );
    expect(statement().map((row) => row.id)).toEqual([original.id]);
    expect(
      value.v3.listReimbursementQueue(value.finance, value.project.id).map((row) => row.id),
    ).toEqual([original.id]);
    expect(
      value.repository
        .listApprovalQueue(value.manager)
        .find((row) => row.id === original.id && row.type === 'expense'),
    ).toMatchObject({ id: original.id, review_stage: 'correction' });
    expect(
      value.repository
        .listApprovalQueue(value.finance)
        .find((row) => row.id === original.id && row.type === 'expense'),
    ).toMatchObject({ id: original.id, review_stage: 'finance' });
    const retry = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'expense',
      originalId: original.id,
      requestId: 'expense-effective-source-retry',
      reason: 'Retry with corrected receipt amount',
      patch: { amountMinor: 12_500 },
    });
    value.repository.submitExpense(value.worker, retry.correctionId, 1);
    value.repository.operationalApproveExpense(value.manager, retry.correctionId, 'approved');
    expect(statement().map((row) => row.id)).toEqual([retry.correctionId]);

    const held = fixture();
    const heldOriginal = held.repository.createExpense(held.worker, {
      projectId: held.project.id,
      spentOn: '2026-08-20',
      vendor: 'Held original worker-paid hotel',
      category: 'hotel',
      description: 'Held original expense source',
      currency: 'EUR',
      amountMinor: 10_000n,
      whoPaid: 'worker',
      receiptRequired: false,
    });
    held.repository.submitExpense(held.worker, heldOriginal.id, heldOriginal.version);
    held.repository.operationalApproveExpense(held.manager, heldOriginal.id, 'approved');
    const heldCorrection = held.repository.createCorrectionDraft(held.worker, {
      recordType: 'expense',
      originalId: heldOriginal.id,
      requestId: 'expense-needs-changes-hold',
      reason: 'Expense correction requires clarification',
      patch: { amountMinor: 12_500 },
    });
    held.repository.submitExpense(held.worker, heldCorrection.correctionId, 1);
    held.repository.operationalApproveExpense(
      held.manager,
      heldCorrection.correctionId,
      'needs_changes',
      'Clarify the corrected amount before reimbursement',
    );
    expect(
      held.repository
        .listWorkerStatementExpenses(held.worker, '2026-08-20', '2026-08-20')
        .map((row) => row.id),
    ).toEqual([heldOriginal.id]);
    expect(held.v3.listReimbursementQueue(held.finance, held.project.id)).toEqual([]);
  });

  it('keeps approved daily and technical report truth, including technical-change detail, until a correction is approved', () => {
    const value = fixture();
    const finance = authenticatedFinance(value);
    seedRefreshablePeriodReports(value);
    const timeId = submittedTime(value);
    const dailyId = submittedDaily(value);
    const technical = value.repository.createTechnicalReport(value.worker, {
      projectId: value.project.id,
      reportDate: '2026-08-20',
      systemName: 'PLC-Report-Correction',
      changeSummary: 'Original technical report truth',
      safetyRelated: false,
    });
    value.repository.submitReport(value.worker, 'technical', technical.id, technical.version);
    value.repository.operationalApproveTime(value.manager, timeId, 'approved');
    value.repository.reviewReport(value.manager, 'daily', dailyId, 'approved');
    value.repository.reviewReport(value.manager, 'technical', technical.id, 'approved');
    value.sqlite
      .prepare(
        'UPDATE project SET daily_report_required=1,technical_reporting_required=1 WHERE id=?',
      )
      .run(value.project.id);
    const legalEntity = value.repository.createLegalEntity(value.owner, {
      code: 'DTRC',
      legalName: 'Daily technical correction test entity',
      currency: 'EUR',
      billingAddress: 'Test street 1',
      companyIdentifiers: 'DTRC-1',
    });
    const taxProfile = value.repository.createTaxProfile(finance, {
      name: 'Daily technical correction tax',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'Zero', basisPoints: 0 }],
    });
    const billingRule = value.repository.createBillingRule(finance, {
      projectId: value.project.id,
      legalEntityId: legalEntity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: taxProfile.id,
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    const originalChange = value.v3.createTechnicalChange(value.worker, {
      projectId: value.project.id,
      technicalReportId: technical.id,
      component: 'Original safety interlock',
      changeMade: 'Original child detail must remain traceable',
      reason: 'Initial controlled technical change',
      productionImpact: 'No production impact',
      validation: 'Functional test passed',
      validationResult: 'Passed',
      rollbackInformation: 'Restore original interlock logic',
    });
    value.v3.submitTechnicalChange(value.worker, originalChange.id, originalChange.version);
    value.v3.reviewTechnicalChange(value.manager, originalChange.id, 'approved');

    const snapshot = () => {
      const refreshed = value.v3.refreshPeriodReports(finance, {
        projectId: value.project.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      });
      return refreshed.find((report) => report.audience === 'internal')!.snapshot as {
        dailyReports: Array<{ id: string; summary: string }>;
        technicalReports: Array<{ id: string; change_summary: string }>;
        technicalChanges: Array<{
          id: string;
          technical_report_id: string;
          component: string;
          change_made: string;
        }>;
      };
    };

    expect(snapshot()).toMatchObject({
      dailyReports: [expect.objectContaining({ id: dailyId, summary: 'Daily operational truth' })],
      technicalReports: [
        expect.objectContaining({
          id: technical.id,
          change_summary: 'Original technical report truth',
        }),
      ],
      technicalChanges: [
        expect.objectContaining({
          id: originalChange.id,
          technical_report_id: technical.id,
          component: 'Original safety interlock',
        }),
      ],
    });

    const dailyCorrection = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'daily_report',
      originalId: dailyId,
      requestId: 'daily-report-effective-source-draft',
      reason: 'Clarify the approved daily operational summary',
      patch: { summary: 'Corrected daily report truth' },
    });
    const technicalCorrection = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'technical_report',
      originalId: technical.id,
      requestId: 'technical-report-effective-source-draft',
      reason: 'Clarify the approved technical report summary',
      patch: { changeSummary: 'Corrected technical report truth' },
    });

    // Draft, submitted, and returned reports are not a replacement for approved truth.
    expect(snapshot()).toMatchObject({
      dailyReports: [expect.objectContaining({ id: dailyId, summary: 'Daily operational truth' })],
      technicalReports: [
        expect.objectContaining({
          id: technical.id,
          change_summary: 'Original technical report truth',
        }),
      ],
      technicalChanges: [expect.objectContaining({ id: originalChange.id })],
    });
    expect(
      value.v3
        .billingReadiness(finance, billingRule.id, '2026-08-01', '2026-08-31')
        .reasons.map((reason) => reason.code),
    ).toEqual(
      expect.arrayContaining([
        'pending_daily_report_correction',
        'pending_technical_report_correction',
      ]),
    );
    expect(
      value.v3
        .billingReadiness(finance, billingRule.id, '2026-08-01', '2026-08-31')
        .reasons.map((reason) => reason.code),
    ).not.toEqual(
      expect.arrayContaining([
        'missing_approved_daily_report',
        'missing_approved_technical_report',
      ]),
    );
    const clonedChanges = value.sqlite
      .prepare(
        `SELECT id,technical_report_id,component,change_made,approval_state,version
           FROM technical_change WHERE technical_report_id=? ORDER BY id`,
      )
      .all(technicalCorrection.correctionId) as Array<{
      id: string;
      technical_report_id: string;
      component: string;
      change_made: string;
      approval_state: string;
      version: number;
    }>;
    expect(clonedChanges).toEqual([
      expect.objectContaining({
        technical_report_id: technicalCorrection.correctionId,
        component: 'Original safety interlock',
        change_made: 'Original child detail must remain traceable',
        approval_state: 'approved',
        version: 1,
      }),
    ]);
    expect(clonedChanges[0]!.id).not.toBe(originalChange.id);
    expect(
      value.sqlite
        .prepare(
          `SELECT count(*) count FROM audit_event
            WHERE action='technical_change.create' AND entity_id=?
              AND details_json LIKE '%\"correctionClone\":true%'`,
        )
        .get(clonedChanges[0]!.id),
    ).toEqual({ count: 1 });
    value.repository.submitReport(value.worker, 'daily', dailyCorrection.correctionId, 1);
    value.repository.submitReport(value.worker, 'technical', technicalCorrection.correctionId, 1);
    value.repository.reviewReport(
      value.manager,
      'daily',
      dailyCorrection.correctionId,
      'needs_changes',
      'Please retain the original wording until the correction is complete',
    );
    value.repository.reviewReport(
      value.manager,
      'technical',
      technicalCorrection.correctionId,
      'needs_changes',
      'Please retain the original technical source until the correction is complete',
    );
    expect(snapshot()).toMatchObject({
      dailyReports: [expect.objectContaining({ id: dailyId, summary: 'Daily operational truth' })],
      technicalReports: [
        expect.objectContaining({
          id: technical.id,
          change_summary: 'Original technical report truth',
        }),
      ],
      technicalChanges: [expect.objectContaining({ id: originalChange.id })],
    });

    value.repository.submitReport(value.worker, 'daily', dailyCorrection.correctionId, 3);
    value.repository.submitReport(value.worker, 'technical', technicalCorrection.correctionId, 3);
    value.repository.reviewReport(value.manager, 'daily', dailyCorrection.correctionId, 'approved');
    value.repository.reviewReport(
      value.manager,
      'technical',
      technicalCorrection.correctionId,
      'approved',
    );

    const approved = snapshot();
    expect(approved.dailyReports).toEqual([
      expect.objectContaining({
        id: dailyCorrection.correctionId,
        summary: 'Corrected daily report truth',
      }),
    ]);
    expect(approved.technicalReports).toEqual([
      expect.objectContaining({
        id: technicalCorrection.correctionId,
        change_summary: 'Corrected technical report truth',
      }),
    ]);
    expect(approved.technicalChanges).toEqual([
      expect.objectContaining({
        technical_report_id: technicalCorrection.correctionId,
        component: 'Original safety interlock',
        change_made: 'Original child detail must remain traceable',
      }),
    ]);
  });

  it('rejects unauthorized Owner override and immutable locked sources', () => {
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

      const owner = authenticatedOwner(value);
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
