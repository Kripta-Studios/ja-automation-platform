import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  readSource,
  seedB5User,
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

describe('requested lifecycle delete and workforce write boundaries', () => {
  it('keeps assignment removal transactional and historical', () => {
    const source = readSource('packages/database/src/domains/workforce/workforce-repository.ts');
    expect(source).toMatch(/UPDATE project_member SET status='inactive'[\s\S]*version=version\+1/);
    expect(source).toMatch(/operation: 'remove'/);
    expect(source).toMatch(/this\.deps\.transaction/);
  });

  it('ends provisional and rate-linked assignments without deleting history', () => {
    const value = fixture();

    const provisional = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-08-24',
    }) as { id: string };
    expect(() => value.repository.deleteAssignment(value.owner, provisional.id)).not.toThrow();
    expect(
      value.sqlite.prepare('SELECT id,status,ends_on FROM project_member WHERE id=?').get(provisional.id),
    ).toMatchObject({ id: provisional.id, status: 'inactive', ends_on: '2026-08-24' });

    const overrideAssignment = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-08-25',
    }) as { id: string };
    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        'INSERT INTO assignment_rate_override(id,project_member_id,effective_from,created_at,updated_at) VALUES(?,?,?,?,?)',
      )
      .run('b5-rate-override', overrideAssignment.id, '2026-08-25', timestamp, timestamp);

    expect(() => value.repository.deleteAssignment(value.owner, overrideAssignment.id)).not.toThrow();
    expect(
      value.sqlite.prepare('SELECT id,status FROM project_member WHERE id=?').get(overrideAssignment.id),
    ).toMatchObject({ id: overrideAssignment.id, status: 'inactive' });
    expect(
      value.sqlite.prepare('SELECT starts_on,ends_on FROM project_member WHERE id=?').get(overrideAssignment.id),
    ).toEqual({ starts_on: '2026-08-25', ends_on: '2026-08-25' });

    const historicalAssignment = value.sqlite
      .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=? LIMIT 1')
      .get(value.project.id, value.worker.userId) as { id: string };
    value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'commissioning',
      minutes: 45,
      summary: 'Assignment history must remain attributable',
    });
    expect(() => value.repository.deleteAssignment(value.owner, historicalAssignment.id)).not.toThrow();
    expect(
      value.sqlite.prepare('SELECT id,status FROM project_member WHERE id=?').get(historicalAssignment.id),
    ).toMatchObject({ id: historicalAssignment.id, status: 'inactive' });
  });

  it('returns a controlled conflict when billing configuration references a contact', () => {
    const value = fixture();
    const contact = value.repository.createClientContact(value.owner, {
      clientId: value.client.id,
      name: 'Billing history contact',
      email: 'billing-history@example.test',
    });
    const timestamp = new Date().toISOString();
    value.sqlite
      .prepare(
        'INSERT INTO billing_rule(id,project_id,stream_type,cadence_type,currency,effective_from,billing_contact_id) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'b5-contact-billing-rule',
        value.project.id,
        'labor',
        'monthly',
        'EUR',
        '2026-01-01',
        contact.id,
      );

    expect(() => value.repository.deleteClientContact(value.owner, contact.id)).toThrow(
      ConflictError,
    );
    expect(() => value.repository.deleteClientContact(value.owner, contact.id)).toThrow(
      /billing history|referenced/i,
    );
    expect(
      value.sqlite.prepare('SELECT id FROM client_contact WHERE id=?').get(contact.id),
    ).toBeTruthy();

    value.sqlite
      .prepare('UPDATE billing_rule SET billing_contact_id=NULL,updated_at=? WHERE id=?')
      .run(timestamp, 'b5-contact-billing-rule');
    expect(() => value.repository.deleteClientContact(value.owner, contact.id)).not.toThrow();
  });

  it('does not allow an auditor to write skills or availability', () => {
    const value = fixture();
    seedB5User(value.sqlite, 'b5-auditor', 'auditor_read_only');
    const auditor = value.repository.principalFor('b5-auditor');
    const skill = value.repository.createSkill(value.owner, {
      code: 'AUDIT-GUARD',
      name: 'Audit guard fixture',
    });

    expect(() =>
      value.repository.createSkill(auditor, { code: 'AUDIT-BLOCKED', name: 'Must not persist' }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.setWorkerSkill(auditor, {
        workerId: value.worker.userId,
        skillId: skill.id,
        proficiency: 3,
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.setWorkerAvailability(auditor, {
        workerId: value.worker.userId,
        startsAt: '2026-08-24T08:00:00.000Z',
        endsAt: '2026-08-24T17:00:00.000Z',
        availability: 'available',
      }),
    ).toThrow(AccessDeniedError);
    expect(value.sqlite.prepare('SELECT COUNT(*) AS count FROM worker_skill').get()).toEqual({
      count: 0,
    });
    expect(value.sqlite.prepare('SELECT COUNT(*) AS count FROM worker_availability').get()).toEqual(
      { count: 0 },
    );
  });
});
