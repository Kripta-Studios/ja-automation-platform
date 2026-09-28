import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
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
  ConflictError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  WorkerStatementRepository,
  type WorkerStatementArtifact,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  WORKER_STATEMENT_TEMPLATE_VERSION,
  normalizeReportLocale,
  type ReportLocale,
  type WorkerStatementSnapshot,
  workerStatementGenerationVersion,
} from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { ProblemData } from '$lib/problem/contract';

type StatementProblemKey = `problem.workerStatement.${string}`;
type StatementProblem = Readonly<{
  code: string;
  messageKey: StatementProblemKey;
  message: string;
  remedies?: ProblemData['remedies'];
  fieldErrors?: ProblemData['fieldErrors'];
}>;

const statementProblems = {
  signInRequired: {
    code: 'WORKER_STATEMENT_SIGN_IN_REQUIRED',
    messageKey: 'problem.workerStatement.signInRequired',
    message: 'Sign in to view your worker statement.',
    remedies: [{ id: 'sign_in' }],
  },
  roleRequired: {
    code: 'WORKER_STATEMENT_ROLE_REQUIRED',
    messageKey: 'problem.workerStatement.roleRequired',
    message:
      'Worker statements are available only to workers and project managers viewing their own pay.',
    remedies: [{ id: 'review_workspace' }],
  },
  notFound: {
    code: 'WORKER_STATEMENT_NOT_FOUND',
    messageKey: 'problem.workerStatement.notFound',
    message: 'This worker statement is unavailable. Open My Pay to review your statements.',
    remedies: [{ id: 'review_my_pay' }],
  },
  periodInvalid: {
    code: 'WORKER_STATEMENT_PERIOD_INVALID',
    messageKey: 'problem.workerStatement.periodInvalid',
    message: 'Choose a valid From and Through date; From must be on or before Through.',
    remedies: [{ id: 'review_my_pay' }],
    fieldErrors: {
      periodStart: ['Choose a valid start date.'],
      periodEnd: ['Choose a valid end date on or after the start date.'],
    },
  },
  localeInvalid: {
    code: 'WORKER_STATEMENT_LOCALE_INVALID',
    messageKey: 'problem.workerStatement.localeInvalid',
    message: 'Choose English, Spanish, or Portuguese.',
    fieldErrors: { locale: ['Choose English, Spanish, or Portuguese.'] },
  },
  requestInvalid: {
    code: 'WORKER_STATEMENT_REQUEST_INVALID',
    messageKey: 'problem.workerStatement.requestInvalid',
    message: 'The statement request is incomplete. Review the period and try again.',
    remedies: [{ id: 'review_my_pay' }],
  },
  requestKeyInvalid: {
    code: 'WORKER_STATEMENT_REQUEST_KEY_INVALID',
    messageKey: 'problem.workerStatement.requestKeyInvalid',
    message: 'This request could not be matched safely. Review My Pay before requesting again.',
    remedies: [{ id: 'review_my_pay' }],
  },
  refreshInvalid: {
    code: 'WORKER_STATEMENT_REFRESH_INVALID',
    messageKey: 'problem.workerStatement.refreshInvalid',
    message: 'The refresh choice is invalid. Review My Pay and try again.',
    remedies: [{ id: 'review_my_pay' }],
  },
  idempotencyConflict: {
    code: 'WORKER_STATEMENT_IDEMPOTENCY_CONFLICT',
    messageKey: 'problem.workerStatement.idempotencyConflict',
    message:
      'This request key was already used for different statement details. Review My Pay before requesting again.',
    remedies: [{ id: 'review_my_pay' }],
  },
  retryNotFailed: {
    code: 'WORKER_STATEMENT_RETRY_NOT_FAILED',
    messageKey: 'problem.workerStatement.retryNotFailed',
    message: 'This statement has changed state. Review its current status before trying again.',
    remedies: [{ id: 'check_statement_status' }],
  },
  retryNotAllowed: {
    code: 'WORKER_STATEMENT_RETRY_NOT_ALLOWED',
    messageKey: 'problem.workerStatement.retryNotAllowed',
    message:
      'This statement failure cannot be retried. Contact the owner or finance team for help.',
    remedies: [{ id: 'contact_finance_owner' }],
  },
  retryLimit: {
    code: 'WORKER_STATEMENT_RETRY_LIMIT',
    messageKey: 'problem.workerStatement.retryLimit',
    message: 'This statement reached its retry limit. Contact the owner or finance team for help.',
    remedies: [{ id: 'contact_finance_owner' }],
  },
  retryChanged: {
    code: 'WORKER_STATEMENT_RETRY_CHANGED',
    messageKey: 'problem.workerStatement.retryChanged',
    message:
      'This statement changed while retrying. Review its current status before trying again.',
    remedies: [{ id: 'check_statement_status' }],
  },
  artifactPending: {
    code: 'WORKER_STATEMENT_ARTIFACT_PENDING',
    messageKey: 'problem.workerStatement.artifactPending',
    message: 'This statement is still being prepared. Check its status again shortly.',
    remedies: [{ id: 'check_statement_status' }],
  },
  artifactFailed: {
    code: 'WORKER_STATEMENT_ARTIFACT_FAILED',
    messageKey: 'problem.workerStatement.artifactFailed',
    message: 'This statement could not be prepared. Review its status and retry if offered.',
    remedies: [{ id: 'check_statement_status' }],
  },
  renderFailed: {
    code: 'WORKER_STATEMENT_RENDER_FAILED',
    messageKey: 'problem.workerStatement.renderFailed',
    message:
      'The statement could not be rendered. Retry this artifact if Retry is offered; otherwise contact the owner or finance team.',
    remedies: [{ id: 'check_statement_status' }],
  },
  processingInterrupted: {
    code: 'WORKER_STATEMENT_PROCESSING_INTERRUPTED',
    messageKey: 'problem.workerStatement.processingInterrupted',
    message:
      'Statement processing stopped before completion. Retry this artifact if Retry is offered; otherwise contact the owner or finance team.',
    remedies: [{ id: 'check_statement_status' }],
  },
  integrityFailed: {
    code: 'WORKER_STATEMENT_INTEGRITY_FAILED',
    messageKey: 'problem.workerStatement.integrityFailed',
    message:
      'This statement file did not pass its integrity check. Request help from the owner or finance team.',
    remedies: [{ id: 'contact_finance_owner' }],
  },
  serviceUnavailable: {
    code: 'WORKER_STATEMENT_SERVICE_UNAVAILABLE',
    messageKey: 'problem.workerStatement.serviceUnavailable',
    message:
      'Statement generation is temporarily unavailable. Check My Pay for a completed statement before trying again.',
    remedies: [{ id: 'review_my_pay' }],
  },
  sourceInvalid: {
    code: 'WORKER_STATEMENT_SOURCE_INVALID',
    messageKey: 'problem.workerStatement.sourceInvalid',
    message:
      'Statement data could not be prepared. Contact the owner or finance team to review the source records before requesting again.',
    remedies: [{ id: 'contact_finance_owner' }],
  },
  unexpected: {
    code: 'WORKER_STATEMENT_UNEXPECTED',
    messageKey: 'problem.workerStatement.unexpected',
    message:
      'We could not confirm whether the statement action completed. Check My Pay before trying again. Reference: {correlationId}.',
    remedies: [{ id: 'review_my_pay' }],
  },
} as const satisfies Record<string, StatementProblem>;

