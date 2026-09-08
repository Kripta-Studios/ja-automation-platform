import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PeriodFollowupAccessDeniedError,
  PeriodFollowupConflictError,
  PeriodFollowupRepository,
  PeriodFollowupValidationError,
} from '@ja/database';
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

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function signedSnapshot(version: number): { json: string; sha256: string } {
  const json = JSON.stringify({ reportVersion: version, approvedMinutes: 480 });
  return { json, sha256: createHash('sha256').update(json).digest('hex') };
}

function seedCustomerReport(
  value: B5LifecycleSecurityFixture,
  reportId = 'astra-c1-report',
  options: Readonly<{ version?: number; readyPdf?: boolean; audience?: string; reportType?: string }> = {},
) {
  const version = options.version ?? 1;
  const snapshot = signedSnapshot(version);
  const now = '2026-08-25T08:00:00.000Z';
  value.sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
         pdf_storage_key,pdf_sha256,created_by,created_at,updated_at,pdf_byte_length,
         snapshot_version,snapshot_sha256
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      reportId,
      value.project.id,
      '2026-08-01',
      '2026-08-31',
      options.audience ?? 'customer',
      options.reportType ?? 'customer_period',
      'approved',
      snapshot.json,
      options.readyPdf === false ? null : `reports/${reportId}/v${version}.pdf`,
      options.readyPdf === false ? null : 'c'.repeat(64),
      value.owner.userId,
      now,
      now,
      options.readyPdf === false ? null : 128,
      version,
      snapshot.sha256,
    );
  return { reportId, version, ...snapshot };
}

function reviewer(value: B5LifecycleSecurityFixture) {
  return stepUpB5Principal(value.sqlite, value.manager, 'astra-period-followup');
}

function worker(value: B5LifecycleSecurityFixture) {
  return stepUpB5Principal(value.sqlite, value.worker, 'astra-period-followup');
}

function eventInput(
  report: ReturnType<typeof seedCustomerReport>,
  value: B5LifecycleSecurityFixture,
  overrides: Record<string, unknown> = {},
) {
  return {
    periodReportId: report.reportId,
    expectedSnapshotVersion: report.version,
    expectedSnapshotSha256: report.sha256,
    expectedLatestEventId: null,
    idempotencyKey: 'c1-event-1',
    eventType: 'shared' as const,
    method: 'secure portal handoff',
    eventDate: '2026-08-25',
    reference: 'handoff-1',
    signatoryName: null,
    reason: null,
    responsibleUserId: value.manager.userId,
    nextFollowUpOn: null,
    ...overrides,
  };
}

