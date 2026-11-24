import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  SupplierWorkforceRepository,
  ValidationError,
  canonicalSupplierTimeCategory,
  revokedMembershipEnd,
} from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
const today = new Date().toISOString().slice(0, 10);
const shift = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function seedCredential(fixture: B5LifecycleSecurityFixture, userId: string): void {
  const timestamp = new Date().toISOString();
  fixture.sqlite
    .prepare(
      `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
       VALUES(?,?,?,'credential',?,?,?,?)`,
    )
    .run(
      `g4-credential-${userId}`,
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
  seedCredential(fixture, fixture.worker.userId);
  Object.assign(fixture.owner, stepUpB5Principal(fixture.sqlite, fixture.owner, 'g4-owner'));
  // The coordinator in these tests is a fresh account, not the fixture worker
  // who already has an ordinary worker assignment.
  fixture.sqlite
    .prepare("UPDATE project_member SET status='inactive',ends_on='2026-01-01' WHERE user_id=?")
    .run(fixture.worker.userId);
  suppliers.setAccountProfile(fixture.owner, {
    userId: fixture.worker.userId,
    profile: 'supplier_coordinator',
    supplierId: supplier.id,
  });
  const grant = suppliers.grantProject(fixture.owner, {
    supplierId: supplier.id,
    projectId: fixture.project.id,
    coordinatorId: fixture.worker.userId,
    startsOn: today,
  });
  const coordinator = stepUpB5Principal(fixture.sqlite, fixture.worker, 'g4-coordinator');
  const technician = suppliers.addTechnician(coordinator, {
    projectId: fixture.project.id,
    name: 'Technician One',
    startsOn: today,
  });
  return { fixture, suppliers, supplier, grant, coordinator, technician };
}

const membership = (fixture: B5LifecycleSecurityFixture, userId: string) =>
  fixture.sqlite
    .prepare(
      'SELECT assignment_role,status,starts_on,ends_on FROM project_member WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1',
    )
    .get(fixture.project.id, userId) as {
    assignment_role: string;
    status: string;
    starts_on: string;
    ends_on: string | null;
  };

describe('supplier coordinator is not a J&A worker (D3, T05)', () => {
  it('gives the coordinator a non-billable scope membership and no own time or expenses', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    expect(membership(fixture, coordinator.userId)).toMatchObject({
      assignment_role: 'supplier_coordinator',
      status: 'active',
    });
    // The scope still works: the coordinator records his technician's hours.
    const entry = suppliers.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: today,
      category: 'work',
      minutes: 60,
      summary: 'Cabinet wiring',
    });
    expect(
      fixture.sqlite
        .prepare('SELECT category,billability_state FROM time_entry WHERE id=?')
        .get(entry.id),
    ).toEqual({ category: 'regular', billability_state: 'pending' });
    // His own hours and expenses are refused.
    expect(() =>
      fixture.repository.createTimeEntry(coordinator, {
        projectId: fixture.project.id,
        workDate: today,
        category: 'regular',
        minutes: 240,
        summary: 'Own hours',
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      fixture.repository.createExpense(coordinator, {
        projectId: fixture.project.id,
        spentOn: today,
        vendor: 'Fuel station',
        category: 'fuel',
        description: 'Fuel',
        currency: 'EUR',
        amountMinor: 60_000n,
        whoPaid: 'worker',
        clientTreatment: 'reimbursable',
        receiptRequired: false,
      }),
    ).toThrow(AccessDeniedError);
  });

  it('records a project manager without a worker assignment as non-billable', () => {
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const create = (summary: string) =>
      fixture.repository.createTimeEntry(fixture.manager, {
        projectId: fixture.project.id,
        workDate: today,
        category: 'regular',
        minutes: 60,
        summary,
      });
    const asWorker = create('Worked on site');
    fixture.sqlite
      .prepare("UPDATE project_member SET assignment_role='project_manager' WHERE user_id=?")
      .run(fixture.manager.userId);
    const asManager = create('Coordinated the crew');
    const billability = (id: string) =>
      (
        fixture.sqlite.prepare('SELECT billability_state s FROM time_entry WHERE id=?').get(id) as {
          s: string;
        }
      ).s;
    expect(billability(asWorker.id)).toBe('pending');
    expect(billability(asManager.id)).toBe('non_billable');
  });
});

describe('supplier time categories and scope (T21, T46)', () => {
  it('accepts only the canonical categories and maps the old Work key to regular', () => {
    const { fixture, suppliers, coordinator, technician } = setup();
    expect(canonicalSupplierTimeCategory('work')).toBe('regular');
    const batch = (category: string, requestId: string) =>
      suppliers.createTimeBatch(coordinator, {
        requestId,
        workerIds: [technician.id],
        projectId: fixture.project.id,
        workDate: today,
        category,
        minutes: 60,
        summary: 'Batch',
      });
    expect(() => batch('billable_premium', 'g4-batch-request-0001')).toThrow(ValidationError);
    const created = batch('overtime', 'g4-batch-request-0002').created[0]!;
    expect(
      fixture.sqlite.prepare('SELECT category FROM time_entry WHERE id=?').get(created.id),
    ).toEqual({ category: 'overtime' });
  });

  it('refuses ids outside the supplier the same way whether they exist or not', () => {
    const { fixture, suppliers, coordinator } = setup();
    const foreign = fixture.repository.createTimeEntry(fixture.manager, {
      projectId: fixture.project.id,
      workDate: today,
      category: 'regular',
      minutes: 30,
      summary: 'J&A worker hours',
    });
    fixture.repository.submitTime(fixture.manager, foreign.id, foreign.version);
    const attempt = (id: string) => () =>
      suppliers.updateTime(coordinator, { id, version: 1, minutes: 45 });
    const message = (run: () => unknown) => {
      try {
        run();
      } catch (caught) {
        return [(caught as Error).constructor.name, (caught as Error).message];
      }
      return null;
    };
    expect(message(attempt(foreign.id))).toEqual(message(attempt('01aaaaaa-0000-7000-8000-000000000000')));
    expect(message(attempt(foreign.id))?.[0]).toBe('AccessDeniedError');
  });
});

