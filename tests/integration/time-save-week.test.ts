import { afterEach, describe, expect, it } from 'vitest';
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

const week = '2026-08-17';

describe('saveTimeWeek (week timesheet)', () => {
  it('creates, updates, clears and submits one week atomically without an activity summary', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'time-week-sheet');
    const workerId = value.worker.userId;
    const projectId = value.project.id;
    const rows = () =>
      value.sqlite
        .prepare(
          'SELECT id,work_date,category,minutes,approval_state,activity_summary,version FROM time_entry WHERE worker_id=? ORDER BY work_date,category',
        )
        .all(workerId) as Array<Record<string, unknown>>;

    const saved = value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      cells: [
        { projectId, category: 'regular', workDate: '2026-08-17', minutes: 480 },
        { projectId, category: 'regular', workDate: '2026-08-18', minutes: 450 },
        { projectId, category: 'travel', workDate: '2026-08-18', minutes: 90 },
        { projectId, category: 'regular', workDate: '2026-08-19', minutes: null },
      ],
    });
    expect(saved).toMatchObject({ created: 3, updated: 0, removed: 0, submitted: 0 });
    expect(rows().map((row) => [row.work_date, row.category, row.minutes, row.activity_summary])).toEqual([
      ['2026-08-17', 'regular', 480, ''],
      ['2026-08-18', 'regular', 450, ''],
      ['2026-08-18', 'travel', 90, ''],
    ]);

    // A failing cell (day over 24 h) rolls back every cell of the request and names the cell.
    const [mon, tue, travel] = rows();
    let failure: unknown;
    try {
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        cells: [
          { projectId, category: 'regular', workDate: '2026-08-17', minutes: 420, id: String(mon!.id), version: Number(mon!.version) },
          { projectId, category: 'overtime', workDate: '2026-08-18', minutes: 1200 },
        ],
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      message: 'A worker cannot enter more than 1440 minutes per day',
      weekCell: { projectId, workDate: '2026-08-18', category: 'overtime' },
    });
    expect(rows().find((row) => row.id === mon!.id)?.minutes).toBe(480);

    // Stale version is refused.
    expect(() =>
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        cells: [{ projectId, category: 'regular', workDate: '2026-08-17', minutes: 60, id: String(mon!.id), version: 99 }],
      }),
    ).toThrow(/Week changed/u);

    const result = value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      submit: true,
      expected: rows().map((row) => ({ id: String(row.id), version: Number(row.version) })),
      cells: [
        { projectId, category: 'regular', workDate: '2026-08-17', minutes: 420, id: String(mon!.id), version: Number(mon!.version) },
        { projectId, category: 'travel', workDate: '2026-08-18', minutes: null, id: String(travel!.id), version: Number(travel!.version) },
      ],
    });
    expect(result).toMatchObject({ updated: 1, removed: 1, submitted: 2 });
    expect(rows().map((row) => [row.work_date, row.minutes, row.approval_state])).toEqual([
      ['2026-08-17', 420, 'submitted'],
      ['2026-08-18', 450, 'submitted'],
    ]);
    expect(tue).toBeTruthy();

    // Submitted cells are read-only.
    const submitted = rows()[0]!;
    expect(() =>
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        cells: [{ projectId, category: 'regular', workDate: '2026-08-17', minutes: 60, id: String(submitted.id), version: Number(submitted.version) }],
      }),
    ).toThrow(/never-submitted/u);
  });

  it('refuses to submit when the page did not show every draft of the week', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'time-week-stale');
    const workerId = value.worker.userId;
    const projectId = value.project.id;
    value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      cells: [{ projectId, category: 'regular', workDate: '2026-08-17', minutes: 480 }],
    });
    expect(() =>
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        submit: true,
        expected: [],
        cells: [{ projectId, category: 'regular', workDate: '2026-08-18', minutes: 480 }],
      }),
    ).toThrow(/Week changed/u);
    expect(
      value.sqlite.prepare("SELECT COUNT(*) n FROM time_entry WHERE approval_state='submitted'").get(),
    ).toEqual({ n: 0 });
    expect(value.sqlite.prepare('SELECT COUNT(*) n FROM time_entry').get()).toEqual({ n: 1 });
  });

  it('accepts hours on a future day (owner decision: planned-ahead entry is allowed)', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'time-week-future');
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const monday = new Date(`${future}T00:00:00.000Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const weekStart = monday.toISOString().slice(0, 10);
    const saved = value.repository.saveTimeWeek(owner, {
      workerId: value.worker.userId,
      weekStart,
      cells: [{ projectId: value.project.id, category: 'regular', workDate: future, minutes: 480 }],
    });
    expect(saved).toMatchObject({ created: 1 });
    const draft = value.sqlite
      .prepare('SELECT id,version,work_date FROM time_entry')
      .get() as { id: string; version: number; work_date: string };
    expect(draft.work_date).toBe(future);
    const submitted = value.repository.saveTimeWeek(owner, {
      workerId: value.worker.userId,
      weekStart,
      submit: true,
      expected: [{ id: draft.id, version: draft.version }],
      cells: [],
    });
    expect(submitted).toMatchObject({ submitted: 1 });
  });
  it('Save & send submits only the selected day and keeps the stale-page check', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'time-week-day-send');
    const workerId = value.worker.userId;
    const projectId = value.project.id;
    value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      cells: [{ projectId, category: 'regular', workDate: '2026-08-17', minutes: 480 }],
    });
    const monday = value.sqlite
      .prepare("SELECT id,version FROM time_entry WHERE work_date='2026-08-17'")
      .get() as { id: string; version: number };
    // A Monday draft the page did not show blocks sending Monday again.
    expect(() =>
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        submitDay: '2026-08-17',
        expected: [],
        cells: [{ projectId, category: 'travel', workDate: '2026-08-17', minutes: 60 }],
      }),
    ).toThrow(/Week changed/u);
    // Tuesday is saved and sent alone; Monday stays a draft.
    const sent = value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      submitDay: '2026-08-18',
      expected: [monday],
      cells: [{ projectId, category: 'regular', workDate: '2026-08-18', minutes: 420 }],
    });
    expect(sent).toMatchObject({ created: 1, submitted: 1 });
    expect(
      value.sqlite
        .prepare('SELECT work_date,approval_state FROM time_entry ORDER BY work_date')
        .all()
        .map((row) => Object.values(row as Record<string, unknown>)),
    ).toEqual([
      ['2026-08-17', 'draft'],
      ['2026-08-18', 'submitted'],
    ]);
    expect(() =>
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        submitDay: '2026-08-25',
        cells: [],
      }),
    ).toThrow(/outside the selected week/u);
  });

  it('saves any minute value plus optional start/end/break/note detail (overnight on the start date) and submits the week', () => {
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'time-week-detail');
    const workerId = value.worker.userId;
    const projectId = value.project.id;
    const rows = () =>
      value.sqlite
        .prepare(
          'SELECT id,work_date,minutes,start_time,end_time,break_minutes,activity_summary,approval_state,version FROM time_entry WHERE worker_id=? ORDER BY work_date',
        )
        .all(workerId) as Array<Record<string, unknown>>;
    value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      cells: [
        // 07:00-17:20 with a 60 min break = 9 h 20 min (not a quarter hour).
        {
          projectId,
          category: 'regular',
          workDate: '2026-08-17',
          minutes: 560,
          detail: { startTime: '07:00', endTime: '17:20', breakMinutes: 60, note: 'Robot recalibration' },
        },
        // Overnight 12:00-02:00 minus 40 min = 13 h 20 min, kept on Tuesday.
        {
          projectId,
          category: 'regular',
          workDate: '2026-08-18',
          minutes: 800,
          detail: { startTime: '12:00', endTime: '02:00', breakMinutes: 40, note: '' },
        },
        // Plain 10:25 h, no detail.
        { projectId, category: 'regular', workDate: '2026-08-19', minutes: 625 },
      ],
    });
    expect(rows().map((row) => [row.work_date, row.minutes, row.start_time, row.end_time, row.break_minutes, row.activity_summary])).toEqual([
      ['2026-08-17', 560, '07:00', '17:20', 60, 'Robot recalibration'],
      ['2026-08-18', 800, '12:00', '02:00', 40, ''],
      ['2026-08-19', 625, null, null, null, ''],
    ]);
    // Minutes that do not match end - start - break are refused.
    expect(() =>
      value.repository.saveTimeWeek(owner, {
        workerId,
        weekStart: week,
        cells: [
          {
            projectId,
            category: 'regular',
            workDate: '2026-08-20',
            minutes: 480,
            detail: { startTime: '07:00', endTime: '17:20', breakMinutes: 60, note: '' },
          },
        ],
      }),
    ).toThrow(/elapsed time less break/u);
    // Detail-only change (same hours) is saved; clearing the times keeps the hours.
    const [mon] = rows();
    const updated = value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      cells: [
        {
          projectId,
          category: 'regular',
          workDate: '2026-08-17',
          minutes: 560,
          id: String(mon!.id),
          version: Number(mon!.version),
          detail: { startTime: null, endTime: null, breakMinutes: null, note: 'Shift note only' },
        },
      ],
    });
    expect(updated).toMatchObject({ updated: 1 });
    expect(rows()[0]).toMatchObject({ minutes: 560, start_time: null, end_time: null, activity_summary: 'Shift note only' });
    // The whole week (non-quarter values) submits in one go.
    const result = value.repository.saveTimeWeek(owner, {
      workerId,
      weekStart: week,
      submit: true,
      expected: rows().map((row) => ({ id: String(row.id), version: Number(row.version) })),
      cells: [],
    });
    expect(result).toMatchObject({ submitted: 3 });
    expect(rows().every((row) => row.approval_state === 'submitted')).toBe(true);
  });
});
