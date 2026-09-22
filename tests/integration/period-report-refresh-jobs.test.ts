import { join } from 'node:path';
import { createDatabase, V3Repository } from '@ja/database';
import { PERIOD_REPORT_TEMPLATE_VERSION } from '@ja/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCustomerPeriodSnapshotSafe } from '../../packages/database/src/domains/reports/customer-conformity-repository.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const finance = stepUpB5Principal(value.sqlite, value.finance, 'period-refresh');
  const now = new Date().toISOString();
  for (const audience of ['customer', 'internal']) {
    value.sqlite
      .prepare(
        `INSERT INTO period_report(id,project_id,period_start,period_end,audience,report_type,state,
        snapshot_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        `refresh-${audience}`,
        value.project.id,
        '2026-08-01',
        '2026-08-31',
        audience,
        'period_summary',
        'draft',
        '{}',
        finance.userId,
        now,
        now,
      );
  }
  const input = {
    projectId: value.project.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    reportLocale: 'en' as const,
    contentMode: 'hours_activity_all_technical' as const,
    technicalReportIds: [],
  };
  return { ...value, finance, input };
}

function exhaustJob(value: ReturnType<typeof fixture>, jobId: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  for (let attempt = 0; attempt < 5; attempt++) {
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(
      value.v3.runDueJobs(1, {
        period_close_report: () => {
          throw new Error('Controlled render failure');
        },
      }),
    ).toMatchObject({ processed: 0, failed: 1 });
  }
  expect(value.sqlite.prepare('SELECT state FROM job WHERE id=?').get(jobId)).toEqual({
    state: 'dead_letter',
  });
  vi.useRealTimers();
}

describe('atomic versioned period-report rendering requests', () => {
  it('captures actual intervals in new operational snapshots without inventing legacy clocks or rewriting history', () => {
    const value = fixture();
    const legacy = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-10',
      category: 'regular',
      minutes: 60,
      summary: 'Legacy activity',
    });
    const interval = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-11',
      category: 'regular',
      minutes: 420,
      startTime: '08:15',
      endTime: '16:15',
      breakMinutes: 60,
      summary: 'Actual interval',
    });
    for (const entry of [legacy, interval]) {
      value.repository.submitTime(value.worker, entry.id, entry.version);
      value.repository.operationalApproveTime(value.manager, entry.id, 'approved');
    }
    const first = value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
    for (const audience of ['customer', 'internal']) {
      const report = first.reports.find((row) => row.audience === audience)!;
      const snapshot = report.snapshot as Record<string, unknown>;
      const times = snapshot.timeSummary as Array<Record<string, unknown>>;
      expect(times.find((row) => row.id === interval.id)).toMatchObject({
        startTime: '08:15',
        endTime: '16:15',
        breakMinutes: 60,
        minutes: 420,
      });
      const old = times.find((row) => row.id === legacy.id)!;
      expect(old).toMatchObject({ minutes: 60 });
      expect(old).not.toHaveProperty('startTime');
      expect(old).not.toHaveProperty('endTime');
      expect(old).not.toHaveProperty('breakMinutes');
      expect(times.reduce((total, row) => total + Number(row.minutes), 0)).toBe(480);
      if (audience === 'customer') {
        expect(() => assertCustomerPeriodSnapshotSafe(snapshot)).not.toThrow();
        const tainted = structuredClone(snapshot);
        (tainted.timeSummary as Array<Record<string, unknown>>)[0]!.amountMinor = 123;
        expect(() => assertCustomerPeriodSnapshotSafe(tainted)).toThrow(/forbidden|not allowed/i);
        const incomplete = structuredClone(snapshot);
        delete (incomplete.timeSummary as Array<Record<string, unknown>>).find(
          (row) => row.id === interval.id,
        )!.endTime;
        expect(() => assertCustomerPeriodSnapshotSafe(incomplete)).toThrow(/start and end times/i);
        for (const invalid of [
          { startTime: '16:15', endTime: '08:15' },
          { startTime: '08:15', endTime: '08:15' },
          { breakMinutes: 480 },
          { breakMinutes: 481 },
          { minutes: 480 },
        ]) {
          const inconsistent = structuredClone(snapshot);
          Object.assign(
            (inconsistent.timeSummary as Array<Record<string, unknown>>).find(
              (row) => row.id === interval.id,
            )!,
            invalid,
          );
          expect(() => assertCustomerPeriodSnapshotSafe(inconsistent)).toThrow(
            /same-day interval and matching net minutes/i,
          );
        }
        const noBreak = structuredClone(snapshot);
        const noBreakRow = (noBreak.timeSummary as Array<Record<string, unknown>>).find(
          (row) => row.id === interval.id,
        )!;
        delete noBreakRow.breakMinutes;
        noBreakRow.minutes = 480;
        expect(() => assertCustomerPeriodSnapshotSafe(noBreak)).not.toThrow();
        noBreakRow.breakMinutes = 480;
        noBreakRow.minutes = 0;
        expect(() => assertCustomerPeriodSnapshotSafe(noBreak)).not.toThrow();
      }
    }
    const own = value.repository.listWorkerStatementTime(
      value.worker,
      value.input.periodStart,
      value.input.periodEnd,
    );
    expect(own.find((row) => row.id === interval.id)).toMatchObject({
      start_time: '08:15',
      end_time: '16:15',
      break_minutes: 60,
      minutes: 420,
    });
    expect(
      value.repository.listWorkerStatementTime(
        value.outsider,
        value.input.periodStart,
        value.input.periodEnd,
      ),
    ).toEqual([]);
    const frozen = value.sqlite
      .prepare('SELECT id,snapshot_json FROM period_report ORDER BY id')
      .all();
    value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
    expect(
      value.sqlite.prepare('SELECT id,snapshot_json FROM period_report ORDER BY id').all(),
    ).toEqual(frozen);
    value.sqlite.prepare("UPDATE period_report SET state='final'").run();
    const later = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-12',
      category: 'regular',
      startTime: '09:00',
      endTime: '10:00',
      breakMinutes: 0,
      minutes: 60,
      summary: 'Recorded after report finalization',
    });
    value.repository.submitTime(value.worker, later.id, later.version);
    value.repository.operationalApproveTime(value.manager, later.id, 'approved');
    expect(() => value.v3.refreshAndQueuePeriodReports(value.finance, value.input)).toThrow();
    expect(
      value.sqlite.prepare('SELECT id,snapshot_json FROM period_report ORDER BY id').all(),
    ).toEqual(frozen);
  });

  it('deduplicates the same pending version across database connections', () => {
    const value = fixture();
    const first = value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
    const other = createDatabase(join(value.directory, 'app.db')).sqlite;
    try {
      const repeated = new V3Repository(other).refreshAndQueuePeriodReports(
        value.finance,
        value.input,
      );
      expect(first).toMatchObject({ jobCreated: true, jobState: 'queued', retryOfJobId: null });
      expect(repeated).toMatchObject({ jobId: first.jobId, jobCreated: false, jobState: 'queued' });
      expect(repeated.reports.map((report) => report.snapshotVersion)).toEqual(
        first.reports.map((report) => report.snapshotVersion),
      );
      expect(
        other.prepare("SELECT COUNT(*) count FROM job WHERE kind='period_close_report'").get(),
      ).toEqual({ count: 1 });
      const persisted = other
        .prepare('SELECT payload_json FROM job WHERE id=?')
        .get(first.jobId) as { payload_json: string };
      expect(JSON.parse(persisted.payload_json)).toMatchObject({
        templateVersion: PERIOD_REPORT_TEMPLATE_VERSION,
      });
    } finally {
      other.close();
    }
  });

  it('queues changed source snapshots and distinct content or locale requests', () => {
    const value = fixture();
    const first = value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
    value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-10',
      summary: 'New activity',
      tasksCompleted: 'New controlled source activity',
      safetyRelated: false,
      downtimeMinutes: 0,
    });
    const changed = value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
    expect(changed.jobId).not.toBe(first.jobId);
    expect(changed.jobCreated).toBe(true);
    expect(
      changed.reports.find((report) => report.audience === 'internal')!.snapshotVersion,
    ).toBeGreaterThan(
      first.reports.find((report) => report.audience === 'internal')!.snapshotVersion,
    );
    const selected = value.v3.refreshAndQueuePeriodReports(value.finance, {
      ...value.input,
      contentMode: 'hours_only',
    });
    const localized = value.v3.refreshAndQueuePeriodReports(value.finance, {
      ...value.input,
      contentMode: 'hours_only',
      reportLocale: 'es',
    });
    expect(new Set([first.jobId, changed.jobId, selected.jobId, localized.jobId]).size).toBe(4);
  });

  it('returns succeeded for an unchanged completed request and claimed while its runner owns it', () => {
    const value = fixture();
    const first = value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
    expect(
      value.v3.runDueJobs(1, {
        period_close_report: () => {
          expect(value.v3.refreshAndQueuePeriodReports(value.finance, value.input)).toMatchObject({
            jobId: first.jobId,
            jobCreated: false,
            jobState: 'claimed',
          });
        },
      }),
    ).toMatchObject({ processed: 1, failed: 0 });
    expect(value.v3.refreshAndQueuePeriodReports(value.finance, value.input)).toMatchObject({
      jobId: first.jobId,
      jobCreated: false,
      jobState: 'succeeded',
    });
  });

  it.each(['versioned', 'historical'] as const)(
    'links a %s terminal failure to one new audited request',
    (kind) => {
      const value = fixture();
      const oldJobId =
        kind === 'versioned'
          ? value.v3.refreshAndQueuePeriodReports(value.finance, value.input).jobId
          : value.v3.enqueueJob(
              'period_close_report',
              'billing-close:historical-request',
              value.input,
            ).id;
      exhaustJob(value, oldJobId);
      const before = value.sqlite.prepare('SELECT * FROM job WHERE id=?').get(oldJobId);
      const beforeRuns = value.sqlite
        .prepare('SELECT * FROM job_run WHERE job_id=? ORDER BY id')
        .all(oldJobId);
      const retry = value.v3.refreshAndQueuePeriodReports(value.finance, value.input);
      expect(retry).toMatchObject({ jobCreated: true, jobState: 'queued', retryOfJobId: oldJobId });
      expect(retry.jobId).not.toBe(oldJobId);
      expect(value.v3.refreshAndQueuePeriodReports(value.finance, value.input)).toMatchObject({
        jobId: retry.jobId,
        jobCreated: false,
        jobState: 'queued',
        retryOfJobId: oldJobId,
      });
      expect(value.sqlite.prepare('SELECT * FROM job WHERE id=?').get(oldJobId)).toEqual(before);
      expect(
        value.sqlite.prepare('SELECT * FROM job_run WHERE job_id=? ORDER BY id').all(oldJobId),
      ).toEqual(beforeRuns);
      const payload = value.sqlite
        .prepare('SELECT payload_json FROM job WHERE id=?')
        .get(retry.jobId) as { payload_json: string };
      expect(JSON.parse(payload.payload_json)).toMatchObject({
        retryOfJobId: oldJobId,
        templateVersion: PERIOD_REPORT_TEMPLATE_VERSION,
      });
      expect(
        value.sqlite
          .prepare(
            `SELECT COUNT(*) count FROM audit_event WHERE action='period_report.refresh'
       AND json_extract(details_json,'$.renderJobId')=? AND json_extract(details_json,'$.retryOfJobId')=?`,
          )
          .get(retry.jobId, oldJobId),
      ).toEqual({ count: 1 });
    },
  );

  it('rolls back refreshed snapshots, source bindings and audit if enqueue fails', () => {
    const value = fixture();
    const before = value.sqlite.prepare('SELECT * FROM period_report ORDER BY id').all();
    const auditBefore = value.sqlite.prepare('SELECT COUNT(*) count FROM audit_event').get();
    value.sqlite.exec(`CREATE TRIGGER fail_period_enqueue BEFORE INSERT ON job
      WHEN NEW.kind='period_close_report' BEGIN SELECT RAISE(ABORT,'controlled enqueue failure'); END;`);
    expect(() => value.v3.refreshAndQueuePeriodReports(value.finance, value.input)).toThrow(
      'controlled enqueue failure',
    );
    expect(value.sqlite.prepare('SELECT * FROM period_report ORDER BY id').all()).toEqual(before);
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM report_source').get()).toEqual({
      count: 0,
    });
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM audit_event').get()).toEqual(
      auditBefore,
    );
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM job').get()).toEqual({ count: 0 });
  });

  it('retains authorization and final-report protection without queuing work', () => {
    const value = fixture();
    expect(() => value.v3.refreshAndQueuePeriodReports(value.worker, value.input)).toThrow();
    const before = value.sqlite.prepare('SELECT * FROM period_report ORDER BY id').all();
    expect(() =>
      value.v3.refreshAndQueuePeriodReports(
        { ...value.finance, sessionId: undefined },
        value.input,
      ),
    ).toThrow(/session/iu);
    expect(value.sqlite.prepare('SELECT * FROM period_report ORDER BY id').all()).toEqual(before);
    value.sqlite.prepare("UPDATE period_report SET state='final' WHERE audience='customer'").run();
    const final = value.sqlite
      .prepare("SELECT * FROM period_report WHERE audience='customer'")
      .get();
    expect(() => value.v3.refreshAndQueuePeriodReports(value.finance, value.input)).toThrow();
    expect(
      value.sqlite.prepare("SELECT * FROM period_report WHERE audience='customer'").get(),
    ).toEqual(final);
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM job').get()).toEqual({ count: 0 });
  });
});
