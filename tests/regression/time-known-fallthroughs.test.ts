import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import { timeActionFailure } from '../../apps/portal/src/lib/server/actions/time-actions';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

const draft = (projectId: string) => ({
  projectId,
  workDate: '2026-08-17',
  category: 'regular',
  minutes: 120,
  summary: 'Retain entered work details',
});

describe('time access changes after opening a form', () => {
  it.each([
    [
      'Owner administration required to record for another worker',
      'TIME_OTHER_WORKER_OWNER_REQUIRED',
      'problem.time.otherWorkerOwnerRequired',
      'contact_project_owner',
      {},
    ],
    [
      'Operational project access required',
      'TIME_PROJECT_NOT_OPERATIONAL',
      'problem.time.projectNotOperational',
      'contact_project_owner',
      { projectId: ['problem.time.projectNotOperational'] },
    ],
    [
      'Only the owner can submit another worker’s week',
      'TIME_OTHER_WORKER_WEEK_OWNER_REQUIRED',
      'problem.time.otherWorkerWeekOwnerRequired',
      'contact_project_owner',
      {},
    ],
    [
      'Current supplier project grant required',
      'TIME_SUPPLIER_GRANT_EXPIRED',
      'problem.time.supplierGrantExpired',
      'contact_owner',
      {},
    ],
  ] as const)(
    'returns %s as a role-safe, retained-value problem',
    (literal, code, messageKey, remedy, fieldErrors) => {
      const response = timeActionFailure(new AccessDeniedError(literal), {
        workerId: 'selected-worker',
        projectId: 'selected-project',
        workDate: '2026-08-17',
        summary: 'Retain entered work details',
        weekStart: '2026-08-17',
        secret: 'private input',
      });
      expect(response.status).toBe(403);
      expect(response.data).toMatchObject({
        code,
        messageKey,
        fieldErrors,
        remedies: [{ id: remedy }],
        values: {
          workerId: 'selected-worker',
          projectId: 'selected-project',
          workDate: '2026-08-17',
          summary: 'Retain entered work details',
          weekStart: '2026-08-17',
        },
      });
      expect(response.data.message).not.toBe(literal);
      expect(JSON.stringify(response.data)).not.toContain('private input');
      expect(JSON.parse(JSON.stringify(response.data))).toEqual(response.data);
    },
  );

  it('rejects another worker entry before any time or audit write', () => {
    const value = fixture();
    let error: unknown;
    try {
      value.repository.createTimeEntry(
        value.outsider,
        draft(value.project.id),
        value.worker.userId,
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(timeActionFailure(error).data.code).toBe('TIME_OTHER_WORKER_OWNER_REQUIRED');
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM time_entry').get()).toEqual({
      count: 0,
    });
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM audit_event WHERE action='time.create'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('keeps a batch project access error in the summary when no projectId field is posted', () => {
    const response = timeActionFailure(
      new AccessDeniedError('Operational project access required'),
      { workerId: 'selected-worker', entries: JSON.stringify([draft('selected-project')]) },
    );
    expect(response.data).toMatchObject({
      code: 'TIME_PROJECT_NOT_OPERATIONAL',
      fieldErrors: {},
      values: { workerId: 'selected-worker' },
    });
  });

  it('rejects a newly Closing project without saving entered time', () => {
    const value = fixture();
    value.sqlite.prepare("UPDATE project SET status='closing' WHERE id=?").run(value.project.id);
    let error: unknown;
    try {
      value.repository.createTimeEntry(value.worker, draft(value.project.id));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(
      timeActionFailure(error, { ...draft(value.project.id), minutes: '120' }).data,
    ).toMatchObject({
      code: 'TIME_PROJECT_NOT_OPERATIONAL',
      fieldErrors: { projectId: ['problem.time.projectNotOperational'] },
      values: { ...draft(value.project.id), minutes: '120' },
    });
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM time_entry').get()).toEqual({
      count: 0,
    });
  });

  it('cannot submit another worker’s week or modify its draft', () => {
    const value = fixture();
    const entry = value.repository.createTimeEntry(value.worker, draft(value.project.id));
    let error: unknown;
    try {
      value.repository.submitTimeWeek(value.outsider, value.worker.userId, '2026-08-17', [entry]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(timeActionFailure(error).data.code).toBe('TIME_OTHER_WORKER_WEEK_OWNER_REQUIRED');
    expect(
      value.sqlite
        .prepare('SELECT approval_state,version FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({ approval_state: 'draft', version: entry.version });
  });
});
