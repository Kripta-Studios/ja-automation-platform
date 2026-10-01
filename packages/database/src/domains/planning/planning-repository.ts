import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { canManageAssignments, newId, type Principal } from '@ja/domain';
import { workerOperationalProjectScope } from '../../core/project-access.ts';

type ErrorFactory = (message: string) => never;

export type ProjectScheduleInput = Readonly<{
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
}>;

export type PlanningAssignmentInput = {
  projectId: string;
  workerId: string;
  startsAt: string;
  endsAt?: string;
  plannedMinutes?: number;
  site?: string;
  requiredSkill?: string;
};

export type PlanningAssignmentUpdateInput = PlanningAssignmentInput & {
  id: string;
  version: number;
};

export type PlanningAssignmentCancelInput = {
  id: string;
  version: number;
};

export type PlanningRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  assertActive: (principal: Principal) => void;
  assertReadable: (principal: Principal) => void;
  assertDate: (value: string, field: string) => void;
  audit: (
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ) => void;
  now: () => string;
  assertText: (value: string, field: string, max?: number) => string;
  errors: Readonly<{
    accessDenied: ErrorFactory;
    conflict: ErrorFactory;
    validation: ErrorFactory;
  }>;
}>;

export class PlanningRepository {
  private readonly deps: PlanningRepositoryDependencies;

  constructor(deps: PlanningRepositoryDependencies) {
    this.deps = deps;
  }

  private today(): string {
    return this.deps.now().slice(0, 10);
  }

