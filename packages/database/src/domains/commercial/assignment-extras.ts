import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import { overtimeRate } from '@ja/billing-engine';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import {
  AssignmentExpensePolicyRepository,
  type ClientRecoveryMode,
  type WorkerReimbursementMode,
} from '../expenses/assignment-expense-policy-repository.ts';
import {
  SupplierExpenseRuleRepository,
  hasSupplierExpenseRules,
  supplierOfUser,
  type SupplierExpenseCarrier,
} from '../expenses/supplier-expense-carrier.ts';

/**
 * Optional extras of one assignment (owner request 2026-11-25): per diem, a safety/hazard
 * allowance and an overtime rate or multiplier, each with a client side (billed on invoices)
 * and a worker side (paid in My Pay and settlements). Nothing is set by default, and an
 * unset value changes nothing anywhere.
 *
 * Rows are append-only versions (migration 0093). Each version applies from its effective date
 * (migration 0095; NULL = from the first day of the assignment): for a day D the version in force
 * is the highest version whose effective date is on or before D, so earlier days keep the
 * earlier terms for invoicing and pay. Days already invoiced or settled keep their snapshot.
 * Money is exact minor units of the project currency; a multiplier is basis points (×1.5 = 15000).
 */
export type ExtraKind = 'per_diem' | 'allowance';
export type ExtraBasis = 'day' | 'month';
export type OvertimeExtraMethod = 'multiplier' | 'rate';
export type ExtrasExpenseChoice = 'none' | 'worker' | 'client' | 'both';
/** D4: who carries an external technician's expenses ('project': follow the project rule). */
export type ExtrasSupplierExpenseChoice = 'project' | SupplierExpenseCarrier;

export type OvertimeExtra = Readonly<{ method: OvertimeExtraMethod; value: string }>;

export type AssignmentExtras = Readonly<{
  id: string;
  projectMemberId: string;
  version: number;
  currency: string;
  perDiemClientMinor: string | null;
  perDiemWorkerMinor: string | null;
  allowanceBasis: ExtraBasis | null;
  allowanceClientMinor: string | null;
  allowanceWorkerMinor: string | null;
  overtimeClient: OvertimeExtra | null;
  overtimeWorker: OvertimeExtra | null;
  reason: string | null;
  /** First day this version applies (YYYY-MM-DD); null: from the start of the assignment. */
  effectiveFrom: string | null;
  createdAt: string;
}>;

export type AssignmentExtrasInput = Readonly<{
  projectMemberId: string;
  /** Current extras version (0 when none yet): a concurrent change is a conflict. */
  expectedVersion: number;
  perDiemClientMinor?: string | null;
  perDiemWorkerMinor?: string | null;
  allowanceBasis?: ExtraBasis | null;
  allowanceClientMinor?: string | null;
  allowanceWorkerMinor?: string | null;
  overtimeClient?: OvertimeExtra | null;
  overtimeWorker?: OvertimeExtra | null;
  /** Expenses of this person (payer: the worker). Undefined: leave the project rules alone. */
  expenses?: ExtrasExpenseChoice;
  /** D4, a supplier's technician only: who carries his expenses. Undefined: no change. */
  supplierExpenses?: ExtrasSupplierExpenseChoice;
  /**
   * First day the new values apply (YYYY-MM-DD). Earlier days keep the values in force before.
   * Omitted, or a day on or before the assignment start: from the start of the assignment (the
   * meaning of every version saved before effective dates). The Team screen always sends a
   * date, today unless the owner picks another one.
   */
  effectiveFrom?: string | null;
  reason?: string | null;
}>;

const MAX_MINOR = 100_000_000_000n;
const MIN_MULTIPLIER_BPS = 10_000n;
const MAX_MULTIPLIER_BPS = 100_000n;

type ExtraRow = {
  id: string;
  project_member_id: string;
  version: number;
  currency: string;
  per_diem_client_minor: string | null;
  per_diem_worker_minor: string | null;
  allowance_basis: ExtraBasis | null;
  allowance_client_minor: string | null;
  allowance_worker_minor: string | null;
  overtime_client_method: OvertimeExtraMethod | null;
  overtime_client_value: string | null;
  overtime_worker_method: OvertimeExtraMethod | null;
  overtime_worker_value: string | null;
  reason: string | null;
  effective_from: string | null;
  created_at: string;
};

