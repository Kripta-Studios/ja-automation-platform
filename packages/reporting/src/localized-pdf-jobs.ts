import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import {
  accountingPackPdf,
  dailyReportPdf,
  invoicePdf,
  periodReportPdf,
  REPORT_TEMPLATE_VERSION,
  technicalReportPdf,
  type ReportLocale,
} from './exports.ts';
import { ensureNoSymlinkComponents } from './private-storage.ts';

/** The durable job kind used by the B5 runner for one language variant. */
export const LOCALIZED_PDF_JOB_KIND = 'localized_pdf_variant_render' as const;

/** The capability bound to LOCALIZED_PDF_JOB_KIND in the B5 service actor registry. */
export const LOCALIZED_PDF_JOB_CAPABILITY = 'artifact.localized_pdf.render' as const;

/** Renderer identity is persisted with the immutable variant manifest. */
export const LOCALIZED_PDF_RENDERER_VERSION = `localized-pdf-${REPORT_TEMPLATE_VERSION}`;

export type LocalizedPdfJobExecution = Readonly<{
  jobId: string;
  jobRunId: string;
  leaseFence: number;
}>;

export type LocalizedPdfJobVariant = Readonly<{
  variantId: string;
  ownerType:
    | 'invoice'
    | 'period_report_revision'
    | 'accounting_pack_revision'
    | 'daily_report'
    | 'technical_report';
  ownerId: string;
  locale: ReportLocale;
  snapshotJson: string;
  storageKey: string;
  semanticFilename: string;
  templateVersion: string;
  generationVersion: string;
  currentAttemptNumber: number;
  status: 'queued' | 'running' | 'ready' | 'failed';
}>;

export type LocalizedPdfJobRepository = Readonly<{
  claimVariant: (
    variantId: string,
    execution: LocalizedPdfJobExecution,
    expectedAttemptNumber: number,
  ) => {
    variant: LocalizedPdfJobVariant;
    attemptNumber: number;
  };
  completeVariant: (
    variantId: string,
    input: Readonly<{
      attemptNumber: number;
      contentSha256: string;
      byteLength: number;
      storageKey: string;
      rendererVersion: string;
      mediaType: 'application/pdf';
      execution: LocalizedPdfJobExecution;
    }>,
  ) => LocalizedPdfJobVariant;
  failVariant: (
    variantId: string,
    input: Readonly<{
      attemptNumber: number;
      errorCode: string;
      retryable?: boolean;
      failureClass?: string;
      execution: LocalizedPdfJobExecution;
    }>,
  ) => LocalizedPdfJobVariant;
  /** Reconcile variants whose B5 lease has already reached a terminal state. */
  recoverAbandonedRunning?: (
    asOf?: Date | string,
    leaseTimeoutMs?: number,
  ) => readonly LocalizedPdfJobVariant[];
}>;

export type LocalizedPdfJobPayload = Readonly<{
  variantId: string;
  requestedAttempt?: number;
}>;

export type LocalizedPdfJobResult = Readonly<{
  variantId: string;
  status: 'ready';
  storageKey: string;
  contentSha256: string;
  byteLength: number;
  attemptNumber: number;
  finalize?: () => LocalizedPdfJobResult;
}>;

type ReportCell = string | number | bigint | boolean | null | undefined;
type ReportRow = Readonly<Record<string, ReportCell>>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeStorageKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    key.includes('://') ||
    key.includes('..')
  )
    throw new Error('Unsafe localized PDF storage key');
}

