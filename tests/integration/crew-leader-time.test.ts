import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  CrewLeaderRepository,
  ValidationError,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const workDate = new Date().toISOString().slice(0, 10);
afterEach(() => {
  vi.useRealTimers();
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setup(grantStartsOn = '2026-01-01') {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'crew-owner');
  fixture.repository.assignWorker(fixture.owner, {
    projectId: fixture.project.id,
    workerId: fixture.outsider.userId,
    startsOn: '2026-01-01',
  });
  seedB5User(fixture.sqlite, 'b5-crew-third', 'worker');
  fixture.repository.assignWorker(fixture.owner, {
    projectId: fixture.project.id,
    workerId: 'b5-crew-third',
    startsOn: '2026-01-01',
  });
  const crew = new CrewLeaderRepository(fixture.sqlite);
  const chief = stepUpB5Principal(fixture.sqlite, fixture.worker, 'crew-chief');
  const first = fixture.outsider.userId;
  const second = 'b5-crew-third';
  for (const workerUserId of [first, second])
    crew.grant(owner, {
      projectId: fixture.project.id,
      chiefUserId: chief.userId,
      workerUserId,
      startsOn: grantStartsOn,
    });
  return { fixture, crew, owner, chief, first, second };
}

function batch(projectId: string, workerIds: string[], requestId: string) {
  return {
    projectId,
    workerIds,
    requestId,
    workDate,
    category: 'regular',
    minutes: 450,
    summary: 'Installed project equipment',
  };
}

describe('owner-granted project crew time', () => {
  it('activates a chief on the project date even before UTC midnight', () => {
    const { fixture, crew, chief, first } = setup('2026-09-24');
    fixture.sqlite
      .prepare('UPDATE project SET timezone=? WHERE id=?')
      .run('Europe/Madrid', fixture.project.id);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T22:30:00.000Z'));
    expect(crew.projects(chief)).toContainEqual(expect.objectContaining({ id: fixture.project.id }));
    expect(crew.assignedWorkers(chief, fixture.project.id, '2026-09-24')).toContainEqual(
      expect.objectContaining({ id: first }),
    );
    expect(
      crew.authorizeDelegatedOperationalEntry(chief, first, fixture.project.id, '2026-09-24')
        .grantId,
    ).toBeTruthy();
  });

  it('records a single delegated worker with subject, chief actor, and ordinary approval state', () => {
    const { fixture, crew, chief, first } = setup();
    expect(
      crew.authorizeDelegatedOperationalEntry(chief, first, fixture.project.id, workDate).grantId,
    ).toBeTruthy();
    const result = crew.createBatch(
      chief,
      batch(fixture.project.id, [first], 'crew-single-request-0001'),
    );
    expect(result.created).toHaveLength(1);
    const id = result.created[0]!.id;
    expect(
      fixture.sqlite
        .prepare(
          'SELECT worker_id,minutes,start_time,end_time,approval_state FROM time_entry WHERE id=?',
        )
        .get(id),
    ).toEqual({
      worker_id: first,
      minutes: 450,
      start_time: null,
      end_time: null,
      approval_state: 'draft',
    });
    expect(
      fixture.sqlite
        .prepare('SELECT recorded_by_user_id FROM crew_time_entry_recorder WHERE time_entry_id=?')
        .get(id),
    ).toEqual({
      recorded_by_user_id: chief.userId,
    });
    expect(
      fixture.sqlite
        .prepare("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='time.create'")
        .get(id),
    ).toEqual({ actor_id: chief.userId });
    expect(crew.entries(chief, fixture.project.id, workDate, workDate)).toEqual([
      expect.objectContaining({ workerId: first, minutes: 450, recordedBy: chief.userId }),
    ]);
    expect(crew.submit(chief, id, 1)).toEqual({ id, version: 2 });
    expect(
      fixture.sqlite
        .prepare('SELECT approval_state,approved_by FROM time_entry WHERE id=?')
        .get(id),
    ).toEqual({
      approval_state: 'submitted',
      approved_by: null,
    });
    expect(() => crew.submit(chief, id, 2)).toThrow(ConflictError);
  });

  it('supports shared hours per person and distinct per-person hours with idempotent retries', () => {
    const { fixture, crew, chief, first, second } = setup();
    const shared = batch(fixture.project.id, [first, second], 'crew-shared-request-0002');
    const initial = crew.createBatch(chief, { ...shared, submit: true });
    expect(initial.replayed).toBe(false);
    expect(initial.created).toHaveLength(2);
    expect(crew.createBatch(chief, { ...shared, submit: true })).toEqual({
      ...initial,
      replayed: true,
    });
    expect(
      fixture.sqlite
        .prepare(
          "SELECT COUNT(*) total FROM time_entry WHERE activity_summary='Installed project equipment'",
        )
        .get(),
    ).toEqual({ total: 2 });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT worker_id,minutes,approval_state FROM time_entry WHERE id IN (?,?) ORDER BY worker_id',
        )
        .all(...initial.created.map((row) => row.id)),
    ).toEqual([
      { worker_id: second, minutes: 450, approval_state: 'submitted' },
      { worker_id: first, minutes: 450, approval_state: 'submitted' },
    ]);
    expect(() => crew.createBatch(chief, { ...shared, minutes: 60, submit: true })).toThrow(
      ConflictError,
    );
    const individual = crew.createBatch(chief, {
      ...batch(fixture.project.id, [first, second], 'crew-individual-request-0003'),
      workerMinutes: { [first]: 60, [second]: 90 },
      summary: 'Extra installation work',
    });
    expect(
      fixture.sqlite
        .prepare('SELECT worker_id,minutes FROM time_entry WHERE id IN (?,?) ORDER BY worker_id')
        .all(...individual.created.map((row) => row.id)),
    ).toEqual([
      { worker_id: second, minutes: 90 },
      { worker_id: first, minutes: 60 },
    ]);
  });

  it('rolls back every row when a later worker exceeds their actual daily minutes', () => {
    const { fixture, crew, chief, first, second } = setup();
    const secondPrincipal = fixture.repository.principalFor(second);
    fixture.repository.createTimeEntry(secondPrincipal, {
      projectId: fixture.project.id,
      workDate,
      category: 'regular',
      minutes: 1430,
      summary: 'Existing long shift',
    });
    expect(() =>
      crew.createBatch(chief, {
        ...batch(fixture.project.id, [first, second], 'crew-rollback-request-0004'),
        minutes: 30,
      }),
    ).toThrow(ValidationError);
    expect(
      fixture.sqlite
        .prepare(
          "SELECT COUNT(*) total FROM time_entry WHERE activity_summary='Installed project equipment'",
        )
        .get(),
    ).toEqual({ total: 0 });
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) total FROM crew_time_batch_request').get(),
    ).toEqual({ total: 0 });
  });

  it('enforces active grants, both assignments, current role and live session for every row', () => {
    const { fixture, crew, owner, chief, first, second } = setup();
    expect(() =>
      crew.createBatch(
        { ...chief, sessionId: undefined },
        batch(fixture.project.id, [first], 'crew-no-session-0005'),
      ),
    ).toThrow(AccessDeniedError);
    expect(() =>
      crew.createBatch(
        chief,
        batch(fixture.project.id, [fixture.manager.userId], 'crew-not-delegated-0006'),
      ),
    ).toThrow(AccessDeniedError);
    const grant = crew.grants(owner, fixture.project.id).find((row) => row.workerUserId === first)!;
    crew.revoke(owner, grant.id);
    expect(() =>
      crew.createBatch(chief, batch(fixture.project.id, [first], 'crew-revoked-request-0007')),
    ).toThrow(AccessDeniedError);
    crew.grant(owner, {
      projectId: fixture.project.id,
      chiefUserId: chief.userId,
      workerUserId: first,
      startsOn: '2026-01-01',
      endsOn: '2026-01-02',
    });
    expect(() =>
      crew.createBatch(chief, batch(fixture.project.id, [first], 'crew-expired-request-0007b')),
    ).toThrow(AccessDeniedError);
    fixture.sqlite
      .prepare("UPDATE project_member SET status='inactive' WHERE project_id=? AND user_id=?")
      .run(fixture.project.id, second);
    expect(() =>
      crew.createBatch(chief, batch(fixture.project.id, [second], 'crew-inactive-request-0008')),
    ).toThrow(AccessDeniedError);
    fixture.sqlite.prepare("UPDATE user SET role='finance_admin' WHERE id=?").run(chief.userId);
    expect(() =>
      crew.createBatch(chief, batch(fixture.project.id, [first], 'crew-role-changed-0009')),
    ).toThrow(AccessDeniedError);
  });

  it('does not expose pay or billing fields and gives chiefs no approval authority', () => {
    const { fixture, crew, owner, chief, first } = setup();
    const result = crew.createBatch(chief, {
      ...batch(fixture.project.id, [first], 'crew-privacy-request-0009'),
      submit: true,
    });
    const projection = {
      projects: crew.projects(chief),
      grants: crew.grants(chief),
      assigned: crew.assignedWorkers(chief, fixture.project.id, workDate),
      entries: crew.entries(chief, fixture.project.id, workDate, workDate),
    };
    expect(JSON.stringify(projection)).not.toMatch(
      /compensation|clientRate|workerPay|internalCost|margin|billingRate/i,
    );
    expect(
      fixture.sqlite
        .prepare('SELECT approved_by,approval_state FROM time_entry WHERE id=?')
        .get(result.created[0]!.id),
    ).toEqual({
      approved_by: null,
      approval_state: 'submitted',
    });
    expect(() =>
      crew.grant(chief, {
        projectId: fixture.project.id,
        chiefUserId: chief.userId,
        workerUserId: first,
        startsOn: workDate,
      }),
    ).toThrow(AccessDeniedError);
    const detail = crew.entryDetail(chief, result.created[0]!.id);
    expect(detail).toMatchObject({ workerId: first, recordedBy: chief.userId, minutes: 450 });
    expect(JSON.stringify(detail)).not.toMatch(
      /compensation|clientRate|workerPay|internalCost|margin|currency/i,
    );
    const anotherWorker = stepUpB5Principal(fixture.sqlite, fixture.outsider, 'crew-detail-idor');
    expect(() => crew.entryDetail(anotherWorker, result.created[0]!.id)).toThrow(AccessDeniedError);
    const originalGrant = crew
      .grants(owner, fixture.project.id)
      .find((row) => row.workerUserId === first)!;
    crew.revoke(owner, originalGrant.id);
    expect(() => crew.entryDetail(chief, result.created[0]!.id)).toThrow(AccessDeniedError);
  });

  it('keeps grant scope immutable and rejects mismatched recorder provenance in SQLite', () => {
    const { fixture, crew, owner, chief, first, second } = setup();
    const grants = crew.grants(owner, fixture.project.id);
    const firstGrant = grants.find((row) => row.workerUserId === first)!;
    const secondGrant = grants.find((row) => row.workerUserId === second)!;
    const created = crew.createBatch(
      chief,
      batch(fixture.project.id, [first], 'crew-provenance-request-0010'),
    );
    const recordedId = created.created[0]!.id;
    expect(() =>
      fixture.sqlite
        .prepare('UPDATE crew_leader_grant SET worker_user_id=? WHERE id=?')
        .run(second, firstGrant.id),
    ).toThrow(/provenance immutable/u);
    expect(() =>
      fixture.sqlite
        .prepare("UPDATE crew_leader_grant SET ends_on='2027-12-31' WHERE id=?")
        .run(firstGrant.id),
    ).toThrow(/provenance immutable/u);
    expect(() =>
      fixture.sqlite.prepare('DELETE FROM crew_leader_grant WHERE id=?').run(firstGrant.id),
    ).toThrow(/history immutable/u);
    const own = fixture.repository.createTimeEntry(fixture.repository.principalFor(first), {
      projectId: fixture.project.id,
      workDate,
      category: 'regular',
      minutes: 15,
      summary: 'Separate own time',
    });
    const insert = fixture.sqlite.prepare(
      'INSERT INTO crew_time_entry_recorder(time_entry_id,grant_id,recorded_by_user_id,recorded_at) VALUES(?,?,?,?)',
    );
    expect(() => insert.run(own.id, firstGrant.id, second, new Date().toISOString())).toThrow(
      /scope mismatch/u,
    );
    expect(() =>
      insert.run(own.id, secondGrant.id, chief.userId, new Date().toISOString()),
    ).toThrow(/scope mismatch/u);
    expect(
      fixture.sqlite
        .prepare(
          'SELECT grant_id,recorded_by_user_id FROM crew_time_entry_recorder WHERE time_entry_id=?',
        )
        .get(recordedId),
    ).toEqual({
      grant_id: firstGrant.id,
      recorded_by_user_id: chief.userId,
    });
    crew.revoke(owner, firstGrant.id);
    expect(() =>
      fixture.sqlite
        .prepare(
          "UPDATE crew_leader_grant SET status='active',revoked_by_user_id=NULL,revoked_at=NULL WHERE id=?",
        )
        .run(firstGrant.id),
    ).toThrow(/provenance immutable/u);
  });
});
