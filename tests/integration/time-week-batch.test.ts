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

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

const entry = (projectId: string, workDate: string) => ({
  projectId,
  workDate,
  category: 'regular',
  minutes: 450,
  summary: `Field work on ${workDate}`,
});

describe('weekly time batch and submission', () => {
  it('creates owner daily drafts atomically through the same assignment checks', () => {
    const value = fixture();
    const owner = stepUpB5Principal(value.sqlite, value.owner, 'time-batch');
    expect(() =>
      value.repository.createTimeBatch(owner, value.worker.userId, [
        entry(value.project.id, '2026-08-17'),
        entry('nonexistent-project', '2026-08-18'),
      ]),
    ).toThrow();
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM time_entry').get()).toEqual({
      count: 0,
    });
    const result = value.repository.createTimeBatch(owner, value.worker.userId, [
      entry(value.project.id, '2026-08-17'),
      entry(value.project.id, '2026-08-18'),
    ]);
    expect(result.created).toHaveLength(2);
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM time_entry WHERE approval_state='draft'")
        .get(),
    ).toEqual({ count: 2 });
  });

  it('rejects a stale week without submitting any time or linked meal, then submits both together', () => {
    const value = fixture();
    const first = value.repository.createTimeEntry(
      value.worker,
      entry(value.project.id, '2026-08-17'),
    );
    const linked = value.repository.createTimeWithExpense(
      value.worker,
      entry(value.project.id, '2026-08-18'),
      {
        vendor: 'Test meal',
        category: 'meals',
        description: 'Meal during field work',
        currency: 'USD',
        amountMinor: 1500n,
        whoPaid: 'worker',
        receiptRequired: false,
      },
      'weekly-meal-request-0001',
    );
    const expected = [first, linked.time];
    expect(
      value.repository.listOwnTimeWeek(value.worker, '2026-08-17').rows.map((row) => row.worker_id),
    ).toEqual([value.worker.userId, value.worker.userId]);
    value.repository.updateTimeEntry(value.worker, {
      id: first.id,
      version: first.version,
      summary: 'Updated actual field work',
    });
    expect(() =>
      value.repository.submitTimeWeek(value.worker, value.worker.userId, '2026-08-17', expected),
    ).toThrow('Week changed');
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM time_entry WHERE approval_state='submitted'")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(linked.expense.id),
    ).toEqual({ approval_state: 'draft' });
    expect(
      value.repository.submitTimeWeek(value.worker, value.worker.userId, '2026-08-17', [
        { id: first.id, version: first.version + 1 },
        linked.time,
      ]),
    ).toEqual({ timeSubmitted: 2, mealsSubmitted: 1 });
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM time_entry WHERE approval_state='submitted'")
        .get(),
    ).toEqual({ count: 2 });
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(linked.expense.id),
    ).toEqual({ approval_state: 'submitted' });
  });

  it('rejects missing drafts and another worker without partial submission', () => {
    const value = fixture();
    const first = value.repository.createTimeEntry(
      value.worker,
      entry(value.project.id, '2026-08-17'),
    );
    value.repository.createTimeEntry(value.worker, entry(value.project.id, '2026-08-18'));
    expect(() =>
      value.repository.submitTimeWeek(value.worker, value.worker.userId, '2026-08-17', [first]),
    ).toThrow('Week changed');
    expect(() =>
      value.repository.submitTimeWeek(value.outsider, value.worker.userId, '2026-08-17', [first]),
    ).toThrow();
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM time_entry WHERE approval_state='submitted'")
        .get(),
    ).toEqual({ count: 0 });
  });
});
