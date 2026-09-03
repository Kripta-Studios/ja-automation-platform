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
  accountingPackArtifactBuilders,
  invoicePdf,
  periodReportPdf,
  REPORT_TEMPLATE_VERSION,
  type AccountingPackExportType,
  type ReportLocale,
} from './exports.ts';
import { runLocalizedPdfVariantJob, type LocalizedPdfJobRepository } from './localized-pdf-jobs.ts';
import {
  runWorkerStatementArtifactJob,
  WORKER_STATEMENT_JOB_KIND,
  type WorkerStatementJobRepository,
} from './worker-statement-artifacts.ts';
import { ensureNoSymlinkComponents } from './private-storage.ts';

export type { AccountingPackExportType } from './exports.ts';

export type ArtifactJobExecution = Readonly<{
  jobId: string;
  runId: string;
  tenantId: string;
  deploymentId: string;
  requiredCapability: string;
  fenceVersion: number;
}>;

export type ArtifactJobRepository = Readonly<{
  createInvoiceDraftFromJob: (
    billingRuleId: string,
    periodStart: string,
    periodEnd: string,
    execution: ArtifactJobExecution,
  ) => unknown;
}>;

export type ArtifactJobV3 = Readonly<{
  runDueJobs: (
    limit: number,
    handlers: Readonly<
      Record<string, (payload: unknown, execution: ArtifactJobExecution) => void | (() => void)>
    >,
  ) => { processed: number; failed: number; overdueMarked: number };
  invoiceSnapshotFromJob: (
    invoiceId: string,
    execution: ArtifactJobExecution,
  ) => Readonly<Record<string, unknown>>;
  recordInvoicePdfFromJob: (
    invoiceId: string,
    storageKey: string,
    sha256: string,
    byteLength: number,
    execution: ArtifactJobExecution,
  ) => void;
  refreshPeriodReportsFromJob: (
    input: Readonly<{
      projectId: string;
      periodStart: string;
      periodEnd: string;
      reportLocale?: ReportLocale;
    }>,
    execution: ArtifactJobExecution,
  ) => readonly {
    id: string;
    audience: 'customer' | 'internal';
    snapshotVersion?: number;
    snapshot: Readonly<Record<string, unknown>>;
  }[];
  recordPeriodReportPdfFromJob: (
    reportId: string,
    storageKey: string,
    sha256: string,
    byteLength: number,
    execution: ArtifactJobExecution,
  ) => void;
  accountingPackSnapshotFromJob: (
    packId: string,
    execution: ArtifactJobExecution,
  ) => Readonly<Record<string, unknown>>;
  recordAccountingPackExportFromJob: (
    packId: string,
    exportType: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    storageKey: string,
    sha256: string,
    byteLength: number,
    execution: ArtifactJobExecution,
  ) => { id: string; created: boolean };
  /**
   * Persist a failed format attempt when the database supports independent Accounting Pack
   * format statuses.  Kept optional so older adapters can still process the ready formats while
   * they roll forward to the status-aware contract.
   */
  recordAccountingPackExportFailureFromJob?: (
    packId: string,
    exportType: AccountingPackExportType,
    error: string,
    execution: ArtifactJobExecution,
  ) => void;
  cleanupTemporaryUploadReservationsFromJob?: (
    execution: ArtifactJobExecution,
    olderThan: string,
    removeFile: (storageKey: string) => void,
  ) => number;
  recordDocumentScanFromJob: (
    documentId: string,
    result: 'clean' | 'rejected',
    provider: string,
    execution: ArtifactJobExecution,
  ) => void;
}>;

export type ArtifactJobContext = Readonly<{
  repository: ArtifactJobRepository;
  v3: ArtifactJobV3;
  documentRoot?: string;
  /** Optional 0023 adapter supplied by the database/application composition root. */
  localizedPdf?: LocalizedPdfJobRepository;
  /** Optional Worker-statement artifact adapter supplied by the database/application composition root. */
  workerStatement?: WorkerStatementJobRepository;
}>;

export type AccountingPackArtifactResult = Readonly<{
  packId: string;
  exportType: AccountingPackExportType;
  status: 'ready' | 'failed';
  storageKey?: string;
  sha256?: string;
  byteLength?: number;
  error?: string;
}>;

function safeKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
    throw new Error('Unsafe artifact key');
}

