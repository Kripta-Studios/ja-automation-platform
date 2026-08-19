import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  billableMinutesForDailyMinimum,
  chooseMostSpecificRate,
  overtimeRate,
  percentageOfEligibleClientLabor,
  type OvertimeMethod,
} from '@ja/billing-engine';
import {
  canManageBilling,
  canReadRecord,
  canReviewProject,
  newId,
  type Principal,
} from '@ja/domain';
import {
  applyBasisPoints,
  divideRounded,
  hourlyRateForMinutes,
  money,
  type Currency,
} from '@ja/money';
import {
  dailyReportInputSchema,
  expenseInputSchema,
  technicalReportInputSchema,
  timeInputSchema,
} from '@ja/schemas';

export class V3AccessDeniedError extends Error {}
export class V3ConflictError extends Error {}
export class V3ValidationError extends Error {}

type DbValue = string | number | bigint | null;
type OutputValue = DbValue | boolean;
type V3Currency = Currency;
type ReportLocale = 'en' | 'pt' | 'es';
type DueJobHandler = (payload: unknown) => void;
type OutboxEvent = Readonly<{
  id: string;
  topic: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: unknown;
  attempts: number;
}>;
type DueOutboxHandler = (event: OutboxEvent) => void | Promise<void>;

const normalizeReportLocale = (value: unknown): ReportLocale =>
  value === 'pt' || value === 'es' ? value : 'en';

type CompensationInput = Readonly<{
  workerId: string;
  projectId?: string;
  currency: V3Currency;
  ruleType:
    | 'Hourly'
    | 'Daily'
    | 'FixedPerBillingPeriod'
    | 'FixedProjectAmount'
    | 'PercentageOfEligibleClientLabor'
    | 'CustomApprovedAdjustment';
  rateMinor?: bigint;
  rateBasis?: 'hourly' | 'daily';
  percentageBps?: number;
  percentageBasis?:
    | 'CLIENT_LABOR_BEFORE_TAX'
    | 'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT'
    | 'ISSUED_ELIGIBLE_LABOR'
    | 'COLLECTED_ELIGIBLE_LABOR';
  settlementTrigger?: 'ON_APPROVED_BILLABLE_LABOR' | 'ON_INVOICE_ISSUE' | 'ON_CLIENT_PAYMENT';
  dailyGuaranteeMinutes?: number;
  overtimeMethod?: OvertimeMethod;
  overtimeMultiplierBps?: number;
  overtimeRateMinor?: bigint;
  weekendMethod?:
    | 'BASE'
    | 'NONE'
    | 'FIXED_RATE'
    | 'BASE_RATE_MULTIPLIER'
    | 'FIXED_ADDITION_PER_HOUR';
  travelMethod?:
    | 'BASE'
    | 'NONE'
    | 'FIXED_RATE'
    | 'BASE_RATE_MULTIPLIER'
    | 'FIXED_ADDITION_PER_HOUR';
  standbyMethod?:
    | 'BASE'
    | 'NONE'
    | 'FIXED_RATE'
    | 'BASE_RATE_MULTIPLIER'
    | 'FIXED_ADDITION_PER_HOUR';
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}>;

type LaborRateInput = Readonly<{
  projectId: string;
  workerId?: string;
  category?: string;
  currency: V3Currency;
  hourlyRateMinor: bigint;
  effectiveFrom: string;
  effectiveTo?: string;
  overtimeMethod?: OvertimeMethod;
  overtimeMultiplierBps?: number;
  overtimeRateMinor?: bigint;
  eligibleForPercentage?: boolean;
  notes?: string;
}>;

type InternalCostInput = Readonly<{
  workerId: string;
  projectId?: string;
  currency: V3Currency;
  hourlyRateMinor: bigint;
  effectiveFrom: string;
  effectiveTo?: string;
  overtimeMethod?: OvertimeMethod;
  overtimeMultiplierBps?: number;
  overtimeRateMinor?: bigint;
  costMethod?: string;
  notes?: string;
}>;

type OverrideInput = Readonly<{
  projectMemberId: string;
  timeCategory?: string;
  activityCode?: string;
  compensationRuleId?: string;
  internalCostRuleId?: string;
  clientLaborRateId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  priority?: number;
}>;

type TechnicalChangeInput = Readonly<{
  projectId: string;
  technicalReportId?: string;
  component: string;
  originalBehavior?: string;
  rootCause?: string;
  changeMade: string;
  reason?: string;
  safetyImpact?: boolean;
  productionImpact?: string;
  validation?: string;
  validationResult?: string;
  openRisk?: string;
  rollbackInformation?: string;
}>;

type TimeRow = {
  id: string;
  project_id: string;
  worker_id: string;
  work_date: string;
  category: string;
  activity_code: string | null;
  minutes: number;
  approval_state: string;
  billability_state: string;
  billing_status?: string;
  invoice_id?: string | null;
  project_currency: V3Currency;
};

type CompensationRuleRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: V3Currency;
  rate_minor: number;
  rate_basis: string;
  daily_guarantee_minutes: number | null;
  rule_type: string;
  percentage_bps: number | null;
  percentage_basis: string | null;
  settlement_trigger: string;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: number | null;
  weekend_method: string;
  travel_method: string;
  standby_method: string;
  effective_from: string;
};

type LaborRateRow = {
  id: string;
  project_id: string;
  worker_id: string | null;
  category: string | null;
  currency: V3Currency;
  hourly_rate_minor: number;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: number | null;
  eligible_for_percentage: number;
  effective_from: string;
};

type InternalCostRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: V3Currency;
  hourly_rate_minor: number;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: number | null;
  effective_from: string;
};

type SettlementBasis =
  | 'CLIENT_LABOR_BEFORE_TAX'
  | 'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT'
  | 'ISSUED_ELIGIBLE_LABOR'
  | 'COLLECTED_ELIGIBLE_LABOR';

const timestamp = (): string => new Date().toISOString();
const isoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));

function requireDate(value: string, field: string): void {
  if (!isoDate(value)) throw new V3ValidationError(`${field} must be an ISO date`);
}

function requireText(value: string, field: string, max = 5000): string {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new V3ValidationError(`${field} is required`);
  return clean;
}

function sqliteInteger(value: bigint, field: string): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) throw new V3ValidationError(`${field} is out of range`);
  return numberValue;
}

function isPendingApproval(value: string): boolean {
  return value === 'draft' || value === 'submitted' || value === 'needs_changes';
}

function isBusyError(error: unknown): boolean {
  return (
    error instanceof Error && /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(error.message)
  );
}

function logBusyRetry(attempt: number): void {
  if (process.env.NODE_ENV === 'production' || process.env.JA_JSON_LOGS === 'true')
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event: 'database.busy_retry',
        repository: 'v3',
        attempt,
      }),
    );
}

const auditSecretKey = /password|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token/i;
function redactAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactAudit(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        auditSecretKey.test(key) ? '[REDACTED]' : redactAudit(item),
      ]),
    );
  return value;
}