const SELECT_EXTRA = `SELECT id,project_member_id,version,currency,
  CAST(per_diem_client_minor AS TEXT) per_diem_client_minor,CAST(per_diem_worker_minor AS TEXT) per_diem_worker_minor,
  allowance_basis,CAST(allowance_client_minor AS TEXT) allowance_client_minor,
  CAST(allowance_worker_minor AS TEXT) allowance_worker_minor,overtime_client_method,
  CAST(overtime_client_value AS TEXT) overtime_client_value,overtime_worker_method,
  CAST(overtime_worker_value AS TEXT) overtime_worker_value,reason,effective_from,created_at
  FROM assignment_extra`;

/**
 * Per connection: whether the table exists (cached once true) and which projects have any
 * extras. Finance reads resolve extras per time entry, so the "nobody here has extras" answer
 * must be cheap. Only AssignmentExtrasRepository.set writes extras; it clears the cache.
 */
const tableReady = new WeakSet<DatabaseSync>();
const projectsWithExtras = new WeakMap<DatabaseSync, Map<string, { value: boolean; at: number }>>();
// "No extras" may be read from a long-lived connection while another one saves extras: that
// answer is reused only briefly. "Has extras" never goes back (rows are append-only).
const NO_EXTRAS_TTL_MS = 2_000;

function hasExtrasTable(sqlite: DatabaseSync): boolean {
  if (tableReady.has(sqlite)) return true;
  const exists = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assignment_extra'")
      .get(),
  );
  if (exists) tableReady.add(sqlite);
  return exists;
}

function projectHasExtras(sqlite: DatabaseSync, projectId: string): boolean {
  if (!hasExtrasTable(sqlite)) return false;
  let cache = projectsWithExtras.get(sqlite);
  if (!cache) {
    cache = new Map();
    projectsWithExtras.set(sqlite, cache);
  }
  const cached = cache.get(projectId);
  if (cached && (cached.value || Date.now() - cached.at < NO_EXTRAS_TTL_MS)) return cached.value;
  const value = Boolean(
    sqlite
      .prepare(
        `SELECT 1 FROM assignment_extra e JOIN project_member pm ON pm.id=e.project_member_id
          WHERE pm.project_id=? LIMIT 1`,
      )
      .get(projectId),
  );
  cache.set(projectId, { value, at: Date.now() });
  return value;
}

function project(row: ExtraRow): AssignmentExtras {
  return {
    id: row.id,
    projectMemberId: row.project_member_id,
    version: Number(row.version),
    currency: row.currency,
    perDiemClientMinor: row.per_diem_client_minor,
    perDiemWorkerMinor: row.per_diem_worker_minor,
    allowanceBasis: row.allowance_basis,
    allowanceClientMinor: row.allowance_client_minor,
    allowanceWorkerMinor: row.allowance_worker_minor,
    overtimeClient: row.overtime_client_method
      ? { method: row.overtime_client_method, value: String(row.overtime_client_value) }
      : null,
    overtimeWorker: row.overtime_worker_method
      ? { method: row.overtime_worker_method, value: String(row.overtime_worker_value) }
      : null,
    reason: row.reason,
    effectiveFrom: row.effective_from ?? null,
    createdAt: row.created_at,
  };
}

/** The extras in force for one assignment (null: none set, or nothing left set). */
export function latestAssignmentExtras(
  sqlite: DatabaseSync,
  projectMemberId: string,
): AssignmentExtras | null {
  if (!hasExtrasTable(sqlite)) return null;
  const row = sqlite
    .prepare(`${SELECT_EXTRA} WHERE project_member_id=? ORDER BY version DESC LIMIT 1`)
    .get(projectMemberId) as ExtraRow | undefined;
  return row ? project(row) : null;
}

/** Every version of one assignment, newest first. */
function assignmentExtrasVersions(
  sqlite: DatabaseSync,
  projectMemberId: string,
): AssignmentExtras[] {
  if (!hasExtrasTable(sqlite)) return [];
  return (
    sqlite
      .prepare(`${SELECT_EXTRA} WHERE project_member_id=? ORDER BY version DESC`)
      .all(projectMemberId) as ExtraRow[]
  ).map(project);
}

