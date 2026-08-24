import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { add, applyBasisPoints, money, type Currency } from '@ja/money';
import { recordAuditEvent } from '../../core/audit.ts';
import { canonicalJson, sha256 } from '../../core/canonical-json.ts';
import {
  ensureCommand,
  ensureEvidence,
  type FinanceCommandInput,
} from './finance-command-writer.ts';

type ErrorFactory = (message: string) => never;
type DbRow = Record<string, unknown>;
type Deployment = Readonly<{ tenantId: string; deploymentId: string }>;

export type ExpenseCommercialClassificationInput = Readonly<{
  expenseId: string;
  expectedVersion: number;
  clientTreatment: 'all_in' | 'reimbursable' | 'non_billable';
  billingTreatment:
    | 'reimbursable_at_cost'
    | 'reimbursable_plus_markup'
    | 'all_in'
    | 'internal_non_billable'
    | 'client_direct'
    | 'allowance_per_diem'
    | 'informational';
  markupBps: number;
  taxBps: number;
  reason: string;
  idempotencyKey: string;
}>;

export type ExpenseCommercialClassificationResult = Readonly<{
  id: string;
  version: number;
  classificationState: 'classified';
}>;

export type CanonicalExpenseLegalEntityAuthority = Readonly<{
  revisionId: string;
  baseCurrency?: string;
}>;

export type ExpenseCommercialClassificationRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  now: () => string;
  resolveCanonicalProjectLegalEntity: (
    principal: Principal,
    projectId: string,
    onDate: string,
  ) => CanonicalExpenseLegalEntityAuthority;
  errors: Readonly<{
    accessDenied: ErrorFactory;
    conflict: ErrorFactory;
    validation: ErrorFactory;
  }>;
}>;

const COMMAND_CONTRACT = 'client-essential-finance-command-v1';
const CLASSIFICATION_CONTRACT = 'expense-classification-revision-v1';

function rowValue<T>(row: DbRow | undefined, key: string): T | undefined {
  return row?.[key] as T | undefined;
}

function isSqliteConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /constraint|immutable|unique|foreign key|classification|authority|pointer/iu.test(error.message)
  );
}

export class ExpenseCommercialClassificationRepository {
  private readonly deps: ExpenseCommercialClassificationRepositoryDependencies;

  constructor(deps: ExpenseCommercialClassificationRepositoryDependencies) {
    this.deps = deps;
  }

  private failValidation(message: string): never {
    return this.deps.errors.validation(message);
  }

  private failConflict(message: string): never {
    return this.deps.errors.conflict(message);
  }

  private assertActiveFinancePrincipal(principal: Principal): void {
    const user = this.deps.sqlite
      .prepare('SELECT status,role FROM user WHERE id=?')
      .get(principal.userId) as { status: string; role: string } | undefined;
    if (!user || user.status !== 'active')
      return this.deps.errors.accessDenied('Active finance principal required');
    if (
      principal.isServiceActor ||
      !canManageBilling(principal) ||
      (user.role !== 'owner_admin' && user.role !== 'finance_admin')
    )
      return this.deps.errors.accessDenied('Finance role required');
    const sessionId = principal.sessionId;
    if (!sessionId)
      return this.deps.errors.accessDenied('Recent step-up authentication is required');
    const session = this.deps.sqlite
      .prepare('SELECT step_up_at,expires_at FROM session WHERE id=? AND user_id=?')
      .get(sessionId, principal.userId) as
      | { step_up_at: string | null; expires_at: string }
      | undefined;
    const nowMs = Date.parse(this.deps.now());
    const stepUpMs = session?.step_up_at ? Date.parse(session.step_up_at) : Number.NaN;
    const sessionExpiresMs = session?.expires_at ? Date.parse(session.expires_at) : Number.NaN;
    if (
      !session ||
      !session.step_up_at ||
      !Number.isFinite(nowMs) ||
      !Number.isFinite(stepUpMs) ||
      !Number.isFinite(sessionExpiresMs) ||
      stepUpMs > nowMs ||
      nowMs - stepUpMs > 10 * 60_000 ||
      sessionExpiresMs <= nowMs
    )
      return this.deps.errors.accessDenied('Recent step-up authentication is required');
  }