export class V3Repository {
  private readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  private transaction<T>(work: () => T): T {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let began = false;
      try {
        this.sqlite.exec('BEGIN IMMEDIATE');
        began = true;
        const value = work();
        this.sqlite.exec('COMMIT');
        return value;
      } catch (error) {
        if (began) {
          try {
            this.sqlite.exec('ROLLBACK');
          } catch {
            // Preserve the original transaction error.
          }
        }
        if (isBusyError(error) && attempt < 3) {
          logBusyRetry(attempt);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Transaction retry limit reached');
  }

  private assertActive(principal: Principal): void {
    const user = this.sqlite.prepare('SELECT status FROM user WHERE id=?').get(principal.userId) as
      | { status: string }
      | undefined;
    if (!user || user.status !== 'active') throw new V3AccessDeniedError('Active account required');
  }

  private assertWritable(principal: Principal): void {
    this.assertActive(principal);
    if (principal.role === 'auditor_read_only') throw new V3AccessDeniedError('Read-only role');
  }

  private assertFinance(principal: Principal): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new V3AccessDeniedError('Finance role required');
  }

  private assertFinanceReadable(principal: Principal): void {
    this.assertActive(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new V3AccessDeniedError('Finance role required');
  }

  private assertStepUp(principal: Principal): void {
    if (process.env.NODE_ENV !== 'production') return;
    if (principal.isServiceActor) return;
    if (!principal.sessionId)
      throw new V3AccessDeniedError('Recent step-up authentication is required');
    const session = this.sqlite
      .prepare('SELECT step_up_at FROM session WHERE id=? AND user_id=? AND expires_at>?')
      .get(principal.sessionId, principal.userId, timestamp()) as
      | { step_up_at: string | null }
      | undefined;
    if (!session?.step_up_at || Date.now() - Date.parse(session.step_up_at) > 10 * 60_000)
      throw new V3AccessDeniedError('Recent step-up authentication is required');
  }

  private assertProjectAccess(principal: Principal, projectId: string, allowAuditor = false): void {
    this.assertActive(principal);
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') return;
    if (allowAuditor && principal.role === 'auditor_read_only') return;
    if (!principal.projectIds.has(projectId))
      throw new V3AccessDeniedError('Project access required');
  }

  private assertOfflineAssignment(
    principal: Principal,
    projectId: string,
    workDate?: string,
  ): void {
    this.assertProjectAccess(principal, projectId);
    const date = workDate ?? new Date().toISOString().slice(0, 10);
    requireDate(date, 'Work date');
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
      )
      .get(projectId, principal.userId, date, date);
    if (!assignment) throw new V3AccessDeniedError('Active project assignment required');
  }

  private audit(
    principal: Principal | null,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ): void {
    const redacted = redactAudit(details) as Record<string, unknown>;
    const projectId = typeof redacted.projectId === 'string' ? redacted.projectId : null;
    const before = redacted.before === undefined ? null : JSON.stringify(redacted.before);
    const after = redacted.after === undefined ? null : JSON.stringify(redacted.after);
    const reason = typeof redacted.reason === 'string' ? redacted.reason : null;
    const correlationId =
      typeof redacted.correlationId === 'string'
        ? redacted.correlationId
        : (principal?.correlationId ?? newId());
    const metadata = JSON.stringify(redacted);
    this.sqlite
      .prepare(
        'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,project_id,before_json,after_json,reason,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        principal?.userId ?? null,
        action,
        entityType,
        entityId,
        timestamp(),
        metadata,
        projectId,
        before,
        after,
        reason,
        correlationId,
        metadata,
      );
  }

  createCompensationRule(principal: Principal, input: CompensationInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    if (input.ruleType === 'PercentageOfEligibleClientLabor') {
      if (
        !Number.isInteger(input.percentageBps) ||
        (input.percentageBps ?? -1) < 0 ||
        (input.percentageBps ?? 10001) > 10000
      )
        throw new V3ValidationError(
          'Percentage compensation requires basis points from 0 to 10000',
        );
      if (!input.percentageBasis) throw new V3ValidationError('Percentage basis is required');
    }
    if (
      [
        'Hourly',
        'Daily',
        'FixedPerBillingPeriod',
        'FixedProjectAmount',
        'CustomApprovedAdjustment',
      ].includes(input.ruleType) &&
      input.rateMinor === undefined
    )
      throw new V3ValidationError('A compensation rate is required for this rule');
    if (
      input.ruleType !== 'PercentageOfEligibleClientLabor' &&
      input.overtimeMethod !== 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME' &&
      input.percentageBps !== undefined
    )
      throw new V3ValidationError('Percentage basis points are only valid for percentage rules');
    if (
      input.dailyGuaranteeMinutes !== undefined &&
      (!Number.isInteger(input.dailyGuaranteeMinutes) ||
        input.dailyGuaranteeMinutes < 0 ||
        input.dailyGuaranteeMinutes > 1440)
    )
      throw new V3ValidationError('Daily guarantee must be between 0 and 1440 minutes');
    if (
      input.overtimeMultiplierBps !== undefined &&
      (!Number.isInteger(input.overtimeMultiplierBps) || input.overtimeMultiplierBps < 0)
    )
      throw new V3ValidationError('Overtime multiplier is invalid');
    if (input.rateMinor !== undefined && input.rateMinor < 0n)
      throw new V3ValidationError('Rate cannot be negative');
    if (input.overtimeMethod === 'FIXED_RATE' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A fixed overtime rate is required');
    if (input.overtimeMethod === 'FIXED_ADDITION_PER_HOUR' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A fixed overtime addition is required');
    if (
      input.overtimeMethod === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME' &&
      input.percentageBps === undefined
    )
      throw new V3ValidationError('Overtime percentage basis points are required');
    const worker = this.sqlite
      .prepare("SELECT 1 FROM user WHERE id=? AND status IN ('active','invited')")
      .get(input.workerId);
    if (!worker) throw new V3ValidationError('Worker not found');
    if (input.projectId) {
      this.assertProjectAccess(principal, input.projectId);
      const project = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: V3Currency } | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      if (project.currency !== input.currency)
        throw new V3ValidationError('Compensation currency must match the project currency');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO compensation_rule(
          id,worker_id,project_id,currency,rate_minor,rate_basis,daily_guarantee_minutes,
          worker_visible,effective_from,effective_to,created_at,updated_at,rule_type,
          percentage_bps,percentage_basis,settlement_trigger,overtime_method,
          overtime_multiplier_bps,overtime_rate_minor,weekend_method,travel_method,standby_method,
          fixed_period_minor,fixed_project_minor,notes
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        sqliteInteger(input.rateMinor ?? 0n, 'Compensation rate'),
        input.rateBasis ?? (input.ruleType === 'Daily' ? 'daily' : 'hourly'),
        input.dailyGuaranteeMinutes ?? null,
        1,
        input.effectiveFrom,
        input.effectiveTo ?? null,
        now,
        now,
        input.ruleType,
        input.percentageBps ?? null,
        input.percentageBasis ?? null,
        input.settlementTrigger ?? 'ON_APPROVED_BILLABLE_LABOR',
        input.overtimeMethod ?? 'NONE',
        input.overtimeMultiplierBps ?? null,
        input.overtimeRateMinor === undefined
          ? null
          : sqliteInteger(input.overtimeRateMinor, 'Overtime rate'),
        input.weekendMethod ?? 'BASE',
        input.travelMethod ?? 'BASE',
        input.standbyMethod ?? 'BASE',
        input.ruleType === 'FixedPerBillingPeriod'
          ? sqliteInteger(input.rateMinor ?? 0n, 'Fixed period amount')
          : null,
        input.ruleType === 'FixedProjectAmount'
          ? sqliteInteger(input.rateMinor ?? 0n, 'Fixed project amount')
          : null,
        input.notes ?? null,
      );
    this.audit(principal, 'compensation_rule.create', 'compensation_rule', id, {
      workerId: input.workerId,
      projectId: input.projectId ?? null,
      ruleType: input.ruleType,
    });
    return { id };
  }

  createInvitation(
    principal: Principal,
    input: Readonly<{
      email: string;
      role: 'owner_admin' | 'finance_admin' | 'project_manager' | 'worker' | 'auditor_read_only';
      expiresInDays?: number;
    }>,
  ): { id: string; token: string; expiresAt: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (principal.role !== 'owner_admin')
      throw new V3AccessDeniedError('Owner role required to invite users');
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new V3ValidationError('Invitation email is invalid');
    const expiresInDays = input.expiresInDays ?? 7;
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 14)
      throw new V3ValidationError('Invitation expiry must be 1 to 14 days');
    const existing = this.sqlite
      .prepare(
        "SELECT id FROM user WHERE lower(email)=? AND status NOT IN ('offboarded','suspended')",
      )
      .get(email);
    if (existing) throw new V3ConflictError('An active or pending account already uses this email');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const id = newId();
    const now = timestamp();
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
    this.sqlite
      .prepare(
        'INSERT INTO invitation(id,email,token_hash,role,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, email, tokenHash, input.role, principal.userId, expiresAt, now);
    this.sqlite
      .prepare(
        'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        'invitation.created',
        id,
        `invitation:${id}`,
        JSON.stringify({ invitationId: id, email, role: input.role, expiresAt }),
        now,
        now,
      );
    this.audit(principal, 'invitation.create', 'invitation', id, {
      email,
      role: input.role,
      expiresAt,
    });
    return { id, token, expiresAt };
  }

  createClientLaborRate(principal: Principal, input: LaborRateInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    this.assertProjectAccess(principal, input.projectId);
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    if (input.hourlyRateMinor < 0n) throw new V3ValidationError('Client rate cannot be negative');
    if (input.overtimeMultiplierBps !== undefined && input.overtimeMultiplierBps < 0)
      throw new V3ValidationError('Client overtime multiplier is invalid');
    if (input.overtimeRateMinor !== undefined && input.overtimeRateMinor < 0n)
      throw new V3ValidationError('Client overtime rate is invalid');
    if (input.overtimeMethod === 'FIXED_RATE' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A client fixed overtime rate is required');
    if (input.overtimeMethod === 'FIXED_ADDITION_PER_HOUR' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A client overtime addition is required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: V3Currency } | undefined;
    if (!project) throw new V3ValidationError('Project not found');
    if (project.currency !== input.currency)
      throw new V3ValidationError('Client rate currency must match the project currency');
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO client_labor_rate(
          id,project_id,worker_id,category,currency,hourly_rate_minor,effective_from,effective_to,
          created_at,updated_at,rate_basis,overtime_method,overtime_multiplier_bps,
          overtime_rate_minor,eligible_for_percentage,notes
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        input.workerId ?? null,
        input.category ?? null,
        input.currency,
        sqliteInteger(input.hourlyRateMinor, 'Client rate'),
        input.effectiveFrom,
        input.effectiveTo ?? null,
        now,
        now,
        'hourly',
        input.overtimeMethod ?? 'BASE_RATE_MULTIPLIER',
        input.overtimeMultiplierBps ?? 10_000,
        input.overtimeRateMinor === undefined
          ? null
          : sqliteInteger(input.overtimeRateMinor, 'Client overtime rate'),
        input.eligibleForPercentage === false ? 0 : 1,
        input.notes ?? null,
      );
    this.audit(principal, 'client_rate.create', 'client_labor_rate', id, {
      projectId: input.projectId,
      workerId: input.workerId ?? null,
      category: input.category ?? null,
    });
    return { id };
  }

  createInternalCostRule(principal: Principal, input: InternalCostInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (input.projectId) this.assertProjectAccess(principal, input.projectId);
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    if (input.hourlyRateMinor < 0n) throw new V3ValidationError('Internal cost cannot be negative');
    if (input.overtimeMultiplierBps !== undefined && input.overtimeMultiplierBps < 0)
      throw new V3ValidationError('Internal overtime multiplier is invalid');
    if (input.overtimeRateMinor !== undefined && input.overtimeRateMinor < 0n)
      throw new V3ValidationError('Internal overtime rate is invalid');
    if (input.overtimeMethod === 'FIXED_RATE' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A fixed internal overtime rate is required');
    if (input.overtimeMethod === 'FIXED_ADDITION_PER_HOUR' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('An internal overtime addition is required');
    if (input.projectId) {
      const project = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: V3Currency } | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      if (project.currency !== input.currency)
        throw new V3ValidationError('Internal cost currency must match the project currency');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO internal_cost_rule(
          id,worker_id,project_id,currency,hourly_rate_minor,effective_from,effective_to,
          created_at,updated_at,overtime_method,overtime_multiplier_bps,overtime_rate_minor,
          cost_method,notes
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        sqliteInteger(input.hourlyRateMinor, 'Internal cost rate'),
        input.effectiveFrom,
        input.effectiveTo ?? null,
        now,
        now,
        input.overtimeMethod ?? 'BASE_RATE_MULTIPLIER',
        input.overtimeMultiplierBps ?? 10_000,
        input.overtimeRateMinor === undefined
          ? null
          : sqliteInteger(input.overtimeRateMinor, 'Internal overtime rate'),
        input.costMethod ?? 'loaded_hourly',
        input.notes ?? null,
      );
    this.audit(principal, 'internal_cost.create', 'internal_cost_rule', id, {
      workerId: input.workerId,
      projectId: input.projectId ?? null,
    });
    return { id };
  }

  createAssignmentRateOverride(principal: Principal, input: OverrideInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const assignment = this.sqlite
      .prepare("SELECT project_id,user_id FROM project_member WHERE id=? AND status='active'")
      .get(input.projectMemberId) as { project_id: string; user_id: string } | undefined;
    if (!assignment) throw new V3ValidationError('Active project assignment not found');
    this.assertProjectAccess(principal, assignment.project_id);
    const compensation = input.compensationRuleId
      ? (this.sqlite
          .prepare('SELECT worker_id,project_id FROM compensation_rule WHERE id=?')
          .get(input.compensationRuleId) as
          | { worker_id: string; project_id: string | null }
          | undefined)
      : undefined;
    const internal = input.internalCostRuleId
      ? (this.sqlite
          .prepare('SELECT worker_id,project_id FROM internal_cost_rule WHERE id=?')
          .get(input.internalCostRuleId) as
          | { worker_id: string; project_id: string | null }
          | undefined)
      : undefined;
    const client = input.clientLaborRateId
      ? (this.sqlite
          .prepare('SELECT project_id,worker_id FROM client_labor_rate WHERE id=?')
          .get(input.clientLaborRateId) as
          | { project_id: string; worker_id: string | null }
          | undefined)
      : undefined;
    if (
      (input.compensationRuleId &&
        (!compensation ||
          compensation.worker_id !== assignment.user_id ||
          (compensation.project_id !== null &&
            compensation.project_id !== assignment.project_id))) ||
      (input.internalCostRuleId &&
        (!internal ||
          internal.worker_id !== assignment.user_id ||
          (internal.project_id !== null && internal.project_id !== assignment.project_id))) ||
      (input.clientLaborRateId &&
        (!client ||
          client.project_id !== assignment.project_id ||
          (client.worker_id !== null && client.worker_id !== assignment.user_id)))
    )
      throw new V3ValidationError('Rate override references an unavailable rule');
    if (!input.compensationRuleId && !input.internalCostRuleId && !input.clientLaborRateId)
      throw new V3ValidationError('At least one rate rule is required');
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO assignment_rate_override(
          id,project_member_id,time_category,activity_code,compensation_rule_id,
          internal_cost_rule_id,client_labor_rate_id,effective_from,effective_to,
          priority,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectMemberId,
        input.timeCategory ?? null,
        input.activityCode ?? null,
        input.compensationRuleId ?? null,
        input.internalCostRuleId ?? null,
        input.clientLaborRateId ?? null,
        input.effectiveFrom,
        input.effectiveTo ?? null,
        input.priority ?? 0,
        now,
        now,
      );
    this.audit(principal, 'assignment_rate_override.create', 'assignment_rate_override', id, input);
    return { id };
  }

  createTechnicalChange(
    principal: Principal,
    input: TechnicalChangeInput,
  ): { id: string; version: number } {
    this.assertWritable(principal);
    this.assertProjectAccess(principal, input.projectId);
    const component = requireText(input.component, 'Component', 200);
    const changeMade = requireText(input.changeMade, 'Change made');
    if (input.safetyImpact && (!input.validation?.trim() || !input.rollbackInformation?.trim()))
      throw new V3ValidationError(
        'Safety-impacting changes require validation and rollback information',
      );
    if (input.technicalReportId) {
      const report = this.sqlite
        .prepare('SELECT project_id FROM technical_report WHERE id=?')
        .get(input.technicalReportId) as { project_id: string } | undefined;
      if (!report || report.project_id !== input.projectId)
        throw new V3ValidationError('Technical report does not belong to the project');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO technical_change(
          id,project_id,technical_report_id,author_id,component,original_behavior,root_cause,
          change_made,reason,safety_impact,production_impact,validation,validation_result,
          open_risk,rollback_information,approval_state,created_at,updated_at,version
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        input.technicalReportId || null,
        principal.userId,
        component,
        input.originalBehavior ?? null,
        input.rootCause ?? null,
        changeMade,
        input.reason ?? null,
        input.safetyImpact ? 1 : 0,
        input.productionImpact ?? null,
        input.validation ?? null,
        input.validationResult ?? null,
        input.openRisk ?? null,
        input.rollbackInformation ?? null,
        'draft',
        now,
        now,
        1,
      );
    this.audit(principal, 'technical_change.create', 'technical_change', id, {
      projectId: input.projectId,
      safetyImpact: Boolean(input.safetyImpact),
    });
    return { id, version: 1 };
  }

  submitTechnicalChange(principal: Principal, id: string, version: number): void {
    this.assertWritable(principal);
    const result = this.sqlite
      .prepare(
        "UPDATE technical_change SET approval_state='submitted',updated_at=?,version=version+1 WHERE id=? AND author_id=? AND approval_state IN ('draft','needs_changes') AND version=?",
      )
      .run(timestamp(), id, principal.userId, version);
    if (result.changes !== 1)
      throw new V3ConflictError('Technical change changed or cannot be submitted');
    this.audit(principal, 'technical_change.submit', 'technical_change', id, { version });
  }

  reviewTechnicalChange(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ): void {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare(
        'SELECT project_id,author_id,approval_state,safety_impact,validation,rollback_information FROM technical_change WHERE id=?',
      )
      .get(id) as
      | {
          project_id: string;
          author_id: string;
          approval_state: string;
          safety_impact: number;
          validation: string | null;
          rollback_information: string | null;
        }
      | undefined;
    if (!row) throw new V3ValidationError('Technical change not found');
    if (!canReviewProject(principal, row.project_id))
      throw new V3AccessDeniedError('Technical change review required');
    if (row.approval_state !== 'submitted')
      throw new V3ConflictError('Technical change is not submitted');
    if (decision !== 'approved' && !reason?.trim())
      throw new V3ValidationError('A review reason is required');
    if (
      decision === 'approved' &&
      row.safety_impact === 1 &&
      (!row.validation?.trim() || !row.rollback_information?.trim())
    )
      throw new V3ValidationError(
        'Safety-impacting changes cannot be approved without validation and rollback information',
      );
    const now = timestamp();
    this.transaction(() => {
      this.sqlite
        .prepare(
          "UPDATE technical_change SET approval_state=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='submitted'",
        )
        .run(decision, now, id);
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'technical_change',
          id,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          now,
        );
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), row.author_id, `technical_change_${decision}`, id, now);
      this.audit(principal, `technical_change.${decision}`, 'technical_change', id, {
        reason: reason ?? null,
        safetyImpact: Boolean(row.safety_impact),
      });
    });
  }

  listTechnicalChanges(principal: Principal, queue = false) {
    this.assertActive(principal);
    if (queue && principal.role !== 'owner_admin' && principal.role !== 'project_manager')
      throw new V3AccessDeniedError('Technical change review required');
    const conditions = queue ? ["tc.approval_state='submitted'"] : [];
    const values: string[] = [];
    if (principal.role === 'project_manager') {
      const projectIds = [...principal.projectIds];
      if (projectIds.length === 0) return [];
      conditions.push(`tc.project_id IN (${projectIds.map(() => '?').join(',')})`);
      values.push(...projectIds);
    } else if (principal.role === 'worker') {
      conditions.push('tc.author_id=?');
      values.push(principal.userId);
    }
    const rows = this.sqlite
      .prepare(
        `SELECT tc.id,tc.project_id,tc.technical_report_id,tc.author_id,tc.component,
                tc.change_made,tc.safety_impact,tc.production_impact,tc.validation,
                tc.validation_result,tc.open_risk,tc.rollback_information,tc.approval_state,
                tc.created_at,tc.updated_at,tc.version,p.project_number,p.name project_name,u.name author_name
         FROM technical_change tc JOIN project p ON p.id=tc.project_id JOIN user u ON u.id=tc.author_id
         WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ORDER BY tc.created_at DESC LIMIT 200`,
      )
      .all(...values) as Array<{
      project_id: string;
      author_id: string;
      [key: string]: unknown;
    }>;
    return rows;
  }

  private assignmentId(projectId: string, workerId: string, workDate: string): string | null {
    const row = this.sqlite
      .prepare(
        "SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on DESC LIMIT 1",
      )
      .get(projectId, workerId, workDate, workDate) as { id: string } | undefined;
    return row?.id ?? null;
  }

  private compensationRuleFor(
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): CompensationRuleRow | null {
    const assignmentId = this.assignmentId(projectId, workerId, workDate);
    if (assignmentId) {
      const override = this.sqlite
        .prepare(
          `SELECT compensation_rule_id
           FROM assignment_rate_override
           WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
              AND (activity_code=? OR activity_code IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (time_category IS NOT NULL) DESC, (activity_code IS NOT NULL) DESC,
                    priority DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(assignmentId, category, activityCode ?? null, workDate, workDate) as
        | { compensation_rule_id: string | null }
        | undefined;
      if (override?.compensation_rule_id) {
        const specific = this.sqlite
          .prepare(
            'SELECT * FROM compensation_rule WHERE id=? AND worker_id=? AND (project_id=? OR project_id IS NULL) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)',
          )
          .get(override.compensation_rule_id, workerId, projectId, workDate, workDate) as
          | CompensationRuleRow
          | undefined;
        if (specific) return specific;
      }
    }
    return (
      (this.sqlite
        .prepare(
          `SELECT * FROM compensation_rule
           WHERE worker_id=? AND (project_id=? OR project_id IS NULL)
             AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (project_id IS NOT NULL) DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(workerId, projectId, workDate, workDate) as CompensationRuleRow | undefined) ?? null
    );
  }

  private clientRateFor(
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): LaborRateRow | null {
    const assignmentId = this.assignmentId(projectId, workerId, workDate);
    if (assignmentId) {
      const override = this.sqlite
        .prepare(
          `SELECT client_labor_rate_id
           FROM assignment_rate_override
           WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
              AND (activity_code=? OR activity_code IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (time_category IS NOT NULL) DESC, (activity_code IS NOT NULL) DESC,
                    priority DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(assignmentId, category, activityCode ?? null, workDate, workDate) as
        | { client_labor_rate_id: string | null }
        | undefined;
      if (override?.client_labor_rate_id) {
        const specific = this.sqlite
          .prepare(
            'SELECT * FROM client_labor_rate WHERE id=? AND project_id=? AND (worker_id=? OR worker_id IS NULL) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)',
          )
          .get(override.client_labor_rate_id, projectId, workerId, workDate, workDate) as
          | LaborRateRow
          | undefined;
        if (specific) return specific;
      }
    }
    const candidates = this.sqlite
      .prepare(
        `SELECT * FROM client_labor_rate
         WHERE project_id=? AND (worker_id=? OR worker_id IS NULL)
           AND (category=? OR category IS NULL)
           AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,
      )
      .all(projectId, workerId, category, workDate, workDate) as LaborRateRow[];
    const selected = chooseMostSpecificRate(
      candidates.map((row) => ({
        ...row,
        assignmentSpecific: false,
        workerSpecific: row.worker_id !== null,
        categorySpecific: row.category !== null,
        activitySpecific: false,
        priority: 0,
        effectiveFrom: row.effective_from,
      })),
    );
    return selected ? (selected as unknown as LaborRateRow) : null;
  }

  /**
   * Resolve the effective client rule for a single authoritative time row.
   * Finance authorization and project scope are enforced before returning
   * commercial data. Worker responses must use workerPay(), which strips it.
   */
  resolveClientLaborRate(
    principal: Principal,
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): Readonly<{
    id: string;
    currency: V3Currency;
    hourlyRateMinor: string;
    effectiveRateMinor: string;
    eligibleForPercentage: boolean;
  }> | null {
    this.assertFinanceReadable(principal);
    this.assertProjectAccess(principal, projectId, true);
    const rule = this.clientRateFor(projectId, workerId, category, workDate, activityCode);
    if (!rule) return null;
    return {
      id: rule.id,
      currency: rule.currency,
      hourlyRateMinor: String(rule.hourly_rate_minor),
      effectiveRateMinor: this.clientRateAmount({ category }, rule).toString(),
      eligibleForPercentage: rule.eligible_for_percentage === 1,
    };
  }

  resolveInternalCostRate(
    principal: Principal,
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): Readonly<{
    id: string;
    currency: V3Currency;
    hourlyRateMinor: string;
    effectiveRateMinor: string;
  }> | null {
    this.assertFinanceReadable(principal);
    this.assertProjectAccess(principal, projectId, true);
    const rule = this.internalCostFor(projectId, workerId, category, workDate, activityCode);
    if (!rule) return null;
    return {
      id: rule.id,
      currency: rule.currency,
      hourlyRateMinor: String(rule.hourly_rate_minor),
      effectiveRateMinor: this.internalCostAmount({ category }, rule).toString(),
    };
  }

  private internalCostFor(
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): InternalCostRow | null {
    const assignmentId = this.assignmentId(projectId, workerId, workDate);
    if (assignmentId) {
      const override = this.sqlite
        .prepare(
          `SELECT internal_cost_rule_id
           FROM assignment_rate_override
           WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
              AND (activity_code=? OR activity_code IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (time_category IS NOT NULL) DESC, (activity_code IS NOT NULL) DESC,
                    priority DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(assignmentId, category, activityCode ?? null, workDate, workDate) as
        | { internal_cost_rule_id: string | null }
        | undefined;
      if (override?.internal_cost_rule_id) {
        const specific = this.sqlite
          .prepare(
            'SELECT * FROM internal_cost_rule WHERE id=? AND worker_id=? AND (project_id=? OR project_id IS NULL) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)',
          )
          .get(override.internal_cost_rule_id, workerId, projectId, workDate, workDate) as
          | InternalCostRow
          | undefined;
        if (specific) return specific;
      }
    }
    return (
      (this.sqlite
        .prepare(
          `SELECT * FROM internal_cost_rule
           WHERE worker_id=? AND (project_id=? OR project_id IS NULL)
             AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (project_id IS NOT NULL) DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(workerId, projectId, workDate, workDate) as InternalCostRow | undefined) ?? null
    );
  }

  private clientRateAmount(row: Pick<TimeRow, 'category'>, rate: LaborRateRow): bigint {
    const base = BigInt(rate.hourly_rate_minor);
    if (row.category === 'overtime') {
      if (rate.overtime_method === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME') return base;
      return overtimeRate(base, rate.overtime_method, {
        multiplierBps: rate.overtime_multiplier_bps ?? undefined,
        fixedRateMinor:
          rate.overtime_method === 'FIXED_RATE' && rate.overtime_rate_minor !== null
            ? BigInt(rate.overtime_rate_minor)
            : undefined,
        fixedAdditionMinor:
          rate.overtime_method === 'FIXED_ADDITION_PER_HOUR' && rate.overtime_rate_minor !== null
            ? BigInt(rate.overtime_rate_minor)
            : undefined,
      });
    }
    return base;
  }

  private internalCostAmount(row: Pick<TimeRow, 'category'>, rate: InternalCostRow): bigint {
    const base = BigInt(rate.hourly_rate_minor);
    if (row.category !== 'overtime') return base;
    return overtimeRate(base, rate.overtime_method, {
      multiplierBps: rate.overtime_multiplier_bps ?? undefined,
      fixedRateMinor:
        rate.overtime_method === 'FIXED_RATE' && rate.overtime_rate_minor !== null
          ? BigInt(rate.overtime_rate_minor)
          : undefined,
      fixedAdditionMinor:
        rate.overtime_method === 'FIXED_ADDITION_PER_HOUR' && rate.overtime_rate_minor !== null
          ? BigInt(rate.overtime_rate_minor)
          : undefined,
    });
  }

  private compensationAmount(
    row: TimeRow,
    rule: CompensationRuleRow | null,
    clientRate: LaborRateRow | null,
  ): bigint {
    if (!rule) return 0n;
    const minutes = row.minutes;
    if (rule.rule_type === 'PercentageOfEligibleClientLabor') {
      if (
        !clientRate ||
        clientRate.eligible_for_percentage !== 1 ||
        row.billability_state === 'non_billable'
      )
        return 0n;
      const clientAmount = hourlyRateForMinutes(
        money(row.project_currency, this.clientRateAmount(row, clientRate)),
        minutes,
      ).minorUnits;
      return percentageOfEligibleClientLabor({
        currency: row.project_currency,
        eligibleLaborMinor: clientAmount,
        percentageBps: rule.percentage_bps ?? 0,
      }).minorUnits;
    }
    let rate = BigInt(rule.rate_minor);
    if (row.category === 'overtime') {
      if (rule.overtime_method === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME') {
        if (!clientRate) return 0n;
        const clientAmount = hourlyRateForMinutes(
          money(row.project_currency, this.clientRateAmount(row, clientRate)),
          minutes,
        ).minorUnits;
        return applyBasisPoints(money(row.project_currency, clientAmount), rule.percentage_bps ?? 0)
          .minorUnits;
      }
      rate = overtimeRate(rate, rule.overtime_method, {
        multiplierBps: rule.overtime_multiplier_bps ?? undefined,
        fixedRateMinor:
          rule.overtime_method === 'FIXED_RATE' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
        fixedAdditionMinor:
          rule.overtime_method === 'FIXED_ADDITION_PER_HOUR' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
      });
    }
    const weekend =
      row.category === 'weekend_holiday' ||
      [0, 6].includes(new Date(`${row.work_date}T00:00:00.000Z`).getUTCDay());
    const modifier =
      row.category === 'travel'
        ? rule.travel_method
        : row.category === 'standby'
          ? rule.standby_method
          : weekend
            ? rule.weekend_method
            : 'BASE';
    if (modifier === 'NONE') return 0n;
    if (modifier && modifier !== 'BASE')
      rate = overtimeRate(rate, modifier as OvertimeMethod, {
        multiplierBps: rule.overtime_multiplier_bps ?? undefined,
        fixedRateMinor:
          modifier === 'FIXED_RATE' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
        fixedAdditionMinor:
          modifier === 'FIXED_ADDITION_PER_HOUR' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
      });
    if (rule.rate_basis === 'daily' || rule.rule_type === 'Daily') return 0n;
    if (
      rule.rule_type === 'FixedPerBillingPeriod' ||
      rule.rule_type === 'FixedProjectAmount' ||
      rule.rule_type === 'CustomApprovedAdjustment'
    )
      return 0n;
    return hourlyRateForMinutes(money(rule.currency, rate), minutes).minorUnits;
  }

  /**
   * Convert an approved project period into an auditable compensation
   * settlement. This is a Finance action; workers receive only the resulting
   * status through workerPay/listCompensationSettlements.
   */
  settleCompensation(
    principal: Principal,
    input: Readonly<{
      workerId: string;
      projectId: string;
      periodStart: string;
      periodEnd: string;
    }>,
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    this.assertProjectAccess(principal, input.projectId);
    requireDate(input.periodStart, 'Period start');
    requireDate(input.periodEnd, 'Period end');
    if (input.periodEnd < input.periodStart)
      throw new V3ValidationError('Period end must follow start');
    const worker = this.sqlite
      .prepare("SELECT 1 FROM user WHERE id=? AND status='active'")
      .get(input.workerId);
    if (!worker) throw new V3ValidationError('Active worker not found');
    if (
      !this.sqlite
        .prepare(
          "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
        )
        .get(input.projectId, input.workerId, input.periodEnd, input.periodStart)
    )
      throw new V3ValidationError('Worker is not assigned to the project for this period');
    const rows = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,
                t.approval_state,t.billability_state,p.currency project_currency
         FROM time_entry t JOIN project p ON p.id=t.project_id
         WHERE t.project_id=? AND t.worker_id=? AND t.work_date BETWEEN ? AND ?
           AND t.approval_state IN ('approved','locked')
         ORDER BY t.work_date,t.id`,
      )
      .all(input.projectId, input.workerId, input.periodStart, input.periodEnd) as TimeRow[];
    const byRule = new Map<
      string,
      {
        rule: CompensationRuleRow;
        sourceAmount: bigint;
        amount: bigint;
        currency: V3Currency;
        percentage: boolean;
      }
    >();
    for (const row of rows) {
      const rule = this.compensationRuleFor(
        input.projectId,
        input.workerId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      if (!rule) throw new V3ValidationError(`Missing compensation rule for ${row.id}`);
      if (rule.currency !== row.project_currency)
        throw new V3ValidationError(`Compensation currency mismatch for ${row.id}`);
      if (
        rule.rule_type === 'FixedProjectAmount' &&
        this.sqlite
          .prepare(
            "SELECT 1 FROM compensation_settlement WHERE worker_id=? AND project_id=? AND compensation_rule_id=? AND state='settled' LIMIT 1",
          )
          .get(input.workerId, input.projectId, rule.id)
      )
        continue;
      if (
        rule.rule_type === 'PercentageOfEligibleClientLabor' &&
        !this.settlementTriggerReady(row, rule.settlement_trigger)
      )
        continue;
      const clientRate = this.clientRateFor(
        input.projectId,
        input.workerId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const current = byRule.get(rule.id) ?? {
        rule,
        sourceAmount: 0n,
        amount: 0n,
        currency: rule.currency,
        percentage: rule.rule_type === 'PercentageOfEligibleClientLabor',
      };
      if (rule.rule_type === 'PercentageOfEligibleClientLabor') {
        const eligible =
          row.billability_state === 'billable' && clientRate?.eligible_for_percentage === 1
            ? this.eligibleLaborForSettlement(
                row,
                rule.percentage_basis as SettlementBasis,
                clientRate,
              )
            : 0n;
        current.sourceAmount += eligible;
        current.amount += applyBasisPoints(
          money(rule.currency, eligible),
          rule.percentage_bps ?? 0,
        ).minorUnits;
      } else if (
        rule.rule_type === 'FixedPerBillingPeriod' ||
        rule.rule_type === 'FixedProjectAmount' ||
        rule.rule_type === 'CustomApprovedAdjustment'
      ) {
        // Fixed/custom rules settle once per rule in the period, not once per
        // time entry. The amount is taken from the configured rule.
        current.amount = BigInt(rule.rate_minor);
      } else if (rule.rule_type === 'Daily' || rule.rate_basis === 'daily') {
        const dayKey = `${rule.id}:${row.work_date}`;
        const day = byRule.get(dayKey);
        if (day) day.sourceAmount += BigInt(row.minutes);
        else
          byRule.set(dayKey, {
            rule,
            sourceAmount: BigInt(row.minutes),
            amount: BigInt(rule.rate_minor),
            currency: rule.currency,
            percentage: false,
          });
        continue;
      } else {
        current.sourceAmount += BigInt(row.minutes);
        current.amount += this.compensationAmount(row, rule, clientRate);
      }
      byRule.set(rule.id, current);
    }
    // Apply hourly daily guarantees independently from client minimum billing.
    // Aggregate by effective rule and date so two entries on the same day cannot
    // apply the same guarantee twice.
    const guaranteeDays = new Map<string, { rule: CompensationRuleRow; actual: number }>();
    for (const row of rows) {
      const rule = this.compensationRuleFor(
        input.projectId,
        input.workerId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      if (
        !rule ||
        rule.rule_type !== 'Hourly' ||
        rule.rate_basis === 'daily' ||
        !rule.daily_guarantee_minutes
      )
        continue;
      const key = `${rule.id}:${row.work_date}`;
      const day = guaranteeDays.get(key) ?? { rule, actual: 0 };
      day.actual += row.minutes;
      guaranteeDays.set(key, day);
    }
    for (const { rule, actual } of guaranteeDays.values()) {
      const topUp = Math.max(0, (rule.daily_guarantee_minutes ?? 0) - actual);
      const current = byRule.get(rule.id);
      if (current && topUp > 0)
        current.amount += hourlyRateForMinutes(
          money(rule.currency, BigInt(rule.rate_minor)),
          topUp,
        ).minorUnits;
    }
    const consolidated = new Map<
      string,
      {
        rule: CompensationRuleRow;
        sourceAmount: bigint;
        amount: bigint;
        currency: V3Currency;
      }
    >();
    for (const [key, value] of byRule) {
      const separator = key.indexOf(':');
      const ruleId = separator >= 0 ? key.slice(0, separator) : key;
      const existing = consolidated.get(ruleId);
      if (existing) {
        existing.sourceAmount += value.sourceAmount;
        existing.amount += value.amount;
      } else
        consolidated.set(ruleId, {
          rule: value.rule,
          sourceAmount: value.sourceAmount,
          amount: value.amount,
          currency: value.currency,
        });
    }
    if (consolidated.size === 0)
      throw new V3ValidationError('No approved time is available to settle');
    return this.transaction(() => {
      const now = timestamp();
      const settlements = [] as Array<{
        id: string;
        ruleId: string;
        amountMinor: string;
        sourceAmountMinor: string;
        currency: V3Currency;
        state: string;
      }>;
      for (const [ruleId, value] of consolidated) {
        const existing = this.sqlite
          .prepare(
            'SELECT id FROM compensation_settlement WHERE worker_id=? AND project_id=? AND compensation_rule_id=? AND period_start=? AND period_end=?',
          )
          .get(input.workerId, input.projectId, ruleId, input.periodStart, input.periodEnd) as
          | { id: string }
          | undefined;
        const id = existing?.id ?? newId();
        this.sqlite
          .prepare(
            `INSERT INTO compensation_settlement(
              id,worker_id,project_id,compensation_rule_id,period_start,period_end,
              source_basis,source_amount_minor,percentage_bps,amount_minor,currency,
              state,settled_at,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(worker_id,project_id,compensation_rule_id,period_start,period_end)
            DO UPDATE SET source_basis=excluded.source_basis,source_amount_minor=excluded.source_amount_minor,
              percentage_bps=excluded.percentage_bps,amount_minor=excluded.amount_minor,
              currency=excluded.currency,state=excluded.state,settled_at=excluded.settled_at,
              updated_at=excluded.updated_at`,
          )
          .run(
            id,
            input.workerId,
            input.projectId,
            ruleId,
            input.periodStart,
            input.periodEnd,
            value.rule.percentage_basis ?? 'APPROVED_TIME',
            sqliteInteger(value.sourceAmount, 'Settlement source'),
            value.rule.percentage_bps ?? null,
            sqliteInteger(value.amount, 'Settlement amount'),
            value.currency,
            'settled',
            now,
            now,
            now,
          );
        settlements.push({
          id,
          ruleId,
          amountMinor: value.amount.toString(),
          sourceAmountMinor: value.sourceAmount.toString(),
          currency: value.currency,
          state: 'settled',
        });
      }
      this.audit(principal, 'compensation.settle', 'project', input.projectId, {
        workerId: input.workerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        settlements: settlements.map((settlement) => ({
          ruleId: settlement.ruleId,
          amountMinor: settlement.amountMinor,
        })),
      });
      return settlements;
    });
  }

  private eligibleLaborForSettlement(
    row: TimeRow,
    basis: SettlementBasis | null,
    clientRate: LaborRateRow,
  ): bigint {
    const direct = hourlyRateForMinutes(
      money(row.project_currency, this.clientRateAmount(row, clientRate)),
      row.minutes,
    ).minorUnits;
    if (basis === 'ISSUED_ELIGIBLE_LABOR' || basis === 'COLLECTED_ELIGIBLE_LABOR') {
      const invoiceRows = this.sqlite
        .prepare(
          `SELECT i.id,i.subtotal_minor,i.total_minor,
                  COALESCE((SELECT sum(amount_minor) FROM payment WHERE invoice_id=i.id),0) paid,
                  il.subtotal_minor line_subtotal
           FROM invoice_source s
           JOIN invoice i ON i.id=s.invoice_id
           JOIN invoice_line il ON il.invoice_id=i.id AND il.source_type='time' AND il.source_id=s.source_id
           WHERE s.source_type='time' AND s.source_id=?
             AND i.state IN ('issued','sent','partially_paid','paid','overdue')`,
        )
        .all(row.id) as Array<{
        subtotal_minor: number;
        total_minor: number;
        paid: number;
        line_subtotal: number;
      }>;
      const issued = invoiceRows.reduce((sum, invoice) => sum + BigInt(invoice.line_subtotal), 0n);
      if (basis === 'ISSUED_ELIGIBLE_LABOR') return issued;
      return invoiceRows.reduce((sum, invoice) => {
        if (invoice.subtotal_minor <= 0) return sum;
        return (
          sum +
          divideRounded(
            BigInt(invoice.line_subtotal) * BigInt(invoice.paid),
            BigInt(invoice.subtotal_minor),
          )
        );
      }, 0n);
    }
    return direct;
  }

  private settlementTriggerReady(row: TimeRow, trigger: string): boolean {
    if (trigger === 'ON_APPROVED_BILLABLE_LABOR') return true;
    const states =
      trigger === 'ON_INVOICE_ISSUE'
        ? ['issued', 'sent', 'partially_paid', 'paid', 'overdue']
        : ['partially_paid', 'paid', 'overdue'];
    const placeholders = states.map(() => '?').join(',');
    const result = this.sqlite
      .prepare(
        `SELECT 1
         FROM invoice_source s
         JOIN invoice i ON i.id=s.invoice_id
         WHERE s.source_type='time' AND s.source_id=? AND i.state IN (${placeholders})
         LIMIT 1`,
      )
      .get(row.id, ...states);
    if (!result) return false;
    if (trigger !== 'ON_CLIENT_PAYMENT') return true;
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1
           FROM invoice_source s
           JOIN payment p ON p.invoice_id=s.invoice_id
           WHERE s.source_type='time' AND s.source_id=?
           LIMIT 1`,
        )
        .get(row.id),
    );
  }

  listCompensationSettlements(
    principal: Principal,
    periodStart?: string,
    periodEnd?: string,
    projectId?: string,
  ) {
    this.assertActive(principal);
    if (periodStart) requireDate(periodStart, 'Period start');
    if (periodEnd) requireDate(periodEnd, 'Period end');
    const financeVisible = canManageBilling(principal) || principal.role === 'auditor_read_only';
    if (financeVisible) this.assertFinanceReadable(principal);
    else if (projectId) throw new V3AccessDeniedError('Project filter is finance-only');
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    const conditions: string[] = [];
    const values: DbValue[] = [];
    if (!financeVisible) {
      conditions.push('cs.worker_id=?');
      values.push(principal.userId);
    }
    if (periodStart) {
      conditions.push('cs.period_end>=?');
      values.push(periodStart);
    }
    if (periodEnd) {
      conditions.push('cs.period_start<=?');
      values.push(periodEnd);
    }
    if (projectId) {
      conditions.push('cs.project_id=?');
      values.push(projectId);
    }
    const rows = this.sqlite
      .prepare(
        `SELECT cs.id,cs.worker_id,cs.project_id,cs.period_start,cs.period_end,cs.source_basis,
                cs.source_amount_minor,cs.percentage_bps,cs.amount_minor,cs.currency,cs.state,
                cs.settled_at,p.project_number,p.name project_name,u.name worker_name
         FROM compensation_settlement cs
         JOIN project p ON p.id=cs.project_id
         JOIN user u ON u.id=cs.worker_id
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY cs.period_start DESC,cs.id`,
      )
      .all(...values) as Array<Record<string, DbValue>>;
    return rows.map((row) =>
      financeVisible
        ? {
            id: row.id,
            workerId: row.worker_id,
            workerName: row.worker_name,
            projectId: row.project_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            sourceBasis: row.source_basis,
            sourceAmountMinor: String(row.source_amount_minor),
            percentageBps: row.percentage_bps,
            amountMinor: String(row.amount_minor),
            currency: row.currency,
            state: row.state,
            settledAt: row.settled_at,
            projectNumber: row.project_number,
            projectName: row.project_name,
          }
        : {
            id: row.id,
            projectId: row.project_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            amountMinor: String(row.amount_minor),
            currency: row.currency,
            state: row.state,
            settledAt: row.settled_at,
            projectNumber: row.project_number,
            projectName: row.project_name,
          },
    );
  }

  listReimbursementQueue(principal: Principal, projectId?: string) {
    this.assertFinanceReadable(principal);
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    const rows = this.sqlite
      .prepare(
        `SELECT e.id,e.project_id,e.worker_id,e.spent_on,e.vendor,e.category,e.currency,
                e.amount_minor,e.project_currency_amount_minor,e.reimbursement_amount_minor,
                e.reimbursement_state,e.reimbursement_reference,p.project_number,p.name project_name,
                u.name worker_name
         FROM expense e
         JOIN project p ON p.id=e.project_id
         JOIN user u ON u.id=e.worker_id
         WHERE e.who_paid='worker' AND e.approval_state IN ('approved','locked')
           ${projectId ? 'AND e.project_id=?' : ''}
         ORDER BY e.spent_on DESC,e.id`,
      )
      .all(...(projectId ? [projectId] : [])) as Array<Record<string, DbValue>>;
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      workerId: row.worker_id,
      workerName: row.worker_name,
      spentOn: row.spent_on,
      vendor: row.vendor,
      category: row.category,
      currency: row.currency,
      amountMinor: String(row.project_currency_amount_minor ?? row.amount_minor),
      reimbursementAmountMinor: String(
        row.reimbursement_amount_minor ?? row.project_currency_amount_minor ?? row.amount_minor,
      ),
      reimbursementState: row.reimbursement_state,
      reimbursementReference: row.reimbursement_reference,
      projectNumber: row.project_number,
      projectName: row.project_name,
    }));
  }

  workerPay(principal: Principal, periodStart: string, periodEnd: string) {
    this.assertActive(principal);
    requireDate(periodStart, 'Period start');
    requireDate(periodEnd, 'Period end');
    const rows = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,t.approval_state,
                t.billability_state,p.currency project_currency
         FROM time_entry t JOIN project p ON p.id=t.project_id
         JOIN project_member pm ON pm.project_id=t.project_id AND pm.user_id=t.worker_id
         WHERE t.worker_id=? AND t.work_date BETWEEN ? AND ? AND pm.status='active'
           AND t.approval_state NOT IN ('rejected')
         ORDER BY t.work_date,t.id`,
      )
      .all(principal.userId, periodStart, periodEnd) as TimeRow[];
    const currency = rows[0]?.project_currency ?? 'USD';
    if (rows.some((row) => row.project_currency !== currency))
      throw new V3ValidationError('Multiple compensation currencies require separate statements');
    let approvedMinutes = 0;
    let pendingMinutes = 0;
    let approved = 0n;
    let pending = 0n;
    let guaranteedMinutes = 0;
    let missingRules = 0;
    let percentageRows = 0;
    const settlementTriggers = new Set<string>();
    const approvedByProject = new Map<string, bigint>();
    const pendingByProject = new Map<string, bigint>();
    const dailyRules = new Map<
      string,
      { rule: CompensationRuleRow; approved: boolean; pending: boolean }
    >();
    const fixedRules = new Map<
      string,
      { rule: CompensationRuleRow; approved: boolean; pending: boolean }
    >();
    const dailyGuarantees = new Map<
      string,
      { rule: CompensationRuleRow; approvedMinutes: number; pendingMinutes: number }
    >();
    const projectIds = new Set<string>();
    for (const row of rows) {
      projectIds.add(row.project_id);
      const rule = this.compensationRuleFor(
        row.project_id,
        principal.userId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const clientRate = this.clientRateFor(
        row.project_id,
        principal.userId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      if (!rule) missingRules += 1;
      if (rule && rule.currency !== row.project_currency) {
        missingRules += 1;
        continue;
      }
      const usableClientRate =
        clientRate && clientRate.currency === row.project_currency ? clientRate : null;
      if (rule?.rule_type === 'PercentageOfEligibleClientLabor') percentageRows += 1;
      if (rule) settlementTriggers.add(rule.settlement_trigger);
      const amount = this.compensationAmount(row, rule, usableClientRate);
      if (rule?.rule_type === 'Daily' || rule?.rate_basis === 'daily') {
        const key = `${row.project_id}:${row.work_date}:${rule.id}`;
        const existing = dailyRules.get(key) ?? { rule, approved: false, pending: false };
        if (row.approval_state === 'approved' || row.approval_state === 'locked')
          existing.approved = true;
        else if (isPendingApproval(row.approval_state)) existing.pending = true;
        dailyRules.set(key, existing);
      } else if (
        rule?.rule_type === 'FixedPerBillingPeriod' ||
        rule?.rule_type === 'FixedProjectAmount' ||
        rule?.rule_type === 'CustomApprovedAdjustment'
      ) {
        const key = `${row.project_id}:${rule.id}`;
        const existing = fixedRules.get(key) ?? { rule, approved: false, pending: false };
        if (row.approval_state === 'approved' || row.approval_state === 'locked')
          existing.approved = true;
        else if (isPendingApproval(row.approval_state)) existing.pending = true;
        fixedRules.set(key, existing);
      }
      if (
        rule?.rule_type === 'Hourly' &&
        rule.rate_basis !== 'daily' &&
        rule.daily_guarantee_minutes
      ) {
        const key = `${row.project_id}:${row.work_date}:${rule.id}`;
        const existing = dailyGuarantees.get(key) ?? {
          rule,
          approvedMinutes: 0,
          pendingMinutes: 0,
        };
        if (row.approval_state === 'approved' || row.approval_state === 'locked')
          existing.approvedMinutes += row.minutes;
        else if (isPendingApproval(row.approval_state)) existing.pendingMinutes += row.minutes;
        dailyGuarantees.set(key, existing);
      }
      if (row.approval_state === 'approved' || row.approval_state === 'locked') {
        approvedMinutes += row.minutes;
        approved += amount;
        approvedByProject.set(
          row.project_id,
          (approvedByProject.get(row.project_id) ?? 0n) + amount,
        );
      } else if (isPendingApproval(row.approval_state)) {
        pendingMinutes += row.minutes;
        pending += amount;
        pendingByProject.set(row.project_id, (pendingByProject.get(row.project_id) ?? 0n) + amount);
      }
    }
    for (const { rule, approved: hasApproved, pending: hasPending } of dailyRules.values()) {
      const amount = BigInt(rule.rate_minor);
      if (hasPending) pending += amount;
      else if (hasApproved) approved += amount;
    }
    for (const { rule, approved: hasApproved, pending: hasPending } of fixedRules.values()) {
      const amount = BigInt(rule.rate_minor);
      if (hasPending) pending += amount;
      else if (hasApproved) approved += amount;
    }
    for (const day of dailyGuarantees.values()) {
      const actual = day.approvedMinutes + day.pendingMinutes;
      const guaranteed = Math.max(actual, day.rule.daily_guarantee_minutes ?? 0);
      guaranteedMinutes += guaranteed;
      if (
        guaranteed > actual &&
        day.rule.rule_type === 'Hourly' &&
        day.rule.rate_basis !== 'daily'
      ) {
        const topUp = guaranteed - actual;
        const amount = hourlyRateForMinutes(
          money(day.rule.currency, BigInt(day.rule.rate_minor)),
          topUp,
        ).minorUnits;
        if (day.pendingMinutes > 0) pending += amount;
        else approved += amount;
      }
    }
    const reimbursementRows = this.sqlite
      .prepare(
        `SELECT approval_state,COALESCE(sum(COALESCE(reimbursement_amount_minor,amount_minor)),0) amount
         FROM expense WHERE worker_id=? AND spent_on BETWEEN ? AND ? AND who_paid='worker'
         GROUP BY approval_state`,
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      approval_state: string;
      amount: number;
    }>;
    const approvedReimbursementMinor = reimbursementRows
      .filter((row) => ['approved', 'locked'].includes(row.approval_state))
      .reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const pendingReimbursementMinor = reimbursementRows
      .filter((row) => ['draft', 'submitted', 'needs_changes'].includes(row.approval_state))
      .reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const projectProgress = [...projectIds]
      .map((projectId) => {
        const project = this.sqlite
          .prepare(
            `SELECT p.project_number,p.name,p.currency,p.budget_minor,p.po_cap_minor,p.revenue_budget_minor,
                  COALESCE((SELECT SUM(planned_minutes) FROM planning_assignment pa
                            WHERE pa.project_id=p.id AND pa.worker_id=? AND pa.status<>'cancelled'),0) planning_minutes,
                  COALESCE((SELECT SUM(planned_minutes) FROM project_member pm
                            WHERE pm.project_id=p.id AND pm.user_id=? AND pm.status='active'),0) member_planned_minutes
           FROM project p WHERE p.id=?`,
          )
          .get(principal.userId, principal.userId, projectId) as
          | {
              project_number: string;
              name: string;
              currency: V3Currency;
              budget_minor: number | null;
              po_cap_minor: number | null;
              revenue_budget_minor: number | null;
              planning_minutes: number;
              member_planned_minutes: number;
            }
          | undefined;
        if (!project) return null;
        const ownRows = rows.filter((row) => row.project_id === projectId);
        const actual = ownRows.reduce((sum, row) => sum + row.minutes, 0);
        const planned =
          project.planning_minutes > 0
            ? project.planning_minutes
            : project.member_planned_minutes > 0
              ? project.member_planned_minutes
              : null;
        return {
          projectId,
          projectNumber: project.project_number,
          projectName: project.name,
          currency: project.currency,
          plannedMinutes: planned,
          actualMinutes: actual,
          approvedMinutes: ownRows
            .filter((row) => row.approval_state === 'approved' || row.approval_state === 'locked')
            .reduce((sum, row) => sum + row.minutes, 0),
          pendingMinutes: ownRows
            .filter((row) => isPendingApproval(row.approval_state))
            .reduce((sum, row) => sum + row.minutes, 0),
          hoursRemaining: planned === null ? null : Math.max(0, planned - actual),
          estimatedApprovedMinor: (approvedByProject.get(projectId) ?? 0n).toString(),
          estimatedPendingMinor: (pendingByProject.get(projectId) ?? 0n).toString(),
          budgetMinor: String(
            project.po_cap_minor ?? project.revenue_budget_minor ?? project.budget_minor ?? 0,
          ),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return {
      currency,
      projectIds: [...projectIds],
      approvedMinutes,
      pendingMinutes,
      guaranteedMinutes,
      estimatedApprovedMinor: approved.toString(),
      estimatedPendingMinor: pending.toString(),
      approvedReimbursementMinor: approvedReimbursementMinor.toString(),
      pendingReimbursementMinor: pendingReimbursementMinor.toString(),
      percentageBased: percentageRows > 0,
      settlementTriggers: [...settlementTriggers],
      missingCompensationRules: missingRules,
      projectProgress,
      label: 'Estimated project compensation',
    };
  }

  projectFinance(
    principal: Principal,
    projectId: string,
    periodStart?: string,
    periodEnd?: string,
  ) {
    this.assertFinanceReadable(principal);
    this.assertProjectAccess(principal, projectId, true);
    const project = this.sqlite
      .prepare(
        `SELECT client_id,currency,client_daily_minimum_minutes,revenue_budget_minor,po_cap_minor,
                labor_budget_minutes,travel_budget_minor,planned_minutes
         FROM project WHERE id=?`,
      )
      .get(projectId) as
      | {
          client_id: string;
          currency: V3Currency;
          client_daily_minimum_minutes: number | null;
          revenue_budget_minor: number | null;
          po_cap_minor: number | null;
          labor_budget_minutes: number | null;
          travel_budget_minor: number | null;
          planned_minutes: number | null;
        }
      | undefined;
    if (!project) throw new V3ValidationError('Project not found');
    const start = periodStart ?? '0000-01-01';
    const end = periodEnd ?? '9999-12-31';
    if (periodStart) requireDate(periodStart, 'Period start');
    if (periodEnd) requireDate(periodEnd, 'Period end');
    const time = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,u.name worker_name,t.work_date,t.category,t.activity_code,
                t.minutes,t.approval_state,t.billability_state,t.billing_status,t.invoice_id,
                p.currency project_currency
         FROM time_entry t JOIN project p ON p.id=t.project_id
         JOIN user u ON u.id=t.worker_id
         WHERE t.project_id=? AND t.work_date BETWEEN ? AND ?
           AND t.approval_state NOT IN ('rejected')
         ORDER BY t.work_date,t.id`,
      )
      .all(projectId, start, end) as Array<TimeRow & { worker_name: string }>;
    let laborRevenue = 0n;
    let laborCost = 0n;
    let workerCompensation = 0n;
    let billableMinutes = 0;
    let approvedMinutes = 0;
    let unapprovedMinutes = 0;
    let overtimeMinutes = 0;
    let standbyMinutes = 0;
    let travelMinutes = 0;
    let missingRates = 0;
    let unapprovedWip = 0n;
    const economics: Array<Record<string, OutputValue>> = [];
    const dailyBillable = new Map<string, { minutes: number; rate: bigint }>();
    const dailyMinimumAdjustments: Array<Record<string, unknown>> = [];
    for (const row of time) {
      const approved = row.approval_state === 'approved' || row.approval_state === 'locked';
      if (approved) approvedMinutes += row.minutes;
      else if (isPendingApproval(row.approval_state)) unapprovedMinutes += row.minutes;
      if (row.category === 'overtime') overtimeMinutes += row.minutes;
      if (row.category === 'standby') standbyMinutes += row.minutes;
      if (row.category === 'travel') travelMinutes += row.minutes;
      const clientRate = this.clientRateFor(
        projectId,
        row.worker_id,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const internalRate = this.internalCostFor(
        projectId,
        row.worker_id,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const compRule = this.compensationRuleFor(
        projectId,
        row.worker_id,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const usableClientRate = clientRate?.currency === project.currency ? clientRate : null;
      const usableInternalRate = internalRate?.currency === project.currency ? internalRate : null;
      const usableCompRule = compRule?.currency === project.currency ? compRule : null;
      const clientRateMinor = usableClientRate
        ? this.clientRateAmount(row, usableClientRate)
        : null;
      const pendingRevenue =
        row.billability_state === 'billable' && clientRateMinor !== null
          ? hourlyRateForMinutes(money(project.currency, clientRateMinor), row.minutes).minorUnits
          : 0n;
      if (!approved) {
        if (isPendingApproval(row.approval_state)) unapprovedWip += pendingRevenue;
        economics.push({
          id: row.id,
          workerId: row.worker_id,
          workerName: row.worker_name,
          workDate: row.work_date,
          category: row.category,
          actualMinutes: row.minutes,
          approved: false,
          approvalState: row.approval_state,
          billabilityState: row.billability_state,
          clientBillableMinutes: row.billability_state === 'billable' ? row.minutes : 0,
          clientMinimumAdjustmentMinutes: 0,
          billingStatus: row.billing_status ?? 'unlocked',
          invoiceId: row.invoice_id ?? null,
          clientRevenueMinor: pendingRevenue.toString(),
          internalCostMinor: '0',
          workerCompensationMinor: '0',
          clientRateConfigured: usableClientRate !== null,
          internalCostConfigured: usableInternalRate !== null,
          compensationRuleType: usableCompRule?.rule_type ?? null,
        });
        continue;
      }
      const revenue =
        row.billability_state === 'billable' && clientRateMinor !== null
          ? hourlyRateForMinutes(money(project.currency, clientRateMinor), row.minutes).minorUnits
          : 0n;
      const cost = usableInternalRate
        ? hourlyRateForMinutes(
            money(project.currency, this.internalCostAmount(row, usableInternalRate)),
            row.minutes,
          ).minorUnits
        : 0n;
      const compensation = this.compensationAmount(row, usableCompRule, usableClientRate);
      if (row.billability_state === 'billable') {
        billableMinutes += row.minutes;
        if (clientRateMinor !== null) {
          const daily = dailyBillable.get(row.work_date) ?? { minutes: 0, rate: clientRateMinor };
          daily.minutes += row.minutes;
          dailyBillable.set(row.work_date, daily);
        }
      }
      if (!usableClientRate && row.billability_state === 'billable') missingRates += 1;
      if (!usableInternalRate) missingRates += 1;
      if (!usableCompRule) missingRates += 1;
      laborRevenue += revenue;
      laborCost += cost;
      workerCompensation += compensation;
      economics.push({
        id: row.id,
        workerId: row.worker_id,
        workerName: row.worker_name,
        workDate: row.work_date,
        category: row.category,
        actualMinutes: row.minutes,
        approved: true,
        billabilityState: row.billability_state,
        approvalState: row.approval_state,
        clientBillableMinutes: row.billability_state === 'billable' ? row.minutes : 0,
        clientMinimumAdjustmentMinutes: 0,
        billingStatus: row.billing_status ?? 'unlocked',
        invoiceId: row.invoice_id ?? null,
        clientRevenueMinor: revenue.toString(),
        internalCostMinor: cost.toString(),
        workerCompensationMinor: compensation.toString(),
        clientRateConfigured: usableClientRate !== null,
        internalCostConfigured: usableInternalRate !== null,
        compensationRuleType: usableCompRule?.rule_type ?? null,
      });
    }
    let dailyMinimumTopUp = 0n;
    if (project.client_daily_minimum_minutes !== null) {
      for (const [workDate, daily] of dailyBillable.entries()) {
        const billable = billableMinutesForDailyMinimum(
          daily.minutes,
          project.client_daily_minimum_minutes,
        );
        const topUp = billable - daily.minutes;
        if (topUp > 0) {
          const topUpMinor = hourlyRateForMinutes(
            money(project.currency, daily.rate),
            topUp,
          ).minorUnits;
          dailyMinimumTopUp += topUpMinor;
          dailyMinimumAdjustments.push({
            workDate,
            sourceTimeIds: time
              .filter((row) => row.work_date === workDate && row.billability_state === 'billable')
              .map((row) => row.id),
            adjustmentMinutes: topUp,
            rateMinor: daily.rate.toString(),
            revenueMinor: topUpMinor.toString(),
            sourceType: 'derived_daily_minimum',
          });
          billableMinutes += topUp;
        }
      }
      laborRevenue += dailyMinimumTopUp;
    }
    const expenses = this.sqlite
      .prepare(
        `SELECT id,spent_on,worker_id,category,amount_minor,project_currency_amount_minor,who_paid,
                client_treatment,billing_treatment,billing_amount_minor,approval_state
         FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND approval_state NOT IN ('rejected')`,
      )
      .all(projectId, start, end) as Array<{
      id: string;
      spent_on: string;
      worker_id: string;
      category: string;
      amount_minor: number;
      project_currency_amount_minor: number | null;
      who_paid: string;
      client_treatment: string;
      billing_treatment: string;
      billing_amount_minor: number | null;
      approval_state: string;
    }>;
    let expenseCost = 0n;
    let expenseRevenue = 0n;
    let unapprovedExpenseWip = 0n;
    let travelCost = 0n;
    let otherDirectCost = 0n;
    const expenseEconomics: Array<Record<string, OutputValue>> = [];
    for (const expense of expenses) {
      const actualCost = BigInt(expense.project_currency_amount_minor ?? expense.amount_minor);
      const treatment = expense.billing_treatment || expense.client_treatment;
      const directCost =
        expense.who_paid !== 'client' && treatment !== 'client_direct' ? actualCost : 0n;
      const revenue =
        expense.who_paid !== 'client' &&
        treatment !== 'client_direct' &&
        (treatment.startsWith('reimbursable') || treatment === 'allowance_per_diem')
          ? BigInt(expense.billing_amount_minor ?? expense.amount_minor)
          : 0n;
      const approvedExpense = ['approved', 'locked'].includes(expense.approval_state);
      if (!approvedExpense) {
        if (isPendingApproval(expense.approval_state)) unapprovedExpenseWip += revenue;
        expenseEconomics.push({
          id: expense.id,
          workerId: expense.worker_id,
          spentOn: expense.spent_on,
          category: expense.category,
          approvalState: expense.approval_state,
          costMinor: '0',
          actualCostMinor: actualCost.toString(),
          revenueMinor: revenue.toString(),
          treatment,
          paidBy: expense.who_paid,
        });
        continue;
      }
      expenseCost += directCost;
      expenseRevenue += revenue;
      if (
        [
          'hotel',
          'rental_car',
          'fuel',
          'tolls',
          'parking',
          'airfare',
          'ground_transport',
          'meals',
          'per_diem',
        ].includes(expense.category)
      )
        travelCost += directCost;
      else otherDirectCost += directCost;
      expenseEconomics.push({
        id: expense.id,
        workerId: expense.worker_id,
        spentOn: expense.spent_on,
        category: expense.category,
        approvalState: expense.approval_state,
        costMinor: directCost.toString(),
        actualCostMinor: actualCost.toString(),
        revenueMinor: revenue.toString(),
        treatment,
        paidBy: expense.who_paid,
      });
    }
    const milestoneRows = this.sqlite
      .prepare(
        `SELECT id,amount_minor,currency,approval_state,invoice_id
         FROM project_milestone
         WHERE project_id=? AND approval_state IN ('approved','final')`,
      )
      .all(projectId) as Array<{
      id: string;
      amount_minor: number;
      currency: V3Currency;
      approval_state: string;
      invoice_id: string | null;
    }>;
    const milestoneRevenue = milestoneRows
      .filter((row) => row.currency === project.currency && row.invoice_id === null)
      .reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
    const invoicePeriodFilter =
      periodStart && periodEnd ? ' AND i.period_end>=? AND i.period_start<=?' : '';
    const invoiceValues: DbValue[] = [projectId];
    if (periodStart && periodEnd) invoiceValues.push(periodStart, periodEnd);
    const invoices = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(i.subtotal_minor),0) subtotal,COALESCE(sum(i.total_minor),0) total
         FROM invoice i
         WHERE i.project_id=? AND i.state IN ('issued','sent','partially_paid','paid','overdue')${invoicePeriodFilter}`,
      )
      .get(...invoiceValues) as { subtotal: number; total: number };
    const collected = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(pa.amount_minor),0) total
         FROM payment pa JOIN invoice i ON i.id=pa.invoice_id
         WHERE i.project_id=? AND i.state<>'void'${invoicePeriodFilter}`,
      )
      .get(...invoiceValues) as { total: number };
    const revenue = laborRevenue + expenseRevenue + milestoneRevenue;
    const directCost = laborCost + expenseCost;
    const contribution = revenue - directCost;
    const budget = project.po_cap_minor ?? project.revenue_budget_minor;
    const actualMinutes = time.reduce((sum, row) => sum + row.minutes, 0);
    const planning = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(planned_minutes),0) minutes
         FROM planning_assignment
         WHERE project_id=? AND status<>'cancelled' AND ends_at>=? AND starts_at<=?`,
      )
      .get(projectId, `${start}T00:00:00.000Z`, `${end}T23:59:59.999Z`) as { minutes: number };
    const memberPlanning = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(planned_minutes),0) minutes
         FROM project_member
         WHERE project_id=? AND status='active'`,
      )
      .get(projectId) as { minutes: number };
    const plannedMinutes =
      project.planned_minutes ??
      (planning.minutes > 0
        ? planning.minutes
        : memberPlanning.minutes > 0
          ? memberPlanning.minutes
          : null);
    const plannedRemainingMinutes =
      plannedMinutes === null ? null : Math.max(0, plannedMinutes - actualMinutes);
    const forecastDate = periodEnd ?? new Date().toISOString().slice(0, 10);
    const assignedWorkers = this.sqlite
      .prepare(
        `SELECT DISTINCT user_id worker_id
         FROM project_member
         WHERE project_id=? AND status='active' AND starts_on<=?
           AND (ends_on IS NULL OR ends_on>=?)`,
      )
      .all(projectId, forecastDate, forecastDate) as Array<{ worker_id: string }>;
    let fallbackCostRate = 0n;
    let fallbackClientRate = 0n;
    let fallbackRateCount = 0;
    for (const worker of assignedWorkers) {
      const internalRate = this.internalCostFor(
        projectId,
        worker.worker_id,
        'regular',
        forecastDate,
      );
      const clientRate = this.clientRateFor(projectId, worker.worker_id, 'regular', forecastDate);
      if (
        internalRate?.currency === project.currency &&
        clientRate?.currency === project.currency
      ) {
        fallbackCostRate += this.internalCostAmount({ category: 'regular' }, internalRate);
        fallbackClientRate += this.clientRateAmount({ category: 'regular' }, clientRate);
        fallbackRateCount += 1;
      }
    }
    const averageCostRate =
      approvedMinutes > 0
        ? divideRounded(laborCost * 60n, BigInt(approvedMinutes))
        : fallbackRateCount > 0
          ? divideRounded(fallbackCostRate, BigInt(fallbackRateCount))
          : null;
    const averageClientRate =
      billableMinutes > 0
        ? divideRounded(laborRevenue * 60n, BigInt(billableMinutes))
        : fallbackRateCount > 0
          ? divideRounded(fallbackClientRate, BigInt(fallbackRateCount))
          : null;
    const estimateToCompleteLaborCost =
      plannedRemainingMinutes === null || averageCostRate === null
        ? null
        : hourlyRateForMinutes(money(project.currency, averageCostRate), plannedRemainingMinutes)
            .minorUnits;
    const estimateToCompleteLaborRevenue =
      plannedRemainingMinutes === null || averageClientRate === null
        ? null
        : hourlyRateForMinutes(money(project.currency, averageClientRate), plannedRemainingMinutes)
            .minorUnits;
    const remainingTravelBudget =
      project.travel_budget_minor === null
        ? 0n
        : BigInt(project.travel_budget_minor) > travelCost
          ? BigInt(project.travel_budget_minor) - travelCost
          : 0n;
    const estimateToComplete =
      estimateToCompleteLaborCost === null
        ? null
        : estimateToCompleteLaborCost + remainingTravelBudget;
    const estimateAtCompletionCost =
      estimateToComplete === null ? null : directCost + estimateToComplete;
    const estimateAtCompletionRevenue =
      estimateToCompleteLaborRevenue === null ? null : revenue + estimateToCompleteLaborRevenue;
    const expectedFinalMargin =
      estimateAtCompletionCost === null || estimateAtCompletionRevenue === null
        ? null
        : estimateAtCompletionRevenue - estimateAtCompletionCost;
    const hoursConsumedBps =
      project.labor_budget_minutes && project.labor_budget_minutes > 0
        ? divideRounded(BigInt(actualMinutes) * 10_000n, BigInt(project.labor_budget_minutes))
        : null;
    const travelBudgetConsumedBps =
      project.travel_budget_minor && project.travel_budget_minor > 0
        ? divideRounded(travelCost * 10_000n, BigInt(project.travel_budget_minor))
        : null;
    const budgetConsumedBps =
      budget && budget > 0 ? divideRounded(revenue * 10_000n, BigInt(budget)) : null;
    const costBudgetConsumedBps =
      budget && budget > 0 ? divideRounded(directCost * 10_000n, BigInt(budget)) : null;
    const alerts: string[] = [];
    if (budget && budget > 0 && revenue * 100n >= BigInt(budget) * 95n)
      alerts.push('PO_OR_REVENUE_BUDGET_AT_95_PERCENT');
    else if (budget && budget > 0 && revenue * 100n >= BigInt(budget) * 85n)
      alerts.push('PO_OR_REVENUE_BUDGET_AT_85_PERCENT');
    else if (budget && budget > 0 && revenue * 100n >= BigInt(budget) * 70n)
      alerts.push('PO_OR_REVENUE_BUDGET_AT_70_PERCENT');
    if (
      project.labor_budget_minutes &&
      project.labor_budget_minutes > 0 &&
      actualMinutes * 100 >= project.labor_budget_minutes * 95
    )
      alerts.push('LABOR_HOURS_BUDGET_AT_95_PERCENT');
    if (
      project.travel_budget_minor &&
      project.travel_budget_minor > 0 &&
      travelCost * 100n >= BigInt(project.travel_budget_minor) * 95n
    )
      alerts.push('TRAVEL_BUDGET_AT_95_PERCENT');
    if (expectedFinalMargin !== null && expectedFinalMargin < 0n)
      alerts.push('NEGATIVE_PROJECTED_MARGIN');
    if (missingRates > 0) alerts.push('MISSING_RATE');
    return {
      currency: project.currency,
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      actualMinutes,
      approvedMinutes,
      billableMinutes,
      unapprovedMinutes,
      overtimeMinutes,
      standbyMinutes,
      travelMinutes,
      laborRevenueMinor: laborRevenue.toString(),
      expenseRevenueMinor: expenseRevenue.toString(),
      milestoneRevenueMinor: milestoneRevenue.toString(),
      revenueCandidateMinor: revenue.toString(),
      directLaborCostMinor: laborCost.toString(),
      workerCompensationMinor: workerCompensation.toString(),
      travelCostMinor: travelCost.toString(),
      otherDirectCostMinor: otherDirectCost.toString(),
      approvedCostMinor: directCost.toString(),
      contributionMarginMinor: contribution.toString(),
      contributionMarginBps:
        revenue === 0n ? '0' : divideRounded(contribution * 10_000n, revenue).toString(),
      invoicedMinor: String(invoices.subtotal),
      invoicedGrossMinor: String(invoices.total),
      paidMinor: String(collected.total),
      receivableMinor: String(invoices.total - collected.total),
      approvedUnbilledWipMinor: (revenue > BigInt(invoices.subtotal)
        ? revenue - BigInt(invoices.subtotal)
        : 0n
      ).toString(),
      unapprovedWipMinor: (unapprovedWip + unapprovedExpenseWip).toString(),
      unapprovedLaborWipMinor: unapprovedWip.toString(),
      unapprovedExpenseWipMinor: unapprovedExpenseWip.toString(),
      budgetMinor: budget === null ? null : String(budget),
      remainingCapMinor:
        budget === null ? null : (BigInt(budget) - BigInt(invoices.subtotal)).toString(),
      budgetConsumedBps: budgetConsumedBps === null ? null : budgetConsumedBps.toString(),
      costBudgetConsumedBps:
        costBudgetConsumedBps === null ? null : costBudgetConsumedBps.toString(),
      hoursConsumedBps: hoursConsumedBps === null ? null : hoursConsumedBps.toString(),
      travelBudgetMinor:
        project.travel_budget_minor === null ? null : String(project.travel_budget_minor),
      travelBudgetConsumedBps:
        travelBudgetConsumedBps === null ? null : travelBudgetConsumedBps.toString(),
      plannedMinutes,
      plannedRemainingMinutes,
      estimateToCompleteMinor: estimateToComplete === null ? null : estimateToComplete.toString(),
      estimateToCompleteLaborCostMinor:
        estimateToCompleteLaborCost === null ? null : estimateToCompleteLaborCost.toString(),
      estimateAtCompletionCostMinor:
        estimateAtCompletionCost === null ? null : estimateAtCompletionCost.toString(),
      estimateAtCompletionRevenueMinor:
        estimateAtCompletionRevenue === null ? null : estimateAtCompletionRevenue.toString(),
      expectedFinalMarginMinor:
        expectedFinalMargin === null ? null : expectedFinalMargin.toString(),
      expectedFinalMarginBps:
        expectedFinalMargin === null ||
        estimateAtCompletionRevenue === null ||
        estimateAtCompletionRevenue === 0n
          ? null
          : divideRounded(expectedFinalMargin * 10_000n, estimateAtCompletionRevenue).toString(),
      forecastAvailable: estimateToComplete !== null,
      forecastBasis:
        plannedMinutes === null
          ? 'No detailed plan configured'
          : 'Actual plus active planning assignments',
      alerts,
      dailyMinimumTopUpMinor: dailyMinimumTopUp.toString(),
      missingRateCount: missingRates,
      timeEconomics: economics,
      dailyMinimumAdjustments,
      expenseEconomics,
    };
  }

