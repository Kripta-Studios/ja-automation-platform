import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';

const fixtures: ReturnType<typeof createB5LifecycleSecurityFixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const base = {
    projectId: fixture.project.id,
    workerId: fixture.worker.userId,
    startsAt: '2026-10-12T08:00:00.000Z',
    endsAt: '2026-10-12T10:00:00.000Z',
    plannedMinutes: 120,
  };
  const assignment = fixture.repository.createPlanningAssignment(fixture.manager, base);
  return { ...fixture, base, assignment };
}

describe('published planning assignment lifecycle', () => {
  it('offers future assigned workers to a currently scoped manager without granting future manager access', () => {
    const f = setup();
    f.repository.assignWorker(f.owner, {
      projectId: f.project.id,
      workerId: f.outsider.userId,
      startsOn: '2099-01-01',
    });
    expect(f.repository.listAllWorkers(f.manager).map((row) => row.id)).not.toContain(
      f.outsider.userId,
    );
    expect(f.repository.listActiveWorkers(f.manager).map((row) => row.id)).not.toContain(
      f.outsider.userId,
    );
    const planningOption = f.repository
      .listPlanningWorkerOptions(f.manager)
      .find((row) => row.id === f.outsider.userId);
    expect(planningOption).toEqual({
      id: f.outsider.userId,
      name: f.outsider.userId,
      status: 'active',
    });
    expect(Object.keys(planningOption ?? {})).toEqual(['id', 'name', 'status']);
    expect(
      f.repository.createPlanningAssignment(f.manager, {
        projectId: f.project.id,
        workerId: f.outsider.userId,
        startsAt: '2099-01-10T08:00:00.000Z',
        endsAt: '2099-01-10T10:00:00.000Z',
        plannedMinutes: 120,
      }).id,
    ).toBeTruthy();

    f.sqlite
      .prepare('UPDATE project_member SET starts_on=? WHERE project_id=? AND user_id=?')
      .run('2099-01-01', f.project.id, f.manager.userId);
    expect(f.repository.listAllWorkers(f.manager)).toEqual([]);
    expect(f.repository.listPlanningWorkerOptions(f.manager)).toEqual([]);
  });

  it('keeps a published shift visible to its manager and owner after worker membership ends', () => {
    const f = setup();
    f.sqlite
      .prepare('UPDATE project_member SET ends_on=? WHERE project_id=? AND user_id=?')
      .run('2026-09-01', f.project.id, f.worker.userId);
    expect(f.repository.listPlanning(f.manager).map((row) => row.id)).toContain(f.assignment.id);
    expect(f.repository.listPlanning(f.owner).map((row) => row.id)).toContain(f.assignment.id);
    expect(f.repository.listPlanning(f.worker)).toEqual([]);
    expect(
      f.repository.cancelPlanningAssignment(f.manager, { id: f.assignment.id, version: 1 }),
    ).toEqual({ id: f.assignment.id, version: 2 });
  });

  it('lets the current project manager edit with optimistic versioning and audit, then cancel', () => {
    const f = setup();
    const revised = {
      ...f.base,
      id: f.assignment.id,
      version: 1,
      endsAt: '2026-10-12T11:00:00.000Z',
      plannedMinutes: 180,
      site: 'Test site',
    };
    expect(f.repository.updatePlanningAssignment(f.manager, revised)).toEqual({
      id: f.assignment.id,
      version: 2,
    });
    expect(
      f.sqlite
        .prepare(
          'SELECT status,ends_at,planned_minutes,site,version FROM planning_assignment WHERE id=?',
        )
        .get(f.assignment.id),
    ).toEqual({
      status: 'published',
      ends_at: revised.endsAt,
      planned_minutes: 180,
      site: 'Test site',
      version: 2,
    });
    expect(() => f.repository.updatePlanningAssignment(f.manager, revised)).toThrow(/changed/);
    expect(() =>
      f.repository.cancelPlanningAssignment(f.manager, { id: f.assignment.id, version: 1 }),
    ).toThrow(/changed/);
    expect(
      f.repository.cancelPlanningAssignment(f.manager, { id: f.assignment.id, version: 2 }),
    ).toEqual({
      id: f.assignment.id,
      version: 3,
    });
    expect(f.repository.listPlanning(f.manager)).toEqual([]);
    expect(
      f.sqlite
        .prepare('SELECT status,version FROM planning_assignment WHERE id=?')
        .get(f.assignment.id),
    ).toEqual({ status: 'cancelled', version: 3 });
    expect(() =>
      f.repository.updatePlanningAssignment(f.manager, { ...revised, version: 3 }),
    ).toThrow(/Cancelled/);
    expect(
      f.sqlite
        .prepare(
          "SELECT action FROM audit_event WHERE entity_id=? AND action LIKE 'planning.%' ORDER BY occurred_at,id",
        )
        .all(f.assignment.id)
        .map((row) => row.action),
    ).toEqual(['planning.create', 'planning.update', 'planning.cancel']);
  });

  it('rejects overlap, unavailability, absent worker membership, and invalid windows without changing the row', () => {
    const f = setup();
    const second = f.repository.createPlanningAssignment(f.manager, {
      ...f.base,
      startsAt: '2026-10-12T12:00:00.000Z',
      endsAt: '2026-10-12T14:00:00.000Z',
    });
    const change = {
      ...f.base,
      id: second.id,
      version: 1,
      startsAt: '2026-10-12T09:00:00.000Z',
      endsAt: '2026-10-12T11:00:00.000Z',
    };
    expect(() => f.repository.updatePlanningAssignment(f.manager, change)).toThrow(/overlapping/);
    expect(() =>
      f.repository.updatePlanningAssignment(f.manager, {
        ...change,
        startsAt: '2026-10-12T15:00:00.000Z',
        endsAt: '2026-10-12T14:00:00.000Z',
      }),
    ).toThrow(/end must follow/);
    expect(() =>
      f.repository.updatePlanningAssignment(f.manager, {
        ...change,
        workerId: f.outsider.userId,
        startsAt: '2026-10-12T15:00:00.000Z',
        endsAt: '2026-10-12T16:00:00.000Z',
      }),
    ).toThrow(/effective project assignment/);
    f.sqlite
      .prepare(
        'INSERT INTO worker_availability(id,worker_id,starts_at,ends_at,availability,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'test-unavailable',
        f.worker.userId,
        '2026-10-12T15:00:00.000Z',
        '2026-10-12T17:00:00.000Z',
        'unavailable',
        '2026-09-24T00:00:00.000Z',
        '2026-09-24T00:00:00.000Z',
      );
    expect(() =>
      f.repository.updatePlanningAssignment(f.manager, {
        ...change,
        startsAt: '2026-10-12T15:00:00.000Z',
        endsAt: '2026-10-12T16:00:00.000Z',
      }),
    ).toThrow(/unavailable/);
    expect(
      f.sqlite
        .prepare('SELECT starts_at,version FROM planning_assignment WHERE id=?')
        .get(second.id),
    ).toEqual({ starts_at: '2026-10-12T12:00:00.000Z', version: 1 });
  });

  it('keeps manager permission tied to current effective membership and denies worker or finance changes', () => {
    const f = setup();
    const change = { ...f.base, id: f.assignment.id, version: 1, plannedMinutes: 90 };
    for (const principal of [f.worker, f.finance]) {
      expect(() => f.repository.updatePlanningAssignment(principal, change)).toThrow();
      expect(() =>
        f.repository.cancelPlanningAssignment(principal, { id: f.assignment.id, version: 1 }),
      ).toThrow();
    }
    f.sqlite
      .prepare("UPDATE project_member SET ends_on='2026-01-31' WHERE project_id=? AND user_id=?")
      .run(f.project.id, f.manager.userId);
    expect(() => f.repository.updatePlanningAssignment(f.manager, change)).toThrow(
      /currently effective/,
    );
    expect(() =>
      f.repository.cancelPlanningAssignment(f.manager, { id: f.assignment.id, version: 1 }),
    ).toThrow(/currently effective/);
    expect(f.repository.updatePlanningAssignment(f.owner, change).version).toBe(2);
  });
});
