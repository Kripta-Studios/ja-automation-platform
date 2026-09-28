import { createHash, randomUUID } from 'node:crypto';
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
  LocalizedPdfRepository,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  type LocalizedPdfLocale,
  type LocalizedPdfOwnerType,
  type LocalizedPdfVariant,
} from '@ja/database';
import {
  LOCALIZED_PDF_JOB_KIND,
  localizedPdfTemplateVersion,
  type LocalizedPdfJobVariant,
} from '@ja/reporting';
import type { ProblemData } from '$lib/problem/contract';

export function localizedPdfGenerationVersion(ownerType: LocalizedPdfOwnerType): string {
  return `localized-${ownerType}-${localizedPdfTemplateVersion(ownerType)}-identity`;
}

export const LOCALIZED_PDF_OWNER_TYPES: readonly LocalizedPdfOwnerType[] = [
  'invoice',
  'period_report_revision',
  'accounting_pack_revision',
  'daily_report',
  'technical_report',
];

export const LOCALIZED_PDF_LOCALES: readonly LocalizedPdfLocale[] = ['en', 'es', 'pt'];

export function localizedPdfDownloadLocation(url: URL, variantId: string): string {
  const marker = '/app/api/localized-pdf';
  const markerIndex = url.pathname.indexOf(marker);
  const basePath = markerIndex >= 0 ? url.pathname.slice(0, markerIndex) : '';
  return new URL(`${basePath}${marker}/${encodeURIComponent(variantId)}/download`, url).toString();
}

export function isLocalizedPdfOwnerType(value: unknown): value is LocalizedPdfOwnerType {
  return (
    typeof value === 'string' && (LOCALIZED_PDF_OWNER_TYPES as readonly string[]).includes(value)
  );
}

export function isLocalizedPdfLocale(value: unknown): value is LocalizedPdfLocale {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase().replace('_', '-');
  return (
    normalized === 'en' ||
    normalized === 'en-us' ||
    normalized === 'es' ||
    normalized === 'es-es' ||
    normalized === 'pt' ||
    normalized === 'pt-br'
  );
}

export function normalizedLocalizedPdfLocale(value: unknown): LocalizedPdfLocale {
  if (!isLocalizedPdfLocale(value)) throw new ValidationError('Locale must be en, es or pt-BR');
  const normalized = String(value).trim().toLowerCase().replace('_', '-');
  if (normalized === 'es' || normalized === 'es-es') return 'es';
  if (normalized === 'pt' || normalized === 'pt-br') return 'pt';
  return 'en';
}

/** Public response envelope. Snapshots, storage keys and internal hashes never cross this edge. */
export function publicLocalizedPdfVariant(variant: LocalizedPdfVariant) {
  return {
    variantId: variant.variantId,
    ownerType: variant.ownerType,
    ownerId: variant.ownerId,
    locale: variant.locale,
    localeTag: variant.localeTag,
    documentTag: variant.documentTag,
    templateVersion: variant.templateVersion,
    generationVersion: variant.generationVersion,
    status: variant.status,
    currentAttemptNumber: variant.currentAttemptNumber,
    semanticFilename: variant.semanticFilename,
    mediaType: variant.mediaType,
    byteLength: variant.byteLength,
    rendererVersion: variant.rendererVersion,
    readyAt: variant.readyAt,
    errorCode: variant.errorCode,
    retryable: variant.retryable,
    integrityBlocked: variant.integrityBlocked,
    maxAttempts: variant.maxAttempts,
    requestedAt: variant.requestedAt,
    startedAt: variant.startedAt,
    finishedAt: variant.finishedAt,
    updatedAt: variant.updatedAt,
  };
}

export function enqueueLocalizedPdfRender(
  context: Readonly<{
    v3: {
      enqueueJob: (kind: string, key: string, payload: unknown) => { id: string; created: boolean };
    };
  }>,
  variant: Pick<LocalizedPdfJobVariant, 'variantId' | 'currentAttemptNumber' | 'status'>,
): { id: string; created: boolean } | null {
  // Only a queued attempt can be enqueued. Existing running/ready/failed rows are owned by a
  // currently active run, a completed artifact, or an explicit retry decision respectively.
  if (variant.status !== 'queued') return null;
  return context.v3.enqueueJob(
    LOCALIZED_PDF_JOB_KIND,
    `localized-pdf:${variant.variantId}:attempt:${variant.currentAttemptNumber}`,
    { variantId: variant.variantId, requestedAttempt: variant.currentAttemptNumber },
  );
}

