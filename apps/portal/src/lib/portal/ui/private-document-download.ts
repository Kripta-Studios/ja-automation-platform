import type { ProblemData } from '$lib/problem/contract';

type FallbackKind = 'network' | 'invalid' | 'signIn' | 'popup';

const knownProblems = {
  DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED: 'problem.document.downloadSignInRequired',
  DOCUMENT_DOWNLOAD_UNAVAILABLE: 'problem.document.downloadUnavailable',
  DOCUMENT_DOWNLOAD_FILE_MISSING: 'problem.document.downloadFileMissing',
  DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED: 'problem.document.downloadIntegrityBlocked',
  DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE: 'problem.document.downloadServiceUnavailable',
} as const;

const fallbackProblems = {
  network: {
    code: 'DOCUMENT_DOWNLOAD_NETWORK_UNAVAILABLE',
    messageKey: 'problem.document.downloadNetworkUnavailable',
    message:
      'The file could not be reached. Your document was not changed. Check your connection and try View or Download again.',
    remedies: [{ id: 'retry_download' }],
  },
  invalid: {
    code: 'DOCUMENT_DOWNLOAD_INVALID_RESPONSE',
    messageKey: 'problem.document.downloadInvalidResponse',
    message:
      'The download response could not be verified. Your document was not changed. Return to Documents and try again.',
    remedies: [{ id: 'retry_download' }],
  },
  signIn: {
    code: 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED',
    messageKey: 'problem.document.downloadSignInRequired',
    message: 'Your session ended. Sign in again, then return to Documents to download the file.',
    remedies: [{ id: 'sign_in_again' }],
  },
  popup: {
    code: 'DOCUMENT_PREVIEW_POPUP_BLOCKED',
    messageKey: 'problem.document.previewBlocked',
    message:
      'Your browser blocked the document preview. Allow pop-ups for this site or use Download.',
    remedies: [{ id: 'retry_download' }],
  },
} as const;

function safeReference(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,96}$/u.test(value) ? value : '';
}

export function documentDownloadFallback(kind: FallbackKind, reference?: unknown): ProblemData {
  return {
    ...fallbackProblems[kind],
    params: {},
    fieldErrors: {},
    correlationId: safeReference(reference),
  };
}

/** Reusable private-GET parser: the caller supplies its own stable code and remedy allowlists. */
export function typedPrivateDownloadProblem(
  payload: unknown,
  knownMessageKeys: Readonly<Record<string, ProblemData['messageKey']>>,
  allowedRemedies: ReadonlySet<string>,
  responseReference?: unknown,
): ProblemData | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const code = value.code;
  if (typeof code !== 'string' || !Object.hasOwn(knownMessageKeys, code)) return null;
  const messageKey = knownMessageKeys[code];
  if (!messageKey || value.messageKey !== messageKey || !Array.isArray(value.remedies)) return null;
  const remedies = value.remedies.filter(
    (entry): entry is { id: string } =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof entry.id === 'string' &&
      allowedRemedies.has(entry.id),
  );
  if (remedies.length !== value.remedies.length) return null;
  const correlationId = safeReference(value.correlationId) || safeReference(responseReference);
  return {
    code,
    messageKey,
    message: typeof value.message === 'string' ? value.message.slice(0, 500) : undefined,
    params: correlationId && code.endsWith('_SERVICE_UNAVAILABLE') ? { correlationId } : {},
    fieldErrors: {},
    remedies,
    correlationId,
  };
}

/** Accept only the document route's known, translated problem codes and remedies. */
export function documentDownloadProblem(
  payload: unknown,
  responseReference?: unknown,
): ProblemData | null {
  return typedPrivateDownloadProblem(
    payload,
    knownProblems,
    new Set(['sign_in_again', 'review_documents', 'retry_download', 'contact_owner']),
    responseReference,
  );
}

/** Prefer the server's semantic filename, but never pass path/control characters to download. */
export function privateDownloadFilename(header: string | null, fallback: unknown): string {
  let candidate = '';
  const encoded = /(?:^|;)\s*filename\*=UTF-8''([^;]+)/iu.exec(header ?? '');
  if (encoded?.[1]) {
    try {
      candidate = decodeURIComponent(encoded[1].trim());
    } catch {
      // A malformed server header must not become a filename.
    }
  }
  if (!candidate) {
    candidate = /(?:^|;)\s*filename="([^"]+)"/iu.exec(header ?? '')?.[1] ?? '';
  }
  if (!candidate) candidate = typeof fallback === 'string' ? fallback : '';
  const filename = candidate
    .normalize('NFKC')
    // Filename sanitization must replace ASCII control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/\u0000-\u001f\u007f]/gu, '_')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 180);
  return filename && filename !== '.' && filename !== '..' ? filename : 'document';
}
