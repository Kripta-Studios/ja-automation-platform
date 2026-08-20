import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  canManageAssignments,
  canManageBilling,
  canManageClients,
  canReviewProject,
  newId,
  type Principal,
  type Role,
} from '@ja/domain';
import { calculateTaxComponents, periodForCadence } from '@ja/billing-engine';
import { add, applyBasisPoints, hourlyRateForMinutes, money, type Currency } from '@ja/money';
import { recordAuditEvent } from './core/audit.ts';
import { assertActiveAccount, assertRecentStepUp } from './core/authorization.ts';
import { nextNumberSequence } from './core/sequence.ts';
import { assertSafeStorageKey } from './core/storage-key.ts';
import { runImmediateTransaction } from './core/transaction.ts';
import { ClientRepository, type ClientInput } from './domains/clients/client-repository.ts';
import { PlanningRepository } from './domains/planning/planning-repository.ts';
import { TimeEntryRepository } from './domains/time/time-entry-repository.ts';
import { WorkforceRepository } from './domains/workforce/workforce-repository.ts';
import { V3Repository } from './v3-repository.ts';

export class AccessDeniedError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}
export class ReadinessError extends Error {
  readonly reasons: readonly ReadinessReason[];

  constructor(reasons: readonly ReadinessReason[]) {
    super('Billing period is not ready');
    this.reasons = reasons;
  }
}

export type ReadinessReason = Readonly<{ code: string; sourceId?: string }>;

type ReportLocale = 'en' | 'pt' | 'es';
const normalizeReportLocale = (value: unknown): ReportLocale =>
  value === 'pt' || value === 'es' ? value : 'en';

type ProjectInput = Readonly<{
  clientId: string;
  name: string;
  description?: string;
  projectAlias?: string;
  timezone: string;
  currency: Currency;
  billingModel:
    | 'tm'
    | 'tm_daily_minimum'
    | 'all_in'
    | 'capped_tm'
    | 'milestone'
    | 'hybrid'
    | 'internal';
  siteName?: string;
  country?: string;
  expectedMinutesPerDay?: number;
  clientDailyMinimumMinutes?: number;
  poNumber?: string;
  contractNumber?: string;
  startDate?: string;
  plannedEndDate?: string;
  budgetType?: string;
  revenueBudgetMinor?: bigint;
  poCapMinor?: bigint;
  fixedPriceMinor?: bigint;
  laborBudgetMinutes?: number;
  travelBudgetMinor?: bigint;
  otherCostBudgetMinor?: bigint;
  weeklyCloseEnabled?: boolean;
  dailyReportRequired?: boolean;
  technicalReportingRequired?: boolean;
  notes?: string;
}>;

type TimeInput = Readonly<{
  projectId: string;
  workDate: string;
  category: string;
  activityCode?: string;
  minutes: number;
  summary: string;
}>;

const shiftIsoDate = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new ValidationError('Invalid ISO date');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

type ExpenseInput = Readonly<{
  projectId: string;
  spentOn: string;
  vendor: string;
  category: string;
  description: string;
  currency: Currency;
  amountMinor: bigint;
  projectCurrencyAmountMinor?: bigint;
  fxRateBps?: number;
  taxAmountMinor?: bigint;
  whoPaid: string;
  clientTreatment: 'all_in' | 'reimbursable' | 'non_billable';
  billingTreatment?:
    | 'reimbursable_at_cost'
    | 'reimbursable_plus_markup'
    | 'all_in'
    | 'internal_non_billable'
    | 'client_direct'
    | 'allowance_per_diem'
    | 'informational';
  markupBps?: number;
  paymentMethod?: string;
  receiptRequired: boolean;
  receiptDocumentId?: string;
}>;

type DailyReportInput = Readonly<{
  projectId: string;
  workDate: string;
  siteShift?: string;
  summary: string;
  tasksCompleted: string;
  problemsFound?: string;
  correctiveActions?: string;
  clientDecisions?: string;
  downtimeMinutes: number;
  standbyReason?: string;
  blockers?: string;
  openItems?: string;
  nextDayPlan?: string;
  safetyRelated: boolean;
  customerContact?: string;
}>;

type TechnicalReportInput = Readonly<{
  projectId: string;
  systemName: string;
  plantSite?: string;
  areaLine?: string;
  stationMachine?: string;
  systemType?: string;
  plcPlatform?: string;
  controller?: string;
  hmiScada?: string;
  networkProtocol?: string;
  softwareVersion?: string;
  programReference?: string;
  changeSummary: string;
  safetyRelated: boolean;
  productionImpact?: string;
  validation?: string;
  validationResult?: string;
  openRisk?: string;
  rollbackPlan?: string;
}>;

type InvoiceRow = {
  id: string;
  project_id: string;
  invoice_number: string | null;
  stream_type: string;
  state: string;
  currency: Currency;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  issued_at: string | null;
  snapshot_json: string | null;
  billing_rule_id: string;
  period_start: string;
  period_end: string;
};

type Row = Record<string, string | number | null>;

const now = (): string => new Date().toISOString();
const today = (): string => new Date().toISOString().slice(0, 10);

const malwareScanRequired = (): boolean =>
  process.env.NODE_ENV === 'production' &&
  (process.env.JA_MALWARE_SCANNER_REQUIRED === 'true' ||
    Boolean(process.env.JA_MALWARE_SCANNER_URL));

function safeInteger(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new ValidationError('Money exceeds safe SQLite integer range');
  return result;
}

function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    throw new ValidationError(`${field} must be an ISO date`);
}

function assertText(value: string, field: string, max = 5000): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new ValidationError(`${field} is required`);
  return trimmed;
}

