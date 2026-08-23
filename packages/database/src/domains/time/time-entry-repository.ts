import type { DatabaseSync } from 'node:sqlite';
import { canReviewProject, newId, type Principal } from '@ja/domain';

type ErrorFactory = (message: string) => never;

export type TimeEntryInput = Readonly<{
  projectId: string;
  workDate: string;
  category: string;
  activityCode?: string;
  minutes: number;
  summary: string;
  site?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
}>;

export type TimeEntryUpdateInput = Readonly<{
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
}>;

export type TimeEntryDecision = 'approved' | 'needs_changes' | 'rejected';

export type TimeEntryRepositoryDependencies = Readonly<{
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
  assertDate: (value: string, field: string) => void;
  assertText: (value: string, field: string, max?: number) => string;
  shiftIsoDate: (value: string, days: number) => string;
  now: () => string;
  errors: Readonly<{
    accessDenied: ErrorFactory;
    conflict: ErrorFactory;
    validation: ErrorFactory;
  }>;
}>;

export class TimeEntryRepository {
  private readonly deps: TimeEntryRepositoryDependencies;

  constructor(deps: TimeEntryRepositoryDependencies) {
    this.deps = deps;
  }

  /**
   * Validate the effective time values while the caller's write transaction
   * holds SQLite's immediate write lock.  This is deliberately kept here,
   * beside every write path, so a second concurrent request cannot pass an
   * aggregate/interval check against the same pre-write snapshot.
   */
  private validateEffectiveEntry(candidate: {
    id?: string;
    workerId: string;
    workDate: string;
    minutes: number;
    startTime: string | null;
    endTime: string | null;
    breakMinutes: number | null;
  }): void {
    if (!Number.isInteger(candidate.minutes) || candidate.minutes < 0 || candidate.minutes > 1440)
      throw this.deps.errors.validation('Minutes must be an integer from 0 to 1440');

    const startPresent = candidate.startTime !== null;
    const endPresent = candidate.endTime !== null;
    if (startPresent !== endPresent)
      throw this.deps.errors.validation('Start and end time must be provided together');

    let candidateStartMinutes: number | undefined;
    let candidateEndMinutes: number | undefined;
    if (startPresent && endPresent) {
      candidateStartMinutes = this.parseClockMinutes(candidate.startTime as string, 'Start time');
      candidateEndMinutes = this.parseClockMinutes(candidate.endTime as string, 'End time');
      if (candidateEndMinutes <= candidateStartMinutes)
        throw this.deps.errors.validation('End time must be later on the same day');
      const elapsedMinutes = candidateEndMinutes - candidateStartMinutes;
      if (
        candidate.breakMinutes === null ||
        !Number.isInteger(candidate.breakMinutes) ||
        candidate.breakMinutes < 0 ||
        candidate.breakMinutes > elapsedMinutes
      )
        throw this.deps.errors.validation('Break minutes must be an integer within the shift');
      if (candidate.minutes !== elapsedMinutes - candidate.breakMinutes)
        throw this.deps.errors.validation('Minutes must equal elapsed time less break minutes');
    } else if (
      candidate.breakMinutes !== null &&
      (!Number.isInteger(candidate.breakMinutes) || candidate.breakMinutes < 0)
    ) {
      throw this.deps.errors.validation('Break minutes are invalid');
    }

    const aggregate = this.deps.sqlite
      .prepare(
        `SELECT COALESCE(SUM(minutes),0) AS minutes
         FROM time_entry
         WHERE worker_id=? AND work_date=?
           AND approval_state NOT IN ('void','rejected')
           AND (? IS NULL OR id<>?)`,
      )
      .get(candidate.workerId, candidate.workDate, candidate.id ?? null, candidate.id ?? null) as
      | { minutes: number }
      | undefined;
    const existingMinutes = Number(aggregate?.minutes ?? 0);
    if (existingMinutes + candidate.minutes > 1440)
      throw this.deps.errors.validation('A worker cannot enter more than 1440 minutes per day');

    // Interval overlap is checked in TypeScript after loading the same-day
    // rows.  This avoids relying on lexical comparisons for legacy rows and
    // makes the accepted HH:mm contract explicit.  Adjacency is allowed.
    if (candidateStartMinutes === undefined || candidateEndMinutes === undefined) return;
    const existingRows = this.deps.sqlite
      .prepare(
        `SELECT id,start_time,end_time,break_minutes,minutes
         FROM time_entry
         WHERE worker_id=? AND work_date=?
           AND approval_state NOT IN ('void','rejected')
           AND (? IS NULL OR id<>?)`,
      )
      .all(
        candidate.workerId,
        candidate.workDate,
        candidate.id ?? null,
        candidate.id ?? null,
      ) as Array<{
      id: string;
      start_time: string | null;
      end_time: string | null;
      break_minutes: number | null;
      minutes: number;
    }>;
    for (const row of existingRows) {
      const rowHasStart = row.start_time !== null;
      const rowHasEnd = row.end_time !== null;
      if (rowHasStart !== rowHasEnd)
        throw this.deps.errors.validation('An existing time entry has an incomplete interval');
      if (!rowHasStart) continue;
      const rowStart = this.parseClockMinutes(row.start_time as string, 'Existing start time');
      const rowEnd = this.parseClockMinutes(row.end_time as string, 'Existing end time');
      if (rowEnd <= rowStart)
        throw this.deps.errors.validation('An existing time entry has an invalid interval');
      if (rowStart < candidateEndMinutes && rowEnd > candidateStartMinutes)
        throw this.deps.errors.validation(
          'Time intervals cannot overlap for the same worker and date',
        );
    }
  }

