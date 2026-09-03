import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  billableMinutesForDailyMinimum,
  chooseMostSpecificRate,
  overtimeRate,
  percentageOfEligibleClientLabor,
  type OvertimeMethod,
} from '@ja/billing-engine';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import {
  applyBasisPoints,
  divideRounded,
  hourlyRateForMinutes,
  money,
  type Currency,
} from '@ja/money';
import {
  dailyReportInputSchema,
  expenseInputSchema,
  technicalReportInputSchema,
  timeInputSchema,
} from '@ja/schemas';
import { recordAuditEvent } from './core/audit.ts';
import {
  assertActiveAccount,
  assertRecentStepUp,
  readLiveSessionStepUp,
} from './core/authorization.ts';
import { canonicalJson, sha256 as canonicalSha256 } from './core/canonical-json.ts';
import { verifyPrivatePdfArtifact } from './core/private-pdf-proof.ts';
import { assertSafeStorageKey } from './core/storage-key.ts';
import { runImmediateTransaction } from './core/transaction.ts';
import { runDueConfiguredDurableJobsSync, type DurableJobExecutionContext } from './runner.ts';
import {
  DURABLE_JOB_CAPABILITY_BY_KIND,
  canonicalJobJson,
  jobPayloadHash,
} from './domains/jobs/job-contract.ts';
import {
  assertFencedJobExecution,
  type FencedJobExecution,
} from './domains/jobs/execution-authorization.ts';
import {
  TechnicalChangeRepository,
  type TechnicalChangeInput,
} from './domains/technical-changes/technical-change-repository.ts';
import {
  AccountingPackRevisionService,
  type AccountingPackRevisionResult,
  type AccountingPackSnapshotInput,
} from './domains/accounting-pack/index.ts';
import { ensureCommand } from './domains/finance/finance-command-writer.ts';
import {
  CustomerConformityRepository,
  assertCustomerPeriodSnapshotSafe,
  canonicalCustomerPeriodSnapshot,
  type CustomerConformity,
  type CustomerConformityInput,
  type CustomerConformityInvalidation,
  type CustomerConformitySafeView,
} from './domains/reports/customer-conformity-repository.ts';
import {
  PeriodReportLifecycleRepository,
  type PeriodReportApprovalInput,
  type PeriodReportApprovalResult,
} from './domains/reports/period-report-lifecycle-repository.ts';
import {
  CanonicalProjectLegalEntityRepository,
  type CanonicalLegalEntityInput,
  type CanonicalLegalEntityRevisionResult,
  type ProjectLegalEntityAssignmentInput,
  type ProjectLegalEntityAssignmentResult,
  type CanonicalLegalEntityRevisionOption,
  type ProjectLegalEntityAssignmentView,
  type ResolvedCanonicalProjectLegalEntity,
} from './domains/finance/canonical-project-legal-entity-repository.ts';
import { resolveAccountingPackProjectLegalEntity } from './domains/finance/accounting-pack-revision-service.ts';
import {
  deriveTimeCommercialSlices,
  type TimeCommercialSlice,
} from './domains/commercial/time-commercial-slices.ts';

export class V3AccessDeniedError extends Error {}
export class V3ConflictError extends Error {}
export class V3ValidationError extends Error {}
export class V3NotFoundError extends Error {}

type DbValue = string | number | bigint | null;
type OutputValue = DbValue | boolean;
type SafeStorageKey = string;
type V3Currency = Currency;

// Each Worker Statement artifact attempt owns one durable job. A failed handler must terminalize
// that obsolete payload because the authorized artifact retry creates a fresh job for the next
// attempt. Other durable kinds retain the shared bounded retry budget.
const WORKER_STATEMENT_ARTIFACT_RENDER_JOB_KIND = 'worker_statement_artifact_render' as const;
type ReportLocale = 'en' | 'pt' | 'es';

export type ReportAttachmentType = 'daily' | 'technical';
export type ReportAttachmentKind =
  | 'daily_attachment'
  | 'technical_attachment'
  | 'plc_backup_before'
  | 'plc_backup_after';

export type ReportAttachmentReservationInput = Readonly<{
  reportType: ReportAttachmentType;
  reportId: string;
  attachmentKind: ReportAttachmentKind;
  originalFilename: string;
  description?: string;
  sensitivity?: 'internal' | 'sensitive' | 'customer_private';
  supersedesDocumentId?: string;
}>;

export type ReportAttachmentFinalizeInput = Readonly<{
  sha256: string;
  mediaType: string;
  byteLength: number;
}>;

type ReportAttachmentContext = Readonly<{
  reportType: ReportAttachmentType;
  reportId: string;
  projectId: string;
  ownerId: string;
  objectDate: string;
  approvalState: string;
  systemReferenceSnapshot: string | null;
}>;
type DueJobHandler = (
  payload: unknown,
  context: DurableJobExecutionContext,
) => void | Promise<void> | (() => void);
export type DocumentScanExecutionProof = Readonly<{
  jobId: string;
  runId: string;
  tenantId: string;
  deploymentId: string;
  requiredCapability: string;
  fenceVersion: number;
}>;
type OutboxEvent = Readonly<{
  id: string;
  topic: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: unknown;
  attempts: number;
}>;
type DueOutboxHandler = (event: OutboxEvent) => void | Promise<void>;

const normalizeReportLocale = (value: unknown): ReportLocale =>
  value === 'pt' || value === 'es' ? value : 'en';

type ArtifactClassification =
  | 'standard'
  | 'receipt'
  | 'finance'
  | 'identity'
  | 'hr'
  | 'security'
  | 'confidential';
const ARTIFACT_CLASSIFICATIONS: readonly ArtifactClassification[] = [
  'standard',
  'receipt',
  'finance',
  'identity',
  'hr',
  'security',
  'confidential',
];

function resolveArtifactClassification(
  artifactType: string,
  requested: ArtifactClassification | undefined,
): ArtifactClassification {
  const classification = requested ?? (artifactType === 'receipt' ? 'receipt' : 'standard');
  if (!ARTIFACT_CLASSIFICATIONS.includes(classification))
    throw new V3ValidationError('Document classification is invalid');
  return classification;
}

type CompensationInput = Readonly<{
  workerId: string;
  projectId?: string;
  currency: V3Currency;
  ruleType:
    | 'Hourly'
    | 'Daily'
    | 'FixedPerBillingPeriod'
    | 'FixedProjectAmount'
    | 'PercentageOfEligibleClientLabor'
    | 'CustomApprovedAdjustment';
  rateMinor?: bigint;
  rateBasis?: 'hourly' | 'daily';
  percentageBps?: number;
  percentageBasis?:
    | 'CLIENT_LABOR_BEFORE_TAX'
    | 'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT'
    | 'ISSUED_ELIGIBLE_LABOR'
    | 'COLLECTED_ELIGIBLE_LABOR';
  settlementTrigger?: 'ON_APPROVED_BILLABLE_LABOR' | 'ON_INVOICE_ISSUE' | 'ON_CLIENT_PAYMENT';
  dailyGuaranteeMinutes?: number;
  overtimeMethod?: OvertimeMethod;
  overtimeMultiplierBps?: number;
  overtimeRateMinor?: bigint;
  weekendMethod?:
    | 'BASE'
    | 'NONE'
    | 'FIXED_RATE'
    | 'BASE_RATE_MULTIPLIER'
    | 'FIXED_ADDITION_PER_HOUR';
  travelMethod?:
    | 'BASE'
    | 'NONE'
    | 'FIXED_RATE'
    | 'BASE_RATE_MULTIPLIER'
    | 'FIXED_ADDITION_PER_HOUR';
  standbyMethod?:
    | 'BASE'
    | 'NONE'
    | 'FIXED_RATE'
    | 'BASE_RATE_MULTIPLIER'
    | 'FIXED_ADDITION_PER_HOUR';
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}>;

type LaborRateInput = Readonly<{
  projectId: string;
  workerId?: string;
  category?: string;
  currency: V3Currency;
  hourlyRateMinor: bigint;
  effectiveFrom: string;
  effectiveTo?: string;
  overtimeMethod?: OvertimeMethod;
  overtimeMultiplierBps?: number;
  overtimeRateMinor?: bigint;
  eligibleForPercentage?: boolean;
  notes?: string;
}>;

type InternalCostInput = Readonly<{
  workerId: string;
  projectId?: string;
  currency: V3Currency;
  hourlyRateMinor: bigint;
  effectiveFrom: string;
  effectiveTo?: string;
  overtimeMethod?: OvertimeMethod;
  overtimeMultiplierBps?: number;
  overtimeRateMinor?: bigint;
  costMethod?: string;
  notes?: string;
}>;

type OverrideInput = Readonly<{
  projectMemberId: string;
  timeCategory?: string;
  activityCode?: string;
  compensationRuleId?: string;
  internalCostRuleId?: string;
  clientLaborRateId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  priority?: number;
}>;

type TimeRow = {
  id: string;
  project_id: string;
  worker_id: string;
  work_date: string;
  category: string;
  activity_code: string | null;
  minutes: number;
  approval_state: string;
  billability_state: string;
  billing_status?: string;
  invoice_id?: string | null;
  version?: number;
  project_currency: V3Currency;
};

type EffectiveTimeCommercialPolicy = Readonly<{
  id: string;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
}>;

type CompensationRuleRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: V3Currency;
  rate_minor: string;
  rate_basis: string;
  daily_guarantee_minutes: number | null;
  rule_type: string;
  percentage_bps: number | null;
  percentage_basis: string | null;
  settlement_trigger: string;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  weekend_method: string;
  travel_method: string;
  standby_method: string;
  effective_from: string;
};

type LaborRateRow = {
  id: string;
  project_id: string;
  worker_id: string | null;
  category: string | null;
  currency: V3Currency;
  hourly_rate_minor: string;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  eligible_for_percentage: number;
  effective_from: string;
};

type InternalCostRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: V3Currency;
  hourly_rate_minor: string;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  effective_from: string;
};

type SettlementBasis =
  | 'CLIENT_LABOR_BEFORE_TAX'
  | 'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT'
  | 'ISSUED_ELIGIBLE_LABOR'
  | 'COLLECTED_ELIGIBLE_LABOR';

const accountingPackExportTypes = ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'] as const;
type AccountingPackExportType = (typeof accountingPackExportTypes)[number];
const requiredAccountingPackExportTypes = [
  'xlsx',
  'invoice_csv',
  'expense_csv',
] as const satisfies readonly AccountingPackExportType[];

const timestamp = (): string => new Date().toISOString();
const isoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
const CUSTOMER_PERIOD_REPORT_PRIVACY_VERSION = '2026.08.24.customer-period-safe-v1';

/**
 * A scanner is a release gate only when the application is running in
 * production and a scanner is actually configured.  Keep this predicate in
 * one place so reservation finalization and every authorization path cannot
 * drift into different interpretations of the deployment contract.
 */
function malwareScannerRequired(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    (process.env.JA_MALWARE_SCANNER_REQUIRED === 'true' ||
      Boolean(process.env.JA_MALWARE_SCANNER_URL?.trim()))
  );
}

/**
 * A disabled scanner is an explicit, truthful state rather than an implicit
 * approval.  In particular, a row carrying `clean` must never be treated as
 * scanner-disabled evidence: that value can only come from an authorized
 * scanner execution while scanning is required.  Keeping this predicate
 * shared by every private download boundary prevents one route from silently
 * becoming an arbitrary-scan-status bypass.
 */
function scannerStatusAllowsPrivateDownload(
  status: string | null | undefined,
  scannerRequired: boolean,
): boolean {
  return scannerRequired ? status === 'clean' : status === 'not_scanned';
}

function requireDate(value: string, field: string): void {
  if (!isoDate(value)) throw new V3ValidationError(`${field} must be an ISO date`);
}

function requireDateTime(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
    throw new V3ValidationError(`${field} must be an RFC3339 UTC timestamp`);
  if (Number.isNaN(Date.parse(value))) throw new V3ValidationError(`${field} is invalid`);
}

function canonicalUtcTimestamp(value: string, field: string): string {
  requireDateTime(value, field);
  return new Date(Date.parse(value)).toISOString();
}

function shiftIsoDate(value: string, days: number): string {
  requireDate(value, 'Date');
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function requireText(value: string, field: string, max = 5000): string {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new V3ValidationError(`${field} is required`);
  return clean;
}

function sqliteInteger(value: bigint, field: string): bigint {
  const sqliteMin = -9223372036854775808n;
  const sqliteMax = 9223372036854775807n;
  if (value < sqliteMin || value > sqliteMax)
    throw new V3ValidationError(`${field} is out of range`);
  return value;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function isPendingApproval(value: string): boolean {
  return value === 'draft' || value === 'submitted' || value === 'needs_changes';
}

export class V3Repository {
  private readonly sqlite: DatabaseSync;
  private readonly technicalChanges: TechnicalChangeRepository;
  private readonly accountingPackRevisions: AccountingPackRevisionService;
  private readonly customerConformities: CustomerConformityRepository;
  private readonly periodReportLifecycle: PeriodReportLifecycleRepository;
  private readonly canonicalProjectLegalEntities: CanonicalProjectLegalEntityRepository;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
    this.accountingPackRevisions = new AccountingPackRevisionService(this.sqlite);
    this.canonicalProjectLegalEntities = new CanonicalProjectLegalEntityRepository({
      sqlite: this.sqlite,
      transaction: <T>(work: () => T): T => this.transaction(work),
      now: timestamp,
      errors: {
        accessDenied: (message) => {
          throw new V3AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new V3ConflictError(message);
        },
        validation: (message) => {
          throw new V3ValidationError(message);
        },
      },
    });
    this.customerConformities = new CustomerConformityRepository({
      sqlite: this.sqlite,
      transaction: <T>(work: () => T): T => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertProjectAccess: (principal, projectId, allowAuditor) =>
        this.assertProjectAccess(principal, projectId, allowAuditor),
      assertStepUp: (principal) => this.assertCustomerConformityStepUp(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now: timestamp,
      errors: {
        accessDenied: (message) => {
          throw new V3AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new V3ConflictError(message);
        },
        validation: (message) => {
          throw new V3ValidationError(message);
        },
      },
    });
    this.periodReportLifecycle = new PeriodReportLifecycleRepository({
      sqlite: this.sqlite,
      transaction: <T>(work: () => T): T => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertProjectAccess: (principal, projectId) =>
        this.assertOperationalReviewer(principal, projectId),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now: timestamp,
      errors: {
        accessDenied: (message) => {
          throw new V3AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new V3ConflictError(message);
        },
        validation: (message) => {
          throw new V3ValidationError(message);
        },
      },
    });
    this.technicalChanges = new TechnicalChangeRepository({
      sqlite: this.sqlite,
      transaction: <T>(work: () => T): T => this.transaction(work),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      assertActive: (principal) => this.assertActive(principal),
      assertWritable: (principal) => this.assertWritable(principal),
      assertProjectAccess: (principal, projectId) => this.assertProjectAccess(principal, projectId),
      canReviewProject: (principal, projectId) => this.canOperationallyReview(principal, projectId),
      newId,
      timestamp,
      requireText: (value, field, max) => requireText(value, field, max),
      errors: {
        accessDenied: (message) => new V3AccessDeniedError(message),
        conflict: (message) => new V3ConflictError(message),
        validation: (message) => new V3ValidationError(message),
      },
    });
  }

  /**
   * Creates the immutable B6 Accounting Pack revision used by localized PDF
   * variants.  The legacy `createAccountingPack` method remains available for
   * the compatibility UI; new callers should use this canonical projection.
   */
  createCanonicalAccountingPackRevision(
    principal: Principal,
    input: AccountingPackSnapshotInput,
  ): AccountingPackRevisionResult {
    return this.accountingPackRevisions.createCanonicalRevision(principal, input);
  }

  /**
   * Compatibility spelling for callers that use the domain operation name.
   * Both entry points delegate to the same immutable revision service.
   */
  createAccountingPackRevision(
    principal: Principal,
    input: AccountingPackSnapshotInput,
  ): AccountingPackRevisionResult {
    return this.accountingPackRevisions.createCanonicalRevision(principal, input);
  }

  createCanonicalLegalEntityRevision(
    principal: Principal,
    input: CanonicalLegalEntityInput,
  ): CanonicalLegalEntityRevisionResult {
    return this.canonicalProjectLegalEntities.createCanonicalLegalEntityRevision(principal, input);
  }

  assignCanonicalLegalEntityToProject(
    principal: Principal,
    input: ProjectLegalEntityAssignmentInput,
  ): ProjectLegalEntityAssignmentResult {
    return this.canonicalProjectLegalEntities.assignCanonicalLegalEntityToProject(principal, input);
  }

  listCanonicalLegalEntityRevisionOptions(
    principal: Principal,
  ): CanonicalLegalEntityRevisionOption[] {
    return this.canonicalProjectLegalEntities.listCanonicalLegalEntityRevisionOptions(principal);
  }

  listProjectLegalEntityAssignments(
    principal: Principal,
    projectId: string,
  ): ProjectLegalEntityAssignmentView[] {
    return this.canonicalProjectLegalEntities.listProjectLegalEntityAssignments(
      principal,
      projectId,
    );
  }

  resolveCanonicalProjectLegalEntity(
    principal: Principal,
    projectId: string,
    onDate: string,
  ): ResolvedCanonicalProjectLegalEntity {
    return this.canonicalProjectLegalEntities.resolveCanonicalProjectLegalEntity(
      principal,
      projectId,
      onDate,
    );
  }

  private transaction<T>(work: () => T): T {
    return runImmediateTransaction(this.sqlite, 'v3', work);
  }

  private ensureFinanceEvidence(
    evidenceType: 'finance_request' | 'finance_command' | 'payment_record' | 'payment_reversal',
    contractVersion: string,
    semanticId: string,
    value: unknown,
    createdAt: string,
  ): { id: string; hash: string } {
    const canonical = canonicalJobJson(value);
    const blob = Buffer.from(canonical);
    const hash = createHash('sha256').update(blob).digest('hex');
    const id = `finance-evidence-${hash.slice(0, 48)}`;
    const semanticOwner = this.sqlite
      .prepare(
        `SELECT evidence_id,evidence_hash,canonical_blob FROM finance_hash_evidence
         WHERE evidence_type=? AND contract_version=? AND semantic_id=?`,
      )
      .get(evidenceType, contractVersion, semanticId) as
      | { evidence_id: string; evidence_hash: string; canonical_blob: Uint8Array }
      | undefined;
    if (semanticOwner) {
      if (
        semanticOwner.evidence_hash !== hash ||
        !Buffer.from(semanticOwner.canonical_blob).equals(blob)
      )
        throw new V3ConflictError('Finance evidence semantic identity conflict');
      return { id: semanticOwner.evidence_id, hash };
    }
    const existing = this.sqlite
      .prepare(
        `SELECT evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash
         FROM finance_hash_evidence WHERE evidence_id=?`,
      )
      .get(id) as
      | {
          evidence_type: string;
          contract_version: string;
          semantic_id: string;
          canonical_blob: Uint8Array;
          evidence_hash: string;
        }
      | undefined;
    if (existing) {
      if (
        existing.evidence_type !== evidenceType ||
        existing.contract_version !== contractVersion ||
        existing.semantic_id !== semanticId ||
        existing.evidence_hash !== hash ||
        !Buffer.from(existing.canonical_blob).equals(blob)
      )
        throw new V3ConflictError('Finance evidence identity conflict');
      return { id, hash };
    }
    this.sqlite
      .prepare(
        `INSERT INTO finance_hash_evidence(
           evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
         ) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(id, evidenceType, contractVersion, semanticId, blob, hash, createdAt);
    return { id, hash };
  }

  private ensurePaymentReversalCommand(
    principal: Principal,
    descriptor: Readonly<{
      paymentId: string;
      invoiceId: string;
      currency: V3Currency;
      amountMinor: bigint;
      effectiveAt: string;
      reasonCode: string;
      reasonText: string;
      idempotencyKey: string;
      createdAt: string;
    }>,
  ): { commandId: string; created: boolean } {
    const identity = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!identity) throw new V3ValidationError('Deployment identity is not configured');
    const payload = {
      schema_version: 'invoice-payment-reversal-v1',
      original_payment_id: descriptor.paymentId,
      invoice_id: descriptor.invoiceId,
      currency: descriptor.currency,
      amount_minor: descriptor.amountMinor.toString(),
      effective_at: descriptor.effectiveAt,
      reason_code: descriptor.reasonCode,
      reason_text: descriptor.reasonText,
    };
    const payloadHash = createHash('sha256').update(canonicalJobJson(payload)).digest('hex');
    const sessionHash = createHash('sha256')
      .update(principal.sessionId ?? `interactive:${principal.userId}`)
      .digest('hex');
    const targetSemanticId = `payment-reversal:${descriptor.paymentId}:${createHash('sha256')
      .update(descriptor.idempotencyKey)
      .digest('hex')}`;
    const requestValue = {
      schema_version: 'finance-command-request-v1',
      tenant_id: identity.tenant_id,
      deployment_id: identity.deployment_id,
      operation: 'payment.reverse',
      idempotency_key: descriptor.idempotencyKey,
      principal_id: principal.userId,
      effective_at: descriptor.effectiveAt,
      target_kind: 'invoice_payment_reversal',
      target_semantic_id: targetSemanticId,
      amount_minor: descriptor.amountMinor.toString(),
      currency: descriptor.currency,
      payload_hash: payloadHash,
      session_id_hash: sessionHash,
    };
    const request = this.ensureFinanceEvidence(
      'finance_request',
      'finance-command-request-v1',
      `payment-reversal-request:${identity.tenant_id}:${identity.deployment_id}:${descriptor.idempotencyKey}`,
      requestValue,
      descriptor.createdAt,
    );
    const commandValue = {
      schema_version: 'finance-command-v1',
      request_hash: request.hash,
      operation: 'payment.reverse',
      target_kind: 'invoice_payment_reversal',
      target_semantic_id: targetSemanticId,
      target_contract_version: 'invoice-payment-reversal-v1',
      payload_hash: payloadHash,
    };
    const commandEvidence = this.ensureFinanceEvidence(
      'finance_command',
      'finance-command-v1',
      `payment-reversal-command:${identity.tenant_id}:${identity.deployment_id}:${descriptor.idempotencyKey}`,
      commandValue,
      descriptor.createdAt,
    );
    const commandId = `finance-command-${commandEvidence.hash.slice(0, 48)}`;
    const existing = this.sqlite
      .prepare(
        `SELECT command_id,request_hash,command_hash,principal_id,effective_at,target_semantic_id,
                  CAST(amount_minor AS TEXT) amount_minor,currency,payload_hash,session_id_hash,state
         FROM finance_command
         WHERE tenant_id=? AND deployment_id=? AND operation='payment.reverse' AND idempotency_key=?`,
      )
      .get(identity.tenant_id, identity.deployment_id, descriptor.idempotencyKey) as
      | {
          command_id: string;
          request_hash: string;
          command_hash: string;
          principal_id: string;
          effective_at: string;
          target_semantic_id: string;
          amount_minor: string;
          currency: string;
          payload_hash: string;
          session_id_hash: string;
          state: string;
        }
      | undefined;
    if (existing) {
      if (
        existing.request_hash !== request.hash ||
        existing.command_hash !== commandEvidence.hash ||
        existing.principal_id !== principal.userId ||
        existing.effective_at !== descriptor.effectiveAt ||
        existing.target_semantic_id !== targetSemanticId ||
        existing.amount_minor !== descriptor.amountMinor.toString() ||
        existing.currency !== descriptor.currency ||
        existing.payload_hash !== payloadHash ||
        existing.session_id_hash !== sessionHash ||
        existing.state !== 'completed'
      )
        throw new V3ConflictError(
          'Payment reversal idempotency key was already used for another command',
        );
      return { commandId: existing.command_id, created: false };
    }
    const stepUp = readLiveSessionStepUp(this.sqlite, principal);
    const stepUpAt = stepUp?.verifiedAt ?? null;
    const stepUpExpiresAt = stepUp?.expiresAt ?? null;
    this.sqlite
      .prepare(
        `INSERT INTO finance_command(
           command_id,request_hash,command_hash,tenant_id,deployment_id,operation,idempotency_key,
           principal_id,effective_at,target_kind,target_semantic_id,amount_minor,currency,payload_hash,
           session_id_hash,step_up_verified_at,step_up_expires_at,policy_revision_id,policy_hash,
           state,completed_at,created_at
         ) VALUES(?,?,?,?,?,'payment.reverse',?,?,?,?,?,?,?,?,?,?,?,?,?,'completed',?,?)`,
      )
      .run(
        commandId,
        request.hash,
        commandEvidence.hash,
        identity.tenant_id,
        identity.deployment_id,
        descriptor.idempotencyKey,
        principal.userId,
        descriptor.effectiveAt,
        'invoice_payment_reversal',
        targetSemanticId,
        sqliteInteger(descriptor.amountMinor, 'Payment reversal'),
        descriptor.currency,
        payloadHash,
        sessionHash,
        stepUpAt,
        stepUpExpiresAt,
        null,
        null,
        descriptor.createdAt,
        descriptor.createdAt,
      );
    this.sqlite
      .prepare(
        `INSERT INTO finance_command_target(
           command_id,target_kind,target_semantic_id,target_contract_version
         ) VALUES(?,?,?,'invoice-payment-reversal-v1')`,
      )
      .run(commandId, 'invoice_payment_reversal', targetSemanticId);
    return { commandId, created: true };
  }

  private assertActive(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, V3AccessDeniedError);
  }

  private assertWritable(principal: Principal): void {
    this.assertActive(principal);
    if (principal.role === 'auditor_read_only') throw new V3AccessDeniedError('Read-only role');
  }

  private assertFinance(principal: Principal): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new V3AccessDeniedError('Finance role required');
  }

  private assertFinanceReadable(principal: Principal): void {
    this.assertActive(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new V3AccessDeniedError('Finance role required');
  }

  private assertStepUp(principal: Principal): void {
    assertRecentStepUp(this.sqlite, principal, V3AccessDeniedError);
  }

  private assertCustomerConformityStepUp(principal: Principal): void {
    this.assertStepUp(principal);
  }

  private assertProjectAccess(principal: Principal, projectId: string, allowAuditor = false): void {
    this.assertActive(principal);
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') return;
    if (allowAuditor && principal.role === 'auditor_read_only') return;
    if (!principal.projectIds.has(projectId))
      throw new V3AccessDeniedError('Project access required');
    const current = new Date().toISOString().slice(0, 10);
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1",
      )
      .get(projectId, principal.userId, current, current);
    if (!assignment) throw new V3AccessDeniedError('Project access required');
  }

  private canOperationallyReview(principal: Principal, projectId: string): boolean {
    this.assertActive(principal);
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') return true;
    if (principal.role !== 'project_manager' || !principal.projectIds.has(projectId)) return false;
    const current = new Date().toISOString().slice(0, 10);
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1 FROM project_member
            WHERE project_id=? AND user_id=? AND status='active' AND can_review=1
              AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)
            LIMIT 1`,
        )
        .get(projectId, principal.userId, current, current),
    );
  }

  private assertOperationalReviewer(principal: Principal, projectId: string): void {
    if (!this.canOperationallyReview(principal, projectId))
      throw new V3AccessDeniedError('Project review required');
  }

  private assertActiveLaborWorker(workerId: string): void {
    const worker = this.sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(workerId) as
      | { role: string; status: string }
      | undefined;
    if (
      !worker ||
      worker.status !== 'active' ||
      (worker.role !== 'worker' && worker.role !== 'project_manager')
    )
      throw new V3ValidationError('Active worker or project manager account required');
  }

  private assertWorkerProjectMembership(
    workerId: string,
    projectId: string,
    startsOn: string,
    endsOn: string = startsOn,
  ): void {
    const assignment = this.sqlite
      .prepare(
        `SELECT 1
         FROM project_member pm
         JOIN user u ON u.id=pm.user_id
         WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
           AND u.status='active' AND u.role IN ('worker','project_manager')
           AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
         LIMIT 1`,
      )
      .get(projectId, workerId, startsOn, endsOn);
    if (!assignment)
      throw new V3ValidationError('Worker is not assigned to the project for the effective period');
  }

  private assertOfflineAssignment(
    principal: Principal,
    projectId: string,
    workDate?: string,
  ): void {
    this.assertProjectAccess(principal, projectId);
    const date = workDate ?? new Date().toISOString().slice(0, 10);
    requireDate(date, 'Work date');
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
      )
      .get(projectId, principal.userId, date, date);
    if (!assignment) throw new V3AccessDeniedError('Active project assignment required');
  }

  private audit(
    principal: Principal | null,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ): void {
    recordAuditEvent(this.sqlite, principal, action, entityType, entityId, details);
  }

  createCompensationRule(principal: Principal, input: CompensationInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    this.assertActiveLaborWorker(input.workerId);
    if (input.ruleType === 'PercentageOfEligibleClientLabor') {
      if (
        !Number.isInteger(input.percentageBps) ||
        (input.percentageBps ?? -1) < 0 ||
        (input.percentageBps ?? 10001) > 10000
      )
        throw new V3ValidationError(
          'Percentage compensation requires basis points from 0 to 10000',
        );
      if (!input.percentageBasis) throw new V3ValidationError('Percentage basis is required');
    }
    if (
      [
        'Hourly',
        'Daily',
        'FixedPerBillingPeriod',
        'FixedProjectAmount',
        'CustomApprovedAdjustment',
      ].includes(input.ruleType) &&
      input.rateMinor === undefined
    )
      throw new V3ValidationError('A compensation rate is required for this rule');
    if (
      input.ruleType !== 'PercentageOfEligibleClientLabor' &&
      input.overtimeMethod !== 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME' &&
      input.percentageBps !== undefined
    )
      throw new V3ValidationError('Percentage basis points are only valid for percentage rules');
    if (
      input.dailyGuaranteeMinutes !== undefined &&
      (!Number.isInteger(input.dailyGuaranteeMinutes) ||
        input.dailyGuaranteeMinutes < 0 ||
        input.dailyGuaranteeMinutes > 1440)
    )
      throw new V3ValidationError('Daily guarantee must be between 0 and 1440 minutes');
    if (
      input.overtimeMultiplierBps !== undefined &&
      (!Number.isInteger(input.overtimeMultiplierBps) || input.overtimeMultiplierBps < 0)
    )
      throw new V3ValidationError('Overtime multiplier is invalid');
    if (input.rateMinor !== undefined && input.rateMinor < 0n)
      throw new V3ValidationError('Rate cannot be negative');
    if (input.overtimeMethod === 'FIXED_RATE' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A fixed overtime rate is required');
    if (input.overtimeMethod === 'FIXED_ADDITION_PER_HOUR' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A fixed overtime addition is required');
    if (
      input.overtimeMethod === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME' &&
      input.percentageBps === undefined
    )
      throw new V3ValidationError('Overtime percentage basis points are required');
    if (input.projectId) {
      this.assertProjectAccess(principal, input.projectId);
      this.assertWorkerProjectMembership(
        input.workerId,
        input.projectId,
        input.effectiveFrom,
        input.effectiveTo ?? input.effectiveFrom,
      );
      const project = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: V3Currency } | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      if (project.currency !== input.currency)
        throw new V3ValidationError('Compensation currency must match the project currency');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO compensation_rule(
          id,worker_id,project_id,currency,rate_minor,rate_basis,daily_guarantee_minutes,
          worker_visible,effective_from,effective_to,created_at,updated_at,rule_type,
          percentage_bps,percentage_basis,settlement_trigger,overtime_method,
          overtime_multiplier_bps,overtime_rate_minor,weekend_method,travel_method,standby_method,
          fixed_period_minor,fixed_project_minor,notes
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        sqliteInteger(input.rateMinor ?? 0n, 'Compensation rate'),
        input.rateBasis ?? (input.ruleType === 'Daily' ? 'daily' : 'hourly'),
        input.dailyGuaranteeMinutes ?? null,
        1,
        input.effectiveFrom,
        input.effectiveTo ?? null,
        now,
        now,
        input.ruleType,
        input.percentageBps ?? null,
        input.percentageBasis ?? null,
        input.settlementTrigger ?? 'ON_APPROVED_BILLABLE_LABOR',
        input.overtimeMethod ?? 'NONE',
        input.overtimeMultiplierBps ?? null,
        input.overtimeRateMinor === undefined
          ? null
          : sqliteInteger(input.overtimeRateMinor, 'Overtime rate'),
        input.weekendMethod ?? 'BASE',
        input.travelMethod ?? 'BASE',
        input.standbyMethod ?? 'BASE',
        input.ruleType === 'FixedPerBillingPeriod'
          ? sqliteInteger(input.rateMinor ?? 0n, 'Fixed period amount')
          : null,
        input.ruleType === 'FixedProjectAmount'
          ? sqliteInteger(input.rateMinor ?? 0n, 'Fixed project amount')
          : null,
        input.notes ?? null,
      );
    this.audit(principal, 'compensation_rule.create', 'compensation_rule', id, {
      workerId: input.workerId,
      projectId: input.projectId ?? null,
      ruleType: input.ruleType,
    });
    return { id };
  }

  createInvitation(
    principal: Principal,
    input: Readonly<{
      email: string;
      role: 'owner_admin' | 'finance_admin' | 'project_manager' | 'worker' | 'auditor_read_only';
      expiresInDays?: number;
    }>,
  ): { id: string; token: string; expiresAt: string } {
    this.assertFinance(principal);
    if (principal.role !== 'owner_admin')
      throw new V3AccessDeniedError('Owner role required to invite users');
    this.assertStepUp(principal);
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new V3ValidationError('Invitation email is invalid');
    const expiresInDays = input.expiresInDays ?? 7;
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 14)
      throw new V3ValidationError('Invitation expiry must be 1 to 14 days');
    const existing = this.sqlite
      .prepare(
        "SELECT id FROM user WHERE lower(email)=? AND status NOT IN ('offboarded','suspended')",
      )
      .get(email);
    if (existing) throw new V3ConflictError('An active or pending account already uses this email');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const id = newId();
    const now = timestamp();
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
    this.sqlite
      .prepare(
        'INSERT INTO invitation(id,email,token_hash,role,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, email, tokenHash, input.role, principal.userId, expiresAt, now);
    this.sqlite
      .prepare(
        'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        'invitation.created',
        id,
        `invitation:${id}`,
        JSON.stringify({ invitationId: id, email, role: input.role, expiresAt }),
        now,
        now,
      );
    this.audit(principal, 'invitation.create', 'invitation', id, {
      email,
      role: input.role,
      expiresAt,
    });
    return { id, token, expiresAt };
  }

  createClientLaborRate(principal: Principal, input: LaborRateInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    this.assertProjectAccess(principal, input.projectId);
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    if (input.hourlyRateMinor < 0n) throw new V3ValidationError('Client rate cannot be negative');
    if (input.overtimeMultiplierBps !== undefined && input.overtimeMultiplierBps < 0)
      throw new V3ValidationError('Client overtime multiplier is invalid');
    if (input.overtimeRateMinor !== undefined && input.overtimeRateMinor < 0n)
      throw new V3ValidationError('Client overtime rate is invalid');
    if (input.overtimeMethod === 'FIXED_RATE' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A client fixed overtime rate is required');
    if (input.overtimeMethod === 'FIXED_ADDITION_PER_HOUR' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A client overtime addition is required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: V3Currency } | undefined;
    if (!project) throw new V3ValidationError('Project not found');
    if (project.currency !== input.currency)
      throw new V3ValidationError('Client rate currency must match the project currency');
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO client_labor_rate(
          id,project_id,worker_id,category,currency,hourly_rate_minor,effective_from,effective_to,
          created_at,updated_at,rate_basis,overtime_method,overtime_multiplier_bps,
          overtime_rate_minor,eligible_for_percentage,notes
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        input.workerId ?? null,
        input.category ?? null,
        input.currency,
        sqliteInteger(input.hourlyRateMinor, 'Client rate'),
        input.effectiveFrom,
        input.effectiveTo ?? null,
        now,
        now,
        'hourly',
        input.overtimeMethod ?? 'BASE_RATE_MULTIPLIER',
        input.overtimeMultiplierBps ?? 10_000,
        input.overtimeRateMinor === undefined
          ? null
          : sqliteInteger(input.overtimeRateMinor, 'Client overtime rate'),
        input.eligibleForPercentage === false ? 0 : 1,
        input.notes ?? null,
      );
    this.audit(principal, 'client_rate.create', 'client_labor_rate', id, {
      projectId: input.projectId,
      workerId: input.workerId ?? null,
      category: input.category ?? null,
    });
    return { id };
  }

  createInternalCostRule(principal: Principal, input: InternalCostInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    this.assertActiveLaborWorker(input.workerId);
    if (input.projectId) this.assertProjectAccess(principal, input.projectId);
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    if (input.hourlyRateMinor < 0n) throw new V3ValidationError('Internal cost cannot be negative');
    if (input.overtimeMultiplierBps !== undefined && input.overtimeMultiplierBps < 0)
      throw new V3ValidationError('Internal overtime multiplier is invalid');
    if (input.overtimeRateMinor !== undefined && input.overtimeRateMinor < 0n)
      throw new V3ValidationError('Internal overtime rate is invalid');
    if (input.overtimeMethod === 'FIXED_RATE' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('A fixed internal overtime rate is required');
    if (input.overtimeMethod === 'FIXED_ADDITION_PER_HOUR' && input.overtimeRateMinor === undefined)
      throw new V3ValidationError('An internal overtime addition is required');
    if (input.projectId) {
      this.assertWorkerProjectMembership(
        input.workerId,
        input.projectId,
        input.effectiveFrom,
        input.effectiveTo ?? input.effectiveFrom,
      );
      const project = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: V3Currency } | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      if (project.currency !== input.currency)
        throw new V3ValidationError('Internal cost currency must match the project currency');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO internal_cost_rule(
          id,worker_id,project_id,currency,hourly_rate_minor,effective_from,effective_to,
          created_at,updated_at,overtime_method,overtime_multiplier_bps,overtime_rate_minor,
          cost_method,notes
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        sqliteInteger(input.hourlyRateMinor, 'Internal cost rate'),
        input.effectiveFrom,
        input.effectiveTo ?? null,
        now,
        now,
        input.overtimeMethod ?? 'BASE_RATE_MULTIPLIER',
        input.overtimeMultiplierBps ?? 10_000,
        input.overtimeRateMinor === undefined
          ? null
          : sqliteInteger(input.overtimeRateMinor, 'Internal overtime rate'),
        input.costMethod ?? 'loaded_hourly',
        input.notes ?? null,
      );
    this.audit(principal, 'internal_cost.create', 'internal_cost_rule', id, {
      workerId: input.workerId,
      projectId: input.projectId ?? null,
    });
    return { id };
  }

  listCompensationRules(principal: Principal, projectId?: string) {
    this.assertFinanceReadable(principal);
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    const rows = this.sqlite
      .prepare(
        `SELECT cr.id,cr.worker_id,cr.project_id,cr.currency,
                CAST(cr.rate_minor AS TEXT) rate_minor,cr.rate_basis,cr.effective_from,cr.effective_to,
                cr.created_at,cr.updated_at,cr.daily_guarantee_minutes,cr.worker_visible,cr.rule_type,
                cr.percentage_bps,cr.percentage_basis,cr.settlement_trigger,cr.overtime_method,
                cr.overtime_multiplier_bps,CAST(cr.overtime_rate_minor AS TEXT) overtime_rate_minor,
                cr.weekend_method,cr.travel_method,cr.standby_method,
                CAST(cr.fixed_period_minor AS TEXT) fixed_period_minor,
                CAST(cr.fixed_project_minor AS TEXT) fixed_project_minor,cr.notes,cr.version,
                u.name worker_name,p.project_number,p.name project_name
         FROM compensation_rule cr
         JOIN user u ON u.id=cr.worker_id
         LEFT JOIN project p ON p.id=cr.project_id
         ${projectId ? 'WHERE cr.project_id=?' : ''}
         ORDER BY cr.effective_from DESC,cr.id`,
      )
      .all(...(projectId ? [projectId] : []));
    return rows;
  }

  listClientLaborRates(principal: Principal, projectId?: string) {
    this.assertFinanceReadable(principal);
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    return this.sqlite
      .prepare(
        `SELECT clr.id,clr.project_id,clr.worker_id,clr.category,clr.currency,
                CAST(clr.hourly_rate_minor AS TEXT) hourly_rate_minor,clr.effective_from,clr.effective_to,
                clr.created_at,clr.updated_at,clr.rate_basis,clr.overtime_method,
                clr.overtime_multiplier_bps,CAST(clr.overtime_rate_minor AS TEXT) overtime_rate_minor,
                clr.eligible_for_percentage,clr.notes,clr.version,
                p.project_number,p.name project_name,u.name worker_name
         FROM client_labor_rate clr
         JOIN project p ON p.id=clr.project_id
         LEFT JOIN user u ON u.id=clr.worker_id
         ${projectId ? 'WHERE clr.project_id=?' : ''}
         ORDER BY clr.effective_from DESC,clr.id`,
      )
      .all(...(projectId ? [projectId] : []));
  }

  listInternalCostRules(principal: Principal, projectId?: string) {
    this.assertFinanceReadable(principal);
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    return this.sqlite
      .prepare(
        `SELECT ic.id,ic.worker_id,ic.project_id,ic.currency,
                CAST(ic.hourly_rate_minor AS TEXT) hourly_rate_minor,ic.effective_from,ic.effective_to,
                ic.created_at,ic.updated_at,ic.overtime_method,ic.overtime_multiplier_bps,
                CAST(ic.overtime_rate_minor AS TEXT) overtime_rate_minor,ic.cost_method,ic.notes,ic.version,
                u.name worker_name,p.project_number,p.name project_name
         FROM internal_cost_rule ic
         JOIN user u ON u.id=ic.worker_id
         LEFT JOIN project p ON p.id=ic.project_id
         ${projectId ? 'WHERE ic.project_id=?' : ''}
         ORDER BY ic.effective_from DESC,ic.id`,
      )
      .all(...(projectId ? [projectId] : []));
  }

  /**
   * Create a successor rule while closing the old effective-dated interval.
   * The old row and any settlements that reference it remain untouched.
   */
  supersedeCompensationRule(
    principal: Principal,
    ruleId: string,
    input: CompensationInput,
  ): { id: string; previousId: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const existing = this.sqlite
      .prepare(
        'SELECT worker_id,project_id,effective_from,effective_to FROM compensation_rule WHERE id=?',
      )
      .get(ruleId) as
      | {
          worker_id: string;
          project_id: string | null;
          effective_from: string;
          effective_to: string | null;
        }
      | undefined;
    if (!existing) throw new V3ValidationError('Compensation rule not found');
    if (input.workerId !== existing.worker_id)
      throw new V3ValidationError('A successor must keep the same worker');
    const successorProject = input.projectId ?? existing.project_id ?? undefined;
    if ((successorProject ?? null) !== existing.project_id)
      throw new V3ValidationError('A successor must keep the same project scope');
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveFrom <= existing.effective_from)
      throw new V3ValidationError('Successor effective date must follow the existing rule');
    if (existing.effective_to && existing.effective_to < input.effectiveFrom)
      throw new V3ConflictError('Compensation rule is already closed for that date');
    const closeDate = shiftIsoDate(input.effectiveFrom, -1);
    return this.transaction(() => {
      const closed = this.sqlite
        .prepare(
          'UPDATE compensation_rule SET effective_to=?,updated_at=?,version=version+1 WHERE id=? AND (effective_to IS NULL OR effective_to>=?)',
        )
        .run(closeDate, timestamp(), ruleId, closeDate);
      if (closed.changes !== 1)
        throw new V3ConflictError('Compensation rule changed while superseding');
      const created = this.createCompensationRule(principal, {
        ...input,
        projectId: successorProject,
      });
      this.audit(principal, 'compensation_rule.supersede', 'compensation_rule', created.id, {
        previousId: ruleId,
      });
      return { id: created.id, previousId: ruleId };
    });
  }

  deactivateCompensationRule(
    principal: Principal,
    ruleId: string,
    effectiveTo = new Date().toISOString().slice(0, 10),
  ): void {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(effectiveTo, 'End date');
    this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT project_id,effective_from FROM compensation_rule WHERE id=?')
        .get(ruleId) as { project_id: string | null; effective_from: string } | undefined;
      if (!existing) throw new V3ValidationError('Compensation rule not found');
      if (existing.project_id) this.assertProjectAccess(principal, existing.project_id);
      if (effectiveTo < existing.effective_from)
        throw new V3ValidationError('End date must follow the effective date');
      const result = this.sqlite
        .prepare(
          'UPDATE compensation_rule SET effective_to=?,updated_at=?,version=version+1 WHERE id=? AND (effective_to IS NULL OR effective_to>?)',
        )
        .run(effectiveTo, timestamp(), ruleId, effectiveTo);
      if (result.changes !== 1) throw new V3ConflictError('Compensation rule is already inactive');
      this.audit(principal, 'compensation_rule.deactivate', 'compensation_rule', ruleId, {
        effectiveTo,
      });
    });
  }

  supersedeClientLaborRate(
    principal: Principal,
    ruleId: string,
    input: LaborRateInput,
  ): { id: string; previousId: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const existing = this.sqlite
      .prepare(
        'SELECT project_id,worker_id,effective_from,effective_to FROM client_labor_rate WHERE id=?',
      )
      .get(ruleId) as
      | {
          project_id: string;
          worker_id: string | null;
          effective_from: string;
          effective_to: string | null;
        }
      | undefined;
    if (!existing) throw new V3ValidationError('Client labor rate not found');
    if (input.projectId !== existing.project_id || (input.workerId ?? null) !== existing.worker_id)
      throw new V3ValidationError('A successor must keep the same client-rate scope');
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveFrom <= existing.effective_from)
      throw new V3ValidationError('Successor effective date must follow the existing rate');
    if (existing.effective_to && existing.effective_to < input.effectiveFrom)
      throw new V3ConflictError('Client labor rate is already closed for that date');
    const closeDate = shiftIsoDate(input.effectiveFrom, -1);
    return this.transaction(() => {
      const closed = this.sqlite
        .prepare(
          'UPDATE client_labor_rate SET effective_to=?,updated_at=?,version=version+1 WHERE id=? AND (effective_to IS NULL OR effective_to>=?)',
        )
        .run(closeDate, timestamp(), ruleId, closeDate);
      if (closed.changes !== 1)
        throw new V3ConflictError('Client labor rate changed while superseding');
      const created = this.createClientLaborRate(principal, input);
      this.audit(principal, 'client_rate.supersede', 'client_labor_rate', created.id, {
        previousId: ruleId,
      });
      return { id: created.id, previousId: ruleId };
    });
  }

  deactivateClientLaborRate(
    principal: Principal,
    ruleId: string,
    effectiveTo = new Date().toISOString().slice(0, 10),
  ): void {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(effectiveTo, 'End date');
    this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT project_id,effective_from FROM client_labor_rate WHERE id=?')
        .get(ruleId) as { project_id: string; effective_from: string } | undefined;
      if (!existing) throw new V3ValidationError('Client labor rate not found');
      this.assertProjectAccess(principal, existing.project_id);
      if (effectiveTo < existing.effective_from)
        throw new V3ValidationError('End date must follow the effective date');
      const result = this.sqlite
        .prepare(
          'UPDATE client_labor_rate SET effective_to=?,updated_at=?,version=version+1 WHERE id=? AND (effective_to IS NULL OR effective_to>?)',
        )
        .run(effectiveTo, timestamp(), ruleId, effectiveTo);
      if (result.changes !== 1) throw new V3ConflictError('Client labor rate is already inactive');
      this.audit(principal, 'client_rate.deactivate', 'client_labor_rate', ruleId, { effectiveTo });
    });
  }

  supersedeInternalCostRule(
    principal: Principal,
    ruleId: string,
    input: InternalCostInput,
  ): { id: string; previousId: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const existing = this.sqlite
      .prepare(
        'SELECT worker_id,project_id,effective_from,effective_to FROM internal_cost_rule WHERE id=?',
      )
      .get(ruleId) as
      | {
          worker_id: string;
          project_id: string | null;
          effective_from: string;
          effective_to: string | null;
        }
      | undefined;
    if (!existing) throw new V3ValidationError('Internal cost rule not found');
    if (input.workerId !== existing.worker_id || (input.projectId ?? null) !== existing.project_id)
      throw new V3ValidationError('A successor must keep the same internal-cost scope');
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveFrom <= existing.effective_from)
      throw new V3ValidationError('Successor effective date must follow the existing rule');
    if (existing.effective_to && existing.effective_to < input.effectiveFrom)
      throw new V3ConflictError('Internal cost rule is already closed for that date');
    const closeDate = shiftIsoDate(input.effectiveFrom, -1);
    return this.transaction(() => {
      const closed = this.sqlite
        .prepare(
          'UPDATE internal_cost_rule SET effective_to=?,updated_at=?,version=version+1 WHERE id=? AND (effective_to IS NULL OR effective_to>=?)',
        )
        .run(closeDate, timestamp(), ruleId, closeDate);
      if (closed.changes !== 1)
        throw new V3ConflictError('Internal cost rule changed while superseding');
      const created = this.createInternalCostRule(principal, input);
      this.audit(principal, 'internal_cost.supersede', 'internal_cost_rule', created.id, {
        previousId: ruleId,
      });
      return { id: created.id, previousId: ruleId };
    });
  }

  deactivateInternalCostRule(
    principal: Principal,
    ruleId: string,
    effectiveTo = new Date().toISOString().slice(0, 10),
  ): void {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(effectiveTo, 'End date');
    this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT project_id,effective_from FROM internal_cost_rule WHERE id=?')
        .get(ruleId) as { project_id: string | null; effective_from: string } | undefined;
      if (!existing) throw new V3ValidationError('Internal cost rule not found');
      if (existing.project_id) this.assertProjectAccess(principal, existing.project_id);
      if (effectiveTo < existing.effective_from)
        throw new V3ValidationError('End date must follow the effective date');
      const result = this.sqlite
        .prepare(
          'UPDATE internal_cost_rule SET effective_to=?,updated_at=?,version=version+1 WHERE id=? AND (effective_to IS NULL OR effective_to>?)',
        )
        .run(effectiveTo, timestamp(), ruleId, effectiveTo);
      if (result.changes !== 1) throw new V3ConflictError('Internal cost rule is already inactive');
      this.audit(principal, 'internal_cost.deactivate', 'internal_cost_rule', ruleId, {
        effectiveTo,
      });
    });
  }

  createAssignmentRateOverride(principal: Principal, input: OverrideInput): { id: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const assignment = this.sqlite
      .prepare("SELECT project_id,user_id FROM project_member WHERE id=? AND status='active'")
      .get(input.projectMemberId) as { project_id: string; user_id: string } | undefined;
    if (!assignment) throw new V3ValidationError('Active project assignment not found');
    this.assertProjectAccess(principal, assignment.project_id);
    const compensation = input.compensationRuleId
      ? (this.sqlite
          .prepare('SELECT worker_id,project_id FROM compensation_rule WHERE id=?')
          .get(input.compensationRuleId) as
          | { worker_id: string; project_id: string | null }
          | undefined)
      : undefined;
    const internal = input.internalCostRuleId
      ? (this.sqlite
          .prepare('SELECT worker_id,project_id FROM internal_cost_rule WHERE id=?')
          .get(input.internalCostRuleId) as
          | { worker_id: string; project_id: string | null }
          | undefined)
      : undefined;
    const client = input.clientLaborRateId
      ? (this.sqlite
          .prepare('SELECT project_id,worker_id FROM client_labor_rate WHERE id=?')
          .get(input.clientLaborRateId) as
          | { project_id: string; worker_id: string | null }
          | undefined)
      : undefined;
    if (
      (input.compensationRuleId &&
        (!compensation ||
          compensation.worker_id !== assignment.user_id ||
          (compensation.project_id !== null &&
            compensation.project_id !== assignment.project_id))) ||
      (input.internalCostRuleId &&
        (!internal ||
          internal.worker_id !== assignment.user_id ||
          (internal.project_id !== null && internal.project_id !== assignment.project_id))) ||
      (input.clientLaborRateId &&
        (!client ||
          client.project_id !== assignment.project_id ||
          (client.worker_id !== null && client.worker_id !== assignment.user_id)))
    )
      throw new V3ValidationError('Rate override references an unavailable rule');
    if (!input.compensationRuleId && !input.internalCostRuleId && !input.clientLaborRateId)
      throw new V3ValidationError('At least one rate rule is required');
    requireDate(input.effectiveFrom, 'Effective date');
    if (input.effectiveTo) {
      requireDate(input.effectiveTo, 'End date');
      if (input.effectiveTo < input.effectiveFrom)
        throw new V3ValidationError('End date must follow the effective date');
    }
    const id = newId();
    const now = timestamp();
    this.sqlite
      .prepare(
        `INSERT INTO assignment_rate_override(
          id,project_member_id,time_category,activity_code,compensation_rule_id,
          internal_cost_rule_id,client_labor_rate_id,effective_from,effective_to,
          priority,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectMemberId,
        input.timeCategory ?? null,
        input.activityCode ?? null,
        input.compensationRuleId ?? null,
        input.internalCostRuleId ?? null,
        input.clientLaborRateId ?? null,
        input.effectiveFrom,
        input.effectiveTo ?? null,
        input.priority ?? 0,
        now,
        now,
      );
    this.audit(principal, 'assignment_rate_override.create', 'assignment_rate_override', id, input);
    return { id };
  }

  createTechnicalChange(
    principal: Principal,
    input: TechnicalChangeInput,
  ): { id: string; version: number } {
    return this.technicalChanges.createTechnicalChange(principal, input);
  }

  submitTechnicalChange(principal: Principal, id: string, version: number): void {
    return this.technicalChanges.submitTechnicalChange(principal, id, version);
  }

  reviewTechnicalChange(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ): void {
    return this.technicalChanges.reviewTechnicalChange(principal, id, decision, reason);
  }

  listTechnicalChanges(principal: Principal, queue = false) {
    return this.technicalChanges.listTechnicalChanges(principal, queue);
  }

  private assignmentId(projectId: string, workerId: string, workDate: string): string | null {
    const row = this.sqlite
      .prepare(
        "SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on DESC LIMIT 1",
      )
      .get(projectId, workerId, workDate, workDate) as { id: string } | undefined;
    return row?.id ?? null;
  }

  private compensationRuleFor(
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): CompensationRuleRow | null {
    const assignmentId = this.assignmentId(projectId, workerId, workDate);
    if (assignmentId) {
      const override = this.sqlite
        .prepare(
          `SELECT compensation_rule_id
           FROM assignment_rate_override
           WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
              AND (activity_code=? OR activity_code IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (time_category IS NOT NULL) DESC, (activity_code IS NOT NULL) DESC,
                    priority DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(assignmentId, category, activityCode ?? null, workDate, workDate) as
        | { compensation_rule_id: string | null }
        | undefined;
      if (override?.compensation_rule_id) {
        const specific = this.sqlite
          .prepare(
            `SELECT cr.id,cr.worker_id,cr.project_id,cr.currency,CAST(cr.rate_minor AS TEXT) rate_minor,
                    cr.rate_basis,cr.daily_guarantee_minutes,cr.rule_type,cr.percentage_bps,
                    cr.percentage_basis,cr.settlement_trigger,cr.overtime_method,
                    cr.overtime_multiplier_bps,CAST(cr.overtime_rate_minor AS TEXT) overtime_rate_minor,
                    cr.weekend_method,cr.travel_method,cr.standby_method,cr.effective_from
               FROM compensation_rule cr
              WHERE cr.id=? AND cr.worker_id=? AND (cr.project_id=? OR cr.project_id IS NULL)
                AND cr.effective_from<=? AND (cr.effective_to IS NULL OR cr.effective_to>=?)`,
          )
          .get(override.compensation_rule_id, workerId, projectId, workDate, workDate) as
          | CompensationRuleRow
          | undefined;
        if (specific) return specific;
      }
    }
    return (
      (this.sqlite
        .prepare(
          `SELECT cr.id,cr.worker_id,cr.project_id,cr.currency,CAST(cr.rate_minor AS TEXT) rate_minor,
                  cr.rate_basis,cr.daily_guarantee_minutes,cr.rule_type,cr.percentage_bps,
                  cr.percentage_basis,cr.settlement_trigger,cr.overtime_method,
                  cr.overtime_multiplier_bps,CAST(cr.overtime_rate_minor AS TEXT) overtime_rate_minor,
                  cr.weekend_method,cr.travel_method,cr.standby_method,cr.effective_from
             FROM compensation_rule cr
            WHERE cr.worker_id=? AND (cr.project_id=? OR cr.project_id IS NULL)
              AND cr.effective_from<=? AND (cr.effective_to IS NULL OR cr.effective_to>=?)
            ORDER BY (cr.project_id IS NOT NULL) DESC, cr.effective_from DESC, cr.id DESC LIMIT 1`,
        )
        .get(workerId, projectId, workDate, workDate) as CompensationRuleRow | undefined) ?? null
    );
  }

  private clientRateFor(
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): LaborRateRow | null {
    const assignmentId = this.assignmentId(projectId, workerId, workDate);
    if (assignmentId) {
      const override = this.sqlite
        .prepare(
          `SELECT client_labor_rate_id
           FROM assignment_rate_override
           WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
              AND (activity_code=? OR activity_code IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (time_category IS NOT NULL) DESC, (activity_code IS NOT NULL) DESC,
                    priority DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(assignmentId, category, activityCode ?? null, workDate, workDate) as
        | { client_labor_rate_id: string | null }
        | undefined;
      if (override?.client_labor_rate_id) {
        const specific = this.sqlite
          .prepare(
            `SELECT clr.id,clr.project_id,clr.worker_id,clr.category,clr.currency,
                    CAST(clr.hourly_rate_minor AS TEXT) hourly_rate_minor,clr.effective_from,
                    clr.effective_to,clr.rate_basis,clr.overtime_method,clr.overtime_multiplier_bps,
                    CAST(clr.overtime_rate_minor AS TEXT) overtime_rate_minor,clr.eligible_for_percentage
               FROM client_labor_rate clr
              WHERE clr.id=? AND clr.project_id=? AND (clr.worker_id=? OR clr.worker_id IS NULL)
                AND clr.effective_from<=? AND (clr.effective_to IS NULL OR clr.effective_to>=?)`,
          )
          .get(override.client_labor_rate_id, projectId, workerId, workDate, workDate) as
          | LaborRateRow
          | undefined;
        if (specific) return specific;
      }
    }
    const candidates = this.sqlite
      .prepare(
        `SELECT clr.id,clr.project_id,clr.worker_id,clr.category,clr.currency,
                CAST(clr.hourly_rate_minor AS TEXT) hourly_rate_minor,clr.effective_from,
                clr.effective_to,clr.rate_basis,clr.overtime_method,clr.overtime_multiplier_bps,
                CAST(clr.overtime_rate_minor AS TEXT) overtime_rate_minor,clr.eligible_for_percentage
           FROM client_labor_rate clr
          WHERE clr.project_id=? AND (clr.worker_id=? OR clr.worker_id IS NULL)
            AND (clr.category=? OR clr.category IS NULL)
            AND clr.effective_from<=? AND (clr.effective_to IS NULL OR clr.effective_to>=?)`,
      )
      .all(projectId, workerId, category, workDate, workDate) as LaborRateRow[];
    const selected = chooseMostSpecificRate(
      candidates.map((row) => ({
        ...row,
        assignmentSpecific: false,
        workerSpecific: row.worker_id !== null,
        categorySpecific: row.category !== null,
        activitySpecific: false,
        priority: 0,
        effectiveFrom: row.effective_from,
      })),
    );
    return selected ? (selected as unknown as LaborRateRow) : null;
  }

  /**
   * Resolve the immutable policy version that was effective on the operational
   * date. A missing policy deliberately means legacy behavior: historical rows
   * keep their explicit category/billability instead of being reinterpreted.
   */
  private timeCommercialPolicyFor(
    projectId: string,
    workDate: string,
  ): EffectiveTimeCommercialPolicy | null {
    const row = this.sqlite
      .prepare(
        `SELECT id,overtime_enabled,overtime_threshold_minutes,travel_client_billable
         FROM project_commercial_policy
         WHERE project_id=? AND effective_from<=?
           AND (effective_to IS NULL OR effective_to>=?)
         ORDER BY effective_from DESC,version DESC,id DESC LIMIT 1`,
      )
      .get(projectId, workDate, workDate) as
      | {
          id: string;
          overtime_enabled: number;
          overtime_threshold_minutes: number | null;
          travel_client_billable: number;
        }
      | undefined;
    return row
      ? {
          id: row.id,
          overtimeEnabled: row.overtime_enabled === 1,
          overtimeThresholdMinutes: row.overtime_threshold_minutes,
          travelClientBillable: row.travel_client_billable === 1,
        }
      : null;
  }

  private canonicalEconomicTimeRows(rows: readonly TimeRow[]): readonly TimeRow[] {
    const derivedBySource = new Map<string, TimeRow[]>();
    const groups = new Map<string, TimeRow[]>();
    for (const row of rows) {
      if (row.category !== 'regular' && row.category !== 'commissioning') continue;
      const key = `${row.project_id}\u0000${row.work_date}`;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const first = group[0];
      if (!first) continue;
      const policy = this.timeCommercialPolicyFor(first.project_id, first.work_date);
      if (!policy) continue;
      for (const slice of deriveTimeCommercialSlices({
        entries: group.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          workerId: row.worker_id,
          workDate: row.work_date,
          category: row.category,
          minutes: row.minutes,
        })),
        policy,
      })) {
        const source = group.find((row) => row.id === slice.sourceEntryId);
        if (!source) throw new V3ConflictError('Commercial time source disappeared');
        const existing = derivedBySource.get(source.id) ?? [];
        existing.push({
          ...source,
          minutes: slice.minutes,
          category: slice.category === 'overtime' ? 'overtime' : source.category,
        });
        derivedBySource.set(source.id, existing);
      }
    }
    return rows.flatMap((row) => derivedBySource.get(row.id) ?? [row]);
  }

  /**
   * Resolve the effective client rule for a single authoritative time row.
   * Finance authorization and project scope are enforced before returning
   * commercial data. Worker responses must use workerPay(), which strips it.
   */
  resolveClientLaborRate(
    principal: Principal,
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): Readonly<{
    id: string;
    currency: V3Currency;
    hourlyRateMinor: string;
    effectiveRateMinor: string;
    eligibleForPercentage: boolean;
  }> | null {
    this.assertFinanceReadable(principal);
    this.assertProjectAccess(principal, projectId, true);
    const rule = this.clientRateFor(projectId, workerId, category, workDate, activityCode);
    if (!rule) return null;
    return {
      id: rule.id,
      currency: rule.currency,
      hourlyRateMinor: String(rule.hourly_rate_minor),
      effectiveRateMinor: this.clientRateAmount({ category }, rule).toString(),
      eligibleForPercentage: rule.eligible_for_percentage === 1,
    };
  }

  /** Resolve a billing rate for the active automatic-draft execution. */
  resolveClientLaborRateFromJob(
    execution: FencedJobExecution,
    billingRuleId: string,
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): Readonly<{
    id: string;
    currency: V3Currency;
    hourlyRateMinor: string;
    effectiveRateMinor: string;
    eligibleForPercentage: boolean;
  }> | null {
    assertFencedJobExecution(this.sqlite, execution, {
      kind: 'auto_draft',
      capability: 'billing.draft.generate',
      payloadTarget: { billingRuleId },
    });
    const rule = this.clientRateFor(projectId, workerId, category, workDate, activityCode);
    if (!rule) return null;
    return {
      id: rule.id,
      currency: rule.currency,
      hourlyRateMinor: String(rule.hourly_rate_minor),
      effectiveRateMinor: this.clientRateAmount({ category }, rule).toString(),
      eligibleForPercentage: rule.eligible_for_percentage === 1,
    };
  }

  resolveInternalCostRate(
    principal: Principal,
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): Readonly<{
    id: string;
    currency: V3Currency;
    hourlyRateMinor: string;
    effectiveRateMinor: string;
  }> | null {
    this.assertFinanceReadable(principal);
    this.assertProjectAccess(principal, projectId, true);
    const rule = this.internalCostFor(projectId, workerId, category, workDate, activityCode);
    if (!rule) return null;
    return {
      id: rule.id,
      currency: rule.currency,
      hourlyRateMinor: String(rule.hourly_rate_minor),
      effectiveRateMinor: this.internalCostAmount({ category }, rule).toString(),
    };
  }

  private internalCostFor(
    projectId: string,
    workerId: string,
    category: string,
    workDate: string,
    activityCode?: string | null,
  ): InternalCostRow | null {
    const assignmentId = this.assignmentId(projectId, workerId, workDate);
    if (assignmentId) {
      const override = this.sqlite
        .prepare(
          `SELECT internal_cost_rule_id
           FROM assignment_rate_override
           WHERE project_member_id=? AND (time_category=? OR time_category IS NULL)
              AND (activity_code=? OR activity_code IS NULL)
              AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           ORDER BY (time_category IS NOT NULL) DESC, (activity_code IS NOT NULL) DESC,
                    priority DESC, effective_from DESC, id DESC LIMIT 1`,
        )
        .get(assignmentId, category, activityCode ?? null, workDate, workDate) as
        | { internal_cost_rule_id: string | null }
        | undefined;
      if (override?.internal_cost_rule_id) {
        const specific = this.sqlite
          .prepare(
            `SELECT ic.id,ic.worker_id,ic.project_id,ic.currency,
                    CAST(ic.hourly_rate_minor AS TEXT) hourly_rate_minor,ic.effective_from,
                    ic.effective_to,ic.overtime_method,ic.overtime_multiplier_bps,
                    CAST(ic.overtime_rate_minor AS TEXT) overtime_rate_minor
               FROM internal_cost_rule ic
              WHERE ic.id=? AND ic.worker_id=? AND (ic.project_id=? OR ic.project_id IS NULL)
                AND ic.effective_from<=? AND (ic.effective_to IS NULL OR ic.effective_to>=?)`,
          )
          .get(override.internal_cost_rule_id, workerId, projectId, workDate, workDate) as
          | InternalCostRow
          | undefined;
        if (specific) return specific;
      }
    }
    return (
      (this.sqlite
        .prepare(
          `SELECT ic.id,ic.worker_id,ic.project_id,ic.currency,
                  CAST(ic.hourly_rate_minor AS TEXT) hourly_rate_minor,ic.effective_from,
                  ic.effective_to,ic.overtime_method,ic.overtime_multiplier_bps,
                  CAST(ic.overtime_rate_minor AS TEXT) overtime_rate_minor
             FROM internal_cost_rule ic
            WHERE ic.worker_id=? AND (ic.project_id=? OR ic.project_id IS NULL)
              AND ic.effective_from<=? AND (ic.effective_to IS NULL OR ic.effective_to>=?)
            ORDER BY (ic.project_id IS NOT NULL) DESC, ic.effective_from DESC, ic.id DESC LIMIT 1`,
        )
        .get(workerId, projectId, workDate, workDate) as InternalCostRow | undefined) ?? null
    );
  }

  private clientRateAmount(row: Pick<TimeRow, 'category'>, rate: LaborRateRow): bigint {
    const base = BigInt(rate.hourly_rate_minor);
    if (row.category === 'overtime') {
      if (rate.overtime_method === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME') return base;
      return overtimeRate(base, rate.overtime_method, {
        multiplierBps: rate.overtime_multiplier_bps ?? undefined,
        fixedRateMinor:
          rate.overtime_method === 'FIXED_RATE' && rate.overtime_rate_minor !== null
            ? BigInt(rate.overtime_rate_minor)
            : undefined,
        fixedAdditionMinor:
          rate.overtime_method === 'FIXED_ADDITION_PER_HOUR' && rate.overtime_rate_minor !== null
            ? BigInt(rate.overtime_rate_minor)
            : undefined,
      });
    }
    return base;
  }

  private internalCostAmount(row: Pick<TimeRow, 'category'>, rate: InternalCostRow): bigint {
    const base = BigInt(rate.hourly_rate_minor);
    if (row.category !== 'overtime') return base;
    return overtimeRate(base, rate.overtime_method, {
      multiplierBps: rate.overtime_multiplier_bps ?? undefined,
      fixedRateMinor:
        rate.overtime_method === 'FIXED_RATE' && rate.overtime_rate_minor !== null
          ? BigInt(rate.overtime_rate_minor)
          : undefined,
      fixedAdditionMinor:
        rate.overtime_method === 'FIXED_ADDITION_PER_HOUR' && rate.overtime_rate_minor !== null
          ? BigInt(rate.overtime_rate_minor)
          : undefined,
    });
  }

  private compensationAmount(
    row: TimeRow,
    rule: CompensationRuleRow | null,
    clientRate: LaborRateRow | null,
  ): bigint {
    if (!rule) return 0n;
    const minutes = row.minutes;
    if (rule.rule_type === 'PercentageOfEligibleClientLabor') {
      if (
        !clientRate ||
        clientRate.eligible_for_percentage !== 1 ||
        row.billability_state === 'non_billable'
      )
        return 0n;
      const clientAmount = hourlyRateForMinutes(
        money(row.project_currency, this.clientRateAmount(row, clientRate)),
        minutes,
      ).minorUnits;
      return percentageOfEligibleClientLabor({
        currency: row.project_currency,
        eligibleLaborMinor: clientAmount,
        percentageBps: rule.percentage_bps ?? 0,
      }).minorUnits;
    }
    let rate = BigInt(rule.rate_minor);
    if (row.category === 'overtime') {
      if (rule.overtime_method === 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME') {
        if (!clientRate) return 0n;
        const clientAmount = hourlyRateForMinutes(
          money(row.project_currency, this.clientRateAmount(row, clientRate)),
          minutes,
        ).minorUnits;
        return applyBasisPoints(money(row.project_currency, clientAmount), rule.percentage_bps ?? 0)
          .minorUnits;
      }
      rate = overtimeRate(rate, rule.overtime_method, {
        multiplierBps: rule.overtime_multiplier_bps ?? undefined,
        fixedRateMinor:
          rule.overtime_method === 'FIXED_RATE' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
        fixedAdditionMinor:
          rule.overtime_method === 'FIXED_ADDITION_PER_HOUR' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
      });
    }
    const weekend =
      row.category === 'weekend_holiday' ||
      [0, 6].includes(new Date(`${row.work_date}T00:00:00.000Z`).getUTCDay());
    const modifier =
      row.category === 'travel'
        ? rule.travel_method
        : row.category === 'standby'
          ? rule.standby_method
          : weekend
            ? rule.weekend_method
            : 'BASE';
    if (modifier === 'NONE') return 0n;
    if (modifier && modifier !== 'BASE')
      rate = overtimeRate(rate, modifier as OvertimeMethod, {
        multiplierBps: rule.overtime_multiplier_bps ?? undefined,
        fixedRateMinor:
          modifier === 'FIXED_RATE' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
        fixedAdditionMinor:
          modifier === 'FIXED_ADDITION_PER_HOUR' && rule.overtime_rate_minor !== null
            ? BigInt(rule.overtime_rate_minor)
            : undefined,
      });
    if (rule.rate_basis === 'daily' || rule.rule_type === 'Daily') return 0n;
    if (
      rule.rule_type === 'FixedPerBillingPeriod' ||
      rule.rule_type === 'FixedProjectAmount' ||
      rule.rule_type === 'CustomApprovedAdjustment'
    )
      return 0n;
    return hourlyRateForMinutes(money(rule.currency, rate), minutes).minorUnits;
  }

  /**
   * Convert an approved project period into an auditable compensation
   * settlement. This is a Finance action; workers receive only the resulting
   * status through workerPay/listCompensationSettlements.
   */
  settleCompensation(
    principal: Principal,
    input: Readonly<{
      workerId: string;
      projectId: string;
      periodStart: string;
      periodEnd: string;
    }>,
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    this.assertProjectAccess(principal, input.projectId);
    requireDate(input.periodStart, 'Period start');
    requireDate(input.periodEnd, 'Period end');
    if (input.periodEnd < input.periodStart)
      throw new V3ValidationError('Period end must follow start');
    this.assertActiveLaborWorker(input.workerId);
    this.assertWorkerProjectMembership(
      input.workerId,
      input.projectId,
      input.periodStart,
      input.periodEnd,
    );
    // Begin the immediate transaction before reading the authoritative time,
    // rule and rate rows.  A settlement is one snapshot: a concurrent writer
    // must wait for this transaction rather than changing the effective rate
    // between calculation and persistence.
    return this.transaction(() => {
      const sourceRows = this.sqlite
        .prepare(
          `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,
                t.approval_state,t.billability_state,p.currency project_currency
         FROM time_entry t JOIN project p ON p.id=t.project_id
         WHERE t.project_id=? AND t.worker_id=? AND t.work_date BETWEEN ? AND ?
           AND t.approval_state IN ('approved','locked')
         ORDER BY t.work_date,t.id`,
        )
        .all(input.projectId, input.workerId, input.periodStart, input.periodEnd) as TimeRow[];
      const rows = this.canonicalEconomicTimeRows(sourceRows);
      const byRule = new Map<
        string,
        {
          rule: CompensationRuleRow;
          sourceAmount: bigint;
          amount: bigint;
          currency: V3Currency;
          percentage: boolean;
        }
      >();
      for (const row of rows) {
        const rule = this.compensationRuleFor(
          input.projectId,
          input.workerId,
          row.category,
          row.work_date,
          row.activity_code,
        );
        if (!rule) throw new V3ValidationError(`Missing compensation rule for ${row.id}`);
        if (rule.currency !== row.project_currency)
          throw new V3ValidationError(`Compensation currency mismatch for ${row.id}`);
        if (
          rule.rule_type === 'FixedProjectAmount' &&
          this.sqlite
            .prepare(
              "SELECT 1 FROM compensation_settlement WHERE worker_id=? AND project_id=? AND compensation_rule_id=? AND state='settled' LIMIT 1",
            )
            .get(input.workerId, input.projectId, rule.id)
        )
          continue;
        if (
          rule.rule_type === 'PercentageOfEligibleClientLabor' &&
          !this.settlementTriggerReady(row, rule.settlement_trigger)
        )
          continue;
        const clientRate = this.clientRateFor(
          input.projectId,
          input.workerId,
          row.category,
          row.work_date,
          row.activity_code,
        );
        const current = byRule.get(rule.id) ?? {
          rule,
          sourceAmount: 0n,
          amount: 0n,
          currency: rule.currency,
          percentage: rule.rule_type === 'PercentageOfEligibleClientLabor',
        };
        if (rule.rule_type === 'PercentageOfEligibleClientLabor') {
          const eligible =
            row.billability_state === 'billable' && clientRate?.eligible_for_percentage === 1
              ? this.eligibleLaborForSettlement(
                  row,
                  rule.percentage_basis as SettlementBasis,
                  clientRate,
                )
              : 0n;
          current.sourceAmount += eligible;
          current.amount += applyBasisPoints(
            money(rule.currency, eligible),
            rule.percentage_bps ?? 0,
          ).minorUnits;
        } else if (
          rule.rule_type === 'FixedPerBillingPeriod' ||
          rule.rule_type === 'FixedProjectAmount' ||
          rule.rule_type === 'CustomApprovedAdjustment'
        ) {
          // Fixed/custom rules settle once per rule in the period, not once per
          // time entry. The amount is taken from the configured rule.
          current.amount = BigInt(rule.rate_minor);
        } else if (rule.rule_type === 'Daily' || rule.rate_basis === 'daily') {
          const dayKey = `${rule.id}:${row.work_date}`;
          const day = byRule.get(dayKey);
          if (day) day.sourceAmount += BigInt(row.minutes);
          else
            byRule.set(dayKey, {
              rule,
              sourceAmount: BigInt(row.minutes),
              amount: BigInt(rule.rate_minor),
              currency: rule.currency,
              percentage: false,
            });
          continue;
        } else {
          current.sourceAmount += BigInt(row.minutes);
          current.amount += this.compensationAmount(row, rule, clientRate);
        }
        byRule.set(rule.id, current);
      }
      // Apply hourly daily guarantees independently from client minimum billing.
      // Aggregate by effective rule and date so two entries on the same day cannot
      // apply the same guarantee twice.
      const guaranteeDays = new Map<string, { rule: CompensationRuleRow; actual: number }>();
      for (const row of rows) {
        const rule = this.compensationRuleFor(
          input.projectId,
          input.workerId,
          row.category,
          row.work_date,
          row.activity_code,
        );
        if (
          !rule ||
          rule.rule_type !== 'Hourly' ||
          rule.rate_basis === 'daily' ||
          !rule.daily_guarantee_minutes
        )
          continue;
        const key = `${rule.id}:${row.work_date}`;
        const day = guaranteeDays.get(key) ?? { rule, actual: 0 };
        day.actual += row.minutes;
        guaranteeDays.set(key, day);
      }
      for (const { rule, actual } of guaranteeDays.values()) {
        const topUp = Math.max(0, (rule.daily_guarantee_minutes ?? 0) - actual);
        const current = byRule.get(rule.id);
        if (current && topUp > 0)
          current.amount += hourlyRateForMinutes(
            money(rule.currency, BigInt(rule.rate_minor)),
            topUp,
          ).minorUnits;
      }
      const consolidated = new Map<
        string,
        {
          rule: CompensationRuleRow;
          sourceAmount: bigint;
          amount: bigint;
          currency: V3Currency;
        }
      >();
      for (const [key, value] of byRule) {
        const separator = key.indexOf(':');
        const ruleId = separator >= 0 ? key.slice(0, separator) : key;
        const existing = consolidated.get(ruleId);
        if (existing) {
          existing.sourceAmount += value.sourceAmount;
          existing.amount += value.amount;
        } else
          consolidated.set(ruleId, {
            rule: value.rule,
            sourceAmount: value.sourceAmount,
            amount: value.amount,
            currency: value.currency,
          });
      }
      if (consolidated.size === 0)
        throw new V3ValidationError('No approved time is available to settle');
      const now = timestamp();
      const settlements = [] as Array<{
        id: string;
        ruleId: string;
        amountMinor: string;
        sourceAmountMinor: string;
        currency: V3Currency;
        state: string;
      }>;
      for (const [ruleId, value] of consolidated) {
        const existing = this.sqlite
          .prepare(
            `SELECT id,source_basis,CAST(source_amount_minor AS TEXT) source_amount_minor,
                      percentage_bps,CAST(amount_minor AS TEXT) amount_minor,currency,state
             FROM compensation_settlement
             WHERE worker_id=? AND project_id=? AND compensation_rule_id=? AND period_start=? AND period_end=?`,
          )
          .get(input.workerId, input.projectId, ruleId, input.periodStart, input.periodEnd) as
          | {
              id: string;
              source_basis: string;
              source_amount_minor: string;
              percentage_bps: number | null;
              amount_minor: string;
              currency: V3Currency;
              state: string;
            }
          | undefined;
        const sourceBasis = value.rule.percentage_basis ?? 'APPROVED_TIME';
        const percentageBps = value.rule.percentage_bps ?? null;
        if (existing?.state === 'settled') {
          const semanticallyIdentical =
            existing.source_basis === sourceBasis &&
            existing.source_amount_minor === value.sourceAmount.toString() &&
            existing.percentage_bps === percentageBps &&
            existing.amount_minor === value.amount.toString() &&
            existing.currency === value.currency;
          if (!semanticallyIdentical)
            throw new V3ConflictError(
              `Settlement ${existing.id} is already settled with different final truth`,
            );
          // A retry with the same semantic payload is idempotent. Preserve the
          // original settled row, including its settled_at and audit history.
          settlements.push({
            id: existing.id,
            ruleId,
            amountMinor: existing.amount_minor,
            sourceAmountMinor: existing.source_amount_minor,
            currency: existing.currency,
            state: existing.state,
          });
          continue;
        }
        const id = existing?.id ?? newId();
        this.sqlite
          .prepare(
            `INSERT INTO compensation_settlement(
              id,worker_id,project_id,compensation_rule_id,period_start,period_end,
              source_basis,source_amount_minor,percentage_bps,amount_minor,currency,
              state,settled_at,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(worker_id,project_id,compensation_rule_id,period_start,period_end)
            DO UPDATE SET source_basis=excluded.source_basis,source_amount_minor=excluded.source_amount_minor,
              percentage_bps=excluded.percentage_bps,amount_minor=excluded.amount_minor,
              currency=excluded.currency,state=excluded.state,settled_at=excluded.settled_at,
              updated_at=excluded.updated_at`,
          )
          .run(
            id,
            input.workerId,
            input.projectId,
            ruleId,
            input.periodStart,
            input.periodEnd,
            sourceBasis,
            sqliteInteger(value.sourceAmount, 'Settlement source'),
            percentageBps,
            sqliteInteger(value.amount, 'Settlement amount'),
            value.currency,
            'settled',
            now,
            now,
            now,
          );
        settlements.push({
          id,
          ruleId,
          amountMinor: value.amount.toString(),
          sourceAmountMinor: value.sourceAmount.toString(),
          currency: value.currency,
          state: 'settled',
        });
      }
      this.audit(principal, 'compensation.settle', 'project', input.projectId, {
        workerId: input.workerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        settlements: settlements.map((settlement) => ({
          ruleId: settlement.ruleId,
          amountMinor: settlement.amountMinor,
        })),
      });
      return settlements;
    });
  }

  private eligibleLaborForSettlement(
    row: TimeRow,
    basis: SettlementBasis | null,
    clientRate: LaborRateRow,
  ): bigint {
    const direct = hourlyRateForMinutes(
      money(row.project_currency, this.clientRateAmount(row, clientRate)),
      row.minutes,
    ).minorUnits;
    if (basis === 'ISSUED_ELIGIBLE_LABOR' || basis === 'COLLECTED_ELIGIBLE_LABOR') {
      const invoiceRows = this.sqlite
        .prepare(
          `SELECT i.id,CAST(i.total_minor AS TEXT) total_minor,
                  CAST(il.subtotal_minor AS TEXT) line_subtotal
           FROM invoice_source s
           JOIN invoice i ON i.id=s.invoice_id
           JOIN invoice_line il ON il.invoice_id=i.id AND il.source_type='time' AND il.source_id=s.source_id
           WHERE s.source_type='time' AND s.source_id=?
             AND i.state IN ('issued','sent','partially_paid','paid','overdue')`,
        )
        .all(row.id) as Array<{
        id: string;
        total_minor: string;
        line_subtotal: string;
      }>;
      const issued = invoiceRows.reduce((sum, invoice) => sum + BigInt(invoice.line_subtotal), 0n);
      if (basis === 'ISSUED_ELIGIBLE_LABOR') return issued;
      return invoiceRows.reduce((sum, invoice) => {
        const invoiceTotal = BigInt(invoice.total_minor);
        if (invoiceTotal <= 0n) return sum;
        const netCollected = this.invoiceCollectionTotals(invoice.id).netCollected;
        if (netCollected <= 0n) return sum;
        const collectionBasis = netCollected > invoiceTotal ? invoiceTotal : netCollected;
        return sum + divideRounded(BigInt(invoice.line_subtotal) * collectionBasis, invoiceTotal);
      }, 0n);
    }
    return direct;
  }

  private settlementTriggerReady(row: TimeRow, trigger: string): boolean {
    if (trigger === 'ON_APPROVED_BILLABLE_LABOR') return true;
    const states =
      trigger === 'ON_INVOICE_ISSUE'
        ? ['issued', 'sent', 'partially_paid', 'paid', 'overdue']
        : ['partially_paid', 'paid', 'overdue'];
    const placeholders = states.map(() => '?').join(',');
    const result = this.sqlite
      .prepare(
        `SELECT 1
         FROM invoice_source s
         JOIN invoice i ON i.id=s.invoice_id
         WHERE s.source_type='time' AND s.source_id=? AND i.state IN (${placeholders})
         LIMIT 1`,
      )
      .get(row.id, ...states);
    if (!result) return false;
    if (trigger !== 'ON_CLIENT_PAYMENT') return true;
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1
           FROM invoice_source s
           JOIN payment p ON p.invoice_id=s.invoice_id
           JOIN invoice i ON i.id=p.invoice_id
           WHERE s.source_type='time' AND s.source_id=?
             AND p.tenant_id IS NOT NULL AND p.deployment_id IS NOT NULL
             AND p.legal_entity_revision_id IS NOT NULL
             AND p.payment_payload_hash IS NOT NULL AND p.command_id IS NOT NULL
             AND p.payment_hash IS NOT NULL
             AND p.tenant_id=i.tenant_id
             AND p.deployment_id=i.deployment_id
             AND p.legal_entity_revision_id=i.legal_entity_revision_id
             AND p.currency=i.currency
            LIMIT 1`,
        )
        .get(row.id),
    );
  }

  listCompensationSettlements(
    principal: Principal,
    periodStart?: string,
    periodEnd?: string,
    projectId?: string,
  ) {
    this.assertActive(principal);
    if (periodStart) requireDate(periodStart, 'Period start');
    if (periodEnd) requireDate(periodEnd, 'Period end');
    const financeVisible = canManageBilling(principal) || principal.role === 'auditor_read_only';
    if (financeVisible) this.assertFinanceReadable(principal);
    else if (projectId) throw new V3AccessDeniedError('Project filter is finance-only');
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    const conditions: string[] = [];
    const values: DbValue[] = [];
    if (!financeVisible) {
      conditions.push('cs.worker_id=?');
      values.push(principal.userId);
    }
    if (periodStart) {
      conditions.push('cs.period_end>=?');
      values.push(periodStart);
    }
    if (periodEnd) {
      conditions.push('cs.period_start<=?');
      values.push(periodEnd);
    }
    if (projectId) {
      conditions.push('cs.project_id=?');
      values.push(projectId);
    }
    const rows = this.sqlite
      .prepare(
        `SELECT cs.id,cs.worker_id,cs.project_id,cs.period_start,cs.period_end,cs.source_basis,
                CAST(cs.source_amount_minor AS TEXT) source_amount_minor,cs.percentage_bps,
                CAST(cs.amount_minor AS TEXT) amount_minor,cs.currency,cs.state,
                cs.settled_at,cs.expected_payment_on,p.project_number,p.name project_name,u.name worker_name
         FROM compensation_settlement cs
         JOIN project p ON p.id=cs.project_id
         JOIN user u ON u.id=cs.worker_id
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY cs.period_start DESC,cs.id`,
      )
      .all(...values) as Array<Record<string, DbValue>>;
    return rows.map((row) =>
      financeVisible
        ? {
            id: row.id,
            workerId: row.worker_id,
            workerName: row.worker_name,
            projectId: row.project_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            sourceBasis: row.source_basis,
            sourceAmountMinor: String(row.source_amount_minor),
            percentageBps: row.percentage_bps,
            amountMinor: String(row.amount_minor),
            currency: row.currency,
            state: row.state,
            settledAt: row.settled_at,
            expectedPaymentOn: row.expected_payment_on,
            projectNumber: row.project_number,
            projectName: row.project_name,
          }
        : {
            id: row.id,
            projectId: row.project_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            amountMinor: String(row.amount_minor),
            currency: row.currency,
            state: row.state,
            settledAt: row.settled_at,
            expectedPaymentOn: row.expected_payment_on,
            projectNumber: row.project_number,
            projectName: row.project_name,
          },
    );
  }

  setCompensationSettlementExpectedPaymentOn(
    principal: Principal,
    input: Readonly<{
      settlementId: string;
      expectedPaymentOn: string | null;
    }>,
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (input.expectedPaymentOn !== null)
      requireDate(input.expectedPaymentOn, 'Expected worker payment date');
    return this.transaction(() => {
      const settlement = this.sqlite
        .prepare(
          `SELECT id,project_id,state,settled_at
           FROM compensation_settlement WHERE id=?`,
        )
        .get(input.settlementId) as
        | { id: string; project_id: string; state: string; settled_at: string | null }
        | undefined;
      if (!settlement) throw new V3ValidationError('Compensation settlement not found');
      if (settlement.settled_at || ['settled', 'paid'].includes(settlement.state))
        throw new V3ConflictError('Settled compensation history is immutable');
      const changed = this.sqlite
        .prepare(
          `UPDATE compensation_settlement
           SET expected_payment_on=?,updated_at=?
           WHERE id=? AND settled_at IS NULL AND state NOT IN ('settled','paid')`,
        )
        .run(input.expectedPaymentOn, timestamp(), input.settlementId);
      if (changed.changes !== 1)
        throw new V3ConflictError('Compensation settlement changed before planning update');
      this.audit(
        principal,
        'compensation_settlement.planning_update',
        'compensation_settlement',
        input.settlementId,
        {
          projectId: settlement.project_id,
          settlementId: input.settlementId,
          expectedPaymentOn: input.expectedPaymentOn,
          planningOnly: true,
        },
      );
      return {
        settlementId: input.settlementId,
        expectedPaymentOn: input.expectedPaymentOn,
      };
    });
  }

  listReimbursementQueue(principal: Principal, projectId?: string) {
    this.assertFinanceReadable(principal);
    if (projectId) this.assertProjectAccess(principal, projectId, true);
    const rows = this.sqlite
      .prepare(
        `SELECT e.id,e.project_id,e.worker_id,e.spent_on,e.vendor,e.category,e.currency,
                CAST(e.amount_minor AS TEXT) amount_minor,
                CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                CAST(e.reimbursement_amount_minor AS TEXT) reimbursement_amount_minor,
                e.reimbursement_state,e.reimbursement_reference,p.project_number,p.name project_name,
                p.currency project_currency,
                u.name worker_name
         FROM expense e
         JOIN project p ON p.id=e.project_id
         JOIN user u ON u.id=e.worker_id
         WHERE e.who_paid='worker' AND e.approval_state IN ('approved','locked')
           ${projectId ? 'AND e.project_id=?' : ''}
         ORDER BY e.spent_on DESC,e.id`,
      )
      .all(...(projectId ? [projectId] : [])) as Array<Record<string, DbValue>>;
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      workerId: row.worker_id,
      workerName: row.worker_name,
      spentOn: row.spent_on,
      vendor: row.vendor,
      category: row.category,
      currency: row.project_currency_amount_minor === null ? row.currency : row.project_currency,
      amountMinor: String(
        row.project_currency_amount_minor === null
          ? row.amount_minor
          : row.project_currency_amount_minor,
      ),
      reimbursementAmountMinor: String(
        row.project_currency_amount_minor === null
          ? row.amount_minor
          : (row.reimbursement_amount_minor ?? row.project_currency_amount_minor),
      ),
      reimbursementState: row.reimbursement_state,
      reimbursementReference: row.reimbursement_reference,
      projectNumber: row.project_number,
      projectName: row.project_name,
    }));
  }

  workerPay(principal: Principal, periodStart: string, periodEnd: string) {
    this.assertActive(principal);
    requireDate(periodStart, 'Period start');
    requireDate(periodEnd, 'Period end');
    const sourceRows = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,t.approval_state,
                 t.billability_state,p.currency project_currency
          FROM time_entry t JOIN project p ON p.id=t.project_id
          JOIN project_member pm ON pm.project_id=t.project_id AND pm.user_id=t.worker_id
          WHERE t.worker_id=? AND t.work_date BETWEEN ? AND ? AND pm.status='active'
            AND pm.starts_on<=t.work_date AND (pm.ends_on IS NULL OR pm.ends_on>=t.work_date)
            AND t.approval_state NOT IN ('rejected','void')
          ORDER BY t.work_date,t.id`,
      )
      .all(principal.userId, periodStart, periodEnd) as TimeRow[];
    const rows = this.canonicalEconomicTimeRows(sourceRows);
    const currencies = new Set<V3Currency>(sourceRows.map((row) => row.project_currency));
    let approvedMinutes = 0;
    let pendingMinutes = 0;
    let approved = 0n;
    let pending = 0n;
    let guaranteedMinutes = 0;
    let missingRules = 0;
    let percentageRows = 0;
    const settlementTriggers = new Set<string>();
    const approvedByProject = new Map<string, bigint>();
    const pendingByProject = new Map<string, bigint>();
    const dailyRules = new Map<
      string,
      { rule: CompensationRuleRow; projectId: string; approved: boolean; pending: boolean }
    >();
    const fixedRules = new Map<
      string,
      { rule: CompensationRuleRow; projectId: string; approved: boolean; pending: boolean }
    >();
    const dailyGuarantees = new Map<
      string,
      {
        rule: CompensationRuleRow;
        projectId: string;
        approvedMinutes: number;
        pendingMinutes: number;
      }
    >();
    const projectIds = new Set<string>();
    const addProjectAmount = (target: Map<string, bigint>, projectId: string, amount: bigint) => {
      if (amount === 0n) return;
      target.set(projectId, (target.get(projectId) ?? 0n) + amount);
    };
    for (const row of rows) {
      projectIds.add(row.project_id);
      const rule = this.compensationRuleFor(
        row.project_id,
        principal.userId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      const clientRate = this.clientRateFor(
        row.project_id,
        principal.userId,
        row.category,
        row.work_date,
        row.activity_code,
      );
      if (!rule) missingRules += 1;
      if (rule && rule.currency !== row.project_currency) {
        missingRules += 1;
        continue;
      }
      const usableClientRate =
        clientRate && clientRate.currency === row.project_currency ? clientRate : null;
      if (rule?.rule_type === 'PercentageOfEligibleClientLabor') percentageRows += 1;
      if (rule) settlementTriggers.add(rule.settlement_trigger);
      const amount = this.compensationAmount(row, rule, usableClientRate);
      if (rule?.rule_type === 'Daily' || rule?.rate_basis === 'daily') {
        const key = `${row.project_id}:${row.work_date}:${rule.id}`;
        const existing = dailyRules.get(key) ?? {
          rule,
          projectId: row.project_id,
          approved: false,
          pending: false,
        };
        if (row.approval_state === 'approved' || row.approval_state === 'locked')
          existing.approved = true;
        else if (isPendingApproval(row.approval_state)) existing.pending = true;
        dailyRules.set(key, existing);
      } else if (
        rule?.rule_type === 'FixedPerBillingPeriod' ||
        rule?.rule_type === 'FixedProjectAmount' ||
        rule?.rule_type === 'CustomApprovedAdjustment'
      ) {
        const key = `${row.project_id}:${rule.id}`;
        const existing = fixedRules.get(key) ?? {
          rule,
          projectId: row.project_id,
          approved: false,
          pending: false,
        };
        if (row.approval_state === 'approved' || row.approval_state === 'locked')
          existing.approved = true;
        else if (isPendingApproval(row.approval_state)) existing.pending = true;
        fixedRules.set(key, existing);
      }
      if (
        rule?.rule_type === 'Hourly' &&
        rule.rate_basis !== 'daily' &&
        rule.daily_guarantee_minutes
      ) {
        const key = `${row.project_id}:${row.work_date}:${rule.id}`;
        const existing = dailyGuarantees.get(key) ?? {
          rule,
          projectId: row.project_id,
          approvedMinutes: 0,
          pendingMinutes: 0,
        };
        if (row.approval_state === 'approved' || row.approval_state === 'locked')
          existing.approvedMinutes += row.minutes;
        else if (isPendingApproval(row.approval_state)) existing.pendingMinutes += row.minutes;
        dailyGuarantees.set(key, existing);
      }
      if (row.approval_state === 'approved' || row.approval_state === 'locked') {
        approvedMinutes += row.minutes;
        approved += amount;
        approvedByProject.set(
          row.project_id,
          (approvedByProject.get(row.project_id) ?? 0n) + amount,
        );
      } else if (isPendingApproval(row.approval_state)) {
        pendingMinutes += row.minutes;
        pending += amount;
        pendingByProject.set(row.project_id, (pendingByProject.get(row.project_id) ?? 0n) + amount);
      }
    }
    for (const {
      rule,
      projectId,
      approved: hasApproved,
      pending: hasPending,
    } of dailyRules.values()) {
      const amount = BigInt(rule.rate_minor);
      if (hasPending) {
        pending += amount;
        addProjectAmount(pendingByProject, projectId, amount);
      } else if (hasApproved) {
        approved += amount;
        addProjectAmount(approvedByProject, projectId, amount);
      }
    }
    for (const {
      rule,
      projectId,
      approved: hasApproved,
      pending: hasPending,
    } of fixedRules.values()) {
      const amount = BigInt(rule.rate_minor);
      if (hasPending) {
        pending += amount;
        addProjectAmount(pendingByProject, projectId, amount);
      } else if (hasApproved) {
        approved += amount;
        addProjectAmount(approvedByProject, projectId, amount);
      }
    }
    for (const day of dailyGuarantees.values()) {
      const actual = day.approvedMinutes + day.pendingMinutes;
      const guaranteed = Math.max(actual, day.rule.daily_guarantee_minutes ?? 0);
      guaranteedMinutes += guaranteed;
      if (
        guaranteed > actual &&
        day.rule.rule_type === 'Hourly' &&
        day.rule.rate_basis !== 'daily'
      ) {
        const topUp = guaranteed - actual;
        const amount = hourlyRateForMinutes(
          money(day.rule.currency, BigInt(day.rule.rate_minor)),
          topUp,
        ).minorUnits;
        if (day.pendingMinutes > 0) {
          pending += amount;
          addProjectAmount(pendingByProject, day.projectId, amount);
        } else {
          approved += amount;
          addProjectAmount(approvedByProject, day.projectId, amount);
        }
      }
    }
    const reimbursementRows = this.sqlite
      .prepare(
        `SELECT e.approval_state,
                CASE WHEN e.project_currency_amount_minor IS NULL THEN e.currency ELSE p.currency END currency,
                CAST(CASE WHEN e.project_currency_amount_minor IS NULL
                          THEN e.amount_minor
                          ELSE COALESCE(e.reimbursement_amount_minor,e.project_currency_amount_minor)
                     END AS TEXT) amount
         FROM expense e JOIN project p ON p.id=e.project_id
         WHERE e.worker_id=? AND e.spent_on BETWEEN ? AND ? AND e.who_paid='worker'
           AND e.approval_state NOT IN ('rejected','void')
           AND EXISTS (
             SELECT 1 FROM project_member pm
             WHERE pm.project_id=e.project_id AND pm.user_id=e.worker_id
               AND pm.status='active' AND pm.starts_on<=e.spent_on
               AND (pm.ends_on IS NULL OR pm.ends_on>=e.spent_on)
           )`,
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      approval_state: string;
      currency: V3Currency;
      amount: string;
    }>;
    for (const row of reimbursementRows) currencies.add(row.currency);
    if (currencies.size > 1)
      throw new V3ValidationError('Multiple compensation currencies require separate statements');
    const currency = currencies.values().next().value ?? 'USD';
    const approvedReimbursementMinor = reimbursementRows
      .filter((row) => ['approved', 'locked'].includes(row.approval_state))
      .reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const pendingReimbursementMinor = reimbursementRows
      .filter((row) => ['draft', 'submitted', 'needs_changes'].includes(row.approval_state))
      .reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const projectProgress = [...projectIds]
      .map((projectId) => {
        const project = this.sqlite
          .prepare(
            `SELECT p.project_number,p.name,p.currency,p.budget_minor,p.po_cap_minor,p.revenue_budget_minor,
                  COALESCE((SELECT SUM(planned_minutes) FROM planning_assignment pa
                            WHERE pa.project_id=p.id AND pa.worker_id=? AND pa.status<>'cancelled'),0) planning_minutes,
                  COALESCE((SELECT SUM(planned_minutes) FROM project_member pm
                            WHERE pm.project_id=p.id AND pm.user_id=? AND pm.status='active'),0) member_planned_minutes
           FROM project p WHERE p.id=?`,
          )
          .get(principal.userId, principal.userId, projectId) as
          | {
              project_number: string;
              name: string;
              currency: V3Currency;
              budget_minor: number | null;
              po_cap_minor: number | null;
              revenue_budget_minor: number | null;
              planning_minutes: number;
              member_planned_minutes: number;
            }
          | undefined;
        if (!project) return null;
        const ownRows = rows.filter((row) => row.project_id === projectId);
        const actual = ownRows.reduce((sum, row) => sum + row.minutes, 0);
        const planned =
          project.planning_minutes > 0
            ? project.planning_minutes
            : project.member_planned_minutes > 0
              ? project.member_planned_minutes
              : null;
        return {
          projectId,
          projectNumber: project.project_number,
          projectName: project.name,
          currency: project.currency,
          plannedMinutes: planned,
          actualMinutes: actual,
          approvedMinutes: ownRows
            .filter((row) => row.approval_state === 'approved' || row.approval_state === 'locked')
            .reduce((sum, row) => sum + row.minutes, 0),
          pendingMinutes: ownRows
            .filter((row) => isPendingApproval(row.approval_state))
            .reduce((sum, row) => sum + row.minutes, 0),
          hoursRemaining: planned === null ? null : Math.max(0, planned - actual),
          estimatedApprovedMinor: (approvedByProject.get(projectId) ?? 0n).toString(),
          estimatedPendingMinor: (pendingByProject.get(projectId) ?? 0n).toString(),
          budgetMinor: String(
            project.po_cap_minor ?? project.revenue_budget_minor ?? project.budget_minor ?? 0,
          ),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return {
      currency,
      projectIds: [...projectIds],
      approvedMinutes,
      pendingMinutes,
      guaranteedMinutes,
      estimatedApprovedMinor: approved.toString(),
      estimatedPendingMinor: pending.toString(),
      approvedReimbursementMinor: approvedReimbursementMinor.toString(),
      pendingReimbursementMinor: pendingReimbursementMinor.toString(),
      percentageBased: percentageRows > 0,
      settlementTriggers: [...settlementTriggers],
      missingCompensationRules: missingRules,
      projectProgress,
      label: 'Estimated project compensation',
    };
  }

  projectFinance(
    principal: Principal,
    projectId: string,
    periodStart?: string,
    periodEnd?: string,
  ) {
    this.assertFinanceReadable(principal);
    this.assertProjectAccess(principal, projectId, true);
    return this.projectFinanceCore(projectId, periodStart, periodEnd);
  }

  private projectFinanceCore(projectId: string, periodStart?: string, periodEnd?: string) {
    const project = this.sqlite
      .prepare(
        `SELECT client_id,currency,client_daily_minimum_minutes,revenue_budget_minor,po_cap_minor,
                labor_budget_minutes,travel_budget_minor,planned_minutes,billing_model,fixed_price_minor
         FROM project WHERE id=?`,
      )
      .get(projectId) as
      | {
          client_id: string;
          currency: V3Currency;
          client_daily_minimum_minutes: number | null;
          revenue_budget_minor: number | null;
          po_cap_minor: number | null;
          labor_budget_minutes: number | null;
          travel_budget_minor: number | null;
          planned_minutes: number | null;
          billing_model: string;
          fixed_price_minor: number | null;
        }
      | undefined;
    if (!project) throw new V3ValidationError('Project not found');
    const start = periodStart ?? '0000-01-01';
    const end = periodEnd ?? '9999-12-31';
    if (periodStart) requireDate(periodStart, 'Period start');
    if (periodEnd) requireDate(periodEnd, 'Period end');
    const time = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,u.name worker_name,t.work_date,t.category,t.activity_code,
                t.minutes,t.approval_state,t.billability_state,t.billing_status,t.invoice_id,t.version,
                p.currency project_currency
         FROM time_entry t JOIN project p ON p.id=t.project_id
         JOIN user u ON u.id=t.worker_id
         WHERE t.project_id=? AND t.work_date BETWEEN ? AND ?
           AND t.approval_state NOT IN ('rejected','void')
         ORDER BY t.work_date,t.worker_id,COALESCE(t.start_time,t.created_at),t.id`,
      )
      .all(projectId, start, end) as Array<TimeRow & { worker_name: string }>;
    const policyByDate = new Map<string, EffectiveTimeCommercialPolicy | null>();
    const commercialSlicesBySource = new Map<string, readonly TimeCommercialSlice[]>();
    for (const workDate of new Set(time.map((row) => row.work_date))) {
      const policy = this.timeCommercialPolicyFor(projectId, workDate);
      policyByDate.set(workDate, policy);
      if (!policy) continue;
      const eligibleEntries = time
        .filter(
          (row) =>
            row.work_date === workDate &&
            (row.category === 'regular' || row.category === 'commissioning'),
        )
        .map((row) => ({
          id: row.id,
          projectId: row.project_id,
          workerId: row.worker_id,
          workDate: row.work_date,
          category: row.category,
          minutes: row.minutes,
        }));
      if (eligibleEntries.length === 0) continue;
      const derived = deriveTimeCommercialSlices({ entries: eligibleEntries, policy });
      for (const slice of derived) {
        const existing = commercialSlicesBySource.get(slice.sourceEntryId) ?? [];
        commercialSlicesBySource.set(slice.sourceEntryId, [...existing, slice]);
      }
    }
    let laborRevenue = 0n;
    let laborCost = 0n;
    let workerCompensation = 0n;
    let billableMinutes = 0;
    let approvedMinutes = 0;
    let unapprovedMinutes = 0;
    let overtimeMinutes = 0;
    let standbyMinutes = 0;
    let travelMinutes = 0;
    let missingRates = 0;
    const timeFinanceReasons: Array<{ code: string; sourceId: string }> = [];
    let unapprovedWip = 0n;
    const economics: Array<Record<string, OutputValue>> = [];
    const approvedUnbilledSources: Array<Record<string, unknown>> = [];
    const approvedCommerciallyBillableSourceIds = new Set<string>();
    const dailyBillable = new Map<
      string,
      { workerId: string; workDate: string; minutes: number; rate: bigint }
    >();
    const dailyMinimumAdjustments: Array<Record<string, unknown>> = [];
    for (const row of time) {
      const policy = policyByDate.get(row.work_date) ?? null;
      const derivedSlices = commercialSlicesBySource.get(row.id);
      const clientSlices =
        derivedSlices && derivedSlices.length > 0
          ? derivedSlices
          : [
              {
                sourceEntryId: row.id,
                projectId: row.project_id,
                workerId: row.worker_id,
                workDate: row.work_date,
                operationalCategory: row.category,
                category:
                  row.category === 'overtime' ? ('overtime' as const) : ('regular' as const),
                minutes: row.minutes,
                clientBillable:
                  row.category === 'travel' ? (policy?.travelClientBillable ?? true) : true,
              },
            ];
      const commerciallyPotentialBillableSlices = clientSlices.filter(
        (slice) => row.billability_state !== 'non_billable' && slice.clientBillable,
      );
      const commerciallyBillableSlices = commerciallyPotentialBillableSlices.filter(
        () => row.billability_state === 'billable',
      );
      const approved = row.approval_state === 'approved' || row.approval_state === 'locked';
      if (approved) {
        approvedMinutes += row.minutes;
        overtimeMinutes += clientSlices
          .filter((slice) => slice.category === 'overtime')
          .reduce((sum, slice) => sum + slice.minutes, 0);
        if (row.category === 'standby') standbyMinutes += row.minutes;
        if (row.category === 'travel') travelMinutes += row.minutes;
      } else if (isPendingApproval(row.approval_state)) unapprovedMinutes += row.minutes;
      const economicRows = clientSlices.map((slice) => ({
        ...row,
        minutes: slice.minutes,
        category: slice.category === 'overtime' ? 'overtime' : row.category,
      }));
      const economicRules = economicRows.map((economicRow) => {
        const internalRate =
          economicRow.category === 'overtime'
            ? (this.internalCostFor(
                projectId,
                row.worker_id,
                'overtime',
                row.work_date,
                row.activity_code,
              ) ??
              this.internalCostFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              ))
            : this.internalCostFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              );
        const compensationRule =
          economicRow.category === 'overtime'
            ? (this.compensationRuleFor(
                projectId,
                row.worker_id,
                'overtime',
                row.work_date,
                row.activity_code,
              ) ??
              this.compensationRuleFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              ))
            : this.compensationRuleFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              );
        return {
          row: economicRow,
          internalRate: internalRate?.currency === project.currency ? internalRate : null,
          compensationRule:
            compensationRule?.currency === project.currency ? compensationRule : null,
        };
      });
      const allInternalRatesConfigured = economicRules.every((item) => item.internalRate !== null);
      const allCompensationRulesConfigured = economicRules.every(
        (item) => item.compensationRule !== null,
      );
      const pricedPotentialClientSlices = commerciallyPotentialBillableSlices.map((slice) => {
        const selectedRate =
          slice.category === 'overtime'
            ? (this.clientRateFor(
                projectId,
                row.worker_id,
                'overtime',
                row.work_date,
                row.activity_code,
              ) ??
              this.clientRateFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              ))
            : this.clientRateFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              );
        const usableRate = selectedRate?.currency === project.currency ? selectedRate : null;
        const rateMinor = usableRate
          ? this.clientRateAmount({ category: slice.category }, usableRate)
          : null;
        return { ...slice, rate: usableRate, rateMinor };
      });
      const pricedClientSlices = pricedPotentialClientSlices.filter(
        () => row.billability_state === 'billable',
      );
      const allPotentialSlicesPriced = pricedPotentialClientSlices.every(
        (slice) => slice.rateMinor !== null,
      );
      const allBillableSlicesPriced = pricedClientSlices.every((slice) => slice.rateMinor !== null);
      const pendingRevenue = pricedPotentialClientSlices.reduce(
        (sum, slice) =>
          sum +
          (slice.rateMinor === null
            ? 0n
            : hourlyRateForMinutes(money(project.currency, slice.rateMinor), slice.minutes)
                .minorUnits),
        0n,
      );
      if (!approved) {
        if (isPendingApproval(row.approval_state)) unapprovedWip += pendingRevenue;
        economics.push({
          id: row.id,
          workerId: row.worker_id,
          workerName: row.worker_name,
          workDate: row.work_date,
          category: row.category,
          actualMinutes: row.minutes,
          approved: false,
          approvalState: row.approval_state,
          billabilityState: row.billability_state,
          clientBillableMinutes: commerciallyBillableSlices.reduce(
            (sum, slice) => sum + slice.minutes,
            0,
          ),
          commercialOvertimeMinutes: clientSlices
            .filter((slice) => slice.category === 'overtime')
            .reduce((sum, slice) => sum + slice.minutes, 0),
          commercialPolicyId: policy?.id ?? null,
          clientMinimumAdjustmentMinutes: 0,
          billingStatus: row.billing_status ?? 'unlocked',
          invoiceId: row.invoice_id ?? null,
          clientRevenueMinor: pendingRevenue.toString(),
          internalCostMinor: '0',
          workerCompensationMinor: '0',
          clientRateConfigured: allPotentialSlicesPriced,
          internalCostConfigured: allInternalRatesConfigured,
          compensationRuleType: economicRules[0]?.compensationRule?.rule_type ?? null,
        });
        continue;
      }
      const revenue = pricedClientSlices.reduce(
        (sum, slice) =>
          sum +
          (slice.rateMinor === null
            ? 0n
            : hourlyRateForMinutes(money(project.currency, slice.rateMinor), slice.minutes)
                .minorUnits),
        0n,
      );
      const cost = economicRules.reduce(
        (sum, item) =>
          sum +
          (item.internalRate
            ? hourlyRateForMinutes(
                money(project.currency, this.internalCostAmount(item.row, item.internalRate)),
                item.row.minutes,
              ).minorUnits
            : 0n),
        0n,
      );
      const compensation = economicRules.reduce((sum, item) => {
        const clientRate =
          item.row.category === 'overtime'
            ? (this.clientRateFor(
                projectId,
                row.worker_id,
                'overtime',
                row.work_date,
                row.activity_code,
              ) ??
              this.clientRateFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              ))
            : this.clientRateFor(
                projectId,
                row.worker_id,
                row.category,
                row.work_date,
                row.activity_code,
              );
        return (
          sum +
          this.compensationAmount(
            item.row,
            item.compensationRule,
            clientRate?.currency === project.currency ? clientRate : null,
          )
        );
      }, 0n);
      if (commerciallyBillableSlices.length > 0) {
        approvedCommerciallyBillableSourceIds.add(row.id);
        const sourceBillableMinutes = commerciallyBillableSlices.reduce(
          (sum, slice) => sum + slice.minutes,
          0,
        );
        billableMinutes += sourceBillableMinutes;
        const firstPriced = pricedClientSlices.find((slice) => slice.rateMinor !== null);
        if (firstPriced?.rateMinor !== null && firstPriced?.rateMinor !== undefined) {
          const workerDayKey = `${row.worker_id}:${row.work_date}`;
          const daily = dailyBillable.get(workerDayKey) ?? {
            workerId: row.worker_id,
            workDate: row.work_date,
            minutes: 0,
            rate: firstPriced.rateMinor,
          };
          daily.minutes += sourceBillableMinutes;
          dailyBillable.set(workerDayKey, daily);
        }
      }
      if (!allBillableSlicesPriced) {
        missingRates += 1;
        timeFinanceReasons.push({ code: 'missing_client_rate', sourceId: row.id });
      }
      if (!allInternalRatesConfigured) {
        missingRates += 1;
        timeFinanceReasons.push({ code: 'missing_internal_cost', sourceId: row.id });
      }
      if (!allCompensationRulesConfigured) {
        missingRates += 1;
        timeFinanceReasons.push({ code: 'missing_compensation_rule', sourceId: row.id });
      }
      laborRevenue += revenue;
      laborCost += cost;
      workerCompensation += compensation;
      if (
        commerciallyBillableSlices.length > 0 &&
        row.invoice_id === null &&
        (row.billing_status == null || row.billing_status === 'unlocked')
      )
        approvedUnbilledSources.push({
          sourceType: 'time',
          sourceId: row.id,
          sourceVersion: row.version ?? 1,
          amountMinor: revenue.toString(),
          workDate: row.work_date,
          workerId: row.worker_id,
        });
      economics.push({
        id: row.id,
        workerId: row.worker_id,
        workerName: row.worker_name,
        workDate: row.work_date,
        category: row.category,
        actualMinutes: row.minutes,
        approved: true,
        billabilityState: row.billability_state,
        approvalState: row.approval_state,
        clientBillableMinutes: commerciallyBillableSlices.reduce(
          (sum, slice) => sum + slice.minutes,
          0,
        ),
        commercialOvertimeMinutes: clientSlices
          .filter((slice) => slice.category === 'overtime')
          .reduce((sum, slice) => sum + slice.minutes, 0),
        commercialPolicyId: policy?.id ?? null,
        clientMinimumAdjustmentMinutes: 0,
        billingStatus: row.billing_status ?? 'unlocked',
        invoiceId: row.invoice_id ?? null,
        clientRevenueMinor: revenue.toString(),
        internalCostMinor: cost.toString(),
        workerCompensationMinor: compensation.toString(),
        clientRateConfigured: allBillableSlicesPriced,
        internalCostConfigured: allInternalRatesConfigured,
        compensationRuleType: economicRules[0]?.compensationRule?.rule_type ?? null,
      });
    }
    let dailyMinimumTopUp = 0n;
    if (project.client_daily_minimum_minutes !== null) {
      for (const daily of dailyBillable.values()) {
        const billable = billableMinutesForDailyMinimum(
          daily.minutes,
          project.client_daily_minimum_minutes,
        );
        const topUp = billable - daily.minutes;
        if (topUp > 0) {
          const topUpMinor = hourlyRateForMinutes(
            money(project.currency, daily.rate),
            topUp,
          ).minorUnits;
          dailyMinimumTopUp += topUpMinor;
          dailyMinimumAdjustments.push({
            workerId: daily.workerId,
            workDate: daily.workDate,
            sourceTimeIds: time
              .filter(
                (row) =>
                  row.worker_id === daily.workerId &&
                  row.work_date === daily.workDate &&
                  (row.approval_state === 'approved' || row.approval_state === 'locked') &&
                  approvedCommerciallyBillableSourceIds.has(row.id),
              )
              .map((row) => row.id),
            adjustmentMinutes: topUp,
            rateMinor: daily.rate.toString(),
            revenueMinor: topUpMinor.toString(),
            sourceType: 'derived_daily_minimum',
          });
          const allSourceTimeRows = time.filter(
            (row) =>
              row.worker_id === daily.workerId &&
              row.work_date === daily.workDate &&
              (row.approval_state === 'approved' || row.approval_state === 'locked') &&
              approvedCommerciallyBillableSourceIds.has(row.id),
          );
          const sourceTimeIds = allSourceTimeRows
            .filter(
              (row) =>
                row.invoice_id === null &&
                (row.billing_status == null || row.billing_status === 'unlocked'),
            )
            .map((row) => row.id);
          if (sourceTimeIds.length > 0 && sourceTimeIds.length === allSourceTimeRows.length)
            approvedUnbilledSources.push({
              sourceType: 'minimum_top_up',
              sourceId: `daily-minimum:${projectId}:${daily.workerId}:${daily.workDate}`,
              sourceVersion: 1,
              amountMinor: topUpMinor.toString(),
              workerId: daily.workerId,
              workDate: daily.workDate,
              sourceTimeIds,
            });
          billableMinutes += topUp;
        }
      }
      laborRevenue += dailyMinimumTopUp;
    }
    const expenses = this.sqlite
      .prepare(
        `SELECT e.id,e.spent_on,e.worker_id,e.category,e.currency,
                CAST(e.amount_minor AS TEXT) amount_minor,
                CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                e.who_paid,e.client_treatment,e.billing_treatment,
                CAST(e.billing_amount_minor AS TEXT) billing_amount_minor,
                e.approval_state,e.finance_approved_at,e.invoice_id,e.version,
                e.commercial_classification_state,u.name worker_name
         FROM expense e JOIN user u ON u.id=e.worker_id
         WHERE e.project_id=? AND e.spent_on BETWEEN ? AND ?
           AND e.approval_state NOT IN ('rejected','void')`,
      )
      .all(projectId, start, end) as Array<{
      id: string;
      spent_on: string;
      worker_id: string;
      category: string;
      currency: string;
      amount_minor: string;
      project_currency_amount_minor: string | null;
      who_paid: string;
      client_treatment: string;
      billing_treatment: string;
      billing_amount_minor: string | null;
      approval_state: string;
      finance_approved_at: string | null;
      invoice_id: string | null;
      version: number;
      commercial_classification_state: string;
      worker_name: string;
    }>;
    let expenseCost = 0n;
    let expenseRevenue = 0n;
    let unapprovedExpenseWip = 0n;
    let travelCost = 0n;
    let otherDirectCost = 0n;
    const expenseFinanceReasons: Array<{ code: string; sourceId: string }> = [];
    const expenseEconomics: Array<Record<string, OutputValue>> = [];
    for (const expense of expenses) {
      const treatment = expense.billing_treatment || expense.client_treatment;
      const isClassified = expense.commercial_classification_state === 'classified';
      const isDirect = expense.who_paid === 'client' || treatment === 'client_direct';
      const isBillable =
        !isDirect && (treatment.startsWith('reimbursable') || treatment === 'allowance_per_diem');
      const foreignProjectionMissing =
        expense.currency !== project.currency &&
        (expense.project_currency_amount_minor === null || expense.billing_amount_minor === null);
      const projectionMissing =
        foreignProjectionMissing ||
        (!isDirect &&
          isClassified &&
          (expense.project_currency_amount_minor === null ||
            (isBillable && expense.billing_amount_minor === null)));
      if (projectionMissing)
        expenseFinanceReasons.push({
          code:
            expense.currency === project.currency
              ? 'missing_expense_finance_projection'
              : 'missing_expense_currency_conversion',
          sourceId: expense.id,
        });
      const actualCost = projectionMissing
        ? 0n
        : BigInt(
            isClassified
              ? (expense.project_currency_amount_minor ?? 0)
              : expense.currency === project.currency
                ? expense.amount_minor
                : (expense.project_currency_amount_minor ?? 0),
          );
      const directCost = !isDirect && !projectionMissing ? actualCost : 0n;
      const revenue =
        isBillable && !projectionMissing
          ? BigInt(
              isClassified
                ? (expense.billing_amount_minor ?? 0)
                : (expense.billing_amount_minor ??
                    expense.project_currency_amount_minor ??
                    expense.amount_minor),
            )
          : 0n;
      const operationallyApproved = ['approved', 'locked'].includes(expense.approval_state);
      const financeApproved = operationallyApproved && expense.finance_approved_at !== null;
      if (!operationallyApproved) {
        if (isPendingApproval(expense.approval_state)) unapprovedExpenseWip += revenue;
        expenseEconomics.push({
          id: expense.id,
          workerId: expense.worker_id,
          workerName: expense.worker_name,
          spentOn: expense.spent_on,
          category: expense.category,
          approvalState: expense.approval_state,
          financeApprovalState: 'not_ready',
          costMinor: '0',
          actualCostMinor: actualCost.toString(),
          financeProjectionState: projectionMissing ? 'incomplete' : 'ready',
          revenueMinor: '0',
          pendingApprovalRevenueMinor: revenue.toString(),
          treatment,
          paidBy: expense.who_paid,
        });
        continue;
      }
      expenseCost += directCost;
      if (financeApproved) expenseRevenue += revenue;
      else unapprovedExpenseWip += revenue;
      if (financeApproved && expense.invoice_id === null && revenue > 0n)
        approvedUnbilledSources.push({
          sourceType: 'expense',
          sourceId: expense.id,
          sourceVersion: expense.version,
          amountMinor: revenue.toString(),
          spentOn: expense.spent_on,
          workerId: expense.worker_id,
        });
      if (
        [
          'hotel',
          'rental_car',
          'fuel',
          'tolls',
          'parking',
          'airfare',
          'ground_transport',
          'meals',
          'per_diem',
        ].includes(expense.category)
      )
        travelCost += directCost;
      else otherDirectCost += directCost;
      expenseEconomics.push({
        id: expense.id,
        workerId: expense.worker_id,
        workerName: expense.worker_name,
        spentOn: expense.spent_on,
        category: expense.category,
        approvalState: expense.approval_state,
        financeApprovalState: financeApproved ? 'approved' : 'pending',
        costMinor: directCost.toString(),
        actualCostMinor: actualCost.toString(),
        financeProjectionState: projectionMissing ? 'incomplete' : 'ready',
        revenueMinor: financeApproved ? revenue.toString() : '0',
        pendingFinanceRevenueMinor: financeApproved ? '0' : revenue.toString(),
        treatment,
        paidBy: expense.who_paid,
      });
    }
    const milestoneRows = this.sqlite
      .prepare(
        `SELECT id,CAST(amount_minor AS TEXT) amount_minor,currency,approval_state,invoice_id,due_on
         FROM project_milestone
         WHERE project_id=? AND approval_state IN ('approved','final')
           AND (? IS NULL OR due_on IS NULL OR due_on BETWEEN ? AND ?)`,
      )
      .all(projectId, periodStart ?? null, periodStart ?? null, periodEnd ?? null) as Array<{
      id: string;
      amount_minor: string;
      currency: V3Currency;
      approval_state: string;
      invoice_id: string | null;
      due_on: string | null;
    }>;
    const milestoneRevenue = milestoneRows
      .filter((row) => row.currency === project.currency && row.invoice_id === null)
      .reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
    for (const milestone of milestoneRows) {
      if (milestone.currency !== project.currency || milestone.invoice_id !== null) continue;
      approvedUnbilledSources.push({
        sourceType: 'milestone',
        sourceId: milestone.id,
        sourceVersion: 1,
        amountMinor: String(milestone.amount_minor),
        dueOn: milestone.due_on,
      });
    }
    const invoicePeriodFilter =
      periodStart && periodEnd ? ' AND i.period_end>=? AND i.period_start<=?' : '';
    const invoiceAsOf = periodEnd ? `${periodEnd}T23:59:59.999Z` : timestamp();
    const invoiceAsOfFilter = periodEnd
      ? ' AND COALESCE(i.issued_at,i.created_at)<=? AND (i.voided_at IS NULL OR i.voided_at>?)'
      : '';
    const invoiceValues: DbValue[] = [projectId];
    if (periodStart && periodEnd) invoiceValues.push(periodStart, periodEnd);
    if (periodEnd) invoiceValues.push(invoiceAsOf, invoiceAsOf);
    const activeInvoiceRows = this.sqlite
      .prepare(
        `SELECT i.id,CAST(i.subtotal_minor AS TEXT) subtotal,CAST(i.total_minor AS TEXT) total
         FROM invoice i
         WHERE i.project_id=?
           AND i.state IN ('issued','sent','partially_paid','paid','overdue'${periodEnd ? ",'void'" : ''})
           ${invoicePeriodFilter}${invoiceAsOfFilter}`,
      )
      .all(...invoiceValues) as Array<{ id: string; subtotal: string; total: string }>;
    const invoicedSubtotal = activeInvoiceRows.reduce(
      (sum, invoice) => sum + BigInt(invoice.subtotal),
      0n,
    );
    const invoicedGross = activeInvoiceRows.reduce(
      (sum, invoice) => sum + BigInt(invoice.total),
      0n,
    );
    const collected = activeInvoiceRows.reduce(
      (sum, invoice) => sum + this.invoiceCollectionTotals(invoice.id, invoiceAsOf).netCollected,
      0n,
    );
    const operationalRevenue = laborRevenue + expenseRevenue + milestoneRevenue;
    // The operational value is useful for management even when the commercial
    // model bills a fixed amount or is explicitly internal. The customer-facing
    // candidate must follow the configured project model instead of blindly
    // adding every approved source.
    const revenue =
      project.billing_model === 'all_in' && project.fixed_price_minor !== null
        ? BigInt(project.fixed_price_minor) + milestoneRevenue
        : project.billing_model === 'internal'
          ? 0n
          : operationalRevenue;
    const directCost = laborCost + expenseCost;
    const contribution = revenue - directCost;
    const budget = project.po_cap_minor ?? project.revenue_budget_minor;
    const actualMinutes = approvedMinutes;
    const returnedApprovedUnbilledSources =
      project.billing_model === 'internal' ? [] : approvedUnbilledSources;
    const approvedUnbilledWip = returnedApprovedUnbilledSources.reduce(
      (sum, source) => sum + BigInt(String(source.amountMinor ?? 0)),
      0n,
    );
    const approvedUnbilledSourceKeys = returnedApprovedUnbilledSources.map(
      (source) => `${String(source.sourceType)}:${String(source.sourceId)}`,
    );
    const approvedUnbilledWipReconciles =
      new Set(approvedUnbilledSourceKeys).size === approvedUnbilledSourceKeys.length &&
      returnedApprovedUnbilledSources.every(
        (source) => typeof source.amountMinor === 'string' && /^-?\d+$/.test(source.amountMinor),
      ) &&
      returnedApprovedUnbilledSources.reduce(
        (sum, source) => sum + BigInt(String(source.amountMinor)),
        0n,
      ) === approvedUnbilledWip;
    const approvedUnbilledWipStatus =
      project.billing_model === 'internal'
        ? 'not_billable'
        : ['all_in', 'capped_tm', 'hybrid'].includes(project.billing_model)
          ? 'requires_commercial_allocation'
          : 'source_backed';
    const planning = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(planned_minutes),0) minutes
         FROM planning_assignment
         WHERE project_id=? AND status<>'cancelled' AND ends_at>=? AND starts_at<=?`,
      )
      .get(projectId, `${start}T00:00:00.000Z`, `${end}T23:59:59.999Z`) as { minutes: number };
    const memberPlanning = this.sqlite
      .prepare(
        `SELECT COALESCE(SUM(planned_minutes),0) minutes
         FROM project_member
         WHERE project_id=? AND status='active'`,
      )
      .get(projectId) as { minutes: number };
    const plannedMinutes =
      project.planned_minutes ??
      (planning.minutes > 0
        ? planning.minutes
        : memberPlanning.minutes > 0
          ? memberPlanning.minutes
          : null);
    const plannedRemainingMinutes =
      plannedMinutes === null ? null : Math.max(0, plannedMinutes - actualMinutes);
    const forecastDate = periodEnd ?? new Date().toISOString().slice(0, 10);
    const assignedWorkers = this.sqlite
      .prepare(
        `SELECT DISTINCT user_id worker_id
         FROM project_member
         WHERE project_id=? AND status='active' AND starts_on<=?
           AND (ends_on IS NULL OR ends_on>=?)`,
      )
      .all(projectId, forecastDate, forecastDate) as Array<{ worker_id: string }>;
    let fallbackCostRate = 0n;
    let fallbackClientRate = 0n;
    let fallbackRateCount = 0;
    for (const worker of assignedWorkers) {
      const internalRate = this.internalCostFor(
        projectId,
        worker.worker_id,
        'regular',
        forecastDate,
      );
      const clientRate = this.clientRateFor(projectId, worker.worker_id, 'regular', forecastDate);
      if (
        internalRate?.currency === project.currency &&
        clientRate?.currency === project.currency
      ) {
        fallbackCostRate += this.internalCostAmount({ category: 'regular' }, internalRate);
        fallbackClientRate += this.clientRateAmount({ category: 'regular' }, clientRate);
        fallbackRateCount += 1;
      }
    }
    const averageCostRate =
      approvedMinutes > 0
        ? divideRounded(laborCost * 60n, BigInt(approvedMinutes))
        : fallbackRateCount > 0
          ? divideRounded(fallbackCostRate, BigInt(fallbackRateCount))
          : null;
    const averageClientRate =
      billableMinutes > 0
        ? divideRounded(laborRevenue * 60n, BigInt(billableMinutes))
        : fallbackRateCount > 0
          ? divideRounded(fallbackClientRate, BigInt(fallbackRateCount))
          : null;
    const estimateToCompleteLaborCost =
      plannedRemainingMinutes === null || averageCostRate === null
        ? null
        : hourlyRateForMinutes(money(project.currency, averageCostRate), plannedRemainingMinutes)
            .minorUnits;
    const estimateToCompleteLaborRevenue =
      plannedRemainingMinutes === null || averageClientRate === null
        ? null
        : hourlyRateForMinutes(money(project.currency, averageClientRate), plannedRemainingMinutes)
            .minorUnits;
    const remainingTravelBudget =
      project.travel_budget_minor === null
        ? 0n
        : BigInt(project.travel_budget_minor) > travelCost
          ? BigInt(project.travel_budget_minor) - travelCost
          : 0n;
    const estimateToComplete =
      estimateToCompleteLaborCost === null
        ? null
        : estimateToCompleteLaborCost + remainingTravelBudget;
    const estimateAtCompletionCost =
      estimateToComplete === null ? null : directCost + estimateToComplete;
    const estimateAtCompletionRevenue =
      estimateToCompleteLaborRevenue === null ? null : revenue + estimateToCompleteLaborRevenue;
    const expectedFinalMargin =
      estimateAtCompletionCost === null || estimateAtCompletionRevenue === null
        ? null
        : estimateAtCompletionRevenue - estimateAtCompletionCost;
    const hoursConsumedBps =
      project.labor_budget_minutes && project.labor_budget_minutes > 0
        ? divideRounded(BigInt(actualMinutes) * 10_000n, BigInt(project.labor_budget_minutes))
        : null;
    const travelBudgetConsumedBps =
      project.travel_budget_minor && project.travel_budget_minor > 0
        ? divideRounded(travelCost * 10_000n, BigInt(project.travel_budget_minor))
        : null;
    const budgetConsumedBps =
      budget && budget > 0 ? divideRounded(revenue * 10_000n, BigInt(budget)) : null;
    const costBudgetConsumedBps =
      budget && budget > 0 ? divideRounded(directCost * 10_000n, BigInt(budget)) : null;
    const alerts: string[] = [];
    if (budget && budget > 0 && revenue * 100n >= BigInt(budget) * 95n)
      alerts.push('PO_OR_REVENUE_BUDGET_AT_95_PERCENT');
    else if (budget && budget > 0 && revenue * 100n >= BigInt(budget) * 85n)
      alerts.push('PO_OR_REVENUE_BUDGET_AT_85_PERCENT');
    else if (budget && budget > 0 && revenue * 100n >= BigInt(budget) * 70n)
      alerts.push('PO_OR_REVENUE_BUDGET_AT_70_PERCENT');
    if (
      project.labor_budget_minutes &&
      project.labor_budget_minutes > 0 &&
      actualMinutes * 100 >= project.labor_budget_minutes * 95
    )
      alerts.push('LABOR_HOURS_BUDGET_AT_95_PERCENT');
    if (
      project.travel_budget_minor &&
      project.travel_budget_minor > 0 &&
      travelCost * 100n >= BigInt(project.travel_budget_minor) * 95n
    )
      alerts.push('TRAVEL_BUDGET_AT_95_PERCENT');
    if (expectedFinalMargin !== null && expectedFinalMargin < 0n)
      alerts.push('NEGATIVE_PROJECTED_MARGIN');
    if (missingRates > 0) alerts.push('MISSING_RATE');
    if (expenseFinanceReasons.length > 0) alerts.push('MISSING_EXPENSE_FINANCE_PROJECTION');
    return {
      state:
        timeFinanceReasons.length > 0 || expenseFinanceReasons.length > 0 ? 'incomplete' : 'ready',
      reasons: [...timeFinanceReasons, ...expenseFinanceReasons],
      currency: project.currency,
      billingModel: project.billing_model,
      fixedPriceMinor:
        project.fixed_price_minor === null ? null : String(project.fixed_price_minor),
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      actualMinutes,
      approvedMinutes,
      billableMinutes,
      unapprovedMinutes,
      overtimeMinutes,
      standbyMinutes,
      travelMinutes,
      laborRevenueMinor: laborRevenue.toString(),
      expenseRevenueMinor: expenseRevenue.toString(),
      milestoneRevenueMinor: milestoneRevenue.toString(),
      operationalRevenueCandidateMinor: operationalRevenue.toString(),
      revenueCandidateMinor: revenue.toString(),
      directLaborCostMinor: laborCost.toString(),
      workerCompensationMinor: workerCompensation.toString(),
      travelCostMinor: travelCost.toString(),
      otherDirectCostMinor: otherDirectCost.toString(),
      approvedCostMinor: directCost.toString(),
      contributionMarginMinor: contribution.toString(),
      contributionMarginBps:
        revenue === 0n ? '0' : divideRounded(contribution * 10_000n, revenue).toString(),
      invoicedMinor: invoicedSubtotal.toString(),
      invoicedGrossMinor: invoicedGross.toString(),
      paidMinor: collected.toString(),
      receivableMinor: (invoicedGross - collected).toString(),
      approvedUnbilledWipMinor:
        project.billing_model === 'internal' ? '0' : approvedUnbilledWip.toString(),
      approvedUnbilledWipStatus,
      approvedUnbilledWipReconciles,
      approvedUnbilledSources: returnedApprovedUnbilledSources,
      unapprovedWipMinor: (unapprovedWip + unapprovedExpenseWip).toString(),
      unapprovedLaborWipMinor: unapprovedWip.toString(),
      unapprovedExpenseWipMinor: unapprovedExpenseWip.toString(),
      budgetMinor: budget === null ? null : String(budget),
      remainingCapMinor: budget === null ? null : (BigInt(budget) - invoicedSubtotal).toString(),
      budgetConsumedBps: budgetConsumedBps === null ? null : budgetConsumedBps.toString(),
      costBudgetConsumedBps:
        costBudgetConsumedBps === null ? null : costBudgetConsumedBps.toString(),
      hoursConsumedBps: hoursConsumedBps === null ? null : hoursConsumedBps.toString(),
      travelBudgetMinor:
        project.travel_budget_minor === null ? null : String(project.travel_budget_minor),
      travelBudgetConsumedBps:
        travelBudgetConsumedBps === null ? null : travelBudgetConsumedBps.toString(),
      plannedMinutes,
      plannedRemainingMinutes,
      estimateToCompleteMinor: estimateToComplete === null ? null : estimateToComplete.toString(),
      estimateToCompleteLaborCostMinor:
        estimateToCompleteLaborCost === null ? null : estimateToCompleteLaborCost.toString(),
      estimateAtCompletionCostMinor:
        estimateAtCompletionCost === null ? null : estimateAtCompletionCost.toString(),
      estimateAtCompletionRevenueMinor:
        estimateAtCompletionRevenue === null ? null : estimateAtCompletionRevenue.toString(),
      expectedFinalMarginMinor:
        expectedFinalMargin === null ? null : expectedFinalMargin.toString(),
      expectedFinalMarginBps:
        expectedFinalMargin === null ||
        estimateAtCompletionRevenue === null ||
        estimateAtCompletionRevenue === 0n
          ? null
          : divideRounded(expectedFinalMargin * 10_000n, estimateAtCompletionRevenue).toString(),
      forecastAvailable: estimateToComplete !== null,
      forecastBasis:
        plannedMinutes === null
          ? 'No detailed plan configured'
          : 'Actual plus active planning assignments',
      alerts,
      dailyMinimumTopUpMinor: dailyMinimumTopUp.toString(),
      missingRateCount: missingRates,
      timeEconomics: economics,
      dailyMinimumAdjustments,
      expenseEconomics,
    };
  }

  financePortfolio(principal: Principal, periodStart?: string, periodEnd?: string) {
    this.assertFinanceReadable(principal);
    if (periodStart) requireDate(periodStart, 'Period start');
    if (periodEnd) requireDate(periodEnd, 'Period end');
    const projects = this.sqlite
      .prepare(
        `SELECT p.id,p.project_number,p.name,p.currency,p.client_id,c.client_number,c.display_name client_name
         FROM project p JOIN client c ON c.id=p.client_id
         ORDER BY p.project_number`,
      )
      .all() as Array<{
      id: string;
      project_number: string;
      name: string;
      currency: V3Currency;
      client_id: string;
      client_number: string;
      client_name: string;
    }>;
    const permittedProjects = projects.filter(
      (project) => principal.role !== 'project_manager' || principal.projectIds.has(project.id),
    );
    const toBigInt = (value: unknown): bigint => BigInt(String(value ?? 0));
    const byClient = new Map<
      string,
      {
        clientId: string;
        clientNumber: string;
        clientName: string;
        currency: V3Currency;
        revenue: bigint;
        cost: bigint;
        invoiced: bigint;
        paid: bigint;
      }
    >();
    const byWorker = new Map<
      string,
      {
        workerId: string;
        workerName: string;
        currency: V3Currency;
        actualMinutes: number;
        billableMinutes: number;
        revenue: bigint;
        internalCost: bigint;
        compensation: bigint;
        travelCost: bigint;
        expenseCost: bigint;
      }
    >();
    const byMonth = new Map<
      string,
      { month: string; currency: V3Currency; actualMinutes: number; revenue: bigint; cost: bigint }
    >();
    const byWeek = new Map<
      string,
      {
        weekStart: string;
        currency: V3Currency;
        actualMinutes: number;
        revenue: bigint;
        cost: bigint;
      }
    >();
    const projectRows: Array<Record<string, unknown>> = [];
    const weekStart = (value: string): string => {
      const date = new Date(`${value}T00:00:00.000Z`);
      const day = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      return date.toISOString().slice(0, 10);
    };
    for (const project of permittedProjects) {
      const finance = this.projectFinance(principal, project.id, periodStart, periodEnd) as {
        actualMinutes: number;
        billableMinutes: number;
        revenueCandidateMinor: string;
        approvedCostMinor: string;
        invoicedMinor: string;
        paidMinor: string;
        receivableMinor: string;
        approvedUnbilledWipMinor: string;
        unapprovedWipMinor: string;
        contributionMarginMinor: string;
        contributionMarginBps: string;
        timeEconomics: Array<Record<string, unknown>>;
        expenseEconomics: Array<Record<string, unknown>>;
      };
      projectRows.push({
        projectId: project.id,
        projectNumber: project.project_number,
        projectName: project.name,
        clientId: project.client_id,
        clientNumber: project.client_number,
        clientName: project.client_name,
        currency: project.currency,
        ...finance,
      });
      const clientKey = `${project.client_id}:${project.currency}`;
      const client = byClient.get(clientKey) ?? {
        clientId: project.client_id,
        clientNumber: project.client_number,
        clientName: project.client_name,
        currency: project.currency,
        revenue: 0n,
        cost: 0n,
        invoiced: 0n,
        paid: 0n,
      };
      client.revenue += toBigInt(finance.revenueCandidateMinor);
      client.cost += toBigInt(finance.approvedCostMinor);
      client.invoiced += toBigInt(finance.invoicedMinor);
      client.paid += toBigInt(finance.paidMinor);
      byClient.set(clientKey, client);
      for (const row of finance.timeEconomics) {
        if (row.approved !== true) continue;
        const workerId = String(row.workerId ?? '');
        if (!workerId) continue;
        const workerKey = `${workerId}:${project.currency}`;
        const worker = byWorker.get(workerKey) ?? {
          workerId,
          workerName: String(row.workerName ?? workerId),
          currency: project.currency,
          actualMinutes: 0,
          billableMinutes: 0,
          revenue: 0n,
          internalCost: 0n,
          compensation: 0n,
          travelCost: 0n,
          expenseCost: 0n,
        };
        worker.actualMinutes += Number(row.actualMinutes ?? 0);
        worker.billableMinutes += Number(row.clientBillableMinutes ?? 0);
        worker.revenue += toBigInt(row.clientRevenueMinor);
        worker.internalCost += toBigInt(row.internalCostMinor);
        worker.compensation += toBigInt(row.workerCompensationMinor);
        byWorker.set(workerKey, worker);
        const date = String(row.workDate);
        const monthKey = `${date.slice(0, 7)}:${project.currency}`;
        const month = byMonth.get(monthKey) ?? {
          month: date.slice(0, 7),
          currency: project.currency,
          actualMinutes: 0,
          revenue: 0n,
          cost: 0n,
        };
        month.actualMinutes += Number(row.actualMinutes ?? 0);
        month.revenue += toBigInt(row.clientRevenueMinor);
        month.cost += toBigInt(row.internalCostMinor);
        byMonth.set(monthKey, month);
        const start = weekStart(date);
        const weekKey = `${start}:${project.currency}`;
        const week = byWeek.get(weekKey) ?? {
          weekStart: start,
          currency: project.currency,
          actualMinutes: 0,
          revenue: 0n,
          cost: 0n,
        };
        week.actualMinutes += Number(row.actualMinutes ?? 0);
        week.revenue += toBigInt(row.clientRevenueMinor);
        week.cost += toBigInt(row.internalCostMinor);
        byWeek.set(weekKey, week);
      }
      for (const row of finance.expenseEconomics) {
        if (!['approved', 'locked'].includes(String(row.approvalState))) continue;
        const workerId = String(row.workerId ?? '');
        const workerKey = `${workerId}:${project.currency}`;
        const worker = byWorker.get(workerKey) ?? {
          workerId,
          workerName: String(row.workerName ?? workerId),
          currency: project.currency,
          actualMinutes: 0,
          billableMinutes: 0,
          revenue: 0n,
          internalCost: 0n,
          compensation: 0n,
          travelCost: 0n,
          expenseCost: 0n,
        };
        const expense = toBigInt(row.costMinor);
        worker.expenseCost += expense;
        if (
          [
            'hotel',
            'rental_car',
            'fuel',
            'tolls',
            'parking',
            'airfare',
            'ground_transport',
            'meals',
            'per_diem',
          ].includes(String(row.category))
        )
          worker.travelCost += expense;
        byWorker.set(workerKey, worker);
      }
    }
    const serialize = (row: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'bigint' ? value.toString() : value,
        ]),
      );
    const clientRows = [...byClient.values()].map((row) =>
      serialize({
        ...row,
        revenue: row.revenue,
        cost: row.cost,
        invoiced: row.invoiced,
        paid: row.paid,
        contribution: row.revenue - row.cost,
      }),
    );
    const workerRows = [...byWorker.values()].map((row) =>
      serialize({
        ...row,
        contribution: row.revenue - row.internalCost - row.expenseCost,
        marginBps:
          row.revenue === 0n
            ? '0'
            : divideRounded(
                (row.revenue - row.internalCost - row.expenseCost) * 10_000n,
                row.revenue,
              ),
      }),
    );
    const periodRows = (
      rows: Map<
        string,
        {
          actualMinutes: number;
          revenue: bigint;
          cost: bigint;
          currency: V3Currency;
          month?: string;
          weekStart?: string;
        }
      >,
    ) =>
      [...rows.values()].map((row) => serialize({ ...row, contribution: row.revenue - row.cost }));
    return {
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      projects: projectRows,
      byClient: clientRows,
      byWorker: workerRows,
      byMonth: periodRows(byMonth),
      byWeek: periodRows(byWeek),
    };
  }

  masterLedger(
    principal: Principal,
    filters: Readonly<{
      start?: string;
      end?: string;
      projectId?: string;
      workerId?: string;
      clientId?: string;
      legalEntityId?: string;
      currency?: V3Currency;
      streamType?: string;
      state?: string;
    }> = {},
  ) {
    this.assertFinanceReadable(principal);
    if (filters.projectId) this.assertProjectAccess(principal, filters.projectId, true);
    const clauses = [
      "i.state IN ('issued','sent','partially_paid','paid','overdue','void','credited')",
    ];
    const values: DbValue[] = [];
    if (filters.start) {
      requireDate(filters.start, 'Start date');
      clauses.push('COALESCE(i.issued_at, i.created_at) >= ?');
      values.push(`${filters.start}T00:00:00.000Z`);
    }
    if (filters.end) {
      requireDate(filters.end, 'End date');
      clauses.push('COALESCE(i.issued_at, i.created_at) <= ?');
      values.push(`${filters.end}T23:59:59.999Z`);
    }
    if (filters.projectId) {
      clauses.push('i.project_id=?');
      values.push(filters.projectId);
    } else if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (ids.length === 0) return [];
      clauses.push(`i.project_id IN (${ids.map(() => '?').join(',')})`);
      values.push(...ids);
    }
    if (filters.clientId) {
      clauses.push('p.client_id=?');
      values.push(filters.clientId);
    }
    if (filters.legalEntityId) {
      clauses.push('br.legal_entity_id=?');
      values.push(filters.legalEntityId);
    }
    if (filters.currency) {
      clauses.push('i.currency=?');
      values.push(filters.currency);
    }
    if (filters.workerId) {
      clauses.push(
        "EXISTS (SELECT 1 FROM invoice_source worker_source JOIN time_entry worker_time ON worker_time.id=worker_source.source_id WHERE worker_source.invoice_id=i.id AND worker_source.source_type='time' AND worker_time.worker_id=?)",
      );
      values.push(filters.workerId);
    }
    if (filters.streamType) {
      clauses.push('i.stream_type=?');
      values.push(filters.streamType);
    }
    if (filters.state) {
      clauses.push('i.state=?');
      values.push(filters.state);
    }
    const collectionAsOf = filters.end ? `${filters.end}T23:59:59.999Z` : timestamp();
    const invoices = this.sqlite
      .prepare(
        `SELECT i.id,i.invoice_number,i.project_id,i.stream_type,i.currency,i.period_start,i.period_end,
                i.issued_at,i.due_at,CAST(i.subtotal_minor AS TEXT) subtotal_minor,
                CAST(i.tax_minor AS TEXT) tax_minor,CAST(i.total_minor AS TEXT) total_minor,
                i.state,i.voided_at,i.version,i.legal_entity_revision_id,br.legal_entity_id,
                p.project_number,p.name project_name,c.client_number,c.display_name client_name,
                p.po_number
         FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id
              JOIN billing_rule br ON br.id=i.billing_rule_id
         WHERE ${clauses.join(' AND ')} ORDER BY i.issued_at DESC,i.created_at DESC`,
      )
      .all(...values) as Array<{
      id: string;
      invoice_number: string | null;
      project_id: string;
      stream_type: string;
      currency: V3Currency;
      period_start: string | null;
      period_end: string | null;
      issued_at: string | null;
      due_at: string | null;
      subtotal_minor: string;
      tax_minor: string;
      total_minor: string;
      state: string;
      voided_at: string | null;
      version: number;
      legal_entity_revision_id: string | null;
      legal_entity_id: string;
      project_number: string;
      project_name: string;
      client_number: string;
      client_name: string;
      po_number: string | null;
    }>;
    return invoices.map((invoice) => {
      const paymentRows = this.sqlite
        .prepare(
          `SELECT id,CAST(amount_minor AS TEXT) amount_minor,currency,received_at,reference FROM payment
           WHERE invoice_id=? AND received_at<=? ORDER BY received_at,id`,
        )
        .all(invoice.id, collectionAsOf) as Array<{
        id: string;
        amount_minor: string;
        currency: V3Currency;
        received_at: string;
        reference: string | null;
      }>;
      const reversalRows = this.sqlite
        .prepare(
          `SELECT id,original_payment_id,CAST(amount_minor AS TEXT) amount_minor,currency,effective_at,reason_code,reason_text,
                  command_id,reversal_hash
           FROM invoice_payment_reversal_event
           WHERE invoice_id=? AND effective_at<=? ORDER BY effective_at,id`,
        )
        .all(invoice.id, collectionAsOf) as Array<{
        id: string;
        original_payment_id: string;
        amount_minor: string;
        currency: V3Currency;
        effective_at: string;
        reason_code: string;
        reason_text: string | null;
        command_id: string;
        reversal_hash: string;
      }>;
      const reversedByPayment = new Map<string, bigint>();
      for (const reversal of reversalRows)
        reversedByPayment.set(
          reversal.original_payment_id,
          (reversedByPayment.get(reversal.original_payment_id) ?? 0n) +
            BigInt(reversal.amount_minor),
        );
      const payments = paymentRows.map((payment) => {
        const reversed = reversedByPayment.get(payment.id) ?? 0n;
        return {
          id: payment.id,
          amount_minor: String(payment.amount_minor),
          grossAmountMinor: String(payment.amount_minor),
          reversedMinor: reversed.toString(),
          netAmountMinor: (BigInt(payment.amount_minor) - reversed).toString(),
          currency: payment.currency,
          received_at: payment.received_at,
          reference: payment.reference,
        };
      });
      const firstPaymentDate = paymentRows[0]?.received_at ?? null;
      const lastPaymentDate = paymentRows[paymentRows.length - 1]?.received_at ?? null;
      const paidAt =
        BigInt(invoice.total_minor) > 0n &&
        payments.reduce((sum, payment) => sum + BigInt(payment.netAmountMinor), 0n) >=
          BigInt(invoice.total_minor)
          ? lastPaymentDate
          : null;
      const sources = this.sqlite
        .prepare(
          `SELECT source_type,source_id,source_version,locked_at,source_hash,
                  CAST(allocated_net_minor AS TEXT) allocated_net_minor,
                  CAST(allocated_tax_minor AS TEXT) allocated_tax_minor,
                  CAST(allocated_gross_minor AS TEXT) allocated_gross_minor
           FROM invoice_source WHERE invoice_id=? ORDER BY source_type,source_id`,
        )
        .all(invoice.id) as Array<{
        source_type: string;
        source_id: string;
        source_version: number;
        locked_at: string | null;
        source_hash: string | null;
        allocated_net_minor: string | null;
        allocated_tax_minor: string | null;
        allocated_gross_minor: string | null;
      }>;
      let directLabor = 0n;
      let travel = 0n;
      let other = 0n;
      const directCostMissingSourceIds: string[] = [];
      const workers = new Set<string>();
      for (const source of sources) {
        const frozenEventRows = this.sqlite
          .prepare(
            `SELECT event_type,CAST(amount_minor AS TEXT) amount
             FROM direct_cost_event
             WHERE source_kind=? AND source_id=? AND source_version=? AND currency=?
             ORDER BY effective_at,id`,
          )
          .all(
            source.source_type,
            source.source_id,
            source.source_version,
            invoice.currency,
          ) as Array<{
          event_type: string;
          amount: string;
        }>;
        const frozenSnapshot = this.sqlite
          .prepare(
            `SELECT CAST(amount_minor AS TEXT) amount_minor FROM finance_internal_cost_snapshot
             WHERE source_kind=? AND source_id=? AND source_version=? AND currency=?
               AND (? IS NULL OR source_hash=?)
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(
            source.source_type,
            source.source_id,
            source.source_version,
            invoice.currency,
            source.source_hash,
            source.source_hash,
          ) as { amount_minor: string } | undefined;
        const frozenDirectCost =
          frozenEventRows.length > 0
            ? frozenEventRows.reduce(
                (sum, event) =>
                  sum +
                  (event.event_type === 'recognize' ? BigInt(event.amount) : -BigInt(event.amount)),
                0n,
              )
            : frozenSnapshot
              ? BigInt(frozenSnapshot.amount_minor)
              : null;
        if (source.source_type === 'time') {
          const row = this.sqlite
            .prepare(
              'SELECT worker_id,category,activity_code,work_date,minutes FROM time_entry WHERE id=?',
            )
            .get(source.source_id) as
            | {
                worker_id: string;
                category: string;
                activity_code: string | null;
                work_date: string;
                minutes: number;
              }
            | undefined;
          if (row) {
            workers.add(row.worker_id);
            if (!filters.workerId || filters.workerId === row.worker_id) {
              if (frozenDirectCost === null) directCostMissingSourceIds.push(source.source_id);
              else directLabor += frozenDirectCost;
            }
          } else directCostMissingSourceIds.push(source.source_id);
        } else if (source.source_type === 'expense') {
          const row = this.sqlite
            .prepare(
              `SELECT worker_id,category,currency,CAST(amount_minor AS TEXT) amount_minor,
                      CAST(project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                      who_paid,billing_treatment FROM expense WHERE id=?`,
            )
            .get(source.source_id) as
            | {
                worker_id: string;
                category: string;
                currency: V3Currency;
                amount_minor: string;
                project_currency_amount_minor: string | null;
                who_paid: string;
                billing_treatment: string;
              }
            | undefined;
          if (!row) {
            directCostMissingSourceIds.push(source.source_id);
          } else if (!filters.workerId || filters.workerId === row.worker_id) {
            // Issued invoice source triggers freeze these expense fields.  V2
            // direct-cost evidence takes precedence when present; this legacy
            // fallback is therefore historical source truth, never a live rate.
            if (
              frozenDirectCost === null &&
              row.currency !== invoice.currency &&
              row.project_currency_amount_minor === null
            ) {
              directCostMissingSourceIds.push(source.source_id);
              continue;
            }
            const amount =
              frozenDirectCost ?? BigInt(row.project_currency_amount_minor ?? row.amount_minor);
            if (
              row.who_paid !== 'client' &&
              row.billing_treatment !== 'client_direct' &&
              [
                'hotel',
                'rental_car',
                'fuel',
                'tolls',
                'parking',
                'airfare',
                'ground_transport',
                'meals',
                'per_diem',
              ].includes(row.category)
            )
              travel += amount;
            else other += amount;
          }
        } else if (source.source_type === 'milestone') {
          const exists = this.sqlite
            .prepare('SELECT 1 present FROM project_milestone WHERE id=?')
            .get(source.source_id);
          if (!exists) directCostMissingSourceIds.push(source.source_id);
        } else if (source.source_type === 'adjustment') {
          const exists = this.sqlite
            .prepare('SELECT 1 present FROM invoice_adjustment WHERE id=?')
            .get(source.source_id);
          if (!exists) directCostMissingSourceIds.push(source.source_id);
        }
      }
      const directCost = directLabor + travel + other;
      const grossPayments = paymentRows.reduce(
        (sum, payment) => sum + BigInt(payment.amount_minor),
        0n,
      );
      const reversed = reversalRows.reduce(
        (sum, reversal) => sum + BigInt(reversal.amount_minor),
        0n,
      );
      const netCollected = grossPayments - reversed;
      const voidAsOf = invoice.voided_at !== null && invoice.voided_at <= collectionAsOf;
      const collected = voidAsOf ? 0n : netCollected;
      const outstanding = voidAsOf ? 0n : BigInt(invoice.total_minor) - collected;
      const contribution = BigInt(invoice.subtotal_minor) - directCost;
      const directCostComplete = directCostMissingSourceIds.length === 0;
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        legalEntityId: invoice.legal_entity_id,
        legalEntityRevisionId: invoice.legal_entity_revision_id,
        clientNumber: invoice.client_number,
        clientName: invoice.client_name,
        projectNumber: invoice.project_number,
        projectName: invoice.project_name,
        streamType: invoice.stream_type,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
        issueDate: invoice.issued_at,
        dueDate: invoice.due_at,
        currency: invoice.currency,
        subtotalMinor: String(invoice.subtotal_minor),
        taxMinor: String(invoice.tax_minor),
        totalMinor: String(invoice.total_minor),
        version: invoice.version,
        directLaborCostMinor: directLabor.toString(),
        travelCostMinor: travel.toString(),
        otherDirectCostMinor: other.toString(),
        directCostMinor: directCostComplete ? directCost.toString() : null,
        directCostKnownMinor: directCost.toString(),
        directCostComplete,
        directCostMissingSourceIds,
        contributionMinor: directCostComplete ? contribution.toString() : null,
        contributionMarginBps: !directCostComplete
          ? null
          : BigInt(invoice.subtotal_minor) === 0n
            ? '0'
            : divideRounded(contribution * 10_000n, BigInt(invoice.subtotal_minor)).toString(),
        grossPaymentsMinor: grossPayments.toString(),
        paymentReversalsMinor: reversed.toString(),
        netCollectedMinor: netCollected.toString(),
        collectedMinor: collected.toString(),
        outstandingMinor: outstanding.toString(),
        firstPaymentDate,
        lastPaymentDate,
        paidAt,
        paymentStatus: voidAsOf
          ? 'void'
          : outstanding <= 0n
            ? 'paid'
            : collected > 0n
              ? 'partially_paid'
              : invoice.state === 'overdue'
                ? 'overdue'
                : 'unpaid',
        billingStatus: voidAsOf
          ? 'void'
          : outstanding <= 0n
            ? 'paid'
            : collected > 0n
              ? 'partially_paid'
              : invoice.due_at !== null && invoice.due_at.slice(0, 10) < collectionAsOf.slice(0, 10)
                ? 'overdue'
                : 'issued',
        poNumber: invoice.po_number,
        workerIds: [...workers],
        payments,
        paymentReversals: reversalRows.map((reversal) => ({
          id: reversal.id,
          originalPaymentId: reversal.original_payment_id,
          amountMinor: String(reversal.amount_minor),
          currency: reversal.currency,
          effectiveAt: reversal.effective_at,
          reasonCode: reversal.reason_code,
          reason: reversal.reason_text,
          commandId: reversal.command_id,
          reversalHash: reversal.reversal_hash,
        })),
        sources,
      };
    });
  }

  /**
   * Materialize the point-in-time direct cost used by an issued invoice.
   * This is deliberately invoked before the approved -> issued transition so
   * the source hash and version are still the reviewed draft authority.  The
   * immutable snapshot prevents later rate/configuration edits from changing
   * historical invoice contribution.
   */
  freezeInvoiceDirectCosts(
    invoiceId: string,
    legalEntityRevisionId: string | null,
    createdAt: string,
  ): void {
    const deployment = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!deployment) throw new V3ConflictError('Deployment identity is not configured');
    const invoice = this.sqlite
      .prepare("SELECT project_id,currency FROM invoice WHERE id=? AND state='approved'")
      .get(invoiceId) as { project_id: string; currency: V3Currency } | undefined;
    if (!invoice) throw new V3ConflictError('Approved invoice is required to freeze direct costs');
    const sources = this.sqlite
      .prepare(
        `SELECT source_type,source_id,source_version,source_hash
           FROM invoice_source WHERE invoice_id=? ORDER BY source_type,source_id`,
      )
      .all(invoiceId) as Array<{
      source_type: string;
      source_id: string;
      source_version: number;
      source_hash: string | null;
    }>;
    for (const source of sources) {
      if (!source.source_hash || !['time', 'expense'].includes(source.source_type)) continue;
      let amount: bigint | null = null;
      let effectiveAt: string | null = null;
      if (source.source_type === 'time') {
        const row = this.sqlite
          .prepare(
            `SELECT worker_id,category,activity_code,work_date,minutes
               FROM time_entry WHERE id=? AND version=? AND project_id=?`,
          )
          .get(source.source_id, source.source_version, invoice.project_id) as
          | {
              worker_id: string;
              category: string;
              activity_code: string | null;
              work_date: string;
              minutes: number;
            }
          | undefined;
        if (row) {
          const rate = this.internalCostFor(
            invoice.project_id,
            row.worker_id,
            row.category,
            row.work_date,
            row.activity_code,
          );
          if (rate && rate.currency === invoice.currency)
            amount = hourlyRateForMinutes(
              money(invoice.currency, this.internalCostAmount(row, rate)),
              row.minutes,
            ).minorUnits;
          effectiveAt = `${row.work_date}T00:00:00.000Z`;
        }
      } else {
        const row = this.sqlite
          .prepare(
            `SELECT spent_on,currency,CAST(amount_minor AS TEXT) amount_minor,
                    CAST(project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                    who_paid,billing_treatment
               FROM expense WHERE id=? AND version=? AND project_id=?`,
          )
          .get(source.source_id, source.source_version, invoice.project_id) as
          | {
              spent_on: string;
              currency: V3Currency;
              amount_minor: string;
              project_currency_amount_minor: string | null;
              who_paid: string;
              billing_treatment: string;
            }
          | undefined;
        if (row) {
          if (row.who_paid === 'client' || row.billing_treatment === 'client_direct') amount = 0n;
          else if (row.project_currency_amount_minor !== null)
            amount = BigInt(row.project_currency_amount_minor);
          else if (row.currency === invoice.currency) amount = BigInt(row.amount_minor);
          effectiveAt = `${row.spent_on}T00:00:00.000Z`;
        }
      }
      if (amount === null || effectiveAt === null) continue;
      const snapshotId = `finance-cost-snapshot-${canonicalSha256(
        canonicalJson({
          invoiceId,
          sourceKind: source.source_type,
          sourceId: source.source_id,
          sourceVersion: source.source_version,
          sourceHash: source.source_hash,
          currency: invoice.currency,
          amountMinor: amount.toString(),
        }),
      ).slice(0, 48)}`;
      const existing = this.sqlite
        .prepare(
          `SELECT CAST(amount_minor AS TEXT) amount_minor,project_id,legal_entity_revision_id,
                  currency,effective_at
             FROM finance_internal_cost_snapshot WHERE snapshot_id=?`,
        )
        .get(snapshotId) as
        | {
            amount_minor: string;
            project_id: string;
            legal_entity_revision_id: string | null;
            currency: string;
            effective_at: string;
          }
        | undefined;
      if (existing) {
        if (
          existing.amount_minor !== amount.toString() ||
          existing.project_id !== invoice.project_id ||
          existing.legal_entity_revision_id !== legalEntityRevisionId ||
          existing.currency !== invoice.currency ||
          existing.effective_at !== effectiveAt
        )
          throw new V3ConflictError('Invoice direct-cost snapshot identity conflict');
        continue;
      }
      this.sqlite
        .prepare(
          `INSERT INTO finance_internal_cost_snapshot(
             snapshot_id,tenant_id,deployment_id,project_id,legal_entity_revision_id,
             source_kind,source_id,source_version,source_hash,currency,amount_minor,effective_at,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          snapshotId,
          deployment.tenant_id,
          deployment.deployment_id,
          invoice.project_id,
          legalEntityRevisionId,
          source.source_type,
          source.source_id,
          source.source_version,
          source.source_hash,
          invoice.currency,
          amount,
          effectiveAt,
          createdAt,
        );
    }
  }

  private invoiceCollectionTotals(
    invoiceId: string,
    effectiveAt = timestamp(),
  ): { netCollected: bigint; outstanding: bigint; state: string } {
    const invoice = this.sqlite
      .prepare(
        'SELECT CAST(total_minor AS TEXT) total_minor,due_at,state,voided_at FROM invoice WHERE id=?',
      )
      .get(invoiceId) as
      | { total_minor: string; due_at: string | null; state: string; voided_at: string | null }
      | undefined;
    if (!invoice) throw new V3ValidationError('Invoice not found');
    if (invoice.voided_at !== null && invoice.voided_at <= effectiveAt)
      return { netCollected: 0n, outstanding: 0n, state: 'void' };
    const paymentRows = this.sqlite
      .prepare(
        `SELECT CAST(amount_minor AS TEXT) amount
         FROM payment WHERE invoice_id=? AND received_at<=? ORDER BY received_at,id`,
      )
      .all(invoiceId, effectiveAt) as Array<{ amount: string }>;
    const reversalRows = this.sqlite
      .prepare(
        `SELECT CAST(amount_minor AS TEXT) amount
         FROM invoice_payment_reversal_event
         WHERE invoice_id=? AND effective_at<=? ORDER BY effective_at,id`,
      )
      .all(invoiceId, effectiveAt) as Array<{ amount: string }>;
    const grossCollected = paymentRows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const reversed = reversalRows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const netCollected = grossCollected - reversed;
    if (netCollected < 0n)
      throw new V3ConflictError('Payment reversal history exceeds recorded payments');
    const outstanding = BigInt(invoice.total_minor) - netCollected;
    if (outstanding < 0n) throw new V3ConflictError('Invoice collection exceeds invoice total');
    if (outstanding === 0n) return { netCollected, outstanding, state: 'paid' };
    if (netCollected === 0n) {
      const sent = this.sqlite
        .prepare(
          "SELECT 1 present FROM invoice_event WHERE invoice_id=? AND event_type='sent' AND occurred_at<=? LIMIT 1",
        )
        .get(invoiceId, effectiveAt) as { present: number } | undefined;
      const overdue =
        invoice.due_at !== null && invoice.due_at.slice(0, 10) < effectiveAt.slice(0, 10);
      return { netCollected, outstanding, state: overdue ? 'overdue' : sent ? 'sent' : 'issued' };
    }
    const overdue =
      invoice.due_at !== null && invoice.due_at.slice(0, 10) < effectiveAt.slice(0, 10);
    return { netCollected, outstanding, state: overdue ? 'overdue' : 'partially_paid' };
  }

  /**
   * Enforces command invariants across all booked events, including future
   * events. Historical views and lifecycle state use invoiceCollectionTotals
   * with an explicit as-of timestamp instead.
   */
  private invoiceBookedCollectionBalance(invoiceId: string): bigint {
    const payments = (
      this.sqlite
        .prepare('SELECT CAST(amount_minor AS TEXT) amount FROM payment WHERE invoice_id=?')
        .all(invoiceId) as Array<{ amount: string }>
    ).reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const reversals = (
      this.sqlite
        .prepare(
          'SELECT CAST(amount_minor AS TEXT) amount FROM invoice_payment_reversal_event WHERE invoice_id=?',
        )
        .all(invoiceId) as Array<{ amount: string }>
    ).reduce((sum, row) => sum + BigInt(row.amount), 0n);
    return payments - reversals;
  }

  recordPayment(
    principal: Principal,
    input: Readonly<{
      invoiceId: string;
      amountMinor: bigint;
      currency: V3Currency;
      receivedAt: string;
      reference?: string;
      idempotencyKey: string;
    }>,
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (input.amountMinor <= 0n) throw new V3ValidationError('Payment must be positive');
    sqliteInteger(input.amountMinor, 'Payment');
    const receivedAt = canonicalUtcTimestamp(input.receivedAt, 'Payment received date');
    const reference = input.reference?.trim() || null;
    if (reference !== null && reference.length > 200)
      throw new V3ValidationError('Payment reference is too long');
    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200)
      throw new V3ValidationError('Payment idempotency key is required');
    return this.transaction(() => {
      const duplicate = this.sqlite
        .prepare(
          `SELECT id,invoice_id,CAST(amount_minor AS TEXT) amount_minor,currency,received_at,reference,
                  tenant_id,deployment_id,legal_entity_revision_id,command_id,payment_hash
             FROM payment WHERE idempotency_key=?`,
        )
        .get(idempotencyKey) as
        | {
            id: string;
            invoice_id: string;
            amount_minor: string;
            currency: V3Currency;
            received_at: string;
            reference: string | null;
            tenant_id: string | null;
            deployment_id: string | null;
            legal_entity_revision_id: string | null;
            command_id: string | null;
            payment_hash: string | null;
          }
        | undefined;
      if (duplicate) {
        if (
          duplicate.invoice_id !== input.invoiceId ||
          duplicate.amount_minor !== input.amountMinor.toString() ||
          duplicate.currency !== input.currency ||
          duplicate.received_at !== receivedAt ||
          duplicate.reference !== reference
        )
          throw new V3ConflictError('Payment idempotency key was already used for another payment');
        if (
          !duplicate.tenant_id ||
          !duplicate.deployment_id ||
          !duplicate.legal_entity_revision_id ||
          !duplicate.command_id ||
          !duplicate.payment_hash
        )
          throw new V3ConflictError('Legacy payment truth lacks canonical finance provenance');
        return { id: duplicate.id, created: false };
      }
      const invoice = this.sqlite
        .prepare(
          `SELECT id,CAST(total_minor AS TEXT) total_minor,currency,state,issued_at,
                  tenant_id,deployment_id,legal_entity_revision_id
             FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','overdue')`,
        )
        .get(input.invoiceId) as
        | {
            id: string;
            total_minor: string;
            currency: V3Currency;
            state: string;
            issued_at: string | null;
            tenant_id: string | null;
            deployment_id: string | null;
            legal_entity_revision_id: string | null;
          }
        | undefined;
      if (!invoice || invoice.currency !== input.currency)
        throw new V3ValidationError('Issued invoice in matching currency required');
      if (!invoice.issued_at)
        throw new V3ConflictError('Issued invoice is missing its immutable issue timestamp');
      if (!invoice.tenant_id || !invoice.deployment_id || !invoice.legal_entity_revision_id)
        throw new V3ConflictError('Issued invoice lacks canonical legal-entity provenance');
      const issuedAt = canonicalUtcTimestamp(invoice.issued_at, 'Invoice issue date');
      if (receivedAt < issuedAt)
        throw new V3ValidationError(
          'Payment received date cannot be before the invoice was issued',
        );
      const now = timestamp();
      if (receivedAt > now)
        throw new V3ValidationError('Payment received date cannot be in the future');
      const netPaidBefore = this.invoiceBookedCollectionBalance(input.invoiceId);
      if (netPaidBefore + input.amountMinor > BigInt(invoice.total_minor))
        throw new V3ValidationError('Payment exceeds invoice balance');
      const id = newId();
      const stepUp = readLiveSessionStepUp(this.sqlite, principal);
      const commandPayload = {
        schema_version: 'invoice-payment-record-v1',
        payment_id: id,
        invoice_id: input.invoiceId,
        legal_entity_revision_id: invoice.legal_entity_revision_id,
        amount_minor: input.amountMinor.toString(),
        currency: input.currency,
        received_at: receivedAt,
        reference,
      };
      const command = ensureCommand(
        this.sqlite,
        { tenantId: invoice.tenant_id, deploymentId: invoice.deployment_id },
        principal,
        {
          operation: 'payment.record',
          targetKind: 'payment',
          targetSemanticId: `payment:${input.invoiceId}:${canonicalSha256(idempotencyKey)}`,
          targetContractVersion: 'invoice-payment-record-v1',
          idempotencyKey,
          effectiveAt: receivedAt,
          currency: input.currency,
          amountMinor: input.amountMinor,
          payload: commandPayload,
          createdAt: now,
          contractVersion: 'invoice-payment-command-v1',
          evidenceNamespace: 'invoice-payment',
          evidenceIdPrefix: 'payment',
          commandIdPrefix: 'payment-command',
          stepUpVerifiedAt: stepUp?.verifiedAt ?? null,
          stepUpExpiresAt: stepUp?.expiresAt ?? null,
        },
        (message) => {
          throw new V3ConflictError(message);
        },
      );
      const prior = this.sqlite
        .prepare(
          'SELECT payment_hash FROM payment WHERE invoice_id=? AND payment_hash IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1',
        )
        .get(input.invoiceId) as { payment_hash: string } | undefined;
      const paymentEvidence = this.ensureFinanceEvidence(
        'payment_record',
        'invoice-payment-record-v1',
        `payment:${id}`,
        {
          ...commandPayload,
          command_id: command.commandId,
          prior_payment_hash: prior?.payment_hash ?? null,
        },
        now,
      );
      const paymentHash = canonicalSha256(
        canonicalJson({
          schema_version: 'invoice-payment-chain-v1',
          payload_hash: paymentEvidence.hash,
          prior_payment_hash: prior?.payment_hash ?? null,
        }),
      );
      this.sqlite
        .prepare(
          `INSERT INTO payment(
             id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key,
             tenant_id,deployment_id,legal_entity_revision_id,external_reference,prior_payment_hash,
             payment_payload_hash,actor_id,command_id,payment_hash
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.invoiceId,
          sqliteInteger(input.amountMinor, 'Payment'),
          input.currency,
          receivedAt,
          reference,
          now,
          idempotencyKey,
          invoice.tenant_id,
          invoice.deployment_id,
          invoice.legal_entity_revision_id,
          reference,
          prior?.payment_hash ?? null,
          paymentEvidence.hash,
          principal.userId,
          command.commandId,
          paymentHash,
        );
      this.sqlite
        .prepare(
          `INSERT INTO finance_change_event(
             change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,effective_at,
             evidence_type,evidence_id,evidence_hash,command_id,created_at
           ) VALUES(?,?,?,?,?,'append',?,'payment_record',?,?,?,?)`,
        )
        .run(
          newId(),
          invoice.tenant_id,
          invoice.deployment_id,
          'payment',
          id,
          receivedAt,
          paymentEvidence.id,
          paymentEvidence.hash,
          command.commandId,
          now,
        );
      const state = this.invoiceCollectionTotals(input.invoiceId, now).state;
      this.sqlite
        .prepare('UPDATE invoice SET state=?,updated_at=?,version=version+1 WHERE id=?')
        .run(state, now, input.invoiceId);
      this.sqlite
        .prepare(
          'INSERT INTO invoice_event(id,invoice_id,event_type,amount_minor,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          input.invoiceId,
          'payment',
          sqliteInteger(input.amountMinor, 'Payment'),
          reference ?? 'Payment received',
          principal.userId,
          now,
          `payment-event:${idempotencyKey}`,
        );
      this.audit(principal, 'payment.record', 'payment', id, {
        invoiceId: input.invoiceId,
        amountMinor: input.amountMinor.toString(),
        state,
      });
      return { id, created: true, state };
    });
  }

  reversePayment(
    principal: Principal,
    input: Readonly<{
      paymentId: string;
      amountMinor: bigint;
      effectiveAt: string;
      reasonCode: string;
      reason: string;
      idempotencyKey: string;
    }>,
  ): Readonly<{
    id: string;
    commandId: string;
    created: boolean;
    invoiceId: string;
    reversedMinor: string;
    netCollectedMinor: string;
    outstandingMinor: string;
    state: string;
  }> {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (input.amountMinor <= 0n) throw new V3ValidationError('Payment reversal must be positive');
    sqliteInteger(input.amountMinor, 'Payment reversal');
    const effectiveAt = canonicalUtcTimestamp(input.effectiveAt, 'Payment reversal effective date');
    const reasonCode = requireText(input.reasonCode, 'Payment reversal reason code', 80);
    if (!/^[a-z][a-z0-9_]*$/.test(reasonCode))
      throw new V3ValidationError('Payment reversal reason code is invalid');
    const reason = requireText(input.reason, 'Payment reversal reason', 2000);
    const idempotencyKey = requireText(
      input.idempotencyKey,
      'Payment reversal idempotency key',
      200,
    );
    if (idempotencyKey.length < 8)
      throw new V3ValidationError('Payment reversal idempotency key is required');
    return this.transaction(() => {
      const payment = this.sqlite
        .prepare(
          `SELECT pa.id,pa.invoice_id,CAST(pa.amount_minor AS TEXT) amount_minor,pa.currency,pa.received_at,
                  pa.tenant_id payment_tenant_id,pa.deployment_id payment_deployment_id,
                  pa.legal_entity_revision_id payment_legal_entity_revision_id,
                  pa.payment_payload_hash,pa.command_id,pa.payment_hash,
                  CAST(i.total_minor AS TEXT) total_minor,i.state,i.due_at,i.currency invoice_currency,
                  i.tenant_id invoice_tenant_id,i.deployment_id invoice_deployment_id,
                  i.legal_entity_revision_id invoice_legal_entity_revision_id
           FROM payment pa JOIN invoice i ON i.id=pa.invoice_id
           WHERE pa.id=?`,
        )
        .get(input.paymentId) as
        | {
            id: string;
            invoice_id: string;
            amount_minor: string;
            currency: V3Currency;
            received_at: string;
            payment_tenant_id: string | null;
            payment_deployment_id: string | null;
            payment_legal_entity_revision_id: string | null;
            payment_payload_hash: string | null;
            command_id: string | null;
            payment_hash: string | null;
            total_minor: string;
            state: string;
            due_at: string | null;
            invoice_currency: V3Currency;
            invoice_tenant_id: string | null;
            invoice_deployment_id: string | null;
            invoice_legal_entity_revision_id: string | null;
          }
        | undefined;
      if (!payment) throw new V3ValidationError('Invoice payment is required');
      if (
        !payment.invoice_tenant_id ||
        !payment.invoice_deployment_id ||
        !payment.invoice_legal_entity_revision_id ||
        !payment.payment_tenant_id ||
        !payment.payment_deployment_id ||
        !payment.payment_legal_entity_revision_id ||
        !payment.payment_payload_hash ||
        !payment.command_id ||
        !payment.payment_hash ||
        payment.payment_tenant_id !== payment.invoice_tenant_id ||
        payment.payment_deployment_id !== payment.invoice_deployment_id ||
        payment.payment_legal_entity_revision_id !== payment.invoice_legal_entity_revision_id ||
        payment.currency !== payment.invoice_currency
      )
        throw new V3ConflictError('Payment provenance does not match its invoice');
      const now = timestamp();
      const command = this.ensurePaymentReversalCommand(principal, {
        paymentId: payment.id,
        invoiceId: payment.invoice_id,
        currency: payment.currency,
        amountMinor: input.amountMinor,
        effectiveAt,
        reasonCode,
        reasonText: reason,
        idempotencyKey,
        createdAt: now,
      });
      if (!command.created) {
        const existing = this.sqlite
          .prepare(
            `SELECT id,invoice_id,CAST(amount_minor AS TEXT) amount_minor
             FROM invoice_payment_reversal_event WHERE command_id=?`,
          )
          .get(command.commandId) as
          | { id: string; invoice_id: string; amount_minor: string }
          | undefined;
        if (!existing)
          throw new V3ConflictError('Completed payment reversal command has no reversal event');
        const totals = this.invoiceCollectionTotals(existing.invoice_id);
        return {
          id: existing.id,
          commandId: command.commandId,
          created: false,
          invoiceId: existing.invoice_id,
          reversedMinor: String(existing.amount_minor),
          netCollectedMinor: totals.netCollected.toString(),
          outstandingMinor: totals.outstanding.toString(),
          state: totals.state,
        };
      }
      const receivedAtMs = Date.parse(payment.received_at);
      if (Number.isNaN(receivedAtMs) || Date.parse(effectiveAt) < receivedAtMs)
        throw new V3ValidationError('Payment reversal cannot predate the original payment');
      if (effectiveAt > now)
        throw new V3ValidationError('Payment reversal effective date cannot be in the future');
      if (!['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(payment.state))
        throw new V3ValidationError('Active issued invoice payment is required');
      const prior = this.sqlite
        .prepare(
          `SELECT reversal_hash FROM invoice_payment_reversal_event
           WHERE original_payment_id=? ORDER BY created_at DESC,id DESC LIMIT 1`,
        )
        .get(payment.id) as { reversal_hash: string } | undefined;
      const priorReversalRows = this.sqlite
        .prepare(
          'SELECT CAST(amount_minor AS TEXT) amount FROM invoice_payment_reversal_event WHERE original_payment_id=? ORDER BY id',
        )
        .all(payment.id) as Array<{ amount: string }>;
      const reversedBefore = priorReversalRows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
      const remaining = BigInt(payment.amount_minor) - reversedBefore;
      if (input.amountMinor > remaining)
        throw new V3ValidationError('Payment reversal exceeds the remaining unreversed amount');
      const reversalId = newId();
      const reversalPayload = {
        schema_version: 'invoice-payment-reversal-v1',
        reversal_id: reversalId,
        original_payment_id: payment.id,
        invoice_id: payment.invoice_id,
        currency: payment.currency,
        amount_minor: input.amountMinor.toString(),
        effective_at: effectiveAt,
        reason_code: reasonCode,
        reason_text: reason,
        prior_reversal_hash: prior?.reversal_hash ?? null,
        actor_id: principal.userId,
        command_id: command.commandId,
        idempotency_key: idempotencyKey,
      };
      const reversalEvidence = this.ensureFinanceEvidence(
        'payment_reversal',
        'invoice-payment-reversal-v1',
        `payment-reversal:${reversalId}`,
        reversalPayload,
        now,
      );
      const reversalHash = createHash('sha256')
        .update(
          canonicalJobJson({
            schema_version: 'invoice-payment-reversal-chain-v1',
            payload_hash: reversalEvidence.hash,
            prior_reversal_hash: prior?.reversal_hash ?? null,
          }),
        )
        .digest('hex');
      this.sqlite
        .prepare(
          `INSERT INTO invoice_payment_reversal_event(
             id,original_payment_id,invoice_id,currency,amount_minor,effective_at,reason_code,
             reason_text,prior_reversal_hash,reversal_payload_hash,actor_id,command_id,created_at,reversal_hash
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          reversalId,
          payment.id,
          payment.invoice_id,
          payment.currency,
          sqliteInteger(input.amountMinor, 'Payment reversal'),
          effectiveAt,
          reasonCode,
          reason,
          prior?.reversal_hash ?? null,
          reversalEvidence.hash,
          principal.userId,
          command.commandId,
          now,
          reversalHash,
        );
      this.sqlite
        .prepare(
          `INSERT INTO finance_change_event(
             change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,effective_at,
             evidence_type,evidence_id,evidence_hash,command_id,created_at
           )
           SELECT ?,tenant_id,deployment_id,'invoice_payment_reversal',?,'append',?,
                  'payment_reversal',?,?,?,?
           FROM finance_command WHERE command_id=?`,
        )
        .run(
          newId(),
          reversalId,
          effectiveAt,
          reversalEvidence.id,
          reversalEvidence.hash,
          command.commandId,
          now,
          command.commandId,
        );
      const totals = this.invoiceCollectionTotals(payment.invoice_id, now);
      this.sqlite
        .prepare('UPDATE invoice SET state=?,updated_at=?,version=version+1 WHERE id=?')
        .run(totals.state, now, payment.invoice_id);
      return {
        id: reversalId,
        commandId: command.commandId,
        created: true,
        invoiceId: payment.invoice_id,
        reversedMinor: input.amountMinor.toString(),
        netCollectedMinor: totals.netCollected.toString(),
        outstandingMinor: totals.outstanding.toString(),
        state: totals.state,
      };
    });
  }

  recordReimbursement(
    principal: Principal,
    input: Readonly<{
      expenseId: string;
      amountMinor?: bigint;
      reference: string;
    }>,
  ): { expenseId: string; amountMinor: string; state: 'reimbursed' } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const reference = requireText(input.reference, 'Reimbursement reference', 200);
    return this.transaction(() => {
      const expense = this.sqlite
        .prepare(
          "SELECT id,worker_id,CAST(amount_minor AS TEXT) amount_minor,CAST(reimbursement_amount_minor AS TEXT) reimbursement_amount_minor,reimbursement_state,reimbursement_reference FROM expense WHERE id=? AND approval_state IN ('approved','locked') AND who_paid='worker'",
        )
        .get(input.expenseId) as
        | {
            id: string;
            worker_id: string;
            amount_minor: string;
            reimbursement_amount_minor: string | null;
            reimbursement_state: string;
            reimbursement_reference: string | null;
          }
        | undefined;
      if (!expense) throw new V3ValidationError('Approved worker-paid expense required');
      const expenseAmount = BigInt(expense.amount_minor);
      const amount = input.amountMinor ?? expenseAmount;
      if (amount <= 0n || amount > expenseAmount)
        throw new V3ValidationError('Reimbursement amount is outside the expense balance');
      if (expense.reimbursement_state === 'reimbursed') {
        const recordedAmount = BigInt(expense.reimbursement_amount_minor ?? expense.amount_minor);
        if (recordedAmount !== amount || expense.reimbursement_reference !== reference)
          throw new V3ConflictError(
            'Reimbursement is already finalized with different final truth',
          );
        return {
          expenseId: expense.id,
          amountMinor: recordedAmount.toString(),
          state: 'reimbursed',
        };
      }
      if (amount !== expenseAmount)
        throw new V3ValidationError(
          'Partial reimbursement is not supported; record the full expense reimbursement',
        );
      const now = timestamp();
      this.sqlite
        .prepare(
          "UPDATE expense SET reimbursement_amount_minor=?,reimbursement_state='reimbursed',reimbursed_at=?,reimbursement_reference=?,updated_at=?,version=version+1 WHERE id=? AND reimbursement_state<>'reimbursed'",
        )
        .run(sqliteInteger(amount, 'Reimbursement'), now, reference, now, expense.id);
      this.audit(principal, 'expense.reimburse', 'expense', expense.id, {
        workerId: expense.worker_id,
        amountMinor: amount.toString(),
        reference,
      });
      return { expenseId: expense.id, amountMinor: amount.toString(), state: 'reimbursed' };
    });
  }

  voidInvoice(
    principal: Principal,
    invoiceId: string,
    reason: string,
    idempotencyKey: string,
  ): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new V3AccessDeniedError('Owner role required');
    this.assertStepUp(principal);
    const normalizedReason = requireText(reason, 'Void reason', 2000);
    const normalizedKey = idempotencyKey.trim();
    if (normalizedKey.length < 8 || normalizedKey.length > 200)
      throw new V3ValidationError('Void idempotency key is required');
    this.transaction(() => {
      const existing = this.sqlite
        .prepare(
          'SELECT id,invoice_id,event_type,reason FROM invoice_event WHERE idempotency_key=?',
        )
        .get(normalizedKey) as
        | { id: string; invoice_id: string; event_type: string; reason: string }
        | undefined;
      if (existing) {
        if (
          existing.invoice_id !== invoiceId ||
          existing.event_type !== 'void' ||
          existing.reason !== normalizedReason
        )
          throw new V3ConflictError('Void idempotency key was already used');
        return;
      }
      const invoice = this.sqlite
        .prepare(
          "SELECT id,state FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue')",
        )
        .get(invoiceId) as { id: string; state: string } | undefined;
      if (!invoice) throw new V3ValidationError('Issued invoice required');
      if (this.invoiceBookedCollectionBalance(invoiceId) !== 0n)
        throw new V3ValidationError(
          'Invoice collections must be fully reversed before the invoice can be voided',
        );
      const now = timestamp();
      this.sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'void',?,?,?,?)",
        )
        .run(newId(), invoiceId, normalizedReason, principal.userId, now, normalizedKey);
      this.sqlite
        .prepare(
          "UPDATE invoice SET state='void',voided_at=?,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(now, now, invoiceId);
      this.audit(principal, 'invoice.void', 'invoice', invoiceId, {
        reason: normalizedReason,
      });
    });
  }

  billingReadiness(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(periodStart, 'Period start');
    requireDate(periodEnd, 'Period end');
    const rule = this.sqlite
      .prepare(
        `SELECT br.id,br.project_id,br.stream_type,br.tax_profile_id,br.legal_entity_id,
                p.daily_report_required,p.technical_reporting_required,p.currency project_currency
         FROM billing_rule br JOIN project p ON p.id=br.project_id
         WHERE br.id=? AND br.enabled=1`,
      )
      .get(billingRuleId) as
      | {
          id: string;
          project_id: string;
          stream_type: string;
          tax_profile_id: string | null;
          legal_entity_id: string | null;
          daily_report_required: number;
          technical_reporting_required: number;
          project_currency: V3Currency;
        }
      | undefined;
    if (!rule) throw new V3ValidationError('Billing rule not found');
    const reasons: Array<{ code: string; sourceId?: string }> = [];
    if (!rule.tax_profile_id) reasons.push({ code: 'missing_tax_profile' });
    if (!rule.legal_entity_id) reasons.push({ code: 'missing_legal_entity' });
    if (rule.stream_type === 'labor') {
      const rows = this.sqlite
        .prepare(
          `SELECT id,worker_id,category,activity_code,work_date,approval_state,billability_state
           FROM time_entry
           WHERE project_id=? AND work_date BETWEEN ? AND ? AND invoice_id IS NULL
             AND approval_state NOT IN ('rejected','void')`,
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        category: string;
        activity_code: string | null;
        work_date: string;
        approval_state: string;
        billability_state: string;
      }>;
      for (const row of rows) {
        if (!['approved', 'locked'].includes(row.approval_state))
          reasons.push({ code: 'pending_time_approval', sourceId: row.id });
        if (
          ['approved', 'locked'].includes(row.approval_state) &&
          row.billability_state === 'billable'
        ) {
          if (
            !this.clientRateFor(
              rule.project_id,
              row.worker_id,
              row.category,
              row.work_date,
              row.activity_code,
            )
          )
            reasons.push({ code: 'missing_client_rate', sourceId: row.id });
          if (
            !this.internalCostFor(
              rule.project_id,
              row.worker_id,
              row.category,
              row.work_date,
              row.activity_code,
            )
          )
            reasons.push({ code: 'missing_internal_cost', sourceId: row.id });
          if (
            !this.compensationRuleFor(
              rule.project_id,
              row.worker_id,
              row.category,
              row.work_date,
              row.activity_code,
            )
          )
            reasons.push({ code: 'missing_compensation_rule', sourceId: row.id });
        }
      }
      if (rule.daily_report_required === 1) {
        const missing = this.sqlite
          .prepare(
            `SELECT DISTINCT t.work_date
             FROM time_entry t
             WHERE t.project_id=? AND t.work_date BETWEEN ? AND ?
               AND t.approval_state NOT IN ('rejected','void')
               AND NOT EXISTS (
                 SELECT 1 FROM daily_report d
                 WHERE d.project_id=t.project_id AND d.work_date=t.work_date
                   AND d.approval_state IN ('approved','locked')
               )
             ORDER BY t.work_date`,
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{ work_date: string }>;
        reasons.push(
          ...missing.map((row) => ({
            code: 'missing_approved_daily_report',
            sourceId: `daily-report:${rule.project_id}:${row.work_date}`,
          })),
        );
      }
      if (rule.technical_reporting_required === 1) {
        const missing = this.sqlite
          .prepare(
            `SELECT ? id WHERE NOT EXISTS (
               SELECT 1 FROM technical_report t
               WHERE t.project_id=?
                 AND length(t.report_date)=10
                 AND t.report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                 AND date(t.report_date)=t.report_date
                 AND t.report_date BETWEEN ? AND ?
                 AND t.approval_state IN ('approved','locked')
             )`,
          )
          .get(
            `technical-report:${rule.project_id}:${periodStart}:${periodEnd}`,
            rule.project_id,
            periodStart,
            periodEnd,
          ) as { id: string } | undefined;
        if (missing)
          reasons.push({ code: 'missing_approved_technical_report', sourceId: missing.id });
      }
    }
    if (rule.stream_type === 'expense') {
      const rows = this.sqlite
        .prepare(
          "SELECT id,currency,CAST(project_currency_amount_minor AS TEXT) project_currency_amount_minor,CAST(billing_amount_minor AS TEXT) billing_amount_minor,approval_state,finance_approved_at,receipt_required,receipt_document_id FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND invoice_id IS NULL AND approval_state NOT IN ('rejected','void') AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem'))",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{
        id: string;
        approval_state: string;
        finance_approved_at: string | null;
        receipt_required: number;
        receipt_document_id: string | null;
        currency: V3Currency;
        project_currency_amount_minor: string | null;
        billing_amount_minor: string | null;
      }>;
      for (const row of rows) {
        if (row.approval_state !== 'approved' || !row.finance_approved_at)
          reasons.push({ code: 'pending_expense_approval', sourceId: row.id });
        if (row.receipt_required === 1 && !row.receipt_document_id)
          reasons.push({ code: 'missing_receipt', sourceId: row.id });
        if (
          row.approval_state === 'approved' &&
          row.currency !== rule.project_currency &&
          (row.project_currency_amount_minor === null || row.billing_amount_minor === null)
        )
          reasons.push({ code: 'missing_expense_currency_conversion', sourceId: row.id });
      }
    }
    const period = this.sqlite
      .prepare(
        'SELECT state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
      )
      .get(billingRuleId, periodStart, periodEnd) as { state: string } | undefined;
    return {
      state:
        reasons.length > 0 ? 'incomplete' : period?.state === 'closed' ? 'already_closed' : 'ready',
      reasons,
      projectId: rule.project_id,
      streamType: rule.stream_type,
    } as const;
  }

  closeBillingPeriod(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
    reportLocale: ReportLocale = 'en',
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    const readiness = this.billingReadiness(principal, billingRuleId, periodStart, periodEnd);
    if (readiness.state !== 'ready') return { ...readiness, closed: false };
    return this.transaction(() => {
      const duplicate = this.sqlite
        .prepare(
          'SELECT id,state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
        )
        .get(billingRuleId, periodStart, periodEnd) as { id: string; state: string } | undefined;
      if (duplicate?.state === 'closed')
        return { ...readiness, closed: false, billingPeriodId: duplicate.id };
      const rule = this.sqlite
        .prepare('SELECT project_id,stream_type,policy_version FROM billing_rule WHERE id=?')
        .get(billingRuleId) as { project_id: string; stream_type: string; policy_version: number };
      const now = timestamp();
      const billingPeriodId = newId();
      if (duplicate)
        this.sqlite
          .prepare(
            "UPDATE billing_period SET state='closed',reasons_json='[]',closed_at=?,updated_at=?,version=version+1 WHERE id=?",
          )
          .run(now, now, duplicate.id);
      else
        this.sqlite
          .prepare(
            'INSERT INTO billing_period(id,billing_rule_id,period_start,period_end,state,reasons_json,closed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(
            billingPeriodId,
            billingRuleId,
            periodStart,
            periodEnd,
            'closed',
            '[]',
            now,
            now,
            now,
          );
      const effectiveBillingPeriodId = duplicate?.id ?? billingPeriodId;
      const lockId = newId();
      this.sqlite
        .prepare(
          'INSERT INTO billing_lock(id,project_id,stream_type,period_start,period_end,acquired_at) VALUES(?,?,?,?,?,?)',
        )
        .run(lockId, rule.project_id, rule.stream_type, periodStart, periodEnd, now);
      if (rule.stream_type === 'labor')
        this.sqlite
          .prepare(
            `UPDATE time_entry
             SET billing_status='locked',locked_at=?,locked_by=?,billing_lock_id=?,updated_at=?,version=version+1
             WHERE project_id=? AND work_date BETWEEN ? AND ?
               AND approval_state IN ('approved','locked') AND billability_state='billable'
               AND invoice_id IS NULL
               AND NOT (
                 category='travel' AND COALESCE((
                   SELECT pcp.travel_client_billable
                   FROM project_commercial_policy pcp
                   WHERE pcp.project_id=time_entry.project_id
                     AND pcp.effective_from<=time_entry.work_date
                     AND (pcp.effective_to IS NULL OR pcp.effective_to>=time_entry.work_date)
                   ORDER BY pcp.effective_from DESC,pcp.version DESC,pcp.id DESC LIMIT 1
                 ),1)=0
               )`,
          )
          .run(now, principal.userId, lockId, now, rule.project_id, periodStart, periodEnd);
      if (rule.stream_type === 'expense')
        this.sqlite
          .prepare(
            "UPDATE expense SET billing_state='locked',billing_lock_id=?,updated_at=?,version=version+1 WHERE project_id=? AND spent_on BETWEEN ? AND ? AND approval_state='approved' AND finance_approved_at IS NOT NULL AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem')) AND invoice_id IS NULL",
          )
          .run(lockId, now, rule.project_id, periodStart, periodEnd);
      // A finance user may prepare a draft before the explicit period close.
      // Refresh draft source versions after locking so the draft remains
      // traceable to the authoritative rows. Issued invoices are untouched.
      const draftInvoices = this.sqlite
        .prepare(
          "SELECT id FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=? AND state IN ('draft','approved')",
        )
        .all(billingRuleId, periodStart, periodEnd) as Array<{ id: string }>;
      for (const invoice of draftInvoices) {
        const sources = this.sqlite
          .prepare(
            'SELECT source_type,source_id FROM invoice_source WHERE invoice_id=? AND locked_at IS NULL',
          )
          .all(invoice.id) as Array<{ source_type: string; source_id: string }>;
        for (const source of sources) {
          const table =
            source.source_type === 'time'
              ? 'time_entry'
              : source.source_type === 'expense'
                ? 'expense'
                : null;
          if (!table) continue;
          const row =
            table === 'time_entry'
              ? (this.sqlite
                  .prepare('SELECT version FROM time_entry WHERE id=?')
                  .get(source.source_id) as { version: number } | undefined)
              : (this.sqlite
                  .prepare('SELECT version FROM expense WHERE id=?')
                  .get(source.source_id) as { version: number } | undefined);
          if (row)
            this.sqlite
              .prepare(
                'UPDATE invoice_source SET source_version=? WHERE invoice_id=? AND source_type=? AND source_id=? AND locked_at IS NULL',
              )
              .run(row.version, invoice.id, source.source_type, source.source_id);
        }
      }
      const reportSnapshot = JSON.stringify({
        projectId: rule.project_id,
        periodStart,
        periodEnd,
        streamType: rule.stream_type,
        locale: normalizeReportLocale(reportLocale),
        generatedAt: now,
      });
      for (const audience of ['customer', 'internal'] as const)
        this.sqlite
          .prepare(
            'INSERT OR IGNORE INTO period_report(id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            newId(),
            rule.project_id,
            periodStart,
            periodEnd,
            audience,
            'period_summary',
            'draft',
            reportSnapshot,
            principal.userId,
            now,
            now,
          );
      this.enqueueJob(
        'period_close_report',
        `billing-close:${billingRuleId}:${periodStart}:${periodEnd}:${rule.policy_version}`,
        {
          billingRuleId,
          periodStart,
          periodEnd,
          projectId: rule.project_id,
          reportLocale: normalizeReportLocale(reportLocale),
        },
      );
      this.audit(principal, 'billing_period.close', 'billing_period', effectiveBillingPeriodId, {
        billingRuleId,
        periodStart,
        periodEnd,
      });
      return { ...readiness, closed: true, billingPeriodId: effectiveBillingPeriodId };
    });
  }

  refreshPeriodReports(
    principal: Principal,
    input: Readonly<{
      projectId: string;
      periodStart: string;
      periodEnd: string;
      reportLocale?: ReportLocale;
    }>,
  ): Array<{
    id: string;
    audience: 'customer' | 'internal';
    snapshotVersion: number;
    snapshot: Readonly<Record<string, unknown>>;
  }> {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(input.periodStart, 'Period start');
    requireDate(input.periodEnd, 'Period end');
    if (input.periodEnd < input.periodStart)
      throw new V3ValidationError('Period end must follow start');
    this.assertProjectAccess(principal, input.projectId);
    return this.refreshPeriodReportsCore(input, principal);
  }

  refreshPeriodReportsFromJob(
    input: Readonly<{
      projectId: string;
      periodStart: string;
      periodEnd: string;
      reportLocale?: ReportLocale;
    }>,
    execution: FencedJobExecution,
  ): Array<{
    id: string;
    audience: 'customer' | 'internal';
    snapshotVersion: number;
    snapshot: Readonly<Record<string, unknown>>;
  }> {
    if (!execution) throw new Error('FENCED_JOB_EXECUTION_INVALID');
    requireDate(input.periodStart, 'Period start');
    requireDate(input.periodEnd, 'Period end');
    if (input.periodEnd < input.periodStart)
      throw new V3ValidationError('Period end must follow start');
    return this.refreshPeriodReportsCore(input, null, execution);
  }

  private refreshPeriodReportsCore(
    input: Readonly<{
      projectId: string;
      periodStart: string;
      periodEnd: string;
      reportLocale?: ReportLocale;
    }>,
    principal: Principal | null,
    execution?: FencedJobExecution,
  ): Array<{
    id: string;
    audience: 'customer' | 'internal';
    snapshotVersion: number;
    snapshot: Readonly<Record<string, unknown>>;
  }> {
    return this.transaction(() => {
      if (execution)
        assertFencedJobExecution(this.sqlite, execution, {
          kind: 'period_close_report',
          capability: 'artifact.report.render',
          payloadTarget: {
            projectId: input.projectId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          },
        });
      const project = this.sqlite
        .prepare(
          `SELECT p.id,p.project_number,p.name,p.currency,c.client_number,c.display_name client_name
           FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?`,
        )
        .get(input.projectId) as
        | {
            id: string;
            project_number: string;
            name: string;
            currency: V3Currency;
            client_number: string;
            client_name: string;
          }
        | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      const dailyReports = this.sqlite
        .prepare(
          `SELECT d.id,d.work_date,d.summary,d.safety_related,d.approval_state,u.name worker_name
           FROM daily_report d JOIN user u ON u.id=d.worker_id
           WHERE d.project_id=? AND d.work_date BETWEEN ? AND ? ORDER BY d.work_date,d.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        work_date: string;
        summary: string;
        safety_related: number;
        approval_state: string;
        worker_name: string;
      }>;
      const technicalReports = this.sqlite
        .prepare(
          `SELECT id,system_name,plant_site,area_line,station_machine,change_summary,safety_related,
                  validation,validation_result,open_risk,approval_state,report_date,created_at
           FROM technical_report
           WHERE project_id=?
             AND length(report_date)=10
             AND report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
             AND date(report_date)=report_date
             AND report_date BETWEEN ? AND ?
           ORDER BY report_date,id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        system_name: string;
        plant_site: string | null;
        area_line: string | null;
        station_machine: string | null;
        change_summary: string;
        safety_related: number;
        validation: string | null;
        validation_result: string | null;
        open_risk: string | null;
        approval_state: string;
        report_date: string;
        created_at: string;
      }>;
      const technicalChanges = this.sqlite
        .prepare(
          `SELECT tc.id,tc.technical_report_id,tc.component,tc.change_made,tc.reason,
                  tc.safety_impact,tc.production_impact,tc.validation,tc.validation_result,
                  tc.open_risk,tc.rollback_information,tc.approval_state,tc.created_at,
                  tr.report_date technical_report_date
           FROM technical_change tc
           JOIN technical_report tr ON tr.id=tc.technical_report_id
           WHERE tc.project_id=?
             AND length(tr.report_date)=10
             AND tr.report_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
             AND date(tr.report_date)=tr.report_date
             AND tr.report_date BETWEEN ? AND ?
           ORDER BY tr.report_date,tc.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<Record<string, unknown>>;
      const time = this.sqlite
        .prepare(
          `SELECT t.id,t.version,t.work_date,t.category,t.minutes,t.activity_summary,t.approval_state,u.name worker_name
           FROM time_entry t JOIN user u ON u.id=t.worker_id
           WHERE t.project_id=? AND t.work_date BETWEEN ? AND ? ORDER BY t.work_date,t.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        version: number;
        work_date: string;
        category: string;
        minutes: number;
        activity_summary: string | null;
        approval_state: string;
        worker_name: string;
      }>;
      const expenses = this.sqlite
        .prepare(
          `SELECT e.id,e.spent_on,e.vendor,e.category,e.currency,
                  CAST(e.amount_minor AS TEXT) amount_minor,
                  CAST(e.tax_amount_minor AS TEXT) tax_amount_minor,
                  CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                  e.who_paid,e.client_treatment,e.billing_treatment,
                  e.approval_state,e.receipt_document_id,e.billing_state,u.name worker_name
           FROM expense e JOIN user u ON u.id=e.worker_id
           WHERE e.project_id=? AND e.spent_on BETWEEN ? AND ? ORDER BY e.spent_on,e.id`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<Record<string, unknown>>;
      const finance = this.projectFinanceCore(input.projectId, input.periodStart, input.periodEnd);
      const commercialSummary = {
        currency: finance.currency,
        billingModel: finance.billingModel,
        actualMinutes: finance.actualMinutes,
        approvedMinutes: finance.approvedMinutes,
        billableMinutes: finance.billableMinutes,
        laborRevenueMinor: finance.laborRevenueMinor,
        expenseRevenueMinor: finance.expenseRevenueMinor,
        milestoneRevenueMinor: finance.milestoneRevenueMinor,
        operationalRevenueCandidateMinor: finance.operationalRevenueCandidateMinor,
        candidateSubtotalMinor: finance.revenueCandidateMinor,
        invoicedNetMinor: finance.invoicedMinor,
        invoicedGrossMinor: finance.invoicedGrossMinor,
        paidMinor: finance.paidMinor,
        receivableMinor: finance.receivableMinor,
        approvedUnbilledWipMinor: finance.approvedUnbilledWipMinor,
        unapprovedWipMinor: finance.unapprovedWipMinor,
        dailyMinimumTopUpMinor: finance.dailyMinimumTopUpMinor,
        sourceCounts: {
          dailyReports: 0,
          technicalReports: 0,
          technicalChanges: 0,
          timeEntries: 0,
          expenses: 0,
        },
      };
      const commercialLines =
        finance.billingModel === 'all_in' && finance.fixedPriceMinor !== null
          ? [
              {
                type: 'fixed_price',
                basis: 'Configured all-in project price',
                minutes: null,
                amountMinor: finance.fixedPriceMinor,
              },
              {
                type: 'milestone',
                basis: 'Approved milestones eligible for this period and not yet invoiced',
                minutes: null,
                amountMinor: finance.milestoneRevenueMinor,
              },
            ]
          : [
              {
                type: 'labor',
                basis: 'Approved billable minutes × effective client labor rates',
                minutes: finance.billableMinutes,
                amountMinor: finance.laborRevenueMinor,
              },
              {
                type: 'expense',
                basis: 'Approved reimbursable expenses plus configured markup',
                minutes: null,
                amountMinor: finance.expenseRevenueMinor,
              },
              {
                type: 'milestone',
                basis: 'Approved milestones eligible for this period',
                minutes: null,
                amountMinor: finance.milestoneRevenueMinor,
              },
            ];
      const documents = this.sqlite
        .prepare(
          `SELECT id,safe_filename,media_type,byte_length,sha256,sensitivity,created_at
           FROM document WHERE project_id=? AND state='committed' ORDER BY created_at,id`,
        )
        .all(input.projectId) as Array<Record<string, unknown>>;
      const reports = this.sqlite
        .prepare(
          `SELECT id,audience,report_type,state,snapshot_json,snapshot_version,snapshot_sha256,
                  pdf_storage_key,pdf_sha256,pdf_byte_length
           FROM period_report
           WHERE project_id=? AND period_start=? AND period_end=?
           ORDER BY audience,report_type`,
        )
        .all(input.projectId, input.periodStart, input.periodEnd) as Array<{
        id: string;
        audience: 'customer' | 'internal';
        report_type: string;
        state: string;
        snapshot_json: string;
        snapshot_version: number;
        snapshot_sha256: string | null;
        pdf_storage_key: string | null;
        pdf_sha256: string | null;
        pdf_byte_length: number | null;
      }>;
      const reportSources: Array<{ reportId: string; sourceType: string; sourceId: string }> = [];
      const now = timestamp();
      const output: Array<{
        id: string;
        audience: 'customer' | 'internal';
        snapshotVersion: number;
        snapshot: Readonly<Record<string, unknown>>;
      }> = [];
      for (const report of reports) {
        let previousLocale: ReportLocale = 'en';
        let previousGeneratedAt: string | undefined;
        try {
          const previous = JSON.parse(report.snapshot_json) as {
            locale?: unknown;
            generatedAt?: unknown;
          };
          previousLocale = normalizeReportLocale(previous.locale);
          previousGeneratedAt =
            typeof previous.generatedAt === 'string' ? previous.generatedAt : undefined;
        } catch {
          previousLocale = 'en';
        }
        const reportLocale = normalizeReportLocale(input.reportLocale ?? previousLocale);
        const customer = report.audience === 'customer';
        const visibleDailyReports = customer
          ? dailyReports.filter((daily) => ['approved', 'locked'].includes(daily.approval_state))
          : dailyReports;
        const visibleTechnicalReports = customer
          ? technicalReports.filter((technical) =>
              ['approved', 'locked'].includes(technical.approval_state),
            )
          : technicalReports;
        const visibleTechnicalChanges = customer
          ? technicalChanges.filter((change) =>
              ['approved', 'locked'].includes(String(change.approval_state)),
            )
          : technicalChanges;
        const visibleTime = customer
          ? time.filter((row) => ['approved', 'locked'].includes(row.approval_state))
          : time;
        const visibleExpenses = customer ? [] : expenses;
        const visibleDocuments = customer
          ? documents.filter((document) => document.sensitivity === 'customer_private')
          : documents;
        const reportChanges = visibleTechnicalChanges.map((change) =>
          customer
            ? {
                id: change.id,
                date: change.created_at,
                component: change.component,
                changeMade: change.change_made,
                productionImpact: change.production_impact,
                validation: change.validation,
                validationResult: change.validation_result,
                safetyImpact: change.safety_impact,
                approvalState: change.approval_state,
              }
            : change,
        );
        const reportTechnical = visibleTechnicalReports.map((technical) =>
          customer
            ? {
                id: technical.id,
                date: technical.created_at,
                system: technical.system_name,
                site: technical.plant_site,
                area: technical.area_line,
                station: technical.station_machine,
                changes: technical.change_summary,
                safetyRelated: technical.safety_related,
                validation: technical.validation,
                validationResult: technical.validation_result,
                openRisk: technical.open_risk,
                approvalState: technical.approval_state,
              }
            : technical,
        );
        const reportDaily = visibleDailyReports.map((daily) => ({
          id: daily.id,
          date: daily.work_date,
          worker: customer ? undefined : daily.worker_name,
          summary: daily.summary,
          safetyRelated: daily.safety_related,
          approvalState: daily.approval_state,
        }));
        const reportExpenses = visibleExpenses;
        const internalSnapshot = {
          project: {
            id: project.id,
            number: project.project_number,
            name: project.name,
            currency: project.currency,
            clientNumber: project.client_number,
            clientName: project.client_name,
          },
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          audience: report.audience,
          reportType: report.report_type,
          locale: reportLocale,
          dailyReports: reportDaily,
          timeSummary: visibleTime.map((row) => ({
            id: row.id,
            version: row.version,
            date: row.work_date,
            category: row.category,
            minutes: row.minutes,
            activitySummary: row.activity_summary,
            worker: row.worker_name,
            approvalState: row.approval_state,
          })),
          technicalReports: reportTechnical,
          technicalChanges: reportChanges,
          expenses: reportExpenses,
          commercialSummary: {
            ...commercialSummary,
            sourceCounts: {
              dailyReports: visibleDailyReports.length,
              technicalReports: visibleTechnicalReports.length,
              technicalChanges: visibleTechnicalChanges.length,
              timeEntries: visibleTime.length,
              expenses: visibleExpenses.length,
            },
          },
          commercialCalculation: commercialLines,
          financialSummary: {
            ...finance,
            timeEconomics: finance.timeEconomics,
            expenseEconomics: finance.expenseEconomics,
            dailyMinimumAdjustments: finance.dailyMinimumAdjustments,
          },
          backupArtifacts: documents,
          generatedAt: previousGeneratedAt ?? now,
        } satisfies Record<string, unknown>;
        const customerSnapshot = {
          project: {
            id: project.id,
            number: project.project_number,
            name: project.name,
            clientNumber: project.client_number,
            clientName: project.client_name,
          },
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          audience: report.audience,
          reportType: report.report_type,
          locale: reportLocale,
          dailyReports: reportDaily,
          timeSummary: visibleTime.map((row) => ({
            id: row.id,
            version: row.version,
            date: row.work_date,
            category: row.category,
            minutes: row.minutes,
            activitySummary: row.activity_summary,
            approvalState: row.approval_state,
          })),
          technicalReports: reportTechnical,
          technicalChanges: reportChanges,
          sourceCounts: {
            dailyReports: visibleDailyReports.length,
            technicalReports: visibleTechnicalReports.length,
            technicalChanges: visibleTechnicalChanges.length,
            timeEntries: visibleTime.length,
          },
          backupArtifacts: visibleDocuments.map((document) => ({
            filename: document.safe_filename,
            mediaType: document.media_type,
            description: 'Private project artifact available through the agreed delivery channel',
          })),
          customerPrivacyVersion: CUSTOMER_PERIOD_REPORT_PRIVACY_VERSION,
        } satisfies Record<string, unknown>;
        const snapshot = customer ? customerSnapshot : internalSnapshot;
        let snapshotJson: string;
        let snapshotSha256: string;
        if (customer) {
          try {
            const canonical = canonicalCustomerPeriodSnapshot(JSON.stringify(snapshot));
            assertCustomerPeriodSnapshotSafe(canonical.value);
            snapshotJson = canonical.json;
            snapshotSha256 = canonical.sha256;
          } catch (error) {
            throw new V3ValidationError(
              error instanceof Error
                ? error.message
                : 'Customer period report projection is invalid',
            );
          }
        } else {
          snapshotJson = canonicalJson(snapshot);
          snapshotSha256 = canonicalSha256(snapshotJson);
        }
        const existingSources = this.sqlite
          .prepare(
            'SELECT source_type,source_id FROM report_source WHERE report_id=? ORDER BY source_type,source_id',
          )
          .all(report.id) as Array<{ source_type: string; source_id: string }>;
        const sources = [
          ...visibleDailyReports.map((row) => ({ type: 'daily_report', id: row.id })),
          ...visibleTime.map((row) => ({ type: 'time_entry', id: row.id })),
          ...visibleTechnicalReports.map((row) => ({ type: 'technical_report', id: row.id })),
          ...visibleTechnicalChanges.map((row) => ({
            type: 'technical_change',
            id: String(row.id),
          })),
          ...(customer
            ? []
            : visibleExpenses.map((row) => ({ type: 'expense', id: String(row.id) }))),
          ...visibleDocuments.map((row) => ({ type: 'document', id: String(row.id) })),
        ];
        const previousSourceKeys = existingSources.map(
          (source) => `${source.source_type}:${source.source_id}`,
        );
        const nextSourceKeys = sources.map((source) => `${source.type}:${source.id}`).sort();
        previousSourceKeys.sort();
        const bindingChanged =
          previousSourceKeys.length !== nextSourceKeys.length ||
          previousSourceKeys.some((source, index) => source !== nextSourceKeys[index]);
        if (!Number.isInteger(report.snapshot_version) || report.snapshot_version < 1)
          throw new V3ValidationError('Period report snapshot version is invalid');
        const snapshotChanged =
          report.snapshot_json !== snapshotJson || report.snapshot_sha256 !== snapshotSha256;
        const bindingChangedOrNew = snapshotChanged || bindingChanged;
        const nextSnapshotVersion = bindingChangedOrNew
          ? report.snapshot_version + 1
          : report.snapshot_version;
        if (!Number.isSafeInteger(nextSnapshotVersion))
          throw new V3ValidationError('Period report snapshot version is out of range');
        if (bindingChangedOrNew) {
          const updated = this.sqlite
            .prepare(
              "UPDATE period_report SET snapshot_json=?,snapshot_version=?,snapshot_sha256=?,state=CASE WHEN state IN ('draft','approved') THEN 'review' ELSE state END,pdf_storage_key=NULL,pdf_sha256=NULL,pdf_byte_length=NULL,approved_at=NULL,updated_at=? WHERE id=? AND snapshot_version=? AND snapshot_json=? AND state<>'final'",
            )
            .run(
              snapshotJson,
              nextSnapshotVersion,
              snapshotSha256,
              now,
              report.id,
              report.snapshot_version,
              report.snapshot_json,
            );
          if (updated.changes !== 1)
            throw new V3ConflictError('Period report changed during snapshot refresh');
        } else if (report.state === 'draft') {
          this.sqlite
            .prepare(
              "UPDATE period_report SET state='review',updated_at=? WHERE id=? AND state='draft'",
            )
            .run(now, report.id);
        }
        this.sqlite.prepare('DELETE FROM report_source WHERE report_id=?').run(report.id);
        for (const source of sources) {
          this.sqlite
            .prepare(
              'INSERT OR IGNORE INTO report_source(report_id,source_type,source_id) VALUES(?,?,?)',
            )
            .run(report.id, source.type, source.id);
          reportSources.push({ reportId: report.id, sourceType: source.type, sourceId: source.id });
        }
        output.push({
          id: report.id,
          audience: report.audience,
          snapshotVersion: nextSnapshotVersion,
          snapshot,
        });
      }
      if (principal)
        this.audit(principal, 'period_report.refresh', 'project', input.projectId, {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          reportIds: output.map((report) => report.id),
          sourceCount: reportSources.length,
        });
      return output;
    });
  }

  recordCustomerConformity(
    principal: Principal,
    input: CustomerConformityInput,
  ): CustomerConformity {
    return this.customerConformities.recordCustomerConformity(principal, input);
  }

  approvePeriodReport(
    principal: Principal,
    input: PeriodReportApprovalInput,
  ): PeriodReportApprovalResult {
    return this.periodReportLifecycle.approvePeriodReport(principal, input);
  }

  getCustomerConformity(
    principal: Principal,
    conformityId: string,
  ): CustomerConformity | CustomerConformitySafeView {
    return this.customerConformities.getCustomerConformity(principal, conformityId);
  }

  getCustomerConformityForPeriodReport(
    principal: Principal,
    periodReportId: string,
  ): CustomerConformity | CustomerConformitySafeView | null {
    return this.customerConformities.getCustomerConformityForPeriodReport(
      principal,
      periodReportId,
    );
  }

  invalidateCustomerConformity(
    principal: Principal,
    input: Readonly<{ conformityId: string; reason: string }>,
  ): CustomerConformityInvalidation {
    return this.customerConformities.invalidateCustomerConformity(principal, input);
  }

  listPeriodReports(principal: Principal) {
    this.assertActive(principal);
    const clauses: string[] = [];
    const values: string[] = [];
    if (principal.role === 'project_manager' || principal.role === 'worker') {
      const projectIds = [...principal.projectIds];
      if (projectIds.length === 0) return [];
      clauses.push(`r.project_id IN (${projectIds.map(() => '?').join(',')})`);
      values.push(...projectIds);
    }
    if (principal.role === 'worker' || principal.role === 'project_manager')
      clauses.push("r.audience='customer'");
    const rows = this.sqlite
      .prepare(
        `SELECT r.id,r.project_id,r.period_start,r.period_end,r.audience,r.report_type,r.state,
                r.snapshot_version,r.snapshot_sha256,r.pdf_storage_key,r.pdf_sha256,r.pdf_byte_length,
                r.created_at,r.updated_at,p.project_number,p.name project_name,
                CASE
                  WHEN r.audience<>'customer' THEN NULL
                  WHEN EXISTS(
                    SELECT 1 FROM customer_conformity c
                    LEFT JOIN customer_conformity_invalidation ci ON ci.conformity_id=c.id
                    WHERE c.period_report_id=r.id AND c.snapshot_version=r.snapshot_version
                      AND c.snapshot_sha256=r.snapshot_sha256 AND ci.id IS NULL
                  ) THEN 'signed'
                  WHEN EXISTS(
                    SELECT 1 FROM customer_conformity c
                    JOIN customer_conformity_invalidation ci ON ci.conformity_id=c.id
                    WHERE c.period_report_id=r.id AND c.snapshot_version=r.snapshot_version
                      AND c.snapshot_sha256=r.snapshot_sha256
                  ) THEN 'invalid'
                  WHEN r.state IN('approved','final') AND r.pdf_storage_key IS NOT NULL
                    AND r.pdf_sha256 IS NOT NULL AND r.pdf_byte_length IS NOT NULL
                    THEN 'ready_for_signature'
                  ELSE 'needs_report'
                END conformity_state,
                (SELECT c.id FROM customer_conformity c
                  LEFT JOIN customer_conformity_invalidation ci ON ci.conformity_id=c.id
                  WHERE c.period_report_id=r.id AND c.snapshot_version=r.snapshot_version
                    AND c.snapshot_sha256=r.snapshot_sha256 AND ci.id IS NULL
                  ORDER BY c.created_at DESC LIMIT 1) conformity_id
         FROM period_report r JOIN project p ON p.id=r.project_id
         ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
         ORDER BY r.period_start DESC,r.audience,r.id LIMIT 200`,
      )
      .all(...values);
    if (principal.role !== 'project_manager' && principal.role !== 'worker') return rows;
    return rows.flatMap((row) => {
      const candidate = row as Record<string, unknown> & { project_id: string };
      try {
        this.assertProjectAccess(principal, candidate.project_id);
      } catch {
        return [];
      }
      const {
        pdf_storage_key: _pdfStorageKey,
        pdf_sha256: _pdfSha256,
        pdf_byte_length: _pdfByteLength,
        ...roleSafe
      } = candidate;
      return [roleSafe];
    });
  }

  periodReportSnapshot(principal: Principal, reportId: string): Readonly<Record<string, unknown>> {
    this.assertActive(principal);
    const report = this.sqlite
      .prepare(
        'SELECT project_id,audience,snapshot_json,snapshot_sha256 FROM period_report WHERE id=?',
      )
      .get(reportId) as
      | {
          project_id: string;
          audience: string;
          snapshot_json: string;
          snapshot_sha256: string | null;
        }
      | undefined;
    if (!report) throw new V3ValidationError('Period report not found');
    this.assertProjectAccess(principal, report.project_id, true);
    if (
      report.audience === 'internal' &&
      !canManageBilling(principal) &&
      principal.role !== 'auditor_read_only'
    )
      throw new V3AccessDeniedError('Internal report access required');
    if (report.audience === 'customer') {
      try {
        const canonical = canonicalCustomerPeriodSnapshot(report.snapshot_json);
        if (canonical.json !== report.snapshot_json || canonical.sha256 !== report.snapshot_sha256)
          throw new Error('non-canonical snapshot');
        return canonical.value;
      } catch {
        throw new V3ValidationError(
          'Customer period report must be regenerated from a safe snapshot',
        );
      }
    }
    return parseJsonRecord(report.snapshot_json);
  }

  /**
   * A customer sign-off may only bind a PDF that is both present on the
   * configured document root and still matches the metadata supplied by the
   * renderer.  The report key is scoped to the report id, and any registered
   * document row is treated as an additional authorization/scan gate.
   */
  private assertVerifiedCustomerReportPdf(
    reportId: string,
    projectId: string,
    storageKey: SafeStorageKey,
    expectedSha256: string,
    expectedByteLength: number,
  ): void {
    try {
      verifyPrivatePdfArtifact({
        storageKey,
        sha256: expectedSha256,
        byteLength: expectedByteLength,
        requiredPrefix: `reports/${reportId}/`,
      });
    } catch (error) {
      throw new V3ValidationError(
        error instanceof Error
          ? `Customer period report PDF is not ready: ${error.message}`
          : 'Customer period report PDF artifact is not ready',
      );
    }

    const registered = this.sqlite
      .prepare(
        `SELECT project_id,state,scan_status,artifact_type,media_type,sha256,byte_length
         FROM document WHERE storage_key=? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(storageKey) as
      | {
          project_id: string | null;
          state: string;
          scan_status: string | null;
          artifact_type: string | null;
          media_type: string;
          sha256: string;
          byte_length: number;
        }
      | undefined;
    if (registered) {
      if (
        registered.project_id !== projectId ||
        registered.state !== 'committed' ||
        (registered.scan_status !== 'clean' && registered.scan_status !== 'not_scanned') ||
        registered.artifact_type !== 'report' ||
        registered.media_type !== 'application/pdf' ||
        registered.sha256 !== expectedSha256 ||
        registered.byte_length !== expectedByteLength
      )
        throw new V3ValidationError(
          'Customer period report PDF artifact is not authorized and ready',
        );
    }
  }

  recordPeriodReportPdf(
    principal: Principal,
    reportId: string,
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
  ): void {
    this.assertFinance(principal);
    this.assertStorageKey(storageKey);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
      throw new V3ValidationError('Period report PDF metadata is invalid');
    this.recordPeriodReportPdfCore(reportId, storageKey, sha256, byteLength, principal);
  }

  recordPeriodReportPdfFromJob(
    reportId: string,
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
    execution: FencedJobExecution,
  ): void {
    this.transaction(() => {
      const target = this.sqlite
        .prepare('SELECT project_id,period_start,period_end FROM period_report WHERE id=?')
        .get(reportId) as
        | { project_id: string; period_start: string; period_end: string }
        | undefined;
      if (!target) throw new V3ValidationError('Period report not found');
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'period_close_report',
        capability: 'artifact.report.render',
        payloadTarget: {
          projectId: target.project_id,
          periodStart: target.period_start,
          periodEnd: target.period_end,
        },
      });
      this.assertStorageKey(storageKey);
      if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
        throw new V3ValidationError('Period report PDF metadata is invalid');
      this.recordPeriodReportPdfCore(reportId, storageKey, sha256, byteLength, null);
    });
  }

  private recordPeriodReportPdfCore(
    reportId: string,
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
    principal: Principal | null,
  ): void {
    const report = this.sqlite
      .prepare(
        `SELECT project_id,audience,state,snapshot_version,snapshot_sha256,snapshot_json,
                pdf_storage_key,pdf_sha256,pdf_byte_length
         FROM period_report WHERE id=?`,
      )
      .get(reportId) as
      | {
          project_id: string;
          audience: string;
          state: string;
          snapshot_version: number;
          snapshot_sha256: string | null;
          snapshot_json: string;
          pdf_storage_key: string | null;
          pdf_sha256: string | null;
          pdf_byte_length: number | null;
        }
      | undefined;
    if (!report) throw new V3ValidationError('Period report not found');
    if (report.audience === 'customer') {
      if (principal) this.assertCustomerConformityStepUp(principal);
      let canonical: ReturnType<typeof canonicalCustomerPeriodSnapshot>;
      try {
        canonical = canonicalCustomerPeriodSnapshot(report.snapshot_json);
      } catch (error) {
        throw new V3ValidationError(
          error instanceof Error ? error.message : 'Customer period report snapshot is invalid',
        );
      }
      if (
        canonical.json !== report.snapshot_json ||
        canonical.sha256 !== report.snapshot_sha256 ||
        !Number.isInteger(report.snapshot_version) ||
        report.snapshot_version < 1
      )
        throw new V3ConflictError('Customer period report snapshot is not canonical');
      this.assertVerifiedCustomerReportPdf(
        reportId,
        report.project_id,
        storageKey,
        sha256,
        byteLength,
      );
    }
    if (!['review', 'approved', 'final'].includes(report.state))
      throw new V3ConflictError('Period report is not ready for a PDF');
    const hasExistingPdf =
      report.pdf_storage_key !== null ||
      report.pdf_sha256 !== null ||
      report.pdf_byte_length !== null;
    if (hasExistingPdf) {
      if (
        report.pdf_storage_key !== storageKey ||
        report.pdf_sha256 !== sha256 ||
        report.pdf_byte_length !== byteLength
      )
        throw new V3ConflictError('Period report PDF is already finalized with another binding');
      if (principal)
        this.audit(principal, 'period_report.pdf_ready', 'period_report', reportId, {
          storageKey,
          sha256,
          byteLength,
          idempotent: true,
        });
      return;
    }
    const result = this.sqlite
      .prepare(
        "UPDATE period_report SET pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,updated_at=? WHERE id=? AND state IN ('review','approved','final') AND pdf_storage_key IS NULL AND pdf_sha256 IS NULL AND pdf_byte_length IS NULL",
      )
      .run(storageKey, sha256, byteLength, timestamp(), reportId);
    if (result.changes !== 1) {
      throw new V3ConflictError('Period report PDF changed during finalization');
    }
    if (principal)
      this.audit(principal, 'period_report.pdf_ready', 'period_report', reportId, {
        storageKey,
        sha256,
        byteLength,
      });
  }

  periodReportPdfMetadata(
    principal: Principal,
    reportId: string,
  ): { storageKey: SafeStorageKey; sha256: string; byteLength: number; filename: string } {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare(
        'SELECT project_id,audience,period_start,period_end,pdf_storage_key,pdf_sha256,pdf_byte_length,snapshot_json,snapshot_sha256 FROM period_report WHERE id=?',
      )
      .get(reportId) as
      | {
          project_id: string;
          audience: string;
          period_start: string;
          period_end: string;
          pdf_storage_key: string | null;
          pdf_sha256: string | null;
          pdf_byte_length: number | null;
          snapshot_json: string;
          snapshot_sha256: string | null;
        }
      | undefined;
    if (!row?.pdf_storage_key || !row.pdf_sha256 || row.pdf_byte_length === null)
      throw new V3ValidationError('Period report PDF is not ready');
    this.assertProjectAccess(principal, row.project_id, true);
    if (row.audience === 'internal' && !canManageBilling(principal))
      throw new V3AccessDeniedError('Internal report access required');
    if (row.audience === 'customer') {
      try {
        const canonical = canonicalCustomerPeriodSnapshot(row.snapshot_json);
        if (canonical.json !== row.snapshot_json || canonical.sha256 !== row.snapshot_sha256)
          throw new Error('non-canonical snapshot');
      } catch {
        throw new V3ValidationError(
          'Customer period report PDF must be regenerated from a safe snapshot',
        );
      }
    }
    this.assertStorageKey(row.pdf_storage_key);
    return {
      storageKey: row.pdf_storage_key,
      sha256: row.pdf_sha256,
      byteLength: row.pdf_byte_length,
      filename: `period-report-${row.period_start}-${row.period_end}.pdf`,
    };
  }

  private createCanonicalAccountingPackMetadata(
    principal: Principal,
    snapshot: Readonly<Record<string, unknown>>,
    reconciliation: Readonly<Record<string, unknown>>,
    periodStart: string,
    periodEnd: string,
    createdAt: string,
    revisionIdentity?: string,
  ): Readonly<Record<string, unknown>> {
    const sourceReconciliation = asRecord(snapshot.sourceReconciliation);
    const reportedMismatchCount =
      reconciliation.sourceMismatchCount ?? sourceReconciliation.sourceMismatchCount;
    const checks = asRecord(reconciliation.checks);
    const authoritativeReconciles =
      Number.isSafeInteger(reportedMismatchCount) &&
      reportedMismatchCount === 0 &&
      [
        'invoiceSources',
        'payments',
        'workerCosts',
        'expenses',
        'directCosts',
        'contribution',
      ].every((name) => checks[name] === true);
    if (!authoritativeReconciles)
      return { status: 'blocked', reason: 'source_reconciliation_failed', revisions: [] };
    const deployment = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!deployment) throw new V3ConflictError('Deployment identity is not configured');
    const totalsRows = Array.isArray(snapshot.totalsByCurrency)
      ? (snapshot.totalsByCurrency as Array<Record<string, unknown>>)
      : [];
    // Keep inactive entities addressable when they are referenced by an
    // immutable historical source.  The active-first ordering preserves the
    // existing unconfigured fallback for a new, empty pack while allowing a
    // project whose legal entity changed during the period to retain both
    // point-in-time segments.
    const entities = this.sqlite
      .prepare(
        "SELECT id,currency,status FROM legal_entity ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,code,id",
      )
      .all() as Array<{ id: string; currency: string; status: string }>;
    if (entities.length === 0)
      return { status: 'unconfigured', reason: 'active_legal_entity_required', revisions: [] };
    const scopedTotals =
      totalsRows.length > 0
        ? totalsRows
        : [
            {
              currency: entities[0]!.currency,
              totalInvoicedMinor: '0',
              taxInvoicedMinor: '0',
              grossInvoicedMinor: '0',
              collectedMinor: '0',
              outstandingMinor: '0',
              internalLaborCostMinor: '0',
              directCostMinor: '0',
              contributionMinor: '0',
            },
          ];
    const invoiceRegister = Array.isArray(snapshot.invoiceRegister)
      ? (snapshot.invoiceRegister as Array<Record<string, unknown>>)
      : [];
    const collections = Array.isArray(snapshot.collections)
      ? (snapshot.collections as Array<Record<string, unknown>>)
      : [];
    const workerCosts = Array.isArray(snapshot.workerCosts)
      ? (snapshot.workerCosts as Array<Record<string, unknown>>)
      : [];
    const workerCostSegments = Array.isArray(snapshot.workerCostSegments)
      ? (snapshot.workerCostSegments as Array<Record<string, unknown>>)
      : [];
    const expenseRegister = Array.isArray(snapshot.expenseRegister)
      ? (snapshot.expenseRegister as Array<Record<string, unknown>>)
      : [];
    const sourceItemsFromSnapshot = Array.isArray(snapshot.sourceItems)
      ? (snapshot.sourceItems as Array<Record<string, unknown>>)
      : [];
    const revisions: AccountingPackRevisionResult[] = [];
    const missingCurrencies: string[] = [];
    for (const totals of scopedTotals) {
      const currency = String(totals.currency ?? '');
      const requestedLegalEntityId =
        typeof totals.legalEntityId === 'string' ? totals.legalEntityId : null;
      const entity = requestedLegalEntityId
        ? entities.find(
            (candidate) =>
              candidate.id === requestedLegalEntityId && candidate.currency === currency,
          )
        : entities.filter((candidate) => candidate.currency === currency).length === 1
          ? entities.find((candidate) => candidate.currency === currency)
          : undefined;
      if (!entity) {
        missingCurrencies.push(
          requestedLegalEntityId ? `${requestedLegalEntityId}:${currency}` : currency,
        );
        continue;
      }
      const scopedInvoices = invoiceRegister.filter(
        (row) => row.currency === currency && row.legalEntityId === entity.id,
      );
      const scopedCollections = collections.filter(
        (row) => row.currency === currency && row.legalEntityId === entity.id,
      );
      const projectBelongsToEntity = (projectId: unknown, businessDate: string): boolean => {
        if (typeof projectId !== 'string') return false;
        return (
          (resolveAccountingPackProjectLegalEntity(this.sqlite, {
            projectId,
            businessDate,
            tenantId: deployment.tenant_id,
            deploymentId: deployment.deployment_id,
          }) ?? null) === entity.id
        );
      };
      const scopedWorkerCosts =
        workerCostSegments.length > 0
          ? workerCostSegments.filter(
              (row) => row.currency === currency && row.legalEntityId === entity.id,
            )
          : workerCosts.filter(
              (row) =>
                row.currency === currency && projectBelongsToEntity(row.projectId, periodEnd),
            );
      const scopedExpenses = expenseRegister.filter(
        (row) =>
          (row.projectCurrency === currency || row.currency === currency) &&
          projectBelongsToEntity(row.projectId, String(row.date ?? periodEnd)),
      );
      const sourceItems = (
        sourceItemsFromSnapshot.length > 0
          ? sourceItemsFromSnapshot.filter(
              (row) => row.currency === currency && row.legalEntityId === entity.id,
            )
          : scopedInvoices.map((row, index) => ({
              id: `invoice-${String(row.invoiceId ?? index + 1)}`,
              itemKind: 'invoice',
              sourceId: String(row.invoiceId ?? `invoice-${index + 1}`),
              itemVersion: Number(row.version ?? 1),
              effectiveAt: (() => {
                const value = String(row.issueDate ?? periodStart);
                return /^\d{4}-\d{2}-\d{2}$/u.test(value)
                  ? `${value}T00:00:00.000Z`
                  : new Date(value).toISOString();
              })(),
              evidenceType: 'invoice_source',
              amountMinor: String(row.netMinor ?? '0'),
              currency,
              payload: row,
            }))
      ) as NonNullable<AccountingPackSnapshotInput['sourceItems']>;
      const sourceItemRows = sourceItems as Array<Record<string, unknown>>;
      const scopedInvoiceSourceCount = sourceItemRows.filter(
        (row) => row.itemKind === 'invoice_source' || row.item_kind === 'invoice_source',
      ).length;
      const scopedInvoiceSourceFallbackCount = scopedInvoices.length > 0 ? sourceItems.length : 0;
      const scopedApprovedTimeEntryCount = sourceItemRows.filter(
        (row) => row.itemKind === 'time' || row.item_kind === 'time',
      ).length;
      const scopedApprovedExpenseCount = sourceItemRows.filter(
        (row) => row.itemKind === 'expense' || row.item_kind === 'expense',
      ).length;
      const stableSnapshot = { ...snapshot };
      delete stableSnapshot.generatedAt;
      const sourceHash = createHash('sha256')
        .update(canonicalJobJson({ currency, snapshot: stableSnapshot, reconciliation }))
        .digest('hex');
      const baseIdempotencyKey = `accounting-pack:${entity.id}:${periodStart}:${periodEnd}:${sourceHash}`;
      const idempotencyKey = revisionIdentity
        ? `${baseIdempotencyKey}:refresh:${revisionIdentity}`
        : baseIdempotencyKey;
      const sourceCutId = `fp-source-cut-${createHash('sha256')
        // A stale refresh is a new immutable source cut. Reusing the prior
        // cut id would try to attach a second revision to already sealed
        // snapshot evidence and is correctly rejected by the DB triggers.
        .update(`${idempotencyKey}:source-cut`)
        .digest('hex')
        .slice(0, 40)}`;
      const revisionId = `fp-accounting-pack-revision-${createHash('sha256')
        .update(`${idempotencyKey}:revision`)
        .digest('hex')
        .slice(0, 40)}`;
      const directCost = BigInt(String(totals.directCostMinor ?? '0'));
      const workerCost = BigInt(String(totals.internalLaborCostMinor ?? '0'));
      const result = this.accountingPackRevisions.createCanonicalRevision(principal, {
        periodStart,
        periodEnd,
        currency,
        timezone: 'UTC',
        legacyLegalEntityId: entity.id,
        sourceItems,
        invoiceRegister: scopedInvoices,
        collections: scopedCollections,
        workerCosts: scopedWorkerCosts,
        expenseRegister: scopedExpenses,
        totalsByCurrency: [totals],
        invoiceCount: scopedInvoices.length,
        paymentCount: scopedCollections.length,
        workerCostCount: scopedWorkerCosts.length,
        expenseCount: scopedExpenses.length,
        sourceItemCount: sourceItems.length,
        invoiceSourceCount: scopedInvoiceSourceCount || scopedInvoiceSourceFallbackCount,
        sourceMismatchCount: Number(reportedMismatchCount),
        approvedTimeEntryCount: scopedApprovedTimeEntryCount,
        approvedExpenseCount: scopedApprovedExpenseCount,
        netMinor: String(totals.totalInvoicedMinor ?? '0'),
        taxMinor: String(totals.taxInvoicedMinor ?? '0'),
        grossMinor: String(totals.grossInvoicedMinor ?? '0'),
        collectedMinor: String(totals.collectedMinor ?? '0'),
        outstandingMinor: String(totals.outstandingMinor ?? '0'),
        workerCostMinor: workerCost,
        expenseCostMinor: directCost - workerCost,
        directCostMinor: directCost,
        contributionMinor: String(totals.contributionMinor ?? '0'),
        reconciliationStatus: authoritativeReconciles ? 'CLEAN' : 'BLOCKED',
        blockerCount: authoritativeReconciles ? 0 : 1,
        idempotencyKey,
        sourceCutId,
        revisionId,
        createdAt,
        effectiveAt: createdAt,
      });
      revisions.push(result);
    }
    return {
      status: missingCurrencies.length === 0 ? 'current' : 'partial',
      revisions,
      missingCurrencies,
    };
  }

  private accountingPackSourcesChangedSince(
    periodStart: string,
    periodEnd: string,
    createdAt: string,
  ): boolean {
    const row = this.sqlite
      .prepare(
        `SELECT MAX(changed_at) changed_at FROM (
           SELECT MAX(updated_at) changed_at FROM time_entry WHERE work_date BETWEEN ? AND ?
           UNION ALL SELECT MAX(updated_at) FROM expense WHERE spent_on BETWEEN ? AND ?
           UNION ALL SELECT MAX(updated_at) FROM invoice
             WHERE (period_start IS NULL OR period_start<=?) AND (period_end IS NULL OR period_end>=?)
           UNION ALL SELECT MAX(created_at) FROM payment WHERE substr(received_at,1,10)<=?
           UNION ALL SELECT MAX(created_at) FROM invoice_payment_reversal_event
             WHERE substr(effective_at,1,10)<=?
           UNION ALL SELECT MAX(created_at) FROM finance_change_event WHERE effective_at<=?
           UNION ALL SELECT MAX(updated_at) FROM compensation_settlement
             WHERE period_start<=? AND period_end>=?
           UNION ALL SELECT MAX(updated_at) FROM compensation_rule
             WHERE effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           UNION ALL SELECT MAX(updated_at) FROM internal_cost_rule
             WHERE effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           UNION ALL SELECT MAX(updated_at) FROM client_labor_rate
             WHERE effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           UNION ALL SELECT MAX(updated_at) FROM assignment_rate_override
             WHERE effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
           UNION ALL SELECT MAX(created_at) FROM finance_internal_cost_snapshot
             WHERE substr(effective_at,1,10) BETWEEN ? AND ?
           UNION ALL SELECT MAX(created_at) FROM direct_cost_event
             WHERE substr(effective_at,1,10) BETWEEN ? AND ?
           UNION ALL SELECT MAX(created_at) FROM finance_hash_evidence
           UNION ALL SELECT MAX(updated_at) FROM legal_entity WHERE status='active'
         )`,
      )
      .get(
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
        periodEnd,
        periodStart,
        periodEnd,
        periodEnd,
        `${periodEnd}T23:59:59.999Z`,
        periodEnd,
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
        periodStart,
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
      ) as { changed_at: string | null };
    return Boolean(row.changed_at && row.changed_at > createdAt);
  }

  createAccountingPack(
    principal: Principal,
    periodStart: string,
    periodEnd: string,
    reportLocale: ReportLocale = 'en',
  ) {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    requireDate(periodStart, 'Period start');
    requireDate(periodEnd, 'Period end');
    if (periodEnd < periodStart) throw new V3ValidationError('Period end must follow start');
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare(
          'SELECT id,snapshot_json,reconciliation_json,state,created_at FROM accounting_pack_run WHERE period_start=? AND period_end=? AND legal_entity_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 1',
        )
        .get(periodStart, periodEnd) as
        | {
            id: string;
            snapshot_json: string;
            reconciliation_json: string;
            state: string;
            created_at: string;
          }
        | undefined;
      if (existing) {
        const job = this.latestAccountingPackJob(existing.id);
        const exportCount = this.sqlite
          .prepare(
            "SELECT COUNT(DISTINCT export_type) AS count FROM accounting_pack_export WHERE pack_run_id=? AND export_type IN ('xlsx','invoice_csv','expense_csv') AND byte_length>0 AND length(sha256)=64",
          )
          .get(existing.id) as { count: number };
        const state =
          existing.state === 'final'
            ? 'final'
            : job?.state === 'claimed' || job?.state === 'running'
              ? 'running'
              : job?.state === 'queued'
                ? 'queued'
                : job?.state === 'dead_letter'
                  ? 'failed'
                  : exportCount.count >= requiredAccountingPackExportTypes.length
                    ? 'ready'
                    : existing.state;
        const sourceStale = this.accountingPackSourcesChangedSince(
          periodStart,
          periodEnd,
          existing.created_at,
        );
        if (!sourceStale)
          return {
            id: existing.id,
            state,
            sourceStale: false,
            snapshot: JSON.parse(existing.snapshot_json) as unknown,
            reconciliation: JSON.parse(existing.reconciliation_json) as unknown,
          };
      }
      const ledger = this.masterLedger(principal, { start: periodStart, end: periodEnd });
      const deployment = this.sqlite
        .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
        .get() as { tenant_id: string; deployment_id: string } | undefined;
      if (!deployment) throw new V3ConflictError('Deployment identity is not configured');
      const projectLegalEntityAt = (projectId: string, businessDate: string): string | null => {
        return resolveAccountingPackProjectLegalEntity(this.sqlite, {
          projectId,
          businessDate,
          tenantId: deployment.tenant_id,
          deploymentId: deployment.deployment_id,
        });
      };
      const addAmount = (
        map: Map<V3Currency, bigint>,
        currency: V3Currency,
        amount: bigint,
      ): void => {
        map.set(currency, (map.get(currency) ?? 0n) + amount);
      };
      const amountMap = (values: ReadonlyMap<V3Currency, bigint>): Record<string, string> =>
        Object.fromEntries(
          [...values.entries()].map(([currency, amount]) => [currency, amount.toString()]),
        );
      const invoiceRegister = ledger.map((row) => ({
        invoiceId: row.invoiceId,
        legalEntityId: row.legalEntityId,
        legalEntityRevisionId: row.legalEntityRevisionId,
        version: row.version,
        invoiceNumber: row.invoiceNumber,
        client: row.clientName,
        project: row.projectNumber,
        stream: row.streamType,
        servicePeriod: `${row.periodStart ?? ''}/${row.periodEnd ?? ''}`,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        currency: row.currency,
        netMinor: row.subtotalMinor,
        taxMinor: row.taxMinor,
        grossMinor: row.totalMinor,
        status: row.paymentStatus,
      }));
      const eventDateInRange = (value: string, label: string, includeBefore = false): boolean => {
        try {
          requireDateTime(value, label);
        } catch {
          throw new V3ConflictError(`${label} must be a canonical RFC3339 UTC timestamp`);
        }
        const date = value.slice(0, 10);
        return includeBefore ? date <= periodEnd : date >= periodStart && date <= periodEnd;
      };
      const allPaymentEventRows = this.sqlite
        .prepare(
          `SELECT pa.id payment_id,pa.invoice_id,CAST(pa.amount_minor AS TEXT) amount_minor,
                pa.currency,pa.received_at,pa.reference,i.invoice_number,
                CAST(i.total_minor AS TEXT) total_minor,i.currency invoice_currency,
                c.display_name client_name
         FROM payment pa
         JOIN invoice i ON i.id=pa.invoice_id
         JOIN project p ON p.id=i.project_id
         JOIN client c ON c.id=p.client_id
         ORDER BY pa.received_at,pa.id`,
        )
        .all() as Array<{
        payment_id: string;
        invoice_id: string;
        amount_minor: string;
        currency: V3Currency;
        received_at: string;
        reference: string | null;
        invoice_number: string | null;
        total_minor: string;
        invoice_currency: V3Currency;
        client_name: string;
      }>;
      const paymentRows = allPaymentEventRows.filter((payment) =>
        eventDateInRange(payment.received_at, 'Payment received date'),
      );
      const allPaymentReversalRows = this.sqlite
        .prepare(
          `SELECT r.id reversal_id,r.original_payment_id payment_id,r.invoice_id,
                CAST(r.amount_minor AS TEXT) amount_minor,r.currency,r.effective_at,
                r.reason_text reference,i.invoice_number,CAST(i.total_minor AS TEXT) total_minor,
                i.currency invoice_currency,c.display_name client_name
         FROM invoice_payment_reversal_event r
         JOIN invoice i ON i.id=r.invoice_id
         JOIN project p ON p.id=i.project_id
         JOIN client c ON c.id=p.client_id
         ORDER BY r.effective_at,r.id`,
        )
        .all() as Array<{
        reversal_id: string;
        payment_id: string;
        invoice_id: string;
        amount_minor: string;
        currency: V3Currency;
        effective_at: string;
        reference: string | null;
        invoice_number: string | null;
        total_minor: string;
        invoice_currency: V3Currency;
        client_name: string;
      }>;
      const paymentReversalRows = allPaymentReversalRows.filter((reversal) =>
        eventDateInRange(reversal.effective_at, 'Payment reversal effective date'),
      );
      const totalCollectedByInvoice = new Map<string, bigint>();
      for (const payment of allPaymentEventRows) {
        if (!eventDateInRange(payment.received_at, 'Payment received date', true)) continue;
        totalCollectedByInvoice.set(
          payment.invoice_id,
          (totalCollectedByInvoice.get(payment.invoice_id) ?? 0n) + BigInt(payment.amount_minor),
        );
      }
      for (const reversal of allPaymentReversalRows) {
        if (!eventDateInRange(reversal.effective_at, 'Payment reversal effective date', true))
          continue;
        totalCollectedByInvoice.set(
          reversal.invoice_id,
          (totalCollectedByInvoice.get(reversal.invoice_id) ?? 0n) - BigInt(reversal.amount_minor),
        );
      }
      const collections = [
        ...paymentRows.map((payment) => ({
          collectionType: 'payment' as const,
          paymentId: payment.payment_id,
          reversalId: null,
          invoiceId: payment.invoice_id,
          invoiceNumber: payment.invoice_number,
          client: payment.client_name,
          grossInvoicedMinor: String(payment.total_minor),
          amountCollectedInMonthMinor: String(payment.amount_minor),
          totalCollectedToDateMinor: (
            totalCollectedByInvoice.get(payment.invoice_id) ?? 0n
          ).toString(),
          outstandingMinor: (
            BigInt(payment.total_minor) - (totalCollectedByInvoice.get(payment.invoice_id) ?? 0n)
          ).toString(),
          paymentDate: payment.received_at,
          paymentReference: payment.reference,
          currency: payment.currency,
          legalEntityId:
            ledger.find((invoice) => invoice.invoiceId === payment.invoice_id)?.legalEntityId ??
            null,
        })),
        ...paymentReversalRows.map((reversal) => ({
          collectionType: 'payment_reversal' as const,
          paymentId: reversal.payment_id,
          reversalId: reversal.reversal_id,
          invoiceId: reversal.invoice_id,
          invoiceNumber: reversal.invoice_number,
          client: reversal.client_name,
          grossInvoicedMinor: String(reversal.total_minor),
          amountCollectedInMonthMinor: (-BigInt(reversal.amount_minor)).toString(),
          totalCollectedToDateMinor: (
            totalCollectedByInvoice.get(reversal.invoice_id) ?? 0n
          ).toString(),
          outstandingMinor: (
            BigInt(reversal.total_minor) - (totalCollectedByInvoice.get(reversal.invoice_id) ?? 0n)
          ).toString(),
          paymentDate: reversal.effective_at,
          paymentReference: reversal.reference,
          currency: reversal.currency,
          legalEntityId:
            ledger.find((invoice) => invoice.invoiceId === reversal.invoice_id)?.legalEntityId ??
            null,
        })),
      ].sort(
        (left, right) =>
          left.paymentDate.localeCompare(right.paymentDate) ||
          String(left.reversalId ?? left.paymentId).localeCompare(
            String(right.reversalId ?? right.paymentId),
          ),
      );
      const expenseRows = this.sqlite
        .prepare(
          `SELECT e.id,e.spent_on,e.worker_id,e.project_id,e.vendor,e.category,e.who_paid,
                COALESCE(e.billing_treatment,e.client_treatment) treatment,e.client_treatment,
                e.currency,CAST(e.amount_minor AS TEXT) amount_minor,
                CAST(e.tax_amount_minor AS TEXT) tax_amount_minor,
                CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                CAST(e.billing_amount_minor AS TEXT) billing_amount_minor,
                e.reimbursement_state,e.receipt_document_id,e.billing_state,e.version,
                e.invoice_id,p.project_number,p.currency project_currency,u.name worker_name
         FROM expense e JOIN project p ON p.id=e.project_id JOIN user u ON u.id=e.worker_id
         WHERE e.spent_on BETWEEN ? AND ? AND e.approval_state IN ('approved','locked') ORDER BY e.spent_on,e.id`,
        )
        .all(periodStart, periodEnd) as Array<{
        id: string;
        spent_on: string;
        worker_id: string;
        project_id: string;
        vendor: string;
        category: string;
        who_paid: string;
        treatment: string;
        client_treatment: string;
        currency: V3Currency;
        amount_minor: string;
        tax_amount_minor: string | null;
        project_currency_amount_minor: string | null;
        billing_amount_minor: string | null;
        reimbursement_state: string;
        receipt_document_id: string | null;
        billing_state: string;
        version: number;
        invoice_id: string | null;
        project_number: string;
        project_currency: V3Currency;
        worker_name: string;
      }>;
      const travelCategories = new Set([
        'hotel',
        'rental_car',
        'fuel',
        'tolls',
        'parking',
        'airfare',
        'ground_transport',
        'meals',
        'per_diem',
      ]);
      const expenseCostByCurrency = new Map<V3Currency, bigint>();
      const travelCostByCurrency = new Map<V3Currency, bigint>();
      const otherCostByCurrency = new Map<V3Currency, bigint>();
      const expenses = expenseRows.map((expense) => {
        if (
          expense.currency !== expense.project_currency &&
          expense.project_currency_amount_minor === null
        )
          throw new V3ConflictError(
            `Expense ${expense.id} is missing its authoritative project-currency projection`,
          );
        const netProjectMinor = BigInt(
          expense.project_currency_amount_minor ?? expense.amount_minor,
        );
        const taxMinor = BigInt(expense.tax_amount_minor ?? 0);
        if (expense.who_paid !== 'client' && expense.treatment !== 'client_direct') {
          addAmount(expenseCostByCurrency, expense.project_currency, netProjectMinor);
          addAmount(
            travelCategories.has(expense.category) ? travelCostByCurrency : otherCostByCurrency,
            expense.project_currency,
            netProjectMinor,
          );
        }
        return {
          expenseId: expense.id,
          version: expense.version,
          date: expense.spent_on,
          workerId: expense.worker_id,
          worker: expense.worker_name,
          projectId: expense.project_id,
          legalEntityId: projectLegalEntityAt(expense.project_id, expense.spent_on),
          project: expense.project_number,
          vendor: expense.vendor,
          category: expense.category,
          whoPaid: expense.who_paid,
          clientTreatment: expense.client_treatment,
          billingTreatment: expense.treatment,
          currency: expense.currency,
          amountMinor: String(expense.amount_minor),
          taxMinor: String(taxMinor),
          grossMinor: (BigInt(expense.amount_minor) + taxMinor).toString(),
          projectCurrency: expense.project_currency,
          projectCurrencyAmountMinor: netProjectMinor.toString(),
          billingAmountMinor:
            expense.billing_amount_minor === null ? null : String(expense.billing_amount_minor),
          reimbursementStatus: expense.reimbursement_state,
          billingStatus: expense.billing_state,
          invoiceId: expense.invoice_id,
          receiptDocumentId: expense.receipt_document_id,
        };
      });
      const timeRows = this.sqlite
        .prepare(
          `SELECT t.id,t.worker_id,t.project_id,t.category,t.work_date,t.activity_code,t.minutes,
                t.approval_state,t.billability_state,t.version,u.name worker_name,p.project_number,
                p.currency project_currency
         FROM time_entry t JOIN user u ON u.id=t.worker_id JOIN project p ON p.id=t.project_id
         WHERE t.work_date BETWEEN ? AND ? AND t.approval_state IN ('approved','locked')
         ORDER BY t.work_date,t.id`,
        )
        .all(periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        project_id: string;
        category: string;
        work_date: string;
        activity_code: string | null;
        minutes: number;
        approval_state: string;
        billability_state: string;
        version: number;
        worker_name: string;
        project_number: string;
        project_currency: V3Currency;
      }>;
      const timeByWorkerProject = new Map<
        string,
        {
          workerId: string;
          worker: string;
          projectId: string;
          project: string;
          legalEntityId: string | null;
          currency: V3Currency;
          actualMinutes: number;
          regularMinutes: number;
          standbyMinutes: number;
          overtimeMinutes: number;
          travelMinutes: number;
          compensationMinor: bigint;
          compensationRuleTypes: Set<string>;
          compensationBases: Set<string>;
          internalLaborCostMinor: bigint;
          sourceTimeIds: string[];
          missingCostRuleCount: number;
          dailyCompensationDays: Set<string>;
          fixedCompensationRules: Set<string>;
          guaranteeActualByRuleDay: Map<string, { rule: CompensationRuleRow; minutes: number }>;
        }
      >();
      for (const row of timeRows) {
        const legalEntityId = projectLegalEntityAt(row.project_id, row.work_date);
        const key = `${row.worker_id}:${row.project_id}:${legalEntityId ?? 'unassigned'}`;
        const current = timeByWorkerProject.get(key) ?? {
          workerId: row.worker_id,
          worker: row.worker_name,
          projectId: row.project_id,
          project: row.project_number,
          legalEntityId,
          currency: row.project_currency,
          actualMinutes: 0,
          regularMinutes: 0,
          standbyMinutes: 0,
          overtimeMinutes: 0,
          travelMinutes: 0,
          compensationMinor: 0n,
          compensationRuleTypes: new Set<string>(),
          compensationBases: new Set<string>(),
          internalLaborCostMinor: 0n,
          sourceTimeIds: [],
          missingCostRuleCount: 0,
          dailyCompensationDays: new Set<string>(),
          fixedCompensationRules: new Set<string>(),
          guaranteeActualByRuleDay: new Map<
            string,
            { rule: CompensationRuleRow; minutes: number }
          >(),
        };
        current.actualMinutes += row.minutes;
        if (row.category === 'overtime') current.overtimeMinutes += row.minutes;
        else if (row.category === 'standby') current.standbyMinutes += row.minutes;
        else if (row.category === 'travel') current.travelMinutes += row.minutes;
        else current.regularMinutes += row.minutes;
        current.sourceTimeIds.push(row.id);
        const timeRow = {
          id: row.id,
          project_id: row.project_id,
          worker_id: row.worker_id,
          work_date: row.work_date,
          category: row.category,
          activity_code: row.activity_code,
          minutes: row.minutes,
          approval_state: row.approval_state,
          billability_state: row.billability_state,
          project_currency: row.project_currency,
        } satisfies TimeRow;
        const compensationRule = this.compensationRuleFor(
          row.project_id,
          row.worker_id,
          row.category,
          row.work_date,
          row.activity_code,
        );
        const clientRate = this.clientRateFor(
          row.project_id,
          row.worker_id,
          row.category,
          row.work_date,
          row.activity_code,
        );
        if (compensationRule) {
          current.compensationRuleTypes.add(compensationRule.rule_type);
          if (compensationRule.percentage_basis)
            current.compensationBases.add(compensationRule.percentage_basis);
          if (
            compensationRule.rule_type === 'FixedPerBillingPeriod' ||
            compensationRule.rule_type === 'FixedProjectAmount' ||
            compensationRule.rule_type === 'CustomApprovedAdjustment'
          ) {
            if (!current.fixedCompensationRules.has(compensationRule.id)) {
              current.fixedCompensationRules.add(compensationRule.id);
              current.compensationMinor += BigInt(compensationRule.rate_minor);
            }
          } else if (
            compensationRule.rule_type === 'Daily' ||
            compensationRule.rate_basis === 'daily'
          ) {
            const dayKey = `${compensationRule.id}:${row.work_date}`;
            if (!current.dailyCompensationDays.has(dayKey)) {
              current.dailyCompensationDays.add(dayKey);
              current.compensationMinor += BigInt(compensationRule.rate_minor);
            }
          } else {
            current.compensationMinor += this.compensationAmount(
              timeRow,
              compensationRule,
              clientRate,
            );
          }
          if (
            compensationRule.rule_type === 'Hourly' &&
            compensationRule.rate_basis !== 'daily' &&
            compensationRule.daily_guarantee_minutes
          ) {
            const guaranteeKey = `${compensationRule.id}:${row.work_date}`;
            const day = current.guaranteeActualByRuleDay.get(guaranteeKey) ?? {
              rule: compensationRule,
              minutes: 0,
            };
            day.minutes += row.minutes;
            current.guaranteeActualByRuleDay.set(guaranteeKey, day);
          }
        }
        const internalRate = this.internalCostFor(
          row.project_id,
          row.worker_id,
          row.category,
          row.work_date,
          row.activity_code,
        );
        if (!internalRate || internalRate.currency !== row.project_currency)
          current.missingCostRuleCount += 1;
        else
          current.internalLaborCostMinor += hourlyRateForMinutes(
            money(row.project_currency, this.internalCostAmount(timeRow, internalRate)),
            row.minutes,
          ).minorUnits;
        timeByWorkerProject.set(key, current);
      }
      for (const current of timeByWorkerProject.values())
        for (const { rule, minutes } of current.guaranteeActualByRuleDay.values()) {
          const topUp = Math.max(0, (rule.daily_guarantee_minutes ?? 0) - minutes);
          if (topUp > 0)
            current.compensationMinor += hourlyRateForMinutes(
              money(rule.currency, BigInt(rule.rate_minor)),
              topUp,
            ).minorUnits;
        }
      const reimbursementRows = this.sqlite
        .prepare(
          `SELECT e.id,e.worker_id,e.project_id,e.spent_on,e.currency,p.currency project_currency,
                CAST(e.amount_minor AS TEXT) amount_minor,
                CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor
         FROM expense e JOIN project p ON p.id=e.project_id
         WHERE e.spent_on BETWEEN ? AND ? AND e.approval_state IN ('approved','locked')
           AND e.who_paid='worker'
         ORDER BY e.worker_id,e.project_id,e.id`,
        )
        .all(periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        project_id: string;
        spent_on: string;
        currency: V3Currency;
        project_currency: V3Currency;
        amount_minor: string;
        project_currency_amount_minor: string | null;
      }>;
      const reimbursementByWorkerProject = new Map<string, bigint>();
      for (const row of reimbursementRows) {
        if (row.currency !== row.project_currency && row.project_currency_amount_minor === null)
          throw new V3ConflictError(
            `Expense ${row.id} is missing its authoritative project-currency projection`,
          );
        const legalEntityId = projectLegalEntityAt(row.project_id, row.spent_on);
        const key = `${row.worker_id}:${row.project_id}:${legalEntityId ?? 'unassigned'}`;
        reimbursementByWorkerProject.set(
          key,
          (reimbursementByWorkerProject.get(key) ?? 0n) +
            BigInt(row.project_currency_amount_minor ?? row.amount_minor),
        );
      }
      const settledRows = this.sqlite
        .prepare(
          `SELECT s.id,s.worker_id,s.project_id,s.compensation_rule_id,s.source_basis,
                  CAST(s.source_amount_minor AS TEXT) source_amount_minor,
                  s.percentage_bps,CAST(s.amount_minor AS TEXT) amount,s.currency,
                  s.period_start,s.period_end,s.state,s.settled_at,r.version rule_version
         FROM compensation_settlement s
         JOIN compensation_rule r ON r.id=s.compensation_rule_id
         WHERE period_start=? AND period_end=? AND state IN ('approved','settled')
         ORDER BY s.worker_id,s.project_id,s.id`,
        )
        .all(periodStart, periodEnd) as Array<{
        id: string;
        worker_id: string;
        project_id: string;
        compensation_rule_id: string;
        source_basis: string;
        source_amount_minor: string;
        percentage_bps: number | null;
        amount: string;
        currency: V3Currency;
        period_start: string;
        period_end: string;
        state: 'approved' | 'settled';
        settled_at: string | null;
        rule_version: number;
      }>;
      const settledByWorkerProject = new Map<string, bigint>();
      for (const row of settledRows) {
        const key = `${row.worker_id}:${row.project_id}`;
        settledByWorkerProject.set(
          key,
          (settledByWorkerProject.get(key) ?? 0n) + BigInt(row.amount),
        );
      }
      const workerCostSegments = [...timeByWorkerProject.values()].map((row) => ({
        workerId: row.workerId,
        worker: row.worker,
        projectId: row.projectId,
        project: row.project,
        legalEntityId: row.legalEntityId,
        currency: row.currency,
        actualApprovedMinutes: row.actualMinutes,
        regularMinutes: row.regularMinutes,
        standbyMinutes: row.standbyMinutes,
        overtimeMinutes: row.overtimeMinutes,
        travelMinutes: row.travelMinutes,
        compensationRuleType: [...row.compensationRuleTypes].join('|') || null,
        compensationBasis: [...row.compensationBases].join('|') || null,
        approvedCompensationMinor: row.compensationMinor.toString(),
        settledCompensationMinor: (row.legalEntityId ===
        projectLegalEntityAt(row.projectId, periodEnd)
          ? (settledByWorkerProject.get(`${row.workerId}:${row.projectId}`) ?? 0n)
          : 0n
        ).toString(),
        internalLoadedLaborCostMinor: row.internalLaborCostMinor.toString(),
        reimbursementMinor: (
          reimbursementByWorkerProject.get(
            `${row.workerId}:${row.projectId}:${row.legalEntityId ?? 'unassigned'}`,
          ) ?? 0n
        ).toString(),
        missingCostRuleCount: row.missingCostRuleCount,
        sourceTimeIds: row.sourceTimeIds,
      }));
      // The canonical Accounting Pack contract identifies one compensation and
      // one labor-cost source per worker/project.  Keep that stable aggregate
      // while exposing the effective-date legal-entity segments separately so
      // a project reassignment cannot hide the point-in-time attribution.
      const aggregateWorkerCosts = new Map<
        string,
        Omit<(typeof workerCostSegments)[number], 'legalEntityId'> & {
          legalEntityId: string | null;
          compensationRuleTypes: Set<string>;
          compensationBases: Set<string>;
        }
      >();
      for (const row of workerCostSegments) {
        const key = `${row.workerId}:${row.projectId}`;
        const current = aggregateWorkerCosts.get(key) ?? {
          ...row,
          legalEntityId: projectLegalEntityAt(row.projectId, periodEnd),
          actualApprovedMinutes: 0,
          regularMinutes: 0,
          standbyMinutes: 0,
          overtimeMinutes: 0,
          travelMinutes: 0,
          approvedCompensationMinor: '0',
          settledCompensationMinor: '0',
          internalLoadedLaborCostMinor: '0',
          reimbursementMinor: '0',
          missingCostRuleCount: 0,
          sourceTimeIds: [],
          compensationRuleTypes: new Set<string>(),
          compensationBases: new Set<string>(),
        };
        current.actualApprovedMinutes += row.actualApprovedMinutes;
        current.regularMinutes += row.regularMinutes;
        current.standbyMinutes += row.standbyMinutes;
        current.overtimeMinutes += row.overtimeMinutes;
        current.travelMinutes += row.travelMinutes;
        current.approvedCompensationMinor = (
          BigInt(current.approvedCompensationMinor) + BigInt(row.approvedCompensationMinor)
        ).toString();
        current.settledCompensationMinor = (
          BigInt(current.settledCompensationMinor) + BigInt(row.settledCompensationMinor)
        ).toString();
        current.internalLoadedLaborCostMinor = (
          BigInt(current.internalLoadedLaborCostMinor) + BigInt(row.internalLoadedLaborCostMinor)
        ).toString();
        current.reimbursementMinor = (
          BigInt(current.reimbursementMinor) + BigInt(row.reimbursementMinor)
        ).toString();
        current.missingCostRuleCount += row.missingCostRuleCount;
        current.sourceTimeIds.push(...row.sourceTimeIds);
        for (const value of String(row.compensationRuleType ?? '').split('|'))
          if (value) current.compensationRuleTypes.add(value);
        for (const value of String(row.compensationBasis ?? '').split('|'))
          if (value) current.compensationBases.add(value);
        aggregateWorkerCosts.set(key, current);
      }
      const workerCosts = [...aggregateWorkerCosts.values()].map((row) => ({
        ...row,
        compensationRuleType: [...row.compensationRuleTypes].join('|') || null,
        compensationBasis: [...row.compensationBases].join('|') || null,
      }));
      const workerCompensationByCurrency = new Map<V3Currency, bigint>();
      const internalLaborByCurrency = new Map<V3Currency, bigint>();
      for (const row of workerCosts) {
        addAmount(
          workerCompensationByCurrency,
          row.currency,
          BigInt(row.approvedCompensationMinor),
        );
        addAmount(internalLaborByCurrency, row.currency, BigInt(row.internalLoadedLaborCostMinor));
      }
      const invoiceNetByCurrency = new Map<V3Currency, bigint>();
      const invoiceTaxByCurrency = new Map<V3Currency, bigint>();
      const invoiceGrossByCurrency = new Map<V3Currency, bigint>();
      for (const row of ledger) {
        if (row.billingStatus === 'void') continue;
        addAmount(invoiceNetByCurrency, row.currency, BigInt(row.subtotalMinor));
        addAmount(invoiceTaxByCurrency, row.currency, BigInt(row.taxMinor));
        addAmount(invoiceGrossByCurrency, row.currency, BigInt(row.totalMinor));
      }
      const collectedByCurrency = new Map<V3Currency, bigint>();
      for (const row of collections)
        addAmount(collectedByCurrency, row.currency, BigInt(row.amountCollectedInMonthMinor));
      const directCostByCurrency = new Map<V3Currency, bigint>();
      for (const [currency, amount] of internalLaborByCurrency)
        addAmount(directCostByCurrency, currency, amount);
      for (const [currency, amount] of expenseCostByCurrency)
        addAmount(directCostByCurrency, currency, amount);
      const currencies = new Set<V3Currency>([
        ...invoiceNetByCurrency.keys(),
        ...directCostByCurrency.keys(),
        ...collectedByCurrency.keys(),
      ]);
      const totalsByCurrency = [...currencies].sort().map((currency) => {
        const invoiceNet = invoiceNetByCurrency.get(currency) ?? 0n;
        const directCost = directCostByCurrency.get(currency) ?? 0n;
        const contribution = invoiceNet - directCost;
        return {
          currency,
          laborInvoicedMinor: ledger
            .filter(
              (row) =>
                row.billingStatus !== 'void' &&
                row.currency === currency &&
                row.streamType === 'labor',
            )
            .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
            .toString(),
          expenseInvoicedMinor: ledger
            .filter(
              (row) =>
                row.billingStatus !== 'void' &&
                row.currency === currency &&
                row.streamType === 'expense',
            )
            .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
            .toString(),
          milestoneOtherInvoicedMinor: ledger
            .filter(
              (row) =>
                row.billingStatus !== 'void' &&
                row.currency === currency &&
                !['labor', 'expense'].includes(row.streamType),
            )
            .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
            .toString(),
          totalInvoicedMinor: invoiceNet.toString(),
          taxInvoicedMinor: (invoiceTaxByCurrency.get(currency) ?? 0n).toString(),
          grossInvoicedMinor: (invoiceGrossByCurrency.get(currency) ?? 0n).toString(),
          collectedMinor: (collectedByCurrency.get(currency) ?? 0n).toString(),
          outstandingMinor: ledger
            .filter((row) => row.currency === currency)
            .reduce((sum, row) => sum + BigInt(row.outstandingMinor), 0n)
            .toString(),
          workerCompensationMinor: (workerCompensationByCurrency.get(currency) ?? 0n).toString(),
          internalLaborCostMinor: (internalLaborByCurrency.get(currency) ?? 0n).toString(),
          travelCostMinor: (travelCostByCurrency.get(currency) ?? 0n).toString(),
          otherDirectCostMinor: (otherCostByCurrency.get(currency) ?? 0n).toString(),
          directCostMinor: directCost.toString(),
          contributionMinor: contribution.toString(),
          contributionMarginBps:
            invoiceNet === 0n ? '0' : divideRounded(contribution * 10_000n, invoiceNet).toString(),
        };
      });
      const totalsByAccountingScope = totalsByCurrency.flatMap((currencyTotals) => {
        const currency = currencyTotals.currency;
        const sourceRows = [
          ...ledger
            .filter((row) => row.currency === currency)
            .map((row) => row.legalEntityId ?? null),
          ...workerCostSegments
            .filter((row) => row.currency === currency)
            .map((row) => (typeof row.legalEntityId === 'string' ? row.legalEntityId : null)),
          ...expenses
            .filter((row) => row.projectCurrency === currency)
            .map((row) => row.legalEntityId ?? null),
        ];
        const entityIds = [...new Set(sourceRows)];
        if (entityIds.length === 0) entityIds.push(null);
        const workersForCurrency = (legalEntityId: string | null) =>
          (workerCostSegments.length > 0 ? workerCostSegments : workerCosts).filter(
            (row) =>
              row.currency === currency &&
              (typeof row.legalEntityId === 'string' ? row.legalEntityId : null) === legalEntityId,
          );
        const expensesForCurrency = (legalEntityId: string | null) =>
          expenses.filter(
            (row) => row.projectCurrency === currency && row.legalEntityId === legalEntityId,
          );
        const isDirectExpense = (row: (typeof expenses)[number]): boolean =>
          row.whoPaid !== 'client' && row.billingTreatment !== 'client_direct';
        return entityIds.map((legalEntityId) => {
          const scopedLedger = ledger.filter(
            (row) => row.currency === currency && row.legalEntityId === legalEntityId,
          );
          const live = scopedLedger.filter((row) => row.billingStatus !== 'void');
          const workers = workersForCurrency(legalEntityId);
          const scopedExpenses = expensesForCurrency(legalEntityId);
          const net = live.reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n);
          const workerCompensation = workers.reduce(
            (sum, row) => sum + BigInt(String(row.approvedCompensationMinor ?? '0')),
            0n,
          );
          const internalLabor = workers.reduce(
            (sum, row) => sum + BigInt(String(row.internalLoadedLaborCostMinor ?? '0')),
            0n,
          );
          const travelCost = scopedExpenses
            .filter((row) => isDirectExpense(row) && travelCategories.has(row.category))
            .reduce((sum, row) => sum + BigInt(row.projectCurrencyAmountMinor), 0n);
          const otherDirectCost = scopedExpenses
            .filter((row) => isDirectExpense(row) && !travelCategories.has(row.category))
            .reduce((sum, row) => sum + BigInt(row.projectCurrencyAmountMinor), 0n);
          const directCost = internalLabor + travelCost + otherDirectCost;
          const contribution = net - directCost;
          return {
            ...currencyTotals,
            legalEntityId,
            laborInvoicedMinor: live
              .filter((row) => row.streamType === 'labor')
              .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
              .toString(),
            expenseInvoicedMinor: live
              .filter((row) => row.streamType === 'expense')
              .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
              .toString(),
            milestoneOtherInvoicedMinor: live
              .filter((row) => !['labor', 'expense'].includes(row.streamType))
              .reduce((sum, row) => sum + BigInt(row.subtotalMinor), 0n)
              .toString(),
            totalInvoicedMinor: net.toString(),
            taxInvoicedMinor: live.reduce((sum, row) => sum + BigInt(row.taxMinor), 0n).toString(),
            grossInvoicedMinor: live
              .reduce((sum, row) => sum + BigInt(row.totalMinor), 0n)
              .toString(),
            workerCompensationMinor: workerCompensation.toString(),
            internalLaborCostMinor: internalLabor.toString(),
            travelCostMinor: travelCost.toString(),
            otherDirectCostMinor: otherDirectCost.toString(),
            directCostMinor: directCost.toString(),
            contributionMinor: contribution.toString(),
            collectedMinor: scopedLedger
              .reduce((sum, row) => sum + BigInt(row.collectedMinor), 0n)
              .toString(),
            outstandingMinor: scopedLedger
              .reduce((sum, row) => sum + BigInt(row.outstandingMinor), 0n)
              .toString(),
            contributionMarginBps:
              net === 0n ? '0' : divideRounded(contribution * 10_000n, net).toString(),
          };
        });
      });
      const totals =
        totalsByAccountingScope.length === 1
          ? totalsByAccountingScope[0]
          : {
              currency: 'MULTI',
              laborInvoicedMinor: null,
              expenseInvoicedMinor: null,
              milestoneOtherInvoicedMinor: null,
              totalInvoicedMinor: null,
              taxInvoicedMinor: null,
              grossInvoicedMinor: null,
              collectedMinor: null,
              outstandingMinor: null,
              workerCompensationMinor: null,
              internalLaborCostMinor: null,
              travelCostMinor: null,
              otherDirectCostMinor: null,
              directCostMinor: null,
              contributionMinor: null,
              contributionMarginBps: null,
            };
      const sourceMismatches: Array<Record<string, string>> = [];
      let invoiceSourceCount = 0;
      let commercialManifestCount = 0;
      type CommercialManifestRow = {
        source_type: string;
        source_id: string;
        source_version: number | null;
        disposition: string;
        original_minor: string | null;
        allocated_minor: string | null;
        remaining_minor: string | null;
        reason_code: string;
        source_hash: string | null;
        locked_at: string | null;
      };
      const commercialManifestByInvoice = new Map<string, CommercialManifestRow[]>();
      for (const invoice of ledger) {
        const commercialManifest = this.sqlite
          .prepare(
            `SELECT source_type,source_id,source_version,disposition,
                  CAST(original_minor AS TEXT) original_minor,
                  CAST(allocated_minor AS TEXT) allocated_minor,
                  CAST(remaining_minor AS TEXT) remaining_minor,
                  reason_code,source_hash,locked_at
           FROM invoice_commercial_source_manifest
           WHERE invoice_id=? ORDER BY source_type,source_id`,
          )
          .all(invoice.invoiceId) as CommercialManifestRow[];
        commercialManifestCount += commercialManifest.length;
        commercialManifestByInvoice.set(invoice.invoiceId, commercialManifest);
        const manifestBySource = new Map(
          commercialManifest.map((row) => [`${row.source_type}:${row.source_id}`, row]),
        );
        if (commercialManifest.length === 0)
          sourceMismatches.push({
            invoiceId: invoice.invoiceId,
            sourceType: 'commercial_manifest',
            sourceId: invoice.invoiceId,
            reason: 'commercial_source_manifest_missing',
          });
        const allocatedManifestTotal = commercialManifest.reduce(
          (sum, row) => sum + BigInt(row.allocated_minor ?? 0),
          0n,
        );
        const invoiceSubtotal = BigInt(invoice.subtotalMinor);
        if (allocatedManifestTotal !== (invoiceSubtotal < 0n ? -invoiceSubtotal : invoiceSubtotal))
          sourceMismatches.push({
            invoiceId: invoice.invoiceId,
            sourceType: 'commercial_manifest',
            sourceId: invoice.invoiceId,
            reason: 'commercial_allocation_total_mismatch',
          });
        const invoiceLineKeys = new Set(
          (
            this.sqlite
              .prepare('SELECT source_type,source_id FROM invoice_line WHERE invoice_id=?')
              .all(invoice.invoiceId) as Array<{ source_type: string; source_id: string }>
          ).map((line) => `${line.source_type}:${line.source_id}`),
        );
        const invoiceLineManifestKeys = new Set(
          [...invoiceLineKeys].map((key) =>
            key.startsWith('billing_adjustment:')
              ? `minimum_top_up:${key.slice('billing_adjustment:'.length)}`
              : key,
          ),
        );
        const expectedManifestKeys = new Set<string>([
          ...invoice.sources.map((source) => `${source.source_type}:${source.source_id}`),
          ...invoiceLineManifestKeys,
        ]);
        for (const expectedKey of invoiceLineManifestKeys)
          if (!manifestBySource.has(expectedKey)) {
            const separator = expectedKey.indexOf(':');
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: separator < 0 ? expectedKey : expectedKey.slice(0, separator),
              sourceId: separator < 0 ? expectedKey : expectedKey.slice(separator + 1),
              reason: 'commercial_source_manifest_omitted',
            });
          }
        for (const manifest of commercialManifest) {
          const sourceKey = `${manifest.source_type}:${manifest.source_id}`;
          if (!expectedManifestKeys.has(sourceKey))
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: manifest.source_type,
              sourceId: manifest.source_id,
              reason: 'commercial_source_manifest_unexpected',
            });
        }
        for (const source of invoice.sources) {
          invoiceSourceCount += 1;
          const manifest = manifestBySource.get(`${source.source_type}:${source.source_id}`);
          if (!manifest)
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: source.source_type,
              sourceId: source.source_id,
              reason: 'commercial_source_allocation_missing',
            });
          else if (!manifest.locked_at || !manifest.source_hash)
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: source.source_type,
              sourceId: source.source_id,
              reason: 'commercial_source_allocation_unverified',
            });
          let currentVersion: number | null = null;
          let linkedInvoiceId: string | null = null;
          if (source.source_type === 'time') {
            const row = this.sqlite
              .prepare('SELECT version,invoice_id FROM time_entry WHERE id=?')
              .get(source.source_id) as { version: number; invoice_id: string | null } | undefined;
            currentVersion = row?.version ?? null;
            linkedInvoiceId = row?.invoice_id ?? null;
          } else if (source.source_type === 'expense') {
            const row = this.sqlite
              .prepare('SELECT version,invoice_id FROM expense WHERE id=?')
              .get(source.source_id) as { version: number; invoice_id: string | null } | undefined;
            currentVersion = row?.version ?? null;
            linkedInvoiceId = row?.invoice_id ?? null;
          } else if (source.source_type === 'milestone') {
            const row = this.sqlite
              .prepare('SELECT version,invoice_id FROM project_milestone WHERE id=?')
              .get(source.source_id) as { version: number; invoice_id: string | null } | undefined;
            currentVersion = row?.version ?? null;
            linkedInvoiceId = row?.invoice_id ?? null;
          } else if (source.source_type === 'adjustment') {
            const row = this.sqlite
              .prepare('SELECT adjustment_invoice_id FROM invoice_adjustment WHERE id=?')
              .get(source.source_id) as { adjustment_invoice_id: string } | undefined;
            linkedInvoiceId = row?.adjustment_invoice_id ?? null;
            currentVersion = row ? source.source_version : null;
          }
          if (currentVersion !== source.source_version)
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: source.source_type,
              sourceId: source.source_id,
              reason: 'source_version_mismatch',
            });
          if (linkedInvoiceId !== null && linkedInvoiceId !== invoice.invoiceId)
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: source.source_type,
              sourceId: source.source_id,
              reason: 'source_invoice_link_mismatch',
            });
          const intentionallyBlockedByCap =
            manifest?.disposition === 'partially_included' || manifest?.disposition === 'blocked';
          if (
            linkedInvoiceId === null &&
            source.source_type !== 'adjustment' &&
            !intentionallyBlockedByCap
          )
            sourceMismatches.push({
              invoiceId: invoice.invoiceId,
              sourceType: source.source_type,
              sourceId: source.source_id,
              reason: 'source_not_linked',
            });
        }
      }
      const approvedTimeEntryCount = timeRows.length;
      const approvedExpenseCount = expenseRows.length;
      const invoiceRegisterNetByCurrency = amountMap(invoiceNetByCurrency);
      const directCostByCurrencyJson = amountMap(directCostByCurrency);
      const workerCostSourceByCurrency = new Map<V3Currency, bigint>();
      for (const row of workerCosts)
        addAmount(
          workerCostSourceByCurrency,
          row.currency,
          BigInt(row.internalLoadedLaborCostMinor),
        );
      const expenseSourceCostByCurrency = new Map<V3Currency, bigint>();
      for (const row of expenses) {
        if (row.whoPaid === 'client' || row.billingTreatment === 'client_direct') continue;
        addAmount(
          expenseSourceCostByCurrency,
          row.projectCurrency,
          BigInt(row.projectCurrencyAmountMinor),
        );
      }
      const paymentSourceByCurrency = new Map<V3Currency, bigint>();
      for (const payment of paymentRows)
        addAmount(paymentSourceByCurrency, payment.currency, BigInt(payment.amount_minor));
      for (const reversal of paymentReversalRows)
        addAmount(paymentSourceByCurrency, reversal.currency, -BigInt(reversal.amount_minor));
      const mapEquals = (
        left: ReadonlyMap<V3Currency, bigint>,
        right: ReadonlyMap<V3Currency, bigint>,
      ) => {
        const currencies = new Set([...left.keys(), ...right.keys()]);
        return [...currencies].every(
          (currency) => (left.get(currency) ?? 0n) === (right.get(currency) ?? 0n),
        );
      };
      const directCostSourceByCurrency = new Map<V3Currency, bigint>();
      for (const [currency, amount] of workerCostSourceByCurrency)
        addAmount(directCostSourceByCurrency, currency, amount);
      for (const [currency, amount] of expenseSourceCostByCurrency)
        addAmount(directCostSourceByCurrency, currency, amount);
      const contributionByCurrency = new Map<V3Currency, bigint>();
      for (const [currency, amount] of invoiceNetByCurrency)
        contributionByCurrency.set(
          currency,
          amount - (directCostSourceByCurrency.get(currency) ?? 0n),
        );
      const ledgerContributionByCurrency = new Map<V3Currency, bigint>();
      for (const [currency, amount] of invoiceNetByCurrency)
        ledgerContributionByCurrency.set(
          currency,
          amount - (directCostByCurrency.get(currency) ?? 0n),
        );
      const missingCostRuleCount = workerCosts.reduce(
        (sum, row) => sum + row.missingCostRuleCount,
        0,
      );
      const laborCostReconciles =
        missingCostRuleCount === 0 &&
        mapEquals(workerCostSourceByCurrency, internalLaborByCurrency);
      const expenseCostReconciles = mapEquals(expenseSourceCostByCurrency, expenseCostByCurrency);
      const directCostReconciles = mapEquals(directCostSourceByCurrency, directCostByCurrency);
      const paymentReconciles = mapEquals(paymentSourceByCurrency, collectedByCurrency);
      const contributionReconciles = mapEquals(
        contributionByCurrency,
        ledgerContributionByCurrency,
      );
      type AccountingPackSourceItem = {
        id: string;
        itemKind: string;
        sourceId: string;
        itemVersion: number;
        effectiveAt: string;
        evidenceType: string;
        evidenceId: string;
        amountMinor: string | null;
        currency: V3Currency;
        legalEntityId: string | null;
        payload: Record<string, unknown>;
      };
      const sourceItems: AccountingPackSourceItem[] = [];
      const sourceItemKeys = new Set<string>();
      const addSourceItem = (input: {
        itemKind: string;
        sourceId: string;
        itemVersion?: number | null;
        effectiveAt?: string | null;
        amountMinor?: bigint | number | string | null;
        currency: V3Currency;
        legalEntityId?: string | null;
        payload: Record<string, unknown>;
      }): void => {
        const itemVersion = input.itemVersion ?? 1;
        if (!Number.isSafeInteger(itemVersion) || itemVersion < 1)
          throw new V3ConflictError('Accounting Pack source item version is invalid');
        const sourceId = input.sourceId;
        const key = `${input.itemKind}:${sourceId}:${itemVersion}:${input.currency}`;
        if (sourceItemKeys.has(key))
          throw new V3ConflictError(`Duplicate Accounting Pack source item ${key}`);
        sourceItemKeys.add(key);
        const identity = canonicalSha256(
          canonicalJson({
            periodStart,
            periodEnd,
            currency: input.currency,
            itemKind: input.itemKind,
            sourceId,
            itemVersion,
          }),
        ).slice(0, 48);
        const effectiveAt = input.effectiveAt
          ? input.effectiveAt.length === 10
            ? `${input.effectiveAt}T00:00:00.000Z`
            : input.effectiveAt
          : `${periodStart}T00:00:00.000Z`;
        const amountMinor =
          input.amountMinor === null || input.amountMinor === undefined
            ? null
            : typeof input.amountMinor === 'bigint'
              ? input.amountMinor.toString()
              : String(input.amountMinor);
        const evidenceTypeByKind: Readonly<Record<string, string>> = {
          invoice: 'invoice_subject',
          invoice_source: 'invoice_source',
          commercial_manifest: 'observed_invoice_manifest',
          time: 'finance_change_event',
          expense: 'finance_change_event',
          payment: 'payment_record',
          payment_reversal: 'payment_reversal',
          compensation: 'settlement_revision',
          compensation_settlement: 'settlement_revision',
          direct_cost: 'direct_cost_event',
        };
        sourceItems.push({
          id: `accounting-pack-source-${identity}`,
          itemKind: input.itemKind,
          sourceId,
          itemVersion,
          effectiveAt,
          evidenceType: evidenceTypeByKind[input.itemKind] ?? 'source_cut',
          evidenceId: `accounting-pack-source-evidence-${identity}`,
          amountMinor,
          currency: input.currency,
          legalEntityId: input.legalEntityId ?? null,
          payload: input.payload,
        });
      };
      const commercialSourceBusinessDates = new Map<string, string | null>();
      const commercialSourceManifest = [...commercialManifestByInvoice.entries()]
        .flatMap(([invoiceId, rows]) =>
          rows.map((row) => {
            let businessDate: string | null = null;
            if (row.source_type === 'time')
              businessDate =
                (
                  this.sqlite
                    .prepare('SELECT work_date value FROM time_entry WHERE id=?')
                    .get(row.source_id) as { value: string } | undefined
                )?.value ?? null;
            else if (row.source_type === 'expense')
              businessDate =
                (
                  this.sqlite
                    .prepare('SELECT spent_on value FROM expense WHERE id=?')
                    .get(row.source_id) as { value: string } | undefined
                )?.value ?? null;
            else if (row.source_type === 'milestone')
              businessDate =
                (
                  this.sqlite
                    .prepare(
                      'SELECT COALESCE(due_on,approved_at,created_at) value FROM project_milestone WHERE id=?',
                    )
                    .get(row.source_id) as { value: string } | undefined
                )?.value ?? null;
            else if (row.source_type === 'adjustment')
              businessDate =
                (
                  this.sqlite
                    .prepare('SELECT created_at value FROM invoice_adjustment WHERE id=?')
                    .get(row.source_id) as { value: string } | undefined
                )?.value ?? null;
            else if (!['fixed_price', 'minimum_top_up'].includes(row.source_type))
              throw new V3ConflictError(
                `Unsupported commercial manifest source type ${row.source_type}`,
              );
            if (
              businessDate === null &&
              !['fixed_price', 'minimum_top_up'].includes(row.source_type)
            )
              throw new V3ConflictError(
                `Commercial manifest source ${row.source_type}:${row.source_id} has no authoritative business date`,
              );
            commercialSourceBusinessDates.set(
              `${invoiceId}\u0000${row.source_type}\u0000${row.source_id}`,
              businessDate,
            );
            return {
              invoiceId,
              sourceType: row.source_type,
              sourceId: row.source_id,
              sourceVersion: row.source_version,
              disposition: row.disposition,
              originalMinor: row.original_minor === null ? null : String(row.original_minor),
              allocatedMinor: row.allocated_minor === null ? null : String(row.allocated_minor),
              remainingMinor: row.remaining_minor === null ? null : String(row.remaining_minor),
              reasonCode: row.reason_code,
              sourceHash: row.source_hash,
              lockedAt: row.locked_at,
            };
          }),
        )
        .sort(
          (left, right) =>
            left.invoiceId.localeCompare(right.invoiceId) ||
            left.sourceType.localeCompare(right.sourceType) ||
            left.sourceId.localeCompare(right.sourceId),
        );
      for (const row of invoiceRegister)
        addSourceItem({
          itemKind: 'invoice',
          sourceId: row.invoiceId,
          itemVersion: row.version,
          effectiveAt: row.issueDate ?? periodStart,
          amountMinor: row.netMinor,
          currency: row.currency,
          legalEntityId: row.legalEntityId,
          payload: row,
        });
      for (const invoice of ledger) {
        for (const source of invoice.sources)
          addSourceItem({
            itemKind: 'invoice_source',
            sourceId: `${invoice.invoiceId}:${source.source_type}:${source.source_id}`,
            itemVersion: source.source_version,
            // The issued link is immutable, but the source belongs to the
            // accounting cut of its operational business date. Using the
            // invoice issue date here would let a late-issued time/expense
            // migrate between periods and disagree with the manifest item.
            effectiveAt:
              commercialSourceBusinessDates.get(
                `${invoice.invoiceId}\u0000${source.source_type}\u0000${source.source_id}`,
              ) ??
              invoice.issueDate ??
              periodStart,
            amountMinor: source.allocated_net_minor,
            currency: invoice.currency,
            legalEntityId: invoice.legalEntityId,
            payload: { invoiceId: invoice.invoiceId, ...source },
          });
        for (const manifest of commercialManifestByInvoice.get(invoice.invoiceId) ?? [])
          addSourceItem({
            itemKind: 'commercial_manifest',
            sourceId: `${invoice.invoiceId}:${manifest.source_type}:${manifest.source_id}`,
            itemVersion: manifest.source_version,
            effectiveAt:
              commercialSourceBusinessDates.get(
                `${invoice.invoiceId}\u0000${manifest.source_type}\u0000${manifest.source_id}`,
              ) ??
              invoice.issueDate ??
              periodStart,
            amountMinor: manifest.allocated_minor,
            currency: invoice.currency,
            legalEntityId: invoice.legalEntityId,
            payload: {
              invoiceId: invoice.invoiceId,
              sourceType: manifest.source_type,
              sourceId: manifest.source_id,
              sourceVersion: manifest.source_version,
              disposition: manifest.disposition,
              originalMinor: manifest.original_minor,
              allocatedMinor: manifest.allocated_minor,
              remainingMinor: manifest.remaining_minor,
              reasonCode: manifest.reason_code,
              sourceHash: manifest.source_hash,
              lockedAt: manifest.locked_at,
            },
          });
      }
      for (const row of timeRows)
        addSourceItem({
          itemKind: 'time',
          sourceId: row.id,
          itemVersion: row.version,
          effectiveAt: row.work_date,
          amountMinor: null,
          currency: row.project_currency,
          legalEntityId: projectLegalEntityAt(row.project_id, row.work_date),
          payload: row,
        });
      for (const row of expenses)
        addSourceItem({
          itemKind: 'expense',
          sourceId: row.expenseId,
          itemVersion: row.version,
          effectiveAt: row.date,
          amountMinor: row.projectCurrencyAmountMinor,
          currency: row.projectCurrency,
          legalEntityId: projectLegalEntityAt(row.projectId, row.date),
          payload: row,
        });
      for (const payment of paymentRows)
        addSourceItem({
          itemKind: 'payment',
          sourceId: payment.payment_id,
          effectiveAt: payment.received_at,
          amountMinor: payment.amount_minor,
          currency: payment.currency,
          legalEntityId:
            ledger.find((invoice) => invoice.invoiceId === payment.invoice_id)?.legalEntityId ??
            null,
          payload: payment,
        });
      for (const reversal of paymentReversalRows)
        addSourceItem({
          itemKind: 'payment_reversal',
          sourceId: reversal.reversal_id,
          itemVersion: 1,
          effectiveAt: reversal.effective_at,
          amountMinor: reversal.amount_minor,
          currency: reversal.currency,
          legalEntityId:
            ledger.find((invoice) => invoice.invoiceId === reversal.invoice_id)?.legalEntityId ??
            null,
          payload: reversal,
        });
      const workerCostSourceRows = workerCostSegments.length > 0 ? workerCostSegments : workerCosts;
      for (const row of workerCostSourceRows) {
        // A project may change legal entity inside the period.  Carry the
        // effective-date segment in the source identity so each canonical
        // revision can reconcile only the rows belonging to its own scope.
        const aggregateSourceId = `${row.workerId}:${row.projectId}:${row.legalEntityId ?? 'unassigned'}`;
        const legalEntityId = row.legalEntityId;
        addSourceItem({
          itemKind: 'compensation',
          sourceId: aggregateSourceId,
          effectiveAt: periodEnd,
          amountMinor: row.approvedCompensationMinor,
          currency: row.currency,
          legalEntityId,
          payload: row,
        });
        addSourceItem({
          itemKind: 'direct_cost',
          sourceId: `labor:${aggregateSourceId}`,
          effectiveAt: periodEnd,
          amountMinor: row.internalLoadedLaborCostMinor,
          currency: row.currency,
          legalEntityId,
          payload: {
            workerId: row.workerId,
            projectId: row.projectId,
            sourceTimeIds: row.sourceTimeIds,
          },
        });
      }
      for (const row of expenses) {
        if (row.whoPaid === 'client' || row.billingTreatment === 'client_direct') continue;
        addSourceItem({
          itemKind: 'direct_cost',
          sourceId: `expense:${row.expenseId}`,
          effectiveAt: row.date,
          amountMinor: row.projectCurrencyAmountMinor,
          currency: row.projectCurrency,
          legalEntityId: projectLegalEntityAt(row.projectId, row.date),
          payload: {
            expenseId: row.expenseId,
            projectCurrency: row.projectCurrency,
            projectCurrencyAmountMinor: row.projectCurrencyAmountMinor,
            billingTreatment: row.billingTreatment,
          },
        });
      }
      for (const row of settledRows)
        addSourceItem({
          itemKind: 'compensation_settlement',
          sourceId: row.id,
          itemVersion: row.rule_version,
          effectiveAt: row.period_end,
          amountMinor: row.amount,
          currency: row.currency,
          legalEntityId: projectLegalEntityAt(row.project_id, row.period_end),
          payload: row,
        });
      const snapshot = {
        periodStart,
        periodEnd,
        locale: normalizeReportLocale(reportLocale),
        generatedAt: timestamp(),
        invoiceRegister,
        collections,
        workerCosts,
        workerCostSegments,
        expenseRegister: expenses,
        ledger,
        sourceItems,
        commercialSourceManifest,
        totals,
        totalsByCurrency: totalsByAccountingScope,
        sourceReconciliation: {
          invoiceSourceCount,
          commercialManifestCount,
          sourceItemCount: sourceItems.length,
          sourceMismatches,
          approvedTimeEntryCount,
          approvedExpenseCount,
        },
        exactReconciliation: {
          invoiceNetByCurrency: invoiceRegisterNetByCurrency,
          paymentByCurrency: amountMap(paymentSourceByCurrency),
          workerCostByCurrency: amountMap(workerCostSourceByCurrency),
          expenseCostByCurrency: amountMap(expenseSourceCostByCurrency),
          directCostByCurrency: directCostByCurrencyJson,
          contributionByCurrency: amountMap(contributionByCurrency),
          missingCostRuleCount,
        },
      };
      const reconciliation = {
        invoiceRegisterGrossByCurrency: amountMap(invoiceGrossByCurrency),
        invoiceRegisterNetByCurrency,
        directCostByCurrency: directCostByCurrencyJson,
        invoiceSourceCount,
        commercialManifestCount,
        sourceItemCount: sourceItems.length,
        sourceMismatchCount: sourceMismatches.length,
        approvedTimeEntryCount,
        approvedExpenseCount,
        missingCostRuleCount,
        paymentCount: paymentRows.length + paymentReversalRows.length,
        collectedInMonthByCurrency: amountMap(collectedByCurrency),
        workerCostSourceByCurrency: amountMap(workerCostSourceByCurrency),
        expenseCostSourceByCurrency: amountMap(expenseSourceCostByCurrency),
        directCostSourceByCurrency: amountMap(directCostSourceByCurrency),
        contributionByCurrency: amountMap(contributionByCurrency),
        checks: {
          invoiceSources: sourceMismatches.length === 0,
          payments: paymentReconciles,
          workerCosts: laborCostReconciles,
          expenses: expenseCostReconciles,
          directCosts: directCostReconciles,
          contribution: contributionReconciles,
        },
        reconciles:
          sourceMismatches.length === 0 &&
          invoiceSourceCount === ledger.reduce<number>((sum, row) => sum + row.sources.length, 0) &&
          paymentReconciles &&
          laborCostReconciles &&
          expenseCostReconciles &&
          directCostReconciles &&
          contributionReconciles,
      };
      const id = newId();
      const now = timestamp();
      let storedReconciliation: Readonly<Record<string, unknown>> = reconciliation;
      const canonicalRevision = this.createCanonicalAccountingPackMetadata(
        principal,
        snapshot,
        reconciliation,
        periodStart,
        periodEnd,
        now,
        id,
      );
      storedReconciliation = { ...reconciliation, canonicalRevision };
      this.sqlite
        .prepare(
          'INSERT INTO accounting_pack_run(id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,generated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          periodStart,
          periodEnd,
          null,
          'draft',
          JSON.stringify(snapshot),
          JSON.stringify(storedReconciliation),
          principal.userId,
          now,
          now,
        );
      const queued = this.enqueueJob(
        'accounting_pack_artifact_render',
        `accounting-pack:${id}`,
        { packId: id },
        now,
      );
      const job = this.sqlite.prepare('SELECT state FROM job WHERE id=?').get(queued.id) as
        | { state: string }
        | undefined;
      if (job?.state !== 'queued')
        throw new V3ConflictError('Accounting Pack artifact job was not queued');
      this.audit(principal, 'accounting_pack.create', 'accounting_pack_run', id, {
        periodStart,
        periodEnd,
        jobId: queued.id,
      });
      return { id, state: 'queued', snapshot, reconciliation: storedReconciliation };
    });
  }

  markAccountingPackFinal(principal: Principal, packId: string): void {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    this.transaction(() => {
      const pack = this.sqlite
        .prepare(
          'SELECT state,reconciliation_json,period_start,period_end,created_at FROM accounting_pack_run WHERE id=?',
        )
        .get(packId) as
        | {
            state: string;
            reconciliation_json: string;
            period_start: string;
            period_end: string;
            created_at: string;
          }
        | undefined;
      if (!pack) throw new V3ValidationError('Accounting Pack not found');
      if (
        this.accountingPackSourcesChangedSince(pack.period_start, pack.period_end, pack.created_at)
      )
        throw new V3ConflictError(
          'Accounting Pack source changed; create a current revision before finalization',
        );
      const reconciliation = parseJsonRecord(pack.reconciliation_json);
      if (reconciliation.reconciles !== true)
        throw new V3ConflictError('Accounting Pack reconciliation is blocked');
      const canonical =
        reconciliation.canonicalRevision && typeof reconciliation.canonicalRevision === 'object'
          ? (reconciliation.canonicalRevision as Record<string, unknown>)
          : undefined;
      const revisions = Array.isArray(canonical?.revisions)
        ? (canonical.revisions as Array<Record<string, unknown>>)
        : [];
      if (canonical?.status !== 'current' || revisions.length === 0)
        throw new V3ConflictError(
          'Accounting Pack requires a successful current canonical revision',
        );
      for (const revision of revisions) {
        const revisionId = typeof revision.revisionId === 'string' ? revision.revisionId : '';
        const current = this.sqlite
          .prepare(
            `SELECT r.status,r.reconciliation_status,r.blocker_count,s.tail_revision_id,
                    EXISTS(SELECT 1 FROM accounting_pack_revision_snapshot snap
                           WHERE snap.revision_id=r.revision_id) has_snapshot
             FROM accounting_pack_revision r
             JOIN accounting_pack_series s ON s.series_id=r.series_id
             WHERE r.revision_id=?`,
          )
          .get(revisionId) as
          | {
              status: string;
              reconciliation_status: string;
              blocker_count: number;
              tail_revision_id: string | null;
              has_snapshot: number;
            }
          | undefined;
        if (
          !current ||
          current.status !== 'candidate' ||
          current.reconciliation_status !== 'CLEAN' ||
          current.blocker_count !== 0 ||
          current.tail_revision_id !== revisionId ||
          current.has_snapshot !== 1
        )
          throw new V3ConflictError(
            'Accounting Pack requires a successful current canonical revision',
          );
      }
      const job = this.latestAccountingPackJob(packId);
      if (job?.state === 'queued' || job?.state === 'claimed' || job?.state === 'running')
        throw new V3ConflictError('Accounting Pack artifacts are still processing');
      const readyRows = this.sqlite
        .prepare(
          `SELECT DISTINCT export_type
           FROM accounting_pack_export
           WHERE pack_run_id=? AND byte_length>0 AND length(sha256)=64`,
        )
        .all(packId) as Array<{ export_type: AccountingPackExportType }>;
      const ready = new Set(readyRows.map((row) => row.export_type));
      const required = [
        ...requiredAccountingPackExportTypes,
        ...(process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF === 'true' ? (['pdf'] as const) : []),
        ...(process.env.JA_ACCOUNTING_PACK_REQUIRE_JSON === 'true' ? (['json'] as const) : []),
      ];
      const missing = required.filter((format) => !ready.has(format));
      if (missing.length > 0)
        throw new V3ConflictError(
          `Accounting Pack required exports are not ready: ${missing.join(', ')}`,
        );
      const result = this.sqlite
        .prepare(
          "UPDATE accounting_pack_run SET state='final',updated_at=? WHERE id=? AND state IN ('draft','review','failed')",
        )
        .run(timestamp(), packId);
      if (result.changes !== 1) throw new V3ConflictError('Accounting Pack is not reviewable');
      this.audit(principal, 'accounting_pack.finalize', 'accounting_pack_run', packId, {});
    });
  }

  private latestAccountingPackJob(packId: string): { id: string; state: string } | undefined {
    return this.sqlite
      .prepare(
        `SELECT id,state
         FROM job
         WHERE kind='accounting_pack_artifact_render'
           AND json_valid(payload_json)
           AND json_extract(payload_json,'$.packId')=?
         ORDER BY created_at DESC,id DESC
         LIMIT 1`,
      )
      .get(packId) as { id: string; state: string } | undefined;
  }

  /**
   * Queue one controlled retry for a terminal failed Accounting Pack format.
   * Ready sibling formats are deliberately outside the retry payload and remain immutable.
   */
  retryAccountingPackExport(
    principal: Principal,
    packId: string,
    exportType: AccountingPackExportType,
    idempotencyKey: string,
  ): { jobId: string; created: boolean; state: string } {
    this.assertFinance(principal);
    this.assertStepUp(principal);
    if (!accountingPackExportTypes.includes(exportType))
      throw new V3ValidationError('Accounting Pack export type is invalid');
    const cleanKey = requireText(idempotencyKey, 'Retry idempotency key');
    if (cleanKey.length > 200) throw new V3ValidationError('Retry idempotency key is too long');
    const durableKey = `accounting-pack-retry:${packId}:${exportType}:${createHash('sha256')
      .update(cleanKey)
      .digest('hex')}`;
    const existingRetry = this.sqlite
      .prepare('SELECT id,state FROM job WHERE idempotency_key=?')
      .get(durableKey) as { id: string; state: string } | undefined;
    if (existingRetry)
      return { jobId: existingRetry.id, created: false, state: existingRetry.state };

    return this.transaction(() => {
      const pack = this.sqlite
        .prepare('SELECT state,reconciliation_json FROM accounting_pack_run WHERE id=?')
        .get(packId) as { state: string; reconciliation_json: string } | undefined;
      if (!pack) throw new V3ValidationError('Accounting Pack not found');
      if (pack.state === 'final') throw new V3ConflictError('Final Accounting Pack is immutable');
      const ready = this.sqlite
        .prepare(
          'SELECT 1 FROM accounting_pack_export WHERE pack_run_id=? AND export_type=? AND byte_length>0 AND length(sha256)=64',
        )
        .get(packId, exportType);
      if (ready) throw new V3ConflictError('Accounting Pack export is already ready');
      const reconciliation = parseJsonRecord(pack.reconciliation_json);
      const failures =
        reconciliation._artifactFailures && typeof reconciliation._artifactFailures === 'object'
          ? (reconciliation._artifactFailures as Record<string, unknown>)
          : {};
      const latest = this.latestAccountingPackJob(packId);
      if (!failures[exportType] || !latest || !['dead_letter', 'succeeded'].includes(latest.state))
        throw new V3ConflictError('Accounting Pack export is not terminal and retryable');
      const priorRetries = this.sqlite
        .prepare(
          `SELECT COUNT(*) count FROM job
           WHERE kind='accounting_pack_artifact_render'
             AND json_valid(payload_json)
             AND json_extract(payload_json,'$.packId')=?
             AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.formats') f WHERE f.value=?)`,
        )
        .get(packId, exportType) as { count: number };
      if (priorRetries.count >= 5)
        throw new V3ConflictError('Accounting Pack export retry limit reached');
      const queued = this.enqueueJob(
        'accounting_pack_artifact_render',
        durableKey,
        { packId, formats: [exportType] },
        timestamp(),
      );
      this.audit(principal, 'accounting_pack.export_retry', 'accounting_pack_run', packId, {
        exportType,
        retryJobId: queued.id,
        retryRequested: true,
      });
      return { jobId: queued.id, created: queued.created, state: 'queued' };
    });
  }

  listAccountingPacks(principal: Principal) {
    this.assertFinanceReadable(principal);
    const rows = this.sqlite
      .prepare(
        `SELECT apr.id,apr.period_start,apr.period_end,
                apr.state raw_state,
                (SELECT aj.state FROM job aj WHERE aj.kind='accounting_pack_artifact_render'
                   AND json_valid(aj.payload_json)
                   AND json_extract(aj.payload_json,'$.packId')=apr.id
                   ORDER BY aj.created_at DESC,aj.id DESC LIMIT 1) job_state,
                apr.reconciliation_json,apr.created_at,apr.updated_at,
                COALESCE(GROUP_CONCAT(ape.export_type), '') export_types,
                COALESCE(SUM(CASE WHEN ape.export_type IN ('xlsx','invoice_csv','expense_csv')
                                      AND ape.byte_length>0 AND length(ape.sha256)=64
                                 THEN 1 ELSE 0 END),0) ready_required_count
         FROM accounting_pack_run apr
         LEFT JOIN accounting_pack_export ape ON ape.pack_run_id=apr.id
         GROUP BY apr.id
         ORDER BY apr.period_start DESC LIMIT 24`,
      )
      .all() as Array<{
      id: string;
      period_start: string;
      period_end: string;
      raw_state: string;
      job_state: string | null;
      reconciliation_json: string;
      created_at: string;
      updated_at: string;
      export_types: string;
      ready_required_count: number;
    }>;
    return rows.map((row) => {
      const ready = new Set(row.export_types.split(',').filter(Boolean));
      const reconciliation = parseJsonRecord(row.reconciliation_json);
      const failures =
        reconciliation._artifactFailures && typeof reconciliation._artifactFailures === 'object'
          ? (reconciliation._artifactFailures as Record<string, unknown>)
          : {};
      const statuses = Object.fromEntries(
        accountingPackExportTypes.map((type) => [
          type,
          ready.has(type)
            ? 'ready'
            : failures[type]
              ? 'failed'
              : row.job_state === 'dead_letter'
                ? 'failed'
                : row.job_state === 'claimed' || row.job_state === 'running'
                  ? 'running'
                  : row.job_state === 'queued'
                    ? 'queued'
                    : 'pending',
        ]),
      );
      const lifecycleState =
        row.raw_state === 'final'
          ? 'final'
          : row.job_state === 'claimed' || row.job_state === 'running'
            ? 'running'
            : row.job_state === 'queued'
              ? 'queued'
              : row.job_state === 'dead_letter'
                ? 'failed'
                : row.ready_required_count === requiredAccountingPackExportTypes.length
                  ? 'ready'
                  : row.raw_state;
      const sourceStale = this.accountingPackSourcesChangedSince(
        row.period_start,
        row.period_end,
        row.created_at,
      );
      return {
        id: row.id,
        period_start: row.period_start,
        period_end: row.period_end,
        state: sourceStale && row.raw_state !== 'final' ? 'stale' : lifecycleState,
        sourceStale,
        reconciliation_json: row.reconciliation_json,
        created_at: row.created_at,
        updated_at: row.updated_at,
        export_types: row.export_types,
        export_statuses: JSON.stringify(statuses),
        exportStatuses: statuses,
      };
    });
  }

  invoiceSnapshot(principal: Principal, invoiceId: string): Readonly<Record<string, unknown>> {
    this.assertFinanceReadable(principal);
    return this.invoiceSnapshotCore(invoiceId);
  }

  /**
   * Read the immutable invoice snapshot for the currently claimed invoice-PDF job.
   *
   * The proof is checked in the same transaction as the read so a revoked actor, stale
   * lease, or changed payload cannot be used to render a private artifact.
   */
  invoiceSnapshotFromJob(
    invoiceId: string,
    execution: FencedJobExecution,
  ): Readonly<Record<string, unknown>> {
    return this.transaction(() => {
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'invoice_pdf',
        capability: 'artifact.invoice.render',
        payloadTarget: { invoiceId },
      });
      return this.invoiceSnapshotCore(invoiceId);
    });
  }

  private invoiceSnapshotCore(invoiceId: string): Readonly<Record<string, unknown>> {
    const invoice = this.sqlite
      .prepare('SELECT id,state,snapshot_json FROM invoice WHERE id=?')
      .get(invoiceId) as { id: string; state: string; snapshot_json: string | null } | undefined;
    if (
      !invoice ||
      !invoice.snapshot_json ||
      !['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'credited'].includes(
        invoice.state,
      )
    )
      throw new V3ValidationError('Issued invoice snapshot required');
    return JSON.parse(invoice.snapshot_json) as Readonly<Record<string, unknown>>;
  }

  accountingPackSnapshot(principal: Principal, packId: string): Readonly<Record<string, unknown>> {
    this.assertFinanceReadable(principal);
    return this.accountingPackSnapshotCore(packId);
  }

  accountingPackSnapshotFromJob(
    packId: string,
    execution: FencedJobExecution,
  ): Readonly<Record<string, unknown>> {
    return this.transaction(() => {
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'accounting_pack_artifact_render',
        capability: 'artifact.accounting_pack.render',
        payloadTarget: { packId },
      });
      return this.accountingPackSnapshotCore(packId);
    });
  }

  private accountingPackSnapshotCore(packId: string): Readonly<Record<string, unknown>> {
    const pack = this.sqlite
      .prepare('SELECT snapshot_json FROM accounting_pack_run WHERE id=?')
      .get(packId) as { snapshot_json: string } | undefined;
    if (!pack) throw new V3ValidationError('Accounting Pack not found');
    return JSON.parse(pack.snapshot_json) as Readonly<Record<string, unknown>>;
  }

  recordInvoicePdf(
    principal: Principal,
    invoiceId: string,
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
  ): void {
    this.assertFinance(principal);
    this.assertStorageKey(storageKey);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
      throw new V3ValidationError('Invoice PDF metadata is invalid');
    this.recordInvoicePdfCore(invoiceId, storageKey, sha256, byteLength);
    this.audit(principal, 'invoice.pdf_ready', 'invoice', invoiceId, {
      storageKey,
      sha256,
      byteLength,
    });
  }

  /** Persist an invoice PDF from a fenced invoice-PDF execution without a user principal. */
  recordInvoicePdfFromJob(
    invoiceId: string,
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
    execution: FencedJobExecution,
  ): void {
    this.transaction(() => {
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'invoice_pdf',
        capability: 'artifact.invoice.render',
        payloadTarget: { invoiceId },
      });
      this.assertStorageKey(storageKey);
      if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
        throw new V3ValidationError('Invoice PDF metadata is invalid');
      this.recordInvoicePdfCore(invoiceId, storageKey, sha256, byteLength);
    });
  }

  private recordInvoicePdfCore(
    invoiceId: string,
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
  ): void {
    const result = this.sqlite
      .prepare(
        "UPDATE invoice SET pdf_status='ready',pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,pdf_generated_at=?,updated_at=? WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue','void','credited') AND (pdf_sha256 IS NULL OR pdf_sha256=?)",
      )
      .run(storageKey, sha256, byteLength, timestamp(), timestamp(), invoiceId, sha256);
    if (result.changes !== 1) {
      const existing = this.sqlite
        .prepare('SELECT pdf_sha256 FROM invoice WHERE id=?')
        .get(invoiceId) as { pdf_sha256: string | null } | undefined;
      if (!existing || existing.pdf_sha256 !== sha256)
        throw new V3ConflictError('Invoice PDF is already finalized with another hash');
    }
  }

  recordAccountingPackExport(
    principal: Principal,
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
  ): { id: string; created: boolean } {
    this.assertFinance(principal);
    this.assertStorageKey(storageKey);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
      throw new V3ValidationError('Accounting Pack export metadata is invalid');
    const result = this.recordAccountingPackExportCore(
      packId,
      exportType,
      storageKey,
      sha256,
      byteLength,
    );
    if (result.created)
      this.audit(principal, 'accounting_pack.export', 'accounting_pack_run', packId, {
        exportType,
        storageKey,
        sha256,
        byteLength,
      });
    return result;
  }

  recordAccountingPackExportFromJob(
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
    execution: FencedJobExecution,
  ): { id: string; created: boolean } {
    return this.transaction(() => {
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'accounting_pack_artifact_render',
        capability: 'artifact.accounting_pack.render',
        payloadTarget: { packId },
      });
      this.assertStorageKey(storageKey);
      if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength <= 0)
        throw new V3ValidationError('Accounting Pack export metadata is invalid');
      return this.recordAccountingPackExportCore(
        packId,
        exportType,
        storageKey,
        sha256,
        byteLength,
      );
    });
  }

  private recordAccountingPackExportCore(
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    storageKey: SafeStorageKey,
    sha256: string,
    byteLength: number,
  ): { id: string; created: boolean } {
    const existing = this.sqlite
      .prepare('SELECT id,sha256 FROM accounting_pack_export WHERE pack_run_id=? AND export_type=?')
      .get(packId, exportType) as { id: string; sha256: string } | undefined;
    if (existing) {
      if (existing.sha256 !== sha256)
        throw new V3ConflictError('Accounting Pack export already exists');
      this.clearAccountingPackExportFailure(packId, exportType);
      return { id: existing.id, created: false };
    }
    const pack = this.sqlite
      .prepare('SELECT id,state FROM accounting_pack_run WHERE id=?')
      .get(packId) as { id: string; state: string } | undefined;
    if (!pack) throw new V3ValidationError('Accounting Pack not found');
    if (pack.state === 'final') throw new V3ConflictError('Final Accounting Pack is immutable');
    const id = newId();
    this.sqlite
      .prepare(
        'INSERT INTO accounting_pack_export(id,pack_run_id,export_type,storage_key,sha256,byte_length,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, packId, exportType, storageKey, sha256, byteLength, timestamp());
    this.clearAccountingPackExportFailure(packId, exportType);
    return { id, created: true };
  }

  /** Persist a failed format without fabricating a downloadable artifact. */
  recordAccountingPackExportFailure(
    principal: Principal,
    packId: string,
    exportType: AccountingPackExportType,
    error: string,
  ): void {
    this.assertFinance(principal);
    this.recordAccountingPackExportFailureCore(packId, exportType, error);
    this.audit(principal, 'accounting_pack.export_failed', 'accounting_pack_run', packId, {
      exportType,
      error: error.trim().slice(0, 500) || 'Artifact generation failed',
    });
  }

  recordAccountingPackExportFailureFromJob(
    packId: string,
    exportType: AccountingPackExportType,
    error: string,
    execution: FencedJobExecution,
  ): void {
    this.transaction(() => {
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'accounting_pack_artifact_render',
        capability: 'artifact.accounting_pack.render',
        payloadTarget: { packId },
      });
      this.recordAccountingPackExportFailureCore(packId, exportType, error);
    });
  }

  private recordAccountingPackExportFailureCore(
    packId: string,
    exportType: AccountingPackExportType,
    error: string,
  ): void {
    const pack = this.sqlite
      .prepare('SELECT state,reconciliation_json FROM accounting_pack_run WHERE id=?')
      .get(packId) as { state: string; reconciliation_json: string } | undefined;
    if (!pack) throw new V3ValidationError('Accounting Pack not found');
    if (pack.state === 'final') throw new V3ConflictError('Final Accounting Pack is immutable');
    const reconciliation = parseJsonRecord(pack.reconciliation_json);
    const failures =
      reconciliation._artifactFailures && typeof reconciliation._artifactFailures === 'object'
        ? { ...(reconciliation._artifactFailures as Record<string, unknown>) }
        : {};
    failures[exportType] = {
      state: 'failed',
      error: error.trim().slice(0, 500) || 'Artifact generation failed',
      recordedAt: timestamp(),
    };
    reconciliation._artifactFailures = failures;
    this.sqlite
      .prepare(
        "UPDATE accounting_pack_run SET reconciliation_json=?,state=CASE WHEN state='final' THEN state ELSE 'failed' END,updated_at=? WHERE id=?",
      )
      .run(JSON.stringify(reconciliation), timestamp(), packId);
  }

  private clearAccountingPackExportFailure(
    packId: string,
    exportType: AccountingPackExportType,
  ): void {
    const pack = this.sqlite
      .prepare('SELECT reconciliation_json,state FROM accounting_pack_run WHERE id=?')
      .get(packId) as { reconciliation_json: string; state: string } | undefined;
    if (!pack) return;
    const reconciliation = parseJsonRecord(pack.reconciliation_json);
    const failures =
      reconciliation._artifactFailures && typeof reconciliation._artifactFailures === 'object'
        ? { ...(reconciliation._artifactFailures as Record<string, unknown>) }
        : {};
    if (!(exportType in failures)) return;
    delete failures[exportType];
    if (Object.keys(failures).length > 0) reconciliation._artifactFailures = failures;
    else delete reconciliation._artifactFailures;
    this.sqlite
      .prepare(
        "UPDATE accounting_pack_run SET reconciliation_json=?,state=CASE WHEN state='failed' THEN 'draft' ELSE state END,updated_at=? WHERE id=?",
      )
      .run(JSON.stringify(reconciliation), timestamp(), packId);
  }

  accountingPackExport(
    principal: Principal,
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    recoverStale = true,
  ): {
    storageKey: SafeStorageKey;
    sha256: string;
    byteLength: number;
    mediaType: string;
    filename: string;
  } {
    this.assertFinance(principal);
    const packStatus = this.sqlite
      .prepare(
        `SELECT apr.state,apr.reconciliation_json,apr.period_start,apr.period_end,apr.created_at,
                apr.snapshot_json,
                (SELECT j.state FROM job j WHERE j.kind='accounting_pack_artifact_render'
                  AND json_valid(j.payload_json)
                  AND json_extract(j.payload_json,'$.packId')=apr.id
                  ORDER BY j.created_at DESC,j.id DESC LIMIT 1) job_state
         FROM accounting_pack_run apr WHERE apr.id=?`,
      )
      .get(packId) as
      | {
          state: string;
          reconciliation_json: string;
          period_start: string;
          period_end: string;
          created_at: string;
          snapshot_json: string;
          job_state: string | null;
        }
      | undefined;
    if (!packStatus) throw new V3ValidationError('Accounting Pack not found');
    if (
      recoverStale &&
      packStatus.state !== 'final' &&
      this.accountingPackSourcesChangedSince(
        packStatus.period_start,
        packStatus.period_end,
        packStatus.created_at,
      )
    ) {
      // Stale non-final bytes stay immutable. Download recovers by creating the
      // current period revision once, then serving that revision's artifacts.
      let snapshotLocale: unknown;
      try {
        snapshotLocale = (JSON.parse(packStatus.snapshot_json) as { locale?: unknown }).locale;
      } catch {
        snapshotLocale = undefined;
      }
      const refreshed = this.createAccountingPack(
        principal,
        packStatus.period_start,
        packStatus.period_end,
        normalizeReportLocale(snapshotLocale),
      );
      if (refreshed.id !== packId)
        return this.accountingPackExport(principal, refreshed.id, exportType, false);
      throw new V3ConflictError(`Accounting Pack ${exportType} export is not ready`);
    }
    const reconciliation = parseJsonRecord(packStatus.reconciliation_json);
    const failures =
      reconciliation._artifactFailures && typeof reconciliation._artifactFailures === 'object'
        ? (reconciliation._artifactFailures as Record<string, unknown>)
        : {};
    if (failures[exportType])
      throw new V3ConflictError(`Accounting Pack ${exportType} export failed; retry required`);
    const row = this.sqlite
      .prepare(
        `SELECT ape.storage_key,ape.sha256,ape.byte_length,apr.period_start,apr.period_end
         FROM accounting_pack_export ape JOIN accounting_pack_run apr ON apr.id=ape.pack_run_id
         WHERE ape.pack_run_id=? AND ape.export_type=?`,
      )
      .get(packId, exportType) as
      | {
          storage_key: string;
          sha256: string;
          byte_length: number;
          period_start: string;
          period_end: string;
        }
      | undefined;
    if (!row) {
      if (
        packStatus.job_state === 'queued' ||
        packStatus.job_state === 'claimed' ||
        packStatus.job_state === 'running'
      )
        throw new V3ConflictError(`Accounting Pack ${exportType} export is not ready`);
      if (packStatus.job_state === 'dead_letter')
        throw new V3ConflictError(`Accounting Pack ${exportType} export failed; retry required`);
      throw new V3ValidationError('Accounting Pack export not found');
    }
    // The aggregate job state describes the pack as a whole. A renderer may
    // fail for one format after other formats have been committed, so only the
    // requested row's artifact metadata can authorize its download.
    if (
      !Number.isSafeInteger(row.byte_length) ||
      row.byte_length <= 0 ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      throw new V3ConflictError(`Accounting Pack ${exportType} export is not ready`);
    this.assertStorageKey(row.storage_key);
    const extension =
      exportType === 'pdf'
        ? 'pdf'
        : exportType === 'xlsx'
          ? 'xlsx'
          : exportType === 'json'
            ? 'json'
            : 'csv';
    const mediaType =
      exportType === 'pdf'
        ? 'application/pdf'
        : exportType === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : exportType === 'json'
            ? 'application/json; charset=utf-8'
            : 'text/csv; charset=utf-8';
    return {
      storageKey: row.storage_key,
      sha256: row.sha256,
      byteLength: row.byte_length,
      mediaType,
      filename: `accounting-pack-${row.period_start}-${row.period_end}-${exportType}.${extension}`,
    };
  }

  invoicePdfMetadata(
    principal: Principal,
    invoiceId: string,
  ): {
    storageKey: SafeStorageKey;
    sha256: string;
    byteLength?: number;
    mediaType: string;
    filename: string;
  } {
    this.assertFinanceReadable(principal);
    const row = this.sqlite
      .prepare(
        "SELECT invoice_number,pdf_storage_key,pdf_sha256,pdf_byte_length FROM invoice WHERE id=? AND pdf_status='ready'",
      )
      .get(invoiceId) as
      | {
          invoice_number: string | null;
          pdf_storage_key: string | null;
          pdf_sha256: string | null;
          pdf_byte_length: number | null;
        }
      | undefined;
    if (!row?.pdf_storage_key || !row.pdf_sha256)
      throw new V3ValidationError('Invoice PDF is not ready');
    this.assertStorageKey(row.pdf_storage_key);
    return {
      storageKey: row.pdf_storage_key,
      sha256: row.pdf_sha256,
      byteLength: row.pdf_byte_length ?? undefined,
      mediaType: 'application/pdf',
      filename: `${row.invoice_number ?? invoiceId}.pdf`,
    };
  }

  private assertStorageKey(storageKey: SafeStorageKey): void {
    assertSafeStorageKey(storageKey, () => new V3ValidationError('Unsafe storage key'));
  }

  deleteDocument(principal: Principal, documentId: string): { storageKey: SafeStorageKey } {
    this.assertActive(principal);
    const document = this.sqlite
      .prepare(
        'SELECT id, project_id, owner_id, state, scan_status, storage_key FROM document WHERE id=?',
      )
      .get(documentId) as
      | {
          id: string;
          project_id: string | null;
          owner_id: string;
          state: string;
          scan_status: string | null;
          storage_key: string;
        }
      | undefined;
    if (!document) throw new V3NotFoundError('Document not found');

    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin') {
      if (!document.project_id) {
        if (document.owner_id !== principal.userId) throw new V3AccessDeniedError('Access denied');
      } else {
        this.assertProjectAccess(principal, document.project_id);
        if (principal.role !== 'project_manager' && document.owner_id !== principal.userId)
          throw new V3AccessDeniedError('Access denied');
      }
    }

    this.assertStorageKey(document.storage_key);
    const deletable =
      document.state === 'temporary' ||
      (document.state === 'rejected' && document.scan_status === 'rejected');
    if (!deletable)
      throw new V3ConflictError(
        'Committed or traceable documents are immutable; archive or supersede the document instead',
      );

    const references = this.sqlite
      .prepare(
        `SELECT
           EXISTS(SELECT 1 FROM expense WHERE receipt_document_id=?) AS expense_reference,
           EXISTS(SELECT 1 FROM document child WHERE child.supersedes_id=?) AS successor_reference,
           EXISTS(SELECT 1 FROM document_access_event WHERE document_id=?) AS access_reference,
           EXISTS(
             SELECT 1 FROM project_closeout
             WHERE document_manifest_json LIKE '%' || ? || '%'
           ) AS closeout_reference`,
      )
      .get(documentId, documentId, documentId, documentId) as {
      expense_reference: number;
      successor_reference: number;
      access_reference: number;
      closeout_reference: number;
    };
    if (
      references.expense_reference ||
      references.successor_reference ||
      references.access_reference ||
      references.closeout_reference
    )
      throw new V3ConflictError(
        'Document is referenced by traceable history and cannot be deleted',
      );

    return this.transaction(() => {
      const result = this.sqlite
        .prepare("DELETE FROM document WHERE id=? AND state IN ('temporary','rejected')")
        .run(documentId);
      if (result.changes !== 1)
        throw new V3ConflictError('Document changed before the deletion could be completed');
      this.audit(principal, 'document.delete', 'document', documentId, {
        previousState: document.state,
        storageKey: document.storage_key,
      });
      return { storageKey: document.storage_key };
    });
  }

  authorizeDocument(
    principal: Principal,
    documentId: string,
  ): {
    storageKey: SafeStorageKey;
    filename: string;
    mediaType: string;
    sensitive: boolean;
    sha256: string;
    byteLength: number;
  } {
    this.assertActive(principal);
    const document = this.sqlite
      .prepare(
        'SELECT id,project_id,owner_id,storage_key,media_type,original_filename,safe_filename,sensitivity,sensitive,sha256,byte_length,state,scan_status FROM document WHERE id=?',
      )
      .get(documentId) as
      | {
          id: string;
          project_id: string | null;
          owner_id: string;
          storage_key: string;
          media_type: string;
          original_filename: string | null;
          safe_filename: string | null;
          sensitivity: string;
          sensitive: number;
          sha256: string;
          byte_length: number;
          state: string;
          scan_status: string;
        }
      | undefined;
    const scannerRequired = malwareScannerRequired();
    if (
      !document ||
      document.state !== 'committed' ||
      !scannerStatusAllowsPrivateDownload(document.scan_status, scannerRequired)
    )
      throw new V3ValidationError('Document not found');
    this.assertStorageKey(document.storage_key);
    let allowed =
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only';
    if (!allowed && document.project_id === null) allowed = document.owner_id === principal.userId;
    if (!allowed && document.project_id !== null) {
      try {
        this.assertProjectAccess(principal, document.project_id, true);
        allowed =
          principal.role === 'project_manager' ||
          (principal.role === 'worker' && document.owner_id === principal.userId);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) throw new V3AccessDeniedError('Document access denied');
    const sensitive = document.sensitive === 1 || document.sensitivity !== 'public';
    this.sqlite
      .prepare(
        'INSERT INTO document_access_event(id,document_id,user_id,action,occurred_at) VALUES(?,?,?,?,?)',
      )
      .run(newId(), document.id, principal.userId, 'download', timestamp());
    this.audit(principal, 'document.download', 'document', document.id, { sensitive });
    return {
      storageKey: document.storage_key,
      filename: document.safe_filename ?? document.original_filename ?? 'document',
      mediaType: document.media_type,
      sensitive,
      sha256: document.sha256,
      byteLength: document.byte_length,
    };
  }

  recordDocumentScanFromJob(
    documentId: string,
    result: 'clean' | 'rejected',
    provider: string,
    execution: DocumentScanExecutionProof,
  ): void {
    if (result !== 'clean' && result !== 'rejected')
      throw new V3ValidationError('Document scan result is invalid');
    if (!provider.trim() || provider.length > 120)
      throw new V3ValidationError('Scan provider is invalid');
    const configuredProvider = process.env.JA_MALWARE_SCANNER_PROVIDER?.trim();
    const providerIsConfigured = configuredProvider
      ? provider.trim() === configuredProvider
      : provider.trim() === 'test-scanner' &&
        (process.env.VITEST === 'true' || Boolean(process.env.VITEST_WORKER_ID));
    if (!providerIsConfigured)
      throw new V3AccessDeniedError('Scan provider is not an authorized configured service');
    this.transaction(() => {
      assertFencedJobExecution(this.sqlite, execution, {
        kind: 'document_scan',
        capability: 'document.scan',
        payloadTarget: { documentId },
      });

      const current = this.sqlite
        .prepare('SELECT scan_status FROM document WHERE id=?')
        .get(documentId) as { scan_status: string } | undefined;
      if (!current) throw new V3ValidationError('Document not found');
      if (current.scan_status === result) return;
      if (current.scan_status !== 'pending' && current.scan_status !== 'not_scanned')
        throw new V3ConflictError('Document scan is already finalized');

      const state = result === 'clean' ? 'committed' : 'rejected';
      const changedAt = timestamp();
      const updated = this.sqlite
        .prepare(
          "UPDATE document SET scan_status=?,scanned_at=?,scan_provider=?,state=?,updated_at=?,version=version+1 WHERE id=? AND scan_status IN ('pending','not_scanned')",
        )
        .run(result, changedAt, provider.trim(), state, changedAt, documentId);
      if (updated.changes !== 1)
        throw new V3ConflictError('Document scan changed while finalizing');
    });
  }

  private createOfflineDraft(
    principal: Principal,
    mutation: Readonly<{ entityType: string; entityId: string; payload: Record<string, unknown> }>,
  ): Readonly<{ outcome: 'accepted'; version: 1 }> {
    const timestampValue = timestamp();
    if (mutation.entityType === 'time') {
      const parsed = timeInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline time draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.workDate);
      const assignment = this.sqlite
        .prepare('SELECT p.timezone FROM project p WHERE p.id=?')
        .get(input.projectId) as { timezone: string } | undefined;
      if (!assignment) throw new V3ValidationError('Project not found');
      this.sqlite
        .prepare(
          'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,activity_code,minutes,project_timezone,activity_summary,approval_state,billability_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.workDate,
          input.category,
          input.activityCode ?? null,
          input.minutes,
          assignment.timezone,
          input.summary,
          'draft',
          'pending',
          timestampValue,
          timestampValue,
        );
      this.audit(principal, 'time.create_offline', 'time_entry', mutation.entityId, {
        projectId: input.projectId,
        minutes: input.minutes,
      });
    } else if (mutation.entityType === 'daily_report') {
      const parsed = dailyReportInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline daily report draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.workDate);
      this.sqlite
        .prepare(
          'INSERT INTO daily_report(id,project_id,worker_id,work_date,site_shift,summary,tasks_completed,problems_found,corrective_actions,client_decisions,downtime_minutes,standby_reason,blockers,open_items,next_day_plan,safety_related,customer_contact,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.workDate,
          input.siteShift ?? null,
          input.summary,
          input.tasksCompleted,
          input.problemsFound ?? null,
          input.correctiveActions ?? null,
          input.clientDecisions ?? null,
          input.downtimeMinutes,
          input.standbyReason ?? null,
          input.blockers ?? null,
          input.openItems ?? null,
          input.nextDayPlan ?? null,
          input.safetyRelated ? 1 : 0,
          input.customerContact ?? null,
          'draft',
          timestampValue,
          timestampValue,
        );
      this.audit(principal, 'daily_report.create_offline', 'daily_report', mutation.entityId, {
        projectId: input.projectId,
        workDate: input.workDate,
      });
    } else if (mutation.entityType === 'technical_report') {
      const parsed = technicalReportInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline technical report draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.reportDate);
      this.sqlite
        .prepare(
          'INSERT INTO technical_report(id,project_id,author_id,system_name,plant_site,area_line,station_machine,system_type,plc_platform,controller,hmi_scada,network_protocol,software_version,program_reference,change_summary,safety_related,production_impact,validation,validation_result,open_risk,rollback_plan,report_date,report_date_provenance,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.systemName,
          input.plantSite ?? null,
          input.areaLine ?? null,
          input.stationMachine ?? null,
          input.systemType ?? null,
          input.plcPlatform ?? null,
          input.controller ?? null,
          input.hmiScada ?? null,
          input.networkProtocol ?? null,
          input.softwareVersion ?? null,
          input.programReference ?? null,
          input.changeSummary,
          input.safetyRelated ? 1 : 0,
          input.productionImpact ?? null,
          input.validation ?? null,
          input.validationResult ?? null,
          input.openRisk ?? null,
          input.rollbackPlan ?? null,
          input.reportDate,
          'native',
          'draft',
          timestampValue,
          timestampValue,
        );
      this.audit(
        principal,
        'technical_report.create_offline',
        'technical_report',
        mutation.entityId,
        { projectId: input.projectId, safetyRelated: input.safetyRelated },
      );
    } else if (mutation.entityType === 'expense') {
      const parsed = expenseInputSchema.safeParse(mutation.payload);
      if (!parsed.success) throw new V3ValidationError('Invalid offline expense draft');
      const input = parsed.data;
      this.assertOfflineAssignment(principal, input.projectId, input.spentOn);
      const project = this.sqlite
        .prepare('SELECT currency FROM project WHERE id=?')
        .get(input.projectId) as { currency: V3Currency } | undefined;
      if (!project) throw new V3ValidationError('Project not found');
      if (input.amountMinor <= 0n) throw new V3ValidationError('Expense amount must be positive');
      if (input.receiptRequired && !input.receiptDocumentId)
        throw new V3ValidationError('A committed receipt is required');
      if (input.receiptDocumentId) {
        const receipt = this.sqlite
          .prepare(
            "SELECT project_id FROM document WHERE id=? AND owner_id=? AND state='committed'",
          )
          .get(input.receiptDocumentId, principal.userId);
        if (!receipt) throw new V3AccessDeniedError('Committed owned receipt required');
        if (String((receipt as { project_id: string | null }).project_id ?? '') !== input.projectId)
          throw new V3AccessDeniedError('Receipt must belong to the expense project');
      }
      // Offline intake has the same operational-only contract as the online
      // Worker action. Finance/Admin classifies commercial treatment later.
      const reimbursementAmountMinor =
        input.whoPaid === 'worker' && input.currency === project.currency
          ? sqliteInteger(input.amountMinor, 'Reimbursement')
          : null;
      this.sqlite
        .prepare(
          'INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,vendor,description,who_paid,payment_method,receipt_required,receipt_document_id,approval_state,reimbursement_state,billing_treatment,markup_bps,billing_amount_minor,project_currency_amount_minor,tax_amount_minor,fx_rate_bps,reimbursement_amount_minor,commercial_classification_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          mutation.entityId,
          input.projectId,
          principal.userId,
          input.spentOn,
          input.category,
          input.currency,
          sqliteInteger(input.amountMinor, 'Expense amount'),
          'non_billable',
          input.vendor,
          input.description,
          input.whoPaid,
          input.paymentMethod ?? null,
          input.receiptRequired ? 1 : 0,
          input.receiptDocumentId || null,
          'draft',
          'pending',
          'internal_non_billable',
          null,
          null,
          null,
          null,
          null,
          reimbursementAmountMinor,
          'unclassified',
          timestampValue,
          timestampValue,
        );
      this.audit(principal, 'expense.create_offline', 'expense', mutation.entityId, {
        projectId: input.projectId,
        amountMinor: input.amountMinor.toString(),
      });
    } else {
      throw new V3ValidationError('Unsupported offline record');
    }
    return { outcome: 'accepted', version: 1 };
  }

  syncMutation(
    principal: Principal,
    mutation: Readonly<{
      mutationId: string;
      entityType: string;
      entityId: string;
      baseVersion: number;
      payload: Record<string, unknown>;
      attachments: readonly string[];
    }>,
  ) {
    this.assertWritable(principal);
    return this.transaction(() => {
      const duplicate = this.sqlite
        .prepare('SELECT result_json FROM offline_mutation WHERE mutation_id=? AND user_id=?')
        .get(mutation.mutationId, principal.userId) as { result_json: string } | undefined;
      if (duplicate) return JSON.parse(duplicate.result_json) as unknown;
      if (!['time', 'daily_report', 'technical_report', 'expense'].includes(mutation.entityType))
        return this.persistMutationResult(principal, mutation, {
          outcome: 'rejected',
          reason: 'Unsupported offline record',
        });
      const table =
        mutation.entityType === 'time'
          ? 'time_entry'
          : mutation.entityType === 'expense'
            ? 'expense'
            : mutation.entityType;
      const ownerColumn = mutation.entityType === 'technical_report' ? 'author_id' : 'worker_id';
      const objectDateColumn =
        mutation.entityType === 'technical_report'
          ? 'report_date'
          : mutation.entityType === 'expense'
            ? 'spent_on'
            : 'work_date';
      const row = this.sqlite
        .prepare(
          `SELECT id,${ownerColumn} owner_id,project_id,${objectDateColumn} object_date,version,approval_state FROM ${table} WHERE id=?`,
        )
        .get(mutation.entityId) as
        | {
            id: string;
            owner_id: string;
            project_id: string;
            object_date: string;
            version: number;
            approval_state: string;
          }
        | undefined;
      if (!row) {
        if (mutation.baseVersion !== 0)
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Offline record no longer exists',
          });
        const result = this.createOfflineDraft(principal, mutation);
        this.persistMutationResult(principal, mutation, result);
        return result;
      }
      if (row.owner_id !== principal.userId)
        return this.persistMutationResult(principal, mutation, {
          outcome: 'rejected',
          reason: 'Record ownership required',
        });
      this.assertOfflineAssignment(principal, row.project_id, row.object_date);
      if (row.version !== mutation.baseVersion)
        return this.persistMutationResult(principal, mutation, {
          outcome: 'conflict',
          authoritativeVersion: row.version,
          fields: ['version', 'server_record'],
        });
      if (row.approval_state !== 'draft' && row.approval_state !== 'needs_changes')
        return this.persistMutationResult(principal, mutation, {
          outcome: 'rejected',
          reason: 'Only editable drafts can sync',
        });
      const now = timestamp();
      if (mutation.entityType === 'time') {
        const minutes = mutation.payload.minutes;
        const category = mutation.payload.category;
        const summary = mutation.payload.summary;
        if (
          typeof minutes !== 'number' ||
          !Number.isInteger(minutes) ||
          minutes < 0 ||
          minutes > 1440 ||
          typeof category !== 'string' ||
          typeof summary !== 'string'
        )
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Invalid time payload',
          });
        this.sqlite
          .prepare(
            'UPDATE time_entry SET minutes=?,category=?,activity_summary=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
          )
          .run(
            minutes,
            requireText(category, 'Category', 100),
            requireText(summary, 'Activity summary'),
            now,
            mutation.entityId,
            mutation.baseVersion,
          );
      } else if (mutation.entityType === 'expense') {
        const description = mutation.payload.description;
        if (typeof description !== 'string')
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Invalid expense payload',
          });
        this.sqlite
          .prepare(
            'UPDATE expense SET description=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
          )
          .run(
            requireText(description, 'Description'),
            now,
            mutation.entityId,
            mutation.baseVersion,
          );
      } else {
        const summary = mutation.payload.summary ?? mutation.payload.changeSummary;
        if (typeof summary !== 'string')
          return this.persistMutationResult(principal, mutation, {
            outcome: 'rejected',
            reason: 'Invalid report payload',
          });
        const field = mutation.entityType === 'daily_report' ? 'summary' : 'change_summary';
        this.sqlite
          .prepare(
            `UPDATE ${table} SET ${field}=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
          )
          .run(requireText(summary, 'Summary'), now, mutation.entityId, mutation.baseVersion);
      }
      const result = { outcome: 'accepted', version: mutation.baseVersion + 1 } as const;
      this.persistMutationResult(principal, mutation, result);
      this.audit(principal, 'offline.sync', mutation.entityType, mutation.entityId, {
        mutationId: mutation.mutationId,
      });
      return result;
    });
  }

  private persistMutationResult(
    principal: Principal,
    mutation: Readonly<{
      mutationId: string;
      entityType: string;
      entityId: string;
      baseVersion: number;
      payload: Record<string, unknown>;
      attachments: readonly string[];
    }>,
    result: unknown,
  ): unknown {
    const now = timestamp();
    this.sqlite
      .prepare(
        'INSERT INTO offline_mutation(mutation_id,user_id,entity_type,entity_id,base_version,payload_json,attachment_ids_json,state,result_json,created_at,processed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        mutation.mutationId,
        principal.userId,
        mutation.entityType,
        mutation.entityId,
        mutation.baseVersion,
        JSON.stringify(mutation.payload),
        JSON.stringify(mutation.attachments),
        typeof result === 'object' && result !== null && 'outcome' in result
          ? String((result as { outcome: string }).outcome)
          : 'rejected',
        JSON.stringify(result),
        now,
        now,
      );
    return result;
  }

  enqueueJob(
    kind: string,
    idempotencyKey: string,
    payload: unknown,
    runAfter = timestamp(),
  ): { id: string; created: boolean } {
    const canonicalKind = kind;
    const capability =
      DURABLE_JOB_CAPABILITY_BY_KIND[canonicalKind as keyof typeof DURABLE_JOB_CAPABILITY_BY_KIND];
    if (!capability) throw new V3ValidationError(`Unregistered durable job kind: ${kind}`);
    const identity = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!identity) throw new V3ValidationError('Deployment identity is not configured');
    if (!idempotencyKey.trim()) throw new V3ValidationError('Job idempotency key is required');
    requireDateTime(runAfter, 'Job run-after timestamp');
    const payloadJson = canonicalJobJson(payload);
    const payloadSha256 = createHash('sha256').update(payloadJson).digest('hex');
    const existing = this.sqlite
      .prepare(
        "SELECT id,payload_sha256,kind FROM job WHERE tenant_id=? AND deployment_id=? AND idempotency_key=? AND contract_version='b5-v1'",
      )
      .get(identity.tenant_id, identity.deployment_id, idempotencyKey) as
      | { id: string; payload_sha256: string; kind: string }
      | undefined;
    if (existing) {
      if (existing.kind !== canonicalKind || existing.payload_sha256 !== payloadSha256)
        throw new V3ConflictError('IDEMPOTENCY_CONFLICT');
      return { id: existing.id, created: false };
    }
    const id = newId();
    const now = timestamp();
    const maxAttempts = canonicalKind === WORKER_STATEMENT_ARTIFACT_RENDER_JOB_KIND ? 1 : 5;
    const correlationId = createHash('sha256')
      .update(`${identity.tenant_id}:${identity.deployment_id}:${idempotencyKey}`)
      .digest('hex');
    this.sqlite
      .prepare(
        `INSERT INTO job(
           id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,
           updated_at,version,tenant_id,deployment_id,contract_version,payload_sha256,correlation_id,
           required_capability,active_job_run_id,fence_version,max_attempts,last_error_code
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        canonicalKind,
        idempotencyKey,
        'queued',
        runAfter,
        null,
        0,
        payloadJson,
        now,
        now,
        1,
        identity.tenant_id,
        identity.deployment_id,
        'b5-v1',
        payloadSha256,
        correlationId,
        capability,
        null,
        0,
        maxAttempts,
        null,
      );
    return { id, created: true };
  }

  private createMissingTimeReminders(workDate: string): number {
    requireDate(workDate, 'Reminder work date');
    if (new Date(`${workDate}T00:00:00.000Z`).getUTCDay() === 0) return 0;
    return this.transaction(() => {
      const assignments = this.sqlite
        .prepare(
          "SELECT DISTINCT pm.project_id,pm.user_id FROM project_member pm JOIN user u ON u.id=pm.user_id WHERE u.role='worker' AND u.status='active' AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
        )
        .all(workDate, workDate) as Array<{ project_id: string; user_id: string }>;
      let created = 0;
      for (const assignment of assignments) {
        const hasTime = this.sqlite
          .prepare(
            'SELECT 1 FROM time_entry WHERE project_id=? AND worker_id=? AND work_date=? LIMIT 1',
          )
          .get(assignment.project_id, assignment.user_id, workDate);
        if (hasTime) continue;
        const subjectId = `missing-time:${assignment.project_id}:${assignment.user_id}:${workDate}`;
        const notificationId = newId();
        const notification = this.sqlite
          .prepare(
            'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
          )
          .run(notificationId, assignment.user_id, 'missing_time', subjectId, timestamp());
        if (Number(notification.changes) !== 1) continue;
        this.sqlite
          .prepare(
            'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            newId(),
            'notification.email.requested',
            notificationId,
            `notification-email:${notificationId}`,
            JSON.stringify({
              notificationId,
              userId: assignment.user_id,
              kind: 'missing_time',
              subjectId,
            }),
            timestamp(),
            timestamp(),
          );
        created += 1;
      }
      return created;
    });
  }

  runDueJobs(
    limit = 20,
    handlers: Readonly<Record<string, DueJobHandler>> = {},
  ): { processed: number; failed: number; overdueMarked: number } {
    let overdueMarked = 0;
    const syncHandlers: Record<
      string,
      (payload: unknown, execution: DurableJobExecutionContext) => void | (() => void)
    > = {};
    const aliases: Readonly<Record<string, string>> = {
      accounting_pack: 'accounting_pack_artifact_render',
      missing_time_reminder: 'alert_dispatch',
      overdue: 'alert_dispatch',
      period_readiness: 'backup_verify',
    };
    for (const [kind, handler] of Object.entries(handlers)) {
      const canonicalKind = aliases[kind] ?? kind;
      syncHandlers[canonicalKind] = (payload, execution) => {
        const result = handler(payload, execution);
        if (result && typeof (result as PromiseLike<void>).then === 'function')
          throw new Error('Synchronous durable job handler returned a Promise');
        return typeof result === 'function' ? result : undefined;
      };
    }

    if (!syncHandlers.alert_dispatch)
      syncHandlers.alert_dispatch = (payload) => {
        const reminder = payload as { alertType?: unknown; workDate?: unknown };
        if (
          reminder.alertType === 'missing_time' &&
          typeof reminder.workDate === 'string' &&
          reminder.workDate
        ) {
          this.createMissingTimeReminders(reminder.workDate);
          return;
        }
        if (reminder.alertType !== 'overdue') throw new Error('PAYLOAD_INVALID');
        const now = timestamp();
        const changed = this.sqlite
          .prepare(
            "UPDATE invoice SET state='overdue',updated_at=? WHERE due_at<? AND state IN ('issued','sent','partially_paid')",
          )
          .run(now, now);
        overdueMarked += Number(changed.changes);
      };
    if (!syncHandlers.period_close_report)
      syncHandlers.period_close_report = (payload) => {
        const report = payload as {
          projectId?: unknown;
          periodStart?: unknown;
          periodEnd?: unknown;
        };
        if (
          typeof report.projectId === 'string' &&
          typeof report.periodStart === 'string' &&
          typeof report.periodEnd === 'string'
        )
          this.sqlite
            .prepare(
              "UPDATE period_report SET state='review',updated_at=? WHERE project_id=? AND period_start=? AND period_end=? AND state='draft'",
            )
            .run(timestamp(), report.projectId, report.periodStart, report.periodEnd);
      };
    if (!syncHandlers.backup_verify)
      syncHandlers.backup_verify = () => {
        // Readiness remains an explicit finance action; this durable run only
        // records a truthful successful scheduler execution.
      };

    const outcomes = runDueConfiguredDurableJobsSync(this.sqlite, limit, syncHandlers);
    let processed = 0;
    let failed = 0;
    for (const outcome of outcomes) {
      if (outcome.outcome === 'succeeded') processed += 1;
      else failed += 1;
    }
    return { processed, failed, overdueMarked };
  }

  async runDueOutbox(
    limit = 20,
    handler: DueOutboxHandler,
  ): Promise<{ processed: number; failed: number; permanentlyFailed: number }> {
    let processed = 0;
    let failed = 0;
    let permanentlyFailed = 0;
    const maximumAttempts = 8;
    for (let index = 0; index < limit; index += 1) {
      const claimed = this.transaction(() => {
        const now = timestamp();
        const event = this.sqlite
          .prepare(
            'SELECT id,topic,aggregate_id,idempotency_key,payload_json,attempts FROM outbox_event WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY available_at,id LIMIT 1',
          )
          .get(now, now) as
          | {
              id: string;
              topic: string;
              aggregate_id: string;
              idempotency_key: string;
              payload_json: string;
              attempts: number;
            }
          | undefined;
        if (!event) return null;
        const lease = new Date(Date.now() + 60_000).toISOString();
        this.sqlite
          .prepare(
            'UPDATE outbox_event SET lease_until=?,attempts=attempts+1,last_error=NULL WHERE id=? AND delivered_at IS NULL AND failed_at IS NULL',
          )
          .run(lease, event.id);
        return {
          id: event.id,
          topic: event.topic,
          aggregateId: event.aggregate_id,
          idempotencyKey: event.idempotency_key,
          payload: event.payload_json,
          attempts: event.attempts + 1,
        };
      });
      if (!claimed) break;
      try {
        await handler({
          ...claimed,
          payload: JSON.parse(claimed.payload) as unknown,
        });
        this.transaction(() => {
          const now = timestamp();
          this.sqlite
            .prepare(
              'UPDATE outbox_event SET delivered_at=?,lease_until=NULL,last_error=NULL WHERE id=? AND delivered_at IS NULL',
            )
            .run(now, claimed.id);
          if (claimed.topic === 'public-inquiry.received')
            this.sqlite
              .prepare(
                'UPDATE public_inquiry SET delivered_at=? WHERE id=? AND delivered_at IS NULL',
              )
              .run(now, claimed.aggregateId);
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Outbox delivery failed';
        if (process.env.NODE_ENV === 'production' || process.env.JA_JSON_LOGS === 'true')
          console.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'error',
              event: 'outbox.failure',
              eventId: claimed.id,
              topic: claimed.topic,
              attempts: claimed.attempts,
              error: message,
            }),
          );
        const nextAttempts = claimed.attempts;
        const permanentlyFailedNow = nextAttempts >= maximumAttempts;
        const delayMs = Math.min(3_600_000, 30_000 * 2 ** Math.min(nextAttempts - 1, 6));
        this.transaction(() => {
          const now = timestamp();
          this.sqlite
            .prepare(
              'UPDATE outbox_event SET lease_until=NULL,available_at=?,last_error=?,failed_at=CASE WHEN ? THEN ? ELSE failed_at END WHERE id=? AND delivered_at IS NULL',
            )
            .run(
              new Date(Date.now() + delayMs).toISOString(),
              message.slice(0, 500),
              permanentlyFailedNow ? 1 : 0,
              permanentlyFailedNow ? now : null,
              claimed.id,
            );
        });
        if (permanentlyFailedNow) permanentlyFailed += 1;
      }
    }
    return { processed, failed, permanentlyFailed };
  }

  scheduleCoreJobs(): void {
    const now = timestamp();
    const jobs = [
      ['alert_dispatch', '*/5 * * * *'],
      ['backup_verify', '*/5 * * * *'],
      ['accounting_pack_artifact_render', '0 2 1 * *'],
      ['auto_draft', '*/10 * * * *'],
      ['temporary_upload_cleanup', '15 * * * *'],
    ] as const;
    for (const [kind, cron] of jobs)
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO scheduled_job(id,kind,cron_expression,payload_json,updated_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), kind, cron, '{}', now);
    const minute = now.slice(0, 16);
    const cleanupHour = now.slice(0, 13);
    const cleanupBoundary = new Date(`${cleanupHour}:00:00.000Z`);
    cleanupBoundary.setUTCDate(cleanupBoundary.getUTCDate() - 1);
    this.enqueueJob(
      'temporary_upload_cleanup',
      `temporary-upload-cleanup:${cleanupHour}`,
      { olderThan: cleanupBoundary.toISOString() },
      now,
    );
    this.enqueueJob('alert_dispatch', `overdue:${minute}`, { alertType: 'overdue' }, now);
    this.enqueueJob(
      'backup_verify',
      `period-readiness:${minute}`,
      { purpose: 'period_readiness' },
      now,
    );
    const reminderDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (new Date(`${reminderDate}T00:00:00.000Z`).getUTCDay() !== 0)
      this.enqueueJob(
        'alert_dispatch',
        `missing-time-reminder:${reminderDate}`,
        { alertType: 'missing_time', workDate: reminderDate },
        now,
      );
    const closedPeriods = this.sqlite
      .prepare(
        `SELECT br.id billing_rule_id,br.policy_version,bp.period_start,bp.period_end
         FROM billing_rule br JOIN billing_period bp ON bp.billing_rule_id=br.id
         WHERE br.enabled=1 AND br.auto_generate_draft=1 AND bp.state='closed'
           AND NOT EXISTS (
             SELECT 1 FROM invoice i
             WHERE i.billing_rule_id=br.id AND i.period_start=bp.period_start AND i.period_end=bp.period_end
           )`,
      )
      .all() as Array<{
      billing_rule_id: string;
      policy_version: number;
      period_start: string;
      period_end: string;
    }>;
    for (const period of closedPeriods)
      this.enqueueJob(
        'auto_draft',
        `auto-draft:${period.billing_rule_id}:${period.period_start}:${period.period_end}:${period.policy_version}`,
        {
          billingRuleId: period.billing_rule_id,
          periodStart: period.period_start,
          periodEnd: period.period_end,
        },
        now,
      );
  }

  private reportAttachmentContext(
    reportType: ReportAttachmentType,
    reportId: string,
  ): ReportAttachmentContext {
    if (reportType === 'daily') {
      const report = this.sqlite
        .prepare(
          'SELECT id,project_id,worker_id owner_id,COALESCE(work_date,substr(created_at,1,10)) object_date,approval_state FROM daily_report WHERE id=?',
        )
        .get(reportId) as
        | {
            id: string;
            project_id: string;
            owner_id: string;
            object_date: string;
            approval_state: string;
          }
        | undefined;
      if (!report) throw new V3NotFoundError('Daily report not found');
      return {
        reportType,
        reportId: report.id,
        projectId: report.project_id,
        ownerId: report.owner_id,
        objectDate: report.object_date,
        approvalState: report.approval_state,
        systemReferenceSnapshot: null,
      };
    }
    const report = this.sqlite
      .prepare(
        'SELECT id,project_id,author_id owner_id,COALESCE(report_date,substr(created_at,1,10)) object_date,system_name,approval_state FROM technical_report WHERE id=?',
      )
      .get(reportId) as
      | {
          id: string;
          project_id: string;
          owner_id: string;
          object_date: string;
          system_name: string;
          approval_state: string;
        }
      | undefined;
    if (!report) throw new V3NotFoundError('Technical report not found');
    return {
      reportType,
      reportId: report.id,
      projectId: report.project_id,
      ownerId: report.owner_id,
      objectDate: report.object_date,
      approvalState: report.approval_state,
      systemReferenceSnapshot: report.system_name.trim(),
    };
  }

  private assertReportAttachmentReadable(
    principal: Principal,
    context: ReportAttachmentContext,
  ): void {
    this.assertActive(principal);
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return;
    if (!principal.projectIds.has(context.projectId))
      throw new V3AccessDeniedError('Report access required');
    const current = new Date().toISOString().slice(0, 10);
    const assignment = this.sqlite
      .prepare(
        `SELECT 1
         FROM project_member pm JOIN project p ON p.id=pm.project_id
         WHERE p.status IN ('active','planned','paused')
           AND pm.project_id=? AND pm.user_id=? AND pm.status='active'
           AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
           AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
         LIMIT 1`,
      )
      .get(
        context.projectId,
        principal.userId,
        current,
        current,
        context.objectDate,
        context.objectDate,
      );
    if (!assignment) throw new V3AccessDeniedError('Report access required');
    if (principal.role === 'project_manager') return;
    if (principal.role === 'worker' && principal.userId === context.ownerId) return;
    throw new V3AccessDeniedError('Report access required');
  }

  private assertReportAttachmentWritable(
    principal: Principal,
    context: ReportAttachmentContext,
  ): void {
    this.assertActive(principal);
    if (principal.role === 'finance_admin' || principal.role === 'auditor_read_only')
      throw new V3AccessDeniedError('Report attachment write access denied');
    if (principal.role === 'owner_admin') return;
    this.assertReportAttachmentReadable(principal, context);
  }

  private validateReportAttachmentKind(
    reportType: ReportAttachmentType,
    attachmentKind: ReportAttachmentKind,
  ): void {
    if (reportType === 'daily' && attachmentKind !== 'daily_attachment')
      throw new V3ValidationError('Daily reports accept daily attachments only');
    if (
      reportType === 'technical' &&
      attachmentKind !== 'technical_attachment' &&
      attachmentKind !== 'plc_backup_before' &&
      attachmentKind !== 'plc_backup_after'
    )
      throw new V3ValidationError('Technical attachment kind is invalid');
  }

  private assertReportAttachmentPredecessor(
    context: ReportAttachmentContext,
    attachmentKind: ReportAttachmentKind,
    supersedesDocumentId: string,
  ): void {
    const predecessor = this.sqlite
      .prepare(
        `SELECT d.id,d.state
         FROM report_document_link l JOIN document d ON d.id=l.document_id
         WHERE l.report_type=? AND l.report_id=? AND l.project_id=?
           AND l.attachment_kind=? AND d.id=?`,
      )
      .get(
        context.reportType,
        context.reportId,
        context.projectId,
        attachmentKind,
        supersedesDocumentId,
      ) as { id: string; state: string } | undefined;
    if (!predecessor || predecessor.state !== 'committed')
      throw new V3ConflictError('A committed same-report attachment is required for supersession');
    const successor = this.sqlite
      .prepare(
        `SELECT 1
         FROM report_document_link l JOIN document d ON d.id=l.document_id
         WHERE l.report_type=? AND l.report_id=? AND l.project_id=?
           AND l.attachment_kind=? AND d.supersedes_id=?
         LIMIT 1`,
      )
      .get(
        context.reportType,
        context.reportId,
        context.projectId,
        attachmentKind,
        supersedesDocumentId,
      );
    if (successor) throw new V3ConflictError('Attachment predecessor already has a successor');
  }

  reserveReportAttachment(
    principal: Principal,
    input: ReportAttachmentReservationInput,
  ): {
    reservationId: string;
    storageKey: SafeStorageKey;
    reportType: ReportAttachmentType;
    reportId: string;
    projectId: string;
    attachmentKind: ReportAttachmentKind;
    systemReferenceSnapshot: string | null;
    supersedesDocumentId: string | null;
  } {
    this.assertActive(principal);
    this.validateReportAttachmentKind(input.reportType, input.attachmentKind);
    const initialContext = this.reportAttachmentContext(input.reportType, input.reportId);
    this.assertReportAttachmentWritable(principal, initialContext);
    if (!['draft', 'needs_changes'].includes(initialContext.approvalState))
      throw new V3ConflictError(
        'Approved or finalized reports require an audited correction draft before attachments change',
      );

    const reservationId = newId();
    const nowStr = timestamp();
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'attachment';
    if (safeFilename === '.' || safeFilename === '..')
      throw new V3ValidationError('Attachment filename is invalid');
    const datePath = nowStr.slice(0, 10).replace(/-/g, '/');
    const storageKey = `report-attachments/${datePath}/${reservationId}/${safeFilename}`;
    this.assertStorageKey(storageKey);
    const artifactType =
      input.attachmentKind === 'plc_backup_before' || input.attachmentKind === 'plc_backup_after'
        ? 'plc_backup'
        : 'report_attachment';
    const supersedesDocumentId = input.supersedesDocumentId ?? null;

    return this.transaction(() => {
      const context = this.reportAttachmentContext(input.reportType, input.reportId);
      this.assertReportAttachmentWritable(principal, context);
      if (!['draft', 'needs_changes'].includes(context.approvalState))
        throw new V3ConflictError(
          'Approved or finalized reports require an audited correction draft before attachments change',
        );
      if (supersedesDocumentId)
        this.assertReportAttachmentPredecessor(context, input.attachmentKind, supersedesDocumentId);

      this.sqlite
        .prepare(
          `INSERT INTO document(
             id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
             original_filename,description,artifact_type,supersedes_id,sensitivity,safe_filename,
             scan_status,created_at,updated_at,artifact_classification,classification_provenance
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          reservationId,
          context.projectId,
          principal.userId,
          createHash('sha256')
            .update(`report-attachment-reservation:${reservationId}`)
            .digest('hex'),
          'application/octet-stream',
          0,
          'temporary',
          storageKey,
          input.originalFilename.slice(0, 200),
          input.description?.trim().slice(0, 5000) || null,
          artifactType,
          supersedesDocumentId,
          input.sensitivity ?? 'internal',
          safeFilename,
          'not_scanned',
          nowStr,
          nowStr,
          'confidential',
          'native',
        );
      this.sqlite
        .prepare(
          `INSERT INTO report_document_link(
             id,report_type,report_id,document_id,project_id,attachment_kind,
             system_reference_snapshot,created_by,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          newId(),
          context.reportType,
          context.reportId,
          reservationId,
          context.projectId,
          input.attachmentKind,
          context.systemReferenceSnapshot,
          principal.userId,
          nowStr,
        );
      const auditDetails = {
        reportType: context.reportType,
        reportId: context.reportId,
        projectId: context.projectId,
        attachmentKind: input.attachmentKind,
        systemReferenceSnapshot: context.systemReferenceSnapshot,
        supersedesDocumentId,
      };
      this.audit(principal, 'report.attachment_link', 'document', reservationId, auditDetails);
      if (supersedesDocumentId)
        this.audit(
          principal,
          'report.attachment_supersede',
          'document',
          reservationId,
          auditDetails,
        );
      return {
        reservationId,
        storageKey,
        reportType: context.reportType,
        reportId: context.reportId,
        projectId: context.projectId,
        attachmentKind: input.attachmentKind,
        systemReferenceSnapshot: context.systemReferenceSnapshot,
        supersedesDocumentId,
      };
    });
  }

  finalizeReportAttachment(
    principal: Principal,
    documentId: string,
    input: ReportAttachmentFinalizeInput,
  ): {
    documentId: string;
    state: 'committed' | 'quarantined';
    scanStatus: 'not_scanned' | 'pending';
  } {
    this.assertActive(principal);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new V3ValidationError('Invalid document hash');
    if (
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 50_000_000
    )
      throw new V3ValidationError('Document size is invalid');
    const allowedMediaTypes = new Set([
      'application/pdf',
      'application/zip',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ]);
    if (!allowedMediaTypes.has(input.mediaType))
      throw new V3ValidationError('Unsupported private document media type');

    return this.transaction(() => {
      const row = this.sqlite
        .prepare(
          `SELECT l.report_type,l.report_id,l.project_id,l.attachment_kind,
                  d.owner_id,d.state,d.storage_key
           FROM report_document_link l JOIN document d ON d.id=l.document_id
           WHERE d.id=?`,
        )
        .get(documentId) as
        | {
            report_type: ReportAttachmentType;
            report_id: string;
            project_id: string;
            attachment_kind: ReportAttachmentKind;
            owner_id: string;
            state: string;
            storage_key: string;
          }
        | undefined;
      if (!row) throw new V3NotFoundError('Report attachment reservation not found');
      const context = this.reportAttachmentContext(row.report_type, row.report_id);
      this.assertReportAttachmentWritable(principal, context);
      if (!['draft', 'needs_changes'].includes(context.approvalState))
        throw new V3ConflictError('Approved or finalized reports cannot receive attachments');
      if (row.owner_id !== principal.userId && principal.role !== 'owner_admin')
        throw new V3AccessDeniedError('Attachment reservation ownership required');
      if (row.state !== 'temporary') throw new V3ConflictError('Attachment upload is not pending');
      this.assertStorageKey(row.storage_key);

      const scannerRequired = malwareScannerRequired();
      const state = scannerRequired ? 'quarantined' : 'committed';
      const scanStatus = scannerRequired ? 'pending' : 'not_scanned';
      const nowStr = timestamp();
      this.sqlite
        .prepare(
          "UPDATE document SET sha256=?,media_type=?,byte_length=?,state=?,scan_status=?,updated_at=?,version=version+1 WHERE id=? AND state='temporary'",
        )
        .run(
          input.sha256,
          input.mediaType,
          input.byteLength,
          state,
          scanStatus,
          nowStr,
          documentId,
        );
      if (scannerRequired)
        this.enqueueJob('document_scan', `document-scan:${documentId}`, { documentId }, nowStr);
      this.audit(principal, 'document.upload_finalized', 'document', documentId, {
        byteLength: input.byteLength,
        reportType: row.report_type,
        reportId: row.report_id,
        projectId: row.project_id,
        attachmentKind: row.attachment_kind,
      });
      return { documentId, state, scanStatus };
    });
  }

  cancelReportAttachment(
    principal: Principal,
    documentId: string,
  ): { documentId: string; storageKey: SafeStorageKey; cancelled: true } {
    this.assertActive(principal);
    return this.transaction(() => {
      const row = this.sqlite
        .prepare(
          `SELECT l.report_type,l.report_id,l.project_id,l.attachment_kind,
                  d.owner_id,d.state,d.storage_key
           FROM report_document_link l JOIN document d ON d.id=l.document_id
           WHERE d.id=?`,
        )
        .get(documentId) as
        | {
            report_type: ReportAttachmentType;
            report_id: string;
            project_id: string;
            attachment_kind: ReportAttachmentKind;
            owner_id: string;
            state: string;
            storage_key: string;
          }
        | undefined;
      if (!row) throw new V3NotFoundError('Report attachment not found');
      const context = this.reportAttachmentContext(row.report_type, row.report_id);
      this.assertReportAttachmentWritable(principal, context);
      if (!['draft', 'needs_changes'].includes(context.approvalState))
        throw new V3ConflictError('Approved or finalized reports cannot detach attachments');
      if (row.owner_id !== principal.userId && principal.role !== 'owner_admin')
        throw new V3AccessDeniedError('Attachment reservation ownership required');
      if (!['temporary', 'quarantined', 'rejected'].includes(row.state))
        throw new V3ConflictError('Committed report attachments are immutable');
      this.assertStorageKey(row.storage_key);
      const detached = this.sqlite
        .prepare('DELETE FROM report_document_link WHERE document_id=?')
        .run(documentId);
      if (detached.changes !== 1)
        throw new V3ConflictError('Attachment changed before cancellation');
      const deleted = this.sqlite
        .prepare(
          "DELETE FROM document WHERE id=? AND state IN('temporary','quarantined','rejected')",
        )
        .run(documentId);
      if (deleted.changes !== 1)
        throw new V3ConflictError('Attachment changed before cancellation');
      this.audit(principal, 'document.upload_cancelled', 'document', documentId, {
        reportType: row.report_type,
        reportId: row.report_id,
        projectId: row.project_id,
        attachmentKind: row.attachment_kind,
        previousState: row.state,
      });
      return { documentId, storageKey: row.storage_key, cancelled: true };
    });
  }

  listReportAttachments(principal: Principal, reportType: ReportAttachmentType, reportId: string) {
    const context = this.reportAttachmentContext(reportType, reportId);
    this.assertReportAttachmentReadable(principal, context);
    return this.sqlite
      .prepare(
        `SELECT l.id,l.report_type,l.report_id,l.project_id,l.attachment_kind,
                l.system_reference_snapshot,l.created_by,l.created_at,
                d.id document_id,d.owner_id,d.original_filename,d.safe_filename,d.media_type,
                d.byte_length,d.artifact_type,d.supersedes_id,d.state,d.scan_status
         FROM report_document_link l JOIN document d ON d.id=l.document_id
         WHERE l.report_type=? AND l.report_id=? AND l.project_id=?
         ORDER BY l.created_at,l.id`,
      )
      .all(reportType, reportId, context.projectId) as Array<{
      id: string;
      report_type: ReportAttachmentType;
      report_id: string;
      project_id: string;
      attachment_kind: ReportAttachmentKind;
      system_reference_snapshot: string | null;
      created_by: string;
      created_at: string;
      document_id: string;
      owner_id: string;
      original_filename: string | null;
      safe_filename: string | null;
      media_type: string;
      byte_length: number;
      artifact_type: string | null;
      supersedes_id: string | null;
      state: string;
      scan_status: string | null;
    }>;
  }

  authorizeReportAttachment(
    principal: Principal,
    reportType: ReportAttachmentType,
    reportId: string,
    documentId: string,
  ): {
    storageKey: SafeStorageKey;
    filename: string;
    mediaType: string;
    sensitive: boolean;
    sha256: string;
    byteLength: number;
    attachmentKind: ReportAttachmentKind;
  } {
    const context = this.reportAttachmentContext(reportType, reportId);
    this.assertReportAttachmentReadable(principal, context);
    const document = this.sqlite
      .prepare(
        `SELECT l.attachment_kind,d.storage_key,d.original_filename,d.safe_filename,d.media_type,
                d.sensitivity,d.sensitive,d.sha256,d.byte_length,d.state,d.scan_status
         FROM report_document_link l JOIN document d ON d.id=l.document_id
         WHERE l.report_type=? AND l.report_id=? AND l.project_id=? AND d.id=?`,
      )
      .get(reportType, reportId, context.projectId, documentId) as
      | {
          attachment_kind: ReportAttachmentKind;
          storage_key: string;
          original_filename: string | null;
          safe_filename: string | null;
          media_type: string;
          sensitivity: string | null;
          sensitive: number | null;
          sha256: string;
          byte_length: number;
          state: string;
          scan_status: string | null;
        }
      | undefined;
    const scannerRequired = malwareScannerRequired();
    if (
      !document ||
      document.state !== 'committed' ||
      !scannerStatusAllowsPrivateDownload(document.scan_status, scannerRequired)
    )
      throw new V3ValidationError('Report attachment is not ready');
    if (
      !Number.isSafeInteger(document.byte_length) ||
      document.byte_length <= 0 ||
      !/^[a-f0-9]{64}$/.test(document.sha256)
    )
      throw new V3ConflictError('Report attachment integrity metadata is invalid');
    this.assertStorageKey(document.storage_key);
    const sensitive = document.sensitive === 1 || document.sensitivity !== 'public';
    this.sqlite
      .prepare(
        'INSERT INTO document_access_event(id,document_id,user_id,action,occurred_at) VALUES(?,?,?,?,?)',
      )
      .run(newId(), documentId, principal.userId, 'download', timestamp());
    this.audit(principal, 'document.download', 'document', documentId, {
      reportType,
      reportId,
      attachmentKind: document.attachment_kind,
      sensitive,
    });
    return {
      storageKey: document.storage_key,
      filename: document.safe_filename ?? document.original_filename ?? 'attachment',
      mediaType: document.media_type,
      sensitive,
      sha256: document.sha256,
      byteLength: document.byte_length,
      attachmentKind: document.attachment_kind,
    };
  }

  reserveUpload(
    principal: Principal,
    input: Readonly<{
      projectId?: string;
      originalFilename: string;
      artifactType: string;
      description?: string;
      sensitivity?: 'internal' | 'sensitive' | 'customer_private';
      artifactClassification?: ArtifactClassification;
    }>,
  ): { reservationId: string; storageKey: SafeStorageKey } {
    this.assertActive(principal);
    if (input.projectId && principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      this.assertProjectAccess(principal, input.projectId);

    if (!input.artifactType) throw new V3ValidationError('Artifact type is required');
    const artifactClassification = resolveArtifactClassification(
      input.artifactType,
      input.artifactClassification,
    );

    const reservationId = newId();
    const nowStr = timestamp();
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'artifact';
    const datePath = nowStr.slice(0, 10).replace(/-/g, '/');
    const storageKey = `uploads/${datePath}/${reservationId}/${safeFilename}`;

    this.sqlite
      .prepare(
        `
      INSERT INTO document(
        id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
        original_filename,description,artifact_type,sensitivity,safe_filename,
        scan_status,created_at,updated_at,artifact_classification,classification_provenance
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
      )
      .run(
        reservationId,
        input.projectId ?? null,
        principal.userId,
        // Reservations do not have content yet. A unique, deterministic
        // placeholder keeps the document deduplication constraint from
        // collapsing concurrent uploads; finalizeUpload replaces it with the
        // real content hash in the same record.
        createHash('sha256').update(`upload-reservation:${reservationId}`).digest('hex'),
        'application/octet-stream',
        0,
        'temporary',
        storageKey,
        input.originalFilename.slice(0, 200),
        input.description ?? null,
        input.artifactType,
        input.sensitivity ?? 'internal',
        safeFilename,
        'not_scanned',
        nowStr,
        nowStr,
        artifactClassification,
        'native',
      );

    return { reservationId, storageKey };
  }

  /** Cancel one still-temporary reservation owned by the caller. */
  cancelUploadReservation(principal: Principal, reservationId: string): void {
    this.assertActive(principal);
    const reservation = this.sqlite
      .prepare('SELECT owner_id,state,storage_key FROM document WHERE id=?')
      .get(reservationId) as { owner_id: string; state: string; storage_key: string } | undefined;
    if (!reservation) return;
    if (reservation.owner_id !== principal.userId && !canManageBilling(principal))
      throw new V3AccessDeniedError('Upload ownership mismatch');
    if (reservation.state !== 'temporary') return;
    this.assertStorageKey(reservation.storage_key);
    this.transaction(() => {
      const result = this.sqlite
        .prepare("DELETE FROM document WHERE id=? AND state='temporary'")
        .run(reservationId);
      if (result.changes === 1)
        this.audit(principal, 'document.upload_cancelled', 'document', reservationId, {
          storageKey: reservation.storage_key,
        });
    });
  }

  /**
   * Remove abandoned temporary reservations older than an explicit boundary.
   * Bulk cleanup is restricted to finance/owner operators; ordinary callers
   * use cancelUploadReservation for their own failed upload.
   */
  cleanupTemporaryUploadReservations(
    principal: Principal,
    olderThan: string = new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  ): number {
    this.assertActive(principal);
    if (!canManageBilling(principal))
      throw new V3AccessDeniedError('Upload cleanup requires finance access');
    if (Number.isNaN(Date.parse(olderThan)))
      throw new V3ValidationError('Cleanup boundary is invalid');
    return this.transaction(() => {
      const result = this.sqlite
        .prepare("DELETE FROM document WHERE state='temporary' AND updated_at<?")
        .run(olderThan);
      if (result.changes > 0)
        this.audit(principal, 'document.upload_cleanup', 'document', 'temporary', {
          olderThan,
          removed: Number(result.changes),
        });
      return Number(result.changes);
    });
  }

  /** Execute the bounded reservation cleanup only from the current fenced cleanup job. */
  cleanupTemporaryUploadReservationsFromJob(
    execution: DocumentScanExecutionProof,
    olderThan: string,
    removeFile: (storageKey: SafeStorageKey) => void,
  ): number {
    if (
      !execution ||
      execution.requiredCapability !== 'storage.temporary.cleanup' ||
      !execution.jobId ||
      !execution.runId ||
      !Number.isSafeInteger(execution.fenceVersion) ||
      execution.fenceVersion < 1 ||
      Number.isNaN(Date.parse(olderThan))
    )
      throw new V3AccessDeniedError('Temporary upload cleanup execution proof is required');
    return this.transaction(() => {
      const durable = this.sqlite
        .prepare(
          `SELECT j.kind,j.state job_state,j.active_job_run_id,j.fence_version,j.payload_json,
                  j.payload_sha256,j.tenant_id,j.deployment_id,j.required_capability,
                  r.state run_state,r.fence_version run_fence,r.payload_sha256 run_payload_sha256,
                  r.tenant_id run_tenant_id,r.deployment_id run_deployment_id,
                  r.required_capability run_capability,r.service_actor_id,
                  r.service_actor_version,r.service_actor_capabilities_json,
                  r.configured_binding_version,s.status actor_status,s.version actor_version,
                  s.capabilities_json actor_capabilities,b.service_actor_id binding_actor_id,
                  b.version binding_version,b.tenant_id binding_tenant_id,
                  b.deployment_id binding_deployment_id
           FROM job j
           JOIN job_run r ON r.id=j.active_job_run_id AND r.id=? AND r.job_id=j.id
           JOIN service_actor s ON s.id=r.service_actor_id
           JOIN deployment_service_actor_binding b ON b.singleton=1 AND b.service_actor_id=s.id
           WHERE j.id=? AND j.contract_version='b5-v1' AND r.contract_version='b5-v1'`,
        )
        .get(execution.runId, execution.jobId) as
        | {
            kind: string;
            job_state: string;
            active_job_run_id: string | null;
            fence_version: number;
            payload_json: string;
            payload_sha256: string;
            tenant_id: string;
            deployment_id: string;
            required_capability: string;
            run_state: string;
            run_fence: number;
            run_payload_sha256: string;
            run_tenant_id: string;
            run_deployment_id: string;
            run_capability: string;
            service_actor_id: string;
            service_actor_version: number;
            service_actor_capabilities_json: string;
            configured_binding_version: number;
            actor_status: string;
            actor_version: number;
            actor_capabilities: string;
            binding_actor_id: string;
            binding_version: number;
            binding_tenant_id: string;
            binding_deployment_id: string;
          }
        | undefined;
      let payload: unknown;
      let capabilities: unknown;
      try {
        payload = durable ? JSON.parse(durable.payload_json) : null;
        capabilities = durable ? JSON.parse(durable.actor_capabilities) : null;
      } catch {
        throw new V3AccessDeniedError('Temporary upload cleanup execution is stale or forged');
      }
      if (
        !durable ||
        durable.kind !== 'temporary_upload_cleanup' ||
        durable.job_state !== 'claimed' ||
        durable.run_state !== 'running' ||
        durable.active_job_run_id !== execution.runId ||
        durable.fence_version !== execution.fenceVersion ||
        durable.run_fence !== execution.fenceVersion ||
        durable.required_capability !== execution.requiredCapability ||
        durable.run_capability !== execution.requiredCapability ||
        durable.tenant_id !== execution.tenantId ||
        durable.deployment_id !== execution.deploymentId ||
        durable.run_tenant_id !== execution.tenantId ||
        durable.run_deployment_id !== execution.deploymentId ||
        durable.binding_tenant_id !== execution.tenantId ||
        durable.binding_deployment_id !== execution.deploymentId ||
        durable.payload_sha256 !== durable.run_payload_sha256 ||
        jobPayloadHash(payload) !== durable.payload_sha256 ||
        durable.service_actor_id !== durable.binding_actor_id ||
        durable.service_actor_version !== durable.actor_version ||
        durable.configured_binding_version !== durable.binding_version ||
        durable.actor_status !== 'active' ||
        durable.service_actor_capabilities_json !== durable.actor_capabilities ||
        !Array.isArray(capabilities) ||
        !capabilities.includes('storage.temporary.cleanup') ||
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        (payload as Record<string, unknown>).olderThan !== olderThan
      )
        throw new V3AccessDeniedError('Temporary upload cleanup execution is stale or forged');

      const reservations = this.sqlite
        .prepare(
          "SELECT id,storage_key FROM document WHERE state='temporary' AND updated_at<? ORDER BY id",
        )
        .all(olderThan) as Array<{ id: string; storage_key: SafeStorageKey }>;
      for (const reservation of reservations) {
        this.assertStorageKey(reservation.storage_key);
        removeFile(reservation.storage_key);
        const deleted = this.sqlite
          .prepare("DELETE FROM document WHERE id=? AND state='temporary' AND updated_at<?")
          .run(reservation.id, olderThan);
        if (deleted.changes !== 1)
          throw new V3ConflictError('Temporary upload reservation changed during cleanup');
      }
      return reservations.length;
    });
  }

  finalizeUpload(
    principal: Principal,
    reservationId: string,
    input: Readonly<{
      sha256: string;
      mediaType: string;
      byteLength: number;
    }>,
  ): { created: boolean } {
    this.assertActive(principal);

    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new V3ValidationError('Invalid document hash');
    if (
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 50_000_000
    )
      throw new V3ValidationError('Document size is invalid');

    const allowedMediaTypes = new Set([
      'application/pdf',
      'application/zip',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ]);
    if (!allowedMediaTypes.has(input.mediaType))
      throw new V3ValidationError('Unsupported private document media type');

    return this.transaction(() => {
      const reservation = this.sqlite
        .prepare('SELECT owner_id, state FROM document WHERE id=?')
        .get(reservationId) as { owner_id: string; state: string } | undefined;

      if (!reservation) throw new V3ValidationError('Reservation not found');
      if (reservation.owner_id !== principal.userId)
        throw new V3AccessDeniedError('Upload ownership mismatch');
      if (reservation.state !== 'temporary') throw new V3ConflictError('Upload already finalized');

      const malwareScanRequired = malwareScannerRequired();

      this.sqlite
        .prepare(
          `
        UPDATE document SET
          sha256=?, media_type=?, byte_length=?, state=?, scan_status=?, updated_at=?
        WHERE id=?
      `,
        )
        .run(
          input.sha256,
          input.mediaType,
          input.byteLength,
          malwareScanRequired ? 'quarantined' : 'committed',
          malwareScanRequired ? 'pending' : 'not_scanned',
          timestamp(),
          reservationId,
        );

      if (malwareScanRequired) {
        const scanAt = timestamp();
        this.enqueueJob(
          'document_scan',
          `document-scan:${reservationId}`,
          { documentId: reservationId },
          scanAt,
        );
      }

      this.audit(principal, 'document.upload_finalized', 'document', reservationId, {
        byteLength: input.byteLength,
      });

      return { created: true };
    });
  }

  hashSnapshot(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}

export type { CompensationInput, InternalCostInput, LaborRateInput, OverrideInput };