/** The version in force on one day: the newest version that applies from that day or earlier. */
function versionOn(versions: readonly AssignmentExtras[], date: string): AssignmentExtras | null {
  return (
    versions.find((version) => version.effectiveFrom === null || version.effectiveFrom <= date) ??
    null
  );
}

/** The extras of one assignment in force on a given day (null: none on that day). */
export function assignmentExtrasOn(
  sqlite: DatabaseSync,
  projectMemberId: string,
  date: string,
): AssignmentExtras | null {
  return versionOn(assignmentExtrasVersions(sqlite, projectMemberId), date);
}

/** True when at least one extra is in use. */
export function extrasInUse(extras: AssignmentExtras | null): boolean {
  if (!extras) return false;
  return Boolean(
    extras.perDiemClientMinor !== null ||
    extras.perDiemWorkerMinor !== null ||
    extras.allowanceClientMinor !== null ||
    extras.allowanceWorkerMinor !== null ||
    extras.overtimeClient ||
    extras.overtimeWorker,
  );
}

/**
 * Looks up the extras of the assignment covering a day, cached per (worker, day). The same
 * assignment rows the rest of the commercial engine uses: active, or ended with an end date.
 */
export class AssignmentExtrasResolver {
  private readonly available: boolean;
  private readonly members = new Map<string, string | null>();
  private readonly extras = new Map<string, AssignmentExtras[]>();

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly projectId: string,
  ) {
    this.available = projectHasExtras(sqlite, projectId);
  }

  /** No assignment of this project has extras: callers skip every extras step. */
  get none(): boolean {
    return !this.available;
  }

  memberOn(workerId: string, date: string): string | null {
    const key = `${workerId}\u0000${date}`;
    if (!this.members.has(key)) {
      const row = this.sqlite
        .prepare(
          `SELECT id FROM project_member WHERE project_id=? AND user_id=? AND starts_on<=?
              AND (ends_on IS NULL OR ends_on>=?)
              AND (status='active' OR (status='inactive' AND ends_on IS NOT NULL))
            ORDER BY (status='active') DESC,starts_on DESC,id LIMIT 1`,
        )
        .get(this.projectId, workerId, date, date) as { id: string } | undefined;
      this.members.set(key, row?.id ?? null);
    }
    return this.members.get(key) ?? null;
  }

  on(workerId: string, date: string): AssignmentExtras | null {
    if (!this.available) return null;
    const member = this.memberOn(workerId, date);
    if (!member) return null;
    let versions = this.extras.get(member);
    if (!versions) {
      versions = assignmentExtrasVersions(this.sqlite, member);
      this.extras.set(member, versions);
    }
    return versionOn(versions, date);
  }
}

/** Overtime rate from an extra: a fixed rate, or the regular rate × multiplier (exact). */
export function overtimeRateFromExtra(
  extra: OvertimeExtra,
  regularRateMinor: bigint | null,
): bigint | null {
  if (extra.method === 'rate') return BigInt(extra.value);
  if (regularRateMinor === null) return null;
  return overtimeRate(regularRateMinor, 'BASE_RATE_MULTIPLIER', {
    multiplierBps: Number(extra.value),
  });
}

export type ExtraCharge = Readonly<{
  kind: ExtraKind;
  basis: ExtraBasis;
  workerId: string;
  projectMemberId: string;
  extraId: string;
  extraVersion: number;
  currency: string;
  rateMinor: bigint;
  /** Worked days (YYYY-MM-DD) or calendar months (YYYY-MM) charged. */
  units: readonly string[];
  amountMinor: bigint;
}>;

type Bucket = {
  kind: ExtraKind;
  basis: ExtraBasis;
  workerId: string;
  extras: AssignmentExtras;
  rate: bigint;
  units: Set<string>;
};

/**
 * A monthly allowance is charged once per calendar month, at the terms of the first worked day
 * of that month that carries one (days are visited in date order): a change in the middle of a
 * month applies to the monthly allowance from the next month.
 */
const claimedMonths = new WeakMap<Map<string, Bucket>, Map<string, string>>();