describe('ASTRA C1 period follow-up repository', () => {
  it('requires an active persisted role/session and project scope, and keeps Worker metadata private', () => {
    const value = fixture();
    const report = seedCustomerReport(value);
    const repository = new PeriodFollowupRepository(value.sqlite);
    const manager = reviewer(value);
    const workerPrincipal = worker(value);

    expect(repository.getReportFollowup(manager, report.reportId)).toMatchObject({
      reportId: report.reportId,
      snapshotVersion: 1,
      snapshotSha256: report.sha256,
    });
    expect(() => repository.getReportFollowup(workerPrincipal, report.reportId)).toThrow(
      PeriodFollowupAccessDeniedError,
    );
    expect(() => repository.getReportFollowup(value.manager, report.reportId)).toThrow(
      PeriodFollowupAccessDeniedError,
    );
    expect(() => repository.getReportFollowup(value.outsider, report.reportId)).toThrow(
      PeriodFollowupAccessDeniedError,
    );

    const secondClient = value.repository.createClient(value.owner, {
      legalName: 'C1 second client',
      displayName: 'C1 second client',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: 'c1-second@example.test',
      billingAddress: 'C1 second client address',
      paymentTermsDays: 30,
    });
    const secondProject = value.repository.createProject(value.owner, {
      clientId: secondClient.id,
      name: 'C1 second project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    const secondReport = signedSnapshot(1);
    value.sqlite
      .prepare(
        `INSERT INTO period_report(
           id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
           pdf_storage_key,pdf_sha256,created_by,created_at,updated_at,pdf_byte_length,
           snapshot_version,snapshot_sha256
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'astra-c1-cross-project',
        secondProject.id,
        '2026-08-01',
        '2026-08-31',
        'customer',
        'customer_period',
        'approved',
        secondReport.json,
        'reports/astra-c1-cross-project/v1.pdf',
        'd'.repeat(64),
        value.owner.userId,
        '2026-08-25T08:00:00.000Z',
        '2026-08-25T08:00:00.000Z',
        128,
        1,
        secondReport.sha256,
      );
    expect(() => repository.getReportFollowup(manager, 'astra-c1-cross-project')).toThrow(
      PeriodFollowupAccessDeniedError,
    );
  });

  it('validates event state, ready-PDF gating and excludes any forged acceptance event', () => {
    const value = fixture();
    const report = seedCustomerReport(value, 'astra-c1-validation');
    const noPdf = seedCustomerReport(value, 'astra-c1-no-pdf', {
      readyPdf: false,
      reportType: 'customer_period_no_pdf',
    });
    const repository = new PeriodFollowupRepository(value.sqlite);
    const manager = reviewer(value);

    expect(() =>
      repository.recordEvent(manager, eventInput(report, value, { method: null })),
    ).toThrow(PeriodFollowupValidationError);
    expect(() =>
      repository.recordEvent(manager, eventInput(report, value, { eventType: 'returned', reason: null })),
    ).toThrow(PeriodFollowupValidationError);
    expect(() =>
      repository.recordEvent(manager, eventInput(report, value, { eventType: 'accepted' as never })),
    ).toThrow(PeriodFollowupValidationError);
    expect(() => repository.recordEvent(manager, eventInput(noPdf, value))).toThrow(
      PeriodFollowupConflictError,
    );
    expect(
      value.sqlite
        .prepare("SELECT name FROM pragma_table_info('period_report_followup_event') WHERE name='event_type'")
        .get(),
    ).toEqual({ name: 'event_type' });
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM period_report_followup_event').get()).toEqual({
      count: 0,
    });
  });

  it('keeps append-only history, accepts an identical retry, rejects changed key reuse and enforces latest-event CAS', () => {
    const value = fixture();
    const report = seedCustomerReport(value, 'astra-c1-idempotency');
    const repository = new PeriodFollowupRepository(value.sqlite, {
      id: (() => {
        let sequence = 0;
        return () => `c1-event-${++sequence}`;
      })(),
      now: () => '2026-08-25T10:00:00.000Z',
    });
    const manager = reviewer(value);
    const input = eventInput(report, value);
    const first = repository.recordEvent(manager, input);
    const retry = repository.recordEvent(manager, input);
    expect(retry).toEqual(first);
    expect(() =>
      repository.recordEvent(manager, { ...input, reference: 'changed-reference' }),
    ).toThrow(PeriodFollowupConflictError);

    const second = repository.recordEvent(manager, {
      ...input,
      expectedLatestEventId: first.id,
      idempotencyKey: 'c1-event-2',
      eventType: 'awaiting_signatory',
      method: null,
      eventDate: null,
      reference: null,
      signatoryName: 'Named customer signatory',
    });
    expect(second).toMatchObject({ sequenceNo: 2, previousEventId: first.id });
    expect(() =>
      repository.recordEvent(manager, {
        ...input,
        idempotencyKey: 'c1-event-3',
        reference: 'stale-history',
      }),
    ).toThrow(PeriodFollowupConflictError);
    expect(() =>
      value.sqlite.prepare('UPDATE period_report_followup_event SET reason=? WHERE id=?').run(
        'overwrite',
        first.id,
      ),
    ).toThrow(/immutable/u);
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM period_report_followup_event').get()).toEqual({
      count: 2,
    });
  });

  it('marks prior events stale after a new report version and rejects stale writes', () => {
    const value = fixture();
    const report = seedCustomerReport(value, 'astra-c1-stale');
    const repository = new PeriodFollowupRepository(value.sqlite, {
      id: () => 'c1-stale-event',
      now: () => '2026-08-25T11:00:00.000Z',
    });
    const manager = reviewer(value);
    const first = repository.recordEvent(manager, eventInput(report, value));
    const next = signedSnapshot(2);
    value.sqlite
      .prepare(
        `UPDATE period_report
            SET snapshot_json=?,snapshot_version=?,snapshot_sha256=?,
                pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL,updated_at=?
          WHERE id=?`,
      )
      .run(next.json, 2, next.sha256, '2026-08-25T12:00:00.000Z', report.reportId);

    const view = repository.getReportFollowup(manager, report.reportId);
    expect(view.events).toHaveLength(1);
    expect(view.events[0]).toMatchObject({ id: first.id, stale: true, snapshotVersion: 1 });
    expect(() =>
      repository.recordEvent(manager, {
        ...eventInput(report, value),
        idempotencyKey: 'c1-stale-retry',
      }),
    ).toThrow(PeriodFollowupConflictError);
  });

  it('returns a complete project-period queue with exact source IDs and no commercial DTOs', () => {
    const value = fixture();
    const report = seedCustomerReport(value, 'astra-c1-queue');
    const workerPrincipal = worker(value);
    const daily = value.repository.createDailyReport(workerPrincipal, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary: 'C1 queue source',
      tasksCompleted: 'C1 source activity',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    value.sqlite
      .prepare('INSERT INTO report_source(report_id,source_type,source_id) VALUES(?,?,?)')
      .run(report.reportId, 'daily_report', daily.id);

    const queue = new PeriodFollowupRepository(value.sqlite).reviewProjectPeriod(
      reviewer(value),
      value.project.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(queue.reports).toHaveLength(1);
    expect(queue.reports[0]).toMatchObject({
      reportId: report.reportId,
      snapshotVersion: 1,
      snapshotSha256: report.sha256,
      pdfReady: true,
      sources: [{ type: 'daily_report', id: daily.id, href: `/app/reports/${daily.id}` }],
    });
    expect(JSON.stringify(queue)).not.toMatch(/approvedCostMinor|billingAmount|margin|workerPay/iu);
  });
});
