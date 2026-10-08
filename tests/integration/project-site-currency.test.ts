import { afterEach, describe, expect, it } from 'vitest';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
const fixtures: B5LifecycleSecurityFixture[] = [];
const fixture = () => {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  return f;
};
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});
describe('optional operating-site details and independent project currency', () => {
  it('creates a project in another currency with a new on-site contact under its bill-to client', () => {
    const f = fixture();
    const result = f.repository.createProject(f.owner, {
      clientId: f.client.id,
      costCenterCode: 'SITE8101',
      name: 'Junkers Ohio',
      timezone: 'America/New_York',
      currency: 'USD',
      billingModel: 'tm',
      siteName: 'Junkers',
      siteLocation: 'Ohio assembly hall',
      onsiteManager: 'Alex Site',
      onsiteContactName: 'Mayer',
      onsiteContactRole: 'Plant manager',
      onsiteContactEmail: 'mayer@example.test',
    });
    const project = f.sqlite
      .prepare(
        'SELECT currency,client_id,site_name,site_location,onsite_manager,onsite_contact_id FROM project WHERE id=?',
      )
      .get(result.id) as Record<string, unknown>;
    expect(project).toMatchObject({
      currency: 'USD',
      client_id: f.client.id,
      site_name: 'Junkers',
      site_location: 'Ohio assembly hall',
      onsite_manager: 'Alex Site',
    });
    expect(
      f.sqlite
        .prepare('SELECT client_id,name,role,company,contact_type FROM client_contact WHERE id=?')
        .get(project.onsite_contact_id as string),
    ).toMatchObject({
      client_id: f.client.id,
      name: 'Mayer',
      role: 'Plant manager',
      company: 'Junkers',
      contact_type: 'onsite',
    });
    expect(
      f.sqlite.prepare('SELECT currency FROM client WHERE id=?').get(f.client.id),
    ).toMatchObject({ currency: 'EUR' });
    f.repository.updateProject(f.owner, {
      projectId: result.id,
      onsiteManager: '',
      siteLocation: 'Gate 3',
      onsiteContactId: '',
    });
    expect(
      f.sqlite
        .prepare('SELECT onsite_manager,site_location,onsite_contact_id FROM project WHERE id=?')
        .get(result.id),
    ).toMatchObject({ onsite_manager: null, site_location: 'Gate 3', onsite_contact_id: null });
  });
  it('rejects cross-client contact links and rolls back contacts if project creation fails', () => {
    const f = fixture();
    const other = f.repository.createClient(f.owner, {
      legalName: 'Other Client',
      displayName: 'Other',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'other@example.test',
      billingAddress: 'Other Street 1',
    });
    const contact = f.repository.createClientContact(f.owner, {
      clientId: other.id,
      name: 'Other contact',
    });
    expect(() =>
      f.repository.updateProject(f.owner, { projectId: f.project.id, onsiteContactId: contact.id }),
    ).toThrow('On-site contact must belong');
    expect(() =>
      f.sqlite
        .prepare('UPDATE project SET onsite_contact_id=? WHERE id=?')
        .run(contact.id, f.project.id),
    ).toThrow('on-site contact must belong');
    const count = f.sqlite.prepare('SELECT count(*) n FROM client_contact').get();
    expect(() =>
      f.repository.createProject(f.owner, {
        clientId: f.client.id,
        costCenterCode: 'NO-DIGITS',
        name: 'Rollback',
        timezone: 'UTC',
        currency: 'BRL',
        billingModel: 'tm',
        onsiteContactName: 'Transient contact',
      }),
    ).toThrow();
    expect(f.sqlite.prepare('SELECT count(*) n FROM client_contact').get()).toEqual(count);
  });
  it('leaves new optional fields empty on existing and minimally configured projects', () => {
    const f = fixture();
    expect(
      f.sqlite
        .prepare('SELECT onsite_manager,site_location,onsite_contact_id FROM project WHERE id=?')
        .get(f.project.id),
    ).toMatchObject({ onsite_manager: null, site_location: null, onsite_contact_id: null });
    f.repository.updateProject(f.owner, { projectId: f.project.id, onsiteManager: 'Site manager' });
    f.repository.updateProject(f.owner, {
      projectId: f.project.id,
      name: 'Rename preserves optional site details',
    });
    expect(
      f.sqlite.prepare('SELECT onsite_manager FROM project WHERE id=?').get(f.project.id),
    ).toMatchObject({ onsite_manager: 'Site manager' });
  });
});
