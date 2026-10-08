import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@ja/domain';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository,
}));
const { projectActions } = await import('../../apps/portal/src/lib/server/actions/project-actions');
let sharedFixture: B5LifecycleSecurityFixture;
beforeAll(() => {
  sharedFixture = createB5LifecycleSecurityFixture();
}, 30_000);
afterAll(() => {
  if (sharedFixture) closeB5LifecycleSecurityFixture(sharedFixture);
});

function setup() {
  const fixture = sharedFixture;
  const contact = fixture.repository.createClientContact(fixture.owner, {
    clientId: fixture.client.id,
    name: 'Contact original',
    email: 'contact@example.test',
    isPrimary: true,
    isBillingContact: true,
  });
  const usePrincipal = (principal: Principal) =>
    openPortalRepository.mockReturnValue({
      principal,
      repository: fixture.repository,
      sqlite: { close: vi.fn(), prepare: fixture.sqlite.prepare.bind(fixture.sqlite) },
    });
  usePrincipal(fixture.owner);
  return { fixture, contact, usePrincipal };
}

function event(values: Record<string, string>) {
  return {
    locals: { correlationId: 'guided-management-test' },
    params: { section: 'projects' },
    request: new Request('https://example.test/app/projects?view=clients&/updateClientContact', {
      method: 'POST',
      body: new URLSearchParams(values),
    }),
  } as never;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('guided contact action recovery', () => {
  it('returns every invalid field and retains input without updating the record', async () => {
    const { fixture, contact } = setup();
    const fields = { contactId: contact.id, name: '', email: 'invalid', phone: 'x'.repeat(61) };
    expect(await projectActions.updateClientContact(event(fields))).toMatchObject({
      status: 400,
      data: {
        actionName: 'updateClientContact',
        code: 'CLIENT_CONTACT_FIELDS_INVALID',
        values: fields,
        fieldErrors: {
          name: expect.any(Array),
          email: expect.any(Array),
          phone: expect.any(Array),
        },
        remedies: [{ id: 'correct_fields' }],
      },
    });
    expect(
      fixture.sqlite.prepare('SELECT name,email FROM client_contact WHERE id=?').get(contact.id),
    ).toEqual({ name: 'Contact original', email: 'contact@example.test' });
  });

  it('applies unchecked flags only when the form explicitly includes their presence markers', async () => {
    const { fixture, contact } = setup();
    expect(
      await projectActions.updateClientContact(
        event({ contactId: contact.id, name: 'Renamed contact' }),
      ),
    ).toMatchObject({ success: true });
    expect(
      fixture.sqlite
        .prepare('SELECT is_primary,is_billing_contact FROM client_contact WHERE id=?')
        .get(contact.id),
    ).toEqual({ is_primary: 1, is_billing_contact: 1 });
    expect(
      await projectActions.updateClientContact(
        event({
          contactId: contact.id,
          name: 'Renamed contact',
          isPrimaryPresent: 'yes',
          isBillingContactPresent: 'yes',
        }),
      ),
    ).toMatchObject({ success: true });
    expect(
      fixture.sqlite
        .prepare('SELECT is_primary,is_billing_contact FROM client_contact WHERE id=?')
        .get(contact.id),
    ).toEqual({ is_primary: 0, is_billing_contact: 0 });
  });

  it.each(['project_manager', 'worker', 'auditor_read_only'] as const)(
    'denies %s contact writes and keeps the original record',
    async (role) => {
      const { fixture, contact, usePrincipal } = setup();
      const userId = `guided-contact-${role}`;
      seedB5User(fixture.sqlite, userId, role);
      usePrincipal({ userId, role, projectIds: new Set([fixture.project.id]) });
      expect(
        await projectActions.updateClientContact(
          event({ contactId: contact.id, name: 'Unauthorized edit' }),
        ),
      ).toMatchObject({
        status: 403,
        data: {
          code: role === 'auditor_read_only' ? 'PROJECT_READ_ONLY_ROLE' : 'CLIENT_ADMIN_REQUIRED',
          remedies: [{ id: 'contact_owner', recordId: contact.id }],
        },
      });
      expect(
        fixture.sqlite.prepare('SELECT name FROM client_contact WHERE id=?').get(contact.id),
      ).toEqual({ name: 'Contact original' });
    },
  );

  it('explains the linked-project deletion block and preserves the contact and project link', async () => {
    const { fixture, contact } = setup();
    fixture.sqlite
      .prepare('UPDATE project SET onsite_contact_id=? WHERE id=?')
      .run(contact.id, fixture.project.id);
    expect(
      await projectActions.deleteClientContact(event({ contactId: contact.id })),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'CLIENT_CONTACT_LINKED_PROJECT',
        actionName: 'deleteClientContact',
        remedies: [{ id: 'review_client_projects', recordId: contact.id }],
      },
    });
    expect(
      fixture.sqlite.prepare('SELECT id FROM client_contact WHERE id=?').get(contact.id),
    ).toEqual({ id: contact.id });
    expect(
      fixture.sqlite
        .prepare('SELECT onsite_contact_id FROM project WHERE id=?')
        .get(fixture.project.id),
    ).toEqual({ onsite_contact_id: contact.id });
  });

  it('allows finance contact edits through the same validated action', async () => {
    const { fixture, contact, usePrincipal } = setup();
    usePrincipal(fixture.finance);
    expect(
      await projectActions.updateClientContact(
        event({ contactId: contact.id, name: 'Finance edit' }),
      ),
    ).toMatchObject({ success: true });
    expect(
      fixture.sqlite.prepare('SELECT name FROM client_contact WHERE id=?').get(contact.id),
    ).toEqual({ name: 'Finance edit' });
  });
});