describe('revoking an installation authorization (T06)', () => {
  it('requires a reason and ends the memberships the authorization created', () => {
    const { fixture, suppliers, grant, coordinator, technician } = setup();
    const draft = suppliers.createTime(coordinator, {
      workerId: technician.id,
      projectId: fixture.project.id,
      workDate: shift(today, 2),
      category: 'regular',
      minutes: 60,
      summary: 'Planned future shift',
    });
    expect(draft.id).toBeTruthy();
    expect(() => suppliers.revokeProject(fixture.owner, { id: grant.id })).toThrow(ValidationError);
    const result = suppliers.revokeProject(fixture.owner, {
      id: grant.id,
      reason: 'Installation finished',
    });
    expect(result.endedAssignments).toBe(2);
    expect(membership(fixture, coordinator.userId)).toMatchObject({
      status: 'inactive',
      ends_on: today,
    });
    // Recorded work after today stays inside the ended assignment.
    expect(membership(fixture, technician.id)).toMatchObject({
      status: 'inactive',
      ends_on: shift(today, 2),
    });
    expect(
      fixture.sqlite
        .prepare(
          "SELECT json_extract(details_json,'$.reason') reason FROM audit_event WHERE action='supplier.revoke' AND entity_id=?",
        )
        .get(grant.id),
    ).toEqual({ reason: 'Installation finished' });
  });

  it('explains a coordinator of another supplier instead of a generic refusal', () => {
    const { fixture, suppliers } = setup();
    const other = suppliers.createSupplier(fixture.owner, { name: 'Other supplier' });
    expect(() =>
      suppliers.grantProject(fixture.owner, {
        supplierId: other.id,
        projectId: fixture.project.id,
        coordinatorId: fixture.worker.userId,
        startsOn: today,
      }),
    ).toThrow('This coordinator belongs to another supplier');
  });

  it('computes the end of a revoked assignment without cutting recorded history', () => {
    expect(revokedMembershipEnd({ starts_on: '2026-01-01', ends_on: null }, '2026-11-20', null)).toBe(
      '2026-11-20',
    );
    expect(
      revokedMembershipEnd({ starts_on: '2026-01-01', ends_on: '2026-10-01' }, '2026-11-20', null),
    ).toBe('2026-10-01');
    expect(
      revokedMembershipEnd({ starts_on: '2026-01-01', ends_on: null }, '2026-11-20', '2026-11-24'),
    ).toBe('2026-11-24');
    expect(revokedMembershipEnd({ starts_on: '2026-12-01', ends_on: null }, '2026-11-20', null)).toBe(
      '2026-11-20',
    );
  });
});

describe('ending an assignment with later unapproved hours (T19) and supplier staff (T42)', () => {
  function laterHours() {
    const context = setup();
    const { fixture, suppliers, coordinator, technician } = context;
    const later = (days: number, summary: string) =>
      suppliers.createTime(coordinator, {
        workerId: technician.id,
        projectId: fixture.project.id,
        workDate: shift(today, days),
        category: 'regular',
        minutes: 120,
        summary,
      });
    const draft = later(2, 'Planned commissioning');
    const pending = later(3, 'Planned commissioning, sent');
    suppliers.submitTime(coordinator, { id: pending.id, version: pending.version });
    const assignment = fixture.sqlite
      .prepare("SELECT id,version FROM project_member WHERE user_id=? AND status='active'")
      .get(technician.id) as { id: string; version: number };
    return { ...context, draft, pending, assignment };
  }
  const state = (fixture: B5LifecycleSecurityFixture, id: string) =>
    (
      fixture.sqlite.prepare('SELECT approval_state s FROM time_entry WHERE id=?').get(id) as {
        s: string;
      }
    ).s;

  it('names the resolvable later hours, then discards drafts and rejects pending ones on request', () => {
    const { fixture, draft, pending, assignment } = laterHours();
    let refusal: unknown;
    try {
      fixture.repository.removeAssignment(fixture.owner, assignment.id, {
        reason: 'Installation finished early',
        version: assignment.version,
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({ resolvableLaterTime: 2 });
    expect(state(fixture, draft.id)).toBe('draft');

    expect(
      fixture.repository.removeAssignment(fixture.owner, assignment.id, {
        reason: 'Installation finished early',
        version: assignment.version,
        resolveLaterTime: true,
      }),
    ).toEqual({ discarded: 1, rejected: 1 });
    expect(state(fixture, draft.id)).toBe('void');
    expect(state(fixture, pending.id)).toBe('rejected');
    expect(
      fixture.sqlite
        .prepare("SELECT reason FROM approval_event WHERE entity_id=? AND to_state='rejected'")
        .get(pending.id),
    ).toEqual({ reason: 'Assignment ended: Installation finished early' });
    expect(
      fixture.sqlite.prepare('SELECT status,ends_on FROM project_member WHERE id=?').get(assignment.id),
    ).toEqual({ status: 'inactive', ends_on: today });
  });

  it('lets no project manager end or change a supplier technician assignment (D5)', () => {
    const { fixture, assignment } = laterHours();
    const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'g4-manager');
    expect(() =>
      fixture.repository.removeAssignment(manager, assignment.id, {
        reason: 'PM tries to end supplier staff',
        version: assignment.version,
        resolveLaterTime: true,
      }),
    ).toThrow('Supplier staff assignments are managed by the owner');
  });
});
