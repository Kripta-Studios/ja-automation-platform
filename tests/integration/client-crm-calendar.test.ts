import { afterEach, describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
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

describe('client CRM contacts and actual-work calendar', () => {
  it('creates and edits optional client contact details without putting PII in audit details', () => {
    const value = fixture();
    const created = value.repository.createClientContact(value.owner, {
      clientId: value.client.id,
      name: 'María Torres',
      role: 'Plant supervisor',
      company: 'B5 Manufacturing',
      location: 'North assembly hall',
      notes: 'Call before arrival; visitor access is through gate 3.',
      contactType: 'onsite',
    });

    expect(value.repository.listClientContacts(value.owner, value.client.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          role: 'Plant supervisor',
          company: 'B5 Manufacturing',
          location: 'North assembly hall',
          notes: 'Call before arrival; visitor access is through gate 3.',
          contact_type: 'onsite',
        }),
      ]),
    );

    value.repository.updateClientContact(value.owner, created.id, {
      company: 'B5 Manufacturing Iberia',
      location: '',
      notes: 'Use the service entrance.',
      contactType: 'general',
    });
    const updated = value.repository
      .listAllClientContacts(value.owner)
      .find((contact) => contact.id === created.id);
    expect(updated).toMatchObject({
      company: 'B5 Manufacturing Iberia',
      location: null,
      notes: 'Use the service entrance.',
      contact_type: 'general',
    });

    const auditDetails = value.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE entity_type='client_contact' AND entity_id=? AND action='client_contact.update' ORDER BY occurred_at DESC LIMIT 1",
      )
      .get(created.id) as { details_json: string };
    expect(auditDetails.details_json).not.toContain('Use the service entrance.');
  });

  it('keeps a contact that a project uses as its onsite contact', () => {
    const value = fixture();
    const created = value.repository.createClientContact(value.owner, {
      clientId: value.client.id,
      name: 'Site contact',
      contactType: 'onsite',
    });
    value.sqlite
      .prepare('UPDATE project SET onsite_contact_id=? WHERE id=?')
      .run(created.id, value.project.id);

    expect(() => value.repository.deleteClientContact(value.owner, created.id)).toThrow(
      ConflictError,
    );
    expect(
      value.sqlite.prepare('SELECT id FROM client_contact WHERE id=?').get(created.id),
    ).toEqual({ id: created.id });
  });

  it('shows only logged time in the selected date range and scopes managers to their projects', () => {
    const value = fixture();
    const otherProject = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      costCenterCode: 'QA-CRM-CALENDAR-2',
      name: 'Unmanaged customer site',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    value.repository.assignWorker(value.owner, {
      projectId: otherProject.id,
      workerId: 'b5-worker',
      startsOn: '2026-01-01',
    });
    const assignedOnlyProject = value.repository.createProject(value.owner, {
      clientId: value.client.id,
      costCenterCode: 'QA-CRM-CALENDAR-3',
      name: 'Assigned but no logged work',
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    value.repository.assignWorker(value.owner, {
      projectId: assignedOnlyProject.id,
      workerId: 'b5-worker',
      startsOn: '2026-01-01',
    });
    const liveOwner = stepUpB5Principal(value.sqlite, value.owner, 'client-calendar');
    value.repository.createTimeEntry(
      liveOwner,
      {
        projectId: value.project.id,
        workDate: '2026-10-08',
        category: 'regular',
        minutes: 135,
        summary: 'Actual work on the managed project',
      },
      'b5-worker',
    );
    value.repository.createTimeEntry(
      liveOwner,
      {
        projectId: otherProject.id,
        workDate: '2026-10-08',
        category: 'regular',
        minutes: 90,
        summary: 'Actual work on the separate project',
      },
      'b5-worker',
    );
    value.repository.createTimeEntry(
      liveOwner,
      {
        projectId: value.project.id,
        workDate: '2026-09-30',
        category: 'regular',
        minutes: 60,
        summary: 'Actual work outside the selected calendar range',
      },
      'b5-worker',
    );

    const managerEntries = value.repository.listClientCalendarEntries(
      value.manager,
      '2026-10-08',
      '2026-10-08',
    );
    expect(managerEntries).toEqual([
      expect.objectContaining({
        work_date: '2026-10-08',
        project_id: value.project.id,
        client_id: value.client.id,
        worker_id: 'b5-worker',
        worker_name: 'b5-worker',
        minutes: 135,
      }),
    ]);
    expect(Object.keys(managerEntries[0] ?? {}).sort()).toEqual(
      [
        'approval_state',
        'client_id',
        'minutes',
        'project_id',
        'project_name',
        'project_number',
        'site_name',
        'work_date',
        'worker_id',
        'worker_name',
      ].sort(),
    );
    expect(managerEntries[0]).not.toHaveProperty('client_rate_minor');
    expect(managerEntries[0]).not.toHaveProperty('internal_cost_minor');

    expect(
      value.repository.listClientCalendarEntries(value.owner, '2026-10-08', '2026-10-08'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ project_id: value.project.id, minutes: 135 }),
        expect.objectContaining({ project_id: otherProject.id, minutes: 90 }),
      ]),
    );
    expect(
      value.repository.listClientCalendarEntries(value.owner, '2026-10-08', '2026-10-08'),
    ).toHaveLength(2);
    expect(
      value.repository.listClientCalendarEntries(value.owner, '2026-09-30', '2026-09-30'),
    ).toEqual([expect.objectContaining({ work_date: '2026-09-30', minutes: 60 })]);
  });

  it('projects locked correction hours instead of the superseded original', () => {
    const value = fixture();
    const worker = stepUpB5Principal(value.sqlite, value.worker, 'calendar-worker');
    const manager = stepUpB5Principal(value.sqlite, value.manager, 'calendar-manager');
    const original = value.repository.createTimeEntry(worker, {
      projectId: value.project.id,
      workDate: '2026-10-15',
      category: 'regular',
      minutes: 360,
      summary: 'Original actual work',
    });
    value.repository.submitTime(worker, original.id, original.version);
    value.repository.operationalApproveTime(manager, original.id, 'approved');
    const correction = value.repository.createCorrectionDraft(worker, {
      recordType: 'time_entry',
      originalId: original.id,
      requestId: 'calendar-locked-correction',
      reason: 'Correct duration',
      patch: { minutes: 420 },
    });
    expect(
      value.repository.listClientCalendarEntries(value.owner, '2026-10-15', '2026-10-15'),
    ).toEqual([expect.objectContaining({ minutes: 360 })]);
    value.repository.submitTime(worker, correction.correctionId, 1);
    value.repository.operationalApproveTime(manager, correction.correctionId, 'approved');
    // Historical locked is a supported approved state; it must project identically.
    value.sqlite
      .prepare("UPDATE time_entry SET approval_state='locked' WHERE id=?")
      .run(correction.correctionId);
    expect(
      value.repository.listClientCalendarEntries(value.owner, '2026-10-15', '2026-10-15'),
    ).toEqual([expect.objectContaining({ minutes: 420, approval_state: 'locked' })]);
  });

  it('rejects calendar access outside management roles and invalid date ranges', () => {
    const value = fixture();
    expect(() =>
      value.repository.listClientCalendarEntries(value.worker, '2026-10-01', '2026-10-31'),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.listClientCalendarEntries(value.owner, '2026-02-30', '2026-03-01'),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.listClientCalendarEntries(value.owner, '2026-10-01', '2026-09-30'),
    ).toThrow(ValidationError);
  });
});
