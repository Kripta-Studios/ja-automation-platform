import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';

/** The durable worker-statement contract is enabled by the next additive migration. */
export const WORKER_STATEMENT_ARTIFACT_TABLE = 'worker_statement_artifact' as const;
export const WORKER_STATEMENT_ATTEMPT_TABLE = 'worker_statement_artifact_attempt' as const;
export const WORKER_STATEMENT_RETRY_TABLE = 'worker_statement_retry_decision' as const;
export const WORKER_STATEMENT_INTEGRITY_TABLE = 'worker_statement_integrity_incident' as const;
export const WORKER_STATEMENT_JOB_KIND = 'worker_statement_artifact_render' as const;
export const WORKER_STATEMENT_JOB_CAPABILITY = 'artifact.worker_statement.render' as const;

export const WORKER_STATEMENT_FORMATS = ['pdf', 'csv'] as const;
export type WorkerStatementFormat = (typeof WORKER_STATEMENT_FORMATS)[number];
export type WorkerStatementStatus = 'queued' | 'running' | 'ready' | 'failed';

export type WorkerStatementExecution = Readonly<{
  jobId: string;
  jobRunId: string;
  leaseFence: number;
}>;

export type WorkerStatementStorageExpectation = Readonly<{
  storageKey: string;
  byteLength: number;
  contentSha256: string;
  mediaType: 'application/pdf' | 'text/csv';
}>;

export type WorkerStatementStorageVerification = Readonly<{
  exists: boolean;
  byteLength: number | null;
  contentSha256: string | null;
  mediaType?: string | null;
  magicValid?: boolean;
}>;

export type WorkerStatementStorageVerifier = Readonly<{
  verify: (
    storageKey: string,
    expected?: WorkerStatementStorageExpectation,
  ) => WorkerStatementStorageVerification;
}>;

export type WorkerStatementArtifact = Readonly<{
  artifactId: string;
  workerId: string;
  tenantId: string;
  deploymentId: string;
  periodStart: string;
  periodEnd: string;
  format: WorkerStatementFormat;
  templateVersion: string;
  generationVersion: string;
  snapshotJson: string;
  snapshotHash: string;
  status: WorkerStatementStatus;
  currentAttemptNumber: number;
  semanticFilename: string;
  mediaType: 'application/pdf' | 'text/csv' | null;
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
  execution: WorkerStatementExecution | null;
  updatedAt: string;
}>;

export type WorkerStatementDownload = Readonly<{
  artifactId: string;
  format: WorkerStatementFormat;
  semanticFilename: string;
  storageKey: string;
  mediaType: 'application/pdf' | 'text/csv';
  byteLength: number;
  contentSha256: string;
}>;

export type WorkerStatementRequestInput = Readonly<{
  /** Snapshot is captured by the authenticated portal request; no database re-query occurs in jobs. */
  snapshot: unknown;
  periodStart: string;
  periodEnd: string;
  templateVersion: string;
  generationVersion: string;
  requestKey?: string;
  maxAttempts?: number;
}>;

export type WorkerStatementPersistedHook = (artifact: WorkerStatementArtifact) => void;

export type WorkerStatementClaim = Readonly<{
  artifact: WorkerStatementArtifact;
  attemptNumber: number;
  startedAt: string;
  execution: WorkerStatementExecution;
}>;

export type WorkerStatementCompletion = Readonly<{
  attemptNumber: number;
  contentSha256: string;
  byteLength: number;
  storageKey: string;
  rendererVersion: string;
  mediaType: 'application/pdf' | 'text/csv';
  execution: WorkerStatementExecution;
}>;

export type WorkerStatementFailure = Readonly<{
  attemptNumber: number;
  errorCode: string;
  retryable?: boolean;
  failureClass?: string;
  execution: WorkerStatementExecution;
}>;

type WorkerStatementRow = Readonly<{
  artifact_id: string;
  worker_id: string;
  tenant_id: string;
  deployment_id: string;
  period_start: string;
  period_end: string;
  format: WorkerStatementFormat;
  template_version: string;
  generation_version: string;
  snapshot_json: string;
  snapshot_hash: string;
  status: WorkerStatementStatus;
  current_attempt_number: number;
  semantic_filename: string;
  media_type: 'application/pdf' | 'text/csv' | null;
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

const B5_AUDIT_CONTRACT_VERSION = 'B5-R4';

function now(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('Worker statement snapshot is invalid');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  throw new ValidationError('Worker statement snapshot is invalid');
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function segment(value: string, field: string, maximum = 120): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (
    !normalized ||
    normalized.length > maximum ||
    normalized !== value ||
    normalized.includes('..') ||
    /[\\/\0\r\n]/u.test(normalized)
  )
    throw new ValidationError(`${field} is invalid`);
  return normalized;
}

function hash(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) throw new ValidationError(`${field} must be SHA-256`);
  return normalized;
}

function observedHash(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
}

function observedLength(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeKey(value: string): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (
    !key ||
    key.length > 255 ||
    key !== value ||
    key.startsWith('/') ||
    key.includes('\\') ||
    /[\0\r\n]/u.test(key) ||
    key.includes('://') ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new ValidationError('storageKey is invalid');
  return key;
}

function safeFilename(value: string, format: WorkerStatementFormat): string {
  const filename = segment(value, 'semanticFilename', 240);
  if (!filename.toLowerCase().endsWith(`.${format}`) || filename.includes('/'))
    throw new ValidationError('semanticFilename is invalid');
  return filename;
}

function safeFormat(value: unknown): WorkerStatementFormat {
  if (value !== 'pdf' && value !== 'csv')
    throw new ValidationError('Worker statement format is invalid');
  return value;
}

function safeSnapshot(
  value: unknown,
  workerId: string,
  periodStart: string,
  periodEnd: string,
): {
  json: string;
  hash: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ValidationError('Worker statement snapshot is invalid');
  const snapshot = value as Record<string, unknown>;
  const worker = snapshot.worker;
  if (!worker || typeof worker !== 'object' || Array.isArray(worker))
    throw new ValidationError('Worker statement snapshot is invalid');
  const snapshotWorker = worker as Record<string, unknown>;
  if (snapshotWorker.id !== workerId || typeof snapshotWorker.name !== 'string')
    throw new AccessDeniedError('Worker statement snapshot owner mismatch');
  if (snapshot.periodStart !== periodStart || snapshot.periodEnd !== periodEnd)
    throw new ValidationError('Worker statement snapshot period mismatch');
  const forbidden =
    /(?:client.?rate|internal.?cost|contribution|margin|other.?worker|loaded.?cost)/iu;
  const inspect = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') return;
    if (Array.isArray(entry)) {
      entry.forEach(inspect);
      return;
    }
    for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
      if (forbidden.test(key)) throw new AccessDeniedError('Worker statement snapshot is not safe');
      inspect(child);
    }
  };
  inspect(snapshot);
  const json = canonicalJson(value);
  return { json, hash: sha256(json) };
}

