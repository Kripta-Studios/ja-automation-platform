import { afterEach, describe, expect, it } from 'vitest';
import { weeklyView } from '$lib/server/portal-week';
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

describe('time interval operational listings', () => {
  it('returns canonical intervals to the worker and authorized owner without leaking finance fields', () => {
    const value = fixture();
    const entry = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 210,
      summary: 'Interval listing regression',
    });
    value.repository.updateTimeEntry(value.worker, {
      id: entry.id,
      version: entry.version,
      minutes: 210,
      startTime: '08:15',
      endTime: '12:00',
      breakMinutes: 15,
    });

    const expectedInterval = {
      id: entry.id,
      minutes: 210,
      start_time: '08:15',
      end_time: '12:00',
      break_minutes: 15,
    };
    const workerRow = value.repository
      .listTimeForScope(value.worker)
      .find((row) => row.id === entry.id);
    const ownerRow = value.repository
      .listTimeForScope(value.owner)
      .find((row) => row.id === entry.id);

    expect(workerRow).toMatchObject(expectedInterval);
    expect(ownerRow).toMatchObject(expectedInterval);
    expect(workerRow).not.toHaveProperty('invoice_id');
    expect(workerRow).not.toHaveProperty('client_rate_minor');
    expect(workerRow).not.toHaveProperty('compensation_amount_minor');
    expect(workerRow).not.toHaveProperty('internal_cost_minor');
    expect(workerRow).not.toHaveProperty('billing_status');
  });

  it('preserves intervals in own-history and own-week projections', () => {
    const value = fixture();
    const entry = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 210,
      summary: 'Own interval listing regression',
    });
    value.repository.updateTimeEntry(value.worker, {
      id: entry.id,
      version: entry.version,
      minutes: 210,
      startTime: '08:15',
      endTime: '12:00',
      breakMinutes: 15,
    });
    const expectedInterval = {
      id: entry.id,
      start_time: '08:15',
      end_time: '12:00',
      break_minutes: 15,
    };

    expect(value.repository.listOwnTime(value.worker)).toEqual(
      expect.arrayContaining([expect.objectContaining(expectedInterval)]),
    );
    expect(value.repository.listOwnTimeWeek(value.worker, '2026-08-17').rows).toEqual(
      expect.arrayContaining([expect.objectContaining(expectedInterval)]),
    );
  });

  it('excludes rejected and void history and resolves correction attempts in the own week', () => {
    const value = fixture();
    const create = (minutes: number, summary: string) =>
      value.repository.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate: '2026-08-20',
        category: 'regular',
        minutes,
        summary,
      });
    const approved = create(60, 'Approved first');
    const rejected = create(360, 'Rejected history');
    const voided = create(45, 'Voided history');
    const original = create(105, 'Original needing correction');
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='approved' WHERE id=?")
      .run(approved.id);
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='rejected' WHERE id=?")
      .run(rejected.id);
    value.sqlite.prepare("UPDATE time_entry SET approval_state='void' WHERE id=?").run(voided.id);
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='needs_changes' WHERE id=?")
      .run(original.id);

    const worker = stepUpB5Principal(value.sqlite, value.worker, 'week-correction');
    const correction = value.repository.createCorrectionDraft(worker, {
      recordType: 'time_entry',
      originalId: original.id,
      requestId: 'week-correction-0001',
      reason: 'Use the corrected duration',
      patch: { minutes: 100 },
    });
    const activeIds = () =>
      (
        value.repository.listOwnTimeWeek(value.worker, '2026-08-17').rows as Array<{ id: string }>
      ).map((row) => row.id);
    expect(activeIds()).toEqual([approved.id, correction.correctionId]);
    const managerRows = () =>
      value.repository.listTimeForScope(value.manager, {
        from: '2026-08-20',
        to: '2026-08-20',
      });
    expect(managerRows().find((row) => row.id === original.id)).toMatchObject({
      active_correction_id: correction.correctionId,
    });
    expect(weeklyView(managerRows(), '2026-08-17').days[3].actualMinutes).toBe(160);
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='rejected' WHERE id=?")
      .run(correction.correctionId);
    expect(activeIds()).toEqual([approved.id, original.id]);
    expect(managerRows().find((row) => row.id === original.id)).toMatchObject({
      active_correction_id: null,
    });
    expect(weeklyView(managerRows(), '2026-08-17').days[3].actualMinutes).toBe(165);
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='void' WHERE id=?")
      .run(correction.correctionId);
    expect(activeIds()).toEqual([approved.id, original.id]);
    expect(managerRows().find((row) => row.id === original.id)).toMatchObject({
      active_correction_id: null,
    });
    expect(weeklyView(managerRows(), '2026-08-17').days[3].actualMinutes).toBe(165);
    expect(
      value.repository.copyOwnTimeLayout(value.worker, '2026-08-17', '2026-08-24'),
    ).toMatchObject({
      created: 2,
    });
    expect(value.repository.listOwnTime(value.worker)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: rejected.id })]),
    );
  });
});
