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
});
