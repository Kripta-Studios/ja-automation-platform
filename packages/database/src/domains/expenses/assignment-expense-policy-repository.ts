import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import { add, applyBasisPoints, money, type Currency } from '@ja/money';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';

export type ExpensePayer = 'worker' | 'company_card' | 'company_direct' | 'client' | 'third_party';
export type WorkerReimbursementMode = 'at_cost' | 'none';
export type ClientRecoveryMode =
  | 'at_cost'
  | 'markup'
  | 'included'
  | 'non_billable'
  | 'client_direct';

export type AssignmentExpensePolicyInput = Readonly<{
  projectMemberId: string;
  payer: ExpensePayer;
  category?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  workerReimbursement: WorkerReimbursementMode;
  clientRecovery: ClientRecoveryMode;
  markupBps?: number;
  reason: string;
}>;

export type ExpensePolicyContext = Readonly<{
  projectId: string;
  workerId: string;
  spentOn: string;
  category: string;
  whoPaid: string;
}>;

export type AssignmentExpensePolicy = Readonly<{
  id: string;
  projectMemberId: string;
  payer: ExpensePayer;
  category: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  workerReimbursement: WorkerReimbursementMode;
  clientRecovery: ClientRecoveryMode;
  markupBps: number;
  version: number;
  reason: string;
}>;

export type ExpensePolicyIssue = 'missing_assignment' | 'ambiguous_assignment' | 'missing_policy';
export type ExpensePolicyResolution = Readonly<{
  policy: AssignmentExpensePolicy | null;
  issue: ExpensePolicyIssue | null;
}>;

export type ReimbursementPreference = WorkerReimbursementMode | null;

export type ExpensePolicyPreview = Readonly<{
  expenseId: string;
  policy: AssignmentExpensePolicy | null;
  issues: readonly (ExpensePolicyIssue | 'expense_not_found' | 'fx_required')[];
  sourceCurrency: string | null;
  projectCurrency: string | null;
  workerReimbursementMinor: string | null;
  clientRecoveryMinor: string | null;
  clientTreatment: 'reimbursable' | 'all_in' | 'non_billable' | null;
  billingTreatment:
    | 'reimbursable_at_cost'
    | 'reimbursable_plus_markup'
    | 'all_in'
    | 'internal_non_billable'
    | 'client_direct'
    | null;
  markupBps: number | null;
}>;

type AssignmentRow = {
  id: string;
  starts_on: string;
  ends_on: string | null;
  status: string;
};
type PolicyRow = {
  id: string;
  project_member_id: string;
  payer: ExpensePayer;
  category: string | null;
  effective_from: string;
  effective_to: string | null;
  worker_reimbursement: WorkerReimbursementMode;
  client_recovery: ClientRecoveryMode;
  markup_bps: number;
  version: number;
  reason: string;
};

const now = () => new Date().toISOString();

