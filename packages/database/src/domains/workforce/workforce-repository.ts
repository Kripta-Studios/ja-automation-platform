import type { DatabaseSync } from 'node:sqlite';
import { canManageAssignments, newId, roles, type Principal } from '@ja/domain';

type ErrorFactory = (message: string) => never;

type SkillRow = Readonly<{ name: string; code: string }>;
type AssignmentRow = Readonly<{
  id: string;
  project_id: string;
  user_id: string;
  starts_on: string;
  ends_on: string | null;
  planned_minutes: number | null;
  can_review: number;
  status: string;
  version: number;
}>;

export type SkillInput = Readonly<{ code: string; name: string }>;

export type WorkerSkillInput = Readonly<{
  workerId: string;
  skillId: string;
  proficiency: number;
}>;

export type WorkerAvailabilityInput = Readonly<{
  id?: string;
  version?: number;
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

export type AssignmentRemovalInput = Readonly<{
  endsOn?: string;
  reason: string;
  version?: number;
  /**
   * T19: hours logged after the end date that nobody approved yet are resolved
   * with the removal: unsent drafts are discarded (void) and pending or
   * returned hours are rejected with the removal reason. Approved, locked or
   * invoiced hours, expenses and reports still block the end date.
   */
  resolveLaterTime?: boolean;
}>;

/** A supplier's technician or coordinator (D5: managed by the supplier workspace). */
function isSupplierStaff(sqlite: DatabaseSync, userId: string): boolean {
  return Boolean(
    sqlite.prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=? LIMIT 1').get(userId),
  );
}

export type WorkforceRepositoryDependencies = Readonly<{
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

  private today(): string {
    return this.deps.now().slice(0, 10);
  }

  /**
   * The read-only auditor role is allowed to inspect workforce data, but it
   * must never be able to mutate the skill catalogue, worker skills or
   * availability records.  Keep this guard local to the write methods as the
   * repository is also constructed in a few non-HTTP contexts where the
   * injected `assertActive` callback only verifies account status.
   */
  private assertWorkforceWrite(principal: Principal): void {
    if (principal.role === 'auditor_read_only')
      throw this.deps.errors.accessDenied('Read-only role cannot modify workforce data');
  }

  private effectiveLaborAssignment(
    projectId: string,
    workerId: string,
    startsOn: string = this.today(),
    endsOn: string = startsOn,
  ): boolean {
    return Boolean(
      this.deps.sqlite
        .prepare(
          `SELECT 1
           FROM project_member pm
           JOIN project assignment_project ON assignment_project.id=pm.project_id
           JOIN user u ON u.id=pm.user_id
           WHERE assignment_project.status IN ('active','planned','paused')
             AND pm.project_id=? AND pm.user_id=? AND pm.status='active'
             AND u.status='active' AND u.role IN ('worker','project_manager')
             AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
           LIMIT 1`,
        )
        .get(projectId, workerId, startsOn, endsOn),
    );
  }

  private assertPrincipalProjectScope(principal: Principal, projectId: string): void {
    if (principal.role !== 'project_manager') return;
    if (
      !principal.projectIds.has(projectId) ||
      !this.effectiveLaborAssignment(projectId, principal.userId)
    )
      throw this.deps.errors.accessDenied('Project assignment is not currently effective');
  }

  private listScopedLaborWorkers(principal: Principal) {
    const ids = [...principal.projectIds];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.deps.sqlite
      .prepare(
        `SELECT DISTINCT u.id,u.name,u.email,u.role,u.status,u.created_at,u.offboarded_at
         FROM user u
         JOIN project_member pm ON pm.user_id=u.id
         JOIN project scope_project ON scope_project.id=pm.project_id
         JOIN project_member scope_pm ON scope_pm.project_id=pm.project_id
         WHERE scope_project.status IN ('active','planned','paused')
           AND u.status='active' AND u.role IN ('worker','project_manager')
           AND pm.status='active' AND pm.project_id IN (${placeholders})
           AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
           AND scope_pm.user_id=? AND scope_pm.status='active'
           AND scope_pm.starts_on<=? AND (scope_pm.ends_on IS NULL OR scope_pm.ends_on>=?)
         ORDER BY u.name,u.email`,
      )
      .all(...ids, this.today(), this.today(), principal.userId, this.today(), this.today());
  }

  listPlanningWorkerOptions(principal: Principal) {
    this.deps.assertReadable(principal);
    if (principal.role === 'worker') return [];
    if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (ids.length === 0) return [];
      return this.deps.sqlite
        .prepare(
          `SELECT DISTINCT u.id,u.name,u.status,sp.profile workforce_profile
           FROM user u
           LEFT JOIN supplier_user_profile sp ON sp.user_id=u.id
           JOIN project_member pm ON pm.user_id=u.id
           JOIN project p ON p.id=pm.project_id
           JOIN project_member scope_pm ON scope_pm.project_id=pm.project_id
           WHERE p.status IN ('active','planned','paused')
             AND u.status='active' AND u.role IN ('worker','project_manager')
             AND pm.status='active' AND pm.project_id IN (${ids.map(() => '?').join(',')})
             AND pm.assignment_role<>'supplier_coordinator'
             AND (pm.ends_on IS NULL OR pm.ends_on>=?)
             AND scope_pm.user_id=? AND scope_pm.status='active'
             AND scope_pm.starts_on<=? AND (scope_pm.ends_on IS NULL OR scope_pm.ends_on>=?)
           ORDER BY u.name,u.id`,
        )
        .all(...ids, this.today(), principal.userId, this.today(), this.today());
    }
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'auditor_read_only'
    )
      throw this.deps.errors.accessDenied('Planning worker selection required');
    return this.deps.sqlite
      .prepare(
        // D3/D5: the supplier profile lets the planner hide coordinators and,
        // for a project manager, supplier staff.
        `SELECT u.id,u.name,u.status,sp.profile workforce_profile
           FROM user u LEFT JOIN supplier_user_profile sp ON sp.user_id=u.id
          WHERE u.status='active' AND u.role IN ('worker','project_manager')
          ORDER BY u.name,u.id`,
      )
      .all();
  }

  listSkills(principal: Principal) {
    this.deps.assertReadable(principal);
    return this.deps.sqlite
      .prepare('SELECT id,code,name,created_at FROM skill ORDER BY name,code')
      .all();
  }

  createSkill(principal: Principal, input: SkillInput) {
    this.deps.assertActive(principal);
    this.assertWorkforceWrite(principal);
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
    this.assertWorkforceWrite(principal);
    const canManage = principal.role === 'owner_admin' || principal.role === 'finance_admin';
    const isOwnProfile =
      ['worker', 'project_manager'].includes(principal.role) && principal.userId === input.workerId;
    if (!canManage && !isOwnProfile) {
      if (principal.role === 'worker' && principal.userId !== input.workerId)
        throw this.deps.errors.accessDenied('Worker skill ownership required');
      if (principal.role !== 'project_manager')
        throw this.deps.errors.accessDenied('Skill administration required');
      const assigned = [...principal.projectIds].some(
        (projectId) =>
          this.effectiveLaborAssignment(projectId, input.workerId) &&
          this.effectiveLaborAssignment(projectId, principal.userId),
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
    this.deps.audit(principal, 'worker_skill.set', 'user', input.workerId, {
      skillId: input.skillId,
      proficiency: input.proficiency,
    });
  }

  deleteWorkerSkill(principal: Principal, workerId: string, skillId: string): void {
    this.deps.assertActive(principal);
    this.assertWorkforceWrite(principal);
    const canManage = principal.role === 'owner_admin' || principal.role === 'finance_admin';
    const isOwnProfile =
      ['worker', 'project_manager'].includes(principal.role) && principal.userId === workerId;
    if (!canManage && !isOwnProfile) {
      if (principal.role === 'worker' && principal.userId !== workerId)
        throw this.deps.errors.accessDenied('Worker skill ownership required');
      if (principal.role !== 'project_manager')
        throw this.deps.errors.accessDenied('Skill administration required');
      const assigned = [...principal.projectIds].some(
        (projectId) =>
          this.effectiveLaborAssignment(projectId, workerId) &&
          this.effectiveLaborAssignment(projectId, principal.userId),
      );
      if (!assigned) throw this.deps.errors.accessDenied('Worker is not in your active projects');
    }

    this.deps.sqlite
      .prepare('DELETE FROM worker_skill WHERE worker_id=? AND skill_id=?')
      .run(workerId, skillId);

    this.deps.audit(principal, 'worker_skill.delete', 'user', workerId, { skillId });
  }

  updateSkill(principal: Principal, id: string, input: { name?: string }): void {
    this.deps.assertActive(principal);
    this.assertWorkforceWrite(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw this.deps.errors.accessDenied('Skill administration required');

    const existing = this.deps.sqlite.prepare('SELECT * FROM skill WHERE id=?').get(id) as
      | SkillRow
      | undefined;
    if (!existing) throw this.deps.errors.validation('Skill not found');

    const name =
      input.name !== undefined
        ? this.deps.assertText(input.name, 'Skill name', 160)
        : existing.name;

    this.deps.sqlite.prepare('UPDATE skill SET name=? WHERE id=?').run(name, id);

    this.deps.audit(principal, 'skill.update', 'skill', id, {});
  }

  deleteSkill(principal: Principal, id: string): void {
    this.deps.assertActive(principal);
    this.assertWorkforceWrite(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw this.deps.errors.accessDenied('Skill administration required');

    const existing = this.deps.sqlite.prepare('SELECT * FROM skill WHERE id=?').get(id) as
      | SkillRow
      | undefined;
    if (!existing) throw this.deps.errors.validation('Skill not found');

    // Cleanup relationships
    this.deps.sqlite.prepare('DELETE FROM worker_skill WHERE skill_id=?').run(id);
    this.deps.sqlite.prepare('DELETE FROM skill WHERE id=?').run(id);

    this.deps.audit(principal, 'skill.delete', 'skill', id, { code: existing.code });
  }

  listWorkerSkills(principal: Principal, workerId?: string) {
    this.deps.assertReadable(principal);
    const target = workerId ?? principal.userId;
    if (principal.role === 'worker' && target !== principal.userId)
      throw this.deps.errors.accessDenied('Worker skill privacy required');
    if (principal.role === 'project_manager' && principal.userId !== target) {
      const ids = [...principal.projectIds];
      if (
        ids.length === 0 ||
        !this.deps.sqlite
          .prepare(
            `SELECT 1
             FROM project_member pm JOIN user u ON u.id=pm.user_id
             WHERE pm.user_id=? AND pm.status='active' AND u.status='active'
               AND u.role IN ('worker','project_manager')
               AND pm.project_id IN (${ids.map(() => '?').join(',')})
               AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1`,
          )
          .get(target, ...ids, this.today(), this.today())
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
    this.assertWorkforceWrite(principal);
    if (
      !this.deps.sqlite
        .prepare(
          "SELECT 1 FROM user WHERE id=? AND status='active' AND role IN ('worker','project_manager')",
        )
        .get(input.workerId)
    )
      throw this.deps.errors.validation('Active worker not found');
    if (principal.role === 'worker' && principal.userId !== input.workerId)
      throw this.deps.errors.accessDenied('Worker availability ownership required');
    // D5/T43: finance never writes someone else's availability; a project
    // manager only for workers on a project he manages (the project's
    // designated manager), not on every project he is merely a member of.
    if (principal.role === 'finance_admin' && principal.userId !== input.workerId)
      throw this.deps.errors.accessDenied('Worker availability ownership required');
    if (principal.role === 'project_manager' && principal.userId !== input.workerId) {
      const assigned = [...principal.projectIds].some(
        (projectId) =>
          Boolean(
            this.deps.sqlite
              .prepare('SELECT 1 FROM project WHERE id=? AND project_manager_id=?')
              .get(projectId, principal.userId),
          ) &&
          this.effectiveLaborAssignment(projectId, principal.userId) &&
          this.effectiveLaborAssignment(projectId, input.workerId),
      );
      if (!assigned)
        throw this.deps.errors.accessDenied('Worker availability is outside the project scope');
    }
    if (
      (input.id !== undefined) !== (input.version !== undefined) ||
      (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 1))
    )
      throw this.deps.errors.validation('Availability id and version are required together');
    const startsAt = Date.parse(input.startsAt);
    const endsAt = Date.parse(input.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt))
      throw this.deps.errors.validation('Availability dates must be valid');
    if (endsAt <= startsAt) throw this.deps.errors.validation('Availability end must follow start');
    const note = input.note?.trim() || null;
    return this.deps.transaction(() => {
      const timestamp = this.deps.now();
      if (input.id !== undefined) {
        const existing = this.deps.sqlite
          .prepare(
            'SELECT id,worker_id,starts_at,ends_at,availability,note,version FROM worker_availability WHERE id=?',
          )
          .get(input.id) as
          | {
              id: string;
              worker_id: string;
              starts_at: string;
              ends_at: string;
              availability: string;
              note: string | null;
              version: number;
            }
          | undefined;
        if (!existing || existing.worker_id !== input.workerId)
          throw this.deps.errors.accessDenied('Worker availability ownership required');
        if (existing.version !== input.version)
          throw this.deps.errors.conflict('Availability changed before update');
        const changed = this.deps.sqlite
          .prepare(
            'UPDATE worker_availability SET starts_at=?,ends_at=?,availability=?,note=?,updated_at=?,version=version+1 WHERE id=? AND worker_id=? AND version=?',
          )
          .run(
            input.startsAt,
            input.endsAt,
            input.availability,
            note,
            timestamp,
            input.id,
            input.workerId,
            existing.version,
          );
        if (changed.changes !== 1)
          throw this.deps.errors.conflict('Availability changed before update');
        const after = {
          ...existing,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          availability: input.availability,
          note,
          version: existing.version + 1,
        };
        this.deps.audit(principal, 'worker_availability.update', 'worker_availability', input.id, {
          before: existing,
          after,
        });
        return { id: input.id, version: after.version };
      }
      const id = newId();
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
          note,
          timestamp,
          timestamp,
        );
      this.deps.audit(principal, 'worker_availability.create', 'worker_availability', id, {
        workerId: input.workerId,
        availability: input.availability,
      });
      return { id, version: 1 };
    });
  }

  listWorkerAvailability(principal: Principal, workerId?: string) {
    this.deps.assertReadable(principal);
    const target = workerId ?? principal.userId;
    if (principal.role === 'worker' && target !== principal.userId)
      throw this.deps.errors.accessDenied('Worker availability privacy required');
    if (principal.role === 'project_manager' && principal.userId !== target) {
      const ids = [...principal.projectIds];
      if (
        ids.length === 0 ||
        !this.deps.sqlite
          .prepare(
            `SELECT 1
             FROM project_member pm JOIN user u ON u.id=pm.user_id
             WHERE pm.user_id=? AND pm.status='active' AND u.status='active'
               AND u.role IN ('worker','project_manager')
               AND pm.project_id IN (${ids.map(() => '?').join(',')})
               AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1`,
          )
          .get(target, ...ids, this.today(), this.today())
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
    return this.deps.transaction(() => {
      const project = this.deps.sqlite
        .prepare('SELECT name,status FROM project WHERE id=?')
        .get(input.projectId) as { name: string; status: string } | undefined;
      // A status transition removes this project from a manager's current
      // principal scope. Retain only the manager's own effective membership as
      // read authority for the precise lifecycle blocker; it grants no write.
      const managerMembership =
        principal.role === 'project_manager' &&
        Boolean(
          this.deps.sqlite
            .prepare(
              `SELECT 1 FROM project_member pm
               JOIN user u ON u.id=pm.user_id
               WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
                 AND u.status='active' AND u.role='project_manager'
                 AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
               LIMIT 1`,
            )
            .get(input.projectId, principal.userId, this.today(), this.today()),
        );
      if (principal.role !== 'owner_admin' && !managerMembership)
        throw this.deps.errors.accessDenied('Assignment administration required');
      if (!project) throw this.deps.errors.validation('Project not found');
      if (!['active', 'planned', 'paused'].includes(project.status)) {
        try {
          this.deps.errors.conflict(
            'Assignments are only allowed on active, planned, or paused projects',
          );
        } catch (error) {
          if (error instanceof Error)
            Object.assign(error, {
              code: 'PROJECT_ASSIGNMENT_BLOCKED_STATUS',
              projectId: input.projectId,
              projectName: project.name,
              status: project.status,
            });
          throw error;
        }
      }
      this.assertPrincipalProjectScope(principal, input.projectId);

      assertPlannedMinutes(input.plannedMinutes, this.deps.errors.validation);
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
      const overlap = this.deps.sqlite
        .prepare(
          `SELECT id,starts_on startsOn,ends_on endsOn FROM project_member
           WHERE project_id=? AND user_id=?
             AND (status='active' OR (status='inactive' AND ends_on IS NOT NULL AND ends_on>=starts_on))
             AND (? IS NULL OR starts_on<=?)
             AND (ends_on IS NULL OR ends_on>=?)
           LIMIT 1`,
        )
        .get(
          input.projectId,
          input.workerId,
          input.endsOn || null,
          input.endsOn || null,
          input.startsOn,
        ) as { id: string; startsOn: string | null; endsOn: string | null } | undefined;
      if (overlap) {
        try {
          this.deps.errors.conflict('Worker already has an overlapping project assignment');
        } catch (error) {
          if (error instanceof Error)
            Object.assign(error, {
              code: 'PROJECT_ASSIGNMENT_OVERLAP',
              projectId: input.projectId,
              workerId: input.workerId,
              existingAssignmentId: overlap.id,
              existingStartsOn: overlap.startsOn,
              existingEndsOn: overlap.endsOn,
            });
          throw error;
        }
      }
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
          input.endsOn || null,
          input.plannedMinutes ?? null,
          input.canReview ? 1 : 0,
          'active',
          timestamp,
          timestamp,
        );
      this.deps.audit(principal, 'assignment.create', 'project_member', id, input);
      return { id };
    });
  }

  private assertAssignmentSourceDates(
    existing: AssignmentRow,
    startsOn: string,
    endsOn: string | null,
  ): void {
    const excluded = this.deps.sqlite
      .prepare(
        `SELECT 1 FROM (
           -- Rejected hours are not recorded work (T19): they never hold an
           -- assignment open.
           SELECT work_date source_date FROM time_entry
            WHERE project_id=? AND worker_id=? AND approval_state NOT IN ('void','rejected')
           UNION ALL
           SELECT spent_on source_date FROM expense
            WHERE project_id=? AND worker_id=? AND approval_state<>'void'
           UNION ALL
           SELECT work_date source_date FROM daily_report
            WHERE project_id=? AND worker_id=? AND approval_state<>'void'
           UNION ALL
           SELECT report_date source_date FROM technical_report
            WHERE project_id=? AND author_id=? AND approval_state<>'void'
         ) sources
         WHERE source_date>=? AND (? IS NULL OR source_date<=?)
           AND (source_date<? OR (? IS NOT NULL AND source_date>?)) LIMIT 1`,
      )
      .get(
        existing.project_id,
        existing.user_id,
        existing.project_id,
        existing.user_id,
        existing.project_id,
        existing.user_id,
        existing.project_id,
        existing.user_id,
        existing.starts_on,
        existing.ends_on,
        existing.ends_on,
        startsOn,
        endsOn,
        endsOn,
      );
    if (excluded)
      throw this.deps.errors.conflict(
        'Assignment dates cannot exclude recorded time, expenses, or reports',
      );
  }

  updateAssignment(
    principal: Principal,
    id: string,
    input: {
      startsOn?: string;
      endsOn?: string;
      plannedMinutes?: number;
      canReview?: boolean;
      version: number;
    },
  ) {
    this.deps.assertActive(principal);
    if (!Number.isInteger(input.version) || input.version < 1)
      throw this.deps.errors.validation('Assignment version is required');
    return this.deps.transaction(() => {
      const existing = this.deps.sqlite
        .prepare('SELECT * FROM project_member WHERE id=?')
        .get(id) as AssignmentRow | undefined;
      if (!existing) throw this.deps.errors.validation('Assignment not found');

      if (existing.status !== 'active')
        throw this.deps.errors.conflict('Only active assignments can be edited');
      if (input.version !== undefined && input.version !== existing.version)
        throw this.deps.errors.conflict('Assignment changed before update');

      if (!canManageAssignments(principal, existing.project_id))
        throw this.deps.errors.accessDenied('Assignment administration required');
      this.assertPrincipalProjectScope(principal, existing.project_id);
      if (principal.role === 'project_manager' && isSupplierStaff(this.deps.sqlite, existing.user_id))
        throw this.deps.errors.accessDenied('Supplier staff assignments are managed by the owner');

      assertPlannedMinutes(input.plannedMinutes, this.deps.errors.validation);
      const startsOn = input.startsOn !== undefined ? input.startsOn : existing.starts_on;
      const endsOn = input.endsOn !== undefined ? input.endsOn || null : existing.ends_on;
      const plannedMinutes =
        input.plannedMinutes !== undefined
          ? input.plannedMinutes || null
          : existing.planned_minutes;
      const canReview =
        input.canReview !== undefined ? (input.canReview ? 1 : 0) : existing.can_review;

      assertDate(startsOn, 'Start date', this.deps.errors.validation);
      if (endsOn) assertDate(endsOn, 'End date', this.deps.errors.validation);
      if (endsOn && endsOn < startsOn)
        throw this.deps.errors.validation('Assignment end date must follow the start date');
      this.assertAssignmentSourceDates(existing, startsOn, endsOn);
      const overlap = this.deps.sqlite
        .prepare(
          `SELECT id FROM project_member
           WHERE project_id=? AND user_id=? AND id<>?
             AND (status='active' OR (status='inactive' AND ends_on IS NOT NULL AND ends_on>=starts_on))
             AND (? IS NULL OR starts_on<=?)
             AND (ends_on IS NULL OR ends_on>=?)
           LIMIT 1`,
        )
        .get(existing.project_id, existing.user_id, id, endsOn, endsOn, startsOn) as
        | { id: string }
        | undefined;
      if (overlap) {
        try {
          this.deps.errors.conflict('Worker already has an overlapping project assignment');
        } catch (error) {
          if (error instanceof Error)
            Object.assign(error, {
              code: 'PROJECT_ASSIGNMENT_OVERLAP',
              projectId: existing.project_id,
              workerId: existing.user_id,
              existingAssignmentId: overlap.id,
            });
          throw error;
        }
      }

      const changed = this.deps.sqlite
        .prepare(
          'UPDATE project_member SET starts_on=?, ends_on=?, planned_minutes=?, can_review=?, updated_at=?, version=version+1 WHERE id=? AND status=? AND version=?',
        )
        .run(
          startsOn,
          endsOn,
          plannedMinutes,
          canReview,
          this.deps.now(),
          id,
          'active',
          existing.version,
        );
      if (changed.changes !== 1)
        throw this.deps.errors.conflict('Assignment changed before update');

      this.deps.audit(principal, 'assignment.update', 'project_member', id, {
        version: existing.version,
      });
    });
  }

  removeAssignment(principal: Principal, id: string, input: AssignmentRemovalInput) {
    this.deps.assertActive(principal);
    return this.deps.transaction(() => {
      const existing = this.deps.sqlite
        .prepare('SELECT * FROM project_member WHERE id=?')
        .get(id) as AssignmentRow | undefined;
      if (!existing) throw this.deps.errors.validation('Assignment not found');
      if (existing.status !== 'active')
        throw this.deps.errors.conflict('Assignment is already inactive');
      if (input.version !== undefined && input.version !== existing.version)
        throw this.deps.errors.conflict('Assignment changed before removal');

      if (!canManageAssignments(principal, existing.project_id))
        throw this.deps.errors.accessDenied('Assignment administration required');
      this.assertPrincipalProjectScope(principal, existing.project_id);
      // D5/T42: supplier staff assignments are ended by the owner (or the
      // supplier's own authorization), never by a project manager.
      if (principal.role === 'project_manager' && isSupplierStaff(this.deps.sqlite, existing.user_id))
        throw this.deps.errors.accessDenied('Supplier staff assignments are managed by the owner');

      const reason = this.deps.assertText(input.reason, 'Removal reason', 2000);
      const today = this.today();
      const requestedEnd = input.endsOn?.trim() || null;
      const startsBeforeToday = existing.starts_on <= today;
      if (requestedEnd) {
        assertDate(requestedEnd, 'Assignment end date', this.deps.errors.validation);
        if (requestedEnd > today)
          throw this.deps.errors.validation('Immediate removal cannot use a future end date');
      }
      // Cancelling an assignment before it starts leaves an empty date interval.
      // Historical finance selection must never treat it as a worked assignment.
      const effectiveEnd = startsBeforeToday
        ? requestedEnd || (existing.ends_on && existing.ends_on <= today ? existing.ends_on : today)
        : today;
      assertDate(effectiveEnd, 'Assignment end date', this.deps.errors.validation);
      if (startsBeforeToday && effectiveEnd > today)
        throw this.deps.errors.validation('Immediate removal cannot use a future end date');
      if (startsBeforeToday && effectiveEnd < existing.starts_on)
        throw this.deps.errors.validation('Assignment end date must follow the start date');
      const resolvedLaterTime = input.resolveLaterTime
        ? this.resolveTimeAfterEnd(principal, existing, startsBeforeToday ? effectiveEnd : null, reason)
        : { discarded: 0, rejected: 0 };
      try {
        this.assertAssignmentSourceDates(existing, existing.starts_on, effectiveEnd);
      } catch (error) {
        if (error instanceof Error)
          Object.assign(error, {
            resolvableLaterTime: this.resolvableTimeAfterEnd(
              existing,
              startsBeforeToday ? effectiveEnd : null,
            ),
          });
        throw error;
      }

      const changed = this.deps.sqlite
        .prepare(
          "UPDATE project_member SET status='inactive',ends_on=?,updated_at=?,version=version+1 WHERE id=? AND status='active' AND version=?",
        )
        .run(effectiveEnd, this.deps.now(), id, existing.version);
      if (changed.changes !== 1)
        throw this.deps.errors.conflict('Assignment changed before removal');
      this.deps.audit(principal, 'assignment.delete', 'project_member', id, {
        operation: 'remove',
        projectId: existing.project_id,
        workerId: existing.user_id,
        endsOn: effectiveEnd,
        cancelBeforeStart: !startsBeforeToday,
        reason,
        ...(input.resolveLaterTime ? { resolvedLaterTime } : {}),
      });
      return resolvedLaterTime;
    });
  }

  /** Unapproved, unlocked time of this assignment after the new end (null = whole assignment). */
  private laterTimeRows(existing: AssignmentRow, end: string | null) {
    return this.deps.sqlite
      .prepare(
        `SELECT t.id,t.approval_state,t.version FROM time_entry t
          WHERE t.project_id=? AND t.worker_id=? AND t.work_date>=?
            AND (? IS NULL OR t.work_date<=?)
            AND (? IS NULL OR t.work_date>?)
            AND t.approval_state IN ('draft','submitted','needs_changes')
            AND t.invoice_id IS NULL AND t.billing_status='unlocked'
            AND t.billing_lock_id IS NULL AND t.locked_at IS NULL
            AND t.finance_approved_at IS NULL
            AND NOT EXISTS(SELECT 1 FROM invoice_source s WHERE s.source_type='time' AND s.source_id=t.id)
          ORDER BY t.work_date,t.id`,
      )
      .all(
        existing.project_id,
        existing.user_id,
        existing.starts_on,
        existing.ends_on,
        existing.ends_on,
        end,
        end,
      ) as { id: string; approval_state: string; version: number }[];
  }

  private resolvableTimeAfterEnd(existing: AssignmentRow, end: string | null): number {
    return this.laterTimeRows(existing, end).length;
  }

  private resolveTimeAfterEnd(
    principal: Principal,
    existing: AssignmentRow,
    end: string | null,
    reason: string,
  ): { discarded: number; rejected: number } {
    let discarded = 0;
    let rejected = 0;
    const timestamp = this.deps.now();
    for (const row of this.laterTimeRows(existing, end)) {
      const toState = row.approval_state === 'draft' ? 'void' : 'rejected';
      const changed = this.deps.sqlite
        .prepare(
          `UPDATE time_entry SET approval_state=?,updated_at=?,version=version+1
            WHERE id=? AND version=? AND approval_state=? AND invoice_id IS NULL
              AND billing_status='unlocked' AND billing_lock_id IS NULL AND locked_at IS NULL`,
        )
        .run(toState, timestamp, row.id, row.version, row.approval_state);
      if (changed.changes !== 1)
        throw this.deps.errors.conflict('Assignment changed before removal');
      this.deps.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'time',
          row.id,
          row.approval_state,
          toState,
          principal.userId,
          `Assignment ended: ${reason}`,
          timestamp,
        );
      this.deps.audit(principal, toState === 'void' ? 'time.void' : 'time.rejected', 'time_entry', row.id, {
        version: row.version,
        operation: 'assignment_end',
        assignmentId: existing.id,
        reason,
      });
      if (toState === 'void') discarded++;
      else rejected++;
    }
    return { discarded, rejected };
  }

  deleteAssignment(principal: Principal, id: string): void {
    this.removeAssignment(principal, id, {
      reason: 'Removed by an authorized administrator',
    });
  }

  /** Migration 0081 added the assignment PO; older schemas (upgrade tests) read NULL. */
  private poColumn(): boolean {
    return Boolean(
      this.deps.sqlite.prepare("SELECT 1 FROM pragma_table_info('project_member') WHERE name='po_number'").get(),
    );
  }

  listAssignments(principal: Principal) {
    this.deps.assertReadable(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'auditor_read_only' &&
      principal.role !== 'project_manager'
    )
      throw this.deps.errors.accessDenied('Assignment administration required');
    const projectIds = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    if (principal.role === 'project_manager' && projectIds.length === 0) return [];
    const scope = projectIds.length
      ? ` AND p.status IN ('active','planned','paused') AND pm.project_id IN (${projectIds.map(() => '?').join(',')})`
      : '';
    return this.deps.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.user_id,pm.assignment_role,pm.starts_on,pm.ends_on,
                pm.planned_minutes,pm.can_review,pm.status,pm.version,
                ${this.poColumn() ? 'pm.po_number' : 'NULL po_number'},
                p.project_number,p.name project_name,u.name worker_name,u.email worker_email
         FROM project_member pm
         JOIN project p ON p.id=pm.project_id
         JOIN user u ON u.id=pm.user_id
         WHERE 1=1${scope}
         ORDER BY pm.status='active' DESC,pm.starts_on DESC,p.project_number,u.name`,
      )
      .all(...projectIds);
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
    if (principal.role === 'project_manager' || principal.role === 'auditor_read_only')
      return this.listScopedLaborWorkers(principal);
    return this.deps.sqlite
      .prepare(
        "SELECT id,name,email,role,status,created_at,offboarded_at FROM user WHERE status='active' AND role IN ('worker','project_manager') ORDER BY name,email",
      )
      .all();
  }

  listAllWorkers(principal: Principal) {
    this.deps.assertReadable(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'project_manager' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'auditor_read_only'
    )
      throw this.deps.errors.accessDenied('Worker administration required');
    if (principal.role === 'project_manager' || principal.role === 'auditor_read_only')
      return this.listScopedLaborWorkers(principal);
    return this.deps.sqlite
      .prepare(
        "SELECT id,name,email,role,status,created_at,offboarded_at FROM user WHERE role != 'client' ORDER BY name,email",
      )
      .all();
  }

  updateWorkerProfile(
    principal: Principal,
    workerId: string,
    data: { name: string; email: string; role: string; joinedAt: string },
  ) {
    this.deps.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw this.deps.errors.accessDenied('Only owner admin can modify worker profiles');
    if (!roles.includes(data.role as (typeof roles)[number]))
      throw this.deps.errors.validation('Worker role is not allowed');
    const existing = this.deps.sqlite
      .prepare('SELECT role,status,created_at FROM user WHERE id=?')
      .get(workerId) as { role: string; status: string; created_at: string } | undefined;
    if (!existing) throw this.deps.errors.validation('Worker not found');
    if (existing.role === 'owner_admin' && data.role !== 'owner_admin') {
      const ownerCount = this.deps.sqlite
        .prepare("SELECT COUNT(*) AS count FROM user WHERE role='owner_admin' AND status='active'")
        .get() as { count: number };
      if (ownerCount.count <= 1)
        throw this.deps.errors.conflict('The last active owner cannot be demoted');
    }
    const name = this.deps.assertText(data.name, 'Worker name', 160);
    const email = this.deps.assertText(data.email, 'Worker email', 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw this.deps.errors.validation('Worker email is invalid');
    // created_at is historical provenance. The legacy joinedAt form value is
    // intentionally ignored so profile editing cannot rewrite that history.
    return this.deps.transaction(() => {
      const timestamp = this.deps.now();
      const result = this.deps.sqlite
        .prepare('UPDATE user SET name=?,email=?,role=?,updated_at=? WHERE id=?')
        .run(name, email, data.role, timestamp, workerId);
      if (result.changes !== 1) throw this.deps.errors.conflict('Worker profile was not updated');

      // The authenticated principal carries the role resolved when the session
      // was created. Revoke every target session on a role change so a demoted
      // Finance/Owner account cannot keep stale privileges until expiry.
      if (existing.role !== data.role)
        this.deps.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(workerId);

      this.deps.audit(principal, 'worker.update', 'user', workerId, {
        name,
        email,
        role: data.role,
        previousRole: existing.role,
        sessionsRevoked: existing.role !== data.role,
      });
    });
  }
}

function assertDate(value: string, field: string, validation: ErrorFactory): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
  if (!date || date.toISOString().slice(0, 10) !== value)
    throw validation(`${field} must be an ISO date`);
}

function assertPlannedMinutes(value: number | undefined, validation: ErrorFactory): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
    throw validation('Planned minutes must be a non-negative safe integer');
}