function execution(value: WorkerStatementExecution): WorkerStatementExecution {
  if (!value || typeof value.jobId !== 'string' || typeof value.jobRunId !== 'string')
    throw new ValidationError('Worker statement durable execution is required');
  const jobId = segment(value.jobId, 'jobId');
  const jobRunId = segment(value.jobRunId, 'jobRunId');
  if (!Number.isSafeInteger(value.leaseFence) || value.leaseFence < 1)
    throw new ValidationError('leaseFence is invalid');
  return { jobId, jobRunId, leaseFence: value.leaseFence };
}

function executionFromRow(row: WorkerStatementRow): WorkerStatementExecution {
  if (
    row.claimed_job_id === null ||
    row.claimed_job_run_id === null ||
    row.claimed_lease_fence === null
  )
    throw new ConflictError('Worker statement execution binding is missing');
  return {
    jobId: row.claimed_job_id,
    jobRunId: row.claimed_job_run_id,
    leaseFence: row.claimed_lease_fence,
  };
}

function sameExecution(left: WorkerStatementExecution, right: WorkerStatementExecution): boolean {
  return (
    left.jobId === right.jobId &&
    left.jobRunId === right.jobRunId &&
    left.leaseFence === right.leaseFence
  );
}

function sameCapabilities(value: unknown, capability: string): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string') &&
    value.includes(capability)
  );
}

function safeWorkerId(value: string): string {
  return segment(value, 'workerId');
}

function safeRequestKey(value: string | undefined, format: WorkerStatementFormat): string | null {
  if (value === undefined) return null;
  if (!value || value.trim() !== value) throw new ValidationError('requestKey is invalid');
  const key = segment(`${value}:${format}`, 'requestKey', 240);
  return key;
}

function safeGeneration(value: string): string {
  return segment(value, 'generationVersion');
}

function safeTemplate(value: string): string {
  return segment(value, 'templateVersion');
}

function safeAttempts(value: number | undefined): number {
  const attempts = value ?? 5;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5)
    throw new ValidationError('maxAttempts must be between 1 and 5');
  return attempts;
}

function filenameWorkerSegment(snapshot: Record<string, unknown>): string {
  const worker = snapshot.worker as Record<string, unknown>;
  const name = String(worker.name ?? 'worker')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
  return name || 'worker';
}

function artifactFilename(
  snapshot: Record<string, unknown>,
  periodStart: string,
  periodEnd: string,
  format: WorkerStatementFormat,
): string {
  return safeFilename(
    `ja-worker-statement-${filenameWorkerSegment(snapshot)}-${periodStart}-${periodEnd}.${format}`,
    format,
  );
}

function artifactStorageKey(
  workerId: string,
  periodStart: string,
  periodEnd: string,
  generationVersion: string,
  artifactId: string,
  format: WorkerStatementFormat,
): string {
  const clean = (value: string): string =>
    value.replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'worker';
  return safeKey(
    `worker-statements/${clean(workerId)}/${periodStart}-${periodEnd}/${clean(generationVersion)}/${artifactId}.${format}`,
  );
}

export class WorkerStatementRepository {
  private readonly sqlite: DatabaseSync;
  private readonly storageVerifier: WorkerStatementStorageVerifier;

  constructor(sqlite: DatabaseSync, storageVerifier?: WorkerStatementStorageVerifier) {
    this.sqlite = sqlite;
    this.storageVerifier =
      storageVerifier ??
      ({
        verify: () => ({ exists: false, byteLength: null, contentSha256: null }),
      } satisfies WorkerStatementStorageVerifier);
  }

  private transaction<T>(work: () => T): T {
    return runImmediateTransaction(this.sqlite, 'worker-statement', work);
  }

