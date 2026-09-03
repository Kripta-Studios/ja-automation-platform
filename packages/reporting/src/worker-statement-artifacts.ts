import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import {
  REPORT_TEMPLATE_VERSION,
  workerStatementCsv,
  workerStatementPdf,
  type WorkerStatementSnapshot,
} from './exports.ts';
import { ensureNoSymlinkComponents } from './private-storage.ts';

/** The durable job kind used for one Worker-statement format. */
export const WORKER_STATEMENT_JOB_KIND = 'worker_statement_artifact_render' as const;

/** Capability bound to WORKER_STATEMENT_JOB_KIND by the deployment service actor. */
export const WORKER_STATEMENT_JOB_CAPABILITY = 'artifact.worker_statement.render' as const;

/** Renderer identity persisted with each immutable Worker-statement artifact. */
export const WORKER_STATEMENT_RENDERER_VERSION = `worker-statement-${REPORT_TEMPLATE_VERSION}`;

export const WORKER_STATEMENT_GENERATION_VERSION = `worker-statement-${REPORT_TEMPLATE_VERSION}`;

export const WORKER_STATEMENT_FORMATS = ['pdf', 'csv'] as const;
export type WorkerStatementFormat = (typeof WORKER_STATEMENT_FORMATS)[number];

export type WorkerStatementArtifactStatus = 'queued' | 'running' | 'ready' | 'failed';

/** The opaque fenced B5 execution envelope. It is never accepted from an HTTP caller. */
export type WorkerStatementJobExecution = Readonly<{
  jobId: string;
  jobRunId: string;
  leaseFence: number;
}>;

/** Database projection required by the renderer. Snapshot JSON is an immutable source cut. */
export type WorkerStatementJobArtifact = Readonly<{
  artifactId: string;
  workerId: string;
  periodStart: string;
  periodEnd: string;
  format: WorkerStatementFormat;
  snapshotJson: string;
  /** SHA-256 of the canonical snapshot JSON captured at request time. */
  snapshotHash?: string;
  storageKey: string;
  semanticFilename: string;
  templateVersion: string;
  generationVersion: string;
  currentAttemptNumber: number;
  status: WorkerStatementArtifactStatus;
}>;

export type WorkerStatementJobClaim = Readonly<{
  artifact: WorkerStatementJobArtifact;
  attemptNumber: number;
}>;

/** Adapter implemented by the database lane; no persistence is performed in this package. */
export type WorkerStatementJobRepository = Readonly<{
  claimWorkerStatementArtifact: (
    artifactId: string,
    execution: WorkerStatementJobExecution,
    expectedAttemptNumber: number,
  ) => WorkerStatementJobClaim;
  completeWorkerStatementArtifact: (
    artifactId: string,
    input: Readonly<{
      attemptNumber: number;
      contentSha256: string;
      byteLength: number;
      storageKey: string;
      rendererVersion: string;
      mediaType: 'application/pdf' | 'text/csv';
      execution: WorkerStatementJobExecution;
    }>,
  ) => WorkerStatementJobArtifact;
  prepareWorkerStatementArtifactCompletion: (
    artifactId: string,
    input: Readonly<{
      attemptNumber: number;
      contentSha256: string;
      byteLength: number;
      storageKey: string;
      rendererVersion: string;
      mediaType: 'application/pdf' | 'text/csv';
      execution: WorkerStatementJobExecution;
    }>,
  ) => WorkerStatementJobArtifact;
  failWorkerStatementArtifact: (
    artifactId: string,
    input: Readonly<{
      attemptNumber: number;
      errorCode: string;
      retryable?: boolean;
      failureClass?: string;
      execution: WorkerStatementJobExecution;
    }>,
  ) => WorkerStatementJobArtifact;
  recoverAbandonedRunning?: (
    asOf?: Date | string,
    leaseTimeoutMs?: number,
  ) => readonly WorkerStatementJobArtifact[];
}>;

export type WorkerStatementJobPayload = Readonly<{
  artifactId: string;
  requestedAttempt?: number;
}>;

export type WorkerStatementJobResult = Readonly<{
  artifactId: string;
  format: WorkerStatementFormat;
  status: 'ready';
  storageKey: string;
  contentSha256: string;
  byteLength: number;
  attemptNumber: number;
  finalize?: () => WorkerStatementJobResult | WorkerStatementCommittedFailure;
}>;