function addUnit(
  buckets: Map<string, Bucket>,
  kind: ExtraKind,
  basis: ExtraBasis,
  workerId: string,
  extras: AssignmentExtras,
  rate: string | null,
  unit: string,
) {
  if (rate === null || BigInt(rate) <= 0n) return;
  if (basis === 'month') {
    const monthKey = [kind, workerId, extras.projectMemberId, unit].join('\u0000');
    const owner = claimedMonths.get(buckets)?.get(monthKey);
    if (owner !== undefined && owner !== extras.id) return;
    let claims = claimedMonths.get(buckets);
    if (!claims) {
      claims = new Map();
      claimedMonths.set(buckets, claims);
    }
    claims.set(monthKey, extras.id);
  }
  const key = [kind, basis, workerId, extras.projectMemberId, rate].join('\u0000');
  const bucket = buckets.get(key) ?? {
    kind,
    basis,
    workerId,
    extras,
    rate: BigInt(rate),
    units: new Set<string>(),
  };
  bucket.units.add(unit);
  buckets.set(key, bucket);
}

/**
 * Days/months of extras already charged to the client on a live invoice other than
 * `invoiceId` (void, cancelled and superseded invoices release them).
 */
function billedUnits(
  sqlite: DatabaseSync,
  projectId: string,
  invoiceId: string,
  workerId: string,
  kind: ExtraKind,
  basis: ExtraBasis,
): Set<string> {
  const rows = sqlite
    .prepare(
      `SELECT unit.value unit FROM invoice_line line JOIN invoice ON invoice.id=line.invoice_id,
              json_each(line.snapshot_json,'$.extraUnits') unit
        WHERE invoice.project_id=? AND invoice.id<>? AND invoice.state NOT IN ('void','cancelled','superseded')
          AND line.source_type='billing_adjustment'
          AND json_extract(line.snapshot_json,'$.extraKind')=?
          AND json_extract(line.snapshot_json,'$.extraBasis')=?
          AND json_extract(line.snapshot_json,'$.workerId')=?`,
    )
    .all(projectId, invoiceId, kind, basis, workerId) as Array<{ unit: string }>;
  return new Set(rows.map((row) => String(row.unit)));
}

function finishCharges(
  buckets: Map<string, Bucket>,
  skip: (bucket: Bucket) => Set<string>,
): ExtraCharge[] {
  const charges: ExtraCharge[] = [];
  for (const bucket of buckets.values()) {
    const done = skip(bucket);
    const units = [...bucket.units].filter((unit) => !done.has(unit)).sort();
    if (!units.length) continue;
    charges.push({
      kind: bucket.kind,
      basis: bucket.basis,
      workerId: bucket.workerId,
      projectMemberId: bucket.extras.projectMemberId,
      extraId: bucket.extras.id,
      extraVersion: bucket.extras.version,
      currency: bucket.extras.currency,
      rateMinor: bucket.rate,
      units,
      amountMinor: bucket.rate * BigInt(units.length),
    });
  }
  return charges.sort(
    (a, b) =>
      a.workerId.localeCompare(b.workerId) ||
      a.kind.localeCompare(b.kind) ||
      a.units[0]!.localeCompare(b.units[0]!),
  );
}

/**
 * Client side: per diem and allowance to bill for the given worked days. A day (or, for a
 * monthly allowance, the calendar month of a worked day) is charged once: units already on
 * another live invoice are left out, so a refreshed draft or a later invoice never bills them
 * twice.
 */
export function clientExtraCharges(
  sqlite: DatabaseSync,
  input: Readonly<{
    projectId: string;
    invoiceId: string;
    workedDays: ReadonlyArray<Readonly<{ workerId: string; date: string }>>;
  }>,
): ExtraCharge[] {
  const resolver = new AssignmentExtrasResolver(sqlite, input.projectId);
  if (resolver.none) return [];
  const buckets = new Map<string, Bucket>();
  const days = [...input.workedDays].sort(
    (x, y) => x.date.localeCompare(y.date) || x.workerId.localeCompare(y.workerId),
  );
  for (const day of days) {
    const extras = resolver.on(day.workerId, day.date);
    if (!extras) continue;
    addUnit(buckets, 'per_diem', 'day', day.workerId, extras, extras.perDiemClientMinor, day.date);
    if (extras.allowanceBasis)
      addUnit(
        buckets,
        'allowance',
        extras.allowanceBasis,
        day.workerId,
        extras,
        extras.allowanceClientMinor,
        extras.allowanceBasis === 'month' ? day.date.slice(0, 7) : day.date,
      );
  }
  const cache = new Map<string, Set<string>>();
  return finishCharges(buckets, (bucket) => {
    const key = [bucket.workerId, bucket.kind, bucket.basis].join('\u0000');
    let done = cache.get(key);
    if (!done) {
      done = billedUnits(
        sqlite,
        input.projectId,
        input.invoiceId,
        bucket.workerId,
        bucket.kind,
        bucket.basis,
      );
      cache.set(key, done);
    }
    return done;
  });
}