  private deployment(): { tenantId: string; deploymentId: string } {
    const row = this.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!row) throw new ValidationError('Deployment identity is required');
    return { tenantId: row.tenant_id, deploymentId: row.deployment_id };
  }

  private assertHumanWorker(principal: Principal): void {
    if (principal.role !== 'worker') throw new AccessDeniedError('Worker role required');
    const user = this.sqlite.prepare('SELECT status FROM user WHERE id=?').get(principal.userId) as
      | { status: string }
      | undefined;
    if (!user || user.status !== 'active') throw new AccessDeniedError('Active account required');
  }

  private row(artifactId: string): WorkerStatementRow {
    const identity = this.deployment();
    const row = this.sqlite
      .prepare(
        `SELECT * FROM worker_statement_artifact
         WHERE artifact_id=? AND tenant_id=? AND deployment_id=?`,
      )
      .get(artifactId, identity.tenantId, identity.deploymentId) as WorkerStatementRow | undefined;
    if (!row) throw new AccessDeniedError('Worker statement artifact not found');
    return row;
  }

  private assertReadable(principal: Principal, row: WorkerStatementRow): void {
    this.assertHumanWorker(principal);
    if (row.worker_id !== principal.userId)
      throw new AccessDeniedError('Worker statement access denied');
  }

  /**
   * Bind completion/failure to the exact execution that claimed this artifact.
   *
   * The durable job payload is checked separately, but a valid payload for the
   * same artifact/attempt is not sufficient: an old or unrelated run must not
   * be able to finalize the claim held by another run.
   */
  private boundExecution(
    row: WorkerStatementRow,
    requested: WorkerStatementExecution,
  ): WorkerStatementExecution {
    const claimed = executionFromRow(row);
    const binding = execution(requested);
    if (!sameExecution(claimed, binding))
      throw new ConflictError('Worker statement execution fence is stale');
    return binding;
  }

  private map(row: WorkerStatementRow): WorkerStatementArtifact {
    safeFormat(row.format);
    return {
      artifactId: row.artifact_id,
      workerId: row.worker_id,
      tenantId: row.tenant_id,
      deploymentId: row.deployment_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      format: row.format,
      templateVersion: row.template_version,
      generationVersion: row.generation_version,
      snapshotJson: row.snapshot_json,
      snapshotHash: row.snapshot_hash,
      status: row.status,
      currentAttemptNumber: row.current_attempt_number,
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

  private assertDurableExecution(
    artifactId: string,
    expectedAttemptNumber: number,
    requested: WorkerStatementExecution,
    phase: 'running' | 'succeeded' = 'running',
  ): void {
    const binding = execution(requested);
    const identity = this.deployment();
    // Completion is finalized while the exact durable run is still fenced and running. The
    // runner commits ordinary ready completion atomically with durable success; an integrity
    // quarantine is committed first and the durable run is then failed/retried separately.
    const expectedRunState = phase;
    const expectedJobState = phase === 'running' ? 'claimed' : 'succeeded';
    const row = this.sqlite
      .prepare(
        `SELECT j.id,j.kind,j.contract_version job_contract,j.payload_json,j.payload_sha256,
                j.tenant_id,j.deployment_id,j.required_capability,j.state job_state,
                j.active_job_run_id,j.fence_version,j.lease_until job_lease_until,
                r.id job_run_id,r.contract_version run_contract,r.kind run_kind,r.state run_state,
                r.outcome run_outcome,r.finished_at run_finished_at,
                r.tenant_id run_tenant_id,r.deployment_id run_deployment_id,
                r.required_capability run_capability,r.payload_sha256 run_payload_sha256,
                r.service_actor_id,r.service_actor_version,r.service_actor_capabilities_json,
                r.configured_binding_version,r.fence_version run_fence,r.lease_until run_lease_until,
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
      .get(binding.jobRunId, binding.jobId) as
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
          job_lease_until: string | null;
          job_run_id: string;
          run_contract: string | null;
          run_kind: string | null;
          run_state: string | null;
          run_outcome: string | null;
          run_finished_at: string | null;
          run_tenant_id: string | null;
          run_deployment_id: string | null;
          run_capability: string | null;
          run_payload_sha256: string | null;
          service_actor_id: string | null;
          service_actor_version: number | null;
          service_actor_capabilities_json: string | null;
          configured_binding_version: number | null;
          run_fence: number | null;
          run_lease_until: string | null;
          actor_status: string;
          actor_version: number;
          actor_capabilities: string;
          binding_actor_id: string;
          binding_tenant_id: string;
          binding_deployment_id: string;
          binding_version: number;
        }
      | undefined;
    if (!row) throw new ConflictError('Worker statement durable execution is missing');
    if (
      row.job_contract !== 'b5-v1' ||
      row.run_contract !== 'b5-v1' ||
      row.kind !== WORKER_STATEMENT_JOB_KIND ||
      row.run_kind !== row.kind ||
      row.required_capability !== WORKER_STATEMENT_JOB_CAPABILITY ||
      row.run_capability !== WORKER_STATEMENT_JOB_CAPABILITY ||
      row.run_payload_sha256 !== row.payload_sha256 ||
      row.job_state !== expectedJobState ||
      row.run_state !== expectedRunState ||
      row.active_job_run_id !== binding.jobRunId ||
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
      row.run_fence !== binding.leaseFence ||
      row.fence_version !== binding.leaseFence ||
      row.run_lease_until === null ||
      (phase === 'running' &&
        (row.job_lease_until === null ||
          row.job_lease_until !== row.run_lease_until ||
          row.job_lease_until <= now())) ||
      (phase === 'succeeded' &&
        (row.job_lease_until !== null ||
          row.run_outcome !== 'succeeded' ||
          row.run_finished_at === null))
    )
      throw new ConflictError('Worker statement durable execution is stale or forged');
    let capabilities: unknown;
    try {
      capabilities = JSON.parse(row.actor_capabilities);
    } catch {
      throw new ConflictError('Worker statement service actor capability record is invalid');
    }
    if (!sameCapabilities(capabilities, WORKER_STATEMENT_JOB_CAPABILITY))
      throw new ConflictError('Worker statement service actor capability is unavailable');
    if (row.actor_capabilities !== row.service_actor_capabilities_json)
      throw new ConflictError('Worker statement service actor binding changed');
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      throw new ConflictError('Worker statement durable payload is invalid');
    }
    if (
      row.payload_sha256 === null ||
      sha256(canonicalJson(payload)) !== row.payload_sha256 ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).artifactId !== artifactId ||
      (payload as Record<string, unknown>).requestedAttempt !== expectedAttemptNumber
    )
      throw new ConflictError('Worker statement durable payload is stale or forged');
  }

  private assertStoredSnapshot(row: WorkerStatementRow): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.snapshot_json);
    } catch {
      throw new ConflictError('Worker statement snapshot is invalid');
    }
    const json = canonicalJson(parsed);
    if (sha256(json) !== row.snapshot_hash)
      throw new ConflictError('Worker statement snapshot hash mismatch');
    safeSnapshot(parsed, row.worker_id, row.period_start, row.period_end);
  }

  private insertAttempt(
    row: WorkerStatementRow,
    outcome: 'ready' | 'failed',
    input: WorkerStatementCompletion | WorkerStatementFailure,
    failureClass?: string,
  ): void {
    const binding = executionFromRow(row);
    const timestamp = now();
    this.sqlite
      .prepare(
        `INSERT INTO worker_statement_artifact_attempt(
           attempt_id,artifact_id,attempt_number,job_id,job_run_id,lease_fence,
           started_at,finished_at,outcome,failure_class,retryable,created_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId(),
        row.artifact_id,
        row.current_attempt_number,
        binding.jobId,
        binding.jobRunId,
        binding.leaseFence,
        row.started_at ?? timestamp,
        timestamp,
        outcome,
        failureClass ?? (outcome === 'failed' ? (input as WorkerStatementFailure).errorCode : null),
        outcome === 'failed'
          ? (input as WorkerStatementFailure).retryable === false
            ? 0
            : 1
          : null,
        timestamp,
      );
  }

  private recordAccessAudit(
    principal: Principal,
    row: WorkerStatementRow,
    outcome: 'authorized' | 'blocked' | 'integrity',
    extra?: Readonly<Record<string, unknown>>,
  ): void {
    recordAuditEvent(this.sqlite, principal, 'artifact.access', 'document', row.artifact_id, {
      artifactType: 'worker_statement',
      artifactId: row.artifact_id,
      workerId: row.worker_id,
      format: row.format,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      outcome,
      ...extra,
      auditContractVersion: B5_AUDIT_CONTRACT_VERSION,
    });
  }

  requestArtifacts(
    principal: Principal,
    input: WorkerStatementRequestInput,
    onPersist?: WorkerStatementPersistedHook,
  ): readonly WorkerStatementArtifact[] {
    this.assertHumanWorker(principal);
    const workerId = safeWorkerId(principal.userId);
    if (
      !isIsoDate(input.periodStart) ||
      !isIsoDate(input.periodEnd) ||
      input.periodStart > input.periodEnd
    )
      throw new ValidationError('Worker statement period is invalid');
    const templateVersion = safeTemplate(input.templateVersion);
    const generationVersion = safeGeneration(input.generationVersion);
    const maxAttempts = safeAttempts(input.maxAttempts);
    const snapshot = safeSnapshot(input.snapshot, workerId, input.periodStart, input.periodEnd);
    const parsed = JSON.parse(snapshot.json) as Record<string, unknown>;
    return this.transaction(() => {
      const identity = this.deployment();
      const artifacts: WorkerStatementArtifact[] = [];
      for (const format of WORKER_STATEMENT_FORMATS) {
        const formatRequestKey = safeRequestKey(input.requestKey, format);
        let row = formatRequestKey
          ? (this.sqlite
              .prepare(
                `SELECT * FROM worker_statement_artifact
                 WHERE tenant_id=? AND deployment_id=? AND request_key=?`,
              )
              .get(identity.tenantId, identity.deploymentId, formatRequestKey) as
              | WorkerStatementRow
              | undefined)
          : undefined;
        if (row) {
          if (
            row.worker_id !== workerId ||
            row.period_start !== input.periodStart ||
            row.period_end !== input.periodEnd ||
            row.format !== format ||
            row.template_version !== templateVersion ||
            row.generation_version !== generationVersion ||
            row.snapshot_hash !== snapshot.hash
          )
            throw new ConflictError('IDEMPOTENCY_CONFLICT');
        }
        if (!row)
          row = this.sqlite
            .prepare(
              `SELECT * FROM worker_statement_artifact
               WHERE tenant_id=? AND deployment_id=? AND worker_id=?
                 AND period_start=? AND period_end=? AND format=?
                 AND template_version=? AND generation_version=? AND snapshot_hash=?
               ORDER BY requested_at DESC LIMIT 1`,
            )
            .get(
              identity.tenantId,
              identity.deploymentId,
              workerId,
              input.periodStart,
              input.periodEnd,
              format,
              templateVersion,
              generationVersion,
              snapshot.hash,
            ) as WorkerStatementRow | undefined;
        if (!row) {
          const artifactId = newId();
          const timestamp = now();
          const semantic = artifactFilename(parsed, input.periodStart, input.periodEnd, format);
          const storageKey = artifactStorageKey(
            workerId,
            input.periodStart,
            input.periodEnd,
            generationVersion,
            artifactId,
            format,
          );
          this.sqlite
            .prepare(
              `INSERT INTO worker_statement_artifact(
                 artifact_id,worker_id,tenant_id,deployment_id,period_start,period_end,format,
                 template_version,generation_version,snapshot_json,snapshot_hash,status,
                 current_attempt_number,semantic_filename,storage_key,max_attempts,request_key,
                 requested_by,requested_at,updated_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'queued',1,?,?,?,?,?,?,?)`,
            )
            .run(
              artifactId,
              workerId,
              identity.tenantId,
              identity.deploymentId,
              input.periodStart,
              input.periodEnd,
              format,
              templateVersion,
              generationVersion,
              snapshot.json,
              snapshot.hash,
              semantic,
              storageKey,
              maxAttempts,
              formatRequestKey,
              workerId,
              timestamp,
              timestamp,
            );
          row = this.row(artifactId);
        }
        const artifact = this.map(row);
        onPersist?.(artifact);
        artifacts.push(artifact);
      }
      return artifacts;
    });
  }

  requestArtifact(
    principal: Principal,
    format: WorkerStatementFormat,
    input: WorkerStatementRequestInput,
    onPersist?: WorkerStatementPersistedHook,
  ): WorkerStatementArtifact {
    const requested = this.requestArtifacts(principal, input, onPersist);
    const artifact = requested.find((entry) => entry.format === safeFormat(format));
    if (!artifact) throw new ConflictError('Worker statement artifact was not created');
    return artifact;
  }

  listArtifacts(
    principal: Principal,
    period?: Readonly<{ periodStart?: string; periodEnd?: string }>,
  ): readonly WorkerStatementArtifact[] {
    this.assertHumanWorker(principal);
    const identity = this.deployment();
    const conditions = ['tenant_id=?', 'deployment_id=?', 'worker_id=?'];
    const values: Array<string> = [identity.tenantId, identity.deploymentId, principal.userId];
    if (period?.periodStart !== undefined) {
      if (!isIsoDate(period.periodStart)) throw new ValidationError('periodStart is invalid');
      conditions.push('period_start=?');
      values.push(period.periodStart);
    }
    if (period?.periodEnd !== undefined) {
      if (!isIsoDate(period.periodEnd)) throw new ValidationError('periodEnd is invalid');
      conditions.push('period_end=?');
      values.push(period.periodEnd);
    }
    if (
      period?.periodStart !== undefined &&
      period?.periodEnd !== undefined &&
      period.periodStart > period.periodEnd
    )
      throw new ValidationError('Worker statement period is invalid');
    return (
      this.sqlite
        .prepare(
          `SELECT * FROM worker_statement_artifact WHERE ${conditions.join(' AND ')}
         ORDER BY period_start DESC,period_end DESC,requested_at DESC,format`,
        )
        .all(...values) as WorkerStatementRow[]
    ).map((row) => this.map(row));
  }

  getArtifact(principal: Principal, artifactId: string): WorkerStatementArtifact {
    const row = this.row(segment(artifactId, 'artifactId'));
    this.assertReadable(principal, row);
    return this.map(row);
  }

  retryArtifact(
    principal: Principal,
    artifactId: string,
    onPersist?: WorkerStatementPersistedHook,
  ): WorkerStatementArtifact {
    this.assertHumanWorker(principal);
    return this.transaction(() => {
      const row = this.row(segment(artifactId, 'artifactId'));
      this.assertReadable(principal, row);
      if (row.status !== 'failed')
        throw new ConflictError('Only failed worker statements can be retried');
      if (row.retryable !== 1) throw new ConflictError('Worker statement failure is not retryable');
      if (row.current_attempt_number >= row.max_attempts)
        throw new ConflictError('Worker statement retry limit reached');
      const nextAttempt = row.current_attempt_number + 1;
      const timestamp = now();
      const decisionHash = sha256(
        [
          row.artifact_id,
          row.current_attempt_number,
          nextAttempt,
          row.error_code ?? '',
          principal.userId,
        ].join('|'),
      );
      this.sqlite
        .prepare(
          `INSERT INTO worker_statement_retry_decision(
             decision_id,artifact_id,prior_attempt_number,next_attempt_number,
             failure_code,failure_class,retryable,requested_by,requested_at,decision_hash
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          newId(),
          row.artifact_id,
          row.current_attempt_number,
          nextAttempt,
          row.error_code ?? 'UNKNOWN_FAILURE',
          row.error_code ?? 'UNKNOWN_FAILURE',
          1,
          principal.userId,
          timestamp,
          decisionHash,
        );
      const changed = this.sqlite
        .prepare(
          `UPDATE worker_statement_artifact
           SET status='queued',current_attempt_number=current_attempt_number+1,
               media_type=NULL,byte_length=NULL,content_sha256=NULL,renderer_version=NULL,
               ready_at=NULL,error_code=NULL,retryable=NULL,integrity_blocked=0,
               started_at=NULL,finished_at=NULL,claimed_job_id=NULL,claimed_job_run_id=NULL,
               claimed_lease_fence=NULL,updated_at=?
           WHERE artifact_id=? AND status='failed' AND current_attempt_number=?`,
        )
        .run(timestamp, row.artifact_id, row.current_attempt_number);
      if (Number(changed.changes) !== 1) throw new ConflictError('Worker statement retry was lost');
      const artifact = this.map(this.row(row.artifact_id));
      onPersist?.(artifact);
      return artifact;
    });
  }

  claimWorkerStatementArtifact(
    artifactId: string,
    requestedExecution: WorkerStatementExecution,
    expectedAttemptNumber: number,
  ): WorkerStatementClaim {
    return this.transaction(() => {
      const row = this.row(segment(artifactId, 'artifactId'));
      if (row.status !== 'queued')
        throw new ConflictError('Worker statement artifact is not queued');
      if (row.current_attempt_number !== expectedAttemptNumber)
        throw new ConflictError('Worker statement attempt is stale');
      const binding = execution(requestedExecution);
      this.assertStoredSnapshot(row);
      this.assertDurableExecution(row.artifact_id, expectedAttemptNumber, binding);
      const timestamp = now();
      const changed = this.sqlite
        .prepare(
          `UPDATE worker_statement_artifact
           SET status='running',started_at=?,claimed_job_id=?,claimed_job_run_id=?,
               claimed_lease_fence=?,updated_at=?
           WHERE artifact_id=? AND status='queued' AND current_attempt_number=?`,
        )
        .run(
          timestamp,
          binding.jobId,
          binding.jobRunId,
          binding.leaseFence,
          timestamp,
          row.artifact_id,
          expectedAttemptNumber,
        );
      if (Number(changed.changes) !== 1) throw new ConflictError('Worker statement claim was lost');
      return {
        artifact: this.map(this.row(row.artifact_id)),
        attemptNumber: expectedAttemptNumber,
        startedAt: timestamp,
        execution: binding,
      };
    });
  }

  completeWorkerStatementArtifact(
    artifactId: string,
    input: WorkerStatementCompletion,
  ): WorkerStatementArtifact {
    return this.transaction(() => {
      const row = this.row(segment(artifactId, 'artifactId'));
      if (row.status !== 'running')
        throw new ConflictError('Worker statement artifact is not running');
      if (row.current_attempt_number !== input.attemptNumber)
        throw new ConflictError('Worker statement attempt is stale');
      const binding = this.boundExecution(row, input.execution);
      const contentSha256 = hash(input.contentSha256, 'contentSha256');
      if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0)
        throw new ValidationError('byteLength must be a positive safe integer');
      const storageKey = safeKey(input.storageKey);
      if (storageKey !== row.storage_key)
        throw new ConflictError('Worker statement storage key changed');
      const expectedMediaType = row.format === 'pdf' ? 'application/pdf' : 'text/csv';
      if (input.mediaType !== expectedMediaType)
        throw new ValidationError('Worker statement media type is invalid');
      this.assertDurableExecution(row.artifact_id, input.attemptNumber, binding, 'succeeded');
      this.assertStoredSnapshot(row);
      const verification = this.verifyStorage(storageKey, {
        storageKey,
        byteLength: input.byteLength,
        contentSha256,
        mediaType: expectedMediaType,
      });
      if (!this.storageMatches(verification, expectedMediaType, input.byteLength, contentSha256)) {
        // Integrity quarantine is a committed terminal transition for this attempt. Returning
        // the failed projection lets the surrounding job runner observe the truthful state after
        // COMMIT; throwing here would roll back the incident and leave the row stuck in running.
        return this.failIntegrity(row, binding, input, verification);
      }
      this.insertAttempt(row, 'ready', input);
      const timestamp = now();
      const changed = this.sqlite
        .prepare(
          `UPDATE worker_statement_artifact
           SET status='ready',media_type=?,byte_length=?,content_sha256=?,renderer_version=?,
               ready_at=?,finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,
               claimed_lease_fence=NULL,updated_at=?
           WHERE artifact_id=? AND status='running' AND current_attempt_number=?
             AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
        )
        .run(
          expectedMediaType,
          input.byteLength,
          contentSha256,
          segment(input.rendererVersion, 'rendererVersion'),
          timestamp,
          timestamp,
          timestamp,
          row.artifact_id,
          row.current_attempt_number,
          binding.jobId,
          binding.jobRunId,
          binding.leaseFence,
        );
      if (Number(changed.changes) !== 1)
        throw new ConflictError('Worker statement completion fence was lost');
      return this.map(this.row(row.artifact_id));
    });
  }

  prepareWorkerStatementArtifactCompletion(
    artifactId: string,
    input: WorkerStatementCompletion,
  ): WorkerStatementArtifact {
    return this.transaction(() => {
      const row = this.row(segment(artifactId, 'artifactId'));
      if (row.status !== 'running')
        throw new ConflictError('Worker statement artifact is not running');
      if (row.current_attempt_number !== input.attemptNumber)
        throw new ConflictError('Worker statement attempt is stale');
      const binding = this.boundExecution(row, input.execution);
      const contentSha256 = hash(input.contentSha256, 'contentSha256');
      if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0)
        throw new ValidationError('byteLength must be a positive safe integer');
      const storageKey = safeKey(input.storageKey);
      if (storageKey !== row.storage_key)
        throw new ConflictError('Worker statement storage key changed');
      const expectedMediaType = row.format === 'pdf' ? 'application/pdf' : 'text/csv';
      if (input.mediaType !== expectedMediaType)
        throw new ValidationError('Worker statement media type is invalid');
      this.assertDurableExecution(row.artifact_id, input.attemptNumber, binding);
      this.assertStoredSnapshot(row);
      const verification = this.verifyStorage(storageKey, {
        storageKey,
        byteLength: input.byteLength,
        contentSha256,
        mediaType: expectedMediaType,
      });
      if (!this.storageMatches(verification, expectedMediaType, input.byteLength, contentSha256))
        return this.failIntegrity(row, binding, input, verification);
      return this.map(row);
    });
  }

  failWorkerStatementArtifact(
    artifactId: string,
    input: WorkerStatementFailure,
  ): WorkerStatementArtifact {
    return this.transaction(() => {
      const row = this.row(segment(artifactId, 'artifactId'));
      if (row.status !== 'running')
        throw new ConflictError('Worker statement artifact is not running');
      if (row.current_attempt_number !== input.attemptNumber)
        throw new ConflictError('Worker statement attempt is stale');
      const binding = this.boundExecution(row, input.execution);
      this.assertDurableExecution(row.artifact_id, input.attemptNumber, binding);
      const errorCode = segment(input.errorCode, 'errorCode');
      this.insertAttempt(
        row,
        'failed',
        input,
        input.failureClass ? segment(input.failureClass, 'failureClass') : errorCode,
      );
      const timestamp = now();
      const changed = this.sqlite
        .prepare(
          `UPDATE worker_statement_artifact
           SET status='failed',error_code=?,retryable=?,integrity_blocked=0,finished_at=?,
               claimed_job_id=NULL,claimed_job_run_id=NULL,claimed_lease_fence=NULL,updated_at=?
           WHERE artifact_id=? AND status='running' AND current_attempt_number=?
             AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
        )
        .run(
          errorCode,
          input.retryable === false ? 0 : 1,
          timestamp,
          timestamp,
          row.artifact_id,
          row.current_attempt_number,
          binding.jobId,
          binding.jobRunId,
          binding.leaseFence,
        );
      if (Number(changed.changes) !== 1)
        throw new ConflictError('Worker statement failure fence was lost');
      return this.map(this.row(row.artifact_id));
    });
  }

  /**
   * Reconcile manifests whose bound durable run is already terminal. Lease expiry is owned by
   * the B5 runner; this sweep never fails a live claim from elapsed wall time alone. Successful
   * runs are included because the process can stop after durable success but before its manifest
   * finalizer commits. The original execution tuple remains the transition fence in both cases.
   */
  recoverAbandonedRunning(
    asOf: Date | string = new Date(),
    leaseTimeoutMs = 15 * 60 * 1000,
  ): readonly WorkerStatementArtifact[] {
    const reference = typeof asOf === 'string' ? new Date(asOf) : asOf;
    if (
      !Number.isFinite(reference.getTime()) ||
      !Number.isSafeInteger(leaseTimeoutMs) ||
      leaseTimeoutMs < 1
    )
      throw new ValidationError('Invalid worker statement lease recovery window');
    const cutoff = new Date(reference.getTime() - leaseTimeoutMs).toISOString();
    const identity = this.deployment();
    return this.transaction(() => {
      const rows = this.sqlite
        .prepare(
          `SELECT a.*,r.state durable_run_state
           FROM worker_statement_artifact a
           JOIN job_run r ON r.id=a.claimed_job_run_id AND r.job_id=a.claimed_job_id
           WHERE a.tenant_id=? AND a.deployment_id=? AND a.status='running'
             AND a.started_at IS NOT NULL AND a.started_at<=?
             AND (
               (r.state='lease_expired' AND r.outcome='retry_scheduled' AND r.error_code='LEASE_LOST') OR
               (r.state='succeeded' AND r.outcome='succeeded' AND r.finished_at IS NOT NULL)
             )
           ORDER BY a.started_at,a.artifact_id`,
        )
        .all(identity.tenantId, identity.deploymentId, cutoff) as Array<
        WorkerStatementRow & { durable_run_state: 'lease_expired' | 'succeeded' }
      >;
      const recovered: WorkerStatementArtifact[] = [];
      for (const row of rows) {
        const binding = executionFromRow(row);
        const leaseExpired = row.durable_run_state === 'lease_expired';
        const failure: WorkerStatementFailure = {
          attemptNumber: row.current_attempt_number,
          errorCode: leaseExpired ? 'LEASE_EXPIRED' : 'FINALIZATION_INTERRUPTED',
          retryable: true,
          failureClass: leaseExpired ? 'lease_expired' : 'finalization_interrupted',
          execution: binding,
        };
        this.insertAttempt(
          row,
          'failed',
          failure,
          leaseExpired ? 'lease_expired' : 'finalization_interrupted',
        );
        const finishedAt = now();
        const changed = this.sqlite
          .prepare(
            `UPDATE worker_statement_artifact
             SET status='failed',error_code=?,retryable=1,integrity_blocked=0,
                 finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,
                 claimed_lease_fence=NULL,updated_at=?
             WHERE artifact_id=? AND status='running' AND current_attempt_number=?
               AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
          )
          .run(
            failure.errorCode,
            finishedAt,
            finishedAt,
            row.artifact_id,
            row.current_attempt_number,
            binding.jobId,
            binding.jobRunId,
            binding.leaseFence,
          );
        if (Number(changed.changes) !== 1)
          throw new ConflictError('Worker statement lease recovery fence was lost');
        recovered.push(this.map(this.row(row.artifact_id)));
      }
      return recovered;
    });
  }

  recoverAbandonedArtifacts(
    asOf: Date | string = new Date(),
    leaseTimeoutMs = 15 * 60 * 1000,
  ): readonly WorkerStatementArtifact[] {
    return this.recoverAbandonedRunning(asOf, leaseTimeoutMs);
  }

  private verifyStorage(
    storageKey: string,
    expected: WorkerStatementStorageExpectation,
  ): WorkerStatementStorageVerification {
    try {
      const result = this.storageVerifier.verify(storageKey, expected);
      if (!result || typeof result.exists !== 'boolean')
        throw new Error('invalid storage verifier result');
      return result;
    } catch {
      return { exists: false, byteLength: null, contentSha256: null };
    }
  }

  private storageMatches(
    result: WorkerStatementStorageVerification,
    mediaType: 'application/pdf' | 'text/csv',
    byteLength: number,
    contentSha256: string,
  ): boolean {
    return (
      result.exists === true &&
      result.byteLength === byteLength &&
      result.contentSha256?.toLowerCase() === contentSha256 &&
      result.magicValid === true &&
      (result.mediaType === undefined ||
        result.mediaType === null ||
        result.mediaType === mediaType)
    );
  }

  private failIntegrity(
    row: WorkerStatementRow,
    binding: WorkerStatementExecution,
    input: WorkerStatementCompletion,
    verification: WorkerStatementStorageVerification,
  ): WorkerStatementArtifact {
    const timestamp = now();
    const expectedHash = hash(input.contentSha256, 'contentSha256');
    const observedHashValue = observedHash(verification.contentSha256);
    const observedLengthValue = observedLength(verification.byteLength);
    const incidentHash = sha256(
      [
        row.artifact_id,
        row.current_attempt_number,
        'storage_verification_failed',
        expectedHash,
        observedHashValue ?? '',
        input.byteLength,
        observedLengthValue ?? '',
        row.storage_key,
      ].join('|'),
    );
    // The incident subject guard is intentionally tied to an immutable completed attempt. Write
    // that evidence before the incident, in the same transaction as the quarantine transition.
    this.insertAttempt(row, 'failed', input, 'ARTIFACT_INTEGRITY_FAILED');
    this.sqlite
      .prepare(
        `INSERT OR IGNORE INTO worker_statement_integrity_incident(
           incident_id,artifact_id,attempt_number,incident_kind,expected_hash,observed_hash,
           expected_length,observed_length,storage_key,detected_at,detected_by,incident_hash
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId(),
        row.artifact_id,
        row.current_attempt_number,
        'storage_verification_failed',
        expectedHash,
        observedHashValue,
        input.byteLength,
        observedLengthValue,
        row.storage_key,
        timestamp,
        'worker-statement-repository',
        incidentHash,
      );
    const changed = this.sqlite
      .prepare(
        `UPDATE worker_statement_artifact
         SET status='failed',error_code='ARTIFACT_INTEGRITY_FAILED',retryable=1,
             integrity_blocked=1,finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,
             claimed_lease_fence=NULL,updated_at=?
         WHERE artifact_id=? AND status='running' AND current_attempt_number=?
           AND claimed_job_id=? AND claimed_job_run_id=? AND claimed_lease_fence=?`,
      )
      .run(
        timestamp,
        timestamp,
        row.artifact_id,
        row.current_attempt_number,
        binding.jobId,
        binding.jobRunId,
        binding.leaseFence,
      );
    if (Number(changed.changes) !== 1)
      throw new ConflictError('Worker statement integrity fence was lost');
    return this.map(this.row(row.artifact_id));
  }

  private quarantineReady(
    row: WorkerStatementRow,
    incidentKind:
      | 'durable_completion_missing_or_stale'
      | 'storage_verification_failed'
      | 'metadata_invalid',
    observedHash: string | null,
    observedLength: number | null,
  ): boolean {
    const attempt = this.sqlite
      .prepare(
        `SELECT 1 FROM worker_statement_artifact_attempt
         WHERE artifact_id=? AND attempt_number=? AND outcome='ready' AND finished_at IS NOT NULL LIMIT 1`,
      )
      .get(row.artifact_id, row.current_attempt_number);
    if (!attempt) return false;
    const incidentHash = sha256(
      [
        row.artifact_id,
        row.current_attempt_number,
        incidentKind,
        row.content_sha256 ?? '',
        observedHash ?? '',
        row.byte_length ?? '',
        observedLength ?? '',
        row.storage_key,
      ].join('|'),
    );
    this.sqlite
      .prepare(
        `INSERT OR IGNORE INTO worker_statement_integrity_incident(
           incident_id,artifact_id,attempt_number,incident_kind,expected_hash,observed_hash,
           expected_length,observed_length,storage_key,detected_at,detected_by,incident_hash
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        newId(),
        row.artifact_id,
        row.current_attempt_number,
        incidentKind,
        row.content_sha256,
        observedHash,
        row.byte_length,
        observedLength,
        row.storage_key,
        now(),
        'worker-statement-repository',
        incidentHash,
      );
    const timestamp = now();
    const changed = this.sqlite
      .prepare(
        `UPDATE worker_statement_artifact
         SET status='failed',error_code='ARTIFACT_INTEGRITY_FAILED',retryable=1,
             integrity_blocked=1,finished_at=?,claimed_job_id=NULL,claimed_job_run_id=NULL,
             claimed_lease_fence=NULL,updated_at=?
         WHERE artifact_id=? AND status='ready' AND current_attempt_number=?
           AND claimed_job_id IS NULL AND claimed_job_run_id IS NULL AND claimed_lease_fence IS NULL`,
      )
      .run(timestamp, timestamp, row.artifact_id, row.current_attempt_number);
    if (Number(changed.changes) !== 1)
      throw new ConflictError('Worker statement integrity fence was lost');
    return true;
  }

  private readyAttempt(
    row: WorkerStatementRow,
  ): { job_id: string; job_run_id: string; lease_fence: number } | null {
    const identity = this.deployment();
    const attempt = this.sqlite
      .prepare(
        `SELECT a.job_id,a.job_run_id,a.lease_fence,j.payload_json,j.payload_sha256,
                s.capabilities_json actor_capabilities,s.status actor_status,
                s.version actor_version,r.service_actor_version,
                r.service_actor_capabilities_json,r.configured_binding_version,
                b.version binding_version
           FROM worker_statement_artifact_attempt a
           JOIN job j ON j.id=a.job_id
           JOIN job_run r ON r.id=j.active_job_run_id AND r.id=a.job_run_id AND r.job_id=j.id
           JOIN service_actor s ON s.id=r.service_actor_id
           JOIN deployment_service_actor_binding b
             ON b.singleton=1 AND b.service_actor_id=s.id
          WHERE a.artifact_id=? AND a.attempt_number=? AND a.outcome='ready'
            AND a.finished_at IS NOT NULL
            AND a.job_id IS NOT NULL AND a.job_run_id IS NOT NULL AND a.lease_fence IS NOT NULL
            AND j.contract_version='b5-v1' AND r.contract_version='b5-v1'
            AND j.kind=? AND r.kind=j.kind
            AND j.required_capability=? AND r.required_capability=j.required_capability
            AND j.tenant_id=? AND j.deployment_id=?
            AND r.tenant_id=? AND r.deployment_id=?
            AND j.state='succeeded' AND r.state='succeeded' AND r.outcome='succeeded'
            AND r.finished_at IS NOT NULL AND j.active_job_run_id=r.id
            AND j.fence_version=a.lease_fence AND r.fence_version=a.lease_fence
            AND j.lease_until IS NULL
            AND j.payload_sha256 IS NOT NULL AND j.payload_sha256=r.payload_sha256
            AND s.status='active' AND r.service_actor_version=s.version
            AND r.service_actor_capabilities_json=s.capabilities_json
            AND r.configured_binding_version=b.version
            AND b.tenant_id=? AND b.deployment_id=? AND b.service_actor_id=r.service_actor_id
          LIMIT 1`,
      )
      .get(
        row.artifact_id,
        row.current_attempt_number,
        WORKER_STATEMENT_JOB_KIND,
        WORKER_STATEMENT_JOB_CAPABILITY,
        identity.tenantId,
        identity.deploymentId,
        identity.tenantId,
        identity.deploymentId,
        identity.tenantId,
        identity.deploymentId,
      ) as
      | {
          job_id: string;
          job_run_id: string;
          lease_fence: number;
          payload_json: string;
          payload_sha256: string | null;
          actor_capabilities: string;
          actor_status: string;
          actor_version: number;
          service_actor_version: number | null;
          service_actor_capabilities_json: string | null;
          configured_binding_version: number | null;
          binding_version: number;
        }
      | undefined;
    if (!attempt || attempt.actor_status !== 'active') return null;
    if (
      attempt.service_actor_version !== attempt.actor_version ||
      attempt.configured_binding_version !== attempt.binding_version ||
      attempt.service_actor_capabilities_json !== attempt.actor_capabilities
    )
      return null;
    let capabilities: unknown;
    let payload: unknown;
    try {
      capabilities = JSON.parse(attempt.actor_capabilities);
      payload = JSON.parse(attempt.payload_json);
    } catch {
      return null;
    }
    if (
      !sameCapabilities(capabilities, WORKER_STATEMENT_JOB_CAPABILITY) ||
      !attempt.payload_sha256 ||
      sha256(canonicalJson(payload)) !== attempt.payload_sha256 ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).artifactId !== row.artifact_id ||
      (payload as Record<string, unknown>).requestedAttempt !== row.current_attempt_number
    )
      return null;
    return {
      job_id: attempt.job_id,
      job_run_id: attempt.job_run_id,
      lease_fence: attempt.lease_fence,
    };
  }

  resolveDownload(principal: Principal, artifactId: string): WorkerStatementDownload {
    const result = this.transaction(() => {
      const row = this.row(segment(artifactId, 'artifactId'));
      this.assertReadable(principal, row);
      if (row.status !== 'ready') {
        this.recordAccessAudit(principal, row, 'blocked', {
          reason: row.integrity_blocked === 1 ? 'integrity_blocked' : 'artifact_not_ready',
        });
        return {
          kind: 'blocked' as const,
          error: new ConflictError('Worker statement artifact is not ready'),
        };
      }

      let metadataValid = row.integrity_blocked === 0;
      if (
        row.content_sha256 === null ||
        row.byte_length === null ||
        row.media_type === null ||
        row.renderer_version === null
      )
        metadataValid = false;
      if (metadataValid) {
        try {
          hash(row.content_sha256!, 'contentSha256');
          safeKey(row.storage_key);
          safeFilename(row.semantic_filename, row.format);
          segment(row.renderer_version!, 'rendererVersion');
          if (
            !Number.isSafeInteger(row.byte_length!) ||
            row.byte_length! <= 0 ||
            row.media_type !== (row.format === 'pdf' ? 'application/pdf' : 'text/csv')
          )
            metadataValid = false;
        } catch {
          metadataValid = false;
        }
      }
      if (!metadataValid) {
        this.recordAccessAudit(principal, row, 'integrity', { reason: 'metadata_invalid' });
        this.quarantineReady(row, 'metadata_invalid', null, null);
        return {
          kind: 'blocked' as const,
          error: new ConflictError('Worker statement artifact integrity check failed'),
        };
      }

      const attempt = this.readyAttempt(row);
      if (!attempt) {
        this.recordAccessAudit(principal, row, 'integrity', {
          reason: 'durable_completion_missing_or_stale',
        });
        this.quarantineReady(row, 'durable_completion_missing_or_stale', null, null);
        return {
          kind: 'blocked' as const,
          error: new ConflictError('Worker statement durable completion is missing'),
        };
      }
      const expected: WorkerStatementStorageExpectation = {
        storageKey: row.storage_key,
        byteLength: row.byte_length!,
        contentSha256: row.content_sha256!,
        mediaType: row.media_type!,
      };
      const verification = this.verifyStorage(row.storage_key, expected);
      if (
        !this.storageMatches(verification, row.media_type!, row.byte_length!, row.content_sha256!)
      ) {
        this.recordAccessAudit(principal, row, 'integrity', {
          reason: 'storage_verification_failed',
        });
        this.quarantineReady(
          row,
          'storage_verification_failed',
          verification.contentSha256,
          verification.byteLength,
        );
        return {
          kind: 'blocked' as const,
          error: new ConflictError('Worker statement artifact integrity check failed'),
        };
      }
      this.recordAccessAudit(principal, row, 'authorized', {
        sha256: row.content_sha256,
        byteLength: row.byte_length,
        mediaType: row.media_type,
      });
      return {
        artifactId: row.artifact_id,
        format: row.format,
        semanticFilename: row.semantic_filename,
        storageKey: row.storage_key,
        mediaType: row.media_type!,
        byteLength: row.byte_length!,
        contentSha256: row.content_sha256!,
      };
    });
    if ('kind' in result && result.kind === 'blocked') throw result.error;
    return result;
  }

  // Explicit aliases keep the job adapter and route composition readable.
  requestWorkerStatementArtifacts = this.requestArtifacts.bind(this);
  requestWorkerStatementArtifact = this.requestArtifact.bind(this);
  listWorkerStatementArtifacts = this.listArtifacts.bind(this);
  retryWorkerStatementArtifact = this.retryArtifact.bind(this);
  getWorkerStatementArtifact = this.getArtifact.bind(this);
  resolveWorkerStatementDownload = this.resolveDownload.bind(this);
}

