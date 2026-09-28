import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import { TimeEntryRepository, type TimeEntryInput } from '../time/time-entry-repository.ts';

type CrewGrant = Readonly<{
  id: string;
  projectId: string;
  projectName: string;
  chiefUserId: string;
  chiefName: string;
  workerUserId: string;
  workerName: string;
  startsOn: string;
  endsOn: string | null;
  status: 'active' | 'revoked';
}>;
type CrewPerson = Readonly<{ id: string; name: string }>;
export type CrewTimeRow = Readonly<{
  id: string;
  projectId: string;
  workerId: string;
  workerName: string;
  workDate: string;
  category: string;
  minutes: number;
  summary: string;
  approvalState: string;
  version: number;
  recordedBy: string;
  editable: boolean;
}>;
export type CrewTimeDetail = CrewTimeRow &
  Readonly<{
    projectName: string;
    activityCode: string | null;
    site: string | null;
    startTime: string | null;
    endTime: string | null;
    breakMinutes: number | null;
    editable: boolean;
    reviewReason?: string | null;
    activeCorrectionId?: string | null;
    activeCorrectionState?: string | null;
    isCorrectionDraft: boolean;
  }>;
export type CrewBatchInput = TimeEntryInput &
  Readonly<{
    requestId: string;
    workerIds: readonly string[];
    workerMinutes?: Readonly<Record<string, number>>;
    submit?: boolean;
  }>;

