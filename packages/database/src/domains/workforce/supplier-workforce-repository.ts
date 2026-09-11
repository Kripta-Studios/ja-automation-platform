import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import {
  TimeEntryRepository,
  type TimeEntryCorrectionInput,
  type TimeEntryInput,
  type TimeEntryUpdateInput,
} from '../time/time-entry-repository.ts';
import {
  readLiveSupplierCoordinatorGrant,
  readSupplierProfile,
  type SupplierProfile,
} from './supplier-access.ts';

type ProjectScope = Readonly<{ id: string; name: string }>;
type SupplierScope = Readonly<{ supplierId: string; grantId: string }>;
export type SupplierDto = Readonly<{
  id: string;
  name: string;
  status: string;
  contactEmail?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}>;
export type SupplierProjectDto = Readonly<{ id: string; name: string }>;
export type SupplierTechnicianDto = Readonly<{
  id: string;
  name: string;
  email: string;
  supplierId: string;
  phone?: string | null;
  company?: string | null;
  contactName?: string | null;
  notes?: string | null;
}>;
export type SupplierGrantDto = Readonly<{
  id: string;
  supplierId: string;
  supplierName: string;
  projectId: string;
  projectName: string;
  coordinatorId: string;
  coordinatorName: string;
  startsOn: string;
  endsOn: string | null;
  status: string;
}>;
export type SupplierOperationalTimeRow = Readonly<{
  id: string;
  workerId: string;
  workerName: string;
  projectId: string;
  projectName: string;
  workDate: string;
  category: string;
  minutes: number;
  summary: string;
  state: string;
  version: number;
  recordedBy: string;
  recordedByName: string;
}>;

export type LocalPortalProvisionInput = Readonly<{
  name: string;
  email: string;
  passwordHash: string;
  role: 'worker' | 'project_manager' | 'finance_admin' | 'auditor_read_only';
  supplierProfile?: SupplierProfile;
  supplierId?: string;
  phone?: string;
  company?: string;
  contactName?: string;
  notes?: string;
}>;

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const EMAIL = /^\S+@\S+\.\S+$/u;
const now = (): string => new Date().toISOString();
const today = (): string => now().slice(0, 10);

