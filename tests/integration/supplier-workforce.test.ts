import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError, SupplierWorkforceRepository } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const operationalDate = new Date().toISOString().slice(0, 10);

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function seedCoordinatorCredential(
  fixture: B5LifecycleSecurityFixture,
  userId = fixture.worker.userId,
): void {
  const timestamp = new Date().toISOString();
  fixture.sqlite
    .prepare(
      `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
       VALUES(?,?,?,'credential',?,?,?,?)`,
    )
    .run(
      `supplier-fixture-coordinator-credential-${userId}`,
      'local:credential',
      `credential-${userId}`,
      userId,
      'fixture-credential-hash',
      timestamp,
      timestamp,
    );
}

function setup() {
  const fixture = createB5LifecycleSecurityFixture();
  fixtures.push(fixture);
  const suppliers = new SupplierWorkforceRepository(fixture.sqlite);
  const supplier = suppliers.createSupplier(fixture.owner, { name: 'Field supplier' });
  seedCoordinatorCredential(fixture);
  suppliers.setAccountProfile(fixture.owner, {
    userId: fixture.worker.userId,
    profile: 'supplier_coordinator',
    supplierId: supplier.id,
  });
  suppliers.grantProject(fixture.owner, {
    supplierId: supplier.id,
    projectId: fixture.project.id,
    coordinatorId: fixture.worker.userId,
    startsOn: '2026-01-01',
  });
  const coordinator = stepUpB5Principal(fixture.sqlite, fixture.worker, 'supplier-coordinator');
  const technician = suppliers.addTechnician(coordinator, {
    projectId: fixture.project.id,
    name: 'Technician One',
    startsOn: '2026-01-01',
  });
  return { fixture, suppliers, supplier, coordinator, technician };
}

