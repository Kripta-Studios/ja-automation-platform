import type { DatabaseSync } from 'node:sqlite';
import { canManageClients, newId, type Principal } from '@ja/domain';
import type { Currency } from '@ja/money';

export type ClientInput = Readonly<{
  legalName: string;
  displayName: string;
  currency: Currency;
  timezone: string;
  billingEmail?: string;
  paymentTermsDays?: number;
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
  validation: ErrorFactory;
}>;

export class ClientRepository {
  private readonly deps: ClientRepositoryDependencies;

  constructor(deps: ClientRepositoryDependencies) {
    this.deps = deps;
  }

  createClient(principal: Principal, input: ClientInput) {
    const { deps } = this;
    deps.assertActive(principal);
    if (!canManageClients(principal)) return deps.accessDenied('Client administration required');
    return deps.transaction(() => {
      const sequence = deps.nextSequence('client', 'global');
      const id = newId();
      const clientNumber = `C-${String(sequence).padStart(4, '0')}`;
      const timestamp = deps.now();
      deps.sqlite
        .prepare(
          'INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,billing_email,payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          clientNumber,
          deps.assertText(input.legalName, 'Legal name', 300),
          deps.assertText(input.displayName, 'Display name', 160),
          'active',
          input.currency,
          deps.assertText(input.timezone, 'Timezone', 100),
          input.billingEmail ?? null,
          input.paymentTermsDays ?? 30,
          timestamp,
          timestamp,
        );
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
        'SELECT id,client_number,display_name,status,currency,timezone FROM client ORDER BY client_number',
      )
      .all();
  }
}
