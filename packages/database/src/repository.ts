import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  canManageAssignments,
  canManageBilling,
  canManageClients,
  newId,
  type Principal,
  type Role,
} from '@ja/domain';
import {
  calculateTaxComponents,
  overtimeRate,
  periodForCadence,
  type OvertimeMethod,
} from '@ja/billing-engine';
import { add, hourlyRateForMinutes, money, type Currency } from '@ja/money';
import { decodeTechnicalReportChange } from '@ja/schemas';
import { recordAuditEvent } from './core/audit.ts';
import { assertActiveAccount, assertRecentStepUp } from './core/authorization.ts';
import { verifyPrivatePdfArtifact } from './core/private-pdf-proof.ts';
import { nextNumberSequence } from './core/sequence.ts';
import { assertSafeStorageKey } from './core/storage-key.ts';
import { runImmediateTransaction } from './core/transaction.ts';
import {
  assertFencedJobExecution,
  type FencedJobExecution,
} from './domains/jobs/execution-authorization.ts';
import {
  ClientRepository,
  type ClientContactInput,
  type ClientInput,
} from './domains/clients/client-repository.ts';
import { PlanningRepository } from './domains/planning/planning-repository.ts';
import {
  ProjectCommercialPolicyRepository,
  type ProjectCommercialPolicyInput,
} from './domains/commercial/project-commercial-policy-repository.ts';
import { deriveTimeCommercialSlices } from './domains/commercial/time-commercial-slices.ts';
import { CanonicalProjectLegalEntityRepository } from './domains/finance/canonical-project-legal-entity-repository.ts';
import {
  ExpenseCommercialClassificationRepository,
  type ExpenseCommercialClassificationInput,
  type ExpenseCommercialClassificationResult,
} from './domains/finance/expense-commercial-classification-repository.ts';
import { TimeEntryRepository } from './domains/time/time-entry-repository.ts';
import { canonicalCustomerPeriodSnapshot } from './domains/reports/customer-conformity-repository.ts';
import {
  WorkforceRepository,
  type AssignmentInput,
  type AssignmentRemovalInput,
} from './domains/workforce/workforce-repository.ts';
import { V3Repository } from './v3-repository.ts';

export class AccessDeniedError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}
export class ReadinessError extends Error {
  readonly reasons: readonly ReadinessReason[];

  constructor(reasons: readonly ReadinessReason[], message = 'Billing period is not ready') {
    super(message);
    this.reasons = reasons;
  }
}

export type ReadinessReason = Readonly<{
  code: string;
  sourceId?: string;
  deepLink?: string;
}>;

type BillingTimeRow = Readonly<{
  id: string;
  project_id: string;
  worker_id: string;
  work_date: string;
  category: string;
  activity_code: string | null;
  minutes: number;
  activity_summary: string;
  approval_state: string;
  billability_state: string;
  invoice_id: string | null;
  version: number;
}>;

type EffectiveBillingTimePolicy = Readonly<{
  id: string;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
}>;

type BillingTimeSlice = Readonly<{
  row: BillingTimeRow;
  category: 'regular' | 'overtime';
  minutes: number;
  clientBillable: boolean;
  policyId: string | null;
  sliceIndex: number;
}>;

type InvoiceListSourceRow = Readonly<{
  id: string;
  invoice_number: string | null;
  stream_type: string;
  state: string;
  currency: Currency;
  total_minor: number | string;
  period_start: string;
  period_end: string;
  planned_issue_on: string | null;
  expected_collection_on: string | null;
  issued_at: string | null;
  version: number;
  pdf_status: string;
  pdf_generated_at: string | null;
  voided: number;
  client_code: string | null;
  client_number: string;
  client_name: string;
  project_number: string;
  cost_center_code: string | null;
  po_number: string | null;
  [key: string]: unknown;
}>;

type InvoiceListRow = Readonly<InvoiceListSourceRow & { paid_minor: string }>;

type ReportLocale = 'en' | 'pt' | 'es';
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
    throw new ValidationError('Document classification is invalid');
  return classification;
}

type ProjectInput = Readonly<{
  clientId: string;
  costCenterCode?: string;
  name: string;
  description?: string;
  projectAlias?: string;
  timezone: string;
  currency: Currency;
  billingModel:
    | 'tm'
    | 'tm_daily_minimum'
    | 'all_in'
    | 'capped_tm'
    | 'milestone'
    | 'hybrid'
    | 'internal';
  siteName?: string;
  country?: string;
  expectedHoursPerDay?: number | string;
  expectedMinutesPerDay?: number;
  clientDailyMinimumHours?: number | string | null;
  clientDailyMinimumMinutes?: number;
  poNumber?: string;
  contractNumber?: string;
  projectManagerId?: string;
  startDate?: string;
  plannedEndDate?: string;
  budgetType?: string;
  revenueBudgetMinor?: bigint;
  poCapMinor?: bigint;
  fixedPriceMinor?: bigint;
  laborBudgetMinutes?: number;
  travelBudgetMinor?: bigint;
  otherCostBudgetMinor?: bigint;
  weeklyCloseEnabled?: boolean;
  dailyReportRequired?: boolean;
  technicalReportingRequired?: boolean;
  notes?: string;
}>;

type TimeInput = Readonly<{
  projectId: string;
  workDate: string;
  category: string;
  activityCode?: string;
  minutes: number;
  summary: string;
}>;

const shiftIsoDate = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new ValidationError('Invalid ISO date');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

type ExpenseInput = Readonly<{
  projectId: string;
  spentOn: string;
  vendor: string;
  category: string;
  description: string;
  currency: Currency;
  amountMinor: bigint;
  projectCurrencyAmountMinor?: bigint;
  fxRateBps?: number;
  taxAmountMinor?: bigint;
  whoPaid: string;
  /** @deprecated Commercial classification belongs to Finance/Admin. */
  clientTreatment?: 'all_in' | 'reimbursable' | 'non_billable';
  billingTreatment?:
    | 'reimbursable_at_cost'
    | 'reimbursable_plus_markup'
    | 'all_in'
    | 'internal_non_billable'
    | 'client_direct'
    | 'allowance_per_diem'
    | 'informational';
  markupBps?: number;
  paymentMethod?: string;
  receiptRequired: boolean;
  receiptDocumentId?: string;
}>;

type DailyReportInput = Readonly<{
  projectId: string;
  workDate: string;
  siteShift?: string;
  summary: string;
  tasksCompleted: string;
  problemsFound?: string;
  correctiveActions?: string;
  clientDecisions?: string;
  downtimeMinutes: number;
  standbyReason?: string;
  blockers?: string;
  openItems?: string;
  nextDayPlan?: string;
  safetyRelated: boolean;
  customerContact?: string;
}>;

type TechnicalReportInput = Readonly<{
  projectId: string;
  reportDate: string;
  reportDateProvenance?: 'native';
  systemName: string;
  plantSite?: string;
  areaLine?: string;
  stationMachine?: string;
  systemType?: string;
  plcPlatform?: string;
  controller?: string;
  hmiScada?: string;
  networkProtocol?: string;
  softwareVersion?: string;
  programReference?: string;
  changeSummary: string;
  problemSymptom?: string;
  diagnosisRootCause?: string;
  changePerformed?: string;
  safetyRelated: boolean;
  productionImpact?: string;
  validation?: string;
  validationResult?: string;
  openRisk?: string;
  rollbackPlan?: string;
}>;

type TechnicalReportUpdateInput = Omit<
  TechnicalReportInput,
  'reportDate' | 'reportDateProvenance'
> & {
  reportDate?: string;
  reportDateProvenance?: 'native';
};

type LifecycleEntityState =
  | 'active'
  | 'closed'
  | 'archived'
  | 'draft'
  | 'planned'
  | 'paused'
  | 'closing';
type LifecycleTransitionInput = Readonly<{
  id?: string;
  clientId?: string;
  projectId?: string;
  status: LifecycleEntityState | 'restore';
  version?: number;
  reason?: string;
}>;
type DraftRecordType = 'time_entry' | 'expense' | 'daily_report' | 'technical_report';
type DraftDeleteInput = Readonly<{
  recordType: DraftRecordType;
  recordId: string;
  version: number;
  requestId?: string;
}>;
type CorrectionDraftInput = Readonly<{
  recordType: DraftRecordType;
  originalId: string;
  requestId: string;
  reason: string;
  patch?: Readonly<Record<string, unknown>>;
}>;

type InvoiceRow = {
  id: string;
  project_id: string;
  invoice_number: string | null;
  stream_type: string;
  state: string;
  currency: Currency;
  subtotal_minor: string;
  tax_minor: string;
  total_minor: string;
  issued_at: string | null;
  snapshot_json: string | null;
  billing_rule_id: string;
  period_start: string;
  period_end: string;
};

type InvoiceIssueLine = {
  id: string;
  invoice_id: string;
  description: string;
  quantity_numerator: number;
  quantity_denominator: number;
  unit_price_minor: string;
  subtotal_minor: string;
  source_type: string;
  source_id: string;
  snapshot_json: string;
  tax_minor: string | null;
  grouping_key: string | null;
  line_number: number | null;
  line_kind: string | null;
  unit_amount_minor: string | null;
  net_amount_minor: string | null;
  tax_bps: number | null;
  tax_amount_minor: string | null;
  gross_amount_minor: string | null;
  source_bucket_key: string | null;
  rounding_rank: number | null;
  created_at: string | null;
};

type InvoiceIssueManifest = {
  source_type: string;
  source_id: string;
  source_version: number | null;
  disposition: string;
  original_minor: string | null;
  allocated_minor: string | null;
  remaining_minor: string | null;
  reason_code: string;
  source_hash: string | null;
};

type Row = Record<string, string | number | null>;

const CONTROLLED_INVOICE_TEMPLATE_IDS = new Set([
  'labor-detailed',
  'labor-summary',
  'expenses-detailed',
  'fixed-milestone',
  'credit-adjustment',
  'default',
  'fixed-fee',
]);

function controlledInvoiceTemplateId(templateId: string | undefined, streamType: string): string {
  // Adjustment invoices inherit the original billing rule for accounting and
  // numbering context, but their presentation contract is always the
  // controlled credit/adjustment family.
  if (streamType === 'adjustment') return 'credit-adjustment';
  const requested = templateId?.trim() || 'default';
  if (!CONTROLLED_INVOICE_TEMPLATE_IDS.has(requested))
    throw new ValidationError('Unsupported invoice template');
  if (requested === 'fixed-fee') return 'fixed-milestone';
  if (requested !== 'default') return requested;
  if (streamType === 'expense') return 'expenses-detailed';
  if (streamType === 'milestone') return 'fixed-milestone';
  return 'labor-detailed';
}

const now = (): string => new Date().toISOString();
const today = (): string => new Date().toISOString().slice(0, 10);

const malwareScanRequired = (): boolean =>
  process.env.NODE_ENV === 'production' &&
  (process.env.JA_MALWARE_SCANNER_REQUIRED === 'true' ||
    Boolean(process.env.JA_MALWARE_SCANNER_URL));

function safeInteger(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new ValidationError('Money exceeds safe SQLite integer range');
  return result;
}

function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    throw new ValidationError(`${field} must be an ISO date`);
}

function canonicalInstant(value: string, field: string): { iso: string; epochMs: number } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new ValidationError(`${field} must be an ISO datetime with timezone`);
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs))
    throw new ValidationError(`${field} must be an ISO datetime with timezone`);
  return { iso: new Date(epochMs).toISOString(), epochMs };
}

function assertText(value: string, field: string, max = 5000): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new ValidationError(`${field} is required`);
  return trimmed;
}

