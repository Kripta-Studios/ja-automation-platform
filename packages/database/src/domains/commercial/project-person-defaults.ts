import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  type PortalRepository,
} from '../../repository.ts';
import {
  ProjectBillingSetupRepository,
  type ProjectPersonTermsInput,
} from '../billing/project-billing-setup-repository.ts';

export class ProjectDefaultsDateConflictError extends ConflictError {
  readonly code = 'PROJECT_DEFAULTS_DATE_CONFLICT';

  constructor() {
    super('Choose an effective date after the last saved project defaults.');
  }
}

export type ProjectPersonDefaultsConfig = Pick<
  ProjectPersonTermsInput,
  | 'customerHourlyRate'
  | 'workerPayType'
  | 'workerPayAmount'
  | 'percentageBasis'
  | 'expensePayer'
  | 'workerReimbursement'
  | 'clientRecovery'
  | 'markupPercent'
> & {
  internalCostHourlyRate: string;
};
export type ProjectPersonDefaults = {
  id: string;
  projectId: string;
  currency: string;
  effectiveFrom: string;
  revision: number;
  config: ProjectPersonDefaultsConfig;
};
type Stored = {
  id: string;
  project_id: string;
  currency: string;
  effective_from: string;
  version: number;
  config_json: string;
};
const project = (row: Stored): ProjectPersonDefaults => ({
  id: row.id,
  projectId: row.project_id,
  currency: row.currency,
  effectiveFrom: row.effective_from,
  revision: row.version,
  config: JSON.parse(row.config_json) as ProjectPersonDefaultsConfig,
});
const date = (value: string) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new ValidationError('Enter a valid project defaults effective date');
};
const minor = (value: string) => {
  if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value))
    throw new ValidationError('Project defaults amounts must have at most two decimals');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
};

/** Defaults are agreement templates. Applying one creates dated, real worker rules;
 * changing a template never silently rewrites an existing person's agreement. */
