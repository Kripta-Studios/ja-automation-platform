import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError, CrewLeaderRepository } from '@ja/database';
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
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'crew-draft-owner');
  const chief = stepUpB5Principal(fixture.sqlite, fixture.worker, 'crew-draft-chief');
  const workerId = fixture.outsider.userId;
  fixture.repository.assignWorker(fixture.owner, {
    projectId: fixture.project.id,
    workerId,
    startsOn: '2026-01-01',
  });
  const crew = new CrewLeaderRepository(fixture.sqlite);
  const grant = crew.grant(owner, {
    projectId: fixture.project.id,
    chiefUserId: chief.userId,
    workerUserId: workerId,
    startsOn: '2026-01-01',
  });
  const id = crew.createBatch(chief, {
    projectId: fixture.project.id,
    workerIds: [workerId],
    requestId: 'crew-draft-management-request-0001',
    workDate,
    category: 'regular',
    minutes: 60,
    summary: 'Original work',
  }).created[0]!.id;
  return { fixture, owner, chief, crew, workerId, grant, id };
}

describe('crew draft management', () => {
  it('does not revive draft or correction access after revocation and regrant', () => {
    const source = setup();
    seedB5User(source.fixture.sqlite, 'b5-other-delegated-worker', 'worker');
    source.fixture.repository.assignWorker(source.owner, {
      projectId: source.fixture.project.id,
      workerId: 'b5-other-delegated-worker',
      startsOn: '2026-01-01',
    });
    source.crew.grant(source.owner, {
      projectId: source.fixture.project.id,
      chiefUserId: source.chief.userId,
      workerUserId: 'b5-other-delegated-worker',
      startsOn: '2026-01-01',
    });
    source.crew.revoke(source.owner, source.grant.id);
    expect(
      source.crew.entries(source.chief, source.fixture.project.id, workDate, workDate),
    ).toEqual([]);
    source.crew.grant(source.owner, {
      projectId: source.fixture.project.id,
      chiefUserId: source.chief.userId,
      workerUserId: source.workerId,
      startsOn: '2026-01-01',
    });
    expect(
      source.crew.entries(source.chief, source.fixture.project.id, workDate, workDate),
    ).toEqual([]);
    expect(() => source.crew.entryDetail(source.chief, source.id)).toThrow(AccessDeniedError);
    expect(() => source.crew.submit(source.chief, source.id, 1)).toThrow(AccessDeniedError);

    const correction = setup();
    correction.crew.submit(correction.chief, correction.id, 1);
    correction.fixture.repository.operationalApproveTime(
      correction.owner,
      correction.id,
      'needs_changes',
      'Revise duration',
    );
    const revised = correction.crew.createCorrectedDraft(correction.chief, {
      originalId: correction.id,
      version: 3,
      requestId: 'crew-regrant-correction-request-0001',
      reason: 'Revised duration after review',
      workDate,
      category: 'regular',
      minutes: 45,
      summary: 'Revised work',
    });
    correction.crew.revoke(correction.owner, correction.grant.id);
    correction.crew.grant(correction.owner, {
      projectId: correction.fixture.project.id,
      chiefUserId: correction.chief.userId,
      workerUserId: correction.workerId,
      startsOn: '2026-01-01',
    });
    expect(
      correction.crew.entries(correction.chief, correction.fixture.project.id, workDate, workDate),
    ).toEqual([]);
    expect(() => correction.crew.entryDetail(correction.chief, revised.id)).toThrow(
      AccessDeniedError,
    );
    expect(() => correction.crew.submit(correction.chief, revised.id, 1)).toThrow(
      AccessDeniedError,
    );
  });

  it('lets only the original recorder correct and submit returned no-login crew time', () => {
    const { fixture, owner, crew, chief, workerId, grant, id } = setup();
    expect(
      fixture.sqlite.prepare('SELECT 1 FROM account WHERE user_id=?').get(workerId),
    ).toBeUndefined();
    seedB5User(fixture.sqlite, 'b5-other-chief', 'worker');
    fixture.repository.assignWorker(owner, {
      projectId: fixture.project.id,
      workerId: 'b5-other-chief',
      startsOn: '2026-01-01',
    });
    const otherChief = stepUpB5Principal(
      fixture.sqlite,
      fixture.repository.principalFor('b5-other-chief'),
      'other-crew-recorder',
    );
    crew.grant(owner, {
      projectId: fixture.project.id,
      chiefUserId: otherChief.userId,
      workerUserId: workerId,
      startsOn: '2026-01-01',
    });
    crew.submit(chief, id, 1);
    fixture.repository.operationalApproveTime(owner, id, 'needs_changes', 'Explain the duration');
    const input = {
      originalId: id,
      version: 3,
      requestId: 'crew-no-login-correction-request-0001',
      reason: 'Confirmed revised duration with site team',
      workDate,
      category: 'standby',
      minutes: 45,
      summary: 'Corrected delegated work',
    };
    expect(() => crew.createCorrectedDraft(otherChief, input)).toThrow(AccessDeniedError);
    const correction = crew.createCorrectedDraft(chief, input);
    expect(crew.createCorrectedDraft(chief, input)).toEqual(correction);
    expect(crew.entryDetail(chief, correction.id)).toMatchObject({
      workerId,
      recordedBy: chief.userId,
      approvalState: 'draft',
      minutes: 45,
      category: 'standby',
      summary: 'Corrected delegated work',
    });
    expect(crew.entryDetail(chief, id)).toMatchObject({
      approvalState: 'needs_changes',
      reviewReason: 'Explain the duration',
      activeCorrectionId: correction.id,
    });
    expect(() =>
      crew.createCorrectedDraft(chief, { ...input, requestId: 'new-request-0002' }),
    ).toThrow(ConflictError);
    expect(
      fixture.sqlite
        .prepare('SELECT reason,actor_user_id FROM record_correction_link WHERE correction_id=?')
        .get(correction.id),
    ).toEqual({
      reason: input.reason,
      actor_user_id: chief.userId,
    });
    const correctionBefore = fixture.sqlite
      .prepare('SELECT * FROM time_entry WHERE id=?')
      .get(correction.id);
    const linkBefore = fixture.sqlite
      .prepare('SELECT * FROM record_correction_link WHERE correction_id=?')
      .get(correction.id);
    expect(() =>
      fixture.repository.updateTimeEntry(owner, {
        id: correction.id,
        version: 1,
        minutes: 30,
        summary: 'Untracked revision',
      }),
    ).toThrow(ConflictError);
    expect(
      fixture.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(correction.id),
    ).toEqual(correctionBefore);
    expect(
      fixture.sqlite
        .prepare('SELECT * FROM record_correction_link WHERE correction_id=?')
        .get(correction.id),
    ).toEqual(linkBefore);
    crew.submit(chief, correction.id, 1);
    expect(
      new CrewLeaderRepository(fixture.sqlite).entryDetail(chief, correction.id).approvalState,
    ).toBe('submitted');
    expect(
      fixture.sqlite.prepare('SELECT approval_state,minutes FROM time_entry WHERE id=?').get(id),
    ).toEqual({
      approval_state: 'needs_changes',
      minutes: 60,
    });
    crew.revoke(owner, grant.id);
    expect(() => crew.entryDetail(chief, correction.id)).toThrow(AccessDeniedError);
    expect(() =>
      crew.createCorrectedDraft(chief, { ...input, requestId: 'after-revoke-0003' }),
    ).toThrow(AccessDeniedError);
  });

  it('updates a delegated draft with version and preserves worker and chief provenance', () => {
    const { fixture, crew, chief, workerId, id } = setup();
    expect(crew.entryDetail(chief, id).editable).toBe(true);
    expect(
      crew.updateDraft(chief, {
        id,
        version: 1,
        workDate,
        category: 'overtime',
        minutes: 90,
        summary: 'Corrected work',
      }),
    ).toEqual({ id, version: 2 });
    expect(crew.entryDetail(chief, id)).toEqual(
      expect.objectContaining({
        workerId,
        recordedBy: chief.userId,
        minutes: 90,
        category: 'overtime',
        summary: 'Corrected work',
        version: 2,
      }),
    );
    expect(() =>
      crew.updateDraft(chief, {
        id,
        version: 1,
        workDate,
        category: 'regular',
        minutes: 60,
        summary: 'Stale work',
      }),
    ).toThrow(ConflictError);
    expect(
      fixture.sqlite
        .prepare("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='time.update'")
        .get(id),
    ).toEqual({ actor_id: chief.userId });
  });

  it('discards an unlinked draft without erasing its provenance or audit history', () => {
    const { fixture, crew, chief, id } = setup();
    crew.discardDraft(chief, id, 1);
    expect(
      fixture.sqlite.prepare('SELECT approval_state,version FROM time_entry WHERE id=?').get(id),
    ).toEqual({ approval_state: 'void', version: 2 });
    expect(
      fixture.sqlite
        .prepare('SELECT recorded_by_user_id FROM crew_time_entry_recorder WHERE time_entry_id=?')
        .get(id),
    ).toEqual({ recorded_by_user_id: chief.userId });
    expect(crew.entries(chief, fixture.project.id, workDate, workDate)).toEqual([]);
    expect(() => crew.discardDraft(chief, id, 2)).toThrow(ConflictError);
    expect(
      fixture.sqlite
        .prepare("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='time.void'")
        .get(id),
    ).toEqual({ actor_id: chief.userId });
  });

  it('blocks edits for linked, submitted, and no-longer-delegated records', () => {
    const { fixture, owner, crew, chief, grant, id } = setup();
    fixture.sqlite
      .prepare(
        "INSERT INTO report_time_link(report_type,report_id,time_entry_id) VALUES('daily',?,?)",
      )
      .run('crew-draft-report', id);
    expect(crew.entryDetail(chief, id).editable).toBe(false);
    expect(() =>
      crew.updateDraft(chief, {
        id,
        version: 1,
        workDate,
        category: 'regular',
        minutes: 90,
        summary: 'Changed linked work',
      }),
    ).toThrow(ConflictError);
    expect(() => crew.discardDraft(chief, id, 1)).toThrow(ConflictError);
    fixture.sqlite.prepare('DELETE FROM report_time_link WHERE time_entry_id=?').run(id);
    crew.submit(chief, id, 1);
    expect(() => crew.discardDraft(chief, id, 2)).toThrow(ConflictError);
    crew.revoke(owner, grant.id);
    expect(() => crew.entryDetail(chief, id)).toThrow(AccessDeniedError);
  });

  it('shows the return reason and existing correction without exposing another worker’s detail', () => {
    const { fixture, owner, crew, chief, workerId, id } = setup();
    const worker = stepUpB5Principal(
      fixture.sqlite,
      fixture.repository.principalFor(workerId),
      'crew-return-worker',
    );
    crew.submit(chief, id, 1);
    fixture.repository.operationalApproveTime(
      owner,
      id,
      'needs_changes',
      'Correct the shift duration',
    );

    expect(crew.entryDetail(chief, id)).toMatchObject({
      approvalState: 'needs_changes',
      reviewReason: 'Correct the shift duration',
      activeCorrectionId: null,
      activeCorrectionState: null,
    });
    expect(fixture.repository.timeDetail(worker, id)).toMatchObject({
      review_reason: 'Correct the shift duration',
      active_correction_id: null,
    });

    const correction = fixture.repository.createCorrectionDraft(worker, {
      recordType: 'time_entry',
      originalId: id,
      requestId: 'crew-return-existing-correction-0001',
      reason: 'Use the revised on-site duration',
      patch: { minutes: 45 },
    });
    expect(crew.entryDetail(chief, id)).toMatchObject({
      reviewReason: 'Correct the shift duration',
      activeCorrectionId: null,
      activeCorrectionState: 'draft',
    });
    expect(fixture.repository.timeDetail(worker, id)).toMatchObject({
      worker_id: workerId,
      active_correction_id: correction.correctionId,
      active_correction_state: 'draft',
    });
    expect(() => fixture.repository.timeDetail(chief, correction.correctionId)).toThrow(
      AccessDeniedError,
    );

    fixture.repository.submitTime(worker, correction.correctionId, 1);
    fixture.repository.operationalApproveTime(
      owner,
      correction.correctionId,
      'needs_changes',
      'Explain the revised on-site duration',
    );
    const retry = fixture.repository.createCorrectionDraft(worker, {
      recordType: 'time_entry',
      originalId: correction.correctionId,
      requestId: 'crew-return-existing-correction-retry-0002',
      reason: 'Clarified the revised on-site duration',
      patch: { minutes: 50 },
    });
    expect(fixture.repository.timeDetail(worker, correction.correctionId)).toMatchObject({
      approval_state: 'rejected',
      review_reason: 'Explain the revised on-site duration',
      active_correction_id: retry.correctionId,
      active_correction_state: 'draft',
    });
    expect(fixture.repository.timeDetail(worker, id)).toMatchObject({
      review_reason: 'Correct the shift duration',
      active_correction_id: retry.correctionId,
    });
  });
});