export class PortalRepository {
  private readonly sqlite: DatabaseSync;
  private readonly clients: ClientRepository;
  private readonly planning: PlanningRepository;
  private readonly commercialPolicies: ProjectCommercialPolicyRepository;
  private readonly expenseClassifications: ExpenseCommercialClassificationRepository;
  private readonly time: TimeEntryRepository;
  private readonly workforce: WorkforceRepository;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
    this.clients = new ClientRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      nextSequence: (scope, scopeId) => this.nextSequence(scope, scopeId),
      now,
      assertText,
      accessDenied: (message) => {
        throw new AccessDeniedError(message);
      },
      conflict: (message) => {
        throw new ConflictError(message);
      },
      validation: (message) => {
        throw new ValidationError(message);
      },
    });
    this.workforce = new WorkforceRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now,
      assertText,
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
    this.planning = new PlanningRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      assertDate,
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now,
      assertText,
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
    this.time = new TimeEntryRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      assertCanReview: (principal, projectId) =>
        this.assertOperationalReviewer(principal, projectId),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      assertDate,
      assertText,
      shiftIsoDate,
      now,
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
    this.commercialPolicies = new ProjectCommercialPolicyRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      assertActive: (principal) => this.assertActive(principal),
      assertReadable: (principal) => this.assertReadable(principal),
      audit: (principal, action, entityType, entityId, details) =>
        this.audit(principal, action, entityType, entityId, details),
      now,
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
    const canonicalProjectLegalEntities = new CanonicalProjectLegalEntityRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      now,
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
    this.expenseClassifications = new ExpenseCommercialClassificationRepository({
      sqlite,
      transaction: (work) => this.transaction(work),
      now,
      resolveCanonicalProjectLegalEntity: (principal, projectId, onDate) =>
        canonicalProjectLegalEntities.resolveCanonicalProjectLegalEntity(
          principal,
          projectId,
          onDate,
        ),
      errors: {
        accessDenied: (message) => {
          throw new AccessDeniedError(message);
        },
        conflict: (message) => {
          throw new ConflictError(message);
        },
        validation: (message) => {
          throw new ValidationError(message);
        },
      },
    });
  }

  private assertOperationalReviewer(principal: Principal, projectId: string): void {
    this.assertActive(principal);
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') return;
    if (principal.role !== 'project_manager' || !principal.projectIds.has(projectId))
      throw new AccessDeniedError('Project review required');
    const current = today();
    const membership = this.sqlite
      .prepare(
        `SELECT 1 FROM project_member
          WHERE project_id=? AND user_id=? AND status='active' AND can_review=1
            AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)
          LIMIT 1`,
      )
      .get(projectId, principal.userId, current, current);
    if (!membership) throw new AccessDeniedError('Project review required');
  }

  private transaction<T>(work: () => T): T {
    return runImmediateTransaction(this.sqlite, 'portal', work);
  }

  private assertActive(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    if (principal.role === 'auditor_read_only') throw new AccessDeniedError('Read-only role');
  }

  private assertReadable(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
  }

  private assertStepUp(principal: Principal): void {
    assertRecentStepUp(this.sqlite, principal, AccessDeniedError);
  }

  private audit(
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ): void {
    recordAuditEvent(this.sqlite, principal, action, entityType, entityId, details);
  }

  private nextSequence(scope: string, scopeId: string): number {
    return nextNumberSequence(this.sqlite, scope, scopeId);
  }

  private enqueueDurableJob(
    kind: string,
    idempotencyKey: string,
    payload: unknown,
    runAfter = now(),
  ): { id: string; created: boolean } {
    return new V3Repository(this.sqlite).enqueueJob(kind, idempotencyKey, payload, runAfter);
  }

  private deploymentIdentity(): { tenantId: string; deploymentId: string } {
    const identity = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!identity) throw new ValidationError('Deployment identity is not configured');
    return { tenantId: identity.tenant_id, deploymentId: identity.deployment_id };
  }

  private appendLifecycleEvent(
    principal: Principal,
    entityType: 'client' | 'project',
    entityId: string,
    fromState: LifecycleEntityState,
    toState: LifecycleEntityState,
    versionBefore: number,
    reason: string | undefined,
  ): void {
    const identity = this.deploymentIdentity();
    this.sqlite
      .prepare(
        `INSERT INTO entity_lifecycle_event(
           id,tenant_id,entity_type,entity_id,from_state,to_state,actor_user_id,reason,
           version_before,version_after,occurred_at,correlation_id,provenance
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'native')`,
      )
      .run(
        newId(),
        identity.tenantId,
        entityType,
        entityId,
        fromState,
        toState,
        principal.userId,
        reason ?? null,
        versionBefore,
        versionBefore + 1,
        now(),
        principal.correlationId ?? newId(),
      );
  }

  private lifecycleTarget(
    entityType: 'client' | 'project',
    entityId: string,
    currentState: LifecycleEntityState,
    requested: LifecycleEntityState | 'restore',
  ): LifecycleEntityState {
    if (requested !== 'restore') return requested;
    if (currentState !== 'archived')
      throw new ConflictError('Only archived records can be restored');
    const previous = this.sqlite
      .prepare(
        `SELECT from_state FROM entity_lifecycle_event
         WHERE entity_type=? AND entity_id=? AND to_state='archived' AND from_state IS NOT NULL
         ORDER BY version_after DESC LIMIT 1`,
      )
      .get(entityType, entityId) as { from_state: LifecycleEntityState } | undefined;
    if (!previous?.from_state)
      throw new ConflictError('Archived record has no safe restore target');
    if (entityType === 'client' && !['active', 'closed'].includes(previous.from_state))
      throw new ConflictError('Archived client has no safe restore target');
    return previous.from_state;
  }

  private assertLifecycleTransition(
    entityType: 'client' | 'project',
    fromState: LifecycleEntityState,
    toState: LifecycleEntityState,
  ): void {
    const allowed =
      entityType === 'client'
        ? ({
            active: ['closed', 'archived'],
            closed: ['active', 'archived'],
            archived: ['active', 'closed'],
          } as const)
        : ({
            draft: ['planned', 'active', 'archived'],
            planned: ['active', 'paused', 'archived'],
            active: ['paused', 'closing'],
            paused: ['active', 'closing'],
            closing: ['closed'],
            closed: ['archived'],
            archived: ['draft', 'planned', 'closed'],
          } as const);
    if (!allowed[fromState]?.includes(toState as never))
      throw new ConflictError(`Invalid ${entityType} lifecycle transition`);
  }

  private activeLegalEntity(
    legalEntityId: string,
    purpose = 'new billing',
  ): { id: string; currency: Currency } {
    const entity = this.sqlite
      .prepare('SELECT id,currency,status FROM legal_entity WHERE id=?')
      .get(legalEntityId) as { id: string; currency: Currency; status: string } | undefined;
    if (!entity) throw new ValidationError('Legal entity not found');
    if (entity.status !== 'active')
      throw new ValidationError(`Archived legal entity cannot be used for ${purpose}`);
    return { id: entity.id, currency: entity.currency };
  }

  private assertLegalEntityCurrencyChangeAllowed(
    legalEntityId: string,
    currentCurrency: Currency,
    nextCurrency: Currency,
  ): void {
    if (currentCurrency === nextCurrency) return;

    const activeTaxProfile = this.sqlite
      .prepare(
        "SELECT id FROM tax_profile WHERE legal_entity_id=? AND status='active' AND currency<>? LIMIT 1",
      )
      .get(legalEntityId, nextCurrency) as { id: string } | undefined;
    if (activeTaxProfile)
      throw new ConflictError(
        'Cannot change legal entity currency while an active tax profile uses the current currency; archive or supersede the profile first',
      );

    const activeBillingRule = this.sqlite
      .prepare(
        'SELECT id FROM billing_rule WHERE legal_entity_id=? AND enabled=1 AND currency<>? LIMIT 1',
      )
      .get(legalEntityId, nextCurrency) as { id: string } | undefined;
    if (activeBillingRule)
      throw new ConflictError(
        'Cannot change legal entity currency while an active billing rule uses the current currency; archive or supersede the rule first',
      );

    const openBillingPeriod = this.sqlite
      .prepare(
        `SELECT bp.id FROM billing_period bp
         JOIN billing_rule br ON br.id=bp.billing_rule_id
         WHERE br.legal_entity_id=? AND bp.state IN ('ready','incomplete','blocked') LIMIT 1`,
      )
      .get(legalEntityId) as { id: string } | undefined;
    if (openBillingPeriod)
      throw new ConflictError(
        'Cannot change legal entity currency while a billing period is in progress; close the period first',
      );

    const openAccountingPeriod = this.sqlite
      .prepare("SELECT id FROM accounting_period WHERE legal_entity_id=? AND state='open' LIMIT 1")
      .get(legalEntityId) as { id: string } | undefined;
    if (openAccountingPeriod)
      throw new ConflictError(
        'Cannot change legal entity currency while an accounting period is open; close the period first',
      );

    const activeAccountingPack = this.sqlite
      .prepare(
        "SELECT id FROM accounting_pack_run WHERE legal_entity_id=? AND state IN ('draft','review') LIMIT 1",
      )
      .get(legalEntityId) as { id: string } | undefined;
    if (activeAccountingPack)
      throw new ConflictError(
        'Cannot change legal entity currency while an accounting pack is under review; finalize or discard the pack first',
      );

    const invoiceHistory = this.sqlite
      .prepare(
        `SELECT i.id FROM invoice i
         JOIN billing_rule br ON br.id=i.billing_rule_id
         WHERE br.legal_entity_id=? LIMIT 1`,
      )
      .get(legalEntityId) as { id: string } | undefined;
    if (invoiceHistory)
      throw new ConflictError(
        'Cannot change legal entity currency after invoice history exists; create a successor legal entity to preserve the ledger',
      );
  }

  principalFor(userId: string, sessionId?: string, correlationId?: string): Principal {
    const user = this.sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(userId) as
      | { role: Role; status: string }
      | undefined;
    if (!user || user.status !== 'active') throw new AccessDeniedError('Active account required');
    const asOf = today();
    const projects = this.sqlite
      .prepare(
        "SELECT pm.project_id FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.status IN ('active','planned','paused') AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)",
      )
      .all(userId, asOf, asOf) as Array<{ project_id: string }>;
    return {
      userId,
      role: user.role,
      sessionId,
      correlationId,
      projectIds: new Set(projects.map((row) => row.project_id)),
    };
  }

  createClient(principal: Principal, input: ClientInput) {
    return this.clients.createClient(principal, input);
  }

  createClientContact(
    principal: Principal,
    input: Readonly<{
      clientId: string;
      name: string;
      email?: string;
      phone?: string;
      role?: string;
      isBillingContact?: boolean;
      isPrimary?: boolean;
    }>,
  ) {
    return this.clients.createClientContact(principal, input);
  }

  listClientContacts(principal: Principal, clientId: string) {
    return this.clients.listClientContacts(principal, clientId);
  }

  listAllClientContacts(principal: Principal) {
    return this.clients.listAllClientContacts(principal);
  }

  deleteClient(principal: Principal, clientId: string) {
    return this.clients.deleteClient(principal, clientId);
  }

  deleteProject(principal: Principal, projectId: string) {
    this.assertActive(principal);
    if (!canManageClients(principal))
      throw new AccessDeniedError('Project administration required');
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT id, project_number, name FROM project WHERE id=?')
        .get(projectId) as { id: string; project_number: string; name: string } | undefined;
      if (!existing) throw new ValidationError('Project not found');

      const timeCount = this.sqlite
        .prepare('SELECT COUNT(*) AS count FROM time_entry WHERE project_id=?')
        .get(projectId) as { count: number } | undefined;
      if ((timeCount?.count ?? 0) > 0) {
        throw new ConflictError(
          'Project has recorded time entries and cannot be deleted. Please archive the project instead.',
        );
      }

      const expenseCount = this.sqlite
        .prepare('SELECT COUNT(*) AS count FROM expense WHERE project_id=?')
        .get(projectId) as { count: number } | undefined;
      if ((expenseCount?.count ?? 0) > 0) {
        throw new ConflictError(
          'Project has recorded expenses and cannot be deleted. Please archive the project instead.',
        );
      }

      const invoiceCount = this.sqlite
        .prepare('SELECT COUNT(*) AS count FROM invoice WHERE project_id=?')
        .get(projectId) as { count: number } | undefined;
      if ((invoiceCount?.count ?? 0) > 0) {
        throw new ConflictError(
          'Project has generated invoices and cannot be deleted. Please archive the project instead.',
        );
      }

      const dailyReportCount = this.sqlite
        .prepare('SELECT COUNT(*) AS count FROM daily_report WHERE project_id=?')
        .get(projectId) as { count: number } | undefined;
      if ((dailyReportCount?.count ?? 0) > 0) {
        throw new ConflictError(
          'Project has recorded daily field reports and cannot be deleted. Please archive the project instead.',
        );
      }

      const techReportCount = this.sqlite
        .prepare('SELECT COUNT(*) AS count FROM technical_report WHERE project_id=?')
        .get(projectId) as { count: number } | undefined;
      if ((techReportCount?.count ?? 0) > 0) {
        throw new ConflictError(
          'Project has recorded technical reports and cannot be deleted. Please archive the project instead.',
        );
      }

      this.sqlite.prepare('UPDATE project SET expected_schedule_id=NULL WHERE id=?').run(projectId);
      try {
        this.sqlite
          .prepare(
            'DELETE FROM assignment_rate_override WHERE project_member_id IN (SELECT id FROM project_member WHERE project_id=?)',
          )
          .run(projectId);
      } catch {
        // Compatibility cleanup: older schemas may not contain assignment overrides.
      }
      this.sqlite.prepare('DELETE FROM schedule WHERE project_id=?').run(projectId);
      this.sqlite.prepare('DELETE FROM planning_assignment WHERE project_id=?').run(projectId);
      this.sqlite.prepare('DELETE FROM project_member WHERE project_id=?').run(projectId);
      this.sqlite.prepare('DELETE FROM compensation_rule WHERE project_id=?').run(projectId);
      this.sqlite.prepare('DELETE FROM billing_rule WHERE project_id=?').run(projectId);
      this.sqlite.prepare('DELETE FROM billing_lock WHERE project_id=?').run(projectId);
      try {
        this.sqlite.prepare('DELETE FROM project_milestone WHERE project_id=?').run(projectId);
      } catch {
        // Compatibility cleanup: older schemas may not contain project milestones.
      }
      try {
        this.sqlite
          .prepare('DELETE FROM project_commercial_policy_binding WHERE project_id=?')
          .run(projectId);
      } catch {
        // Compatibility cleanup: the commercial-policy binding is additive.
      }
      try {
        this.sqlite
          .prepare('UPDATE audit_event SET project_id=NULL WHERE project_id=?')
          .run(projectId);
      } catch {
        // Legacy audit schemas may not expose project_id; audit rows remain immutable.
      }

      const deleted = this.sqlite.prepare('DELETE FROM project WHERE id=?').run(projectId);
      if (deleted.changes !== 1) throw new ConflictError('Project changed before deletion');

      this.audit(principal, 'lifecycle.transition', 'project', projectId, {
        fromState: 'active',
        toState: 'deleted',
        reason: 'Hard delete empty project',
        projectNumber: existing.project_number,
        name: existing.name,
      });
      return { id: projectId, projectNumber: existing.project_number };
    });
  }

  createProject(principal: Principal, input: ProjectInput) {
    this.assertActive(principal);
    if (!canManageClients(principal))
      throw new AccessDeniedError('Project administration required');
    return this.transaction(() => {
      const client = this.sqlite
        .prepare('SELECT client_number,currency FROM client WHERE id=? AND status=?')
        .get(input.clientId, 'active') as { client_number: string; currency: Currency } | undefined;
      if (!client) throw new ValidationError('Active client not found');
      if (client.currency !== input.currency)
        throw new ValidationError('Project currency must match the client currency');
      const expectedMinutes =
        input.expectedHoursPerDay !== undefined && input.expectedHoursPerDay !== ''
          ? Math.round(Number(input.expectedHoursPerDay) * 60)
          : (input.expectedMinutesPerDay ?? 600);
      if (!Number.isInteger(expectedMinutes) || expectedMinutes < 0 || expectedMinutes > 1440)
        throw new ValidationError('Expected working hours must be between 0 and 24 hours');
      const clientDailyMinimumMinutes =
        input.clientDailyMinimumHours !== undefined
          ? input.clientDailyMinimumHours === null || input.clientDailyMinimumHours === ''
            ? null
            : Math.round(Number(input.clientDailyMinimumHours) * 60)
          : (input.clientDailyMinimumMinutes ?? null);
      if (
        clientDailyMinimumMinutes !== null &&
        (!Number.isInteger(clientDailyMinimumMinutes) ||
          clientDailyMinimumMinutes < 0 ||
          clientDailyMinimumMinutes > 1440)
      )
        throw new ValidationError('Client daily minimum must be between 0 and 24 hours');
      const projectManagerId = input.projectManagerId || null;
      if (projectManagerId) {
        const manager = this.sqlite
          .prepare("SELECT 1 FROM user WHERE id=? AND role='project_manager' AND status='active'")
          .get(projectManagerId);
        if (!manager) throw new ValidationError('Active project manager not found');
      }
      const startDate = input.startDate || today();
      assertDate(startDate, 'Project start date');
      if (input.plannedEndDate) {
        assertDate(input.plannedEndDate, 'Planned end date');
        if (input.plannedEndDate < startDate)
          throw new ValidationError('Planned end date must follow the project start date');
      }
      const budgets = [
        input.revenueBudgetMinor,
        input.poCapMinor,
        input.fixedPriceMinor,
        input.travelBudgetMinor,
        input.otherCostBudgetMinor,
      ];
      if (budgets.some((value) => value !== undefined && value < 0n))
        throw new ValidationError('Project budgets cannot be negative');
      if (
        input.laborBudgetMinutes !== undefined &&
        (!Number.isInteger(input.laborBudgetMinutes) || input.laborBudgetMinutes < 0)
      )
        throw new ValidationError('Labor budget minutes are invalid');
      const sequence = this.nextSequence('project', input.clientId);
      const projectNumber = `${client.client_number}-P-${String(sequence).padStart(3, '0')}`;
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO project(id,project_number,cost_center_code,client_id,name,timezone,currency,status,billing_model,site_name,country,project_manager_id,expected_minutes_per_day,client_daily_minimum_minutes,po_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          projectNumber,
          input.costCenterCode?.trim()
            ? assertText(input.costCenterCode.trim(), 'Cost center code', 120)
            : null,
          input.clientId,
          assertText(input.name, 'Project name', 200),
          input.timezone,
          input.currency,
          'active',
          input.billingModel,
          input.siteName ?? null,
          input.country ?? null,
          principal.role === 'project_manager' ? principal.userId : projectManagerId,
          expectedMinutes,
          clientDailyMinimumMinutes,
          input.poNumber ?? null,
          timestamp,
          timestamp,
        );
      const scheduleId = newId();
      this.sqlite
        .prepare(
          'INSERT INTO schedule(id,project_id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          scheduleId,
          id,
          input.timezone,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          expectedMinutes,
          0,
          startDate,
        );
      this.sqlite
        .prepare(
          `UPDATE project SET description=?,project_alias=?,start_date=?,planned_end_date=?,
             contract_number=?,budget_type=?,revenue_budget_minor=?,po_cap_minor=?,
             fixed_price_minor=?,
             labor_budget_minutes=?,travel_budget_minor=?,other_cost_budget_minor=?,
             budget_minor=?,planned_minutes=?,weekly_close_enabled=?,daily_report_required=?,
             technical_reporting_required=?,notes=?,expected_schedule_id=?,updated_at=? WHERE id=?`,
        )
        .run(
          input.description?.trim() || null,
          input.projectAlias?.trim() || null,
          startDate,
          input.plannedEndDate || null,
          input.contractNumber?.trim() || null,
          input.budgetType ?? 'none',
          input.revenueBudgetMinor === undefined ? null : safeInteger(input.revenueBudgetMinor),
          input.poCapMinor === undefined ? null : safeInteger(input.poCapMinor),
          input.fixedPriceMinor === undefined ? null : safeInteger(input.fixedPriceMinor),
          input.laborBudgetMinutes ?? null,
          input.travelBudgetMinor === undefined ? null : safeInteger(input.travelBudgetMinor),
          input.otherCostBudgetMinor === undefined ? null : safeInteger(input.otherCostBudgetMinor),
          input.revenueBudgetMinor !== undefined
            ? safeInteger(input.revenueBudgetMinor)
            : input.poCapMinor !== undefined
              ? safeInteger(input.poCapMinor)
              : null,
          input.laborBudgetMinutes ?? null,
          input.weeklyCloseEnabled ? 1 : 0,
          input.dailyReportRequired ? 1 : 0,
          input.technicalReportingRequired ? 1 : 0,
          input.notes?.trim() || null,
          scheduleId,
          timestamp,
          id,
        );
      if (projectManagerId) {
        const activeMembership = this.sqlite
          .prepare(
            "SELECT id,starts_on FROM project_member WHERE project_id=? AND user_id=? AND assignment_role='project_manager' AND status='active' ORDER BY starts_on,id LIMIT 1",
          )
          .get(id, projectManagerId) as { id: string; starts_on: string } | undefined;
        const exactMembership = activeMembership
          ? undefined
          : (this.sqlite
              .prepare(
                "SELECT id,starts_on FROM project_member WHERE project_id=? AND user_id=? AND assignment_role='project_manager' AND starts_on=? LIMIT 1",
              )
              .get(id, projectManagerId, startDate) as
              | { id: string; starts_on: string }
              | undefined);
        const membership = activeMembership ?? exactMembership;
        if (membership) {
          this.sqlite
            .prepare(
              "UPDATE project_member SET assignment_role='project_manager',ends_on=NULL,can_review=1,status='active',updated_at=?,version=version+1 WHERE id=?",
            )
            .run(timestamp, membership.id);
          this.audit(principal, 'assignment.update', 'project_member', membership.id, {
            projectId: id,
            workerId: projectManagerId,
            assignmentRole: 'project_manager',
            canReview: true,
          });
        } else {
          const membershipId = newId();
          this.sqlite
            .prepare(
              'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              membershipId,
              id,
              projectManagerId,
              'project_manager',
              startDate,
              null,
              null,
              1,
              'active',
              timestamp,
              timestamp,
            );
          this.audit(principal, 'assignment.create', 'project_member', membershipId, {
            projectId: id,
            workerId: projectManagerId,
            assignmentRole: 'project_manager',
            canReview: true,
          });
        }
      }
      this.audit(principal, 'project.create', 'project', id, { projectNumber });
      return { id, projectNumber };
    });
  }

  createProjectCommercialPolicy(principal: Principal, input: ProjectCommercialPolicyInput) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    return this.commercialPolicies.createProjectCommercialPolicy(principal, input);
  }

  listProjectCommercialPolicies(principal: Principal, projectId: string) {
    return this.commercialPolicies.listProjectCommercialPolicies(principal, projectId);
  }

  resolveProjectCommercialPolicy(principal: Principal, projectId: string, onDate: string) {
    return this.commercialPolicies.resolveProjectCommercialPolicy(principal, projectId, onDate);
  }

  listProjectSchedule(principal: Principal, projectId: string) {
    this.assertProjectObjectAccess(principal, projectId);
    return this.planning.listProjectSchedule(principal, projectId);
  }

  updateProjectSchedule(
    principal: Principal,
    input: Readonly<{
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
    }>,
  ) {
    return this.planning.updateProjectSchedule(principal, input);
  }

  listSkills(principal: Principal) {
    return this.workforce.listSkills(principal);
  }

  createSkill(principal: Principal, input: Readonly<{ code: string; name: string }>) {
    return this.workforce.createSkill(principal, input);
  }

  setWorkerSkill(
    principal: Principal,
    input: Readonly<{ workerId: string; skillId: string; proficiency: number }>,
  ): void {
    return this.workforce.setWorkerSkill(principal, input);
  }

  listWorkerSkills(principal: Principal, workerId?: string) {
    return this.workforce.listWorkerSkills(principal, workerId);
  }

  setWorkerAvailability(
    principal: Principal,
    input: Readonly<{
      workerId: string;
      startsAt: string;
      endsAt: string;
      availability: 'available' | 'unavailable' | 'tentative';
      note?: string;
    }>,
  ) {
    return this.workforce.setWorkerAvailability(principal, input);
  }

  listWorkerAvailability(principal: Principal, workerId?: string) {
    return this.workforce.listWorkerAvailability(principal, workerId);
  }

  createProjectMilestone(
    principal: Principal,
    input: Readonly<{
      projectId: string;
      name: string;
      description?: string;
      amountMinor: bigint;
      dueOn?: string;
    }>,
  ) {
    this.assertActive(principal);
    if (!canManageAssignments(principal, input.projectId))
      throw new AccessDeniedError('Project milestone administration required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    if (input.dueOn) assertDate(input.dueOn, 'Milestone date');
    if (input.amountMinor <= 0n) throw new ValidationError('Milestone amount must be positive');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        "INSERT INTO project_milestone(id,project_id,name,description,amount_minor,currency,due_on,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?)",
      )
      .run(
        id,
        input.projectId,
        assertText(input.name, 'Milestone name', 200),
        input.description?.trim() || null,
        safeInteger(input.amountMinor),
        project.currency,
        input.dueOn ?? null,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'milestone.create', 'project_milestone', id, {
      projectId: input.projectId,
      amountMinor: input.amountMinor.toString(),
    });
    return { id, version: 1 };
  }

  listMilestonesForReview(principal: Principal) {
    this.assertReadable(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'project_manager' &&
      principal.role !== 'auditor_read_only'
    )
      throw new AccessDeniedError('Milestone review access required');
    const current = today();
    const projectIds =
      principal.role === 'project_manager'
        ? (
            this.sqlite
              .prepare(
                `SELECT project_id FROM project_member
                  WHERE user_id=? AND status='active' AND can_review=1
                    AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)
                  ORDER BY project_id`,
              )
              .all(principal.userId, current, current) as Array<{ project_id: string }>
          )
            .map((row) => row.project_id)
            .filter((projectId) => principal.projectIds.has(projectId))
        : [];
    if (principal.role === 'project_manager' && projectIds.length === 0) return [];
    const restriction = projectIds.length
      ? ` AND pm.project_id IN (${projectIds.map(() => '?').join(',')})`
      : '';
    return this.sqlite
      .prepare(
        `SELECT pm.id,pm.project_id,pm.name,pm.description,pm.amount_minor,pm.currency,pm.due_on,pm.approval_state,pm.version,
                p.project_number,p.name project_name
         FROM project_milestone pm JOIN project p ON p.id=pm.project_id
         WHERE pm.approval_state='submitted'${restriction} ORDER BY pm.due_on,pm.id`,
      )
      .all(...projectIds);
  }

  submitProjectMilestone(principal: Principal, milestoneId: string, version: number): void {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare('SELECT project_id,approval_state FROM project_milestone WHERE id=? AND version=?')
      .get(milestoneId, version) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw new ConflictError('Milestone changed or not found');
    if (!canManageAssignments(principal, row.project_id))
      throw new AccessDeniedError('Project milestone administration required');
    const result = this.sqlite
      .prepare(
        "UPDATE project_milestone SET approval_state='submitted',updated_at=?,version=version+1 WHERE id=? AND version=? AND approval_state IN ('draft','rejected')",
      )
      .run(now(), milestoneId, version);
    if (result.changes !== 1) throw new ConflictError('Milestone cannot be submitted');
  }

  reviewProjectMilestone(
    principal: Principal,
    milestoneId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): void {
    if (decision === 'rejected' && !reason?.trim())
      throw new ValidationError('A rejection reason is required');
    this.transaction(() => {
      this.assertActive(principal);
      const row = this.sqlite
        .prepare(
          `SELECT pm.project_id,pm.approval_state,p.status project_status
             FROM project_milestone pm
             JOIN project p ON p.id=pm.project_id
            WHERE pm.id=?`,
        )
        .get(milestoneId) as
        | { project_id: string; approval_state: string; project_status: string }
        | undefined;
      if (!row) throw new ValidationError('Milestone not found');
      this.assertOperationalReviewer(principal, row.project_id);
      if (row.project_status !== 'active')
        throw new AccessDeniedError('Active project required for milestone review');
      if (row.approval_state !== 'submitted')
        throw new ConflictError('Submitted milestone required');
      const timestamp = now();
      const result = this.sqlite
        .prepare(
          "UPDATE project_milestone SET approval_state=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='submitted'",
        )
        .run(
          decision,
          decision === 'approved' ? principal.userId : null,
          decision === 'approved' ? timestamp : null,
          timestamp,
          milestoneId,
        );
      if (result.changes !== 1) throw new ConflictError('Submitted milestone required');
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'milestone',
          milestoneId,
          row.approval_state,
          decision,
          principal.userId,
          reason ?? null,
          timestamp,
        );
      this.audit(principal, `milestone.${decision}`, 'project_milestone', milestoneId, {
        reason: reason ?? null,
      });
    });
  }

  assignWorker(
    principal: Principal,
    input: {
      projectId: string;
      workerId: string;
      startsOn: string;
      endsOn?: string;
      plannedMinutes?: number;
      canReview?: boolean;
    },
  ) {
    return this.workforce.assignWorker(principal, input);
  }

  createTimeEntry(principal: Principal, input: TimeInput) {
    if (principal.role !== 'owner_admin')
      this.assertProjectMembership(principal, input.projectId, input.workDate);
    return this.time.createTimeEntry(principal, input);
  }

  submitTime(principal: Principal, id: string, baseVersion: number) {
    this.assertActive(principal);
    const scope = this.sqlite
      .prepare('SELECT project_id,worker_id,work_date FROM time_entry WHERE id=?')
      .get(id) as { project_id: string; worker_id: string; work_date: string } | undefined;
    if (!scope) throw new ValidationError('Time entry not found');
    this.assertProjectObjectAccess(principal, scope.project_id, scope.work_date, scope.worker_id);
    return this.time.submitTime(principal, id, baseVersion);
  }

  updateTimeEntry(
    principal: Principal,
    input: Readonly<{
      id: string;
      version: number;
      workDate?: string;
      category?: string;
      activityCode?: string;
      minutes?: number;
      summary?: string;
      site?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
    }>,
  ) {
    this.assertActive(principal);
    const scope = this.sqlite
      .prepare('SELECT project_id,worker_id,work_date FROM time_entry WHERE id=?')
      .get(input.id) as { project_id: string; worker_id: string; work_date: string } | undefined;
    if (!scope) throw new ValidationError('Time entry not found');
    this.assertProjectObjectAccess(
      principal,
      scope.project_id,
      input.workDate ?? scope.work_date,
      scope.worker_id,
    );
    return this.time.updateTimeEntry(principal, input);
  }

  operationalApproveTime(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ) {
    return this.time.operationalApproveTime(principal, id, decision, reason);
  }

  financeApproveTime(principal: Principal, id: string, billable: boolean) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE time_entry SET billability_state=?,finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='approved' AND invoice_id IS NULL AND billing_status='unlocked'",
      )
      .run(billable ? 'billable' : 'non_billable', principal.userId, timestamp, timestamp, id);
    if (result.changes !== 1) throw new ConflictError('Approved unlocked time required');
    this.audit(principal, 'time.finance_review', 'time_entry', id, { billable });
  }

  private assertProjectMembership(principal: Principal, projectId: string, onDate = today()): void {
    if (principal.role === 'owner_admin') return;
    const project = this.sqlite
      .prepare("SELECT status FROM project WHERE id=? AND status IN ('active','planned','paused')")
      .get(projectId) as { status: string } | undefined;
    if (!project) throw new AccessDeniedError('Operational project access required');
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 ok FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
      )
      .get(projectId, principal.userId, onDate, onDate);
    if (!assignment) throw new AccessDeniedError('Active project assignment required');
  }

  /**
   * Project-scoped object access is intentionally stricter than the project
   * id set carried by a Principal.  Principals can outlive an assignment
   * update (for example, a long-lived request or an offline client), so every
   * sensitive object read/write rechecks the current assignment in SQLite.
   * The object date is checked as well so a record outside the assignment
   * interval cannot be used as an IDOR escape hatch.
   */
  private hasEffectiveProjectObjectAccess(
    principal: Principal,
    projectId: string,
    objectDate = today(),
  ): boolean {
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return true;
    if (!principal.projectIds.has(projectId)) return false;
    const current = today();
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.status IN ('active','planned','paused') AND pm.project_id=? AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1",
      )
      .get(projectId, principal.userId, current, current, objectDate, objectDate);
    return Boolean(assignment);
  }

  private assertProjectObjectAccess(
    principal: Principal,
    projectId: string,
    objectDate = today(),
    ownerId?: string,
  ): void {
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return;
    if (
      !this.hasEffectiveProjectObjectAccess(principal, projectId, objectDate) ||
      (principal.role === 'worker' && ownerId !== undefined && ownerId !== principal.userId)
    )
      throw new AccessDeniedError('Project assignment access required');
  }

  private canSeeFinanceFields(principal: Principal): boolean {
    return (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    );
  }

  createDailyReport(principal: Principal, input: DailyReportInput) {
    this.assertActive(principal);
    assertDate(input.workDate, 'Work date');
    this.assertProjectMembership(principal, input.projectId, input.workDate);
    if (
      !Number.isInteger(input.downtimeMinutes) ||
      input.downtimeMinutes < 0 ||
      input.downtimeMinutes > 1440
    )
      throw new ValidationError('Downtime must be between 0 and 1440 minutes');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO daily_report(id,project_id,worker_id,work_date,site_shift,summary,tasks_completed,problems_found,corrective_actions,client_decisions,downtime_minutes,standby_reason,blockers,open_items,next_day_plan,safety_related,customer_contact,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.workDate,
        input.siteShift ?? null,
        assertText(input.summary, 'Summary'),
        assertText(input.tasksCompleted, 'Tasks completed'),
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
        timestamp,
        timestamp,
      );
    this.audit(principal, 'daily_report.create', 'daily_report', id, {
      projectId: input.projectId,
      workDate: input.workDate,
    });
    return { id, version: 1 };
  }

  createTechnicalReport(principal: Principal, input: TechnicalReportInput) {
    this.assertActive(principal);
    assertDate(input.reportDate, 'Report date');
    // Technical reports are historical operational records.  Membership is
    // evaluated against the report's native date, rather than the wall-clock
    // date at which a client happens to submit it.
    this.assertProjectMembership(principal, input.projectId, input.reportDate);
    if (input.reportDateProvenance !== undefined && input.reportDateProvenance !== 'native')
      throw new ValidationError('Technical report date provenance must be native');
    if (input.safetyRelated && (!input.validation || !input.rollbackPlan))
      throw new ValidationError('Safety-related changes require validation and rollback details');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO technical_report(id,project_id,author_id,system_name,plant_site,area_line,station_machine,system_type,plc_platform,controller,hmi_scada,network_protocol,software_version,program_reference,change_summary,safety_related,production_impact,validation,validation_result,open_risk,rollback_plan,report_date,report_date_provenance,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        assertText(input.systemName, 'System name', 200),
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
        assertText(input.changeSummary, 'Change summary'),
        input.safetyRelated ? 1 : 0,
        input.productionImpact ?? null,
        input.validation ?? null,
        input.validationResult ?? null,
        input.openRisk ?? null,
        input.rollbackPlan ?? null,
        input.reportDate,
        input.reportDateProvenance ?? 'native',
        'draft',
        timestamp,
        timestamp,
      );
    this.audit(principal, 'technical_report.create', 'technical_report', id, {
      projectId: input.projectId,
      reportDate: input.reportDate,
      safetyRelated: input.safetyRelated,
    });
    return { id, version: 1 };
  }

  private reportSourceType(type: 'daily' | 'technical'): string {
    return `${type}_report`;
  }

  private reportIsLocked(type: 'daily' | 'technical', id: string): boolean {
    return Boolean(
      this.sqlite
        .prepare(
          "SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type=? AND rs.source_id=? AND pr.state='final' LIMIT 1",
        )
        .get(this.reportSourceType(type), id),
    );
  }

  private canViewReport(
    principal: Principal,
    projectId: string,
    ownerId: string,
    objectDate = today(),
  ): boolean {
    if (
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
    )
      return true;
    if (!this.hasEffectiveProjectObjectAccess(principal, projectId, objectDate)) return false;
    if (principal.role === 'project_manager') return true;
    return principal.role === 'worker' && principal.userId === ownerId;
  }

  private canMutateReport(
    principal: Principal,
    projectId: string,
    ownerId: string,
    objectDate = today(),
  ): boolean {
    if (principal.role === 'auditor_read_only') return false;
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') return true;
    if (!this.hasEffectiveProjectObjectAccess(principal, projectId, objectDate)) return false;
    if (principal.role === 'project_manager') return true;
    return principal.role === 'worker' && principal.userId === ownerId;
  }

  private reportNotificationRecipients(projectId: string, actorId: string) {
    const candidates = this.sqlite
      .prepare(
        "SELECT id,role FROM user WHERE status='active' AND role IN ('owner_admin','finance_admin','project_manager')",
      )
      .all() as Array<{ id: string; role: string }>;
    return candidates.filter((candidate) => {
      if (candidate.id === actorId) return false;
      if (candidate.role === 'project_manager')
        return Boolean(
          this.sqlite
            .prepare(
              "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
            )
            .get(projectId, candidate.id),
        );
      return true;
    });
  }

  private notifyReportChanged(
    principal: Principal,
    type: 'daily' | 'technical',
    reportId: string,
    projectId: string,
    changedFields: readonly string[],
    action: 'report_modified' | 'report_deleted',
    occurredAt: string,
  ): void {
    for (const recipient of this.reportNotificationRecipients(projectId, principal.userId))
      this.sqlite
        .prepare(
          'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), recipient.id, action, reportId, occurredAt);
    this.audit(principal, `report.${action}`, this.reportSourceType(type), reportId, {
      projectId,
      changedFields,
    });
  }

  reportDetail(principal: Principal, id: string) {
    this.assertReadable(principal);
    const daily = this.sqlite
      .prepare(
        `SELECT 'daily' type,d.*,p.project_number,p.name project_name,p.site_name,p.client_id,
                u.name author_name,u.email author_email
         FROM daily_report d JOIN project p ON p.id=d.project_id JOIN user u ON u.id=d.worker_id
         WHERE d.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    const technical = this.sqlite
      .prepare(
        `SELECT 'technical' type,t.*,t.author_id owner_id,p.project_number,p.name project_name,
                p.site_name,p.client_id,u.name author_name,u.email author_email
         FROM technical_report t JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.author_id
         WHERE t.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    const report = daily ?? technical;
    if (!report) throw new ValidationError('Report not found');
    if (technical) {
      const change = decodeTechnicalReportChange(technical.change_summary);
      if (change) {
        technical.problem_symptom = change.problemSymptom;
        technical.diagnosis_root_cause = change.diagnosisRootCause;
        technical.change_performed = change.changePerformed;
      } else {
        technical.change_performed = technical.change_summary;
      }
    }
    const type = String(report.type) === 'technical' ? 'technical' : 'daily';
    const projectId = String(report.project_id);
    const ownerId = String(report.owner_id ?? report.worker_id ?? report.author_id);
    const objectDate = String(
      report.type === 'technical'
        ? (report.report_date ?? String(report.created_at).slice(0, 10))
        : (report.work_date ?? String(report.created_at).slice(0, 10)),
    );
    if (!this.canViewReport(principal, projectId, ownerId, objectDate))
      throw new AccessDeniedError('Report access required');
    const locked = this.reportIsLocked(type, id);
    const hasTechnicalChildren =
      type === 'technical' &&
      Boolean(
        this.sqlite.prepare('SELECT 1 FROM technical_change WHERE technical_report_id=?').get(id),
      );
    const hasApprovalHistory = Boolean(
      this.sqlite
        .prepare('SELECT 1 FROM approval_event WHERE entity_type=? AND entity_id=? LIMIT 1')
        .get(this.reportSourceType(type), id),
    );
    const canDeleteDraft =
      !locked &&
      String(report.approval_state) === 'draft' &&
      !hasTechnicalChildren &&
      !hasApprovalHistory &&
      (principal.role === 'owner_admin' ||
        (principal.userId === ownerId && principal.role !== 'auditor_read_only'));
    const history = this.sqlite
      .prepare(
        `SELECT ae.action,ae.occurred_at,ae.details_json,u.name actor_name
         FROM audit_event ae LEFT JOIN user u ON u.id=ae.actor_id
         WHERE ae.entity_type=? AND ae.entity_id=? ORDER BY ae.occurred_at DESC,ae.id DESC LIMIT 50`,
      )
      .all(this.reportSourceType(type), id);
    return {
      type,
      report,
      history,
      locked,
      canEdit: !locked && this.canMutateReport(principal, projectId, ownerId, objectDate),
      canDelete: canDeleteDraft,
    };
  }

  private updateReport(
    principal: Principal,
    type: 'daily' | 'technical',
    input: Record<string, unknown>,
  ) {
    this.assertActive(principal);
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const current = this.sqlite
      .prepare(`SELECT * FROM ${table} WHERE id=?`)
      .get(String(input.id)) as Record<string, unknown> | undefined;
    if (!current) throw new ValidationError('Report not found');
    const projectId = String(current.project_id);
    const ownerId = String(current.worker_id ?? current.author_id);
    const currentDate = String(
      type === 'technical'
        ? (current.report_date ?? String(current.created_at).slice(0, 10))
        : (current.work_date ?? String(current.created_at).slice(0, 10)),
    );
    if (!this.canMutateReport(principal, projectId, ownerId, currentDate))
      throw new AccessDeniedError('Report edit access required');
    if (type === 'daily' && principal.role === 'worker') {
      const requestedDate = String(input.workDate ?? currentDate);
      this.assertProjectMembership(principal, projectId, requestedDate);
    }
    if (this.reportIsLocked(type, String(input.id)))
      throw new ConflictError('This report is part of a finalized report and cannot be edited');
    const approvalState = String(current.approval_state);
    // Review has started once a report is submitted.  Preserve that reviewed
    // source row as historical truth: edits after submission must use the
    // audited correction-draft lifecycle instead of overwriting the row and
    // resetting its approval metadata in place.  Reports explicitly returned
    // for changes remain editable as the existing review workflow allows.
    if (approvalState !== 'draft' && approvalState !== 'needs_changes')
      throw new ConflictError(
        'Submitted or approved reports require an audited correction draft before editing',
      );
    const version = Number(input.version);
    if (!Number.isInteger(version) || version !== Number(current.version))
      throw new ConflictError('Report changed or cannot be edited');
    const fields =
      type === 'daily'
        ? ([
            ['workDate', 'work_date'],
            ['siteShift', 'site_shift'],
            ['summary', 'summary'],
            ['tasksCompleted', 'tasks_completed'],
            ['problemsFound', 'problems_found'],
            ['correctiveActions', 'corrective_actions'],
            ['clientDecisions', 'client_decisions'],
            ['downtimeMinutes', 'downtime_minutes'],
            ['standbyReason', 'standby_reason'],
            ['blockers', 'blockers'],
            ['openItems', 'open_items'],
            ['nextDayPlan', 'next_day_plan'],
            ['safetyRelated', 'safety_related'],
            ['customerContact', 'customer_contact'],
          ] as const)
        : ([
            ['systemName', 'system_name'],
            ['plantSite', 'plant_site'],
            ['areaLine', 'area_line'],
            ['stationMachine', 'station_machine'],
            ['systemType', 'system_type'],
            ['plcPlatform', 'plc_platform'],
            ['controller', 'controller'],
            ['hmiScada', 'hmi_scada'],
            ['networkProtocol', 'network_protocol'],
            ['softwareVersion', 'software_version'],
            ['programReference', 'program_reference'],
            ['changeSummary', 'change_summary'],
            ['safetyRelated', 'safety_related'],
            ['productionImpact', 'production_impact'],
            ['validation', 'validation'],
            ['validationResult', 'validation_result'],
            ['openRisk', 'open_risk'],
            ['rollbackPlan', 'rollback_plan'],
          ] as const);
    const normalized = (field: string, value: unknown): unknown =>
      field === 'safetyRelated' ? Boolean(value) : value === undefined ? null : value;
    const currentValue = (field: string, column: string): unknown =>
      field === 'safetyRelated' ? Boolean(Number(current[column] ?? 0)) : (current[column] ?? null);
    const changedFields = fields
      .filter(([field, column]) => normalized(field, input[field]) !== currentValue(field, column))
      .map(([field]) => field);
    if (changedFields.length === 0) return { id: String(input.id), version };
    const before = Object.fromEntries(
      fields
        .filter(([field]) => changedFields.includes(field))
        .map(([field, column]) => [field, currentValue(field, column)]),
    );
    const after = Object.fromEntries(
      fields
        .filter(([field]) => changedFields.includes(field))
        .map(([field]) => [field, normalized(field, input[field])]),
    );
    const timestamp = now();
    const nextState = ['submitted', 'approved'].includes(String(current.approval_state))
      ? 'needs_changes'
      : String(current.approval_state);
    const setClause = fields.map(([, column]) => `${column}=?`).join(',');
    const values: Array<string | number | null> = fields.map(([field]) => {
      const value = normalized(field, input[field]);
      if (field === 'safetyRelated') return value ? 1 : 0;
      return typeof value === 'string' || typeof value === 'number' || value === null
        ? value
        : null;
    });
    const result = this.transaction(() => {
      const update = this.sqlite
        .prepare(
          `UPDATE ${table} SET ${setClause},approval_state=?,reviewed_by=NULL,reviewed_at=NULL,updated_at=?,version=version+1 WHERE id=? AND version=?`,
        )
        .run(...values, nextState, timestamp, String(input.id), version);
      if (update.changes !== 1) throw new ConflictError('Report changed or cannot be edited');
      this.audit(
        principal,
        `report.${type}.update`,
        this.reportSourceType(type),
        String(input.id),
        {
          projectId,
          changedFields,
          before,
          after,
        },
      );
      this.notifyReportChanged(
        principal,
        type,
        String(input.id),
        projectId,
        changedFields,
        'report_modified',
        timestamp,
      );
      return { id: String(input.id), version: version + 1, changedFields };
    });
    return result;
  }

  updateDailyReport(
    principal: Principal,
    input: DailyReportInput & { id: string; version: number },
  ) {
    return this.updateReport(principal, 'daily', input as unknown as Record<string, unknown>);
  }

  updateTechnicalReport(
    principal: Principal,
    input: TechnicalReportUpdateInput & { id: string; version: number },
  ) {
    return this.updateReport(principal, 'technical', input as unknown as Record<string, unknown>);
  }

  deleteReport(principal: Principal, type: 'daily' | 'technical', id: string, version: number) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner access required');
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const current = this.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!current) throw new ValidationError('Report not found');
    if (String(current.approval_state) !== 'draft')
      throw new ConflictError('Only never-submitted draft reports can be deleted');
    const approvalHistory = this.sqlite
      .prepare('SELECT 1 FROM approval_event WHERE entity_type=? AND entity_id=? LIMIT 1')
      .get(this.reportSourceType(type), id);
    if (approvalHistory) throw new ConflictError('Report approval history cannot be deleted');
    if (this.reportIsLocked(type, id))
      throw new ConflictError('Finalized reports cannot be deleted');
    if (
      type === 'technical' &&
      this.sqlite.prepare('SELECT 1 FROM technical_change WHERE technical_report_id=?').get(id)
    )
      throw new ConflictError('Remove linked technical changes before deleting this report');
    const result = this.transaction(() => {
      const deleted = this.sqlite
        .prepare(`DELETE FROM ${table} WHERE id=? AND version=?`)
        .run(id, version);
      if (deleted.changes !== 1) throw new ConflictError('Report changed or cannot be deleted');
      this.audit(principal, `report.${type}.delete`, this.reportSourceType(type), id, {
        projectId: String(current.project_id),
        before: current,
      });
      this.notifyReportChanged(
        principal,
        type,
        id,
        String(current.project_id),
        ['record'],
        'report_deleted',
        now(),
      );
      return { id };
    });
    return result;
  }

  transitionClient(
    principal: Principal,
    inputOrId: LifecycleTransitionInput | string,
    requestedStatus?: LifecycleEntityState | 'restore',
    expectedVersion?: number,
    legacyReason?: string,
  ) {
    this.assertActive(principal);
    if (!canManageClients(principal)) throw new AccessDeniedError('Client administration required');
    const input: LifecycleTransitionInput =
      typeof inputOrId === 'string'
        ? {
            clientId: inputOrId,
            status: requestedStatus ?? 'active',
            version: expectedVersion,
            reason: legacyReason,
          }
        : inputOrId;
    const clientId = input.clientId ?? input.id;
    if (!clientId) throw new ValidationError('Client id is required');
    const reason = assertText(input.reason ?? '', 'Transition reason', 2000);
    return this.transaction(() => {
      const current = this.sqlite
        .prepare('SELECT status,version FROM client WHERE id=?')
        .get(clientId) as { status: LifecycleEntityState; version: number } | undefined;
      if (!current) throw new ValidationError('Client not found');
      if (input.version !== undefined && input.version !== current.version)
        throw new ConflictError('Client changed before lifecycle transition');
      const target = this.lifecycleTarget('client', clientId, current.status, input.status);
      this.assertLifecycleTransition('client', current.status, target);
      if (target === 'closed') {
        const child = this.sqlite
          .prepare(
            "SELECT 1 FROM project WHERE client_id=? AND status NOT IN ('closed','archived') LIMIT 1",
          )
          .get(clientId);
        if (child) throw new ConflictError('Client has projects that are not closed');
      }
      const changed = this.sqlite
        .prepare(
          'UPDATE client SET status=?,updated_at=?,version=version+1 WHERE id=? AND status=? AND version=?',
        )
        .run(target, now(), clientId, current.status, current.version);
      if (changed.changes !== 1)
        throw new ConflictError('Client changed before lifecycle transition');
      this.appendLifecycleEvent(
        principal,
        'client',
        clientId,
        current.status,
        target,
        current.version,
        reason,
      );
      this.audit(principal, 'lifecycle.transition', 'client', clientId, {
        fromState: current.status,
        toState: target,
        reason,
      });
      return { id: clientId, status: target, version: current.version + 1 };
    });
  }

  transitionProject(
    principal: Principal,
    inputOrId: LifecycleTransitionInput | string,
    requestedStatus?: LifecycleEntityState | 'restore',
    expectedVersion?: number,
    legacyReason?: string,
  ) {
    this.assertActive(principal);
    if (!canManageClients(principal))
      throw new AccessDeniedError('Project administration required');
    const input: LifecycleTransitionInput =
      typeof inputOrId === 'string'
        ? {
            projectId: inputOrId,
            status: requestedStatus ?? 'active',
            version: expectedVersion,
            reason: legacyReason,
          }
        : inputOrId;
    const projectId = input.projectId ?? input.id;
    if (!projectId) throw new ValidationError('Project id is required');
    const reason = assertText(input.reason ?? '', 'Transition reason', 2000);
    return this.transaction(() => {
      const current = this.sqlite
        .prepare('SELECT client_id,status,version,actual_end_date FROM project WHERE id=?')
        .get(projectId) as
        | {
            client_id: string;
            status: LifecycleEntityState;
            version: number;
            actual_end_date: string | null;
          }
        | undefined;
      if (!current) throw new ValidationError('Project not found');
      if (input.version !== undefined && input.version !== current.version)
        throw new ConflictError('Project changed before lifecycle transition');
      const target = this.lifecycleTarget('project', projectId, current.status, input.status);
      this.assertLifecycleTransition('project', current.status, target);
      if (target !== 'archived') {
        const client = this.sqlite
          .prepare('SELECT status FROM client WHERE id=?')
          .get(current.client_id) as { status: string } | undefined;
        if (!client || client.status === 'archived')
          throw new ConflictError('Archived client cannot receive an active project');
      }
      const changed = this.sqlite
        .prepare(
          "UPDATE project SET status=?,actual_end_date=CASE WHEN ?='closed' THEN COALESCE(actual_end_date,?) ELSE actual_end_date END,updated_at=?,version=version+1 WHERE id=? AND status=? AND version=?",
        )
        .run(target, target, now().slice(0, 10), now(), projectId, current.status, current.version);
      if (changed.changes !== 1)
        throw new ConflictError('Project changed before lifecycle transition');
      this.appendLifecycleEvent(
        principal,
        'project',
        projectId,
        current.status,
        target,
        current.version,
        reason,
      );
      this.audit(principal, 'lifecycle.transition', 'project', projectId, {
        fromState: current.status,
        toState: target,
        reason,
      });
      return { id: projectId, status: target, version: current.version + 1 };
    });
  }

  deleteDraft(
    principal: Principal,
    inputOrType: DraftDeleteInput | DraftRecordType,
    recordId?: string,
    version?: number,
  ) {
    this.assertActive(principal);
    const input: DraftDeleteInput =
      typeof inputOrType === 'string'
        ? { recordType: inputOrType, recordId: recordId ?? '', version: version ?? -1 }
        : inputOrType;
    const tableByType: Record<DraftRecordType, string> = {
      time_entry: 'time_entry',
      expense: 'expense',
      daily_report: 'daily_report',
      technical_report: 'technical_report',
    };
    const table = tableByType[input.recordType];
    if (!table || !input.recordId || !Number.isInteger(input.version))
      throw new ValidationError('Draft delete payload is invalid');
    return this.transaction(() => {
      const row = this.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(input.recordId) as
        | Record<string, unknown>
        | undefined;
      if (!row) throw new ValidationError('Record not found');
      const ownerId = String(row.worker_id ?? row.author_id ?? '');
      const projectId = String(row.project_id ?? '');
      const objectDate = String(
        row.work_date ?? row.spent_on ?? row.report_date ?? String(row.created_at).slice(0, 10),
      );
      this.assertProjectObjectAccess(principal, projectId, objectDate, ownerId);
      if (
        principal.role !== 'owner_admin' &&
        (principal.userId !== ownerId || principal.role === 'auditor_read_only')
      )
        throw new AccessDeniedError('Record creator access required');
      if (String(row.approval_state) !== 'draft')
        throw new ConflictError('Only never-submitted drafts can be deleted');
      if (row.invoice_id || row.billing_lock_id || row.billing_status === 'locked')
        throw new ConflictError('Financially linked records cannot be deleted');
      if (input.recordType === 'technical_report') {
        const child = this.sqlite
          .prepare('SELECT 1 FROM technical_change WHERE technical_report_id=? LIMIT 1')
          .get(input.recordId);
        if (child) throw new ConflictError('Technical reports with changes cannot be deleted');
      }
      const approvalHistory = this.sqlite
        .prepare('SELECT 1 FROM approval_event WHERE entity_type=? AND entity_id=? LIMIT 1')
        .get(input.recordType, input.recordId);
      if (approvalHistory) throw new ConflictError('Record approval history cannot be deleted');
      const deleted = this.sqlite
        .prepare(`DELETE FROM ${table} WHERE id=? AND version=? AND approval_state='draft'`)
        .run(input.recordId, input.version);
      if (deleted.changes !== 1) throw new ConflictError('Record changed before deletion');
      this.audit(principal, 'record.delete_draft', input.recordType, input.recordId, {
        projectId,
        version: input.version,
      });
      return { id: input.recordId, recordType: input.recordType };
    });
  }

  createCorrectionDraft(principal: Principal, input: CorrectionDraftInput) {
    if (principal.role === 'owner_admin')
      throw new AccessDeniedError('Owners must use the audited override correction path');
    if (principal.role === 'finance_admin' || principal.role === 'auditor_read_only')
      throw new AccessDeniedError('Operational correction access required');
    return this.createCorrectionDraftInternal(principal, input, false);
  }

  ownerOverrideCorrectionDraft(principal: Principal, input: CorrectionDraftInput) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw new AccessDeniedError('Owner administration required');
    this.assertStepUp(principal);
    return this.createCorrectionDraftInternal(principal, input, true);
  }

  private createCorrectionDraftInternal(
    principal: Principal,
    input: CorrectionDraftInput,
    ownerOverride: boolean,
  ) {
    this.assertActive(principal);
    const tables: Record<DraftRecordType, string> = {
      time_entry: 'time_entry',
      expense: 'expense',
      daily_report: 'daily_report',
      technical_report: 'technical_report',
    };
    const table = tables[input.recordType];
    if (!table || !input.originalId || !input.requestId)
      throw new ValidationError('Correction payload is invalid');
    const reason = assertText(input.reason, 'Correction reason', 2000);
    if (reason.length < 3)
      throw new ValidationError('Correction reason must contain at least 3 characters');
    const payload = JSON.stringify({
      recordType: input.recordType,
      originalId: input.originalId,
      patch: input.patch ?? {},
      reason,
      actorUserId: principal.userId,
      ownerOverride,
    });
    const payloadHash = createHash('sha256').update(payload).digest('hex');
    return this.transaction(() => {
      const original = this.sqlite
        .prepare(`SELECT * FROM ${table} WHERE id=?`)
        .get(input.originalId) as Record<string, unknown> | undefined;
      if (!original) throw new ValidationError('Original record not found');
      const projectId = String(original.project_id ?? '');
      const ownerId = String(original.worker_id ?? original.author_id ?? '');
      const objectDate = String(
        original.work_date ??
          original.spent_on ??
          original.report_date ??
          String(original.created_at).slice(0, 10),
      );
      this.assertProjectObjectAccess(principal, projectId, objectDate, ownerId);
      if (
        principal.role !== 'owner_admin' &&
        principal.role !== 'finance_admin' &&
        principal.userId !== ownerId &&
        !(principal.role === 'project_manager' && principal.projectIds.has(projectId))
      )
        throw new AccessDeniedError('Correction access required');
      if (String(original.approval_state) !== 'approved')
        throw new ConflictError('Only approved records can create a correction draft');
      if (
        original.invoice_id ||
        original.billing_lock_id ||
        original.billing_status === 'locked' ||
        original.billing_state === 'locked' ||
        original.locked_at
      )
        throw new ConflictError('Financially finalized records require a finance correction');
      if (
        (input.recordType === 'daily_report' || input.recordType === 'technical_report') &&
        this.reportIsLocked(
          input.recordType === 'daily_report' ? 'daily' : 'technical',
          input.originalId,
        )
      )
        throw new ConflictError('Finalized reports require a versioned report correction');

      const identity = this.deploymentIdentity();
      const prior = this.sqlite
        .prepare(
          `SELECT correction_id,request_payload_sha256 FROM record_correction_link
           WHERE tenant_id=? AND record_type=? AND original_id=? AND request_id=?`,
        )
        .get(identity.tenantId, input.recordType, input.originalId, input.requestId) as
        | { correction_id: string; request_payload_sha256: string }
        | undefined;
      if (prior) {
        if (prior.request_payload_sha256 !== payloadHash)
          throw new ConflictError('Correction request payload conflicts with prior replay');
        return { id: prior.correction_id, correctionId: prior.correction_id, replayed: true };
      }

      const correctionId = newId();
      const timestamp = now();
      const columns = (
        this.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      ).map((column) => column.name);
      const patch = input.patch ?? {};
      const aliases: Record<string, string> = {
        workDate: 'work_date',
        spentOn: 'spent_on',
        activityCode: 'activity_code',
        activitySummary: 'activity_summary',
        startTime: 'start_time',
        endTime: 'end_time',
        breakMinutes: 'break_minutes',
        safetyRelated: 'safety_related',
        systemName: 'system_name',
        changeSummary: 'change_summary',
        siteShift: 'site_shift',
        tasksCompleted: 'tasks_completed',
        problemsFound: 'problems_found',
        correctiveActions: 'corrective_actions',
        clientDecisions: 'client_decisions',
        downtimeMinutes: 'downtime_minutes',
        standbyReason: 'standby_reason',
        openItems: 'open_items',
        nextDayPlan: 'next_day_plan',
        customerContact: 'customer_contact',
        reportDate: 'report_date',
        plantSite: 'plant_site',
        areaLine: 'area_line',
        stationMachine: 'station_machine',
        systemType: 'system_type',
        plcPlatform: 'plc_platform',
        hmiScada: 'hmi_scada',
        networkProtocol: 'network_protocol',
        softwareVersion: 'software_version',
        programReference: 'program_reference',
        productionImpact: 'production_impact',
        validationResult: 'validation_result',
        openRisk: 'open_risk',
        rollbackPlan: 'rollback_plan',
      };
      const allowedPatchColumns: Record<DraftRecordType, ReadonlySet<string>> = {
        time_entry: new Set([
          'work_date',
          'category',
          'activity_code',
          'minutes',
          'activity_summary',
          'site',
          'start_time',
          'end_time',
          'break_minutes',
        ]),
        expense: new Set([
          'spent_on',
          'vendor',
          'category',
          'description',
          'payment_method',
          'receipt_document_id',
        ]),
        daily_report: new Set([
          'work_date',
          'site_shift',
          'summary',
          'tasks_completed',
          'problems_found',
          'corrective_actions',
          'client_decisions',
          'downtime_minutes',
          'standby_reason',
          'blockers',
          'open_items',
          'next_day_plan',
          'safety_related',
          'customer_contact',
        ]),
        technical_report: new Set([
          'report_date',
          'system_name',
          'plant_site',
          'area_line',
          'station_machine',
          'system_type',
          'plc_platform',
          'controller',
          'hmi_scada',
          'network_protocol',
          'software_version',
          'program_reference',
          'change_summary',
          'safety_related',
          'production_impact',
          'validation',
          'validation_result',
          'open_risk',
          'rollback_plan',
        ]),
      };
      for (const key of Object.keys(patch)) {
        const column = aliases[key] ?? key;
        if (!allowedPatchColumns[input.recordType].has(column))
          throw new ValidationError('Correction field is not allowed');
        if (column === 'work_date' || column === 'spent_on' || column === 'report_date') {
          if (typeof patch[key] !== 'string')
            throw new ValidationError('Correction date is invalid');
          assertDate(patch[key], 'Correction date');
        }
        if (
          (column === 'minutes' || column === 'break_minutes' || column === 'downtime_minutes') &&
          (!Number.isInteger(patch[key]) || Number(patch[key]) < 0 || Number(patch[key]) > 1440)
        )
          throw new ValidationError('Correction duration is invalid');
      }
      const values = columns.map((column) => {
        const patchKey = Object.keys(patch).find((key) => (aliases[key] ?? key) === column);
        if (column === 'id') return correctionId;
        if (column === 'version') return 1;
        if (column === 'created_at' || column === 'updated_at') return timestamp;
        if (column === 'approval_state') return 'draft';
        if (column === 'report_date_provenance') return 'native';
        if (column === 'reviewed_by' || column === 'reviewed_at' || column === 'submitted_at')
          return null;
        if (
          column === 'approved_by' ||
          column === 'approved_at' ||
          column === 'finance_approved_by' ||
          column === 'finance_approved_at'
        )
          return null;
        if (
          column === 'invoice_id' ||
          column === 'billing_lock_id' ||
          column === 'locked_at' ||
          column === 'locked_by'
        )
          return null;
        if (column === 'billing_status' || column === 'billing_state') return 'unlocked';
        if (patchKey) {
          const value = patch[patchKey];
          if (typeof value === 'boolean') return value ? 1 : 0;
          if (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'bigint'
          )
            return value;
          return null;
        }
        const value = original[column];
        return value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'bigint'
          ? value
          : null;
      });
      this.sqlite
        .prepare(
          `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
        )
        .run(...values);
      const linkId = newId();
      this.sqlite
        .prepare(
          `INSERT INTO record_correction_link(
             id,tenant_id,record_type,original_id,correction_id,request_id,request_payload_sha256,
             actor_user_id,reason,created_at,correlation_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          linkId,
          identity.tenantId,
          input.recordType,
          input.originalId,
          correctionId,
          input.requestId,
          payloadHash,
          principal.userId,
          reason,
          timestamp,
          principal.correlationId ?? newId(),
        );
      this.audit(principal, 'correction.create', input.recordType, correctionId, {
        projectId,
        originalId: input.originalId,
        reason,
        ownerOverride,
      });
      return { id: correctionId, correctionId, originalId: input.originalId, version: 1 };
    });
  }

  submitReport(principal: Principal, type: 'daily' | 'technical', id: string, baseVersion: number) {
    this.assertActive(principal);
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const ownerColumn = type === 'daily' ? 'worker_id' : 'author_id';
    const dateColumn = type === 'daily' ? 'work_date' : 'report_date';
    return this.transaction(() => {
      const row = this.sqlite
        .prepare(
          `SELECT r.project_id,r.${dateColumn} business_date,p.status project_status
             FROM ${table} r JOIN project p ON p.id=r.project_id
            WHERE r.id=? AND r.${ownerColumn}=?`,
        )
        .get(id, principal.userId) as
        | { project_id: string; business_date: string; project_status: string }
        | undefined;
      if (!row) throw new AccessDeniedError('Report submission access required');
      if (row.project_status !== 'active')
        throw new AccessDeniedError('Active project required for report submission');
      if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin') {
        const assignment = this.sqlite
          .prepare(
            `SELECT 1 FROM project_member
              WHERE project_id=? AND user_id=? AND status='active'
                AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)`,
          )
          .get(row.project_id, principal.userId, row.business_date, row.business_date);
        if (!assignment)
          throw new AccessDeniedError('Effective project assignment required for submission');
      }
      const timestamp = now();
      const result = this.sqlite
        .prepare(
          `UPDATE ${table} SET approval_state='submitted',updated_at=?,version=version+1 WHERE id=? AND ${ownerColumn}=? AND approval_state IN ('draft','needs_changes') AND version=?`,
        )
        .run(timestamp, id, principal.userId, baseVersion);
      if (result.changes !== 1) throw new ConflictError('Report changed or cannot be submitted');
      this.audit(principal, `${type}_report.submit`, table, id, { baseVersion });
    });
  }

  reviewReport(
    principal: Principal,
    type: 'daily' | 'technical',
    id: string,
    decision: 'approved' | 'needs_changes',
    reason?: string,
  ) {
    const table = type === 'daily' ? 'daily_report' : 'technical_report';
    const ownerColumn = type === 'daily' ? 'worker_id' : 'author_id';
    const reviewReason = reason?.trim() || undefined;
    if (decision === 'needs_changes' && !reviewReason)
      throw new ValidationError('A reason is required');
    this.transaction(() => {
      this.assertActive(principal);
      const row = this.sqlite
        .prepare(
          `SELECT r.project_id,r.${ownerColumn} owner_id,r.approval_state,r.safety_related,
                  p.status project_status
             FROM ${table} r
             JOIN project p ON p.id=r.project_id
            WHERE r.id=?`,
        )
        .get(id) as
        | {
            project_id: string;
            owner_id: string;
            approval_state: string;
            safety_related: number;
            project_status: string;
          }
        | undefined;
      if (!row) throw new ValidationError('Report not found');
      this.assertOperationalReviewer(principal, row.project_id);
      if (row.project_status !== 'active')
        throw new AccessDeniedError('Active project required for report review');
      if (row.approval_state !== 'submitted') throw new ConflictError('Report is not submitted');
      const timestamp = now();
      const result = this.sqlite
        .prepare(
          `UPDATE ${table} SET approval_state=?,reviewed_by=?,reviewed_at=?,updated_at=?,version=version+1
            WHERE id=? AND approval_state='submitted' AND project_id=?`,
        )
        .run(decision, principal.userId, timestamp, timestamp, id, row.project_id);
      if (result.changes !== 1) throw new ConflictError('Report is not submitted');
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          `${type}_report`,
          id,
          row.approval_state,
          decision,
          principal.userId,
          reviewReason ?? null,
          timestamp,
        );
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(newId(), row.owner_id, `report_${decision}`, id, timestamp);
      this.audit(principal, `${type}_report.${decision}`, table, id, {
        reason: reviewReason ?? null,
        safetyRelated: Boolean(row.safety_related),
      });
    });
  }

  createPlanningAssignment(
    principal: Principal,
    input: {
      projectId: string;
      workerId: string;
      startsAt: string;
      endsAt: string;
      plannedMinutes: number;
      site?: string;
      requiredSkill?: string;
    },
  ) {
    return this.planning.createPlanningAssignment(principal, input);
  }

  createExpense(principal: Principal, input: ExpenseInput) {
    this.assertActive(principal);
    assertDate(input.spentOn, 'Expense date');
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 ok FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
      )
      .get(input.projectId, principal.userId, input.spentOn, input.spentOn);
    if (!assignment) throw new AccessDeniedError('Active project assignment required');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    if (input.amountMinor <= 0n) throw new ValidationError('Expense amount must be positive');
    const normalizedWhoPaid = input.whoPaid === 'company' ? 'company_direct' : input.whoPaid;
    const paidBy = ['worker', 'company_card', 'company_direct', 'client', 'third_party'];
    if (!paidBy.includes(normalizedWhoPaid)) throw new ValidationError('Expense payer is invalid');
    if (input.receiptRequired && !input.receiptDocumentId)
      throw new ValidationError('A committed receipt is required');
    if (input.receiptDocumentId) {
      const receipt = this.sqlite
        .prepare("SELECT project_id FROM document WHERE id=? AND owner_id=? AND state='committed'")
        .get(input.receiptDocumentId, principal.userId);
      if (!receipt) throw new AccessDeniedError('Committed owned receipt required');
      if (String((receipt as { project_id: string | null }).project_id ?? '') !== input.projectId)
        throw new AccessDeniedError('Receipt must belong to the expense project');
    }
    const id = newId();
    const timestamp = now();
    // Configuration is not data entry.  The operational intake deliberately
    // ignores legacy/forged commercial fields; Finance/Admin appends the
    // authoritative classification in a separate step-up protected command.
    const reimbursementAmountMinor =
      normalizedWhoPaid === 'worker' && input.currency === project.currency
        ? safeInteger(input.amountMinor)
        : null;
    this.sqlite
      .prepare(
        'INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,vendor,description,who_paid,payment_method,receipt_required,receipt_document_id,approval_state,reimbursement_state,billing_treatment,markup_bps,billing_amount_minor,project_currency_amount_minor,tax_amount_minor,fx_rate_bps,reimbursement_amount_minor,commercial_classification_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.spentOn,
        input.category,
        input.currency,
        safeInteger(input.amountMinor),
        'non_billable',
        assertText(input.vendor, 'Vendor', 200),
        assertText(input.description, 'Description'),
        normalizedWhoPaid,
        input.paymentMethod?.trim() || null,
        input.receiptRequired ? 1 : 0,
        input.receiptDocumentId ?? null,
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
        timestamp,
        timestamp,
      );
    this.audit(principal, 'expense.create', 'expense', id, {
      amountMinor: input.amountMinor.toString(),
    });
    return { id, version: 1 };
  }

  registerReceipt(
    principal: Principal,
    input: {
      projectId: string;
      sha256: string;
      mediaType: string;
      byteLength: number;
      storageKey: string;
      originalFilename: string;
    },
  ) {
    this.assertActive(principal);
    this.assertProjectMembership(principal, input.projectId);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new ValidationError('Invalid receipt hash');
    assertSafeStorageKey(input.storageKey, () => new ValidationError('Unsafe receipt storage key'));
    if (
      ![
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
      ].includes(input.mediaType)
    )
      throw new ValidationError('Unsupported receipt media type');
    if (
      !Number.isInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 10_000_000
    )
      throw new ValidationError('Receipt size is invalid');
    const existing = this.sqlite
      .prepare(
        'SELECT id FROM document WHERE sha256=? AND byte_length=? AND owner_id=? AND project_id=?',
      )
      .get(input.sha256, input.byteLength, principal.userId, input.projectId) as
      | { id: string }
      | undefined;
    if (existing) return { ...existing, created: false };
    const duplicateContent = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=?')
      .get(input.sha256, input.byteLength) as { id: string } | undefined;
    if (duplicateContent)
      throw new ConflictError('Receipt content is already registered to another record');
    const id = newId();
    const timestamp = now();
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'receipt';
    this.sqlite
      .prepare(
        `INSERT INTO document(id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,original_filename,safe_filename,description,sensitive,artifact_type,created_at,updated_at,scan_status,artifact_classification,classification_provenance) VALUES(?,?,?,?,?,?,'${malwareScanRequired() ? 'quarantined' : 'committed'}',?,?,?,?,0,'receipt',?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        principal.userId,
        input.sha256,
        input.mediaType,
        input.byteLength,
        input.storageKey,
        safeFilename,
        safeFilename,
        'Expense receipt',
        timestamp,
        timestamp,
        malwareScanRequired() ? 'pending' : 'not_scanned',
        'receipt',
        'native',
      );
    if (malwareScanRequired()) {
      this.enqueueDurableJob('document_scan', `document-scan:${id}`, { documentId: id }, timestamp);
    }
    this.audit(principal, 'receipt.commit', 'document', id, {
      projectId: input.projectId,
      byteLength: input.byteLength,
    });
    return { id, created: true };
  }

  removeUnreferencedReceipt(principal: Principal, documentId: string): string | null {
    this.assertActive(principal);
    return this.transaction(() => {
      const row = this.sqlite
        .prepare(
          "SELECT storage_key FROM document WHERE id=? AND owner_id=? AND artifact_type='receipt' AND state='committed' AND NOT EXISTS (SELECT 1 FROM expense WHERE receipt_document_id=document.id)",
        )
        .get(documentId, principal.userId) as { storage_key: string } | undefined;
      if (!row) return null;
      this.sqlite.prepare('DELETE FROM document WHERE id=?').run(documentId);
      this.audit(principal, 'receipt.cleanup', 'document', documentId, {});
      return row.storage_key;
    });
  }

  registerPrivateDocument(
    principal: Principal,
    input: Readonly<{
      projectId?: string;
      sha256: string;
      mediaType: string;
      byteLength: number;
      storageKey: string;
      originalFilename: string;
      description?: string;
      artifactType: string;
      softwareVersion?: string;
      sensitivity?: 'internal' | 'sensitive' | 'customer_private';
      artifactClassification?: ArtifactClassification;
      supersedesId?: string;
    }>,
  ) {
    this.assertActive(principal);
    if (input.projectId && principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      this.assertProjectMembership(principal, input.projectId);
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new ValidationError('Invalid document hash');
    const artifactClassification = resolveArtifactClassification(
      input.artifactType,
      input.artifactClassification,
    );
    if (
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 50_000_000
    )
      throw new ValidationError('Document size is invalid');
    assertSafeStorageKey(
      input.storageKey,
      () => new ValidationError('Unsafe document storage key'),
    );
    const allowedMediaTypes = new Set([
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ]);
    if (!allowedMediaTypes.has(input.mediaType))
      throw new ValidationError('Unsupported private document media type');
    const existing = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=? AND owner_id=?')
      .get(input.sha256, input.byteLength, principal.userId) as { id: string } | undefined;
    if (existing) return { id: existing.id, created: false };
    const duplicateContent = this.sqlite
      .prepare('SELECT id FROM document WHERE sha256=? AND byte_length=?')
      .get(input.sha256, input.byteLength) as { id: string } | undefined;
    if (duplicateContent)
      throw new ConflictError('Document content is already registered to another record');
    if (input.supersedesId) {
      const superseded = this.sqlite
        .prepare('SELECT project_id,owner_id,state FROM document WHERE id=?')
        .get(input.supersedesId) as
        | { project_id: string | null; owner_id: string; state: string }
        | undefined;
      if (
        !superseded ||
        superseded.state !== 'committed' ||
        superseded.owner_id !== principal.userId ||
        (input.projectId ?? null) !== superseded.project_id
      )
        throw new AccessDeniedError('Superseded document access required');
    }
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'artifact';
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        `INSERT INTO document(
          id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
          original_filename,description,sensitive,artifact_type,software_version,
          supersedes_id,created_at,updated_at,sensitivity,safe_filename,scan_status,
          artifact_classification,classification_provenance
        ) VALUES(?,?,?,?,?,?,'${malwareScanRequired() ? 'quarantined' : 'committed'}',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId ?? null,
        principal.userId,
        input.sha256,
        input.mediaType,
        input.byteLength,
        input.storageKey,
        safeFilename,
        input.description?.trim() || null,
        input.sensitivity === 'sensitive' ? 1 : 0,
        assertText(input.artifactType, 'Artifact type', 100),
        input.softwareVersion?.trim() || null,
        input.supersedesId ?? null,
        timestamp,
        timestamp,
        input.sensitivity ?? 'internal',
        safeFilename,
        malwareScanRequired() ? 'pending' : 'not_scanned',
        artifactClassification,
        'native',
      );
    if (malwareScanRequired()) {
      this.enqueueDurableJob('document_scan', `document-scan:${id}`, { documentId: id }, timestamp);
    }
    this.audit(principal, 'document.commit', 'document', id, {
      projectId: input.projectId ?? null,
      artifactType: input.artifactType,
      byteLength: input.byteLength,
    });
    return { id, created: true };
  }

  listDocuments(principal: Principal, projectId?: string) {
    this.assertReadable(principal);
    const conditions: string[] = ["d.state='committed'"];
    const values: string[] = [];
    if (projectId) {
      this.assertProjectObjectAccess(principal, projectId);
      conditions.push('d.project_id=?');
      values.push(projectId);
      if (principal.role === 'worker') {
        conditions.push('d.owner_id=?');
        values.push(principal.userId);
      }
    } else if (principal.role === 'worker') {
      conditions.push('d.owner_id=?');
      values.push(principal.userId);
      conditions.push(
        "(d.project_id IS NULL OR EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=d.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?)))",
      );
      values.push(principal.userId, today(), today());
    } else if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (!ids.length) return [];
      conditions.push(`d.project_id IN (${ids.map(() => '?').join(',')})`);
      values.push(...ids);
      conditions.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=d.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      values.push(principal.userId, today(), today());
    }
    const documentColumns =
      principal.role === 'project_manager'
        ? 'd.id,d.project_id,d.safe_filename,d.artifact_type,d.created_at,p.project_number'
        : `d.id,d.project_id,d.owner_id,d.original_filename,d.safe_filename,d.media_type,
           d.byte_length,d.artifact_type,d.software_version,d.sensitivity,d.scan_status,
           d.created_at,p.project_number,u.name owner_name`;
    return this.sqlite
      .prepare(
        `SELECT ${documentColumns}
         FROM document d LEFT JOIN project p ON p.id=d.project_id JOIN user u ON u.id=d.owner_id
         WHERE ${conditions.join(' AND ')} ORDER BY d.created_at DESC LIMIT 500`,
      )
      .all(...values);
  }

  submitExpense(principal: Principal, id: string, baseVersion: number) {
    this.assertActive(principal);
    const scope = this.sqlite
      .prepare('SELECT project_id,worker_id,spent_on FROM expense WHERE id=?')
      .get(id) as { project_id: string; worker_id: string; spent_on: string } | undefined;
    if (!scope) throw new ValidationError('Expense not found');
    this.assertProjectObjectAccess(principal, scope.project_id, scope.spent_on, scope.worker_id);
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE expense SET approval_state='submitted',submitted_at=?,updated_at=?,version=version+1 WHERE id=? AND worker_id=? AND approval_state IN ('draft','needs_changes') AND version=? AND invoice_id IS NULL AND (receipt_required=0 OR receipt_document_id IS NOT NULL)",
      )
      .run(timestamp, timestamp, id, principal.userId, baseVersion);
    if (result.changes !== 1)
      throw new ConflictError('Expense changed, lacks receipt, or cannot be submitted');
    this.audit(principal, 'expense.submit', 'expense', id, { baseVersion });
    return { id, version: baseVersion + 1 };
  }

  updateExpense(
    principal: Principal,
    input: Readonly<{
      id: string;
      version: number;
      spentOn?: string;
      vendor?: string;
      category?: string;
      description?: string;
      amountMinor?: bigint;
      paymentMethod?: string;
      receiptDocumentId?: string;
    }>,
  ) {
    this.assertActive(principal);
    const current = this.sqlite
      .prepare(
        `SELECT project_id,worker_id,spent_on,approval_state,invoice_id,billing_state,receipt_required
         FROM expense WHERE id=?`,
      )
      .get(input.id) as
      | {
          project_id: string;
          worker_id: string;
          spent_on: string;
          approval_state: string;
          invoice_id: string | null;
          billing_state: string;
          receipt_required: number;
        }
      | undefined;
    if (!current) throw new ValidationError('Expense not found');
    this.assertProjectObjectAccess(
      principal,
      current.project_id,
      String(current.spent_on),
      current.worker_id,
    );
    if (current.worker_id !== principal.userId)
      throw new AccessDeniedError('Expense ownership required');
    if (
      current.invoice_id ||
      current.billing_state !== 'unlocked' ||
      !['draft', 'needs_changes'].includes(current.approval_state)
    )
      throw new ConflictError('Only an unlocked editable expense draft can change');
    if (input.spentOn) {
      assertDate(input.spentOn, 'Expense date');
      this.assertProjectObjectAccess(
        principal,
        current.project_id,
        input.spentOn,
        current.worker_id,
      );
    }
    if (input.amountMinor !== undefined && input.amountMinor <= 0n)
      throw new ValidationError('Expense amount must be positive');
    if (input.receiptDocumentId) {
      const receipt = this.sqlite
        .prepare("SELECT project_id FROM document WHERE id=? AND owner_id=? AND state='committed'")
        .get(input.receiptDocumentId, principal.userId);
      if (!receipt) throw new AccessDeniedError('Committed owned receipt required');
      if (
        String((receipt as { project_id: string | null }).project_id ?? '') !== current.project_id
      )
        throw new AccessDeniedError('Receipt must belong to the expense project');
    }
    const amountMinor = input.amountMinor === undefined ? null : safeInteger(input.amountMinor);
    const result = this.sqlite
      .prepare(
        `UPDATE expense SET spent_on=COALESCE(?,spent_on),vendor=COALESCE(?,vendor),
          category=COALESCE(?,category),description=COALESCE(?,description),
          amount_minor=COALESCE(?,amount_minor),
          reimbursement_amount_minor=CASE
            WHEN ? IS NULL THEN reimbursement_amount_minor
            WHEN who_paid='worker'
              AND currency=(SELECT currency FROM project WHERE id=expense.project_id)
              THEN ?
            ELSE NULL
          END,
          payment_method=COALESCE(?,payment_method),
          receipt_document_id=COALESCE(?,receipt_document_id),updated_at=?,version=version+1
         WHERE id=? AND worker_id=? AND version=? AND invoice_id IS NULL AND billing_state='unlocked'
           AND approval_state IN ('draft','needs_changes')`,
      )
      .run(
        input.spentOn ?? null,
        input.vendor?.trim() || null,
        input.category?.trim() || null,
        input.description?.trim() || null,
        amountMinor,
        amountMinor,
        amountMinor,
        input.paymentMethod?.trim() || null,
        input.receiptDocumentId ?? null,
        now(),
        input.id,
        principal.userId,
        input.version,
      );
    if (result.changes !== 1) throw new ConflictError('Expense changed or cannot be edited');
    this.audit(principal, 'expense.update', 'expense', input.id, { version: input.version });
    return { id: input.id, version: input.version + 1 };
  }

  classifyExpenseCommercially(
    principal: Principal,
    input: ExpenseCommercialClassificationInput,
  ): ExpenseCommercialClassificationResult {
    return this.expenseClassifications.classifyExpenseCommercially(principal, input);
  }

  operationalApproveExpense(
    principal: Principal,
    id: string,
    decision: 'approved' | 'needs_changes' | 'rejected',
    reason?: string,
  ) {
    this.assertActive(principal);
    const row = this.sqlite
      .prepare('SELECT project_id,approval_state FROM expense WHERE id=?')
      .get(id) as { project_id: string; approval_state: string } | undefined;
    if (!row) throw new ValidationError('Expense not found');
    this.assertOperationalReviewer(principal, row.project_id);
    if (row.approval_state !== 'submitted') throw new ConflictError('Expense is not submitted');
    const reviewReason = reason?.trim() || undefined;
    if (decision !== 'approved' && !reviewReason) throw new ValidationError('A reason is required');
    const timestamp = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          'UPDATE expense SET approval_state=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE id=?',
        )
        .run(
          decision,
          decision === 'approved' ? principal.userId : null,
          decision === 'approved' ? timestamp : null,
          timestamp,
          id,
        );
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'expense',
          id,
          row.approval_state,
          decision,
          principal.userId,
          reviewReason ?? null,
          timestamp,
        );
      this.audit(principal, `expense.${decision}`, 'expense', id, {
        reason: reviewReason ?? null,
      });
    });
  }

  financeApproveExpense(principal: Principal, id: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE expense SET finance_approved_by=?,finance_approved_at=?,updated_at=?,version=version+1 WHERE id=? AND approval_state='approved' AND invoice_id IS NULL AND billing_state='unlocked'",
      )
      .run(principal.userId, timestamp, timestamp, id);
    if (result.changes !== 1) throw new ConflictError('Approved unlocked expense required');
    this.audit(principal, 'expense.finance_approve', 'expense', id, {});
  }

  createCompensationRule(
    principal: Principal,
    input: {
      workerId: string;
      projectId?: string;
      currency: Currency;
      rateMinor: bigint;
      rateBasis: 'hourly' | 'daily';
      dailyGuaranteeMinutes?: number;
      effectiveFrom: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,daily_guarantee_minutes,worker_visible,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        safeInteger(input.rateMinor),
        input.rateBasis,
        input.dailyGuaranteeMinutes ?? null,
        1,
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'compensation_rule.create', 'compensation_rule', id, {
      workerId: input.workerId,
    });
    return { id };
  }

  createClientLaborRate(
    principal: Principal,
    input: {
      projectId: string;
      workerId?: string;
      category?: string;
      currency: Currency;
      hourlyRateMinor: bigint;
      effectiveFrom: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO client_labor_rate(id,project_id,worker_id,category,currency,hourly_rate_minor,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.projectId,
        input.workerId ?? null,
        input.category ?? null,
        input.currency,
        safeInteger(input.hourlyRateMinor),
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'client_rate.create', 'client_labor_rate', id, {
      projectId: input.projectId,
    });
    return { id };
  }

  createInternalCostRule(
    principal: Principal,
    input: {
      workerId: string;
      projectId?: string;
      currency: Currency;
      hourlyRateMinor: bigint;
      effectiveFrom: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const id = newId();
    const timestamp = now();
    this.sqlite
      .prepare(
        'INSERT INTO internal_cost_rule(id,worker_id,project_id,currency,hourly_rate_minor,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.workerId,
        input.projectId ?? null,
        input.currency,
        safeInteger(input.hourlyRateMinor),
        input.effectiveFrom,
        timestamp,
        timestamp,
      );
    this.audit(principal, 'internal_cost.create', 'internal_cost_rule', id, {
      workerId: input.workerId,
    });
    return { id };
  }

  createLegalEntity(
    principal: Principal,
    input: {
      code: string;
      legalName: string;
      currency: Currency;
      billingAddress: string;
      companyIdentifiers: string;
    },
  ) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    const code = assertText(input.code, 'Legal entity code', 40).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))
      throw new ValidationError('Legal entity code may contain only letters, numbers, _ and -');
    const legalName = assertText(input.legalName, 'Legal entity name', 300);
    const billingAddress = assertText(input.billingAddress, 'Billing address', 2000);
    const companyIdentifiers = assertText(input.companyIdentifiers, 'Company identifiers', 1000);
    const id = newId();
    const timestamp = now();
    try {
      this.sqlite
        .prepare(
          'INSERT INTO legal_entity(id,code,legal_name,currency,billing_address,company_identifiers,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          code,
          legalName,
          input.currency,
          billingAddress,
          companyIdentifiers,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (error instanceof Error && /UNIQUE/i.test(error.message))
        throw new ConflictError('Legal entity code already exists');
      throw error;
    }
    this.audit(principal, 'legal_entity.create', 'legal_entity', id, { code: input.code });
    return { id };
  }

  createInvoiceNumberPolicy(
    principal: Principal,
    input: {
      legalEntityId: string;
      prefix: string;
      digits: number;
      effectiveFrom: string;
      accountantApprovedAt: string;
    },
  ) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    assertDate(input.effectiveFrom, 'Invoice-number policy effective date');
    if (!/^\S{1,30}$/.test(input.prefix.trim()))
      throw new ValidationError('Invoice-number prefix must be 1–30 non-space characters');
    if (!Number.isInteger(input.digits) || input.digits < 4 || input.digits > 10)
      throw new ValidationError('Invoice-number digits must be between 4 and 10');
    if (Number.isNaN(Date.parse(input.accountantApprovedAt)))
      throw new ValidationError('Accountant approval timestamp is invalid');
    return this.transaction(() => {
      this.activeLegalEntity(input.legalEntityId, 'invoice numbering');
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO invoice_number_policy(id,legal_entity_id,prefix,digits,effective_from,accountant_approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          input.legalEntityId,
          input.prefix.trim(),
          input.digits,
          input.effectiveFrom,
          input.accountantApprovedAt,
          timestamp,
          timestamp,
        );
      this.audit(principal, 'invoice_policy.create', 'invoice_number_policy', id, {});
      return { id };
    });
  }

  createTaxProfile(
    principal: Principal,
    input: {
      legalEntityId?: string;
      name: string;
      currency: Currency;
      effectiveFrom: string;
      components: readonly { name: string; basisPoints: number; compound?: boolean }[];
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    assertDate(input.effectiveFrom, 'Tax profile effective date');
    const name = assertText(input.name, 'Tax profile name', 160);
    if (!input.components.length)
      throw new ValidationError('At least one tax component is required');
    for (const component of input.components) {
      assertText(component.name, 'Tax component name', 160);
      if (
        !Number.isInteger(component.basisPoints) ||
        component.basisPoints < 0 ||
        component.basisPoints > 100_000
      )
        throw new ValidationError('Tax component basis points must be between 0 and 100000');
    }
    return this.transaction(() => {
      if (input.legalEntityId) {
        const legalEntity = this.activeLegalEntity(input.legalEntityId, 'new tax profiles');
        if (legalEntity.currency !== input.currency)
          throw new ValidationError('Tax profile currency must match the legal entity currency');
      }
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          "INSERT INTO tax_profile(id,name,currency,effective_from,version,legal_entity_id,status) VALUES(?,?,?,?,1,?,'active')",
        )
        .run(id, name, input.currency, input.effectiveFrom, input.legalEntityId ?? null);
      input.components.forEach((component, index) => {
        this.sqlite
          .prepare(
            'INSERT INTO tax_component(id,tax_profile_id,name,basis_points,calculation_order,compound) VALUES(?,?,?,?,?,?)',
          )
          .run(
            newId(),
            id,
            assertText(component.name, 'Tax component name', 160),
            component.basisPoints,
            index,
            component.compound ? 1 : 0,
          );
      });
      this.audit(principal, 'tax_profile.create', 'tax_profile', id, {
        componentCount: input.components.length,
        timestamp,
      });
      return { id };
    });
  }

  createBillingRule(
    principal: Principal,
    input: {
      projectId: string;
      legalEntityId: string;
      streamType: 'labor' | 'expense' | 'milestone' | 'other';
      cadenceType: string;
      anchorDate?: string;
      taxProfileId: string;
      currency: Currency;
      effectiveFrom: string;
      templateId?: string;
      recipientEmail?: string;
      paymentTermsDays?: number;
      poNumberOverride?: string;
      semiMonthlyRule?: string;
      groupingMode?: string;
      fixedAmountMinor?: bigint;
      includedMinutes?: number;
      monthlyCutoffDay?: number;
      autoGenerateDraft?: boolean;
      billingContactId?: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    const templateId = controlledInvoiceTemplateId(input.templateId, input.streamType);
    const cadence = input.cadenceType === 'fourteen_day' ? 'every_14_days' : input.cadenceType;
    if (
      ![
        'weekly',
        'every_14_days',
        'semi_monthly',
        'monthly',
        'custom',
        'milestone',
        'manual',
      ].includes(cadence)
    )
      throw new ValidationError('Unsupported billing cadence');
    assertDate(input.effectiveFrom, 'Effective date');
    if (input.anchorDate) assertDate(input.anchorDate, 'Anchor date');
    if (cadence === 'every_14_days' && !input.anchorDate)
      throw new ValidationError('Every 14 days requires an anchor date');
    if (
      input.monthlyCutoffDay !== undefined &&
      (!Number.isInteger(input.monthlyCutoffDay) ||
        input.monthlyCutoffDay < 1 ||
        input.monthlyCutoffDay > 28)
    )
      throw new ValidationError('Monthly cutoff day must be between 1 and 28');
    if (input.fixedAmountMinor !== undefined && input.fixedAmountMinor < 0n)
      throw new ValidationError('Fixed billing amount cannot be negative');
    if (
      input.includedMinutes !== undefined &&
      (!Number.isInteger(input.includedMinutes) || input.includedMinutes < 0)
    )
      throw new ValidationError('Included billing minutes must be a non-negative integer');
    if (
      cadence === 'semi_monthly' &&
      !['1_15_16_end', '1_15', '16_end'].includes(input.semiMonthlyRule ?? '1_15_16_end')
    )
      throw new ValidationError('Semi-monthly split is invalid');
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(input.projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    if (project.currency !== input.currency)
      throw new ValidationError('Billing currency must match the project currency');
    const legalEntity = this.activeLegalEntity(input.legalEntityId);
    if (legalEntity.currency !== input.currency)
      throw new ValidationError('Billing currency must match the legal entity currency');
    const taxProfile = this.sqlite
      .prepare('SELECT currency,status,legal_entity_id FROM tax_profile WHERE id=?')
      .get(input.taxProfileId) as
      | { currency: Currency; status: string; legal_entity_id: string | null }
      | undefined;
    if (!taxProfile) throw new ValidationError('Active tax profile not found');
    if (taxProfile.status !== 'active') throw new ValidationError('Active tax profile not found');
    if (taxProfile.legal_entity_id && taxProfile.legal_entity_id !== input.legalEntityId)
      throw new ValidationError('Tax profile belongs to a different legal entity');
    if (taxProfile.currency !== input.currency)
      throw new ValidationError('Billing currency must match the tax profile currency');
    if (input.billingContactId) {
      const contact = this.sqlite
        .prepare(
          'SELECT 1 FROM client_contact cc JOIN project p ON p.client_id=cc.client_id WHERE cc.id=? AND p.id=?',
        )
        .get(input.billingContactId, input.projectId);
      if (!contact)
        throw new ValidationError('Billing contact is not assigned to this project client');
    }
    const paymentTermsDays = input.paymentTermsDays ?? 30;
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365)
      throw new ValidationError('Payment terms are invalid');
    return this.transaction(() => {
      const activeEntity = this.activeLegalEntity(input.legalEntityId);
      if (activeEntity.currency !== input.currency)
        throw new ValidationError('Billing currency must match the legal entity currency');
      const activeTaxProfile = this.sqlite
        .prepare('SELECT currency,status,legal_entity_id FROM tax_profile WHERE id=?')
        .get(input.taxProfileId) as
        | { currency: Currency; status: string; legal_entity_id: string | null }
        | undefined;
      if (
        !activeTaxProfile ||
        activeTaxProfile.status !== 'active' ||
        activeTaxProfile.currency !== input.currency ||
        (activeTaxProfile.legal_entity_id !== null &&
          activeTaxProfile.legal_entity_id !== input.legalEntityId)
      )
        throw new ValidationError('Active tax profile matching the billing entity is required');
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO billing_rule(id,project_id,legal_entity_id,stream_type,enabled,cadence_type,anchor_date,tax_profile_id,currency,auto_generate_draft,auto_issue,auto_send,effective_from,created_at,updated_at,template_id,recipient_email,billing_contact_id,payment_terms_days,po_number_override,semi_monthly_rule,grouping_mode,fixed_amount_minor,included_minutes,monthly_cutoff_day) VALUES(?,?,?,?,1,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?,?, ?,?,?,?)',
        )
        .run(
          id,
          input.projectId,
          input.legalEntityId,
          input.streamType,
          cadence,
          input.anchorDate ?? null,
          input.taxProfileId,
          input.currency,
          input.autoGenerateDraft ? 1 : 0,
          input.effectiveFrom,
          timestamp,
          timestamp,
          templateId,
          input.recipientEmail || null,
          input.billingContactId || null,
          paymentTermsDays,
          input.poNumberOverride || null,
          input.semiMonthlyRule ?? '1_15_16_end',
          input.groupingMode ?? 'summary',
          input.fixedAmountMinor === undefined ? null : safeInteger(input.fixedAmountMinor),
          input.includedMinutes ?? null,
          input.monthlyCutoffDay ?? null,
        );
      this.audit(principal, 'billing_rule.create', 'billing_rule', id, {
        streamType: input.streamType,
      });
      return { id };
    });
  }

  listLegalEntities(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        "SELECT id,code,legal_name,currency FROM legal_entity WHERE status='active' ORDER BY code",
      )
      .all();
  }

  listTaxProfiles(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        "SELECT tp.id,tp.name,tp.currency,tp.effective_from,tp.legal_entity_id,le.code legal_entity_code FROM tax_profile tp LEFT JOIN legal_entity le ON le.id=tp.legal_entity_id WHERE tp.status='active' AND (tp.legal_entity_id IS NULL OR le.status='active') ORDER BY tp.name",
      )
      .all();
  }

  private effectiveBillingTimePolicy(
    projectId: string,
    workDate: string,
  ): EffectiveBillingTimePolicy | null {
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

  /**
   * Produce an ephemeral commercial view of immutable operational time. The
   * original row remains the invoice source even when threshold derivation
   * creates two invoice-line slices.
   */
  private billingTimeSlices(
    projectId: string,
    periodStart: string,
    periodEnd: string,
  ): readonly BillingTimeSlice[] {
    const rows = this.sqlite
      .prepare(
        `SELECT id,project_id,worker_id,work_date,category,activity_code,minutes,
                activity_summary,approval_state,billability_state,invoice_id,version
         FROM time_entry
         WHERE project_id=? AND work_date BETWEEN ? AND ?
           AND approval_state NOT IN ('rejected','void')
         ORDER BY work_date,worker_id,COALESCE(start_time,created_at),id`,
      )
      .all(projectId, periodStart, periodEnd) as BillingTimeRow[];
    const slicesBySource = new Map<string, BillingTimeSlice[]>();
    const policyByDate = new Map<string, EffectiveBillingTimePolicy | null>();
    for (const workDate of new Set(rows.map((row) => row.work_date))) {
      const policy = this.effectiveBillingTimePolicy(projectId, workDate);
      policyByDate.set(workDate, policy);
      if (!policy) continue;
      const eligible = rows
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
      const sourceRows = new Map(rows.map((row) => [row.id, row] as const));
      for (const slice of deriveTimeCommercialSlices({ entries: eligible, policy })) {
        const row = sourceRows.get(slice.sourceEntryId);
        if (!row) throw new ValidationError('Commercial time source is missing');
        const existing = slicesBySource.get(row.id) ?? [];
        existing.push({
          row,
          category: slice.category,
          minutes: slice.minutes,
          clientBillable: slice.clientBillable,
          policyId: policy.id,
          sliceIndex: existing.length,
        });
        slicesBySource.set(row.id, existing);
      }
    }
    return rows.flatMap((row) => {
      const derived = slicesBySource.get(row.id);
      if (derived && derived.length > 0) return derived;
      const policy = policyByDate.get(row.work_date) ?? null;
      return [
        {
          row,
          category: row.category === 'overtime' ? 'overtime' : 'regular',
          minutes: row.minutes,
          clientBillable: row.category === 'travel' ? (policy?.travelClientBillable ?? true) : true,
          policyId: policy?.id ?? null,
          sliceIndex: 0,
        },
      ];
    });
  }

  private billingSliceClientRate(
    principal: Principal | null,
    projectId: string,
    slice: BillingTimeSlice,
    execution?: FencedJobExecution,
    billingRuleId?: string,
  ): bigint | null {
    const row = slice.row;
    if (slice.category === 'overtime') {
      const overtime = this.findClientRateMinor(
        principal,
        projectId,
        row.worker_id,
        'overtime',
        row.work_date,
        row.activity_code,
        slice.category,
        execution,
        billingRuleId,
      );
      if (overtime !== null) return overtime;
    }
    return this.findClientRateMinor(
      principal,
      projectId,
      row.worker_id,
      row.category,
      row.work_date,
      row.activity_code,
      slice.category,
      execution,
      billingRuleId,
    );
  }

  billingReadiness(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    return this.billingReadinessCore(billingRuleId, periodStart, periodEnd, principal);
  }

  private billingReadinessCore(
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
    principal: Principal | null,
    execution?: FencedJobExecution,
  ) {
    const rule = this.sqlite
      .prepare(
        `SELECT br.project_id,br.stream_type,br.tax_profile_id,br.legal_entity_id,br.cadence_type,
                br.anchor_date,br.monthly_cutoff_day,br.semi_monthly_rule,
                br.currency rule_currency,
                p.billing_model,CAST(p.po_cap_minor AS TEXT) po_cap_minor,
                CAST(p.fixed_price_minor AS TEXT) fixed_price_minor,
                le.status legal_entity_status,le.currency legal_entity_currency,
                tp.status tax_profile_status,tp.currency tax_profile_currency,
                tp.legal_entity_id tax_profile_legal_entity_id
         FROM billing_rule br JOIN project p ON p.id=br.project_id
         LEFT JOIN legal_entity le ON le.id=br.legal_entity_id
         LEFT JOIN tax_profile tp ON tp.id=br.tax_profile_id
         WHERE br.id=? AND br.enabled=1`,
      )
      .get(billingRuleId) as
      | {
          project_id: string;
          stream_type: string;
          tax_profile_id: string | null;
          legal_entity_id: string | null;
          cadence_type: string;
          anchor_date: string | null;
          monthly_cutoff_day: number | null;
          semi_monthly_rule: string | null;
          rule_currency: Currency;
          billing_model: string;
          po_cap_minor: string | null;
          fixed_price_minor: string | null;
          legal_entity_status: string | null;
          legal_entity_currency: Currency | null;
          tax_profile_status: string | null;
          tax_profile_currency: Currency | null;
          tax_profile_legal_entity_id: string | null;
        }
      | undefined;
    if (!rule) throw new ValidationError('Billing rule not found');
    const existing = this.sqlite
      .prepare(
        'SELECT state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
      )
      .get(billingRuleId, periodStart, periodEnd) as { state: string } | undefined;
    const explicitlyClosed = existing?.state === 'closed';
    const reasons: ReadinessReason[] = [];
    if (!rule.tax_profile_id) reasons.push({ code: 'missing_tax_profile' });
    else if (rule.tax_profile_status !== 'active') reasons.push({ code: 'inactive_tax_profile' });
    if (!rule.legal_entity_id) reasons.push({ code: 'missing_legal_entity' });
    else if (rule.legal_entity_status !== 'active') reasons.push({ code: 'archived_legal_entity' });
    if (rule.legal_entity_status === 'active' && rule.legal_entity_currency !== rule.rule_currency)
      reasons.push({ code: 'legal_entity_currency_mismatch' });
    if (rule.tax_profile_status === 'active' && rule.tax_profile_currency !== rule.rule_currency)
      reasons.push({ code: 'tax_profile_currency_mismatch' });
    if (
      rule.tax_profile_legal_entity_id &&
      rule.tax_profile_legal_entity_id !== rule.legal_entity_id
    )
      reasons.push({ code: 'tax_profile_legal_entity_mismatch' });
    if (periodEnd < periodStart) reasons.push({ code: 'invalid_period' });
    if (
      !explicitlyClosed &&
      ['weekly', 'every_14_days', 'semi_monthly', 'monthly'].includes(rule.cadence_type)
    ) {
      try {
        const expected = periodForCadence(
          rule.cadence_type as 'weekly' | 'every_14_days' | 'semi_monthly' | 'monthly',
          periodStart,
          {
            anchorDate: rule.anchor_date ?? undefined,
            monthlyCutoffDay: rule.monthly_cutoff_day ?? undefined,
          },
        );
        if (!expected || expected.start !== periodStart || expected.end !== periodEnd)
          reasons.push({ code: 'period_cutoff_mismatch' });
      } catch {
        reasons.push({ code: 'invalid_period_configuration' });
      }
    }
    if (
      rule.billing_model === 'all_in' &&
      rule.stream_type === 'labor' &&
      rule.fixed_price_minor === null
    )
      reasons.push({ code: 'missing_fixed_price' });
    if (rule.billing_model === 'capped_tm' && rule.po_cap_minor !== null) {
      const consumedRows = this.sqlite
        .prepare(
          `SELECT CAST(subtotal_minor AS TEXT) amount FROM invoice
           WHERE project_id=? AND state IN ('draft','approved','issued','sent','partially_paid','paid','overdue')`,
        )
        .all(rule.project_id) as Array<{ amount: string }>;
      const consumed = consumedRows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
      if (consumed >= BigInt(rule.po_cap_minor)) reasons.push({ code: 'cap_exhausted' });
    }
    if (rule.stream_type === 'labor') {
      const pending = this.sqlite
        .prepare(
          "SELECT id FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ? AND approval_state NOT IN ('approved','locked','rejected','void')",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{ id: string }>;
      reasons.push(...pending.map((row) => ({ code: 'pending_time_approval', sourceId: row.id })));
      const missingRateSources = new Set<string>();
      for (const slice of this.billingTimeSlices(rule.project_id, periodStart, periodEnd)) {
        const row = slice.row;
        if (
          !['approved', 'locked'].includes(row.approval_state) ||
          row.billability_state !== 'billable' ||
          row.invoice_id !== null ||
          !slice.clientBillable
        )
          continue;
        if (
          this.billingSliceClientRate(
            principal,
            rule.project_id,
            slice,
            execution,
            billingRuleId,
          ) === null
        )
          missingRateSources.add(row.id);
      }
      reasons.push(
        ...[...missingRateSources].map((sourceId) => ({
          code: 'missing_client_rate',
          sourceId,
        })),
      );
    } else if (rule.stream_type === 'expense') {
      const pending = this.sqlite
        .prepare(
          "SELECT id FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND invoice_id IS NULL AND approval_state NOT IN ('rejected','void') AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem')) AND (approval_state!='approved' OR finance_approved_at IS NULL)",
        )
        .all(rule.project_id, periodStart, periodEnd) as Array<{ id: string }>;
      reasons.push(
        ...pending.map((row) => ({ code: 'pending_expense_approval', sourceId: row.id })),
      );
      const missingProjections = this.sqlite
        .prepare(
          `SELECT id,currency FROM expense
            WHERE project_id=? AND spent_on BETWEEN ? AND ? AND invoice_id IS NULL
              AND approval_state='approved' AND finance_approved_at IS NOT NULL
              AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment='allowance_per_diem')
              AND (
                (currency<>? AND (project_currency_amount_minor IS NULL OR billing_amount_minor IS NULL))
                OR
                (currency=? AND commercial_classification_state='classified'
                  AND (project_currency_amount_minor IS NULL OR billing_amount_minor IS NULL))
              )`,
        )
        .all(
          rule.project_id,
          periodStart,
          periodEnd,
          rule.rule_currency,
          rule.rule_currency,
        ) as Array<{
        id: string;
        currency: string;
      }>;
      reasons.push(
        ...missingProjections.map((row) => ({
          code:
            row.currency === rule.rule_currency
              ? 'missing_expense_finance_projection'
              : 'missing_expense_currency_conversion',
          sourceId: row.id,
        })),
      );
    }
    const state = reasons.length ? 'incomplete' : explicitlyClosed ? 'already_closed' : 'ready';
    return { state, reasons, projectId: rule.project_id, streamType: rule.stream_type } as const;
  }

  createInvoiceDraft(
    principal: Principal,
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    assertDate(periodStart, 'Period start');
    assertDate(periodEnd, 'Period end');
    const readiness = this.billingReadiness(principal, billingRuleId, periodStart, periodEnd);
    if (readiness.state !== 'ready' && readiness.state !== 'already_closed')
      throw new ReadinessError(readiness.reasons);
    return this.createInvoiceDraftCore(billingRuleId, periodStart, periodEnd, principal);
  }

  createInvoiceDraftFromJob(
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
    execution: FencedJobExecution,
  ) {
    if (!execution) throw new Error('FENCED_JOB_EXECUTION_INVALID');
    assertDate(periodStart, 'Period start');
    assertDate(periodEnd, 'Period end');
    return this.createInvoiceDraftCore(billingRuleId, periodStart, periodEnd, null, execution);
  }

  private createInvoiceDraftCore(
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
    principal: Principal | null,
    execution?: FencedJobExecution,
  ) {
    return this.transaction(() => {
      if (execution) {
        assertFencedJobExecution(this.sqlite, execution, {
          kind: 'auto_draft',
          capability: 'billing.draft.generate',
          payloadTarget: { billingRuleId, periodStart, periodEnd },
        });
        const readiness = this.billingReadinessCore(
          billingRuleId,
          periodStart,
          periodEnd,
          null,
          execution,
        );
        if (readiness.state !== 'ready' && readiness.state !== 'already_closed')
          throw new ReadinessError(readiness.reasons);
      }
      const existing = this.sqlite
        .prepare(
          'SELECT id,state FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=?',
        )
        .get(billingRuleId, periodStart, periodEnd) as { id: string; state: string } | undefined;
      let refreshed = false;
      if (existing) {
        if (existing.state !== 'draft') return { id: existing.id, created: false, refreshed };
        // Drafts are previews, so they can be rebuilt from newly approved
        // source data. Issued/approved invoices take a separate immutable
        // workflow and never reach this branch.
        this.sqlite
          .prepare('DELETE FROM invoice_commercial_source_manifest WHERE invoice_id=?')
          .run(existing.id);
        this.sqlite.prepare('DELETE FROM invoice_source WHERE invoice_id=?').run(existing.id);
        this.sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(existing.id);
        this.sqlite.prepare("DELETE FROM invoice WHERE id=? AND state='draft'").run(existing.id);
        refreshed = true;
      }
      const rule = this.sqlite
        .prepare(
          `SELECT br.*,p.billing_model,CAST(p.po_cap_minor AS TEXT) po_cap_minor,
                  CAST(p.fixed_price_minor AS TEXT) fixed_price_minor
           FROM billing_rule br JOIN project p ON p.id=br.project_id
           JOIN legal_entity le ON le.id=br.legal_entity_id AND le.status='active'
           JOIN tax_profile tp ON tp.id=br.tax_profile_id AND tp.status='active'
           WHERE br.id=? AND br.enabled=1`,
        )
        .get(billingRuleId) as {
        id: string;
        project_id: string;
        stream_type: string;
        currency: Currency;
        tax_profile_id: string;
        cadence_type: string;
        anchor_date: string | null;
        monthly_cutoff_day: number | null;
        semi_monthly_rule: string | null;
        billing_model: string;
        po_cap_minor: string | null;
        fixed_price_minor: string | null;
        fixed_amount_minor: string | null;
        included_minutes: number | null;
      };
      if (!rule)
        throw new ReadinessError([
          { code: 'archived_legal_entity' },
          { code: 'inactive_billing_configuration' },
        ]);
      if (periodEnd < periodStart)
        throw new ValidationError('Billing period end must follow start');
      if (['weekly', 'every_14_days', 'semi_monthly', 'monthly'].includes(rule.cadence_type)) {
        const expected = periodForCadence(
          rule.cadence_type as 'weekly' | 'every_14_days' | 'semi_monthly' | 'monthly',
          periodStart,
          {
            anchorDate: rule.anchor_date ?? undefined,
            monthlyCutoffDay: rule.monthly_cutoff_day ?? undefined,
          },
        );
        if (!expected || expected.start !== periodStart || expected.end !== periodEnd) {
          const explicitlyClosed = this.sqlite
            .prepare(
              "SELECT 1 FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=? AND state='closed'",
            )
            .get(billingRuleId, periodStart, periodEnd);
          if (!explicitlyClosed)
            throw new ValidationError('Billing period does not match the configured cadence');
        }
      }
      const id = newId();
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO invoice(id,project_id,billing_rule_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,period_start,period_end,created_at,updated_at) VALUES(?,?,?,?,?,?,0,0,0,?,?,?,?)',
        )
        .run(
          id,
          rule.project_id,
          billingRuleId,
          rule.stream_type,
          'draft',
          rule.currency,
          periodStart,
          periodEnd,
          timestamp,
          timestamp,
        );
      let subtotal = money(rule.currency, 0n);
      const consumedForCap =
        rule.billing_model === 'capped_tm' && rule.po_cap_minor !== null
          ? (
              this.sqlite
                .prepare(
                  `SELECT CAST(subtotal_minor AS TEXT) amount FROM invoice
                   WHERE project_id=? AND state IN ('draft','approved','issued','sent','partially_paid','paid','overdue')`,
                )
                .all(rule.project_id) as Array<{ amount: string }>
            ).reduce((sum, row) => sum + BigInt(row.amount), 0n)
          : 0n;
      const capRemaining =
        rule.billing_model === 'capped_tm' && rule.po_cap_minor !== null
          ? BigInt(rule.po_cap_minor) - consumedForCap
          : null;
      if (capRemaining !== null && capRemaining <= 0n)
        throw new ReadinessError([{ code: 'cap_exhausted' }]);
      const fixedAmount =
        rule.billing_model === 'all_in' && rule.stream_type === 'labor'
          ? rule.fixed_price_minor === null
            ? null
            : BigInt(rule.fixed_price_minor)
          : rule.billing_model === 'hybrid' && rule.fixed_amount_minor !== null
            ? BigInt(rule.fixed_amount_minor)
            : null;
      if (fixedAmount !== null) {
        subtotal = add(subtotal, money(rule.currency, fixedAmount));
        this.insertInvoiceLine(
          id,
          rule.billing_model === 'hybrid'
            ? 'Hybrid fixed commissioning fee'
            : 'Fixed-price project fee',
          1,
          1,
          safeInteger(fixedAmount),
          fixedAmount,
          'fixed_price',
          `${rule.project_id}:${rule.stream_type}:${periodStart}:${periodEnd}:fixed`,
          {
            projectId: rule.project_id,
            fixedAmountMinor: fixedAmount.toString(),
            billingModel: rule.billing_model,
          },
        );
      }
      if (
        rule.stream_type === 'labor' &&
        !(rule.billing_model === 'all_in' && fixedAmount !== null)
      ) {
        const slices = this.billingTimeSlices(rule.project_id, periodStart, periodEnd).filter(
          (slice) =>
            ['approved', 'locked'].includes(slice.row.approval_state) &&
            slice.row.billability_state === 'billable' &&
            slice.row.invoice_id === null &&
            slice.clientBillable,
        );
        const daily = new Map<
          string,
          {
            workerId: string;
            workDate: string;
            minutes: number;
            rate: bigint;
            sourceIds: Set<string>;
          }
        >();
        const reservedSources = new Set<string>();
        let includedRemaining =
          rule.billing_model === 'hybrid' ? Math.max(0, rule.included_minutes ?? 0) : 0;
        for (const slice of slices) {
          const row = slice.row;
          const rate = this.billingSliceClientRate(
            principal,
            rule.project_id,
            slice,
            execution,
            billingRuleId,
          );
          if (rate === null)
            throw new ReadinessError([{ code: 'missing_client_rate', sourceId: row.id }]);
          const billableMinutes =
            rule.billing_model === 'hybrid'
              ? Math.max(0, slice.minutes - Math.min(slice.minutes, includedRemaining))
              : slice.minutes;
          if (rule.billing_model === 'hybrid')
            includedRemaining = Math.max(0, includedRemaining - slice.minutes);
          if (!reservedSources.has(row.id)) {
            this.insertInvoiceSource(
              id,
              'time',
              row.id,
              row.version,
              rule.billing_model === 'capped_tm',
            );
            reservedSources.add(row.id);
          }
          if (billableMinutes === 0) continue;
          const amount = hourlyRateForMinutes(money(rule.currency, rate), billableMinutes);
          subtotal = add(subtotal, amount);
          const workerDayKey = `${row.worker_id}:${row.work_date}`;
          const day = daily.get(workerDayKey) ?? {
            workerId: row.worker_id,
            workDate: row.work_date,
            minutes: 0,
            rate: 0n,
            sourceIds: new Set<string>(),
          };
          day.minutes += billableMinutes;
          day.rate = day.rate > rate ? day.rate : rate;
          day.sourceIds.add(row.id);
          daily.set(workerDayKey, day);
          this.insertInvoiceLine(
            id,
            `${row.work_date} · ${row.category}${slice.category === 'overtime' && row.category !== 'overtime' ? ' → overtime' : ''} · ${row.activity_summary}`,
            billableMinutes,
            60,
            safeInteger(rate),
            amount.minorUnits,
            'time',
            row.id,
            {
              ...row,
              sourceEntryId: row.id,
              sourceVersion: row.version,
              sourceActualMinutes: row.minutes,
              commercialCategory: slice.category,
              commercialSliceMinutes: slice.minutes,
              commercialBilledMinutes: billableMinutes,
              commercialPolicyId: slice.policyId,
              commercialSliceIndex: slice.sliceIndex,
            },
          );
        }
        const minimum = this.sqlite
          .prepare('SELECT client_daily_minimum_minutes FROM project WHERE id=?')
          .get(rule.project_id) as { client_daily_minimum_minutes: number | null } | undefined;
        if (minimum?.client_daily_minimum_minutes) {
          for (const day of daily.values()) {
            const topUp = Math.max(0, minimum.client_daily_minimum_minutes - day.minutes);
            if (!topUp) continue;
            const amount = hourlyRateForMinutes(money(rule.currency, day.rate), topUp);
            subtotal = add(subtotal, amount);
            this.insertInvoiceLine(
              id,
              `${day.workDate} · contractual daily minimum top-up`,
              topUp,
              60,
              safeInteger(day.rate),
              amount.minorUnits,
              'billing_adjustment',
              `${rule.project_id}:${day.workerId}:${day.workDate}:daily-minimum`,
              {
                projectId: rule.project_id,
                workerId: day.workerId,
                workDate: day.workDate,
                actualMinutes: day.minutes,
                minimumMinutes: minimum.client_daily_minimum_minutes,
                topUpMinutes: topUp,
                sourceTimeIds: [...day.sourceIds],
              },
            );
          }
        }
      } else if (rule.stream_type === 'expense') {
        const rows = this.sqlite
          .prepare(
            "SELECT id,spent_on,vendor,category,description,currency,amount_minor,project_currency_amount_minor,billing_amount_minor,billing_treatment,commercial_classification_state,version FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ? AND approval_state='approved' AND finance_approved_at IS NOT NULL AND (billing_treatment LIKE 'reimbursable%' OR billing_treatment IN ('allowance_per_diem')) AND billing_state IN ('unlocked','locked') AND invoice_id IS NULL ORDER BY spent_on,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          spent_on: string;
          vendor: string;
          category: string;
          description: string;
          currency: Currency;
          amount_minor: number;
          project_currency_amount_minor: number | null;
          billing_amount_minor: number | null;
          billing_treatment: string;
          commercial_classification_state: string;
          version: number;
        }>;
        for (const row of rows) {
          if (
            row.currency !== rule.currency &&
            (row.project_currency_amount_minor === null || row.billing_amount_minor === null)
          )
            throw new ReadinessError([
              { code: 'missing_expense_currency_conversion', sourceId: row.id },
            ]);
          if (
            row.commercial_classification_state === 'classified' &&
            (row.project_currency_amount_minor === null || row.billing_amount_minor === null)
          )
            throw new ReadinessError([
              { code: 'missing_expense_finance_projection', sourceId: row.id },
            ]);
          const billedMinor = BigInt(
            row.billing_amount_minor ?? row.project_currency_amount_minor ?? row.amount_minor,
          );
          subtotal = add(subtotal, money(rule.currency, billedMinor));
          this.insertInvoiceLine(
            id,
            `${row.spent_on} · ${row.vendor} · ${row.category}`,
            1,
            1,
            safeInteger(billedMinor),
            billedMinor,
            'expense',
            row.id,
            row,
          );
          this.insertInvoiceSource(
            id,
            'expense',
            row.id,
            row.version,
            rule.billing_model === 'capped_tm',
          );
        }
      } else if (rule.stream_type === 'milestone') {
        const milestones = this.sqlite
          .prepare(
            "SELECT id,name,description,amount_minor,currency,due_on,version FROM project_milestone WHERE project_id=? AND approval_state='approved' AND invoice_id IS NULL AND (due_on IS NULL OR due_on BETWEEN ? AND ?) ORDER BY due_on,id",
          )
          .all(rule.project_id, periodStart, periodEnd) as Array<{
          id: string;
          name: string;
          description: string | null;
          amount_minor: number;
          currency: Currency;
          due_on: string | null;
          version: number;
        }>;
        for (const milestone of milestones) {
          if (milestone.currency !== rule.currency)
            throw new ValidationError('Milestone currency does not match the billing stream');
          const amount = money(rule.currency, BigInt(milestone.amount_minor));
          subtotal = add(subtotal, amount);
          this.insertInvoiceLine(
            id,
            `${milestone.name}${milestone.due_on ? ` · ${milestone.due_on}` : ''}`,
            1,
            1,
            milestone.amount_minor,
            amount.minorUnits,
            'milestone',
            milestone.id,
            milestone,
          );
          this.insertInvoiceSource(
            id,
            'milestone',
            milestone.id,
            milestone.version,
            rule.billing_model === 'capped_tm',
          );
        }
      }
      if (rule.billing_model === 'capped_tm')
        subtotal = money(
          rule.currency,
          this.applyPriorCappedSourceAllocations(id, rule.project_id),
        );
      if (capRemaining !== null && subtotal.minorUnits > capRemaining) {
        let remaining = capRemaining;
        const lines = this.sqlite
          .prepare(
            'SELECT id,subtotal_minor,snapshot_json FROM invoice_line WHERE invoice_id=? ORDER BY rowid',
          )
          .all(id) as Array<{ id: string; subtotal_minor: number; snapshot_json: string }>;
        for (const line of lines) {
          const original = BigInt(line.subtotal_minor);
          const allocated = remaining > 0n ? (original < remaining ? original : remaining) : 0n;
          const snapshot = JSON.parse(line.snapshot_json) as Record<string, unknown>;
          snapshot.capApplied = true;
          snapshot.originalSubtotalMinor = original.toString();
          snapshot.allocatedSubtotalMinor = allocated.toString();
          this.sqlite
            .prepare(
              'UPDATE invoice_line SET subtotal_minor=?,unit_price_minor=?,snapshot_json=? WHERE id=?',
            )
            .run(safeInteger(allocated), safeInteger(allocated), JSON.stringify(snapshot), line.id);
          remaining -= allocated;
        }
        subtotal = money(rule.currency, capRemaining);
      }
      if (rule.billing_model === 'all_in' && rule.stream_type === 'labor') {
        const coveredSources = new Map<string, { id: string; version: number }>();
        for (const slice of this.billingTimeSlices(rule.project_id, periodStart, periodEnd)) {
          if (
            ['approved', 'locked'].includes(slice.row.approval_state) &&
            slice.row.billability_state === 'billable' &&
            slice.row.invoice_id === null &&
            slice.clientBillable
          )
            coveredSources.set(slice.row.id, {
              id: slice.row.id,
              version: slice.row.version,
            });
        }
        for (const source of coveredSources.values())
          this.insertInvoiceSource(id, 'time', source.id, source.version);
      }
      if (subtotal.minorUnits <= 0n) throw new ReadinessError([{ code: 'no_billable_sources' }]);
      this.rebuildInvoiceCommercialManifest(id, rule.billing_model, timestamp);
      const components = this.sqlite
        .prepare(
          'SELECT basis_points,compound FROM tax_component WHERE tax_profile_id=? ORDER BY calculation_order,id',
        )
        .all(rule.tax_profile_id) as Array<{ basis_points: number; compound: number }>;
      const tax = calculateTaxComponents(
        subtotal,
        components.map((component) => ({
          basisPoints: component.basis_points,
          compound: component.compound === 1,
        })),
      ).total;
      const total = add(subtotal, tax);
      this.sqlite
        .prepare(
          'UPDATE invoice SET subtotal_minor=?,tax_minor=?,total_minor=?,updated_at=? WHERE id=?',
        )
        .run(
          safeInteger(subtotal.minorUnits),
          safeInteger(tax.minorUnits),
          safeInteger(total.minorUnits),
          timestamp,
          id,
        );
      if (principal)
        this.audit(principal, 'invoice.draft_create', 'invoice', id, {
          billingRuleId,
          periodStart,
          periodEnd,
        });
      return { id, created: !refreshed, refreshed };
    });
  }

  createInvoiceAdjustment(
    principal: Principal,
    input: Readonly<{
      originalInvoiceId: string;
      adjustmentType: 'credit' | 'debit' | 'correction';
      amountMinor: bigint;
      reason: string;
      idempotencyKey?: string;
    }>,
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    if (input.amountMinor === 0n) throw new ValidationError('Adjustment amount must be non-zero');
    const reason = assertText(input.reason, 'Adjustment reason', 2000);
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `adjustment-v1:${createHash('sha256')
        .update(
          JSON.stringify({
            originalInvoiceId: input.originalInvoiceId,
            adjustmentType: input.adjustmentType,
            amountMinor: input.amountMinor.toString(),
            reason,
          }),
        )
        .digest('hex')}`;
    if (idempotencyKey.length < 8 || idempotencyKey.length > 240)
      throw new ValidationError('Adjustment idempotency key is invalid');
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare(
          `SELECT ia.id adjustment_id,ia.original_invoice_id,ia.adjustment_invoice_id,
                  ia.adjustment_type,ia.reason,i.subtotal_minor
           FROM invoice_adjustment ia JOIN invoice i ON i.id=ia.adjustment_invoice_id
           WHERE ia.idempotency_key=?`,
        )
        .get(idempotencyKey) as
        | {
            adjustment_id: string;
            original_invoice_id: string;
            adjustment_invoice_id: string;
            adjustment_type: string;
            reason: string;
            subtotal_minor: number;
          }
        | undefined;
      const requestedSignedAmount =
        input.adjustmentType === 'credit'
          ? -(input.amountMinor < 0n ? -input.amountMinor : input.amountMinor)
          : input.adjustmentType === 'debit'
            ? input.amountMinor < 0n
              ? -input.amountMinor
              : input.amountMinor
            : input.amountMinor;
      if (existing) {
        if (
          existing.original_invoice_id !== input.originalInvoiceId ||
          existing.adjustment_type !== input.adjustmentType ||
          existing.reason !== reason ||
          BigInt(existing.subtotal_minor) !== requestedSignedAmount
        )
          throw new ConflictError(
            'Adjustment idempotency key was already used for another command',
          );
        return {
          id: existing.adjustment_invoice_id,
          adjustmentId: existing.adjustment_id,
          created: false,
        };
      }
      const original = this.sqlite
        .prepare(
          "SELECT id,project_id,billing_rule_id,currency,period_start,period_end,state,CAST(total_minor AS TEXT) total_minor FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue')",
        )
        .get(input.originalInvoiceId) as
        | {
            id: string;
            project_id: string;
            billing_rule_id: string;
            currency: Currency;
            period_start: string;
            period_end: string;
            state: string;
            total_minor: string;
          }
        | undefined;
      if (!original) throw new ValidationError('Issued original invoice required');
      if (requestedSignedAmount < 0n) {
        const originalGross = BigInt(original.total_minor);
        const requestedCredit = -requestedSignedAmount;
        if (originalGross <= 0n || requestedCredit > originalGross)
          throw new ValidationError('Credit adjustment exceeds original invoice gross');
        const priorCredits = (
          this.sqlite
            .prepare(
              `SELECT CAST(i.total_minor AS TEXT) amount
                 FROM invoice_adjustment ia
                 JOIN invoice i ON i.id=ia.adjustment_invoice_id
                WHERE ia.original_invoice_id=? AND i.total_minor<0 AND i.state!='void'`,
            )
            .all(original.id) as Array<{ amount: string }>
        ).reduce((sum, row) => sum - BigInt(row.amount), 0n);
        if (priorCredits + requestedCredit > originalGross)
          throw new ValidationError('Cumulative credit adjustments exceed original invoice gross');
      }
      const adjustmentId = newId();
      const invoiceId = newId();
      const signedAmount = requestedSignedAmount;
      const timestamp = now();
      this.sqlite
        .prepare(
          'INSERT INTO invoice(id,project_id,billing_rule_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,period_start,period_end,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          invoiceId,
          original.project_id,
          original.billing_rule_id,
          'adjustment',
          'draft',
          original.currency,
          safeInteger(signedAmount),
          0,
          safeInteger(signedAmount),
          original.period_start,
          original.period_end,
          timestamp,
          timestamp,
        );
      this.insertInvoiceLine(
        invoiceId,
        `${input.adjustmentType.toUpperCase()} · ${reason}`,
        1,
        1,
        safeInteger(signedAmount),
        signedAmount,
        'adjustment',
        adjustmentId,
        { originalInvoiceId: original.id, adjustmentType: input.adjustmentType, reason },
      );
      this.insertInvoiceSource(invoiceId, 'adjustment', adjustmentId, 1);
      this.rebuildInvoiceCommercialManifest(invoiceId, 'adjustment', timestamp);
      this.sqlite
        .prepare(
          'INSERT INTO invoice_adjustment(id,original_invoice_id,adjustment_invoice_id,adjustment_type,reason,created_by,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          adjustmentId,
          original.id,
          invoiceId,
          input.adjustmentType,
          reason,
          principal.userId,
          timestamp,
          idempotencyKey,
        );
      this.sqlite
        .prepare('UPDATE invoice SET version=version+1,updated_at=? WHERE id=?')
        .run(timestamp, original.id);
      this.audit(principal, 'invoice.adjustment.create', 'invoice', invoiceId, {
        originalInvoiceId: original.id,
        adjustmentType: input.adjustmentType,
        amountMinor: signedAmount.toString(),
      });
      return { id: invoiceId, adjustmentId, created: true };
    });
  }

  private findClientRate(
    principal: Principal,
    projectId: string,
    workerId: string,
    category: string,
    date: string,
    activityCode?: string | null,
  ): number | null {
    const minor = this.findClientRateMinor(
      principal,
      projectId,
      workerId,
      category,
      date,
      activityCode,
    );
    return minor === null ? null : safeInteger(minor);
  }

  private findClientRateMinor(
    principal: Principal | null,
    projectId: string,
    workerId: string,
    category: string,
    date: string,
    activityCode?: string | null,
    effectiveCategory: 'regular' | 'overtime' = category === 'overtime' ? 'overtime' : 'regular',
    execution?: FencedJobExecution,
    billingRuleId?: string,
  ): bigint | null {
    const resolved = execution
      ? new V3Repository(this.sqlite).resolveClientLaborRateFromJob(
          execution,
          billingRuleId ?? '',
          projectId,
          workerId,
          category,
          date,
          activityCode,
        )
      : principal
        ? new V3Repository(this.sqlite).resolveClientLaborRate(
            principal,
            projectId,
            workerId,
            category,
            date,
            activityCode,
          )
        : null;
    if (!resolved) return null;
    if (effectiveCategory === 'regular') return BigInt(resolved.hourlyRateMinor);
    if (category === 'overtime') return BigInt(resolved.effectiveRateMinor);
    const rate = this.sqlite
      .prepare(
        `SELECT overtime_method,overtime_multiplier_bps,overtime_rate_minor
         FROM client_labor_rate WHERE id=?`,
      )
      .get(resolved.id) as
      | {
          overtime_method: OvertimeMethod;
          overtime_multiplier_bps: number | null;
          overtime_rate_minor: number | null;
        }
      | undefined;
    if (!rate) throw new ConflictError('Resolved client rate disappeared');
    return overtimeRate(BigInt(resolved.hourlyRateMinor), rate.overtime_method, {
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

  private insertInvoiceLine(
    invoiceId: string,
    description: string,
    quantityNumerator: number,
    quantityDenominator: number,
    unitPriceMinor: number,
    subtotalMinor: bigint,
    sourceType: string,
    sourceId: string,
    snapshot: unknown,
  ): void {
    this.sqlite
      .prepare(
        'INSERT INTO invoice_line(id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,subtotal_minor,source_type,source_id,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        invoiceId,
        description,
        quantityNumerator,
        quantityDenominator,
        unitPriceMinor,
        safeInteger(subtotalMinor),
        sourceType,
        sourceId,
        JSON.stringify(snapshot),
      );
  }

  /**
   * Materialize the commercial allocation cut while the invoice is a mutable
   * draft. Issuance locks these rows, so later operational changes cannot
   * rewrite which source value was included, partially allocated, or covered
   * by an all-in/hybrid fixed amount.
   */
  private rebuildInvoiceCommercialManifest(
    invoiceId: string,
    billingModel: string,
    createdAt: string,
  ): void {
    this.sqlite
      .prepare('DELETE FROM invoice_commercial_source_manifest WHERE invoice_id=?')
      .run(invoiceId);
    const sourceRows = this.sqlite
      .prepare(
        `SELECT source_type,source_id,source_version
         FROM invoice_source WHERE invoice_id=? ORDER BY source_type,source_id`,
      )
      .all(invoiceId) as Array<{
      source_type: string;
      source_id: string;
      source_version: number;
    }>;
    const lines = this.sqlite
      .prepare(
        `SELECT source_type,source_id,subtotal_minor,snapshot_json
         FROM invoice_line WHERE invoice_id=? ORDER BY rowid`,
      )
      .all(invoiceId) as Array<{
      source_type: string;
      source_id: string;
      subtotal_minor: number;
      snapshot_json: string;
    }>;
    const bySource = new Map<
      string,
      { original: bigint; allocated: bigint; snapshots: string[] }
    >();
    for (const line of lines) {
      const key = `${line.source_type}\u0000${line.source_id}`;
      let snapshot: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(line.snapshot_json) as unknown;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
          snapshot = parsed as Record<string, unknown>;
      } catch {
        // The immutable hash below still includes the exact stored snapshot.
      }
      const original =
        typeof snapshot.originalSubtotalMinor === 'string' &&
        /^-?\d+$/u.test(snapshot.originalSubtotalMinor)
          ? BigInt(snapshot.originalSubtotalMinor)
          : BigInt(line.subtotal_minor);
      const current = bySource.get(key) ?? { original: 0n, allocated: 0n, snapshots: [] };
      current.original += original;
      current.allocated += BigInt(line.subtotal_minor);
      current.snapshots.push(line.snapshot_json);
      bySource.set(key, current);
    }
    // A capped source can remain only in the immutable commercial manifest
    // after its first invoice consumed a partial amount.  The global
    // invoice_source reservation intentionally cannot be duplicated, so the
    // next invoice must still emit a manifest row from its invoice line.
    // Include the union of source reservations and line provenance here;
    // otherwise a partial remainder would disappear from the audit cut.
    const sourceByKey = new Map<
      string,
      { source_type: string; source_id: string; source_version: number }
    >();
    for (const source of sourceRows)
      sourceByKey.set(`${source.source_type}\u0000${source.source_id}`, source);
    for (const line of lines) {
      if (!['time', 'expense', 'milestone', 'adjustment'].includes(line.source_type)) continue;
      const key = `${line.source_type}\u0000${line.source_id}`;
      if (sourceByKey.has(key)) continue;
      let sourceVersion = 1;
      try {
        const snapshot = JSON.parse(line.snapshot_json) as unknown;
        if (
          typeof snapshot === 'object' &&
          snapshot !== null &&
          !Array.isArray(snapshot) &&
          Number.isSafeInteger((snapshot as Record<string, unknown>).sourceVersion)
        )
          sourceVersion = Number((snapshot as Record<string, unknown>).sourceVersion);
      } catch {
        // The exact bytes remain in the source hash; the current source
        // version is checked again by the issue-time recheck.
      }
      sourceByKey.set(key, {
        source_type: line.source_type,
        source_id: line.source_id,
        source_version: sourceVersion,
      });
    }
    const insert = this.sqlite.prepare(
      `INSERT INTO invoice_commercial_source_manifest(
         manifest_id,invoice_id,source_type,source_id,source_version,disposition,
         original_minor,allocated_minor,remaining_minor,reason_code,source_hash,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const source of sourceByKey.values()) {
      const allocation = bySource.get(`${source.source_type}\u0000${source.source_id}`);
      const signedOriginal = allocation?.original ?? null;
      const signedAllocated = allocation?.allocated ?? null;
      const original =
        source.source_type === 'adjustment' && signedOriginal !== null
          ? signedOriginal < 0n
            ? -signedOriginal
            : signedOriginal
          : signedOriginal;
      const allocated =
        source.source_type === 'adjustment' && signedAllocated !== null
          ? signedAllocated < 0n
            ? -signedAllocated
            : signedAllocated
          : signedAllocated;
      const remaining = original === null || allocated === null ? null : original - allocated;
      const disposition =
        remaining === null || remaining === 0n
          ? 'included'
          : allocated === 0n
            ? 'blocked'
            : 'partially_included';
      const reasonCode =
        billingModel === 'capped_tm' && remaining !== null && remaining > 0n
          ? allocated === 0n
            ? 'capped_tm_blocked_by_cap'
            : 'capped_tm_partial_allocation'
          : billingModel === 'all_in'
            ? 'all_in_source_covered_by_fixed_price'
            : billingModel === 'hybrid' && !allocation
              ? 'hybrid_source_covered_by_fixed_price'
              : `${billingModel}_source_included`;
      const sourceHash = createHash('sha256')
        .update(
          JSON.stringify({
            sourceType: source.source_type,
            sourceId: source.source_id,
            sourceVersion: source.source_version,
            snapshots: allocation?.snapshots ?? [],
          }),
        )
        .digest('hex');
      insert.run(
        newId(),
        invoiceId,
        source.source_type,
        source.source_id,
        source.source_version,
        disposition,
        original === null ? null : safeInteger(original),
        allocated === null ? null : safeInteger(allocated),
        remaining === null ? null : safeInteger(remaining),
        reasonCode,
        sourceHash,
        createdAt,
      );
    }
    for (const line of lines.filter((candidate) => candidate.source_type === 'fixed_price')) {
      const allocation = bySource.get(`${line.source_type}\u0000${line.source_id}`);
      if (!allocation) continue;
      insert.run(
        newId(),
        invoiceId,
        'fixed_price',
        line.source_id,
        1,
        'included',
        safeInteger(allocation.original),
        safeInteger(allocation.allocated),
        safeInteger(allocation.original - allocation.allocated),
        billingModel === 'all_in' ? 'all_in_fixed_price' : 'hybrid_fixed_price',
        createHash('sha256').update(allocation.snapshots.join('\n')).digest('hex'),
        createdAt,
      );
    }
    for (const line of lines.filter(
      (candidate) => candidate.source_type === 'billing_adjustment',
    )) {
      const allocation = bySource.get(`${line.source_type}\u0000${line.source_id}`);
      if (!allocation) continue;
      insert.run(
        newId(),
        invoiceId,
        'minimum_top_up',
        line.source_id,
        1,
        'included',
        safeInteger(allocation.original),
        safeInteger(allocation.allocated),
        safeInteger(allocation.original - allocation.allocated),
        'contractual_daily_minimum_top_up',
        createHash('sha256').update(allocation.snapshots.join('\n')).digest('hex'),
        createdAt,
      );
    }
    // Materialize the canonical source authority while the invoice is still
    // a mutable draft. The manifest hash covers the source identity, version
    // and exact line snapshots; the signed net allocation comes from the
    // invoice lines (commercial-manifest adjustment values are deliberately
    // absolute). Issuance only adds the lock timestamp, preserving these
    // bytes as historical truth.
    this.sqlite
      .prepare(
        `UPDATE invoice_source AS source
            SET source_hash=(
                  SELECT manifest.source_hash
                    FROM invoice_commercial_source_manifest manifest
                   WHERE manifest.invoice_id=source.invoice_id
                     AND manifest.source_type=source.source_type
                     AND manifest.source_id=source.source_id
                ),
                allocated_net_minor=(
                  SELECT CAST(SUM(line.subtotal_minor) AS INTEGER)
                    FROM invoice_line line
                   WHERE line.invoice_id=source.invoice_id
                     AND line.source_type=CASE source.source_type
                       WHEN 'minimum_top_up' THEN 'billing_adjustment' ELSE source.source_type END
                     AND line.source_id=source.source_id
                ),
                allocated_tax_minor=(
                  SELECT CAST(SUM(COALESCE(line.tax_amount_minor,line.tax_minor,0)) AS INTEGER)
                    FROM invoice_line line
                   WHERE line.invoice_id=source.invoice_id
                     AND line.source_type=CASE source.source_type
                       WHEN 'minimum_top_up' THEN 'billing_adjustment' ELSE source.source_type END
                     AND line.source_id=source.source_id
                ),
                allocated_gross_minor=(
                  SELECT CAST(SUM(COALESCE(line.gross_amount_minor,
                           line.subtotal_minor+COALESCE(line.tax_amount_minor,line.tax_minor,0))) AS INTEGER)
                    FROM invoice_line line
                   WHERE line.invoice_id=source.invoice_id
                     AND line.source_type=CASE source.source_type
                       WHEN 'minimum_top_up' THEN 'billing_adjustment' ELSE source.source_type END
                     AND line.source_id=source.source_id
                ),
                created_at=COALESCE(source.created_at,?)
          WHERE source.invoice_id=? AND source.locked_at IS NULL
            AND EXISTS(
              SELECT 1 FROM invoice_commercial_source_manifest manifest
               WHERE manifest.invoice_id=source.invoice_id
                 AND manifest.source_type=source.source_type
                 AND manifest.source_id=source.source_id
            )`,
      )
      .run(createdAt, invoiceId);
  }

  /**
   * A capped source may span more than one invoice after an authorised cap
   * increase.  Immutable manifests are the allocation ledger: remove only
   * amounts allocated by non-void historical invoices, line by line, before
   * applying the current cap.  This prevents both duplicate billing and the
   * old permanent-reservation failure for a legitimate remainder.
   */
  private applyPriorCappedSourceAllocations(invoiceId: string, projectId: string): bigint {
    const lines = this.sqlite
      .prepare(
        `SELECT id,source_type,source_id,subtotal_minor,snapshot_json
           FROM invoice_line WHERE invoice_id=? ORDER BY rowid`,
      )
      .all(invoiceId) as Array<{
      id: string;
      source_type: string;
      source_id: string;
      subtotal_minor: number;
      snapshot_json: string;
    }>;
    const priorBySource = new Map<string, bigint>();
    let subtotal = 0n;
    for (const line of lines) {
      const key = `${line.source_type}\u0000${line.source_id}`;
      let prior = priorBySource.get(key);
      if (prior === undefined) {
        const rows = this.sqlite
          .prepare(
            `SELECT CAST(m.allocated_minor AS TEXT) allocated_minor
               FROM invoice_commercial_source_manifest m
               JOIN invoice historical ON historical.id=m.invoice_id
              WHERE historical.project_id=? AND historical.id<>?
                AND historical.state IN ('issued','sent','partially_paid','paid','overdue')
                AND m.source_type=? AND m.source_id=? AND m.allocated_minor IS NOT NULL`,
          )
          .all(projectId, invoiceId, line.source_type, line.source_id) as Array<{
          allocated_minor: string;
        }>;
        prior = rows.reduce((sum, row) => sum + BigInt(row.allocated_minor), 0n);
      }
      const original = BigInt(line.subtotal_minor);
      const consumed = prior > 0n ? (prior < original ? prior : original) : 0n;
      const remaining = original - consumed;
      priorBySource.set(key, prior - consumed);
      let snapshot: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(line.snapshot_json) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          snapshot = parsed as Record<string, unknown>;
      } catch {
        // Preserve a truthful new snapshot even if a mutable draft contained
        // malformed legacy JSON; issued snapshots remain protected elsewhere.
      }
      snapshot.sourceOriginalSubtotalMinor = original.toString();
      snapshot.priorAllocatedSubtotalMinor = consumed.toString();
      this.sqlite
        .prepare(
          'UPDATE invoice_line SET subtotal_minor=?,unit_price_minor=?,snapshot_json=? WHERE id=?',
        )
        .run(safeInteger(remaining), safeInteger(remaining), JSON.stringify(snapshot), line.id);
      subtotal += remaining;
    }
    return subtotal;
  }

  private insertInvoiceSource(
    invoiceId: string,
    sourceType: string,
    sourceId: string,
    sourceVersion: number,
    allowPriorCappedAllocation = false,
  ): void {
    const identity = this.deploymentIdentity();
    const existing = this.sqlite
      .prepare(
        'SELECT invoice_id,source_version FROM invoice_source WHERE source_type=? AND source_id=?',
      )
      .get(sourceType, sourceId) as { invoice_id: string; source_version: number } | undefined;
    if (existing) {
      if (existing.invoice_id !== invoiceId) {
        const reusable = allowPriorCappedAllocation
          ? this.sqlite
              .prepare(
                `SELECT 1
                   FROM invoice historical
                   JOIN invoice_commercial_source_manifest manifest
                     ON manifest.invoice_id=historical.id
                  WHERE historical.id=?
                    AND historical.state IN ('issued','sent','partially_paid','paid','overdue','void')
                    AND manifest.source_type=? AND manifest.source_id=?
                    AND manifest.disposition IN ('partially_included','blocked')`,
              )
              .get(existing.invoice_id, sourceType, sourceId)
          : undefined;
        if (!reusable)
          throw new ConflictError(
            `Source ${sourceType}:${sourceId} is already reserved for billing`,
          );
        return;
      }
      if (existing.source_version !== sourceVersion)
        throw new ConflictError(`Source ${sourceType}:${sourceId} snapshot version changed`);
      // Retrying the same source reservation for the same invoice is safe and
      // idempotent. The source row is immutable once it is attached to an
      // issued invoice, so never rewrite it in place.
      return;
    }
    // Native links use the same framed, byte-preserving identity convention as
    // the 0020 legacy backfill. Including the immutable deployment anchor and
    // the native provenance prefix keeps the relationship deterministic while
    // remaining collision-free for separators, Unicode and control bytes.
    const frame = (value: string): string =>
      Buffer.from(value, 'utf8').toString('hex').toUpperCase();
    const sourceLinkId = [
      'native-source-v1',
      frame(identity.tenantId),
      frame(identity.deploymentId),
      frame(invoiceId),
      frame(sourceType),
      frame(sourceId),
    ].join(':');
    this.sqlite
      .prepare(
        'INSERT INTO invoice_source(source_link_id,invoice_id,source_type,source_id,source_version) VALUES(?,?,?,?,?)',
      )
      .run(sourceLinkId, invoiceId, sourceType, sourceId, sourceVersion);
  }

  approveInvoiceDraft(principal: Principal, invoiceId: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    const timestamp = now();
    const result = this.sqlite
      .prepare(
        "UPDATE invoice SET state='approved',updated_at=?,version=version+1 WHERE id=? AND state='draft'",
      )
      .run(timestamp, invoiceId);
    if (result.changes !== 1) throw new ConflictError('Draft invoice required');
    this.audit(principal, 'invoice.approve', 'invoice', invoiceId, {});
  }

  /**
   * Customer sign-off is a project commercial policy gate at invoice issue.
   * Draft creation and approval remain previews; the first issuance mutation
   * is the point at which the exact current customer report binding is
   * required.  This reads the canonical report/conformity rows directly so no
   * finance calculation or UI projection can bypass the gate.
   */
  private assertInvoiceCustomerConformity(invoice: InvoiceRow): void {
    const policy = this.sqlite
      .prepare(
        `SELECT customer_signoff_required
         FROM project_commercial_policy
         WHERE project_id=? AND effective_from<=?
           AND (effective_to IS NULL OR effective_to>=?)
         ORDER BY effective_from DESC,version DESC,id DESC LIMIT 1`,
      )
      .get(invoice.project_id, invoice.period_end, invoice.period_end) as
      | { customer_signoff_required: number }
      | undefined;
    if (!policy || policy.customer_signoff_required !== 1) return;

    const report = this.sqlite
      .prepare(
        `SELECT id
         FROM period_report
         WHERE project_id=? AND audience='customer'
           AND state IN ('approved','final')
           AND period_start=? AND period_end=?
         ORDER BY updated_at DESC,id DESC
         LIMIT 1`,
      )
      .get(invoice.project_id, invoice.period_start, invoice.period_end) as
      | { id: string }
      | undefined;
    const reportId = report?.id;
    const currentBinding = report
      ? (this.sqlite
          .prepare(
            `SELECT report.project_id,report.pdf_storage_key,report.pdf_sha256,
                    report.pdf_byte_length,conformity.snapshot_json
             FROM period_report report
             JOIN customer_conformity conformity
               ON conformity.period_report_id=report.id
              AND conformity.snapshot_version=report.snapshot_version
              AND conformity.snapshot_sha256=report.snapshot_sha256
              AND conformity.snapshot_json=report.snapshot_json
              AND conformity.report_pdf_storage_key=report.pdf_storage_key
              AND conformity.report_pdf_sha256=report.pdf_sha256
              AND conformity.report_pdf_byte_length=report.pdf_byte_length
             WHERE report.id=?
               AND report.snapshot_version>=1
               AND report.snapshot_sha256 IS NOT NULL
               AND report.pdf_storage_key IS NOT NULL
               AND report.pdf_sha256 IS NOT NULL
               AND report.pdf_byte_length IS NOT NULL
               AND NOT EXISTS(
                 SELECT 1 FROM customer_conformity_invalidation invalidation
                 WHERE invalidation.conformity_id=conformity.id
               )
             LIMIT 1`,
          )
          .get(report.id) as
          | {
              project_id: string;
              pdf_storage_key: string;
              pdf_sha256: string;
              pdf_byte_length: number;
              snapshot_json: string;
            }
          | undefined)
      : undefined;
    if (currentBinding) {
      try {
        verifyPrivatePdfArtifact({
          storageKey: currentBinding.pdf_storage_key,
          sha256: currentBinding.pdf_sha256,
          byteLength: currentBinding.pdf_byte_length,
          requiredPrefix: `reports/${reportId}/`,
        });
        const registeredDocument = this.sqlite
          .prepare(
            `SELECT project_id,state,scan_status,artifact_type,media_type,sha256,byte_length
               FROM document WHERE storage_key=? ORDER BY created_at DESC LIMIT 1`,
          )
          .get(currentBinding.pdf_storage_key) as
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
        if (
          !registeredDocument ||
          (registeredDocument.project_id === currentBinding.project_id &&
            registeredDocument.state === 'committed' &&
            (registeredDocument.scan_status === 'clean' ||
              registeredDocument.scan_status === 'not_scanned') &&
            registeredDocument.artifact_type === 'report' &&
            registeredDocument.media_type === 'application/pdf' &&
            registeredDocument.sha256 === currentBinding.pdf_sha256 &&
            registeredDocument.byte_length === currentBinding.pdf_byte_length)
        ) {
          const canonical = canonicalCustomerPeriodSnapshot(currentBinding.snapshot_json);
          const snapshotRows = canonical.value.timeSummary;
          if (!Array.isArray(snapshotRows)) throw new Error('Signed time summary is missing');
          const covered = new Set(
            snapshotRows.map((entry) => {
              if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
                throw new Error('Signed time source binding is malformed');
              const row = entry as Record<string, unknown>;
              if (typeof row.id !== 'string' || !Number.isSafeInteger(row.version))
                throw new Error('Signed time source binding is missing');
              return `${row.id}:${String(row.version)}`;
            }),
          );
          const invoiceTimeSources = this.sqlite
            .prepare(
              `SELECT source_id,source_version
                 FROM invoice_source
                WHERE invoice_id=? AND source_type='time'
                ORDER BY source_id`,
            )
            .all(invoice.id) as Array<{ source_id: string; source_version: number }>;
          if (
            invoiceTimeSources.every((source) =>
              covered.has(`${source.source_id}:${String(source.source_version)}`),
            )
          )
            return;
        }
      } catch {
        // Fall through to the same explicit billing readiness blocker.
      }
    }

    throw new ReadinessError([
      {
        code: 'customer_signoff_required',
        ...(reportId ? { sourceId: reportId } : {}),
        deepLink: reportId
          ? `/app/reports/period/${reportId}`
          : `/app/reports?view=signoff&projectId=${encodeURIComponent(invoice.project_id)}&periodStart=${encodeURIComponent(invoice.period_start)}&periodEnd=${encodeURIComponent(invoice.period_end)}`,
      },
    ]);
  }

  issueInvoice(principal: Principal, invoiceId: string, reportLocale: ReportLocale = 'en') {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    return this.transaction(() => {
      // Read monetary columns as text.  Node's sqlite INTEGER reader returns
      // JavaScript numbers by default and therefore rejects/rounds values
      // outside Number.MAX_SAFE_INTEGER before the domain can turn them into
      // bigint.  Issuance is an exact-money boundary, so keep the SQLite
      // integer representation textual until the snapshot is serialized.
      const invoice = this.sqlite
        .prepare(
          `SELECT id,project_id,invoice_number,stream_type,state,currency,
                  CAST(subtotal_minor AS TEXT) subtotal_minor,
                  CAST(tax_minor AS TEXT) tax_minor,
                  CAST(total_minor AS TEXT) total_minor,
                  issued_at,snapshot_json,billing_rule_id,period_start,period_end
             FROM invoice WHERE id=?`,
        )
        .get(invoiceId) as InvoiceRow | undefined;
      if (!invoice) throw new ValidationError('Invoice not found');
      if (
        ['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'credited'].includes(
          invoice.state,
        ) &&
        invoice.invoice_number
      )
        return { invoiceNumber: invoice.invoice_number, issued: false };
      if (invoice.state !== 'approved') throw new ConflictError('Approved invoice draft required');
      this.assertInvoiceCustomerConformity(invoice);
      this.recheckInvoiceSources(invoice);
      const context = this.sqlite
        .prepare(
          `SELECT br.legal_entity_id,br.template_id,br.recipient_email,br.payment_terms_days billing_payment_terms_days,
                  br.po_number_override,br.grouping_mode,br.cadence_type,br.anchor_date,br.billing_contact_id,
                  le.code,le.legal_name,le.billing_address,le.company_identifiers,
                  le.status legal_entity_status,le.currency legal_entity_currency,
                  c.legal_name client_legal_name,c.client_code,c.client_number,c.billing_address client_billing_address,
                  c.po_reference client_po_reference,c.billing_email,c.payment_terms_days,
                  p.project_number,p.name project_name,p.cost_center_code,p.po_number,
                  tp.id tax_profile_id,tp.name tax_name,tp.currency tax_currency,tp.status tax_profile_status,
                  tp.jurisdiction_label,tp.description tax_description
           FROM billing_rule br JOIN legal_entity le ON le.id=br.legal_entity_id
           JOIN project p ON p.id=br.project_id JOIN client c ON c.id=p.client_id
           JOIN tax_profile tp ON tp.id=br.tax_profile_id WHERE br.id=?`,
        )
        .get(invoice.billing_rule_id) as
        | {
            legal_entity_id: string;
            template_id: string;
            recipient_email: string | null;
            billing_payment_terms_days: number;
            po_number_override: string | null;
            grouping_mode: string;
            cadence_type: string;
            anchor_date: string | null;
            billing_contact_id: string | null;
            code: string;
            legal_name: string;
            billing_address: string;
            company_identifiers: string;
            legal_entity_status: string;
            legal_entity_currency: Currency;
            client_legal_name: string;
            client_code: string | null;
            client_number: string;
            client_billing_address: string | null;
            client_po_reference: string | null;
            billing_email: string | null;
            payment_terms_days: number;
            project_number: string;
            project_name: string;
            cost_center_code: string | null;
            po_number: string | null;
            tax_profile_id: string;
            tax_name: string;
            tax_currency: Currency;
            tax_profile_status: string;
            jurisdiction_label: string | null;
            tax_description: string | null;
          }
        | undefined;
      if (!context) throw new ValidationError('Billing context is incomplete');
      if (context.legal_entity_status !== 'active')
        throw new ValidationError('Cannot issue invoice for an archived legal entity');
      if (context.tax_profile_status !== 'active')
        throw new ValidationError('Cannot issue invoice with an inactive tax profile');
      if (context.legal_entity_currency !== invoice.currency)
        throw new ValidationError('Legal entity currency no longer matches the invoice currency');
      if (context.tax_currency !== invoice.currency)
        throw new ValidationError('Tax profile currency no longer matches the invoice currency');
      const deployment = this.deploymentIdentity();
      const canonicalAuthority = this.sqlite
        .prepare(
          `SELECT bridge.canonical_revision_id legal_entity_revision_id
             FROM legal_entity_revision_bridge bridge
             JOIN project_legal_entity_assignment assignment
               ON assignment.legal_entity_revision_id=bridge.canonical_revision_id
              AND assignment.project_id=?
              AND assignment.tenant_id=? AND assignment.deployment_id=?
              AND assignment.effective_from<=?
              AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
            WHERE bridge.legacy_legal_entity_id=?
              AND bridge.tenant_id=? AND bridge.deployment_id=?
            ORDER BY assignment.effective_from DESC,assignment.assignment_id DESC
            LIMIT 1`,
        )
        .get(
          invoice.project_id,
          deployment.tenantId,
          deployment.deploymentId,
          invoice.period_start,
          invoice.period_end,
          context.legal_entity_id,
          deployment.tenantId,
          deployment.deploymentId,
        ) as { legal_entity_revision_id: string } | undefined;
      if (!canonicalAuthority?.legal_entity_revision_id)
        throw new ReadinessError(
          [
            {
              code: 'canonical_legal_entity_revision_required',
              sourceId: invoice.project_id,
            },
          ],
          'Canonical legal entity revision is required',
        );
      const billingContact = context.billing_contact_id
        ? (this.sqlite
            .prepare('SELECT id,name,email,phone,role FROM client_contact WHERE id=?')
            .get(context.billing_contact_id) as
            | {
                id: string;
                name: string;
                email: string | null;
                phone: string | null;
                role: string | null;
              }
            | undefined)
        : undefined;
      const taxComponents = this.sqlite
        .prepare(
          `SELECT id,name,basis_points,calculation_order,compound,calculation_type,display_mode,basis
           FROM tax_component WHERE tax_profile_id=? ORDER BY calculation_order,id`,
        )
        .all(context.tax_profile_id);
      const policy = this.sqlite
        .prepare(
          'SELECT prefix,digits FROM invoice_number_policy WHERE legal_entity_id=? AND accountant_approved_at IS NOT NULL AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1',
        )
        .get(context.legal_entity_id, today(), today()) as
        | { prefix: string; digits: number }
        | undefined;
      if (!policy)
        throw new ReadinessError([{ code: 'missing_accountant_approved_number_policy' }]);
      const lines = this.sqlite
        .prepare(
          `SELECT id,invoice_id,description,quantity_numerator,quantity_denominator,
                  CAST(unit_price_minor AS TEXT) unit_price_minor,
                  CAST(subtotal_minor AS TEXT) subtotal_minor,
                  source_type,source_id,snapshot_json,
                  CAST(tax_minor AS TEXT) tax_minor,grouping_key,line_number,line_kind,
                  CAST(unit_amount_minor AS TEXT) unit_amount_minor,
                  CAST(net_amount_minor AS TEXT) net_amount_minor,tax_bps,
                  CAST(tax_amount_minor AS TEXT) tax_amount_minor,
                  CAST(gross_amount_minor AS TEXT) gross_amount_minor,
                  source_bucket_key,rounding_rank,created_at
             FROM invoice_line WHERE invoice_id=? ORDER BY rowid`,
        )
        .all(invoiceId);
      const sources = this.sqlite
        .prepare(
          `SELECT source_link_id,invoice_id,invoice_line_id,source_type,source_id,source_version,
                  locked_at,source_hash,
                  CAST(allocated_net_minor AS TEXT) allocated_net_minor,
                  CAST(allocated_tax_minor AS TEXT) allocated_tax_minor,
                  CAST(allocated_gross_minor AS TEXT) allocated_gross_minor,created_at
             FROM invoice_source
            WHERE invoice_id=? ORDER BY source_type,source_id`,
        )
        .all(invoiceId);
      const commercialSourceManifest = this.sqlite
        .prepare(
          `SELECT source_type,source_id,source_version,disposition,
                  CAST(original_minor AS TEXT) original_minor,
                  CAST(allocated_minor AS TEXT) allocated_minor,
                  CAST(remaining_minor AS TEXT) remaining_minor,
                  reason_code,source_hash
           FROM invoice_commercial_source_manifest
           WHERE invoice_id=? ORDER BY source_type,source_id`,
        )
        .all(invoiceId);
      if (lines.length === 0) throw new ConflictError('Invoice line projection is empty');
      if (commercialSourceManifest.length === 0)
        throw new ConflictError('Invoice commercial source manifest is empty');
      this.recheckInvoiceProjection(
        invoice,
        lines as InvoiceIssueLine[],
        commercialSourceManifest as InvoiceIssueManifest[],
      );
      const year = new Date().getUTCFullYear();
      const sequence = this.nextSequence('invoice', `${context.legal_entity_id}:${year}`);
      const invoiceNumber = `${policy.prefix}-${year}-${String(sequence).padStart(policy.digits, '0')}`;
      const issuedAt = now();
      const due = new Date(
        Date.parse(issuedAt) + context.billing_payment_terms_days * 86_400_000,
      ).toISOString();
      let draftCustomizations: Record<string, unknown> = {};
      if (invoice.snapshot_json) {
        try {
          draftCustomizations = JSON.parse(invoice.snapshot_json);
        } catch {
          // Preserve issuance using the canonical defaults when a legacy snapshot is malformed.
        }
      }
      const snapshot = {
        template: {
          id: controlledInvoiceTemplateId(context.template_id, invoice.stream_type),
          version: 1,
          configuredByBillingRule: true,
        },
        legalEntity: {
          id: context.legal_entity_id,
          revisionId: canonicalAuthority?.legal_entity_revision_id ?? null,
          code: context.code,
          legalName: context.legal_name,
          billingAddress: context.billing_address,
          companyIdentifiers: context.company_identifiers,
        },
        client: {
          code: context.client_code,
          legalName: context.client_legal_name,
          number: context.client_number,
          billingAddress: context.client_billing_address,
          poReference: context.client_po_reference,
          billingEmail: context.billing_email,
          recipientEmail: context.recipient_email,
          billingContact: billingContact ?? null,
        },
        project: {
          number: context.project_number,
          name: context.project_name,
          costCenterCode: context.cost_center_code,
          poNumber: context.po_number_override ?? context.po_number,
        },
        purchaseNo:
          draftCustomizations.purchaseNo ??
          context.po_number_override ??
          context.po_number ??
          context.client_po_reference ??
          null,
        termsAndInstructions: draftCustomizations.termsAndInstructions ?? {
          bankSwiftNumber: 'WFBIUS6S',
          bankAccountNumber: '8769915615',
          bankName: 'Wells Fargo Bank',
          beneficiary: 'J&A Automation LLC',
          pastDueNotice:
            'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law',
        },
        companyInfo: draftCustomizations.companyInfo ?? {
          name: 'J&A Automation LLC',
          division: 'USA division',
          phone: '+1 (864) 208 4684',
          address: '112 Birkshire Dr, Georgetown TX 78626',
          email: 'field.operations@j-aautomation.com',
          website: 'www.j-aautomation.com',
        },
        discountMinor: draftCustomizations.discountMinor ?? '0',
        servicePeriod: { start: invoice.period_start, end: invoice.period_end },
        number: invoiceNumber,
        locale: normalizeReportLocale(reportLocale),
        invoiceNumber,
        commercial: {
          streamType: invoice.stream_type,
          cadence: context.cadence_type,
          anchorDate: context.anchor_date,
          groupingMode: context.grouping_mode,
          paymentTermsDays: context.billing_payment_terms_days,
          poNumberOverride: context.po_number_override,
        },
        taxProfile: {
          id: context.tax_profile_id,
          name: context.tax_name,
          currency: context.tax_currency,
          jurisdiction: context.jurisdiction_label,
          description: context.tax_description,
          components: taxComponents,
        },
        calculation: {
          currency: invoice.currency,
          subtotalMinor: String(invoice.subtotal_minor),
          taxMinor: String(invoice.tax_minor),
          totalMinor: String(invoice.total_minor),
        },
        dueAt: due,
        billingRuleId: invoice.billing_rule_id,
        lines,
        sources,
        commercialSourceManifest,
        generatedAt: issuedAt,
      };
      const snapshotJson = JSON.stringify(snapshot);
      const calculationHash = createHash('sha256').update(snapshotJson).digest('hex');
      new V3Repository(this.sqlite).freezeInvoiceDirectCosts(
        invoiceId,
        canonicalAuthority?.legal_entity_revision_id ?? null,
        issuedAt,
      );
      // Lock source rows while the invoice is still approved.  The finance
      // migration deliberately makes issued source rows immutable, so this
      // mutation must be part of the same transaction immediately before the
      // approved -> issued transition rather than a second update afterwards.
      const sourceLock = this.sqlite
        .prepare('UPDATE invoice_source SET locked_at=? WHERE invoice_id=? AND locked_at IS NULL')
        .run(issuedAt, invoiceId);
      if (sourceLock.changes !== sources.length)
        throw new ConflictError('Invoice sources changed before issue');
      const manifestLock = this.sqlite
        .prepare(
          'UPDATE invoice_commercial_source_manifest SET locked_at=? WHERE invoice_id=? AND locked_at IS NULL',
        )
        .run(issuedAt, invoiceId);
      if (manifestLock.changes !== commercialSourceManifest.length)
        throw new ConflictError('Invoice commercial source manifest changed before issue');
      const invoiceTransition = this.sqlite
        .prepare(
          "UPDATE invoice SET invoice_number=?,state='issued',issued_at=?,due_at=?,snapshot_json=?,calculation_hash=?,source_lock_at=?,tenant_id=?,deployment_id=?,legal_entity_revision_id=?,pdf_status='pending',updated_at=?,version=version+1 WHERE id=? AND state='approved'",
        )
        .run(
          invoiceNumber,
          issuedAt,
          due,
          snapshotJson,
          calculationHash,
          issuedAt,
          deployment.tenantId,
          deployment.deploymentId,
          canonicalAuthority?.legal_entity_revision_id ?? null,
          issuedAt,
          invoiceId,
        );
      if (invoiceTransition.changes !== 1) throw new ConflictError('Invoice changed before issue');
      const sourceRows = this.sqlite
        .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
        .all(invoiceId) as Array<{ source_type: string; source_id: string }>;
      const manifestOnlySources = this.sqlite
        .prepare(
          `SELECT source_type,source_id FROM invoice_commercial_source_manifest
            WHERE invoice_id=? AND source_type IN ('time','expense','milestone')
              AND NOT EXISTS(
                SELECT 1 FROM invoice_source reserved
                 WHERE reserved.invoice_id=?
                   AND reserved.source_type=invoice_commercial_source_manifest.source_type
                   AND reserved.source_id=invoice_commercial_source_manifest.source_id
              )`,
        )
        .all(invoiceId, invoiceId) as Array<{ source_type: string; source_id: string }>;
      sourceRows.push(...manifestOnlySources);
      for (const source of sourceRows) {
        if (source.source_type === 'milestone') {
          const changed = this.sqlite
            .prepare(
              "UPDATE project_milestone SET invoice_id=?,updated_at=? WHERE id=? AND invoice_id IS NULL AND approval_state='approved'",
            )
            .run(invoiceId, issuedAt, source.source_id);
          if (changed.changes !== 1)
            throw new ConflictError(`Milestone source ${source.source_id} changed during issue`);
        } else if (source.source_type === 'time' || source.source_type === 'expense') {
          const table = source.source_type === 'time' ? 'time_entry' : 'expense';
          const billingColumn = source.source_type === 'time' ? 'billing_status' : 'billing_state';
          const allocation = this.sqlite
            .prepare(
              `SELECT disposition FROM invoice_commercial_source_manifest
               WHERE invoice_id=? AND source_type=? AND source_id=?`,
            )
            .get(invoiceId, source.source_type, source.source_id) as
            | { disposition: string }
            | undefined;
          const capBlocked =
            allocation?.disposition === 'partially_included' ||
            allocation?.disposition === 'blocked';
          const changed = this.sqlite
            .prepare(
              `UPDATE ${table} SET invoice_id=?,${billingColumn}=?,updated_at=? WHERE id=? AND invoice_id IS NULL`,
            )
            .run(
              capBlocked ? null : invoiceId,
              capBlocked ? 'cap_blocked' : 'locked',
              issuedAt,
              source.source_id,
            );
          if (changed.changes !== 1)
            throw new ConflictError(
              `${source.source_type} source ${source.source_id} changed during issue`,
            );
        }
      }
      const jobKey = `invoice-pdf:${invoiceId}:${calculationHash}`;
      this.enqueueDurableJob('invoice_pdf', jobKey, { invoiceId }, issuedAt);
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'invoice.issued',
          invoiceId,
          `invoice-issued:${invoiceId}`,
          JSON.stringify({ invoiceId, invoiceNumber }),
          issuedAt,
          issuedAt,
        );
      this.audit(principal, 'invoice.issue', 'invoice', invoiceId, {
        invoiceNumber,
        calculationHash,
      });
      return { invoiceNumber, issued: true };
    });
  }

  sendInvoice(principal: Principal, invoiceId: string, idempotencyKey: string) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    if (idempotencyKey.trim().length < 8)
      throw new ValidationError('Send idempotency key is required');
    return this.transaction(() => {
      const invoice = this.sqlite
        .prepare(
          "SELECT id,state,invoice_number,pdf_status FROM invoice WHERE id=? AND state IN ('issued','sent')",
        )
        .get(invoiceId) as
        | { id: string; state: string; invoice_number: string | null; pdf_status: string }
        | undefined;
      if (!invoice || !invoice.invoice_number) throw new ValidationError('Issued invoice required');
      const existing = this.sqlite
        .prepare(
          'SELECT id,invoice_id,event_type,reason FROM invoice_event WHERE idempotency_key=?',
        )
        .get(idempotencyKey) as
        | { id: string; invoice_id: string; event_type: string; reason: string | null }
        | undefined;
      if (
        existing &&
        (existing.invoice_id !== invoiceId ||
          existing.event_type !== 'sent' ||
          existing.reason !== 'Manual send requested')
      )
        throw new ConflictError('Send idempotency key was already used for another command');
      if (existing || invoice.state === 'sent')
        return { sent: false, invoiceNumber: invoice.invoice_number };
      if (invoice.pdf_status !== 'ready')
        throw new ValidationError('Invoice PDF must be ready before sending');
      const timestamp = now();
      this.sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'sent',?,?,?,?)",
        )
        .run(
          newId(),
          invoiceId,
          'Manual send requested',
          principal.userId,
          timestamp,
          idempotencyKey,
        );
      this.sqlite
        .prepare(
          "UPDATE invoice SET state='sent',sent_at=?,updated_at=?,version=version+1 WHERE id=? AND state='issued'",
        )
        .run(timestamp, timestamp, invoiceId);
      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          'invoice.send.requested',
          invoiceId,
          `invoice-send:${invoiceId}:${idempotencyKey}`,
          JSON.stringify({ invoiceId, invoiceNumber: invoice.invoice_number }),
          timestamp,
          timestamp,
        );
      this.audit(principal, 'invoice.send', 'invoice', invoiceId, {
        invoiceNumber: invoice.invoice_number,
      });
      return { sent: true, invoiceNumber: invoice.invoice_number };
    });
  }

  private recheckInvoiceProjection(
    invoice: InvoiceRow,
    lines: InvoiceIssueLine[],
    manifests: InvoiceIssueManifest[],
  ): void {
    const snapshotsBySource = new Map<string, string[]>();
    for (const line of lines) {
      const key = `${line.source_type}\u0000${line.source_id}`;
      const snapshots = snapshotsBySource.get(key) ?? [];
      snapshots.push(line.snapshot_json);
      snapshotsBySource.set(key, snapshots);
    }

    const sourceHashes = new Map<string, string | null>();
    const sourceRows = this.sqlite
      .prepare(
        `SELECT source_type,source_id,source_hash
           FROM invoice_source WHERE invoice_id=?`,
      )
      .all(invoice.id) as Array<{
      source_type: string;
      source_id: string;
      source_hash: string | null;
    }>;
    for (const source of sourceRows)
      sourceHashes.set(`${source.source_type}\u0000${source.source_id}`, source.source_hash);

    for (const manifest of manifests) {
      if (!manifest.source_hash)
        throw new ConflictError(
          `Invoice commercial source manifest ${manifest.source_type}:${manifest.source_id} is missing a hash`,
        );
      const lineSourceType =
        manifest.source_type === 'minimum_top_up' ? 'billing_adjustment' : manifest.source_type;
      const snapshots = snapshotsBySource.get(`${lineSourceType}\u0000${manifest.source_id}`) ?? [];
      const canonicalHash = createHash('sha256')
        .update(
          manifest.source_type === 'fixed_price' || manifest.source_type === 'minimum_top_up'
            ? snapshots.join('\n')
            : JSON.stringify({
                sourceType: manifest.source_type,
                sourceId: manifest.source_id,
                sourceVersion: manifest.source_version,
                snapshots,
              }),
        )
        .digest('hex');
      if (manifest.source_hash !== canonicalHash)
        throw new ConflictError(
          `Invoice commercial source manifest ${manifest.source_type}:${manifest.source_id} hash mismatch`,
        );
      const linkedHash = sourceHashes.get(`${manifest.source_type}\u0000${manifest.source_id}`);
      if (linkedHash !== undefined && linkedHash !== manifest.source_hash)
        throw new ConflictError(
          `Invoice source ${manifest.source_type}:${manifest.source_id} hash mismatch`,
        );
    }

    for (const source of sourceRows) {
      const manifest = manifests.find(
        (candidate) =>
          candidate.source_type === source.source_type && candidate.source_id === source.source_id,
      );
      if (!manifest || source.source_hash !== manifest.source_hash)
        throw new ConflictError(
          `Invoice source ${source.source_type}:${source.source_id} is not bound to its commercial manifest`,
        );
    }
  }

  private recheckInvoiceSources(invoice: InvoiceRow): void {
    const sources = this.sqlite
      .prepare('SELECT source_type,source_id,source_version FROM invoice_source WHERE invoice_id=?')
      .all(invoice.id) as Array<{ source_type: string; source_id: string; source_version: number }>;
    for (const source of sources) {
      if (source.source_type === 'time') {
        const row = this.sqlite
          .prepare(
            'SELECT version,approval_state,billability_state,invoice_id FROM time_entry WHERE id=?',
          )
          .get(source.source_id) as
          | {
              version: number;
              approval_state: string;
              billability_state: string;
              invoice_id: string | null;
            }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          !['approved', 'locked'].includes(row.approval_state) ||
          row.billability_state !== 'billable' ||
          row.invoice_id
        )
          throw new ConflictError(`Time source ${source.source_id} changed`);
      } else if (source.source_type === 'expense') {
        const row = this.sqlite
          .prepare(
            'SELECT version,approval_state,finance_approved_at,client_treatment,billing_treatment,currency,project_currency_amount_minor,billing_amount_minor,invoice_id FROM expense WHERE id=?',
          )
          .get(source.source_id) as
          | {
              version: number;
              approval_state: string;
              finance_approved_at: string | null;
              client_treatment: string;
              billing_treatment: string;
              currency: Currency;
              project_currency_amount_minor: number | null;
              billing_amount_minor: number | null;
              invoice_id: string | null;
            }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          row.approval_state !== 'approved' ||
          !row.finance_approved_at ||
          !(
            [
              'reimbursable',
              'reimbursable_at_cost',
              'reimbursable_plus_markup',
              'allowance_per_diem',
            ].includes(row.client_treatment) ||
            [
              'reimbursable_at_cost',
              'reimbursable_plus_markup',
              'allowance_per_diem',
              'client_direct',
            ].includes(row.billing_treatment)
          ) ||
          (row.currency !== invoice.currency &&
            (row.project_currency_amount_minor === null || row.billing_amount_minor === null)) ||
          row.invoice_id
        )
          throw new ConflictError(`Expense source ${source.source_id} changed`);
      } else if (source.source_type === 'milestone') {
        const row = this.sqlite
          .prepare('SELECT version,approval_state,invoice_id FROM project_milestone WHERE id=?')
          .get(source.source_id) as
          | { version: number; approval_state: string; invoice_id: string | null }
          | undefined;
        if (
          !row ||
          row.version !== source.source_version ||
          row.approval_state !== 'approved' ||
          row.invoice_id
        )
          throw new ConflictError(`Milestone source ${source.source_id} changed`);
      }
    }
  }

  recordPayment(
    principal: Principal,
    input: {
      invoiceId: string;
      amountMinor: bigint;
      currency: Currency;
      receivedAt: string;
      reference?: string;
      idempotencyKey: string;
    },
  ) {
    const received = canonicalInstant(input.receivedAt, 'Payment received date');
    const invoice = this.sqlite
      .prepare('SELECT issued_at FROM invoice WHERE id=?')
      .get(input.invoiceId) as { issued_at: string | null } | undefined;
    if (!invoice?.issued_at) throw new ValidationError('Issued invoice required');
    const issued = canonicalInstant(invoice.issued_at, 'Invoice issue date');
    const commandTimeMs = Date.now();
    if (received.epochMs < issued.epochMs)
      throw new ValidationError('Payment received date cannot precede invoice issue date');
    if (received.epochMs > commandTimeMs)
      throw new ValidationError('Payment received date cannot be in the future');
    const result = new V3Repository(this.sqlite).recordPayment(principal, {
      ...input,
      receivedAt: received.iso,
    });
    return { id: result.id, created: result.created };
  }

  voidInvoice(principal: Principal, invoiceId: string, reason: string, idempotencyKey: string) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    this.assertStepUp(principal);
    if (idempotencyKey.trim().length < 8)
      throw new ValidationError('Void idempotency key is required');
    this.transaction(() => {
      const invoice = this.sqlite
        .prepare(
          "SELECT 1 ok FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue')",
        )
        .get(invoiceId);
      if (!invoice) throw new ValidationError('Issued invoice required');
      const existing = this.sqlite
        .prepare('SELECT invoice_id,event_type FROM invoice_event WHERE idempotency_key=?')
        .get(idempotencyKey) as { invoice_id: string; event_type: string } | undefined;
      if (existing) {
        if (existing.invoice_id !== invoiceId || existing.event_type !== 'void')
          throw new ConflictError('Void idempotency key was already used');
        return;
      }
      const cleanReason = assertText(reason, 'Void reason');
      const paid = (
        this.sqlite
          .prepare('SELECT CAST(amount_minor AS TEXT) amount FROM payment WHERE invoice_id=?')
          .all(invoiceId) as Array<{ amount: string }>
      ).reduce((sum, row) => sum + BigInt(row.amount), 0n);
      const reversed = (
        this.sqlite
          .prepare(
            'SELECT CAST(amount_minor AS TEXT) amount FROM invoice_payment_reversal_event WHERE invoice_id=?',
          )
          .all(invoiceId) as Array<{ amount: string }>
      ).reduce((sum, row) => sum + BigInt(row.amount), 0n);
      if (paid - reversed !== 0n)
        throw new ValidationError(
          'Invoice collections must be fully reversed before the invoice can be voided',
        );
      const timestamp = now();
      this.sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'void',?,?,?,?)",
        )
        .run(newId(), invoiceId, cleanReason, principal.userId, timestamp, idempotencyKey);
      this.sqlite
        .prepare(
          "UPDATE invoice SET state='void',voided_at=?,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(timestamp, timestamp, invoiceId);
      this.audit(principal, 'invoice.void', 'invoice', invoiceId, { reason: cleanReason });
    });
  }

  workerPay(principal: Principal, periodStart: string, periodEnd: string) {
    this.assertActive(principal);
    const canonicalWorkerPay = new V3Repository(this.sqlite).workerPay(
      principal,
      periodStart,
      periodEnd,
    );
    if (canonicalWorkerPay.label) return canonicalWorkerPay;
    /* c8 ignore start -- retained temporarily for source-compatible rollback archaeology */
    const rows = this.sqlite
      .prepare(
        "SELECT t.project_id,t.work_date,t.minutes,t.approval_state,c.currency,c.rate_minor,c.rate_basis,c.daily_guarantee_minutes FROM time_entry t JOIN compensation_rule c ON c.worker_id=t.worker_id AND (c.project_id=t.project_id OR c.project_id IS NULL) AND c.effective_from<=t.work_date AND (c.effective_to IS NULL OR c.effective_to>=t.work_date) WHERE t.worker_id=? AND t.work_date BETWEEN ? AND ? AND t.approval_state NOT IN ('rejected','void') AND c.worker_visible=1 ORDER BY t.work_date",
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      project_id: string;
      work_date: string;
      minutes: number;
      approval_state: string;
      currency: Currency;
      rate_minor: number;
      rate_basis: string;
      daily_guarantee_minutes: number | null;
    }>;
    const currencies = new Set<Currency>(rows.map((row) => row.currency));
    if (currencies.size > 1)
      throw new ValidationError('Worker period contains multiple compensation currencies');
    const calculationCurrency = rows[0]?.currency ?? 'USD';
    let approvedMinutes = 0;
    let pendingMinutes = 0;
    let approved = money(calculationCurrency, 0n);
    let pending = money(calculationCurrency, 0n);
    const groups = new Map<string, typeof rows>();
    for (const row of rows)
      groups.set(`${row.project_id}:${row.work_date}:${row.approval_state}`, [
        ...(groups.get(`${row.project_id}:${row.work_date}:${row.approval_state}`) ?? []),
        row,
      ]);
    for (const group of groups.values()) {
      const first = group[0];
      if (!first) continue;
      const minutes = group.reduce((sum, row) => sum + row.minutes, 0);
      const compensatedMinutes = Math.max(minutes, first.daily_guarantee_minutes ?? 0);
      const amount =
        first.rate_basis === 'daily'
          ? money(calculationCurrency, BigInt(first.rate_minor))
          : hourlyRateForMinutes(
              money(calculationCurrency, BigInt(first.rate_minor)),
              compensatedMinutes,
            );
      if (first.approval_state === 'approved' || first.approval_state === 'locked') {
        approvedMinutes += minutes;
        approved = add(approved, amount);
      } else {
        pendingMinutes += minutes;
        pending = add(pending, amount);
      }
    }
    const reimbursements = this.sqlite
      .prepare(
        `SELECT e.approval_state,
                CASE WHEN e.project_currency_amount_minor IS NULL THEN e.currency ELSE p.currency END currency,
                CAST(CASE WHEN e.project_currency_amount_minor IS NULL
                          THEN e.amount_minor
                          ELSE COALESCE(e.reimbursement_amount_minor,e.project_currency_amount_minor)
                     END AS TEXT) amount
         FROM expense e JOIN project p ON p.id=e.project_id
         WHERE e.worker_id=? AND e.spent_on BETWEEN ? AND ? AND e.who_paid='worker'
           AND e.approval_state NOT IN ('rejected','void')`,
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      approval_state: string;
      currency: Currency;
      amount: string;
    }>;
    for (const row of reimbursements) currencies.add(row.currency);
    if (currencies.size > 1)
      throw new ValidationError('Worker period contains multiple compensation currencies');
    const currency = currencies.values().next().value ?? 'USD';
    return {
      currency,
      approvedMinutes,
      pendingMinutes,
      estimatedApprovedMinor: approved.minorUnits.toString(),
      estimatedPendingMinor: pending.minorUnits.toString(),
      approvedReimbursementMinor: String(
        reimbursements
          .filter((row) => row.approval_state === 'approved')
          .reduce((sum, row) => sum + BigInt(row.amount), 0n),
      ),
      pendingReimbursementMinor: String(
        reimbursements
          .filter((row) => row.approval_state !== 'approved')
          .reduce((sum, row) => sum + BigInt(row.amount), 0n),
      ),
    };
  }

  projectFinance(principal: Principal, projectId: string) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    const canonicalProjectFinance = new V3Repository(this.sqlite).projectFinance(
      principal,
      projectId,
    );
    if (canonicalProjectFinance.state) return canonicalProjectFinance;
    /* c8 ignore start -- retained temporarily for source-compatible rollback archaeology */
    const project = this.sqlite
      .prepare('SELECT currency FROM project WHERE id=?')
      .get(projectId) as { currency: Currency } | undefined;
    if (!project) throw new ValidationError('Project not found');
    const time = this.sqlite
      .prepare(
        "SELECT id,worker_id,work_date,category,minutes,billability_state FROM time_entry WHERE project_id=? AND approval_state IN ('approved','locked')",
      )
      .all(projectId) as Array<{
      id: string;
      worker_id: string;
      work_date: string;
      category: string;
      minutes: number;
      billability_state: string;
    }>;
    let cost = money(project.currency, 0n);
    let revenue = money(project.currency, 0n);
    for (const row of time) {
      const costRate = this.sqlite
        .prepare(
          'SELECT hourly_rate_minor FROM internal_cost_rule WHERE worker_id=? AND (project_id=? OR project_id IS NULL) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY (project_id IS NOT NULL) DESC,effective_from DESC LIMIT 1',
        )
        .get(row.worker_id, projectId, row.work_date, row.work_date) as
        | { hourly_rate_minor: number }
        | undefined;
      if (costRate)
        cost = add(
          cost,
          hourlyRateForMinutes(
            money(project.currency, BigInt(costRate.hourly_rate_minor)),
            row.minutes,
          ),
        );
      if (row.billability_state === 'billable') {
        const rate = this.findClientRate(
          principal,
          projectId,
          row.worker_id,
          row.category,
          row.work_date,
        );
        if (rate)
          revenue = add(
            revenue,
            hourlyRateForMinutes(money(project.currency, BigInt(rate)), row.minutes),
          );
      }
    }
    const expenses = this.sqlite
      .prepare(
        "SELECT id,amount_minor,project_currency_amount_minor,billing_amount_minor,currency,client_treatment,billing_treatment,who_paid,commercial_classification_state FROM expense WHERE project_id=? AND approval_state='approved'",
      )
      .all(projectId) as Array<{
      id: string;
      amount_minor: number;
      project_currency_amount_minor: number | null;
      billing_amount_minor: number | null;
      currency: string;
      client_treatment: string;
      billing_treatment: string;
      who_paid: string;
      commercial_classification_state: string;
    }>;
    const incompleteExpenses: ReadinessReason[] = [];
    for (const expense of expenses) {
      const isDirect =
        expense.billing_treatment === 'client_direct' || expense.who_paid === 'client';
      const isClassified = expense.commercial_classification_state === 'classified';
      const billable =
        expense.client_treatment === 'reimbursable' &&
        (expense.billing_treatment.startsWith('reimbursable') ||
          expense.billing_treatment === 'allowance_per_diem');
      const foreignProjectionMissing =
        expense.currency !== project.currency &&
        (expense.project_currency_amount_minor === null || expense.billing_amount_minor === null);
      const projectionMissing =
        foreignProjectionMissing ||
        (!isDirect &&
          isClassified &&
          (expense.project_currency_amount_minor === null ||
            (billable && expense.billing_amount_minor === null)));
      if (projectionMissing) {
        incompleteExpenses.push({
          code:
            expense.currency === project.currency
              ? 'missing_expense_finance_projection'
              : 'missing_expense_currency_conversion',
          sourceId: expense.id,
        });
        continue;
      }
      if (!isDirect) {
        const costMinor = isClassified
          ? expense.project_currency_amount_minor
          : expense.currency === project.currency
            ? expense.amount_minor
            : expense.project_currency_amount_minor;
        if (costMinor !== null) cost = add(cost, money(project.currency, BigInt(costMinor)));
      }
      if (billable && !isDirect) {
        const revenueMinor = isClassified
          ? expense.billing_amount_minor
          : (expense.billing_amount_minor ??
            expense.project_currency_amount_minor ??
            expense.amount_minor);
        if (revenueMinor !== null)
          revenue = add(revenue, money(project.currency, BigInt(revenueMinor)));
      }
    }
    const invoiceTotals = this.sqlite
      .prepare(
        "SELECT CAST(total_minor AS TEXT) total FROM invoice WHERE project_id=? AND state IN ('issued','sent','partially_paid','paid','overdue')",
      )
      .all(projectId) as Array<{ total: string }>;
    const paymentTotals = this.sqlite
      .prepare(
        'SELECT CAST(p.amount_minor AS TEXT) amount FROM payment p JOIN invoice i ON i.id=p.invoice_id WHERE i.project_id=?',
      )
      .all(projectId) as Array<{ amount: string }>;
    const reversalTotals = this.sqlite
      .prepare(
        'SELECT CAST(r.amount_minor AS TEXT) amount FROM invoice_payment_reversal_event r JOIN invoice i ON i.id=r.invoice_id WHERE i.project_id=?',
      )
      .all(projectId) as Array<{ amount: string }>;
    const invoiced = invoiceTotals.reduce((sum, row) => sum + BigInt(row.total), 0n);
    const paid =
      paymentTotals.reduce((sum, row) => sum + BigInt(row.amount), 0n) -
      reversalTotals.reduce((sum, row) => sum + BigInt(row.amount), 0n);
    return {
      state: incompleteExpenses.length > 0 ? 'incomplete' : 'ready',
      reasons: incompleteExpenses,
      currency: project.currency,
      approvedCostMinor: cost.minorUnits.toString(),
      revenueCandidateMinor: revenue.minorUnits.toString(),
      contributionMarginMinor: (revenue.minorUnits - cost.minorUnits).toString(),
      invoicedMinor: invoiced.toString(),
      paidMinor: paid.toString(),
      receivableMinor: (invoiced - paid).toString(),
    };
  }

  dashboard(principal: Principal) {
    this.assertReadable(principal);
    if (principal.role === 'worker') throw new AccessDeniedError('Management role required');
    const projectFilter = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    const where = projectFilter.length
      ? ` WHERE p.id IN (${projectFilter.map(() => '?').join(',')})`
      : '';
    const projects = this.sqlite
      .prepare(`SELECT count(*) count FROM project p${where}`)
      .get(...projectFilter) as { count: number };
    const hours = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(t.minutes),0) minutes FROM time_entry t JOIN project p ON p.id=t.project_id${where}${where ? ' AND' : ' WHERE'} t.approval_state IN ('submitted','approved','locked')`,
      )
      .get(...projectFilter) as { minutes: number };
    const reports = this.sqlite
      .prepare(
        `SELECT (SELECT count(*) FROM daily_report d JOIN project p ON p.id=d.project_id${where}${where ? ' AND' : ' WHERE'} d.approval_state='submitted') + (SELECT count(*) FROM technical_report tr JOIN project p ON p.id=tr.project_id${where}${where ? ' AND' : ' WHERE'} tr.approval_state='submitted') count`,
      )
      .get(...projectFilter, ...projectFilter) as { count: number };
    const expenses = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(e.amount_minor),0) minor FROM expense e JOIN project p ON p.id=e.project_id${where}`,
      )
      .get(...projectFilter) as { minor: number };
    const invoices = this.sqlite
      .prepare(
        `SELECT count(*) count,COALESCE(sum(i.total_minor),0) minor FROM invoice i JOIN project p ON p.id=i.project_id${where}${where ? ' AND' : ' WHERE'} i.state IN ('draft','approved')`,
      )
      .get(...projectFilter) as { count: number; minor: number };
    return {
      activeProjects: projects.count,
      actualMinutes: hours.minutes,
      pendingReports: reports.count,
      expenseMinor: String(expenses.minor),
      upcomingInvoices: invoices.count,
      upcomingInvoiceMinor: String(invoices.minor),
      currency: 'USD',
    };
  }

  projectOverview(principal: Principal, projectId: string) {
    this.assertReadable(principal);
    this.assertProjectObjectAccess(principal, projectId);
    const projectColumns = this.canSeeFinanceFields(principal)
      ? 'p.*'
      : `p.id,p.project_number,p.cost_center_code,p.client_id,p.name,p.description,p.project_alias,p.timezone,
         p.currency,p.status,p.site_name,p.country,p.project_manager_id,
         p.expected_minutes_per_day,p.start_date,
         p.planned_end_date,p.actual_end_date,p.weekly_close_enabled,
         p.daily_report_required,p.technical_reporting_required,p.notes,p.version,
         p.created_at,p.updated_at`;
    const project = this.sqlite
      .prepare(
        `SELECT ${projectColumns},c.client_number,c.display_name client_name
         FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?`,
      )
      .get(projectId) as Row | undefined;
    if (!project) throw new ValidationError('Project not found');
    const ownOnly = principal.role === 'worker';
    const workers = this.sqlite
      .prepare(
        `SELECT u.id,u.name,u.role,pm.assignment_role,pm.starts_on,pm.ends_on,pm.planned_minutes
         FROM project_member pm JOIN user u ON u.id=pm.user_id
         WHERE pm.project_id=? AND pm.status='active'${ownOnly ? ' AND pm.user_id=?' : ''}
         ORDER BY u.name`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const time = this.sqlite
      .prepare(
        `SELECT category,sum(minutes) minutes FROM time_entry WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''} GROUP BY category ORDER BY category`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const reports = this.sqlite
      .prepare(
        `SELECT 'Daily' type,id,work_date date,summary title,approval_state,safety_related
         FROM daily_report WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''}
         UNION ALL
         SELECT 'PLC',id,report_date,system_name,approval_state,safety_related
         FROM technical_report WHERE project_id=?${ownOnly ? ' AND author_id=?' : ''}
         ORDER BY date DESC`,
      )
      .all(
        ...(ownOnly
          ? [projectId, principal.userId, projectId, principal.userId]
          : [projectId, projectId]),
      );
    const expenseColumns = this.canSeeFinanceFields(principal)
      ? 'id,spent_on,vendor,category,amount_minor,project_currency_amount_minor,currency,client_treatment,billing_treatment,markup_bps,billing_amount_minor,billing_state,billing_lock_id,invoice_id,who_paid,approval_state,finance_approved_by,finance_approved_at,receipt_document_id,version'
      : principal.role === 'worker'
        ? 'id,spent_on,vendor,category,amount_minor,currency,who_paid,payment_method,approval_state,receipt_document_id,receipt_required,reimbursement_state,reimbursement_amount_minor,reimbursed_at,reimbursement_reference,version'
        : 'id,spent_on,vendor,category,amount_minor,currency,who_paid,payment_method,approval_state,receipt_document_id,receipt_required,version';
    const expenses = this.sqlite
      .prepare(
        `SELECT ${expenseColumns}
         FROM expense WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''} ORDER BY spent_on DESC`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const planning = this.sqlite
      .prepare(
        `SELECT pa.*,u.name worker_name FROM planning_assignment pa JOIN user u ON u.id=pa.worker_id
         WHERE pa.project_id=? AND pa.status<>'cancelled'${ownOnly ? ' AND pa.worker_id=?' : ''}
         ORDER BY pa.starts_at`,
      )
      .all(...(ownOnly ? [projectId, principal.userId] : [projectId]));
    const milestoneColumns = this.canSeeFinanceFields(principal)
      ? 'id,name,description,amount_minor,currency,due_on,approval_state,invoice_id,version'
      : 'id,name,description,due_on,approval_state,version';
    const milestones = this.sqlite
      .prepare(
        `SELECT ${milestoneColumns}
         FROM project_milestone WHERE project_id=? ORDER BY due_on,id`,
      )
      .all(projectId);
    const total = this.sqlite
      .prepare(
        `SELECT COALESCE(sum(minutes),0) minutes FROM time_entry WHERE project_id=?${ownOnly ? ' AND worker_id=?' : ''}`,
      )
      .get(...(ownOnly ? [projectId, principal.userId] : [projectId])) as { minutes: number };
    const schedule = this.sqlite
      .prepare(
        'SELECT id,timezone,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,effective_from,effective_to,version FROM schedule WHERE project_id=? ORDER BY effective_from DESC,id DESC LIMIT 1',
      )
      .get(projectId);
    const financial =
      principal.role === 'owner_admin' ||
      principal.role === 'finance_admin' ||
      principal.role === 'auditor_read_only'
        ? this.projectFinance(principal, projectId)
        : null;
    return {
      project,
      workers,
      time,
      reports,
      expenses,
      planning,
      milestones,
      schedule,
      actualMinutes: total.minutes,
      financial,
    };
  }

  createProjectCloseout(principal: Principal, projectId: string) {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw new AccessDeniedError('Finance role required');
    const overview = this.projectOverview(principal, projectId);
    const documents = this.sqlite
      .prepare(
        "SELECT id,sha256,byte_length,media_type,artifact_type,original_filename,sensitivity FROM document WHERE project_id=? AND state='committed' ORDER BY created_at,id",
      )
      .all(projectId);
    const invoices = this.sqlite
      .prepare(
        'SELECT id,invoice_number,stream_type,state,period_start,period_end,total_minor,currency,issued_at,due_at FROM invoice WHERE project_id=? ORDER BY created_at',
      )
      .all(projectId);
    const snapshot = {
      project: overview.project,
      workers: overview.workers,
      time: overview.time,
      reports: overview.reports,
      expenses: overview.expenses,
      planning: overview.planning,
      financial: overview.financial,
      invoices,
      generatedAt: now(),
    };
    const manifest = { generatedAt: now(), files: documents };
    const existing = this.sqlite
      .prepare('SELECT id,state FROM project_closeout WHERE project_id=?')
      .get(projectId) as { id: string; state: string } | undefined;
    if (existing?.state === 'final')
      throw new ConflictError('Final project closeout requires an authorized reopen');
    const id = existing?.id ?? newId();
    const timestamp = now();
    if (existing)
      this.sqlite
        .prepare(
          "UPDATE project_closeout SET state='draft',snapshot_json=?,document_manifest_json=?,updated_at=? WHERE id=?",
        )
        .run(JSON.stringify(snapshot), JSON.stringify(manifest), timestamp, id);
    else
      this.sqlite
        .prepare(
          "INSERT INTO project_closeout(id,project_id,state,snapshot_json,document_manifest_json,created_by,created_at,updated_at) VALUES(?,?,'draft',?,?,?,?,?)",
        )
        .run(
          id,
          projectId,
          JSON.stringify(snapshot),
          JSON.stringify(manifest),
          principal.userId,
          timestamp,
          timestamp,
        );
    this.audit(principal, 'project_closeout.create', 'project_closeout', id, { projectId });
    return { id, state: 'draft', snapshot, manifest };
  }

  finalizeProjectCloseout(principal: Principal, closeoutId: string): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    const result = this.sqlite
      .prepare(
        "UPDATE project_closeout SET state='final',updated_at=? WHERE id=? AND state IN ('draft','review')",
      )
      .run(now(), closeoutId);
    if (result.changes !== 1) throw new ConflictError('Project closeout is not reviewable');
    const closeout = this.sqlite
      .prepare('SELECT project_id FROM project_closeout WHERE id=?')
      .get(closeoutId) as { project_id: string } | undefined;
    if (closeout)
      this.sqlite
        .prepare(
          "UPDATE project SET status='closed',actual_end_date=COALESCE(actual_end_date,?),updated_at=?,version=version+1 WHERE id=? AND status NOT IN ('archived','closed')",
        )
        .run(today(), now(), closeout.project_id);
    this.audit(principal, 'project_closeout.finalize', 'project_closeout', closeoutId, {});
  }

  reopenProjectCloseout(principal: Principal, closeoutId: string, reason: string): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    const cleanReason = assertText(reason, 'Reopen reason', 2000);
    const result = this.sqlite
      .prepare(
        "UPDATE project_closeout SET state='reopened',reopened_by=?,reopened_at=?,reopen_reason=?,updated_at=? WHERE id=? AND state='final'",
      )
      .run(principal.userId, now(), cleanReason, now(), closeoutId);
    if (result.changes !== 1) throw new ConflictError('Final closeout is required to reopen');
    const closeout = this.sqlite
      .prepare('SELECT project_id FROM project_closeout WHERE id=?')
      .get(closeoutId) as { project_id: string } | undefined;
    if (closeout)
      this.sqlite
        .prepare(
          "UPDATE project SET status='active',actual_end_date=NULL,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(now(), closeout.project_id);
    this.audit(principal, 'project_closeout.reopen', 'project_closeout', closeoutId, {
      reason: cleanReason,
    });
  }

  invoicePreview(principal: Principal, invoiceId: string) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    const invoice = this.sqlite
      .prepare(
        'SELECT i.*,p.project_number,p.name project_name,p.po_number project_po_number,c.client_number,c.display_name client_name,c.legal_name client_legal_name,c.billing_email,le.legal_name issuer_name,le.billing_address issuer_address,le.company_identifiers,tp.name tax_profile_name FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id LEFT JOIN billing_rule br ON br.id=i.billing_rule_id LEFT JOIN legal_entity le ON le.id=br.legal_entity_id LEFT JOIN tax_profile tp ON tp.id=br.tax_profile_id WHERE i.id=?',
      )
      .get(invoiceId) as Record<string, unknown> | undefined;
    if (!invoice) throw new ValidationError('Invoice not found');
    let customSnapshot: Record<string, unknown> = {};
    if (typeof invoice.snapshot_json === 'string') {
      try {
        customSnapshot = JSON.parse(invoice.snapshot_json);
      } catch {
        // A malformed legacy snapshot is projected with safe invoice defaults below.
      }
    }
    const defaultTerms = {
      bankSwiftNumber: 'WFBIUS6S',
      bankAccountNumber: '8769915615',
      bankName: 'Wells Fargo Bank',
      beneficiary: 'J&A Automation LLC',
      pastDueNotice:
        'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law',
    };
    const defaultCompany = {
      name: 'J&A Automation LLC',
      division: 'USA division',
      phone: '+1 (864) 208 4684',
      address: '112 Birkshire Dr, Georgetown TX 78626',
      email: 'field.operations@j-aautomation.com',
      website: 'www.j-aautomation.com',
    };
    const enrichedInvoice = {
      ...invoice,
      purchase_no:
        customSnapshot.purchaseNo ?? customSnapshot.purchase_no ?? invoice.project_po_number ?? '—',
      terms_and_instructions: {
        ...defaultTerms,
        ...(typeof customSnapshot.termsAndInstructions === 'object' &&
        customSnapshot.termsAndInstructions !== null
          ? customSnapshot.termsAndInstructions
          : {}),
      },
      company_info: {
        ...defaultCompany,
        ...(typeof customSnapshot.companyInfo === 'object' && customSnapshot.companyInfo !== null
          ? customSnapshot.companyInfo
          : {}),
      },
      discount_minor: customSnapshot.discountMinor ?? customSnapshot.discount_minor ?? '0',
    };
    const lines = this.sqlite
      .prepare(
        'SELECT description,quantity_numerator,quantity_denominator,unit_price_minor,subtotal_minor,source_type FROM invoice_line WHERE invoice_id=? ORDER BY rowid',
      )
      .all(invoiceId);
    const taxes = this.sqlite
      .prepare(
        'SELECT tc.name,tc.basis_points FROM invoice i JOIN billing_rule br ON br.id=i.billing_rule_id JOIN tax_component tc ON tc.tax_profile_id=br.tax_profile_id WHERE i.id=? ORDER BY tc.calculation_order',
      )
      .all(invoiceId);
    return { invoice: enrichedInvoice, lines, taxes };
  }

  updateInvoiceDraftCustomizations(
    principal: Principal,
    invoiceId: string,
    data: {
      purchaseNo?: string;
      termsAndInstructions?: Record<string, string>;
      companyInfo?: Record<string, string>;
      discountMinor?: string;
    },
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    return this.transaction(() => {
      const invoice = this.sqlite
        .prepare('SELECT id, state, snapshot_json FROM invoice WHERE id=?')
        .get(invoiceId) as { id: string; state: string; snapshot_json: string | null } | undefined;
      if (!invoice) throw new ValidationError('Invoice not found');
      if (invoice.state !== 'draft' && invoice.state !== 'approved') {
        throw new ConflictError('Only draft or approved invoices can be modified before issuance');
      }
      let currentSnapshot: Record<string, unknown> = {};
      if (invoice.snapshot_json) {
        try {
          currentSnapshot = JSON.parse(invoice.snapshot_json);
        } catch {
          // Invalid legacy customization data is replaced only in the new draft snapshot.
        }
      }
      if (data.purchaseNo !== undefined) {
        currentSnapshot.purchaseNo = data.purchaseNo;
      }
      if (data.termsAndInstructions !== undefined) {
        currentSnapshot.termsAndInstructions = {
          ...(typeof currentSnapshot.termsAndInstructions === 'object' &&
          currentSnapshot.termsAndInstructions !== null
            ? currentSnapshot.termsAndInstructions
            : {}),
          ...data.termsAndInstructions,
        };
      }
      if (data.companyInfo !== undefined) {
        currentSnapshot.companyInfo = {
          ...(typeof currentSnapshot.companyInfo === 'object' &&
          currentSnapshot.companyInfo !== null
            ? currentSnapshot.companyInfo
            : {}),
          ...data.companyInfo,
        };
      }
      if (data.discountMinor !== undefined) {
        currentSnapshot.discountMinor = data.discountMinor;
      }
      this.sqlite
        .prepare('UPDATE invoice SET snapshot_json=?, updated_at=? WHERE id=?')
        .run(JSON.stringify(currentSnapshot), now(), invoiceId);
      return { success: true };
    });
  }

  listOwnReports(principal: Principal) {
    this.assertReadable(principal);
    const dailyValues: string[] = [];
    const technicalValues: string[] = [];
    const dailyConditions: string[] = [];
    const technicalConditions: string[] = [];
    if (principal.role === 'worker') {
      dailyConditions.push('d.worker_id=?');
      dailyValues.push(principal.userId);
      technicalConditions.push('t.author_id=?');
      technicalValues.push(principal.userId);
      dailyConditions.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=d.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=d.work_date AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=d.work_date) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      dailyValues.push(principal.userId, today(), today());
      technicalConditions.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=t.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=t.report_date AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=t.report_date) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      technicalValues.push(principal.userId, today(), today());
    } else if (principal.role === 'project_manager') {
      const ids = [...principal.projectIds];
      if (!ids.length) return [];
      const placeholders = ids.map(() => '?').join(',');
      dailyConditions.push(`d.project_id IN (${placeholders})`);
      technicalConditions.push(`t.project_id IN (${placeholders})`);
      dailyValues.push(...ids);
      technicalValues.push(...ids);
      dailyConditions.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=d.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=d.work_date AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=d.work_date) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      dailyValues.push(principal.userId, today(), today());
      technicalConditions.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=t.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=t.report_date AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=t.report_date) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      technicalValues.push(principal.userId, today(), today());
    }
    const daily = this.sqlite
      .prepare(
        `SELECT 'daily' type,d.id,d.work_date date,d.summary title,d.approval_state,d.version,
                d.safety_related,p.project_number,p.name project_name,u.name author_name
         FROM daily_report d JOIN project p ON p.id=d.project_id JOIN user u ON u.id=d.worker_id
         ${dailyConditions.length ? `WHERE ${dailyConditions.join(' AND ')}` : ''}
         ORDER BY d.work_date DESC,d.id DESC LIMIT 200`,
      )
      .all(...dailyValues) as Array<Record<string, unknown>>;
    const technical = this.sqlite
      .prepare(
        `SELECT 'technical' type,t.id,t.report_date date,t.system_name title,t.approval_state,
                t.version,t.safety_related,p.project_number,p.name project_name,u.name author_name
         FROM technical_report t JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.author_id
         ${technicalConditions.length ? `WHERE ${technicalConditions.join(' AND ')}` : ''}
         ORDER BY date DESC,t.id DESC LIMIT 200`,
      )
      .all(...technicalValues) as Array<Record<string, unknown>>;
    return [...daily, ...technical]
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
      .slice(0, 200);
  }

  listPlanning(principal: Principal) {
    return this.planning.listPlanning(principal);
  }

  listNotifications(principal: Principal) {
    this.assertReadable(principal);
    const notifications = this.sqlite
      .prepare(
        'SELECT id,kind,subject_id,read_at,created_at FROM notification WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      )
      .all(principal.userId);
    return notifications.map((notification) => {
      const row = notification as {
        id: string;
        kind: string;
        subject_id: string;
        read_at: string | null;
        created_at: string;
      };
      const audit = this.sqlite
        .prepare(
          `SELECT ae.action,ae.details_json,ae.occurred_at,u.name actor_name
           FROM audit_event ae LEFT JOIN user u ON u.id=ae.actor_id
           WHERE ae.entity_id=? AND ae.action LIKE 'report.%update'
           ORDER BY ae.occurred_at DESC,ae.id DESC LIMIT 1`,
        )
        .get(row.subject_id) as
        | { action: string; details_json: string; occurred_at: string; actor_name: string | null }
        | undefined;
      const source = this.sqlite
        .prepare(
          `SELECT d.project_id,d.work_date date,d.summary title,p.project_number,p.name project_name
           FROM daily_report d JOIN project p ON p.id=d.project_id WHERE d.id=?
           UNION ALL
           SELECT t.project_id,t.report_date,t.change_summary,p.project_number,p.name
           FROM technical_report t JOIN project p ON p.id=t.project_id WHERE t.id=? LIMIT 1`,
        )
        .get(row.subject_id, row.subject_id) as
        | {
            project_id: string;
            date: string;
            title: string;
            project_number: string;
            project_name: string;
          }
        | undefined;
      let changedFields: string[] = [];
      if (audit?.details_json) {
        try {
          const details = JSON.parse(audit.details_json) as { changedFields?: unknown };
          if (Array.isArray(details.changedFields))
            changedFields = details.changedFields.filter(
              (field): field is string => typeof field === 'string',
            );
        } catch {
          changedFields = [];
        }
      }
      return {
        ...row,
        actor_name: audit?.actor_name ?? null,
        changed_fields: changedFields,
        project_id: source?.project_id ?? row.subject_id,
        project_number: source?.project_number ?? null,
        project_name: source?.project_name ?? null,
        record_date: source?.date ?? null,
        record_title: source?.title ?? null,
      };
    });
  }

  markNotificationRead(principal: Principal, notificationId: string): void {
    this.assertActive(principal);
    const result = this.sqlite
      .prepare('UPDATE notification SET read_at=? WHERE id=? AND user_id=?')
      .run(now(), notificationId, principal.userId);
    if (result.changes !== 1) throw new ValidationError('Notification not found');
  }

  search(principal: Principal, query: string) {
    this.assertReadable(principal);
    const term = typeof query === 'string' ? query.trim() : '';
    if (term.length > 120) throw new ValidationError('Search query is too long');
    const pattern = `%${term.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const projectIds = principal.role === 'project_manager' ? [...principal.projectIds] : [];
    const projectRestriction =
      projectIds.length > 0
        ? ` AND p.id IN (${projectIds.map(() => '?').join(',')})`
        : principal.role === 'project_manager'
          ? ' AND 1=0'
          : '';
    const projectValues = [...projectIds];
    const projects =
      principal.role === 'worker'
        ? this.sqlite
            .prepare(
              `SELECT p.id,'project' type,p.name label,p.project_number || ' · Project' detail FROM project p
               JOIN project_member pm ON pm.project_id=p.id AND pm.user_id=? AND pm.status='active'
                 AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
               WHERE p.status='active' AND (p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR p.po_number LIKE ? ESCAPE '\\') LIMIT 50`,
            )
            .all(principal.userId, pattern, pattern, pattern)
        : this.sqlite
            .prepare(
              `SELECT p.id,'project' type,p.name label,p.project_number || ' · ' || COALESCE(p.po_number,'Project') detail FROM project p
               WHERE (p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR p.po_number LIKE ? ESCAPE '\\')${projectRestriction} LIMIT 50`,
            )
            .all(pattern, pattern, pattern, ...projectValues);
    const clients =
      principal.role === 'worker'
        ? []
        : this.sqlite
            .prepare(
              `SELECT c.id,'client' type,c.display_name label,c.client_number || ' · Client' detail FROM client c
               JOIN project p ON p.client_id=c.id
               WHERE (c.client_number LIKE ? ESCAPE '\\' OR c.display_name LIKE ? ESCAPE '\\')${projectRestriction} LIMIT 50`,
            )
            .all(pattern, pattern, ...projectValues);
    const workers =
      principal.role === 'worker'
        ? []
        : this.sqlite
            .prepare(
              `SELECT u.id,'worker' type,u.name label,u.email detail FROM user u
               WHERE u.status='active' AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
               AND (${
                 principal.role === 'project_manager'
                   ? `EXISTS (SELECT 1 FROM project_member pm WHERE pm.user_id=u.id AND pm.status='active' AND pm.project_id IN (${projectIds.map(() => '?').join(',')}))`
                   : '1=1'
               }) LIMIT 50`,
            )
            .all(pattern, pattern, ...projectValues);
    const invoices =
      principal.role === 'worker'
        ? []
        : this.sqlite
            .prepare(
              `SELECT i.id,'invoice' type,i.invoice_number label,i.stream_type || ' · Invoice' detail FROM invoice i
               JOIN project p ON p.id=i.project_id
               WHERE i.invoice_number LIKE ? ESCAPE '\\'${projectRestriction} LIMIT 50`,
            )
            .all(pattern, ...projectValues);
    const reports =
      principal.role === 'worker'
        ? this.sqlite
            .prepare(
              `SELECT d.id,'report' type,COALESCE(d.summary,'Daily report') label,p.project_number || ' · Daily report' detail
               FROM daily_report d JOIN project p ON p.id=d.project_id
               WHERE d.worker_id=? AND p.status='active'
                 AND EXISTS(SELECT 1 FROM project_member pm WHERE pm.project_id=d.project_id AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=d.work_date AND (pm.ends_on IS NULL OR pm.ends_on>=d.work_date) AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now')))
                 AND (d.id LIKE ? ESCAPE '\\' OR d.summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')
               UNION ALL
               SELECT t.id,'report' type,COALESCE(t.system_name,t.change_summary,'Technical report') label,p.project_number || ' · Technical report' detail
               FROM technical_report t JOIN project p ON p.id=t.project_id
               WHERE t.author_id=? AND p.status='active'
                 AND EXISTS(SELECT 1 FROM project_member pm WHERE pm.project_id=t.project_id AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=t.report_date AND (pm.ends_on IS NULL OR pm.ends_on>=t.report_date) AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now')))
                 AND (t.id LIKE ? ESCAPE '\\' OR t.system_name LIKE ? ESCAPE '\\' OR t.change_summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')`,
            )
            .all(
              principal.userId,
              principal.userId,
              pattern,
              pattern,
              pattern,
              pattern,
              principal.userId,
              principal.userId,
              pattern,
              pattern,
              pattern,
              pattern,
              pattern,
            )
        : this.sqlite
            .prepare(
              `SELECT d.id,'report' type,COALESCE(d.summary,'Daily report') label,p.project_number || ' · Daily report' detail
               FROM daily_report d JOIN project p ON p.id=d.project_id
               WHERE (d.id LIKE ? ESCAPE '\\' OR d.summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')${projectRestriction}
               UNION ALL
               SELECT t.id,'report' type,COALESCE(t.system_name,t.change_summary,'Technical report') label,p.project_number || ' · Technical report' detail
               FROM technical_report t JOIN project p ON p.id=t.project_id
               WHERE (t.id LIKE ? ESCAPE '\\' OR t.system_name LIKE ? ESCAPE '\\' OR t.change_summary LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')${projectRestriction}`,
            )
            .all(
              pattern,
              pattern,
              pattern,
              pattern,
              ...projectValues,
              pattern,
              pattern,
              pattern,
              pattern,
              pattern,
              ...projectValues,
            );
    const expenses =
      principal.role === 'worker'
        ? this.sqlite
            .prepare(
              `SELECT e.id,'expense' type,COALESCE(e.vendor,e.description,e.category) label,p.project_number || ' · Expense / receipt' detail
               FROM expense e JOIN project p ON p.id=e.project_id
               WHERE e.worker_id=? AND p.status='active'
                 AND EXISTS(SELECT 1 FROM project_member pm WHERE pm.project_id=e.project_id AND pm.user_id=? AND pm.status='active' AND pm.starts_on<=e.spent_on AND (pm.ends_on IS NULL OR pm.ends_on>=e.spent_on) AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now')))
                 AND (e.id LIKE ? ESCAPE '\\' OR e.receipt_document_id LIKE ? ESCAPE '\\' OR e.vendor LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\') LIMIT 50`,
            )
            .all(principal.userId, principal.userId, pattern, pattern, pattern, pattern, pattern)
        : this.sqlite
            .prepare(
              `SELECT e.id,'expense' type,COALESCE(e.vendor,e.description,e.category) label,p.project_number || ' · Expense / receipt' detail
               FROM expense e JOIN project p ON p.id=e.project_id
               WHERE (e.id LIKE ? ESCAPE '\\' OR e.receipt_document_id LIKE ? ESCAPE '\\' OR e.vendor LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR p.project_number LIKE ? ESCAPE '\\')${projectRestriction} LIMIT 50`,
            )
            .all(pattern, pattern, pattern, pattern, pattern, ...projectValues);
    return [...projects, ...clients, ...workers, ...invoices, ...reports, ...expenses].slice(
      0,
      100,
    );
  }

  searchSuggestions(principal: Principal, limit = 24) {
    this.assertReadable(principal);
    const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));
    return this.search(principal, '').slice(0, bounded);
  }

  listAuditEvents(principal: Principal, limit = 200) {
    this.assertReadable(principal);
    if (principal.role !== 'owner_admin' && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Audit access required');
    const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
    return this.sqlite
      .prepare(
        'SELECT id,actor_id,action,entity_type,entity_id,occurred_at,details_json FROM audit_event ORDER BY occurred_at DESC,id DESC LIMIT ?',
      )
      .all(bounded);
  }

  listOwnTime(principal: Principal) {
    const rows = this.time.listOwnTime(principal) as Array<Record<string, unknown>>;
    if (this.canSeeFinanceFields(principal)) return rows;
    return rows.filter((row) =>
      this.hasEffectiveProjectObjectAccess(
        principal,
        String(row.project_id),
        String(row.work_date),
      ),
    );
  }

  listTimeForScope(
    principal: Principal,
    filters: { projectId?: string; category?: string; from?: string; to?: string } = {},
  ) {
    this.assertReadable(principal);
    const clauses = ['1=1'];
    const values: Array<string> = [];
    if (principal.role === 'worker') {
      clauses.push('t.worker_id=?');
      values.push(principal.userId);
      clauses.push("p.status IN ('active','planned','paused')");
      clauses.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=t.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=t.work_date AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=t.work_date) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      values.push(principal.userId, today(), today());
    } else if (principal.role === 'project_manager') {
      const projectIds = [...principal.projectIds];
      if (projectIds.length === 0) return [];
      clauses.push(`t.project_id IN (${projectIds.map(() => '?').join(',')})`);
      values.push(...projectIds);
      clauses.push("p.status IN ('active','planned','paused')");
      clauses.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=t.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=t.work_date AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=t.work_date) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      values.push(principal.userId, today(), today());
    }
    if (filters.projectId) {
      clauses.push('t.project_id=?');
      values.push(filters.projectId);
    }
    if (filters.category) {
      clauses.push('t.category=?');
      values.push(filters.category);
    }
    if (filters.from) {
      clauses.push('t.work_date>=?');
      values.push(filters.from);
    }
    if (filters.to) {
      clauses.push('t.work_date<=?');
      values.push(filters.to);
    }
    return this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,
                t.activity_summary,t.approval_state,t.billability_state${
                  this.canSeeFinanceFields(principal) ? ',t.invoice_id' : ''
                },t.version,
                p.project_number,p.name project_name
         FROM time_entry t JOIN project p ON p.id=t.project_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY t.work_date DESC,t.created_at DESC LIMIT 400`,
      )
      .all(...values);
  }

  timeDetail(principal: Principal, id: string) {
    this.assertReadable(principal);
    const privateFields = this.canSeeFinanceFields(principal)
      ? ',t.billable_minutes,t.client_rate_minor,t.compensation_amount_minor,t.internal_cost_minor,t.billing_status,t.locked_at'
      : '';
    const row = this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,
                t.project_timezone,t.activity_summary,t.approval_state,t.billability_state,
                t.submitted_at,t.approved_at,t.start_time,t.end_time,t.break_minutes,t.site,
                p.project_number,p.name project_name,p.site_name,p.currency,
                u.name worker_name,u.email worker_email${privateFields}
         FROM time_entry t JOIN project p ON p.id=t.project_id JOIN user u ON u.id=t.worker_id
         WHERE t.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw new ValidationError('Time entry not found');
    if (
      !this.canViewReport(
        principal,
        String(row.project_id),
        String(row.worker_id),
        String(row.work_date),
      )
    )
      throw new AccessDeniedError('Time entry access required');
    return row;
  }

  listOwnTimeWeek(principal: Principal, weekStart: string) {
    const result = this.time.listOwnTimeWeek(principal, weekStart) as {
      weekStart: string;
      weekEnd: string;
      rows: Array<Record<string, unknown>>;
    };
    if (this.canSeeFinanceFields(principal)) return result;
    return {
      ...result,
      rows: result.rows.filter((row) =>
        this.hasEffectiveProjectObjectAccess(
          principal,
          String(row.project_id),
          String(row.work_date),
        ),
      ),
    };
  }

  copyOwnTimeLayout(
    principal: Principal,
    sourceWeekStart: string,
    targetWeekStart: string,
  ): { created: number; skipped: number; sourceWeekStart: string; targetWeekStart: string } {
    return this.time.copyOwnTimeLayout(principal, sourceWeekStart, targetWeekStart);
  }

  listOwnExpenses(principal: Principal) {
    this.assertReadable(principal);
    const columns = this.canSeeFinanceFields(principal)
      ? 'e.id,e.project_id,e.spent_on,e.vendor,e.category,e.amount_minor,e.currency,e.approval_state,e.reimbursement_state,e.who_paid,e.billing_treatment,e.billing_amount_minor,e.billing_state,e.invoice_id,e.version'
      : 'e.id,e.project_id,e.spent_on,e.vendor,e.category,e.amount_minor,e.currency,e.approval_state,e.reimbursement_state,e.who_paid,e.version';
    const rows = this.sqlite
      .prepare(
        `SELECT ${columns},p.project_number
         FROM expense e JOIN project p ON p.id=e.project_id
         WHERE e.worker_id=? ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 100`,
      )
      .all(principal.userId);
    if (this.canSeeFinanceFields(principal)) return rows;
    return (rows as Array<Record<string, unknown>>).filter((row) =>
      this.hasEffectiveProjectObjectAccess(principal, String(row.project_id), String(row.spent_on)),
    );
  }

  listExpensesForScope(principal: Principal) {
    this.assertReadable(principal);
    const clauses = ['1=1'];
    const values: Array<string> = [];
    if (principal.role === 'worker') {
      clauses.push('e.worker_id=?');
      values.push(principal.userId);
      clauses.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=e.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=e.spent_on AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=e.spent_on) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      values.push(principal.userId, today(), today());
    } else if (principal.role === 'project_manager') {
      const projectIds = [...principal.projectIds];
      if (projectIds.length === 0) return [];
      clauses.push(`e.project_id IN (${projectIds.map(() => '?').join(',')})`);
      values.push(...projectIds);
      clauses.push(
        "EXISTS (SELECT 1 FROM project_member pm_scope WHERE pm_scope.project_id=e.project_id AND pm_scope.user_id=? AND pm_scope.status='active' AND pm_scope.starts_on<=e.spent_on AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=e.spent_on) AND pm_scope.starts_on<=? AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=?))",
      );
      values.push(principal.userId, today(), today());
    }
    const expenseColumns = this.canSeeFinanceFields(principal)
      ? 'e.*'
      : principal.role === 'worker'
        ? `e.id,e.project_id,e.worker_id,e.spent_on,e.vendor,e.category,e.description,
           e.amount_minor,e.currency,e.payment_method,e.approval_state,e.who_paid,
           e.receipt_document_id,e.receipt_required,e.reimbursement_state,
           e.reimbursement_amount_minor,e.expected_reimbursement_on,e.reimbursed_at,e.reimbursement_reference,e.version`
        : `e.id,e.project_id,e.worker_id,e.spent_on,e.vendor,e.category,e.description,
           e.amount_minor,e.currency,e.payment_method,e.approval_state,e.who_paid,
           e.receipt_document_id,e.receipt_required,e.version`;
    return this.sqlite
      .prepare(
        `SELECT ${expenseColumns},p.project_number,p.name project_name
         FROM expense e JOIN project p ON p.id=e.project_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 250`,
      )
      .all(...values);
  }

  setExpensePlanningDates(
    principal: Principal,
    input: Readonly<{
      expenseId: string;
      expectedReimbursementOn: string | null;
      expectedRecoveryOn: string | null;
      expectedVersion: number;
    }>,
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
      throw new ValidationError('Expense version is invalid');
    if (input.expectedReimbursementOn !== null)
      assertDate(input.expectedReimbursementOn, 'Expected reimbursement date');
    if (input.expectedRecoveryOn !== null)
      assertDate(input.expectedRecoveryOn, 'Expected client recovery date');
    return this.transaction(() => {
      const expense = this.sqlite
        .prepare(
          `SELECT id,version,invoice_id,billing_state,billing_lock_id,reimbursed_at
           FROM expense WHERE id=?`,
        )
        .get(input.expenseId) as
        | {
            id: string;
            version: number;
            invoice_id: string | null;
            billing_state: string | null;
            billing_lock_id: string | null;
            reimbursed_at: string | null;
          }
        | undefined;
      if (!expense) throw new ValidationError('Expense not found');
      if (expense.invoice_id || expense.billing_state !== 'unlocked' || expense.billing_lock_id)
        throw new ConflictError('Billed or locked expense planning cannot be changed');
      if (expense.reimbursed_at)
        throw new ConflictError('Reimbursed expense planning cannot be changed');
      const changed = this.sqlite
        .prepare(
          `UPDATE expense
           SET expected_reimbursement_on=?,expected_recovery_on=?,updated_at=?,version=version+1
           WHERE id=? AND version=? AND invoice_id IS NULL
             AND billing_state='unlocked' AND billing_lock_id IS NULL AND reimbursed_at IS NULL`,
        )
        .run(
          input.expectedReimbursementOn,
          input.expectedRecoveryOn,
          now(),
          input.expenseId,
          input.expectedVersion,
        );
      if (changed.changes !== 1) throw new ConflictError('Expense changed before planning update');
      this.audit(principal, 'expense.planning_update', 'expense', input.expenseId, {
        expectedReimbursementOn: input.expectedReimbursementOn,
        expectedRecoveryOn: input.expectedRecoveryOn,
        expectedVersion: input.expectedVersion,
        planningOnly: true,
      });
      return {
        expenseId: input.expenseId,
        expectedReimbursementOn: input.expectedReimbursementOn,
        expectedRecoveryOn: input.expectedRecoveryOn,
        version: input.expectedVersion + 1,
      };
    });
  }

  /**
   * Return the complete, own-only expense set used by worker compensation
   * statements for an explicit period.  This intentionally does not reuse
   * listExpensesForScope: that general project view has a UI safety cap, while
   * a financial export must never turn that cap into silent truncation.
   */
  listWorkerStatementExpenses(
    principal: Principal,
    periodStart: string,
    periodEnd: string,
  ): Array<{
    id: string;
    projectNumber: string;
    spentOn: string;
    vendor: string;
    category: string;
    reimbursementAmountMinor: string;
    currency: string;
    approvalState: string;
    reimbursementState: string;
    expectedReimbursementOn: string | null;
    reimbursedAt: string | null;
  }> {
    this.assertReadable(principal);
    if (principal.role !== 'worker') throw new AccessDeniedError('Worker role required');
    assertDate(periodStart, 'Period start');
    assertDate(periodEnd, 'Period end');
    if (periodStart > periodEnd)
      throw new ValidationError('Period start must not follow period end');
    const rows = this.sqlite
      .prepare(
        `SELECT e.id,e.spent_on,e.vendor,e.category,CAST(e.amount_minor AS TEXT) amount_minor,
                e.currency source_currency,p.currency project_currency,
                CAST(e.project_currency_amount_minor AS TEXT) project_currency_amount_minor,
                CAST(e.reimbursement_amount_minor AS TEXT) reimbursement_amount_minor,
                p.project_number,e.approval_state,e.reimbursement_state,
                e.expected_reimbursement_on,e.reimbursed_at
         FROM expense e
         JOIN project p ON p.id=e.project_id
         WHERE e.worker_id=?
           AND e.spent_on>=? AND e.spent_on<=?
           AND e.who_paid='worker'
           AND e.approval_state NOT IN ('rejected','void')
           AND COALESCE(e.reimbursement_state,'pending') NOT IN ('rejected','void')
           AND EXISTS (
             SELECT 1
             FROM project_member pm_scope
             WHERE pm_scope.project_id=e.project_id
               AND pm_scope.user_id=e.worker_id
                AND pm_scope.status='active'
                AND pm_scope.starts_on<=e.spent_on
                AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=e.spent_on)
            )
         ORDER BY e.spent_on DESC,e.created_at DESC,e.id`,
      )
      .all(principal.userId, periodStart, periodEnd) as Array<{
      id: string;
      project_number: string;
      spent_on: string;
      vendor: string | null;
      category: string;
      amount_minor: string;
      source_currency: string;
      project_currency: string;
      project_currency_amount_minor: string | null;
      reimbursement_amount_minor: string | null;
      approval_state: string;
      reimbursement_state: string | null;
      expected_reimbursement_on: string | null;
      reimbursed_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      projectNumber: row.project_number,
      spentOn: row.spent_on,
      vendor: row.vendor ?? '',
      category: row.category,
      // Keep SQLite's exact minor-unit text all the way to the export layer.
      // Worker reimbursement is an obligation in the expense/source currency.
      // Project-currency projection belongs to project economics and must not
      // silently redenominate what the worker is owed. Aggregate callers reject
      // mixed currencies instead of adding unlike minor units.
      reimbursementAmountMinor: String(row.reimbursement_amount_minor ?? row.amount_minor),
      currency: row.source_currency,
      approvalState: row.approval_state,
      reimbursementState: row.reimbursement_state ?? 'pending',
      expectedReimbursementOn: row.expected_reimbursement_on,
      reimbursedAt: row.reimbursed_at,
    }));
  }

  /**
   * Return the complete own time history for a worker statement. Access is
   * proven against the assignment on each source date, not against whether
   * the assignment or project is still active today.
   */
  listWorkerStatementTime(
    principal: Principal,
    periodStart: string,
    periodEnd: string,
  ): Array<Record<string, unknown>> {
    this.assertReadable(principal);
    if (principal.role !== 'worker') throw new AccessDeniedError('Worker role required');
    assertDate(periodStart, 'Period start');
    assertDate(periodEnd, 'Period end');
    if (periodStart > periodEnd)
      throw new ValidationError('Period start must not follow period end');
    return this.sqlite
      .prepare(
        `SELECT t.id,t.project_id,t.worker_id,t.work_date,t.category,t.activity_code,t.minutes,
                t.activity_summary,t.approval_state,t.billability_state,t.version,
                p.project_number,p.name project_name
         FROM time_entry t
         JOIN project p ON p.id=t.project_id
         WHERE t.worker_id=?
           AND t.work_date>=? AND t.work_date<=?
           AND t.approval_state NOT IN ('rejected','void')
           AND EXISTS (
             SELECT 1
             FROM project_member pm_scope
             WHERE pm_scope.project_id=t.project_id
               AND pm_scope.user_id=t.worker_id
               AND pm_scope.status='active'
               AND pm_scope.starts_on<=t.work_date
               AND (pm_scope.ends_on IS NULL OR pm_scope.ends_on>=t.work_date)
           )
         ORDER BY t.work_date DESC,t.created_at DESC,t.id`,
      )
      .all(principal.userId, periodStart, periodEnd) as Array<Record<string, unknown>>;
  }

  expenseDetail(principal: Principal, id: string) {
    this.assertReadable(principal);
    const expenseColumns = this.canSeeFinanceFields(principal)
      ? 'e.*'
      : principal.role === 'worker'
        ? `e.id,e.project_id,e.worker_id,e.spent_on,e.category,e.currency,e.amount_minor,
           e.vendor,e.description,e.who_paid,e.payment_method,e.receipt_required,
           e.receipt_document_id,e.approval_state,e.reimbursement_state,
           e.reimbursement_amount_minor,e.expected_reimbursement_on,e.reimbursed_at,e.reimbursement_reference,
           e.version,e.created_at,e.updated_at`
        : `e.id,e.project_id,e.worker_id,e.spent_on,e.category,e.currency,e.amount_minor,
           e.vendor,e.description,e.who_paid,e.payment_method,e.receipt_required,
           e.receipt_document_id,e.approval_state,e.version,e.created_at,e.updated_at`;
    const row = this.sqlite
      .prepare(
        `SELECT ${expenseColumns},p.project_number,p.name project_name,
                p.site_name,p.currency project_currency,u.name worker_name,u.email worker_email
         FROM expense e JOIN project p ON p.id=e.project_id JOIN user u ON u.id=e.worker_id
         WHERE e.id=?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) throw new ValidationError('Expense not found');
    if (
      !this.canViewReport(
        principal,
        String(row.project_id),
        String(row.worker_id),
        String(row.spent_on),
      )
    )
      throw new AccessDeniedError('Expense access required');
    return row;
  }

  listAssignedProjects(principal: Principal) {
    return this.planning.listAssignedProjects(principal);
  }

  listClients(principal: Principal) {
    return this.clients.listClients(principal);
  }

  listApprovalQueue(principal: Principal) {
    this.assertReadable(principal);
    if (principal.role === 'owner_admin' || principal.role === 'finance_admin') {
      const operational =
        principal.role === 'owner_admin'
          ? "SELECT 'time' type,id,project_id,worker_id,work_date date,minutes amount,approval_state,'operational' review_stage FROM time_entry WHERE approval_state='submitted' UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'operational' FROM expense WHERE approval_state='submitted' UNION ALL SELECT 'daily',id,project_id,worker_id,work_date,0,approval_state,'report' FROM daily_report WHERE approval_state='submitted' UNION ALL SELECT 'technical',id,project_id,author_id,report_date,0,approval_state,'report' FROM technical_report WHERE approval_state='submitted' UNION ALL SELECT 'time',id,project_id,worker_id,work_date,minutes,approval_state,'owner_override' FROM time_entry WHERE approval_state='approved' AND invoice_id IS NULL AND billing_status='unlocked' AND billing_lock_id IS NULL AND locked_at IS NULL AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='time_entry' AND rcl.original_id=time_entry.id) UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'owner_override' FROM expense WHERE approval_state='approved' AND invoice_id IS NULL AND billing_state='unlocked' AND billing_lock_id IS NULL AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='expense' AND rcl.original_id=expense.id) UNION ALL SELECT 'daily',d.id,d.project_id,d.worker_id,d.work_date,0,d.approval_state,'owner_override' FROM daily_report d WHERE d.approval_state='approved' AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='daily_report' AND rcl.original_id=d.id) AND NOT EXISTS (SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type='daily_report' AND rs.source_id=d.id AND pr.state='final') UNION ALL SELECT 'technical',t.id,t.project_id,t.author_id,t.report_date,0,t.approval_state,'owner_override' FROM technical_report t WHERE t.approval_state='approved' AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='technical_report' AND rcl.original_id=t.id) AND NOT EXISTS (SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type='technical_report' AND rs.source_id=t.id AND pr.state='final') UNION ALL "
          : '';
      return this.sqlite
        .prepare(
          `${operational}SELECT 'time' type,id,project_id,worker_id,work_date date,minutes amount,approval_state,'finance' review_stage FROM time_entry WHERE approval_state='approved' AND billability_state='pending' UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'finance' FROM expense WHERE approval_state='approved' AND finance_approved_at IS NULL ORDER BY date`,
        )
        .all();
    }
    if (principal.role !== 'project_manager')
      throw new AccessDeniedError('Project review required');
    const current = today();
    const ids = (
      this.sqlite
        .prepare(
          `SELECT project_id FROM project_member
            WHERE user_id=? AND status='active' AND can_review=1
              AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)
            ORDER BY project_id`,
        )
        .all(principal.userId, current, current) as Array<{ project_id: string }>
    )
      .map((row) => row.project_id)
      .filter((projectId) => principal.projectIds.has(projectId));
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.sqlite
      .prepare(
        `SELECT 'time' type,id,project_id,worker_id,work_date date,minutes amount,approval_state,'operational' review_stage FROM time_entry WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'operational' FROM expense WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'daily',id,project_id,worker_id,work_date,0,approval_state,'report' FROM daily_report WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'technical',id,project_id,author_id,report_date,0,approval_state,'report' FROM technical_report WHERE approval_state='submitted' AND project_id IN (${placeholders}) UNION ALL SELECT 'time',id,project_id,worker_id,work_date,minutes,approval_state,'correction' FROM time_entry WHERE approval_state='approved' AND invoice_id IS NULL AND billing_status='unlocked' AND billing_lock_id IS NULL AND locked_at IS NULL AND project_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='time_entry' AND rcl.original_id=time_entry.id) UNION ALL SELECT 'expense',id,project_id,worker_id,spent_on,amount_minor,approval_state,'correction' FROM expense WHERE approval_state='approved' AND invoice_id IS NULL AND billing_state='unlocked' AND billing_lock_id IS NULL AND project_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='expense' AND rcl.original_id=expense.id) UNION ALL SELECT 'daily',d.id,d.project_id,d.worker_id,d.work_date,0,d.approval_state,'correction' FROM daily_report d WHERE d.approval_state='approved' AND d.project_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='daily_report' AND rcl.original_id=d.id) AND NOT EXISTS (SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type='daily_report' AND rs.source_id=d.id AND pr.state='final') UNION ALL SELECT 'technical',t.id,t.project_id,t.author_id,t.report_date,0,t.approval_state,'correction' FROM technical_report t WHERE t.approval_state='approved' AND t.project_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl WHERE rcl.record_type='technical_report' AND rcl.original_id=t.id) AND NOT EXISTS (SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type='technical_report' AND rs.source_id=t.id AND pr.state='final') ORDER BY date`,
      )
      .all(...ids, ...ids, ...ids, ...ids, ...ids, ...ids, ...ids, ...ids);
  }

  listInvoices(principal: Principal): readonly InvoiceListRow[] {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    const invoices = this.sqlite
      .prepare(
        "SELECT i.id,i.invoice_number,i.stream_type,i.state,i.currency,i.total_minor,i.period_start,i.period_end,i.planned_issue_on,i.expected_collection_on,i.issued_at,i.version,i.pdf_status,i.pdf_generated_at,EXISTS(SELECT 1 FROM invoice_event e WHERE e.invoice_id=i.id AND e.event_type='void') voided,c.client_code,c.client_number,c.display_name client_name,p.project_number,p.cost_center_code,p.po_number FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id ORDER BY i.created_at DESC",
      )
      .all() as InvoiceListSourceRow[];
    return invoices.map((invoice) => {
      if (invoice.state === 'void' || invoice.state === 'credited')
        return { ...invoice, paid_minor: '0' };
      const paid = (
        this.sqlite
          .prepare('SELECT CAST(amount_minor AS TEXT) amount FROM payment WHERE invoice_id=?')
          .all(invoice.id) as Array<{ amount: string }>
      ).reduce((sum, row) => sum + BigInt(row.amount), 0n);
      const reversed = (
        this.sqlite
          .prepare(
            'SELECT CAST(amount_minor AS TEXT) amount FROM invoice_payment_reversal_event WHERE invoice_id=?',
          )
          .all(invoice.id) as Array<{ amount: string }>
      ).reduce((sum, row) => sum + BigInt(row.amount), 0n);
      return { ...invoice, paid_minor: (paid - reversed).toString() };
    });
  }

  setInvoicePlanningDates(
    principal: Principal,
    input: Readonly<{
      invoiceId: string;
      plannedIssueOn: string | null;
      expectedCollectionOn: string | null;
      expectedVersion: number;
    }>,
  ) {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
      throw new ValidationError('Invoice version is invalid');
    if (input.plannedIssueOn !== null)
      assertDate(input.plannedIssueOn, 'Planned invoice issue date');
    if (input.expectedCollectionOn !== null)
      assertDate(input.expectedCollectionOn, 'Expected collection date');
    return this.transaction(() => {
      const invoice = this.sqlite
        .prepare('SELECT id,state,issued_at,version FROM invoice WHERE id=?')
        .get(input.invoiceId) as
        | { id: string; state: string; issued_at: string | null; version: number }
        | undefined;
      if (!invoice) throw new ValidationError('Invoice not found');
      if (
        invoice.issued_at ||
        ['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'credited'].includes(
          invoice.state,
        )
      )
        throw new ConflictError('Issued invoice planning is immutable');
      const changed = this.sqlite
        .prepare(
          `UPDATE invoice
           SET planned_issue_on=?,expected_collection_on=?,updated_at=?,version=version+1
           WHERE id=? AND version=? AND issued_at IS NULL
             AND state NOT IN ('issued','sent','partially_paid','paid','overdue','void','credited')`,
        )
        .run(
          input.plannedIssueOn,
          input.expectedCollectionOn,
          now(),
          input.invoiceId,
          input.expectedVersion,
        );
      if (changed.changes !== 1) throw new ConflictError('Invoice changed before planning update');
      this.audit(principal, 'invoice.planning_update', 'invoice', input.invoiceId, {
        plannedIssueOn: input.plannedIssueOn,
        expectedCollectionOn: input.expectedCollectionOn,
        expectedVersion: input.expectedVersion,
        planningOnly: true,
      });
      return {
        invoiceId: input.invoiceId,
        plannedIssueOn: input.plannedIssueOn,
        expectedCollectionOn: input.expectedCollectionOn,
        version: input.expectedVersion + 1,
      };
    });
  }

  listActiveWorkers(principal: Principal) {
    return this.workforce.listActiveWorkers(principal);
  }

  updateUserStatus(
    principal: Principal,
    userId: string,
    status: 'active' | 'suspended' | 'offboarded' | 'archived',
  ): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw new AccessDeniedError('Owner administration required');
    this.assertStepUp(principal);
    if (userId === principal.userId)
      throw new ValidationError('The owner cannot change their own status');
    const target = this.sqlite.prepare('SELECT id,status,role FROM user WHERE id=?').get(userId) as
      | { id: string; status: string; role: string }
      | undefined;
    if (!target) throw new ValidationError('User not found');
    if (target.role === 'owner_admin' && target.status === 'active' && status !== 'active') {
      const owners = this.sqlite
        .prepare("SELECT COUNT(*) AS count FROM user WHERE role='owner_admin' AND status='active'")
        .get() as { count: number };
      if (owners.count <= 1)
        throw new ConflictError('The last active owner cannot be offboarded or suspended');
    }
    this.transaction(() => {
      const changed = this.sqlite
        .prepare(
          "UPDATE user SET status=?,offboarded_at=CASE WHEN ? IN ('offboarded','archived') THEN COALESCE(offboarded_at,?) ELSE NULL END,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(status, status, now(), now(), userId);
      if (Number(changed.changes) !== 1) throw new ValidationError('User status was not updated');
      if (status !== 'active')
        this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(userId);
      this.audit(principal, 'user.status.update', 'user', userId, {
        before: { status: target.status },
        after: { status },
        reason: `Owner set account status to ${status}`,
      });
    });
  }

  listBillingRules(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare(
        'SELECT br.id,br.project_id,br.stream_type,br.cadence_type,br.anchor_date,br.monthly_cutoff_day,br.currency,br.enabled,p.project_number,p.name project_name,tp.name tax_profile_name,le.code legal_entity_code,cc.name billing_contact_name FROM billing_rule br JOIN project p ON p.id=br.project_id LEFT JOIN tax_profile tp ON tp.id=br.tax_profile_id LEFT JOIN legal_entity le ON le.id=br.legal_entity_id LEFT JOIN client_contact cc ON cc.id=br.billing_contact_id ORDER BY p.project_number,br.stream_type',
      )
      .all();
  }

  listFinanceProjects(principal: Principal) {
    this.assertReadable(principal);
    if (!canManageBilling(principal) && principal.role !== 'auditor_read_only')
      throw new AccessDeniedError('Finance role required');
    return this.sqlite
      .prepare('SELECT id,project_number,name,status,currency FROM project ORDER BY project_number')
      .all();
  }
  updateWorkerProfile(
    principal: Principal,
    workerId: string,
    input: { name: string; email: string; role: string; joinedAt: string },
  ): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin')
      throw new AccessDeniedError('Owner administration required');
    this.assertStepUp(principal);
    this.workforce.updateWorkerProfile(principal, workerId, input);
  }

  updateBillingRule(principal: Principal, ruleId: string, input: Record<string, unknown>): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT id,stream_type FROM billing_rule WHERE id=?')
        .get(ruleId) as { id: string; stream_type: string } | undefined;
      if (!existing) throw new ValidationError('Billing rule not found');
      const grouping = input.groupingMode;
      if (
        grouping !== undefined &&
        !['summary', 'detail', 'by_worker', 'by_day', 'by_category'].includes(String(grouping))
      )
        throw new ValidationError('Unsupported billing grouping');
      const paymentTerms = input.paymentTermsDays;
      if (
        paymentTerms !== undefined &&
        (!Number.isInteger(paymentTerms) || Number(paymentTerms) < 0 || Number(paymentTerms) > 365)
      )
        throw new ValidationError('Payment terms must be between 0 and 365 days');
      if (input.autoIssue === true || input.autoSend === true)
        throw new ValidationError('Automatic invoice issue and send are disabled');
      const recipient =
        input.recipientEmail === undefined
          ? undefined
          : String(input.recipientEmail).trim() || null;
      if (recipient !== undefined && recipient !== null && !/^\S+@\S+\.\S+$/.test(recipient))
        throw new ValidationError('Recipient email is invalid');
      const templateId =
        input.templateId === undefined
          ? undefined
          : controlledInvoiceTemplateId(
              assertText(String(input.templateId), 'Template ID', 100),
              existing.stream_type,
            );
      const poNumber =
        input.poNumberOverride === undefined
          ? undefined
          : String(input.poNumberOverride).trim() || null;
      const groupingValue = grouping === undefined ? null : String(grouping);
      const assignments = [
        'template_id=COALESCE(?,template_id)',
        'recipient_email=COALESCE(?,recipient_email)',
        'payment_terms_days=COALESCE(?,payment_terms_days)',
        'po_number_override=COALESCE(?,po_number_override)',
        'grouping_mode=COALESCE(?,grouping_mode)',
        'auto_generate_draft=COALESCE(?,auto_generate_draft)',
      ];
      const values: Array<string | number | bigint | null> = [
        templateId ?? null,
        recipient ?? null,
        paymentTerms === undefined ? null : Number(paymentTerms),
        poNumber ?? null,
        groupingValue,
        input.autoGenerateDraft === undefined ? null : input.autoGenerateDraft ? 1 : 0,
      ];
      if (Object.prototype.hasOwnProperty.call(input, 'fixedAmountMinor')) {
        const fixed = input.fixedAmountMinor;
        if (fixed !== null && typeof fixed !== 'bigint')
          throw new ValidationError('Fixed amount must use exact minor units');
        if (typeof fixed === 'bigint' && fixed < 0n)
          throw new ValidationError('Fixed amount cannot be negative');
        assignments.push('fixed_amount_minor=?');
        values.push(fixed === null ? null : safeInteger(fixed as bigint));
      }
      if (Object.prototype.hasOwnProperty.call(input, 'includedMinutes')) {
        const included = input.includedMinutes;
        if (
          included !== null &&
          (!Number.isInteger(included) || Number(included) < 0 || Number(included) > 10_000_000)
        )
          throw new ValidationError('Included minutes are invalid');
        assignments.push('included_minutes=?');
        values.push(included === null ? null : Number(included));
      }
      assignments.push('updated_at=?', 'version=version+1');
      values.push(now(), ruleId);
      this.sqlite
        .prepare(`UPDATE billing_rule SET ${assignments.join(',')} WHERE id=?`)
        .run(...values);
      this.audit(principal, 'billing_rule.update', 'billing_rule', ruleId, input);
    });
  }

  archiveBillingRule(principal: Principal, ruleId: string): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const changed = this.sqlite
        .prepare(
          'UPDATE billing_rule SET enabled=0,effective_to=COALESCE(effective_to,?),updated_at=?,version=version+1 WHERE id=? AND enabled=1',
        )
        .run(today(), now(), ruleId);
      if (changed.changes !== 1) throw new ValidationError('Active billing rule not found');
      this.audit(principal, 'billing_rule.archive', 'billing_rule', ruleId, {});
    });
  }

  updateLegalEntity(principal: Principal, entityId: string, input: Record<string, unknown>): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const existing = this.sqlite
        .prepare("SELECT * FROM legal_entity WHERE id=? AND status='active'")
        .get(entityId) as
        | {
            legal_name: string;
            currency: Currency;
            billing_address: string;
            company_identifiers: string;
          }
        | undefined;
      if (!existing) throw new ValidationError('Active legal entity not found');
      const legalName =
        input.legalName === undefined
          ? existing.legal_name
          : assertText(String(input.legalName), 'Legal entity name', 300);
      const billingAddress =
        input.billingAddress === undefined
          ? existing.billing_address
          : assertText(String(input.billingAddress), 'Billing address', 2000);
      const companyIdentifiers =
        input.companyIdentifiers === undefined
          ? existing.company_identifiers
          : assertText(String(input.companyIdentifiers), 'Company identifiers', 1000);
      const currency = input.currency === undefined ? existing.currency : String(input.currency);
      if (!['USD', 'BRL', 'EUR'].includes(currency))
        throw new ValidationError('Unsupported legal entity currency');
      this.assertLegalEntityCurrencyChangeAllowed(
        entityId,
        existing.currency,
        currency as Currency,
      );
      this.sqlite
        .prepare(
          'UPDATE legal_entity SET legal_name=?,currency=?,billing_address=?,company_identifiers=?,updated_at=?,version=version+1 WHERE id=?',
        )
        .run(legalName, currency, billingAddress, companyIdentifiers, now(), entityId);
      this.audit(principal, 'legal_entity.update', 'legal_entity', entityId, {});
    });
  }

  archiveLegalEntity(principal: Principal, entityId: string): void {
    this.assertActive(principal);
    if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const changed = this.sqlite
        .prepare(
          "UPDATE legal_entity SET status='archived',updated_at=?,version=version+1 WHERE id=? AND status='active'",
        )
        .run(now(), entityId);
      if (changed.changes !== 1) throw new ValidationError('Active legal entity not found');
      this.audit(principal, 'legal_entity.archive', 'legal_entity', entityId, {});
    });
  }

  updateTaxProfile(principal: Principal, profileId: string, input: Record<string, unknown>): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const name =
        input.name === undefined
          ? undefined
          : assertText(String(input.name), 'Tax profile name', 160);
      const changed = this.sqlite
        .prepare(
          "UPDATE tax_profile SET name=COALESCE(?,name),version=version+1 WHERE id=? AND status='active'",
        )
        .run(name ?? null, profileId);
      if (changed.changes !== 1) throw new ValidationError('Active tax profile not found');
      this.audit(principal, 'tax_profile.update', 'tax_profile', profileId, input);
    });
  }

  archiveTaxProfile(principal: Principal, profileId: string): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const changed = this.sqlite
        .prepare(
          "UPDATE tax_profile SET status='archived',effective_to=COALESCE(effective_to,?),version=version+1 WHERE id=? AND status='active'",
        )
        .run(today(), profileId);
      if (changed.changes !== 1) throw new ValidationError('Active tax profile not found');
      this.audit(principal, 'tax_profile.archive', 'tax_profile', profileId, {});
    });
  }

  deleteInvoice(principal: Principal, invoiceId: string): void {
    this.assertActive(principal);
    if (!canManageBilling(principal)) throw new AccessDeniedError('Finance role required');
    this.assertStepUp(principal);
    this.transaction(() => {
      const invoice = this.sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(invoiceId) as
        | { state: string }
        | undefined;
      if (!invoice) throw new ValidationError('Invoice not found');
      if (invoice.state !== 'draft')
        throw new ConflictError('Issued or approved invoices cannot be deleted');
      const references = this.sqlite
        .prepare(
          'SELECT (SELECT COUNT(*) FROM invoice_line WHERE invoice_id=?) + (SELECT COUNT(*) FROM invoice_source WHERE invoice_id=?) AS count',
        )
        .get(invoiceId, invoiceId) as { count: number };
      if (references.count > 0)
        throw new ConflictError('Draft invoices with source lines must be superseded, not deleted');
      const changed = this.sqlite
        .prepare("DELETE FROM invoice WHERE id=? AND state='draft'")
        .run(invoiceId);
      if (changed.changes !== 1) throw new ConflictError('Invoice changed before deletion');
      this.audit(principal, 'invoice.delete_draft', 'invoice', invoiceId, {});
    });
  }

  deleteExpense(principal: Principal, expenseId: string, version: number): void {
    this.assertActive(principal);
    this.transaction(() => {
      const expense = this.sqlite
        .prepare(
          'SELECT project_id,spent_on,worker_id,approval_state,invoice_id,billing_state,billing_lock_id,version FROM expense WHERE id=?',
        )
        .get(expenseId) as
        | {
            project_id: string;
            spent_on: string;
            worker_id: string;
            approval_state: string;
            invoice_id: string | null;
            billing_state: string;
            billing_lock_id: string | null;
            version: number;
          }
        | undefined;
      if (!expense) throw new ValidationError('Expense not found');
      this.assertProjectObjectAccess(
        principal,
        expense.project_id,
        expense.spent_on,
        expense.worker_id,
      );
      if (expense.worker_id !== principal.userId && principal.role !== 'owner_admin')
        throw new AccessDeniedError('Expense ownership or admin rights required');
      if (expense.invoice_id || expense.billing_state !== 'unlocked' || expense.billing_lock_id)
        throw new ConflictError('Billed or locked expenses cannot be deleted or voided');
      if (['draft', 'needs_changes'].includes(expense.approval_state)) {
        const changed = this.sqlite
          .prepare(
            "DELETE FROM expense WHERE id=? AND version=? AND approval_state IN ('draft','needs_changes') AND invoice_id IS NULL AND billing_state='unlocked'",
          )
          .run(expenseId, version);
        if (changed.changes !== 1) throw new ConflictError('Expense changed before deletion');
        this.audit(principal, 'expense.delete_draft', 'expense', expenseId, { version });
        return;
      }
      if (expense.approval_state === 'void') return;
      if (!['submitted', 'approved'].includes(expense.approval_state))
        throw new ConflictError('Expense is not in a voidable state');
      const changed = this.sqlite
        .prepare(
          "UPDATE expense SET approval_state='void',updated_at=?,version=version+1 WHERE id=? AND version=? AND invoice_id IS NULL AND billing_state='unlocked' AND billing_lock_id IS NULL AND approval_state IN ('submitted','approved')",
        )
        .run(now(), expenseId, version);
      if (changed.changes !== 1) throw new ConflictError('Expense changed before voiding');
      this.audit(principal, 'expense.void', 'expense', expenseId, { version });
    });
  }

  updateSkill(principal: Principal, skillId: string, input: { name?: string }): void {
    return this.workforce.updateSkill(principal, skillId, input);
  }

  deleteSkill(principal: Principal, skillId: string): void {
    return this.workforce.deleteSkill(principal, skillId);
  }

  deleteWorkerSkill(principal: Principal, workerId: string, skillId: string): void {
    return this.workforce.deleteWorkerSkill(principal, workerId, skillId);
  }

  updateClient(
    principal: Principal,
    clientId: string,
    input: Partial<ClientInput>,
    expectedVersion: number,
  ): void {
    return this.clients.updateClient(principal, clientId, input, expectedVersion);
  }

  archiveClient(principal: Principal, clientId: string): void {
    const current = this.sqlite
      .prepare('SELECT status,version FROM client WHERE id=?')
      .get(clientId) as { status: LifecycleEntityState; version: number } | undefined;
    if (!current) throw new ValidationError('Client not found');
    this.transitionClient(principal, {
      clientId,
      status: 'archived',
      version: current.version,
      reason: 'Archived by an authorized administrator',
    });
  }

  updateClientContact(
    principal: Principal,
    contactId: string,
    input: Partial<Omit<ClientContactInput, 'clientId'>>,
  ): void {
    return this.clients.updateClientContact(principal, contactId, input);
  }

  deleteClientContact(principal: Principal, contactId: string): void {
    return this.clients.deleteClientContact(principal, contactId);
  }

  updateAssignment(
    principal: Principal,
    assignmentId: string,
    input: Partial<Omit<AssignmentInput, 'projectId' | 'workerId'>> & { version: number },
  ): void {
    return this.workforce.updateAssignment(principal, assignmentId, input);
  }

  deleteAssignment(principal: Principal, assignmentId: string): void {
    return this.workforce.deleteAssignment(principal, assignmentId);
  }

  removeAssignment(
    principal: Principal,
    assignmentId: string,
    input: AssignmentRemovalInput,
  ): void {
    return this.workforce.removeAssignment(principal, assignmentId, input);
  }

  listAssignments(principal: Principal) {
    return this.workforce.listAssignments(principal);
  }

  deleteTime(principal: Principal, timeId: string, version: number): void {
    this.assertActive(principal);
    const scope = this.sqlite
      .prepare('SELECT project_id,worker_id,work_date FROM time_entry WHERE id=?')
      .get(timeId) as { project_id: string; worker_id: string; work_date: string } | undefined;
    if (!scope) throw new ValidationError('Time entry not found');
    this.assertProjectObjectAccess(principal, scope.project_id, scope.work_date, scope.worker_id);
    this.time.deleteTime(principal, timeId, version);
  }

  updateProject(
    principal: Principal,
    input: {
      projectId: string;
      version?: number;
      costCenterCode?: string | null;
      name?: string;
      poNumber?: string | null;
      /** @deprecated Lifecycle status must be changed through transitionProject. */
      status?: string;
      description?: string | null;
      projectAlias?: string | null;
      timezone?: string;
      billingModel?: string;
      siteName?: string | null;
      country?: string | null;
      projectManagerId?: string | null;
      expectedHoursPerDay?: number | string;
      expectedMinutesPerDay?: number;
      clientDailyMinimumHours?: number | string | null;
      clientDailyMinimumMinutes?: number | null;
      budgetMinor?: bigint | null;
      revenueBudgetMinor?: bigint | null;
      poCapMinor?: bigint | null;
      fixedPriceMinor?: bigint | null;
      laborBudgetMinutes?: number | null;
      travelBudgetMinor?: bigint | null;
      otherCostBudgetMinor?: bigint | null;
      plannedMinutes?: number | null;
      contractNumber?: string | null;
      startDate?: string | null;
      plannedEndDate?: string | null;
      /** @deprecated The close transition owns the actual close date. */
      actualEndDate?: string | null;
      budgetType?: string;
      weeklyCloseEnabled?: boolean;
      dailyReportRequired?: boolean;
      technicalReportingRequired?: boolean;
      notes?: string | null;
    },
  ): void {
    this.assertActive(principal);
    if (!canManageClients(principal))
      throw new AccessDeniedError('Project administration required');
    const allowedBillingModels = [
      'tm',
      'tm_daily_minimum',
      'all_in',
      'capped_tm',
      'milestone',
      'hybrid',
      'internal',
    ];
    this.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT * FROM project WHERE id=?')
        .get(input.projectId) as Record<string, unknown> | undefined;
      if (!existing) throw new ValidationError('Project not found');
      if (input.version !== undefined && input.version !== Number(existing.version))
        throw new ConflictError('Project changed before update');
      if (input.status !== undefined && input.status !== String(existing.status))
        throw new ConflictError('Project status must be changed through transitionProject');
      const requestedActualEnd =
        input.actualEndDate === undefined ||
        input.actualEndDate === null ||
        input.actualEndDate.trim() === ''
          ? null
          : input.actualEndDate;
      if (
        input.actualEndDate !== undefined &&
        requestedActualEnd !== (existing.actual_end_date as string | null)
      )
        throw new ConflictError('Project close date must be changed through transitionProject');
      const textOrNull = (
        value: string | null | undefined,
        field: string,
        max = 5000,
      ): string | null => {
        if (value === undefined) return null;
        if (value === null || value.trim() === '') return null;
        return assertText(value, field, max);
      };
      const boundedInteger = (
        value: number | null | undefined,
        field: string,
        maximum?: number,
      ): number | null => {
        if (value === undefined || value === null) return null;
        if (!Number.isInteger(value) || value < 0 || (maximum !== undefined && value > maximum))
          throw new ValidationError(`${field} is invalid`);
        return value;
      };
      const boundedMoney = (value: bigint | null | undefined, field: string): number | null => {
        if (value === undefined || value === null) return null;
        if (value < 0n) throw new ValidationError(`${field} cannot be negative`);
        return safeInteger(value);
      };
      const dateOrNull = (value: string | null | undefined, field: string): string | null => {
        if (value === undefined || value === null || value.trim() === '') return null;
        assertDate(value, field);
        return value;
      };
      const name =
        input.name === undefined
          ? String(existing.name)
          : assertText(input.name, 'Project name', 200);
      const poNumber =
        input.poNumber === undefined
          ? (existing.po_number as string | null)
          : textOrNull(input.poNumber, 'PO / reference', 200);
      const billingModel =
        input.billingModel === undefined ? String(existing.billing_model) : input.billingModel;
      if (!allowedBillingModels.includes(billingModel))
        throw new ValidationError('Invalid commercial model');
      const timezone =
        input.timezone === undefined
          ? String(existing.timezone)
          : assertText(input.timezone, 'Timezone', 80);
      const expectedMinutesPerDay =
        input.expectedHoursPerDay !== undefined && input.expectedHoursPerDay !== ''
          ? boundedInteger(
              Math.round(Number(input.expectedHoursPerDay) * 60),
              'Expected hours per day',
              1440,
            )!
          : input.expectedMinutesPerDay === undefined
            ? Number(existing.expected_minutes_per_day ?? 600)
            : boundedInteger(input.expectedMinutesPerDay, 'Expected minutes per day', 1440)!;
      const clientDailyMinimumMinutes =
        input.clientDailyMinimumHours !== undefined
          ? input.clientDailyMinimumHours === null || input.clientDailyMinimumHours === ''
            ? null
            : boundedInteger(
                Math.round(Number(input.clientDailyMinimumHours) * 60),
                'Client daily minimum hours',
                1440,
              )
          : input.clientDailyMinimumMinutes === undefined
            ? (existing.client_daily_minimum_minutes as number | null)
            : boundedInteger(input.clientDailyMinimumMinutes, 'Client daily minimum', 1440);
      const laborBudgetMinutes =
        input.laborBudgetMinutes === undefined
          ? (existing.labor_budget_minutes as number | null)
          : boundedInteger(input.laborBudgetMinutes, 'Labor budget minutes');
      const plannedMinutes =
        input.plannedMinutes === undefined
          ? (existing.planned_minutes as number | null)
          : boundedInteger(input.plannedMinutes, 'Planned minutes');
      const startDate =
        input.startDate === undefined
          ? (existing.start_date as string | null)
          : dateOrNull(input.startDate, 'Start date');
      const plannedEndDate =
        input.plannedEndDate === undefined
          ? (existing.planned_end_date as string | null)
          : dateOrNull(input.plannedEndDate, 'Planned end date');
      if (startDate && plannedEndDate && plannedEndDate < startDate)
        throw new ValidationError('Planned end date must follow the start date');
      const previousProjectManagerId =
        (existing.project_manager_id as string | null | undefined) ?? null;
      const nextProjectManagerId =
        input.projectManagerId === undefined
          ? previousProjectManagerId
          : input.projectManagerId || null;
      const projectManagerChanged =
        input.projectManagerId !== undefined && nextProjectManagerId !== previousProjectManagerId;
      if (input.projectManagerId) {
        const manager = this.sqlite
          .prepare("SELECT 1 FROM user WHERE id=? AND role='project_manager' AND status='active'")
          .get(input.projectManagerId);
        if (!manager) throw new ValidationError('Active project manager not found');
      }
      const updates: Array<[string, string | number | null]> = [
        [
          'cost_center_code',
          input.costCenterCode === undefined
            ? (existing.cost_center_code as string | null)
            : textOrNull(input.costCenterCode, 'Cost center code', 120),
        ],
        ['name', name],
        ['po_number', poNumber],
        [
          'description',
          input.description === undefined
            ? (existing.description as string | null)
            : textOrNull(input.description, 'Description'),
        ],
        [
          'project_alias',
          input.projectAlias === undefined
            ? (existing.project_alias as string | null)
            : textOrNull(input.projectAlias, 'Project alias', 120),
        ],
        ['timezone', timezone],
        ['billing_model', billingModel],
        [
          'site_name',
          input.siteName === undefined
            ? (existing.site_name as string | null)
            : textOrNull(input.siteName, 'Site name', 200),
        ],
        [
          'country',
          input.country === undefined
            ? (existing.country as string | null)
            : textOrNull(input.country, 'Country', 80),
        ],
        [
          'project_manager_id',
          input.projectManagerId === undefined
            ? (existing.project_manager_id as string | null)
            : input.projectManagerId,
        ],
        ['expected_minutes_per_day', expectedMinutesPerDay],
        ['client_daily_minimum_minutes', clientDailyMinimumMinutes],
        [
          'budget_minor',
          input.budgetMinor === undefined
            ? (existing.budget_minor as number | null)
            : boundedMoney(input.budgetMinor, 'Legacy project budget'),
        ],
        [
          'revenue_budget_minor',
          input.revenueBudgetMinor === undefined
            ? (existing.revenue_budget_minor as number | null)
            : boundedMoney(input.revenueBudgetMinor, 'Revenue budget'),
        ],
        [
          'po_cap_minor',
          input.poCapMinor === undefined
            ? (existing.po_cap_minor as number | null)
            : boundedMoney(input.poCapMinor, 'PO cap'),
        ],
        [
          'fixed_price_minor',
          input.fixedPriceMinor === undefined
            ? (existing.fixed_price_minor as number | null)
            : boundedMoney(input.fixedPriceMinor, 'Fixed price'),
        ],
        ['labor_budget_minutes', laborBudgetMinutes],
        [
          'travel_budget_minor',
          input.travelBudgetMinor === undefined
            ? (existing.travel_budget_minor as number | null)
            : boundedMoney(input.travelBudgetMinor, 'Travel budget'),
        ],
        [
          'other_cost_budget_minor',
          input.otherCostBudgetMinor === undefined
            ? (existing.other_cost_budget_minor as number | null)
            : boundedMoney(input.otherCostBudgetMinor, 'Other cost budget'),
        ],
        ['planned_minutes', plannedMinutes],
        [
          'contract_number',
          input.contractNumber === undefined
            ? (existing.contract_number as string | null)
            : textOrNull(input.contractNumber, 'Contract number', 200),
        ],
        ['start_date', startDate],
        ['planned_end_date', plannedEndDate],
        [
          'budget_type',
          input.budgetType === undefined
            ? String(existing.budget_type ?? 'none')
            : assertText(input.budgetType, 'Budget type', 80),
        ],
        [
          'weekly_close_enabled',
          input.weeklyCloseEnabled === undefined
            ? Number(existing.weekly_close_enabled ?? 0)
            : input.weeklyCloseEnabled
              ? 1
              : 0,
        ],
        [
          'daily_report_required',
          input.dailyReportRequired === undefined
            ? Number(existing.daily_report_required ?? 0)
            : input.dailyReportRequired
              ? 1
              : 0,
        ],
        [
          'technical_reporting_required',
          input.technicalReportingRequired === undefined
            ? Number(existing.technical_reporting_required ?? 0)
            : input.technicalReportingRequired
              ? 1
              : 0,
        ],
        [
          'notes',
          input.notes === undefined
            ? (existing.notes as string | null)
            : textOrNull(input.notes, 'Notes'),
        ],
      ];
      const changed = this.sqlite
        .prepare(
          `UPDATE project SET ${updates.map(([field]) => `${field}=?`).join(',')},updated_at=?,version=version+1 WHERE id=?${input.version !== undefined ? ' AND version=?' : ''}`,
        )
        .run(
          ...updates.map(([, value]) => value),
          now(),
          input.projectId,
          ...(input.version !== undefined ? [input.version] : []),
        );
      if (changed.changes !== 1) throw new ConflictError('Project changed before update');
      if (projectManagerChanged && previousProjectManagerId) {
        const previousMemberships = this.sqlite
          .prepare(
            "SELECT id,starts_on,ends_on FROM project_member WHERE project_id=? AND user_id=? AND assignment_role='project_manager' AND status='active'",
          )
          .all(input.projectId, previousProjectManagerId) as Array<{
          id: string;
          starts_on: string;
          ends_on: string | null;
        }>;
        const effectiveDate = today();
        for (const membership of previousMemberships) {
          const endsOn =
            membership.starts_on > effectiveDate
              ? membership.starts_on
              : membership.ends_on && membership.ends_on < effectiveDate
                ? membership.ends_on
                : effectiveDate;
          if (endsOn < membership.starts_on)
            throw new ConflictError('Project manager assignment history is inconsistent');
          const deactivated = this.sqlite
            .prepare(
              "UPDATE project_member SET status='inactive',ends_on=?,updated_at=?,version=version+1 WHERE id=? AND status='active'",
            )
            .run(endsOn, now(), membership.id);
          if (deactivated.changes !== 1)
            throw new ConflictError('Project manager assignment changed before replacement');
          this.audit(principal, 'assignment.delete', 'project_member', membership.id, {
            operation: 'replace_project_manager',
            projectId: input.projectId,
            workerId: previousProjectManagerId,
            assignmentRole: 'project_manager',
            endsOn,
          });
        }
      }
      if (projectManagerChanged && nextProjectManagerId) {
        const requestedManagerStartDate = startDate ?? today();
        const occupiedStartDates = new Set(
          (
            this.sqlite
              .prepare('SELECT starts_on FROM project_member WHERE project_id=? AND user_id=?')
              .all(input.projectId, nextProjectManagerId) as Array<{ starts_on: string }>
          ).map((row) => row.starts_on),
        );
        let managerStartDate = requestedManagerStartDate;
        if (occupiedStartDates.has(managerStartDate)) {
          const lowerBound = startDate ?? today();
          if (requestedManagerStartDate > today()) {
            let candidate = requestedManagerStartDate;
            while (occupiedStartDates.has(candidate)) candidate = shiftIsoDate(candidate, 1);
            managerStartDate = candidate;
          } else {
            let candidate = today();
            while (candidate >= lowerBound && occupiedStartDates.has(candidate))
              candidate = shiftIsoDate(candidate, -1);
            if (candidate >= lowerBound && !occupiedStartDates.has(candidate))
              managerStartDate = candidate;
            else {
              candidate = today();
              while (occupiedStartDates.has(candidate)) candidate = shiftIsoDate(candidate, 1);
              managerStartDate = candidate;
            }
          }
        }
        const existingMembership = this.sqlite
          .prepare(
            "SELECT id,status FROM project_member WHERE project_id=? AND user_id=? AND assignment_role='project_manager' AND (status='active' OR starts_on=?) ORDER BY status='active' DESC,starts_on DESC,id LIMIT 1",
          )
          .get(input.projectId, nextProjectManagerId, managerStartDate) as
          | { id: string; status: string }
          | undefined;
        if (existingMembership) {
          const activated = this.sqlite
            .prepare(
              "UPDATE project_member SET assignment_role='project_manager',ends_on=NULL,can_review=1,status='active',updated_at=?,version=version+1 WHERE id=?",
            )
            .run(now(), existingMembership.id);
          if (activated.changes !== 1)
            throw new ConflictError('Project manager assignment changed before activation');
          this.audit(principal, 'assignment.update', 'project_member', existingMembership.id, {
            operation: 'set_project_manager',
            projectId: input.projectId,
            workerId: nextProjectManagerId,
            assignmentRole: 'project_manager',
            canReview: true,
          });
        } else {
          const membershipId = newId();
          this.sqlite
            .prepare(
              'INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,planned_minutes,can_review,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              membershipId,
              input.projectId,
              nextProjectManagerId,
              'project_manager',
              managerStartDate,
              null,
              null,
              1,
              'active',
              now(),
              now(),
            );
          this.audit(principal, 'assignment.create', 'project_member', membershipId, {
            operation: 'set_project_manager',
            projectId: input.projectId,
            workerId: nextProjectManagerId,
            assignmentRole: 'project_manager',
            canReview: true,
          });
        }
      }
      this.audit(principal, 'project.update', 'project', input.projectId, {
        fields: Object.fromEntries(updates),
        ...(projectManagerChanged
          ? {
              projectManager: {
                from: previousProjectManagerId,
                to: nextProjectManagerId,
              },
            }
          : {}),
      });
    });
  }

  listAllWorkers(principal: Principal): Record<string, unknown>[] {
    return this.workforce.listAllWorkers(principal) as Record<string, unknown>[];
  }

  listOwnDocuments(principal: Principal): Record<string, unknown>[] {
    return this.listDocuments(principal) as Record<string, unknown>[];
  }

  reserveUpload(
    principal: Principal,
    input: Parameters<V3Repository['reserveUpload']>[1],
  ): ReturnType<V3Repository['reserveUpload']> {
    return new V3Repository(this.sqlite).reserveUpload(principal, input);
  }

  finalizeUpload(
    principal: Principal,
    reservationId: string,
    input: Parameters<V3Repository['finalizeUpload']>[2],
  ): ReturnType<V3Repository['finalizeUpload']> {
    return new V3Repository(this.sqlite).finalizeUpload(principal, reservationId, input);
  }
}
