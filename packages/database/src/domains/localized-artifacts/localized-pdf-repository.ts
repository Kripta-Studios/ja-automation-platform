import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal, type Role } from '@ja/domain';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { assertRecentStepUp } from '../../core/authorization.ts';
import { assertSafeStorageKey, isSafeStorageKey } from '../../core/storage-key.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';

export const LOCALIZED_PDF_LOCALES = ['en', 'es', 'pt'] as const;
export type LocalizedPdfLocale = (typeof LOCALIZED_PDF_LOCALES)[number];

export const LOCALIZED_PDF_OWNER_TYPES = [
  'invoice',
  'period_report_revision',
  'accounting_pack_revision',
  'daily_report',
  'technical_report',
] as const;
const LOCALIZED_PDF_JOB_KIND = 'localized_pdf_variant_render';
const LOCALIZED_PDF_JOB_CAPABILITY = 'artifact.localized_pdf.render';
export type LocalizedPdfOwnerType = (typeof LOCALIZED_PDF_OWNER_TYPES)[number];

export type LocalizedPdfOwnerSelector = Readonly<{
  ownerType: LocalizedPdfOwnerType;
  ownerId: string;
}>;

export type LocalizedPdfRequest = Readonly<
  LocalizedPdfOwnerSelector & {
    locale: LocalizedPdfLocale | 'en-US' | 'es-ES' | 'pt-BR' | string;
    templateVersion: string;
    generationVersion: string;
    requestKey?: string;
    maxAttempts?: number;
  }
>;

export type LocalizedPdfVariant = Readonly<{
  variantId: string;
  ownerType: LocalizedPdfOwnerType;
  ownerId: string;
  ownerRevisionId: string;
  tenantId: string;
  deploymentId: string;
  locale: LocalizedPdfLocale;
  localeTag: 'en-US' | 'es-ES' | 'pt-BR';
  documentTag:
    | 'invoice'
    | 'period_report'
    | 'accounting_pack'
    | 'daily_report'
    | 'technical_report';
  templateVersion: string;
  generationVersion: string;
  snapshotJson: string;
  snapshotHash: string;
  snapshotHashKind: 'canonical' | 'legacy_verbatim';
  status: 'queued' | 'running' | 'ready' | 'failed';
  currentAttemptNumber: number;
  attemptNumber: number;
  semanticFilename: string;
  mediaType: string | null;
  byteLength: number | null;
  contentSha256: string | null;
  storageKey: string;
  rendererVersion: string | null;
  readyAt: string | null;
  errorCode: string | null;
  retryable: boolean | null;
  integrityBlocked: boolean;
  maxAttempts: number;
  requestKey: string | null;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  execution: LocalizedPdfExecution | null;
  updatedAt: string;
}>;

export type LocalizedPdfClaim = Readonly<{
  variant: LocalizedPdfVariant;
  attemptNumber: number;
  startedAt: string;
  execution: LocalizedPdfExecution;
}>;

/** The opaque durable-run binding that owns one localized render attempt. */
export type LocalizedPdfExecution = Readonly<{
  jobId: string;
  jobRunId: string;
  leaseFence: number;
}>;

export type LocalizedPdfStorageExpectation = Readonly<{
  storageKey: string;
  byteLength: number;
  contentSha256: string;
  mediaType: 'application/pdf';
}>;

export type LocalizedPdfStorageVerification = Readonly<{
  exists: boolean;
  byteLength: number | null;
  contentSha256: string | null;
  mediaType?: string | null;
  magicValid?: boolean;
}>;

/**
 * Production callers provide an adapter backed by the private object store.
 * The repository never treats a claimed manifest as proof that bytes exist.
 */
export type LocalizedPdfStorageVerifier = Readonly<{
  verify: (
    storageKey: string,
    expected?: LocalizedPdfStorageExpectation,
  ) => LocalizedPdfStorageVerification;
}>;

export type LocalizedPdfPersistedHook = (variant: LocalizedPdfVariant) => void;

export type LocalizedPdfCompletion = Readonly<{
  attemptNumber: number;
  contentSha256: string;
  byteLength: number;
  storageKey?: string;
  rendererVersion: string;
  mediaType?: 'application/pdf';
  /** The exact fenced runner envelope; completion never re-queries a latest run. */
  execution: LocalizedPdfExecution;
}>;

export type LocalizedPdfFailure = Readonly<{
  attemptNumber: number;
  errorCode: string;
  retryable?: boolean;
  failureClass?: string;
  /** The exact fenced runner envelope; failure never re-queries a latest run. */
  execution: LocalizedPdfExecution;
}>;

export type LocalizedPdfDownload = Readonly<{
  variantId: string;
  ownerType: LocalizedPdfOwnerType;
  ownerId: string;
  locale: LocalizedPdfLocale;
  localeTag: 'en-US' | 'es-ES' | 'pt-BR';
  semanticFilename: string;
  storageKey: string;
  mediaType: 'application/pdf';
  byteLength: number;
  contentSha256: string;
}>;

type LocalizedPdfAccessOutcome = 'authorized' | 'blocked' | 'integrity';
type LocalizedPdfDownloadResult =
  | LocalizedPdfDownload
  | { readonly kind: 'blocked'; readonly error: AccessDeniedError }
  | null;

type LocalizedPdfRow = Readonly<{
  variant_id: string;
  owner_type: LocalizedPdfOwnerType;
  owner_id: string;
  owner_revision_id: string;
  tenant_id: string;
  deployment_id: string;
  locale: LocalizedPdfLocale;
  locale_tag: 'en-US' | 'es-ES' | 'pt-BR';
  document_tag: LocalizedPdfVariant['documentTag'];
  template_version: string;
  generation_version: string;
  snapshot_json: string;
  snapshot_hash: string;
  snapshot_hash_kind: 'canonical' | 'legacy_verbatim';
  status: LocalizedPdfVariant['status'];
  current_attempt_number: number;
  attempt_number: number;
  semantic_filename: string;
  media_type: string | null;
  byte_length: number | null;
  content_sha256: string | null;
  storage_key: string;
  renderer_version: string | null;
  ready_at: string | null;
  error_code: string | null;
  retryable: number | null;
  integrity_blocked: number;
  max_attempts: number;
  request_key: string | null;
  requested_by: string;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  claimed_job_id: string | null;
  claimed_job_run_id: string | null;
  claimed_lease_fence: number | null;
  updated_at: string;
}>;

type DerivedOwner = Readonly<{
  ownerType: LocalizedPdfOwnerType;
  ownerId: string;
  ownerRevisionId: string;
  tenantId: string;
  deploymentId: string;
  projectId: string | null;
  sourceUserId: string | null;
  /** Native operational date used for object-level assignment checks. */
  sourceDate: string | null;
  /** Compatibility-only customer report projection; internal/finance reports stay private. */
  customerPeriodReportSafe: boolean;
  documentTag: LocalizedPdfVariant['documentTag'];
  snapshotJson: string;
  snapshotHash: string;
}>;

const LOCALE_TAGS: Readonly<Record<LocalizedPdfLocale, LocalizedPdfDownload['localeTag']>> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
};

const DOCUMENT_TAGS: Readonly<Record<LocalizedPdfOwnerType, LocalizedPdfVariant['documentTag']>> = {
  invoice: 'invoice',
  period_report_revision: 'period_report',
  accounting_pack_revision: 'accounting_pack',
  daily_report: 'daily_report',
  technical_report: 'technical_report',
};

const FINANCE_OWNER_TYPES: readonly LocalizedPdfOwnerType[] = [
  'invoice',
  'period_report_revision',
  'accounting_pack_revision',
];
const STEP_UP_OWNER_TYPES: readonly LocalizedPdfOwnerType[] = [
  'invoice',
  'accounting_pack_revision',
];
const CUSTOMER_PERIOD_REPORT_PRIVACY_VERSION = '2026.08.24.customer-period-safe-v1';

const now = (): string => new Date().toISOString();

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function legacyPeriodReportSnapshotRevision(ownerId: string, snapshotJson: unknown): string {
  return `${ownerId}:snapshot:${sha256(String(snapshotJson))}`;
}

function legacyPeriodReportVariantSnapshotRevision(row: LocalizedPdfRow): string | null {
  if (row.snapshot_hash_kind === 'legacy_verbatim')
    return legacyPeriodReportSnapshotRevision(row.owner_id, row.snapshot_json);
  const snapshot = parseJsonRecord(row.snapshot_json);
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'snapshot_json')) return null;
  return legacyPeriodReportSnapshotRevision(row.owner_id, snapshot.snapshot_json);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('Snapshot contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new ValidationError('Snapshot contains an unsupported value');
}

function canonicalSnapshot(value: unknown): { json: string; hash: string } {
  const json = canonicalJson(value);
  return { json, hash: sha256(json) };
}