/**
 * Worker side: per diem and allowance earned on the given worked days. `skipMonths` lists
 * calendar months whose monthly allowance is paid elsewhere (another settlement).
 */
export function workerExtraCharges(
  sqlite: DatabaseSync,
  input: Readonly<{
    projectId: string;
    workerId: string;
    days: readonly string[];
    skipMonths?: ReadonlySet<string>;
  }>,
): ExtraCharge[] {
  const resolver = new AssignmentExtrasResolver(sqlite, input.projectId);
  if (resolver.none) return [];
  const buckets = new Map<string, Bucket>();
  for (const date of [...new Set(input.days)].sort()) {
    const extras = resolver.on(input.workerId, date);
    if (!extras) continue;
    addUnit(buckets, 'per_diem', 'day', input.workerId, extras, extras.perDiemWorkerMinor, date);
    if (extras.allowanceBasis)
      addUnit(
        buckets,
        'allowance',
        extras.allowanceBasis,
        input.workerId,
        extras,
        extras.allowanceWorkerMinor,
        extras.allowanceBasis === 'month' ? date.slice(0, 7) : date,
      );
  }
  const skip = input.skipMonths ?? new Set<string>();
  return finishCharges(buckets, (bucket) => (bucket.basis === 'month' ? new Set(skip) : new Set()));
}

/** Plain English invoice text (the PDF localizes it from the snapshot). */
export function extraChargeDescription(charge: ExtraCharge, workerName: string): string {
  const label = charge.kind === 'per_diem' ? 'Per diem' : 'Safety allowance';
  const first = charge.units[0]!;
  const last = charge.units[charge.units.length - 1]!;
  const count = charge.units.length;
  const what =
    charge.basis === 'month'
      ? `${count} ${count === 1 ? 'month' : 'months'} (${first === last ? first : `${first} to ${last}`})`
      : `${count} ${count === 1 ? 'day' : 'days'} (${first === last ? first : `${first} to ${last}`})`;
  return [label, workerName || null, what].filter(Boolean).join(' · ');
}

/** Snapshot stored on the invoice line (also the input of the PDF description). */
export function extraChargeSnapshot(charge: ExtraCharge, projectId: string) {
  return {
    projectId,
    workerId: charge.workerId,
    projectMemberId: charge.projectMemberId,
    assignmentExtraId: charge.extraId,
    assignmentExtraVersion: charge.extraVersion,
    extraKind: charge.kind,
    extraBasis: charge.basis,
    extraUnit: charge.basis === 'month' ? 'monthly' : 'daily',
    extraUnits: charge.units,
    rateMinor: charge.rateMinor.toString(),
    amountMinor: charge.amountMinor.toString(),
  };
}

/** A real calendar day as YYYY-MM-DD. */
function calendarDate(value: string): string {
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) throw new ValidationError('Choose a valid start date');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text)
    throw new ValidationError('Choose a valid start date');
  return text;
}

function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function minor(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!/^\d{1,12}$/u.test(String(value)))
    throw new ValidationError(`${field} must be an exact amount`);
  const amount = BigInt(value);
  if (amount > MAX_MINOR) throw new ValidationError(`${field} is too high`);
  return amount.toString();
}

function overtime(value: OvertimeExtra | null | undefined, field: string): OvertimeExtra | null {
  if (!value) return null;
  if (value.method !== 'multiplier' && value.method !== 'rate')
    throw new ValidationError(`${field} must be a rate or a multiplier`);
  const amount = minor(value.value, field);
  if (amount === null) return null;
  if (
    value.method === 'multiplier' &&
    (BigInt(amount) < MIN_MULTIPLIER_BPS || BigInt(amount) > MAX_MULTIPLIER_BPS)
  )
    throw new ValidationError(`${field} multiplier must be between ×1 and ×10`);
  return { method: value.method, value: amount };
}

