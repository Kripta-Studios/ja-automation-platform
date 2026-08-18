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
import { add, applyBasisPoints, hourlyRateForMinutes, money, type Currency } from '@ja/money';

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

type ClientInput = Readonly<{
  legalName: string;
  displayName: string;
  currency: Currency;
  timezone: string;
  billingEmail?: string;
  paymentTermsDays?: number;
}>;

type ProjectInput = Readonly<{
  clientId: string;
  name: string;
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
}>;

type TimeInput = Readonly<{
  projectId: string;
  workDate: string;
  category: string;
  minutes: number;
  summary: string;
}>;

type ExpenseInput = Readonly<{
  projectId: string;
  spentOn: string;
  vendor: string;
  category: string;
  description: string;
  currency: Currency;
  amountMinor: bigint;
  whoPaid: string;
  clientTreatment: 'all_in' | 'reimbursable' | 'non_billable';
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

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  private transaction<T>(work: () => T): T {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  private assertActive(principal: Principal): void {
    const user = this.sqlite.prepare('SELECT status FROM user WHERE id=?').get(principal.userId) as
      | { status: string }
      | undefined;
    if (!user || user.status !== 'active') throw new AccessDeniedError('Active account required');
    if (principal.role === 'auditor_read_only') throw new AccessDeniedError('Read-only role');
  }

  private audit(
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ): void {
    this.sqlite
      .prepare(
        'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json) VALUES(?,?,?,?,?,?,?)',
      )
      .run(newId(), principal.userId, action, entityType, entityId, now(), JSON.stringify(details));
  }

  private nextSequence(scope: string, scopeId: string): number {
    const row = this.sqlite
      .prepare('SELECT next_value FROM number_sequence WHERE scope=? AND scope_id=?')
      .get(scope, scopeId) as { next_value: number } | undefined;
    if (!row) {
      this.sqlite
        .prepare('INSERT INTO number_sequence(scope,scope_id,next_value,version) VALUES(?,?,2,1)')
        .run(scope, scopeId);
      return 1;
    }
    this.sqlite
      .prepare(
        'UPDATE number_sequence SET next_value=?,version=version+1 WHERE scope=? AND scope_id=?',
      )
      .run(row.next_value + 1, scope, scopeId);
    return row.next_value;
  }

  principalFor(userId: string): Principal {
    const user = this.sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(userId) as
      | { role: Role; status: string }
      | undefined;
    if (!user || user.status !== 'active') throw new AccessDeniedError('Active account required');
    const projects = this.sqlite
      .prepare("SELECT project_id FROM project_member WHERE user_id=? AND status='active'")
      .all(userId) as Array<{ project_id: string }>;
    return { userId, role: user.role, projectIds: new Set(projects.map((row) => row.project_id)) };
  }

  createClient(principal: Principal, input: ClientInput) {
    this.assertActive(principal);
    if (!canManageClients(principal)) throw new AccessDeniedError('Client administration required');
    return this.transaction(() => {
      const sequence = this.nextSequence('client', 'global');
      const id = newId();
      const clientNumber = `C-${String(sequence).padStart(4, '0')}`;
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,billing_email,payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          clientNumber,
          assertText(input.legalName, 'Legal name', 300),
          assertText(input.displayName, 'Display name', 160),
          'active',
          input.currency,
          assertText(input.timezone, 'Timezone', 100),
          input.billingEmail ?? null,
          input.paymentTermsDays ?? 30,
          timestamp,
          timestamp,
        );
      this.audit(principal, 'client.create', 'client', id, { clientNumber });
      return { id, clientNumber };
    });
  }

  createProject(principal: Principal, input: ProjectInput) {
    this.assertActive(principal);
    if (!canManageClients(principal))
      throw new AccessDeniedError('Project administration required');
    return this.transaction(() => {
      const client = this.sqlite
        .prepare('SELECT client_number FROM client WHERE id=? AND status=?')
        .get(input.clientId, 'active') as { client_number: string } | undefined;
      if (!client) throw new ValidationError('Active client not found');
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
      this.audit(principal, 'project.create', 'project', id, { projectNumber });
      return { id, projectNumber };
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
    this.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw new AccessDeniedError('Assignment administration required');
    assertDate(input.startsOn, 'Start date');
    if (input.endsOn) assertDate(input.endsOn, 'End date');
    const worker = this.sqlite
      .prepare("SELECT 1 ok FROM user WHERE id=? AND status='active'")
      .get(input.workerId);
    if (!worker) throw new ValidationError('Active worker not found');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.workerId,
        'worker',
        input.startsOn,
        input.endsOn ?? null,
        input.plannedMinutes ?? null,
        input.canReview ? 1 : 0,
        'active',
        timestamp,
        timestamp,
      );
    this.audit(principal, 'assignment.create', 'project_member', id, input);
    return { id };
  }

  createTimeEntry(principal: Principal, input: TimeInput) {
    this.assertActive(principal);
    assertDate(input.workDate, 'Work date');
    if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 1440)
      throw new ValidationError('Minutes must be an integer from 0 to 1440');
    const assignment = this.sqlite
      .prepare(
        "SELECT p.timezone FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
      )
      .get(input.projectId, principal.userId, input.workDate, input.workDate) as
      | { timezone: string }
      | undefined;
    if (!assignment) throw new AccessDeniedError('Active project assignment required');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,project_timezone,activity_summary,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.workDate,
        assertText(input.category, 'Category', 100),
        input.minutes,
        assignment.timezone,
        assertText(input.summary, 'Activity summary'),
        'draft',
        'pending',
        timestamp,
        timestamp,
      );
    this.audit(principal, 'time.create', 'time_entry', id, {
      projectId: input.projectId,
      minutes: input.minutes,
    });
    return { id, version: 1 };
  }

  submitTime(principal: Principal, id: string, baseVersion: number) {
    this.assertActive(principal);
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE time_entry SET approval_state='submitted',submitted_at=?,updated_at=?,version=version+1 WHERE id=? AND worker_id=? AND approval_state IN ('draft','needs_changes') AND version=? AND invoice_id IS NULL",
      )
      .run(timestamp, timestamp, id, principal.userId, baseVersion);
    if (result.changes !== 1) throw new ConflictError('Time entry changed or cannot be submitted');
    this.audit(principal, 'time.submit', 'time_entry', id, { baseVersion });
    return { id, version: baseVersion + 1 };
  }

  operationalApproveTime(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ) {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare('SELECT project_id,approval_state FROM time_entry WHERE id=?')
      .get(id) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw new ValidationError('Time entry not found');
    if (!canReviewProject(principal, row.project_id))
      throw new AccessDeniedError('Project review required');
    if (row.approval_state !== 'submitted') throw new ConflictError('Time entry is not submitted');
    const timestamp = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          'UPDATE time_entry SET approval_state=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE id=?',
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
          'time',
          id,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          timestamp,
        );
      this.audit(principal, `time.${decision}`, 'time_entry', id, { reason: reason ?? null });
    });
  }

  financeApproveTime(principal: Principal, id: string, billable: boolean) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE time_entry SET billability_state=?,finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='approved' AND invoice_id IS NULL",
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
    this.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw new AccessDeniedError('Planning administration required');
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
      throw new ValidationError('Planning end must follow start');
    const member = this.sqlite
      .prepare(
        "SELECT 1 ok FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
      )
      .get(input.projectId, input.workerId);
    if (!member) throw new ValidationError('Worker must have an active project assignment');
    const overlap = this.sqlite
      .prepare(
        "SELECT 1 ok FROM planning_assignment WHERE worker_id=? AND status<>'cancelled' AND starts_at<? AND ends_at>? LIMIT 1",
      )
      .get(input.workerId, input.endsAt, input.startsAt);
    if (overlap) throw new ConflictError('Worker already has an overlapping planning assignment');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO planning_assignment(id,project_id,worker_id,starts_at,ends_at,planned_minutes,status,site,required_skill,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.workerId,
        input.startsAt,
        input.endsAt,
        input.plannedMinutes,
        'published',
        input.site ?? null,
        input.requiredSkill ?? null,
        principal.userId,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'planning.create', 'planning_assignment', id, input);
    return { id };
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
    this.sqlite
      .prepare(
        'INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,vendor,description,who_paid,receipt_required,receipt_document_id,approval_state,reimbursement_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.spentOn,
        input.category,
        input.currency,
        safeInteger(input.amountMinor),
        input.clientTreatment,
        assertText(input.vendor, 'Vendor', 200),
        assertText(input.description, 'Description'),
        input.whoPaid,
        input.receiptRequired ? 1 : 0,
        input.receiptDocumentId ?? null,
        'draft',
        'pending',
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
    if (
      !Number.isInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 10_000_000
    )
      throw new ValidationError('Receipt size is invalid');
    const existing = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=?')
      .get(input.sha256, input.byteLength) as { id: string } | undefined;
    if (existing) return existing;
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        "INSERT INTO document(id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,original_filename,description,sensitive,artifact_type,created_at,updated_at) VALUES(?,?,?,?,?,?,'committed',?,?,?,0,'receipt',?,?)",
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.sha256,
        input.mediaType,
        input.byteLength,
        input.storageKey,
        input.originalFilename,
        'Expense receipt',
        timestamp,
        timestamp,
      );
    this.audit(principal, 'receipt.commit', 'document', id, {
      projectId: input.projectId,
      byteLength: input.byteLength,
    });
    return { id };
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
        "UPDATE expense SET finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='approved' AND invoice_id IS NULL",
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
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO legal_entity(id,code,legal_name,currency,billing_address,company_identifiers,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.code,
        input.legalName,
        input.currency,
        input.billingAddress,
        input.companyIdentifiers,
        timestamp,
        timestamp,
      );
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
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO invoice_number_policy(id,legal_entity_id,prefix,digits,effective_from,accountant_approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.legalEntityId,
        input.prefix,
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
      name: string;
      currency: Currency;
      effectiveFrom: string;
      components: readonly { name: string; basisPoints: number; compound?: boolean }[];
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    return this.transaction(() => {
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO tax_profile(id,name,currency,effective_from,version) VALUES(?,?,?,?,1)',
        )
        .run(id, input.name, input.currency, input.effectiveFrom);
      input.components.forEach((component, index) => {
        this.sqlite
          .prepare(
            'INSERT INTO tax_component(id,tax_profile_id,name,basis_points,calculation_order,compound) VALUES(?,?,?,?,?,?)',
          )
          .run(
            newId(),
            id,
            component.name,
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
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO billing_rule(id,project_id,legal_entity_id,stream_type,enabled,cadence_type,anchor_date,tax_profile_id,currency,auto_generate_draft,auto_issue,auto_send,effective_from,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?,?,0,0,0,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.legalEntityId,
        input.streamType,
        input.cadenceType,
        input.anchorDate ?? null,
        input.taxProfileId,
        input.currency,
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'billing_rule.create', 'billing_rule', id, {
      streamType: input.streamType,
    });
    return { id };
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
        'SELECT project_id,stream_type,tax_profile_id,legal_entity_id FROM billing_rule WHERE id=? AND enabled=1',
      )
      .get(billingRuleId) as
      | {
          project_id: string;
          stream_type: string;
          tax_profile_id: string | null;
          legal_entity_id: string | null;
        }
      | undefined;
    if (!rule) throw new ValidationError('Billing rule not found');
    const reasons: ReadinessReason[] = [];
    if (!rule.tax_profile_id) reasons.push({ code: 'missing_tax_profile' });
    if (!rule.legal_entity_id) reasons.push({ code: 'missing_legal_entity' });
    if (rule.stream_type === 'labor') {
      const pending = this.sqlite
        .prepare(
          "SELECT id FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state NOT IN ('approved','locked')",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{ id: string }>;
      reasons.push(...pending.map((row) => ({ code: 'pending_time_approval', sourceId: row.id })));
      const billable = this.sqlite
        .prepare(
          "SELECT id,worker_id,category,work_date FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state='approved' AND billability_state='billable' AND invoice_id IS NULL",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        category: string;
        work_date: string;
      }>;
      for (const row of billable) {
        const rate = this.findClientRate(
          rule.project_id,
          row.worker_id,
          row.category,
          row.work_date,
        );
        if (!rate) reasons.push({ code: 'missing_client_rate', sourceId: row.id });
      }
    } else if (rule.stream_type === 'expense') {
      const pending = this.sqlite
        .prepare(
          "SELECT id FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND client_treatment='reimbursable' AND (approval_state!='approved' OR finance_approved_at IS NULL)",
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
    if (readiness.state !== 'ready') throw new ReadinessError(readiness.reasons);
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare(
          'SELECT id FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=?',
        )
        .get(billingRuleId, periodStart, periodEnd) as { id: string } | undefined;
      if (existing) return { id: existing.id, created: false };
      const rule = this.sqlite
        .prepare('SELECT * FROM billing_rule WHERE id=?')
        .get(billingRuleId) as {
        id: string;
        project_id: string;
        stream_type: string;
        currency: Currency;
        tax_profile_id: string;
      };
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
      if (rule.stream_type === 'labor') {
        const rows = this.sqlite
          .prepare(
            "SELECT id,worker_id,work_date,category,minutes,activity_summary,version FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state='approved' AND billability_state='billable' AND invoice_id IS NULL ORDER BY work_date,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          worker_id: string;
          work_date: string;
          category: string;
          minutes: number;
          activity_summary: string;
          version: number;
        }>;
        for (const row of rows) {
          const rate = this.findClientRate(
            rule.project_id,
            row.worker_id,
            row.category,
            row.work_date,
          );
          if (!rate) throw new ReadinessError([{ code: 'missing_client_rate', sourceId: row.id }]);
          const amount = hourlyRateForMinutes(money(rule.currency, BigInt(rate)), row.minutes);
          subtotal = add(subtotal, amount);
          this.insertInvoiceLine(
            id,
            `${row.work_date} · ${row.category} · ${row.activity_summary}`,
            row.minutes,
            60,
            rate,
            amount.minorUnits,
            'time',
            row.id,
            row,
          );
          this.insertInvoiceSource(id, 'time', row.id, row.version);
        }
      } else if (rule.stream_type === 'expense') {
        const rows = this.sqlite
          .prepare(
            "SELECT id,spent_on,vendor,category,description,amount_minor,version FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND approval_state='approved' AND finance_approved_at IS NOT NULL AND client_treatment='reimbursable' AND invoice_id IS NULL ORDER BY spent_on,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          spent_on: string;
          vendor: string;
          category: string;
          description: string;
          amount_minor: number;
          version: number;
        }>;
        for (const row of rows) {
          subtotal = add(subtotal, money(rule.currency, BigInt(row.amount_minor)));
          this.insertInvoiceLine(
            id,
            `${row.spent_on} · ${row.vendor} · ${row.category}`,
            1,
            1,
            row.amount_minor,
            BigInt(row.amount_minor),
            'expense',
            row.id,
            row,
          );
          this.insertInvoiceSource(id, 'expense', row.id, row.version);
        }
      }
      const components = this.sqlite
        .prepare(
          'SELECT basis_points FROM tax_component WHERE tax_profile_id=? ORDER BY calculation_order',
        )
        .all(rule.tax_profile_id) as Array<{ basis_points: number }>;
      let tax = money(rule.currency, 0n);
      for (const component of components)
        tax = add(tax, applyBasisPoints(subtotal, component.basis_points));
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
      return { id, created: true };
    });
  }

  private findClientRate(
    projectId: string,
    workerId: string,
    category: string,
    date: string,
  ): number | null {
    const row = this.sqlite
      .prepare(
        'SELECT hourly_rate_minor FROM client_labor_rate WHERE project_id=? AND (worker_id=? OR worker_id IS NULL) AND (category=? OR category IS NULL) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY (worker_id IS NOT NULL) DESC,(category IS NOT NULL) DESC,effective_from DESC LIMIT 1',
      )
      .get(projectId, workerId, category, date, date) as { hourly_rate_minor: number } | undefined;
    return row?.hourly_rate_minor ?? null;
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
    this.sqlite
      .prepare(
        'INSERT INTO invoice_source(invoice_id,source_type,source_id,source_version) VALUES(?,?,?,?)',
      )
      .run(invoiceId, sourceType, sourceId, sourceVersion);
  }

  approveInvoiceDraft(principal: Principal, invoiceId: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE invoice SET state='approved',updated_at=?,version=version+1 WHERE id=? AND state='draft'",
      )
      .run(timestamp, invoiceId);
    if (result.changes !== 1) throw new ConflictError('Draft invoice required');
    this.audit(principal, 'invoice.approve', 'invoice', invoiceId, {});
  }

  issueInvoice(principal: Principal, invoiceId: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    return this.transaction(() => {
      const invoice = this.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(invoiceId) as
        | InvoiceRow
        | undefined;
      if (!invoice) throw new ValidationError('Invoice not found');
      if (invoice.state === 'issued' && invoice.invoice_number)
        return { invoiceNumber: invoice.invoice_number, issued: false };
      if (invoice.state !== 'approved') throw new ConflictError('Approved invoice draft required');
      this.recheckInvoiceSources(invoice);
      const context = this.sqlite
        .prepare(
          'SELECT br.legal_entity_id,le.code,le.legal_name,le.billing_address,le.company_identifiers,c.legal_name client_legal_name,c.client_number,c.payment_terms_days,p.project_number,p.name project_name,p.po_number,tp.name tax_name FROM billing_rule br JOIN legal_entity le ON le.id=br.legal_entity_id JOIN project p ON p.id=br.project_id JOIN client c ON c.id=p.client_id JOIN tax_profile tp ON tp.id=br.tax_profile_id WHERE br.id=?',
        )
        .get(invoice.billing_rule_id) as {
        legal_entity_id: string;
        code: string;
        legal_name: string;
        billing_address: string;
        company_identifiers: string;
        client_legal_name: string;
        client_number: string;
        payment_terms_days: number;
        project_number: string;
        project_name: string;
        po_number: string | null;
        tax_name: string;
      };
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
        Date.parse(issuedAt) + context.payment_terms_days * 86_400_000,
      ).toISOString();
      const snapshot = {
        template: {
          id: invoice.stream_type === 'labor' ? 'labor-detailed' : 'expenses-detailed',
          version: 1,
        },
        legalEntity: context,
        client: { legalName: context.client_legal_name, number: context.client_number },
        project: {
          number: context.project_number,
          name: context.project_name,
          poNumber: context.po_number,
        },
        taxProfile: { name: context.tax_name },
        calculation: {
          currency: invoice.currency,
          subtotalMinor: String(invoice.subtotal_minor),
          taxMinor: String(invoice.tax_minor),
          totalMinor: String(invoice.total_minor),
        },
        lines,
        sources,
        generatedAt: issuedAt,
      };
      const snapshotJson = JSON.stringify(snapshot);
      const calculationHash = createHash('sha256').update(snapshotJson).digest('hex');
      this.sqlite
        .prepare(
          "UPDATE invoice SET invoice_number=?,state='issued',issued_at=?,due_at=?,snapshot_json=?,calculation_hash=?,updated_at=?,version=version+1 WHERE id=? AND state='approved'",
        )
        .run(invoiceNumber, issuedAt, due, snapshotJson, calculationHash, issuedAt, invoiceId);
      const sourceRows = this.sqlite
        .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
        .all(invoiceId) as Array<{ source_type: string; source_id: string }>;
      for (const source of sourceRows) {
        const table = source.source_type === 'time' ? 'time_entry' : 'expense';
        this.sqlite
          .prepare(
            `UPDATE ${table} SET invoice_id=?,updated_at=? WHERE id=? AND invoice_id IS NULL`,
          )
          .run(invoiceId, issuedAt, source.source_id);
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
          row.approval_state !== 'approved' ||
          row.billability_state !== 'billable' ||
          row.invoice_id
        )
          throw new ConflictError(`Time source ${source.source_id} changed`);
      } else if (source.source_type === 'expense') {
        const row = this.sqlite
          .prepare(
            'SELECT version,approval_state,finance_approved_at,client_treatment,invoice_id FROM expense WHERE id=?',
          )
          .get(source.source_id) as
          | {
              version: number;
              approval_state: string;
              finance_approved_at: string | null;
              client_treatment: string;
              invoice_id: string | null;
            }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          row.approval_state !== 'approved' ||
          !row.finance_approved_at ||
          row.client_treatment !== 'reimbursable' ||
          row.invoice_id
        )
          throw new ConflictError(`Expense source ${source.source_id} changed`);
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
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT id FROM payment WHERE idempotency_key=?')
        .get(input.idempotencyKey) as { id: string } | undefined;
      if (existing) return { id: existing.id, created: false };
      const invoice = this.sqlite
        .prepare("SELECT currency,total_minor FROM invoice WHERE id=? AND state='issued'")
        .get(input.invoiceId) as { currency: Currency; total_minor: number } | undefined;
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
    const invoice = this.sqlite
      .prepare("SELECT 1 ok FROM invoice WHERE id=? AND state='issued'")
      .get(invoiceId);
    if (!invoice) throw new ValidationError('Issued invoice required');
    const id = newId();
    this.sqlite
      .prepare(
        "INSERT OR IGNORE INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'void',?,?,?,?)",
      )
      .run(
        id,
        invoiceId,
        assertText(reason, 'Void reason'),
        principal.userId,
        now(),
        idempotencyKey,
      );
    this.audit(principal, 'invoice.void', 'invoice', invoiceId, { reason });
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
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
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
        const rate = this.findClientRate(projectId, row.worker_id, row.category, row.work_date);
        if (rate)
          revenue = add(
            revenue,
            hourlyRateForMinutes(money(project.currency, BigInt(rate)), row.minutes),
          );
      }
    }
    const expenses = this.sqlite
      .prepare(
        "SELECT amount_minor,client_treatment FROM expense WHERE project_id=? AND approval_state='approved'",
      )
      .all(projectId) as Array<{ amount_minor: number; client_treatment: string }>;
    for (const expense of expenses)
      cost = add(cost, money(project.currency, BigInt(expense.amount_minor)));
    for (const expense of expenses.filter((row) => row.client_treatment === 'reimbursable'))
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
    this.assertActive(principal);
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
    const workers = this.sqlite
      .prepare(
        "SELECT u.id,u.name,u.role,pm.assignment_role,pm.starts_on,pm.ends_on,pm.planned_minutes FROM project_member pm JOIN user u ON u.id=pm.user_id WHERE pm.project_id=? AND pm.status='active' ORDER BY u.name",
      )
      .all(projectId);
    const time = this.sqlite
      .prepare(
        'SELECT category,sum(minutes) minutes FROM time_entry WHERE project_id=? GROUP BY category ORDER BY category',
      )
      .all(projectId);
    const reports = this.sqlite
      .prepare(
        "SELECT 'Daily' type,id,work_date date,summary title,approval_state,safety_related FROM daily_report WHERE project_id=? UNION ALL SELECT 'PLC',id,substr(created_at,1,10),system_name,approval_state,safety_related FROM technical_report WHERE project_id=? ORDER BY date DESC",
      )
      .all(projectId, projectId);
    const expenses = this.sqlite
      .prepare(
        'SELECT id,spent_on,vendor,category,amount_minor,currency,client_treatment,approval_state,receipt_document_id FROM expense WHERE project_id=? ORDER BY spent_on DESC',
      )
      .all(projectId);
    const planning = this.sqlite
      .prepare(
        "SELECT pa.*,u.name worker_name FROM planning_assignment pa JOIN user u ON u.id=pa.worker_id WHERE pa.project_id=? AND pa.status<>'cancelled' ORDER BY pa.starts_at",
      )
      .all(projectId);
    const total = this.sqlite
      .prepare('SELECT COALESCE(sum(minutes),0) minutes FROM time_entry WHERE project_id=?')
      .get(projectId) as { minutes: number };
    const financial =
      principal.role === 'owner_admin' || principal.role === 'finance_admin'
        ? this.projectFinance(principal, projectId)
        : null;
    return {
      project,
      workers,
      time,
      reports,
      expenses,
      planning,
      actualMinutes: total.minutes,
      financial,
    };
  }

  invoicePreview(principal: Principal, invoiceId: string) {
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
    return this.sqlite
      .prepare(
        "SELECT 'daily' type,d.id,d.work_date date,d.summary title,d.approval_state,d.version,d.safety_related,p.project_number FROM daily_report d JOIN project p ON p.id=d.project_id WHERE d.worker_id=? UNION ALL SELECT 'technical',t.id,substr(t.created_at,1,10),t.system_name,t.approval_state,t.version,t.safety_related,p.project_number FROM technical_report t JOIN project p ON p.id=t.project_id WHERE t.author_id=? ORDER BY date DESC",
      )
      .all(principal.userId, principal.userId);
  }

  listPlanning(principal: Principal) {
    if (principal.role === 'worker')
      return this.sqlite
        .prepare(
          "SELECT pa.*,p.project_number,p.name project_name,u.name worker_name FROM planning_assignment pa JOIN project p ON p.id=pa.project_id JOIN user u ON u.id=pa.worker_id WHERE pa.worker_id=? AND pa.status<>'cancelled' ORDER BY pa.starts_at",
        )
        .all(principal.userId);
    const ids = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    if (principal.role === 'project_manager' && ids.length === 0) return [];
    const restriction = ids.length ? ` AND pa.project_id IN (${ids.map(() => '?').join(',')})` : '';
    return this.sqlite
      .prepare(
        `SELECT pa.*,p.project_number,p.name project_name,u.name worker_name FROM planning_assignment pa JOIN project p ON p.id=pa.project_id JOIN user u ON u.id=pa.worker_id WHERE pa.status<>'cancelled'${restriction} ORDER BY pa.starts_at`,
      )
      .all(...ids);
  }

  listNotifications(principal: Principal) {
    return this.sqlite
      .prepare(
        'SELECT id,kind,subject_id,read_at,created_at FROM notification WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      )
      .all(principal.userId);
  }

  listOwnTime(principal: Principal) {
    return this.sqlite
      .prepare(
        'SELECT t.id,t.work_date,t.category,t.minutes,t.activity_summary,t.approval_state,t.billability_state,t.version,p.project_number,p.name project_name FROM time_entry t JOIN project p ON p.id=t.project_id WHERE t.worker_id=? ORDER BY t.work_date DESC,t.created_at DESC LIMIT 100',
      )
      .all(principal.userId);
  }

  listOwnExpenses(principal: Principal) {
    return this.sqlite
      .prepare(
        'SELECT e.id,e.spent_on,e.vendor,e.category,e.amount_minor,e.currency,e.approval_state,e.reimbursement_state,e.version,p.project_number FROM expense e JOIN project p ON p.id=e.project_id WHERE e.worker_id=? ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 100',
      )
      .all(principal.userId);
  }

  listAssignedProjects(principal: Principal) {
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return this.sqlite
        .prepare(
          'SELECT id,project_number,name,status,currency,timezone FROM project ORDER BY project_number',
        )
        .all();
    return this.sqlite
      .prepare(
        "SELECT p.id,p.project_number,p.name,p.status,p.currency,p.timezone FROM project p JOIN project_member pm ON pm.project_id=p.id WHERE pm.user_id=? AND pm.status='active' ORDER BY p.project_number",
      )
      .all(principal.userId);
  }

  listClients(principal: Principal) {
    if (!canManageClients(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Client administration required');
    return this.sqlite
      .prepare(
        'SELECT id,client_number,display_name,status,currency,timezone FROM client ORDER BY client_number',
      )
      .all();
  }

  listApprovalQueue(principal: Principal) {
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
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        "SELECT i.id,i.invoice_number,i.stream_type,i.state,i.currency,i.total_minor,i.period_start,i.period_end,i.issued_at,COALESCE((SELECT sum(amount_minor) FROM payment p WHERE p.invoice_id=i.id),0) paid_minor,EXISTS(SELECT 1 FROM invoice_event e WHERE e.invoice_id=i.id AND e.event_type='void') voided,p.project_number FROM invoice i JOIN project p ON p.id=i.project_id ORDER BY i.created_at DESC",
      )
      .all();
  }

  listActiveWorkers(principal: Principal) {
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'project_manager' &&
      principal.role !== 'finance_admin'
    )
      throw new AccessDeniedError('Worker administration required');
    return this.sqlite
      .prepare(
        "SELECT id,name,email,role,status FROM user WHERE status='active' ORDER BY name,email",
      )
      .all();
  }

  listBillingRules(principal: Principal) {
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        'SELECT br.id,br.project_id,br.stream_type,br.cadence_type,br.currency,br.enabled,p.project_number,p.name project_name,tp.name tax_profile_name,le.code legal_entity_code FROM billing_rule br JOIN project p ON p.id=br.project_id LEFT JOIN tax_profile tp ON tp.id=br.tax_profile_id LEFT JOIN legal_entity le ON le.id=br.legal_entity_id ORDER BY p.project_number,br.stream_type',
      )
      .all();
  }

  listFinanceProjects(principal: Principal) {
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare('SELECT id,project_number,name,status,currency FROM project ORDER BY project_number')
      .all();
  }
}
