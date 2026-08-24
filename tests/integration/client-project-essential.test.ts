import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  readSource,
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

describe('Client Essential CORE-02 clients, projects and assignments', () => {
  it('requires minimum bill-to data for new clients and persists the controlled fields', () => {
    const value = fixture();

    expect(() =>
      value.repository.createClient(value.owner, {
        legalName: 'Missing Address Client',
        displayName: 'Missing Address Client',
        currency: 'EUR',
        timezone: 'Europe/Madrid',
        billingEmail: 'billing@example.test',
        billingAddress: '   ',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.createClient(value.owner, {
        legalName: 'Invalid Terms Client',
        displayName: 'Invalid Terms Client',
        currency: 'EUR',
        timezone: 'Europe/Madrid',
        billingEmail: 'billing@example.test',
        billingAddress: 'Calle de la Industria 10, Madrid',
        paymentTermsDays: 366,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.createClient(value.owner, {
        legalName: 'Invalid Email Client',
        displayName: 'Invalid Email Client',
        currency: 'EUR',
        timezone: 'Europe/Madrid',
        billingEmail: 'not-an-email',
        billingAddress: 'Calle de la Industria 10, Madrid',
      }),
    ).toThrow(ValidationError);

    const created = value.repository.createClient(value.owner, {
      legalName: 'Essential Client SL',
      displayName: 'Essential Client',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: 'accounts@essential.example',
      billingContactName: 'Accounts Payable',
      billingAddress: 'Calle de la Industria 10, Madrid',
      paymentTermsDays: 45,
      poReference: 'PO-ESSENTIAL-42',
      notes: 'Keep client-facing billing correspondence in the finance mailbox.',
    });

    const row = value.sqlite
      .prepare(
        'SELECT billing_address,po_reference,payment_terms_days,notes FROM client WHERE id=?',
      )
      .get(created.id) as {
      billing_address: string;
      po_reference: string;
      payment_terms_days: number;
      notes: string;
    };
    expect(row).toEqual({
      billing_address: 'Calle de la Industria 10, Madrid',
      po_reference: 'PO-ESSENTIAL-42',
      payment_terms_days: 45,
      notes: 'Keep client-facing billing correspondence in the finance mailbox.',
    });
    expect(
      value.sqlite
        .prepare(
          'SELECT name,email,is_billing_contact,is_primary FROM client_contact WHERE client_id=?',
        )
        .get(created.id),
    ).toMatchObject({
      name: 'Accounts Payable',
      email: 'accounts@essential.example',
      is_billing_contact: 1,
      is_primary: 1,
    });
  });

  it('archives and restores clients through versioned lifecycle events', () => {
    const value = fixture();
    const current = value.sqlite
      .prepare('SELECT version,status FROM client WHERE id=?')
      .get(value.client.id) as { version: number; status: string };

    const archived = value.repository.transitionClient(value.owner, {
      clientId: value.client.id,
      status: 'archived',
      version: current.version,
      reason: 'Client account closed for the test lifecycle',
    });
    expect(archived.status).toBe('archived');
    expect(value.repository.listClients(value.owner)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: value.client.id, status: 'archived' }),
      ]),
    );

    expect(() =>
      value.repository.transitionClient(value.owner, {
        clientId: value.client.id,
        status: 'restore',
        version: current.version,
        reason: 'Stale restore attempt',
      }),
    ).toThrow(ConflictError);

    const restored = value.repository.transitionClient(value.owner, {
      clientId: value.client.id,
      status: 'restore',
      version: archived.version,
      reason: 'Client account reopened',
    });
    expect(restored.status).toBe('active');
    expect(
      value.sqlite
        .prepare(
          "SELECT from_state,to_state,reason FROM entity_lifecycle_event WHERE entity_type='client' AND entity_id=? ORDER BY version_after",
        )
        .all(value.client.id),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from_state: 'active', to_state: 'archived' }),
        expect.objectContaining({ from_state: 'archived', to_state: 'active' }),
      ]),
    );
  });

  it('creates an effective project-manager membership and exposes the project version in assigned listings', () => {
    const value = fixture();
    const created = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      name: 'Managed project',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      projectManagerId: 'b5-manager',
      startDate: '2026-01-01',
    });

    expect(
      value.sqlite
        .prepare(
          'SELECT COUNT(*) AS count,assignment_role,can_review,status,starts_on FROM project_member WHERE project_id=? AND user_id=?',
        )
        .get(created.id, 'b5-manager'),
    ).toMatchObject({
      count: 1,
      assignment_role: 'project_manager',
      can_review: 1,
      status: 'active',
      starts_on: '2026-01-01',
    });

    const manager = value.repository.principalFor('b5-manager');
    expect(manager.projectIds.has(created.id)).toBe(true);
    expect(value.repository.listAssignedProjects(manager)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, version: 1 })]),
    );

    value.repository.updateProject(value.owner, {
      projectId: created.id,
      version: 1,
      name: 'Managed project revised',
    });
    expect(
      value.repository.listAssignedProjects(value.repository.principalFor('b5-manager')),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, version: 2 })]));
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
        )
        .get(created.id, 'b5-manager'),
    ).toEqual({ count: 1 });
  });

  it('synchronizes project-manager replacement and clearing without rewriting worker history', () => {
    const value = fixture();
    seedB5User(value.sqlite, 'b5-manager-2', 'project_manager');
    seedB5User(value.sqlite, 'b5-manager-3', 'project_manager');
    const workerMembership = value.sqlite
      .prepare(
        "SELECT id,status,assignment_role FROM project_member WHERE project_id=? AND user_id='b5-manager' AND assignment_role='worker' AND status='active'",
      )
      .get(value.project.id) as { id: string; status: string; assignment_role: string };

    const before = value.sqlite
      .prepare('SELECT version FROM project WHERE id=?')
      .get(value.project.id) as { version: number };
    value.repository.updateProject(value.owner, {
      projectId: value.project.id,
      version: before.version,
      projectManagerId: 'b5-manager-2',
    });
    const first = value.sqlite
      .prepare('SELECT version,project_manager_id FROM project WHERE id=?')
      .get(value.project.id) as { version: number; project_manager_id: string };
    expect(first.project_manager_id).toBe('b5-manager-2');
    expect(
      value.sqlite
        .prepare(
          "SELECT assignment_role,can_review,status FROM project_member WHERE project_id=? AND user_id='b5-manager-2' AND assignment_role='project_manager' AND status='active'",
        )
        .get(value.project.id),
    ).toEqual({ assignment_role: 'project_manager', can_review: 1, status: 'active' });

    value.repository.updateProject(value.owner, {
      projectId: value.project.id,
      version: first.version,
      projectManagerId: 'b5-manager-3',
    });
    const second = value.sqlite
      .prepare('SELECT version,project_manager_id FROM project WHERE id=?')
      .get(value.project.id) as { version: number; project_manager_id: string };
    expect(second.project_manager_id).toBe('b5-manager-3');
    const replaced = value.sqlite
      .prepare(
        "SELECT starts_on,ends_on,status,assignment_role FROM project_member WHERE project_id=? AND user_id='b5-manager-2' AND assignment_role='project_manager'",
      )
      .get(value.project.id) as {
      starts_on: string;
      ends_on: string;
      status: string;
      assignment_role: string;
    };
    expect(replaced.status).toBe('inactive');
    expect(replaced.assignment_role).toBe('project_manager');
    expect(replaced.ends_on >= replaced.starts_on).toBe(true);
    expect(
      value.sqlite
        .prepare('SELECT assignment_role,status FROM project_member WHERE id=?')
        .get(workerMembership.id),
    ).toEqual({ assignment_role: 'worker', status: 'active' });

    value.repository.updateProject(value.owner, {
      projectId: value.project.id,
      version: second.version,
      projectManagerId: null,
    });
    expect(
      value.sqlite
        .prepare('SELECT project_manager_id FROM project WHERE id=?')
        .get(value.project.id),
    ).toEqual({ project_manager_id: null });
    const cleared = value.sqlite
      .prepare(
        "SELECT starts_on,ends_on,status FROM project_member WHERE project_id=? AND user_id='b5-manager-3' AND assignment_role='project_manager'",
      )
      .get(value.project.id) as { starts_on: string; ends_on: string; status: string };
    expect(cleared.status).toBe('inactive');
    expect(cleared.ends_on >= cleared.starts_on).toBe(true);
  });

  it('removes archived projects from worker operational scope while preserving restore access', () => {
    const value = fixture();
    const current = value.sqlite
      .prepare('SELECT version FROM project WHERE id=?')
      .get(value.project.id) as { version: number };
    const closing = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closing',
      version: current.version,
      reason: 'Operational archive scope test started',
    });
    const closed = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closed',
      version: closing.version,
      reason: 'Operational archive scope test closed',
    });
    const archived = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'archived',
      version: closed.version,
      reason: 'Operational archive scope test archived',
    });
    expect(value.repository.listAssignedProjects(value.worker)).toEqual([]);
    expect(value.repository.listTimeForScope(value.worker)).toEqual([]);
    expect(() =>
      value.repository.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate: '2026-08-23',
        category: 'regular',
        minutes: 30,
        summary: 'Archived project write must be denied',
      }),
    ).toThrow(AccessDeniedError);

    const restored = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'restore',
      version: archived.version,
      reason: 'Operational archive scope test restored',
    });
    expect(restored.status).toBe('closed');
    expect(
      value.repository.listAssignedProjects(value.repository.principalFor('b5-worker')),
    ).toEqual([]);
    expect(value.repository.listTimeForScope(value.repository.principalFor('b5-worker'))).toEqual(
      [],
    );
    expect(value.repository.listAssignedProjects(value.owner)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: value.project.id,
          status: 'closed',
          version: restored.version,
        }),
      ]),
    );
  });

  it('rejects schedule and planning writes for closed and archived projects', () => {
    const value = fixture();
    const scheduleBaseline = value.sqlite
      .prepare('SELECT COUNT(*) AS count FROM schedule WHERE project_id=?')
      .get(value.project.id);
    const planningBaseline = value.sqlite
      .prepare('SELECT COUNT(*) AS count FROM planning_assignment WHERE project_id=?')
      .get(value.project.id);
    const current = value.sqlite
      .prepare('SELECT version FROM project WHERE id=?')
      .get(value.project.id) as { version: number };
    const closing = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closing',
      version: current.version,
      reason: 'Close project before planning-state denial checks',
    });
    const closed = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closed',
      version: closing.version,
      reason: 'Closed project before planning-state denial checks',
    });

    const scheduleInput = {
      projectId: value.project.id,
      timezone: 'Europe/Madrid',
      mondayMinutes: 600,
      tuesdayMinutes: 600,
      wednesdayMinutes: 600,
      thursdayMinutes: 600,
      fridayMinutes: 600,
      saturdayMinutes: 0,
      sundayMinutes: 0,
      effectiveFrom: '2026-08-24',
    } as const;
    const planningInput = {
      projectId: value.project.id,
      workerId: 'b5-worker',
      startsAt: '2026-08-24T08:00:00.000Z',
      endsAt: '2026-08-24T16:00:00.000Z',
      plannedMinutes: 480,
      site: 'Madrid',
    } as const;
    for (const status of ['closed', 'archived'] as const) {
      if (status === 'archived') {
        value.repository.transitionProject(value.owner, {
          projectId: value.project.id,
          status: 'archived',
          version: closed.version,
          reason: 'Archive project before planning-state denial checks',
        });
      }
      expect(() => value.repository.updateProjectSchedule(value.owner, scheduleInput)).toThrow(
        ConflictError,
      );
      expect(() => value.repository.createPlanningAssignment(value.owner, planningInput)).toThrow(
        ConflictError,
      );
    }
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM schedule WHERE project_id=?')
        .get(value.project.id),
    ).toEqual(scheduleBaseline);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM planning_assignment WHERE project_id=?')
        .get(value.project.id),
    ).toEqual(planningBaseline);
  });

  it('keeps project management controls owner/finance gated and selectors operational-only', () => {
    const portalShell = readSource('apps/portal/src/lib/PortalShell.svelte');
    expect(portalShell).toContain('const canManageProjects = $derived(');
    expect(portalShell).toContain('const canManageClientContacts = $derived(');
    expect(portalShell).toContain('const canManageAssignmentControls = $derived(');
    expect(portalShell).toContain('{#if canManageProjects}');
    expect(portalShell).toContain('{#if canManageClientContacts}');
    expect(portalShell).toContain('{#if canManageAssignmentControls}');
    expect(portalShell).toContain(
      "data.user.role === 'owner_admin' || data.user.role === 'project_manager'",
    );
    expect(portalShell).toContain('{#each operationalProjects as project}');
    const planningStart = portalShell.indexOf("{:else if data.section === 'planning'}");
    const planningEnd = portalShell.indexOf("{:else if data.section === 'approvals'}");
    expect(planningStart).toBeGreaterThanOrEqual(0);
    expect(planningEnd).toBeGreaterThan(planningStart);
    expect(portalShell.slice(planningStart, planningEnd)).not.toContain('availableProjects');
    const scheduleStart = portalShell.indexOf("translate('Expected working schedule')");
    const scheduleEnd = portalShell.indexOf('assignment-history-list', scheduleStart);
    expect(scheduleStart).toBeGreaterThanOrEqual(0);
    expect(scheduleEnd).toBeGreaterThan(scheduleStart);
    expect(portalShell.slice(scheduleStart, scheduleEnd)).toContain('operationalProjects');
    expect(portalShell.slice(scheduleStart, scheduleEnd)).not.toContain('availableProjects');
    expect(portalShell).toContain("['active', 'planned', 'paused'].includes");
    expect(portalShell).not.toContain('{#if data.clients && !isAuditor}');
    const detail = readSource('apps/portal/src/routes/app/projects/[id]/+page.svelte');
    expect(detail).not.toContain('name="status"');
    expect(detail).not.toContain('name="actualEndDate"');
  });

  it('uses client optimistic concurrency and preserves the final bill-to invariant', () => {
    const value = fixture();
    const current = value.sqlite
      .prepare('SELECT version,display_name FROM client WHERE id=?')
      .get(value.client.id) as { version: number; display_name: string };

    value.repository.updateClient(
      value.owner,
      value.client.id,
      { displayName: 'Updated once' },
      current.version,
    );
    expect(() =>
      value.repository.updateClient(
        value.owner,
        value.client.id,
        { displayName: 'Stale overwrite' },
        current.version,
      ),
    ).toThrow(ConflictError);

    expect(
      value.sqlite
        .prepare('SELECT version,display_name FROM client WHERE id=?')
        .get(value.client.id),
    ).toEqual({ version: current.version + 1, display_name: 'Updated once' });
    expect(() =>
      value.repository.updateClient(
        value.owner,
        value.client.id,
        { billingEmail: '' },
        current.version + 1,
      ),
    ).toThrow(ValidationError);
  });

  it('rejects generic project status writes and records the actual close date', () => {
    const value = fixture();
    expect(() =>
      value.repository.updateProject(value.owner, {
        projectId: value.project.id,
        status: 'closed',
      }),
    ).toThrow(ConflictError);

    const current = value.sqlite
      .prepare('SELECT version,status FROM project WHERE id=?')
      .get(value.project.id) as { version: number; status: 'active' };
    const closing = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closing',
      version: current.version,
      reason: 'Operations complete; final review started',
    });
    const closed = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closed',
      version: closing.version,
      reason: 'Final review accepted',
    });
    expect(closed.status).toBe('closed');
    const row = value.sqlite
      .prepare('SELECT status,actual_end_date FROM project WHERE id=?')
      .get(value.project.id) as { status: string; actual_end_date: string | null };
    expect(row.status).toBe('closed');
    expect(row.actual_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('requires nonblank reasons for material lifecycle transitions', () => {
    const value = fixture();
    const client = value.sqlite
      .prepare('SELECT version FROM client WHERE id=?')
      .get(value.client.id) as { version: number };
    expect(() =>
      value.repository.transitionClient(value.owner, {
        clientId: value.client.id,
        status: 'archived',
        version: client.version,
        reason: '   ',
      }),
    ).toThrow(ValidationError);

    const project = value.sqlite
      .prepare('SELECT version FROM project WHERE id=?')
      .get(value.project.id) as { version: number };
    expect(() =>
      value.repository.transitionProject(value.owner, {
        projectId: value.project.id,
        status: 'closing',
        version: project.version,
        reason: '',
      }),
    ).toThrow(ValidationError);
  });

  it('protects client bill-to truth when a sole billing contact is demoted or deleted', () => {
    const value = fixture();
    const created = value.repository.createClient(value.owner, {
      legalName: 'Contact-only Client',
      displayName: 'Contact-only Client',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingContactName: 'Sole Billing Contact',
      billingAddress: 'Calle de la Industria 11, Madrid',
    });
    const contact = value.sqlite
      .prepare('SELECT id FROM client_contact WHERE client_id=? AND is_billing_contact=1')
      .get(created.id) as { id: string };

    expect(() =>
      value.repository.updateClientContact(value.owner, contact.id, { isBillingContact: false }),
    ).toThrow(ValidationError);
    expect(() => value.repository.deleteClientContact(value.owner, contact.id)).toThrow(
      ValidationError,
    );
    expect(
      value.sqlite
        .prepare('SELECT is_billing_contact FROM client_contact WHERE id=?')
        .get(contact.id),
    ).toEqual({ is_billing_contact: 1 });
  });

  it('removes assignments by ending the row and denies new current-scope access', () => {
    const value = fixture();
    const assignment = value.sqlite
      .prepare(
        "SELECT id,version FROM project_member WHERE project_id=? AND user_id=? AND status='active' LIMIT 1",
      )
      .get(value.project.id, value.worker.userId) as { id: string; version: number };

    value.repository.removeAssignment(value.owner, assignment.id, {
      endsOn: '2026-08-23',
      version: assignment.version,
      reason: 'Worker rotation completed',
    });

    const row = value.sqlite
      .prepare('SELECT status,ends_on,version FROM project_member WHERE id=?')
      .get(assignment.id) as { status: string; ends_on: string; version: number };
    expect(row).toMatchObject({ status: 'inactive', ends_on: '2026-08-23', version: 2 });
    expect(() =>
      value.repository.createTimeEntry(value.worker, {
        projectId: value.project.id,
        workDate: '2026-08-23',
        category: 'regular',
        minutes: 30,
        summary: 'Must be denied after assignment removal',
      }),
    ).toThrow(AccessDeniedError);
    expect(
      value.sqlite
        .prepare(
          "SELECT details_json FROM audit_event WHERE action='assignment.delete' AND entity_id=? ORDER BY occurred_at DESC LIMIT 1",
        )
        .get(assignment.id),
    ).toMatchObject({ details_json: expect.stringContaining('Worker rotation completed') });
  });

  it('keeps assignment update and audit atomic under optimistic concurrency', () => {
    const value = fixture();
    const assignment = value.sqlite
      .prepare(
        "SELECT id,version,starts_on FROM project_member WHERE project_id=? AND user_id=? AND status='active' LIMIT 1",
      )
      .get(value.project.id, value.worker.userId) as {
      id: string;
      version: number;
      starts_on: string;
    };

    expect(() =>
      value.repository.updateAssignment(value.owner, assignment.id, {
        plannedMinutes: 45,
      } as unknown as { plannedMinutes: number; version: number }),
    ).toThrow(ValidationError);

    value.repository.updateAssignment(value.owner, assignment.id, {
      plannedMinutes: 60,
      version: assignment.version,
    });
    expect(() =>
      value.repository.updateAssignment(value.owner, assignment.id, {
        plannedMinutes: 90,
        version: assignment.version,
      }),
    ).toThrow(ConflictError);
    expect(
      value.sqlite
        .prepare('SELECT planned_minutes,version,status FROM project_member WHERE id=?')
        .get(assignment.id),
    ).toEqual({ planned_minutes: 60, version: assignment.version + 1, status: 'active' });

    const tomorrow = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    expect(() =>
      value.repository.removeAssignment(value.owner, assignment.id, {
        endsOn: tomorrowIso,
        version: assignment.version + 1,
        reason: 'Immediate removal cannot be future dated',
      }),
    ).toThrow(ValidationError);
    expect(
      value.sqlite
        .prepare('SELECT status,version FROM project_member WHERE id=?')
        .get(assignment.id),
    ).toEqual({ status: 'active', version: assignment.version + 1 });

    const futureStartDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    futureStartDate.setUTCDate(futureStartDate.getUTCDate() + 2);
    const futureStart = futureStartDate.toISOString().slice(0, 10);
    const futureAssignment = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: futureStart,
    }) as { id: string };
    const today = new Date().toISOString().slice(0, 10);
    expect(() =>
      value.repository.removeAssignment(value.owner, futureAssignment.id, {
        endsOn: today,
        version: 1,
        reason: 'Premature end date must be rejected',
      }),
    ).toThrow(ValidationError);
    value.repository.deleteAssignment(value.owner, futureAssignment.id);
    const cancelled = value.sqlite
      .prepare('SELECT status,starts_on,ends_on FROM project_member WHERE id=?')
      .get(futureAssignment.id) as { status: string; starts_on: string; ends_on: string };
    expect(cancelled).toEqual({ status: 'inactive', starts_on: futureStart, ends_on: futureStart });
  });

  it('rejects assignment creation for closed or archived projects and rolls back audit failures', () => {
    const value = fixture();
    const triggerName = 'b5_assignment_audit_failure';
    value.sqlite.exec(
      `CREATE TEMP TRIGGER ${triggerName} BEFORE INSERT ON audit_event BEGIN SELECT RAISE(ABORT, 'forced assignment audit failure'); END;`,
    );
    expect(() =>
      value.repository.assignWorker(value.owner, {
        projectId: value.project.id,
        workerId: 'b5-outsider',
        startsOn: '2026-01-01',
      }),
    ).toThrow(/forced assignment audit failure/);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) AS count FROM project_member WHERE project_id=? AND user_id=?')
        .get(value.project.id, 'b5-outsider'),
    ).toEqual({ count: 0 });
    value.sqlite.exec(`DROP TRIGGER ${triggerName}`);

    const current = value.sqlite
      .prepare('SELECT version FROM project WHERE id=?')
      .get(value.project.id) as { version: number };
    const closing = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closing',
      version: current.version,
      reason: 'Close before assignment guard test',
    });
    const closed = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'closed',
      version: closing.version,
      reason: 'Closed before assignment guard test',
    });
    expect(() =>
      value.repository.assignWorker(value.owner, {
        projectId: value.project.id,
        workerId: 'b5-outsider',
        startsOn: '2026-01-01',
      }),
    ).toThrow(ConflictError);
    const archived = value.repository.transitionProject(value.owner, {
      projectId: value.project.id,
      status: 'archived',
      version: closed.version,
      reason: 'Archived before assignment guard test',
    });
    expect(archived.status).toBe('archived');
    expect(() =>
      value.repository.assignWorker(value.owner, {
        projectId: value.project.id,
        workerId: 'b5-outsider',
        startsOn: '2026-01-01',
      }),
    ).toThrow(ConflictError);
  });
});