function date(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new ValidationError(`${field} must be a date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ValidationError(`${field} must be a real date`);
  return value;
}

function payer(value: string): ExpensePayer {
  const normalized = value === 'company' ? 'company_direct' : value;
  if (!['worker', 'company_card', 'company_direct', 'client', 'third_party'].includes(normalized))
    throw new ValidationError('Expense payer is invalid');
  return normalized as ExpensePayer;
}

function projectPolicy(row: PolicyRow): AssignmentExpensePolicy {
  return {
    id: row.id,
    projectMemberId: row.project_member_id,
    payer: row.payer,
    category: row.category,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    workerReimbursement: row.worker_reimbursement,
    clientRecovery: row.client_recovery,
    markupBps: row.markup_bps,
    version: row.version,
    reason: row.reason,
  };
}

/** Effective, immutable terms for one assigned person. No operational writes. */
export class AssignmentExpensePolicyRepository {
  private readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  private assertFinance(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
    const current = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (
      !canManageBilling(principal) ||
      !current ||
      current.status !== 'active' ||
      !['owner_admin', 'finance_admin'].includes(current.role)
    )
      throw new AccessDeniedError('Finance role required');
  }

  /** Select immutable preferences by operational date. Null inherits the next layer. */
  effectiveReimbursementPreference(projectId: string, projectMemberId: string, onDate: string) {
    date(onDate, 'Reimbursement effective date');
    const selected = (memberId: string | null) =>
      this.sqlite
        .prepare(
          `SELECT mode,effective_from FROM reimbursement_preference_revision
         WHERE project_id=? AND project_member_id IS ? AND effective_from<=?
         ORDER BY effective_from DESC LIMIT 1`,
        )
        .get(projectId, memberId, onDate) as
        | { mode: ReimbursementPreference; effective_from: string }
        | undefined;
    const project = selected(null);
    const assignment = selected(projectMemberId);
    const projectDefault = project?.mode ?? null;
    const workerOverride = assignment?.mode ?? null;
    return {
      projectDefault,
      workerOverride,
      mode: workerOverride ?? projectDefault,
      source:
        workerOverride !== null
          ? 'assignment_override'
          : projectDefault !== null
            ? 'project_default'
            : 'person_policy',
      projectEffectiveFrom: project?.effective_from ?? null,
      overrideEffectiveFrom: assignment?.effective_from ?? null,
    };
  }

  listReimbursementPreferences(principal: Principal, projectId: string) {
    this.assertFinance(principal);
    return this.sqlite
      .prepare(
        `SELECT r.id,r.project_member_id projectMemberId,r.mode,r.effective_from effectiveFrom,
              r.version,r.reason,u.name workerName
       FROM reimbursement_preference_revision r
       LEFT JOIN project_member pm ON pm.id=r.project_member_id
       LEFT JOIN user u ON u.id=pm.user_id
       WHERE r.project_id=? ORDER BY r.effective_from DESC,r.id`,
      )
      .all(projectId) as Array<{
      id: string;
      projectMemberId: string | null;
      mode: ReimbursementPreference;
      effectiveFrom: string;
      version: number;
      reason: string;
      workerName: string | null;
    }>;
  }

  private assertPreferenceInput(
    mode: ReimbursementPreference,
    effectiveFrom: string,
    reason: string,
  ): string {
    if (mode !== null && !['at_cost', 'none'].includes(mode))
      throw new ValidationError('Worker reimbursement preference is invalid');
    date(effectiveFrom, 'Reimbursement effective date');
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 2000)
      throw new ValidationError('Reason must be 3 to 2000 characters');
    return trimmed;
  }

  private assertPreferenceHistory(
    projectId: string,
    workerId: string | null,
    effectiveFrom: string,
  ): void {
    const invoice = this.sqlite
      .prepare(
        `SELECT 1 FROM invoice WHERE project_id=? AND period_end>=?
       AND state NOT IN ('void','cancelled') LIMIT 1`,
      )
      .get(projectId, effectiveFrom);
    const settlement = this.sqlite
      .prepare(
        `SELECT 1 FROM compensation_settlement WHERE project_id=? AND (? IS NULL OR worker_id=?)
       AND period_end>=? AND state IN ('approved','settled') LIMIT 1`,
      )
      .get(projectId, workerId, workerId, effectiveFrom);
    const paid = this.sqlite
      .prepare(
        `SELECT 1 FROM expense WHERE project_id=? AND (? IS NULL OR worker_id=?) AND spent_on>=?
       AND (reimbursed_at IS NOT NULL OR reimbursement_state='reimbursed') LIMIT 1`,
      )
      .get(projectId, workerId, workerId, effectiveFrom);
    if (invoice || settlement || paid)
      throw new ConflictError(
        'Reimbursement date overlaps invoice, finalized settlement, or paid expense history. Choose a later effective date.',
      );
  }

  private insertPreference(
    principal: Principal,
    projectId: string,
    projectMemberId: string | null,
    mode: ReimbursementPreference,
    effectiveFrom: string,
    reason: string,
  ): void {
    const sameDay = this.sqlite
      .prepare(
        `SELECT 1 FROM reimbursement_preference_revision WHERE project_id=? AND project_member_id IS ? AND effective_from=?`,
      )
      .get(projectId, projectMemberId, effectiveFrom);
    if (sameDay)
      throw new ConflictError(
        'A reimbursement preference already starts on this date. Choose another effective date.',
      );
    const prior = this.sqlite
      .prepare(
        `SELECT COALESCE(MAX(version),0) version FROM reimbursement_preference_revision WHERE project_id=? AND project_member_id IS ?`,
      )
      .get(projectId, projectMemberId) as { version: number };
    const id = newId();
    this.sqlite
      .prepare(
        `INSERT INTO reimbursement_preference_revision(id,project_id,project_member_id,mode,effective_from,version,reason,created_by,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        projectId,
        projectMemberId,
        mode,
        effectiveFrom,
        prior.version + 1,
        reason,
        principal.userId,
        now(),
      );
    recordAuditEvent(
      this.sqlite,
      principal,
      projectMemberId ? 'assignment.update' : 'project.update',
      projectMemberId ? 'project_member' : 'project',
      projectMemberId ?? projectId,
      {
        reimbursementPreferenceRevisionId: id,
        workerExpenseReimbursement: mode,
        effectiveFrom,
        reason,
      },
    );
  }

  /** A dated default never reinterprets claims from an earlier operational date. */
  setProjectReimbursementDefault(
    principal: Principal,
    input: {
      projectId: string;
      expectedVersion: number;
      mode: ReimbursementPreference;
      effectiveFrom: string;
      reason: string;
    },
  ): void {
    this.assertFinance(principal);
    const reason = this.assertPreferenceInput(input.mode, input.effectiveFrom, input.reason);
    runImmediateTransaction(this.sqlite, 'project-expense-reimbursement', () => {
      const project = this.sqlite
        .prepare('SELECT version FROM project WHERE id=?')
        .get(input.projectId) as { version: number } | undefined;
      if (!project || project.version !== input.expectedVersion)
        throw new ConflictError('Project changed. Reload its reimbursement policy');
      this.assertPreferenceHistory(input.projectId, null, input.effectiveFrom);
      this.insertPreference(
        principal,
        input.projectId,
        null,
        input.mode,
        input.effectiveFrom,
        reason,
      );
      const changed = this.sqlite
        .prepare(
          `UPDATE project SET updated_at=?,version=version+1
                  WHERE id=? AND version=?`,
        )
        .run(now(), input.projectId, input.expectedVersion);
      if (changed.changes !== 1)
        throw new ConflictError('Project changed. Reload its reimbursement policy');
    });
  }

  /** An assignment override affects only worker reimbursement, never customer billing. */
  setWorkerReimbursementOverride(
    principal: Principal,
    input: {
      projectMemberId: string;
      expectedVersion: number;
      mode: ReimbursementPreference;
      effectiveFrom: string;
      reason: string;
    },
  ): void {
    this.assertFinance(principal);
    const reason = this.assertPreferenceInput(input.mode, input.effectiveFrom, input.reason);
    runImmediateTransaction(this.sqlite, 'worker-expense-reimbursement', () => {
      const assignment = this.sqlite
        .prepare(
          'SELECT project_id,user_id,starts_on,ends_on,status,version FROM project_member WHERE id=?',
        )
        .get(input.projectMemberId) as
        | {
            project_id: string;
            user_id: string;
            starts_on: string;
            ends_on: string | null;
            status: string;
            version: number;
          }
        | undefined;
      if (
        !assignment ||
        assignment.status !== 'active' ||
        assignment.version !== input.expectedVersion
      )
        throw new ConflictError('Assignment changed. Reload its reimbursement policy');
      if (
        input.effectiveFrom < assignment.starts_on ||
        (assignment.ends_on && input.effectiveFrom > assignment.ends_on)
      )
        throw new ValidationError('Reimbursement date must fall within the assignment');
      this.assertPreferenceHistory(assignment.project_id, assignment.user_id, input.effectiveFrom);
      this.insertPreference(
        principal,
        assignment.project_id,
        input.projectMemberId,
        input.mode,
        input.effectiveFrom,
        reason,
      );
      const changed = this.sqlite
        .prepare(
          `UPDATE project_member SET updated_at=?,version=version+1
                  WHERE id=? AND status='active' AND version=?`,
        )
        .run(now(), input.projectMemberId, input.expectedVersion);
      if (changed.changes !== 1)
        throw new ConflictError('Assignment changed. Reload its reimbursement policy');
    });
  }

  create(principal: Principal, input: AssignmentExpensePolicyInput): AssignmentExpensePolicy {
    this.assertFinance(principal);
    const effectiveFrom = date(input.effectiveFrom, 'Policy start');
    const effectiveTo = input.effectiveTo ? date(input.effectiveTo, 'Policy end') : null;
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw new ValidationError('Policy end must follow start');
    const normalizedPayer = payer(input.payer);
    const category = input.category?.trim() || null;
    if (category && category.length > 80) throw new ValidationError('Expense category is too long');
    if (!['at_cost', 'none'].includes(input.workerReimbursement))
      throw new ValidationError('Worker reimbursement policy is invalid');
    if (
      !['at_cost', 'markup', 'included', 'non_billable', 'client_direct'].includes(
        input.clientRecovery,
      )
    )
      throw new ValidationError('Client recovery policy is invalid');
    const markupBps = input.markupBps ?? 0;
    if (!Number.isSafeInteger(markupBps) || markupBps < 0 || markupBps > 10_000)
      throw new ValidationError('Expense markup is invalid');
    if ((input.clientRecovery === 'markup') !== markupBps > 0)
      throw new ValidationError(
        'Markup requires a positive rate and no other treatment permits one',
      );
    if (normalizedPayer !== 'worker' && input.workerReimbursement !== 'none')
      throw new ValidationError('Only a worker-paid expense can reimburse a worker');
    if ((normalizedPayer === 'client') !== (input.clientRecovery === 'client_direct'))
      throw new ValidationError('Client-paid expenses require client-direct treatment');
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 2000)
      throw new ValidationError('Policy reason must be 3 to 2000 characters');
    return runImmediateTransaction(this.sqlite, 'assignment-expense-policy', () => {
      const assignment = this.sqlite
        .prepare(
          'SELECT id,project_id,user_id,starts_on,ends_on,status FROM project_member WHERE id=?',
        )
        .get(input.projectMemberId) as
        | (AssignmentRow & { project_id: string; user_id: string })
        | undefined;
      if (!assignment || assignment.status !== 'active')
        throw new ValidationError('Active project assignment required');
      if (
        effectiveFrom < assignment.starts_on ||
        (assignment.ends_on && effectiveFrom > assignment.ends_on) ||
        (assignment.ends_on && effectiveTo && effectiveTo > assignment.ends_on)
      )
        throw new ValidationError('Policy dates must fall within the assignment');
      if (assignment.ends_on && !effectiveTo)
        throw new ValidationError('Bounded assignment requires a policy end date');
      const prior = this.sqlite
        .prepare(
          `SELECT MAX(version) version FROM assignment_expense_policy
         WHERE project_member_id=? AND payer=? AND COALESCE(category,'')=COALESCE(?,'')`,
        )
        .get(input.projectMemberId, normalizedPayer, category) as { version: number | null };
      const duplicate = this.sqlite
        .prepare(
          `SELECT 1 FROM assignment_expense_policy
         WHERE project_member_id=? AND payer=? AND COALESCE(category,'')=COALESCE(?,'')
           AND effective_from=?`,
        )
        .get(input.projectMemberId, normalizedPayer, category, effectiveFrom);
      if (duplicate) throw new ConflictError('Expense policy already starts on this date');
      // An open-ended predecessor is superseded by a later effective start.
      // A finite predecessor can be superseded with the same end boundary.
      // Conflicting boundaries and later-start windows cannot be overwritten.
      const overlapping = this.sqlite
        .prepare(
          `SELECT 1 FROM assignment_expense_policy
         WHERE project_member_id=? AND payer=? AND COALESCE(category,'')=COALESCE(?,'')
           AND ((effective_to IS NOT NULL AND effective_to>=? AND effective_from<=COALESCE(?,'9999-12-31')
                 AND NOT (effective_from<? AND effective_to IS ?))
             OR (effective_from>? AND effective_from<=COALESCE(?,'9999-12-31'))) LIMIT 1`,
        )
        .get(
          input.projectMemberId,
          normalizedPayer,
          category,
          effectiveFrom,
          effectiveTo,
          effectiveFrom,
          effectiveTo,
          effectiveFrom,
          effectiveTo,
        );
      if (overlapping)
        throw new ConflictError('Expense policy dates overlap an existing finite window');
      this.assertPreferenceHistory(assignment.project_id, assignment.user_id, effectiveFrom);
      const id = newId();
      const version = (prior.version ?? 0) + 1;
      this.sqlite
        .prepare(
          `INSERT INTO assignment_expense_policy(
           id,project_member_id,payer,category,effective_from,effective_to,
           worker_reimbursement,client_recovery,markup_bps,version,reason,
           created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.projectMemberId,
          normalizedPayer,
          category,
          effectiveFrom,
          effectiveTo,
          input.workerReimbursement,
          input.clientRecovery,
          markupBps,
          version,
          reason,
          principal.userId,
          now(),
        );
      recordAuditEvent(
        this.sqlite,
        principal,
        'assignment.expense_policy_create',
        'assignment_expense_policy',
        id,
        {
          projectMemberId: input.projectMemberId,
          payer: normalizedPayer,
          category,
          effectiveFrom,
          effectiveTo,
          version,
          workerReimbursement: input.workerReimbursement,
          clientRecovery: input.clientRecovery,
        },
      );
      return projectPolicy({
        id,
        project_member_id: input.projectMemberId,
        payer: normalizedPayer,
        category,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        worker_reimbursement: input.workerReimbursement,
        client_recovery: input.clientRecovery,
        markup_bps: markupBps,
        version,
        reason,
      });
    });
  }

  listForProject(
    principal: Principal,
    projectId: string,
  ): Array<
    AssignmentExpensePolicy & {
      workerId: string;
      workerName: string;
      projectId: string;
    }
  > {
    this.assertFinance(principal);
    const rows = this.sqlite
      .prepare(
        `SELECT ep.id,ep.project_member_id,ep.payer,ep.category,ep.effective_from,
              ep.effective_to,ep.worker_reimbursement,ep.client_recovery,
              ep.markup_bps,ep.version,ep.reason,pm.project_id projectId,
              pm.user_id workerId,u.name workerName
       FROM assignment_expense_policy ep JOIN project_member pm ON pm.id=ep.project_member_id
       JOIN user u ON u.id=pm.user_id WHERE pm.project_id=?
       ORDER BY u.name,ep.payer,ep.category,ep.effective_from DESC`,
      )
      .all(projectId) as Array<
      PolicyRow & { projectId: string; workerId: string; workerName: string }
    >;
    return rows.map((row) => ({
      ...projectPolicy(row),
      projectId: row.projectId,
      workerId: row.workerId,
      workerName: row.workerName,
    }));
  }

  resolve(context: ExpensePolicyContext): ExpensePolicyResolution {
    date(context.spentOn, 'Expense date');
    const normalizedPayer = payer(context.whoPaid);
    const assignments = this.sqlite
      .prepare(
        `SELECT id,starts_on,ends_on,status FROM project_member
       WHERE project_id=? AND user_id=? AND starts_on<=?
         AND (status='active' OR (status='inactive' AND ends_on IS NOT NULL))
         AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on DESC`,
      )
      .all(
        context.projectId,
        context.workerId,
        context.spentOn,
        context.spentOn,
      ) as AssignmentRow[];
    if (!assignments.length) return { policy: null, issue: 'missing_assignment' };
    if (assignments.length > 1) return { policy: null, issue: 'ambiguous_assignment' };
    const policies = this.sqlite
      .prepare(
        `SELECT id,project_member_id,payer,category,effective_from,effective_to,
              worker_reimbursement,client_recovery,markup_bps,version,reason
       FROM assignment_expense_policy WHERE project_member_id=? AND payer=?
         AND (category=? OR category IS NULL) AND effective_from<=?
         AND (effective_to IS NULL OR effective_to>=?)
       ORDER BY CASE WHEN category=? THEN 1 ELSE 0 END DESC,effective_from DESC,version DESC LIMIT 1`,
      )
      .all(
        assignments[0]!.id,
        normalizedPayer,
        context.category,
        context.spentOn,
        context.spentOn,
        context.category,
      ) as PolicyRow[];
    if (!policies[0]) return { policy: null, issue: 'missing_policy' };
    const effective = this.effectiveReimbursementPreference(
      context.projectId,
      assignments[0]!.id,
      context.spentOn,
    );
    const policy = projectPolicy(policies[0]);
    return {
      policy: {
        ...policy,
        workerReimbursement:
          normalizedPayer === 'worker'
            ? (effective.workerOverride ?? effective.projectDefault ?? policy.workerReimbursement)
            : 'none',
      },
      issue: null,
    };
  }

  preview(principal: Principal, expenseId: string): ExpensePolicyPreview {
    this.assertFinance(principal);
    const expense = this.sqlite
      .prepare(
        `SELECT e.id,e.project_id,e.worker_id,e.spent_on,e.category,e.who_paid,
              e.currency,e.amount_minor,p.currency project_currency
       FROM expense e JOIN project p ON p.id=e.project_id WHERE e.id=?`,
      )
      .get(expenseId) as
      | {
          id: string;
          project_id: string;
          worker_id: string;
          spent_on: string;
          category: string;
          who_paid: string;
          currency: string;
          amount_minor: number;
          project_currency: string;
        }
      | undefined;
    if (!expense)
      return {
        expenseId,
        policy: null,
        issues: ['expense_not_found'],
        sourceCurrency: null,
        projectCurrency: null,
        workerReimbursementMinor: null,
        clientRecoveryMinor: null,
        clientTreatment: null,
        billingTreatment: null,
        markupBps: null,
      };
    const result = this.resolve({
      projectId: expense.project_id,
      workerId: expense.worker_id,
      spentOn: expense.spent_on,
      category: expense.category,
      whoPaid: expense.who_paid,
    });
    if (!result.policy)
      return {
        expenseId,
        policy: null,
        issues: [result.issue!],
        sourceCurrency: expense.currency,
        projectCurrency: expense.project_currency,
        workerReimbursementMinor: null,
        clientRecoveryMinor: null,
        clientTreatment: null,
        billingTreatment: null,
        markupBps: null,
      };
    if (!Number.isSafeInteger(expense.amount_minor) || expense.amount_minor <= 0)
      throw new ValidationError('Expense amount is invalid');
    const policy = result.policy;
    const amount = money(expense.currency as Currency, BigInt(expense.amount_minor));
    const workerReimbursementMinor =
      policy.workerReimbursement === 'at_cost' && policy.payer === 'worker'
        ? String(amount.minorUnits)
        : '0';
    const clientTreatment =
      policy.clientRecovery === 'at_cost' || policy.clientRecovery === 'markup'
        ? 'reimbursable'
        : policy.clientRecovery === 'included'
          ? 'all_in'
          : 'non_billable';
    const billingTreatment =
      policy.clientRecovery === 'at_cost'
        ? 'reimbursable_at_cost'
        : policy.clientRecovery === 'markup'
          ? 'reimbursable_plus_markup'
          : policy.clientRecovery === 'included'
            ? 'all_in'
            : policy.clientRecovery === 'client_direct'
              ? 'client_direct'
              : 'internal_non_billable';
    const sameCurrency = expense.currency === expense.project_currency;
    const customer =
      policy.clientRecovery === 'at_cost'
        ? amount
        : policy.clientRecovery === 'markup'
          ? add(amount, applyBasisPoints(amount, policy.markupBps))
          : money(expense.currency as Currency, 0n);
    return {
      expenseId,
      policy,
      issues: sameCurrency ? [] : ['fx_required'],
      sourceCurrency: expense.currency,
      projectCurrency: expense.project_currency,
      workerReimbursementMinor,
      clientRecoveryMinor: sameCurrency ? String(customer.minorUnits) : null,
      clientTreatment,
      billingTreatment,
      markupBps: policy.markupBps,
    };
  }
}
