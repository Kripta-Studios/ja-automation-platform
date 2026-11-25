import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, CrewLeaderRepository } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

/**
 * Round 3 decision: after a crew-chief delegation is revoked, the former chief
 * keeps ONLY his own records. Nothing of the former crew stays reachable on
 * the server: no crew rows, no crew entry detail, no delegation row naming the
 * member, no search hit, no new notices and no openable old notice.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
const workDate = new Date().toISOString().slice(0, 10);
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'crew-revoke-owner');
  const chief = stepUpB5Principal(fixture.sqlite, fixture.worker, 'crew-revoke-chief');
  const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'crew-revoke-manager');
  const memberId = fixture.outsider.userId;
  fixture.sqlite.prepare("UPDATE user SET name='Maico Lubawski' WHERE id=?").run(memberId);
  fixture.repository.assignWorker(fixture.owner, {
    projectId: fixture.project.id,
    workerId: memberId,
    startsOn: '2026-01-01',
  });
  const crew = new CrewLeaderRepository(fixture.sqlite);
  const grant = crew.grant(owner, {
    projectId: fixture.project.id,
    chiefUserId: chief.userId,
    workerUserId: memberId,
    startsOn: '2026-01-01',
  });
  const created = crew.createBatch(chief, {
    projectId: fixture.project.id,
    workerIds: [memberId],
    requestId: 'crew-revoke-least-privilege-0001',
    workDate,
    category: 'regular',
    minutes: 120,
    summary: 'Crew work',
    submit: true,
  }).created[0]!;
  return { fixture, owner, chief, manager, crew, memberId, grant, entryId: created.id };
}

function runNotifications(fixture: B5LifecycleSecurityFixture, key: string): void {
  fixture.v3.enqueueJob('alert_dispatch', key, { alertType: 'business_notifications' });
  expect(fixture.v3.runDueJobs(1)).toEqual(expect.objectContaining({ failed: 0 }));
}

function chiefNotices(fixture: B5LifecycleSecurityFixture, chiefId: string, kind: string) {
  return fixture.sqlite
    .prepare('SELECT id FROM notification WHERE user_id=? AND kind=?')
    .all(chiefId, kind) as Array<{ id: string }>;
}

describe('crew chief after revoke (least privilege)', () => {
  it('finds the crew member by first name while the delegation is live (T29)', () => {
    const source = setup();
    const hits = source.fixture.repository
      .search(source.chief, 'maico')
      .filter((row) => (row as { type?: string }).type === 'crew_member');
    expect(hits).toEqual([
      expect.objectContaining({
        id: source.memberId,
        label: 'Maico Lubawski',
        projectId: source.fixture.project.id,
      }),
    ]);
    // Name and project only: no e-mail or other personal data.
    expect(JSON.stringify(hits)).not.toContain('@');
  });

  it('keeps nothing of the former crew after the revoke, on the server', () => {
    const source = setup();
    const { fixture, crew, chief } = source;
    // A returned crew entry notifies the chief while the delegation is live.
    fixture.repository.operationalApproveTime(
      source.manager,
      source.entryId,
      'needs_changes',
      'Check the hours',
    );
    runNotifications(fixture, 'crew-revoke-live');
    const [liveNotice] = chiefNotices(fixture, chief.userId, 'approval_returned_time');
    expect(liveNotice).toBeDefined();
    expect(fixture.repository.getNotification(chief, liveNotice!.id)).toEqual(
      expect.objectContaining({ source_unavailable: false }),
    );

    crew.revoke(source.owner, source.grant.id);

    // Crew pages: no rows, no detail, no delegation naming the member.
    expect(crew.entries(chief, fixture.project.id, workDate, workDate)).toEqual([]);
    expect(() => crew.entryDetail(chief, source.entryId)).toThrow(AccessDeniedError);
    expect(crew.grants(chief, fixture.project.id)).toEqual([]);
    expect(crew.grants(chief)).toEqual([]);
    expect(crew.projects(chief)).toEqual([]);
    expect(crew.assignedWorkers(chief, fixture.project.id, workDate)).toEqual([]);
    // Search: the former member is not found any more.
    expect(
      fixture.repository
        .search(chief, 'maico')
        .filter((row) => (row as { type?: string }).type === 'crew_member'),
    ).toEqual([]);
    // The old notice no longer opens the member's record.
    expect(fixture.repository.getNotification(chief, liveNotice!.id)).toEqual(
      expect.objectContaining({ source_unavailable: true, person_name: null, target: null }),
    );
    // New events on the member's record no longer reach the former chief.
    fixture.sqlite
      .prepare(
        "UPDATE time_entry SET approval_state='rejected',version=version+1,updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), source.entryId);
    runNotifications(fixture, 'crew-revoke-after');
    expect(chiefNotices(fixture, chief.userId, 'approval_rejected_time')).toEqual([]);
    // The member himself is still told.
    expect(chiefNotices(fixture, source.memberId, 'approval_rejected_time')).toHaveLength(1);
    // The owner still sees the full delegation history.
    expect(crew.grants(source.owner, fixture.project.id)).toEqual([
      expect.objectContaining({ id: source.grant.id, status: 'revoked' }),
    ]);
  });
});