export type StatementProblemName = keyof typeof statementProblems;

/** Malformed and absent IDs must have the same public result as foreign IDs. */
export function validWorkerStatementArtifactId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 120 &&
    value.trim() === value &&
    !value.includes('..') &&
    !/[\\/\0\r\n]/u.test(value)
  );
}

export function validWorkerStatementRequestKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 230 &&
    value.trim() === value &&
    !value.includes('..') &&
    !/[\\/\0\r\n]/u.test(value)
  );
}

export function workerStatementArtifactFailureName(
  artifact: Pick<WorkerStatementArtifact, 'errorCode'>,
): StatementProblemName {
  if (artifact.errorCode === 'ARTIFACT_INTEGRITY_FAILED') return 'integrityFailed';
  if (artifact.errorCode === 'WORKER_STATEMENT_RENDER_FAILED') return 'renderFailed';
  if (artifact.errorCode === 'FINALIZATION_INTERRUPTED' || artifact.errorCode === 'LEASE_EXPIRED')
    return 'processingInterrupted';
  return 'artifactFailed';
}

export function canRetryWorkerStatementArtifact(
  artifact: Pick<
    WorkerStatementArtifact,
    'status' | 'retryable' | 'currentAttemptNumber' | 'maxAttempts'
  >,
): boolean {
  return (
    artifact.status === 'failed' &&
    artifact.retryable === true &&
    artifact.currentAttemptNumber < artifact.maxAttempts
  );
}

export function workerStatementProblem(
  name: StatementProblemName,
  status: number,
  headers: HeadersInit = { 'cache-control': 'private, no-store' },
  extra: Record<string, unknown> = {},
): Response {
  const definition = statementProblems[name];
  const correlationId =
    typeof extra.correlationId === 'string' ? extra.correlationId : randomUUID();
  const message = definition.message.replace('{correlationId}', correlationId);
  const payload: ProblemData & { error: string } = {
    code: definition.code,
    messageKey: definition.messageKey,
    message,
    error: message,
    params: name === 'unexpected' ? { correlationId } : {},
    fieldErrors: 'fieldErrors' in definition ? definition.fieldErrors : {},
    remedies: 'remedies' in definition ? definition.remedies : [],
    correlationId,
    ...extra,
  };
  return json(payload, { status, headers });
}

