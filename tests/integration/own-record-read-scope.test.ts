import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  signInB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

describe('own records stay readable after the assignment ends (T19/T41)', () => {
  it('reads own time and reports by the assignment date range, writes stay current-only', () => {
    const base = createB5LifecycleSecurityFixture();
    fixtures.push(base);
    const worker = signInB5Principal(base.sqlite, base.worker, 'own-read-scope-worker');
    const outsider = signInB5Principal(base.sqlite, base.outsider, 'own-read-scope-outsider');
    const time = base.repository.createTimeEntry(worker, {
      projectId: base.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 480,
      summary: 'Commissioning shift',
    });
    const report = base.repository.createDailyReport(worker, {
      projectId: base.project.id,
      workDate: '2026-08-20',
      summary: 'Daily truth',
      tasksCompleted: 'Commissioning',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    // The owner ends the assignment after that day.
    base.sqlite
      .prepare("UPDATE project_member SET ends_on='2026-09-30' WHERE project_id=? AND user_id=?")
      .run(base.project.id, worker.userId);

    expect(base.repository.timeDetail(worker, time.id)).toMatchObject({ id: time.id });
    expect(base.repository.reportDetail(worker, report.id)).toMatchObject({ report: { id: report.id } });
    expect(
      (base.repository.listTimeForScope(worker) as Array<{ id: string }>).map((row) => row.id),
    ).toContain(time.id);
    // Nobody else gains anything.
    expect(() => base.repository.timeDetail(outsider, time.id)).toThrow(AccessDeniedError);
    // No new writes on the ended assignment.
    expect(() =>
      base.repository.createTimeEntry(worker, {
        projectId: base.project.id,
        workDate: '2026-08-21',
        category: 'regular',
        minutes: 60,
        summary: 'Late entry',
      }),
    ).toThrow(AccessDeniedError);
    // A removed (inactive) assignment grants no history.
    base.sqlite
      .prepare("UPDATE project_member SET status='inactive' WHERE project_id=? AND user_id=?")
      .run(base.project.id, worker.userId);
    expect(() => base.repository.timeDetail(worker, time.id)).toThrow(AccessDeniedError);
    expect(base.repository.listTimeForScope(worker)).toEqual([]);
  });

  it('tells lists whether a project page opens, so My Pay links no 403 page (T41)', () => {
    const base = createB5LifecycleSecurityFixture();
    fixtures.push(base);
    const worker = signInB5Principal(base.sqlite, base.worker, 'open-project-worker');
    const outsider = signInB5Principal(base.sqlite, base.outsider, 'open-project-outsider');
    expect(base.repository.canOpenProject(worker, base.project.id)).toBe(true);
    expect(base.repository.canOpenProject(outsider, base.project.id)).toBe(false);
    base.sqlite
      .prepare("UPDATE project_member SET status='inactive' WHERE project_id=? AND user_id=?")
      .run(base.project.id, worker.userId);
    expect(base.repository.canOpenProject(worker, base.project.id)).toBe(false);
  });
});