  private todayInZone(timezone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(this.deps.now()));
      const part = (type: string) => parts.find((item) => item.type === type)?.value;
      const year = part('year');
      const month = part('month');
      const day = part('day');
      return year && month && day ? `${year}-${month}-${day}` : this.today();
    } catch {
      return this.today();
    }
  }

  private todayForProject(projectId: string): string {
    const project = this.deps.sqlite
      .prepare('SELECT timezone FROM project WHERE id=?')
      .get(projectId) as { timezone: string } | undefined;
    return project ? this.todayInZone(project.timezone) : this.today();
  }

  private assertOperationalProject(projectId: string): void {
    const project = this.deps.sqlite
      .prepare('SELECT status FROM project WHERE id=?')
      .get(projectId) as { status: string } | undefined;
    if (!project) throw this.deps.errors.validation('Project not found');
    if (!['active', 'planned', 'paused'].includes(project.status))
      throw this.deps.errors.conflict(
        'Planning and schedules are only allowed on active, planned, or paused projects',
      );
  }

  private assignmentCoversWindow(
    projectId: string,
    workerId: string,
    startsOn: string,
    endsOn: string,
  ): boolean {
    return Boolean(
      this.deps.sqlite
        .prepare(
          `SELECT 1
           FROM project_member pm
           JOIN user u ON u.id=pm.user_id
           WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
             AND u.status='active' AND u.role IN ('worker','project_manager')
             AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
           LIMIT 1`,
        )
        .get(projectId, workerId, startsOn, endsOn),
    );
  }

  private assertManagerScope(principal: Principal, projectId: string): void {
    if (principal.role !== 'project_manager') return;
    const today = this.todayForProject(projectId);
    if (
      !principal.projectIds.has(projectId) ||
      !this.assignmentCoversWindow(projectId, principal.userId, today, today)
    )
      throw this.deps.errors.accessDenied('Project assignment is not currently effective');
  }

  private datePart(value: string, field: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) throw this.deps.errors.validation(`${field} must be a valid date`);
    return new Date(parsed).toISOString().slice(0, 10);
  }

  listProjectSchedule(principal: Principal, projectId: string) {
    this.deps.assertReadable(principal);
    const permitted =
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only' ||
      principal.projectIds.has(projectId);
    if (!permitted) throw this.deps.errors.accessDenied('Project access required');
    return this.deps.sqlite
      .prepare(
        'SELECT id,project_id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from,effective_to,version FROM schedule WHERE project_id=? ORDER BY effective_from DESC,id DESC LIMIT 1',
      )
      .get(projectId);
  }

  updateProjectSchedule(principal: Principal, input: ProjectScheduleInput) {
    this.deps.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw this.deps.errors.accessDenied('Schedule administration required');
    this.deps.assertDate(input.effectiveFrom, 'Schedule effective date');
    const minutes = [
      input.mondayMinutes,
      input.tuesdayMinutes,
      input.wednesdayMinutes,
      input.thursdayMinutes,
      input.fridayMinutes,
      input.saturdayMinutes,
      input.sundayMinutes,
    ];
    if (minutes.some((value) => !Number.isInteger(value) || value < 0 || value > 1440))
      throw this.deps.errors.validation('Schedule minutes must be between 0 and 1440');
    return this.deps.transaction(() => {
      this.assertOperationalProject(input.projectId);
      const id = newId();
      const timestamp = this.deps.now();
      this.deps.sqlite
        .prepare(
          'INSERT INTO schedule(id,project_id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          input.projectId,
          this.deps.assertText(input.timezone, 'Schedule timezone', 100),
          ...minutes,
          input.effectiveFrom,
        );
      this.deps.sqlite
        .prepare('UPDATE project SET expected_schedule_id=?,timezone=?,updated_at=? WHERE id=?')
        .run(id, input.timezone, timestamp, input.projectId);
      this.deps.audit(principal, 'schedule.create', 'schedule', id, { projectId: input.projectId });
      return { id, version: 1 };
    });
  }

  createPlanningAssignment(principal: Principal, input: PlanningAssignmentInput) {
    this.deps.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw this.deps.errors.accessDenied('Planning administration required');
    return this.deps.transaction(() => {
      this.assertOperationalProject(input.projectId);
      this.assertManagerScope(principal, input.projectId);
      this.validatePlanningWindow(input, '');
      return this.insertPlanningAssignment(principal, input);
    });
  }

  createPlanningAssignments(
    principal: Principal,
    input: Omit<PlanningAssignmentInput, 'workerId'> & { workerIds: string[]; requestKey: string },
  ) {
    this.deps.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw this.deps.errors.accessDenied('Planning administration required');
    if (
      !/^[0-9a-f-]{36}$/i.test(input.requestKey) ||
      input.workerIds.length < 1 ||
      input.workerIds.length > 100 ||
      new Set(input.workerIds).size !== input.workerIds.length
    )
      throw this.deps.errors.validation('Select one or more distinct workers');
    const workers = [...input.workerIds].sort();
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          projectId: input.projectId,
          workerIds: workers,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          plannedMinutes: input.plannedMinutes ?? null,
          site: input.site ?? null,
          requiredSkill: input.requiredSkill ?? null,
        }),
      )
      .digest('hex');
    return this.deps.transaction(() => {
      this.assertOperationalProject(input.projectId);
      this.assertManagerScope(principal, input.projectId);
      const prior = this.deps.sqlite
        .prepare(
          'SELECT payload_hash,assignment_ids FROM planning_publish_request WHERE actor_id=? AND request_key=?',
        )
        .get(principal.userId, input.requestKey) as
        | { payload_hash: string; assignment_ids: string }
        | undefined;
      if (prior) {
        if (prior.payload_hash !== payloadHash)
          throw this.deps.errors.conflict(
            'Planning publish request changed; reload before publishing',
          );
        return { ids: JSON.parse(prior.assignment_ids) as string[], replayed: true };
      }
      // Validate the entire group before the first assignment is inserted.
      const assignments = workers.map((workerId) => ({ ...input, workerId }));
      for (const assignment of assignments) this.validatePlanningWindow(assignment, '');
      const ids = assignments.map(
        (assignment) => this.insertPlanningAssignment(principal, assignment).id,
      );
      this.deps.sqlite
        .prepare(
          'INSERT INTO planning_publish_request(actor_id,request_key,payload_hash,assignment_ids,created_at) VALUES(?,?,?,?,?)',
        )
        .run(principal.userId, input.requestKey, payloadHash, JSON.stringify(ids), this.deps.now());
      return { ids, replayed: false };
    });
  }

  private insertPlanningAssignment(principal: Principal, input: PlanningAssignmentInput) {
    const id = newId();
    const timestamp = this.deps.now();
    this.deps.sqlite
      .prepare(
        'INSERT INTO planning_assignment(id,project_id,worker_id,starts_at,ends_at,planned_minutes,status,site,required_skill,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.workerId,
        input.startsAt,
        input.endsAt ?? null,
        input.plannedMinutes ?? null,
        'published',
        input.site ?? null,
        input.requiredSkill ?? null,
        principal.userId,
        timestamp,
        timestamp,
      );
    const {
      workerIds: _workerIds,
      requestKey: _requestKey,
      ...details
    } = input as PlanningAssignmentInput & { workerIds?: string[]; requestKey?: string };
    this.deps.audit(principal, 'planning.create', 'planning_assignment', id, details);
    return { id };
  }

  updatePlanningAssignment(principal: Principal, input: PlanningAssignmentUpdateInput) {
    this.deps.assertActive(principal);
    if (!Number.isInteger(input.version) || input.version < 1)
      throw this.deps.errors.validation('Planning version must be a positive integer');
    return this.deps.transaction(() => {
      const current = this.deps.sqlite
        .prepare('SELECT * FROM planning_assignment WHERE id=?')
        .get(input.id) as Record<string, unknown> | undefined;
      if (!current) throw this.deps.errors.validation('Planning assignment not found');
      const previousProjectId = String(current.project_id);
      if (
        !canManageAssignments(principal, previousProjectId) ||
        !canManageAssignments(principal, input.projectId)
      )
        throw this.deps.errors.accessDenied('Planning administration required');
      this.assertManagerScope(principal, previousProjectId);
      this.assertManagerScope(principal, input.projectId);
      if (current.status === 'cancelled')
        throw this.deps.errors.conflict('Cancelled planning cannot be edited');
      if (Number(current.version) !== input.version)
        throw this.deps.errors.conflict('Planning assignment changed; reload before editing');
      this.assertOperationalProject(input.projectId);
      this.validatePlanningWindow(input, input.id);
      const timestamp = this.deps.now();
      const changed = this.deps.sqlite
        .prepare(
          `UPDATE planning_assignment
           SET project_id=?,worker_id=?,starts_at=?,ends_at=?,planned_minutes=?,site=?,required_skill=?,version=version+1,updated_at=?
           WHERE id=? AND version=? AND status<>'cancelled'`,
        )
        .run(
          input.projectId,
          input.workerId,
          input.startsAt,
          input.endsAt ?? null,
          input.plannedMinutes ?? null,
          input.site ?? null,
          input.requiredSkill ?? null,
          timestamp,
          input.id,
          input.version,
        );
      if (changed.changes !== 1)
        throw this.deps.errors.conflict('Planning assignment changed; reload before editing');
      this.deps.audit(principal, 'planning.update', 'planning_assignment', input.id, {
        before: current,
        after: input,
      });
      return { id: input.id, version: input.version + 1 };
    });
  }

  cancelPlanningAssignment(principal: Principal, input: PlanningAssignmentCancelInput) {
    this.deps.assertActive(principal);
    if (!Number.isInteger(input.version) || input.version < 1)
      throw this.deps.errors.validation('Planning version must be a positive integer');
    return this.deps.transaction(() => {
      const current = this.deps.sqlite
        .prepare('SELECT * FROM planning_assignment WHERE id=?')
        .get(input.id) as Record<string, unknown> | undefined;
      if (!current) throw this.deps.errors.validation('Planning assignment not found');
      const projectId = String(current.project_id);
      if (!canManageAssignments(principal, projectId))
        throw this.deps.errors.accessDenied('Planning administration required');
      this.assertManagerScope(principal, projectId);
      if (current.status === 'cancelled')
        throw this.deps.errors.conflict('Planning assignment is already cancelled');
      if (Number(current.version) !== input.version)
        throw this.deps.errors.conflict('Planning assignment changed; reload before cancelling');
      const changed = this.deps.sqlite
        .prepare(
          "UPDATE planning_assignment SET status='cancelled',version=version+1,updated_at=? WHERE id=? AND version=? AND status<>'cancelled'",
        )
        .run(this.deps.now(), input.id, input.version);
      if (changed.changes !== 1)
        throw this.deps.errors.conflict('Planning assignment changed; reload before cancelling');
      this.deps.audit(principal, 'planning.cancel', 'planning_assignment', input.id, {
        before: current,
        after: { status: 'cancelled', version: input.version + 1 },
      });
      return { id: input.id, version: input.version + 1 };
    });
  }

  private validatePlanningWindow(input: PlanningAssignmentInput, excludeId: string): void {
    const starts = Date.parse(input.startsAt);
    const ends = input.endsAt ? Date.parse(input.endsAt) : null;
    if (!Number.isFinite(starts) || (ends !== null && (!Number.isFinite(ends) || ends <= starts)))
      throw this.deps.errors.validation('Planning end must follow a valid start');
    if (
      input.plannedMinutes !== undefined &&
      (!Number.isInteger(input.plannedMinutes) ||
        input.plannedMinutes < 0 ||
        input.plannedMinutes > 10080)
    )
      throw this.deps.errors.validation('Planned minutes must be between 0 and 10080');
    const startsOn = this.datePart(input.startsAt, 'Planning start');
    const endsOn = input.endsAt ? this.datePart(input.endsAt, 'Planning end') : startsOn;
    if (!this.assignmentCoversWindow(input.projectId, input.workerId, startsOn, endsOn))
      throw this.deps.errors.validation(
        'Worker must have an effective project assignment for the planning window',
      );
    // An omitted end is a start-only event, not an inferred shift duration.
    // Reject an identical start or a start contained by a known interval.
    const overlap = this.deps.sqlite
      .prepare(
        `SELECT 1 FROM planning_assignment WHERE worker_id=? AND id<>? AND status<>'cancelled'
       AND (starts_at=? OR (ends_at IS NOT NULL AND starts_at<=? AND ends_at>?)
         OR (? IS NOT NULL AND starts_at>=? AND starts_at<?)) LIMIT 1`,
      )
      .get(
        input.workerId,
        excludeId,
        input.startsAt,
        input.startsAt,
        input.startsAt,
        input.endsAt ?? null,
        input.startsAt,
        input.endsAt ?? null,
      );
    if (overlap)
      throw this.deps.errors.conflict('Worker already has an overlapping planning assignment');
    const unavailable = this.deps.sqlite
      .prepare(
        `SELECT 1 FROM worker_availability WHERE worker_id=? AND availability='unavailable'
       AND ((starts_at<=? AND ends_at>?) OR (? IS NOT NULL AND starts_at<? AND ends_at>?)) LIMIT 1`,
      )
      .get(
        input.workerId,
        input.startsAt,
        input.startsAt,
        input.endsAt ?? null,
        input.endsAt ?? null,
        input.startsAt,
      );
    if (unavailable)
      throw this.deps.errors.conflict('Worker is unavailable for this planning window');
  }

  listPlanning(principal: Principal) {
    this.deps.assertReadable(principal);
    if (principal.role === 'worker') {
      const scope = workerOperationalProjectScope(this.deps.sqlite, principal, 'planning');
      return this.deps.sqlite
        .prepare(
          `${scope.withClause}
           SELECT DISTINCT pa.id,pa.project_id,pa.worker_id,pa.starts_at,pa.ends_at,
                  pa.planned_minutes,pa.status,pa.site,pa.required_skill,pa.version,
                  pa.created_at,pa.updated_at,p.project_number,p.name project_name,u.name worker_name
           FROM planning_assignment pa
           JOIN project p ON p.id=pa.project_id
           JOIN user u ON u.id=pa.worker_id
           JOIN project_member pm ON pm.project_id=pa.project_id AND pm.user_id=pa.worker_id
           WHERE ${scope.predicate} AND pa.worker_id=? AND pa.status<>'cancelled'
             AND pm.status='active' AND u.status='active'
             AND u.role IN ('worker','project_manager')
             AND pm.starts_on<=date(pa.starts_at)
             AND (pm.ends_on IS NULL OR pm.ends_on>=date(COALESCE(pa.ends_at,pa.starts_at)))
           ORDER BY pa.starts_at`,
        )
        .all(...scope.parameters, principal.userId);
    }
    const ids = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    if (principal.role === 'project_manager' && ids.length === 0) return [];
    const restriction = ids.length ? ` AND pa.project_id IN (${ids.map(() => '?').join(',')})` : '';
    const columns =
      principal.role === 'project_manager'
        ? `pa.id,pa.project_id,pa.worker_id,pa.starts_at,pa.ends_at,pa.planned_minutes,
           pa.status,pa.site,pa.required_skill,pa.version,pa.created_at,pa.updated_at`
        : 'pa.*';
    return this.deps.sqlite
      .prepare(
        `SELECT ${columns},p.project_number,p.name project_name,u.name worker_name
         FROM planning_assignment pa
         JOIN project p ON p.id=pa.project_id
         JOIN user u ON u.id=pa.worker_id
         WHERE pa.status<>'cancelled'${restriction}
         ORDER BY pa.starts_at`,
      )
      .all(...ids);
  }

  listAssignedProjects(principal: Principal) {
    this.deps.assertReadable(principal);
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return this.deps.sqlite
        .prepare(
          'SELECT id,project_number,name,status,currency,timezone,start_date,planned_end_date,actual_end_date,version FROM project ORDER BY project_number',
        )
        .all();
    const rows = this.deps.sqlite
      .prepare(
        "SELECT p.id,p.project_number,p.name,p.status,p.currency,p.timezone,p.start_date,p.planned_end_date,p.actual_end_date,p.version,pm.starts_on,pm.ends_on FROM project p JOIN project_member pm ON pm.project_id=p.id WHERE p.status IN ('active','planned','paused') AND pm.user_id=? AND pm.status='active' ORDER BY p.project_number",
      )
      .all(principal.userId) as Array<
      Record<string, unknown> & { timezone: string; starts_on: string; ends_on: string | null }
    >;
    return rows.flatMap(({ starts_on, ends_on, ...project }) => {
      const today = this.todayInZone(project.timezone as string);
      return starts_on <= today && (!ends_on || ends_on >= today) ? [project] : [];
    });
  }
}
