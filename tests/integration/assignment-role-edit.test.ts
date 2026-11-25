import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

// Assignment edit can change the role on the project (worker / project manager), with the
// same choices as adding people and the existing owner + project manager rules.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

type Assignment = { id: string; version: number; assignment_role: string; can_review: number };

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const of = (userId: string) =>
    fixture.sqlite
      .prepare(
        'SELECT id,version,assignment_role,can_review FROM project_member WHERE user_id=? ORDER BY created_at LIMIT 1',
      )
      .get(userId) as Assignment;
  const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'role-edit-manager');
  return { fixture, of, manager };
}

describe('assignment role edit', () => {
  it('the owner makes a project manager account project manager on the project and back', () => {
    const { fixture, of } = setup();
    const before = of('b5-manager');
    expect(before.assignment_role).toBe('worker');
    fixture.sqlite.prepare('UPDATE project_member SET can_review=0 WHERE id=?').run(before.id);
    fixture.repository.updateAssignment(fixture.owner, before.id, {
      version: before.version,
      assignmentRole: 'project_manager',
    });
    const promoted = of('b5-manager');
    expect(promoted).toMatchObject({ assignment_role: 'project_manager', can_review: 1 });
    const audit = fixture.sqlite
      .prepare(
        "SELECT metadata_json FROM audit_event WHERE action='assignment.update' AND entity_id=? ORDER BY occurred_at DESC LIMIT 1",
      )
      .get(before.id) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json)).toMatchObject({
      assignmentRole: { from: 'worker', to: 'project_manager' },
    });
    fixture.repository.updateAssignment(fixture.owner, before.id, {
      version: promoted.version,
      assignmentRole: 'worker',
    });
    expect(of('b5-manager').assignment_role).toBe('worker');
  });

  it('refuses roles outside the create choices and a worker account as project manager', () => {
    const { fixture, of } = setup();
    const worker = of('b5-worker');
    expect(() =>
      fixture.repository.updateAssignment(fixture.owner, worker.id, {
        version: worker.version,
        assignmentRole: 'owner_admin',
      }),
    ).toThrow(/worker or project manager/);
    expect(() =>
      fixture.repository.updateAssignment(fixture.owner, worker.id, {
        version: worker.version,
        assignmentRole: 'project_manager',
      }),
    ).toThrow(/project manager account/);
    expect(of('b5-worker')).toMatchObject({ assignment_role: 'worker', version: worker.version });
  });

  it('a project manager may change roles of others on their project but not their own', () => {
    const { fixture, of, manager } = setup();
    const own = of('b5-manager');
    fixture.repository.updateAssignment(fixture.owner, own.id, {
      version: own.version,
      assignmentRole: 'project_manager',
    });
    const promoted = of('b5-manager');
    expect(() =>
      fixture.repository.updateAssignment(manager, promoted.id, {
        version: promoted.version,
        assignmentRole: 'worker',
      }),
    ).toThrow(/your own role/);
    // Saving their own dates with the unchanged role still works.
    fixture.repository.updateAssignment(manager, promoted.id, {
      version: promoted.version,
      assignmentRole: 'project_manager',
    });
    const worker = of('b5-worker');
    fixture.repository.updateAssignment(manager, worker.id, {
      version: worker.version,
      assignmentRole: 'worker',
    });
    expect(of('b5-worker').assignment_role).toBe('worker');
  });

  it('keeps a supplier coordinator scope role', () => {
    const { fixture, of } = setup();
    const worker = of('b5-worker');
    fixture.sqlite
      .prepare("UPDATE project_member SET assignment_role='supplier_coordinator' WHERE id=?")
      .run(worker.id);
    expect(() =>
      fixture.repository.updateAssignment(fixture.owner, worker.id, {
        version: worker.version,
        assignmentRole: 'worker',
      }),
    ).toThrow(/keeps its role/);
  });
});
