import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';

type TechnicalChangeDecision = 'approved' | 'needs_changes' | 'rejected';

export type TechnicalChangeInput = Readonly<{
  projectId: string;
  technicalReportId?: string;
  component: string;
  originalBehavior?: string;
  rootCause?: string;
  changeMade: string;
  reason?: string;
  safetyImpact?: boolean;
  productionImpact?: string;
  validation?: string;
  validationResult?: string;
  openRisk?: string;
  rollbackInformation?: string;
}>;

type TechnicalChangeErrorFactories = Readonly<{
  accessDenied: (message: string) => Error;
  conflict: (message: string) => Error;
  validation: (message: string) => Error;
}>;

export type TechnicalChangeRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  audit: (
    principal: Principal | null,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ) => void;
  assertActive: (principal: Principal) => void;
  assertWritable: (principal: Principal) => void;
  assertProjectAccess: (principal: Principal, projectId: string) => void;
  canReviewProject: (principal: Principal, projectId: string) => boolean;
  newId: () => string;
  timestamp: () => string;
  requireText: (value: string, field: string, max?: number) => string;
  errors: TechnicalChangeErrorFactories;
}>;

export class TechnicalChangeRepository {
  private readonly deps: TechnicalChangeRepositoryDependencies;

  constructor(deps: TechnicalChangeRepositoryDependencies) {
    this.deps = deps;
  }

