import { join } from 'node:path';
import { createDatabase, V3Repository } from '@ja/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
      expect(JSON.parse(payload.payload_json)).toMatchObject({ retryOfJobId: oldJobId });
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
