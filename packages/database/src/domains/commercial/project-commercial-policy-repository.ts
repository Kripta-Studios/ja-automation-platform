import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';

type ErrorFactory = (message: string) => never;

export type ProjectCommercialPolicyInput = Readonly<{
  projectId: string;
  effectiveFrom: string;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
  customerSignoffRequired: boolean;
}>;

export type ProjectCommercialPolicy = Readonly<{
  id: string;
  projectId: string;
  supersedesPolicyId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
  customerSignoffRequired: boolean;
  createdBy: string;
  version: number;
}>;

type ProjectCommercialPolicyRow = Readonly<{
  id: string;
  project_id: string;
  supersedes_policy_id: string | null;
  effective_from: string;
  effective_to: string | null;
  overtime_enabled: number;
  overtime_threshold_minutes: number | null;
  travel_client_billable: number;
  customer_signoff_required: number;
  created_by: string;
  version: number;
}>;

export type ProjectCommercialPolicyRepositoryDependencies = Readonly<{
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
  errors: Readonly<{
    accessDenied: ErrorFactory;
    conflict: ErrorFactory;
    validation: ErrorFactory;
  }>;
}>;

function assertIsoDate(value: string, field: string, validation: ErrorFactory): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return validation(`${field} must be an ISO date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    return validation(`${field} must be an ISO date`);
}

function assertProjectId(value: string, validation: ErrorFactory): void {
  if (typeof value !== 'string' || !value.trim()) return validation('Project id is required');
}

function mapPolicy(row: ProjectCommercialPolicyRow): ProjectCommercialPolicy {
  return {
    id: row.id,
    projectId: row.project_id,
    supersedesPolicyId: row.supersedes_policy_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    overtimeEnabled: row.overtime_enabled === 1,
    overtimeThresholdMinutes: row.overtime_threshold_minutes,
    travelClientBillable: row.travel_client_billable === 1,
    customerSignoffRequired: row.customer_signoff_required === 1,
    createdBy: row.created_by,
    version: row.version,
  };
}

function isSqliteConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /commercial policy|UNIQUE constraint|FOREIGN KEY constraint|constraint failed/iu.test(
      error.message,
    )
  );
}

export class ProjectCommercialPolicyRepository {
  private readonly deps: ProjectCommercialPolicyRepositoryDependencies;

  constructor(deps: ProjectCommercialPolicyRepositoryDependencies) {
    this.deps = deps;
  }

  private assertCanWrite(principal: Principal): void {
    this.deps.assertActive(principal);
    if (!canManageBilling(principal)) return this.deps.errors.accessDenied('Finance role required');
  }

  private assertCanRead(principal: Principal): void {
    this.deps.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      return this.deps.errors.accessDenied('Finance role required');
  }

  private assertProjectExists(projectId: string): void {
    if (!this.deps.sqlite.prepare('SELECT 1 FROM project WHERE id=?').get(projectId))
      return this.deps.errors.validation('Project not found');
  }

  private assertPolicyInput(input: ProjectCommercialPolicyInput): void {
    const { validation } = this.deps.errors;
    assertProjectId(input.projectId, validation);
    assertIsoDate(input.effectiveFrom, 'Effective from', validation);
    if (typeof input.overtimeEnabled !== 'boolean')
      return validation('Overtime enabled must be a boolean');
    if (input.overtimeEnabled) {
      if (
        !Number.isInteger(input.overtimeThresholdMinutes) ||
        input.overtimeThresholdMinutes === null ||
        input.overtimeThresholdMinutes < 1 ||
        input.overtimeThresholdMinutes > 1440
      )
        return validation('Overtime threshold is required when overtime is enabled');
    } else if (input.overtimeThresholdMinutes !== null) {
      return validation('Overtime threshold must be null when overtime is disabled');
    }
    if (typeof input.travelClientBillable !== 'boolean')
      return validation('Travel client billability must be a boolean');
    if (typeof input.customerSignoffRequired !== 'boolean')
      return validation('Customer sign-off requirement must be a boolean');
  }

  createProjectCommercialPolicy(
    principal: Principal,
    input: ProjectCommercialPolicyInput,
  ): ProjectCommercialPolicy {
    this.assertCanWrite(principal);
    this.assertPolicyInput(input);
    return this.deps.transaction(() => {
      this.assertProjectExists(input.projectId);
      const tail = this.deps.sqlite
        .prepare(
          `SELECT id, effective_from, version
           FROM project_commercial_policy
           WHERE project_id=?
             AND NOT EXISTS(
               SELECT 1 FROM project_commercial_policy successor
               WHERE successor.supersedes_policy_id=project_commercial_policy.id
             )
           ORDER BY version DESC, effective_from DESC, id DESC
           LIMIT 1`,
        )
        .get(input.projectId) as
        | { id: string; effective_from: string; version: number }
        | undefined;
      if (tail && input.effectiveFrom <= tail.effective_from)
        return this.deps.errors.conflict(
          'Commercial policy effective date must follow the current policy tail',
        );

      const id = newId();
      const version = tail ? tail.version + 1 : 1;
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO project_commercial_policy(
               id,project_id,supersedes_policy_id,effective_from,effective_to,
               overtime_enabled,overtime_threshold_minutes,travel_client_billable,
               customer_signoff_required,created_by,created_at,version
             ) VALUES(?,?,?,?,NULL,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            input.projectId,
            tail?.id ?? null,
            input.effectiveFrom,
            input.overtimeEnabled ? 1 : 0,
            input.overtimeThresholdMinutes,
            input.travelClientBillable ? 1 : 0,
            input.customerSignoffRequired ? 1 : 0,
            principal.userId,
            this.deps.now(),
            version,
          );
      } catch (error) {
        if (isSqliteConflict(error))
          return this.deps.errors.conflict(
            'Commercial policy changed or overlaps the current tail',
          );
        throw error;
      }
      const row = this.deps.sqlite
        .prepare(
          `SELECT id,project_id,supersedes_policy_id,effective_from,effective_to,
                  overtime_enabled,overtime_threshold_minutes,travel_client_billable,
                  customer_signoff_required,created_by,version
           FROM project_commercial_policy WHERE id=?`,
        )
        .get(id) as ProjectCommercialPolicyRow | undefined;
      if (!row) return this.deps.errors.conflict('Commercial policy was not created');
      const policy = mapPolicy(row);
      this.deps.audit(
        principal,
        'project_commercial_policy.create',
        'project_commercial_policy',
        policy.id,
        {
          projectId: input.projectId,
          commercialPolicyId: policy.id,
          commercialPolicyVersion: policy.version,
          effectiveFrom: policy.effectiveFrom,
          overtimeEnabled: policy.overtimeEnabled,
          overtimeThresholdMinutes: policy.overtimeThresholdMinutes,
          travelClientBillable: policy.travelClientBillable,
          customerSignoffRequired: policy.customerSignoffRequired,
        },
      );
      return policy;
    });
  }

  listProjectCommercialPolicies(
    principal: Principal,
    projectId: string,
  ): readonly ProjectCommercialPolicy[] {
    this.assertCanRead(principal);
    assertProjectId(projectId, this.deps.errors.validation);
    this.assertProjectExists(projectId);
    const rows = this.deps.sqlite
      .prepare(
        `SELECT id,project_id,supersedes_policy_id,effective_from,effective_to,
                overtime_enabled,overtime_threshold_minutes,travel_client_billable,
                customer_signoff_required,created_by,version
         FROM project_commercial_policy
         WHERE project_id=?
         ORDER BY version ASC, effective_from ASC, id ASC`,
      )
      .all(projectId) as ProjectCommercialPolicyRow[];
    return rows.map(mapPolicy);
  }

  resolveProjectCommercialPolicy(
    principal: Principal,
    projectId: string,
    onDate: string,
  ): ProjectCommercialPolicy {
    this.assertCanRead(principal);
    assertProjectId(projectId, this.deps.errors.validation);
    assertIsoDate(onDate, 'Policy date', this.deps.errors.validation);
    this.assertProjectExists(projectId);
    const row = this.deps.sqlite
      .prepare(
        `SELECT id,project_id,supersedes_policy_id,effective_from,effective_to,
                overtime_enabled,overtime_threshold_minutes,travel_client_billable,
                customer_signoff_required,created_by,version
         FROM project_commercial_policy
         WHERE project_id=? AND effective_from<=?
         ORDER BY effective_from DESC, version DESC, id DESC
         LIMIT 1`,
      )
      .get(projectId, onDate) as ProjectCommercialPolicyRow | undefined;
    if (!row) return this.deps.errors.validation('No commercial policy is effective on this date');
    return mapPolicy(row);
  }
}
