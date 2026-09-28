import { afterEach, describe, expect, it } from 'vitest';
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
  // Production currently keeps the legacy queue append-only. These tests
  // remove only its insert guard so the still-supported sync implementation
  // can be exercised without weakening the migration invariant.
  value.sqlite.exec('DROP TRIGGER offline_mutation_legacy_no_insert');
  fixtures.push(value);
  return value;
}

function createInterval(
  value: B5LifecycleSecurityFixture,
  startTime: string,
  endTime: string,
  minutes: number,
) {
  const entry = value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes,
    summary: `Existing interval ${startTime}-${endTime}`,
  });
  return value.repository.updateTimeEntry(value.worker, {
    id: entry.id,
    version: entry.version,
    minutes,
    startTime,
    endTime,
    breakMinutes: 0,
  });
}

describe('offline time intervals', () => {
  it('persists a canonical interval when an offline draft syncs', () => {
    const value = fixture();
    const entityId = '0198be45-cd9c-7ab4-9a5a-a6c000000101';

    expect(
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000102',
        entityType: 'time',
        entityId,
        baseVersion: 0,
        payload: {
          projectId: value.project.id,
          workDate: '2026-08-20',
          category: 'regular',
          summary: 'Offline interval draft',
          startTime: '08:00',
          endTime: '12:30',
          breakMinutes: 30,
          minutes: 1,
        },
        attachments: [],
      }),
    ).toEqual({ outcome: 'accepted', version: 1 });
    expect(
      value.sqlite
        .prepare('SELECT minutes,start_time,end_time,break_minutes FROM time_entry WHERE id=?')
        .get(entityId),
    ).toEqual({ minutes: 240, start_time: '08:00', end_time: '12:30', break_minutes: 30 });
  });

  it('keeps legacy duration-only offline drafts free of invented intervals', () => {
    const value = fixture();
    const entityId = '0198be45-cd9c-7ab4-9a5a-a6c000000103';

    value.v3.syncMutation(value.worker, {
      mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000104',
      entityType: 'time',
      entityId,
      baseVersion: 0,
      payload: {
        projectId: value.project.id,
        workDate: '2026-08-20',
        category: 'regular',
        summary: 'Legacy offline duration draft',
        minutes: 45,
      },
      attachments: [],
    });

    expect(
      value.sqlite
        .prepare('SELECT minutes,start_time,end_time,break_minutes FROM time_entry WHERE id=?')
        .get(entityId),
    ).toEqual({ minutes: 45, start_time: null, end_time: null, break_minutes: null });
  });

  it('keeps legacy duration-only update payloads compatible', () => {
    const value = fixture();
    const entry = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 30,
      summary: 'Legacy online draft',
    });

    expect(
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000105',
        entityType: 'time',
        entityId: entry.id,
        baseVersion: entry.version,
        payload: {
          category: 'regular',
          summary: 'Legacy offline edit',
          minutes: 50,
        },
        attachments: [],
      }),
    ).toEqual({ outcome: 'accepted', version: 2 });
    expect(
      value.sqlite
        .prepare('SELECT minutes,start_time,end_time,break_minutes FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({ minutes: 50, start_time: null, end_time: null, break_minutes: null });
  });

  it('rejects an overlapping interval during offline creation', () => {
    const value = fixture();
    createInterval(value, '08:00', '12:00', 240);

    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000106',
        entityType: 'time',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c000000107',
        baseVersion: 0,
        payload: {
          projectId: value.project.id,
          workDate: '2026-08-20',
          category: 'regular',
          summary: 'Overlapping offline creation',
          startTime: '09:00',
          endTime: '11:00',
        },
        attachments: [],
      }),
    ).toThrow(/cannot overlap/i);
  });

  it('rejects a daily total above 1440 minutes during offline creation', () => {
    const value = fixture();
    value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 1400,
      summary: 'Existing daily duration',
    });

    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000108',
        entityType: 'time',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c000000109',
        baseVersion: 0,
        payload: {
          projectId: value.project.id,
          workDate: '2026-08-20',
          category: 'regular',
          summary: 'Excess offline daily duration',
          minutes: 60,
        },
        attachments: [],
      }),
    ).toThrow(/1440 minutes per day/i);
  });

  it('rejects an overlapping interval during offline update', () => {
    const value = fixture();
    createInterval(value, '08:00', '12:00', 240);
    const edited = createInterval(value, '13:00', '15:00', 120);

    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000110',
        entityType: 'time',
        entityId: edited.id,
        baseVersion: edited.version,
        payload: {
          category: 'regular',
          summary: 'Overlapping offline update',
          startTime: '10:00',
          endTime: '11:00',
        },
        attachments: [],
      }),
    ).toThrow(/cannot overlap/i);
    expect(
      value.sqlite.prepare('SELECT start_time,end_time FROM time_entry WHERE id=?').get(edited.id),
    ).toEqual({ start_time: '13:00', end_time: '15:00' });
  });

  it('rejects a daily total above 1440 minutes during offline update', () => {
    const value = fixture();
    value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 1000,
      summary: 'First daily duration',
    });
    const edited = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 400,
      summary: 'Second daily duration',
    });

    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId: '0198be45-cd9c-7ab4-9a5a-a6c000000111',
        entityType: 'time',
        entityId: edited.id,
        baseVersion: edited.version,
        payload: {
          category: 'regular',
          summary: 'Excess offline duration update',
          minutes: 500,
        },
        attachments: [],
      }),
    ).toThrow(/1440 minutes per day/i);
    expect(
      value.sqlite.prepare('SELECT minutes FROM time_entry WHERE id=?').get(edited.id),
    ).toEqual({
      minutes: 400,
    });
  });
});
