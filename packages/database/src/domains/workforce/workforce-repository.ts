import type { DatabaseSync } from 'node:sqlite';
import { canManageAssignments, newId, type Principal } from '@ja/domain';

type ErrorFactory = (message: string) => never;

export type SkillInput = Readonly<{ code: string; name: string }>;

export type WorkerSkillInput = Readonly<{
  workerId: string;
  skillId: string;
  proficiency: number;
}>;

export type WorkerAvailabilityInput = Readonly<{
  workerId: string;
  startsAt: string;
  endsAt: string;
  availability: 'available' | 'unavailable' | 'tentative';
  note?: string;
}>;

export type AssignmentInput = {
  projectId: string;
  workerId: string;
  startsOn: string;
  endsOn?: string;
  plannedMinutes?: number;
  canReview?: boolean;
};

export type WorkforceRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  assertActive: (principal: Principal) => void;
  assertReadable: (principal: Principal) => void;
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

export class WorkforceRepository {
  private readonly deps: WorkforceRepositoryDependencies;

  constructor(deps: WorkforceRepositoryDependencies) {
    this.deps = deps;
  }

  listSkills(principal: Principal) {
    this.deps.assertReadable(principal);
    return this.deps.sqlite
      .prepare('SELECT id,code,name,created_at FROM skill ORDER BY name,code')
      .all();
  }

  createSkill(principal: Principal, input: SkillInput) {
    this.deps.assertActive(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw this.deps.errors.accessDenied('Skill administration required');
    const code = this.deps.assertText(input.code, 'Skill code', 80).toUpperCase();
    const name = this.deps.assertText(input.name, 'Skill name', 160);
    const id = newId();
    try {
      this.deps.sqlite
        .prepare('INSERT INTO skill(id,code,name,created_at) VALUES(?,?,?,?)')
        .run(id, code, name, this.deps.now());
    } catch (error) {
      if (error instanceof Error && /UNIQUE/i.test(error.message))
        throw this.deps.errors.conflict('Skill code already exists');
      throw error;
    }
    this.deps.audit(principal, 'skill.create', 'skill', id, { code });
    return { id };
  }

  setWorkerSkill(principal: Principal, input: WorkerSkillInput): void {
    this.deps.assertActive(principal);
    const canManage = principal.role === 'owner_admin' || principal.role === 'finance_admin';
    if (!canManage) {
      if (principal.role === 'worker' && principal.userId !== input.workerId)
        throw this.deps.errors.accessDenied('Worker skill ownership required');
      if (principal.role !== 'project_manager')
        throw this.deps.errors.accessDenied('Skill administration required');
      const assigned = [...principal.projectIds].some((projectId) =>
        Boolean(
          this.deps.sqlite
            .prepare(
              "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
            )
            .get(projectId, input.workerId),
        ),
      );
      if (!assigned) throw this.deps.errors.accessDenied('Worker is outside the project scope');
    }
    if (!Number.isInteger(input.proficiency) || input.proficiency < 1 || input.proficiency > 5)
      throw this.deps.errors.validation('Skill proficiency must be from 1 to 5');
    if (
      !this.deps.sqlite
        .prepare(
          "SELECT 1 FROM user WHERE id=? AND role IN ('worker','project_manager') AND status='active'",
        )
        .get(input.workerId)
    )
      throw this.deps.errors.validation('Active worker not found');
    if (!this.deps.sqlite.prepare('SELECT 1 FROM skill WHERE id=?').get(input.skillId))
      throw this.deps.errors.validation('Skill not found');
    this.deps.sqlite
      .prepare(
        'INSERT INTO worker_skill(worker_id,skill_id,proficiency,verified_at) VALUES(?,?,?,?) ON CONFLICT(worker_id,skill_id) DO UPDATE SET proficiency=excluded.proficiency,verified_at=excluded.verified_at',
      )
      .run(input.workerId, input.skillId, input.proficiency, canManage ? this.deps.now() : null);
    this.deps.audit(
      principal,
      'worker_skill.set',
      'worker_skill',
      `${input.workerId}:${input.skillId}`,
      {
        proficiency: input.proficiency,
      },
    );
  }

  listWorkerSkills(principal: Principal, workerId?: string) {
    this.deps.assertReadable(principal);
    const target = workerId ?? principal.userId;
    if (principal.role === 'worker' && target !== principal.userId)
      throw this.deps.errors.accessDenied('Worker skill privacy required');
    if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (
        ids.length === 0 ||
        !this.deps.sqlite
          .prepare(
            `SELECT 1 FROM project_member WHERE user_id=? AND status='active' AND project_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,
          )
          .get(target, ...ids)
      )
        throw this.deps.errors.accessDenied('Worker skill is outside the project scope');
    }
    return this.deps.sqlite
      .prepare(
        'SELECT ws.worker_id,ws.skill_id,ws.proficiency,ws.verified_at,s.code,s.name FROM worker_skill ws JOIN skill s ON s.id=ws.skill_id WHERE ws.worker_id=? ORDER BY s.name',
      )
      .all(target);
  }

  setWorkerAvailability(principal: Principal, input: WorkerAvailabilityInput) {
    this.deps.assertActive(principal);
    if (principal.role === 'worker' && principal.userId !== input.workerId)
      throw this.deps.errors.accessDenied('Worker availability ownership required');
    if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (
        ids.length === 0 ||
        !this.deps.sqlite
          .prepare(
            `SELECT 1 FROM project_member WHERE user_id=? AND status='active' AND project_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,
          )
          .get(input.workerId, ...ids)
      )
        throw this.deps.errors.accessDenied('Worker availability is outside the project scope');
    }
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
      throw this.deps.errors.validation('Availability end must follow start');
    const id = newId();
    const timestamp = this.deps.now();
    this.deps.sqlite
      .prepare(
        'INSERT INTO worker_availability(id,worker_id,starts_at,ends_at,availability,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.workerId,
        input.startsAt,
        input.endsAt,
        input.availability,
        input.note?.trim() || null,
        timestamp,
        timestamp,
      );
    this.deps.audit(principal, 'worker_availability.create', 'worker_availability', id, {
      workerId: input.workerId,
      availability: input.availability,
    });
    return { id, version: 1 };
  }