describe('supplier workforce canonical time', () => {
  it('retains standard-worker own-time assignment filtering after membership expiry', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const entry = fixture.repository.createTimeEntry(fixture.worker, {
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 15,
      summary: 'Standard worker assignment regression',
    });
    expect(fixture.repository.listOwnTime(fixture.worker)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: entry.id })]),
    );

    fixture.sqlite
      .prepare("UPDATE project_member SET ends_on='2026-01-01' WHERE project_id=? AND user_id=?")
      .run(fixture.project.id, fixture.worker.userId);

    expect(fixture.repository.listOwnTime(fixture.worker)).toEqual([]);
    expect(fixture.repository.listOwnTimeWeek(fixture.worker, operationalDate).rows).toEqual([]);
    expect(fixture.repository.listTimeForScope(fixture.worker)).toEqual([]);
    expect(() => fixture.repository.timeDetail(fixture.worker, entry.id)).toThrow(AccessDeniedError);
  });

  it('keeps coordinator actor, technician subject, and approval pending in canonical time', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    const entry = suppliers.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 120,
      summary: 'Installed cabinet wiring',
    });
    const submitted = suppliers.submitTime(coordinator, { id: entry.id, version: entry.version });

    expect(submitted.version).toBe(2);
    expect(
      fixture.sqlite
        .prepare('SELECT worker_id,approval_state,billability_state FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({
      worker_id: technician.id,
      approval_state: 'submitted',
      billability_state: 'pending',
    });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT recorded_by_user_id FROM supplier_time_entry_recorder WHERE time_entry_id=?',
        )
        .get(entry.id),
    ).toEqual({ recorded_by_user_id: coordinator.userId });
    expect(
      fixture.sqlite
        .prepare(
          "SELECT actor_id FROM audit_event WHERE entity_type='time_entry' AND entity_id=? AND action='time.create'",
        )
        .get(entry.id),
    ).toEqual({ actor_id: coordinator.userId });
    expect(
      suppliers.operationalReport(coordinator, {
        projectId: fixture.project.id,
        from: operationalDate,
        to: operationalDate,
      }),
    ).toMatchObject({
      totalMinutes: 120,
      rows: [expect.objectContaining({ workerId: technician.id, recordedBy: coordinator.userId })],
    });
  });

  it('enforces current grants and preserves canonical aggregate checks', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    const create = (minutes: number, startTime?: string, endTime?: string) =>
      suppliers.createTime(coordinator, {
        workerId: technician.id,
        projectId: fixture.project.id,
        workDate: operationalDate,
        category: 'regular',
        minutes,
        summary: `Work ${minutes}`,
        startTime,
        endTime,
        breakMinutes: startTime ? 0 : undefined,
      });
    create(720, '08:00', '20:00');
    expect(() => create(721)).toThrow();
    expect(() => create(60, '19:00', '20:00')).toThrow();

    const grant = suppliers.listGrants(fixture.owner)[0] as { id: string };
    suppliers.revokeProject(fixture.owner, { id: grant.id });
    expect(() => create(1)).toThrow(AccessDeniedError);
  });

  it('revokes a coordinator installation across ordinary own time and report methods', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    const ownTime = fixture.repository.createTimeEntry(coordinator, {
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 15,
      summary: 'Coordinator own installation work',
    });
    const ownReport = fixture.repository.createDailyReport(coordinator, {
      projectId: fixture.project.id,
      workDate: operationalDate,
      summary: 'Coordinator operational report',
      tasksCompleted: 'Checked installation state',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    expect(fixture.repository.timeDetail(coordinator, ownTime.id)).toMatchObject({ id: ownTime.id });
    expect(fixture.repository.listOwnReports(coordinator)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownReport.id })]),
    );

    const grant = suppliers.listGrants(fixture.owner).find((row) => row.status === 'active');
    if (!grant) throw new Error('Expected active supplier project grant');
    suppliers.revokeProject(fixture.owner, { id: grant.id });

    expect(() =>
      fixture.repository.createTimeEntry(coordinator, {
        projectId: fixture.project.id,
        workDate: operationalDate,
        category: 'regular',
        minutes: 1,
        summary: 'Revoked own time attempt',
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      fixture.repository.updateTimeEntry(coordinator, {
        id: ownTime.id,
        version: ownTime.version,
        minutes: 30,
      }),
    ).toThrow(AccessDeniedError);
    expect(() => fixture.repository.submitTime(coordinator, ownTime.id, ownTime.version)).toThrow(
      AccessDeniedError,
    );
    expect(fixture.repository.listOwnTime(coordinator)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownTime.id })]),
    );
    expect(fixture.repository.listTimeForScope(coordinator)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownTime.id })]),
    );
    expect(fixture.repository.listOwnTimeWeek(coordinator, operationalDate).rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownTime.id })]),
    );
    expect(() => fixture.repository.timeDetail(coordinator, ownTime.id)).toThrow(AccessDeniedError);
    expect(fixture.repository.listAssignedProjects(coordinator)).toEqual([]);

    // Revoking this coordinator's grant does not alter an independently
    // assigned external technician's own membership authority.
    expect(
      fixture.repository.createTimeEntry(
        { userId: technician.id, role: 'worker', projectIds: new Set([fixture.project.id]) },
        {
          projectId: fixture.project.id,
          workDate: operationalDate,
          category: 'regular',
          minutes: 1,
          summary: 'Technician membership remains owner-managed',
        },
      ),
    ).toEqual(expect.objectContaining({ id: expect.any(String), version: 1 }));

    expect(fixture.repository.listOwnReports(coordinator)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownReport.id })]),
    );
    expect(() => fixture.repository.reportDetail(coordinator, ownReport.id)).toThrow(AccessDeniedError);
    expect(() => fixture.repository.submitReport(coordinator, 'daily', ownReport.id, 1)).toThrow(
      AccessDeniedError,
    );
  });

  it('requires an unexpired grant and active supplier for generic coordinator time', () => {
    const { fixture, suppliers, supplier, coordinator } = setup();
    const grant = suppliers.listGrants(fixture.owner).find((row) => row.status === 'active');
    if (!grant) throw new Error('Expected active supplier project grant');
    fixture.sqlite
      .prepare("UPDATE supplier_project_grant SET ends_on='2026-01-01' WHERE id=?")
      .run(grant.id);
    expect(() =>
      fixture.repository.createTimeEntry(coordinator, {
        projectId: fixture.project.id,
        workDate: operationalDate,
        category: 'regular',
        minutes: 1,
        summary: 'Expired grant attempt',
      }),
    ).toThrow(AccessDeniedError);

    fixture.sqlite.prepare('UPDATE supplier_project_grant SET ends_on=NULL WHERE id=?').run(grant.id);
    fixture.sqlite.prepare("UPDATE supplier SET status='inactive' WHERE id=?").run(supplier.id);
    expect(() =>
      fixture.repository.createTimeEntry(coordinator, {
        projectId: fixture.project.id,
        workDate: operationalDate,
        category: 'regular',
        minutes: 1,
        summary: 'Inactive supplier attempt',
      }),
    ).toThrow(AccessDeniedError);
  });

  it('rejects overlapping grants, preserves disjoint grants, and revokes the only active scope', () => {
    const { fixture, suppliers, supplier, coordinator, technician } = setup();
    const activeGrant = suppliers
      .listGrants(fixture.owner)
      .find((grant) => grant.status === 'active');
    expect(activeGrant).toBeDefined();
    expect(() =>
      suppliers.grantProject(fixture.owner, {
        supplierId: supplier.id,
        projectId: fixture.project.id,
        coordinatorId: coordinator.userId,
        startsOn: '2026-01-01',
      }),
    ).toThrow('overlaps an active grant');
    expect(
      suppliers.grantProject(fixture.owner, {
        supplierId: supplier.id,
        projectId: fixture.project.id,
        coordinatorId: coordinator.userId,
        startsOn: '2025-01-01',
        endsOn: '2025-12-31',
      }),
    ).toEqual(expect.objectContaining({ id: expect.any(String) }));

    suppliers.revokeProject(fixture.owner, { id: activeGrant!.id });
    expect(() =>
      suppliers.createTime(coordinator, {
        workerId: technician.id,
        projectId: fixture.project.id,
        workDate: operationalDate,
        category: 'regular',
        minutes: 1,
        summary: 'Revoked grant attempt',
      }),
    ).toThrow(AccessDeniedError);
    expect(
      suppliers.grantProject(fixture.owner, {
        supplierId: supplier.id,
        projectId: fixture.project.id,
        coordinatorId: coordinator.userId,
        startsOn: '2026-01-01',
      }),
    ).toEqual(expect.objectContaining({ id: expect.any(String) }));
  });

  it('does not appoint no-login personnel as a supplier coordinator', () => {
    const { fixture, suppliers, supplier, technician } = setup();
    expect(
      fixture.sqlite.prepare('SELECT 1 FROM account WHERE user_id=?').get(technician.id),
    ).toBeUndefined();
    expect(() =>
      suppliers.setAccountProfile(fixture.owner, {
        userId: technician.id,
        profile: 'supplier_coordinator',
        supplierId: supplier.id,
      }),
    ).toThrow('usable login account');
    expect(
      fixture.sqlite
        .prepare('SELECT profile FROM supplier_user_profile WHERE user_id=?')
        .get(technician.id),
    ).toEqual({ profile: 'external_technician' });
  });

  it('creates an immutable canonical correction draft for reviewer-returned technician time', () => {
    const { fixture, suppliers, supplier, coordinator, technician } = setup();
    const entry = suppliers.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 60,
      summary: 'Initial work',
    });
    suppliers.submitTime(coordinator, { id: entry.id, version: 1 });
    fixture.sqlite
      .prepare("UPDATE time_entry SET approval_state='needs_changes',version=version+1 WHERE id=?")
      .run(entry.id);
    const correction = suppliers.createTimeCorrection(coordinator, {
      originalId: entry.id,
      requestId: 'supplier-correction-001',
      reason: 'Corrected completed minutes',
      patch: { minutes: 90, summary: 'Corrected work' },
    });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT original_id,correction_id,actor_user_id FROM record_correction_link WHERE correction_id=?',
        )
        .get(correction.id),
    ).toEqual({
      original_id: entry.id,
      correction_id: correction.id,
      actor_user_id: coordinator.userId,
    });
    expect(
      fixture.sqlite
        .prepare('SELECT approval_state,minutes FROM time_entry WHERE id=?')
        .get(correction.id),
    ).toEqual({ approval_state: 'draft', minutes: 90 });
    expect(suppliers.submitTime(coordinator, { id: correction.id, version: 1 })).toEqual({
      id: correction.id,
      version: 2,
    });
    expect(
      suppliers.operationalReport(coordinator, {
        projectId: fixture.project.id,
        from: operationalDate,
        to: operationalDate,
      }).totalMinutes,
    ).toBe(90);
    // This legacy profile-history assertion intentionally promotes the
    // no-login personnel record before clearing it again. Seed a separate
    // credential so coordinator eligibility remains a real capability check.
    seedCoordinatorCredential(fixture, technician.id);
    suppliers.setAccountProfile(fixture.owner, {
      userId: technician.id,
      profile: 'supplier_coordinator',
      supplierId: supplier.id,
    });
    suppliers.setAccountProfile(fixture.owner, {
      userId: technician.id,
      profile: 'standard',
    });
    const ownerHistory = suppliers.operationalReport(fixture.owner, {
      projectId: fixture.project.id,
      supplierId: supplier.id,
      from: operationalDate,
      to: operationalDate,
    });
    expect(ownerHistory.totalMinutes).toBe(90);
    const period = fixture.sqlite
      .prepare(
        "SELECT starts_at FROM supplier_user_profile_period WHERE user_id=? AND profile='external_technician' ORDER BY starts_at LIMIT 1",
      )
      .get(technician.id) as { starts_at: string };
    fixture.sqlite
      .prepare(
        `INSERT INTO supplier_user_profile_period(id,user_id,supplier_id,profile,starts_at,ends_at,created_at)
         VALUES(?,?,?,'external_technician',?,'9999-12-31T23:59:59.999Z',?)`,
      )
      .run('test-overlap-period', technician.id, supplier.id, period.starts_at, period.starts_at);
    expect(
      suppliers.operationalReport(fixture.owner, {
        projectId: fixture.project.id,
        supplierId: supplier.id,
        from: operationalDate,
        to: operationalDate,
      }).totalMinutes,
    ).toBe(90);
    const otherSupplier = suppliers.createSupplier(fixture.owner, {
      name: 'History-isolated supplier',
    });
    expect(() =>
      suppliers.setAccountProfile(fixture.owner, {
        userId: technician.id,
        profile: 'external_technician',
        supplierId: otherSupplier.id,
      }),
    ).toThrow();
  });

  it('keeps supplier identity through owner corrections after a technician profile is cleared', () => {
    const { fixture, suppliers, supplier, coordinator, technician } = setup();
    const delegated = suppliers.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 60,
      summary: 'Coordinator-recorded source',
    });
    const technicianPrincipal = {
      userId: technician.id,
      role: 'worker' as const,
      projectIds: new Set([fixture.project.id]),
    };
    const ownEntered = fixture.repository.createTimeEntry(technicianPrincipal, {
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 30,
      summary: 'Technician-entered source',
    });
    suppliers.submitTime(coordinator, { id: delegated.id, version: delegated.version });
    fixture.repository.submitTime(technicianPrincipal, ownEntered.id, ownEntered.version);
    fixture.repository.operationalApproveTime(fixture.manager, delegated.id, 'approved');
    fixture.repository.operationalApproveTime(fixture.manager, ownEntered.id, 'approved');

    suppliers.setAccountProfile(fixture.owner, { userId: technician.id, profile: 'standard' });
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'supplier-owner-correction');
    const delegatedCorrection = fixture.repository.ownerOverrideCorrectionDraft(owner, {
      recordType: 'time_entry',
      originalId: delegated.id,
      requestId: 'supplier-owner-correction-delegated',
      reason: 'Owner corrected delegated supplier time',
      patch: { minutes: 90 },
    });
    const ownEnteredCorrection = fixture.repository.ownerOverrideCorrectionDraft(owner, {
      recordType: 'time_entry',
      originalId: ownEntered.id,
      requestId: 'supplier-owner-correction-own-entered',
      reason: 'Owner corrected self-entered supplier time',
      patch: { minutes: 45 },
    });
    fixture.repository.submitTime(owner, delegatedCorrection.id, delegatedCorrection.version);
    fixture.repository.submitTime(owner, ownEnteredCorrection.id, ownEnteredCorrection.version);
    fixture.repository.operationalApproveTime(fixture.manager, delegatedCorrection.id, 'approved');
    fixture.repository.operationalApproveTime(fixture.manager, ownEnteredCorrection.id, 'approved');

    const originalRows = fixture.sqlite
      .prepare('SELECT id,created_at FROM time_entry WHERE id IN (?,?) ORDER BY id')
      .all(delegated.id, ownEntered.id) as Array<{ id: string; created_at: string }>;
    const correctionRows = fixture.sqlite
      .prepare('SELECT id,created_at FROM time_entry WHERE id IN (?,?) ORDER BY id')
      .all(delegatedCorrection.id, ownEnteredCorrection.id) as Array<{
      id: string;
      created_at: string;
    }>;
    expect(
      correctionRows.every((row) =>
        originalRows.some((source) => row.created_at > source.created_at),
      ),
    ).toBe(true);
    expect(
      fixture.sqlite
        .prepare('SELECT 1 FROM supplier_time_entry_recorder WHERE time_entry_id IN (?,?)')
        .all(delegatedCorrection.id, ownEnteredCorrection.id),
    ).toEqual([]);
    expect(
      fixture.sqlite
        .prepare(
          'SELECT correction_id,actor_user_id FROM record_correction_link WHERE correction_id IN (?,?) ORDER BY correction_id',
        )
        .all(delegatedCorrection.id, ownEnteredCorrection.id),
    ).toEqual(
      expect.arrayContaining([
        { correction_id: delegatedCorrection.id, actor_user_id: owner.userId },
        { correction_id: ownEnteredCorrection.id, actor_user_id: owner.userId },
      ]),
    );

    const report = suppliers.operationalReport(fixture.owner, {
      projectId: fixture.project.id,
      supplierId: supplier.id,
      from: operationalDate,
      to: operationalDate,
    });
    expect(report.totalMinutes).toBe(135);
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: delegatedCorrection.id,
          recordedBy: owner.userId,
          minutes: 90,
        }),
        expect.objectContaining({
          id: ownEnteredCorrection.id,
          recordedBy: owner.userId,
          minutes: 45,
        }),
      ]),
    );
    expect(report.rows.map((row) => row.id)).not.toEqual(
      expect.arrayContaining([delegated.id, ownEntered.id]),
    );
  });

  it('keeps coordinator operations inside its supplier and currently granted project', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    const otherSupplier = suppliers.createSupplier(fixture.owner, { name: 'Other supplier' });
    const otherTechnician = suppliers.addTechnician(fixture.owner, {
      supplierId: otherSupplier.id,
      projectId: fixture.project.id,
      name: 'Other Technician',
      startsOn: '2026-01-01',
    });
    const otherProject = fixture.repository.createProject(fixture.owner, {
      clientId: fixture.client.id,
      name: 'Unassigned supplier project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    expect(
      suppliers.assignTechnician(fixture.owner, {
        workerId: otherTechnician.id,
        projectId: otherProject.id,
        startsOn: '2026-01-01',
      }),
    ).toEqual(expect.objectContaining({ id: expect.any(String) }));

    expect(suppliers.listTechnicians(coordinator)).toEqual([
      expect.objectContaining({ id: technician.id }),
    ]);
    expect(() =>
      suppliers.createTime(coordinator, {
        workerId: otherTechnician.id,
        projectId: fixture.project.id,
        workDate: operationalDate,
        category: 'regular',
        minutes: 1,
        summary: 'Cross-supplier attempt',
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      suppliers.addTechnician(coordinator, {
        projectId: otherProject.id,
        name: 'Wrong project',
        startsOn: '2026-01-01',
      }),
    ).toThrow(AccessDeniedError);
    fixture.sqlite.prepare("UPDATE user SET status='suspended' WHERE id=?").run(coordinator.userId);
    expect(() => suppliers.listProjects(coordinator)).toThrow(AccessDeniedError);
  });

  it('voids an external technician delegated draft instead of deleting recorder provenance', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    const entry = suppliers.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: operationalDate,
      category: 'regular',
      minutes: 30,
      summary: 'Discarded draft',
    });
    fixture.repository.deleteTime(
      { userId: technician.id, role: 'worker', projectIds: new Set([fixture.project.id]) },
      entry.id,
      entry.version,
    );
    expect(
      fixture.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(entry.id),
    ).toEqual({
      approval_state: 'void',
    });
    expect(
      fixture.sqlite
        .prepare(
          'SELECT recorded_by_user_id FROM supplier_time_entry_recorder WHERE time_entry_id=?',
        )
        .get(entry.id),
    ).toEqual({ recorded_by_user_id: coordinator.userId });
  });
});
