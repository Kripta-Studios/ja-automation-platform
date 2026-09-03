import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
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

describe('domain security implementation contracts', () => {
  it('scopes project-manager worker listings to active labor assignments', () => {
    const value = fixture();
    const offboarded = 'b5-offboarded';
    value.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        offboarded,
        offboarded,
        `${offboarded}@example.test`,
        'worker',
        'offboarded',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
    value.sqlite
      .prepare(
        'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'pm-offboarded-assignment',
        value.project.id,
        offboarded,
        'worker',
        '2026-01-01',
        null,
        null,
        0,
        'active',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );

    const listed = value.repository.listAllWorkers(value.manager);
    expect(listed.map((worker) => worker.id)).toEqual(
      expect.arrayContaining([value.worker.userId, value.manager.userId]),
    );
    expect(listed.map((worker) => worker.id)).not.toEqual(
      expect.arrayContaining([value.owner.userId, value.finance.userId, value.outsider.userId]),
    );
    expect(listed.map((worker) => worker.id)).not.toContain(offboarded);
    expect(
      listed.every((worker) => ['worker', 'project_manager'].includes(String(worker.role))),
    ).toBe(true);
  });

  it('rejects planning against a future or expired project assignment', () => {
    const value = fixture();
    value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: value.outsider.userId,
      startsOn: '2026-09-01',
    });

    expect(() =>
      value.repository.createPlanningAssignment(value.manager, {
        projectId: value.project.id,
        workerId: value.outsider.userId,
        startsAt: '2026-08-22T08:00:00.000Z',
        endsAt: '2026-08-22T10:00:00.000Z',
        plannedMinutes: 120,
      }),
    ).toThrow(/assignment|active|project/i);

    value.sqlite
      .prepare(
        'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'pm-expired-assignment',
        value.project.id,
        value.outsider.userId,
        'worker',
        '2026-01-01',
        '2026-08-21',
        null,
        0,
        'active',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
    expect(() =>
      value.repository.createPlanningAssignment(value.manager, {
        projectId: value.project.id,
        workerId: value.outsider.userId,
        startsAt: '2026-08-22T08:00:00.000Z',
        endsAt: '2026-08-22T10:00:00.000Z',
        plannedMinutes: 120,
      }),
    ).toThrow(/assignment|active|project/i);
  });

  it('rejects compensation rules for admin targets and settlements outside a full assignment period', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'domain-security');
    expect(() =>
      value.v3.createCompensationRule(finance, {
        workerId: value.owner.userId,
        projectId: value.project.id,
        currency: 'EUR',
        rateMinor: 6_000n,
        rateBasis: 'hourly',
        ruleType: 'Hourly',
        effectiveFrom: '2026-01-01',
      }),
    ).toThrow(/worker|labor|active/i);

    value.sqlite
      .prepare(
        "UPDATE project_member SET ends_on='2026-08-15' WHERE project_id=? AND user_id=? AND status='active'",
      )
      .run(value.project.id, value.worker.userId);
    expect(() =>
      value.v3.settleCompensation(finance, {
        workerId: value.worker.userId,
        projectId: value.project.id,
        periodStart: '2026-08-10',
        periodEnd: '2026-08-20',
      }),
    ).toThrow(/assigned|period|worker/i);
  });

  it('deletes only unreferenced temporary or failed documents', () => {
    const value = fixture();
    const committedId = 'committed-document';
    value.sqlite
      .prepare(
        'INSERT INTO document(id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,created_at,updated_at,scan_status,sensitivity,artifact_classification,classification_provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        committedId,
        value.project.id,
        value.owner.userId,
        'a'.repeat(64),
        'application/pdf',
        10,
        'committed',
        'reports/committed.pdf',
        '2026-08-22T00:00:00.000Z',
        '2026-08-22T00:00:00.000Z',
        'clean',
        'internal',
        'standard',
        'native',
      );
    expect(() => value.v3.deleteDocument(value.owner, committedId)).toThrow(
      /committed|archive|immutable|delete/i,
    );
    expect(value.sqlite.prepare('SELECT state FROM document WHERE id=?').get(committedId)).toEqual({
      state: 'committed',
    });

    const temporary = value.v3.reserveUpload(value.owner, {
      projectId: value.project.id,
      originalFilename: 'temporary.pdf',
      artifactType: 'report',
    });
    value.v3.deleteDocument(value.owner, temporary.reservationId);
    expect(
      value.sqlite.prepare('SELECT id FROM document WHERE id=?').get(temporary.reservationId),
    ).toBeUndefined();
  });
});