export type WorkerStatementCommittedFailure = Readonly<{
  durableFinalizer: 'commit_failure_v1';
  errorCode: 'HANDLER_FAILED';
  errorDetail: 'worker_statement_integrity_quarantine';
}>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Keep renderer diagnostics valid for the repository's single-line failure-class contract. */
function failureClass(error: unknown): string {
  const normalized = errorMessage(error)
    .replace(/[\\/\0\r\n]+/gu, ' ')
    .replace(/\.\./gu, '.')
    .trim()
    .slice(0, 120)
    .trim();
  return normalized || 'WORKER_STATEMENT_RENDER_FAILED';
}

function validatePayload(payload: unknown): WorkerStatementJobPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('PAYLOAD_INVALID');
  const values = payload as Record<string, unknown>;
  const artifactId = typeof values.artifactId === 'string' ? values.artifactId.trim() : '';
  if (!artifactId || artifactId.length > 200 || artifactId.includes('\0'))
    throw new Error('PAYLOAD_INVALID');
  const requestedAttempt = values.requestedAttempt;
  if (
    requestedAttempt !== undefined &&
    (!Number.isSafeInteger(requestedAttempt) || Number(requestedAttempt) < 1)
  )
    throw new Error('PAYLOAD_INVALID');
  return {
    artifactId,
    ...(requestedAttempt === undefined ? {} : { requestedAttempt: Number(requestedAttempt) }),
  };
}

function parseSnapshot(value: string): WorkerStatementSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  assertWorkerStatementSnapshot(parsed);
  return parsed;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requiredString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function safeMinor(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d*)$/u.test(value);
}

/**
 * Validate the worker-safe report contract before a snapshot is rendered by a background job.
 * The request path is the authority for this allowlist; a persisted snapshot containing
 * commercial fields is rejected instead of being rendered and made durable.
 */
export function assertWorkerStatementSnapshot(
  value: unknown,
): asserts value is WorkerStatementSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  const snapshot = value as Record<string, unknown>;
  const worker = snapshot.worker;
  if (
    !worker ||
    typeof worker !== 'object' ||
    Array.isArray(worker) ||
    !requiredString((worker as Record<string, unknown>).id) ||
    !requiredString((worker as Record<string, unknown>).name) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u.test(String((worker as Record<string, unknown>).id))
  )
    throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  if (
    !requiredString(snapshot.periodStart) ||
    !requiredString(snapshot.periodEnd) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(snapshot.periodStart) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(snapshot.periodEnd) ||
    snapshot.periodStart > snapshot.periodEnd ||
    !requiredString(snapshot.currency) ||
    !/^[A-Z]{3}$/u.test(snapshot.currency) ||
    !requiredInteger(snapshot.approvedMinutes) ||
    !requiredInteger(snapshot.pendingMinutes) ||
    !safeMinor(snapshot.estimatedApprovedMinor) ||
    !safeMinor(snapshot.estimatedPendingMinor) ||
    !safeMinor(snapshot.approvedReimbursementMinor) ||
    !safeMinor(snapshot.pendingReimbursementMinor) ||
    !requiredInteger(snapshot.missingCompensationRules)
  )
    throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  const forbidden =
    /(?:client.?rate|internal.?cost|contribution|margin|other.?worker|loaded.?cost)/iu;
  const walk = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') return;
    if (Array.isArray(entry)) {
      entry.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
      if (forbidden.test(key)) throw new Error('WORKER_STATEMENT_SNAPSHOT_NOT_WORKER_SAFE');
      walk(child);
    }
  };
  walk(snapshot);
  if (
    !Array.isArray(snapshot.activities) ||
    !Array.isArray(snapshot.settlements) ||
    !Array.isArray(snapshot.expenses)
  )
    throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  for (const activity of snapshot.activities) {
    if (
      !activity ||
      typeof activity !== 'object' ||
      !requiredString((activity as Record<string, unknown>).id) ||
      !requiredString((activity as Record<string, unknown>).projectNumber) ||
      !requiredString((activity as Record<string, unknown>).projectName) ||
      !requiredString((activity as Record<string, unknown>).date) ||
      !requiredString((activity as Record<string, unknown>).category) ||
      typeof (activity as Record<string, unknown>).activitySummary !== 'string' ||
      !requiredInteger((activity as Record<string, unknown>).actualMinutes) ||
      !requiredString((activity as Record<string, unknown>).approvalState)
    )
      throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  }
  for (const settlement of snapshot.settlements) {
    if (
      !settlement ||
      typeof settlement !== 'object' ||
      !requiredString((settlement as Record<string, unknown>).id) ||
      !requiredString((settlement as Record<string, unknown>).projectNumber) ||
      !requiredString((settlement as Record<string, unknown>).projectName) ||
      !requiredString((settlement as Record<string, unknown>).periodStart) ||
      !requiredString((settlement as Record<string, unknown>).periodEnd) ||
      !safeMinor((settlement as Record<string, unknown>).amountMinor) ||
      !requiredString((settlement as Record<string, unknown>).currency) ||
      !requiredString((settlement as Record<string, unknown>).state)
    )
      throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  }
  for (const expense of snapshot.expenses) {
    if (
      !expense ||
      typeof expense !== 'object' ||
      !requiredString((expense as Record<string, unknown>).id) ||
      !requiredString((expense as Record<string, unknown>).projectNumber) ||
      !requiredString((expense as Record<string, unknown>).spentOn) ||
      typeof (expense as Record<string, unknown>).vendor !== 'string' ||
      !requiredString((expense as Record<string, unknown>).category) ||
      !safeMinor((expense as Record<string, unknown>).reimbursementAmountMinor) ||
      !requiredString((expense as Record<string, unknown>).currency) ||
      !requiredString((expense as Record<string, unknown>).approvalState) ||
      !requiredString((expense as Record<string, unknown>).reimbursementState)
    )
      throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  }
}