/**
 * Keep the invoice artifact subject projection aligned with the canonical
 * projection guarded by migration 0023.  Invoice gained planned/expected
 * date columns in migration 0028; those operational planning fields must not
 * silently become part of the immutable invoice PDF owner snapshot unless the
 * database guard is updated in the same migration.
 */
function canonicalInvoiceSnapshot(row: Record<string, unknown>): {
  json: string;
  hash: string;
} {
  return canonicalSnapshot({
    billing_rule_id: row.billing_rule_id,
    calculation_hash: row.calculation_hash,
    configuration_revision_id: row.configuration_revision_id,
    created_at: row.created_at,
    currency: row.currency,
    deployment_id: row.deployment_id,
    due_at: row.due_at,
    id: row.id,
    invoice_number: row.invoice_number,
    invoice_subject_hash: row.invoice_subject_hash,
    issued_at: row.issued_at,
    legal_entity_revision_id: row.legal_entity_revision_id,
    pdf_byte_length: row.pdf_byte_length,
    pdf_generated_at: row.pdf_generated_at,
    pdf_sha256: row.pdf_sha256,
    pdf_status: row.pdf_status,
    pdf_storage_key: row.pdf_storage_key,
    period_end: row.period_end,
    period_start: row.period_start,
    predecessor_subject_hash: row.predecessor_subject_hash,
    project_id: row.project_id,
    sent_at: row.sent_at,
    snapshot_json: row.snapshot_json,
    source_lock_at: row.source_lock_at,
    state: row.state,
    stream_type: row.stream_type,
    subtotal_minor: row.subtotal_minor,
    tax_minor: row.tax_minor,
    tenant_id: row.tenant_id,
    total_minor: row.total_minor,
    updated_at: row.updated_at,
    version: row.version,
    voided_at: row.voided_at,
  });
}

function normalizeLocale(value: unknown): LocalizedPdfLocale {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (normalized === 'es' || normalized === 'es-es') return 'es';
  if (normalized === 'pt' || normalized === 'pt-br') return 'pt';
  if (normalized === 'en' || normalized === 'en-us') return 'en';
  throw new ValidationError('Locale must be en, es or pt-BR');
}

function assertOwnerType(value: string): asserts value is LocalizedPdfOwnerType {
  if (!(LOCALIZED_PDF_OWNER_TYPES as readonly string[]).includes(value))
    throw new ValidationError('Unsupported localized PDF owner type');
}

function assertSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    normalized.includes('..') ||
    /[\\/\0]/u.test(normalized)
  )
    throw new ValidationError(`${field} is invalid`);
  return normalized;
}

function assertExecution(value: LocalizedPdfExecution): LocalizedPdfExecution {
  if (!value || typeof value.jobId !== 'string' || typeof value.jobRunId !== 'string')
    throw new ValidationError('Durable execution binding is required');
  const jobId = assertSegment(value.jobId, 'jobId');
  const jobRunId = assertSegment(value.jobRunId, 'jobRunId');
  // A numeric fence outside the currently claimed value is a stale execution, not malformed
  // input. Keep structural validation (integer/safe range) here and let the bound execution
  // comparison return ConflictError for zero, negative, or otherwise obsolete fences.
  if (!Number.isSafeInteger(value.leaseFence)) throw new ValidationError('leaseFence is invalid');
  return { jobId, jobRunId, leaseFence: value.leaseFence };
}

function executionFromRow(row: LocalizedPdfRow): LocalizedPdfExecution {
  if (
    row.claimed_job_id === null ||
    row.claimed_job_run_id === null ||
    row.claimed_lease_fence === null
  )
    throw new ConflictError('Localized PDF execution binding is missing');
  return {
    jobId: row.claimed_job_id,
    jobRunId: row.claimed_job_run_id,
    leaseFence: row.claimed_lease_fence,
  };
}

function sameExecution(left: LocalizedPdfExecution, right: LocalizedPdfExecution): boolean {
  return (
    left.jobId === right.jobId &&
    left.jobRunId === right.jobRunId &&
    left.leaseFence === right.leaseFence
  );
}

function assertHash(value: string, field: string): string {
  const hash = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(hash)) throw new ValidationError(`${field} must be a SHA-256 hash`);
  return hash;
}

function normalizeRequestKey(value: string | undefined): string | null {
  if (value === undefined) return null;
  const key = value.trim();
  if (!key || key.length > 200 || /[\0\r\n]/u.test(key))
    throw new ValidationError('requestKey is invalid');
  return key;
}

function safeFileSegment(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9_-]/gu, '-')
      .replace(/-+/gu, '-')
      .replace(/^-|-$/gu, '') || 'record'
  );
}

function semanticFilename(
  owner: DerivedOwner,
  localeTag: string,
  templateVersion: string,
  generationVersion: string,
): string {
  const stem = `${owner.documentTag}-${safeFileSegment(owner.ownerId)}-${localeTag}-template-${safeFileSegment(templateVersion)}-generation-${safeFileSegment(generationVersion)}`;
  return `${stem.slice(0, 240)}.pdf`;
}

function storageKey(
  owner: DerivedOwner,
  localeTag: string,
  templateVersion: string,
  generationVersion: string,
  variantId: string,
): string {
  return [
    'localized-pdf',
    owner.documentTag,
    safeFileSegment(owner.ownerId),
    localeTag,
    `template-${safeFileSegment(templateVersion)}`,
    `generation-${safeFileSegment(generationVersion)}`,
    `${safeFileSegment(variantId)}.pdf`,
  ].join('/');
}

function asRole(principal: Principal): Role {
  return principal.role;
}

function isFinanceOwner(ownerType: LocalizedPdfOwnerType): boolean {
  return FINANCE_OWNER_TYPES.includes(ownerType);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function sourceDateFromRow(row: Record<string, unknown>, field: string): string | null {
  const hasNativeField = Object.prototype.hasOwnProperty.call(row, field);
  const native = row[field];
  if (hasNativeField) {
    // Once the schema contains the native field, null or malformed values are an authorization
    // failure. Falling back here would let a forged/incorrect report_date inherit created_at.
    return typeof native === 'string' && isIsoDate(native) ? native : null;
  }
  // Only a genuinely older schema row (where the native column is absent from SELECT *) may use
  // the explicitly supported legacy created_at fallback.
  const createdAt = row.created_at;
  if (typeof createdAt === 'string') {
    const fallback = createdAt.slice(0, 10);
    if (isIsoDate(fallback)) return fallback;
  }
  return null;
}

function projectIdFromRow(row: Record<string, unknown>): string | null {
  const value = row.project_id;
  return typeof value === 'string' && value.trim() ? value : null;
}

function sourceUserIdFromRow(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // Render-time identity is derived from live joins; malformed nested JSON stays unused.
  }
  return null;
}