  listWorkerAvailability(principal: Principal, workerId?: string) {
    this.deps.assertReadable(principal);
    const target = workerId ?? principal.userId;
    if (principal.role === 'worker' && target !== principal.userId)
      throw this.deps.errors.accessDenied('Worker availability privacy required');
    if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (
        ids.length === 0 ||
        !this.deps.sqlite
          .prepare(
            `SELECT 1 FROM project_member WHERE user_id=? AND status='active' AND project_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,
          )
          .get(target, ...ids)
      )
        throw this.deps.errors.accessDenied('Worker availability is outside the project scope');
    }
    return this.deps.sqlite
      .prepare(
        'SELECT id,worker_id,starts_at,ends_at,availability,note,version FROM worker_availability WHERE worker_id=? ORDER BY starts_at DESC LIMIT 200',
      )
      .all(target);
  }

  assignWorker(principal: Principal, input: AssignmentInput) {
    this.deps.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw this.deps.errors.accessDenied('Assignment administration required');
    assertDate(input.startsOn, 'Start date', this.deps.errors.validation);
    if (input.endsOn) assertDate(input.endsOn, 'End date', this.deps.errors.validation);
    if (input.endsOn && input.endsOn < input.startsOn)
      throw this.deps.errors.validation('Assignment end date must follow the start date');
    const worker = this.deps.sqlite
      .prepare(
        "SELECT 1 ok FROM user WHERE id=? AND role IN ('worker','project_manager') AND status='active'",
      )
      .get(input.workerId);
    if (!worker) throw this.deps.errors.validation('Active workforce member not found');
    const id = newId();
    const timestamp = this.deps.now();
    this.deps.sqlite
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
    this.deps.audit(principal, 'assignment.create', 'project_member', id, input);
    return { id };
  }

  listActiveWorkers(principal: Principal) {
    this.deps.assertReadable(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'project_manager' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'auditor_read_only'
    )
      throw this.deps.errors.accessDenied('Worker administration required');
    return this.deps.sqlite
      .prepare(
        "SELECT id,name,email,role,status,created_at,offboarded_at FROM user WHERE status='active' ORDER BY name,email",
      )
      .all();
  }
}

function assertDate(value: string, field: string, validation: ErrorFactory): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    throw validation(`${field} must be an ISO date`);
}
