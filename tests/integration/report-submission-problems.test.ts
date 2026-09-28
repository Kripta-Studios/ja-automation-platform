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

function setup() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const daily = value.repository.createDailyReport(value.worker, {
    projectId: value.project.id,
    workDate: '2026-08-20',
    summary: 'Daily source truth',
    tasksCompleted: 'Commissioning tasks',
    downtimeMinutes: 0,
    safetyRelated: false,
  });
  const edit = (version: number, summary: string) =>
    value.repository.updateDailyReport(value.worker, {
      id: daily.id,
      version,
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary,
      tasksCompleted: 'Commissioning tasks',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
  const submitAudits = () =>
    (
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='daily_report.submit' AND entity_id=?",
        )
        .get(daily.id) as { count: number }
    ).count;
  return { ...value, daily, edit, submitAudits };
}

describe('report submission blockers', () => {
  it('distinguishes a stale draft from a submitted report without another audit', () => {
    const value = setup();
    const edited = value.edit(value.daily.version, 'Changed in another tab');
    expect(() =>
      value.repository.submitReport(value.worker, 'daily', value.daily.id, value.daily.version),
    ).toThrow(new ConflictError('Report changed before submission'));
    expect(value.submitAudits()).toBe(0);

    value.repository.submitReport(value.worker, 'daily', value.daily.id, edited.version);
    expect(value.submitAudits()).toBe(1);
    expect(() =>
      value.repository.submitReport(value.worker, 'daily', value.daily.id, edited.version),
    ).toThrow(new ConflictError('Report status blocks submission'));
    expect(value.submitAudits()).toBe(1);
  });

  it('keeps Needs changes eligible and reports a stale version accurately', () => {
    const value = setup();
    value.repository.submitReport(value.worker, 'daily', value.daily.id, value.daily.version);
    value.repository.reviewReport(
      value.manager,
      'daily',
      value.daily.id,
      'needs_changes',
      'Clarify commissioning tasks',
    );
    const returned = value.sqlite
      .prepare('SELECT approval_state,version FROM daily_report WHERE id=?')
      .get(value.daily.id) as { approval_state: string; version: number };
    expect(returned.approval_state).toBe('needs_changes');
    const edited = value.edit(returned.version, 'Clarified commissioning tasks');
    expect(() =>
      value.repository.submitReport(value.worker, 'daily', value.daily.id, returned.version),
    ).toThrow(new ConflictError('Report changed before submission'));
    expect(value.submitAudits()).toBe(1);
    value.repository.submitReport(value.worker, 'daily', value.daily.id, edited.version);
    expect(value.submitAudits()).toBe(2);
  });
});
