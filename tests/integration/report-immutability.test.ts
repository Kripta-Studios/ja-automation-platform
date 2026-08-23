import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError } from '@ja/database';
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

function row(
  value: B5LifecycleSecurityFixture,
  table: 'daily_report' | 'technical_report',
  id: string,
): Record<string, unknown> {
  return value.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as Record<
    string,
    unknown
  >;
}

function createApprovedDaily(value: B5LifecycleSecurityFixture): string {
  const created = value.repository.createDailyReport(value.worker, {
    projectId: value.project.id,
    workDate: '2026-08-20',
    summary: 'Daily source truth',
    tasksCompleted: 'Commissioning tasks completed',
    downtimeMinutes: 5,
    safetyRelated: false,
  });
  value.repository.submitReport(value.worker, 'daily', created.id, created.version);
  value.repository.reviewReport(value.manager, 'daily', created.id, 'approved');
  return created.id;
}

function createApprovedTechnical(value: B5LifecycleSecurityFixture): string {
  const created = value.repository.createTechnicalReport(value.worker, {
    projectId: value.project.id,
    reportDate: '2026-08-20',
    systemName: 'PLC source truth',
    changeSummary: 'Technical source truth',
    safetyRelated: false,
  });
  value.repository.submitReport(value.worker, 'technical', created.id, created.version);
  value.repository.reviewReport(value.manager, 'technical', created.id, 'approved');
  return created.id;
}

describe('approved operational report immutability', () => {
  it('keeps ordinary draft edits working for daily and technical reports', () => {
    const value = fixture();
    const daily = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary: 'Draft daily report',
      tasksCompleted: 'Initial tasks',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    const updatedDaily = value.repository.updateDailyReport(value.worker, {
      id: daily.id,
      version: daily.version,
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary: 'Edited draft daily report',
      tasksCompleted: 'Updated tasks',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    expect(updatedDaily).toEqual(
      expect.objectContaining({ id: daily.id, version: daily.version + 1 }),
    );
    expect(row(value, 'daily_report', daily.id).summary).toBe('Edited draft daily report');

    const technical = value.repository.createTechnicalReport(value.worker, {
      projectId: value.project.id,
      reportDate: '2026-08-20',
      systemName: 'Draft PLC',
      changeSummary: 'Initial technical draft',
      safetyRelated: false,
    });
    const updatedTechnical = value.repository.updateTechnicalReport(value.worker, {
      id: technical.id,
      version: technical.version,
      projectId: value.project.id,
      systemName: 'Draft PLC',
      changeSummary: 'Edited technical draft',
      safetyRelated: false,
    });
    expect(updatedTechnical).toEqual(
      expect.objectContaining({ id: technical.id, version: technical.version + 1 }),
    );
    expect(row(value, 'technical_report', technical.id).change_summary).toBe(
      'Edited technical draft',
    );
  });

  it('rejects direct edits to approved daily and technical reports without changing rows', () => {
    const value = fixture();
    const dailyId = createApprovedDaily(value);
    const technicalId = createApprovedTechnical(value);
    const dailyBefore = JSON.stringify(row(value, 'daily_report', dailyId));
    const technicalBefore = JSON.stringify(row(value, 'technical_report', technicalId));
    const dailyVersion = Number(row(value, 'daily_report', dailyId).version);
    const technicalVersion = Number(row(value, 'technical_report', technicalId).version);

    expect(() =>
      value.repository.updateDailyReport(value.manager, {
        id: dailyId,
        version: dailyVersion,
        projectId: value.project.id,
        workDate: '2026-08-21',
        summary: 'Must not overwrite approved truth',
        tasksCompleted: 'Tampered tasks',
        downtimeMinutes: 30,
        safetyRelated: true,
      }),
    ).toThrow(ConflictError);
    expect(() =>
      value.repository.updateTechnicalReport(value.manager, {
        id: technicalId,
        version: technicalVersion,
        projectId: value.project.id,
        reportDate: '2026-08-21',
        systemName: 'Tampered PLC',
        changeSummary: 'Must not overwrite approved truth',
        safetyRelated: true,
        validation: 'Forged validation',
        rollbackPlan: 'Forged rollback',
      }),
    ).toThrow(ConflictError);

    expect(JSON.stringify(row(value, 'daily_report', dailyId))).toBe(dailyBefore);
    expect(JSON.stringify(row(value, 'technical_report', technicalId))).toBe(technicalBefore);
  });

  it('creates audited correction drafts while preserving approved daily and technical originals', () => {
    const value = fixture();
    const dailyId = createApprovedDaily(value);
    const technicalId = createApprovedTechnical(value);
    const dailyBefore = JSON.stringify(row(value, 'daily_report', dailyId));
    const technicalBefore = JSON.stringify(row(value, 'technical_report', technicalId));

    const dailyCorrection = value.repository.createCorrectionDraft(value.manager, {
      recordType: 'daily_report',
      originalId: dailyId,
      requestId: 'report-correction-daily-1',
      reason: 'Correct the daily summary after approval',
      patch: { summary: 'Corrected daily summary' },
    });
    const technicalCorrection = value.repository.createCorrectionDraft(value.manager, {
      recordType: 'technical_report',
      originalId: technicalId,
      requestId: 'report-correction-technical-1',
      reason: 'Correct the technical change summary after approval',
      patch: { changeSummary: 'Corrected technical summary' },
    });

    expect(row(value, 'daily_report', dailyCorrection.id)).toEqual(
      expect.objectContaining({
        approval_state: 'draft',
        summary: 'Corrected daily summary',
      }),
    );
    expect(row(value, 'technical_report', technicalCorrection.id)).toEqual(
      expect.objectContaining({
        approval_state: 'draft',
        change_summary: 'Corrected technical summary',
      }),
    );
    expect(JSON.stringify(row(value, 'daily_report', dailyId))).toBe(dailyBefore);
    expect(JSON.stringify(row(value, 'technical_report', technicalId))).toBe(technicalBefore);

    expect(
      value.sqlite
        .prepare(
          'SELECT record_type,original_id,correction_id,reason FROM record_correction_link WHERE correction_id IN (?,?) ORDER BY record_type',
        )
        .all(dailyCorrection.id, technicalCorrection.id),
    ).toEqual([
      {
        record_type: 'daily_report',
        original_id: dailyId,
        correction_id: dailyCorrection.id,
        reason: 'Correct the daily summary after approval',
      },
      {
        record_type: 'technical_report',
        original_id: technicalId,
        correction_id: technicalCorrection.id,
        reason: 'Correct the technical change summary after approval',
      },
    ]);
  });
});