export class PortalRepository {
  private readonly sqlite: DatabaseSync;
  private readonly clients: ClientRepository;
  private readonly planning: PlanningRepository;
  private readonly time: TimeEntryRepository;
  private readonly workforce: WorkforceRepository;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
    this.clients = new ClientRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      nextSequence: (scope, scopeId) => this.nextSequence(scope, scopeId),
      now,
      assertText,
      accessDenied: (message) => {
        throw new AccessDeniedError(message);
      },
      validation: (message) => {
        throw new ValidationError(message);
      },
    });
    this.workforce = new WorkforceRepository({
      sqlite,
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now,
      assertText,
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
    this.planning = new PlanningRepository({
      sqlite,
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      assertDate,
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now,
      assertText,
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
    this.time = new TimeEntryRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      assertDate,
      assertText,
      shiftIsoDate,
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
    return runImmediateTransaction(this.sqlite, 'portal', work);
  }

  private assertActive(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    if (principal.role === 'auditor_read_only') throw new AccessDeniedError('Read-only role');
  }

  private assertReadable(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
  }

  private assertStepUp(principal: Principal): void {
    assertRecentStepUp(this.sqlite, principal, AccessDeniedError);
  }

  private audit(
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ): void {
    recordAuditEvent(this.sqlite, principal, action, entityType, entityId, details);
  }

  private nextSequence(scope: string, scopeId: string): number {
    return nextNumberSequence(this.sqlite, scope, scopeId);
  }

  principalFor(userId: string, sessionId?: string, correlationId?: string): Principal {
    const user = this.sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(userId) as
      | { role: Role; status: string }
      | undefined;
    if (!user || user.status !== 'active') throw new AccessDeniedError('Active account required');
    const projects = this.sqlite
      .prepare("SELECT project_id FROM project_member WHERE user_id=? AND status='active'")
      .all(userId) as Array<{ project_id: string }>;
    return {
      userId,
      role: user.role,
      sessionId,
      correlationId,
      projectIds: new Set(projects.map((row) => row.project_id)),
    };
  }

  createClient(principal: Principal, input: ClientInput) {
    return this.clients.createClient(principal, input);
  }

  createClientContact(
    principal: Principal,
    input: Readonly<{
      clientId: string;
      name: string;
      email?: string;
      phone?: string;
      role?: string;
      isBillingContact?: boolean;
      isPrimary?: boolean;
    }>,
  ) {
    return this.clients.createClientContact(principal, input);
  }

  listClientContacts(principal: Principal, clientId: string) {
    return this.clients.listClientContacts(principal, clientId);
  }

  listAllClientContacts(principal: Principal) {
    return this.clients.listAllClientContacts(principal);
  }

  createProject(principal: Principal, input: ProjectInput) {
    this.assertActive(principal);
    if (!canManageClients(principal))
      throw new AccessDeniedError('Project administration required');
    return this.transaction(() => {
      const client = this.sqlite
        .prepare('SELECT client_number,currency FROM client WHERE id=? AND status=?')
        .get(input.clientId, 'active') as { client_number: string; currency: Currency } | undefined;
      if (!client) throw new ValidationError('Active client not found');
      if (client.currency !== input.currency)
        throw new ValidationError('Project currency must match the client currency');
      if (
        !Number.isInteger(input.expectedMinutesPerDay ?? 600) ||
        (input.expectedMinutesPerDay ?? 600) < 0 ||
        (input.expectedMinutesPerDay ?? 600) > 1440
      )
        throw new ValidationError('Expected working minutes must be between 0 and 1440');
      if (
        input.clientDailyMinimumMinutes !== undefined &&
        (!Number.isInteger(input.clientDailyMinimumMinutes) ||
          input.clientDailyMinimumMinutes < 0 ||
          input.clientDailyMinimumMinutes > 1440)
      )
        throw new ValidationError('Client daily minimum must be between 0 and 1440 minutes');
      const startDate = input.startDate || today();
      assertDate(startDate, 'Project start date');
      if (input.plannedEndDate) {
        assertDate(input.plannedEndDate, 'Planned end date');
        if (input.plannedEndDate < startDate)
          throw new ValidationError('Planned end date must follow the project start date');
      }
      const budgets = [
        input.revenueBudgetMinor,
        input.poCapMinor,
        input.fixedPriceMinor,
        input.travelBudgetMinor,
        input.otherCostBudgetMinor,
      ];
      if (budgets.some((value) => value !== undefined && value < 0n))
        throw new ValidationError('Project budgets cannot be negative');
      if (
        input.laborBudgetMinutes !== undefined &&
        (!Number.isInteger(input.laborBudgetMinutes) || input.laborBudgetMinutes < 0)
      )
        throw new ValidationError('Labor budget minutes are invalid');
      const sequence = this.nextSequence('project', input.clientId);
      const projectNumber = `${client.client_number}-P-${String(sequence).padStart(3, '0')}`;
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,site_name,country,project_manager_id,expected_minutes_per_day,client_daily_minimum_minutes,po_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          projectNumber,
          input.clientId,
          assertText(input.name, 'Project name', 200),
          input.timezone,
          input.currency,
          'active',
          input.billingModel,
          input.siteName ?? null,
          input.country ?? null,
          principal.role === 'project_manager' ? principal.userId : null,
          input.expectedMinutesPerDay ?? 600,
          input.clientDailyMinimumMinutes ?? null,
          input.poNumber ?? null,
          timestamp,
          timestamp,
        );
      const scheduleId = newId();
      const expectedMinutes = input.expectedMinutesPerDay ?? 600;
      this.sqlite
        .prepare(
          'INSERT INTO schedule(id,project_id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          scheduleId,
          id,
          input.timezone,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          0,
          startDate,
        );
      this.sqlite
        .prepare(
          `UPDATE project SET description=?,project_alias=?,start_date=?,planned_end_date=?,
             contract_number=?,budget_type=?,revenue_budget_minor=?,po_cap_minor=?,
             fixed_price_minor=?,
             labor_budget_minutes=?,travel_budget_minor=?,other_cost_budget_minor=?,
             budget_minor=?,planned_minutes=?,weekly_close_enabled=?,daily_report_required=?,
             technical_reporting_required=?,notes=?,expected_schedule_id=?,updated_at=? WHERE id=?`,
        )
        .run(
          input.description?.trim() || null,
          input.projectAlias?.trim() || null,
          startDate,
          input.plannedEndDate || null,
          input.contractNumber?.trim() || null,
          input.budgetType ?? 'none',
          input.revenueBudgetMinor === undefined ? null : safeInteger(input.revenueBudgetMinor),
          input.poCapMinor === undefined ? null : safeInteger(input.poCapMinor),
          input.fixedPriceMinor === undefined ? null : safeInteger(input.fixedPriceMinor),
          input.laborBudgetMinutes ?? null,
          input.travelBudgetMinor === undefined ? null : safeInteger(input.travelBudgetMinor),
          input.otherCostBudgetMinor === undefined ? null : safeInteger(input.otherCostBudgetMinor),
          input.revenueBudgetMinor !== undefined
            ? safeInteger(input.revenueBudgetMinor)
            : input.poCapMinor !== undefined
              ? safeInteger(input.poCapMinor)
              : null,
          input.laborBudgetMinutes ?? null,
          input.weeklyCloseEnabled ? 1 : 0,
          input.dailyReportRequired ? 1 : 0,
          input.technicalReportingRequired ? 1 : 0,
          input.notes?.trim() || null,
          scheduleId,
          timestamp,
          id,
        );
      this.audit(principal, 'project.create', 'project', id, { projectNumber });
      return { id, projectNumber };
    });
  }

  listProjectSchedule(principal: Principal, projectId: string) {
    return this.planning.listProjectSchedule(principal, projectId);
  }

  updateProjectSchedule(
    principal: Principal,
    input: Readonly<{
      projectId: string;
      timezone: string;
      mondayMinutes: number;
      tuesdayMinutes: number;
      wednesdayMinutes: number;
      thursdayMinutes: number;
      fridayMinutes: number;
      saturdayMinutes: number;
      sundayMinutes: number;
      effectiveFrom: string;
    }>,
  ) {
    return this.planning.updateProjectSchedule(principal, input);
  }

  listSkills(principal: Principal) {
    return this.workforce.listSkills(principal);
  }

  createSkill(principal: Principal, input: Readonly<{ code: string; name: string }>) {
    return this.workforce.createSkill(principal, input);
  }

  setWorkerSkill(
    principal: Principal,
    input: Readonly<{ workerId: string; skillId: string; proficiency: number }>,
  ): void {
    return this.workforce.setWorkerSkill(principal, input);
  }

  listWorkerSkills(principal: Principal, workerId?: string) {
    return this.workforce.listWorkerSkills(principal, workerId);
  }

  setWorkerAvailability(
    principal: Principal,
    input: Readonly<{
      workerId: string;
      startsAt: string;
      endsAt: string;
      availability: 'available' | 'unavailable' | 'tentative';
      note?: string;
    }>,
  ) {
    return this.workforce.setWorkerAvailability(principal, input);
  }

  listWorkerAvailability(principal: Principal, workerId?: string) {
    return this.workforce.listWorkerAvailability(principal, workerId);
  }

  createProjectMilestone(
    principal: Principal,
    input: Readonly<{
      projectId: string;
      name: string;
      description?: string;
      amountMinor: bigint;
      dueOn?: string;
    }>,
  ) {
    this.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw new AccessDeniedError('Project milestone administration required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    if (input.dueOn) assertDate(input.dueOn, 'Milestone date');
    if (input.amountMinor <= 0n) throw new ValidationError('Milestone amount must be positive');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        "INSERT INTO project_milestone(id,project_id,name,description,amount_minor,currency,due_on,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?)",
      )
      .run(
        id,
        input.projectId,
        assertText(input.name, 'Milestone name', 200),
        input.description?.trim() || null,
        safeInteger(input.amountMinor),
        project.currency,
        input.dueOn ?? null,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'milestone.create', 'project_milestone', id, {
      projectId: input.projectId,
      amountMinor: input.amountMinor.toString(),
    });
    return { id, version: 1 };
  }

  listMilestonesForReview(principal: Principal) {
    this.assertReadable(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'project_manager' &&
      principal.role !== 'auditor_read_only'
    )
      throw new AccessDeniedError('Milestone review access required');
    const projectIds = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    if (principal.role === 'project_manager' && projectIds.length === 0) return [];
    const restriction = projectIds.length
      ? ` AND pm.project_id IN (${projectIds.map(() => '?').join(',')})`
      : '';
    return this.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.name,pm.description,pm.amount_minor,pm.currency,pm.due_on,pm.approval_state,pm.version,
                p.project_number,p.name project_name
         FROM project_milestone pm JOIN project p ON p.id=pm.project_id
         WHERE pm.approval_state='submitted'${restriction} ORDER BY pm.due_on,pm.id`,
      )
      .all(...projectIds);
  }

  submitProjectMilestone(principal: Principal, milestoneId: string, version: number): void {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare('SELECT project_id,approval_state FROM project_milestone WHERE id=? AND version=?')
      .get(milestoneId, version) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw new ConflictError('Milestone changed or not found');
    if (!canManageAssignments(principal, row.project_id))
      throw new AccessDeniedError('Project milestone administration required');
    const result = this.sqlite
      .prepare(
        "UPDATE project_milestone SET approval_state='submitted',updated_at=?,version=version+1 WHERE id=? AND version=? AND approval_state IN ('draft','rejected')",
      )
      .run(now(), milestoneId, version);
    if (result.changes !== 1) throw new ConflictError('Milestone cannot be submitted');
  }

  reviewProjectMilestone(
    principal: Principal,
    milestoneId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): void {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare('SELECT project_id,approval_state FROM project_milestone WHERE id=?')
      .get(milestoneId) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw new ValidationError('Milestone not found');
    if (!canReviewProject(principal, row.project_id) && !canManageBilling(principal))
      throw new AccessDeniedError('Milestone review required');
    if (row.approval_state !== 'submitted') throw new ConflictError('Submitted milestone required');
    if (decision === 'rejected' && !reason?.trim())
      throw new ValidationError('A rejection reason is required');
    const timestamp = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          "UPDATE project_milestone SET approval_state=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='submitted'",
        )
        .run(
          decision,
          decision === 'approved' ? principal.userId : null,
          decision === 'approved' ? timestamp : null,
          timestamp,
          milestoneId,
        );
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'milestone',
          milestoneId,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          timestamp,
        );
      this.audit(principal, `milestone.${decision}`, 'project_milestone', milestoneId, {
        reason: reason ?? null,
      });
    });
  }

  assignWorker(
    principal: Principal,
    input: {
      projectId: string;
      workerId: string;
      startsOn: string;
      endsOn?: string;
      plannedMinutes?: number;
      canReview?: boolean;
    },
  ) {
    return this.workforce.assignWorker(principal, input);
  }

  createTimeEntry(principal: Principal, input: TimeInput) {
    return this.time.createTimeEntry(principal, input);
  }

  submitTime(principal: Principal, id: string, baseVersion: number) {
    return this.time.submitTime(principal, id, baseVersion);
  }

  updateTimeEntry(
    principal: Principal,
    input: Readonly<{
      id: string;
      version: number;
      workDate?: string;
      category?: string;
      activityCode?: string;
      minutes?: number;
      summary?: string;
      site?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
    }>,
  ) {
    return this.time.updateTimeEntry(principal, input);
  }

  operationalApproveTime(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ) {
    return this.time.operationalApproveTime(principal, id, decision, reason);
  }

  financeApproveTime(principal: Principal, id: string, billable: boolean) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE time_entry SET billability_state=?,finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='approved' AND invoice_id IS NULL AND billing_status='unlocked'",
      )
      .run(billable ? 'billable' : 'non_billable', principal.userId, timestamp, timestamp, id);
    if (result.changes !== 1) throw new ConflictError('Approved unlocked time required');
    this.audit(principal, 'time.finance_review', 'time_entry', id, { billable });
  }

  private assertProjectMembership(principal: Principal, projectId: string, onDate = today()): void {
    if (principal.role === 'owner_admin') return;
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 ok FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
      )
      .get(projectId, principal.userId, onDate, onDate);
    if (!assignment) throw new AccessDeniedError('Active project assignment required');
  }

  createDailyReport(principal: Principal, input: DailyReportInput) {
    this.assertActive(principal);
    assertDate(input.workDate, 'Work date');
    this.assertProjectMembership(principal, input.projectId, input.workDate);
    if (
      !Number.isInteger(input.downtimeMinutes) ||
      input.downtimeMinutes < 0 ||
      input.downtimeMinutes > 1440
    )
      throw new ValidationError('Downtime must be between 0 and 1440 minutes');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO daily_report(id,project_id,worker_id,work_date,site_shift,summary,tasks_completed,problems_found,corrective_actions,client_decisions,downtime_minutes,standby_reason,blockers,open_items,next_day_plan,safety_related,customer_contact,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.workDate,
        input.siteShift ?? null,
        assertText(input.summary, 'Summary'),
        assertText(input.tasksCompleted, 'Tasks completed'),
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
        timestamp,
        timestamp,
      );
    this.audit(principal, 'daily_report.create', 'daily_report', id, {
      projectId: input.projectId,
      workDate: input.workDate,
    });
    return { id, version: 1 };
  }

  createTechnicalReport(principal: Principal, input: TechnicalReportInput) {
    this.assertActive(principal);
    this.assertProjectMembership(principal, input.projectId);
    if (input.safetyRelated && (!input.validation || !input.rollbackPlan))
      throw new ValidationError('Safety-related changes require validation and rollback details');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO technical_report(id,project_id,author_id,system_name,plant_site,area_line,station_machine,system_type,plc_platform,controller,hmi_scada,network_protocol,software_version,program_reference,change_summary,safety_related,production_impact,validation,validation_result,open_risk,rollback_plan,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        assertText(input.systemName, 'System name', 200),
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
        assertText(input.changeSummary, 'Change summary'),
        input.safetyRelated ? 1 : 0,
        input.productionImpact ?? null,
        input.validation ?? null,
        input.validationResult ?? null,
        input.openRisk ?? null,
        input.rollbackPlan ?? null,
        'draft',
        timestamp,
        timestamp,
      );
    this.audit(principal, 'technical_report.create', 'technical_report', id, {
      projectId: input.projectId,
      safetyRelated: input.safetyRelated,
    });
    return { id, version: 1 };
  }

  private reportSourceType(type: 'daily' | 'technical'): string {
    return `${type}_report`;
  }

  private reportIsLocked(type: 'daily' | 'technical', id: string): boolean {
    return Boolean(
      this.sqlite
        .prepare(
          "SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type=? AND rs.source_id=? AND pr.state='final' LIMIT 1",
        )
        .get(this.reportSourceType(type), id),
    );
  }

  private canViewReport(principal: Principal, projectId: string, ownerId: string): boolean {
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return true;
    if (principal.role === 'project_manager') return principal.projectIds.has(projectId);
    return principal.role === 'worker' && principal.userId === ownerId;
  }

  private canMutateReport(principal: Principal, projectId: string, ownerId: string): boolean {
    if (principal.role === 'auditor_read_only') return false;
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') return true;
    if (principal.role === 'project_manager') return principal.projectIds.has(projectId);
    return principal.role === 'worker' && principal.userId === ownerId;
  }

  private reportNotificationRecipients(projectId: string, actorId: string) {
    const candidates = this.sqlite
      .prepare(
        "SELECT id,role FROM user WHERE status='active' AND role IN ('owner_admin','finance_admin','project_manager')",
      )
      .all() as Array<{ id: string; role: string }>;
    return candidates.filter((candidate) => {
      if (candidate.id === actorId) return false;
      if (candidate.role === 'project_manager')
        return Boolean(
          this.sqlite
            .prepare(
              "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
            )
            .get(projectId, candidate.id),
        );
      return true;
    });
  }

  private notifyReportChanged(
    principal: Principal,
    type: 'daily' | 'technical',
    reportId: string,
    projectId: string,
    changedFields: readonly string[],
    action: 'report_modified' | 'report_deleted',
    occurredAt: string,
  ): void {
    for (const recipient of this.reportNotificationRecipients(projectId, principal.userId))
      this.sqlite
        .prepare(
          'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), recipient.id, action, reportId, occurredAt);
    this.audit(principal, `report.${action}`, this.reportSourceType(type), reportId, {
      projectId,
      changedFields,
    });
  }

  reportDetail(principal: Principal, id: string) {
    this.assertReadable(principal);
    const daily = this.sqlite
      .prepare(
        `SELECT 'daily' type,d.*,p.project_number,p.name project_name,p.site_name,p.client_id,
                u.name author_name,u.email author_email
         FROM daily_report d JOIN project p ON p.id=d.project_id JOIN user u ON u.id=d.worker_id
         WHERE d.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    const technical = this.sqlite
      .prepare(
        `SELECT 'technical' type,t.*,t.author_id owner_id,p.project_number,p.name project_name,
                p.site_name,p.client_id,u.name author_name,u.email author_email
         FROM technical_report t JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.author_id
         WHERE t.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    const report = daily ?? technical;
    if (!report) throw new ValidationError('Report not found');
    const type = String(report.type) === 'technical' ? 'technical' : 'daily';
    const projectId = String(report.project_id);
    const ownerId = String(report.owner_id ?? report.worker_id ?? report.author_id);
    if (!this.canViewReport(principal, projectId, ownerId))
      throw new AccessDeniedError('Report access required');
    const locked = this.reportIsLocked(type, id);
    const hasTechnicalChildren =
      type === 'technical' &&
      Boolean(
        this.sqlite.prepare('SELECT 1 FROM technical_change WHERE technical_report_id=?').get(id),
      );
    const history = this.sqlite
      .prepare(
        `SELECT ae.action,ae.occurred_at,ae.details_json,u.name actor_name
         FROM audit_event ae LEFT JOIN user u ON u.id=ae.actor_id
         WHERE ae.entity_type=? AND ae.entity_id=? ORDER BY ae.occurred_at DESC,ae.id DESC LIMIT 50`,
      )
      .all(this.reportSourceType(type), id);
    return {
      type,
      report,
      history,
      locked,
      canEdit: !locked && this.canMutateReport(principal, projectId, ownerId),
      canDelete: !locked && principal.role === 'owner_admin' && !hasTechnicalChildren,
    };
  }

  private updateReport(
    principal: Principal,
    type: 'daily' | 'technical',
    input: Record<string, unknown>,
  ) {
    this.assertActive(principal);
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const current = this.sqlite
      .prepare(`SELECT * FROM ${table} WHERE id=?`)
      .get(String(input.id)) as Record<string, unknown> | undefined;
    if (!current) throw new ValidationError('Report not found');
    const projectId = String(current.project_id);
    const ownerId = String(current.worker_id ?? current.author_id);
    if (!this.canMutateReport(principal, projectId, ownerId))
      throw new AccessDeniedError('Report edit access required');
    if (type === 'daily' && principal.role === 'worker')
      this.assertProjectMembership(principal, projectId, String(input.workDate));
    if (this.reportIsLocked(type, String(input.id)))
      throw new ConflictError('This report is part of a finalized report and cannot be edited');
    const version = Number(input.version);
    if (!Number.isInteger(version) || version !== Number(current.version))
      throw new ConflictError('Report changed or cannot be edited');
    const fields =
      type === 'daily'
        ? ([
            ['workDate', 'work_date'],
            ['siteShift', 'site_shift'],
            ['summary', 'summary'],
            ['tasksCompleted', 'tasks_completed'],
            ['problemsFound', 'problems_found'],
            ['correctiveActions', 'corrective_actions'],
            ['clientDecisions', 'client_decisions'],
            ['downtimeMinutes', 'downtime_minutes'],
            ['standbyReason', 'standby_reason'],
            ['blockers', 'blockers'],
            ['openItems', 'open_items'],
            ['nextDayPlan', 'next_day_plan'],
            ['safetyRelated', 'safety_related'],
            ['customerContact', 'customer_contact'],
          ] as const)
        : ([
            ['systemName', 'system_name'],
            ['plantSite', 'plant_site'],
            ['areaLine', 'area_line'],
            ['stationMachine', 'station_machine'],
            ['systemType', 'system_type'],
            ['plcPlatform', 'plc_platform'],
            ['controller', 'controller'],
            ['hmiScada', 'hmi_scada'],
            ['networkProtocol', 'network_protocol'],
            ['softwareVersion', 'software_version'],
            ['programReference', 'program_reference'],
            ['changeSummary', 'change_summary'],
            ['safetyRelated', 'safety_related'],
            ['productionImpact', 'production_impact'],
            ['validation', 'validation'],
            ['validationResult', 'validation_result'],
            ['openRisk', 'open_risk'],
            ['rollbackPlan', 'rollback_plan'],
          ] as const);
    const normalized = (field: string, value: unknown): unknown =>
      field === 'safetyRelated' ? Boolean(value) : value === undefined ? null : value;
    const currentValue = (field: string, column: string): unknown =>
      field === 'safetyRelated' ? Boolean(Number(current[column] ?? 0)) : (current[column] ?? null);
    const changedFields = fields
      .filter(([field, column]) => normalized(field, input[field]) !== currentValue(field, column))
      .map(([field]) => field);
    if (changedFields.length === 0) return { id: String(input.id), version };
    const before = Object.fromEntries(
      fields
        .filter(([field]) => changedFields.includes(field))
        .map(([field, column]) => [field, currentValue(field, column)]),
    );
    const after = Object.fromEntries(
      fields
        .filter(([field]) => changedFields.includes(field))
        .map(([field]) => [field, normalized(field, input[field])]),
    );
    const timestamp = now();
    const nextState = ['submitted', 'approved'].includes(String(current.approval_state))
      ? 'needs_changes'
      : String(current.approval_state);
    const setClause = fields.map(([, column]) => `${column}=?`).join(',');
    const values: Array<string | number | null> = fields.map(([field]) => {
      const value = normalized(field, input[field]);
      if (field === 'safetyRelated') return value ? 1 : 0;
      return typeof value === 'string' || typeof value === 'number' || value === null
        ? value
        : null;
    });
    const result = this.transaction(() => {
      const update = this.sqlite
        .prepare(
          `UPDATE ${table} SET ${setClause},approval_state=?,reviewed_by=NULL,reviewed_at=NULL,updated_at=?,version=version+1 WHERE id=? AND version=?`,
        )
        .run(...values, nextState, timestamp, String(input.id), version);
      if (update.changes !== 1) throw new ConflictError('Report changed or cannot be edited');
      this.audit(
        principal,
        `report.${type}.update`,
        this.reportSourceType(type),
        String(input.id),
        {
          projectId,
          changedFields,
          before,
          after,
        },
      );
      this.notifyReportChanged(
        principal,
        type,
        String(input.id),
        projectId,
        changedFields,
        'report_modified',
        timestamp,
      );
      return { id: String(input.id), version: version + 1, changedFields };
    });
    return result;
  }

  updateDailyReport(
    principal: Principal,
    input: DailyReportInput & { id: string; version: number },
  ) {
    return this.updateReport(principal, 'daily', input as unknown as Record<string, unknown>);
  }

  updateTechnicalReport(
    principal: Principal,
    input: TechnicalReportInput & { id: string; version: number },
  ) {
    return this.updateReport(principal, 'technical', input as unknown as Record<string, unknown>);
  }

  deleteReport(principal: Principal, type: 'daily' | 'technical', id: string, version: number) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner access required');
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const current = this.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!current) throw new ValidationError('Report not found');
    if (this.reportIsLocked(type, id))
      throw new ConflictError('Finalized reports cannot be deleted');
    if (
      type === 'technical' &&
      this.sqlite.prepare('SELECT 1 FROM technical_change WHERE technical_report_id=?').get(id)
    )
      throw new ConflictError('Remove linked technical changes before deleting this report');
    const result = this.transaction(() => {
      const deleted = this.sqlite
        .prepare(`DELETE FROM ${table} WHERE id=? AND version=?`)
        .run(id, version);
      if (deleted.changes !== 1) throw new ConflictError('Report changed or cannot be deleted');
      this.audit(principal, `report.${type}.delete`, this.reportSourceType(type), id, {
        projectId: String(current.project_id),
        before: current,
      });
      this.notifyReportChanged(
        principal,
        type,
        id,
        String(current.project_id),
        ['record'],
        'report_deleted',
        now(),
      );
      return { id };
    });
    return result;
  }

  submitReport(principal: Principal, type: 'daily' | 'technical', id: string, baseVersion: number) {
    this.assertActive(principal);
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const ownerColumn = type === 'daily' ? 'worker_id' : 'author_id';
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        `UPDATE ${table} SET approval_state='submitted',updated_at=?,version=version+1 WHERE id=? AND ${ownerColumn}=? AND approval_state IN ('draft','needs_changes') AND version=?`,
      )
      .run(timestamp, id, principal.userId, baseVersion);
    if (result.changes !== 1) throw new ConflictError('Report changed or cannot be submitted');
    this.audit(principal, `${type}_report.submit`, table, id, { baseVersion });
  }

  reviewReport(
    principal: Principal,
    type: 'daily' | 'technical',
    id: string,
    decision: 'approved' | 'needs_changes',
    reason?: string,
  ) {
    this.assertActive(principal);
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const ownerColumn = type === 'daily' ? 'worker_id' : 'author_id';
    const row = this.sqlite
      .prepare(
        `SELECT project_id,${ownerColumn} owner_id,approval_state,safety_related FROM ${table} WHERE id=?`,
      )
      .get(id) as
      | { project_id: string; owner_id: string; approval_state: string; safety_related: number }
      | undefined;
    if (!row) throw new ValidationError('Report not found');
    if (!canReviewProject(principal, row.project_id))
      throw new AccessDeniedError('Project review required');
    if (row.approval_state !== 'submitted') throw new ConflictError('Report is not submitted');
    if (decision === 'needs_changes' && !reason) throw new ValidationError('A reason is required');
    const timestamp = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          `UPDATE ${table} SET approval_state=?,reviewed_by=?,reviewed_at=?,updated_at=?,version=version+1 WHERE id=?`,
        )
        .run(decision, principal.userId, timestamp, timestamp, id);
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          `${type}_report`,
          id,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          timestamp,
        );
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), row.owner_id, `report_${decision}`, id, timestamp);
      this.audit(principal, `${type}_report.${decision}`, table, id, {
        reason: reason ?? null,
        safetyRelated: Boolean(row.safety_related),
      });
    });
  }

  createPlanningAssignment(
    principal: Principal,
    input: {
      projectId: string;
      workerId: string;
      startsAt: string;
      endsAt: string;
      plannedMinutes: number;
      site?: string;
      requiredSkill?: string;
    },
  ) {
    return this.planning.createPlanningAssignment(principal, input);
  }

  createExpense(principal: Principal, input: ExpenseInput) {
    this.assertActive(principal);
    assertDate(input.spentOn, 'Expense date');
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 ok FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
      )
      .get(input.projectId, principal.userId, input.spentOn, input.spentOn);
    if (!assignment) throw new AccessDeniedError('Active project assignment required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    if (input.amountMinor <= 0n) throw new ValidationError('Expense amount must be positive');
    const normalizedWhoPaid = input.whoPaid === 'company' ? 'company_direct' : input.whoPaid;
    const paidBy = ['worker', 'company_card', 'company_direct', 'client', 'third_party'];
    if (!paidBy.includes(normalizedWhoPaid)) throw new ValidationError('Expense payer is invalid');
    if (input.taxAmountMinor !== undefined && input.taxAmountMinor < 0n)
      throw new ValidationError('Expense tax cannot be negative');
    if (
      input.fxRateBps !== undefined &&
      (!Number.isInteger(input.fxRateBps) || input.fxRateBps <= 0)
    )
      throw new ValidationError('Expense FX rate is invalid');
    const projectAmountMinor = input.projectCurrencyAmountMinor ?? input.amountMinor;
    if (projectAmountMinor <= 0n)
      throw new ValidationError('Project expense amount must be positive');
    if (input.currency !== project.currency && input.projectCurrencyAmountMinor === undefined)
      throw new ValidationError('A project-currency amount is required for foreign expenses');
    if (input.currency !== project.currency && input.fxRateBps === undefined)
      throw new ValidationError('An FX rate is required for foreign expenses');
    if (input.receiptRequired && !input.receiptDocumentId)
      throw new ValidationError('A committed receipt is required');
    if (input.receiptDocumentId) {
      const receipt = this.sqlite
        .prepare("SELECT 1 ok FROM document WHERE id=? AND owner_id=? AND state='committed'")
        .get(input.receiptDocumentId, principal.userId);
      if (!receipt) throw new AccessDeniedError('Committed owned receipt required');
    }
    const id = newId();
    const timestamp = now();
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
      throw new ValidationError('All-in billing must use the all-in client treatment');
    if (billingTreatment.startsWith('reimbursable') && input.clientTreatment === 'all_in')
      throw new ValidationError('All-in expenses cannot use reimbursable billing');
    if (input.clientTreatment === 'reimbursable' && !billableTreatments.includes(billingTreatment))
      throw new ValidationError('Reimbursable expenses require a billable treatment');
    if (billingTreatment === 'reimbursable_plus_markup' && input.markupBps === undefined)
      throw new ValidationError('Markup basis points are required for marked-up reimbursement');
    if (
      input.markupBps !== undefined &&
      (!Number.isInteger(input.markupBps) || input.markupBps < 0 || input.markupBps > 100_000)
    )
      throw new ValidationError('Markup basis points are invalid');
    const legacyTreatment =
      billingTreatment === 'all_in'
        ? 'all_in'
        : billingTreatment.startsWith('reimbursable')
          ? 'reimbursable'
          : 'non_billable';
    const billingAmountMinor =
      billingTreatment === 'reimbursable_at_cost' || billingTreatment === 'reimbursable_plus_markup'
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
        id,
        input.projectId,
        principal.userId,
        input.spentOn,
        input.category,
        input.currency,
        safeInteger(input.amountMinor),
        legacyTreatment,
        assertText(input.vendor, 'Vendor', 200),
        assertText(input.description, 'Description'),
        normalizedWhoPaid,
        input.paymentMethod?.trim() || null,
        input.receiptRequired ? 1 : 0,
        input.receiptDocumentId ?? null,
        'draft',
        'pending',
        billingTreatment,
        input.markupBps ?? null,
        billingAmountMinor === null ? null : safeInteger(billingAmountMinor),
        safeInteger(projectAmountMinor),
        input.taxAmountMinor === undefined ? null : safeInteger(input.taxAmountMinor),
        input.fxRateBps ?? null,
        normalizedWhoPaid === 'worker' ? safeInteger(projectAmountMinor) : null,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'expense.create', 'expense', id, {
      amountMinor: input.amountMinor.toString(),
    });
    return { id, version: 1 };
  }

  registerReceipt(
    principal: Principal,
    input: {
      projectId: string;
      sha256: string;
      mediaType: string;
      byteLength: number;
      storageKey: string;
      originalFilename: string;
    },
  ) {
    this.assertActive(principal);
    this.assertProjectMembership(principal, input.projectId);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new ValidationError('Invalid receipt hash');
    assertSafeStorageKey(input.storageKey, () => new ValidationError('Unsafe receipt storage key'));
    if (
      ![
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
      ].includes(input.mediaType)
    )
      throw new ValidationError('Unsupported receipt media type');
    if (
      !Number.isInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 10_000_000
    )
      throw new ValidationError('Receipt size is invalid');
    const existing = this.sqlite
      .prepare(
        'SELECT id FROM document WHERE sha256=? AND byte_length=? AND owner_id=? AND project_id=?',
      )
      .get(input.sha256, input.byteLength, principal.userId, input.projectId) as
      | { id: string }
      | undefined;
    if (existing) return { ...existing, created: false };
    const duplicateContent = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=?')
      .get(input.sha256, input.byteLength) as { id: string } | undefined;
    if (duplicateContent)
      throw new ConflictError('Receipt content is already registered to another record');
    const id = newId();
    const timestamp = now();
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'receipt';
    this.sqlite
      .prepare(
        `INSERT INTO document(id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,original_filename,safe_filename,description,sensitive,artifact_type,created_at,updated_at,scan_status) VALUES(?,?,?,?,?,?,'${malwareScanRequired() ? 'quarantined' : 'committed'}',?,?,?,?,0,'receipt',?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.sha256,
        input.mediaType,
        input.byteLength,
        input.storageKey,
        safeFilename,
        safeFilename,
        'Expense receipt',
        timestamp,
        timestamp,
        malwareScanRequired() ? 'pending' : 'not_scanned',
      );
    if (malwareScanRequired()) {
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO job(id,kind,idempotency_key,state,run_after,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'document_scan',
          `document-scan:${id}`,
          'pending',
          timestamp,
          JSON.stringify({ documentId: id }),
          timestamp,
          timestamp,
        );
    }
    this.audit(principal, 'receipt.commit', 'document', id, {
      projectId: input.projectId,
      byteLength: input.byteLength,
    });
    return { id, created: true };
  }

  removeUnreferencedReceipt(principal: Principal, documentId: string): string | null {
    this.assertActive(principal);
    return this.transaction(() => {
      const row = this.sqlite
        .prepare(
          "SELECT storage_key FROM document WHERE id=? AND owner_id=? AND artifact_type='receipt' AND state='committed' AND NOT EXISTS (SELECT 1 FROM expense WHERE receipt_document_id=document.id)",
        )
        .get(documentId, principal.userId) as { storage_key: string } | undefined;
      if (!row) return null;
      this.sqlite.prepare('DELETE FROM document WHERE id=?').run(documentId);
      this.audit(principal, 'receipt.cleanup', 'document', documentId, {});
      return row.storage_key;
    });
  }

  registerPrivateDocument(
    principal: Principal,
    input: Readonly<{
      projectId?: string;
      sha256: string;
      mediaType: string;
      byteLength: number;
      storageKey: string;
      originalFilename: string;
      description?: string;
      artifactType: string;
      softwareVersion?: string;
      sensitivity?: 'internal' | 'sensitive' | 'customer_private';
      supersedesId?: string;
    }>,
  ) {
    this.assertActive(principal);
    if (input.projectId && principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      this.assertProjectMembership(principal, input.projectId);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new ValidationError('Invalid document hash');
    if (
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 50_000_000
    )
      throw new ValidationError('Document size is invalid');
    assertSafeStorageKey(
      input.storageKey,
      () => new ValidationError('Unsafe document storage key'),
    );
    const allowedMediaTypes = new Set([
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ]);
    if (!allowedMediaTypes.has(input.mediaType))
      throw new ValidationError('Unsupported private document media type');
    const existing = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=? AND owner_id=?')
      .get(input.sha256, input.byteLength, principal.userId) as { id: string } | undefined;
    if (existing) return { id: existing.id, created: false };
    const duplicateContent = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=?')
      .get(input.sha256, input.byteLength) as { id: string } | undefined;
    if (duplicateContent)
      throw new ConflictError('Document content is already registered to another record');
    if (input.supersedesId) {
      const superseded = this.sqlite
        .prepare('SELECT project_id,owner_id,state FROM document WHERE id=?')
        .get(input.supersedesId) as
        | { project_id: string | null; owner_id: string; state: string }
        | undefined;
      if (
        !superseded ||
        superseded.state !== 'committed' ||
        superseded.owner_id !== principal.userId ||
        (input.projectId ?? null) !== superseded.project_id
      )
        throw new AccessDeniedError('Superseded document access required');
    }
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'artifact';
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        `INSERT INTO document(
          id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
          original_filename,description,sensitive,artifact_type,software_version,
          supersedes_id,created_at,updated_at,sensitivity,safe_filename,scan_status
        ) VALUES(?,?,?,?,?,?,'${malwareScanRequired() ? 'quarantined' : 'committed'}',?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId ?? null,
        principal.userId,
        input.sha256,
        input.mediaType,
        input.byteLength,
        input.storageKey,
        safeFilename,
        input.description?.trim() || null,
        input.sensitivity === 'sensitive' ? 1 : 0,
        assertText(input.artifactType, 'Artifact type', 100),
        input.softwareVersion?.trim() || null,
        input.supersedesId ?? null,
        timestamp,
        timestamp,
        input.sensitivity ?? 'internal',
        safeFilename,
        malwareScanRequired() ? 'pending' : 'not_scanned',
      );
    if (malwareScanRequired()) {
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO job(id,kind,idempotency_key,state,run_after,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'document_scan',
          `document-scan:${id}`,
          'pending',
          timestamp,
          JSON.stringify({ documentId: id }),
          timestamp,
          timestamp,
        );
    }
    this.audit(principal, 'document.commit', 'document', id, {
      projectId: input.projectId ?? null,
      artifactType: input.artifactType,
      byteLength: input.byteLength,
    });
    return { id, created: true };
  }

  listDocuments(principal: Principal, projectId?: string) {
    this.assertReadable(principal);
    const conditions: string[] = ["d.state='committed'"];
    const values: string[] = [];
    if (projectId) {
      if (principal.role === 'worker') this.assertProjectMembership(principal, projectId);
      else if (principal.role === 'project_manager' && !principal.projectIds.has(projectId))
        throw new AccessDeniedError('Project access required');
      conditions.push('d.project_id=?');
      values.push(projectId);
      if (principal.role === 'worker') {
        conditions.push('d.owner_id=?');
        values.push(principal.userId);
      }
    } else if (principal.role === 'worker') {
      conditions.push('d.owner_id=?');
      values.push(principal.userId);
    } else if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (!ids.length) return [];
      conditions.push(`d.project_id IN (${ids.map(() => '?').join(',')})`);
      values.push(...ids);
    }
    return this.sqlite
      .prepare(
        `SELECT d.id,d.project_id,d.owner_id,d.original_filename,d.safe_filename,d.media_type,
                d.byte_length,d.artifact_type,d.software_version,d.sensitivity,d.scan_status,
                d.created_at,p.project_number,u.name owner_name
         FROM document d LEFT JOIN project p ON p.id=d.project_id JOIN user u ON u.id=d.owner_id
         WHERE ${conditions.join(' AND ')} ORDER BY d.created_at DESC LIMIT 500`,
      )
      .all(...values);
  }

  submitExpense(principal: Principal, id: string, baseVersion: number) {
    this.assertActive(principal);
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE expense SET approval_state='submitted',submitted_at=?,updated_at=?,version=version+1 WHERE id=? AND worker_id=? AND approval_state IN ('draft','needs_changes') AND version=? AND invoice_id IS NULL AND (receipt_required=0 OR receipt_document_id IS NOT NULL)",
      )
      .run(timestamp, timestamp, id, principal.userId, baseVersion);
    if (result.changes !== 1)
      throw new ConflictError('Expense changed, lacks receipt, or cannot be submitted');
    this.audit(principal, 'expense.submit', 'expense', id, { baseVersion });
    return { id, version: baseVersion + 1 };
  }

  updateExpense(
    principal: Principal,
    input: Readonly<{
      id: string;
      version: number;
      spentOn?: string;
      vendor?: string;
      category?: string;
      description?: string;
      amountMinor?: bigint;
      projectCurrencyAmountMinor?: bigint;
      fxRateBps?: number;
      paymentMethod?: string;
      receiptDocumentId?: string;
    }>,
  ) {
    this.assertActive(principal);
    const current = this.sqlite
      .prepare(
        `SELECT e.project_id,e.worker_id,e.approval_state,e.invoice_id,e.billing_state,e.receipt_required,
                e.currency,e.billing_treatment,e.markup_bps,p.currency project_currency
         FROM expense e JOIN project p ON p.id=e.project_id WHERE e.id=?`,
      )
      .get(input.id) as
      | {
          project_id: string;
          worker_id: string;
          approval_state: string;
          invoice_id: string | null;
          billing_state: string;
          receipt_required: number;
          currency: Currency;
          billing_treatment: string;
          markup_bps: number | null;
          project_currency: Currency;
        }
      | undefined;
    if (!current) throw new ValidationError('Expense not found');
    if (current.worker_id !== principal.userId)
      throw new AccessDeniedError('Expense ownership required');
    if (
      current.invoice_id ||
      current.billing_state !== 'unlocked' ||
      !['draft', 'needs_changes'].includes(current.approval_state)
    )
      throw new ConflictError('Only an unlocked editable expense draft can change');
    if (input.spentOn) assertDate(input.spentOn, 'Expense date');
    if (input.amountMinor !== undefined && input.amountMinor <= 0n)
      throw new ValidationError('Expense amount must be positive');
    if (
      input.fxRateBps !== undefined &&
      (!Number.isInteger(input.fxRateBps) || input.fxRateBps <= 0)
    )
      throw new ValidationError('Expense FX rate is invalid');
    const projectAmount = input.projectCurrencyAmountMinor ?? input.amountMinor;
    if (projectAmount !== undefined && projectAmount <= 0n)
      throw new ValidationError('Project expense amount must be positive');
    if (
      input.amountMinor !== undefined &&
      current.currency !== current.project_currency &&
      input.projectCurrencyAmountMinor === undefined
    )
      throw new ValidationError('A project-currency amount is required for foreign expenses');
    if (
      input.amountMinor !== undefined &&
      current.currency !== current.project_currency &&
      input.fxRateBps === undefined
    )
      throw new ValidationError('An FX rate is required for foreign expenses');
    if (input.receiptDocumentId) {
      const receipt = this.sqlite
        .prepare("SELECT 1 FROM document WHERE id=? AND owner_id=? AND state='committed'")
        .get(input.receiptDocumentId, principal.userId);
      if (!receipt) throw new AccessDeniedError('Committed owned receipt required');
    }
    const billingAmount =
      projectAmount !== undefined &&
      ['reimbursable_at_cost', 'reimbursable_plus_markup'].includes(current.billing_treatment)
        ? applyBasisPoints(
            money(current.project_currency, projectAmount),
            10_000 + (current.markup_bps ?? 0),
          ).minorUnits
        : undefined;
    const result = this.sqlite
      .prepare(
        `UPDATE expense SET spent_on=COALESCE(?,spent_on),vendor=COALESCE(?,vendor),
          category=COALESCE(?,category),description=COALESCE(?,description),
          amount_minor=COALESCE(?,amount_minor),payment_method=COALESCE(?,payment_method),
          project_currency_amount_minor=COALESCE(?,project_currency_amount_minor),
          billing_amount_minor=COALESCE(?,billing_amount_minor),fx_rate_bps=COALESCE(?,fx_rate_bps),
          receipt_document_id=COALESCE(?,receipt_document_id),updated_at=?,version=version+1
         WHERE id=? AND worker_id=? AND version=? AND invoice_id IS NULL AND billing_state='unlocked'
           AND approval_state IN ('draft','needs_changes')`,
      )
      .run(
        input.spentOn ?? null,
        input.vendor?.trim() || null,
        input.category?.trim() || null,
        input.description?.trim() || null,
        input.amountMinor === undefined ? null : safeInteger(input.amountMinor),
        input.paymentMethod?.trim() || null,
        projectAmount === undefined ? null : safeInteger(projectAmount),
        billingAmount === undefined ? null : safeInteger(billingAmount),
        input.fxRateBps ?? null,
        input.receiptDocumentId ?? null,
        now(),
        input.id,
        principal.userId,
        input.version,
      );
    if (result.changes !== 1) throw new ConflictError('Expense changed or cannot be edited');
    this.audit(principal, 'expense.update', 'expense', input.id, { version: input.version });
    return { id: input.id, version: input.version + 1 };
  }

  operationalApproveExpense(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ) {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare('SELECT project_id,approval_state FROM expense WHERE id=?')
      .get(id) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw new ValidationError('Expense not found');
    if (!canReviewProject(principal, row.project_id))
      throw new AccessDeniedError('Project review required');
    if (row.approval_state !== 'submitted') throw new ConflictError('Expense is not submitted');
    const timestamp = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          'UPDATE expense SET approval_state=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE id=?',
        )
        .run(
          decision,
          decision === 'approved' ? principal.userId : null,
          decision === 'approved' ? timestamp : null,
          timestamp,
          id,
        );
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'expense',
          id,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          timestamp,
        );
      this.audit(principal, `expense.${decision}`, 'expense', id, { reason: reason ?? null });
    });
  }

  financeApproveExpense(principal: Principal, id: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE expense SET finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='approved' AND invoice_id IS NULL AND billing_state='unlocked'",
      )
      .run(principal.userId, timestamp, timestamp, id);
    if (result.changes !== 1) throw new ConflictError('Approved unlocked expense required');
    this.audit(principal, 'expense.finance_approve', 'expense', id, {});
  }

  createCompensationRule(
    principal: Principal,
    input: {
      workerId: string;
      projectId?: string;
      currency: Currency;
      rateMinor: bigint;
      rateBasis: 'hourly' | 'daily';
      dailyGuaranteeMinutes?: number;
      effectiveFrom: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,daily_guarantee_minutes,worker_visible,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        safeInteger(input.rateMinor),
        input.rateBasis,
        input.dailyGuaranteeMinutes ?? null,
        1,
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'compensation_rule.create', 'compensation_rule', id, {
      workerId: input.workerId,
    });
    return { id };
  }

  createClientLaborRate(
    principal: Principal,
    input: {
      projectId: string;
      workerId?: string;
      category?: string;
      currency: Currency;
      hourlyRateMinor: bigint;
      effectiveFrom: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO client_labor_rate(id,project_id,worker_id,category,currency,hourly_rate_minor,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.workerId ?? null,
        input.category ?? null,
        input.currency,
        safeInteger(input.hourlyRateMinor),
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'client_rate.create', 'client_labor_rate', id, {
      projectId: input.projectId,
    });
    return { id };
  }

  createInternalCostRule(
    principal: Principal,
    input: {
      workerId: string;
      projectId?: string;
      currency: Currency;
      hourlyRateMinor: bigint;
      effectiveFrom: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO internal_cost_rule(id,worker_id,project_id,currency,hourly_rate_minor,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        safeInteger(input.hourlyRateMinor),
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'internal_cost.create', 'internal_cost_rule', id, {
      workerId: input.workerId,
    });
    return { id };
  }

  createLegalEntity(
    principal: Principal,
    input: {
      code: string;
      legalName: string;
      currency: Currency;
      billingAddress: string;
      companyIdentifiers: string;
    },
  ) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    const code = assertText(input.code, 'Legal entity code', 40).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))
      throw new ValidationError('Legal entity code may contain only letters, numbers, _ and -');
    const legalName = assertText(input.legalName, 'Legal entity name', 300);
    const billingAddress = assertText(input.billingAddress, 'Billing address', 2000);
    const companyIdentifiers = assertText(input.companyIdentifiers, 'Company identifiers', 1000);
    const id = newId();
    const timestamp = now();
    try {
      this.sqlite
        .prepare(
          'INSERT INTO legal_entity(id,code,legal_name,currency,billing_address,company_identifiers,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          code,
          legalName,
          input.currency,
          billingAddress,
          companyIdentifiers,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (error instanceof Error && /UNIQUE/i.test(error.message))
        throw new ConflictError('Legal entity code already exists');
      throw error;
    }
    this.audit(principal, 'legal_entity.create', 'legal_entity', id, { code: input.code });
    return { id };
  }

  createInvoiceNumberPolicy(
    principal: Principal,
    input: {
      legalEntityId: string;
      prefix: string;
      digits: number;
      effectiveFrom: string;
      accountantApprovedAt: string;
    },
  ) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    assertDate(input.effectiveFrom, 'Invoice-number policy effective date');
    if (!/^\S{1,30}$/.test(input.prefix.trim()))
      throw new ValidationError('Invoice-number prefix must be 1–30 non-space characters');
    if (!Number.isInteger(input.digits) || input.digits < 4 || input.digits > 10)
      throw new ValidationError('Invoice-number digits must be between 4 and 10');
    if (Number.isNaN(Date.parse(input.accountantApprovedAt)))
      throw new ValidationError('Accountant approval timestamp is invalid');
    if (!this.sqlite.prepare('SELECT 1 FROM legal_entity WHERE id=?').get(input.legalEntityId))
      throw new ValidationError('Legal entity not found');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO invoice_number_policy(id,legal_entity_id,prefix,digits,effective_from,accountant_approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.legalEntityId,
        input.prefix.trim(),
        input.digits,
        input.effectiveFrom,
        input.accountantApprovedAt,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'invoice_policy.create', 'invoice_number_policy', id, {});
    return { id };
  }

  createTaxProfile(
    principal: Principal,
    input: {
      legalEntityId?: string;
      name: string;
      currency: Currency;
      effectiveFrom: string;
      components: readonly { name: string; basisPoints: number; compound?: boolean }[];
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    assertDate(input.effectiveFrom, 'Tax profile effective date');
    const name = assertText(input.name, 'Tax profile name', 160);
    if (!input.components.length)
      throw new ValidationError('At least one tax component is required');
    for (const component of input.components) {
      assertText(component.name, 'Tax component name', 160);
      if (
        !Number.isInteger(component.basisPoints) ||
        component.basisPoints < 0 ||
        component.basisPoints > 100_000
      )
        throw new ValidationError('Tax component basis points must be between 0 and 100000');
    }
    if (input.legalEntityId) {
      const legalEntity = this.sqlite
        .prepare('SELECT currency FROM legal_entity WHERE id=?')
        .get(input.legalEntityId) as { currency: Currency } | undefined;
      if (!legalEntity) throw new ValidationError('Legal entity not found');
      if (legalEntity.currency !== input.currency)
        throw new ValidationError('Tax profile currency must match the legal entity currency');
    }
    return this.transaction(() => {
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          "INSERT INTO tax_profile(id,name,currency,effective_from,version,legal_entity_id,status) VALUES(?,?,?,?,1,?,'active')",
        )
        .run(id, name, input.currency, input.effectiveFrom, input.legalEntityId ?? null);
      input.components.forEach((component, index) => {
        this.sqlite
          .prepare(
            'INSERT INTO tax_component(id,tax_profile_id,name,basis_points,calculation_order,compound) VALUES(?,?,?,?,?,?)',
          )
          .run(
            newId(),
            id,
            assertText(component.name, 'Tax component name', 160),
            component.basisPoints,
            index,
            component.compound ? 1 : 0,
          );
      });
      this.audit(principal, 'tax_profile.create', 'tax_profile', id, {
        componentCount: input.components.length,
        timestamp,
      });
      return { id };
    });
  }

  createBillingRule(
    principal: Principal,
    input: {
      projectId: string;
      legalEntityId: string;
      streamType: 'labor' | 'expense' | 'milestone' | 'other';
      cadenceType: string;
      anchorDate?: string;
      taxProfileId: string;
      currency: Currency;
      effectiveFrom: string;
      templateId?: string;
      recipientEmail?: string;
      paymentTermsDays?: number;
      poNumberOverride?: string;
      semiMonthlyRule?: string;
      groupingMode?: string;
      fixedAmountMinor?: bigint;
      includedMinutes?: number;
      monthlyCutoffDay?: number;
      autoGenerateDraft?: boolean;
      billingContactId?: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const cadence = input.cadenceType === 'fourteen_day' ? 'every_14_days' : input.cadenceType;
    if (
      ![
        'weekly',
        'every_14_days',
        'semi_monthly',
        'monthly',
        'custom',
        'milestone',
        'manual',
      ].includes(cadence)
    )
      throw new ValidationError('Unsupported billing cadence');
    assertDate(input.effectiveFrom, 'Effective date');
    if (input.anchorDate) assertDate(input.anchorDate, 'Anchor date');
    if (cadence === 'every_14_days' && !input.anchorDate)
      throw new ValidationError('Every 14 days requires an anchor date');
    if (
      input.monthlyCutoffDay !== undefined &&
      (!Number.isInteger(input.monthlyCutoffDay) ||
        input.monthlyCutoffDay < 1 ||
        input.monthlyCutoffDay > 28)
    )
      throw new ValidationError('Monthly cutoff day must be between 1 and 28');
    if (input.fixedAmountMinor !== undefined && input.fixedAmountMinor < 0n)
      throw new ValidationError('Fixed billing amount cannot be negative');
    if (
      input.includedMinutes !== undefined &&
      (!Number.isInteger(input.includedMinutes) || input.includedMinutes < 0)
    )
      throw new ValidationError('Included billing minutes must be a non-negative integer');
    if (
      cadence === 'semi_monthly' &&
      !['1_15_16_end', '1_15', '16_end'].includes(input.semiMonthlyRule ?? '1_15_16_end')
    )
      throw new ValidationError('Semi-monthly split is invalid');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    if (project.currency !== input.currency)
      throw new ValidationError('Billing currency must match the project currency');
    const legalEntity = this.sqlite
      .prepare('SELECT currency FROM legal_entity WHERE id=?')
      .get(input.legalEntityId) as { currency: Currency } | undefined;
    if (!legalEntity) throw new ValidationError('Legal entity not found');
    if (legalEntity.currency !== input.currency)
      throw new ValidationError('Billing currency must match the legal entity currency');
    const taxProfile = this.sqlite
      .prepare("SELECT currency FROM tax_profile WHERE id=? AND status='active'")
      .get(input.taxProfileId) as { currency: Currency } | undefined;
    if (!taxProfile) throw new ValidationError('Active tax profile not found');
    if (taxProfile.currency !== input.currency)
      throw new ValidationError('Billing currency must match the tax profile currency');
    if (!this.sqlite.prepare('SELECT 1 FROM tax_profile WHERE id=?').get(input.taxProfileId))
      throw new ValidationError('Tax profile not found');
    if (input.billingContactId) {
      const contact = this.sqlite
        .prepare(
          'SELECT 1 FROM client_contact cc JOIN project p ON p.client_id=cc.client_id WHERE cc.id=? AND p.id=?',
        )
        .get(input.billingContactId, input.projectId);
      if (!contact)
        throw new ValidationError('Billing contact is not assigned to this project client');
    }
    const paymentTermsDays = input.paymentTermsDays ?? 30;
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365)
      throw new ValidationError('Payment terms are invalid');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO billing_rule(id,project_id,legal_entity_id,stream_type,enabled,cadence_type,anchor_date,tax_profile_id,currency,auto_generate_draft,auto_issue,auto_send,effective_from,created_at,updated_at,template_id,recipient_email,billing_contact_id,payment_terms_days,po_number_override,semi_monthly_rule,grouping_mode,fixed_amount_minor,included_minutes,monthly_cutoff_day) VALUES(?,?,?,?,1,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?,?, ?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.legalEntityId,
        input.streamType,
        cadence,
        input.anchorDate ?? null,
        input.taxProfileId,
        input.currency,
        input.autoGenerateDraft ? 1 : 0,
        input.effectiveFrom,
        timestamp,
        timestamp,
        input.templateId ?? 'default',
        input.recipientEmail || null,
        input.billingContactId || null,
        paymentTermsDays,
        input.poNumberOverride || null,
        input.semiMonthlyRule ?? '1_15_16_end',
        input.groupingMode ?? 'summary',
        input.fixedAmountMinor === undefined ? null : safeInteger(input.fixedAmountMinor),
        input.includedMinutes ?? null,
        input.monthlyCutoffDay ?? null,
      );
    this.audit(principal, 'billing_rule.create', 'billing_rule', id, {
      streamType: input.streamType,
    });
    return { id };
  }

  listLegalEntities(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare('SELECT id,code,legal_name,currency FROM legal_entity ORDER BY code')
      .all();
  }

  listTaxProfiles(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        "SELECT tp.id,tp.name,tp.currency,tp.effective_from,tp.legal_entity_id,le.code legal_entity_code FROM tax_profile tp LEFT JOIN legal_entity le ON le.id=tp.legal_entity_id WHERE tp.status='active' ORDER BY tp.name",
      )
      .all();
  }

  billingReadiness(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const rule = this.sqlite
      .prepare(
        `SELECT br.project_id,br.stream_type,br.tax_profile_id,br.legal_entity_id,br.cadence_type,
                br.anchor_date,br.monthly_cutoff_day,br.semi_monthly_rule,
                p.billing_model,p.po_cap_minor,p.fixed_price_minor
         FROM billing_rule br JOIN project p ON p.id=br.project_id
         WHERE br.id=? AND br.enabled=1`,
      )
      .get(billingRuleId) as
      | {
          project_id: string;
          stream_type: string;
          tax_profile_id: string | null;
          legal_entity_id: string | null;
          cadence_type: string;
          anchor_date: string | null;
          monthly_cutoff_day: number | null;
          semi_monthly_rule: string | null;
          billing_model: string;
          po_cap_minor: number | null;
          fixed_price_minor: number | null;
        }
      | undefined;
    if (!rule) throw new ValidationError('Billing rule not found');
    const reasons: ReadinessReason[] = [];
    if (!rule.tax_profile_id) reasons.push({ code: 'missing_tax_profile' });
    if (!rule.legal_entity_id) reasons.push({ code: 'missing_legal_entity' });
    if (periodEnd < periodStart) reasons.push({ code: 'invalid_period' });
    if (['weekly', 'every_14_days', 'semi_monthly', 'monthly'].includes(rule.cadence_type)) {
      try {
        const expected = periodForCadence(
          rule.cadence_type as 'weekly' | 'every_14_days' | 'semi_monthly' | 'monthly',
          periodStart,
          {
            anchorDate: rule.anchor_date ?? undefined,
            monthlyCutoffDay: rule.monthly_cutoff_day ?? undefined,
          },
        );
        if (!expected || expected.start !== periodStart || expected.end !== periodEnd)
          reasons.push({ code: 'period_cutoff_mismatch' });
      } catch {
        reasons.push({ code: 'invalid_period_configuration' });
      }
    }
    if (
      rule.billing_model === 'all_in' &&
      rule.stream_type === 'labor' &&
      rule.fixed_price_minor === null
    )
      reasons.push({ code: 'missing_fixed_price' });
    if (rule.billing_model === 'capped_tm' && rule.po_cap_minor !== null) {
      const consumed = this.sqlite
        .prepare(
          `SELECT COALESCE(sum(subtotal_minor),0) amount FROM invoice
           WHERE project_id=? AND state IN ('draft','approved','issued','sent','partially_paid','paid','overdue')`,
        )
        .get(rule.project_id) as { amount: number };
      if (BigInt(consumed.amount) >= BigInt(rule.po_cap_minor))
        reasons.push({ code: 'cap_exhausted' });
    }
    if (rule.stream_type === 'labor') {
      const pending = this.sqlite
        .prepare(
          "SELECT id FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state NOT IN ('approved','locked')",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{ id: string }>;
      reasons.push(...pending.map((row) => ({ code: 'pending_time_approval', sourceId: row.id })));
      const billable = this.sqlite
        .prepare(
          "SELECT id,worker_id,category,activity_code,work_date FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state IN ('approved','locked') AND billability_state='billable' AND invoice_id IS NULL",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        category: string;
        activity_code: string | null;
        work_date: string;
      }>;
      for (const row of billable) {
        const rate = this.findClientRate(
          principal,
          rule.project_id,
          row.worker_id,
          row.category,
          row.work_date,
          row.activity_code,
        );
        if (!rate) reasons.push({ code: 'missing_client_rate', sourceId: row.id });
      }
    } else if (rule.stream_type === 'expense') {
      const pending = this.sqlite
        .prepare(
          "SELECT id FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND invoice_id IS NULL AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem')) AND (approval_state!='approved' OR finance_approved_at IS NULL)",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{ id: string }>;
      reasons.push(
        ...pending.map((row) => ({ code: 'pending_expense_approval', sourceId: row.id })),
      );
    }
    const existing = this.sqlite
      .prepare(
        'SELECT state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
      )
      .get(billingRuleId, periodStart, periodEnd) as { state: string } | undefined;
    const state =
      existing?.state === 'closed' ? 'already_closed' : reasons.length ? 'incomplete' : 'ready';
    return { state, reasons, projectId: rule.project_id, streamType: rule.stream_type } as const;
  }

  createInvoiceDraft(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    assertDate(periodStart, 'Period start');
    assertDate(periodEnd, 'Period end');
    const readiness = this.billingReadiness(principal, billingRuleId, periodStart, periodEnd);
    if (readiness.state !== 'ready' && readiness.state !== 'already_closed')
      throw new ReadinessError(readiness.reasons);
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare(
          'SELECT id,state FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=?',
        )
        .get(billingRuleId, periodStart, periodEnd) as { id: string; state: string } | undefined;
      let refreshed = false;
      if (existing) {
        if (existing.state !== 'draft') return { id: existing.id, created: false, refreshed };
        // Drafts are previews, so they can be rebuilt from newly approved
        // source data. Issued/approved invoices take a separate immutable
        // workflow and never reach this branch.
        this.sqlite.prepare('DELETE FROM invoice_source WHERE invoice_id=?').run(existing.id);
        this.sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(existing.id);
        this.sqlite.prepare("DELETE FROM invoice WHERE id=? AND state='draft'").run(existing.id);
        refreshed = true;
      }
      const rule = this.sqlite
        .prepare(
          `SELECT br.*,p.billing_model,p.po_cap_minor,p.fixed_price_minor
           FROM billing_rule br JOIN project p ON p.id=br.project_id WHERE br.id=?`,
        )
        .get(billingRuleId) as {
        id: string;
        project_id: string;
        stream_type: string;
        currency: Currency;
        tax_profile_id: string;
        cadence_type: string;
        anchor_date: string | null;
        monthly_cutoff_day: number | null;
        semi_monthly_rule: string | null;
        billing_model: string;
        po_cap_minor: number | null;
        fixed_price_minor: number | null;
        fixed_amount_minor: number | null;
        included_minutes: number | null;
      };
      if (!rule) throw new ValidationError('Billing rule not found');
      if (periodEnd < periodStart)
        throw new ValidationError('Billing period end must follow start');
      if (['weekly', 'every_14_days', 'semi_monthly', 'monthly'].includes(rule.cadence_type)) {
        const expected = periodForCadence(
          rule.cadence_type as 'weekly' | 'every_14_days' | 'semi_monthly' | 'monthly',
          periodStart,
          {
            anchorDate: rule.anchor_date ?? undefined,
            monthlyCutoffDay: rule.monthly_cutoff_day ?? undefined,
          },
        );
        if (!expected || expected.start !== periodStart || expected.end !== periodEnd) {
          const explicitlyClosed = this.sqlite
            .prepare(
              "SELECT 1 FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=? AND state='closed'",
            )
            .get(billingRuleId, periodStart, periodEnd);
          if (!explicitlyClosed)
            throw new ValidationError('Billing period does not match the configured cadence');
        }
      }
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO invoice(id,project_id,billing_rule_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,period_start,period_end,created_at,updated_at) VALUES(?,?,?,?,?,?,0,0,0,?,?,?,?)',
        )
        .run(
          id,
          rule.project_id,
          billingRuleId,
          rule.stream_type,
          'draft',
          rule.currency,
          periodStart,
          periodEnd,
          timestamp,
          timestamp,
        );
      let subtotal = money(rule.currency, 0n);
      const consumedForCap =
        rule.billing_model === 'capped_tm' && rule.po_cap_minor !== null
          ? BigInt(
              (
                this.sqlite
                  .prepare(
                    `SELECT COALESCE(sum(subtotal_minor),0) amount FROM invoice
                     WHERE project_id=? AND state IN ('draft','approved','issued','sent','partially_paid','paid','overdue')`,
                  )
                  .get(rule.project_id) as { amount: number }
              ).amount,
            )
          : 0n;
      const capRemaining =
        rule.billing_model === 'capped_tm' && rule.po_cap_minor !== null
          ? BigInt(rule.po_cap_minor) - consumedForCap
          : null;
      if (capRemaining !== null && capRemaining <= 0n)
        throw new ReadinessError([{ code: 'cap_exhausted' }]);
      const fixedAmount =
        rule.billing_model === 'all_in' && rule.stream_type === 'labor'
          ? rule.fixed_price_minor === null
            ? null
            : BigInt(rule.fixed_price_minor)
          : rule.billing_model === 'hybrid' && rule.fixed_amount_minor !== null
            ? BigInt(rule.fixed_amount_minor)
            : null;
      if (fixedAmount !== null) {
        subtotal = add(subtotal, money(rule.currency, fixedAmount));
        this.insertInvoiceLine(
          id,
          rule.billing_model === 'hybrid'
            ? 'Hybrid fixed commissioning fee'
            : 'Fixed-price project fee',
          1,
          1,
          safeInteger(fixedAmount),
          fixedAmount,
          'fixed_price',
          `${rule.project_id}:${rule.stream_type}:${periodStart}:${periodEnd}:fixed`,
          {
            projectId: rule.project_id,
            fixedAmountMinor: fixedAmount.toString(),
            billingModel: rule.billing_model,
          },
        );
      }
      if (
        rule.stream_type === 'labor' &&
        !(rule.billing_model === 'all_in' && fixedAmount !== null)
      ) {
        const rows = this.sqlite
          .prepare(
            "SELECT id,worker_id,work_date,category,activity_code,minutes,activity_summary,version FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state IN ('approved','locked') AND billability_state='billable' AND invoice_id IS NULL ORDER BY work_date,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          worker_id: string;
          work_date: string;
          category: string;
          activity_code: string | null;
          minutes: number;
          activity_summary: string;
          version: number;
        }>;
        const daily = new Map<string, { minutes: number; rate: number; sourceIds: string[] }>();
        let includedRemaining =
          rule.billing_model === 'hybrid' ? Math.max(0, rule.included_minutes ?? 0) : 0;
        for (const row of rows) {
          const rate = this.findClientRate(
            principal,
            rule.project_id,
            row.worker_id,
            row.category,
            row.work_date,
            row.activity_code,
          );
          if (!rate) throw new ReadinessError([{ code: 'missing_client_rate', sourceId: row.id }]);
          const billableMinutes =
            rule.billing_model === 'hybrid'
              ? Math.max(0, row.minutes - Math.min(row.minutes, includedRemaining))
              : row.minutes;
          if (rule.billing_model === 'hybrid')
            includedRemaining = Math.max(0, includedRemaining - row.minutes);
          if (billableMinutes === 0) continue;
          const amount = hourlyRateForMinutes(money(rule.currency, BigInt(rate)), billableMinutes);
          subtotal = add(subtotal, amount);
          const day = daily.get(row.work_date) ?? { minutes: 0, rate: 0, sourceIds: [] };
          day.minutes += billableMinutes;
          day.rate = Math.max(day.rate, rate);
          day.sourceIds.push(row.id);
          daily.set(row.work_date, day);
          this.insertInvoiceLine(
            id,
            `${row.work_date} · ${row.category} · ${row.activity_summary}`,
            billableMinutes,
            60,
            rate,
            amount.minorUnits,
            'time',
            row.id,
            row,
          );
          this.insertInvoiceSource(id, 'time', row.id, row.version);
        }
        const minimum = this.sqlite
          .prepare('SELECT client_daily_minimum_minutes FROM project WHERE id=?')
          .get(rule.project_id) as { client_daily_minimum_minutes: number | null } | undefined;
        if (minimum?.client_daily_minimum_minutes) {
          for (const [workDate, day] of daily) {
            const topUp = Math.max(0, minimum.client_daily_minimum_minutes - day.minutes);
            if (!topUp) continue;
            const amount = hourlyRateForMinutes(money(rule.currency, BigInt(day.rate)), topUp);
            subtotal = add(subtotal, amount);
            this.insertInvoiceLine(
              id,
              `${workDate} · contractual daily minimum top-up`,
              topUp,
              60,
              day.rate,
              amount.minorUnits,
              'billing_adjustment',
              `${rule.project_id}:${workDate}:daily-minimum`,
              {
                projectId: rule.project_id,
                workDate,
                actualMinutes: day.minutes,
                minimumMinutes: minimum.client_daily_minimum_minutes,
                topUpMinutes: topUp,
                sourceTimeIds: day.sourceIds,
              },
            );
          }
        }
      } else if (rule.stream_type === 'expense') {
        const rows = this.sqlite
          .prepare(
            "SELECT id,spent_on,vendor,category,description,amount_minor,project_currency_amount_minor,billing_amount_minor,billing_treatment,version FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND approval_state='approved' AND finance_approved_at IS NOT NULL AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem')) AND billing_state IN ('unlocked','locked') AND invoice_id IS NULL ORDER BY spent_on,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          spent_on: string;
          vendor: string;
          category: string;
          description: string;
          amount_minor: number;
          project_currency_amount_minor: number | null;
          billing_amount_minor: number | null;
          billing_treatment: string;
          version: number;
        }>;
        for (const row of rows) {
          const billedMinor = BigInt(
            row.billing_amount_minor ?? row.project_currency_amount_minor ?? row.amount_minor,
          );
          subtotal = add(subtotal, money(rule.currency, billedMinor));
          this.insertInvoiceLine(
            id,
            `${row.spent_on} · ${row.vendor} · ${row.category}`,
            1,
            1,
            safeInteger(billedMinor),
            billedMinor,
            'expense',
            row.id,
            row,
          );
          this.insertInvoiceSource(id, 'expense', row.id, row.version);
        }
      } else if (rule.stream_type === 'milestone') {
        const milestones = this.sqlite
          .prepare(
            "SELECT id,name,description,amount_minor,currency,due_on,version FROM project_milestone WHERE project_id=? AND approval_state='approved' AND invoice_id IS NULL AND (due_on IS NULL OR due_on BETWEEN ? AND ?) ORDER BY due_on,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          name: string;
          description: string | null;
          amount_minor: number;
          currency: Currency;
          due_on: string | null;
          version: number;
        }>;
        for (const milestone of milestones) {
          if (milestone.currency !== rule.currency)
            throw new ValidationError('Milestone currency does not match the billing stream');
          const amount = money(rule.currency, BigInt(milestone.amount_minor));
          subtotal = add(subtotal, amount);
          this.insertInvoiceLine(
            id,
            `${milestone.name}${milestone.due_on ? ` · ${milestone.due_on}` : ''}`,
            1,
            1,
            milestone.amount_minor,
            amount.minorUnits,
            'milestone',
            milestone.id,
            milestone,
          );
          this.insertInvoiceSource(id, 'milestone', milestone.id, milestone.version);
        }
      }
      if (capRemaining !== null && subtotal.minorUnits > capRemaining) {
        let remaining = capRemaining;
        const lines = this.sqlite
          .prepare(
            'SELECT id,subtotal_minor,snapshot_json FROM invoice_line WHERE invoice_id=? ORDER BY rowid',
          )
          .all(id) as Array<{ id: string; subtotal_minor: number; snapshot_json: string }>;
        for (const line of lines) {
          const original = BigInt(line.subtotal_minor);
          const allocated = remaining > 0n ? (original < remaining ? original : remaining) : 0n;
          const snapshot = JSON.parse(line.snapshot_json) as Record<string, unknown>;
          snapshot.capApplied = true;
          snapshot.originalSubtotalMinor = original.toString();
          snapshot.allocatedSubtotalMinor = allocated.toString();
          this.sqlite
            .prepare(
              'UPDATE invoice_line SET subtotal_minor=?,unit_price_minor=?,snapshot_json=? WHERE id=?',
            )
            .run(safeInteger(allocated), safeInteger(allocated), JSON.stringify(snapshot), line.id);
          remaining -= allocated;
        }
        subtotal = money(rule.currency, capRemaining);
      }
      const components = this.sqlite
        .prepare(
          'SELECT basis_points,compound FROM tax_component WHERE tax_profile_id=? ORDER BY calculation_order,id',
        )
        .all(rule.tax_profile_id) as Array<{ basis_points: number; compound: number }>;
      const tax = calculateTaxComponents(
        subtotal,
        components.map((component) => ({
          basisPoints: component.basis_points,
          compound: component.compound === 1,
        })),
      ).total;
      const total = add(subtotal, tax);
      this.sqlite
        .prepare(
          'UPDATE invoice SET subtotal_minor=?,tax_minor=?,total_minor=?,updated_at=? WHERE id=?',
        )
        .run(
          safeInteger(subtotal.minorUnits),
          safeInteger(tax.minorUnits),
          safeInteger(total.minorUnits),
          timestamp,
          id,
        );
      this.audit(principal, 'invoice.draft_create', 'invoice', id, {
        billingRuleId,
        periodStart,
        periodEnd,
      });
      return { id, created: !refreshed, refreshed };
    });
  }

  createInvoiceAdjustment(
    principal: Principal,
    input: Readonly<{
      originalInvoiceId: string;
      adjustmentType: 'credit' | 'debit' | 'correction';
      amountMinor: bigint;
      reason: string;
    }>,
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    if (input.amountMinor === 0n) throw new ValidationError('Adjustment amount must be non-zero');
    const reason = assertText(input.reason, 'Adjustment reason', 2000);
    return this.transaction(() => {
      const original = this.sqlite
        .prepare(
          "SELECT id,project_id,billing_rule_id,currency,period_start,period_end,state FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue')",
        )
        .get(input.originalInvoiceId) as
        | {
            id: string;
            project_id: string;
            billing_rule_id: string;
            currency: Currency;
            period_start: string;
            period_end: string;
            state: string;
          }
        | undefined;
      if (!original) throw new ValidationError('Issued original invoice required');
      const adjustmentId = newId();
      const invoiceId = newId();
      const signedAmount =
        input.adjustmentType === 'credit'
          ? -(input.amountMinor < 0n ? -input.amountMinor : input.amountMinor)
          : input.adjustmentType === 'debit'
            ? input.amountMinor < 0n
              ? -input.amountMinor
              : input.amountMinor
            : input.amountMinor;
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO invoice(id,project_id,billing_rule_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,period_start,period_end,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          invoiceId,
          original.project_id,
          original.billing_rule_id,
          'adjustment',
          'draft',
          original.currency,
          safeInteger(signedAmount),
          0,
          safeInteger(signedAmount),
          original.period_start,
          original.period_end,
          timestamp,
          timestamp,
        );
      this.insertInvoiceLine(
        invoiceId,
        `${input.adjustmentType.toUpperCase()} · ${reason}`,
        1,
        1,
        safeInteger(signedAmount),
        signedAmount,
        'adjustment',
        adjustmentId,
        { originalInvoiceId: original.id, adjustmentType: input.adjustmentType, reason },
      );
      this.insertInvoiceSource(invoiceId, 'adjustment', adjustmentId, 1);
      this.sqlite
        .prepare(
          'INSERT INTO invoice_adjustment(id,original_invoice_id,adjustment_invoice_id,adjustment_type,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          adjustmentId,
          original.id,
          invoiceId,
          input.adjustmentType,
          reason,
          principal.userId,
          timestamp,
        );
      this.audit(principal, 'invoice.adjustment.create', 'invoice', invoiceId, {
        originalInvoiceId: original.id,
        adjustmentType: input.adjustmentType,
        amountMinor: signedAmount.toString(),
      });
      return { id: invoiceId, adjustmentId, created: true };
    });
  }

  private findClientRate(
    principal: Principal,
    projectId: string,
    workerId: string,
    category: string,
    date: string,
    activityCode?: string | null,
  ): number | null {
    const resolved = new V3Repository(this.sqlite).resolveClientLaborRate(
      principal,
      projectId,
      workerId,
      category,
      date,
      activityCode,
    );
    return resolved ? Number(BigInt(resolved.effectiveRateMinor)) : null;
  }

  private insertInvoiceLine(
    invoiceId: string,
    description: string,
    quantityNumerator: number,
    quantityDenominator: number,
    unitPriceMinor: number,
    subtotalMinor: bigint,
    sourceType: string,
    sourceId: string,
    snapshot: unknown,
  ): void {
    this.sqlite
      .prepare(
        'INSERT INTO invoice_line(id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,subtotal_minor,source_type,source_id,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        invoiceId,
        description,
        quantityNumerator,
        quantityDenominator,
        unitPriceMinor,
        safeInteger(subtotalMinor),
        sourceType,
        sourceId,
        JSON.stringify(snapshot),
      );
  }

  private insertInvoiceSource(
    invoiceId: string,
    sourceType: string,
    sourceId: string,
    sourceVersion: number,
  ): void {
    const existing = this.sqlite
      .prepare('SELECT invoice_id FROM invoice_source WHERE source_type=? AND source_id=?')
      .get(sourceType, sourceId) as { invoice_id: string } | undefined;
    if (existing && existing.invoice_id !== invoiceId)
      throw new ConflictError(`Source ${sourceType}:${sourceId} is already reserved for billing`);
    this.sqlite
      .prepare(
        'INSERT INTO invoice_source(invoice_id,source_type,source_id,source_version) VALUES(?,?,?,?)',
      )
      .run(invoiceId, sourceType, sourceId, sourceVersion);
  }

  approveInvoiceDraft(principal: Principal, invoiceId: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE invoice SET state='approved',updated_at=?,version=version+1 WHERE id=? AND state='draft'",
      )
      .run(timestamp, invoiceId);
    if (result.changes !== 1) throw new ConflictError('Draft invoice required');
    this.audit(principal, 'invoice.approve', 'invoice', invoiceId, {});
  }

  issueInvoice(principal: Principal, invoiceId: string, reportLocale: ReportLocale = 'en') {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    return this.transaction(() => {
      const invoice = this.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(invoiceId) as
        | InvoiceRow
        | undefined;
      if (!invoice) throw new ValidationError('Invoice not found');
      if (
        ['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'credited'].includes(
          invoice.state,
        ) &&
        invoice.invoice_number
      )
        return { invoiceNumber: invoice.invoice_number, issued: false };
      if (invoice.state !== 'approved') throw new ConflictError('Approved invoice draft required');
      this.recheckInvoiceSources(invoice);
      const context = this.sqlite
        .prepare(
          `SELECT br.legal_entity_id,br.template_id,br.recipient_email,br.payment_terms_days billing_payment_terms_days,
                  br.po_number_override,br.grouping_mode,br.cadence_type,br.anchor_date,br.billing_contact_id,
                  le.code,le.legal_name,le.billing_address,le.company_identifiers,
                  c.legal_name client_legal_name,c.client_number,c.billing_email,c.payment_terms_days,
                  p.project_number,p.name project_name,p.po_number,
                  tp.id tax_profile_id,tp.name tax_name,tp.currency tax_currency,tp.jurisdiction_label,tp.description tax_description
           FROM billing_rule br JOIN legal_entity le ON le.id=br.legal_entity_id
           JOIN project p ON p.id=br.project_id JOIN client c ON c.id=p.client_id
           JOIN tax_profile tp ON tp.id=br.tax_profile_id WHERE br.id=?`,
        )
        .get(invoice.billing_rule_id) as
        | {
            legal_entity_id: string;
            template_id: string;
            recipient_email: string | null;
            billing_payment_terms_days: number;
            po_number_override: string | null;
            grouping_mode: string;
            cadence_type: string;
            anchor_date: string | null;
            billing_contact_id: string | null;
            code: string;
            legal_name: string;
            billing_address: string;
            company_identifiers: string;
            client_legal_name: string;
            client_number: string;
            billing_email: string | null;
            payment_terms_days: number;
            project_number: string;
            project_name: string;
            po_number: string | null;
            tax_profile_id: string;
            tax_name: string;
            tax_currency: Currency;
            jurisdiction_label: string | null;
            tax_description: string | null;
          }
        | undefined;
      if (!context) throw new ValidationError('Billing context is incomplete');
      const billingContact = context.billing_contact_id
        ? (this.sqlite
            .prepare('SELECT id,name,email,phone,role FROM client_contact WHERE id=?')
            .get(context.billing_contact_id) as
            | {
                id: string;
                name: string;
                email: string | null;
                phone: string | null;
                role: string | null;
              }
            | undefined)
        : undefined;
      const taxComponents = this.sqlite
        .prepare(
          `SELECT id,name,basis_points,calculation_order,compound,calculation_type,display_mode,basis
           FROM tax_component WHERE tax_profile_id=? ORDER BY calculation_order,id`,
        )
        .all(context.tax_profile_id);
      const policy = this.sqlite
        .prepare(
          'SELECT prefix,digits FROM invoice_number_policy WHERE legal_entity_id=? AND accountant_approved_at IS NOT NULL AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1',
        )
        .get(context.legal_entity_id, today(), today()) as
        | { prefix: string; digits: number }
        | undefined;
      if (!policy)
        throw new ReadinessError([{ code: 'missing_accountant_approved_number_policy' }]);
      const year = new Date().getUTCFullYear();
      const sequence = this.nextSequence('invoice', `${context.legal_entity_id}:${year}`);
      const invoiceNumber = `${policy.prefix}-${year}-${String(sequence).padStart(policy.digits, '0')}`;
      const lines = this.sqlite
        .prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY id')
        .all(invoiceId);
      const sources = this.sqlite
        .prepare('SELECT * FROM invoice_source WHERE invoice_id=? ORDER BY source_type,source_id')
        .all(invoiceId);
      const issuedAt = now();
      const due = new Date(
        Date.parse(issuedAt) + context.billing_payment_terms_days * 86_400_000,
      ).toISOString();
      const snapshot = {
        template: {
          id:
            context.template_id ||
            (invoice.stream_type === 'labor'
              ? 'labor-detailed'
              : invoice.stream_type === 'milestone'
                ? 'fixed-fee'
                : invoice.stream_type === 'adjustment'
                  ? 'credit-adjustment'
                  : 'expenses-detailed'),
          version: 1,
          configuredByBillingRule: true,
        },
        legalEntity: {
          id: context.legal_entity_id,
          code: context.code,
          legalName: context.legal_name,
          billingAddress: context.billing_address,
          companyIdentifiers: context.company_identifiers,
        },
        client: {
          legalName: context.client_legal_name,
          number: context.client_number,
          billingEmail: context.billing_email,
          recipientEmail: context.recipient_email,
          billingContact: billingContact ?? null,
        },
        project: {
          number: context.project_number,
          name: context.project_name,
          poNumber: context.po_number_override ?? context.po_number,
        },
        number: invoiceNumber,
        locale: normalizeReportLocale(reportLocale),
        invoiceNumber,
        commercial: {
          streamType: invoice.stream_type,
          cadence: context.cadence_type,
          anchorDate: context.anchor_date,
          groupingMode: context.grouping_mode,
          paymentTermsDays: context.billing_payment_terms_days,
          poNumberOverride: context.po_number_override,
        },
        taxProfile: {
          id: context.tax_profile_id,
          name: context.tax_name,
          currency: context.tax_currency,
          jurisdiction: context.jurisdiction_label,
          description: context.tax_description,
          components: taxComponents,
        },
        calculation: {
          currency: invoice.currency,
          subtotalMinor: String(invoice.subtotal_minor),
          taxMinor: String(invoice.tax_minor),
          totalMinor: String(invoice.total_minor),
        },
        dueAt: due,
        billingRuleId: invoice.billing_rule_id,
        lines,
        sources,
        generatedAt: issuedAt,
      };
      const snapshotJson = JSON.stringify(snapshot);
      const calculationHash = createHash('sha256').update(snapshotJson).digest('hex');
      this.sqlite
        .prepare(
          "UPDATE invoice SET invoice_number=?,state='issued',issued_at=?,due_at=?,snapshot_json=?,calculation_hash=?,source_lock_at=?,pdf_status='pending',updated_at=?,version=version+1 WHERE id=? AND state='approved'",
        )
        .run(
          invoiceNumber,
          issuedAt,
          due,
          snapshotJson,
          calculationHash,
          issuedAt,
          issuedAt,
          invoiceId,
        );
      const sourceRows = this.sqlite
        .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
        .all(invoiceId) as Array<{ source_type: string; source_id: string }>;
      for (const source of sourceRows) {
        if (source.source_type === 'milestone') {
          this.sqlite
            .prepare(
              "UPDATE project_milestone SET invoice_id=?,updated_at=? WHERE id=? AND invoice_id IS NULL AND approval_state='approved'",
            )
            .run(invoiceId, issuedAt, source.source_id);
        } else if (source.source_type === 'time' || source.source_type === 'expense') {
          const table = source.source_type === 'time' ? 'time_entry' : 'expense';
          const billingColumn = source.source_type === 'time' ? 'billing_status' : 'billing_state';
          this.sqlite
            .prepare(
              `UPDATE ${table} SET invoice_id=?,${billingColumn}='locked',updated_at=? WHERE id=? AND invoice_id IS NULL`,
            )
            .run(invoiceId, issuedAt, source.source_id);
        }
      }
      this.sqlite
        .prepare('UPDATE invoice_source SET locked_at=? WHERE invoice_id=?')
        .run(issuedAt, invoiceId);
      const jobKey = `invoice-pdf:${invoiceId}:${calculationHash}`;
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO job(id,kind,idempotency_key,state,run_after,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'invoice_pdf',
          jobKey,
          'pending',
          issuedAt,
          JSON.stringify({ invoiceId }),
          issuedAt,
          issuedAt,
        );
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'invoice.issued',
          invoiceId,
          `invoice-issued:${invoiceId}`,
          JSON.stringify({ invoiceId, invoiceNumber }),
          issuedAt,
          issuedAt,
        );
      this.audit(principal, 'invoice.issue', 'invoice', invoiceId, {
        invoiceNumber,
        calculationHash,
      });
      return { invoiceNumber, issued: true };
    });
  }

  sendInvoice(principal: Principal, invoiceId: string, idempotencyKey: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    if (idempotencyKey.trim().length < 8)
      throw new ValidationError('Send idempotency key is required');
    return this.transaction(() => {
      const invoice = this.sqlite
        .prepare(
          "SELECT id,state,invoice_number,pdf_status FROM invoice WHERE id=? AND state IN ('issued','sent')",
        )
        .get(invoiceId) as
        | { id: string; state: string; invoice_number: string | null; pdf_status: string }
        | undefined;
      if (!invoice || !invoice.invoice_number) throw new ValidationError('Issued invoice required');
      const existing = this.sqlite
        .prepare('SELECT id FROM invoice_event WHERE idempotency_key=?')
        .get(idempotencyKey) as { id: string } | undefined;
      if (existing || invoice.state === 'sent')
        return { sent: false, invoiceNumber: invoice.invoice_number };
      if (invoice.pdf_status !== 'ready')
        throw new ValidationError('Invoice PDF must be ready before sending');
      const timestamp = now();
      this.sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'sent',?,?,?,?)",
        )
        .run(
          newId(),
          invoiceId,
          'Manual send requested',
          principal.userId,
          timestamp,
          idempotencyKey,
        );
      this.sqlite
        .prepare(
          "UPDATE invoice SET state='sent',sent_at=?,updated_at=?,version=version+1 WHERE id=? AND state='issued'",
        )
        .run(timestamp, timestamp, invoiceId);
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'invoice.send.requested',
          invoiceId,
          `invoice-send:${invoiceId}:${idempotencyKey}`,
          JSON.stringify({ invoiceId, invoiceNumber: invoice.invoice_number }),
          timestamp,
          timestamp,
        );
      this.audit(principal, 'invoice.send', 'invoice', invoiceId, {
        invoiceNumber: invoice.invoice_number,
      });
      return { sent: true, invoiceNumber: invoice.invoice_number };
    });
  }

  private recheckInvoiceSources(invoice: InvoiceRow): void {
    const sources = this.sqlite
      .prepare('SELECT source_type,source_id,source_version FROM invoice_source WHERE invoice_id=?')
      .all(invoice.id) as Array<{ source_type: string; source_id: string; source_version: number }>;
    for (const source of sources) {
      if (source.source_type === 'time') {
        const row = this.sqlite
          .prepare(
            'SELECT version,approval_state,billability_state,invoice_id FROM time_entry WHERE id=?',
          )
          .get(source.source_id) as
          | {
              version: number;
              approval_state: string;
              billability_state: string;
              invoice_id: string | null;
            }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          !['approved', 'locked'].includes(row.approval_state) ||
          row.billability_state !== 'billable' ||
          row.invoice_id
        )
          throw new ConflictError(`Time source ${source.source_id} changed`);
      } else if (source.source_type === 'expense') {
        const row = this.sqlite
          .prepare(
            'SELECT version,approval_state,finance_approved_at,client_treatment,billing_treatment,invoice_id FROM expense WHERE id=?',
          )
          .get(source.source_id) as
          | {
              version: number;
              approval_state: string;
              finance_approved_at: string | null;
              client_treatment: string;
              billing_treatment: string;
              invoice_id: string | null;
            }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          row.approval_state !== 'approved' ||
          !row.finance_approved_at ||
          !(
            [
              'reimbursable',
              'reimbursable_at_cost',
              'reimbursable_plus_markup',
              'allowance_per_diem',
            ].includes(row.client_treatment) ||
            [
              'reimbursable_at_cost',
              'reimbursable_plus_markup',
              'allowance_per_diem',
              'client_direct',
            ].includes(row.billing_treatment)
          ) ||
          row.invoice_id
        )
          throw new ConflictError(`Expense source ${source.source_id} changed`);
      } else if (source.source_type === 'milestone') {
        const row = this.sqlite
          .prepare('SELECT version,approval_state,invoice_id FROM project_milestone WHERE id=?')
          .get(source.source_id) as
          | { version: number; approval_state: string; invoice_id: string | null }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          row.approval_state !== 'approved' ||
          row.invoice_id
        )
          throw new ConflictError(`Milestone source ${source.source_id} changed`);
      }
    }
  }

  recordPayment(
    principal: Principal,
    input: {
      invoiceId: string;
      amountMinor: bigint;
      currency: Currency;
      receivedAt: string;
      reference?: string;
      idempotencyKey: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    if (input.amountMinor <= 0n) throw new ValidationError('Payment must be positive');
    assertDate(input.receivedAt.slice(0, 10), 'Payment date');
    if (input.idempotencyKey.trim().length < 8)
      throw new ValidationError('Payment idempotency key is required');
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT id,invoice_id,amount_minor,currency FROM payment WHERE idempotency_key=?')
        .get(input.idempotencyKey) as
        | { id: string; invoice_id: string; amount_minor: number; currency: Currency }
        | undefined;
      if (existing) {
        if (
          existing.invoice_id !== input.invoiceId ||
          existing.amount_minor !== safeInteger(input.amountMinor) ||
          existing.currency !== input.currency
        )
          throw new ConflictError('Payment idempotency key was already used for another payment');
        return { id: existing.id, created: false };
      }
      const invoice = this.sqlite
        .prepare(
          "SELECT currency,total_minor,state FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','overdue')",
        )
        .get(input.invoiceId) as
        | { currency: Currency; total_minor: number; state: string }
        | undefined;
      if (!invoice || invoice.currency !== input.currency)
        throw new ValidationError('Issued invoice in matching currency required');
      const paid = this.sqlite
        .prepare('SELECT COALESCE(sum(amount_minor),0) paid FROM payment WHERE invoice_id=?')
        .get(input.invoiceId) as { paid: number };
      if (BigInt(paid.paid) + input.amountMinor > BigInt(invoice.total_minor))
        throw new ValidationError('Payment exceeds invoice balance');
      const id = newId();
      this.sqlite
        .prepare(
          'INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          input.invoiceId,
          safeInteger(input.amountMinor),
          input.currency,
          input.receivedAt,
          input.reference ?? null,
          now(),
          input.idempotencyKey,
        );
      const totalPaid = BigInt(paid.paid) + input.amountMinor;
      this.sqlite
        .prepare('UPDATE invoice SET state=?,updated_at=? WHERE id=?')
        .run(
          totalPaid === BigInt(invoice.total_minor) ? 'paid' : 'partially_paid',
          now(),
          input.invoiceId,
        );
      this.sqlite
        .prepare(
          'INSERT INTO invoice_event(id,invoice_id,event_type,amount_minor,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          input.invoiceId,
          'payment',
          safeInteger(input.amountMinor),
          input.reference?.trim() || 'Payment received',
          principal.userId,
          now(),
          `payment-event:${input.idempotencyKey}`,
        );
      this.audit(principal, 'payment.record', 'payment', id, {
        invoiceId: input.invoiceId,
        amountMinor: input.amountMinor.toString(),
      });
      return { id, created: true };
    });
  }

  voidInvoice(principal: Principal, invoiceId: string, reason: string, idempotencyKey: string) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    this.assertStepUp(principal);
    if (idempotencyKey.trim().length < 8)
      throw new ValidationError('Void idempotency key is required');
    this.transaction(() => {
      const invoice = this.sqlite
        .prepare(
          "SELECT 1 ok FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','overdue')",
        )
        .get(invoiceId);
      if (!invoice) throw new ValidationError('Issued invoice required');
      const existing = this.sqlite
        .prepare('SELECT invoice_id,event_type FROM invoice_event WHERE idempotency_key=?')
        .get(idempotencyKey) as { invoice_id: string; event_type: string } | undefined;
      if (existing) {
        if (existing.invoice_id !== invoiceId || existing.event_type !== 'void')
          throw new ConflictError('Void idempotency key was already used');
        return;
      }
      const cleanReason = assertText(reason, 'Void reason');
      const timestamp = now();
      this.sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'void',?,?,?,?)",
        )
        .run(newId(), invoiceId, cleanReason, principal.userId, timestamp, idempotencyKey);
      this.sqlite
        .prepare("UPDATE invoice SET state='void',voided_at=?,updated_at=? WHERE id=?")
        .run(timestamp, timestamp, invoiceId);
      this.audit(principal, 'invoice.void', 'invoice', invoiceId, { reason: cleanReason });
    });
  }

  workerPay(principal: Principal, periodStart: string, periodEnd: string) {
    this.assertActive(principal);
    const rows = this.sqlite
      .prepare(
        'SELECT t.project_id,t.work_date,t.minutes,t.approval_state,c.currency,c.rate_minor,c.rate_basis,c.daily_guarantee_minutes FROM time_entry t JOIN compensation_rule c ON c.worker_id=t.worker_id AND (c.project_id=t.project_id OR c.project_id IS NULL) AND c.effective_from<=t.work_date AND (c.effective_to IS NULL OR c.effective_to>=t.work_date) WHERE t.worker_id=? AND t.work_date BETWEEN ? AND ? AND c.worker_visible=1 ORDER BY t.work_date',
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      project_id: string;
      work_date: string;
      minutes: number;
      approval_state: string;
      currency: Currency;
      rate_minor: number;
      rate_basis: string;
      daily_guarantee_minutes: number | null;
    }>;
    const currencies = new Set(rows.map((row) => row.currency));
    if (currencies.size > 1)
      throw new ValidationError('Worker period contains multiple compensation currencies');
    const currency = rows[0]?.currency ?? 'USD';
    let approvedMinutes = 0;
    let pendingMinutes = 0;
    let approved = money(currency, 0n);
    let pending = money(currency, 0n);
    const groups = new Map<string, typeof rows>();
    for (const row of rows)
      groups.set(`${row.project_id}:${row.work_date}:${row.approval_state}`, [
        ...(groups.get(`${row.project_id}:${row.work_date}:${row.approval_state}`) ?? []),
        row,
      ]);
    for (const group of groups.values()) {
      const first = group[0];
      if (!first) continue;
      const minutes = group.reduce((sum, row) => sum + row.minutes, 0);
      const compensatedMinutes = Math.max(minutes, first.daily_guarantee_minutes ?? 0);
      const amount =
        first.rate_basis === 'daily'
          ? money(currency, BigInt(first.rate_minor))
          : hourlyRateForMinutes(money(currency, BigInt(first.rate_minor)), compensatedMinutes);
      if (first.approval_state === 'approved' || first.approval_state === 'locked') {
        approvedMinutes += minutes;
        approved = add(approved, amount);
      } else {
        pendingMinutes += minutes;
        pending = add(pending, amount);
      }
    }
    const reimbursements = this.sqlite
      .prepare(
        "SELECT approval_state,COALESCE(sum(amount_minor),0) amount FROM expense WHERE worker_id=? AND spent_on BETWEEN ? AND ? AND who_paid='worker' GROUP BY approval_state",
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      approval_state: string;
      amount: number;
    }>;
    return {
      currency,
      approvedMinutes,
      pendingMinutes,
      estimatedApprovedMinor: approved.minorUnits.toString(),
      estimatedPendingMinor: pending.minorUnits.toString(),
      approvedReimbursementMinor: String(
        reimbursements
          .filter((row) => row.approval_state === 'approved')
          .reduce((sum, row) => sum + row.amount, 0),
      ),
      pendingReimbursementMinor: String(
        reimbursements
          .filter((row) => row.approval_state !== 'approved')
          .reduce((sum, row) => sum + row.amount, 0),
      ),
    };
  }

  projectFinance(principal: Principal, projectId: string) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    const time = this.sqlite
      .prepare(
        "SELECT id,worker_id,work_date,category,minutes,billability_state FROM time_entry WHERE project_id=? AND approval_state IN ('approved','locked')",
      )
      .all(projectId) as Array<{
      id: string;
      worker_id: string;
      work_date: string;
      category: string;
      minutes: number;
      billability_state: string;
    }>;
    let cost = money(project.currency, 0n);
    let revenue = money(project.currency, 0n);
    for (const row of time) {
      const costRate = this.sqlite
        .prepare(
          'SELECT hourly_rate_minor FROM internal_cost_rule WHERE worker_id=? AND (project_id=? OR project_id IS NULL) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY (project_id IS NOT NULL) DESC,effective_from DESC LIMIT 1',
        )
        .get(row.worker_id, projectId, row.work_date, row.work_date) as
        | { hourly_rate_minor: number }
        | undefined;
      if (costRate)
        cost = add(
          cost,
          hourlyRateForMinutes(
            money(project.currency, BigInt(costRate.hourly_rate_minor)),
            row.minutes,
          ),
        );
      if (row.billability_state === 'billable') {
        const rate = this.findClientRate(
          principal,
          projectId,
          row.worker_id,
          row.category,
          row.work_date,
        );
        if (rate)
          revenue = add(
            revenue,
            hourlyRateForMinutes(money(project.currency, BigInt(rate)), row.minutes),
          );
      }
    }
    const expenses = this.sqlite
      .prepare(
        "SELECT amount_minor,client_treatment,billing_treatment,who_paid FROM expense WHERE project_id=? AND approval_state='approved'",
      )
      .all(projectId) as Array<{
      amount_minor: number;
      client_treatment: string;
      billing_treatment: string;
      who_paid: string;
    }>;
    for (const expense of expenses.filter(
      (row) => row.billing_treatment !== 'client_direct' && row.who_paid !== 'client',
    ))
      cost = add(cost, money(project.currency, BigInt(expense.amount_minor)));
    for (const expense of expenses.filter(
      (row) =>
        row.client_treatment === 'reimbursable' &&
        row.billing_treatment !== 'client_direct' &&
        row.who_paid !== 'client',
    ))
      revenue = add(revenue, money(project.currency, BigInt(expense.amount_minor)));
    const invoiced = this.sqlite
      .prepare(
        "SELECT COALESCE(sum(total_minor),0) total FROM invoice WHERE project_id=? AND state='issued'",
      )
      .get(projectId) as { total: number };
    const paid = this.sqlite
      .prepare(
        'SELECT COALESCE(sum(p.amount_minor),0) total FROM payment p JOIN invoice i ON i.id=p.invoice_id WHERE i.project_id=?',
      )
      .get(projectId) as { total: number };
    return {
      currency: project.currency,
      approvedCostMinor: cost.minorUnits.toString(),
      revenueCandidateMinor: revenue.minorUnits.toString(),
      contributionMarginMinor: (revenue.minorUnits - cost.minorUnits).toString(),
      invoicedMinor: String(invoiced.total),
      paidMinor: String(paid.total),
      receivableMinor: String(invoiced.total - paid.total),
    };
  }

  dashboard(principal: Principal) {
    this.assertReadable(principal);
    if (principal.role === 'worker') throw new AccessDeniedError('Management role required');
    const projectFilter = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    const where = projectFilter.length
      ? ` WHERE p.id IN (${projectFilter.map(() => '?').join(',')})`
      : '';
    const projects = this.sqlite
      .prepare(`SELECT count(*) count FROM project p${where}`)
      .get(...projectFilter) as { count: number };
    const hours = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(t.minutes),0) minutes FROM time_entry t JOIN project p ON p.id=t.project_id${where}`,
      )
      .get(...projectFilter) as { minutes: number };
    const reports = this.sqlite
      .prepare(
        `SELECT (SELECT count(*) FROM daily_report d JOIN project p ON p.id=d.project_id${where}${where ? ' AND' : ' WHERE'} d.approval_state='submitted') + (SELECT count(*) FROM technical_report tr JOIN project p ON p.id=tr.project_id${where}${where ? ' AND' : ' WHERE'} tr.approval_state='submitted') count`,
      )
      .get(...projectFilter, ...projectFilter) as { count: number };
    const expenses = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(e.amount_minor),0) minor FROM expense e JOIN project p ON p.id=e.project_id${where}`,
      )
      .get(...projectFilter) as { minor: number };
    const invoices = this.sqlite
      .prepare(
        `SELECT count(*) count,COALESCE(sum(i.total_minor),0) minor FROM invoice i JOIN project p ON p.id=i.project_id${where}${where ? ' AND' : ' WHERE'} i.state IN ('draft','approved')`,
      )
      .get(...projectFilter) as { count: number; minor: number };
    return {
      activeProjects: projects.count,
      actualMinutes: hours.minutes,
      pendingReports: reports.count,
      expenseMinor: String(expenses.minor),
      upcomingInvoices: invoices.count,
      upcomingInvoiceMinor: String(invoices.minor),
      currency: 'USD',
    };
  }

  projectOverview(principal: Principal, projectId: string) {
    this.assertReadable(principal);
    const permitted =
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only' ||
      principal.projectIds.has(projectId);
    if (!permitted) throw new AccessDeniedError('Project access required');
    const project = this.sqlite
      .prepare(
        'SELECT p.*,c.client_number,c.display_name client_name FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?',
      )
      .get(projectId) as Row | undefined;
    if (!project) throw new ValidationError('Project not found');
    const ownOnly = principal.role === 'worker';
    const workers = this.sqlite
      .prepare(
        `SELECT u.id,u.name,u.role,pm.assignment_role,pm.starts_on,pm.ends_on,pm.planned_minutes
         FROM project_member pm JOIN user u ON u.id=pm.user_id
         WHERE pm.project_id=? AND pm.status='active'${ownOnly ? ' AND pm.user_id=?' : ''}
         ORDER BY u.name`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const time = this.sqlite
      .prepare(
        `SELECT category,sum(minutes) minutes FROM time_entry WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''} GROUP BY category ORDER BY category`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const reports = this.sqlite
      .prepare(
        `SELECT 'Daily' type,id,work_date date,summary title,approval_state,safety_related
         FROM daily_report WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''}
         UNION ALL
         SELECT 'PLC',id,substr(created_at,1,10),system_name,approval_state,safety_related
         FROM technical_report WHERE project_id=?${ownOnly ? ' AND author_id=?' : ''}
         ORDER BY date DESC`,
      )
      .all(
        ...(ownOnly
          ? [projectId, principal.userId, projectId, principal.userId]
          : [projectId, projectId]),
      );
    const expenses = this.sqlite
      .prepare(
        `SELECT id,spent_on,vendor,category,amount_minor,project_currency_amount_minor,currency,client_treatment,billing_treatment,who_paid,approval_state,receipt_document_id
         FROM expense WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''} ORDER BY spent_on DESC`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const planning = this.sqlite
      .prepare(
        `SELECT pa.*,u.name worker_name FROM planning_assignment pa JOIN user u ON u.id=pa.worker_id
         WHERE pa.project_id=? AND pa.status<>'cancelled'${ownOnly ? ' AND pa.worker_id=?' : ''}
         ORDER BY pa.starts_at`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const milestones = this.sqlite
      .prepare(
        `SELECT id,name,description,amount_minor,currency,due_on,approval_state,invoice_id,version
         FROM project_milestone WHERE project_id=? ORDER BY due_on,id`,
      )
      .all(projectId);
    const total = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(minutes),0) minutes FROM time_entry WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''}`,
      )
      .get(...(ownOnly ? [projectId, principal.userId] : [projectId])) as { minutes: number };
    const schedule = this.sqlite
      .prepare(
        'SELECT id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from,effective_to,version FROM schedule WHERE project_id=? ORDER BY effective_from DESC,id DESC LIMIT 1',
      )
      .get(projectId);
    const financial =
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
        ? this.projectFinance(principal, projectId)
        : null;
    return {
      project,
      workers,
      time,
      reports,
      expenses,
      planning,
      milestones,
      schedule,
      actualMinutes: total.minutes,
      financial,
    };
  }

  createProjectCloseout(principal: Principal, projectId: string) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw new AccessDeniedError('Finance role required');
    const overview = this.projectOverview(principal, projectId);
    const documents = this.sqlite
      .prepare(
        "SELECT id,sha256,byte_length,media_type,artifact_type,original_filename,sensitivity FROM document WHERE project_id=? AND state='committed' ORDER BY created_at,id",
      )
      .all(projectId);
    const invoices = this.sqlite
      .prepare(
        'SELECT id,invoice_number,stream_type,state,period_start,period_end,total_minor,currency,issued_at,due_at FROM invoice WHERE project_id=? ORDER BY created_at',
      )
      .all(projectId);
    const snapshot = {
      project: overview.project,
      workers: overview.workers,
      time: overview.time,
      reports: overview.reports,
      expenses: overview.expenses,
      planning: overview.planning,
      financial: overview.financial,
      invoices,
      generatedAt: now(),
    };
    const manifest = { generatedAt: now(), files: documents };
    const existing = this.sqlite
      .prepare('SELECT id,state FROM project_closeout WHERE project_id=?')
      .get(projectId) as { id: string; state: string } | undefined;
    if (existing?.state === 'final')
      throw new ConflictError('Final project closeout requires an authorized reopen');
    const id = existing?.id ?? newId();
    const timestamp = now();
    if (existing)
      this.sqlite
        .prepare(
          "UPDATE project_closeout SET state='draft',snapshot_json=?,document_manifest_json=?,updated_at=? WHERE id=?",
        )
        .run(JSON.stringify(snapshot), JSON.stringify(manifest), timestamp, id);
    else
      this.sqlite
        .prepare(
          "INSERT INTO project_closeout(id,project_id,state,snapshot_json,document_manifest_json,created_by,created_at,updated_at) VALUES(?,?,'draft',?,?,?,?,?)",
        )
        .run(
          id,
          projectId,
          JSON.stringify(snapshot),
          JSON.stringify(manifest),
          principal.userId,
          timestamp,
          timestamp,
        );
    this.audit(principal, 'project_closeout.create', 'project_closeout', id, { projectId });
    return { id, state: 'draft', snapshot, manifest };
  }

  finalizeProjectCloseout(principal: Principal, closeoutId: string): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    const result = this.sqlite
      .prepare(
        "UPDATE project_closeout SET state='final',updated_at=? WHERE id=? AND state IN ('draft','review')",
      )
      .run(now(), closeoutId);
    if (result.changes !== 1) throw new ConflictError('Project closeout is not reviewable');
    const closeout = this.sqlite
      .prepare('SELECT project_id FROM project_closeout WHERE id=?')
      .get(closeoutId) as { project_id: string } | undefined;
    if (closeout)
      this.sqlite
        .prepare(
          "UPDATE project SET status='closed',actual_end_date=COALESCE(actual_end_date,?),updated_at=?,version=version+1 WHERE id=? AND status NOT IN ('archived','closed')",
        )
        .run(today(), now(), closeout.project_id);
    this.audit(principal, 'project_closeout.finalize', 'project_closeout', closeoutId, {});
  }

  reopenProjectCloseout(principal: Principal, closeoutId: string, reason: string): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    const cleanReason = assertText(reason, 'Reopen reason', 2000);
    const result = this.sqlite
      .prepare(
        "UPDATE project_closeout SET state='reopened',reopened_by=?,reopened_at=?,reopen_reason=?,updated_at=? WHERE id=? AND state='final'",
      )
      .run(principal.userId, now(), cleanReason, now(), closeoutId);
    if (result.changes !== 1) throw new ConflictError('Final closeout is required to reopen');
    const closeout = this.sqlite
      .prepare('SELECT project_id FROM project_closeout WHERE id=?')
      .get(closeoutId) as { project_id: string } | undefined;
    if (closeout)
      this.sqlite
        .prepare(
          "UPDATE project SET status='active',actual_end_date=NULL,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(now(), closeout.project_id);
    this.audit(principal, 'project_closeout.reopen', 'project_closeout', closeoutId, {
      reason: cleanReason,
    });
  }

  invoicePreview(principal: Principal, invoiceId: string) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    const invoice = this.sqlite
      .prepare(
        'SELECT i.*,p.project_number,p.name project_name,c.client_number,c.display_name client_name,c.legal_name client_legal_name,c.billing_email,le.legal_name issuer_name,le.billing_address issuer_address,le.company_identifiers,tp.name tax_profile_name FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id LEFT JOIN billing_rule br ON br.id=i.billing_rule_id LEFT JOIN legal_entity le ON le.id=br.legal_entity_id LEFT JOIN tax_profile tp ON tp.id=br.tax_profile_id WHERE i.id=?',
      )
      .get(invoiceId);
    if (!invoice) throw new ValidationError('Invoice not found');
    const lines = this.sqlite
      .prepare(
        'SELECT description,quantity_numerator,quantity_denominator,unit_price_minor,subtotal_minor,source_type FROM invoice_line WHERE invoice_id=? ORDER BY rowid',
      )
      .all(invoiceId);
    const taxes = this.sqlite
      .prepare(
        'SELECT tc.name,tc.basis_points FROM invoice i JOIN billing_rule br ON br.id=i.billing_rule_id JOIN tax_component tc ON tc.tax_profile_id=br.tax_profile_id WHERE i.id=? ORDER BY tc.calculation_order',
      )
      .all(invoiceId);
    return { invoice, lines, taxes };
  }

  listOwnReports(principal: Principal) {
    this.assertReadable(principal);
    const dailyValues: string[] = [];
    const technicalValues: string[] = [];
    const dailyConditions: string[] = [];
    const technicalConditions: string[] = [];
    if (principal.role === 'worker') {
      dailyConditions.push('d.worker_id=?');
      dailyValues.push(principal.userId);
      technicalConditions.push('t.author_id=?');
      technicalValues.push(principal.userId);
    } else if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (!ids.length) return [];
      const placeholders = ids.map(() => '?').join(',');
      dailyConditions.push(`d.project_id IN (${placeholders})`);
      technicalConditions.push(`t.project_id IN (${placeholders})`);
      dailyValues.push(...ids);
      technicalValues.push(...ids);
    }
    const daily = this.sqlite
      .prepare(
        `SELECT 'daily' type,d.id,d.work_date date,d.summary title,d.approval_state,d.version,
                d.safety_related,p.project_number,p.name project_name,u.name author_name
         FROM daily_report d JOIN project p ON p.id=d.project_id JOIN user u ON u.id=d.worker_id
         ${dailyConditions.length ? `WHERE ${dailyConditions.join(' AND ')}` : ''}
         ORDER BY d.work_date DESC,d.id DESC LIMIT 200`,
      )
      .all(...dailyValues) as Array<Record<string, unknown>>;
    const technical = this.sqlite
      .prepare(
        `SELECT 'technical' type,t.id,substr(t.created_at,1,10) date,t.system_name title,t.approval_state,
                t.version,t.safety_related,p.project_number,p.name project_name,u.name author_name
         FROM technical_report t JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.author_id
         ${technicalConditions.length ? `WHERE ${technicalConditions.join(' AND ')}` : ''}
         ORDER BY date DESC,t.id DESC LIMIT 200`,
      )
      .all(...technicalValues) as Array<Record<string, unknown>>;
    return [...daily, ...technical]
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
      .slice(0, 200);
  }

  listPlanning(principal: Principal) {
    return this.planning.listPlanning(principal);
  }

  listNotifications(principal: Principal) {
    this.assertReadable(principal);
    const notifications = this.sqlite
      .prepare(
        'SELECT id,kind,subject_id,read_at,created_at FROM notification WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      )
      .all(principal.userId);
    return notifications.map((notification) => {
      const row = notification as {
        id: string;
        kind: string;
        subject_id: string;
        read_at: string | null;
        created_at: string;
      };
      const audit = this.sqlite
        .prepare(
          `SELECT ae.action,ae.details_json,ae.occurred_at,u.name actor_name
           FROM audit_event ae LEFT JOIN user u ON u.id=ae.actor_id
           WHERE ae.entity_id=? AND ae.action LIKE 'report.%update'
           ORDER BY ae.occurred_at DESC,ae.id DESC LIMIT 1`,
        )
        .get(row.subject_id) as
        | { action: string; details_json: string; occurred_at: string; actor_name: string | null }
        | undefined;
      const source = this.sqlite
        .prepare(
          `SELECT d.project_id,d.work_date date,d.summary title,p.project_number,p.name project_name
           FROM daily_report d JOIN project p ON p.id=d.project_id WHERE d.id=?
           UNION ALL
           SELECT t.project_id,substr(t.created_at,1,10),t.change_summary,p.project_number,p.name
           FROM technical_report t JOIN project p ON p.id=t.project_id WHERE t.id=? LIMIT 1`,
        )
        .get(row.subject_id, row.subject_id) as
        | {
            project_id: string;
            date: string;
            title: string;
            project_number: string;
            project_name: string;
          }
        | undefined;
      let changedFields: string[] = [];
      if (audit?.details_json) {
        try {
          const details = JSON.parse(audit.details_json) as { changedFields?: unknown };
          if (Array.isArray(details.changedFields))
            changedFields = details.changedFields.filter(
              (field): field is string => typeof field === 'string',
            );
        } catch {
          changedFields = [];
        }
      }
      return {
        ...row,
        actor_name: audit?.actor_name ?? null,
        changed_fields: changedFields,
        project_id: source?.project_id ?? row.subject_id,
        project_number: source?.project_number ?? null,
        project_name: source?.project_name ?? null,
        record_date: source?.date ?? null,
        record_title: source?.title ?? null,
      };
    });
  }

  markNotificationRead(principal: Principal, notificationId: string): void {
    this.assertActive(principal);
    const result = this.sqlite
      .prepare('UPDATE notification SET read_at=? WHERE id=? AND user_id=?')
      .run(now(), notificationId, principal.userId);
    if (result.changes !== 1) throw new ValidationError('Notification not found');
  }

  search(principal: Principal, query: string) {
    this.assertReadable(principal);
    const term = typeof query === 'string' ? query.trim() : '';
    if (term.length > 120) throw new ValidationError('Search query is too long');
    const pattern = `%${term.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const projectIds = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    const projectRestriction =
      projectIds.length > 0
        ? ` AND p.id IN (${projectIds.map(() => '?').join(',')})`
        : principal.role === 'project_manager'
          ? ' AND 1=0'
          : '';
    const projectValues = [...projectIds];
    const projects =
      principal.role === 'worker'
        ? this.sqlite
            .prepare(
              `SELECT p.id,'project' type,p.name label,p.project_number || ' · Project' detail FROM project p
               JOIN project_member pm ON pm.project_id=p.id AND pm.user_id=? AND pm.status='active'
               WHERE (p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR p.po_number LIKE ? ESCAPE '\\') LIMIT 50`,
            )
            .all(principal.userId, pattern, pattern, pattern)
        : this.sqlite
            .prepare(
              `SELECT p.id,'project' type,p.name label,p.project_number || ' · ' || COALESCE(p.po_number,'Project') detail FROM project p
               WHERE (p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR p.po_number LIKE ? ESCAPE '\\')${projectRestriction} LIMIT 50`,
            )
            .all(pattern, pattern, pattern, ...projectValues);
    const clients =
      principal.role === 'worker'
        ? []
        : this.sqlite
            .prepare(
              `SELECT c.id,'client' type,c.display_name label,c.client_number || ' · Client' detail FROM client c
               JOIN project p ON p.client_id=c.id
               WHERE (c.client_number LIKE ? ESCAPE '\\' OR c.display_name LIKE ? ESCAPE '\\')${projectRestriction} LIMIT 50`,
            )
            .all(pattern, pattern, ...projectValues);
    const workers =
      principal.role === 'worker'
        ? []
        : this.sqlite
            .prepare(
              `SELECT u.id,'worker' type,u.name label,u.email detail FROM user u
               WHERE u.status='active' AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
               AND (${
                 principal.role === 'project_manager'
                   ? `EXISTS (SELECT 1 FROM project_member pm WHERE pm.user_id=u.id AND pm.status='active' AND pm.project_id IN (${projectIds.map(() => '?').join(',')}))`
                   : '1=1'
               }) LIMIT 50`,
            )
            .all(pattern, pattern, ...projectValues);
    const invoices =
      principal.role === 'worker'
        ? []
        : this.sqlite
            .prepare(
              `SELECT i.id,'invoice' type,i.invoice_number label,i.stream_type || ' · Invoice' detail FROM invoice i
               JOIN project p ON p.id=i.project_id
               WHERE i.invoice_number LIKE ? ESCAPE '\\'${projectRestriction} LIMIT 50`,
            )
            .all(pattern, ...projectValues);
    const reports =
      principal.role === 'worker'
        ? this.sqlite
            .prepare(
              `SELECT d.id,'report' type,COALESCE(d.summary,'Daily report') label,p.project_number || ' · Daily report' detail
               FROM daily_report d JOIN project p ON p.id=d.project_id
               WHERE d.worker_id=? AND (d.id LIKE ? ESCAPE '\\' OR d.summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')
               UNION ALL
               SELECT t.id,'report' type,COALESCE(t.system_name,t.change_summary,'Technical report') label,p.project_number || ' · Technical report' detail
               FROM technical_report t JOIN project p ON p.id=t.project_id
               WHERE t.author_id=? AND (t.id LIKE ? ESCAPE '\\' OR t.system_name LIKE ? ESCAPE '\\' OR t.change_summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')`,
            )
            .all(
              principal.userId,
              pattern,
              pattern,
              pattern,
              pattern,
              principal.userId,
              pattern,
              pattern,
              pattern,
              pattern,
              pattern,
            )
        : this.sqlite
            .prepare(
              `SELECT d.id,'report' type,COALESCE(d.summary,'Daily report') label,p.project_number || ' · Daily report' detail
               FROM daily_report d JOIN project p ON p.id=d.project_id
               WHERE (d.id LIKE ? ESCAPE '\\' OR d.summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')${projectRestriction}
               UNION ALL
               SELECT t.id,'report' type,COALESCE(t.system_name,t.change_summary,'Technical report') label,p.project_number || ' · Technical report' detail
               FROM technical_report t JOIN project p ON p.id=t.project_id
               WHERE (t.id LIKE ? ESCAPE '\\' OR t.system_name LIKE ? ESCAPE '\\' OR t.change_summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')${projectRestriction}`,
            )
            .all(
              pattern,
              pattern,
              pattern,
              pattern,
              ...projectValues,
              pattern,
              pattern,
              pattern,
              pattern,
              pattern,
              ...projectValues,
            );
    const expenses =
      principal.role === 'worker'
        ? this.sqlite
            .prepare(
              `SELECT e.id,'expense' type,COALESCE(e.vendor,e.description,e.category) label,p.project_number || ' · Expense / receipt' detail
               FROM expense e JOIN project p ON p.id=e.project_id
               WHERE e.worker_id=? AND (e.id LIKE ? ESCAPE '\\' OR e.receipt_document_id LIKE ? ESCAPE '\\' OR e.vendor LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\') LIMIT 50`,
            )
            .all(principal.userId, pattern, pattern, pattern, pattern, pattern)
        : this.sqlite
            .prepare(
              `SELECT e.id,'expense' type,COALESCE(e.vendor,e.description,e.category) label,p.project_number || ' · Expense / receipt' detail
               FROM expense e JOIN project p ON p.id=e.project_id
               WHERE (e.id LIKE ? ESCAPE '\\' OR e.receipt_document_id LIKE ? ESCAPE '\\' OR e.vendor LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\')${projectRestriction} LIMIT 50`,
            )
            .all(pattern, pattern, pattern, pattern, pattern, ...projectValues);
    return [...projects, ...clients, ...workers, ...invoices, ...reports, ...expenses].slice(
      0,
      100,
    );
  }

  searchSuggestions(principal: Principal, limit = 24) {
    this.assertReadable(principal);
    const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));
    return this.search(principal, '').slice(0, bounded);
  }

  listAuditEvents(principal: Principal, limit = 200) {
    this.assertReadable(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Audit access required');
    const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
    return this.sqlite
      .prepare(
        'SELECT id,actor_id,action,entity_type,entity_id,occurred_at,details_json FROM audit_event ORDER BY occurred_at DESC,id DESC LIMIT ?',
      )
      .all(bounded);
  }

  listOwnTime(principal: Principal) {
    return this.time.listOwnTime(principal);
  }

  timeDetail(principal: Principal, id: string) {
    this.assertReadable(principal);
    const privateFields =
      principal.role === 'worker'
        ? ''
        : ',t.billable_minutes,t.client_rate_minor,t.compensation_amount_minor,t.internal_cost_minor,t.billing_status,t.locked_at';
    const row = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,
                t.project_timezone,t.activity_summary,t.approval_state,t.billability_state,
                t.submitted_at,t.approved_at,t.start_time,t.end_time,t.break_minutes,t.site,
                p.project_number,p.name project_name,p.site_name,p.currency,
                u.name worker_name,u.email worker_email${privateFields}
         FROM time_entry t JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.worker_id
         WHERE t.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw new ValidationError('Time entry not found');
    if (!this.canViewReport(principal, String(row.project_id), String(row.worker_id)))
      throw new AccessDeniedError('Time entry access required');
    return row;
  }

  listOwnTimeWeek(principal: Principal, weekStart: string) {
    return this.time.listOwnTimeWeek(principal, weekStart);
  }

  copyOwnTimeLayout(
    principal: Principal,
    sourceWeekStart: string,
    targetWeekStart: string,
  ): { created: number; skipped: number; sourceWeekStart: string; targetWeekStart: string } {
    return this.time.copyOwnTimeLayout(principal, sourceWeekStart, targetWeekStart);
  }

  listOwnExpenses(principal: Principal) {
    this.assertReadable(principal);
    return this.sqlite
      .prepare(
        'SELECT e.id,e.spent_on,e.vendor,e.category,e.amount_minor,e.currency,e.approval_state,e.reimbursement_state,e.who_paid,e.billing_treatment,e.version,p.project_number FROM expense e JOIN project p ON p.id=e.project_id WHERE e.worker_id=? ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 100',
      )
      .all(principal.userId);
  }

  expenseDetail(principal: Principal, id: string) {
    this.assertReadable(principal);
    const row = this.sqlite
      .prepare(
        `SELECT e.*,p.project_number,p.name project_name,p.site_name,p.currency project_currency,
                u.name worker_name,u.email worker_email
         FROM expense e JOIN project p ON p.id=e.project_id JOIN user u ON u.id=e.worker_id
         WHERE e.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw new ValidationError('Expense not found');
    if (!this.canViewReport(principal, String(row.project_id), String(row.worker_id)))
      throw new AccessDeniedError('Expense access required');
    return row;
  }

  listAssignedProjects(principal: Principal) {
    return this.planning.listAssignedProjects(principal);
  }

  listClients(principal: Principal) {
    return this.clients.listClients(principal);
  }

  listApprovalQueue(principal: Principal) {
    this.assertReadable(principal);
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') {
      const operational =
        principal.role === 'owner_admin'
          ? "SELECT 'time' type,id,project_id,worker_id,work_date date,minutes amount,approval_state,'operational' review_stage FROM time_entry WHERE approval_state='submitted' UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'operational' FROM expense WHERE approval_state='submitted' UNION ALL SELECT 'daily',id,project_id,worker_id,work_date,0,approval_state,'report' FROM daily_report WHERE approval_state='submitted' UNION ALL SELECT 'technical',id,project_id,author_id,substr(created_at,1,10),0,approval_state,'report' FROM technical_report WHERE approval_state='submitted' UNION ALL "
          : '';
      return this.sqlite
        .prepare(
          `${operational}SELECT 'time' type,id,project_id,worker_id,work_date date,minutes amount,approval_state,'finance' review_stage FROM time_entry WHERE approval_state='approved' AND billability_state='pending' UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'finance' FROM expense WHERE approval_state='approved' AND finance_approved_at IS NULL ORDER BY date`,
        )
        .all();
    }
    if (principal.role !== 'project_manager')
      throw new AccessDeniedError('Project review required');
    const ids = [...principal.projectIds];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.sqlite
      .prepare(
        `SELECT 'time' type,id,project_id,worker_id,work_date date,minutes amount,approval_state,'operational' review_stage FROM time_entry WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'operational' FROM expense WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'daily',id,project_id,worker_id,work_date,0,approval_state,'report' FROM daily_report WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'technical',id,project_id,author_id,substr(created_at,1,10),0,approval_state,'report' FROM technical_report WHERE approval_state='submitted' AND project_id IN (${placeholders}) ORDER BY date`,
      )
      .all(...ids, ...ids, ...ids, ...ids);
  }

  listInvoices(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        "SELECT i.id,i.invoice_number,i.stream_type,i.state,i.currency,i.total_minor,i.period_start,i.period_end,i.issued_at,COALESCE((SELECT sum(amount_minor) FROM payment p WHERE p.invoice_id=i.id),0) paid_minor,EXISTS(SELECT 1 FROM invoice_event e WHERE e.invoice_id=i.id AND e.event_type='void') voided,p.project_number FROM invoice i JOIN project p ON p.id=i.project_id ORDER BY i.created_at DESC",
      )
      .all();
  }

  listActiveWorkers(principal: Principal) {
    return this.workforce.listActiveWorkers(principal);
  }

  updateUserStatus(
    principal: Principal,
    userId: string,
    status: 'active' | 'suspended' | 'offboarded' | 'archived',
  ): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw new AccessDeniedError('Owner administration required');
    this.assertStepUp(principal);
    if (userId === principal.userId)
      throw new ValidationError('The owner cannot change their own status');
    const target = this.sqlite.prepare('SELECT id,status FROM user WHERE id=?').get(userId) as
      | { id: string; status: string }
      | undefined;
    if (!target) throw new ValidationError('User not found');
    this.transaction(() => {
      const changed = this.sqlite
        .prepare(
          "UPDATE user SET status=?,offboarded_at=CASE WHEN ? IN ('offboarded','archived') THEN COALESCE(offboarded_at,?) ELSE NULL END,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(status, status, now(), now(), userId);
      if (Number(changed.changes) !== 1) throw new ValidationError('User status was not updated');
      if (status !== 'active')
        this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(userId);
      this.audit(principal, 'user.status.update', 'user', userId, {
        before: { status: target.status },
        after: { status },
        reason: `Owner set account status to ${status}`,
      });
    });
  }

  listBillingRules(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        'SELECT br.id,br.project_id,br.stream_type,br.cadence_type,br.currency,br.enabled,p.project_number,p.name project_name,tp.name tax_profile_name,le.code legal_entity_code,cc.name billing_contact_name FROM billing_rule br JOIN project p ON p.id=br.project_id LEFT JOIN tax_profile tp ON tp.id=br.tax_profile_id LEFT JOIN legal_entity le ON le.id=br.legal_entity_id LEFT JOIN client_contact cc ON cc.id=br.billing_contact_id ORDER BY p.project_number,br.stream_type',
      )
      .all();
  }

  listFinanceProjects(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare('SELECT id,project_number,name,status,currency FROM project ORDER BY project_number')
      .all();
  }
}