function bytesMetadata(bytes: Uint8Array): { contentSha256: string; byteLength: number } {
  assertPdfBytes(bytes);
  return {
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

function assertPdfBytes(bytes: Uint8Array): void {
  if (bytes.byteLength < 8) throw new Error('LOCALIZED_PDF_MAGIC_INVALID');
  const header = Buffer.from(bytes.subarray(0, 5)).toString('ascii');
  const tailStart = Math.max(0, bytes.byteLength - 1024);
  const tail = Buffer.from(bytes.subarray(tailStart)).toString('latin1');
  if (header !== '%PDF-' || !tail.includes('%%EOF')) throw new Error('LOCALIZED_PDF_MAGIC_INVALID');
}

function readRegularFile(path: string): Buffer {
  const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const descriptor = openSync(path, fsConstants.O_RDONLY | noFollow);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new Error('Localized PDF destination is not a regular file');
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fileMetadata(path: string): { contentSha256: string; byteLength: number } {
  const bytes = readRegularFile(path);
  return bytesMetadata(bytes);
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
    // Windows and some filesystems do not permit directory fsync. The file itself is still
    // fsynced before publication, so unsupported directory operations are safe to ignore.
    if (!['EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(code ?? '')) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function publishPdf(
  root: string,
  storageKey: string,
  bytes: Uint8Array,
): {
  contentSha256: string;
  byteLength: number;
} {
  safeStorageKey(storageKey);
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);
  const relativeTarget = relative(rootPath, target);
  if (
    !relativeTarget ||
    relativeTarget.split(/[\\/]/u).includes('..') ||
    relativeTarget.startsWith('\\') ||
    relativeTarget.startsWith('/')
  )
    throw new Error('Localized PDF path escaped private root');

  const directory = dirname(target);
  ensureNoSymlinkComponents(rootPath, directory, 'Localized PDF');
  ensureNoSymlinkComponents(rootPath, directory, 'Localized PDF');
  const expected = bytesMetadata(bytes);

  try {
    if (lstatSync(target).isSymbolicLink())
      throw new Error('Localized PDF destination may not be a symbolic link');
    const existing = fileMetadata(target);
    if (
      existing.contentSha256 === expected.contentSha256 &&
      existing.byteLength === expected.byteLength
    )
      return existing;
    throw new Error(`Localized PDF destination collision at ${target}`);
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
        if (written <= 0) throw new Error('Localized PDF write made no progress');
        offset += written;
      }
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }

    try {
      if (lstatSync(target).isSymbolicLink())
        throw new Error('Localized PDF destination may not be a symbolic link');
      const existing = fileMetadata(target);
      if (
        existing.contentSha256 === expected.contentSha256 &&
        existing.byteLength === expected.byteLength
      ) {
        removeTemporary(temporary);
        temporaryOpen = false;
        return existing;
      }
      throw new Error(`Localized PDF destination collision at ${target}`);
    } catch (error) {
      if (!missingFile(error)) throw error;
    }

    try {
      // Hard-link publication is atomic and never overwrites a concurrent producer.
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EEXIST') throw error;
      if (lstatSync(target).isSymbolicLink())
        throw new Error('Localized PDF destination may not be a symbolic link');
      const existing = fileMetadata(target);
      if (
        existing.contentSha256 !== expected.contentSha256 ||
        existing.byteLength !== expected.byteLength
      )
        throw new Error(`Localized PDF destination collision at ${target}`);
      removeTemporary(temporary);
      temporaryOpen = false;
      return existing;
    }
    removeTemporary(temporary);
    temporaryOpen = false;
    ensureNoSymlinkComponents(rootPath, directory, 'Localized PDF');
    fsyncDirectory(directory);

    const persisted = fileMetadata(target);
    if (
      persisted.contentSha256 !== expected.contentSha256 ||
      persisted.byteLength !== expected.byteLength
    )
      throw new Error('Published localized PDF failed byte verification');
    return persisted;
  } finally {
    if (temporaryOpen) removeTemporary(temporary);
  }
}

function parseSnapshot(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('LOCALIZED_PDF_SNAPSHOT_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('LOCALIZED_PDF_SNAPSHOT_INVALID');
  return parsed as Record<string, unknown>;
}

function nestedSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const nested = row.snapshot_json;
  if (typeof nested !== 'string' || !nested.trim()) return row;
  try {
    const parsed = JSON.parse(nested) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return { ...row, ...(parsed as Record<string, unknown>) };
  } catch {
    // A source snapshot is still rendered as the source row; invalid optional nested fields do
    // not allow a worker to invent new business data.
  }
  return row;
}

function stringValue(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value) !== '') return String(value);
  }
  return undefined;
}

function numberValue(row: Record<string, unknown>, ...keys: string[]): string | number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' || typeof value === 'string') return value;
  }
  return undefined;
}

