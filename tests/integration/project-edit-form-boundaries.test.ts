import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});
const { projectActions } =
  await import('../../apps/portal/src/lib/server/actions/project-actions.ts');
const fixtures: B5LifecycleSecurityFixture[] = [];
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  openPortalRepository.mockReturnValue({
    repository: value.repository,
    principal: value.owner,
    sqlite: { close: vi.fn() },
  });
  return value;
}
function event(form: Record<string, string>) {
  return {
    locals: {},
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.clearAllMocks();
});

describe('Project editing through actual HTML form payloads', () => {
  it('clears contact flags when checkboxes are unchecked, but preserves omitted fields in partial updates', async () => {
    const value = fixture();
    const contact = value.repository.createClientContact(value.owner, {
      clientId: value.client.id,
      name: 'Billing contact',
      email: 'billing@example.test',
      isBillingContact: true,
      isPrimary: true,
    });
    const result = await projectActions.updateClientContact(
      event({
        contactId: contact.id,
        isBillingContactPresent: '1',
        isPrimaryPresent: '1',
      }),
    );
    expect(result).toMatchObject({ success: true });
    expect(
      value.sqlite
        .prepare('SELECT is_billing_contact,is_primary FROM client_contact WHERE id=?')
        .get(contact.id),
    ).toEqual({ is_billing_contact: 0, is_primary: 0 });
    await projectActions.updateClientContact(event({ contactId: contact.id, isPrimary: 'on' }));
    await projectActions.updateClientContact(
      event({ contactId: contact.id, name: 'Renamed contact' }),
    );
    expect(
      value.sqlite.prepare('SELECT name,is_primary FROM client_contact WHERE id=?').get(contact.id),
    ).toEqual({ name: 'Renamed contact', is_primary: 1 });
  });

  it('clears assignment expiry, planned duration and review permission with empty controls', async () => {
    const value = fixture();
    const assignment = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-01-01',
      endsOn: '2099-12-31',
      plannedMinutes: 60,
      canReview: true,
    });
    expect(
      await projectActions.updateAssignment(
        event({
          assignmentId: assignment.id,
          version: '1',
          endsOn: '',
          plannedMinutes: '',
          canReviewPresent: '1',
        }),
      ),
    ).toMatchObject({ success: true });
    expect(
      value.sqlite
        .prepare('SELECT ends_on,planned_minutes,can_review,version FROM project_member WHERE id=?')
        .get(assignment.id),
    ).toEqual({ ends_on: null, planned_minutes: null, can_review: 0, version: 2 });
  });

  it.each([
    { startsOn: '' },
    { startsOn: '2026-02-30' },
    { plannedMinutes: 'not-a-number' },
    { plannedMinutes: '-1' },
    { plannedMinutes: '1.5' },
    { plannedMinutes: 'Infinity' },
    { plannedMinutes: ' ' },
    { plannedMinutes: '\t' },
    { plannedMinutes: '0x10' },
    { plannedMinutes: '1e3' },
  ])('rejects invalid assignment changes atomically: %j', async (invalid) => {
    const value = fixture();
    const assignment = value.repository.assignWorker(value.owner, {
      projectId: value.project.id,
      workerId: 'b5-outsider',
      startsOn: '2026-01-01',
      plannedMinutes: 60,
    });
    const before = value.sqlite
      .prepare('SELECT * FROM project_member WHERE id=?')
      .get(assignment.id);
    expect(
      await projectActions.updateAssignment(
        event({
          assignmentId: assignment.id,
          version: '1',
          ...invalid,
        }),
      ),
    ).toMatchObject({ status: 400 });
    expect(
      value.sqlite.prepare('SELECT * FROM project_member WHERE id=?').get(assignment.id),
    ).toEqual(before);
    expect(
      value.sqlite
        .prepare(
          "SELECT count(*) n FROM audit_event WHERE entity_id=? AND action='assignment.update'",
        )
        .get(assignment.id),
    ).toEqual({ n: 0 });
  });
});