const now = () => new Date().toISOString();
function todayInProjectZone(timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}
function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new ValidationError(`${field} must be a date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ValidationError(`${field} must be a real date`);
}
function text(value: string, field: string, max = 5000): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new ValidationError(`${field} is required`);
  return trimmed;
}

/** Named, owner-granted project crew time entry. No rate or compensation projection. */
export class CrewLeaderRepository {
  private readonly sqlite: DatabaseSync;
  private readonly time: TimeEntryRepository;
  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
    this.time = new TimeEntryRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertActive(principal),
      assertCanReview: () => {
        throw new AccessDeniedError('Crew chiefs cannot approve time');
      },
      assertDelegatedTimeAccess: (principal, workerId, projectId, workDate) => {
        this.assertScope(principal, workerId, projectId, workDate);
      },
      recordDelegatedTimeEntry: (principal, timeEntryId, workerId, projectId, workDate) => {
        const grant = this.assertScope(principal, workerId, projectId, workDate);
        this.sqlite
          .prepare(
            'INSERT INTO crew_time_entry_recorder(time_entry_id,grant_id,recorded_by_user_id,recorded_at) VALUES(?,?,?,?)',
          )
          .run(timeEntryId, grant.id, principal.userId, now());
      },
      audit: (principal, action, entityType, entityId, details) =>
        recordAuditEvent(this.sqlite, principal, action, entityType, entityId, details),
      assertDate,
      assertText: text,
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
    return runImmediateTransaction(this.sqlite, 'crew-leader', work);
  }

  private assertActive(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
    const current = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (!current || current.status !== 'active' || current.role !== principal.role)
      throw new AccessDeniedError('Active account required');
  }

  private assertOwner(principal: Principal): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw new AccessDeniedError('Owner administration required');
  }

  private assertChief(principal: Principal): void {
    this.assertActive(principal);
    if (principal.role !== 'worker') throw new AccessDeniedError('Crew chief access required');
  }

  private member(projectId: string, workerId: string, onDate: string): boolean {
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id
       JOIN user u ON u.id=pm.user_id
       WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
         AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
         AND p.status IN ('active','planned','paused') AND u.status='active' LIMIT 1`,
        )
        .get(projectId, workerId, onDate, onDate),
    );
  }

  private projectToday(projectId: string): string {
    const project = this.sqlite
      .prepare('SELECT timezone FROM project WHERE id=?')
      .get(projectId) as { timezone: string } | undefined;
    const date = project ? todayInProjectZone(project.timezone) : null;
    if (!date) throw new AccessDeniedError('Valid project timezone required for crew access');
    return date;
  }

  private assertScope(
    principal: Principal,
    workerId: string,
    projectId: string,
    workDate: string,
  ): CrewGrant {
    this.assertChief(principal);
    // Check both today's revocation/assignment state and the work date. A
    // previously captured principal or a historically valid grant is not enough.
    const currentDate = this.projectToday(projectId);
    const grant = this.sqlite
      .prepare(
        `SELECT g.id,g.project_id projectId,p.name projectName,g.chief_user_id chiefUserId,
              chief.name chiefName,g.worker_user_id workerUserId,worker.name workerName,
              g.starts_on startsOn,g.ends_on endsOn,g.status
       FROM crew_leader_grant g JOIN project p ON p.id=g.project_id
       JOIN user chief ON chief.id=g.chief_user_id JOIN user worker ON worker.id=g.worker_user_id
       WHERE g.project_id=? AND g.chief_user_id=? AND g.worker_user_id=? AND g.status='active'
         AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
         AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?) LIMIT 1`,
      )
      .get(projectId, principal.userId, workerId, currentDate, currentDate, workDate, workDate) as
      | CrewGrant
      | undefined;
    if (
      !grant ||
      !this.member(projectId, principal.userId, currentDate) ||
      !this.member(projectId, workerId, currentDate) ||
      !this.member(projectId, principal.userId, workDate) ||
      !this.member(projectId, workerId, workDate)
    )
      throw new AccessDeniedError('Active project crew delegation required');
    return grant;
  }

  /**
   * Reusable operational authorization seam for a future chief-entered
   * expense. The expense write must call this inside its own write transaction
   * and persist the actor/grant provenance separately from the expense owner.
   */
  authorizeDelegatedOperationalEntry(
    principal: Principal,
    workerId: string,
    projectId: string,
    occurrenceDate: string,
  ): { grantId: string } {
    assertDate(occurrenceDate, 'Occurrence date');
    return { grantId: this.assertScope(principal, workerId, projectId, occurrenceDate).id };
  }

  projects(principal: Principal): { id: string; name: string }[] {
    this.assertActive(principal);
    if (principal.role === 'owner_admin')
      return this.sqlite
        .prepare(
          "SELECT id,name FROM project WHERE status IN ('active','planned','paused') ORDER BY name",
        )
        .all() as { id: string; name: string }[];
    this.assertChief(principal);
    const rows = this.sqlite
      .prepare(
        `SELECT p.id,p.name,p.timezone,g.starts_on grantFrom,g.ends_on grantTo,
                chief.starts_on chiefFrom,chief.ends_on chiefTo
         FROM crew_leader_grant g JOIN project p ON p.id=g.project_id
       JOIN project_member chief ON chief.project_id=p.id AND chief.user_id=g.chief_user_id
       WHERE g.chief_user_id=? AND g.status='active'
         AND p.status IN ('active','planned','paused') AND chief.status='active'
       ORDER BY p.name`,
      )
      .all(principal.userId) as Array<{
      id: string;
      name: string;
      timezone: string;
      grantFrom: string;
      grantTo: string | null;
      chiefFrom: string;
      chiefTo: string | null;
    }>;
    const permitted = new Map<string, { id: string; name: string }>();
    for (const row of rows) {
      const date = todayInProjectZone(row.timezone);
      if (
        date &&
        row.grantFrom <= date &&
        (row.grantTo === null || row.grantTo >= date) &&
        row.chiefFrom <= date &&
        (row.chiefTo === null || row.chiefTo >= date)
      )
        permitted.set(row.id, { id: row.id, name: row.name });
    }
    return [...permitted.values()];
  }

  candidateWorkers(principal: Principal, projectId: string): CrewPerson[] {
    this.assertOwner(principal);
    return this.sqlite
      .prepare(
        `SELECT DISTINCT u.id,u.name FROM user u JOIN project_member pm ON pm.user_id=u.id
       WHERE pm.project_id=? AND pm.status='active' AND u.role='worker' AND u.status='active'
       ORDER BY u.name`,
      )
      .all(projectId) as CrewPerson[];
  }

  grants(principal: Principal, projectId?: string): CrewGrant[] {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') this.assertChief(principal);
    const where = principal.role === 'owner_admin' ? '' : 'AND g.chief_user_id=?';
    const params = principal.role === 'owner_admin' ? [] : [principal.userId];
    return this.sqlite
      .prepare(
        `SELECT g.id,g.project_id projectId,p.name projectName,g.chief_user_id chiefUserId,
       chief.name chiefName,g.worker_user_id workerUserId,worker.name workerName,
       g.starts_on startsOn,g.ends_on endsOn,g.status
       FROM crew_leader_grant g JOIN project p ON p.id=g.project_id
       JOIN user chief ON chief.id=g.chief_user_id JOIN user worker ON worker.id=g.worker_user_id
       WHERE (? IS NULL OR g.project_id=?) ${where} ORDER BY p.name,chief.name,worker.name`,
      )
      .all(projectId ?? null, projectId ?? null, ...params) as CrewGrant[];
  }

  grant(
    principal: Principal,
    input: {
      projectId: string;
      chiefUserId: string;
      workerUserId: string;
      startsOn: string;
      endsOn?: string;
    },
  ): { id: string } {
    this.assertOwner(principal);
    assertDate(input.startsOn, 'Start date');
    if (input.endsOn) {
      assertDate(input.endsOn, 'End date');
      if (input.endsOn < input.startsOn)
        throw new ValidationError('End date must follow start date');
    }
    if (input.chiefUserId === input.workerUserId)
      throw new ValidationError('Chief and worker must be different people');
    return this.transaction(() => {
      const roles = this.sqlite
        .prepare('SELECT id,role,status FROM user WHERE id IN (?,?)')
        .all(input.chiefUserId, input.workerUserId) as {
        id: string;
        role: string;
        status: string;
      }[];
      if (
        roles.length !== 2 ||
        roles.some((person) => person.role !== 'worker' || person.status !== 'active')
      )
        throw new ValidationError('Active worker accounts required');
      if (
        !this.member(input.projectId, input.chiefUserId, input.startsOn) ||
        !this.member(input.projectId, input.workerUserId, input.startsOn)
      )
        throw new ValidationError('Both people must be assigned to the project on the start date');
      const existing = this.sqlite
        .prepare(
          `SELECT 1 FROM crew_leader_grant WHERE project_id=? AND chief_user_id=? AND worker_user_id=?
         AND status='active' LIMIT 1`,
        )
        .get(input.projectId, input.chiefUserId, input.workerUserId);
      if (existing) throw new ConflictError('Active crew delegation already exists');
      const id = newId();
      this.sqlite
        .prepare(
          `INSERT INTO crew_leader_grant(id,project_id,chief_user_id,worker_user_id,
         starts_on,ends_on,status,created_by_user_id,created_at)
         VALUES(?,?,?,?,?,?,'active',?,?)`,
        )
        .run(
          id,
          input.projectId,
          input.chiefUserId,
          input.workerUserId,
          input.startsOn,
          input.endsOn || null,
          principal.userId,
          now(),
        );
      recordAuditEvent(this.sqlite, principal, 'crew.grant', 'crew_leader_grant', id, input);
      return { id };
    });
  }

  revoke(principal: Principal, id: string): void {
    this.assertOwner(principal);
    this.transaction(() => {
      const result = this.sqlite
        .prepare(
          "UPDATE crew_leader_grant SET status='revoked',revoked_by_user_id=?,revoked_at=? WHERE id=? AND status='active'",
        )
        .run(principal.userId, now(), id);
      if (result.changes !== 1) throw new ConflictError('Active crew delegation not found');
      recordAuditEvent(this.sqlite, principal, 'crew.revoke', 'crew_leader_grant', id, {});
    });
  }

  assignedWorkers(principal: Principal, projectId: string, workDate: string): CrewPerson[] {
    assertDate(workDate, 'Work date');
    const date = this.projectToday(projectId);
    this.assertChief(principal);
    if (
      !this.member(projectId, principal.userId, date) ||
      !this.member(projectId, principal.userId, workDate)
    )
      return [];
    return this.sqlite
      .prepare(
        `SELECT DISTINCT u.id,u.name FROM crew_leader_grant g JOIN user u ON u.id=g.worker_user_id
       JOIN project_member pm ON pm.project_id=g.project_id AND pm.user_id=u.id
       JOIN project p ON p.id=g.project_id
       WHERE g.project_id=? AND g.chief_user_id=? AND g.status='active'
         AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
         AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
         AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
         AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
         AND u.status='active' AND p.status IN ('active','planned','paused') ORDER BY u.name`,
      )
      .all(
        projectId,
        principal.userId,
        date,
        date,
        workDate,
        workDate,
        date,
        date,
        workDate,
        workDate,
      ) as CrewPerson[];
  }

  entries(principal: Principal, projectId: string, from: string, to: string): CrewTimeRow[] {
    assertDate(from, 'From date');
    assertDate(to, 'To date');
    if (to < from) throw new ValidationError('End date must follow start date');
    this.assertChief(principal);
    const rows = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id projectId,t.worker_id workerId,u.name workerName,
              t.work_date workDate,t.category,t.minutes,t.activity_summary summary,
              t.approval_state approvalState,t.version,rec.recorded_by_user_id recordedBy,
              rec.grant_id grantId,
              t.invoice_id invoiceId,t.billing_status billingStatus,t.billing_lock_id billingLockId
       FROM crew_time_entry_recorder rec JOIN time_entry t ON t.id=rec.time_entry_id
       JOIN user u ON u.id=t.worker_id
       WHERE rec.recorded_by_user_id=? AND t.project_id=? AND t.work_date BETWEEN ? AND ?
         AND t.approval_state<>'void'
       ORDER BY t.work_date DESC,t.created_at DESC LIMIT 400`,
      )
      .all(principal.userId, projectId, from, to) as Array<
      Omit<CrewTimeRow, 'editable'> & {
        grantId: string;
        invoiceId: string | null;
        billingStatus: string;
        billingLockId: string | null;
      }
    >;
    const activeGrants = new Map<string, string | null>();
    return rows
      .filter((row) => {
        const key = `${row.workerId}:${row.workDate}`;
        if (!activeGrants.has(key)) {
          try {
            activeGrants.set(
              key,
              this.assertScope(principal, row.workerId, projectId, row.workDate).id,
            );
          } catch (caught) {
            if (!(caught instanceof AccessDeniedError)) throw caught;
            activeGrants.set(key, null);
          }
        }
        return activeGrants.get(key) === row.grantId;
      })
      .map(({ grantId: _grantId, invoiceId, billingStatus, billingLockId, ...row }) => ({
        ...row,
        editable:
          row.approvalState === 'draft' &&
          invoiceId === null &&
          billingStatus === 'unlocked' &&
          billingLockId === null &&
          !this.hasLinkedEvidence(row.id),
      }));
  }

  entryDetail(principal: Principal, id: string): CrewTimeDetail {
    this.assertChief(principal);
    const row = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id projectId,p.name projectName,t.worker_id workerId,
              u.name workerName,t.work_date workDate,t.category,t.activity_code activityCode,
              t.minutes,t.activity_summary summary,t.site,t.start_time startTime,
              t.end_time endTime,t.break_minutes breakMinutes,t.approval_state approvalState,
              t.version,rec.recorded_by_user_id recordedBy,rec.grant_id grantId,
              t.invoice_id invoiceId,t.billing_status billingStatus,t.billing_lock_id billingLockId
       FROM crew_time_entry_recorder rec JOIN time_entry t ON t.id=rec.time_entry_id
       JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.worker_id
       WHERE rec.time_entry_id=? AND rec.recorded_by_user_id=?`,
      )
      .get(id, principal.userId) as
      | (CrewTimeDetail & {
          grantId: string;
          invoiceId: string | null;
          billingStatus: string;
          billingLockId: string | null;
        })
      | undefined;
    if (!row) throw new AccessDeniedError('Crew time entry access required');
    const grant = this.assertScope(principal, row.workerId, row.projectId, row.workDate);
    if (grant.id !== row.grantId) throw new AccessDeniedError('Crew time entry delegation changed');
    const { grantId: _grantId, invoiceId, billingStatus, billingLockId, ...operational } = row;
    const parent = this.sqlite
      .prepare(
        "SELECT original_id FROM record_correction_link WHERE record_type='time_entry' AND correction_id=? LIMIT 1",
      )
      .get(id) as { original_id: string } | undefined;
    const review =
      row.approvalState === 'needs_changes' || row.approvalState === 'rejected'
        ? (this.sqlite
            .prepare(
              "SELECT reason FROM approval_event WHERE entity_type IN ('time','time_entry') AND entity_id=? AND to_state IN ('needs_changes','rejected') AND (reason IS NULL OR reason NOT LIKE 'Superseded by append-only correction retry %') ORDER BY occurred_at DESC,id DESC LIMIT 1",
            )
            .get(id) as { reason: string | null } | undefined)
        : undefined;
    const correction =
      row.approvalState === 'needs_changes' || row.approvalState === 'rejected'
        ? (this.sqlite
            .prepare(
              `SELECT correction.id,correction.approval_state state,recorder.recorded_by_user_id recordedBy
                 FROM record_correction_link link JOIN time_entry correction ON correction.id=link.correction_id
                 LEFT JOIN crew_time_entry_recorder recorder ON recorder.time_entry_id=correction.id
                WHERE link.record_type='time_entry' AND link.original_id=? AND correction.approval_state NOT IN ('rejected','void')
                ORDER BY link.created_at DESC,link.id DESC LIMIT 1`,
            )
            .get(parent?.original_id ?? id) as
            | { id: string; state: string; recordedBy: string | null }
            | undefined)
        : undefined;
    return {
      ...operational,
      isCorrectionDraft: Boolean(parent),
      ...(row.approvalState === 'needs_changes' || row.approvalState === 'rejected'
        ? {
            reviewReason: review?.reason ?? null,
            activeCorrectionId:
              correction?.id !== id && correction?.recordedBy === principal.userId
                ? correction.id
                : null,
            activeCorrectionState: correction?.id !== id ? (correction?.state ?? null) : null,
          }
        : {}),
      editable:
        row.approvalState === 'draft' &&
        invoiceId === null &&
        billingStatus === 'unlocked' &&
        billingLockId === null &&
        !this.hasLinkedEvidence(id),
    };
  }

  private hasLinkedEvidence(id: string): boolean {
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1 WHERE EXISTS(SELECT 1 FROM expense WHERE time_entry_id=?)
             OR EXISTS(SELECT 1 FROM crew_shared_expense_allocation WHERE time_entry_id=?)
             OR EXISTS(SELECT 1 FROM report_time_link WHERE time_entry_id=?)
             OR EXISTS(SELECT 1 FROM operational_time_expense_request WHERE time_entry_id=?)
             OR EXISTS(SELECT 1 FROM record_correction_link
                       WHERE record_type='time_entry' AND (original_id=? OR correction_id=?))`,
        )
        .get(id, id, id, id, id, id),
    );
  }

  private editableDraft(principal: Principal, id: string, version: number): CrewTimeDetail {
    if (!Number.isSafeInteger(version) || version < 1)
      throw new ValidationError('A valid draft version is required');
    const row = this.entryDetail(principal, id);
    if (row.version !== version)
      throw new ConflictError('This crew draft changed. Reload it before saving.');
    if (row.approvalState !== 'draft')
      throw new ConflictError('Only a never-submitted crew draft can change');
    if (!row.editable)
      throw new ConflictError(
        'This crew draft is linked to an expense, receipt, report, correction, or billing record and cannot change',
      );
    return row;
  }

  createCorrectedDraft(
    principal: Principal,
    input: {
      originalId: string;
      version: number;
      requestId: string;
      reason: string;
      workDate: string;
      category: string;
      minutes: number;
      summary: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
    },
  ): { id: string; version: number } {
    return this.transaction(() => {
      // entryDetail checks the original recorder, active grant, and worker/project scope.
      const original = this.entryDetail(principal, input.originalId);
      if (original.version !== input.version)
        throw new ConflictError('This crew time changed. Reload it before correcting.');
      if (original.approvalState !== 'needs_changes')
        throw new ConflictError('Only reviewer-returned crew time can be corrected here');
      assertDate(input.workDate, 'Work date');
      const grant = this.assertScope(
        principal,
        original.workerId,
        original.projectId,
        input.workDate,
      );
      const recorder = this.sqlite
        .prepare('SELECT grant_id grantId FROM crew_time_entry_recorder WHERE time_entry_id=?')
        .get(input.originalId) as { grantId: string };
      if (grant.id !== recorder.grantId)
        throw new AccessDeniedError('Crew time entry delegation changed');
      if (!['regular', 'overtime', 'travel', 'standby'].includes(input.category))
        throw new ValidationError('Choose a valid time category');
      if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440)
        throw new ValidationError('Enter 1 to 1440 minutes');
      const result = this.time.createCorrectionDraft(principal, {
        originalId: input.originalId,
        requestId: input.requestId,
        reason: text(input.reason, 'Correction reason', 2000),
        patch: {
          workDate: input.workDate,
          category: input.category,
          minutes: input.minutes,
          summary: text(input.summary, 'Work performed'),
          ...(input.startTime ? { startTime: input.startTime } : {}),
          ...(input.endTime ? { endTime: input.endTime } : {}),
          ...(input.breakMinutes !== undefined ? { breakMinutes: input.breakMinutes } : {}),
        },
      });
      return { id: result.correctionId, version: result.version ?? 1 };
    });
  }

  updateDraft(
    principal: Principal,
    input: {
      id: string;
      version: number;
      workDate: string;
      category: string;
      minutes: number;
      summary: string;
    },
  ): { id: string; version: number } {
    return this.transaction(() => {
      const current = this.editableDraft(principal, input.id, input.version);
      assertDate(input.workDate, 'Work date');
      const grant = this.assertScope(
        principal,
        current.workerId,
        current.projectId,
        input.workDate,
      );
      const recorder = this.sqlite
        .prepare('SELECT grant_id grantId FROM crew_time_entry_recorder WHERE time_entry_id=?')
        .get(input.id) as { grantId: string };
      if (grant.id !== recorder.grantId)
        throw new AccessDeniedError('Crew time entry delegation changed');
      if (!['regular', 'overtime', 'travel', 'standby'].includes(input.category))
        throw new ValidationError('Choose a valid time category');
      if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440)
        throw new ValidationError('Enter 1 to 1440 minutes');
      const summary = text(input.summary, 'Work performed');
      return this.time.updateTimeEntry(principal, {
        id: input.id,
        version: input.version,
        workDate: input.workDate,
        category: input.category,
        minutes: input.minutes,
        summary,
      });
    });
  }

  discardDraft(principal: Principal, id: string, version: number): void {
    this.transaction(() => {
      const current = this.editableDraft(principal, id, version);
      const result = this.sqlite
        .prepare(
          `UPDATE time_entry SET approval_state='void',updated_at=?,version=version+1
           WHERE id=? AND version=? AND approval_state='draft' AND invoice_id IS NULL
             AND billing_status='unlocked' AND billing_lock_id IS NULL`,
        )
        .run(now(), id, version);
      if (result.changes !== 1)
        throw new ConflictError('This crew draft changed. Reload it before discarding.');
      recordAuditEvent(this.sqlite, principal, 'time.void', 'time_entry', id, {
        version,
        workerId: current.workerId,
        operation: 'discard_crew_draft',
      });
    });
  }

  createBatch(
    principal: Principal,
    input: CrewBatchInput,
  ): {
    created: readonly { id: string; version: number }[];
    replayed: boolean;
  } {
    this.assertChief(principal);
    const requestId = text(input.requestId, 'Batch request', 200);
    if (requestId.length < 16) throw new ValidationError('Batch request is too short');
    const workerIds = [...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean))].sort();
    if (workerIds.length === 0 || workerIds.length > 100)
      throw new ValidationError('Select 1 to 100 crew members');
    if (input.startTime || input.endTime || input.breakMinutes)
      throw new ValidationError('Crew duration entries cannot include an inferred clock interval');
    const workerMinutes = input.workerMinutes;
    if (
      workerMinutes &&
      (Object.keys(workerMinutes).length !== workerIds.length ||
        workerIds.some(
          (id) =>
            !Number.isInteger(workerMinutes[id]) ||
            workerMinutes[id]! < 1 ||
            workerMinutes[id]! > 1440,
        ))
    )
      throw new ValidationError('Enter valid minutes for each crew member');
    if (
      !workerMinutes &&
      (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440)
    )
      throw new ValidationError('Enter valid shared minutes');
    return this.transaction(() => {
      for (const workerId of workerIds)
        this.assertScope(principal, workerId, input.projectId, input.workDate);
      const payload = JSON.stringify({
        workerIds,
        projectId: input.projectId,
        workDate: input.workDate,
        category: input.category,
        activityCode: input.activityCode?.trim() || null,
        minutes: input.minutes,
        workerMinutes: workerMinutes ? workerIds.map((id) => [id, workerMinutes[id]]) : null,
        summary: input.summary.trim(),
        site: input.site?.trim() || null,
        submit: Boolean(input.submit),
      });
      const hash = createHash('sha256').update(payload).digest('hex');
      const prior = this.sqlite
        .prepare(
          'SELECT request_payload_sha256 hash,result_json result FROM crew_time_batch_request WHERE actor_user_id=? AND request_id=?',
        )
        .get(principal.userId, requestId) as { hash: string; result: string } | undefined;
      if (prior) {
        if (prior.hash !== hash)
          throw new ConflictError('Batch request was used with different values');
        return {
          created: JSON.parse(prior.result) as { id: string; version: number }[],
          replayed: true,
        };
      }
      const created: { id: string; version: number }[] = [];
      for (const workerId of workerIds) {
        try {
          const row = this.time.createTimeEntryForWorker(principal, workerId, {
            projectId: input.projectId,
            workDate: input.workDate,
            category: input.category,
            activityCode: input.activityCode,
            minutes: workerMinutes?.[workerId] ?? input.minutes,
            summary: input.summary,
            site: input.site,
          });
          created.push(input.submit ? this.time.submitTime(principal, row.id, row.version) : row);
        } catch (caught) {
          if (caught instanceof ValidationError || caught instanceof ConflictError) {
            const name =
              (
                this.sqlite.prepare('SELECT name FROM user WHERE id=?').get(workerId) as
                  | { name: string }
                  | undefined
              )?.name || 'Crew member';
            throw new ValidationError(`No crew time was saved. ${name}: ${caught.message}`);
          }
          throw caught;
        }
      }
      this.sqlite
        .prepare(
          `INSERT INTO crew_time_batch_request(id,actor_user_id,project_id,request_id,
         request_payload_sha256,result_json,created_at) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          newId(),
          principal.userId,
          input.projectId,
          requestId,
          hash,
          JSON.stringify(created),
          now(),
        );
      return { created, replayed: false };
    });
  }

  submit(principal: Principal, id: string, version: number): { id: string; version: number } {
    return this.transaction(() => {
      // Keep submission bound to the same grant that recorded this entry.
      // A new grant to the same pair must not revive a formerly revoked entry.
      this.entryDetail(principal, id);
      return this.time.submitTime(principal, id, version);
    });
  }
}