function renderVariant(variant: LocalizedPdfJobVariant): Uint8Array {
  const row = nestedSnapshot(parseSnapshot(variant.snapshotJson));
  const locale = variant.locale;
  switch (variant.ownerType) {
    case 'invoice':
      return invoicePdf({
        ...row,
        number: stringValue(row, 'number', 'invoice_number') ?? variant.ownerId,
        locale,
        calculation:
          row.calculation && typeof row.calculation === 'object'
            ? (row.calculation as Record<string, unknown>)
            : {
                currency: stringValue(row, 'currency') ?? 'USD',
                subtotalMinor: numberValue(row, 'subtotalMinor', 'subtotal_minor'),
                taxMinor: numberValue(row, 'taxMinor', 'tax_minor'),
                totalMinor: numberValue(row, 'totalMinor', 'total_minor'),
              },
        lines: Array.isArray(row.lines) ? row.lines : [],
      });
    case 'period_report_revision':
      return periodReportPdf({
        ...row,
        locale,
        periodStart: stringValue(row, 'periodStart', 'period_start') ?? '1970-01-01',
        periodEnd: stringValue(row, 'periodEnd', 'period_end') ?? '1970-01-01',
        project:
          row.project && typeof row.project === 'object'
            ? (row.project as Record<string, unknown>)
            : {
                number: stringValue(row, 'project_number'),
                name: stringValue(row, 'project_name'),
              },
      });
    case 'accounting_pack_revision':
      return accountingPackPdf({
        ...row,
        locale,
        periodStart: stringValue(row, 'periodStart', 'period_start') ?? '1970-01-01',
        periodEnd: stringValue(row, 'periodEnd', 'period_end') ?? '1970-01-01',
        currency: stringValue(row, 'currency') ?? 'USD',
        totals:
          row.totals && typeof row.totals === 'object'
            ? (row.totals as ReportRow)
            : {
                subtotalMinor: numberValue(row, 'subtotalMinor', 'subtotal_minor'),
                totalMinor: numberValue(row, 'totalMinor', 'total_minor'),
              },
        totalsByCurrency: Array.isArray(row.totalsByCurrency) ? row.totalsByCurrency : [],
      });
    case 'daily_report':
      return dailyReportPdf({
        ...row,
        locale,
        date: stringValue(row, 'date', 'workDate', 'work_date') ?? '1970-01-01',
        project:
          row.project && typeof row.project === 'object'
            ? (row.project as Record<string, unknown>)
            : {
                number: stringValue(row, 'project_number'),
                name: stringValue(row, 'project_name'),
              },
        summary: stringValue(row, 'summary') ?? '',
      });
    case 'technical_report':
      return technicalReportPdf({
        ...row,
        locale,
        date:
          stringValue(row, 'date', 'reportDate', 'report_date', 'createdAt', 'created_at') ??
          '1970-01-01',
        project:
          row.project && typeof row.project === 'object'
            ? (row.project as Record<string, unknown>)
            : {
                number: stringValue(row, 'project_number'),
                name: stringValue(row, 'project_name'),
              },
        system: stringValue(row, 'system', 'systemName', 'system_name') ?? '',
        site: stringValue(row, 'site', 'plantSite', 'plant_site') ?? '',
        area: stringValue(row, 'area', 'areaLine', 'area_line') ?? '',
        station: stringValue(row, 'station', 'stationMachine', 'station_machine') ?? '',
        changeSummary: stringValue(row, 'changeSummary', 'change_summary') ?? '',
      });
  }
}

function validatePayload(payload: unknown): LocalizedPdfJobPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('PAYLOAD_INVALID');
  const values = payload as Record<string, unknown>;
  const variantId = typeof values.variantId === 'string' ? values.variantId.trim() : '';
  if (!variantId || variantId.length > 200 || variantId.includes('\0'))
    throw new Error('PAYLOAD_INVALID');
  const requestedAttempt = values.requestedAttempt;
  if (
    requestedAttempt !== undefined &&
    (!Number.isSafeInteger(requestedAttempt) || Number(requestedAttempt) < 1)
  )
    throw new Error('PAYLOAD_INVALID');
  return {
    variantId,
    ...(requestedAttempt === undefined ? {} : { requestedAttempt: Number(requestedAttempt) }),
  };
}

/**
 * Render one queued locale variant using only the immutable database snapshot. The caller must
 * supply the fenced execution envelope produced by the B5 runner; no client payload can grant it.
 */
export function runLocalizedPdfVariantJob(
  input: Readonly<{
    repository: LocalizedPdfJobRepository;
    payload: unknown;
    execution: LocalizedPdfJobExecution;
    documentRoot: string;
    deferCompletion?: boolean;
  }>,
): LocalizedPdfJobResult {
  const payload = validatePayload(input.payload);
  if (payload.requestedAttempt === undefined) throw new Error('PAYLOAD_INVALID');
  const claim = input.repository.claimVariant(
    payload.variantId,
    input.execution,
    payload.requestedAttempt,
  );
  try {
    const bytes = renderVariant({ ...claim.variant, locale: claim.variant.locale });
    const metadata = publishPdf(input.documentRoot, claim.variant.storageKey, bytes);
    const result: LocalizedPdfJobResult = {
      variantId: payload.variantId,
      status: 'ready',
      storageKey: claim.variant.storageKey,
      contentSha256: metadata.contentSha256,
      byteLength: metadata.byteLength,
      attemptNumber: claim.attemptNumber,
    };
    const finalize = (): LocalizedPdfJobResult => {
      const completed = input.repository.completeVariant(payload.variantId, {
        attemptNumber: claim.attemptNumber,
        contentSha256: metadata.contentSha256,
        byteLength: metadata.byteLength,
        storageKey: claim.variant.storageKey,
        rendererVersion: LOCALIZED_PDF_RENDERER_VERSION,
        mediaType: 'application/pdf',
        execution: input.execution,
      });
      if (completed.status !== 'ready') throw new Error('LOCALIZED_PDF_COMPLETION_FAILED');
      return result;
    };
    return input.deferCompletion ? { ...result, finalize } : finalize();
  } catch (error) {
    // A failed render is scoped to this locale/attempt. A stale fence is deliberately not
    // converted into a second failure transition because another worker owns the lease.
    if (errorMessage(error) === 'LEASE_LOST') throw error;
    try {
      input.repository.failVariant(payload.variantId, {
        attemptNumber: claim.attemptNumber,
        errorCode: 'LOCALIZED_PDF_RENDER_FAILED',
        failureClass: errorMessage(error).slice(0, 120),
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

export function localizePdfJobPayload(payload: unknown): LocalizedPdfJobPayload {
  return validatePayload(payload);
}