export class ProjectPersonDefaultsRepository {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly repository: PortalRepository,
  ) {}
  private authorize(principal: Principal, write = false) {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    if (
      !['owner_admin', 'finance_admin', ...(write ? [] : ['auditor_read_only'])].includes(
        principal.role,
      )
    )
      throw new AccessDeniedError('Finance role required');
    if (write) assertLiveSession(this.sqlite, principal, AccessDeniedError);
  }
  latest(principal: Principal, projectId: string, onDate?: string): ProjectPersonDefaults | null {
    this.authorize(principal);
    if (onDate) date(onDate);
    const row = this.sqlite
      .prepare(
        `SELECT * FROM project_person_defaults WHERE project_id=?
      ${onDate ? 'AND effective_from<=?' : ''} ORDER BY effective_from DESC,version DESC LIMIT 1`,
      )
      .get(...(onDate ? [projectId, onDate] : [projectId])) as Stored | undefined;
    return row ? project(row) : null;
  }
  revision(principal: Principal, projectId: string): number {
    this.authorize(principal);
    return Number(
      (
        this.sqlite
          .prepare(
            'SELECT COALESCE(MAX(version),0) version FROM project_person_defaults WHERE project_id=?',
          )
          .get(projectId) as { version: number }
      ).version,
    );
  }
  save(
    principal: Principal,
    input: {
      projectId: string;
      effectiveFrom: string;
      expectedRevision: number;
      config: ProjectPersonDefaultsConfig;
    },
  ): void {
    this.authorize(principal, true);
    date(input.effectiveFrom);
    const c = input.config;
    minor(c.customerHourlyRate);
    minor(c.internalCostHourlyRate);
    const pay = minor(c.workerPayAmount);
    const markup = minor(c.markupPercent || '0');
    if (
      ![
        'Hourly',
        'Daily',
        'FixedPerBillingPeriod',
        'FixedProjectAmount',
        'PercentageOfEligibleClientLabor',
      ].includes(c.workerPayType) ||
      ![
        'CLIENT_LABOR_BEFORE_TAX',
        'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT',
        'ISSUED_ELIGIBLE_LABOR',
        'COLLECTED_ELIGIBLE_LABOR',
      ].includes(c.percentageBasis) ||
      !['worker', 'company_card', 'company_direct', 'client', 'third_party'].includes(
        c.expensePayer,
      ) ||
      !['at_cost', 'none'].includes(c.workerReimbursement) ||
      !['at_cost', 'markup', 'included', 'non_billable', 'client_direct'].includes(
        c.clientRecovery,
      ) ||
      (c.expensePayer !== 'worker' && c.workerReimbursement !== 'none') ||
      (c.expensePayer === 'client') !== (c.clientRecovery === 'client_direct') ||
      markup > 10000n ||
      (c.workerPayType === 'PercentageOfEligibleClientLabor' && pay > 10000n)
    )
      throw new ValidationError('Review project defaults pay and expense choices');
    runImmediateTransaction(this.sqlite, 'project-person-defaults', () => {
      const p = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: string } | undefined;
      if (!p) throw new ValidationError('Project not found');
      const revision = this.revision(principal, input.projectId);
      if (revision !== input.expectedRevision)
        throw new ConflictError('Project defaults changed. Reload before saving.');
      const latest = this.latest(principal, input.projectId);
      if (latest && input.effectiveFrom <= latest.effectiveFrom)
        throw new ProjectDefaultsDateConflictError();
      const id = newId();
      this.sqlite
        .prepare(
          `INSERT INTO project_person_defaults(id,project_id,currency,effective_from,config_json,version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.projectId,
          p.currency,
          input.effectiveFrom,
          JSON.stringify(c),
          revision + 1,
          principal.userId,
          new Date().toISOString(),
        );
      recordAuditEvent(this.sqlite, principal, 'project.update', 'project', input.projectId, {
        projectPersonDefaultsId: id,
        effectiveFrom: input.effectiveFrom,
        revision: revision + 1,
      });
    });
  }
  applyToNewAssignment(principal: Principal, assignmentId: string): void {
    this.authorize(principal, true);
    const member = this.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.user_id,pm.starts_on,pm.ends_on,p.currency FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.id=? AND pm.status='active'`,
      )
      .get(assignmentId) as
      | {
          id: string;
          project_id: string;
          user_id: string;
          starts_on: string;
          ends_on: string | null;
          currency: string;
        }
      | undefined;
    if (!member) throw new ValidationError('Project assignment is unavailable');
    const defaults = this.latest(principal, member.project_id, member.starts_on);
    if (!defaults || defaults.currency !== member.currency)
      throw new ValidationError(
        'No saved project defaults cover this assignment start date. Configure defaults or enter individual terms.',
      );
    this.applyIndividualTerms(principal, assignmentId, defaults.config);
    this.sqlite
      .prepare('INSERT INTO project_member_default_terms(project_member_id,default_id) VALUES(?,?)')
      .run(member.id, defaults.id);
  }
  applyIndividualTerms(
    principal: Principal,
    assignmentId: string,
    c: ProjectPersonDefaultsConfig,
  ): void {
    this.authorize(principal, true);
    const member = this.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.user_id,pm.starts_on,pm.ends_on,p.currency FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.id=? AND pm.status='active'`,
      )
      .get(assignmentId) as
      | {
          id: string;
          project_id: string;
          user_id: string;
          starts_on: string;
          ends_on: string | null;
          currency: string;
        }
      | undefined;
    if (!member) throw new ValidationError('Project assignment is unavailable');
    const setup = new ProjectBillingSetupRepository(this.sqlite, this.repository);
    setup.savePersonTerms(principal, {
      ...c,
      pinRates: true,
      reimbursementSource: 'override',
      projectId: member.project_id,
      projectMemberId: member.id,
      workerId: member.user_id,
      expectedFingerprint: setup.personTermsFingerprint(
        principal,
        member.project_id,
        member.user_id,
      ),
      effectiveFrom: member.starts_on,
    });
  }
}
