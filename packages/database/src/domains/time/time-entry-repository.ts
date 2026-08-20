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

  createTimeEntry(principal: Principal, input: TimeEntryInput) {
    this.deps.assertActive(principal);
    this.deps.assertDate(input.workDate, 'Work date');
    if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 1440)
      throw this.deps.errors.validation('Minutes must be an integer from 0 to 1440');
    const assignment = this.deps.sqlite
      .prepare(
        "SELECT p.timezone FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
      )
      .get(input.projectId, principal.userId, input.workDate, input.workDate) as
      | { timezone: string }
      | undefined;
    if (!assignment) throw this.deps.errors.accessDenied('Active project assignment required');
    const id = newId();
    const timestamp = this.deps.now();
    this.deps.sqlite
      .prepare(
        'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,activity_code,minutes,project_timezone,activity_summary,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
  }

  submitTime(principal: Principal, id: string, baseVersion: number) {
    this.deps.assertActive(principal);
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
  }

  updateTimeEntry(principal: Principal, input: TimeEntryUpdateInput) {
    this.deps.assertActive(principal);
    const current = this.deps.sqlite
      .prepare(
        'SELECT project_id,worker_id,approval_state,invoice_id,billing_status FROM time_entry WHERE id=?',
      )
      .get(input.id) as
      | {
          project_id: string;
          worker_id: string;
          approval_state: string;
          invoice_id: string | null;
          billing_status: string;
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
    if (input.workDate) this.deps.assertDate(input.workDate, 'Work date');
    if (
      input.minutes !== undefined &&
      (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 1440)
    )
      throw this.deps.errors.validation('Minutes must be an integer from 0 to 1440');
    if (input.breakMinutes !== undefined && (input.breakMinutes < 0 || input.breakMinutes > 1440))
      throw this.deps.errors.validation('Break minutes are invalid');
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
          reason ?? null,
          timestamp,
        );
      this.deps.audit(principal, `time.${decision}`, 'time_entry', id, { reason: reason ?? null });
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
        "SELECT project_id,work_date,category,activity_code,activity_summary FROM time_entry WHERE worker_id=? AND work_date BETWEEN ? AND ? AND approval_state<>'rejected' ORDER BY work_date,id",
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
            "SELECT p.timezone FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
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
