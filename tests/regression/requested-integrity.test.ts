import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  readSource,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

// Requirement coverage: V31-008/010, V32-001, V33-017, SPEC-HISTORY-001,
// SEC-RBAC-001 and SEC-UPLOAD-001.

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('requested immutable-history and RBAC invariants (RED characterization)', () => {
  it('supports client-contact create, edit and delete by record id', () => {
    const value = fixture();
    const created = value.repository.createClientContact(value.owner, {
      clientId: value.client.id,
      name: 'Operations contact',
      email: 'ops@example.test',
      role: 'Controls lead',
    });
    expect(value.repository.listClientContacts(value.owner, value.client.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, name: 'Operations contact' }),
      ]),
    );

    value.repository.updateClientContact(value.owner, created.id, {
      name: 'Updated operations contact',
      phone: '+34 900 000 000',
    });
    expect(value.repository.listClientContacts(value.owner, value.client.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          name: 'Updated operations contact',
          phone: '+34 900 000 000',
        }),
      ]),
    );

    value.repository.deleteClientContact(value.owner, created.id);
    expect(value.repository.listClientContacts(value.owner, value.client.id)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it('lets owner/admin assign a catalog skill and availability window to a selected worker', () => {
    const value = fixture();
    const skill = value.repository.createSkill(value.owner, {
      code: 'PLC-OPS',
      name: 'PLC operations',
    });
    value.repository.setWorkerSkill(value.owner, {
      workerId: value.worker.userId,
      skillId: skill.id,
      proficiency: 4,
    });
    value.repository.setWorkerAvailability(value.owner, {
      workerId: value.worker.userId,
      startsAt: '2026-08-24T08:00:00.000Z',
      endsAt: '2026-08-24T17:00:00.000Z',
      availability: 'available',
      note: 'Owner-assigned availability',
    });

    expect(value.repository.listWorkerSkills(value.owner, value.worker.userId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ skill_id: skill.id, proficiency: 4 })]),
    );
    expect(value.repository.listWorkerAvailability(value.owner, value.worker.userId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'available', note: 'Owner-assigned availability' }),
      ]),
    );
  });

  it('blocks void/delete of a locked time entry and preserves the locked state', () => {
    const value = fixture();
    const created = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'commissioning',
      minutes: 90,
      summary: 'Locked history fixture',
    }) as { id: string; version: number };
    value.repository.submitTime(value.worker, created.id, created.version);
    const submitted = value.sqlite
      .prepare('SELECT version FROM time_entry WHERE id=?')
      .get(created.id) as { version: number };
    value.repository.operationalApproveTime(value.manager, created.id, 'approved');

    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='locked',version=version+1 WHERE id=?")
      .run(created.id);
    const locked = value.sqlite
      .prepare('SELECT version,approval_state FROM time_entry WHERE id=?')
      .get(created.id) as { version: number; approval_state: string };
    expect(locked.approval_state).toBe('locked');
    expect(locked.version).toBeGreaterThan(submitted.version);

    expect(() => value.repository.deleteTime(value.owner, created.id, locked.version)).toThrow(
      /locked|void|immutable/i,
    );
    expect(
      value.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(created.id),
      'locked source history must remain locked after a rejected destructive request',
    ).toEqual({ approval_state: 'locked' });
  });

  it('excludes voided time from worker compensation statements', () => {
    const value = fixture();
    value.v3.createCompensationRule(value.finance, {
      workerId: value.worker.userId,
      projectId: value.project.id,
      currency: 'EUR',
      rateMinor: 6_000n,
      rateBasis: 'hourly',
      ruleType: 'Hourly',
      effectiveFrom: '2026-01-01',
    });
    const created = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-21',
      category: 'regular',
      minutes: 120,
      summary: 'Voided history fixture',
    }) as { id: string; version: number };
    value.repository.submitTime(value.worker, created.id, created.version);
    value.repository.operationalApproveTime(value.manager, created.id, 'approved');
    const approved = value.sqlite
      .prepare('SELECT version FROM time_entry WHERE id=?')
      .get(created.id) as { version: number };
    value.repository.deleteTime(value.worker, created.id, approved.version);

    const pay = value.v3.workerPay(value.worker, '2026-08-01', '2026-08-31');
    expect(pay.approvedMinutes, 'voided minutes must not be treated as approved pay').toBe(0);
    expect(pay.pendingMinutes, 'voided minutes must not be treated as pending pay').toBe(0);
  });

  it('does not allow an owner to demote the last owner account through worker profile editing', () => {
    const value = fixture();
    expect(() =>
      value.repository.updateWorkerProfile(value.owner, value.owner.userId, {
        name: 'B5 Owner',
        email: 'b5-owner@example.test',
        role: 'worker',
        joinedAt: '2026-01-01',
      }),
    ).toThrow(/owner|role|administration/i);
    expect(
      value.sqlite.prepare('SELECT role FROM user WHERE id=?').get(value.owner.userId),
      'the final owner role must remain intact when a self-demotion is attempted',
    ).toEqual({ role: 'owner_admin' });
  });

  it('requires a durable stale-upload cleanup path and reservation-scoped keys', () => {
    const value = fixture();
    const first = value.v3.reserveUpload(value.owner, {
      projectId: value.project.id,
      originalFilename: 'handover.pdf',
      artifactType: 'report',
    });
    let second: ReturnType<typeof value.v3.reserveUpload> | undefined;
    expect(() => {
      second = value.v3.reserveUpload(value.owner, {
        projectId: value.project.id,
        originalFilename: 'handover.pdf',
        artifactType: 'report',
      });
    }, 'reservation metadata must not collide on the temporary pending hash').not.toThrow();
    expect(second).toBeDefined();
    if (!second) return;
    expect(first.reservationId).not.toBe(second.reservationId);
    expect(first.storageKey).not.toBe(second.storageKey);
    expect(
      value.sqlite.prepare("SELECT count(*) count FROM document WHERE state='temporary'").get(),
    ).toEqual({ count: 2 });

    const repository = readSource('packages/database/src/v3-repository.ts');
    expect(
      repository,
      'temporary reservations need a cleanup operation with an age boundary',
    ).toMatch(/(?:cleanup|purge|expire)[A-Za-z]*(?:Upload|Reservation|Temporary)/i);
  });
});
