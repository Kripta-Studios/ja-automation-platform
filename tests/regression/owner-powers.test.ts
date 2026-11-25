import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

/**
 * Owner decision 2026-11-25: the Owner (owner_admin) has absolute powers on every user.
 * These tests pin each relaxed Owner check and that the other roles keep their limits.
 */
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture() {
  const base = createB5LifecycleSecurityFixture();
  const owner = stepUpB5Principal(base.sqlite, base.owner, 'owner-powers-owner');
  const manager = stepUpB5Principal(base.sqlite, base.manager, 'owner-powers-manager');
  const worker = stepUpB5Principal(base.sqlite, base.worker, 'owner-powers-worker');
  const value = { ...base, owner, manager, worker };
  fixtures.push(value);
  return value;
}

const time = (projectId: string, workDate: string, minutes = 120) => ({
  projectId,
  workDate,
  category: 'regular',
  minutes,
  summary: 'Owner powers regression',
});

const count = (value: B5LifecycleSecurityFixture, sql: string, ...args: unknown[]) =>
  Number(
    (value.sqlite.prepare(sql).get(...(args as never[])) as { count: number } | undefined)?.count ??
      0,
  );

function caught(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

describe('owner powers: time and expenses outside an assignment', () => {
  it('offers the extension instead of recording silently, and writes nothing', () => {
    const value = fixture();
    const error = caught(() =>
      value.repository.createTimeEntry(value.owner, time(value.project.id, '2026-08-17'), 'b5-outsider'),
    ) as AccessDeniedError & { code?: string; ownerAssignment?: Record<string, unknown> };
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(error.code).toBe('OWNER_ASSIGNMENT_EXTENSION_AVAILABLE');
    expect(error.ownerAssignment).toMatchObject({
      projectId: value.project.id,
      workerId: 'b5-outsider',
      date: '2026-08-17',
      projectOpen: true,
    });
    expect(count(value, 'SELECT COUNT(*) count FROM time_entry')).toBe(0);
    expect(
      count(value, "SELECT COUNT(*) count FROM project_member WHERE user_id='b5-outsider'"),
    ).toBe(0);
  });

  it('creates a one-day assignment, saves the time, audits and notifies the person', () => {
    const value = fixture();
    const saved = value.repository.createTimeEntry(
      value.owner,
      time(value.project.id, '2026-08-17'),
      'b5-outsider',
      { ensureAssignment: true },
    );
    expect(saved.id).toBeTruthy();
    expect(
      value.sqlite
        .prepare(
          "SELECT assignment_role role,starts_on,ends_on,status FROM project_member WHERE user_id='b5-outsider'",
        )
        .get(),
    ).toEqual({ role: 'worker', starts_on: '2026-08-17', ends_on: '2026-08-17', status: 'active' });
    const audit = value.sqlite
      .prepare(
        "SELECT actor_id,details_json FROM audit_event WHERE action='assignment.create' AND details_json LIKE '%ownerOverride%'",
      )
      .get() as { actor_id: string; details_json: string };
    expect(audit.actor_id).toBe('b5-owner');
    expect(JSON.parse(audit.details_json)).toMatchObject({
      ownerOverride: 'create_assignment_to_record',
      workerId: 'b5-outsider',
    });
    expect(
      count(
        value,
        "SELECT COUNT(*) count FROM notification WHERE user_id='b5-outsider' AND kind='assignment_published' AND subject_id=? AND read_at IS NULL",
        value.project.id,
      ),
    ).toBe(1);
    expect(count(value, "SELECT COUNT(*) count FROM audit_event WHERE action='time.create'")).toBe(1);
  });

  it('extends the nearest assignment forward or backward to the recorded day', () => {
    const value = fixture();
    const assignment = value.sqlite
      .prepare("SELECT id,version FROM project_member WHERE user_id='b5-worker'")
      .get() as { id: string; version: number };
    value.repository.updateAssignment(value.owner, assignment.id, {
      endsOn: '2026-08-10',
      version: assignment.version,
    });
    value.repository.createTimeEntry(value.owner, time(value.project.id, '2026-08-14'), 'b5-worker', {
      ensureAssignment: true,
    });
    expect(
      value.sqlite.prepare('SELECT starts_on,ends_on FROM project_member WHERE id=?').get(assignment.id),
    ).toEqual({ starts_on: '2026-01-01', ends_on: '2026-08-14' });
    // Before the start: the start moves back.
    value.repository.createTimeEntry(value.owner, time(value.project.id, '2025-12-29'), 'b5-worker', {
      ensureAssignment: true,
    });
    expect(
      value.sqlite.prepare('SELECT starts_on,ends_on FROM project_member WHERE id=?').get(assignment.id),
    ).toEqual({ starts_on: '2025-12-29', ends_on: '2026-08-14' });
    expect(
      count(
        value,
        "SELECT COUNT(*) count FROM audit_event WHERE action='assignment.update' AND entity_id=? AND details_json LIKE '%extend_assignment_to_record%'",
        assignment.id,
      ),
    ).toBe(2);
  });

  it('rolls the assignment back when the time itself cannot be saved', () => {
    const value = fixture();
    expect(() =>
      value.repository.createTimeEntry(
        value.owner,
        { ...time(value.project.id, '2026-08-17'), minutes: 5000 },
        'b5-outsider',
        { ensureAssignment: true },
      ),
    ).toThrow();
    expect(
      count(value, "SELECT COUNT(*) count FROM project_member WHERE user_id='b5-outsider'"),
    ).toBe(0);
  });

  it('records an expense for an unassigned day with the same one-step option', () => {
    const value = fixture();
    const expense = {
      projectId: value.project.id,
      spentOn: '2026-08-18',
      vendor: 'Fuel station',
      category: 'fuel',
      description: 'Owner recorded fuel',
      currency: 'EUR' as const,
      amountMinor: 4250n,
      whoPaid: 'worker' as const,
      receiptRequired: false,
    };
    const error = caught(() =>
      value.repository.createExpense(value.owner, expense, 'b5-outsider'),
    ) as { code?: string };
    expect(error.code).toBe('OWNER_ASSIGNMENT_EXTENSION_AVAILABLE');
    const saved = value.repository.createExpense(value.owner, expense, 'b5-outsider', undefined, {
      ensureAssignment: true,
    });
    expect(
      value.sqlite.prepare('SELECT amount_minor,worker_id FROM expense WHERE id=?').get(saved.id),
    ).toEqual({ amount_minor: 4250, worker_id: 'b5-outsider' });
  });

  it('records time for a supplier coordinator as non-billable coordinator scope (D3 kept)', () => {
    const value = fixture();
    seedB5User(value.sqlite, 'b5-coordinator', 'worker');
    const supplier = value.sqlite
      .prepare(
        "INSERT INTO supplier(id,name,status,created_at,updated_at) VALUES('b5-supplier','B5 Supplier','active',?,?) RETURNING id",
      )
      .get(new Date().toISOString(), new Date().toISOString()) as { id: string } | undefined;
    expect(supplier?.id).toBe("b5-supplier");
    value.sqlite
      .prepare(
        "INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES('b5-coordinator','b5-supplier','supplier_coordinator',?,?)",
      )
      .run(new Date().toISOString(), new Date().toISOString());
    const saved = value.repository.createTimeEntry(
      value.owner,
      time(value.project.id, '2026-08-17'),
      'b5-coordinator',
      { ensureAssignment: true },
    );
    expect(
      value.sqlite.prepare('SELECT billability_state FROM time_entry WHERE id=?').get(saved.id),
    ).toEqual({ billability_state: 'non_billable' });
    expect(
      value.sqlite
        .prepare("SELECT assignment_role FROM project_member WHERE user_id='b5-coordinator'")
        .get(),
    ).toEqual({ assignment_role: 'supplier_coordinator' });
  });
});

describe('owner powers: other roles keep their limits', () => {
  it('a project manager cannot record outside an assignment, even when asking to extend', () => {
    const value = fixture();
    const manager: Principal = { ...value.manager, projectIds: new Set([value.project.id]) };
    expect(() =>
      value.repository.createTimeEntry(manager, time(value.project.id, '2026-08-17'), 'b5-outsider', {
        ensureAssignment: true,
      }),
    ).toThrow(AccessDeniedError);
    expect(
      count(value, "SELECT COUNT(*) count FROM project_member WHERE user_id='b5-outsider'"),
    ).toBe(0);
  });

  it('a worker cannot extend his own assignment by recording time', () => {
    const value = fixture();
    expect(() =>
      value.repository.createTimeEntry(value.worker, time(value.project.id, '2025-12-29'), 'b5-worker', {
        ensureAssignment: true,
      }),
    ).toThrow(AccessDeniedError);
    expect(
      value.sqlite.prepare("SELECT starts_on FROM project_member WHERE user_id='b5-worker'").get(),
    ).toEqual({ starts_on: '2026-01-01' });
  });

  it('finance cannot use the owner extension', () => {
    const value = fixture();
    const finance = stepUpB5Principal(value.sqlite, value.finance, 'owner-powers-finance');
    expect(() =>
      value.repository.createTimeEntry(finance, time(value.project.id, '2026-08-17'), 'b5-outsider', {
        ensureAssignment: true,
      }),
    ).toThrow(AccessDeniedError);
    expect(
      count(value, "SELECT COUNT(*) count FROM project_member WHERE user_id='b5-outsider'"),
    ).toBe(0);
  });
});
