import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

/**
 * Easier removal and date changes (owner request 2026-11-25): the team screen
 * previews what an end or a date change does, so the confirm is one click,
 * and every write keeps the existing server rules.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
const today = new Date().toISOString().slice(0, 10);
const shift = (days: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'dates-worker');
  const assignment = () =>
    fixture.sqlite
      .prepare(
        "SELECT id,version,status,starts_on,ends_on FROM project_member WHERE user_id='b5-worker' ORDER BY created_at LIMIT 1",
      )
      .get() as { id: string; version: number; status: string; starts_on: string; ends_on: string | null };
  const hours = (workDate: string, state = 'draft') => {
    const entry = fixture.repository.createTimeEntry(worker, {
      projectId: fixture.project.id,
      workDate,
      category: 'regular',
      minutes: 60,
      summary: `Hours on ${workDate}`,
    }) as { id: string };
    if (state !== 'draft')
      fixture.sqlite.prepare('UPDATE time_entry SET approval_state=? WHERE id=?').run(state, entry.id);
    return entry.id;
  };
  const state = (id: string) =>
    (fixture.sqlite.prepare('SELECT approval_state s FROM time_entry WHERE id=?').get(id) as { s: string }).s;
  return { fixture, assignment, hours, state };
}

describe('previewAssignmentRemoval', () => {
  it('counts unapproved later hours up front and ends in one call', () => {
    const { fixture, assignment, hours, state } = setup();
    const draft = hours(shift(-2));
    const pending = hours(shift(-1), 'submitted');
    const before = assignment();

    const preview = fixture.repository.previewAssignmentRemoval(fixture.owner, before.id, {
      endsOn: shift(-5),
    });
    expect(preview).toMatchObject({
      endsOn: shift(-5),
      resolvableLaterTime: 2,
      blockedByRecords: false,
      hasRecords: true,
      cancelBeforeStart: false,
    });
    // Read-only.
    expect(assignment()).toMatchObject({ status: 'active', version: before.version });
    expect(state(draft)).toBe('draft');

    expect(
      fixture.repository.removeAssignment(fixture.owner, before.id, {
        endsOn: shift(-5),
        reason: 'Assignment finished',
        version: before.version,
        resolveLaterTime: true,
      }),
    ).toEqual({ discarded: 1, rejected: 1 });
    expect(state(pending)).toBe('rejected');
    expect(assignment()).toMatchObject({ status: 'inactive', ends_on: shift(-5) });
  });

  it('reports approved hours after the end date as blocking', () => {
    const { fixture, assignment, hours } = setup();
    hours(shift(-1), 'approved');
    hours(shift(-2));
    const preview = fixture.repository.previewAssignmentRemoval(fixture.owner, assignment().id, {
      endsOn: shift(-5),
    });
    expect(preview).toMatchObject({ resolvableLaterTime: 1, blockedByRecords: true });
    expect(
      fixture.repository.previewAssignmentRemoval(fixture.owner, assignment().id, {}),
    ).toMatchObject({ endsOn: today, resolvableLaterTime: 0, blockedByRecords: false });
  });

  it('keeps the removal rules: no future end date, project scope and D5', () => {
    const { fixture, assignment } = setup();
    expect(() =>
      fixture.repository.previewAssignmentRemoval(fixture.owner, assignment().id, { endsOn: shift(3) }),
    ).toThrow('Immediate removal cannot use a future end date');
    const outsider = stepUpB5Principal(fixture.sqlite, fixture.outsider, 'dates-outsider');
    expect(() => fixture.repository.previewAssignmentRemoval(outsider, assignment().id)).toThrow(
      AccessDeniedError,
    );
    const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'dates-manager');
    expect(fixture.repository.previewAssignmentRemoval(manager, assignment().id)).toMatchObject({
      endsOn: today,
    });
    // D5: a project manager never previews (or ends) supplier staff.
    fixture.sqlite
      .prepare(
        "INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES('dates-supplier','Supplier','active',?,?)",
      )
      .run(today, today);
    fixture.sqlite
      .prepare(
        "INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES('b5-worker','dates-supplier','external_technician',?,?)",
      )
      .run(today, today);
    expect(() => fixture.repository.previewAssignmentRemoval(manager, assignment().id)).toThrow(
      'Supplier staff assignments are managed by the owner',
    );
  });
});

describe('deleteAssignment for an assignment added by mistake', () => {
  it('is refused on the server while recorded work exists', () => {
    const { fixture, assignment, hours } = setup();
    hours(shift(-1));
    expect(() =>
      fixture.repository.deleteAssignment(fixture.owner, assignment().id, {
        requireNoRecords: true,
        version: assignment().version,
      }),
    ).toThrow('Assignment has recorded work and can only be ended');
    expect(assignment().status).toBe('active');
  });

  it('cancels an assignment without records', () => {
    const { fixture } = setup();
    const added = fixture.repository.assignWorker(fixture.owner, {
      projectId: fixture.project.id,
      workerId: 'b5-outsider',
      startsOn: shift(2),
    }) as { id: string };
    expect(
      fixture.repository.previewAssignmentRemoval(fixture.owner, added.id),
    ).toMatchObject({ hasRecords: false, cancelBeforeStart: true });
    fixture.repository.deleteAssignment(fixture.owner, added.id, {
      requireNoRecords: true,
      reason: 'Added by mistake',
      version: 1,
    });
    expect(
      fixture.sqlite.prepare('SELECT status FROM project_member WHERE id=?').get(added.id),
    ).toEqual({ status: 'inactive' });
  });
});

describe('changing assignment dates at any time', () => {
  it('re-opens an ended assignment by clearing or moving its end date, with an audit event', () => {
    const { fixture, assignment } = setup();
    fixture.repository.removeAssignment(fixture.owner, assignment().id, {
      endsOn: shift(-3),
      reason: 'Finished',
      version: assignment().version,
    });
    const ended = assignment();
    expect(ended.status).toBe('inactive');
    expect(
      fixture.repository.previewAssignmentDates(fixture.owner, ended.id, { endsOn: '' }),
    ).toMatchObject({ reopens: true, overlap: null, blockedByRecords: false });

    fixture.repository.updateAssignment(fixture.owner, ended.id, { endsOn: '', version: ended.version });
    expect(assignment()).toMatchObject({ status: 'active', ends_on: null });
    const audit = fixture.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='assignment.update' AND entity_id=? ORDER BY occurred_at DESC LIMIT 1",
      )
      .get(ended.id) as { details_json: string };
    expect(JSON.parse(audit.details_json)).toMatchObject({
      reopened: true,
      endsOn: { from: shift(-3), to: null },
    });

    // Moving the end of the re-opened assignment back keeps the usual update rules.
    fixture.repository.updateAssignment(fixture.owner, ended.id, {
      endsOn: shift(-2),
      version: assignment().version,
    });
    expect(assignment()).toMatchObject({ status: 'active', ends_on: shift(-2) });
  });

  it('resolves unapproved hours left outside new dates in the same step', () => {
    const { fixture, assignment, hours, state } = setup();
    const early = hours('2026-02-02');
    const pending = hours('2026-02-03', 'submitted');
    const row = assignment();
    expect(() =>
      fixture.repository.updateAssignment(fixture.owner, row.id, {
        startsOn: '2026-03-01',
        version: row.version,
      }),
    ).toThrow('Assignment dates cannot exclude recorded time, expenses, or reports');
    expect(
      fixture.repository.previewAssignmentDates(fixture.owner, row.id, { startsOn: '2026-03-01' }),
    ).toMatchObject({ resolvableTime: 2, blockedByRecords: false });

    fixture.repository.updateAssignment(fixture.owner, row.id, {
      startsOn: '2026-03-01',
      version: row.version,
      resolveOutsideTime: true,
    });
    expect(state(early)).toBe('void');
    expect(state(pending)).toBe('rejected');
    expect(assignment().starts_on).toBe('2026-03-01');
  });

  it('never moves dates away from approved hours and names an overlap', () => {
    const { fixture, assignment, hours } = setup();
    hours('2026-02-02', 'approved');
    const row = assignment();
    expect(
      fixture.repository.previewAssignmentDates(fixture.owner, row.id, { startsOn: '2026-03-01' }),
    ).toMatchObject({ resolvableTime: 0, blockedByRecords: true });
    expect(() =>
      fixture.repository.updateAssignment(fixture.owner, row.id, {
        startsOn: '2026-03-01',
        version: row.version,
        resolveOutsideTime: true,
      }),
    ).toThrow(ConflictError);

    fixture.repository.updateAssignment(fixture.owner, row.id, {
      endsOn: '2026-05-31',
      version: row.version,
    });
    const second = fixture.repository.assignWorker(fixture.owner, {
      projectId: fixture.project.id,
      workerId: 'b5-worker',
      startsOn: '2026-06-01',
    }) as { id: string };
    expect(
      fixture.repository.previewAssignmentDates(fixture.owner, row.id, { endsOn: '2026-06-15' }),
    ).toMatchObject({ overlap: { assignmentId: second.id, startsOn: '2026-06-01' } });
  });

  it('keeps D5 and project scope for date previews', () => {
    const { fixture, assignment } = setup();
    const outsider = stepUpB5Principal(fixture.sqlite, fixture.outsider, 'dates-outsider-2');
    expect(() =>
      fixture.repository.previewAssignmentDates(outsider, assignment().id, { endsOn: '' }),
    ).toThrow(AccessDeniedError);
  });
});