function definedText(value: unknown): string | undefined {
  if (value === null || value === undefined || typeof value === 'object') return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export class LocalizedPdfRepository {
  private readonly sqlite: DatabaseSync;
  private readonly storageVerifier: LocalizedPdfStorageVerifier;

  constructor(sqlite: DatabaseSync, storageVerifier?: LocalizedPdfStorageVerifier) {
    this.sqlite = sqlite;
    this.storageVerifier =
      storageVerifier ??
      ({
        verify: () => ({ exists: false, byteLength: null, contentSha256: null }),
      } satisfies LocalizedPdfStorageVerifier);
  }

  private transaction<T>(work: () => T): T {
    return runImmediateTransaction(this.sqlite, 'localized-pdf', work);
  }

  private deployment(): { tenantId: string; deploymentId: string } {
    const row = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!row) throw new ValidationError('Deployment identity is required');
    return { tenantId: row.tenant_id, deploymentId: row.deployment_id };
  }

  /**
   * Bind a localized render transition to the real B5 durable execution.  The
   * variant's owner is not an authority boundary for workers: every claim and
   * finalization must prove the persisted job/run, service actor, deployment,
   * payload hash and fence are mutually consistent.
   */
  private assertDurableExecution(
    variantId: string,
    expectedAttemptNumber: number,
    execution: LocalizedPdfExecution,
    phase: 'claim' | 'complete' | 'fail',
  ): void {
    if (!Number.isSafeInteger(expectedAttemptNumber) || expectedAttemptNumber < 1)
      throw new ValidationError('Localized PDF attempt is invalid');
    const identity = this.deployment();
    const row = this.sqlite
      .prepare(
        `SELECT j.id,j.kind,j.contract_version job_contract,j.payload_json,j.payload_sha256,j.tenant_id,j.deployment_id,
                j.required_capability,j.state job_state,j.active_job_run_id,j.fence_version,
                r.id job_run_id,r.contract_version run_contract,r.kind run_kind,r.state run_state,
                r.tenant_id run_tenant_id,r.deployment_id run_deployment_id,
                r.required_capability run_capability,r.payload_sha256 run_payload_sha256,
                r.service_actor_id,r.service_actor_version,
                r.service_actor_capabilities_json,r.configured_binding_version,r.fence_version run_fence,
                s.status actor_status,s.version actor_version,s.capabilities_json actor_capabilities,
                b.service_actor_id binding_actor_id,b.tenant_id binding_tenant_id,
                b.deployment_id binding_deployment_id,b.version binding_version
         FROM job j
         JOIN job_run r ON r.id=j.active_job_run_id AND r.id=? AND r.job_id=j.id
         JOIN service_actor s ON s.id=r.service_actor_id
         JOIN deployment_service_actor_binding b
           ON b.singleton=1 AND b.service_actor_id=s.id
         WHERE j.id=?`,
      )
      .get(execution.jobRunId, execution.jobId) as
      | {
          id: string;
          kind: string;
          job_contract: string;
          payload_json: string;
          payload_sha256: string | null;
          tenant_id: string | null;
          deployment_id: string | null;
          required_capability: string | null;
          job_state: string;
          active_job_run_id: string | null;
          fence_version: number;
          job_run_id: string;
          run_contract: string | null;
          run_kind: string | null;
          run_state: string | null;
          run_tenant_id: string | null;
          run_deployment_id: string | null;
          run_capability: string | null;
          run_payload_sha256: string | null;
          service_actor_id: string | null;
          service_actor_version: number | null;
          service_actor_capabilities_json: string | null;
          configured_binding_version: number | null;
          run_fence: number | null;
          actor_status: string;
          actor_version: number;
          actor_capabilities: string;
          binding_actor_id: string;
          binding_tenant_id: string;
          binding_deployment_id: string;
          binding_version: number;
        }
      | undefined;
    if (!row) throw new ConflictError('Localized PDF durable execution is missing');
    const expectedRunState = phase === 'claim' || phase === 'fail' ? 'running' : 'succeeded';
    const expectedJobState = phase === 'claim' || phase === 'fail' ? 'claimed' : 'succeeded';
    if (
      row.job_contract !== 'b5-v1' ||
      row.run_contract !== 'b5-v1' ||
      row.kind !== LOCALIZED_PDF_JOB_KIND ||
      row.run_kind !== row.kind ||
      row.required_capability !== LOCALIZED_PDF_JOB_CAPABILITY ||
      row.run_capability !== LOCALIZED_PDF_JOB_CAPABILITY ||
      row.run_payload_sha256 !== row.payload_sha256 ||
      row.job_state !== expectedJobState ||
      row.run_state !== expectedRunState ||
      row.active_job_run_id !== execution.jobRunId ||
      row.tenant_id !== identity.tenantId ||
      row.deployment_id !== identity.deploymentId ||
      row.run_tenant_id !== identity.tenantId ||
      row.run_deployment_id !== identity.deploymentId ||
      row.binding_tenant_id !== identity.tenantId ||
      row.binding_deployment_id !== identity.deploymentId ||
      row.service_actor_id !== row.binding_actor_id ||
      row.actor_status !== 'active' ||
      row.service_actor_version !== row.actor_version ||
      row.configured_binding_version !== row.binding_version ||
      row.run_fence !== execution.leaseFence ||
      row.fence_version !== execution.leaseFence
    ) {
      throw new ConflictError('Localized PDF durable execution is stale or forged');
    }
    let capabilities: unknown;
    try {
      capabilities = JSON.parse(row.actor_capabilities);
    } catch {
      throw new ConflictError('Localized PDF service actor capability record is invalid');
    }
    if (!Array.isArray(capabilities) || !capabilities.includes(LOCALIZED_PDF_JOB_CAPABILITY))
      throw new ConflictError('Localized PDF service actor capability is unavailable');
    if (row.actor_capabilities !== row.service_actor_capabilities_json)
      throw new ConflictError('Localized PDF service actor binding changed');
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      throw new ConflictError('Localized PDF durable payload is invalid');
    }
    if (
      row.payload_sha256 === null ||
      sha256(canonicalJson(payload)) !== row.payload_sha256 ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).variantId !== variantId ||
      (payload as Record<string, unknown>).requestedAttempt !== expectedAttemptNumber
    )
      throw new ConflictError('Localized PDF durable payload is stale or forged');
  }

  private assertHuman(principal: Principal, write: boolean): void {
    const row = this.sqlite.prepare('SELECT status FROM user WHERE id=?').get(principal.userId) as
      | { status: string }
      | undefined;
    if (!row || row.status !== 'active') throw new AccessDeniedError('Active account required');
    if (write && principal.role === 'auditor_read_only')
      throw new AccessDeniedError('Read-only role');
  }

  private deriveOwner(selector: LocalizedPdfOwnerSelector): DerivedOwner {
    assertOwnerType(selector.ownerType);
    const ownerId = assertSegment(selector.ownerId, 'ownerId');
    const identity = this.deployment();
    let row: Record<string, unknown> | undefined;
    let legacyPeriodReport = false;
    let projectId: string | null = null;
    let sourceUserId: string | null = null;
    let sourceDate: string | null = null;
    let customerPeriodReportSafe = false;
    let ownerRevisionId = `${ownerId}:v1`;
    switch (selector.ownerType) {
      case 'invoice':
        row = this.sqlite
          .prepare(
            `SELECT i.* FROM invoice i
             WHERE i.id=? AND COALESCE(i.tenant_id,?)=? AND COALESCE(i.deployment_id,?)=?`,
          )
          .get(
            ownerId,
            identity.tenantId,
            identity.tenantId,
            identity.deploymentId,
            identity.deploymentId,
          ) as Record<string, unknown> | undefined;
        if (row) {
          projectId = projectIdFromRow(row);
          ownerRevisionId = `${ownerId}:v${Number(row.version ?? 1)}`;
        }
        break;
      case 'period_report_revision':
        row = this.sqlite
          .prepare(
            'SELECT * FROM period_report_revision WHERE revision_id=? AND tenant_id=? AND deployment_id=?',
          )
          .get(ownerId, identity.tenantId, identity.deploymentId) as
          | Record<string, unknown>
          | undefined;
        if (!row) {
          legacyPeriodReport = true;
          row = this.sqlite
            .prepare(
              `SELECT audience,created_at,created_by,id,pdf_byte_length,pdf_sha256,pdf_storage_key,
                      period_end,period_start,project_id,report_type,snapshot_json,state,updated_at
               FROM period_report WHERE id=?`,
            )
            .get(ownerId) as Record<string, unknown> | undefined;
        }
        if (row && 'project_id' in row) projectId = projectIdFromRow(row);
        ownerRevisionId = ownerId;
        if (row && 'snapshot_json' in row) {
          ownerRevisionId = legacyPeriodReport
            ? `${ownerId}:snapshot:${sha256(String(row.snapshot_json))}`
            : `${ownerId}:v1`;
        }
        break;
      case 'accounting_pack_revision':
        row = this.sqlite
          .prepare(
            'SELECT * FROM accounting_pack_revision WHERE revision_id=? AND tenant_id=? AND deployment_id=?',
          )
          .get(ownerId, identity.tenantId, identity.deploymentId) as
          | Record<string, unknown>
          | undefined;
        ownerRevisionId = ownerId;
        break;
      case 'daily_report':
        row = this.sqlite.prepare('SELECT * FROM daily_report WHERE id=?').get(ownerId) as
          | Record<string, unknown>
          | undefined;
        if (row) {
          projectId = projectIdFromRow(row);
          sourceUserId = sourceUserIdFromRow(row, 'worker_id');
          sourceDate = sourceDateFromRow(row, 'work_date');
          ownerRevisionId = `${ownerId}:v${Number(row.version ?? 1)}`;
        }
        break;
      case 'technical_report':
        row = this.sqlite.prepare('SELECT * FROM technical_report WHERE id=?').get(ownerId) as
          | Record<string, unknown>
          | undefined;
        if (row) {
          projectId = projectIdFromRow(row);
          sourceUserId = sourceUserIdFromRow(row, 'author_id');
          sourceDate = sourceDateFromRow(row, 'report_date');
          ownerRevisionId = `${ownerId}:v${Number(row.version ?? 1)}`;
        }
        break;
    }
    if (!row) throw new AccessDeniedError('Localized PDF owner not found');
    if (legacyPeriodReport) {
      const audience = row.audience;
      const snapshot = parseJsonRecord(row.snapshot_json);
      if (
        audience === 'customer' &&
        snapshot.customerPrivacyVersion !== CUSTOMER_PERIOD_REPORT_PRIVACY_VERSION
      )
        throw new AccessDeniedError('Customer period report requires a safe snapshot refresh');
      customerPeriodReportSafe =
        audience === 'customer' &&
        snapshot.customerPrivacyVersion === CUSTOMER_PERIOD_REPORT_PRIVACY_VERSION;
      // Legacy internal period reports have no revision-level assignment contract. Keep them
      // finance/owner/auditor readable through the role check, but do not let PM assignment scope
      // grant access to the finance-facing fallback row.
      if (audience === 'internal') projectId = null;
    }
    if (
      (selector.ownerType === 'daily_report' || selector.ownerType === 'technical_report') &&
      (!projectId || !sourceUserId || !sourceDate)
    )
      throw new AccessDeniedError('Localized PDF operational owner scope is incomplete');
    const snapshot =
      selector.ownerType === 'invoice' ? canonicalInvoiceSnapshot(row) : canonicalSnapshot(row);
    return {
      ownerType: selector.ownerType,
      ownerId,
      ownerRevisionId,
      tenantId: identity.tenantId,
      deploymentId: identity.deploymentId,
      projectId,
      sourceUserId,
      sourceDate,
      customerPeriodReportSafe,
      documentTag: DOCUMENT_TAGS[selector.ownerType],
      snapshotJson: snapshot.json,
      snapshotHash: snapshot.hash,
    };
  }

  private ownerForVariant(row: LocalizedPdfRow): DerivedOwner {
    const owner = this.deriveOwner({ ownerType: row.owner_type, ownerId: row.owner_id });
    // A localized artifact is authorized against the immutable source revision captured at
    // request time. If the source was edited after the request, do not silently re-authorize the
    // old bytes using the new worker/project relationship; require a fresh variant instead.
    const legacyPeriodReportRevisionMatches =
      row.owner_type === 'period_report_revision' &&
      row.owner_revision_id === `${row.owner_id}:v1` &&
      owner.ownerRevisionId === legacyPeriodReportVariantSnapshotRevision(row);
    // Migration 0023's legacy period-report insert trigger only permits the v1 subject binding.
    // Keep that durable compatibility row readable only when its captured snapshot is exactly the
    // current base snapshot; the derived owner revision remains the deterministic snapshot hash.
    if (owner.ownerRevisionId !== row.owner_revision_id && !legacyPeriodReportRevisionMatches)
      throw new AccessDeniedError('Localized PDF source revision is no longer current');
    return owner;
  }

  private canRead(principal: Principal, owner: DerivedOwner): boolean {
    const role = asRole(principal);
    if (role === 'owner_admin' || role === 'finance_admin' || role === 'auditor_read_only')
      return true;
    if (role === 'project_manager') {
      const projectScopedOperationalOwner =
        owner.ownerType === 'daily_report' || owner.ownerType === 'technical_report';
      const safeCustomerPeriodReport =
        owner.ownerType === 'period_report_revision' && owner.customerPeriodReportSafe;
      return (
        (projectScopedOperationalOwner || safeCustomerPeriodReport) &&
        owner.projectId !== null &&
        this.hasEffectiveAssignment(principal, owner)
      );
    }
    return (
      (owner.ownerType === 'daily_report' || owner.ownerType === 'technical_report') &&
      owner.sourceUserId === principal.userId &&
      this.hasEffectiveAssignment(principal, owner)
    );
  }

  private canWrite(principal: Principal, owner: DerivedOwner): boolean {
    const role = asRole(principal);
    if (role === 'owner_admin') return true;
    if (role === 'finance_admin') return isFinanceOwner(owner.ownerType);
    if (role === 'project_manager')
      return (
        (owner.ownerType === 'daily_report' || owner.ownerType === 'technical_report') &&
        owner.projectId !== null &&
        this.hasEffectiveAssignment(principal, owner)
      );
    return (
      (owner.ownerType === 'daily_report' || owner.ownerType === 'technical_report') &&
      owner.sourceUserId === principal.userId &&
      this.hasEffectiveAssignment(principal, owner)
    );
  }

  /**
   * A Principal's projectIds are only a request-time hint. Localized operational artifacts are
   * private records, so PM/worker access must also prove that the assignment is active today and
   * covered the source record's native date. This prevents a captured or forged principal from
   * retaining access after an assignment is ended or removed.
   */
  private hasEffectiveAssignment(principal: Principal, owner: DerivedOwner): boolean {
    const currentDate = new Date().toISOString().slice(0, 10);
    const objectDate = owner.sourceDate ?? currentDate;
    if (!owner.projectId || !principal.projectIds.has(owner.projectId)) return false;
    const assignment = this.sqlite
      .prepare(
        "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1",
      )
      .get(owner.projectId, principal.userId, currentDate, currentDate, objectDate, objectDate);
    return Boolean(assignment);
  }

  private assertReadable(principal: Principal, owner: DerivedOwner): void {
    this.assertHuman(principal, false);
    if (!this.canRead(principal, owner)) throw new AccessDeniedError('Localized PDF access denied');
  }

  private assertWritable(principal: Principal, owner: DerivedOwner): void {
    this.assertHuman(principal, true);
    if (!this.canWrite(principal, owner))
      throw new AccessDeniedError('Localized PDF administration required');
  }

  private row(variantId: string): LocalizedPdfRow {
    const identity = this.deployment();
    const row = this.sqlite
      .prepare(
        'SELECT * FROM localized_pdf_variant WHERE variant_id=? AND tenant_id=? AND deployment_id=?',
      )
      .get(variantId, identity.tenantId, identity.deploymentId) as LocalizedPdfRow | undefined;
    if (!row) throw new AccessDeniedError('Localized PDF variant not found');
    return row;
  }

  private map(row: LocalizedPdfRow): LocalizedPdfVariant {
    return {
      variantId: row.variant_id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      ownerRevisionId: row.owner_revision_id,
      tenantId: row.tenant_id,
      deploymentId: row.deployment_id,
      locale: row.locale,
      localeTag: row.locale_tag,
      documentTag: row.document_tag,
      templateVersion: row.template_version,
      generationVersion: row.generation_version,
      snapshotJson: row.snapshot_json,
      snapshotHash: row.snapshot_hash,
      snapshotHashKind: row.snapshot_hash_kind,
      status: row.status,
      currentAttemptNumber: row.current_attempt_number,
      attemptNumber: row.attempt_number,
      semanticFilename: row.semantic_filename,
      mediaType: row.media_type,
      byteLength: row.byte_length,
      contentSha256: row.content_sha256,
      storageKey: row.storage_key,
      rendererVersion: row.renderer_version,
      readyAt: row.ready_at,
      errorCode: row.error_code,
      retryable: row.retryable === null ? null : row.retryable === 1,
      integrityBlocked: row.integrity_blocked === 1,
      maxAttempts: row.max_attempts,
      requestKey: row.request_key,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      execution:
        row.claimed_job_id === null ||
        row.claimed_job_run_id === null ||
        row.claimed_lease_fence === null
          ? null
          : {
              jobId: row.claimed_job_id,
              jobRunId: row.claimed_job_run_id,
              leaseFence: row.claimed_lease_fence,
            },
      updatedAt: row.updated_at,
    };
  }

  requestVariant(
    principal: Principal,
    input: LocalizedPdfRequest,
    onPersist?: LocalizedPdfPersistedHook,
  ): LocalizedPdfVariant {
    const ownerType = input.ownerType;
    assertOwnerType(ownerType);
    const locale = normalizeLocale(input.locale);
    const templateVersion = assertSegment(input.templateVersion, 'templateVersion');
    const generationVersion = assertSegment(input.generationVersion, 'generationVersion');
    const requestKey = normalizeRequestKey(input.requestKey);
    const maxAttempts = input.maxAttempts ?? 5;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)
      throw new ValidationError('maxAttempts must be between 1 and 5');
    return this.transaction(() => {
      const owner = this.deriveOwner({ ownerType, ownerId: input.ownerId });
      this.assertWritable(principal, owner);
      this.assertOwnerStepUp(principal, owner);
      if (requestKey) {
        const existing = this.sqlite
          .prepare(
            'SELECT * FROM localized_pdf_variant WHERE tenant_id=? AND deployment_id=? AND request_key=?',
          )
          .get(owner.tenantId, owner.deploymentId, requestKey) as LocalizedPdfRow | undefined;
        if (existing) {
          if (
            existing.owner_type !== owner.ownerType ||
            existing.owner_id !== owner.ownerId ||
            existing.locale !== locale ||
            existing.template_version !== templateVersion ||
            existing.generation_version !== generationVersion ||
            existing.snapshot_hash !== owner.snapshotHash
          )
            throw new ConflictError('IDEMPOTENCY_CONFLICT');
          const variant = this.map(existing);
          onPersist?.(variant);
          return variant;
        }
      }
      const existing = this.sqlite
        .prepare(
          `SELECT * FROM localized_pdf_variant
           WHERE tenant_id=? AND deployment_id=? AND owner_type=? AND owner_id=? AND locale=?
             AND template_version=? AND generation_version=? AND snapshot_hash=?
             AND status IN('queued','running','ready')
           ORDER BY requested_at DESC LIMIT 1`,
        )
        .get(
          owner.tenantId,
          owner.deploymentId,
          owner.ownerType,
          owner.ownerId,
          locale,
          templateVersion,
          generationVersion,
          owner.snapshotHash,
        ) as LocalizedPdfRow | undefined;
      if (existing) {
        const variant = this.map(existing);
        onPersist?.(variant);
        return variant;
      }
      const variantId = newId();
      const localeTag = LOCALE_TAGS[locale];
      const timestamp = now();
      const filename = semanticFilename(owner, localeTag, templateVersion, generationVersion);
      const key = storageKey(owner, localeTag, templateVersion, generationVersion, variantId);
      assertSafeStorageKey(key, () => new ValidationError('Generated storage key is unsafe'));
      // Migration 0023's legacy period-report subject/canonical guards still require the v1
      // durable column value. The effective owner revision remains the exact snapshot hash and
      // ownerForVariant verifies that legacy v1 rows captured that same snapshot.
      const persistedOwnerRevisionId =
        owner.ownerType === 'period_report_revision' &&
        owner.ownerRevisionId.startsWith(`${owner.ownerId}:snapshot:`)
          ? `${owner.ownerId}:v1`
          : owner.ownerRevisionId;
      this.sqlite
        .prepare(
          `INSERT INTO localized_pdf_variant(
             variant_id,owner_type,owner_id,owner_revision_id,tenant_id,deployment_id,
             locale,locale_tag,document_tag,template_version,generation_version,
             snapshot_json,snapshot_hash,snapshot_hash_kind,status,current_attempt_number,attempt_number,
             semantic_filename,storage_key,max_attempts,request_key,requested_by,requested_at,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'canonical','queued',1,1,?,?,?,?,?,?,?)`,
        )
        .run(
          variantId,
          owner.ownerType,
          owner.ownerId,
          persistedOwnerRevisionId,
          owner.tenantId,
          owner.deploymentId,
          locale,
          localeTag,
          owner.documentTag,
          templateVersion,
          generationVersion,
          owner.snapshotJson,
          owner.snapshotHash,
          filename,
          key,
          maxAttempts,
          requestKey,
          principal.userId,
          timestamp,
          timestamp,
        );
      const variant = this.map(this.row(variantId));
      onPersist?.(variant);
      return variant;
    });
  }

  listVariants(
    principal: Principal,
    selector?: LocalizedPdfOwnerSelector,
  ): readonly LocalizedPdfVariant[] {
    this.assertHuman(principal, false);
    const rows = selector
      ? (() => {
          const owner = this.deriveOwner(selector);
          this.assertReadable(principal, owner);
          return this.sqlite
            .prepare(
              `SELECT * FROM localized_pdf_variant
               WHERE tenant_id=? AND deployment_id=? AND owner_type=? AND owner_id=? ORDER BY locale,requested_at`,
            )
            .all(
              owner.tenantId,
              owner.deploymentId,
              owner.ownerType,
              owner.ownerId,
            ) as LocalizedPdfRow[];
        })()
      : (
          this.sqlite
            .prepare(
              'SELECT * FROM localized_pdf_variant WHERE tenant_id=? AND deployment_id=? ORDER BY requested_at,variant_id',
            )
            .all(this.deployment().tenantId, this.deployment().deploymentId) as LocalizedPdfRow[]
        ).filter((row) => {
          try {
            return this.canRead(principal, this.ownerForVariant(row));
          } catch {
            return false;
          }
        });
    return rows.map((row) => this.map(row));
  }

  retryVariant(
    principal: Principal,
    variantId: string,
    onPersist?: LocalizedPdfPersistedHook,
  ): LocalizedPdfVariant {
    return this.transaction(() => {
      const row = this.row(variantId);
      const owner = this.ownerForVariant(row);
      this.assertWritable(principal, owner);
      this.assertOwnerStepUp(principal, owner);
      if (row.status !== 'failed') throw new ConflictError('Only failed variants can be retried');
      if (row.retryable !== 1) throw new ConflictError('Localized PDF failure is not retryable');
      if (row.current_attempt_number >= row.max_attempts)
        throw new ConflictError('Localized PDF retry limit reached');
      const timestamp = now();
      const nextAttemptNumber = row.current_attempt_number + 1;
      const failureClass = row.error_code ?? 'UNKNOWN_FAILURE';
      const decisionHash = sha256(
        [
          row.variant_id,
          row.current_attempt_number,
          nextAttemptNumber,
          row.error_code ?? '',
          failureClass,
          principal.userId,
        ].join('|'),
      );
      this.sqlite
        .prepare(
          `INSERT INTO localized_pdf_retry_decision(
             decision_id,variant_id,prior_attempt_number,next_attempt_number,
             failure_code,failure_class,retryable,requested_by,requested_at,decision_hash
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          newId(),
          row.variant_id,
          row.current_attempt_number,
          nextAttemptNumber,
          row.error_code ?? 'UNKNOWN_FAILURE',
          failureClass,
          1,
          principal.userId,
          timestamp,
          decisionHash,
        );
      this.sqlite
        .prepare(
          `UPDATE localized_pdf_variant
           SET status='queued',current_attempt_number=current_attempt_number+1,attempt_number=attempt_number+1,
               media_type=NULL,byte_length=NULL,content_sha256=NULL,renderer_version=NULL,ready_at=NULL,
               error_code=NULL,retryable=NULL,integrity_blocked=0,started_at=NULL,finished_at=NULL,updated_at=?
           WHERE variant_id=? AND status='failed' AND current_attempt_number=?`,
        )
        .run(timestamp, variantId, row.current_attempt_number);
      const changed = this.sqlite
        .prepare(
          `SELECT status,current_attempt_number FROM localized_pdf_variant WHERE variant_id=?`,
        )
        .get(variantId) as { status: string; current_attempt_number: number } | undefined;
      if (
        !changed ||
        changed.status !== 'queued' ||
        changed.current_attempt_number !== nextAttemptNumber
      )
        throw new ConflictError('Localized PDF retry was lost');
      const variant = this.map(this.row(variantId));
      onPersist?.(variant);
      return variant;
    });
  }

  claimVariant(
    variantId: string,
    execution: LocalizedPdfExecution,
    expectedAttemptNumber: number,
  ): LocalizedPdfClaim {
    return this.transaction(() => {
      const row = this.row(variantId);
      if (row.status !== 'queued') throw new ConflictError('Localized PDF variant is not queued');
      if (row.current_attempt_number !== expectedAttemptNumber)
        throw new ConflictError('Localized PDF attempt is stale');
      const binding = assertExecution(execution);
      this.assertDurableExecution(variantId, expectedAttemptNumber, binding, 'claim');
      const timestamp = now();
      const changed = this.sqlite
        .prepare(
          `UPDATE localized_pdf_variant
           SET status='running',started_at=?,claimed_job_id=?,claimed_job_run_id=?,claimed_lease_fence=?,updated_at=?
           WHERE variant_id=? AND status='queued' AND current_attempt_number=?`,
        )
        .run(
          timestamp,
          binding.jobId,
          binding.jobRunId,
          binding.leaseFence,
          timestamp,
          variantId,
          expectedAttemptNumber,
        );
      if (changed.changes !== 1) throw new ConflictError('Localized PDF claim was lost');
      const variant = this.map(this.row(variantId));
      return {
        variant: { ...variant, snapshotJson: this.enrichRenderSnapshot(variant) },
        attemptNumber: expectedAttemptNumber,
        startedAt: timestamp,
        execution: binding,
      };
    });
  }

  /**
   * Join project/client/worker (and accounting-pack registers) for the renderer only.
   * Migration 0023 requires the persisted snapshot_json to be exactly the owner-table
   * json_object; those display fields must never be written back to the variant row.
   */
  private enrichRenderSnapshot(variant: LocalizedPdfVariant): string {
    const parsed = parseJsonObject(variant.snapshotJson);
    if (!parsed) return variant.snapshotJson;
    if (variant.ownerType === 'daily_report' || variant.ownerType === 'technical_report') {
      const userField = variant.ownerType === 'daily_report' ? 'worker_id' : 'author_id';
      const identity = this.lookupOperationalIdentity(
        projectIdFromRow(parsed),
        sourceUserIdFromRow(parsed, userField),
      );
      return JSON.stringify({ ...parsed, ...identity });
    }
    if (variant.ownerType === 'period_report_revision') {
      const nested = parseJsonObject(parsed.snapshot_json);
      const merged = nested ? { ...parsed, ...nested } : parsed;
      const identity = this.lookupOperationalIdentity(projectIdFromRow(merged), null);
      const nestedProject = parseJsonObject(merged.project) ?? {};
      const number =
        definedText(nestedProject.number) ??
        definedText(nestedProject.projectNumber) ??
        identity.project_number;
      const name =
        definedText(nestedProject.name) ??
        definedText(nestedProject.projectName) ??
        identity.project_name;
      const clientName =
        definedText(nestedProject.clientName) ??
        definedText(nestedProject.client_name) ??
        identity.client_name;
      return JSON.stringify({
        ...merged,
        ...identity,
        project: {
          ...nestedProject,
          ...(number ? { number } : {}),
          ...(name ? { name } : {}),
          ...(clientName ? { clientName } : {}),
        },
      });
    }
    if (variant.ownerType === 'accounting_pack_revision') {
      const pack = this.sqlite
        .prepare(
          'SELECT snapshot_json, legal_entity_revision_id FROM accounting_pack_revision_snapshot WHERE revision_id=?',
        )
        .get(variant.ownerId) as
        | { snapshot_json: string; legal_entity_revision_id: string }
        | undefined;
      const packSnapshot = pack ? parseJsonObject(pack.snapshot_json) : null;
      const legalEntityRevisionId =
        definedText(pack?.legal_entity_revision_id) ?? definedText(parsed.legal_entity_revision_id);
      const legalName = this.lookupLegalEntityName(legalEntityRevisionId);
      return JSON.stringify({
        ...parsed,
        ...(packSnapshot ?? {}),
        ...(legalName
          ? {
              legalEntity: { legalName, legal_name: legalName },
              legal_entity_name: legalName,
            }
          : {}),
      });
    }
    return variant.snapshotJson;
  }

  private lookupOperationalIdentity(
    projectId: string | null,
    userId: string | null,
  ): Record<string, string> {
    if (!projectId) return {};
    const project = this.sqlite
      .prepare(
        `SELECT p.project_number, p.name AS project_name, p.site_name,
                c.client_number, c.display_name AS client_name
         FROM project p
         LEFT JOIN client c ON c.id=p.client_id
         WHERE p.id=?`,
      )
      .get(projectId) as
      | {
          project_number: string;
          project_name: string;
          site_name: string | null;
          client_number: string | null;
          client_name: string | null;
        }
      | undefined;
    const identity: Record<string, string> = {};
    const projectNumber = definedText(project?.project_number);
    const projectName = definedText(project?.project_name);
    const siteName = definedText(project?.site_name);
    const clientNumber = definedText(project?.client_number);
    const clientName = definedText(project?.client_name);
    if (projectNumber) identity.project_number = projectNumber;
    if (projectName) identity.project_name = projectName;
    if (siteName) identity.site_name = siteName;
    if (clientNumber) identity.client_number = clientNumber;
    if (clientName) identity.client_name = clientName;
    if (userId) {
      const user = this.sqlite.prepare('SELECT name, email FROM user WHERE id=?').get(userId) as
        | { name: string; email: string | null }
        | undefined;
      const workerName = definedText(user?.name);
      const workerEmail = definedText(user?.email);
      if (workerName) {
        identity.worker_name = workerName;
        identity.author_name = workerName;
      }
      if (workerEmail) identity.worker_email = workerEmail;
    }
    return identity;
  }

  private lookupLegalEntityName(revisionId: string | undefined): string | undefined {
    if (!revisionId) return undefined;
    const row = this.sqlite
      .prepare('SELECT legal_name FROM legal_entity_revision WHERE revision_id=?')
      .get(revisionId) as { legal_name: string } | undefined;
    return definedText(row?.legal_name);
  }

  private insertIncident(
    row: LocalizedPdfRow,
    kind: string,
    expectedHash: string | null,
    observedHash: string | null,
    expectedLength: number | null,
    observedLength: number | null,
    detectedBy: string,
  ): void {
    const timestamp = now();
    const basis = [
      row.variant_id,
      row.current_attempt_number,
      kind,
      expectedHash ?? '',
      observedHash ?? '',
      expectedLength ?? '',
      observedLength ?? '',
      row.storage_key,
    ].join('|');
    this.sqlite
      .prepare(
        `INSERT OR IGNORE INTO localized_pdf_integrity_incident(
           incident_id,variant_id,owner_type,owner_id,owner_revision_id,locale,template_version,generation_version,
           attempt_number,incident_kind,expected_hash,observed_hash,expected_length,observed_length,
           storage_key,detected_at,detected_by,incident_hash
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId(),
        row.variant_id,
        row.owner_type,
        row.owner_id,
        row.owner_revision_id,
        row.locale,
        row.template_version,
        row.generation_version,
        row.current_attempt_number,
        kind,
        expectedHash,
        observedHash,
        expectedLength,
        observedLength,
        row.storage_key,
        timestamp,
        detectedBy,
        sha256(basis),
      );
  }

  private insertAttempt(
    row: LocalizedPdfRow,
    input: LocalizedPdfCompletion | LocalizedPdfFailure,
    outcome: 'ready' | 'failed',
    failureClass?: string,
    execution?: LocalizedPdfExecution,
  ): void {
    const timestamp = now();
    const binding = execution ?? executionFromRow(row);
    this.sqlite
      .prepare(
        `INSERT INTO localized_pdf_variant_attempt(
           attempt_id,variant_id,attempt_number,job_id,job_run_id,lease_fence,started_at,finished_at,
           outcome,failure_class,retryable,created_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId(),
        row.variant_id,
        row.current_attempt_number,
        binding.jobId,
        binding.jobRunId,
        binding.leaseFence,
        row.started_at ?? timestamp,
        timestamp,
        outcome,
        failureClass ?? (outcome === 'failed' ? (input as LocalizedPdfFailure).errorCode : null),
        outcome === 'failed' ? ((input as LocalizedPdfFailure).retryable === false ? 0 : 1) : null,
        timestamp,
      );
  }

  private boundExecution(
    row: LocalizedPdfRow,
    requested: LocalizedPdfExecution,
  ): LocalizedPdfExecution {
    const current = executionFromRow(row);
    const binding = assertExecution(requested);
    if (!sameExecution(current, binding))
      throw new ConflictError('Localized PDF execution fence is stale');
    return current;
  }

  private verifyStorage(
    storageKey: string,
    expected: LocalizedPdfStorageExpectation,
  ): LocalizedPdfStorageVerification {
    try {
      const result = this.storageVerifier.verify(storageKey, expected);
      if (!result || typeof result.exists !== 'boolean')
        throw new Error('invalid storage verification result');
      return result;
    } catch {
      return { exists: false, byteLength: null, contentSha256: null };
    }
  }

  private storageMatches(
    result: LocalizedPdfStorageVerification,
    expected: LocalizedPdfStorageExpectation,
  ): boolean {
    return (
      result.exists === true &&
      result.byteLength === expected.byteLength &&
      result.contentSha256?.toLowerCase() === expected.contentSha256 &&
      result.magicValid === true &&
      (result.mediaType === undefined ||
        result.mediaType === null ||
        result.mediaType === 'application/pdf')
    );
  }

  completeVariant(variantId: string, input: LocalizedPdfCompletion): LocalizedPdfVariant {
    return this.transaction(() => {
      const row = this.row(variantId);
      if (row.status !== 'running') throw new ConflictError('Localized PDF variant is not running');
      if (input.attemptNumber !== row.current_attempt_number)
        throw new ConflictError('Localized PDF attempt is stale');
      const contentSha256 = assertHash(input.contentSha256, 'contentSha256');
      if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0)
        throw new ValidationError('byteLength must be a positive safe integer');
      const rendererVersion = assertSegment(input.rendererVersion, 'rendererVersion');
      const storage = input.storageKey ?? row.storage_key;
      const execution = this.boundExecution(row, input.execution);
      // The runner commits the B5 job/run success before invoking this finalizer.  Validate the
      // exact persisted envelope while the variant is still fenced/running, before any attempt
      // row or ready transition is written.
      this.assertDurableExecution(variantId, input.attemptNumber, execution, 'complete');
      const expected: LocalizedPdfStorageExpectation = {
        storageKey: row.storage_key,
        byteLength: input.byteLength,
        contentSha256,
        mediaType: 'application/pdf',
      };
      if (!isSafeStorageKey(storage) || storage !== row.storage_key)
        return this.failIntegrity(
          row,
          input,
          execution,
          contentSha256,
          input.byteLength,
          'storage_key_or_manifest_mismatch',
        );
      const verification = this.verifyStorage(row.storage_key, expected);
      if (!this.storageMatches(verification, expected))
        return this.failIntegrity(
          row,
          input,
          execution,
          verification.contentSha256,
          verification.byteLength,
          'storage_verification_failed',
        );
      this.insertAttempt(row, input, 'ready', undefined, execution);
      const timestamp = now();
      const changed = this.sqlite
        .prepare(
          `UPDATE localized_pdf_variant SET status='ready',media_type='application/pdf',byte_length=?,
             content_sha256=?,renderer_version=?,ready_at=?,finished_at=?,
             claimed_job_id=NULL,claimed_job_run_id=NULL,claimed_lease_fence=NULL,updated_at=?
           WHERE variant_id=? AND status='running' AND current_attempt_number=?
             AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
        )
        .run(
          input.byteLength,
          contentSha256,
          rendererVersion,
          timestamp,
          timestamp,
          timestamp,
          variantId,
          row.current_attempt_number,
          execution.jobId,
          execution.jobRunId,
          execution.leaseFence,
        );
      if (changed.changes !== 1) throw new ConflictError('Localized PDF completion fence was lost');
      return this.map(this.row(variantId));
    });
  }

  private failIntegrity(
    row: LocalizedPdfRow,
    input: LocalizedPdfCompletion,
    execution: LocalizedPdfExecution,
    observedHash: string | null,
    observedLength: number | null,
    incidentKind: string,
  ): LocalizedPdfVariant {
    // The incident subject guard requires the immutable attempt row to exist first.  Keep both
    // append-only records in the same transaction, but publish the attempt before its incident.
    this.insertAttempt(row, input, 'failed', 'ARTIFACT_INTEGRITY_FAILED', execution);
    this.insertIncident(
      row,
      incidentKind,
      input.contentSha256,
      observedHash,
      input.byteLength,
      observedLength,
      'localized-pdf-repository',
    );
    const timestamp = now();
    const changed = this.sqlite
      .prepare(
        `UPDATE localized_pdf_variant SET status='failed',error_code='ARTIFACT_INTEGRITY_FAILED',retryable=1,
           integrity_blocked=1,finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,
           claimed_lease_fence=NULL,updated_at=?
         WHERE variant_id=? AND status='running' AND current_attempt_number=?
           AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
      )
      .run(
        timestamp,
        timestamp,
        row.variant_id,
        row.current_attempt_number,
        execution.jobId,
        execution.jobRunId,
        execution.leaseFence,
      );
    if (changed.changes !== 1) throw new ConflictError('Localized PDF integrity fence was lost');
    return this.map(this.row(row.variant_id));
  }

  /**
   * A ready manifest is not trusted merely because it was once finalized.  If the object store
   * or its durable-run provenance no longer verifies, atomically quarantine the manifest and
   * append the incident in the same transaction.  The migration's transition guard explicitly
   * permits this integrity-blocked ready -> failed transition without rewriting the immutable
   * successful attempt row.
   */
  private blockReadyIntegrity(
    principal: Principal,
    row: LocalizedPdfRow,
    owner: DerivedOwner,
    observedHash: string | null,
    observedLength: number | null,
    incidentKind: string,
  ): null {
    this.insertIncident(
      row,
      incidentKind,
      row.content_sha256,
      observedHash,
      row.byte_length,
      observedLength,
      'localized-pdf-download',
    );
    const timestamp = now();
    const changed = this.sqlite
      .prepare(
        `UPDATE localized_pdf_variant
         SET status='failed',error_code='ARTIFACT_INTEGRITY_FAILED',retryable=1,
             integrity_blocked=1,finished_at=?,updated_at=?
         WHERE variant_id=? AND status='ready' AND current_attempt_number=?
           AND integrity_blocked=0`,
      )
      .run(timestamp, timestamp, row.variant_id, row.current_attempt_number);
    if (changed.changes !== 1) throw new ConflictError('Localized PDF integrity fence was lost');
    this.recordArtifactAccessAudit(principal, row, owner, 'integrity', incidentKind);
    return null;
  }

  private artifactAuditSubject(row: LocalizedPdfRow): {
    entityType: 'document' | 'invoice' | 'period_report' | 'accounting_pack';
    entityId: string;
  } {
    switch (row.owner_type) {
      case 'invoice':
        return { entityType: 'invoice', entityId: row.owner_id };
      case 'period_report_revision':
        return { entityType: 'period_report', entityId: row.owner_id };
      case 'accounting_pack_revision':
        return { entityType: 'accounting_pack', entityId: row.owner_id };
      // Daily and technical reports are report documents rather than the
      // generated variant itself.  The reviewed B5 registry has a document
      // subject for these operational artifacts; keep the owner id canonical.
      case 'daily_report':
      case 'technical_report':
        return { entityType: 'document', entityId: row.owner_id };
    }
  }

  private recordArtifactAccessAudit(
    principal: Principal,
    row: LocalizedPdfRow,
    owner: DerivedOwner,
    outcome: LocalizedPdfAccessOutcome,
    reason?: string,
  ): void {
    const subject = this.artifactAuditSubject(row);
    recordAuditEvent(
      this.sqlite,
      principal,
      'artifact.access',
      subject.entityType,
      subject.entityId,
      {
        artifactType: 'localized_pdf',
        variantId: row.variant_id,
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        ownerRevisionId: row.owner_revision_id,
        locale: row.locale,
        localeTag: row.locale_tag,
        tenantId: row.tenant_id,
        deploymentId: row.deployment_id,
        projectId: owner.projectId ?? undefined,
        actorUserId: principal.userId,
        status: row.status,
        outcome,
        ...(reason ? { reason } : {}),
      },
    );
  }

  private assertDownloadStepUp(principal: Principal): void {
    assertRecentStepUp(this.sqlite, principal, AccessDeniedError);
  }

  private assertOwnerStepUp(principal: Principal, owner: DerivedOwner): void {
    if (STEP_UP_OWNER_TYPES.includes(owner.ownerType)) this.assertDownloadStepUp(principal);
  }

  /** Validate the immutable attempt's exact B5 execution before allowing a download. */
  private assertReadyDurableExecution(row: LocalizedPdfRow): void {
    const attempt = this.sqlite
      .prepare(
        `SELECT job_id,job_run_id,lease_fence
         FROM localized_pdf_variant_attempt
         WHERE variant_id=? AND attempt_number=? AND outcome='ready'`,
      )
      .get(row.variant_id, row.current_attempt_number) as
      | { job_id: string | null; job_run_id: string | null; lease_fence: number | null }
      | undefined;
    if (
      !attempt ||
      attempt.job_id === null ||
      attempt.job_run_id === null ||
      attempt.lease_fence === null
    )
      throw new ConflictError('Localized PDF durable completion is missing');
    this.assertDurableExecution(
      row.variant_id,
      row.current_attempt_number,
      assertExecution({
        jobId: attempt.job_id,
        jobRunId: attempt.job_run_id,
        leaseFence: attempt.lease_fence,
      }),
      'complete',
    );
  }

  failVariant(variantId: string, input: LocalizedPdfFailure): LocalizedPdfVariant {
    return this.transaction(() => {
      const row = this.row(variantId);
      if (row.status !== 'running') throw new ConflictError('Localized PDF variant is not running');
      if (input.attemptNumber !== row.current_attempt_number)
        throw new ConflictError('Localized PDF attempt is stale');
      const execution = this.boundExecution(row, input.execution);
      this.assertDurableExecution(variantId, input.attemptNumber, execution, 'fail');
      const errorCode = assertSegment(input.errorCode, 'errorCode');
      this.insertAttempt(
        row,
        input,
        'failed',
        input.failureClass ? assertSegment(input.failureClass, 'failureClass') : errorCode,
        execution,
      );
      const timestamp = now();
      const changed = this.sqlite
        .prepare(
          `UPDATE localized_pdf_variant SET status='failed',error_code=?,retryable=?,integrity_blocked=0,
             finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,claimed_lease_fence=NULL,updated_at=?
           WHERE variant_id=? AND status='running' AND current_attempt_number=?
             AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
        )
        .run(
          errorCode,
          input.retryable === false ? 0 : 1,
          timestamp,
          timestamp,
          variantId,
          row.current_attempt_number,
          execution.jobId,
          execution.jobRunId,
          execution.leaseFence,
        );
      if (changed.changes !== 1) throw new ConflictError('Localized PDF failure fence was lost');
      return this.map(this.row(variantId));
    });
  }

  /**
   * Close claims whose B5 run has already reached a terminal state. The runner
   * owns lease expiry; this method only reconciles the artifact after that
   * transition (or after a successful run whose finalizer was interrupted), so
   * a slow but still-live worker cannot be failed by a wall-clock-only sweep.
   * A later retry obtains a new attempt and must be claimed with a new fence.
   */
  recoverAbandonedRunning(
    asOf: Date | string = new Date(),
    leaseTimeoutMs = 15 * 60 * 1000,
  ): readonly LocalizedPdfVariant[] {
    const reference = typeof asOf === 'string' ? new Date(asOf) : asOf;
    if (
      !Number.isFinite(reference.getTime()) ||
      !Number.isSafeInteger(leaseTimeoutMs) ||
      leaseTimeoutMs < 1
    )
      throw new ValidationError('Invalid localized PDF lease recovery window');
    const cutoff = new Date(reference.getTime() - leaseTimeoutMs).toISOString();
    return this.transaction(() => {
      const rows = this.sqlite
        .prepare(
          `SELECT v.*,r.state durable_run_state FROM localized_pdf_variant v
           JOIN job_run r ON r.id=v.claimed_job_run_id AND r.job_id=v.claimed_job_id
           WHERE v.status='running' AND v.started_at IS NOT NULL AND v.started_at<=?
             AND (
               (r.state='lease_expired' AND r.outcome='retry_scheduled' AND r.error_code='LEASE_LOST') OR
               (r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL)
             )
           ORDER BY v.started_at,v.variant_id`,
        )
        .all(cutoff) as Array<
        LocalizedPdfRow & { durable_run_state: 'lease_expired' | 'succeeded' }
      >;
      const recovered: LocalizedPdfVariant[] = [];
      for (const row of rows) {
        const execution = executionFromRow(row);
        const leaseExpired = row.durable_run_state === 'lease_expired';
        const failure: LocalizedPdfFailure = {
          attemptNumber: row.current_attempt_number,
          errorCode: leaseExpired ? 'LEASE_EXPIRED' : 'FINALIZATION_INTERRUPTED',
          retryable: true,
          failureClass: leaseExpired ? 'lease_expired' : 'finalization_interrupted',
          execution,
        };
        this.insertAttempt(
          row,
          failure,
          'failed',
          leaseExpired ? 'lease_expired' : 'finalization_interrupted',
          execution,
        );
        const finishedAt = now();
        const changed = this.sqlite
          .prepare(
            `UPDATE localized_pdf_variant
             SET status='failed',error_code=?,retryable=1,integrity_blocked=0,
                 finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,claimed_lease_fence=NULL,updated_at=?
             WHERE variant_id=? AND status='running' AND current_attempt_number=?
               AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
          )
          .run(
            leaseExpired ? 'LEASE_EXPIRED' : 'FINALIZATION_INTERRUPTED',
            finishedAt,
            finishedAt,
            row.variant_id,
            row.current_attempt_number,
            execution.jobId,
            execution.jobRunId,
            execution.leaseFence,
          );
        if (changed.changes !== 1)
          throw new ConflictError('Localized PDF lease recovery fence was lost');
        recovered.push(this.map(this.row(row.variant_id)));
      }
      return recovered;
    });
  }

  recoverAbandonedVariants(
    asOf: Date | string = new Date(),
    leaseTimeoutMs = 15 * 60 * 1000,
  ): readonly LocalizedPdfVariant[] {
    return this.recoverAbandonedRunning(asOf, leaseTimeoutMs);
  }

  resolveDownload(principal: Principal, variantId: string): LocalizedPdfDownload {
    const result = this.transaction((): LocalizedPdfDownloadResult => {
      const row = this.row(variantId);
      const owner = this.ownerForVariant(row);
      this.assertReadable(principal, owner);
      try {
        this.assertOwnerStepUp(principal, owner);
      } catch (error) {
        if (!(error instanceof AccessDeniedError)) throw error;
        this.recordArtifactAccessAudit(principal, row, owner, 'blocked', 'step_up_required');
        return { kind: 'blocked', error };
      }
      if (row.status !== 'ready') {
        this.recordArtifactAccessAudit(
          principal,
          row,
          owner,
          row.integrity_blocked === 1 ? 'integrity' : 'blocked',
          row.integrity_blocked === 1 ? 'integrity_blocked' : 'artifact_not_ready',
        );
        return null;
      }
      if (
        row.integrity_blocked === 1 ||
        !row.content_sha256 ||
        !row.byte_length ||
        row.media_type !== 'application/pdf' ||
        !row.renderer_version ||
        !isSafeStorageKey(row.storage_key) ||
        this.sqlite
          .prepare(
            'SELECT 1 FROM localized_pdf_integrity_incident WHERE variant_id=? AND attempt_number=? LIMIT 1',
          )
          .get(row.variant_id, row.current_attempt_number)
      ) {
        this.recordArtifactAccessAudit(principal, row, owner, 'integrity', 'integrity_blocked');
        return null;
      }
      try {
        this.assertReadyDurableExecution(row);
      } catch {
        return this.blockReadyIntegrity(
          principal,
          row,
          owner,
          null,
          null,
          'durable_completion_missing_or_stale',
        );
      }
      const expected: LocalizedPdfStorageExpectation = {
        storageKey: row.storage_key,
        byteLength: row.byte_length,
        contentSha256: row.content_sha256,
        mediaType: 'application/pdf',
      };
      const verification = this.verifyStorage(row.storage_key, expected);
      if (!this.storageMatches(verification, expected)) {
        return this.blockReadyIntegrity(
          principal,
          row,
          owner,
          verification.contentSha256,
          verification.byteLength,
          'storage_verification_failed',
        );
      }
      this.recordArtifactAccessAudit(principal, row, owner, 'authorized');
      return {
        variantId: row.variant_id,
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        locale: row.locale,
        localeTag: row.locale_tag,
        semanticFilename: row.semantic_filename,
        storageKey: row.storage_key,
        mediaType: 'application/pdf',
        byteLength: row.byte_length,
        contentSha256: row.content_sha256,
      };
    });
    if (typeof result === 'object' && result !== null && 'kind' in result) {
      throw result.error;
    }
    if (result === null) throw new ConflictError('ARTIFACT_INTEGRITY_FAILED');
    return result;
  }

  // Explicitly named aliases make the composition contract readable at route/job call sites.
  requestLocalizedPdf(
    principal: Principal,
    input: LocalizedPdfRequest,
    onPersist?: LocalizedPdfPersistedHook,
  ): LocalizedPdfVariant {
    return this.requestVariant(principal, input, onPersist);
  }
  listLocalizedPdfVariants(
    principal: Principal,
    selector?: LocalizedPdfOwnerSelector,
  ): readonly LocalizedPdfVariant[] {
    return this.listVariants(principal, selector);
  }
  retryLocalizedPdfVariant(
    principal: Principal,
    variantId: string,
    onPersist?: LocalizedPdfPersistedHook,
  ): LocalizedPdfVariant {
    return this.retryVariant(principal, variantId, onPersist);
  }
  claimLocalizedPdfVariant(
    variantId: string,
    execution: LocalizedPdfExecution,
    expectedAttemptNumber: number,
  ): LocalizedPdfClaim {
    return this.claimVariant(variantId, execution, expectedAttemptNumber);
  }
  completeLocalizedPdfVariant(
    variantId: string,
    input: LocalizedPdfCompletion,
  ): LocalizedPdfVariant {
    return this.completeVariant(variantId, input);
  }
  failLocalizedPdfVariant(variantId: string, input: LocalizedPdfFailure): LocalizedPdfVariant {
    return this.failVariant(variantId, input);
  }
  resolveLocalizedPdfDownload(principal: Principal, variantId: string): LocalizedPdfDownload {
    return this.resolveDownload(principal, variantId);
  }
}

export const LocalizedArtifactRepository = LocalizedPdfRepository;

export function requestLocalizedPdfVariant(
  sqlite: DatabaseSync,
  principal: Principal,
  input: LocalizedPdfRequest,
): LocalizedPdfVariant {
  return new LocalizedPdfRepository(sqlite).requestVariant(principal, input);
}

export function listLocalizedPdfVariants(
  sqlite: DatabaseSync,
  principal: Principal,
  selector?: LocalizedPdfOwnerSelector,
): readonly LocalizedPdfVariant[] {
  return new LocalizedPdfRepository(sqlite).listVariants(principal, selector);
}

export function retryLocalizedPdfVariant(
  sqlite: DatabaseSync,
  principal: Principal,
  variantId: string,
): LocalizedPdfVariant {
  return new LocalizedPdfRepository(sqlite).retryVariant(principal, variantId);
}

export function claimLocalizedPdfVariant(
  sqlite: DatabaseSync,
  variantId: string,
  execution: LocalizedPdfExecution,
  expectedAttemptNumber: number,
): LocalizedPdfClaim {
  return new LocalizedPdfRepository(sqlite).claimVariant(
    variantId,
    execution,
    expectedAttemptNumber,
  );
}

export function completeLocalizedPdfVariant(
  sqlite: DatabaseSync,
  variantId: string,
  input: LocalizedPdfCompletion,
): LocalizedPdfVariant {
  return new LocalizedPdfRepository(sqlite).completeVariant(variantId, input);
}

export function failLocalizedPdfVariant(
  sqlite: DatabaseSync,
  variantId: string,
  input: LocalizedPdfFailure,
): LocalizedPdfVariant {
  return new LocalizedPdfRepository(sqlite).failVariant(variantId, input);
}

export function resolveLocalizedPdfDownload(
  sqlite: DatabaseSync,
  principal: Principal,
  variantId: string,
): LocalizedPdfDownload {
  return new LocalizedPdfRepository(sqlite).resolveDownload(principal, variantId);
}