function assertDate(value: string, field: string): void {
  if (!DATE.test(value)) throw new ValidationError(`${field} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ValidationError(`${field} must be an ISO date`);
}

function optionalEnd(value: string | undefined, field = 'End date'): string | null {
  const normalized = value?.trim() || null;
  if (normalized) assertDate(normalized, field);
  return normalized;
}

function requiredText(value: string, field: string, max = 5000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ValidationError(`${field} is required`);
  return normalized;
}

/** Operational-only supplier personnel and delegated canonical time workflow. */
export class SupplierWorkforceRepository {
  private readonly sqlite: DatabaseSync;
  private readonly time: TimeEntryRepository;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
    this.time = new TimeEntryRepository({
      sqlite,
      transaction: <T>(work: () => T): T => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertActive(principal),
      assertCanReview: () => {
        throw new AccessDeniedError('Supplier coordinators cannot approve time');
      },
      assertDelegatedTimeAccess: (principal, workerId, projectId, workDate) =>
        this.assertCoordinatorScope(principal, workerId, projectId, workDate),
      recordDelegatedTimeEntry: (principal, timeEntryId, workerId, projectId, workDate) => {
        const scope = this.assertCoordinatorScope(principal, workerId, projectId, workDate);
        this.sqlite
          .prepare(
            `INSERT INTO supplier_time_entry_recorder(time_entry_id,supplier_id,recorded_by_user_id,recorded_at)
             VALUES(?,?,?,?)`,
          )
          .run(timeEntryId, scope.supplierId, principal.userId, now());
      },
      audit: (principal, action, entityType, entityId, details) =>
        recordAuditEvent(this.sqlite, principal, action, entityType, entityId, details),
      assertDate,
      assertText: requiredText,
      shiftIsoDate: (value, days) => {
        assertDate(value, 'Date');
        const date = new Date(`${value}T00:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
      },
      now,
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
  }

  private transaction<T>(work: () => T): T {
    return runImmediateTransaction(this.sqlite, 'supplier-workforce', work);
  }

  private assertActive(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    const current = this.sqlite
      .prepare('SELECT role FROM user WHERE id=?')
      .get(principal.userId) as { role: string } | undefined;
    if (!current || current.role !== principal.role)
      throw new AccessDeniedError('Account role changed');
  }

  private assertOwner(principal: Principal): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw new AccessDeniedError('Owner administration required');
  }

  private assertCoordinator(principal: Principal): { supplierId: string } {
    this.assertActive(principal);
    // A captured Principal is never adequate for this delegation.  Recheck a
    // real unexpired session and the current profile for every operation.
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
    const user = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    const profile = readSupplierProfile(this.sqlite, principal.userId);
    if (
      !user ||
      user.role !== 'worker' ||
      user.status !== 'active' ||
      profile?.profile !== 'supplier_coordinator'
    )
      throw new AccessDeniedError('Active supplier coordinator access required');
    return { supplierId: profile.supplierId };
  }

  private assertExternalTechnician(principal: Principal): { supplierId: string } {
    this.assertActive(principal);
    const profile = readSupplierProfile(this.sqlite, principal.userId);
    const activeSupplier = profile
      ? this.sqlite
          .prepare("SELECT 1 FROM supplier WHERE id=? AND status='active'")
          .get(profile.supplierId)
      : undefined;
    if (profile?.profile !== 'external_technician' || !activeSupplier)
      throw new AccessDeniedError('Active external technician access required');
    return { supplierId: profile.supplierId };
  }

  private assertSupplier(supplierId: string): void {
    const supplier = this.sqlite
      .prepare("SELECT 1 FROM supplier WHERE id=? AND status='active'")
      .get(supplierId);
    if (!supplier) throw new ValidationError('Active supplier required');
  }

  private assertCoordinatorGrant(
    principal: Principal,
    projectId: string,
    operationDate: string,
  ): SupplierScope {
    const coordinator = this.assertCoordinator(principal);
    assertDate(operationDate, 'Work date');
    const grant = readLiveSupplierCoordinatorGrant(
      this.sqlite,
      principal,
      projectId,
      operationDate,
      today(),
    );
    if (!grant) throw new AccessDeniedError('Current supplier project grant required');
    if (grant.supplierId !== coordinator.supplierId)
      throw new AccessDeniedError('Current supplier project grant required');
    return grant;
  }

  private assertCoordinatorScope(
    principal: Principal,
    workerId: string,
    projectId: string,
    workDate: string,
  ): SupplierScope {
    const scope = this.assertCoordinatorGrant(principal, projectId, workDate);
    const worker = this.sqlite
      .prepare(
        `SELECT 1
           FROM user u
           JOIN supplier_user_profile sup ON sup.user_id=u.id
           JOIN project_member pm ON pm.user_id=u.id AND pm.project_id=?
          WHERE u.id=? AND u.role='worker' AND u.status='active'
            AND sup.profile='external_technician' AND sup.supplier_id=?
            AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)`,
      )
      .get(projectId, workerId, scope.supplierId, workDate, workDate);
    if (!worker) throw new AccessDeniedError('Supplier technician project scope required');
    return scope;
  }

  private assertOwnerOrCoordinatorSupplier(
    principal: Principal,
    supplierId: string,
  ): 'owner' | 'coordinator' {
    this.assertActive(principal);
    if (principal.role === 'owner_admin') return 'owner';
    const coordinator = this.assertCoordinator(principal);
    if (coordinator.supplierId !== supplierId)
      throw new AccessDeniedError('Supplier scope required');
    return 'coordinator';
  }

  listSuppliers(principal: Principal): SupplierDto[] {
    this.assertActive(principal);
    if (principal.role === 'owner_admin')
      return this.sqlite
        .prepare(
          'SELECT id,name,status,contact_email contactEmail,phone,address,notes FROM supplier ORDER BY name,id',
        )
        .all() as SupplierDto[];
    const coordinator = this.assertCoordinator(principal);
    return this.sqlite
      .prepare(
        "SELECT id,name,status,contact_email contactEmail,phone,address,notes FROM supplier WHERE id=? AND status='active'",
      )
      .all(coordinator.supplierId) as SupplierDto[];
  }

  createSupplier(
    principal: Principal,
    input: { name: string; contactEmail?: string; phone?: string; address?: string; notes?: string },
  ) {
    this.assertOwner(principal);
    const name = requiredText(input.name, 'Supplier name', 200);
    const contactEmail = input.contactEmail?.trim().toLowerCase() || null;
    const phone = input.phone?.trim() || null;
    const address = input.address?.trim() || null;
    const notes = input.notes?.trim() || null;
    if (contactEmail && (!EMAIL.test(contactEmail) || contactEmail.length > 254))
      throw new ValidationError('Supplier email is invalid');
    if (phone && phone.length > 80) throw new ValidationError('Phone is too long');
    if (address && address.length > 500) throw new ValidationError('Address is too long');
    if (notes && notes.length > 5000) throw new ValidationError('Notes are too long');
    return this.transaction(() => {
      const id = newId();
      const timestamp = now();
      try {
        this.sqlite
          .prepare(
            "INSERT INTO supplier(id,name,status,contact_email,phone,address,notes,created_at,updated_at) VALUES(?,?,'active',?,?,?,?,?,?)",
          )
          .run(id, name, contactEmail, phone, address, notes, timestamp, timestamp);
      } catch {
        throw new ConflictError('Supplier name already exists');
      }
      recordAuditEvent(this.sqlite, principal, 'supplier.create', 'supplier', id, { name });
      return { id };
    });
  }

  /** Owner directory includes inactive personnel; operational pickers stay active-only. */
  technicianDirectory(principal: Principal) {
    this.assertOwner(principal);
    return this.sqlite
      .prepare(
      `SELECT u.id,u.name,
      CASE WHEN u.email LIKE 'supplier-tech-%@personnel.invalid' THEN '' ELSE u.email END email,
      u.status,sup.supplier_id supplierId,s.name supplierName,
      directory.phone,directory.company,directory.contact_name contactName,directory.notes,
      EXISTS(SELECT 1 FROM account a WHERE a.user_id=u.id) OR
      EXISTS(SELECT 1 FROM passkey pk WHERE pk.user_id=u.id) hasLogin
      FROM user u JOIN supplier_user_profile sup ON sup.user_id=u.id
      JOIN supplier s ON s.id=sup.supplier_id
      LEFT JOIN supplier_contact_directory directory ON directory.user_id=u.id
      WHERE sup.profile='external_technician' AND u.role='worker' ORDER BY u.name,u.id`,
      )
      .all() as {
      id: string;
      name: string;
      email: string;
      status: string;
      supplierId: string;
      supplierName: string;
      hasLogin: number;
      phone: string | null;
      company: string | null;
      contactName: string | null;
      notes: string | null;
    }[];
  }

  /**
   * Owner-controlled local credential provisioning. The hash is supplied by
   * the portal's Better Auth password implementation; plaintext never enters
   * this repository or any audit payload.
   */
  provisionLocalPortalAccount(principal: Principal, input: LocalPortalProvisionInput) {
    this.assertOwner(principal);
    const name = requiredText(input.name, 'Name', 160);
    const email = input.email.trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new ValidationError('Email is invalid');
    if (!input.passwordHash || input.passwordHash.length < 20)
      throw new ValidationError('Credential hash is invalid');
    if (!['worker', 'project_manager', 'finance_admin', 'auditor_read_only'].includes(input.role)) throw new ValidationError('Invalid provisioned role');
    const profile = input.supplierProfile;
    if (profile && !['external_technician', 'supplier_coordinator'].includes(profile)) throw new ValidationError('Invalid supplier profile');
    if (profile && input.role !== 'worker')
      throw new ValidationError('Supplier profiles require the worker role');
    const phone = input.phone?.trim() || null;
    const company = input.company?.trim() || null;
    const contactName = input.contactName?.trim() || null;
    const notes = input.notes?.trim() || null;
    if (phone && phone.length > 80) throw new ValidationError('Phone is too long');
    if (company && company.length > 200) throw new ValidationError('Company is too long');
    if (contactName && contactName.length > 160) throw new ValidationError('Contact name is too long');
    if (notes && notes.length > 5000) throw new ValidationError('Notes are too long');

    return this.transaction(() => {
      this.assertOwner(principal);
      assertLiveSession(this.sqlite, principal, AccessDeniedError);
      if (this.sqlite.prepare('SELECT 1 FROM user WHERE lower(email)=?').get(email))
        throw new ConflictError('An account already exists for this email');
      const userId = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          `INSERT INTO user(
             id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
           ) VALUES(?,?,?,1,?,'active',0,0,?,?,1)`,
        )
        .run(userId, name, email, input.role, timestamp, timestamp);
      this.sqlite
        .prepare(
          `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
           VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
        )
        .run(newId(), userId, userId, input.passwordHash, timestamp, timestamp);

      if (profile) {
        const supplierId = requiredText(input.supplierId ?? '', 'Supplier');
        this.assertSupplier(supplierId);
        this.sqlite
          .prepare(
            `INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at)
             VALUES(?,?,?,?,?)`,
          )
          .run(userId, supplierId, profile, timestamp, timestamp);
        this.sqlite
          .prepare(
            `INSERT INTO supplier_user_profile_period(
               id,user_id,supplier_id,profile,starts_at,ends_at,created_at
             ) VALUES(?,?,?,?,?,NULL,?)`,
          )
          .run(newId(), userId, supplierId, profile, timestamp, timestamp);
      }
      if (phone || company || contactName || notes)
        this.sqlite
          .prepare(
            `INSERT INTO supplier_contact_directory(
               user_id,phone,company,contact_name,notes,updated_at,updated_by
             ) VALUES(?,?,?,?,?,?,?)`,
          )
          .run(userId, phone, company, contactName, notes, timestamp, principal.userId);
      recordAuditEvent(this.sqlite, principal, 'supplier.technician.add', 'user', userId, {
        role: input.role,
        supplierProfile: profile ?? null,
        supplierId: profile ? input.supplierId ?? null : null,
        credential: 'local_password_hash_created',
      });
      return { userId, role: input.role, supplierProfile: profile ?? null };
    });
  }

  private saveContactDirectory(
    principal: Principal,
    userId: string,
    input: {
      phone?: string;
      company?: string;
      contactName?: string;
      notes?: string;
    },
  ): void {
    const phone = input.phone?.trim() || null;
    const company = input.company?.trim() || null;
    const contactName = input.contactName?.trim() || null;
    const notes = input.notes?.trim() || null;
    if (phone && phone.length > 80) throw new ValidationError('Phone is too long');
    if (company && company.length > 200) throw new ValidationError('Company is too long');
    if (contactName && contactName.length > 160)
      throw new ValidationError('Contact name is too long');
    if (notes && notes.length > 5000) throw new ValidationError('Notes are too long');
    if (!phone && !company && !contactName && !notes) {
      this.sqlite.prepare('DELETE FROM supplier_contact_directory WHERE user_id=?').run(userId);
      return;
    }
    this.sqlite
      .prepare(
        `INSERT INTO supplier_contact_directory(
           user_id,phone,company,contact_name,notes,updated_at,updated_by
         ) VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET
           phone=excluded.phone,company=excluded.company,contact_name=excluded.contact_name,
           notes=excluded.notes,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
      )
      .run(userId, phone, company, contactName, notes, now(), principal.userId);
  }

  updateSupplier(
    principal: Principal,
    input: { id: string; name: string; contactEmail?: string; phone?: string; address?: string; notes?: string },
  ) {
    return this.transaction(() => {
      this.assertOwner(principal);
      assertLiveSession(this.sqlite, principal, AccessDeniedError);
      const name = requiredText(input.name, 'Supplier name', 200);
      const contactEmail = input.contactEmail?.trim().toLowerCase() || null;
      const phone = input.phone?.trim() || null;
      const address = input.address?.trim() || null;
      const notes = input.notes?.trim() || null;
      if (contactEmail && (!EMAIL.test(contactEmail) || contactEmail.length > 254))
        throw new ValidationError('Supplier email is invalid');
      if (phone && phone.length > 80) throw new ValidationError('Phone is too long');
      if (address && address.length > 500) throw new ValidationError('Address is too long');
      if (notes && notes.length > 5000) throw new ValidationError('Notes are too long');
      const before = this.sqlite.prepare('SELECT name FROM supplier WHERE id=?').get(input.id);
      if (!before) throw new ValidationError('Supplier not found');
      if (this.sqlite.prepare('SELECT 1 FROM supplier WHERE name=? AND id<>?').get(name, input.id))
        throw new ConflictError('Supplier name already exists');
      this.sqlite
        .prepare(
          'UPDATE supplier SET name=?,contact_email=?,phone=?,address=?,notes=?,updated_at=? WHERE id=?',
        )
        .run(name, contactEmail, phone, address, notes, now(), input.id);
      recordAuditEvent(this.sqlite, principal, 'supplier.update', 'supplier', input.id, {
        before,
        after: { name, contactEmail, phone, address, notes },
      });
    });
  }

  setSupplierStatus(principal: Principal, input: { id: string; status: string }) {
    return this.transaction(() => {
      this.assertOwner(principal);
      assertLiveSession(this.sqlite, principal, AccessDeniedError);
      if (!['active', 'inactive'].includes(input.status))
        throw new ValidationError('Invalid supplier status');
      const before = this.sqlite.prepare('SELECT status FROM supplier WHERE id=?').get(input.id);
      if (!before) throw new ValidationError('Supplier not found');
      if (before.status === input.status) return;
      const timestamp = now();
      this.sqlite
        .prepare('UPDATE supplier SET status=?,updated_at=? WHERE id=?')
        .run(input.status, timestamp, input.id);
      if (input.status === 'inactive') {
        // Revoke grants individually so restoration never silently restores delegation.
        const grants = this.sqlite
          .prepare("SELECT id FROM supplier_project_grant WHERE supplier_id=? AND status='active'")
          .all(input.id);
        for (const grant of grants) this.revokeProject(principal, { id: String(grant.id) });
        this.sqlite
          .prepare(
            'DELETE FROM session WHERE user_id IN (SELECT user_id FROM supplier_user_profile WHERE supplier_id=?)',
          )
          .run(input.id);
      }
      recordAuditEvent(this.sqlite, principal, 'supplier.status', 'supplier', input.id, {
        before,
        after: { status: input.status },
      });
    });
  }

  updateTechnician(
    principal: Principal,
    input: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      contactName?: string;
      notes?: string;
    },
  ) {
    return this.transaction(() => {
      this.assertOwner(principal);
      assertLiveSession(this.sqlite, principal, AccessDeniedError);
      const before = this.technicianDirectory(principal).find((row) => row.id === input.id);
      if (!before) throw new ValidationError('Supplier technician required');
      const name = requiredText(input.name, 'Technician name', 160);
      const email = input.email?.trim().toLowerCase() || '';
      if (email && (!EMAIL.test(email) || email.length > 254))
        throw new ValidationError('Technician email is invalid');
      // Login identities must use the existing account-management flow.
      if (before.hasLogin && email !== before.email)
        throw new ValidationError('Manage login email from the account profile');
      const storedEmail = email || `supplier-tech-${input.id}@personnel.invalid`;
      if (
        this.sqlite.prepare('SELECT 1 FROM user WHERE email=? AND id<>?').get(storedEmail, input.id)
      )
        throw new ConflictError('Technician email already belongs to an account');
      this.sqlite
        .prepare(
          'UPDATE user SET name=?,email=?,email_verified=CASE WHEN email=? THEN email_verified ELSE 0 END,updated_at=?,version=version+1 WHERE id=?',
        )
        .run(name, storedEmail, storedEmail, now(), input.id);
      this.saveContactDirectory(principal, input.id, input);
      recordAuditEvent(this.sqlite, principal, 'supplier.technician.update', 'user', input.id, {
        before: { name: before.name, email: before.email },
        after: { name, email },
      });
    });
  }

  setTechnicianStatus(principal: Principal, input: { id: string; status: string }) {
    return this.transaction(() => {
      this.assertOwner(principal);
      assertLiveSession(this.sqlite, principal, AccessDeniedError);
      if (!['active', 'suspended'].includes(input.status))
        throw new ValidationError('Invalid technician status');
      const before = this.technicianDirectory(principal).find((row) => row.id === input.id);
      if (!before || !['active', 'suspended'].includes(before.status))
        throw new ValidationError('Active or suspended supplier technician required');
      if (input.status === 'active') this.assertSupplier(before.supplierId);
      if (before.status === input.status) return;
      this.sqlite
        .prepare('UPDATE user SET status=?,updated_at=?,version=version+1 WHERE id=?')
        .run(input.status, now(), input.id);
      this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(input.id);
      recordAuditEvent(this.sqlite, principal, 'supplier.technician.status', 'user', input.id, {
        before: { status: before.status },
        after: { status: input.status },
        supplierId: before.supplierId,
      });
    });
  }

  setAccountProfile(
    principal: Principal,
    input: {
      userId: string;
      profile: 'standard' | SupplierProfile;
      supplierId?: string;
    },
  ) {
    this.assertOwner(principal);
    return this.transaction(() => {
      const user = this.sqlite.prepare('SELECT id,role FROM user WHERE id=?').get(input.userId) as
        | { id: string; role: string }
        | undefined;
      if (!user) throw new ValidationError('Worker not found');
      if (user.role !== 'worker')
        throw new ValidationError('Only existing worker accounts can receive a supplier profile');
      const existingProfile = readSupplierProfile(this.sqlite, input.userId);
      const requestedSupplierId =
        input.profile === 'standard' ? null : input.supplierId?.trim() || null;
      if (input.profile === 'supplier_coordinator') {
        const loginCapable = this.sqlite
          .prepare(
            `SELECT 1 FROM user u
              WHERE u.id=? AND (
                EXISTS(
                  SELECT 1 FROM account a
                   WHERE a.user_id=u.id AND (a.provider_id<>'credential' OR length(a.password)>0)
                )
                OR EXISTS(SELECT 1 FROM passkey pk WHERE pk.user_id=u.id)
              )`,
          )
          .get(input.userId);
        if (!loginCapable)
          throw new ValidationError('Supplier coordinators require a usable login account');
      }
      const priorSupplierVisibleTime = requestedSupplierId
        ? Boolean(
            this.sqlite
              .prepare(
                `SELECT 1 FROM time_entry t JOIN supplier_user_profile_period period ON period.user_id=t.worker_id
                  WHERE t.worker_id=? AND period.supplier_id<>? AND t.created_at>=period.starts_at
                    AND (period.ends_at IS NULL OR t.created_at<=period.ends_at) LIMIT 1`,
              )
              .get(input.userId, requestedSupplierId),
          )
        : false;
      if (priorSupplierVisibleTime)
        throw new ConflictError(
          'Supplier profile with canonical time history cannot be reassigned',
        );
      const timestamp = now();
      if (input.profile === 'standard') {
        this.sqlite
          .prepare(
            'UPDATE supplier_user_profile_period SET ends_at=? WHERE user_id=? AND ends_at IS NULL',
          )
          .run(timestamp, input.userId);
        this.sqlite.prepare('DELETE FROM supplier_user_profile WHERE user_id=?').run(input.userId);
      } else {
        const supplierId = requiredText(input.supplierId ?? '', 'Supplier');
        this.assertSupplier(supplierId);
        const unchanged =
          existingProfile?.supplierId === supplierId && existingProfile.profile === input.profile;
        if (!unchanged)
          this.sqlite
            .prepare(
              'UPDATE supplier_user_profile_period SET ends_at=? WHERE user_id=? AND ends_at IS NULL',
            )
            .run(timestamp, input.userId);
        this.sqlite
          .prepare(
            `INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at)
             VALUES(?,?,?,?,?)
             ON CONFLICT(user_id) DO UPDATE SET supplier_id=excluded.supplier_id,profile=excluded.profile,updated_at=excluded.updated_at`,
          )
          .run(input.userId, supplierId, input.profile, timestamp, timestamp);
        if (!unchanged)
          this.sqlite
            .prepare(
              `INSERT INTO supplier_user_profile_period(
                 id,user_id,supplier_id,profile,starts_at,ends_at,created_at
               ) VALUES(?,?,?,?,?,NULL,?)`,
            )
            .run(newId(), input.userId, supplierId, input.profile, timestamp, timestamp);
      }
      // Force all login-bearing accounts to resolve their profile again.  New
      // personnel records have no account/session rows to revoke.
      this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(input.userId);
      recordAuditEvent(
        this.sqlite,
        principal,
        'supplier.profile.set',
        'supplier_user_profile',
        input.userId,
        {
          profile: input.profile,
          supplierId: input.profile === 'standard' ? null : (input.supplierId ?? null),
        },
      );
      return { userId: input.userId, profile: input.profile };
    });
  }

  grantProject(
    principal: Principal,
    input: {
      supplierId: string;
      projectId: string;
      coordinatorId: string;
      startsOn: string;
      endsOn?: string;
    },
  ) {
    this.assertOwner(principal);
    assertDate(input.startsOn, 'Start date');
    const endsOn = optionalEnd(input.endsOn);
    if (endsOn && endsOn < input.startsOn)
      throw new ValidationError('End date must follow start date');
    return this.transaction(() => {
      this.assertSupplier(input.supplierId);
      const coordinator = this.sqlite
        .prepare(
          `SELECT 1 FROM user u JOIN supplier_user_profile sup ON sup.user_id=u.id
            WHERE u.id=? AND u.role='worker' AND u.status='active'
              AND sup.supplier_id=? AND sup.profile='supplier_coordinator'
              AND (
                EXISTS(
                  SELECT 1 FROM account a
                   WHERE a.user_id=u.id AND (a.provider_id<>'credential' OR length(a.password)>0)
                )
                OR EXISTS(SELECT 1 FROM passkey pk WHERE pk.user_id=u.id)
              )`,
        )
        .get(input.coordinatorId, input.supplierId);
      if (!coordinator) throw new ValidationError('Active supplier coordinator required');
      const project = this.sqlite
        .prepare("SELECT 1 FROM project WHERE id=? AND status IN ('active','planned','paused')")
        .get(input.projectId);
      if (!project) throw new ValidationError('Operational project required');
      const overlappingGrant = this.sqlite
        .prepare(
          `SELECT 1 FROM supplier_project_grant
            WHERE supplier_id=? AND project_id=? AND coordinator_id=? AND status='active'
              AND starts_on<=COALESCE(?, '9999-12-31')
              AND (ends_on IS NULL OR ends_on>=?)
            LIMIT 1`,
        )
        .get(input.supplierId, input.projectId, input.coordinatorId, endsOn, input.startsOn);
      if (overlappingGrant)
        throw new ConflictError('Supplier project grant overlaps an active grant');
      const timestamp = now();
      const existingMember = this.sqlite
        .prepare(
          `SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active'
             AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1`,
        )
        .get(input.projectId, input.coordinatorId, input.startsOn, input.startsOn);
      if (!existingMember) {
        const assignmentId = newId();
        this.sqlite
          .prepare(
            `INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at)
             VALUES(?,?,?,?,?,?,NULL,0,'active',?,?)`,
          )
          .run(
            assignmentId,
            input.projectId,
            input.coordinatorId,
            'worker',
            input.startsOn,
            endsOn,
            timestamp,
            timestamp,
          );
        recordAuditEvent(
          this.sqlite,
          principal,
          'supplier.assignment.create',
          'project_member',
          assignmentId,
          {
            projectId: input.projectId,
            workerId: input.coordinatorId,
            supplierId: input.supplierId,
          },
        );
      }
      const id = newId();
      this.sqlite
        .prepare(
          `INSERT INTO supplier_project_grant(
             id,supplier_id,project_id,coordinator_id,starts_on,ends_on,status,created_at,updated_at
           ) VALUES(?,?,?,?,?,?, 'active',?,?)`,
        )
        .run(
          id,
          input.supplierId,
          input.projectId,
          input.coordinatorId,
          input.startsOn,
          endsOn,
          timestamp,
          timestamp,
        );
      recordAuditEvent(
        this.sqlite,
        principal,
        'supplier.grant',
        'supplier_project_grant',
        id,
        input,
      );
      return { id };
    });
  }

  revokeProject(principal: Principal, input: { id: string }) {
    this.assertOwner(principal);
    return this.transaction(() => {
      const timestamp = now();
      const result = this.sqlite
        .prepare(
          `UPDATE supplier_project_grant
             SET status='revoked',revoked_at=?,revoked_by=?,updated_at=?
           WHERE id=? AND status='active'`,
        )
        .run(timestamp, principal.userId, timestamp, input.id);
      if (result.changes !== 1) throw new ConflictError('Active supplier project grant required');
      recordAuditEvent(
        this.sqlite,
        principal,
        'supplier.revoke',
        'supplier_project_grant',
        input.id,
        {},
      );
      return { id: input.id };
    });
  }

  listGrants(principal: Principal): SupplierGrantDto[] {
    this.assertOwner(principal);
    return this.sqlite
      .prepare(
        `SELECT g.id,g.supplier_id supplierId,s.name supplierName,g.project_id projectId,p.name projectName,
                g.coordinator_id coordinatorId,u.name coordinatorName,g.starts_on startsOn,g.ends_on endsOn,g.status
           FROM supplier_project_grant g JOIN supplier s ON s.id=g.supplier_id
           JOIN project p ON p.id=g.project_id JOIN user u ON u.id=g.coordinator_id
          ORDER BY g.status='active' DESC,s.name,p.name,g.starts_on DESC`,
      )
      .all() as SupplierGrantDto[];
  }

  configuration(principal: Principal) {
    this.assertOwner(principal);
    return {
      users: this.sqlite
        .prepare(
          `SELECT u.id,u.name,sup.supplier_id supplierId,sup.profile
             FROM user u JOIN supplier_user_profile sup ON sup.user_id=u.id
            ORDER BY u.name,u.id`,
        )
        .all(),
      grants: this.listGrants(principal),
    };
  }

  listProjects(principal: Principal): SupplierProjectDto[] {
    this.assertActive(principal);
    if (principal.role === 'owner_admin')
      return this.sqlite
        .prepare(
          "SELECT id,name FROM project WHERE status IN ('active','planned','paused') ORDER BY name,id",
        )
        .all() as SupplierProjectDto[];
    const profile = readSupplierProfile(this.sqlite, principal.userId);
    if (profile?.profile === 'external_technician') {
      this.assertExternalTechnician(principal);
      return this.sqlite
        .prepare(
          `SELECT p.id,p.name FROM project_member pm JOIN project p ON p.id=pm.project_id
            WHERE pm.user_id=? AND pm.status='active' AND p.status IN ('active','planned','paused')
              AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) ORDER BY p.name,p.id`,
        )
        .all(principal.userId, today(), today()) as ProjectScope[];
    }
    const coordinator = this.assertCoordinator(principal);
    const current = today();
    return this.sqlite
      .prepare(
        `SELECT DISTINCT p.id,p.name FROM supplier_project_grant g
           JOIN project p ON p.id=g.project_id
           JOIN project_member pm ON pm.project_id=g.project_id AND pm.user_id=g.coordinator_id
          WHERE g.supplier_id=? AND g.coordinator_id=? AND g.status='active'
            AND p.status IN ('active','planned','paused')
            AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
            AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
          ORDER BY p.name,p.id`,
      )
      .all(
        coordinator.supplierId,
        principal.userId,
        current,
        current,
        current,
        current,
      ) as SupplierProjectDto[];
  }

  listTechnicians(principal: Principal, projectId?: string): SupplierTechnicianDto[] {
    this.assertActive(principal);
    const isOwner = principal.role === 'owner_admin';
    const supplierId = isOwner ? undefined : this.assertCoordinator(principal).supplierId;
    if (projectId && !isOwner) this.assertCoordinatorGrant(principal, projectId, today());
    const filters = [
      "sup.profile='external_technician'",
      "u.role='worker'",
      "u.status='active'",
      "EXISTS(SELECT 1 FROM supplier active_supplier WHERE active_supplier.id=sup.supplier_id AND active_supplier.status='active')",
    ];
    const values: string[] = [];
    if (supplierId) {
      filters.push('sup.supplier_id=?');
      values.push(supplierId);
    }
    if (projectId) {
      filters.push(`EXISTS(SELECT 1 FROM project_member pm WHERE pm.project_id=? AND pm.user_id=u.id
        AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?))`);
      values.push(projectId, today(), today());
    }
    return this.sqlite
      .prepare(
        `SELECT u.id,u.name,u.email,sup.supplier_id supplierId FROM user u JOIN supplier_user_profile sup ON sup.user_id=u.id
          WHERE ${filters.join(' AND ')} ORDER BY u.name,u.id`,
      )
      .all(...values) as SupplierTechnicianDto[];
  }

  addTechnician(
    principal: Principal,
    input: {
      supplierId?: string;
      projectId: string;
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      contactName?: string;
      notes?: string;
      startsOn: string;
      endsOn?: string;
    },
  ) {
    assertDate(input.startsOn, 'Start date');
    const endsOn = optionalEnd(input.endsOn);
    if (endsOn && endsOn < input.startsOn)
      throw new ValidationError('End date must follow start date');
    const name = requiredText(input.name, 'Technician name', 160);
    const suppliedEmail = input.email?.trim().toLowerCase() || null;
    if (suppliedEmail && !EMAIL.test(suppliedEmail))
      throw new ValidationError('Technician email is invalid');
    return this.transaction(() => {
      this.assertActive(principal);
      let supplierId: string;
      if (principal.role === 'owner_admin') {
        supplierId = requiredText(input.supplierId ?? '', 'Supplier');
        this.assertSupplier(supplierId);
      } else {
        const scope = this.assertCoordinatorGrant(principal, input.projectId, input.startsOn);
        supplierId = scope.supplierId;
        if (input.supplierId && input.supplierId !== supplierId)
          throw new AccessDeniedError('Supplier scope required');
      }
      // A coordinator cannot use a pre-existing email as a way to claim an
      // account from another supplier.  Personnel creation always inserts.
      if (
        suppliedEmail &&
        this.sqlite.prepare('SELECT 1 FROM user WHERE email=?').get(suppliedEmail)
      )
        throw new ConflictError('Technician email already belongs to an account');
      const id = newId();
      const email = suppliedEmail ?? `supplier-tech-${id}@personnel.invalid`;
      const timestamp = now();
      this.sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
           VALUES(?,?,?,0,'worker','active',0,?,?)`,
        )
        .run(id, name, email, timestamp, timestamp);
      this.sqlite
        .prepare(
          `INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at)
           VALUES(?,?, 'external_technician',?,?)`,
        )
        .run(id, supplierId, timestamp, timestamp);
      this.sqlite
        .prepare(
          `INSERT INTO supplier_user_profile_period(
             id,user_id,supplier_id,profile,starts_at,ends_at,created_at
           ) VALUES(?,?,?,'external_technician',?,NULL,?)`,
        )
        .run(newId(), id, supplierId, timestamp, timestamp);
      this.saveContactDirectory(principal, id, input);
      const assignmentId = newId();
      this.sqlite
        .prepare(
          `INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at)
           VALUES(?,?,?,?,?,?,NULL,0,'active',?,?)`,
        )
        .run(
          assignmentId,
          input.projectId,
          id,
          'worker',
          input.startsOn,
          endsOn,
          timestamp,
          timestamp,
        );
      recordAuditEvent(this.sqlite, principal, 'supplier.technician.add', 'user', id, {
        supplierId,
        projectId: input.projectId,
        assignmentId,
        noLoginAccount: true,
      });
      recordAuditEvent(
        this.sqlite,
        principal,
        'supplier.assignment.create',
        'project_member',
        assignmentId,
        {
          supplierId,
          workerId: id,
          projectId: input.projectId,
        },
      );
      return { id, assignmentId };
    });
  }

  assignTechnician(
    principal: Principal,
    input: { workerId: string; projectId: string; startsOn: string; endsOn?: string },
  ) {
    assertDate(input.startsOn, 'Start date');
    const endsOn = optionalEnd(input.endsOn);
    if (endsOn && endsOn < input.startsOn)
      throw new ValidationError('End date must follow start date');
    return this.transaction(() => {
      const profile = readSupplierProfile(this.sqlite, input.workerId);
      const worker = this.sqlite
        .prepare("SELECT 1 FROM user WHERE id=? AND role='worker' AND status='active'")
        .get(input.workerId);
      if (!worker || profile?.profile !== 'external_technician')
        throw new AccessDeniedError('Supplier technician required');
      let supplierId: string;
      if (principal.role === 'owner_admin') {
        this.assertOwner(principal);
        const project = this.sqlite
          .prepare("SELECT 1 FROM project WHERE id=? AND status IN ('active','planned','paused')")
          .get(input.projectId);
        if (!project) throw new ValidationError('Operational project required');
        this.assertSupplier(profile.supplierId);
        supplierId = profile.supplierId;
      } else {
        const scope = this.assertCoordinatorGrant(principal, input.projectId, input.startsOn);
        if (profile.supplierId !== scope.supplierId)
          throw new AccessDeniedError('Supplier technician required');
        supplierId = scope.supplierId;
      }
      const timestamp = now();
      const id = newId();
      try {
        this.sqlite
          .prepare(
            `INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at)
             VALUES(?,?,?,?,?,?,NULL,0,'active',?,?)`,
          )
          .run(
            id,
            input.projectId,
            input.workerId,
            'worker',
            input.startsOn,
            endsOn,
            timestamp,
            timestamp,
          );
      } catch {
        throw new ConflictError('Technician assignment already exists');
      }
      recordAuditEvent(this.sqlite, principal, 'supplier.assignment.create', 'project_member', id, {
        supplierId,
        workerId: input.workerId,
        projectId: input.projectId,
      });
      return { id };
    });
  }

  private reportRows(
    principal: Principal,
    input: { projectId?: string; from: string; to: string; supplierId?: string },
  ): SupplierOperationalTimeRow[] {
    assertDate(input.from, 'From date');
    assertDate(input.to, 'To date');
    if (input.to < input.from) throw new ValidationError('To date must follow from date');
    this.assertActive(principal);
    let supplierId = input.supplierId;
    const scopedHistoricalIdentity = `
      (
        EXISTS(
          SELECT 1 FROM supplier_user_profile_period period
           WHERE period.user_id=t.worker_id AND period.supplier_id=?
             AND period.profile='external_technician'
             AND t.created_at>=period.starts_at
             AND (period.ends_at IS NULL OR t.created_at<period.ends_at)
             AND (
               NOT EXISTS(SELECT 1 FROM supplier_time_entry_recorder direct_rec WHERE direct_rec.time_entry_id=t.id)
               OR EXISTS(
                 SELECT 1 FROM supplier_time_entry_recorder direct_rec
                  WHERE direct_rec.time_entry_id=t.id AND direct_rec.supplier_id=period.supplier_id
               )
             )
        )
        OR EXISTS(
          SELECT 1 FROM record_correction_link correction_link
          JOIN time_entry source ON source.id=correction_link.original_id
           WHERE correction_link.record_type='time_entry' AND correction_link.correction_id=t.id
             AND (
               EXISTS(
                 SELECT 1 FROM supplier_user_profile_period source_period
                  WHERE source_period.user_id=source.worker_id AND source_period.supplier_id=?
                    AND source_period.profile='external_technician'
                    AND source.created_at>=source_period.starts_at
                    AND (source_period.ends_at IS NULL OR source.created_at<source_period.ends_at)
                    AND (
                      NOT EXISTS(SELECT 1 FROM supplier_time_entry_recorder source_rec WHERE source_rec.time_entry_id=source.id)
                      OR EXISTS(
                        SELECT 1 FROM supplier_time_entry_recorder source_rec
                         WHERE source_rec.time_entry_id=source.id AND source_rec.supplier_id=source_period.supplier_id
                      )
                    )
               )
               OR EXISTS(
                 SELECT 1 FROM supplier_time_entry_recorder source_rec
                  WHERE source_rec.time_entry_id=source.id AND source_rec.supplier_id=?
               )
             )
        )
      )`;
    const unscopedHistoricalIdentity = `
      (
        EXISTS(
          SELECT 1 FROM supplier_user_profile_period period
           WHERE period.user_id=t.worker_id AND period.profile='external_technician'
             AND t.created_at>=period.starts_at
             AND (period.ends_at IS NULL OR t.created_at<period.ends_at)
             AND (
               NOT EXISTS(SELECT 1 FROM supplier_time_entry_recorder direct_rec WHERE direct_rec.time_entry_id=t.id)
               OR EXISTS(
                 SELECT 1 FROM supplier_time_entry_recorder direct_rec
                  WHERE direct_rec.time_entry_id=t.id AND direct_rec.supplier_id=period.supplier_id
               )
             )
        )
        OR EXISTS(
          SELECT 1 FROM record_correction_link correction_link
          JOIN time_entry source ON source.id=correction_link.original_id
           WHERE correction_link.record_type='time_entry' AND correction_link.correction_id=t.id
             AND (
               EXISTS(
                 SELECT 1 FROM supplier_user_profile_period source_period
                  WHERE source_period.user_id=source.worker_id AND source_period.profile='external_technician'
                    AND source.created_at>=source_period.starts_at
                    AND (source_period.ends_at IS NULL OR source.created_at<source_period.ends_at)
                    AND (
                      NOT EXISTS(SELECT 1 FROM supplier_time_entry_recorder source_rec WHERE source_rec.time_entry_id=source.id)
                      OR EXISTS(
                        SELECT 1 FROM supplier_time_entry_recorder source_rec
                         WHERE source_rec.time_entry_id=source.id AND source_rec.supplier_id=source_period.supplier_id
                      )
                    )
               )
               OR EXISTS(
                 SELECT 1 FROM supplier_time_entry_recorder source_rec
                  WHERE source_rec.time_entry_id=source.id
               )
             )
        )
      )`;
    const where: string[] = [];
    const values: string[] = [];
    if (principal.role === 'owner_admin') {
      if (supplierId) {
        // Inactive suppliers remain selectable in the owner's historical reports.
        if (!this.sqlite.prepare('SELECT 1 FROM supplier WHERE id=?').get(supplierId))
          throw new ValidationError('Supplier not found');
        where.push(scopedHistoricalIdentity);
        values.push(supplierId, supplierId, supplierId);
      } else {
        where.push(unscopedHistoricalIdentity);
      }
    } else {
      const coordinator = this.assertCoordinator(principal);
      supplierId = coordinator.supplierId;
      where.push(scopedHistoricalIdentity);
      values.push(supplierId, supplierId, supplierId);
      const current = today();
      where.push(`EXISTS(
        SELECT 1 FROM supplier_project_grant g JOIN project_member pm
          ON pm.project_id=g.project_id AND pm.user_id=g.coordinator_id
        WHERE g.supplier_id=? AND g.coordinator_id=? AND g.project_id=t.project_id
          AND g.status='active' AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
          AND g.starts_on<=t.work_date AND (g.ends_on IS NULL OR g.ends_on>=t.work_date)
          AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
      )`);
      values.push(supplierId, principal.userId, current, current, current, current);
    }
    where.push('t.work_date BETWEEN ? AND ?');
    values.push(input.from, input.to);
    if (input.projectId) {
      // The selected project itself must remain currently delegated.  The SQL
      // scope above then filters each historical row by its own work date.
      if (principal.role !== 'owner_admin')
        this.assertCoordinatorGrant(principal, input.projectId, today());
      where.push('t.project_id=?');
      values.push(input.projectId);
    }
    return this.sqlite
      .prepare(
        `SELECT t.id,t.worker_id workerId,u.name workerName,t.project_id projectId,p.name projectName,
                t.work_date workDate,t.category,t.minutes,t.activity_summary summary,t.approval_state state,t.version,
                COALESCE(rec.recorded_by_user_id,correction_link.actor_user_id,t.worker_id) recordedBy,
                COALESCE(ru.name,correction_actor.name,u.name) recordedByName,
                EXISTS(
                  SELECT 1 FROM record_correction_link rcl JOIN time_entry correction ON correction.id=rcl.correction_id
                   WHERE rcl.record_type='time_entry' AND rcl.original_id=t.id AND correction.approval_state<>'rejected'
                ) isSuperseded
           FROM time_entry t JOIN user u ON u.id=t.worker_id JOIN project p ON p.id=t.project_id
           LEFT JOIN supplier_time_entry_recorder rec ON rec.time_entry_id=t.id
           LEFT JOIN user ru ON ru.id=rec.recorded_by_user_id
           LEFT JOIN record_correction_link correction_link
             ON correction_link.record_type='time_entry' AND correction_link.correction_id=t.id
           LEFT JOIN user correction_actor ON correction_actor.id=correction_link.actor_user_id
          WHERE ${where.join(' AND ')}
          ORDER BY t.work_date,t.created_at,t.id`,
      )
      .all(...values) as SupplierOperationalTimeRow[];
  }

  listTime(
    principal: Principal,
    input: { projectId?: string; from: string; to: string; supplierId?: string },
  ): SupplierOperationalTimeRow[] {
    this.assertActive(principal);
    const profile = readSupplierProfile(this.sqlite, principal.userId);
    if (profile?.profile === 'external_technician') {
      this.assertExternalTechnician(principal);
      assertDate(input.from, 'From date');
      assertDate(input.to, 'To date');
      if (input.to < input.from) throw new ValidationError('To date must follow from date');
      const projectFilter = input.projectId ? ' AND t.project_id=?' : '';
      return this.sqlite
        .prepare(
          `SELECT t.id,t.worker_id workerId,u.name workerName,t.project_id projectId,p.name projectName,
                  t.work_date workDate,t.category,t.minutes,t.activity_summary summary,t.approval_state state,t.version,
                  COALESCE(rec.recorded_by_user_id,t.worker_id) recordedBy,COALESCE(ru.name,u.name) recordedByName,
                  EXISTS(
                    SELECT 1 FROM record_correction_link rcl JOIN time_entry correction ON correction.id=rcl.correction_id
                     WHERE rcl.record_type='time_entry' AND rcl.original_id=t.id AND correction.approval_state<>'rejected'
                  ) isSuperseded
             FROM time_entry t JOIN user u ON u.id=t.worker_id JOIN project p ON p.id=t.project_id
             LEFT JOIN supplier_time_entry_recorder rec ON rec.time_entry_id=t.id
             LEFT JOIN user ru ON ru.id=rec.recorded_by_user_id
            WHERE t.worker_id=? AND t.work_date BETWEEN ? AND ?${projectFilter}
              AND (rec.time_entry_id IS NULL OR rec.supplier_id=?)
              AND EXISTS(
                SELECT 1 FROM supplier_user_profile_period period
                 WHERE period.user_id=t.worker_id AND period.supplier_id=? AND period.profile='external_technician'
                   AND t.created_at>=period.starts_at AND (period.ends_at IS NULL OR t.created_at<period.ends_at)
              )
              AND EXISTS(
                SELECT 1 FROM project_member pm WHERE pm.project_id=t.project_id AND pm.user_id=t.worker_id
                  AND pm.status='active' AND pm.starts_on<=t.work_date
                  AND (pm.ends_on IS NULL OR pm.ends_on>=t.work_date)
                  AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
              )
            ORDER BY t.work_date,t.created_at,t.id`,
        )
        .all(
          principal.userId,
          input.from,
          input.to,
          ...(input.projectId ? [input.projectId] : []),
          profile.supplierId,
          profile.supplierId,
          today(),
          today(),
        ) as SupplierOperationalTimeRow[];
    }
    return this.reportRows(principal, input);
  }

  createTime(principal: Principal, input: TimeEntryInput & { workerId: string }) {
    this.assertCoordinatorScope(principal, input.workerId, input.projectId, input.workDate);
    return this.time.createTimeEntryForWorker(principal, input.workerId, input);
  }

  submitTime(principal: Principal, input: { id: string; version: number }) {
    return this.time.submitTime(principal, input.id, input.version);
  }

  updateTime(principal: Principal, input: TimeEntryUpdateInput) {
    return this.time.updateTimeEntry(principal, input);
  }

  createTimeCorrection(principal: Principal, input: TimeEntryCorrectionInput) {
    return this.time.createCorrectionDraft(principal, input);
  }

  operationalReport(
    principal: Principal,
    input: { projectId?: string; from: string; to: string; supplierId?: string },
  ) {
    const profile = readSupplierProfile(this.sqlite, principal.userId);
    const rows =
      profile?.profile === 'external_technician'
        ? this.listTime(principal, input)
        : this.reportRows(principal, input);
    const project = input.projectId
      ? profile?.profile === 'external_technician'
        ? (this.sqlite
            .prepare(
              `SELECT p.id,p.name FROM project p JOIN project_member pm ON pm.project_id=p.id
                  WHERE p.id=? AND pm.user_id=? AND pm.status='active'
                    AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)`,
            )
            .get(input.projectId, principal.userId, today(), today()) as ProjectScope | undefined)
        : (this.sqlite.prepare('SELECT id,name FROM project WHERE id=?').get(input.projectId) as
            | ProjectScope
            | undefined)
      : undefined;
    if (input.projectId && !project) {
      if (profile?.profile === 'external_technician')
        throw new AccessDeniedError('Project assignment access required');
      throw new ValidationError('Project not found');
    }
    const effectiveRows = (
      rows as Array<SupplierOperationalTimeRow & { isSuperseded?: number }>
    ).filter((row) => !row.isSuperseded);
    return {
      project: project ?? { id: 'all', name: 'All allowed projects' },
      from: input.from,
      to: input.to,
      rows: effectiveRows.map(
        ({ projectId: _projectId, projectName: _projectName, ...row }) => row,
      ),
      totalMinutes: effectiveRows.reduce(
        (total, row) =>
          total +
          (row.state === 'rejected' || row.state === 'void' || row.isSuperseded ? 0 : row.minutes),
        0,
      ),
    };
  }
}