const EXPENSE_TERMS: Record<
  ExtrasExpenseChoice,
  { workerReimbursement: WorkerReimbursementMode; clientRecovery: ClientRecoveryMode }
> = {
  none: { workerReimbursement: 'none', clientRecovery: 'non_billable' },
  worker: { workerReimbursement: 'at_cost', clientRecovery: 'non_billable' },
  client: { workerReimbursement: 'none', clientRecovery: 'at_cost' },
  both: { workerReimbursement: 'at_cost', clientRecovery: 'at_cost' },
};

type MemberRow = {
  id: string;
  project_id: string;
  user_id: string;
  starts_on: string;
  ends_on: string | null;
  status: string;
  version: number;
  currency: string;
};

export type AssignmentExtrasView = Readonly<{
  projectMemberId: string;
  workerId: string;
  /** The newest version (it may start later than today). */
  extras: AssignmentExtras | null;
  /** The version in force the day before the newest one starts (null: none, or no date). */
  previous: AssignmentExtras | null;
  /** Expense terms this person has today (worker-paid expenses); null: project rules. */
  expenses: ExtrasExpenseChoice | null;
  /** D4: the person's own choice today; null when this person is not a supplier's staff. */
  supplierExpenses: ExtrasSupplierExpenseChoice | null;
}>;

/** Owner / Finance only: extras carry client rates and worker pay. */
export class AssignmentExtrasRepository {
  constructor(private readonly sqlite: DatabaseSync) {}

  private assertFinance(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
    const current = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (
      !canManageBilling(principal) ||
      !current ||
      current.status !== 'active' ||
      !['owner_admin', 'finance_admin'].includes(current.role)
    )
      throw new AccessDeniedError('Owner or Finance role required');
  }