/** Preserve the same 404 for missing and foreign artifact IDs. Never reflect raw repository text. */
export function workerStatementFailure(cause: unknown, headers?: HeadersInit): Response {
  function logged(name: StatementProblemName, status: number): Response {
    const correlationId = randomUUID();
    console.error('Worker statement service failure', { correlationId, cause });
    return workerStatementProblem(name, status, headers, { correlationId });
  }
  if (cause instanceof AccessDeniedError || cause instanceof V3AccessDeniedError)
    return workerStatementProblem('notFound', 404, headers);
  if (cause instanceof ConflictError || cause instanceof V3ConflictError) {
    const problem = {
      IDEMPOTENCY_CONFLICT: 'idempotencyConflict',
      'Only failed worker statements can be retried': 'retryNotFailed',
      'Worker statement failure is not retryable': 'retryNotAllowed',
      'Worker statement retry limit reached': 'retryLimit',
      'Worker statement retry was lost': 'retryChanged',
      'Worker statement artifact is not ready': 'artifactPending',
      'Worker statement artifact integrity check failed': 'integrityFailed',
    } as const;
    const known = problem[cause.message as keyof typeof problem];
    if (known) return workerStatementProblem(known, 409, headers);
    if (
      /^Worker statement (artifact was not created|execution|service actor|durable|snapshot|storage|completion|failure|integrity|attempt|claim|lease)/iu.test(
        cause.message,
      )
    )
      return logged('sourceInvalid', 503);
  }
  if (cause instanceof ValidationError || cause instanceof V3ValidationError) {
    if (/^artifactId is invalid$/iu.test(cause.message))
      return workerStatementProblem('notFound', 404, headers);
    if (/period|periodStart|periodEnd/iu.test(cause.message))
      return workerStatementProblem('periodInvalid', 400, headers);
    if (/requestKey/iu.test(cause.message))
      return workerStatementProblem('requestKeyInvalid', 400, headers);
    if (
      /Worker statement|deployment identity|generation clock|leaseFence|storageKey|semanticFilename|byteLength|media type|contentSha256|maxAttempts/iu.test(
        cause.message,
      )
    )
      return logged('sourceInvalid', 503);
  }
  if (
    cause instanceof Error &&
    (/no such table:\s*worker_statement_/iu.test(cause.message) ||
      /Unregistered durable job kind: worker_statement_artifact_render/iu.test(cause.message))
  )
    return logged('serviceUnavailable', 503);
  const correlationId = randomUUID();
  console.error('Unexpected worker statement failure', { correlationId, cause });
  return workerStatementProblem('unexpected', 500, headers, { correlationId });
}

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
        currencyBreakdown?: readonly Readonly<{
          currency: string;
          estimatedApprovedMinor: string;
          estimatedPendingMinor: string;
          approvedReimbursementMinor: string;
          pendingReimbursementMinor: string;
        }>[];
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
  locale: ReportLocale = 'en',
): WorkerStatementSnapshot {
  if (
    context.principal.userId !== worker.id ||
    !['worker', 'project_manager'].includes(context.principal.role)
  )
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
      locale: normalizeReportLocale(locale),
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
      ...(pay.currencyBreakdown ? { currencyBreakdown: pay.currencyBreakdown } : {}),
      missingCompensationRules: pay.missingCompensationRules,
      activities: activities.map((row) => ({
        id: rowString(row.id),
        projectNumber: rowString(row.project_number),
        projectName: rowString(row.project_name),
        date: rowString(row.work_date),
        category: rowString(row.category),
        activitySummary: rowString(row.activity_summary),
        actualMinutes: Number(row.minutes),
        ...(row.start_time && row.end_time
          ? {
              startTime: rowString(row.start_time),
              endTime: rowString(row.end_time),
              ...(row.break_minutes != null ? { breakMinutes: Number(row.break_minutes) } : {}),
            }
          : {}),
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
        paymentState: rowString(row.paymentState),
        paidAmountMinor: rowString(row.paidAmountMinor),
        remainingAmountMinor: rowString(row.remainingAmountMinor),
        actualPaymentOn:
          row.actualPaymentOn === null || row.actualPaymentOn === undefined
            ? null
            : String(row.actualPaymentOn),
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
    templateVersion: WORKER_STATEMENT_TEMPLATE_VERSION,
    generationVersion: workerStatementGenerationVersion(
      WORKER_STATEMENT_TEMPLATE_VERSION,
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
    locale: workerStatementArtifactLocale(artifact),
  };
}

export function workerStatementArtifactLocale(artifact: WorkerStatementArtifact): ReportLocale {
  try {
    const snapshot = JSON.parse(artifact.snapshotJson) as { locale?: unknown };
    return normalizeReportLocale(snapshot.locale);
  } catch {
    return 'en';
  }
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
