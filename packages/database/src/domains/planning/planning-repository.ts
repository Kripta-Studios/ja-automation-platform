import type { DatabaseSync } from 'node:sqlite';
import { canManageAssignments, newId, type Principal } from '@ja/domain';

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
  endsAt: string;
  plannedMinutes: number;
  site?: string;
  requiredSkill?: string;
};

export type PlanningRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
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
    const project = this.deps.sqlite
      .prepare('SELECT id FROM project WHERE id=?')
      .get(input.projectId);
    if (!project) throw this.deps.errors.validation('Project not found');
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
  }

  createPlanningAssignment(principal: Principal, input: PlanningAssignmentInput) {
    this.deps.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw this.deps.errors.accessDenied('Planning administration required');
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
      throw this.deps.errors.validation('Planning end must follow start');
    const member = this.deps.sqlite
      .prepare(
        "SELECT 1 ok FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
      )
      .get(input.projectId, input.workerId);
    if (!member) throw this.deps.errors.validation('Worker must have an active project assignment');
    const overlap = this.deps.sqlite
      .prepare(
        "SELECT 1 ok FROM planning_assignment WHERE worker_id=? AND status<>'cancelled' AND starts_at<? AND ends_at>? LIMIT 1",
      )
      .get(input.workerId, input.endsAt, input.startsAt);
    if (overlap)
      throw this.deps.errors.conflict('Worker already has an overlapping planning assignment');
    const unavailable = this.deps.sqlite
      .prepare(
        "SELECT 1 ok FROM worker_availability WHERE worker_id=? AND availability='unavailable' AND starts_at<? AND ends_at>? LIMIT 1",
      )
      .get(input.workerId, input.endsAt, input.startsAt);
    if (unavailable)
      throw this.deps.errors.conflict('Worker is unavailable for this planning window');
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
        input.endsAt,
        input.plannedMinutes,
        'published',
        input.site ?? null,
        input.requiredSkill ?? null,
        principal.userId,
        timestamp,
        timestamp,
      );
    this.deps.audit(principal, 'planning.create', 'planning_assignment', id, input);
    return { id };
  }

  listPlanning(principal: Principal) {
    this.deps.assertReadable(principal);
    if (principal.role === 'worker')
      return this.deps.sqlite
        .prepare(
          "SELECT pa.*,p.project_number,p.name project_name,u.name worker_name FROM planning_assignment pa JOIN project p ON p.id=pa.project_id JOIN user u ON u.id=pa.worker_id WHERE pa.worker_id=? AND pa.status<>'cancelled' ORDER BY pa.starts_at",
        )
        .all(principal.userId);
    const ids = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    if (principal.role === 'project_manager' && ids.length === 0) return [];
    const restriction = ids.length ? ` AND pa.project_id IN (${ids.map(() => '?').join(',')})` : '';
    return this.deps.sqlite
      .prepare(
        `SELECT pa.*,p.project_number,p.name project_name,u.name worker_name FROM planning_assignment pa JOIN project p ON p.id=pa.project_id JOIN user u ON u.id=pa.worker_id WHERE pa.status<>'cancelled'${restriction} ORDER BY pa.starts_at`,
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
          'SELECT id,project_number,name,status,currency,timezone,start_date,planned_end_date,actual_end_date FROM project ORDER BY project_number',
        )
        .all();
    return this.deps.sqlite
      .prepare(
        "SELECT p.id,p.project_number,p.name,p.status,p.currency,p.timezone,p.start_date,p.planned_end_date,p.actual_end_date FROM project p JOIN project_member pm ON pm.project_id=p.id WHERE pm.user_id=? AND pm.status='active' ORDER BY p.project_number",
      )
      .all(principal.userId);
  }
}