export function publicWorkerStatementArtifact(artifact: WorkerStatementArtifact) {
  return {
    artifactId: artifact.artifactId,
    periodStart: artifact.periodStart,
    periodEnd: artifact.periodEnd,
    format: artifact.format,
    templateVersion: artifact.templateVersion,
    generationVersion: artifact.generationVersion,
    status: artifact.status,
    currentAttemptNumber: artifact.currentAttemptNumber,
    semanticFilename: artifact.semanticFilename,
    mediaType: artifact.mediaType,
    byteLength: artifact.byteLength,
    rendererVersion: artifact.rendererVersion,
    readyAt: artifact.readyAt,
    errorCode: artifact.errorCode,
    retryable: artifact.retryable,
    integrityBlocked: artifact.integrityBlocked,
    maxAttempts: artifact.maxAttempts,
    requestedAt: artifact.requestedAt,
    startedAt: artifact.startedAt,
    finishedAt: artifact.finishedAt,
    updatedAt: artifact.updatedAt,
  };
}

export function workerStatementGenerationVersion(
  templateVersion: string,
  refresh = false,
  clock = new Date(),
): string {
  const template = safeTemplate(templateVersion);
  if (!refresh) return `worker-statement-${template}`;
  if (!Number.isFinite(clock.getTime())) throw new ValidationError('generation clock is invalid');
  return `worker-statement-${template}-${clock.toISOString().replace(/[^0-9TZ-]/gu, '')}`;
}