/** Return canonical JSON and its digest for a worker-safe snapshot. */
export function canonicalWorkerStatementSnapshot(value: WorkerStatementSnapshot): Readonly<{
  json: string;
  hash: string;
}> {
  assertWorkerStatementSnapshot(value);
  const json = canonicalJson(value);
  return { json, hash: sha256(json) };
}

/**
 * Return the immutable generation identity used by a Worker statement request.
 *
 * A normal request is stable for the template version, so an idempotency key can
 * safely replay it. A refresh explicitly creates a new generation while keeping
 * the template identity in the value. The timestamp is supplied by the caller in
 * tests or by the request boundary in production; it is never taken from the
 * rendered document.
 */
export function workerStatementGenerationVersion(
  templateVersion: string,
  refresh = false,
  clock = new Date(),
): string {
  const template = templateVersion.trim();
  if (
    !template ||
    template.length > 120 ||
    template !== templateVersion ||
    template.includes('..') ||
    /[\\/\0\r\n]/u.test(template)
  )
    throw new Error('WORKER_STATEMENT_TEMPLATE_INVALID');
  if (!refresh) return `worker-statement-${template}`;
  if (!(clock instanceof Date) || !Number.isFinite(clock.getTime()))
    throw new Error('WORKER_STATEMENT_GENERATION_CLOCK_INVALID');
  return `worker-statement-${template}-${clock.toISOString().replace(/[^0-9TZ-]/gu, '')}`;
}

function safeStorageKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.includes('://') ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
    throw new Error('WORKER_STATEMENT_STORAGE_KEY_INVALID');
}

function safeFilename(filename: string, format: WorkerStatementFormat): void {
  if (
    !filename ||
    filename.length > 240 ||
    filename.includes('\0') ||
    /[\r\n]/u.test(filename) ||
    filename.includes('/') ||
    filename.includes('\\') ||
    !filename.toLowerCase().endsWith(`.${format}`)
  )
    throw new Error('WORKER_STATEMENT_FILENAME_INVALID');
}

function expectedMediaType(format: WorkerStatementFormat): 'application/pdf' | 'text/csv' {
  return format === 'pdf' ? 'application/pdf' : 'text/csv';
}

function validateArtifact(artifact: WorkerStatementJobArtifact): void {
  if (!artifact.artifactId || !artifact.workerId)
    throw new Error('WORKER_STATEMENT_ARTIFACT_INVALID');
  if (!WORKER_STATEMENT_FORMATS.includes(artifact.format))
    throw new Error('WORKER_STATEMENT_FORMAT_INVALID');
  if (!Number.isSafeInteger(artifact.currentAttemptNumber) || artifact.currentAttemptNumber < 1)
    throw new Error('WORKER_STATEMENT_ATTEMPT_INVALID');
  if (!artifact.snapshotJson.trim()) throw new Error('WORKER_STATEMENT_SNAPSHOT_INVALID');
  safeStorageKey(artifact.storageKey);
  safeFilename(artifact.semanticFilename, artifact.format);
  if (!artifact.templateVersion || !artifact.generationVersion)
    throw new Error('WORKER_STATEMENT_VERSION_INVALID');
  if (artifact.snapshotHash !== undefined && !/^[0-9a-f]{64}$/u.test(artifact.snapshotHash))
    throw new Error('WORKER_STATEMENT_SNAPSHOT_HASH_INVALID');
}