function pdfMagicValid(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  const header = Buffer.from(bytes.subarray(0, 5)).toString('ascii');
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  return header === '%PDF-' && tail.includes('%%EOF');
}

function assertNoSymlinkParents(root: string, directory: string): void {
  const rootPath = resolve(root);
  const targetDirectory = resolve(directory);
  const relativeDirectory = relative(rootPath, targetDirectory);
  if (
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error('Localized PDF path escaped private root');
  const rootStats = lstatSync(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('Localized PDF root must be a real directory');
  let cursor = rootPath;
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, component);
    const stats = lstatSync(cursor);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error('Localized PDF parent must be a real directory');
  }
}

function readRegularFileNoFollow(path: string): Buffer {
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

export function localizedPdfRepository(
  sqlite: ConstructorParameters<typeof LocalizedPdfRepository>[0],
) {
  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  return new LocalizedPdfRepository(sqlite, {
    verify: (storageKey) => {
      try {
        const target = resolve(root, storageKey);
        const relativeTarget = relative(root, target);
        if (
          !relativeTarget ||
          relativeTarget.split(/[\\/]/u).includes('..') ||
          relativeTarget.startsWith('\\') ||
          relativeTarget.startsWith('/')
        )
          return { exists: false, byteLength: null, contentSha256: null };
        assertNoSymlinkParents(root, dirname(target));
        const targetStats = lstatSync(target);
        if (!targetStats.isFile() || targetStats.isSymbolicLink())
          return { exists: false, byteLength: null, contentSha256: null };
        const bytes = readRegularFileNoFollow(target);
        const magicValid = pdfMagicValid(bytes);
        return {
          exists: true,
          byteLength: bytes.byteLength,
          contentSha256: createHash('sha256').update(bytes).digest('hex'),
          mediaType: magicValid ? 'application/pdf' : 'application/octet-stream',
          magicValid,
        };
      } catch {
        return { exists: false, byteLength: null, contentSha256: null };
      }
    },
  });
}

type LocalizedPdfProblemKind =
  | 'signInRequired'
  | 'unavailable'
  | 'requestInvalid'
  | 'requestChanged'
  | 'invoiceSnapshotRequired'
  | 'retryNotFailed'
  | 'retryNotAllowed'
  | 'retryLimitReached'
  | 'retryStale'
  | 'downloadPending'
  | 'downloadFailed'
  | 'downloadIntegrity'
  | 'downloadStale'
  | 'unexpected';

const localizedPdfProblems: Record<
  LocalizedPdfProblemKind,
  {
    code: string;
    messageKey: `problem.localizedPdf.${string}` | 'action.error.unauthenticated';
    message: string;
    remedies: string[];
  }
> = {
  signInRequired: {
    code: 'PDF_SIGN_IN_REQUIRED',
    messageKey: 'action.error.unauthenticated',
    message: 'Sign in again to continue.',
    remedies: ['sign_in_again'],
  },
  unavailable: {
    code: 'PDF_DOWNLOAD_UNAVAILABLE',
    messageKey: 'problem.localizedPdf.downloadUnavailable',
    message:
      'This PDF is unavailable or your access changed. Refresh the record and request a current PDF if permitted.',
    remedies: ['refresh_pdf_status'],
  },
  requestInvalid: {
    code: 'PDF_REQUEST_INVALID',
    messageKey: 'problem.localizedPdf.requestInvalid',
    message:
      'The PDF request is invalid. Review the selected document and language, then try again.',
    remedies: ['review_current_record'],
  },
  requestChanged: {
    code: 'PDF_REQUEST_CHANGED',
    messageKey: 'problem.localizedPdf.requestChanged',
    message:
      'The PDF source or request values changed since this request was first made. Review the current record before generating again.',
    remedies: ['review_current_record'],
  },
  invoiceSnapshotRequired: {
    code: 'PDF_INVOICE_SNAPSHOT_REQUIRED',
    messageKey: 'problem.localizedPdf.invoiceSnapshotRequired',
    message:
      'This invoice has no issued snapshot to render. Review the invoice status before requesting a PDF.',
    remedies: ['review_current_record'],
  },
  retryNotFailed: {
    code: 'PDF_RETRY_NOT_FAILED',
    messageKey: 'problem.localizedPdf.retryNotFailed',
    message: 'This PDF is not failed. Refresh its status before retrying.',
    remedies: ['refresh_pdf_status'],
  },
  retryNotAllowed: {
    code: 'PDF_RETRY_NOT_ALLOWED',
    messageKey: 'problem.localizedPdf.retryNotAllowed',
    message:
      'This PDF failure cannot be retried. Review the current record and ask an authorized owner to investigate before requesting another PDF.',
    remedies: ['refresh_pdf_status', 'contact_owner'],
  },
  retryLimitReached: {
    code: 'PDF_RETRY_LIMIT_REACHED',
    messageKey: 'problem.localizedPdf.retryLimitReached',
    message:
      'This PDF reached its retry limit. Ask an authorized owner to review the failure before requesting another PDF.',
    remedies: ['refresh_pdf_status', 'contact_owner'],
  },
  retryStale: {
    code: 'PDF_RETRY_STALE',
    messageKey: 'problem.localizedPdf.retryStale',
    message: 'The PDF changed during retry. Refresh its status before taking another action.',
    remedies: ['refresh_pdf_status'],
  },
  downloadPending: {
    code: 'PDF_DOWNLOAD_PENDING',
    messageKey: 'problem.localizedPdf.downloadPending',
    message: 'This PDF is still being prepared. Refresh its status and download when it is ready.',
    remedies: ['refresh_pdf_status'],
  },
  downloadFailed: {
    code: 'PDF_DOWNLOAD_FAILED',
    messageKey: 'problem.localizedPdf.downloadFailed',
    message:
      'This PDF could not be prepared. Refresh its status; retry only if the updated record offers that action.',
    remedies: ['refresh_pdf_status'],
  },
  downloadIntegrity: {
    code: 'PDF_DOWNLOAD_INTEGRITY',
    messageKey: 'problem.localizedPdf.downloadIntegrity',
    message:
      'The PDF failed its integrity check and download was blocked. Ask an authorized owner to review the artifact.',
    remedies: ['refresh_pdf_status', 'contact_owner'],
  },
  downloadStale: {
    code: 'PDF_DOWNLOAD_STALE',
    messageKey: 'problem.localizedPdf.downloadStale',
    message: 'The PDF is no longer ready to download. Refresh its status before trying again.',
    remedies: ['refresh_pdf_status'],
  },
  unexpected: {
    code: 'PDF_UNEXPECTED_ERROR',
    messageKey: 'problem.localizedPdf.unexpected',
    message:
      'We could not confirm this PDF action. Check the current PDF status before trying again. Reference: {correlationId}.',
    remedies: ['refresh_pdf_status'],
  },
};

/** The compatibility `error` field remains safe; clients should render `messageKey`. */
export function localizedPdfProblem(
  kind: LocalizedPdfProblemKind,
  options: { owner?: boolean; correlationId?: string } = {},
): ProblemData & { error: string } {
  const definition = localizedPdfProblems[kind];
  const correlationId = options.correlationId ?? randomUUID();
  const remedies = definition.remedies.map((id) => ({
    id: id === 'contact_owner' && options.owner ? 'review_current_record' : id,
  }));
  return {
    code: definition.code,
    messageKey: definition.messageKey,
    message: definition.message.replace('{correlationId}', correlationId),
    params: kind === 'unexpected' ? { correlationId } : {},
    fieldErrors: {},
    remedies,
    correlationId,
    error: definition.message.replace('{correlationId}', correlationId),
  };
}

export function mapLocalizedPdfError(
  error: unknown,
  options: { owner?: boolean } = {},
): { status: 400 | 404 | 409; body: ProblemData & { error: string } } | null {
  if (error instanceof AccessDeniedError || error instanceof V3AccessDeniedError)
    return { status: 404, body: localizedPdfProblem('unavailable') };
  if (error instanceof ConflictError || error instanceof V3ConflictError) {
    const kind: LocalizedPdfProblemKind =
      error.message === 'Only failed variants can be retried'
        ? 'retryNotFailed'
        : error.message === 'Localized PDF failure is not retryable'
          ? 'retryNotAllowed'
          : error.message === 'Localized PDF retry limit reached'
            ? 'retryLimitReached'
            : error.message === 'IDEMPOTENCY_CONFLICT'
              ? 'requestChanged'
              : error.message === 'Issued invoice snapshot required for a localized PDF'
                ? 'invoiceSnapshotRequired'
                : 'retryStale';
    return { status: 409, body: localizedPdfProblem(kind, options) };
  }
  if (error instanceof ValidationError || error instanceof V3ValidationError)
    return { status: 400, body: localizedPdfProblem('requestInvalid') };
  return null;
}
