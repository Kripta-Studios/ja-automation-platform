import { afterEach, describe, expect, it } from 'vitest';
import { recordAuditEvent, redactAuditDetails } from '../../packages/database/src/core/audit.ts';
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

describe('B5 audit immutability/redaction', () => {
  it('rejects direct UPDATE and DELETE of immutable audit rows', () => {
    const value = fixture();
    recordAuditEvent(value.sqlite, value.owner, 'project.update', 'project', value.project.id, {
      projectId: value.project.id,
      reason: 'immutable',
    });
    const row = value.sqlite
      .prepare(
        "SELECT id FROM audit_event WHERE action='project.update' ORDER BY occurred_at DESC LIMIT 1",
      )
      .get() as { id: string };

    expect(() =>
      value.sqlite.prepare("UPDATE audit_event SET action='tampered' WHERE id=?").run(row.id),
    ).toThrow();
    expect(() => value.sqlite.prepare('DELETE FROM audit_event WHERE id=?').run(row.id)).toThrow();
  });

  it('redacts secrets embedded inside free text rather than key names only', () => {
    const redacted = redactAuditDetails({
      reason: 'Authorization: Bearer super-secret-token',
      detail: 'password=hunter2',
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('hunter2');
  });
});