  private parseClockMinutes(value: string, field: string): number {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
      throw this.deps.errors.validation(`${field} must use strict HH:mm format`);
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  }

  /**
   * Recheck the effective project assignment after the immediate transaction
   * begins.  PortalRepository performs the same preflight check before it
   * delegates here, but a captured Principal must not be trusted if an
   * assignment is revoked between that preflight and this mutation.
   */
  private assertEffectiveMembership(
    principal: Principal,
    projectId: string,
    workerId: string,
    workDate: string,
    ownerAdminBypass = false,
  ): void {
    if (ownerAdminBypass && principal.role === 'owner_admin') return;
    if (workerId !== principal.userId)
      throw this.deps.errors.accessDenied('Time entry ownership required');
    const currentDate = this.deps.now().slice(0, 10);
    const assignment = this.deps.sqlite
      .prepare(
        "SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.status IN ('active','planned','paused') AND pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1",
      )
      .get(projectId, principal.userId, currentDate, currentDate, workDate, workDate);
    if (!assignment) throw this.deps.errors.accessDenied('Project assignment access required');
  }

  createTimeEntry(principal: Principal, input: TimeEntryInput) {
    this.deps.assertActive(principal);
    return this.deps.transaction(() => {
      // Keep authorization ahead of input validation so a revoked/stale
      // worker cannot use malformed values as a validation oracle.  This
      // checks both the current assignment and the object date; the timezone
      // lookup below is only data retrieval, not authorization.
      this.assertEffectiveMembership(principal, input.projectId, principal.userId, input.workDate);
      this.deps.assertDate(input.workDate, 'Work date');
      if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 1440)
        throw this.deps.errors.validation('Minutes must be an integer from 0 to 1440');
      const assignment = this.deps.sqlite
        .prepare(
          "SELECT p.timezone FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.status IN ('active','planned','paused') AND pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
        )
        .get(input.projectId, principal.userId, input.workDate, input.workDate) as
        | { timezone: string }
        | undefined;
      if (!assignment) throw this.deps.errors.accessDenied('Active project assignment required');
      this.validateEffectiveEntry({
        workerId: principal.userId,
        workDate: input.workDate,
        minutes: input.minutes,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        breakMinutes: input.breakMinutes ?? null,
      });
      const id = newId();
      const timestamp = this.deps.now();
      this.deps.sqlite
        .prepare(
          'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,activity_code,minutes,project_timezone,activity_summary,site,start_time,end_time,break_minutes,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          input.projectId,
          principal.userId,
          input.workDate,
          this.deps.assertText(input.category, 'Category', 100),
          input.activityCode?.trim() || null,
          input.minutes,
          assignment.timezone,
          this.deps.assertText(input.summary, 'Activity summary'),
          input.site?.trim() || null,
          input.startTime ?? null,
          input.endTime ?? null,
          input.breakMinutes ?? null,
          'draft',
          'pending',
          timestamp,
          timestamp,
        );
      this.deps.audit(principal, 'time.create', 'time_entry', id, {
        projectId: input.projectId,
        minutes: input.minutes,
      });
      return { id, version: 1 };
    });
  }

  submitTime(principal: Principal, id: string, baseVersion: number) {
    this.deps.assertActive(principal);
    return this.deps.transaction(() => {
      const current = this.deps.sqlite
        .prepare(
          'SELECT project_id,worker_id,work_date,minutes,start_time,end_time,break_minutes,approval_state,invoice_id,version FROM time_entry WHERE id=?',
        )
        .get(id) as
        | {
            project_id: string;
            worker_id: string;
            work_date: string;
            minutes: number;
            start_time: string | null;
            end_time: string | null;
            break_minutes: number | null;
            approval_state: string;
            invoice_id: string | null;
            version: number;
          }
        | undefined;
      if (
        !current ||
        current.worker_id !== principal.userId ||
        (current.approval_state !== 'draft' && current.approval_state !== 'needs_changes') ||
        current.invoice_id !== null ||
        current.version !== baseVersion
      )
        throw this.deps.errors.conflict('Time entry changed or cannot be submitted');
      this.assertEffectiveMembership(
        principal,
        current.project_id,
        current.worker_id,
        current.work_date,
      );
      this.validateEffectiveEntry({
        id,
        workerId: current.worker_id,
        workDate: current.work_date,
        minutes: current.minutes,
        startTime: current.start_time,
        endTime: current.end_time,
        breakMinutes: current.break_minutes,
      });
      const timestamp = this.deps.now();
      const result = this.deps.sqlite
        .prepare(
          "UPDATE time_entry SET approval_state='submitted',submitted_at=?,updated_at=?,version=version+1 WHERE id=? AND worker_id=? AND approval_state IN ('draft','needs_changes') AND version=? AND invoice_id IS NULL",
        )
        .run(timestamp, timestamp, id, principal.userId, baseVersion);
      if (result.changes !== 1)
        throw this.deps.errors.conflict('Time entry changed or cannot be submitted');
      this.deps.audit(principal, 'time.submit', 'time_entry', id, { baseVersion });
      return { id, version: baseVersion + 1 };
    });
  }

  updateTimeEntry(principal: Principal, input: TimeEntryUpdateInput) {
    this.deps.assertActive(principal);
    return this.deps.transaction(() => {
      const current = this.deps.sqlite
        .prepare(
          'SELECT project_id,worker_id,work_date,category,activity_code,minutes,activity_summary,site,start_time,end_time,break_minutes,approval_state,invoice_id,billing_status,version FROM time_entry WHERE id=?',
        )
        .get(input.id) as
        | {
            project_id: string;
            worker_id: string;
            work_date: string;
            category: string;
            activity_code: string | null;
            minutes: number;
            activity_summary: string;
            site: string | null;
            start_time: string | null;
            end_time: string | null;
            break_minutes: number | null;
            approval_state: string;
            invoice_id: string | null;
            billing_status: string;
            version: number;
          }
        | undefined;
      if (!current) throw this.deps.errors.validation('Time entry not found');
      if (current.worker_id !== principal.userId)
        throw this.deps.errors.accessDenied('Time entry ownership required');
      if (
        current.invoice_id ||
        current.billing_status !== 'unlocked' ||
        !['draft', 'needs_changes'].includes(current.approval_state)
      )
        throw this.deps.errors.conflict('Only an unlocked editable time draft can change');
      const workDate = input.workDate ?? current.work_date;
      this.assertEffectiveMembership(principal, current.project_id, current.worker_id, workDate);
      if (input.workDate !== undefined) this.deps.assertDate(input.workDate, 'Work date');
      if (
        input.minutes !== undefined &&
        (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 1440)
      )
        throw this.deps.errors.validation('Minutes must be an integer from 0 to 1440');
      if (
        input.breakMinutes !== undefined &&
        (!Number.isInteger(input.breakMinutes) ||
          input.breakMinutes < 0 ||
          input.breakMinutes > 1440)
      )
        throw this.deps.errors.validation('Break minutes are invalid');

      const minutes = input.minutes ?? current.minutes;
      const startTime = input.startTime ?? current.start_time;
      const endTime = input.endTime ?? current.end_time;
      const breakMinutes = input.breakMinutes ?? current.break_minutes;
      this.deps.assertDate(workDate, 'Work date');
      this.validateEffectiveEntry({
        id: input.id,
        workerId: current.worker_id,
        workDate,
        minutes,
        startTime,
        endTime,
        breakMinutes,
      });
      const timestamp = this.deps.now();
      const result = this.deps.sqlite
        .prepare(
          `UPDATE time_entry SET work_date=COALESCE(?,work_date),category=COALESCE(?,category),
            activity_code=COALESCE(?,activity_code),minutes=COALESCE(?,minutes),
            activity_summary=COALESCE(?,activity_summary),site=COALESCE(?,site),
            start_time=COALESCE(?,start_time),end_time=COALESCE(?,end_time),
            break_minutes=COALESCE(?,break_minutes),updated_at=?,version=version+1
           WHERE id=? AND worker_id=? AND version=? AND invoice_id IS NULL AND billing_status='unlocked'
             AND approval_state IN ('draft','needs_changes')`,
        )
        .run(
          input.workDate ?? null,
          input.category?.trim() || null,
          input.activityCode?.trim() || null,
          input.minutes ?? null,
          input.summary?.trim() || null,
          input.site?.trim() || null,
          input.startTime ?? null,
          input.endTime ?? null,
          input.breakMinutes ?? null,
          timestamp,
          input.id,
          principal.userId,
          input.version,
        );
      if (result.changes !== 1)
        throw this.deps.errors.conflict('Time entry changed or cannot be edited');
      this.deps.audit(principal, 'time.update', 'time_entry', input.id, { version: input.version });
      return { id: input.id, version: input.version + 1 };
    });
  }

  deleteTime(principal: Principal, id: string, version: number) {
    this.deps.assertActive(principal);
    return this.deps.transaction(() => {
      const current = this.deps.sqlite
        .prepare(
          'SELECT project_id,worker_id,work_date,approval_state,invoice_id,billing_status,billing_lock_id FROM time_entry WHERE id=?',
        )
        .get(id) as
        | {
            project_id: string;
            worker_id: string;
            work_date: string;
            approval_state: string;
            invoice_id: string | null;
            billing_status: string | null;
            billing_lock_id: string | null;
          }
        | undefined;

      if (!current) throw this.deps.errors.validation('Time entry not found');
      this.assertEffectiveMembership(
        principal,
        current.project_id,
        current.worker_id,
        current.work_date,
        true,
      );
      if (
        current.invoice_id ||
        current.approval_state === 'locked' ||
        current.billing_status !== 'unlocked' ||
        current.billing_lock_id
      )
        throw this.deps.errors.conflict(
          'Locked or invoiced time is immutable and cannot be voided',
        );

      if (current.approval_state === 'draft' || current.approval_state === 'needs_changes') {
        const result = this.deps.sqlite
          .prepare(
            "DELETE FROM time_entry WHERE id=? AND version=? AND invoice_id IS NULL AND billing_status='unlocked' AND billing_lock_id IS NULL",
          )
          .run(id, version);
        if (result.changes !== 1)
          throw this.deps.errors.conflict('Time entry changed or cannot be deleted');
        this.deps.audit(principal, 'time.delete', 'time_entry', id, { version });
      } else {
        const timestamp = this.deps.now();
        const result = this.deps.sqlite
          .prepare(
            "UPDATE time_entry SET approval_state='void',updated_at=?,version=version+1 WHERE id=? AND version=? AND invoice_id IS NULL AND billing_status='unlocked' AND billing_lock_id IS NULL",
          )
          .run(timestamp, id, version);
        if (result.changes !== 1)
          throw this.deps.errors.conflict('Time entry changed or cannot be voided');
        this.deps.audit(principal, 'time.void', 'time_entry', id, { version });
      }
      return { success: true };
    });
  }

  operationalApproveTime(
    principal: Principal,
    id: string,
    decision: TimeEntryDecision,
    reason?: string,
  ) {
    this.deps.assertActive(principal);
    const row = this.deps.sqlite
      .prepare('SELECT project_id,approval_state FROM time_entry WHERE id=?')
      .get(id) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw this.deps.errors.validation('Time entry not found');
    if (!canReviewProject(principal, row.project_id))
      throw this.deps.errors.accessDenied('Project review required');
    if (row.approval_state !== 'submitted')
      throw this.deps.errors.conflict('Time entry is not submitted');
    const reviewReason = reason?.trim() || undefined;
    if (decision !== 'approved' && !reviewReason)
      throw this.deps.errors.validation('A reason is required');
    const timestamp = this.deps.now();
    this.deps.transaction(() => {
      this.deps.sqlite
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
      this.deps.sqlite
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
          reviewReason ?? null,
          timestamp,
        );
      this.deps.audit(principal, `time.${decision}`, 'time_entry', id, {
        reason: reviewReason ?? null,
      });
    });
  }

  listOwnTime(principal: Principal) {
    this.deps.assertReadable(principal);
    return this.deps.sqlite
      .prepare(
        'SELECT t.id,t.project_id,t.work_date,t.category,t.activity_code,t.minutes,t.activity_summary,t.approval_state,t.billability_state,t.version,p.project_number,p.name project_name FROM time_entry t JOIN project p ON p.id=t.project_id WHERE t.worker_id=? ORDER BY t.work_date DESC,t.created_at DESC LIMIT 400',
      )
      .all(principal.userId);
  }

  listOwnTimeWeek(principal: Principal, weekStart: string) {
    this.deps.assertReadable(principal);
    this.deps.assertDate(weekStart, 'Week start');
    const weekEnd = this.deps.shiftIsoDate(weekStart, 6);
    return {
      weekStart,
      weekEnd,
      rows: this.deps.sqlite
        .prepare(
          'SELECT t.id,t.project_id,t.work_date,t.category,t.activity_code,t.minutes,t.activity_summary,t.approval_state,t.billability_state,t.version,p.project_number,p.name project_name FROM time_entry t JOIN project p ON p.id=t.project_id WHERE t.worker_id=? AND t.work_date BETWEEN ? AND ? ORDER BY t.work_date,t.created_at,t.id',
        )
        .all(principal.userId, weekStart, weekEnd),
    };
  }

  copyOwnTimeLayout(
    principal: Principal,
    sourceWeekStart: string,
    targetWeekStart: string,
  ): { created: number; skipped: number; sourceWeekStart: string; targetWeekStart: string } {
    this.deps.assertActive(principal);
    this.deps.assertDate(sourceWeekStart, 'Source week start');
    this.deps.assertDate(targetWeekStart, 'Target week start');
    if (sourceWeekStart === targetWeekStart)
      throw this.deps.errors.validation('Source and target weeks must differ');
    const sourceWeekEnd = this.deps.shiftIsoDate(sourceWeekStart, 6);
    const sourceRows = this.deps.sqlite
      .prepare(
        "SELECT project_id,work_date,category,activity_code,activity_summary FROM time_entry WHERE worker_id=? AND work_date BETWEEN ? AND ? AND approval_state NOT IN ('rejected','void') ORDER BY work_date,id",
      )
      .all(principal.userId, sourceWeekStart, sourceWeekEnd) as Array<{
      project_id: string;
      work_date: string;
      category: string;
      activity_code: string | null;
      activity_summary: string;
    }>;
    let created = 0;
    let skipped = 0;
    this.deps.transaction(() => {
      for (const row of sourceRows) {
        const offset = Math.round(
          (Date.parse(`${row.work_date}T00:00:00.000Z`) -
            Date.parse(`${sourceWeekStart}T00:00:00.000Z`)) /
            86_400_000,
        );
        if (offset < 0 || offset > 6) {
          skipped += 1;
          continue;
        }
        const targetDate = this.deps.shiftIsoDate(targetWeekStart, offset);
        const assignment = this.deps.sqlite
          .prepare(
            "SELECT p.timezone FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.status IN ('active','planned','paused') AND pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
          )
          .get(row.project_id, principal.userId, targetDate, targetDate) as
          | { timezone: string }
          | undefined;
        if (!assignment) {
          skipped += 1;
          continue;
        }
        const duplicate = this.deps.sqlite
          .prepare(
            "SELECT 1 FROM time_entry WHERE worker_id=? AND project_id=? AND work_date=? AND category=? AND COALESCE(activity_code,'')=COALESCE(?,'') AND activity_summary=? LIMIT 1",
          )
          .get(
            principal.userId,
            row.project_id,
            targetDate,
            row.category,
            row.activity_code,
            row.activity_summary,
          );
        if (duplicate) {
          skipped += 1;
          continue;
        }
        const id = newId();
        const nowValue = this.deps.now();
        this.deps.sqlite
          .prepare(
            'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,activity_code,minutes,project_timezone,activity_summary,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            row.project_id,
            principal.userId,
            targetDate,
            row.category,
            row.activity_code,
            0,
            assignment.timezone,
            row.activity_summary,
            'draft',
            'pending',
            nowValue,
            nowValue,
          );
        created += 1;
      }
      this.deps.audit(
        principal,
        'time.copy_layout',
        'time_entry',
        `${sourceWeekStart}:${targetWeekStart}`,
        {
          sourceWeekStart,
          targetWeekStart,
          created,
          skipped,
          valuesCopied: false,
        },
      );
    });
    return { created, skipped, sourceWeekStart, targetWeekStart };
  }
}