function renderArtifact(artifact: WorkerStatementJobArtifact): Uint8Array {
  validateArtifact(artifact);
  const snapshot = parseSnapshot(artifact.snapshotJson);
  if (
    artifact.snapshotHash !== undefined &&
    sha256(canonicalJson(snapshot)) !== artifact.snapshotHash
  )
    throw new Error('WORKER_STATEMENT_SNAPSHOT_HASH_MISMATCH');
  return artifact.format === 'pdf' ? workerStatementPdf(snapshot) : workerStatementCsv(snapshot);
}

/**
 * Render one queued Worker-statement artifact from its immutable database snapshot.
 *
 * PDF and CSV artifacts are deliberately one job/one manifest each. A failure in one format is
 * reported to its own repository row and cannot prevent the other format from completing.
 * `deferCompletion` mirrors the B5 runner contract: the durable job/run is committed before the
 * ready transition is finalized.
 */
export function runWorkerStatementArtifactJob(
  input: Readonly<{
    repository: WorkerStatementJobRepository;
    payload: unknown;
    execution: WorkerStatementJobExecution;
    documentRoot: string;
    publish?: (storageKey: string, bytes: Uint8Array) => { sha256: string; byteLength: number };
    deferCompletion?: boolean;
  }>,
): WorkerStatementJobResult {
  const payload = validatePayload(input.payload);
  if (payload.requestedAttempt === undefined) throw new Error('PAYLOAD_INVALID');
  const claim = input.repository.claimWorkerStatementArtifact(
    payload.artifactId,
    input.execution,
    payload.requestedAttempt,
  );
  if (claim.attemptNumber !== payload.requestedAttempt)
    throw new Error('WORKER_STATEMENT_ATTEMPT_STALE');
  try {
    const bytes = renderArtifact(claim.artifact);
    const metadata = input.publish
      ? input.publish(claim.artifact.storageKey, bytes)
      : publishWorkerStatementArtifact(input.documentRoot, claim.artifact.storageKey, bytes);
    const result: WorkerStatementJobResult = {
      artifactId: payload.artifactId,
      format: claim.artifact.format,
      status: 'ready',
      storageKey: claim.artifact.storageKey,
      contentSha256: metadata.sha256,
      byteLength: metadata.byteLength,
      attemptNumber: claim.attemptNumber,
    };
    const completionInput = {
      attemptNumber: claim.attemptNumber,
      contentSha256: metadata.sha256,
      byteLength: metadata.byteLength,
      storageKey: claim.artifact.storageKey,
      rendererVersion: WORKER_STATEMENT_RENDERER_VERSION,
      mediaType: expectedMediaType(claim.artifact.format),
      execution: input.execution,
    } as const;
    const finalize = (() => {
      const completed = input.repository.completeWorkerStatementArtifact(payload.artifactId, {
        ...completionInput,
      });
      if (completed.status !== 'ready') throw new Error('WORKER_STATEMENT_INTEGRITY_QUARANTINE');
      return result;
    }) as (() => WorkerStatementJobResult) & {
      afterDurableSuccess?: true;
      beforeDurableFinish?: () => void | WorkerStatementCommittedFailure;
    };
    finalize.afterDurableSuccess = true;
    finalize.beforeDurableFinish = () => {
      const prepared = input.repository.prepareWorkerStatementArtifactCompletion(
        payload.artifactId,
        completionInput,
      );
      if (prepared.status !== 'failed') return;
      return {
        durableFinalizer: 'commit_failure_v1',
        errorCode: 'HANDLER_FAILED',
        errorDetail: 'worker_statement_integrity_quarantine',
      };
    };
    return input.deferCompletion ? { ...result, finalize } : finalize();
  } catch (error) {
    // A stale fence belongs to another worker and must not be converted into a second failure.
    if (errorMessage(error) === 'LEASE_LOST') throw error;
    try {
      input.repository.failWorkerStatementArtifact(payload.artifactId, {
        attemptNumber: claim.attemptNumber,
        errorCode: 'WORKER_STATEMENT_RENDER_FAILED',
        failureClass: failureClass(error),
        retryable: true,
        execution: input.execution,
      });
    } catch (failureError) {
      if (errorMessage(failureError) === 'LEASE_LOST') throw failureError;
      throw error;
    }
    throw new Error('HANDLER_FAILED');
  }
}

/** Validate and normalize a job payload for callers that need a preflight check. */
export function workerStatementJobPayload(payload: unknown): WorkerStatementJobPayload {
  return validatePayload(payload);
}

function missingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function removeTemporary(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!missingFile(error)) throw error;
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (!['EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(code ?? '')) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Safe atomic publisher used by direct callers. The production shared runner supplies its
 * already-tested publisher explicitly; retaining this fallback makes the reporting job useful
 * in focused tests and non-portal workers without weakening the path boundary.
 */
function publishWorkerStatementArtifact(
  documentRoot: string,
  storageKey: string,
  bytes: Uint8Array,
): { sha256: string; byteLength: number } {
  safeStorageKey(storageKey);
  const root = resolve(documentRoot);
  const target = resolve(root, storageKey);
  const targetRelative = relative(root, target);
  if (
    !targetRelative ||
    targetRelative.split(/[\\/]/u).includes('..') ||
    targetRelative.startsWith('/') ||
    targetRelative.startsWith('\\')
  )
    throw new Error('WORKER_STATEMENT_STORAGE_PATH_INVALID');
  const directory = dirname(target);
  ensureNoSymlinkComponents(root, directory, 'Worker statement');
  const expected = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };

  try {
    if (lstatSync(target).isSymbolicLink()) throw new Error('WORKER_STATEMENT_STORAGE_SYMLINK');
    const existingStats = statSync(target);
    if (!existingStats.isFile()) throw new Error('WORKER_STATEMENT_STORAGE_NOT_REGULAR');
    const existing = readFileSync(target);
    const existingMetadata = {
      sha256: createHash('sha256').update(existing).digest('hex'),
      byteLength: existing.byteLength,
    };
    if (
      existingMetadata.sha256 === expected.sha256 &&
      existingMetadata.byteLength === expected.byteLength
    )
      return existingMetadata;
    throw new Error('WORKER_STATEMENT_STORAGE_COLLISION');
  } catch (error) {
    if (!missingFile(error)) throw error;
  }

  const temporary = resolve(directory, `.${basename(target)}.${randomUUID()}.tmp`);
  let temporaryOpen = false;
  try {
    const descriptor = openSync(temporary, 'wx');
    temporaryOpen = true;
    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
        if (written <= 0) throw new Error('WORKER_STATEMENT_WRITE_NO_PROGRESS');
        offset += written;
      }
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    try {
      if (lstatSync(target).isSymbolicLink()) throw new Error('WORKER_STATEMENT_STORAGE_SYMLINK');
      const existingStats = statSync(target);
      if (!existingStats.isFile()) throw new Error('WORKER_STATEMENT_STORAGE_NOT_REGULAR');
      const existing = readFileSync(target);
      const existingMetadata = {
        sha256: createHash('sha256').update(existing).digest('hex'),
        byteLength: existing.byteLength,
      };
      if (
        existingMetadata.sha256 === expected.sha256 &&
        existingMetadata.byteLength === expected.byteLength
      ) {
        removeTemporary(temporary);
        temporaryOpen = false;
        return existingMetadata;
      }
      throw new Error('WORKER_STATEMENT_STORAGE_COLLISION');
    } catch (error) {
      if (!missingFile(error)) throw error;
    }
    try {
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EEXIST') throw error;
      if (lstatSync(target).isSymbolicLink()) throw new Error('WORKER_STATEMENT_STORAGE_SYMLINK');
      const existingStats = statSync(target);
      if (!existingStats.isFile()) throw new Error('WORKER_STATEMENT_STORAGE_NOT_REGULAR');
      const existing = readFileSync(target);
      const existingMetadata = {
        sha256: createHash('sha256').update(existing).digest('hex'),
        byteLength: existing.byteLength,
      };
      if (
        existingMetadata.sha256 !== expected.sha256 ||
        existingMetadata.byteLength !== expected.byteLength
      )
        throw new Error('WORKER_STATEMENT_STORAGE_COLLISION');
      removeTemporary(temporary);
      temporaryOpen = false;
      return existingMetadata;
    }
    removeTemporary(temporary);
    temporaryOpen = false;
    ensureNoSymlinkComponents(root, directory, 'Worker statement');
    fsyncDirectory(directory);
    const publishedStats = lstatSync(target);
    if (publishedStats.isSymbolicLink() || !publishedStats.isFile())
      throw new Error('WORKER_STATEMENT_STORAGE_NOT_REGULAR');
    const persisted = readFileSync(target);
    const persistedMetadata = {
      sha256: createHash('sha256').update(persisted).digest('hex'),
      byteLength: persisted.byteLength,
    };
    if (
      persistedMetadata.sha256 !== expected.sha256 ||
      persistedMetadata.byteLength !== expected.byteLength
    )
      throw new Error('WORKER_STATEMENT_STORAGE_VERIFY_FAILED');
    return persistedMetadata;
  } finally {
    if (temporaryOpen) removeTemporary(temporary);
  }
}
