import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  signInB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

const week = '2026-08-17';

function fixture(): B5LifecycleSecurityFixture {
  const base = createB5LifecycleSecurityFixture();
  const value = { ...base, worker: signInB5Principal(base.sqlite, base.worker, 'returned-correction-worker') };
  fixtures.push(value);
  return value;
}

/**
 * T03 (audit 2026-11-22): a reviewer-returned entry must be fixable from the
 * Time week/day sheet, with or without a start/end interval.
 */
describe('saveTimeWeek on a sent-back entry', () => {
  function returnedOvernight(value: B5LifecycleSecurityFixture, workDate: string) {
    const projectId = value.project.id;
    value.repository.saveTimeWeek(value.worker, {
      workerId: value.worker.userId,
      weekStart: week,
      cells: [
        {
          projectId,
          category: 'overtime',
          workDate,
          minutes: 450,
          detail: { startTime: '22:00', endTime: '06:00', breakMinutes: 30, note: 'Night shift' },
        },
      ],
    });
    const draft = value.sqlite
      .prepare("SELECT id,version FROM time_entry WHERE worker_id=? AND work_date=? AND approval_state='draft'")
      .get(value.worker.userId, workDate) as { id: string; version: number };
    value.repository.saveTimeWeek(value.worker, {
      workerId: value.worker.userId,
      weekStart: week,
      submitDay: workDate,
      expected: [{ id: draft.id, version: draft.version }],
      cells: [],
    });
    value.repository.operationalApproveTime(value.manager, draft.id, 'needs_changes', 'Only 5:30 authorised');
    return value.sqlite.prepare('SELECT id,version FROM time_entry WHERE id=?').get(draft.id) as {
      id: string;
      version: number;
    };
  }

  it('creates a linked correction from a changed overnight interval and its note', () => {
    const value = fixture();
    const original = returnedOvernight(value, '2026-08-19');
    const result = value.repository.saveTimeWeek(value.worker, {
      workerId: value.worker.userId,
      weekStart: week,
      correctionReason: 'Only 5:30 were authorised',
      cells: [
        {
          projectId: value.project.id,
          category: 'overtime',
          workDate: '2026-08-19',
          minutes: 330,
          id: original.id,
          version: original.version,
          detail: { startTime: '22:00', endTime: '04:00', breakMinutes: 30, note: 'Night shift, cut short' },
        },
      ],
    });
    expect(result).toMatchObject({ corrected: 1 });
    const correction = value.sqlite
      .prepare(
        `SELECT t.minutes,t.start_time,t.end_time,t.break_minutes,t.activity_summary,t.approval_state,l.reason
           FROM record_correction_link l JOIN time_entry t ON t.id=l.correction_id
          WHERE l.record_type='time_entry' AND l.original_id=?`,
      )
      .get(original.id);
    expect(correction).toEqual({
      minutes: 330,
      start_time: '22:00',
      end_time: '04:00',
      break_minutes: 30,
      activity_summary: 'Night shift, cut short',
      approval_state: 'draft',
      reason: 'Only 5:30 were authorised',
    });
  });

  it('accepts plain hours that drop the stored interval and break', () => {
    const value = fixture();
    const original = returnedOvernight(value, '2026-08-20');
    const result = value.repository.saveTimeWeek(value.worker, {
      workerId: value.worker.userId,
      weekStart: week,
      cells: [
        {
          projectId: value.project.id,
          category: 'overtime',
          workDate: '2026-08-20',
          minutes: 330,
          id: original.id,
          version: original.version,
          detail: { startTime: null, endTime: null, breakMinutes: null, note: '' },
        },
      ],
    });
    expect(result).toMatchObject({ corrected: 1 });
    expect(
      value.sqlite
        .prepare(
          `SELECT t.minutes,t.start_time,t.end_time,t.break_minutes,t.activity_summary
             FROM record_correction_link l JOIN time_entry t ON t.id=l.correction_id
            WHERE l.original_id=?`,
        )
        .get(original.id),
    ).toEqual({
      minutes: 330,
      start_time: null,
      end_time: null,
      break_minutes: null,
      activity_summary: 'Night shift',
    });
  });

  it('the /time/<id> correction form path accepts a cleared interval (break NULL)', () => {
    const value = fixture();
    const original = returnedOvernight(value, '2026-08-21');
    const created = value.repository.createCorrectionDraft(value.worker, {
      recordType: 'time_entry',
      originalId: original.id,
      requestId: 'returned-overnight-hours-only',
      reason: 'Hours only, no clock times',
      patch: { minutes: 300, startTime: null, endTime: null, breakMinutes: null },
    });
    expect(
      value.sqlite.prepare('SELECT minutes,start_time,break_minutes FROM time_entry WHERE id=?').get(created.correctionId),
    ).toEqual({ minutes: 300, start_time: null, break_minutes: null });
    // A break without an interval is still refused by the effective-entry check.
    const other = returnedOvernight(value, '2026-08-22');
    expect(() =>
      value.repository.createCorrectionDraft(value.worker, {
        recordType: 'time_entry',
        originalId: other.id,
        requestId: 'returned-overnight-bad-break',
        reason: 'Break left behind',
        patch: { minutes: 300, startTime: null, endTime: null, breakMinutes: -5 },
      }),
    ).toThrow(/Correction duration is invalid/u);
  });
});