  createTechnicalChange(
    principal: Principal,
    input: TechnicalChangeInput,
  ): { id: string; version: number } {
    this.deps.assertWritable(principal);
    this.deps.assertProjectAccess(principal, input.projectId);
    const component = this.deps.requireText(input.component, 'Component', 200);
    const changeMade = this.deps.requireText(input.changeMade, 'Change made');
    if (input.safetyImpact && (!input.validation?.trim() || !input.rollbackInformation?.trim()))
      throw this.deps.errors.validation(
        'Safety-impacting changes require validation and rollback information',
      );
    if (input.technicalReportId) {
      const report = this.deps.sqlite
        .prepare('SELECT project_id FROM technical_report WHERE id=?')
        .get(input.technicalReportId) as { project_id: string } | undefined;
      if (!report || report.project_id !== input.projectId)
        throw this.deps.errors.validation('Technical report does not belong to the project');
    }
    const id = this.deps.newId();
    const now = this.deps.timestamp();
    this.deps.sqlite
      .prepare(
        `INSERT INTO technical_change(
          id,project_id,technical_report_id,author_id,component,original_behavior,root_cause,
          change_made,reason,safety_impact,production_impact,validation,validation_result,
          open_risk,rollback_information,approval_state,created_at,updated_at,version
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        input.technicalReportId || null,
        principal.userId,
        component,
        input.originalBehavior ?? null,
        input.rootCause ?? null,
        changeMade,
        input.reason ?? null,
        input.safetyImpact ? 1 : 0,
        input.productionImpact ?? null,
        input.validation ?? null,
        input.validationResult ?? null,
        input.openRisk ?? null,
        input.rollbackInformation ?? null,
        'draft',
        now,
        now,
        1,
      );
    this.deps.audit(principal, 'technical_change.create', 'technical_change', id, {
      projectId: input.projectId,
      safetyImpact: Boolean(input.safetyImpact),
    });
    return { id, version: 1 };
  }

  submitTechnicalChange(principal: Principal, id: string, version: number): void {
    this.deps.assertWritable(principal);
    this.deps.transaction(() => {
      const row = this.deps.sqlite
        .prepare(
          `SELECT tc.project_id,COALESCE(tr.report_date,substr(tc.created_at,1,10)) business_date,
                  p.status project_status
             FROM technical_change tc
             JOIN project p ON p.id=tc.project_id
             LEFT JOIN technical_report tr ON tr.id=tc.technical_report_id
            WHERE tc.id=? AND tc.author_id=?`,
        )
        .get(id, principal.userId) as
        | { project_id: string; business_date: string; project_status: string }
        | undefined;
      if (!row) throw this.deps.errors.accessDenied('Technical change submission access required');
      if (row.project_status !== 'active')
        throw this.deps.errors.accessDenied(
          'Active project required for technical change submission',
        );
      if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin') {
        const assignment = this.deps.sqlite
          .prepare(
            `SELECT 1 FROM project_member
              WHERE project_id=? AND user_id=? AND status='active'
                AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)`,
          )
          .get(row.project_id, principal.userId, row.business_date, row.business_date);
        if (!assignment)
          throw this.deps.errors.accessDenied(
            'Effective project assignment required for technical change submission',
          );
      }
      const result = this.deps.sqlite
        .prepare(
          "UPDATE technical_change SET approval_state='submitted',updated_at=?,version=version+1 WHERE id=? AND author_id=? AND approval_state IN ('draft','needs_changes') AND version=?",
        )
        .run(this.deps.timestamp(), id, principal.userId, version);
      if (result.changes !== 1)
        throw this.deps.errors.conflict('Technical change changed or cannot be submitted');
      this.deps.audit(principal, 'technical_change.submit', 'technical_change', id, { version });
    });
  }

  reviewTechnicalChange(
    principal: Principal,
    id: string,
    decision: TechnicalChangeDecision,
    reason?: string,
  ): void {
    if (decision !== 'approved' && !reason?.trim())
      throw this.deps.errors.validation('A review reason is required');
    this.deps.transaction(() => {
      this.deps.assertActive(principal);
      const row = this.deps.sqlite
        .prepare(
          `SELECT tc.project_id,tc.author_id,tc.approval_state,tc.safety_impact,
                  tc.validation,tc.rollback_information,p.status project_status
             FROM technical_change tc
             JOIN project p ON p.id=tc.project_id
            WHERE tc.id=?`,
        )
        .get(id) as
        | {
            project_id: string;
            author_id: string;
            approval_state: string;
            safety_impact: number;
            validation: string | null;
            rollback_information: string | null;
            project_status: string;
          }
        | undefined;
      if (!row) throw this.deps.errors.validation('Technical change not found');
      if (!this.deps.canReviewProject(principal, row.project_id))
        throw this.deps.errors.accessDenied('Technical change review required');
      if (row.project_status !== 'active')
        throw this.deps.errors.accessDenied('Active project required for technical change review');
      if (row.approval_state !== 'submitted')
        throw this.deps.errors.conflict('Technical change is not submitted');
      if (
        decision === 'approved' &&
        row.safety_impact === 1 &&
        (!row.validation?.trim() || !row.rollback_information?.trim())
      )
        throw this.deps.errors.validation(
          'Safety-impacting changes cannot be approved without validation and rollback information',
        );
      const now = this.deps.timestamp();
      const result = this.deps.sqlite
        .prepare(
          "UPDATE technical_change SET approval_state=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='submitted' AND project_id=?",
        )
        .run(decision, now, id, row.project_id);
      if (result.changes !== 1)
        throw this.deps.errors.conflict('Technical change is not submitted');
      this.deps.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          this.deps.newId(),
          'technical_change',
          id,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          now,
        );
      this.deps.sqlite
        .prepare(
          'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(this.deps.newId(), row.author_id, `technical_change_${decision}`, id, now);
      this.deps.audit(principal, `technical_change.${decision}`, 'technical_change', id, {
        reason: reason ?? null,
        safetyImpact: Boolean(row.safety_impact),
      });
    });
  }

  listTechnicalChanges(principal: Principal, queue = false) {
    this.deps.assertActive(principal);
    if (queue && principal.role !== 'owner_admin' && principal.role !== 'project_manager')
      throw this.deps.errors.accessDenied('Technical change review required');
    const conditions = queue ? ["tc.approval_state='submitted'"] : [];
    const values: string[] = [];
    if (principal.role === 'project_manager') {
      const projectIds = [...principal.projectIds];
      if (projectIds.length === 0) return [];
      conditions.push(`tc.project_id IN (${projectIds.map(() => '?').join(',')})`);
      values.push(...projectIds);
    } else if (principal.role === 'worker') {
      conditions.push('tc.author_id=?');
      values.push(principal.userId);
    }
    const rows = this.deps.sqlite
      .prepare(
        `SELECT tc.id,tc.project_id,tc.technical_report_id,tc.author_id,tc.component,
                tc.change_made,tc.safety_impact,tc.production_impact,tc.validation,
                tc.validation_result,tc.open_risk,tc.rollback_information,tc.approval_state,
                tc.created_at,tc.updated_at,tc.version,p.project_number,p.name project_name,u.name author_name
         FROM technical_change tc JOIN project p ON p.id=tc.project_id JOIN user u ON u.id=tc.author_id
         WHERE ${conditions.length ? conditions.join(' AND ') : '1=1'} ORDER BY tc.created_at DESC LIMIT 200`,
      )
      .all(...values) as Array<{
      project_id: string;
      author_id: string;
      [key: string]: unknown;
    }>;
    return rows;
  }
}
