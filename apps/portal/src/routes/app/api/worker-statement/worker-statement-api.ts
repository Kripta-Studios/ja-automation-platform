import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  AccessDeniedError,
  WorkerStatementRepository,
  type WorkerStatementArtifact,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  REPORT_TEMPLATE_VERSION,
  type WorkerStatementSnapshot,
  workerStatementGenerationVersion,
} from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';

export type WorkerStatementPortalContext = ReturnType<typeof openPortalRepository>;

export function workerStatementRepository(sqlite: WorkerStatementPortalContext['sqlite']) {
  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  return new WorkerStatementRepository(sqlite, {
    verify: (storageKey, expected) => verifyWorkerStatementStorage(root, storageKey, expected),
  });
}

function isPdf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  return Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-' && tail.includes('%%EOF');
}

function isCsv(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function safeStorageTarget(root: string, storageKey: string): string {
  if (
    !storageKey ||
    storageKey.startsWith('/') ||
    storageKey.includes('\\') ||
    storageKey.includes('\0') ||
    storageKey.includes('://') ||
    storageKey.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('WORKER_STATEMENT_STORAGE_KEY_INVALID');
  const targetRoot = resolve(root);
  const target = resolve(targetRoot, storageKey);
  const rel = relative(targetRoot, target);
  if (!rel || rel.split(/[\\/]/u).includes('..') || rel.startsWith('/') || rel.startsWith('\\'))
    throw new Error('WORKER_STATEMENT_STORAGE_PATH_INVALID');
  return target;
}

function assertNoSymlinkParents(root: string, directory: string): void {
  const rootPath = resolve(root);
  const directoryPath = resolve(directory);
  const rel = relative(rootPath, directoryPath);
  if (!rel || rel.split(/[\\/]/u).includes('..') || rel.startsWith('/') || rel.startsWith('\\'))
    throw new Error('WORKER_STATEMENT_STORAGE_PATH_INVALID');
  const rootStats = lstatSync(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('WORKER_STATEMENT_STORAGE_ROOT_INVALID');
  let cursor = rootPath;
  for (const part of rel.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, part);
    const stats = lstatSync(cursor);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error('WORKER_STATEMENT_STORAGE_PARENT_INVALID');
  }
}

function readRegularFileNoFollow(path: string): Buffer {
  const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const descriptor = openSync(path, fsConstants.O_RDONLY | noFollow);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new Error('WORKER_STATEMENT_STORAGE_NOT_REGULAR');
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function verifyWorkerStatementStorage(
  root: string,
  storageKey: string,
  expected?: Readonly<{ mediaType?: string; byteLength?: number; contentSha256?: string }>,
) {
  try {
    const target = safeStorageTarget(root, storageKey);
    assertNoSymlinkParents(root, dirname(target));
    const stats = lstatSync(target);
    if (stats.isSymbolicLink() || !stats.isFile())
      return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
    const bytes = readRegularFileNoFollow(target);
    const mediaType = expected?.mediaType ?? (isPdf(bytes) ? 'application/pdf' : 'text/csv');
    const magicValid = mediaType === 'application/pdf' ? isPdf(bytes) : isCsv(bytes);
    return {
      exists: true,
      byteLength: bytes.byteLength,
      contentSha256: createHash('sha256').update(bytes).digest('hex'),
      mediaType,
      magicValid,
    };
  } catch {
    return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
  }
}

export function readWorkerStatementArtifact(
  root: string,
  metadata: Readonly<{
    storageKey: string;
    mediaType: string;
    byteLength: number;
    contentSha256: string;
  }>,
): Buffer {
  if (
    (metadata.mediaType !== 'application/pdf' && metadata.mediaType !== 'text/csv') ||
    !Number.isSafeInteger(metadata.byteLength) ||
    metadata.byteLength <= 0 ||
    !/^[0-9a-f]{64}$/u.test(metadata.contentSha256)
  )
    throw new Error('WORKER_STATEMENT_ARTIFACT_METADATA_INVALID');
  const target = safeStorageTarget(root, metadata.storageKey);
  assertNoSymlinkParents(root, dirname(target));
  const bytes = readRegularFileNoFollow(target);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const magicValid = metadata.mediaType === 'application/pdf' ? isPdf(bytes) : isCsv(bytes);
  if (bytes.byteLength !== metadata.byteLength || digest !== metadata.contentSha256 || !magicValid)
    throw new Error('WORKER_STATEMENT_ARTIFACT_INTEGRITY_FAILED');
  return bytes;
}

function rowString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Build the worker-safe, immutable source cut consumed by both PDF and CSV jobs. */
export function buildWorkerStatementSnapshot(
  context: Readonly<{
    principal: Principal;
    sqlite: { exec: (sql: string) => unknown };
    v3: {
      workerPay: (
        principal: Principal,
        periodStart: string,
        periodEnd: string,
      ) => {
        currency: string;
        approvedMinutes: number;
        pendingMinutes: number;
        estimatedApprovedMinor: string;
        estimatedPendingMinor: string;
        approvedReimbursementMinor: string;
        pendingReimbursementMinor: string;
        missingCompensationRules: number;
      };
      listCompensationSettlements: (
        principal: Principal,
        periodStart: string,
        periodEnd: string,
      ) => readonly Record<string, unknown>[];
    };
    repository: {
      listWorkerStatementExpenses: (
        principal: Principal,
        periodStart: string,
        periodEnd: string,
      ) => readonly Record<string, unknown>[];
      listWorkerStatementTime: (
        principal: Principal,
        periodStart: string,
        periodEnd: string,
      ) => readonly Record<string, unknown>[];
    };
  }>,
  worker: Readonly<{ id: string; name: string }>,
  periodStart: string,
  periodEnd: string,
): WorkerStatementSnapshot {
  if (context.principal.userId !== worker.id || context.principal.role !== 'worker')
    throw new AccessDeniedError('Worker statement access denied');
  context.sqlite.exec('BEGIN');
  try {
    const pay = context.v3.workerPay(context.principal, periodStart, periodEnd);
    const settlements = context.v3.listCompensationSettlements(
      context.principal,
      periodStart,
      periodEnd,
    );
    const expenses = context.repository.listWorkerStatementExpenses(
      context.principal,
      periodStart,
      periodEnd,
    );
    const activities = context.repository.listWorkerStatementTime(
      context.principal,
      periodStart,
      periodEnd,
    );
    const snapshot: WorkerStatementSnapshot = {
      worker,
      periodStart,
      periodEnd,
      currency: String(pay.currency),
      approvedMinutes: pay.approvedMinutes,
      pendingMinutes: pay.pendingMinutes,
      estimatedApprovedMinor: String(pay.estimatedApprovedMinor),
      estimatedPendingMinor: String(pay.estimatedPendingMinor),
      approvedReimbursementMinor: String(pay.approvedReimbursementMinor),
      pendingReimbursementMinor: String(pay.pendingReimbursementMinor),
      missingCompensationRules: pay.missingCompensationRules,
      activities: activities.map((row) => ({
        id: rowString(row.id),
        projectNumber: rowString(row.project_number),
        projectName: rowString(row.project_name),
        date: rowString(row.work_date),
        category: rowString(row.category),
        activitySummary: rowString(row.activity_summary),
        actualMinutes: Number(row.minutes),
        approvalState: rowString(row.approval_state),
      })),
      settlements: settlements.map((row) => ({
        id: rowString(row.id),
        projectNumber: rowString(row.projectNumber),
        projectName: rowString(row.projectName),
        periodStart: rowString(row.periodStart),
        periodEnd: rowString(row.periodEnd),
        amountMinor: rowString(row.amountMinor),
        currency: rowString(row.currency),
        state: rowString(row.state),
        expectedPaymentOn:
          row.expectedPaymentOn === null || row.expectedPaymentOn === undefined
            ? null
            : String(row.expectedPaymentOn),
        settledAt:
          row.settledAt === null || row.settledAt === undefined ? null : String(row.settledAt),
      })),
      expenses: expenses.map((row) => {
        const id = rowString(row.id);
        return {
          id,
          projectNumber: rowString(row.projectNumber),
          spentOn: rowString(row.spentOn),
          vendor: rowString(row.vendor),
          category: rowString(row.category),
          reimbursementAmountMinor: rowString(row.reimbursementAmountMinor),
          currency: rowString(row.currency),
          approvalState: rowString(row.approvalState),
          reimbursementState: rowString(row.reimbursementState),
          expectedReimbursementOn:
            row.expectedReimbursementOn === null || row.expectedReimbursementOn === undefined
              ? null
              : String(row.expectedReimbursementOn),
          reimbursedAt:
            row.reimbursedAt === null || row.reimbursedAt === undefined
              ? null
              : String(row.reimbursedAt),
        };
      }),
    };
    context.sqlite.exec('COMMIT');
    return snapshot;
  } catch (error) {
    try {
      context.sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the source-read failure rather than masking it with cleanup.
    }
    throw error;
  }
}

export function workerStatementRequestInput(
  snapshot: WorkerStatementSnapshot,
  options?: Readonly<{ requestKey?: string; refresh?: boolean; now?: Date }>,
) {
  return {
    snapshot,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    templateVersion: REPORT_TEMPLATE_VERSION,
    generationVersion: workerStatementGenerationVersion(
      REPORT_TEMPLATE_VERSION,
      options?.refresh === true,
      options?.now,
    ),
    ...(options?.requestKey === undefined ? {} : { requestKey: options.requestKey }),
  };
}

export function publicWorkerStatementStatus(artifact: WorkerStatementArtifact) {
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

export function artifactDownloadLocation(url: URL, artifactId: string): string {
  const marker = '/app/api/worker-statement';
  const index = url.pathname.indexOf(marker);
  const basePath = index >= 0 ? url.pathname.slice(0, index) : '';
  return new URL(
    `${basePath}${marker}/artifacts/${encodeURIComponent(artifactId)}/download`,
    url,
  ).toString();
}
