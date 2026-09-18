import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@ja/domain';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
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

function createTechnicalReport(
  value: B5LifecycleSecurityFixture,
  input: Readonly<{
    reportDate: string;
    systemName: string;
    projectId?: string;
    approvalState?: 'draft' | 'approved' | 'locked' | 'rejected';
    reviewer?: Principal;
  }>,
): string {
  const report = value.repository.createTechnicalReport(value.worker, {
    projectId: input.projectId ?? value.project.id,
    reportDate: input.reportDate,
    systemName: input.systemName,
    changeSummary: `${input.systemName} controlled change`,
    safetyRelated: false,
  });
  if (input.approvalState === 'approved' || input.approvalState === 'locked') {
    value.repository.submitReport(value.worker, 'technical', report.id, report.version);
    value.repository.reviewReport(
      input.reviewer ?? value.manager,
      'technical',
      report.id,
      'approved',
    );
    if (input.approvalState === 'locked')
      value.sqlite
        .prepare("UPDATE technical_report SET approval_state='locked' WHERE id=?")
        .run(report.id);
  } else if (input.approvalState === 'rejected') {
    value.sqlite
      .prepare("UPDATE technical_report SET approval_state='rejected' WHERE id=?")
      .run(report.id);
  }
  return report.id;
}

function seedPeriodReports(value: B5LifecycleSecurityFixture): void {
  const timestamp = '2026-09-18T10:00:00.000Z';
  for (const audience of ['internal', 'customer'] as const) {
    value.sqlite
      .prepare(
        `INSERT INTO period_report(
           id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,
           snapshot_version,snapshot_sha256,pdf_storage_key,pdf_sha256,pdf_byte_length,
           approved_at,created_by,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        `selection-${audience}`,
        value.project.id,
        '2026-08-01',
        '2026-08-31',
        audience,
        'periodic',
        'approved',
        JSON.stringify({ preserved: audience }),
        7,
        audience === 'internal' ? 'a'.repeat(64) : 'b'.repeat(64),
        `reports/${audience}-preserved.pdf`,
        audience === 'internal' ? 'c'.repeat(64) : 'd'.repeat(64),
        321,
        timestamp,
        value.finance.userId,
        timestamp,
        timestamp,
      );
  }
}

function refreshSelected(
  value: B5LifecycleSecurityFixture,
  finance: Principal,
  technicalReportIds: readonly string[],
) {
  return value.v3.refreshPeriodReports(finance, {
    projectId: value.project.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    contentMode: 'hours_activity_selected_technical',
    technicalReportIds,
  });
}

describe('period report explicit technical-report selection', () => {
  it('accepts approved and locked in-scope reports while preserving pending visibility in all-technical mode', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'selection-approved');
    seedPeriodReports(value);
    const approvedId = createTechnicalReport(value, {
      reportDate: '2026-08-10',
      systemName: 'PLC-approved',
      approvalState: 'approved',
    });
    const lockedId = createTechnicalReport(value, {
      reportDate: '2026-08-11',
      systemName: 'PLC-locked',
      approvalState: 'locked',
    });
    const draftId = createTechnicalReport(value, {
      reportDate: '2026-08-12',
      systemName: 'PLC-pending',
    });

    const selected = refreshSelected(value, finance, [approvedId, lockedId]);
    for (const report of selected) {
      expect(report.snapshot.selectedTechnicalReportIds).toEqual([approvedId, lockedId].sort());
      expect(
        (report.snapshot.technicalReports as Array<{ id: string }>).map((item) => item.id).sort(),
      ).toEqual([approvedId, lockedId].sort());
    }

    const allTechnical = value.v3.refreshPeriodReports(finance, {
      projectId: value.project.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      contentMode: 'hours_activity_all_technical',
    });
    const internal = allTechnical.find((report) => report.audience === 'internal');
    expect(
      (internal?.snapshot.technicalReports as Array<{ id: string }>).map((item) => item.id),
    ).toContain(draftId);
  });

  it.each([['draft', 'draft'] as const, ['rejected', 'rejected'] as const])(
    'rejects an explicitly selected %s report without mutating artifacts or snapshots',
    (_, state) => {
      const value = fixture();
      const finance = stepUpB5Principal(value.sqlite, value.finance, `selection-${state}`);
      seedPeriodReports(value);
      const preservedSourceId = createTechnicalReport(value, {
        reportDate: '2026-08-09',
        systemName: `PLC-preserved-${state}`,
        approvalState: 'approved',
      });
      value.sqlite
        .prepare(
          "INSERT INTO report_source(report_id,source_type,source_id) VALUES('selection-internal','technical_report',?)",
        )
        .run(preservedSourceId);
      const selectedId = createTechnicalReport(value, {
        reportDate: '2026-08-10',
        systemName: `PLC-${state}`,
        approvalState: state,
      });
      const beforeReports = value.sqlite
        .prepare(
          `SELECT id,state,snapshot_json,snapshot_version,snapshot_sha256,pdf_storage_key,
                pdf_sha256,pdf_byte_length,approved_at,updated_at
           FROM period_report ORDER BY id`,
        )
        .all();
      const beforeSources = value.sqlite
        .prepare(
          'SELECT report_id,source_type,source_id FROM report_source ORDER BY report_id,source_type,source_id',
        )
        .all();

      expect(() => refreshSelected(value, finance, [selectedId])).toThrow(
        /selected technical reports must be approved or locked/i,
      );

      expect(
        value.sqlite
          .prepare(
            `SELECT id,state,snapshot_json,snapshot_version,snapshot_sha256,pdf_storage_key,
                  pdf_sha256,pdf_byte_length,approved_at,updated_at
             FROM period_report ORDER BY id`,
          )
          .all(),
      ).toEqual(beforeReports);
      expect(
        value.sqlite
          .prepare(
            'SELECT report_id,source_type,source_id FROM report_source ORDER BY report_id,source_type,source_id',
          )
          .all(),
      ).toEqual(beforeSources);
    },
  );

  it('retains project and period scope validation for otherwise approved selections', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'selection-scope');
    seedPeriodReports(value);
    const outsidePeriodId = createTechnicalReport(value, {
      reportDate: '2026-09-01',
      systemName: 'PLC-outside-period',
      approvalState: 'approved',
    });
    const otherProject = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      name: 'Other report-selection project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    value.repository.assignWorker(value.owner, {
      projectId: otherProject.id,
      workerId: value.manager.userId,
      startsOn: '2026-01-01',
      canReview: true,
    });
    value.repository.assignWorker(value.owner, {
      projectId: otherProject.id,
      workerId: value.worker.userId,
      startsOn: '2026-01-01',
    });
    const otherProjectReviewer = value.repository.principalFor(value.manager.userId);
    const outsideProjectId = createTechnicalReport(value, {
      projectId: otherProject.id,
      reportDate: '2026-08-10',
      systemName: 'PLC-outside-project',
      approvalState: 'approved',
      reviewer: otherProjectReviewer,
    });

    expect(() => refreshSelected(value, finance, [outsidePeriodId])).toThrow(
      /outside the chosen project or period/i,
    );
    expect(() => refreshSelected(value, finance, [outsideProjectId])).toThrow(
      /outside the chosen project or period/i,
    );
  });
});