function metadataForBytes(bytes: Uint8Array): { sha256: string; byteLength: number } {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

function metadataForFile(path: string): { sha256: string; byteLength: number } {
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error('Artifact destination is not a regular file');
  return metadataForBytes(readFileSync(path));
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function removeTemporaryFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

function removePrivateFile(root: string, storageKey: string): void {
  safeKey(storageKey);
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);
  const rel = relative(rootPath, target);
  if (rel === '' || rel.split(/[\\/]/).includes('..') || rel.startsWith('\\'))
    throw new Error('Temporary upload path escaped private root');
  const directory = dirname(target);
  ensureNoSymlinkComponents(rootPath, directory, 'Temporary upload cleanup');
  try {
    const stats = lstatSync(target);
    if (stats.isSymbolicLink() || !stats.isFile())
      throw new Error('Temporary upload destination is not a regular file');
    unlinkSync(target);
    fsyncDirectory(directory);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    // Directory fsync is not available on every supported filesystem/OS.  The file itself is
    // still fsynced before publication, so only the unsupported directory operation is ignored.
    if (!['EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(code ?? '')) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function artifactCollision(
  target: string,
  expected: { sha256: string; byteLength: number },
): Error {
  return new Error(
    `Artifact destination collision at ${target}; existing content does not match the generated sha256 ${expected.sha256}`,
  );
}

export function writeArtifact(
  root: string,
  storageKey: string,
  bytes: Uint8Array,
): { sha256: string; byteLength: number } {
  safeKey(storageKey);
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);
  const rel = relative(rootPath, target);
  if (rel === '' || rel.split(/[\\/]/).includes('..') || rel.startsWith('\\'))
    throw new Error('Artifact path escaped private root');
  const directory = dirname(target);
  ensureNoSymlinkComponents(rootPath, directory, 'Artifact');
  ensureNoSymlinkComponents(rootPath, directory, 'Artifact');
  const expected = metadataForBytes(bytes);

  // Idempotent retries may reuse an already-published artifact only when its complete content
  // matches the deterministic output.  Existence alone is never a successful write.
  try {
    if (lstatSync(target).isSymbolicLink())
      throw new Error('Artifact destination may not be a symbolic link');
    const existing = metadataForFile(target);
    if (existing.sha256 === expected.sha256 && existing.byteLength === expected.byteLength)
      return existing;
    throw artifactCollision(target, expected);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  // Build in the destination directory so publication is atomic on the same filesystem.  A
  // hard-link publish is used instead of rename because rename can overwrite a file created by a
  // concurrent retry on POSIX.  link(2) is an atomic no-replace publication and fails with EEXIST.
  const temporary = resolve(directory, `.${basename(target)}.${randomUUID()}.tmp`);
  let temporaryOpen = false;
  try {
    const descriptor = openSync(temporary, 'wx');
    temporaryOpen = true;
    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
        if (written <= 0) throw new Error('Artifact write made no progress');
        offset += written;
      }
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }

    // Re-check immediately before publication so a concurrent producer can only win if it wrote
    // the exact same deterministic bytes.
    try {
      if (lstatSync(target).isSymbolicLink())
        throw new Error('Artifact destination may not be a symbolic link');
      const existing = metadataForFile(target);
      if (existing.sha256 === expected.sha256 && existing.byteLength === expected.byteLength) {
        removeTemporaryFile(temporary);
        temporaryOpen = false;
        return existing;
      }
      throw artifactCollision(target, expected);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    try {
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EEXIST') throw error;
      if (lstatSync(target).isSymbolicLink())
        throw new Error('Artifact destination may not be a symbolic link');
      const existing = metadataForFile(target);
      if (existing.sha256 !== expected.sha256 || existing.byteLength !== expected.byteLength)
        throw artifactCollision(target, expected);
      removeTemporaryFile(temporary);
      temporaryOpen = false;
      return existing;
    }
    removeTemporaryFile(temporary);
    temporaryOpen = false;
    ensureNoSymlinkComponents(rootPath, directory, 'Artifact');
    fsyncDirectory(directory);

    // Verify the published file, not merely the bytes that were written to the temporary file.
    const publishedStats = lstatSync(target);
    if (publishedStats.isSymbolicLink() || !publishedStats.isFile())
      throw new Error('Artifact destination is not a regular file');
    const persisted = metadataForFile(target);
    if (persisted.sha256 !== expected.sha256 || persisted.byteLength !== expected.byteLength)
      throw new Error(`Published artifact verification failed at ${target}`);
    return persisted;
  } finally {
    if (temporaryOpen) removeTemporaryFile(temporary);
  }
}

/**
 * Execute the shared artifact handlers used by both interactive Finance actions and the durable
 * production job runner. The repository adapters stay outside this package, while all rendering,
 * storage-key, hash, and idempotency behavior remains one implementation.
 */
export function runArtifactJobs(context: ArtifactJobContext): {
  processed: number;
  failed: number;
  overdueMarked: number;
  accountingPackResults?: readonly AccountingPackArtifactResult[];
} {
  const root = resolve(context.documentRoot ?? process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  const accountingPackResults: AccountingPackArtifactResult[] = [];
  const handlers: Record<
    string,
    (
      payload: unknown,
      execution: Readonly<{
        jobId: string;
        runId: string;
        tenantId: string;
        deploymentId: string;
        requiredCapability: string;
        fenceVersion: number;
      }>,
    ) => void | (() => void)
  > = {
    invoice_pdf: (payload, execution) => {
      const invoiceId =
        typeof payload === 'object' && payload !== null && 'invoiceId' in payload
          ? String(payload.invoiceId)
          : '';
      if (!invoiceId) throw new Error('Invoice PDF job has no invoice id');
      const snapshot = context.v3.invoiceSnapshotFromJob(invoiceId, execution);
      const bytes = invoicePdf(snapshot as Parameters<typeof invoicePdf>[0]);
      const key = `invoices/${invoiceId}/${REPORT_TEMPLATE_VERSION}.pdf`;
      const metadata = writeArtifact(root, key, bytes);
      context.v3.recordInvoicePdfFromJob(
        invoiceId,
        key,
        metadata.sha256,
        metadata.byteLength,
        execution,
      );
    },
    period_close_report: (payload, execution) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const projectId = String(values.projectId ?? '');
      const periodStart = String(values.periodStart ?? '');
      const periodEnd = String(values.periodEnd ?? '');
      const reportLocale: ReportLocale =
        values.reportLocale === 'pt' || values.reportLocale === 'es' ? values.reportLocale : 'en';
      if (!projectId || !periodStart || !periodEnd)
        throw new Error('Period report job has incomplete period data');
      const reports = context.v3.refreshPeriodReportsFromJob(
        {
          projectId,
          periodStart,
          periodEnd,
          reportLocale,
        },
        execution,
      );
      for (const report of reports) {
        const bytes = periodReportPdf(report.snapshot as Parameters<typeof periodReportPdf>[0]);
        // A refreshed period snapshot is a new immutable artifact. Keep each
        // version at a distinct key so writeArtifact's collision guard can
        // reject accidental overwrites while retries remain idempotent.
        const snapshotVersion = Number(report.snapshotVersion);
        const versionSegment =
          Number.isSafeInteger(snapshotVersion) && snapshotVersion > 0
            ? `v${snapshotVersion}`
            : 'v-current';
        const key = `reports/${report.id}/${versionSegment}-${REPORT_TEMPLATE_VERSION}.pdf`;
        const metadata = writeArtifact(root, key, bytes);
        context.v3.recordPeriodReportPdfFromJob(
          report.id,
          key,
          metadata.sha256,
          metadata.byteLength,
          execution,
        );
      }
    },
    auto_draft: (payload, execution) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const billingRuleId = String(values.billingRuleId ?? '');
      const periodStart = String(values.periodStart ?? '');
      const periodEnd = String(values.periodEnd ?? '');
      if (!billingRuleId || !periodStart || !periodEnd)
        throw new Error('Automatic draft job has incomplete period data');
      context.repository.createInvoiceDraftFromJob(
        billingRuleId,
        periodStart,
        periodEnd,
        execution,
      );
    },
    accounting_pack_artifact_render: (payload, execution) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const packId = String(values.packId ?? '');
      if (!packId) throw new Error('Accounting Pack job has no pack id');
      const snapshot = context.v3.accountingPackSnapshotFromJob(packId, execution) as {
        periodStart: string;
        periodEnd: string;
        invoiceRegister: readonly Record<string, unknown>[];
        collections: readonly Record<string, unknown>[];
        workerCosts: readonly Record<string, unknown>[];
        expenseRegister: readonly Record<string, unknown>[];
        totals: Record<string, unknown>;
        totalsByCurrency?: readonly Record<string, unknown>[];
        locale?: ReportLocale | string;
      };
      const requestedFormats = Array.isArray(values.formats)
        ? new Set(values.formats.map(String))
        : null;
      if (
        requestedFormats &&
        ([...requestedFormats].length === 0 ||
          [...requestedFormats].some(
            (format) => !['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'].includes(format),
          ))
      )
        throw new Error('Accounting Pack job has invalid requested formats');
      const builders = accountingPackArtifactBuilders(snapshot).filter(
        (builder) => !requestedFormats || requestedFormats.has(builder.type),
      );
      const failures: Array<{ type: AccountingPackExportType; message: string }> = [];
      for (const artifact of builders) {
        try {
          const bytes = artifact.build();
          const key = `accounting-packs/${packId}/${artifact.type}-${REPORT_TEMPLATE_VERSION}.${artifact.extension}`;
          const metadata = writeArtifact(root, key, bytes);
          context.v3.recordAccountingPackExportFromJob(
            packId,
            artifact.type,
            key,
            metadata.sha256,
            metadata.byteLength,
            execution,
          );
          accountingPackResults.push({
            packId,
            exportType: artifact.type,
            status: 'ready',
            storageKey: key,
            sha256: metadata.sha256,
            byteLength: metadata.byteLength,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'artifact generation failed';
          failures.push({ type: artifact.type, message });
          const failure: AccountingPackArtifactResult = {
            packId,
            exportType: artifact.type,
            status: 'failed',
            error: message,
          };
          accountingPackResults.push(failure);
          try {
            context.v3.recordAccountingPackExportFailureFromJob?.(
              packId,
              artifact.type,
              message,
              execution,
            );
          } catch (recordingError) {
            failures.push({
              type: artifact.type,
              message: `failure status: ${recordingError instanceof Error ? recordingError.message : 'status recording failed'}`,
            });
          }
        }
      }
      const required = new Set<AccountingPackExportType>([
        'xlsx',
        'invoice_csv',
        'expense_csv',
        ...(process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF === 'true' ? (['pdf'] as const) : []),
        ...(process.env.JA_ACCOUNTING_PACK_REQUIRE_JSON === 'true' ? (['json'] as const) : []),
      ]);
      const requiredFailures = failures.filter((failure) => required.has(failure.type));
      if (requiredFailures.length > 0)
        throw new Error(
          requiredFailures.map((failure) => `${failure.type}: ${failure.message}`).join('; '),
        );
    },
    temporary_upload_cleanup: (payload, execution) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const olderThan = String(values.olderThan ?? '');
      if (!olderThan || Number.isNaN(Date.parse(olderThan)))
        throw new Error('Temporary upload cleanup job has an invalid boundary');
      if (!context.v3.cleanupTemporaryUploadReservationsFromJob)
        throw new Error('Temporary upload cleanup handler is unavailable');
      context.v3.cleanupTemporaryUploadReservationsFromJob(execution, olderThan, (storageKey) =>
        removePrivateFile(root, storageKey),
      );
    },
    document_scan: (payload, execution) => {
      const documentId =
        typeof payload === 'object' && payload !== null && 'documentId' in payload
          ? String(payload.documentId)
          : '';
      if (!documentId) throw new Error('Document scan job has no document id');
      const result = process.env.JA_MALWARE_SCANNER_RESULT;
      if (result !== 'clean' && result !== 'rejected')
        throw new Error('Malware scanner decision is unavailable');
      context.v3.recordDocumentScanFromJob(
        documentId,
        result,
        process.env.JA_MALWARE_SCANNER_PROVIDER ?? 'configured-scanner',
        execution,
      );
    },
  };
  if (context.localizedPdf)
    handlers.localized_pdf_variant_render = (payload, execution) => {
      const values =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const variantId = typeof values.variantId === 'string' ? values.variantId.trim() : '';
      if (!variantId) throw new Error('PAYLOAD_INVALID');
      if (!execution) throw new Error('LEASE_LOST');
      const result = runLocalizedPdfVariantJob({
        repository: context.localizedPdf!,
        payload,
        execution: {
          jobId: execution.jobId,
          jobRunId: execution.runId,
          leaseFence: execution.fenceVersion,
        },
        documentRoot: root,
        deferCompletion: true,
      });
      return result.finalize;
    };
  if (context.workerStatement)
    handlers[WORKER_STATEMENT_JOB_KIND] = (payload, execution) => {
      if (!execution) throw new Error('LEASE_LOST');
      const result = runWorkerStatementArtifactJob({
        repository: context.workerStatement!,
        payload,
        execution: {
          jobId: execution.jobId,
          jobRunId: execution.runId,
          leaseFence: execution.fenceVersion,
        },
        documentRoot: root,
        publish: (storageKey, bytes) => writeArtifact(root, storageKey, bytes),
        deferCompletion: true,
      });
      return result.finalize;
    };
  const result = context.v3.runDueJobs(20, handlers);
  // The B5 runner first expires/requeues terminal leases. Reconcile the associated localized
  // manifest after that transaction so a stale worker cannot remain in `running` indefinitely.
  context.localizedPdf?.recoverAbandonedRunning?.();
  context.workerStatement?.recoverAbandonedRunning?.();
  return accountingPackResults.length ? { ...result, accountingPackResults } : result;
}