  private member(projectMemberId: string): MemberRow {
    const row = this.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.user_id,pm.starts_on,pm.ends_on,pm.status,pm.version,p.currency
           FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.id=?`,
      )
      .get(projectMemberId) as MemberRow | undefined;
    if (!row) throw new ValidationError('Assignment not found');
    return row;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private expenseChoice(member: MemberRow): ExtrasExpenseChoice | null {
    const on = member.starts_on > this.today() ? member.starts_on : this.today();
    const policy = this.sqlite
      .prepare(
        `SELECT worker_reimbursement,client_recovery FROM assignment_expense_policy
          WHERE project_member_id=? AND payer='worker' AND category IS NULL AND effective_from<=?
            AND (effective_to IS NULL OR effective_to>=?)
          ORDER BY effective_from DESC,version DESC LIMIT 1`,
      )
      .get(member.id, on, on) as
      | { worker_reimbursement: string; client_recovery: string }
      | undefined;
    if (!policy) return null;
    const worker = policy.worker_reimbursement === 'at_cost';
    const client = ['at_cost', 'markup'].includes(policy.client_recovery);
    return worker && client ? 'both' : worker ? 'worker' : client ? 'client' : 'none';
  }

  private view(member: MemberRow): AssignmentExtrasView {
    const versions = assignmentExtrasVersions(this.sqlite, member.id);
    const latest = versions[0] ?? null;
    return {
      projectMemberId: member.id,
      workerId: member.user_id,
      extras: latest,
      previous: latest?.effectiveFrom
        ? versionOn(versions.slice(1), previousDay(latest.effectiveFrom))
        : null,
      expenses: this.expenseChoice(member),
      supplierExpenses: this.supplierExpenseChoice(member),
    };
  }

  private supplierExpenseChoice(member: MemberRow): ExtrasSupplierExpenseChoice | null {
    if (!hasSupplierExpenseRules(this.sqlite) || !supplierOfUser(this.sqlite, member.user_id))
      return null;
    const on = member.starts_on > this.today() ? member.starts_on : this.today();
    const row = this.sqlite
      .prepare(
        `SELECT carrier FROM supplier_expense_rule WHERE project_id=? AND project_member_id=?
            AND effective_from<=? ORDER BY effective_from DESC,version DESC LIMIT 1`,
      )
      .get(member.project_id, member.id, on) as { carrier: SupplierExpenseCarrier | null } | undefined;
    return row?.carrier ?? 'project';
  }

  get(principal: Principal, projectMemberId: string): AssignmentExtrasView {
    this.assertFinance(principal);
    return this.view(this.member(projectMemberId));
  }

  listForProject(principal: Principal, projectId: string): AssignmentExtrasView[] {
    this.assertFinance(principal);
    const members = this.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.user_id,pm.starts_on,pm.ends_on,pm.status,pm.version,p.currency
           FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.project_id=?
          ORDER BY pm.starts_on,pm.id`,
      )
      .all(projectId) as MemberRow[];
    return members.map((member) => this.view(member));
  }

  /**
   * Save the extras of one assignment as a new version (audited). Unchanged extras write
   * nothing. The expense choice reuses the assignment expense policy and the person's
   * reimbursement preference, starting today (or on the assignment's first day).
   */
  set(principal: Principal, input: AssignmentExtrasInput): AssignmentExtrasView {
    this.assertFinance(principal);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
      throw new ValidationError('Current extras version required');
    const perDiemClient = minor(input.perDiemClientMinor, 'Per diem billed to the client');
    const perDiemWorker = minor(input.perDiemWorkerMinor, 'Per diem paid to the worker');
    const allowanceClient = minor(input.allowanceClientMinor, 'Allowance billed to the client');
    const allowanceWorker = minor(input.allowanceWorkerMinor, 'Allowance paid to the worker');
    const basis = input.allowanceBasis ?? null;
    if (basis !== null && basis !== 'day' && basis !== 'month')
      throw new ValidationError('Allowance must be per day or per month');
    if ((allowanceClient !== null || allowanceWorker !== null) && basis === null)
      throw new ValidationError('Choose whether the allowance is per day or per month');
    const allowanceBasis = allowanceClient === null && allowanceWorker === null ? null : basis;
    const overtimeClient = overtime(input.overtimeClient, 'Overtime billed to the client');
    const overtimeWorker = overtime(input.overtimeWorker, 'Overtime paid to the worker');
    if (
      input.expenses !== undefined &&
      !['none', 'worker', 'client', 'both'].includes(input.expenses)
    )
      throw new ValidationError('Expense choice is invalid');
    if (
      input.supplierExpenses !== undefined &&
      !['project', 'ja', 'supplier'].includes(input.supplierExpenses)
    )
      throw new ValidationError('Choose who pays this technician’s expenses');
    const reason =
      typeof input.reason === 'string' && input.reason.trim()
        ? input.reason.trim().slice(0, 2000)
        : null;
    const requestedFrom =
      input.effectiveFrom === undefined ||
      input.effectiveFrom === null ||
      input.effectiveFrom === ''
        ? null
        : calendarDate(input.effectiveFrom);
    return runImmediateTransaction(this.sqlite, 'assignment-extras', () => {
      const member = this.member(input.projectMemberId);
      if (member.status !== 'active')
        throw new ValidationError('Active project assignment required');
      if (requestedFrom && member.ends_on && requestedFrom > member.ends_on)
        throw new ValidationError('The start date of the new values is after this assignment ends');
      // On or before the first day of the assignment: the values apply from its start.
      const effectiveFrom =
        requestedFrom === null || requestedFrom <= member.starts_on ? null : requestedFrom;
      const versions = assignmentExtrasVersions(this.sqlite, member.id);
      const current = versions[0] ?? null;
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictError('Extras changed. Reload before saving.');
      const sameAs = (extras: AssignmentExtras | null) =>
        (extras?.perDiemClientMinor ?? null) === perDiemClient &&
        (extras?.perDiemWorkerMinor ?? null) === perDiemWorker &&
        (extras?.allowanceBasis ?? null) === allowanceBasis &&
        (extras?.allowanceClientMinor ?? null) === allowanceClient &&
        (extras?.allowanceWorkerMinor ?? null) === allowanceWorker &&
        JSON.stringify(extras?.overtimeClient ?? null) === JSON.stringify(overtimeClient) &&
        JSON.stringify(extras?.overtimeWorker ?? null) === JSON.stringify(overtimeWorker);
      // Nothing to write when these values are already in force from that day on.
      const same =
        sameAs(current) && sameAs(versionOn(versions, effectiveFrom ?? member.starts_on));
      const nothingNew =
        !current &&
        perDiemClient === null &&
        perDiemWorker === null &&
        allowanceClient === null &&
        allowanceWorker === null &&
        !overtimeClient &&
        !overtimeWorker;
      if (!same && !nothingNew) {
        const id = newId();
        const version = (current?.version ?? 0) + 1;
        this.sqlite
          .prepare(
            `INSERT INTO assignment_extra(id,project_member_id,version,currency,per_diem_client_minor,
               per_diem_worker_minor,allowance_basis,allowance_client_minor,allowance_worker_minor,
               overtime_client_method,overtime_client_value,overtime_worker_method,overtime_worker_value,
               reason,effective_from,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            member.id,
            version,
            member.currency,
            perDiemClient,
            perDiemWorker,
            allowanceBasis,
            allowanceClient,
            allowanceWorker,
            overtimeClient?.method ?? null,
            overtimeClient?.value ?? null,
            overtimeWorker?.method ?? null,
            overtimeWorker?.value ?? null,
            reason,
            effectiveFrom,
            principal.userId,
            new Date().toISOString(),
          );
        projectsWithExtras.get(this.sqlite)?.delete(member.project_id);
        recordAuditEvent(
          this.sqlite,
          principal,
          'assignment.extras_set',
          'project_member',
          member.id,
          {
            projectId: member.project_id,
            workerId: member.user_id,
            assignmentExtraId: id,
            version,
            currency: member.currency,
            effectiveFrom: effectiveFrom ?? member.starts_on,
            before: current
              ? {
                  perDiemClientMinor: current.perDiemClientMinor,
                  perDiemWorkerMinor: current.perDiemWorkerMinor,
                  allowanceBasis: current.allowanceBasis,
                  allowanceClientMinor: current.allowanceClientMinor,
                  allowanceWorkerMinor: current.allowanceWorkerMinor,
                  overtimeClient: current.overtimeClient,
                  overtimeWorker: current.overtimeWorker,
                }
              : null,
            after: {
              perDiemClientMinor: perDiemClient,
              perDiemWorkerMinor: perDiemWorker,
              allowanceBasis,
              allowanceClientMinor: allowanceClient,
              allowanceWorkerMinor: allowanceWorker,
              overtimeClient,
              overtimeWorker,
            },
            ...(reason ? { reason } : {}),
          },
        );
      }
      if (input.expenses !== undefined && input.expenses !== this.expenseChoice(member))
        this.saveExpenseChoice(
          principal,
          member,
          input.expenses,
          effectiveFrom ?? (requestedFrom === null ? this.today() : member.starts_on),
        );
      if (
        input.supplierExpenses !== undefined &&
        input.supplierExpenses !== this.supplierExpenseChoice(member)
      )
        new SupplierExpenseRuleRepository(this.sqlite).setPersonRule(principal, {
          projectMemberId: member.id,
          carrier: input.supplierExpenses === 'project' ? null : input.supplierExpenses,
          effectiveFrom: requestedFrom ?? this.today(),
          reason: 'Assignment extras: who pays the expenses',
        });
      return this.get(principal, member.id);
    });
  }

  private saveExpenseChoice(
    principal: Principal,
    member: MemberRow,
    choice: ExtrasExpenseChoice,
    effectiveFrom: string,
  ) {
    const from = member.starts_on > effectiveFrom ? member.starts_on : effectiveFrom;
    if (member.ends_on && from > member.ends_on)
      throw new ValidationError(
        'This assignment has ended: its expense terms can no longer change',
      );
    const terms = EXPENSE_TERMS[choice];
    const policies = new AssignmentExpensePolicyRepository(this.sqlite);
    const reason = 'Assignment extras: expenses';
    policies.create(principal, {
      projectMemberId: member.id,
      payer: 'worker',
      category: null,
      effectiveFrom: from,
      effectiveTo: member.ends_on,
      workerReimbursement: terms.workerReimbursement,
      clientRecovery: terms.clientRecovery,
      reason,
    });
    // A dated project/assignment reimbursement preference wins over policies: record the
    // person's own choice so the worker side really follows it.
    const version = this.sqlite
      .prepare('SELECT version FROM project_member WHERE id=?')
      .get(member.id) as { version: number };
    policies.setWorkerReimbursementOverride(principal, {
      projectMemberId: member.id,
      expectedVersion: Number(version.version),
      mode: terms.workerReimbursement,
      effectiveFrom: from,
      reason,
    });
  }
}