  private stepUpProof(principal: Principal): {
    stepUpVerifiedAt: string;
    stepUpExpiresAt: string;
  } {
    const sessionId = principal.sessionId;
    if (!sessionId) return this.failConflict('Recent step-up authentication is required');
    const session = this.deps.sqlite
      .prepare('SELECT step_up_at,expires_at FROM session WHERE id=? AND user_id=?')
      .get(sessionId, principal.userId) as
      | { step_up_at: string | null; expires_at: string }
      | undefined;
    if (!session?.step_up_at) return this.failConflict('Recent step-up authentication is required');
    const stepUpExpires = new Date(Date.parse(session.step_up_at) + 10 * 60_000);
    const sessionExpires = new Date(Date.parse(session.expires_at));
    return {
      stepUpVerifiedAt: session.step_up_at,
      stepUpExpiresAt: (stepUpExpires < sessionExpires
        ? stepUpExpires
        : sessionExpires
      ).toISOString(),
    };
  }

  private deployment(): Deployment {
    const row = this.deps.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!row) return this.failValidation('Deployment identity is not configured');
    return { tenantId: row.tenant_id, deploymentId: row.deployment_id };
  }

  private text(value: unknown, field: string, max = 500): string {
    if (typeof value !== 'string') return this.failValidation(`${field} is required`);
    const clean = value.trim();
    if (!clean) return this.failValidation(`${field} is required`);
    if (clean.length > max) return this.failValidation(`${field} is too long`);
    return clean;
  }

  private isoDate(value: unknown, field: string): string {
    const clean = this.text(value, field, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean))
      return this.failValidation(`${field} must be an ISO date`);
    const date = new Date(`${clean}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== clean)
      return this.failValidation(`${field} must be an ISO date`);
    return clean;
  }

  private normalizeInput(
    input: ExpenseCommercialClassificationInput,
  ): ExpenseCommercialClassificationInput {
    const markupBps = input.markupBps ?? 0;
    const taxBps = input.taxBps ?? 0;
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
      return this.failValidation('Expected expense version is invalid');
    if (!['all_in', 'reimbursable', 'non_billable'].includes(input.clientTreatment))
      return this.failValidation('Client treatment is invalid');
    const billingTreatments = [
      'reimbursable_at_cost',
      'reimbursable_plus_markup',
      'all_in',
      'internal_non_billable',
      'client_direct',
      'allowance_per_diem',
      'informational',
    ] as const;
    if (!billingTreatments.includes(input.billingTreatment))
      return this.failValidation('Billing treatment is invalid');
    if (!Number.isSafeInteger(markupBps) || markupBps < 0 || markupBps > 10_000)
      return this.failValidation('Markup basis points are invalid');
    if (!Number.isSafeInteger(taxBps) || taxBps < 0 || taxBps > 100_000)
      return this.failValidation('Tax basis points are invalid');
    const validPair =
      (input.clientTreatment === 'all_in' && input.billingTreatment === 'all_in') ||
      (input.clientTreatment === 'reimbursable' &&
        ['reimbursable_at_cost', 'reimbursable_plus_markup', 'allowance_per_diem'].includes(
          input.billingTreatment,
        )) ||
      (input.clientTreatment === 'non_billable' &&
        ['internal_non_billable', 'informational', 'client_direct'].includes(
          input.billingTreatment,
        ));
    if (!validPair) return this.failValidation('Client and billing treatments are contradictory');
    if (input.billingTreatment === 'reimbursable_plus_markup') {
      if (markupBps <= 0)
        return this.failValidation('Markup basis points are required for marked-up reimbursement');
    } else if (markupBps !== 0) {
      return this.failValidation('Markup is only allowed for marked-up reimbursement');
    }
    return {
      expenseId: this.text(input.expenseId, 'Expense id', 200),
      expectedVersion: input.expectedVersion,
      clientTreatment: input.clientTreatment,
      billingTreatment: input.billingTreatment,
      markupBps,
      taxBps,
      reason: this.text(input.reason, 'Reason', 2000),
      idempotencyKey: this.text(input.idempotencyKey, 'Idempotency key', 240),
    };
  }

  private commandDescriptor(
    payload: Readonly<Record<string, unknown>>,
    revisionId: string,
    normalized: ExpenseCommercialClassificationInput,
    proof: Readonly<{ stepUpVerifiedAt: string; stepUpExpiresAt: string }>,
    spentOn: string,
    createdAt: string,
  ): FinanceCommandInput {
    return {
      operation: 'expense.classify',
      targetKind: 'expense_classification',
      targetSemanticId: revisionId,
      targetContractVersion: CLASSIFICATION_CONTRACT,
      idempotencyKey: normalized.idempotencyKey,
      effectiveAt: spentOn,
      payload,
      createdAt,
      contractVersion: COMMAND_CONTRACT,
      evidenceNamespace: 'client-essential',
      evidenceIdPrefix: 'ce',
      commandIdPrefix: 'ce-cmd',
      stepUpVerifiedAt: proof.stepUpVerifiedAt,
      stepUpExpiresAt: proof.stepUpExpiresAt,
      currency: null,
      amountMinor: null,
    };
  }

  private appendFinanceChange(
    deployment: Deployment,
    expenseId: string,
    evidenceId: string,
    evidenceHash: string,
    commandId: string,
    spentOn: string,
    createdAt: string,
  ): void {
    const changeId = `ce-finance-change-expense-classification-${sha256(
      `${deployment.tenantId}:${deployment.deploymentId}:${expenseId}:${evidenceId}`,
    ).slice(0, 40)}`;
    try {
      this.deps.sqlite
        .prepare(
          `INSERT INTO finance_change_event(
             change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,
             effective_at,evidence_type,evidence_id,evidence_hash,command_id,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          changeId,
          deployment.tenantId,
          deployment.deploymentId,
          'expense',
          expenseId,
          'classify',
          spentOn,
          'expense_classification_revision',
          evidenceId,
          evidenceHash,
          commandId,
          createdAt,
        );
    } catch (error) {
      if (isSqliteConflict(error))
        return this.failConflict('Expense classification change conflicted');
      throw error;
    }
  }

  classifyExpenseCommercially(
    principal: Principal,
    input: ExpenseCommercialClassificationInput,
  ): ExpenseCommercialClassificationResult {
    this.assertActiveFinancePrincipal(principal);
    const normalized = this.normalizeInput(input);
    const proof = this.stepUpProof(principal);
    return this.deps.transaction(() => {
      const deployment = this.deployment();
      const expense = this.deps.sqlite
        .prepare(
          `SELECT id,project_id,spent_on,worker_id,currency,amount_minor,who_paid,
                  client_treatment,billing_treatment,markup_bps,tax_amount_minor,
                  project_currency_amount_minor,billing_amount_minor,fx_rate_bps,approval_state,
                  billing_state,billing_lock_id,invoice_id,version,
                  commercial_classification_state
             FROM expense WHERE id=?`,
        )
        .get(normalized.expenseId) as DbRow | undefined;
      if (!expense) return this.failValidation('Expense not found');
      const projectId = this.text(rowValue(expense, 'project_id'), 'Expense project id', 200);
      const project = this.deps.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(projectId) as { currency: string } | undefined;
      if (!project) return this.failValidation('Expense project not found');
      const spentOn = this.isoDate(rowValue(expense, 'spent_on'), 'Expense spent date');
      const whoPaid = this.text(rowValue(expense, 'who_paid'), 'Expense payer', 40);
      if (
        !['worker', 'company', 'company_card', 'company_direct', 'client', 'third_party'].includes(
          whoPaid,
        )
      )
        return this.failValidation('Expense payer is invalid');
      if (rowValue<string | null>(expense, 'invoice_id') !== null)
        return this.failConflict('Invoiced expense is immutable');
      if (
        rowValue<string | null>(expense, 'billing_state') !== 'unlocked' ||
        rowValue<string | null>(expense, 'billing_lock_id') !== null
      )
        return this.failConflict('Expense is locked for billing');
      const sourceLock = this.deps.sqlite
        .prepare(
          `SELECT 1 FROM invoice_source s
            LEFT JOIN invoice i ON i.id=s.invoice_id
           WHERE s.source_type='expense' AND s.source_id=?
             AND (s.locked_at IS NOT NULL OR i.state IN('draft','approved','issued','sent','partially_paid','paid','overdue','void','credited'))
           LIMIT 1`,
        )
        .get(normalized.expenseId);
      if (sourceLock) return this.failConflict('Expense is locked by an invoice source');

      // Resolve the canonical authority before any finance row is written.
      // A missing or ambiguous assignment therefore leaves zero new state.
      const authority = this.deps.resolveCanonicalProjectLegalEntity(principal, projectId, spentOn);
      const legalEntityRevisionId = this.text(
        authority.revisionId,
        'Canonical legal-entity revision id',
        200,
      );
      const createdAt = this.deps.now();
      const sourceCurrency = this.text(
        rowValue(expense, 'currency'),
        'Expense currency',
        3,
      ).toUpperCase();
      const authorityCurrency = this.text(
        authority.baseCurrency,
        'Canonical legal-entity base currency',
        3,
      ).toUpperCase();
      const projectCurrency = this.text(project.currency, 'Project currency', 3).toUpperCase();
      if (authorityCurrency !== projectCurrency)
        return this.failConflict('Canonical legal-entity currency does not match project currency');
      const sourceAmountMinor = rowValue<number>(expense, 'amount_minor');
      if (!Number.isSafeInteger(sourceAmountMinor) || (sourceAmountMinor ?? 0) <= 0)
        return this.failValidation('Expense amount is invalid');
      let projectCurrencyAmountMinor: number | null = null;
      let billingAmountMinor: number | null = null;
      let taxAmountMinor: number | null = null;
      if (sourceCurrency === authorityCurrency) {
        const sourceMoney = money(
          authorityCurrency as Currency,
          BigInt(sourceAmountMinor as number),
        );
        const billingMoney =
          normalized.billingTreatment === 'reimbursable_plus_markup'
            ? add(sourceMoney, applyBasisPoints(sourceMoney, normalized.markupBps))
            : normalized.clientTreatment === 'reimbursable'
              ? sourceMoney
              : money(authorityCurrency as Currency, 0n);
        const taxMoney = applyBasisPoints(billingMoney, normalized.taxBps);
        const toSafeMinor = (value: bigint, field: string): number => {
          const converted = Number(value);
          if (!Number.isSafeInteger(converted) || converted < 0)
            return this.failValidation(`${field} is outside the supported exact-money range`);
          return converted;
        };
        projectCurrencyAmountMinor = sourceAmountMinor as number;
        billingAmountMinor = toSafeMinor(billingMoney.minorUnits, 'Billing amount');
        taxAmountMinor = toSafeMinor(taxMoney.minorUnits, 'Tax amount');
      }
      const seriesId = `ce-expense-classification-series-${sha256(
        `${deployment.tenantId}:${deployment.deploymentId}:${normalized.expenseId}`,
      ).slice(0, 40)}`;
      const revisionId = `ce-expense-classification-revision-${sha256(
        `${deployment.tenantId}:${deployment.deploymentId}:${normalized.expenseId}:${normalized.idempotencyKey}`,
      ).slice(0, 40)}`;
      const commandPayload = {
        schema_version: CLASSIFICATION_CONTRACT,
        revision_id: revisionId,
        series_id: seriesId,
        expense_id: normalized.expenseId,
        project_id: projectId,
        legal_entity_revision_id: legalEntityRevisionId,
        expected_version: normalized.expectedVersion,
        client_treatment: normalized.clientTreatment,
        billing_treatment: normalized.billingTreatment,
        markup_bps: normalized.markupBps,
        tax_bps: normalized.taxBps,
        source_currency: sourceCurrency,
        source_amount_minor: String(sourceAmountMinor),
        project_currency: projectCurrency,
        project_currency_amount_minor:
          projectCurrencyAmountMinor === null ? null : String(projectCurrencyAmountMinor),
        billing_amount_minor: billingAmountMinor === null ? null : String(billingAmountMinor),
        tax_amount_minor: taxAmountMinor === null ? null : String(taxAmountMinor),
        reason: normalized.reason,
      };
      const command = ensureCommand(
        this.deps.sqlite,
        deployment,
        principal,
        this.commandDescriptor(commandPayload, revisionId, normalized, proof, spentOn, createdAt),
        this.failConflict.bind(this),
      );

      const existingRevision = this.deps.sqlite
        .prepare(
          `SELECT id,series_id,expense_id,revision_number,predecessor_revision_id,
                  project_id,legal_entity_revision_id,command_id
             FROM expense_classification_revision WHERE id=?`,
        )
        .get(revisionId) as DbRow | undefined;
      if (existingRevision) {
        if (
          rowValue(existingRevision, 'series_id') !== seriesId ||
          rowValue(existingRevision, 'expense_id') !== normalized.expenseId ||
          rowValue(existingRevision, 'command_id') !== command.commandId
        )
          return this.failConflict('Expense classification replay is not exact');
        return {
          id: normalized.expenseId,
          version: normalized.expectedVersion + 1,
          classificationState: 'classified',
        };
      }

      const currentVersion = Number(rowValue(expense, 'version'));
      if (!Number.isSafeInteger(currentVersion) || currentVersion < 1)
        return this.failConflict('Expense version is invalid');
      if (currentVersion !== normalized.expectedVersion)
        return this.failConflict('Expense version is stale');

      const tail = this.deps.sqlite
        .prepare(
          `SELECT id,revision_number FROM expense_classification_revision
            WHERE series_id=? ORDER BY revision_number DESC LIMIT 1`,
        )
        .get(seriesId) as { id: string; revision_number: number } | undefined;
      const revisionNumber = (tail?.revision_number ?? 0) + 1;
      const predecessorRevisionId = tail?.id ?? null;
      if (!tail) {
        try {
          this.deps.sqlite
            .prepare(
              `INSERT INTO expense_classification_series(
                 id,expense_id,tenant_id,deployment_id,tail_revision_id,current_authority_event_id
               ) VALUES(?,?,?,?,NULL,NULL)`,
            )
            .run(seriesId, normalized.expenseId, deployment.tenantId, deployment.deploymentId);
        } catch (error) {
          if (isSqliteConflict(error))
            return this.failConflict('Expense classification series conflicted');
          throw error;
        }
      }

      // Operational intake preserves the legacy payer vocabulary
      // (`company_card`/`company_direct`), while the canonical finance
      // classification deliberately has one company category.  This is a
      // lossless normalization of the payer axis, not a financial amount
      // calculation.
      const classification =
        whoPaid === 'company_card' || whoPaid === 'company_direct'
          ? 'company'
          : (whoPaid as 'worker' | 'company' | 'client' | 'third_party');
      const responsibility =
        normalized.clientTreatment === 'reimbursable' ? 'client' : 'not_applicable';
      const billable =
        normalized.billingTreatment === 'reimbursable_at_cost' ||
        normalized.billingTreatment === 'reimbursable_plus_markup' ||
        normalized.billingTreatment === 'client_direct' ||
        normalized.billingTreatment === 'allowance_per_diem'
          ? 1
          : 0;
      const revisionBytes = Buffer.from(
        canonicalJson({
          schema_version: CLASSIFICATION_CONTRACT,
          revision_id: revisionId,
          series_id: seriesId,
          expense_id: normalized.expenseId,
          revision_number: revisionNumber,
          predecessor_revision_id: predecessorRevisionId,
          tenant_id: deployment.tenantId,
          deployment_id: deployment.deploymentId,
          project_id: projectId,
          legal_entity_revision_id: legalEntityRevisionId,
          currency: sourceCurrency,
          classification,
          responsibility,
          third_party_payer_kind: null,
          billable,
          markup_bps: normalized.markupBps,
          tax_bps: normalized.taxBps,
          source_amount_minor: String(sourceAmountMinor),
          project_currency: projectCurrency,
          project_currency_amount_minor:
            projectCurrencyAmountMinor === null ? null : String(projectCurrencyAmountMinor),
          billing_amount_minor: billingAmountMinor === null ? null : String(billingAmountMinor),
          tax_amount_minor: taxAmountMinor === null ? null : String(taxAmountMinor),
          effective_at: spentOn,
          expected_version: normalized.expectedVersion,
          reason: normalized.reason,
          created_at: createdAt,
          created_by: principal.userId,
          command_id: command.commandId,
        }),
      );
      const revisionHash = sha256(revisionBytes);
      const evidenceId = `ce-expense-classification-evidence-${revisionId}`;
      ensureEvidence(
        this.deps.sqlite,
        evidenceId,
        'expense_classification_revision',
        CLASSIFICATION_CONTRACT,
        `expense-classification:${revisionId}`,
        revisionBytes,
        createdAt,
        this.failConflict.bind(this),
      );
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO expense_classification_revision(
               id,series_id,expense_id,revision_number,predecessor_revision_id,
               tenant_id,deployment_id,project_id,legal_entity_revision_id,currency,
               classification,responsibility,third_party_payer_kind,billable,markup_bps,tax_bps,
               effective_at,reason,revision_hash,created_at,created_by,command_id
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            revisionId,
            seriesId,
            normalized.expenseId,
            revisionNumber,
            predecessorRevisionId,
            deployment.tenantId,
            deployment.deploymentId,
            projectId,
            legalEntityRevisionId,
            sourceCurrency,
            classification,
            responsibility,
            null,
            billable,
            normalized.markupBps,
            normalized.taxBps,
            spentOn,
            normalized.reason,
            revisionHash,
            createdAt,
            principal.userId,
            command.commandId,
          );
      } catch (error) {
        if (isSqliteConflict(error))
          return this.failConflict('Expense classification revision conflicted');
        throw error;
      }

      const authorityEventId = `ce-expense-classification-authority-${sha256(
        `${seriesId}:${revisionId}:${predecessorRevisionId ?? 'genesis'}`,
      ).slice(0, 40)}`;
      const authorityEventType = predecessorRevisionId ? 'supersede' : 'activate';
      const authorityEventHash = sha256(
        canonicalJson({
          schema_version: 'finance-authority-event-v1',
          authority_event_id: authorityEventId,
          series_id: seriesId,
          revision_id: revisionId,
          prior_authority_event_id:
            rowValue<string | null>(
              this.deps.sqlite
                .prepare(
                  'SELECT current_authority_event_id FROM expense_classification_series WHERE id=?',
                )
                .get(seriesId) as DbRow | undefined,
              'current_authority_event_id',
            ) ?? null,
          event_type: authorityEventType,
          effective_at: spentOn,
          reason: normalized.reason,
          principal_id: principal.userId,
          command_id: command.commandId,
          created_at: createdAt,
        }),
      );
      const currentAuthorityEventId =
        rowValue<string | null>(
          this.deps.sqlite
            .prepare(
              'SELECT current_authority_event_id FROM expense_classification_series WHERE id=?',
            )
            .get(seriesId) as DbRow | undefined,
          'current_authority_event_id',
        ) ?? null;
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO expense_classification_authority_event(
               id,series_id,revision_id,prior_authority_event_id,event_type,effective_at,
               reason,principal_id,command_id,event_hash,created_at
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            authorityEventId,
            seriesId,
            revisionId,
            currentAuthorityEventId,
            authorityEventType,
            spentOn,
            normalized.reason,
            principal.userId,
            command.commandId,
            authorityEventHash,
            createdAt,
          );
      } catch (error) {
        if (isSqliteConflict(error))
          return this.failConflict('Expense classification authority conflicted');
        throw error;
      }

      const pointerUpdate = currentAuthorityEventId
        ? this.deps.sqlite
            .prepare(
              `UPDATE expense_classification_series
                  SET tail_revision_id=?,current_authority_event_id=?
                WHERE id=? AND tail_revision_id=? AND current_authority_event_id=?`,
            )
            .run(
              revisionId,
              authorityEventId,
              seriesId,
              predecessorRevisionId,
              currentAuthorityEventId,
            )
        : this.deps.sqlite
            .prepare(
              `UPDATE expense_classification_series
                  SET tail_revision_id=?,current_authority_event_id=?
                WHERE id=? AND tail_revision_id IS NULL AND current_authority_event_id IS NULL`,
            )
            .run(revisionId, authorityEventId, seriesId);
      if (pointerUpdate.changes !== 1)
        return this.failConflict('Expense classification authority changed concurrently');

      const projection = this.deps.sqlite
        .prepare(
          `UPDATE expense
              SET client_treatment=?,billing_treatment=?,markup_bps=?,
                  billing_amount_minor=?,project_currency_amount_minor=?,
                  tax_amount_minor=?,fx_rate_bps=NULL,
                  commercial_classification_state='classified',version=version+1,updated_at=?
            WHERE id=? AND version=? AND invoice_id IS NULL
              AND billing_state='unlocked' AND billing_lock_id IS NULL`,
        )
        .run(
          normalized.clientTreatment,
          normalized.billingTreatment,
          normalized.markupBps,
          billingAmountMinor,
          projectCurrencyAmountMinor,
          taxAmountMinor,
          createdAt,
          normalized.expenseId,
          normalized.expectedVersion,
        );
      if (projection.changes !== 1)
        return this.failConflict('Expense changed or became locked during classification');

      this.appendFinanceChange(
        deployment,
        normalized.expenseId,
        evidenceId,
        revisionHash,
        command.commandId,
        spentOn,
        createdAt,
      );
      recordAuditEvent(
        this.deps.sqlite,
        { ...principal, correlationId: command.commandId },
        'expense.classify',
        'expense',
        normalized.expenseId,
        {
          projectId,
          before: {
            clientTreatment: rowValue(expense, 'client_treatment'),
            billingTreatment: rowValue(expense, 'billing_treatment'),
            markupBps: rowValue(expense, 'markup_bps'),
            billingAmountMinor: rowValue(expense, 'billing_amount_minor'),
            projectCurrencyAmountMinor: rowValue(expense, 'project_currency_amount_minor'),
            taxAmountMinor: rowValue(expense, 'tax_amount_minor'),
            fxRateBps: rowValue(expense, 'fx_rate_bps'),
            version: normalized.expectedVersion,
            classificationState: rowValue(expense, 'commercial_classification_state'),
          },
          after: {
            clientTreatment: normalized.clientTreatment,
            billingTreatment: normalized.billingTreatment,
            markupBps: normalized.markupBps,
            billingAmountMinor,
            projectCurrencyAmountMinor,
            taxAmountMinor,
            fxRateBps: null,
            version: normalized.expectedVersion + 1,
            classificationState: 'classified',
            revisionId,
          },
          reason: normalized.reason,
          commandId: command.commandId,
          commandHash: command.commandHash,
        },
      );
      return {
        id: normalized.expenseId,
        version: normalized.expectedVersion + 1,
        classificationState: 'classified',
      };
    });
  }
}
