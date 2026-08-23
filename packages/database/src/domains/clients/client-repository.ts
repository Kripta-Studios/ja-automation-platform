import type { DatabaseSync } from 'node:sqlite';
import { canManageClients, newId, type Principal } from '@ja/domain';
import type { Currency } from '@ja/money';

export type ClientInput = Readonly<{
  legalName: string;
  displayName: string;
  currency: Currency;
  timezone: string;
  billingEmail?: string;
  billingContactName?: string;
  billingAddress: string;
  paymentTermsDays?: number;
  poReference?: string;
  notes?: string;
}>;

export type ClientContactInput = Readonly<{
  clientId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isBillingContact?: boolean;
  isPrimary?: boolean;
}>;

type ErrorFactory = (message: string) => never;

type ClientRow = Readonly<{
  id: string;
  legal_name: string;
  display_name: string;
  currency: Currency;
  timezone: string;
  billing_email: string | null;
  billing_address: string | null;
  po_reference: string | null;
  payment_terms_days: number;
  notes: string | null;
  status: string;
  version: number;
}>;

type ClientContactRow = Readonly<{
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_billing_contact: number;
  is_primary: number;
}>;

export type ClientRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  assertActive: (principal: Principal) => void;
  assertReadable: (principal: Principal) => void;
  audit: (
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ) => void;
  nextSequence: (scope: string, scopeId: string) => number;
  now: () => string;
  assertText: (value: string, field: string, max?: number) => string;
  accessDenied: ErrorFactory;
  conflict: ErrorFactory;
  validation: ErrorFactory;
}>;

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export class ClientRepository {
  private readonly deps: ClientRepositoryDependencies;

  constructor(deps: ClientRepositoryDependencies) {
    this.deps = deps;
  }

  createClient(principal: Principal, input: ClientInput) {
    const { deps } = this;
    deps.assertActive(principal);
    if (!canManageClients(principal)) return deps.accessDenied('Client administration required');
    const legalName = deps.assertText(input.legalName, 'Legal name', 300);
    const displayName = deps.assertText(input.displayName, 'Display name', 160);
    const timezone = deps.assertText(input.timezone, 'Timezone', 100);
    if (typeof input.billingAddress !== 'string')
      return deps.validation('Billing address is required for new clients');
    const billingAddress = deps.assertText(input.billingAddress, 'Billing address', 2000);
    const billingEmail =
      typeof input.billingEmail === 'string' ? input.billingEmail.trim().toLowerCase() || null : null;
    if (billingEmail && !isValidEmail(billingEmail))
      return deps.validation('Billing email is invalid');
    const billingContactName = input.billingContactName?.trim() || null;
    if (!billingEmail && !billingContactName)
      return deps.validation('A billing contact name or billing email is required');
    if (billingContactName && billingContactName.length > 160)
      return deps.validation('Billing contact name is too long');
    const poReference = input.poReference?.trim() || null;
    if (poReference && poReference.length > 200) return deps.validation('PO / reference is too long');
    const notes = input.notes?.trim() || null;
    if (notes && notes.length > 5000) return deps.validation('Client notes are too long');
    const paymentTermsDays = input.paymentTermsDays ?? 30;
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365)
      return deps.validation('Payment terms must be an integer between 0 and 365 days');
    return deps.transaction(() => {
      const sequence = deps.nextSequence('client', 'global');
      const id = newId();
      const clientNumber = `C-${String(sequence).padStart(4, '0')}`;
      const timestamp = deps.now();
      deps.sqlite
        .prepare(
          'INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,billing_email,billing_address,po_reference,payment_terms_days,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          clientNumber,
          legalName,
          displayName,
          'active',
          input.currency,
          timezone,
          billingEmail,
          billingAddress,
          poReference,
          paymentTermsDays,
          notes,
          timestamp,
          timestamp,
        );
      if (billingContactName) {
        const contactId = newId();
        deps.sqlite
          .prepare(
            'INSERT INTO client_contact(id,client_id,name,email,phone,role,is_billing_contact,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            contactId,
            id,
            deps.assertText(billingContactName, 'Billing contact name', 160),
            billingEmail,
            null,
            'billing',
            1,
            1,
            timestamp,
            timestamp,
          );
        deps.audit(principal, 'client_contact.create', 'client_contact', contactId, {
          clientId: id,
          isBillingContact: true,
          isPrimary: true,
        });
      }
      deps.audit(principal, 'client.create', 'client', id, { clientNumber });
      return { id, clientNumber };
    });
  }

  createClientContact(principal: Principal, input: ClientContactInput) {
    const { deps } = this;
    deps.assertActive(principal);
    if (!canManageClients(principal)) return deps.accessDenied('Client administration required');
    if (!deps.sqlite.prepare('SELECT 1 FROM client WHERE id=?').get(input.clientId))
      return deps.validation('Client not found');
    const id = newId();
    const timestamp = deps.now();
    return deps.transaction(() => {
      if (input.isPrimary)
        deps.sqlite
          .prepare('UPDATE client_contact SET is_primary=0 WHERE client_id=?')
          .run(input.clientId);
      deps.sqlite
        .prepare(
          'INSERT INTO client_contact(id,client_id,name,email,phone,role,is_billing_contact,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          input.clientId,
          deps.assertText(input.name, 'Contact name', 160),
          input.email?.trim().toLowerCase() || null,
          input.phone?.trim() || null,
          input.role?.trim() || null,
          input.isBillingContact ? 1 : 0,
          input.isPrimary ? 1 : 0,
          timestamp,
          timestamp,
        );
      deps.audit(principal, 'client_contact.create', 'client_contact', id, {
        clientId: input.clientId,
        isBillingContact: Boolean(input.isBillingContact),
      });
      return { id };
    });
  }

  listClientContacts(principal: Principal, clientId: string) {
    const { deps } = this;
    deps.assertReadable(principal);
    if (
      !canManageClients(principal) &&
      principal.role !== 'auditor_read_only' &&
      principal.role !== 'project_manager'
    )
      return deps.accessDenied('Client administration required');
    if (!deps.sqlite.prepare('SELECT 1 FROM client WHERE id=?').get(clientId))
      return deps.validation('Client not found');
    if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (
        ids.length === 0 ||
        !deps.sqlite
          .prepare(
            `SELECT 1 FROM project WHERE client_id=? AND id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,
          )
          .get(clientId, ...ids)
      )
        return deps.accessDenied('Client contact is outside the project scope');
    }
    return deps.sqlite
      .prepare(
        'SELECT id,client_id,name,email,phone,role,is_billing_contact,is_primary,created_at,updated_at FROM client_contact WHERE client_id=? ORDER BY is_primary DESC,name',
      )
      .all(clientId);
  }

  listAllClientContacts(principal: Principal) {
    const { deps } = this;
    deps.assertReadable(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'auditor_read_only' &&
      principal.role !== 'project_manager'
    )
      return deps.accessDenied('Client contacts are restricted to management roles');
    const projectIds = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    if (principal.role === 'project_manager' && projectIds.length === 0) return [];
    const restriction = projectIds.length
      ? ` AND EXISTS (SELECT 1 FROM project p WHERE p.client_id=cc.client_id AND p.id IN (${projectIds.map(() => '?').join(',')}))`
      : '';
    return deps.sqlite
      .prepare(
        `SELECT cc.id,cc.client_id,cc.name,cc.email,cc.phone,cc.role,cc.is_billing_contact,cc.is_primary,
                c.client_number,c.display_name
         FROM client_contact cc JOIN client c ON c.id=cc.client_id
         WHERE 1=1${restriction} ORDER BY c.client_number,cc.is_primary DESC,cc.name`,
      )
      .all(...projectIds);
  }

  listClients(principal: Principal) {
    const { deps } = this;
    deps.assertReadable(principal);
    if (!canManageClients(principal) && principal.role !== 'auditor_read_only')
      return deps.accessDenied('Client administration required');
    return deps.sqlite
      .prepare(
        `SELECT id,client_number,display_name,legal_name,status,currency,timezone,billing_email,
                billing_address,po_reference,payment_terms_days,notes,version,
                (SELECT name FROM client_contact WHERE client_id=client.id AND is_billing_contact=1
                 ORDER BY is_primary DESC,id LIMIT 1) AS billing_contact_name
         FROM client ORDER BY client_number`,
      )
      .all();
  }

  updateClient(
    principal: Principal,
    clientId: string,
    input: Partial<ClientInput>,
    expectedVersion: number,
  ) {
    const { deps } = this;
    deps.assertActive(principal);
    if (!canManageClients(principal)) return deps.accessDenied('Client administration required');
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      return deps.validation('Client version is required');
    return deps.transaction(() => {
      const existing = deps.sqlite.prepare('SELECT * FROM client WHERE id=?').get(clientId) as ClientRow | undefined;
      if (!existing) return deps.validation('Client not found');
      if (existing.version !== expectedVersion)
        return deps.conflict('Client changed before update');

      const legalName =
        input.legalName !== undefined
          ? deps.assertText(input.legalName, 'Legal name', 300)
          : existing.legal_name;
      const displayName =
        input.displayName !== undefined
          ? deps.assertText(input.displayName, 'Display name', 160)
          : existing.display_name;
      const currency = input.currency !== undefined ? input.currency : existing.currency;
      const timezone =
        input.timezone !== undefined
          ? deps.assertText(input.timezone, 'Timezone', 100)
          : existing.timezone;
      const billingEmail =
        input.billingEmail !== undefined
          ? typeof input.billingEmail === 'string'
            ? input.billingEmail.trim().toLowerCase() || null
            : null
          : existing.billing_email;
      if (billingEmail && !isValidEmail(billingEmail))
        return deps.validation('Billing email is invalid');
      const billingAddress =
        input.billingAddress !== undefined
          ? deps.assertText(input.billingAddress, 'Billing address', 2000)
          : existing.billing_address;
      if (!billingAddress || !billingAddress.trim())
        return deps.validation('Billing address is required');
      const poReference =
        input.poReference !== undefined
          ? input.poReference?.trim() || null
          : existing.po_reference;
      if (poReference && poReference.length > 200)
        return deps.validation('PO / reference is too long');
      const notes = input.notes !== undefined ? input.notes?.trim() || null : existing.notes;
      if (notes && notes.length > 5000) return deps.validation('Client notes are too long');
      const existingContact = deps.sqlite
        .prepare(
          'SELECT id,name FROM client_contact WHERE client_id=? AND is_billing_contact=1 ORDER BY is_primary DESC,id LIMIT 1',
        )
        .get(clientId) as { id: string; name: string } | undefined;
      const normalizedBillingContactName =
        input.billingContactName !== undefined
          ? input.billingContactName.trim() || null
          : existingContact?.name?.trim() || null;
      if (!billingEmail && !normalizedBillingContactName)
        return deps.validation('A billing contact name or billing email is required');
      if (normalizedBillingContactName && normalizedBillingContactName.length > 160)
        return deps.validation('Billing contact name is too long');
      if (input.billingContactName !== undefined) {
        if (normalizedBillingContactName) {
          if (existingContact) {
            deps.sqlite
              .prepare('UPDATE client_contact SET name=?,email=?,is_billing_contact=1,is_primary=1,updated_at=? WHERE id=?')
              .run(normalizedBillingContactName, billingEmail, deps.now(), existingContact.id);
          } else {
            deps.sqlite
              .prepare(
                'INSERT INTO client_contact(id,client_id,name,email,phone,role,is_billing_contact,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
              )
              .run(
                newId(),
                clientId,
                normalizedBillingContactName,
                billingEmail,
                null,
                'billing',
                1,
                1,
                deps.now(),
                deps.now(),
              );
          }
        } else if (existingContact) {
          // Preserve the contact record for history while removing its bill-to role.
          deps.sqlite
            .prepare('UPDATE client_contact SET is_billing_contact=0,updated_at=? WHERE id=?')
            .run(deps.now(), existingContact.id);
        }
      }
      if (input.billingContactName === undefined && input.billingEmail !== undefined && existingContact) {
        deps.sqlite
          .prepare('UPDATE client_contact SET email=?,updated_at=? WHERE id=?')
          .run(billingEmail, deps.now(), existingContact.id);
      }
      const paymentTermsDays =
        input.paymentTermsDays !== undefined
          ? input.paymentTermsDays
          : existing.payment_terms_days;
      if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365)
        return deps.validation('Payment terms must be an integer between 0 and 365 days');

      const updated = deps.sqlite
        .prepare(
          'UPDATE client SET legal_name=?, display_name=?, currency=?, timezone=?, billing_email=?, billing_address=?, po_reference=?, payment_terms_days=?, notes=?, updated_at=?,version=version+1 WHERE id=? AND version=?',
        )
        .run(
          legalName,
          displayName,
          currency,
          timezone,
          billingEmail,
          billingAddress,
          poReference,
          paymentTermsDays,
          notes,
          deps.now(),
          clientId,
          expectedVersion,
        );
      if (updated.changes !== 1)
        return deps.conflict('Client changed before update');

      deps.audit(principal, 'client.update', 'client', clientId, { version: expectedVersion });
    });
  }

  updateClientContact(principal: Principal, contactId: string, input: Partial<ClientContactInput>) {
    const { deps } = this;
    deps.assertActive(principal);
    if (!canManageClients(principal)) return deps.accessDenied('Client administration required');
    return deps.transaction(() => {
      const existing = deps.sqlite
        .prepare('SELECT * FROM client_contact WHERE id=?')
        .get(contactId) as ClientContactRow | undefined;
      if (!existing) return deps.validation('Contact not found');

      const name =
        input.name !== undefined ? deps.assertText(input.name, 'Contact name', 160) : existing.name;
      const email =
        input.email !== undefined ? input.email?.trim().toLowerCase() || null : existing.email;
      const phone = input.phone !== undefined ? input.phone?.trim() || null : existing.phone;
      const role = input.role !== undefined ? input.role?.trim() || null : existing.role;
      const isBillingContact =
        input.isBillingContact !== undefined
          ? input.isBillingContact
            ? 1
            : 0
          : existing.is_billing_contact;
      const isPrimary =
        input.isPrimary !== undefined ? (input.isPrimary ? 1 : 0) : existing.is_primary;

      const client = deps.sqlite
        .prepare('SELECT billing_email FROM client WHERE id=?')
        .get(existing.client_id) as { billing_email: string | null } | undefined;
      if (!client) return deps.validation('Client not found');
      if (isBillingContact === 0 && !client.billing_email) {
        const alternate = deps.sqlite
          .prepare(
            'SELECT 1 FROM client_contact WHERE client_id=? AND is_billing_contact=1 AND id<>? LIMIT 1',
          )
          .get(existing.client_id, contactId);
        if (!alternate)
          return deps.validation('A billing email or billing contact is required');
      }

      if (input.isPrimary) {
        deps.sqlite
          .prepare('UPDATE client_contact SET is_primary=0 WHERE client_id=?')
          .run(existing.client_id);
      }

      deps.sqlite
        .prepare(
          'UPDATE client_contact SET name=?, email=?, phone=?, role=?, is_billing_contact=?, is_primary=?, updated_at=? WHERE id=?',
        )
        .run(name, email, phone, role, isBillingContact, isPrimary, deps.now(), contactId);

      deps.audit(principal, 'client_contact.update', 'client_contact', contactId, {});
    });
  }

  deleteClientContact(principal: Principal, contactId: string) {
    const { deps } = this;
    deps.assertActive(principal);
    if (!canManageClients(principal)) return deps.accessDenied('Client administration required');
    return deps.transaction(() => {
      const existing = deps.sqlite
        .prepare('SELECT * FROM client_contact WHERE id=?')
        .get(contactId) as ClientContactRow | undefined;
      if (!existing) return deps.validation('Contact not found');

      // Contacts referenced by billing configuration are part of an
      // auditable historical chain.  There is no archive/deactivate column
      // in the reviewed schema, so keep the contact and return a controlled
      // 409 instead of relying on SQLite's FK exception.  Unreferenced
      // contacts remain hard-deletable to support the requested CRUD flow.
      const reference = deps.sqlite
        .prepare('SELECT COUNT(*) AS count FROM billing_rule WHERE billing_contact_id=?')
        .get(contactId) as { count: number } | undefined;
      if ((reference?.count ?? 0) > 0)
        throw deps.conflict(
          'Client contact is referenced by billing history and cannot be deleted',
        );

      if (existing.is_billing_contact === 1) {
        const client = deps.sqlite
          .prepare('SELECT billing_email FROM client WHERE id=?')
          .get(existing.client_id) as { billing_email: string | null } | undefined;
        if (!client) return deps.validation('Client not found');
        if (!client.billing_email) {
          const alternate = deps.sqlite
            .prepare(
              'SELECT 1 FROM client_contact WHERE client_id=? AND is_billing_contact=1 AND id<>? LIMIT 1',
            )
            .get(existing.client_id, contactId);
          if (!alternate)
            return deps.validation('A billing email or billing contact is required');
        }
      }

      try {
        const deleted = deps.sqlite
          .prepare('DELETE FROM client_contact WHERE id=?')
          .run(contactId);
        if (deleted.changes !== 1) throw deps.conflict('Contact changed before deletion');
      } catch (error) {
        if (error instanceof Error && /SQLITE_CONSTRAINT|FOREIGN KEY/i.test(error.message))
          throw deps.conflict(
            'Client contact is referenced by billing history and cannot be deleted',
          );
        throw error;
      }
      deps.audit(principal, 'client_contact.delete', 'client_contact', contactId, {
        clientId: existing.client_id,
      });
    });
  }
}