  financePortfolio(principal: Principal, periodStart?: string, periodEnd?: string) {
    this.assertFinanceReadable(principal);
    if (periodStart) requireDate(periodStart, 'Period start');
    if (periodEnd) requireDate(periodEnd, 'Period end');
    const projects = this.sqlite
      .prepare(
        `SELECT p.id,p.project_number,p.name,p.currency,p.client_id,c.client_number,c.display_name client_name
         FROM project p JOIN client c ON c.id=p.client_id
         ORDER BY p.project_number`,
      )
      .all() as Array<{
      id: string;
      project_number: string;
      name: string;
      currency: V3Currency;
      client_id: string;
      client_number: string;
      client_name: string;
    }>;
    const permittedProjects = projects.filter(
      (project) => principal.role !== 'project_manager' || principal.projectIds.has(project.id),
    );
    const toBigInt = (value: unknown): bigint => BigInt(String(value ?? 0));
    const byClient = new Map<
      string,
      {
        clientId: string;
        clientNumber: string;
        clientName: string;
        currency: V3Currency;
        revenue: bigint;
        cost: bigint;
        invoiced: bigint;
        paid: bigint;
      }
    >();
    const byWorker = new Map<
      string,
      {
        workerId: string;
        workerName: string;
        currency: V3Currency;
        actualMinutes: number;
        billableMinutes: number;
        revenue: bigint;
        internalCost: bigint;
        compensation: bigint;
        travelCost: bigint;
        expenseCost: bigint;
      }
    >();
    const byMonth = new Map<
      string,
      { month: string; currency: V3Currency; actualMinutes: number; revenue: bigint; cost: bigint }
    >();
    const byWeek = new Map<
      string,
      {
        weekStart: string;
        currency: V3Currency;
        actualMinutes: number;
        revenue: bigint;
        cost: bigint;
      }
    >();
    const projectRows: Array<Record<string, unknown>> = [];
    const weekStart = (value: string): string => {
      const date = new Date(`${value}T00:00:00.000Z`);
      const day = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      return date.toISOString().slice(0, 10);
    };
    for (const project of permittedProjects) {
      const finance = this.projectFinance(principal, project.id, periodStart, periodEnd) as {
        actualMinutes: number;
        billableMinutes: number;
        revenueCandidateMinor: string;
        approvedCostMinor: string;
        invoicedMinor: string;
        paidMinor: string;
        receivableMinor: string;
        approvedUnbilledWipMinor: string;
        unapprovedWipMinor: string;
        contributionMarginMinor: string;
        contributionMarginBps: string;
        timeEconomics: Array<Record<string, unknown>>;
        expenseEconomics: Array<Record<string, unknown>>;
      };
      projectRows.push({
        projectId: project.id,
        projectNumber: project.project_number,
        projectName: project.name,
        clientId: project.client_id,
        clientNumber: project.client_number,
        clientName: project.client_name,
        currency: project.currency,
        ...finance,
      });
      const clientKey = `${project.client_id}:${project.currency}`;
      const client = byClient.get(clientKey) ?? {
        clientId: project.client_id,
        clientNumber: project.client_number,
        clientName: project.client_name,
        currency: project.currency,
        revenue: 0n,
        cost: 0n,
        invoiced: 0n,
        paid: 0n,
      };
      client.revenue += toBigInt(finance.revenueCandidateMinor);
      client.cost += toBigInt(finance.approvedCostMinor);
      client.invoiced += toBigInt(finance.invoicedMinor);
      client.paid += toBigInt(finance.paidMinor);
      byClient.set(clientKey, client);
      for (const row of finance.timeEconomics) {
        if (row.approved !== true) continue;
        const workerId = String(row.workerId ?? '');
        if (!workerId) continue;
        const workerKey = `${workerId}:${project.currency}`;
        const worker = byWorker.get(workerKey) ?? {
          workerId,
          workerName: String(row.workerName ?? workerId),
          currency: project.currency,
          actualMinutes: 0,
          billableMinutes: 0,
          revenue: 0n,
          internalCost: 0n,
          compensation: 0n,
          travelCost: 0n,
          expenseCost: 0n,
        };
        worker.actualMinutes += Number(row.actualMinutes ?? 0);
        worker.billableMinutes += Number(row.clientBillableMinutes ?? 0);
        worker.revenue += toBigInt(row.clientRevenueMinor);
        worker.internalCost += toBigInt(row.internalCostMinor);
        worker.compensation += toBigInt(row.workerCompensationMinor);
        byWorker.set(workerKey, worker);
        const date = String(row.workDate);
        const monthKey = `${date.slice(0, 7)}:${project.currency}`;
        const month = byMonth.get(monthKey) ?? {
          month: date.slice(0, 7),
          currency: project.currency,
          actualMinutes: 0,
          revenue: 0n,
          cost: 0n,
        };
        month.actualMinutes += Number(row.actualMinutes ?? 0);
        month.revenue += toBigInt(row.clientRevenueMinor);
        month.cost += toBigInt(row.internalCostMinor);
        byMonth.set(monthKey, month);
        const start = weekStart(date);
        const weekKey = `${start}:${project.currency}`;
        const week = byWeek.get(weekKey) ?? {
          weekStart: start,
          currency: project.currency,
          actualMinutes: 0,
          revenue: 0n,
          cost: 0n,
        };
        week.actualMinutes += Number(row.actualMinutes ?? 0);
        week.revenue += toBigInt(row.clientRevenueMinor);
        week.cost += toBigInt(row.internalCostMinor);
        byWeek.set(weekKey, week);
      }
      for (const row of finance.expenseEconomics) {
        if (!['approved', 'locked'].includes(String(row.approvalState))) continue;
        const workerId = String(row.workerId ?? '');
        const workerKey = `${workerId}:${project.currency}`;
        const worker = byWorker.get(workerKey);
        if (!worker) continue;
        const expense = toBigInt(row.costMinor);
        worker.expenseCost += expense;
        if (
          [
            'hotel',
            'rental_car',
            'fuel',
            'tolls',
            'parking',
            'airfare',
            'ground_transport',
            'meals',
            'per_diem',
          ].includes(String(row.category))
        )
          worker.travelCost += expense;
      }
    }
    const serialize = (row: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'bigint' ? value.toString() : value,
        ]),
      );
    const clientRows = [...byClient.values()].map((row) =>
      serialize({
        ...row,
        revenue: row.revenue,
        cost: row.cost,
        invoiced: row.invoiced,
        paid: row.paid,
        contribution: row.revenue - row.cost,
      }),
    );
    const workerRows = [...byWorker.values()].map((row) =>
      serialize({
        ...row,
        contribution: row.revenue - row.internalCost - row.expenseCost,
        marginBps:
          row.revenue === 0n
            ? '0'
            : divideRounded(
                (row.revenue - row.internalCost - row.expenseCost) * 10_000n,
                row.revenue,
              ),
      }),
    );
    const periodRows = (
      rows: Map<
        string,
        {
          actualMinutes: number;
          revenue: bigint;
          cost: bigint;
          currency: V3Currency;
          month?: string;
          weekStart?: string;
        }
      >,
    ) =>
      [...rows.values()].map((row) => serialize({ ...row, contribution: row.revenue - row.cost }));
    return {
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      projects: projectRows,
      byClient: clientRows,
      byWorker: workerRows,
      byMonth: periodRows(byMonth),
      byWeek: periodRows(byWeek),
    };
  }

  masterLedger(
    principal: Principal,
    filters: Readonly<{
      start?: string;
      end?: string;
      projectId?: string;
      workerId?: string;
      clientId?: string;
      legalEntityId?: string;
      currency?: V3Currency;
      streamType?: string;
      state?: string;
    }> = {},
  ) {
    this.assertFinanceReadable(principal);
    if (filters.projectId) this.assertProjectAccess(principal, filters.projectId, true);
    const clauses = [
      "i.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')",
    ];
    const values: DbValue[] = [];
    if (filters.start) {
      requireDate(filters.start, 'Start date');
      clauses.push('COALESCE(i.issued_at, i.created_at) >= ?');
      values.push(`${filters.start}T00:00:00.000Z`);
    }
    if (filters.end) {
      requireDate(filters.end, 'End date');
      clauses.push('COALESCE(i.issued_at, i.created_at) <= ?');
      values.push(`${filters.end}T23:59:59.999Z`);
    }
    if (filters.projectId) {
      clauses.push('i.project_id=?');
      values.push(filters.projectId);
    } else if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (ids.length === 0) return [];
      clauses.push(`i.project_id IN (${ids.map(() => '?').join(',')})`);
      values.push(...ids);
    }
    if (filters.clientId) {
      clauses.push('p.client_id=?');
      values.push(filters.clientId);
    }
    if (filters.legalEntityId) {
      clauses.push('br.legal_entity_id=?');
      values.push(filters.legalEntityId);
    }
    if (filters.currency) {
      clauses.push('i.currency=?');
      values.push(filters.currency);
    }
    if (filters.workerId) {
      clauses.push(
        "EXISTS (SELECT 1 FROM invoice_source worker_source JOIN time_entry worker_time ON worker_time.id=worker_source.source_id WHERE worker_source.invoice_id=i.id AND worker_source.source_type='time' AND worker_time.worker_id=?)",
      );
      values.push(filters.workerId);
    }
    if (filters.streamType) {
      clauses.push('i.stream_type=?');
      values.push(filters.streamType);
    }
    if (filters.state) {
      clauses.push('i.state=?');
      values.push(filters.state);
    }
    const invoices = this.sqlite
      .prepare(
        `SELECT i.id,i.invoice_number,i.project_id,i.stream_type,i.currency,i.period_start,i.period_end,
                i.issued_at,i.due_at,i.subtotal_minor,i.tax_minor,i.total_minor,i.state,
                p.project_number,p.name project_name,c.client_number,c.display_name client_name,
                p.po_number
         FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id
              JOIN billing_rule br ON br.id=i.billing_rule_id
         WHERE ${clauses.join(' AND ')} ORDER BY i.issued_at DESC,i.created_at DESC`,
      )
      .all(...values) as Array<{
      id: string;
      invoice_number: string | null;
      project_id: string;
      stream_type: string;
      currency: V3Currency;
      period_start: string | null;
      period_end: string | null;
      issued_at: string | null;
      due_at: string | null;
      subtotal_minor: number;
      tax_minor: number;
      total_minor: number;
      state: string;
      project_number: string;
      project_name: string;
      client_number: string;
      client_name: string;
      po_number: string | null;
    }>;
    return invoices.map((invoice) => {
      const paymentRows = this.sqlite
        .prepare(
          'SELECT id,amount_minor,currency,received_at,reference FROM payment WHERE invoice_id=? ORDER BY received_at',
        )
        .all(invoice.id) as Array<{
        id: string;
        amount_minor: number;
        currency: V3Currency;
        received_at: string;
        reference: string | null;
      }>;
      const payments = paymentRows.map((payment) => ({
        ...payment,
        amount_minor: String(payment.amount_minor),
      }));
      const firstPaymentDate = paymentRows[0]?.received_at ?? null;
      const lastPaymentDate = paymentRows[paymentRows.length - 1]?.received_at ?? null;
      const paidAt =
        BigInt(invoice.total_minor) > 0n &&
        paymentRows.reduce((sum, payment) => sum + BigInt(payment.amount_minor), 0n) >=
          BigInt(invoice.total_minor)
          ? lastPaymentDate
          : null;
      const sources = this.sqlite
        .prepare(
          'SELECT source_type,source_id,source_version,locked_at FROM invoice_source WHERE invoice_id=? ORDER BY source_type,source_id',
        )
        .all(invoice.id) as Array<{
        source_type: string;
        source_id: string;
        source_version: number;
        locked_at: string | null;
      }>;
      let directLabor = 0n;
      let travel = 0n;
      let other = 0n;
      const workers = new Set<string>();
      for (const source of sources) {
        if (source.source_type === 'time') {
          const row = this.sqlite
            .prepare(
              'SELECT worker_id,category,activity_code,work_date,minutes FROM time_entry WHERE id=?',
            )
            .get(source.source_id) as
            | {
                worker_id: string;
                category: string;
                activity_code: string | null;
                work_date: string;
                minutes: number;
              }
            | undefined;
          if (row) {
            workers.add(row.worker_id);
            if (!filters.workerId || filters.workerId === row.worker_id) {
              const rate = this.internalCostFor(
                invoice.project_id,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              );
              if (rate)
                directLabor += hourlyRateForMinutes(
                  money(invoice.currency, this.internalCostAmount(row, rate)),
                  row.minutes,
                ).minorUnits;
            }
          }
        } else if (source.source_type === 'expense') {
          const row = this.sqlite
            .prepare(
              'SELECT worker_id,category,amount_minor,project_currency_amount_minor,who_paid,billing_treatment FROM expense WHERE id=?',
            )
            .get(source.source_id) as
            | {
                worker_id: string;
                category: string;
                amount_minor: number;
                project_currency_amount_minor: number | null;
                who_paid: string;
                billing_treatment: string;
              }
            | undefined;
          if (row && (!filters.workerId || filters.workerId === row.worker_id)) {
            const amount = BigInt(row.project_currency_amount_minor ?? row.amount_minor);
            if (
              row.who_paid !== 'client' &&
              row.billing_treatment !== 'client_direct' &&
              [
                'hotel',
                'rental_car',
                'fuel',
                'tolls',
                'parking',
                'airfare',
                'ground_transport',
                'meals',
                'per_diem',
              ].includes(row.category)
            )
              travel += amount;
            else other += amount;
          }
        }
      }
      const directCost = directLabor + travel + other;
      const collected = payments.reduce((sum, payment) => sum + BigInt(payment.amount_minor), 0n);
      const outstanding = BigInt(invoice.total_minor) - collected;
      const contribution = BigInt(invoice.subtotal_minor) - directCost;
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientNumber: invoice.client_number,
        clientName: invoice.client_name,
        projectNumber: invoice.project_number,
        projectName: invoice.project_name,
        streamType: invoice.stream_type,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
        issueDate: invoice.issued_at,
        dueDate: invoice.due_at,
        currency: invoice.currency,
        subtotalMinor: String(invoice.subtotal_minor),
        taxMinor: String(invoice.tax_minor),
        totalMinor: String(invoice.total_minor),
        directLaborCostMinor: directLabor.toString(),
        travelCostMinor: travel.toString(),
        otherDirectCostMinor: other.toString(),
        directCostMinor: directCost.toString(),
        contributionMinor: contribution.toString(),
        contributionMarginBps:
          invoice.subtotal_minor === 0
            ? '0'
            : divideRounded(contribution * 10_000n, BigInt(invoice.subtotal_minor)).toString(),
        collectedMinor: collected.toString(),
        outstandingMinor: outstanding.toString(),
        firstPaymentDate,
        lastPaymentDate,
        paidAt,
        paymentStatus:
          outstanding <= 0n
            ? 'paid'
            : collected > 0n
              ? 'partially_paid'
              : invoice.state === 'overdue'
                ? 'overdue'
                : 'unpaid',
        billingStatus: invoice.state,
        poNumber: invoice.po_number,
        workerIds: [...workers],
        payments,
        sources,
      };
    });
  }

  recordPayment(
    principal: Principal,
    input: Readonly<{
      invoiceId: string;
      amountMinor: bigint;
      currency: V3Currency;
      receivedAt: string;
      reference?: string;
      idempotencyKey: string;
    }>,
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (input.amountMinor <= 0n) throw new V3ValidationError('Payment must be positive');
    if (!Number.isSafeInteger(Number(input.amountMinor)))
      throw new V3ValidationError('Payment is out of range');
    if (Number.isNaN(Date.parse(input.receivedAt)))
      throw new V3ValidationError('Payment date is invalid');
    if (input.idempotencyKey.trim().length < 8)
      throw new V3ValidationError('Payment idempotency key is required');
    return this.transaction(() => {
      const duplicate = this.sqlite
        .prepare('SELECT id,invoice_id,amount_minor,currency FROM payment WHERE idempotency_key=?')
        .get(input.idempotencyKey) as
        | { id: string; invoice_id: string; amount_minor: number; currency: V3Currency }
        | undefined;
      if (duplicate) {
        if (
          duplicate.invoice_id !== input.invoiceId ||
          duplicate.amount_minor !== sqliteInteger(input.amountMinor, 'Payment') ||
          duplicate.currency !== input.currency
        )
          throw new V3ConflictError('Payment idempotency key was already used for another payment');
        return { id: duplicate.id, created: false };
      }
      const invoice = this.sqlite
        .prepare(
          "SELECT id,total_minor,currency,state FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','overdue')",
        )
        .get(input.invoiceId) as
        | { id: string; total_minor: number; currency: V3Currency; state: string }
        | undefined;
      if (!invoice || invoice.currency !== input.currency)
        throw new V3ValidationError('Issued invoice in matching currency required');
      const paid = this.sqlite
        .prepare('SELECT COALESCE(sum(amount_minor),0) amount FROM payment WHERE invoice_id=?')
        .get(input.invoiceId) as { amount: number };
      if (BigInt(paid.amount) + input.amountMinor > BigInt(invoice.total_minor))
        throw new V3ValidationError('Payment exceeds invoice balance');
      const id = newId();
      const now = timestamp();
      this.sqlite
        .prepare(
          'INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          input.invoiceId,
          sqliteInteger(input.amountMinor, 'Payment'),
          input.currency,
          input.receivedAt,
          input.reference ?? null,
          now,
          input.idempotencyKey,
        );
      const totalPaid = BigInt(paid.amount) + input.amountMinor;
      const state = totalPaid === BigInt(invoice.total_minor) ? 'paid' : 'partially_paid';
      this.sqlite
        .prepare('UPDATE invoice SET state=?,updated_at=? WHERE id=?')
        .run(state, now, input.invoiceId);
      this.sqlite
        .prepare(
          'INSERT INTO invoice_event(id,invoice_id,event_type,amount_minor,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          input.invoiceId,
          'payment',
          sqliteInteger(input.amountMinor, 'Payment'),
          input.reference ?? 'Payment received',
          principal.userId,
          now,
          `payment-event:${input.idempotencyKey}`,
        );
      this.audit(principal, 'payment.record', 'payment', id, {
        invoiceId: input.invoiceId,
        amountMinor: input.amountMinor.toString(),
        state,
      });
      return { id, created: true, state };
    });
  }

  recordReimbursement(
    principal: Principal,
    input: Readonly<{
      expenseId: string;
      amountMinor?: bigint;
      reference: string;
    }>,
  ): { expenseId: string; amountMinor: string; state: 'reimbursed' } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const reference = requireText(input.reference, 'Reimbursement reference', 200);
    return this.transaction(() => {
      const expense = this.sqlite
        .prepare(
          "SELECT id,worker_id,amount_minor,reimbursement_amount_minor,reimbursement_state FROM expense WHERE id=? AND approval_state IN ('approved','locked') AND who_paid='worker'",
        )
        .get(input.expenseId) as
        | {
            id: string;
            worker_id: string;
            amount_minor: number;
            reimbursement_amount_minor: number | null;
            reimbursement_state: string;
          }
        | undefined;
      if (!expense) throw new V3ValidationError('Approved worker-paid expense required');
      if (expense.reimbursement_state === 'reimbursed')
        return {
          expenseId: expense.id,
          amountMinor: String(expense.reimbursement_amount_minor ?? expense.amount_minor),
          state: 'reimbursed',
        };
      const amount = input.amountMinor ?? BigInt(expense.amount_minor);
      if (amount <= 0n || amount > BigInt(expense.amount_minor))
        throw new V3ValidationError('Reimbursement amount is outside the expense balance');
      const now = timestamp();
      this.sqlite
        .prepare(
          "UPDATE expense SET reimbursement_amount_minor=?,reimbursement_state='reimbursed',reimbursed_at=?,reimbursement_reference=?,updated_at=?,version=version+1 WHERE id=? AND reimbursement_state<>'reimbursed'",
        )
        .run(sqliteInteger(amount, 'Reimbursement'), now, reference, now, expense.id);
      this.audit(principal, 'expense.reimburse', 'expense', expense.id, {
        workerId: expense.worker_id,
        amountMinor: amount.toString(),
        reference,
      });
      return { expenseId: expense.id, amountMinor: amount.toString(), state: 'reimbursed' };
    });
  }

  voidInvoice(
    principal: Principal,
    invoiceId: string,
    reason: string,
    idempotencyKey: string,
  ): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new V3AccessDeniedError('Owner role required');
    this.assertStepUp(principal);
    const invoice = this.sqlite
      .prepare(
        "SELECT id,state FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','overdue')",
      )
      .get(invoiceId) as { id: string; state: string } | undefined;
    if (!invoice) throw new V3ValidationError('Issued invoice required');
    requireText(reason, 'Void reason', 2000);
    if (idempotencyKey.trim().length < 8)
      throw new V3ValidationError('Void idempotency key is required');
    this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT id,invoice_id,event_type FROM invoice_event WHERE idempotency_key=?')
        .get(idempotencyKey) as { id: string; invoice_id: string; event_type: string } | undefined;
      if (existing) {
        if (existing.invoice_id !== invoiceId || existing.event_type !== 'void')
          throw new V3ConflictError('Void idempotency key was already used');
        return;
      }
      const now = timestamp();
      this.sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'void',?,?,?,?)",
        )
        .run(newId(), invoiceId, reason, principal.userId, now, idempotencyKey);
      this.sqlite
        .prepare("UPDATE invoice SET state='void',voided_at=?,updated_at=? WHERE id=?")
        .run(now, now, invoiceId);
      this.audit(principal, 'invoice.void', 'invoice', invoiceId, { reason });
    });
  }

  billingReadiness(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    this.assertFinance(principal);
    requireDate(periodStart, 'Period start');
    requireDate(periodEnd, 'Period end');
    const rule = this.sqlite
      .prepare(
        `SELECT br.id,br.project_id,br.stream_type,br.tax_profile_id,br.legal_entity_id,
                p.daily_report_required,p.technical_reporting_required
         FROM billing_rule br JOIN project p ON p.id=br.project_id
         WHERE br.id=? AND br.enabled=1`,
      )
      .get(billingRuleId) as
      | {
          id: string;
          project_id: string;
          stream_type: string;
          tax_profile_id: string | null;
          legal_entity_id: string | null;
          daily_report_required: number;
          technical_reporting_required: number;
        }
      | undefined;
    if (!rule) throw new V3ValidationError('Billing rule not found');
    const reasons: Array<{ code: string; sourceId?: string }> = [];
    if (!rule.tax_profile_id) reasons.push({ code: 'missing_tax_profile' });
    if (!rule.legal_entity_id) reasons.push({ code: 'missing_legal_entity' });
    if (rule.stream_type === 'labor') {
      const rows = this.sqlite
        .prepare(
          'SELECT id,worker_id,category,activity_code,work_date,approval_state,billability_state FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND invoice_id IS NULL',
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        category: string;
        activity_code: string | null;
        work_date: string;
        approval_state: string;
        billability_state: string;
      }>;
      for (const row of rows) {
        if (!['approved', 'locked'].includes(row.approval_state))
          reasons.push({ code: 'pending_time_approval', sourceId: row.id });
        if (
          ['approved', 'locked'].includes(row.approval_state) &&
          row.billability_state === 'billable'
        ) {
          if (
            !this.clientRateFor(
              rule.project_id,
              row.worker_id,
              row.category,
              row.work_date,
              row.activity_code,
            )
          )
            reasons.push({ code: 'missing_client_rate', sourceId: row.id });
          if (
            !this.internalCostFor(
              rule.project_id,
              row.worker_id,
              row.category,
              row.work_date,
              row.activity_code,
            )
          )
            reasons.push({ code: 'missing_internal_cost', sourceId: row.id });
          if (
            !this.compensationRuleFor(
              rule.project_id,
              row.worker_id,
              row.category,
              row.work_date,
              row.activity_code,
            )
          )
            reasons.push({ code: 'missing_compensation_rule', sourceId: row.id });
        }
      }
      if (rule.daily_report_required === 1) {
        const missing = this.sqlite
          .prepare(
            `SELECT DISTINCT t.work_date
             FROM time_entry t
             WHERE t.project_id=? AND t.work_date BETWEEN ? AND ?
               AND NOT EXISTS (
                 SELECT 1 FROM daily_report d
                 WHERE d.project_id=t.project_id AND d.work_date=t.work_date
                   AND d.approval_state IN ('approved','locked')
               )
             ORDER BY t.work_date`,
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{ work_date: string }>;
        reasons.push(
          ...missing.map((row) => ({
            code: 'missing_approved_daily_report',
            sourceId: `daily-report:${rule.project_id}:${row.work_date}`,
          })),
        );
      }
      if (rule.technical_reporting_required === 1) {
        const missing = this.sqlite
          .prepare(
            "SELECT ? id WHERE NOT EXISTS (SELECT 1 FROM technical_report t WHERE t.project_id=? AND substr(t.created_at,1,10) BETWEEN ? AND ? AND t.approval_state IN ('approved','locked'))",
          )
          .get(
            `technical-report:${rule.project_id}:${periodStart}:${periodEnd}`,
            rule.project_id,
            periodStart,
            periodEnd,
          ) as { id: string } | undefined;
        if (missing)
          reasons.push({ code: 'missing_approved_technical_report', sourceId: missing.id });
      }
    }
    if (rule.stream_type === 'expense') {
      const rows = this.sqlite
        .prepare(
          "SELECT id,approval_state,finance_approved_at,receipt_required,receipt_document_id FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND invoice_id IS NULL AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem'))",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{
        id: string;
        approval_state: string;
        finance_approved_at: string | null;
        receipt_required: number;
        receipt_document_id: string | null;
      }>;
      for (const row of rows) {
        if (row.approval_state !== 'approved' || !row.finance_approved_at)
          reasons.push({ code: 'pending_expense_approval', sourceId: row.id });
        if (row.receipt_required === 1 && !row.receipt_document_id)
          reasons.push({ code: 'missing_receipt', sourceId: row.id });
      }
    }
    const period = this.sqlite
      .prepare(
        'SELECT state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
      )
      .get(billingRuleId, periodStart, periodEnd) as { state: string } | undefined;
    return {
      state:
        period?.state === 'closed' ? 'already_closed' : reasons.length > 0 ? 'incomplete' : 'ready',
      reasons,
      projectId: rule.project_id,
      streamType: rule.stream_type,
    } as const;
  }

  closeBillingPeriod(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
    reportLocale: ReportLocale = 'en',
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const readiness = this.billingReadiness(principal, billingRuleId, periodStart, periodEnd);
    if (readiness.state !== 'ready') return { ...readiness, closed: false };
    return this.transaction(() => {
      const duplicate = this.sqlite
        .prepare(
          'SELECT id,state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
        )
        .get(billingRuleId, periodStart, periodEnd) as { id: string; state: string } | undefined;
      if (duplicate?.state === 'closed')
        return { ...readiness, closed: false, billingPeriodId: duplicate.id };
      const rule = this.sqlite
        .prepare('SELECT project_id,stream_type,policy_version FROM billing_rule WHERE id=?')
        .get(billingRuleId) as { project_id: string; stream_type: string; policy_version: number };
      const now = timestamp();
      const billingPeriodId = newId();
      if (duplicate)
        this.sqlite
          .prepare(
            "UPDATE billing_period SET state='closed',reasons_json='[]',closed_at=?,updated_at=?,version=version+1 WHERE id=?",
          )
          .run(now, now, duplicate.id);
      else
        this.sqlite
          .prepare(
            'INSERT INTO billing_period(id,billing_rule_id,period_start,period_end,state,reasons_json,closed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(
            billingPeriodId,
            billingRuleId,
            periodStart,
            periodEnd,
            'closed',
            '[]',
            now,
            now,
            now,
          );
      const effectiveBillingPeriodId = duplicate?.id ?? billingPeriodId;
      const lockId = newId();
      this.sqlite
        .prepare(
          'INSERT INTO billing_lock(id,project_id,stream_type,period_start,period_end,acquired_at) VALUES(?,?,?,?,?,?)',
        )
        .run(lockId, rule.project_id, rule.stream_type, periodStart, periodEnd, now);
      if (rule.stream_type === 'labor')
        this.sqlite
          .prepare(
            "UPDATE time_entry SET billing_status='locked',locked_at=?,locked_by=?,billing_lock_id=?,updated_at=?,version=version+1 WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state IN ('approved','locked') AND billability_state='billable' AND invoice_id IS NULL",
          )
          .run(now, principal.userId, lockId, now, rule.project_id, periodStart, periodEnd);
      if (rule.stream_type === 'expense')
        this.sqlite
          .prepare(
            "UPDATE expense SET billing_state='locked',billing_lock_id=?,updated_at=?,version=version+1 WHERE project_id=? AND spent_on BETWEEN ? AND ? AND approval_state='approved' AND finance_approved_at IS NOT NULL AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem')) AND invoice_id IS NULL",
          )
          .run(lockId, now, rule.project_id, periodStart, periodEnd);
      // A finance user may prepare a draft before the explicit period close.
      // Refresh draft source versions after locking so the draft remains
      // traceable to the authoritative rows. Issued invoices are untouched.
      const draftInvoices = this.sqlite
        .prepare(
          "SELECT id FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=? AND state IN ('draft','approved')",
        )
        .all(billingRuleId, periodStart, periodEnd) as Array<{ id: string }>;
      for (const invoice of draftInvoices) {
        const sources = this.sqlite
          .prepare(
            'SELECT source_type,source_id FROM invoice_source WHERE invoice_id=? AND locked_at IS NULL',
          )
          .all(invoice.id) as Array<{ source_type: string; source_id: string }>;
        for (const source of sources) {
          const table =
            source.source_type === 'time'
              ? 'time_entry'
              : source.source_type === 'expense'
                ? 'expense'
                : null;
          if (!table) continue;
          const row =
            table === 'time_entry'
              ? (this.sqlite
                  .prepare('SELECT version FROM time_entry WHERE id=?')
                  .get(source.source_id) as { version: number } | undefined)
              : (this.sqlite
                  .prepare('SELECT version FROM expense WHERE id=?')
                  .get(source.source_id) as { version: number } | undefined);
          if (row)
            this.sqlite
              .prepare(
                'UPDATE invoice_source SET source_version=? WHERE invoice_id=? AND source_type=? AND source_id=? AND locked_at IS NULL',
              )
              .run(row.version, invoice.id, source.source_type, source.source_id);
        }
      }
      const reportSnapshot = JSON.stringify({
        projectId: rule.project_id,
        periodStart,
        periodEnd,
        streamType: rule.stream_type,
        locale: normalizeReportLocale(reportLocale),
        generatedAt: now,
      });
      for (const audience of ['customer', 'internal'] as const)
        this.sqlite
          .prepare(
            'INSERT OR IGNORE INTO period_report(id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            newId(),
            rule.project_id,
            periodStart,
            periodEnd,
            audience,
            'period_summary',
            'draft',
            reportSnapshot,
            principal.userId,
            now,
            now,
          );
      this.enqueueJob(
        'period_close_report',
        `billing-close:${billingRuleId}:${periodStart}:${periodEnd}:${rule.policy_version}`,
        {
          billingRuleId,
          periodStart,
          periodEnd,
          projectId: rule.project_id,
          reportLocale: normalizeReportLocale(reportLocale),
        },
      );
      this.audit(principal, 'billing_period.close', 'billing_period', effectiveBillingPeriodId, {
        billingRuleId,
        periodStart,
        periodEnd,
      });
      return { ...readiness, closed: true, billingPeriodId: effectiveBillingPeriodId };
    });
  }

  refreshPeriodReports(
    principal: Principal,
    input: Readonly<{
      projectId: string;
      periodStart: string;
      periodEnd: string;
      reportLocale?: ReportLocale;
    }>,
  ): Array<{
    id: string;
    audience: 'customer' | 'internal';
    snapshot: Readonly<Record<string, unknown>>;
  }> {
    this.assertFinance(principal);
    requireDate(input.periodStart, 'Period start');
    requireDate(input.periodEnd, 'Period end');
    if (input.periodEnd < input.periodStart)
      throw new V3ValidationError('Period end must follow start');
    this.assertProjectAccess(principal, input.projectId);
    return this.transaction(() => {
      const project = this.sqlite
        .prepare(
          `SELECT p.id,p.project_number,p.name,p.currency,c.client_number,c.display_name client_name
           FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?`,
        )
        .get(input.projectId) as
        | {
            id: string;
            project_number: string;
            name: string;
            currency: V3Currency;
            client_number: string;
            client_name: string;
          }
        | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      const dailyReports = this.sqlite
        .prepare(
          `SELECT d.id,d.work_date,d.summary,d.safety_related,d.approval_state,u.name worker_name
           FROM daily_report d JOIN user u ON u.id=d.worker_id
           WHERE d.project_id=? AND d.work_date BETWEEN ? AND ? ORDER BY d.work_date,d.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        work_date: string;
        summary: string;
        safety_related: number;
        approval_state: string;
        worker_name: string;
      }>;
      const technicalReports = this.sqlite
        .prepare(
          `SELECT id,system_name,plant_site,area_line,station_machine,change_summary,safety_related,
                  validation,validation_result,open_risk,approval_state,created_at
           FROM technical_report
           WHERE project_id=? AND substr(created_at,1,10) BETWEEN ? AND ? ORDER BY created_at,id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        system_name: string;
        plant_site: string | null;
        area_line: string | null;
        station_machine: string | null;
        change_summary: string;
        safety_related: number;
        validation: string | null;
        validation_result: string | null;
        open_risk: string | null;
        approval_state: string;
        created_at: string;
      }>;
      const technicalChanges = this.sqlite
        .prepare(
          `SELECT id,technical_report_id,component,change_made,reason,safety_impact,production_impact,
                  validation,validation_result,open_risk,rollback_information,approval_state,created_at
           FROM technical_change
           WHERE project_id=? AND substr(created_at,1,10) BETWEEN ? AND ? ORDER BY created_at,id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<Record<string, unknown>>;
      const time = this.sqlite
        .prepare(
          `SELECT t.id,t.work_date,t.category,t.minutes,t.approval_state,u.name worker_name
           FROM time_entry t JOIN user u ON u.id=t.worker_id
           WHERE t.project_id=? AND t.work_date BETWEEN ? AND ? ORDER BY t.work_date,t.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        work_date: string;
        category: string;
        minutes: number;
        approval_state: string;
        worker_name: string;
      }>;
      const expenses = this.sqlite
        .prepare(
          `SELECT e.id,e.spent_on,e.vendor,e.category,e.currency,e.amount_minor,e.tax_amount_minor,
                  e.project_currency_amount_minor,e.who_paid,e.client_treatment,e.billing_treatment,
                  e.approval_state,e.receipt_document_id,e.billing_state,u.name worker_name
           FROM expense e JOIN user u ON u.id=e.worker_id
           WHERE e.project_id=? AND e.spent_on BETWEEN ? AND ? ORDER BY e.spent_on,e.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<Record<string, unknown>>;
      const documents = this.sqlite
        .prepare(
          `SELECT id,safe_filename,media_type,byte_length,sha256,sensitivity,created_at
           FROM document WHERE project_id=? AND state='committed' ORDER BY created_at,id`,
        )
        .all(input.projectId) as Array<Record<string, unknown>>;
      const reports = this.sqlite
        .prepare(
          'SELECT id,audience,state,snapshot_json FROM period_report WHERE project_id=? AND period_start=? AND period_end=? ORDER BY audience',
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        audience: 'customer' | 'internal';
        state: string;
        snapshot_json: string;
      }>;
      const reportSources: Array<{ reportId: string; sourceType: string; sourceId: string }> = [];
      const now = timestamp();
      const output: Array<{
        id: string;
        audience: 'customer' | 'internal';
        snapshot: Readonly<Record<string, unknown>>;
      }> = [];
      for (const report of reports) {
        let previousLocale: ReportLocale = 'en';
        try {
          const previous = JSON.parse(report.snapshot_json) as { locale?: unknown };
          previousLocale = normalizeReportLocale(previous.locale);
        } catch {
          previousLocale = 'en';
        }
        const reportLocale = normalizeReportLocale(input.reportLocale ?? previousLocale);
        const customer = report.audience === 'customer';
        const visibleDailyReports = customer
          ? dailyReports.filter((daily) => ['approved', 'locked'].includes(daily.approval_state))
          : dailyReports;
        const visibleTechnicalReports = customer
          ? technicalReports.filter((technical) =>
              ['approved', 'locked'].includes(technical.approval_state),
            )
          : technicalReports;
        const visibleTechnicalChanges = customer
          ? technicalChanges.filter((change) =>
              ['approved', 'locked'].includes(String(change.approval_state)),
            )
          : technicalChanges;
        const visibleTime = customer
          ? time.filter((row) => ['approved', 'locked'].includes(row.approval_state))
          : time;
        const visibleExpenses = customer
          ? expenses.filter(
              (expense) =>
                ['approved', 'locked'].includes(String(expense.approval_state)) &&
                (String(expense.billing_treatment).startsWith('reimbursable') ||
                  expense.billing_treatment === 'allowance_per_diem'),
            )
          : expenses;
        const visibleDocuments = customer
          ? documents.filter((document) => document.sensitivity === 'customer_private')
          : documents;
        const reportChanges = visibleTechnicalChanges.map((change) =>
          customer
            ? {
                component: change.component,
                changeMade: change.change_made,
                productionImpact: change.production_impact,
                validation: change.validation,
                validationResult: change.validation_result,
                safetyImpact: change.safety_impact,
                approvalState: change.approval_state,
              }
            : change,
        );
        const reportTechnical = visibleTechnicalReports.map((technical) =>
          customer
            ? {
                system: technical.system_name,
                site: technical.plant_site,
                area: technical.area_line,
                station: technical.station_machine,
                changes: technical.change_summary,
                safetyRelated: technical.safety_related,
                validation: technical.validation,
                validationResult: technical.validation_result,
                openRisk: technical.open_risk,
                approvalState: technical.approval_state,
              }
            : technical,
        );
        const reportDaily = visibleDailyReports.map((daily) => ({
          date: daily.work_date,
          worker: customer ? undefined : daily.worker_name,
          summary: daily.summary,
          safetyRelated: daily.safety_related,
          approvalState: daily.approval_state,
        }));
        const reportExpenses = visibleExpenses.map((expense) =>
          customer
            ? {
                date: expense.spent_on,
                vendor: expense.vendor,
                category: expense.category,
                amount: expense.currency === project.currency ? expense.amount_minor : null,
                currency: expense.currency,
                treatment: expense.client_treatment,
              }
            : expense,
        );
        const snapshot = {
          project: {
            id: project.id,
            number: project.project_number,
            name: project.name,
            currency: project.currency,
            clientNumber: project.client_number,
            clientName: project.client_name,
          },
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          audience: report.audience,
          locale: reportLocale,
          dailyReports: reportDaily,
          timeSummary: visibleTime.map((row) => ({
            date: row.work_date,
            category: row.category,
            minutes: row.minutes,
            worker: customer ? undefined : row.worker_name,
            approvalState: row.approval_state,
          })),
          technicalReports: reportTechnical,
          technicalChanges: reportChanges,
          expenses: reportExpenses,
          backupArtifacts: customer
            ? visibleDocuments.map((document) => ({
                filename: document.safe_filename,
                mediaType: document.media_type,
                description:
                  'Private project artifact available through the agreed delivery channel',
              }))
            : documents,
          generatedAt: now,
        } satisfies Record<string, unknown>;
        this.sqlite
          .prepare(
            "UPDATE period_report SET snapshot_json=?,state=CASE WHEN state='draft' THEN 'review' ELSE state END,updated_at=? WHERE id=?",
          )
          .run(JSON.stringify(snapshot), now, report.id);
        this.sqlite.prepare('DELETE FROM report_source WHERE report_id=?').run(report.id);
        for (const source of [
          ...visibleDailyReports.map((row) => ({ type: 'daily_report', id: row.id })),
          ...visibleTime.map((row) => ({ type: 'time_entry', id: row.id })),
          ...visibleTechnicalReports.map((row) => ({ type: 'technical_report', id: row.id })),
          ...visibleTechnicalChanges.map((row) => ({
            type: 'technical_change',
            id: String(row.id),
          })),
          ...visibleExpenses.map((row) => ({ type: 'expense', id: String(row.id) })),
          ...visibleDocuments.map((row) => ({ type: 'document', id: String(row.id) })),
        ]) {
          this.sqlite
            .prepare(
              'INSERT OR IGNORE INTO report_source(report_id,source_type,source_id) VALUES(?,?,?)',
            )
            .run(report.id, source.type, source.id);
          reportSources.push({ reportId: report.id, sourceType: source.type, sourceId: source.id });
        }
        output.push({ id: report.id, audience: report.audience, snapshot });
      }
      this.audit(principal, 'period_report.refresh', 'project', input.projectId, {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        reportIds: output.map((report) => report.id),
        sourceCount: reportSources.length,
      });
      return output;
    });
  }

  listPeriodReports(principal: Principal) {
    this.assertActive(principal);
    const clauses: string[] = [];
    const values: string[] = [];
    if (principal.role === 'project_manager' || principal.role === 'worker') {
      const projectIds = [...principal.projectIds];
      if (projectIds.length === 0) return [];
      clauses.push(`r.project_id IN (${projectIds.map(() => '?').join(',')})`);
      values.push(...projectIds);
    }
    if (principal.role === 'worker') clauses.push("r.audience='customer'");
    return this.sqlite
      .prepare(
        `SELECT r.id,r.project_id,r.period_start,r.period_end,r.audience,r.report_type,r.state,
                r.pdf_storage_key,r.pdf_sha256,r.created_at,r.updated_at,p.project_number,p.name project_name
         FROM period_report r JOIN project p ON p.id=r.project_id
         ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
         ORDER BY r.period_start DESC,r.audience,r.id LIMIT 200`,
      )
      .all(...values);
  }

  periodReportSnapshot(principal: Principal, reportId: string): Readonly<Record<string, unknown>> {
    this.assertActive(principal);
    const report = this.sqlite
      .prepare('SELECT project_id,audience,snapshot_json FROM period_report WHERE id=?')
      .get(reportId) as { project_id: string; audience: string; snapshot_json: string } | undefined;
    if (!report) throw new V3ValidationError('Period report not found');
    this.assertProjectAccess(principal, report.project_id, true);
    if (
      report.audience === 'internal' &&
      !canManageBilling(principal) &&
      principal.role !== 'auditor_read_only'
    )
      throw new V3AccessDeniedError('Internal report access required');
    return JSON.parse(report.snapshot_json) as Readonly<Record<string, unknown>>;
  }

  recordPeriodReportPdf(
    principal: Principal,
    reportId: string,
    storageKey: string,
    sha256: string,
    byteLength: number,
  ): void {
    this.assertFinance(principal);
    this.assertStorageKey(storageKey);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
      throw new V3ValidationError('Period report PDF metadata is invalid');
    const result = this.sqlite
      .prepare(
        "UPDATE period_report SET pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,updated_at=? WHERE id=? AND state IN ('review','approved','final') AND (pdf_sha256 IS NULL OR pdf_sha256=?)",
      )
      .run(storageKey, sha256, byteLength, timestamp(), reportId, sha256);
    if (result.changes !== 1) {
      const existing = this.sqlite
        .prepare('SELECT pdf_sha256 FROM period_report WHERE id=?')
        .get(reportId) as { pdf_sha256: string | null } | undefined;
      if (!existing || existing.pdf_sha256 !== sha256)
        throw new V3ConflictError('Period report PDF is already finalized with another hash');
    }
    this.audit(principal, 'period_report.pdf_ready', 'period_report', reportId, {
      storageKey,
      sha256,
      byteLength,
    });
  }

  periodReportPdfMetadata(
    principal: Principal,
    reportId: string,
  ): { storageKey: string; sha256: string; byteLength: number; filename: string } {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare(
        'SELECT project_id,audience,period_start,period_end,pdf_storage_key,pdf_sha256,pdf_byte_length FROM period_report WHERE id=?',
      )
      .get(reportId) as
      | {
          project_id: string;
          audience: string;
          period_start: string;
          period_end: string;
          pdf_storage_key: string | null;
          pdf_sha256: string | null;
          pdf_byte_length: number | null;
        }
      | undefined;
    if (!row?.pdf_storage_key || !row.pdf_sha256 || row.pdf_byte_length === null)
      throw new V3ValidationError('Period report PDF is not ready');
    this.assertProjectAccess(principal, row.project_id, true);
    if (row.audience === 'internal' && !canManageBilling(principal))
      throw new V3AccessDeniedError('Internal report access required');
    this.assertStorageKey(row.pdf_storage_key);
    return {
      storageKey: row.pdf_storage_key,
      sha256: row.pdf_sha256,
      byteLength: row.pdf_byte_length,
      filename: `period-report-${row.period_start}-${row.period_end}.pdf`,
    };
  }

  createAccountingPack(
    principal: Principal,
    periodStart: string,
    periodEnd: string,
    reportLocale: ReportLocale = 'en',
  ) {
    this.assertFinance(principal);
    requireDate(periodStart, 'Period start');
    requireDate(periodEnd, 'Period end');
    if (periodEnd < periodStart) throw new V3ValidationError('Period end must follow start');
    const existing = this.sqlite
      .prepare(
        'SELECT id,snapshot_json,reconciliation_json,state FROM accounting_pack_run WHERE period_start=? AND period_end=? AND legal_entity_id IS NULL',
      )
      .get(periodStart, periodEnd) as
      | { id: string; snapshot_json: string; reconciliation_json: string; state: string }
      | undefined;
    if (existing)
      return {
        id: existing.id,
        state: existing.state,
        snapshot: JSON.parse(existing.snapshot_json) as unknown,
        reconciliation: JSON.parse(existing.reconciliation_json) as unknown,
      };
    const ledger = this.masterLedger(principal, { start: periodStart, end: periodEnd });
    const addAmount = (
      map: Map<V3Currency, bigint>,
      currency: V3Currency,
      amount: bigint,
    ): void => {
      map.set(currency, (map.get(currency) ?? 0n) + amount);
    };
    const amountMap = (values: ReadonlyMap<V3Currency, bigint>): Record<string, string> =>
      Object.fromEntries(
        [...values.entries()].map(([currency, amount]) => [currency, amount.toString()]),
      );
    const invoiceRegister = ledger.map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      client: row.clientName,
      project: row.projectNumber,
      stream: row.streamType,
      servicePeriod: `${row.periodStart ?? ''}/${row.periodEnd ?? ''}`,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      currency: row.currency,
      netMinor: row.subtotalMinor,
      taxMinor: row.taxMinor,
      grossMinor: row.totalMinor,
      status: row.paymentStatus,
    }));
    const paymentRows = this.sqlite
      .prepare(
        `SELECT pa.id payment_id,pa.invoice_id,pa.amount_minor,pa.currency,pa.received_at,pa.reference,
                i.invoice_number,i.total_minor,i.currency invoice_currency,
                c.display_name client_name
         FROM payment pa
         JOIN invoice i ON i.id=pa.invoice_id
         JOIN project p ON p.id=i.project_id
         JOIN client c ON c.id=p.client_id
         WHERE substr(pa.received_at,1,10) BETWEEN ? AND ?
         ORDER BY pa.received_at,pa.id`,
      )
      .all(periodStart, periodEnd) as Array<{
      payment_id: string;
      invoice_id: string;
      amount_minor: number;
      currency: V3Currency;
      received_at: string;
      reference: string | null;
      invoice_number: string | null;
      total_minor: number;
      invoice_currency: V3Currency;
      client_name: string;
    }>;
    const totalCollectedByInvoice = new Map<string, bigint>();
    const allPaymentRows = this.sqlite
      .prepare('SELECT invoice_id,amount_minor FROM payment')
      .all() as Array<{ invoice_id: string; amount_minor: number }>;
    for (const payment of allPaymentRows)
      totalCollectedByInvoice.set(
        payment.invoice_id,
        (totalCollectedByInvoice.get(payment.invoice_id) ?? 0n) + BigInt(payment.amount_minor),
      );
    const collections = paymentRows.map((payment) => ({
      paymentId: payment.payment_id,
      invoiceId: payment.invoice_id,
      invoiceNumber: payment.invoice_number,
      client: payment.client_name,
      grossInvoicedMinor: String(payment.total_minor),
      amountCollectedInMonthMinor: String(payment.amount_minor),
      totalCollectedToDateMinor: (totalCollectedByInvoice.get(payment.invoice_id) ?? 0n).toString(),
      outstandingMinor: (
        BigInt(payment.total_minor) - (totalCollectedByInvoice.get(payment.invoice_id) ?? 0n)
      ).toString(),
      paymentDate: payment.received_at,
      paymentReference: payment.reference,
      currency: payment.currency,
    }));
    const expenseRows = this.sqlite
      .prepare(
        `SELECT e.id,e.spent_on,e.worker_id,e.project_id,e.vendor,e.category,e.who_paid,
                COALESCE(e.billing_treatment,e.client_treatment) treatment,e.client_treatment,
                e.currency,e.amount_minor,e.tax_amount_minor,e.project_currency_amount_minor,
                e.billing_amount_minor,e.reimbursement_state,e.receipt_document_id,e.billing_state,
                e.invoice_id,p.project_number,p.currency project_currency,u.name worker_name
         FROM expense e JOIN project p ON p.id=e.project_id JOIN user u ON u.id=e.worker_id
         WHERE e.spent_on BETWEEN ? AND ? AND e.approval_state IN ('approved','locked') ORDER BY e.spent_on,e.id`,
      )
      .all(periodStart, periodEnd) as Array<{
      id: string;
      spent_on: string;
      worker_id: string;
      project_id: string;
      vendor: string;
      category: string;
      who_paid: string;
      treatment: string;
      client_treatment: string;
      currency: V3Currency;
      amount_minor: number;
      tax_amount_minor: number | null;
      project_currency_amount_minor: number | null;
      billing_amount_minor: number | null;
      reimbursement_state: string;
      receipt_document_id: string | null;
      billing_state: string;
      invoice_id: string | null;
      project_number: string;
      project_currency: V3Currency;
      worker_name: string;
    }>;
    const travelCategories = new Set([
      'hotel',
      'rental_car',
      'fuel',
      'tolls',
      'parking',
      'airfare',
      'ground_transport',
      'meals',
      'per_diem',
    ]);
    const expenseCostByCurrency = new Map<V3Currency, bigint>();
    const travelCostByCurrency = new Map<V3Currency, bigint>();
    const otherCostByCurrency = new Map<V3Currency, bigint>();
    const expenses = expenseRows.map((expense) => {
      const netProjectMinor = BigInt(expense.project_currency_amount_minor ?? expense.amount_minor);
      const taxMinor = BigInt(expense.tax_amount_minor ?? 0);
      if (expense.who_paid !== 'client' && expense.treatment !== 'client_direct') {
        addAmount(expenseCostByCurrency, expense.project_currency, netProjectMinor);
        addAmount(
          travelCategories.has(expense.category) ? travelCostByCurrency : otherCostByCurrency,
          expense.project_currency,
          netProjectMinor,
        );
      }
      return {
        expenseId: expense.id,
        date: expense.spent_on,
        workerId: expense.worker_id,
        worker: expense.worker_name,
        projectId: expense.project_id,
        project: expense.project_number,
        vendor: expense.vendor,
        category: expense.category,
        whoPaid: expense.who_paid,
        clientTreatment: expense.client_treatment,
        billingTreatment: expense.treatment,
        currency: expense.currency,
        amountMinor: String(expense.amount_minor),
        taxMinor: String(taxMinor),
        grossMinor: (BigInt(expense.amount_minor) + taxMinor).toString(),
        projectCurrency: expense.project_currency,
        projectCurrencyAmountMinor: netProjectMinor.toString(),
        billingAmountMinor:
          expense.billing_amount_minor === null ? null : String(expense.billing_amount_minor),
        reimbursementStatus: expense.reimbursement_state,
        billingStatus: expense.billing_state,
        invoiceId: expense.invoice_id,
        receiptDocumentId: expense.receipt_document_id,
      };
    });
    const timeRows = this.sqlite
      .prepare(
        `SELECT t.id,t.worker_id,t.project_id,t.category,t.work_date,t.activity_code,t.minutes,
                t.approval_state,t.billability_state,t.version,u.name worker_name,p.project_number,
                p.currency project_currency
         FROM time_entry t JOIN user u ON u.id=t.worker_id JOIN project p ON p.id=t.project_id
         WHERE t.work_date BETWEEN ? AND ? AND t.approval_state IN ('approved','locked')
         ORDER BY t.work_date,t.id`,
      )
      .all(periodStart, periodEnd) as Array<{
      id: string;
      worker_id: string;
      project_id: string;
      category: string;
      work_date: string;
      activity_code: string | null;
      minutes: number;
      approval_state: string;
      billability_state: string;
      version: number;
      worker_name: string;
      project_number: string;
      project_currency: V3Currency;
    }>;
    const timeByWorkerProject = new Map<
      string,
      {
        workerId: string;
        worker: string;
        projectId: string;
        project: string;
        currency: V3Currency;
        actualMinutes: number;
        regularMinutes: number;
        standbyMinutes: number;
        overtimeMinutes: number;
        travelMinutes: number;
        compensationMinor: bigint;
        compensationRuleTypes: Set<string>;
        compensationBases: Set<string>;
        internalLaborCostMinor: bigint;
        sourceTimeIds: string[];
        missingCostRuleCount: number;
        dailyCompensationDays: Set<string>;
        fixedCompensationRules: Set<string>;
        guaranteeActualByRuleDay: Map<string, { rule: CompensationRuleRow; minutes: number }>;
      }
    >();
    for (const row of timeRows) {
      const key = `${row.worker_id}:${row.project_id}`;
      const current = timeByWorkerProject.get(key) ?? {
        workerId: row.worker_id,
        worker: row.worker_name,
        projectId: row.project_id,
        project: row.project_number,
        currency: row.project_currency,
        actualMinutes: 0,
        regularMinutes: 0,
        standbyMinutes: 0,
        overtimeMinutes: 0,
        travelMinutes: 0,
        compensationMinor: 0n,
        compensationRuleTypes: new Set<string>(),
        compensationBases: new Set<string>(),
        internalLaborCostMinor: 0n,
        sourceTimeIds: [],
        missingCostRuleCount: 0,
        dailyCompensationDays: new Set<string>(),
        fixedCompensationRules: new Set<string>(),
        guaranteeActualByRuleDay: new Map<string, { rule: CompensationRuleRow; minutes: number }>(),
      };
      current.actualMinutes += row.minutes;
      if (row.category === 'overtime') current.overtimeMinutes += row.minutes;
      else if (row.category === 'standby') current.standbyMinutes += row.minutes;
      else if (row.category === 'travel') current.travelMinutes += row.minutes;
      else current.regularMinutes += row.minutes;
      current.sourceTimeIds.push(row.id);
      const timeRow = {
        id: row.id,
        project_id: row.project_id,
        worker_id: row.worker_id,
        work_date: row.work_date,
        category: row.category,
        activity_code: row.activity_code,
        minutes: row.minutes,
        approval_state: row.approval_state,
        billability_state: row.billability_state,
        project_currency: row.project_currency,
      } satisfies TimeRow;
      const compensationRule = this.compensationRuleFor(
        row.project_id,
        row.worker_id,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const clientRate = this.clientRateFor(
        row.project_id,
        row.worker_id,
        row.category,
        row.work_date,
        row.activity_code,
      );
      if (compensationRule) {
        current.compensationRuleTypes.add(compensationRule.rule_type);
        if (compensationRule.percentage_basis)
          current.compensationBases.add(compensationRule.percentage_basis);
        if (
          compensationRule.rule_type === 'FixedPerBillingPeriod' ||
          compensationRule.rule_type === 'FixedProjectAmount' ||
          compensationRule.rule_type === 'CustomApprovedAdjustment'
        ) {
          if (!current.fixedCompensationRules.has(compensationRule.id)) {
            current.fixedCompensationRules.add(compensationRule.id);
            current.compensationMinor += BigInt(compensationRule.rate_minor);
          }
        } else if (
          compensationRule.rule_type === 'Daily' ||
          compensationRule.rate_basis === 'daily'
        ) {
          const dayKey = `${compensationRule.id}:${row.work_date}`;
          if (!current.dailyCompensationDays.has(dayKey)) {
            current.dailyCompensationDays.add(dayKey);
            current.compensationMinor += BigInt(compensationRule.rate_minor);
          }
        } else {
          current.compensationMinor += this.compensationAmount(
            timeRow,
            compensationRule,
            clientRate,
          );
        }
        if (
          compensationRule.rule_type === 'Hourly' &&
          compensationRule.rate_basis !== 'daily' &&
          compensationRule.daily_guarantee_minutes
        ) {
          const guaranteeKey = `${compensationRule.id}:${row.work_date}`;
          const day = current.guaranteeActualByRuleDay.get(guaranteeKey) ?? {
            rule: compensationRule,
            minutes: 0,
          };
          day.minutes += row.minutes;
          current.guaranteeActualByRuleDay.set(guaranteeKey, day);
        }
      }
      const internalRate = this.internalCostFor(
        row.project_id,
        row.worker_id,
        row.category,
        row.work_date,
        row.activity_code,
      );
      if (!internalRate || internalRate.currency !== row.project_currency)
        current.missingCostRuleCount += 1;
      else
        current.internalLaborCostMinor += hourlyRateForMinutes(
          money(row.project_currency, this.internalCostAmount(timeRow, internalRate)),
          row.minutes,
        ).minorUnits;
      timeByWorkerProject.set(key, current);
    }
    for (const current of timeByWorkerProject.values())
      for (const { rule, minutes } of current.guaranteeActualByRuleDay.values()) {
        const topUp = Math.max(0, (rule.daily_guarantee_minutes ?? 0) - minutes);
        if (topUp > 0)
          current.compensationMinor += hourlyRateForMinutes(
            money(rule.currency, BigInt(rule.rate_minor)),
            topUp,
          ).minorUnits;
      }
    const reimbursementRows = this.sqlite
      .prepare(
        `SELECT worker_id,project_id,COALESCE(SUM(COALESCE(project_currency_amount_minor,amount_minor)),0) amount
         FROM expense
         WHERE spent_on BETWEEN ? AND ? AND approval_state IN ('approved','locked') AND who_paid='worker'
         GROUP BY worker_id,project_id`,
      )
      .all(periodStart, periodEnd) as Array<{
      worker_id: string;
      project_id: string;
      amount: number;
    }>;
    const reimbursementByWorkerProject = new Map(
      reimbursementRows.map((row) => [`${row.worker_id}:${row.project_id}`, BigInt(row.amount)]),
    );
    const settledRows = this.sqlite
      .prepare(
        `SELECT worker_id,project_id,COALESCE(SUM(amount_minor),0) amount
         FROM compensation_settlement
         WHERE period_start=? AND period_end=? AND state IN ('approved','settled')
         GROUP BY worker_id,project_id`,
      )
      .all(periodStart, periodEnd) as Array<{
      worker_id: string;
      project_id: string;
      amount: number;
    }>;
    const settledByWorkerProject = new Map(
      settledRows.map((row) => [`${row.worker_id}:${row.project_id}`, BigInt(row.amount)]),
    );
    const workerCosts = [...timeByWorkerProject.values()].map((row) => ({
      workerId: row.workerId,
      worker: row.worker,
      projectId: row.projectId,
      project: row.project,
      currency: row.currency,
      actualApprovedMinutes: row.actualMinutes,
      regularMinutes: row.regularMinutes,
      standbyMinutes: row.standbyMinutes,
      overtimeMinutes: row.overtimeMinutes,
      travelMinutes: row.travelMinutes,
      compensationRuleType: [...row.compensationRuleTypes].join('|') || null,
      compensationBasis: [...row.compensationBases].join('|') || null,
      approvedCompensationMinor: row.compensationMinor.toString(),
      settledCompensationMinor: (
        settledByWorkerProject.get(`${row.workerId}:${row.projectId}`) ?? 0n
      ).toString(),
      internalLoadedLaborCostMinor: row.internalLaborCostMinor.toString(),
      reimbursementMinor: (
        reimbursementByWorkerProject.get(`${row.workerId}:${row.projectId}`) ?? 0n
      ).toString(),
      missingCostRuleCount: row.missingCostRuleCount,
      sourceTimeIds: row.sourceTimeIds,
    }));
    const workerCompensationByCurrency = new Map<V3Currency, bigint>();
    const internalLaborByCurrency = new Map<V3Currency, bigint>();
    for (const row of workerCosts) {
      addAmount(workerCompensationByCurrency, row.currency, BigInt(row.approvedCompensationMinor));
      addAmount(internalLaborByCurrency, row.currency, BigInt(row.internalLoadedLaborCostMinor));
    }
    const invoiceNetByCurrency = new Map<V3Currency, bigint>();
    const invoiceTaxByCurrency = new Map<V3Currency, bigint>();
    const invoiceGrossByCurrency = new Map<V3Currency, bigint>();
    for (const row of ledger) {
      addAmount(invoiceNetByCurrency, row.currency, BigInt(row.subtotalMinor));
      addAmount(invoiceTaxByCurrency, row.currency, BigInt(row.taxMinor));
      addAmount(invoiceGrossByCurrency, row.currency, BigInt(row.totalMinor));
    }
    const collectedByCurrency = new Map<V3Currency, bigint>();
    for (const row of collections)
      addAmount(collectedByCurrency, row.currency, BigInt(row.amountCollectedInMonthMinor));
    const directCostByCurrency = new Map<V3Currency, bigint>();
    for (const [currency, amount] of internalLaborByCurrency)
      addAmount(directCostByCurrency, currency, amount);
    for (const [currency, amount] of expenseCostByCurrency)
      addAmount(directCostByCurrency, currency, amount);
    const currencies = new Set<V3Currency>([
      ...invoiceNetByCurrency.keys(),
      ...directCostByCurrency.keys(),
      ...collectedByCurrency.keys(),
    ]);
    const totalsByCurrency = [...currencies].sort().map((currency) => {
      const invoiceNet = invoiceNetByCurrency.get(currency) ?? 0n;
      const directCost = directCostByCurrency.get(currency) ?? 0n;
      const contribution = invoiceNet - directCost;
      return {
        currency,
        laborInvoicedMinor: ledger
          .filter((row) => row.currency === currency && row.streamType === 'labor')
          .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
          .toString(),
        expenseInvoicedMinor: ledger
          .filter((row) => row.currency === currency && row.streamType === 'expense')
          .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
          .toString(),
        milestoneOtherInvoicedMinor: ledger
          .filter(
            (row) => row.currency === currency && !['labor', 'expense'].includes(row.streamType),
          )
          .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
          .toString(),
        totalInvoicedMinor: invoiceNet.toString(),
        taxInvoicedMinor: (invoiceTaxByCurrency.get(currency) ?? 0n).toString(),
        grossInvoicedMinor: (invoiceGrossByCurrency.get(currency) ?? 0n).toString(),
        collectedMinor: (collectedByCurrency.get(currency) ?? 0n).toString(),
        outstandingMinor: ledger
          .filter((row) => row.currency === currency)
          .reduce((sum, row) => sum + BigInt(row.outstandingMinor), 0n)
          .toString(),
        workerCompensationMinor: (workerCompensationByCurrency.get(currency) ?? 0n).toString(),
        internalLaborCostMinor: (internalLaborByCurrency.get(currency) ?? 0n).toString(),
        travelCostMinor: (travelCostByCurrency.get(currency) ?? 0n).toString(),
        otherDirectCostMinor: (otherCostByCurrency.get(currency) ?? 0n).toString(),
        directCostMinor: directCost.toString(),
        contributionMinor: contribution.toString(),
        contributionMarginBps:
          invoiceNet === 0n ? '0' : divideRounded(contribution * 10_000n, invoiceNet).toString(),
      };
    });
    const totals =
      totalsByCurrency.length === 1
        ? totalsByCurrency[0]
        : {
            currency: 'MULTI',
            laborInvoicedMinor: null,
            expenseInvoicedMinor: null,
            milestoneOtherInvoicedMinor: null,
            totalInvoicedMinor: null,
            taxInvoicedMinor: null,
            grossInvoicedMinor: null,
            collectedMinor: null,
            outstandingMinor: null,
            workerCompensationMinor: null,
            internalLaborCostMinor: null,
            travelCostMinor: null,
            otherDirectCostMinor: null,
            directCostMinor: null,
            contributionMinor: null,
            contributionMarginBps: null,
          };
    const sourceMismatches: Array<Record<string, string>> = [];
    let invoiceSourceCount = 0;
    for (const invoice of ledger)
      for (const source of invoice.sources) {
        invoiceSourceCount += 1;
        let currentVersion: number | null = null;
        let linkedInvoiceId: string | null = null;
        if (source.source_type === 'time') {
          const row = this.sqlite
            .prepare('SELECT version,invoice_id FROM time_entry WHERE id=?')
            .get(source.source_id) as { version: number; invoice_id: string | null } | undefined;
          currentVersion = row?.version ?? null;
          linkedInvoiceId = row?.invoice_id ?? null;
        } else if (source.source_type === 'expense') {
          const row = this.sqlite
            .prepare('SELECT version,invoice_id FROM expense WHERE id=?')
            .get(source.source_id) as { version: number; invoice_id: string | null } | undefined;
          currentVersion = row?.version ?? null;
          linkedInvoiceId = row?.invoice_id ?? null;
        } else if (source.source_type === 'milestone') {
          const row = this.sqlite
            .prepare('SELECT version,invoice_id FROM project_milestone WHERE id=?')
            .get(source.source_id) as { version: number; invoice_id: string | null } | undefined;
          currentVersion = row?.version ?? null;
          linkedInvoiceId = row?.invoice_id ?? null;
        } else if (source.source_type === 'adjustment') {
          const row = this.sqlite
            .prepare('SELECT adjustment_invoice_id FROM invoice_adjustment WHERE id=?')
            .get(source.source_id) as { adjustment_invoice_id: string } | undefined;
          linkedInvoiceId = row?.adjustment_invoice_id ?? null;
          currentVersion = row ? source.source_version : null;
        }
        if (currentVersion !== source.source_version)
          sourceMismatches.push({
            invoiceId: invoice.invoiceId,
            sourceType: source.source_type,
            sourceId: source.source_id,
            reason: 'source_version_mismatch',
          });
        if (linkedInvoiceId !== null && linkedInvoiceId !== invoice.invoiceId)
          sourceMismatches.push({
            invoiceId: invoice.invoiceId,
            sourceType: source.source_type,
            sourceId: source.source_id,
            reason: 'source_invoice_link_mismatch',
          });
        if (linkedInvoiceId === null && source.source_type !== 'adjustment')
          sourceMismatches.push({
            invoiceId: invoice.invoiceId,
            sourceType: source.source_type,
            sourceId: source.source_id,
            reason: 'source_not_linked',
          });
      }
    const approvedTimeEntryCount = timeRows.length;
    const approvedExpenseCount = expenseRows.length;
    const invoiceRegisterNetByCurrency = amountMap(invoiceNetByCurrency);
    const directCostByCurrencyJson = amountMap(directCostByCurrency);
    const workerCostSourceByCurrency = new Map<V3Currency, bigint>();
    for (const row of workerCosts)
      addAmount(workerCostSourceByCurrency, row.currency, BigInt(row.internalLoadedLaborCostMinor));
    const expenseSourceCostByCurrency = new Map<V3Currency, bigint>();
    for (const row of expenses) {
      if (row.whoPaid === 'client' || row.billingTreatment === 'client_direct') continue;
      addAmount(
        expenseSourceCostByCurrency,
        row.projectCurrency,
        BigInt(row.projectCurrencyAmountMinor),
      );
    }
    const paymentSourceByCurrency = new Map<V3Currency, bigint>();
    for (const row of collections)
      addAmount(paymentSourceByCurrency, row.currency, BigInt(row.amountCollectedInMonthMinor));
    const mapEquals = (
      left: ReadonlyMap<V3Currency, bigint>,
      right: ReadonlyMap<V3Currency, bigint>,
    ) => {
      const currencies = new Set([...left.keys(), ...right.keys()]);
      return [...currencies].every(
        (currency) => (left.get(currency) ?? 0n) === (right.get(currency) ?? 0n),
      );
    };
    const directCostSourceByCurrency = new Map<V3Currency, bigint>();
    for (const [currency, amount] of workerCostSourceByCurrency)
      addAmount(directCostSourceByCurrency, currency, amount);
    for (const [currency, amount] of expenseSourceCostByCurrency)
      addAmount(directCostSourceByCurrency, currency, amount);
    const contributionByCurrency = new Map<V3Currency, bigint>();
    for (const [currency, amount] of invoiceNetByCurrency)
      contributionByCurrency.set(
        currency,
        amount - (directCostSourceByCurrency.get(currency) ?? 0n),
      );
    const ledgerContributionByCurrency = new Map<V3Currency, bigint>();
    for (const [currency, amount] of invoiceNetByCurrency)
      ledgerContributionByCurrency.set(
        currency,
        amount - (directCostByCurrency.get(currency) ?? 0n),
      );
    const laborCostReconciles = mapEquals(workerCostSourceByCurrency, internalLaborByCurrency);
    const expenseCostReconciles = mapEquals(expenseSourceCostByCurrency, expenseCostByCurrency);
    const directCostReconciles = mapEquals(directCostSourceByCurrency, directCostByCurrency);
    const paymentReconciles = mapEquals(paymentSourceByCurrency, collectedByCurrency);
    const contributionReconciles = mapEquals(contributionByCurrency, ledgerContributionByCurrency);
    const snapshot = {
      periodStart,
      periodEnd,
      locale: normalizeReportLocale(reportLocale),
      generatedAt: timestamp(),
      invoiceRegister,
      collections,
      workerCosts,
      expenseRegister: expenses,
      ledger,
      totals,
      totalsByCurrency,
      sourceReconciliation: {
        invoiceSourceCount,
        sourceMismatches,
        approvedTimeEntryCount,
        approvedExpenseCount,
      },
      exactReconciliation: {
        invoiceNetByCurrency: invoiceRegisterNetByCurrency,
        paymentByCurrency: amountMap(paymentSourceByCurrency),
        workerCostByCurrency: amountMap(workerCostSourceByCurrency),
        expenseCostByCurrency: amountMap(expenseSourceCostByCurrency),
        directCostByCurrency: directCostByCurrencyJson,
        contributionByCurrency: amountMap(contributionByCurrency),
      },
    };
    const reconciliation = {
      invoiceRegisterGrossByCurrency: amountMap(invoiceGrossByCurrency),
      invoiceRegisterNetByCurrency,
      directCostByCurrency: directCostByCurrencyJson,
      invoiceSourceCount,
      sourceMismatchCount: sourceMismatches.length,
      approvedTimeEntryCount,
      approvedExpenseCount,
      paymentCount: paymentRows.length,
      collectedInMonthByCurrency: amountMap(collectedByCurrency),
      workerCostSourceByCurrency: amountMap(workerCostSourceByCurrency),
      expenseCostSourceByCurrency: amountMap(expenseSourceCostByCurrency),
      directCostSourceByCurrency: amountMap(directCostSourceByCurrency),
      contributionByCurrency: amountMap(contributionByCurrency),
      checks: {
        invoiceSources: sourceMismatches.length === 0,
        payments: paymentReconciles,
        workerCosts: laborCostReconciles,
        expenses: expenseCostReconciles,
        directCosts: directCostReconciles,
        contribution: contributionReconciles,
      },
      reconciles:
        sourceMismatches.length === 0 &&
        invoiceSourceCount === ledger.reduce<number>((sum, row) => sum + row.sources.length, 0) &&
        paymentReconciles &&
        laborCostReconciles &&
        expenseCostReconciles &&
        directCostReconciles &&
        contributionReconciles,
    };
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        'INSERT INTO accounting_pack_run(id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,generated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        periodStart,
        periodEnd,
        null,
        'draft',
        JSON.stringify(snapshot),
        JSON.stringify(reconciliation),
        principal.userId,
        now,
        now,
      );
    this.enqueueJob('accounting_pack', `accounting-pack:${id}`, { packId: id }, now);
    this.audit(principal, 'accounting_pack.create', 'accounting_pack_run', id, {
      periodStart,
      periodEnd,
    });
    return { id, state: 'draft', snapshot, reconciliation };
  }

  markAccountingPackFinal(principal: Principal, packId: string): void {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const result = this.sqlite
      .prepare(
        "UPDATE accounting_pack_run SET state='final',updated_at=? WHERE id=? AND state IN ('draft','review')",
      )
      .run(timestamp(), packId);
    if (result.changes !== 1) throw new V3ConflictError('Accounting Pack is not reviewable');
    this.audit(principal, 'accounting_pack.finalize', 'accounting_pack_run', packId, {});
  }

  listAccountingPacks(principal: Principal) {
    this.assertFinanceReadable(principal);
    return this.sqlite
      .prepare(
        'SELECT id,period_start,period_end,state,reconciliation_json,created_at,updated_at FROM accounting_pack_run ORDER BY period_start DESC LIMIT 24',
      )
      .all();
  }

  invoiceSnapshot(principal: Principal, invoiceId: string): Readonly<Record<string, unknown>> {
    this.assertFinanceReadable(principal);
    const invoice = this.sqlite
      .prepare('SELECT id,state,snapshot_json FROM invoice WHERE id=?')
      .get(invoiceId) as { id: string; state: string; snapshot_json: string | null } | undefined;
    if (
      !invoice ||
      !invoice.snapshot_json ||
      !['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'credited'].includes(
        invoice.state,
      )
    )
      throw new V3ValidationError('Issued invoice snapshot required');
    return JSON.parse(invoice.snapshot_json) as Readonly<Record<string, unknown>>;
  }

  accountingPackSnapshot(principal: Principal, packId: string): Readonly<Record<string, unknown>> {
    this.assertFinanceReadable(principal);
    const pack = this.sqlite
      .prepare('SELECT snapshot_json FROM accounting_pack_run WHERE id=?')
      .get(packId) as { snapshot_json: string } | undefined;
    if (!pack) throw new V3ValidationError('Accounting Pack not found');
    return JSON.parse(pack.snapshot_json) as Readonly<Record<string, unknown>>;
  }

  recordInvoicePdf(
    principal: Principal,
    invoiceId: string,
    storageKey: string,
    sha256: string,
    byteLength: number,
  ): void {
    this.assertFinance(principal);
    this.assertStorageKey(storageKey);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
      throw new V3ValidationError('Invoice PDF metadata is invalid');
    const result = this.sqlite
      .prepare(
        "UPDATE invoice SET pdf_status='ready',pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,pdf_generated_at=?,updated_at=? WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue','void','credited') AND (pdf_sha256 IS NULL OR pdf_sha256=?)",
      )
      .run(storageKey, sha256, byteLength, timestamp(), timestamp(), invoiceId, sha256);
    if (result.changes !== 1) {
      const existing = this.sqlite
        .prepare('SELECT pdf_sha256 FROM invoice WHERE id=?')
        .get(invoiceId) as { pdf_sha256: string | null } | undefined;
      if (!existing || existing.pdf_sha256 !== sha256)
        throw new V3ConflictError('Invoice PDF is already finalized with another hash');
    }
    this.audit(principal, 'invoice.pdf_ready', 'invoice', invoiceId, {
      storageKey,
      sha256,
      byteLength,
    });
  }

  recordAccountingPackExport(
    principal: Principal,
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    storageKey: string,
    sha256: string,
    byteLength: number,
  ): { id: string; created: boolean } {
    this.assertFinance(principal);
    this.assertStorageKey(storageKey);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength < 0)
      throw new V3ValidationError('Accounting Pack export metadata is invalid');
    const existing = this.sqlite
      .prepare('SELECT id,sha256 FROM accounting_pack_export WHERE pack_run_id=? AND export_type=?')
      .get(packId, exportType) as { id: string; sha256: string } | undefined;
    if (existing) {
      if (existing.sha256 !== sha256)
        throw new V3ConflictError('Accounting Pack export already exists');
      return { id: existing.id, created: false };
    }
    const pack = this.sqlite.prepare('SELECT id FROM accounting_pack_run WHERE id=?').get(packId);
    if (!pack) throw new V3ValidationError('Accounting Pack not found');
    const id = newId();
    this.sqlite
      .prepare(
        'INSERT INTO accounting_pack_export(id,pack_run_id,export_type,storage_key,sha256,byte_length,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, packId, exportType, storageKey, sha256, byteLength, timestamp());
    this.audit(principal, 'accounting_pack.export', 'accounting_pack_run', packId, {
      exportType,
      storageKey,
      sha256,
      byteLength,
    });
    return { id, created: true };
  }

  accountingPackExport(
    principal: Principal,
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
  ): {
    storageKey: string;
    sha256: string;
    byteLength: number;
    mediaType: string;
    filename: string;
  } {
    this.assertFinance(principal);
    const row = this.sqlite
      .prepare(
        'SELECT storage_key,sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? AND export_type=?',
      )
      .get(packId, exportType) as
      | { storage_key: string; sha256: string; byte_length: number }
      | undefined;
    if (!row) throw new V3ValidationError('Accounting Pack export not found');
    this.assertStorageKey(row.storage_key);
    const extension =
      exportType === 'pdf'
        ? 'pdf'
        : exportType === 'xlsx'
          ? 'xlsx'
          : exportType === 'json'
            ? 'json'
            : 'csv';
    const mediaType =
      exportType === 'pdf'
        ? 'application/pdf'
        : exportType === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : exportType === 'json'
            ? 'application/json; charset=utf-8'
            : 'text/csv; charset=utf-8';
    return {
      storageKey: row.storage_key,
      sha256: row.sha256,
      byteLength: row.byte_length,
      mediaType,
      filename: `accounting-pack-${packId}.${extension}`,
    };
  }

  invoicePdfMetadata(
    principal: Principal,
    invoiceId: string,
  ): {
    storageKey: string;
    sha256: string;
    byteLength?: number;
    mediaType: string;
    filename: string;
  } {
    this.assertFinanceReadable(principal);
    const row = this.sqlite
      .prepare(
        "SELECT invoice_number,pdf_storage_key,pdf_sha256,pdf_byte_length FROM invoice WHERE id=? AND pdf_status='ready'",
      )
      .get(invoiceId) as
      | {
          invoice_number: string | null;
          pdf_storage_key: string | null;
          pdf_sha256: string | null;
          pdf_byte_length: number | null;
        }
      | undefined;
    if (!row?.pdf_storage_key || !row.pdf_sha256)
      throw new V3ValidationError('Invoice PDF is not ready');
    this.assertStorageKey(row.pdf_storage_key);
    return {
      storageKey: row.pdf_storage_key,
      sha256: row.pdf_sha256,
      byteLength: row.pdf_byte_length ?? undefined,
      mediaType: 'application/pdf',
      filename: `${row.invoice_number ?? invoiceId}.pdf`,
    };
  }

  private assertStorageKey(storageKey: string): void {
    if (
      !storageKey ||
      storageKey.startsWith('/') ||
      storageKey.includes('\\') ||
      storageKey.split('/').includes('..')
    )
      throw new V3ValidationError('Unsafe storage key');
  }

  authorizeDocument(
    principal: Principal,
    documentId: string,
  ): {
    storageKey: string;
    filename: string;
    mediaType: string;
    sensitive: boolean;
    sha256: string;
    byteLength: number;
  } {
    this.assertActive(principal);
    const document = this.sqlite
      .prepare(
        'SELECT id,project_id,owner_id,storage_key,media_type,original_filename,safe_filename,sensitivity,sensitive,sha256,byte_length,state,scan_status FROM document WHERE id=?',
      )
      .get(documentId) as
      | {
          id: string;
          project_id: string | null;
          owner_id: string;
          storage_key: string;
          media_type: string;
          original_filename: string | null;
          safe_filename: string | null;
          sensitivity: string;
          sensitive: number;
          sha256: string;
          byte_length: number;
          state: string;
          scan_status: string;
        }
      | undefined;
    const scannerRequired =
      process.env.NODE_ENV === 'production' &&
      (process.env.JA_MALWARE_SCANNER_REQUIRED === 'true' ||
        Boolean(process.env.JA_MALWARE_SCANNER_URL));
    if (
      !document ||
      document.state !== 'committed' ||
      document.scan_status === 'pending' ||
      document.scan_status === 'rejected' ||
      (scannerRequired && document.scan_status !== 'clean')
    )
      throw new V3ValidationError('Document not found');
    this.assertStorageKey(document.storage_key);
    const record = { ownerId: document.owner_id, projectId: document.project_id ?? '' };
    const allowed =
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only' ||
      document.owner_id === principal.userId ||
      (document.project_id !== null && canReadRecord(principal, record));
    if (!allowed) throw new V3AccessDeniedError('Document access denied');
    const sensitive = document.sensitive === 1 || document.sensitivity !== 'public';
    this.sqlite
      .prepare(
        'INSERT INTO document_access_event(id,document_id,user_id,action,occurred_at) VALUES(?,?,?,?,?)',
      )
      .run(newId(), document.id, principal.userId, 'download', timestamp());
    this.audit(principal, 'document.download', 'document', document.id, { sensitive });
    return {
      storageKey: document.storage_key,
      filename: document.safe_filename ?? document.original_filename ?? 'document',
      mediaType: document.media_type,
      sensitive,
      sha256: document.sha256,
      byteLength: document.byte_length,
    };
  }

  recordDocumentScan(
    principal: Principal,
    documentId: string,
    result: 'clean' | 'rejected',
    provider: string,
  ): void {
    this.assertActive(principal);
    if (
      !principal.isServiceActor &&
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin'
    )
      throw new V3AccessDeniedError('Document scanning requires a service actor');
    this.assertStepUp(principal);
    if (!provider.trim() || provider.length > 120)
      throw new V3ValidationError('Scan provider is invalid');
    const state = result === 'clean' ? 'committed' : 'rejected';
    const updated = this.sqlite
      .prepare(
        "UPDATE document SET scan_status=?,scanned_at=?,scan_provider=?,state=?,updated_at=?,version=version+1 WHERE id=? AND scan_status IN ('pending','not_scanned')",
      )
      .run(result, timestamp(), provider.trim(), state, timestamp(), documentId);
    if (updated.changes !== 1) {
      const current = this.sqlite
        .prepare('SELECT scan_status FROM document WHERE id=?')
        .get(documentId) as { scan_status: string } | undefined;
      if (current?.scan_status !== result)
        throw new V3ConflictError('Document scan is already finalized');
    }
    this.audit(principal, 'document.scan', 'document', documentId, { result, provider });
  }

  private createOfflineDraft(
    principal: Principal,
    mutation: Readonly<{ entityType: string; entityId: string; payload: Record<string, unknown> }>,
  ): Readonly<{ outcome: 'accepted'; version: 1 }> {
    const timestampValue = timestamp();
    if (mutation.entityType === 'time') {
      const parsed = timeInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline time draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.workDate);
      const assignment = this.sqlite
        .prepare('SELECT p.timezone FROM project p WHERE p.id=?')
        .get(input.projectId) as { timezone: string } | undefined;
      if (!assignment) throw new V3ValidationError('Project not found');
      this.sqlite
        .prepare(
          'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,activity_code,minutes,project_timezone,activity_summary,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.workDate,
          input.category,
          input.activityCode ?? null,
          input.minutes,
          assignment.timezone,
          input.summary,
          'draft',
          'pending',
          timestampValue,
          timestampValue,
        );
      this.audit(principal, 'time.create_offline', 'time_entry', mutation.entityId, {
        projectId: input.projectId,
        minutes: input.minutes,
      });
    } else if (mutation.entityType === 'daily_report') {
      const parsed = dailyReportInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline daily report draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.workDate);
      this.sqlite
        .prepare(
          'INSERT INTO daily_report(id,project_id,worker_id,work_date,site_shift,summary,tasks_completed,problems_found,corrective_actions,client_decisions,downtime_minutes,standby_reason,blockers,open_items,next_day_plan,safety_related,customer_contact,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.workDate,
          input.siteShift ?? null,
          input.summary,
          input.tasksCompleted,
          input.problemsFound ?? null,
          input.correctiveActions ?? null,
          input.clientDecisions ?? null,
          input.downtimeMinutes,
          input.standbyReason ?? null,
          input.blockers ?? null,
          input.openItems ?? null,
          input.nextDayPlan ?? null,
          input.safetyRelated ? 1 : 0,
          input.customerContact ?? null,
          'draft',
          timestampValue,
          timestampValue,
        );
      this.audit(principal, 'daily_report.create_offline', 'daily_report', mutation.entityId, {
        projectId: input.projectId,
        workDate: input.workDate,
      });
    } else if (mutation.entityType === 'technical_report') {
      const parsed = technicalReportInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline technical report draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId);
      this.sqlite
        .prepare(
          'INSERT INTO technical_report(id,project_id,author_id,system_name,plant_site,area_line,station_machine,system_type,plc_platform,controller,hmi_scada,network_protocol,software_version,program_reference,change_summary,safety_related,production_impact,validation,validation_result,open_risk,rollback_plan,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.systemName,
          input.plantSite ?? null,
          input.areaLine ?? null,
          input.stationMachine ?? null,
          input.systemType ?? null,
          input.plcPlatform ?? null,
          input.controller ?? null,
          input.hmiScada ?? null,
          input.networkProtocol ?? null,
          input.softwareVersion ?? null,
          input.programReference ?? null,
          input.changeSummary,
          input.safetyRelated ? 1 : 0,
          input.productionImpact ?? null,
          input.validation ?? null,
          input.validationResult ?? null,
          input.openRisk ?? null,
          input.rollbackPlan ?? null,
          'draft',
          timestampValue,
          timestampValue,
        );
      this.audit(
        principal,
        'technical_report.create_offline',
        'technical_report',
        mutation.entityId,
        { projectId: input.projectId, safetyRelated: input.safetyRelated },
      );
    } else if (mutation.entityType === 'expense') {
      const parsed = expenseInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline expense draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.spentOn);
      const project = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: V3Currency } | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      if (input.amountMinor <= 0n) throw new V3ValidationError('Expense amount must be positive');
      const projectAmountMinor = input.projectCurrencyAmountMinor ?? input.amountMinor;
      if (projectAmountMinor <= 0n)
        throw new V3ValidationError('Project expense amount must be positive');
      if (input.currency !== project.currency && input.projectCurrencyAmountMinor === undefined)
        throw new V3ValidationError('A project-currency amount is required for foreign expenses');
      if (input.currency !== project.currency && input.fxRateBps === undefined)
        throw new V3ValidationError('An FX rate is required for foreign expenses');
      if (input.receiptRequired && !input.receiptDocumentId)
        throw new V3ValidationError('A committed receipt is required');
      if (input.receiptDocumentId) {
        const receipt = this.sqlite
          .prepare("SELECT 1 FROM document WHERE id=? AND owner_id=? AND state='committed'")
          .get(input.receiptDocumentId, principal.userId);
        if (!receipt) throw new V3AccessDeniedError('Committed owned receipt required');
      }
      const billingTreatment =
        input.billingTreatment ??
        (input.clientTreatment === 'reimbursable'
          ? 'reimbursable_at_cost'
          : input.clientTreatment === 'all_in'
            ? 'all_in'
            : 'internal_non_billable');
      const billableTreatments = [
        'reimbursable_at_cost',
        'reimbursable_plus_markup',
        'client_direct',
        'allowance_per_diem',
      ];
      if (billingTreatment === 'all_in' && input.clientTreatment !== 'all_in')
        throw new V3ValidationError('All-in billing must use the all-in client treatment');
      if (billingTreatment.startsWith('reimbursable') && input.clientTreatment === 'all_in')
        throw new V3ValidationError('All-in expenses cannot use reimbursable billing');
      if (
        input.clientTreatment === 'reimbursable' &&
        !billableTreatments.includes(billingTreatment)
      )
        throw new V3ValidationError('Reimbursable expenses require a billable treatment');
      if (billingTreatment === 'reimbursable_plus_markup' && input.markupBps === undefined)
        throw new V3ValidationError('Markup basis points are required for marked-up reimbursement');
      const legacyTreatment =
        billingTreatment === 'all_in'
          ? 'all_in'
          : billingTreatment.startsWith('reimbursable')
            ? 'reimbursable'
            : 'non_billable';
      const billingAmountMinor =
        billingTreatment === 'reimbursable_at_cost' ||
        billingTreatment === 'reimbursable_plus_markup'
          ? applyBasisPoints(
              money(project.currency, projectAmountMinor),
              10_000 + (input.markupBps ?? 0),
            ).minorUnits
          : null;
      this.sqlite
        .prepare(
          'INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,vendor,description,who_paid,payment_method,receipt_required,receipt_document_id,approval_state,reimbursement_state,billing_treatment,markup_bps,billing_amount_minor,project_currency_amount_minor,tax_amount_minor,fx_rate_bps,reimbursement_amount_minor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.spentOn,
          input.category,
          input.currency,
          sqliteInteger(input.amountMinor, 'Expense amount'),
          legacyTreatment,
          input.vendor,
          input.description,
          input.whoPaid,
          input.paymentMethod ?? null,
          input.receiptRequired ? 1 : 0,
          input.receiptDocumentId || null,
          'draft',
          'pending',
          billingTreatment,
          input.markupBps ?? null,
          billingAmountMinor === null ? null : sqliteInteger(billingAmountMinor, 'Billing amount'),
          sqliteInteger(projectAmountMinor, 'Project expense amount'),
          input.taxAmountMinor === undefined
            ? null
            : sqliteInteger(input.taxAmountMinor, 'Expense tax'),
          input.fxRateBps ?? null,
          input.whoPaid === 'worker' ? sqliteInteger(projectAmountMinor, 'Reimbursement') : null,
          timestampValue,
          timestampValue,
        );
      this.audit(principal, 'expense.create_offline', 'expense', mutation.entityId, {
        projectId: input.projectId,
        amountMinor: input.amountMinor.toString(),
      });
    } else {
      throw new V3ValidationError('Unsupported offline record');
    }
    return { outcome: 'accepted', version: 1 };
  }

  syncMutation(
    principal: Principal,
    mutation: Readonly<{
      mutationId: string;
      entityType: string;
      entityId: string;
      baseVersion: number;
      payload: Record<string, unknown>;
      attachments: readonly string[];
    }>,
  ) {
    this.assertWritable(principal);
    return this.transaction(() => {
      const duplicate = this.sqlite
        .prepare('SELECT result_json FROM offline_mutation WHERE mutation_id=? AND user_id=?')
        .get(mutation.mutationId, principal.userId) as { result_json: string } | undefined;
      if (duplicate) return JSON.parse(duplicate.result_json) as unknown;
      if (!['time', 'daily_report', 'technical_report', 'expense'].includes(mutation.entityType))
        return this.persistMutationResult(principal, mutation, {
          outcome: 'rejected',
          reason: 'Unsupported offline record',
        });
      const table =
        mutation.entityType === 'time'
          ? 'time_entry'
          : mutation.entityType === 'expense'
            ? 'expense'
            : mutation.entityType;
      const ownerColumn = mutation.entityType === 'technical_report' ? 'author_id' : 'worker_id';
      const row = this.sqlite
        .prepare(
          `SELECT id,${ownerColumn} owner_id,project_id,version,approval_state FROM ${table} WHERE id=?`,
        )
        .get(mutation.entityId) as
        | {
            id: string;
            owner_id: string;
            project_id: string;
            version: number;
            approval_state: string;
          }
        | undefined;
      if (!row) {
        if (mutation.baseVersion !== 0)
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Offline record no longer exists',
          });
        const result = this.createOfflineDraft(principal, mutation);
        this.persistMutationResult(principal, mutation, result);
        return result;
      }
      if (row.owner_id !== principal.userId)
        return this.persistMutationResult(principal, mutation, {
          outcome: 'rejected',
          reason: 'Record ownership required',
        });
      this.assertProjectAccess(principal, row.project_id);
      if (row.version !== mutation.baseVersion)
        return this.persistMutationResult(principal, mutation, {
          outcome: 'conflict',
          authoritativeVersion: row.version,
          fields: ['version', 'server_record'],
        });
      if (row.approval_state !== 'draft' && row.approval_state !== 'needs_changes')
        return this.persistMutationResult(principal, mutation, {
          outcome: 'rejected',
          reason: 'Only editable drafts can sync',
        });
      const now = timestamp();
      if (mutation.entityType === 'time') {
        const minutes = mutation.payload.minutes;
        const category = mutation.payload.category;
        const summary = mutation.payload.summary;
        if (
          typeof minutes !== 'number' ||
          !Number.isInteger(minutes) ||
          minutes < 0 ||
          minutes > 1440 ||
          typeof category !== 'string' ||
          typeof summary !== 'string'
        )
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Invalid time payload',
          });
        this.sqlite
          .prepare(
            'UPDATE time_entry SET minutes=?,category=?,activity_summary=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
          )
          .run(
            minutes,
            requireText(category, 'Category', 100),
            requireText(summary, 'Activity summary'),
            now,
            mutation.entityId,
            mutation.baseVersion,
          );
      } else if (mutation.entityType === 'expense') {
        const description = mutation.payload.description;
        if (typeof description !== 'string')
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Invalid expense payload',
          });
        this.sqlite
          .prepare(
            'UPDATE expense SET description=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
          )
          .run(
            requireText(description, 'Description'),
            now,
            mutation.entityId,
            mutation.baseVersion,
          );
      } else {
        const summary = mutation.payload.summary ?? mutation.payload.changeSummary;
        if (typeof summary !== 'string')
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Invalid report payload',
          });
        const field = mutation.entityType === 'daily_report' ? 'summary' : 'change_summary';
        this.sqlite
          .prepare(
            `UPDATE ${table} SET ${field}=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
          )
          .run(requireText(summary, 'Summary'), now, mutation.entityId, mutation.baseVersion);
      }
      const result = { outcome: 'accepted', version: mutation.baseVersion + 1 } as const;
      this.persistMutationResult(principal, mutation, result);
      this.audit(principal, 'offline.sync', mutation.entityType, mutation.entityId, {
        mutationId: mutation.mutationId,
      });
      return result;
    });
  }

  private persistMutationResult(
    principal: Principal,
    mutation: Readonly<{
      mutationId: string;
      entityType: string;
      entityId: string;
      baseVersion: number;
      payload: Record<string, unknown>;
      attachments: readonly string[];
    }>,
    result: unknown,
  ): unknown {
    const now = timestamp();
    this.sqlite
      .prepare(
        'INSERT INTO offline_mutation(mutation_id,user_id,entity_type,entity_id,base_version,payload_json,attachment_ids_json,state,result_json,created_at,processed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        mutation.mutationId,
        principal.userId,
        mutation.entityType,
        mutation.entityId,
        mutation.baseVersion,
        JSON.stringify(mutation.payload),
        JSON.stringify(mutation.attachments),
        typeof result === 'object' && result !== null && 'outcome' in result
          ? String((result as { outcome: string }).outcome)
          : 'rejected',
        JSON.stringify(result),
        now,
        now,
      );
    return result;
  }

  enqueueJob(
    kind: string,
    idempotencyKey: string,
    payload: unknown,
    runAfter = timestamp(),
  ): { id: string; created: boolean } {
    const existing = this.sqlite
      .prepare('SELECT id FROM job WHERE idempotency_key=?')
      .get(idempotencyKey) as { id: string } | undefined;
    if (existing) return { id: existing.id, created: false };
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        'INSERT INTO job(id,kind,idempotency_key,state,run_after,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(id, kind, idempotencyKey, 'pending', runAfter, JSON.stringify(payload), now, now);
    return { id, created: true };
  }

  private createMissingTimeReminders(workDate: string): number {
    requireDate(workDate, 'Reminder work date');
    if (new Date(`${workDate}T00:00:00.000Z`).getUTCDay() === 0) return 0;
    return this.transaction(() => {
      const assignments = this.sqlite
        .prepare(
          "SELECT DISTINCT pm.project_id,pm.user_id FROM project_member pm JOIN user u ON u.id=pm.user_id WHERE u.role='worker' AND u.status='active' AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
        )
        .all(workDate, workDate) as Array<{ project_id: string; user_id: string }>;
      let created = 0;
      for (const assignment of assignments) {
        const hasTime = this.sqlite
          .prepare(
            'SELECT 1 FROM time_entry WHERE project_id=? AND worker_id=? AND work_date=? LIMIT 1',
          )
          .get(assignment.project_id, assignment.user_id, workDate);
        if (hasTime) continue;
        const subjectId = `missing-time:${assignment.project_id}:${assignment.user_id}:${workDate}`;
        const notificationId = newId();
        const notification = this.sqlite
          .prepare(
            'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
          )
          .run(notificationId, assignment.user_id, 'missing_time', subjectId, timestamp());
        if (Number(notification.changes) !== 1) continue;
        this.sqlite
          .prepare(
            'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            newId(),
            'notification.email.requested',
            notificationId,
            `notification-email:${notificationId}`,
            JSON.stringify({
              notificationId,
              userId: assignment.user_id,
              kind: 'missing_time',
              subjectId,
            }),
            timestamp(),
            timestamp(),
          );
        created += 1;
      }
      return created;
    });
  }

  runDueJobs(
    limit = 20,
    handlers: Readonly<Record<string, DueJobHandler>> = {},
  ): { processed: number; failed: number; overdueMarked: number } {
    let processed = 0;
    let failed = 0;
    let overdueMarked = 0;
    for (let index = 0; index < limit; index += 1) {
      const result = this.transaction(() => {
        const now = timestamp();
        const job = this.sqlite
          .prepare(
            "SELECT id,kind,payload_json,attempts FROM job WHERE state='pending' AND run_after<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY run_after,id LIMIT 1",
          )
          .get(now, now) as
          | { id: string; kind: string; payload_json: string; attempts: number }
          | undefined;
        if (!job) return null;
        const lease = new Date(Date.now() + 60_000).toISOString();
        this.sqlite
          .prepare(
            "UPDATE job SET state='running',lease_until=?,attempts=attempts+1,updated_at=?,version=version+1 WHERE id=? AND state='pending'",
          )
          .run(lease, now, job.id);
        const runId = newId();
        this.sqlite
          .prepare('INSERT INTO job_run(id,job_id,started_at) VALUES(?,?,?)')
          .run(runId, job.id, now);
        return { ...job, runId };
      });
      if (!result) break;
      try {
        const payload = JSON.parse(result.payload_json) as unknown;
        const handler = handlers[result.kind];
        if (handler) {
          handler(payload);
        } else if (result.kind === 'overdue') {
          const changed = this.sqlite
            .prepare(
              "UPDATE invoice SET state='overdue',updated_at=? WHERE due_at<? AND state IN ('issued','sent','partially_paid')",
            )
            .run(timestamp(), timestamp());
          overdueMarked += Number(changed.changes);
        } else if (result.kind === 'period_close_report') {
          const report = payload as {
            projectId?: string;
            periodStart?: string;
            periodEnd?: string;
          };
          if (report.projectId && report.periodStart && report.periodEnd)
            this.sqlite
              .prepare(
                "UPDATE period_report SET state='review',updated_at=? WHERE project_id=? AND period_start=? AND period_end=? AND state='draft'",
              )
              .run(timestamp(), report.projectId, report.periodStart, report.periodEnd);
        } else if (result.kind === 'period_readiness') {
          // Readiness remains an explicit finance action; this durable run keeps the scheduler
          // alive without closing or issuing anything automatically.
        } else if (result.kind === 'missing_time_reminder') {
          const reminder = payload as { workDate?: string };
          if (!reminder.workDate) throw new Error('Missing-time reminder has no work date');
          this.createMissingTimeReminders(reminder.workDate);
        } else if (
          result.kind === 'invoice_pdf' ||
          result.kind === 'accounting_pack' ||
          result.kind === 'auto_draft'
        ) {
          throw new Error(`${result.kind} requires an artifact handler`);
        } else {
          throw new Error(`No handler registered for job kind: ${result.kind}`);
        }
        this.sqlite
          .prepare(
            "UPDATE job SET state='complete',lease_until=NULL,updated_at=?,version=version+1 WHERE id=?",
          )
          .run(timestamp(), result.id);
        this.sqlite
          .prepare("UPDATE job_run SET finished_at=?,outcome='success' WHERE id=?")
          .run(timestamp(), result.runId);
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Job failed';
        if (process.env.NODE_ENV === 'production' || process.env.JA_JSON_LOGS === 'true')
          console.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'error',
              event: 'job.failure',
              jobId: result.id,
              kind: result.kind,
              attempts: result.attempts + 1,
              error: message,
            }),
          );
        this.sqlite
          .prepare(
            "UPDATE job SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,lease_until=NULL,run_after=?,updated_at=?,version=version+1 WHERE id=?",
          )
          .run(new Date(Date.now() + 300_000).toISOString(), timestamp(), result.id);
        this.sqlite
          .prepare("UPDATE job_run SET finished_at=?,outcome='failure',error_code=? WHERE id=?")
          .run(timestamp(), message.slice(0, 160), result.runId);
      }
    }
    return { processed, failed, overdueMarked };
  }

  async runDueOutbox(
    limit = 20,
    handler: DueOutboxHandler,
  ): Promise<{ processed: number; failed: number; permanentlyFailed: number }> {
    let processed = 0;
    let failed = 0;
    let permanentlyFailed = 0;
    const maximumAttempts = 8;
    for (let index = 0; index < limit; index += 1) {
      const claimed = this.transaction(() => {
        const now = timestamp();
        const event = this.sqlite
          .prepare(
            'SELECT id,topic,aggregate_id,idempotency_key,payload_json,attempts FROM outbox_event WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY available_at,id LIMIT 1',
          )
          .get(now, now) as
          | {
              id: string;
              topic: string;
              aggregate_id: string;
              idempotency_key: string;
              payload_json: string;
              attempts: number;
            }
          | undefined;
        if (!event) return null;
        const lease = new Date(Date.now() + 60_000).toISOString();
        this.sqlite
          .prepare(
            'UPDATE outbox_event SET lease_until=?,attempts=attempts+1,last_error=NULL WHERE id=? AND delivered_at IS NULL AND failed_at IS NULL',
          )
          .run(lease, event.id);
        return {
          id: event.id,
          topic: event.topic,
          aggregateId: event.aggregate_id,
          idempotencyKey: event.idempotency_key,
          payload: event.payload_json,
          attempts: event.attempts + 1,
        };
      });
      if (!claimed) break;
      try {
        await handler({
          ...claimed,
          payload: JSON.parse(claimed.payload) as unknown,
        });
        this.transaction(() => {
          const now = timestamp();
          this.sqlite
            .prepare(
              'UPDATE outbox_event SET delivered_at=?,lease_until=NULL,last_error=NULL WHERE id=? AND delivered_at IS NULL',
            )
            .run(now, claimed.id);
          if (claimed.topic === 'public-inquiry.received')
            this.sqlite
              .prepare(
                'UPDATE public_inquiry SET delivered_at=? WHERE id=? AND delivered_at IS NULL',
              )
              .run(now, claimed.aggregateId);
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Outbox delivery failed';
        if (process.env.NODE_ENV === 'production' || process.env.JA_JSON_LOGS === 'true')
          console.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'error',
              event: 'outbox.failure',
              eventId: claimed.id,
              topic: claimed.topic,
              attempts: claimed.attempts,
              error: message,
            }),
          );
        const nextAttempts = claimed.attempts;
        const permanentlyFailedNow = nextAttempts >= maximumAttempts;
        const delayMs = Math.min(3_600_000, 30_000 * 2 ** Math.min(nextAttempts - 1, 6));
        this.transaction(() => {
          const now = timestamp();
          this.sqlite
            .prepare(
              'UPDATE outbox_event SET lease_until=NULL,available_at=?,last_error=?,failed_at=CASE WHEN ? THEN ? ELSE failed_at END WHERE id=? AND delivered_at IS NULL',
            )
            .run(
              new Date(Date.now() + delayMs).toISOString(),
              message.slice(0, 500),
              permanentlyFailedNow ? 1 : 0,
              permanentlyFailedNow ? now : null,
              claimed.id,
            );
        });
        if (permanentlyFailedNow) permanentlyFailed += 1;
      }
    }
    return { processed, failed, permanentlyFailed };
  }

  scheduleCoreJobs(): void {
    const now = timestamp();
    const jobs = [
      ['overdue', '*/5 * * * *'],
      ['period_readiness', '*/5 * * * *'],
      ['missing_time_reminder', '0 9 * * 1-6'],
      ['accounting_pack', '0 2 1 * *'],
      ['auto_draft', '*/10 * * * *'],
    ] as const;
    for (const [kind, cron] of jobs)
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO scheduled_job(id,kind,cron_expression,payload_json,updated_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), kind, cron, '{}', now);
    const minute = now.slice(0, 16);
    this.enqueueJob('overdue', `overdue:${minute}`, {}, now);
    this.enqueueJob('period_readiness', `period-readiness:${minute}`, {}, now);
    const reminderDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (new Date(`${reminderDate}T00:00:00.000Z`).getUTCDay() !== 0)
      this.enqueueJob(
        'missing_time_reminder',
        `missing-time-reminder:${reminderDate}`,
        { workDate: reminderDate },
        now,
      );
    const closedPeriods = this.sqlite
      .prepare(
        `SELECT br.id billing_rule_id,br.policy_version,bp.period_start,bp.period_end
         FROM billing_rule br JOIN billing_period bp ON bp.billing_rule_id=br.id
         WHERE br.enabled=1 AND br.auto_generate_draft=1 AND bp.state='closed'
           AND NOT EXISTS (
             SELECT 1 FROM invoice i
             WHERE i.billing_rule_id=br.id AND i.period_start=bp.period_start AND i.period_end=bp.period_end
           )`,
      )
      .all() as Array<{
      billing_rule_id: string;
      policy_version: number;
      period_start: string;
      period_end: string;
    }>;
    for (const period of closedPeriods)
      this.enqueueJob(
        'auto_draft',
        `auto-draft:${period.billing_rule_id}:${period.period_start}:${period.period_end}:${period.policy_version}`,
        {
          billingRuleId: period.billing_rule_id,
          periodStart: period.period_start,
          periodEnd: period.period_end,
        },
        now,
      );
  }

  hashSnapshot(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}

export type { CompensationInput, InternalCostInput, LaborRateInput, OverrideInput };
