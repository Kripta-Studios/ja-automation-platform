import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';
import type { Principal } from '@ja/domain';
import { TimeEntryRepository } from '../../packages/database/src/domains/time/time-entry-repository.ts';
import { runImmediateTransaction } from '../../packages/database/src/core/transaction.ts';
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

function createTime(
  value: B5LifecycleSecurityFixture,
  input: Partial<{
    workDate: string;
    category: string;
    minutes: number;
    summary: string;
  }> = {},
) {
  return value.repository.createTimeEntry(value.worker, {
    projectId: value.project.id,
    workDate: input.workDate ?? '2026-08-20',
    category: input.category ?? 'regular',
    minutes: input.minutes ?? 60,
    summary: input.summary ?? 'Time validation fixture',
  });
}

function setInterval(
  value: B5LifecycleSecurityFixture,
  id: string,
  version: number,
  startTime: string,
  endTime: string,
  minutes: number,
  breakMinutes = 0,
) {
  return value.repository.updateTimeEntry(value.worker, {
    id,
    version,
    startTime,
    endTime,
    minutes,
    breakMinutes,
  });
}

function timeDomain(sqlite: DatabaseSync, audit: (principal: Principal) => void = () => {}) {
  return new TimeEntryRepository({
    sqlite,
    transaction: (work) => runImmediateTransaction(sqlite, 'time-validation-test', work),
    assertActive: () => {},
    assertReadable: () => {},
    audit,
    assertDate: (value, field) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${field} is invalid`);
    },
    assertText: (value) => value.trim(),
    shiftIsoDate: (value, days) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    },
    now: () => new Date().toISOString(),
    errors: {
      accessDenied: (message) => {
        throw new AccessDeniedError(message);
      },
      conflict: (message) => {
        throw new Error(message);
      },
      validation: (message) => {
        throw new ValidationError(message);
      },
    },
  });
}

function openSecondConnection(value: B5LifecycleSecurityFixture): DatabaseSync {
  const sqlite = new DatabaseSync(join(value.directory, 'app.db'));
  sqlite.exec('PRAGMA busy_timeout=5000');
  return sqlite;
}

const competingWriterSource = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { DatabaseSync } = require('node:sqlite');
  const sqlite = new DatabaseSync(workerData.dbPath);
  try {
    sqlite.exec('PRAGMA busy_timeout=50');
    sqlite.exec('BEGIN IMMEDIATE');
    sqlite.prepare(
      'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,start_time,end_time,break_minutes,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      workerData.rowId,
      workerData.projectId,
      workerData.workerId,
      workerData.workDate,
      workerData.category,
      workerData.minutes,
      workerData.startTime ?? null,
      workerData.endTime ?? null,
      workerData.breakMinutes ?? null,
      'draft',
      'pending',
      workerData.timestamp,
      workerData.timestamp,
    );
    parentPort.postMessage({ type: 'held' });
    Atomics.wait(new Int32Array(workerData.gate), 0, 0, 100);
    sqlite.exec('COMMIT');
    parentPort.postMessage({ type: 'committed' });
  } catch (error) {
    try { sqlite.exec('ROLLBACK'); } catch {}
    parentPort.postMessage({ type: 'error', message: String(error) });
  } finally {
    sqlite.close();
  }
`;

async function startCompetingWriter(
  value: B5LifecycleSecurityFixture,
  input: Readonly<{
    rowId: string;
    category: string;
    minutes: number;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
  }>,
) {
  const worker = new Worker(competingWriterSource, {
    eval: true,
    workerData: {
      dbPath: join(value.directory, 'app.db'),
      rowId: input.rowId,
      projectId: value.project.id,
      workerId: value.worker.userId,
      workDate: '2026-08-20',
      category: input.category,
      minutes: input.minutes,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      timestamp: new Date().toISOString(),
      gate: new SharedArrayBuffer(4),
    },
  });
  let resolveHeld!: () => void;
  let rejectHeld!: (error: unknown) => void;
  let resolveFinished!: () => void;
  let rejectFinished!: (error: unknown) => void;
  const held = new Promise<void>((resolve, reject) => {
    resolveHeld = resolve;
    rejectHeld = reject;
  });
  const finished = new Promise<void>((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });
  worker.on('message', (message: { type: string; message?: string }) => {
    if (message.type === 'held') resolveHeld();
    else if (message.type === 'committed') resolveFinished();
    else rejectFinished(new Error(message.message ?? 'Competing writer failed'));
  });
  worker.on('error', (error) => {
    rejectHeld(error);
    rejectFinished(error);
  });
  await held;
  return { worker, finished };
}

describe('Client Essential time-entry validation', () => {
  it('enforces the 1440-minute worker/day aggregate and excludes void/rejected rows', () => {
    const value = fixture();
    createTime(value, { minutes: 1_000 });
    expect(() => createTime(value, { minutes: 441 })).toThrow(ValidationError);
    expect(value.sqlite.prepare('SELECT count(*) AS count FROM time_entry').get()).toEqual({
      count: 1,
    });

    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='rejected' WHERE worker_id='b5-worker'")
      .run();
    expect(createTime(value, { minutes: 1_440 })).toEqual(expect.objectContaining({ version: 1 }));
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='void' WHERE worker_id='b5-worker'")
      .run();
    expect(createTime(value, { minutes: 1_440 })).toEqual(expect.objectContaining({ version: 1 }));
  });

  it('validates the effective date and minutes on update, then revalidates legacy drafts on submit', () => {
    const value = fixture();
    createTime(value, { workDate: '2026-08-20', minutes: 1_000 });
    const second = createTime(value, { workDate: '2026-08-21', minutes: 500 });

    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: second.id,
        version: second.version,
        workDate: '2026-08-20',
      }),
    ).toThrow(ValidationError);
    expect(
      value.sqlite.prepare('SELECT work_date,version FROM time_entry WHERE id=?').get(second.id),
    ).toEqual({ work_date: '2026-08-21', version: 1 });

    // Model a legacy/imported row that bypassed the repository's aggregate
    // guard while still satisfying the database's per-row CHECK constraint.
    value.sqlite.prepare("UPDATE time_entry SET work_date='2026-08-20' WHERE id=?").run(second.id);
    expect(() => value.repository.submitTime(value.worker, second.id, second.version)).toThrow(
      ValidationError,
    );
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM time_entry WHERE id=?')
        .get(second.id),
    ).toEqual({ approval_state: 'draft', version: 1 });
  });

  it('accepts regular, standby, overtime and travel categories when their minutes are valid', () => {
    const value = fixture();
    for (const category of ['regular', 'standby', 'overtime', 'travel']) {
      expect(createTime(value, { category, minutes: 60 })).toEqual(
        expect.objectContaining({ version: 1 }),
      );
    }
  });

  it('requires strict same-day intervals and exact elapsed-minus-break minutes', () => {
    const value = fixture();
    const entry = createTime(value, { minutes: 480 });

    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: entry.id,
        version: entry.version,
        startTime: '9:00',
        endTime: '17:00',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: entry.id,
        version: entry.version,
        startTime: '22:00',
        endTime: '02:00',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: entry.id,
        version: entry.version,
        startTime: '09:00',
        endTime: '17:00',
        minutes: 480,
        breakMinutes: 481,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.updateTimeEntry(value.worker, {
        id: entry.id,
        version: entry.version,
        startTime: '09:00',
        endTime: '17:00',
        minutes: 479,
        breakMinutes: 0,
      }),
    ).toThrow(ValidationError);

    expect(setInterval(value, entry.id, entry.version, '09:00', '17:30', 480, 30)).toEqual({
      id: entry.id,
      version: 2,
    });
  });

  it('validates intervals on the direct create path before inserting the row', () => {
    const value = fixture();
    const domain = timeDomain(value.sqlite);
    const entry = domain.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'travel',
      minutes: 480,
      summary: 'Direct create interval',
      startTime: '09:00',
      endTime: '17:30',
      breakMinutes: 30,
    });
    expect(
      value.sqlite
        .prepare('SELECT start_time,end_time,break_minutes,minutes FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({ start_time: '09:00', end_time: '17:30', break_minutes: 30, minutes: 480 });

    expect(() =>
      domain.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate: '2026-08-20',
        category: 'travel',
        minutes: 60,
        summary: 'Invalid direct create interval',
        startTime: '22:00',
        endTime: '02:00',
        breakMinutes: 0,
      }),
    ).toThrow(ValidationError);
  });

  it('denies a backdated create after the assignment ended before the current date, before input validation', () => {
    const value = fixture();
    value.sqlite
      .prepare("UPDATE project_member SET ends_on='2026-08-21' WHERE project_id=? AND user_id=?")
      .run(value.project.id, value.worker.userId);

    expect(() =>
      value.repository.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate: '2026-08-20',
        category: 'regular',
        minutes: 2_000,
        summary: 'Revoked current assignment must win over invalid minutes',
      }),
    ).toThrow(AccessDeniedError);
    expect(value.sqlite.prepare('SELECT count(*) AS count FROM time_entry').get()).toEqual({
      count: 0,
    });
  });

  it('rejects overlapping intervals but permits adjacency, including across categories', () => {
    const value = fixture();
    const morning = createTime(value, { minutes: 180, category: 'regular' });
    expect(setInterval(value, morning.id, morning.version, '09:00', '12:00', 180)).toEqual({
      id: morning.id,
      version: 2,
    });

    const afternoon = createTime(value, { minutes: 180, category: 'standby' });
    expect(setInterval(value, afternoon.id, afternoon.version, '12:00', '15:00', 180)).toEqual({
      id: afternoon.id,
      version: 2,
    });

    const overlap = createTime(value, { minutes: 60, category: 'overtime' });
    expect(() => setInterval(value, overlap.id, overlap.version, '11:59', '13:00', 61)).toThrow(
      ValidationError,
    );
  });

  it('revalidates an existing interval during submit and rolls back the state transition', () => {
    const value = fixture();
    const entry = createTime(value, { minutes: 60 });
    value.sqlite
      .prepare(
        "UPDATE time_entry SET start_time='09:00',end_time='10:00',break_minutes=0 WHERE id=?",
      )
      .run(entry.id);
    // The row is intentionally invalidated after draft creation to model a
    // legacy/imported record bypassing the normal update path.
    value.sqlite.prepare('UPDATE time_entry SET minutes=59 WHERE id=?').run(entry.id);

    expect(() => value.repository.submitTime(value.worker, entry.id, entry.version)).toThrow(
      ValidationError,
    );
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({ approval_state: 'draft', version: 1 });
  });

  it('does not turn an unauthorized caller into a validation oracle', () => {
    const value = fixture();
    const entry = createTime(value, { minutes: 60 });
    expect(() => value.repository.submitTime(value.outsider, entry.id, entry.version)).toThrow(
      AccessDeniedError,
    );
  });

  it('rechecks current and object-date membership inside submit/update/delete transactions', () => {
    const value = fixture();
    const domain = timeDomain(value.sqlite);
    const submit = domain.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Revoked submit',
    });
    const update = domain.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Revoked update',
    });
    const remove = domain.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Revoked delete',
    });
    const second = openSecondConnection(value);
    try {
      second
        .prepare("UPDATE project_member SET ends_on='2026-08-19' WHERE project_id=? AND user_id=?")
        .run(value.project.id, value.worker.userId);
    } finally {
      second.close();
    }

    value.sqlite.prepare('UPDATE time_entry SET minutes=1400 WHERE id=?').run(update.id);
    expect(() => domain.submitTime(value.worker, submit.id, submit.version)).toThrow(
      AccessDeniedError,
    );
    expect(() =>
      domain.updateTimeEntry(value.worker, {
        id: update.id,
        version: update.version,
        minutes: 2000,
      }),
    ).toThrow(AccessDeniedError);
    expect(() => domain.deleteTime(value.worker, remove.id, remove.version)).toThrow(
      AccessDeniedError,
    );
    expect(
      value.sqlite
        .prepare('SELECT count(*) AS count FROM time_entry WHERE id IN (?,?,?)')
        .get(submit.id, update.id, remove.id),
    ).toEqual({ count: 3 });
  });

  it('rolls back a void mutation when its audit write fails', () => {
    const value = fixture();
    const domain = timeDomain(value.sqlite);
    const entry = domain.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Audit rollback',
    });
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='submitted' WHERE id=?")
      .run(entry.id);
    const failingDomain = timeDomain(value.sqlite, () => {
      throw new Error('AUDIT_FAILURE');
    });

    expect(() => failingDomain.deleteTime(value.worker, entry.id, entry.version)).toThrow(
      'AUDIT_FAILURE',
    );
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({ approval_state: 'submitted', version: 1 });
  });

  it('uses genuine cross-thread contention so aggregate-conflicting creates cannot both succeed', async () => {
    const value = fixture();
    const domain = timeDomain(value.sqlite);
    domain.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 900,
      summary: 'Contention seed',
    });
    const contender = await startCompetingWriter(value, {
      rowId: 'contention-aggregate-writer',
      category: 'standby',
      minutes: 500,
    });
    let result: unknown;
    try {
      try {
        result = domain.createTimeEntry(value.worker, {
          projectId: value.project.id,
          workDate: '2026-08-20',
          category: 'overtime',
          minutes: 500,
          summary: 'Contention application writer',
        });
      } catch (error) {
        result = error;
      }
    } finally {
      await contender.finished;
      await contender.worker.terminate();
    }
    expect(result).toBeInstanceOf(ValidationError);
    const persisted = value.sqlite
      .prepare(
        "SELECT COALESCE(SUM(minutes),0) AS minutes, count(*) AS count FROM time_entry WHERE worker_id=? AND work_date=? AND approval_state NOT IN ('void','rejected')",
      )
      .get(value.worker.userId, '2026-08-20') as { minutes: number; count: number };
    expect(persisted).toEqual({ minutes: 1_400, count: 2 });
  });

  it('uses genuine cross-thread contention so overlapping interval writes cannot both succeed', async () => {
    const value = fixture();
    const domain = timeDomain(value.sqlite);
    const contender = await startCompetingWriter(value, {
      rowId: 'contention-overlap-writer',
      category: 'standby',
      minutes: 60,
      startTime: '09:30',
      endTime: '10:30',
      breakMinutes: 0,
    });
    let result: unknown;
    try {
      try {
        result = domain.createTimeEntry(value.worker, {
          projectId: value.project.id,
          workDate: '2026-08-20',
          category: 'regular',
          minutes: 60,
          summary: 'Contention interval application writer',
          startTime: '09:00',
          endTime: '10:00',
          breakMinutes: 0,
        });
      } catch (error) {
        result = error;
      }
    } finally {
      await contender.finished;
      await contender.worker.terminate();
    }
    expect(result).toBeInstanceOf(ValidationError);
    const intervals = value.sqlite
      .prepare(
        "SELECT id,start_time,end_time FROM time_entry WHERE worker_id=? AND work_date=? AND start_time IS NOT NULL AND end_time IS NOT NULL AND approval_state NOT IN ('void','rejected')",
      )
      .all(value.worker.userId, '2026-08-20') as Array<{
      id: string;
      start_time: string;
      end_time: string;
    }>;
    expect(intervals).toEqual([
      { id: 'contention-overlap-writer', start_time: '09:30', end_time: '10:30' },
    ]);
  });
});
