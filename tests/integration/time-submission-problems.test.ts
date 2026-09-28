import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError } from '@ja/database';
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
  const create = () =>
    value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Site installation',
    });
  const submitAudits = (id: string) =>
    (
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='time.submit' AND entity_id=?",
        )
        .get(id) as { count: number }
    ).count;
  return { ...value, create, submitAudits };
}

describe('time submission blockers', () => {
  it('distinguishes an edited draft from an already-submitted record', () => {
    const value = setup();
    const draft = value.create();
    value.repository.updateTimeEntry(value.worker, {
      id: draft.id,
      version: draft.version,
      summary: 'Updated in another tab',
    });
    expect(() => value.repository.submitTime(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Time entry changed before submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(0);
    expect(
      value.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(draft.id),
    ).toEqual({
      approval_state: 'draft',
    });

    value.repository.submitTime(value.worker, draft.id, draft.version + 1);
    expect(value.submitAudits(draft.id)).toBe(1);
    expect(() => value.repository.submitTime(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Time entry is not a draft for submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(1);
  });

  it('keeps a financially locked draft blocked', () => {
    const value = setup();
    const draft = value.create();
    value.sqlite.prepare("UPDATE time_entry SET billing_status='locked' WHERE id=?").run(draft.id);
    expect(() => value.repository.submitTime(value.worker, draft.id, draft.version)).toThrow(
      new ConflictError('Time entry locked before submission'),
    );
    expect(value.submitAudits(draft.id)).toBe(0);
  });

  it('checks effective membership before describing a stale record', () => {
    const value = setup();
    const draft = value.create();
    expect(() => value.repository.submitTime(value.outsider, draft.id, draft.version - 1)).toThrow(
      AccessDeniedError,
    );
    expect(value.submitAudits(draft.id)).toBe(0);
  });
});
