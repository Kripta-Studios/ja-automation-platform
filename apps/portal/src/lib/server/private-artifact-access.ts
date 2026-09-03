import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir as mkdirDirectory,
  open as openFile,
  realpath,
  unlink as unlinkFile,
  type FileHandle,
} from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { dirname, parse, relative, resolve } from 'node:path';
import { json } from '@sveltejs/kit';
import { newId, type Principal } from '@ja/domain';
import {
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  readLiveSessionStepUp,
} from '@ja/database';

/**
 * The compatibility download routes pre-date the durable localized-artifact
 * repository.  Keep their security boundary in one place so a new route
 * cannot accidentally re-introduce path traversal, IDOR or weak download
 * headers.
 */
export type PrivateArtifactKind = 'accounting_pack' | 'invoice' | 'period_report';

export type PrivateArtifactSubject = Readonly<{
  kind: PrivateArtifactKind;
  entityType: 'accounting_pack' | 'invoice' | 'period_report';
  entityId: string;
  projectId?: string;
  /** Audience is present for period reports so routes can retain the same
   * object-scope authorization while applying stronger controls to internal
   * finance/audit artifacts. */
  audience?: string;
  tenantId: string;
  deploymentId: string;
}>;

export type PrivateArtifactMetadata = Readonly<{
  storageKey: string;
  sha256: string;
  byteLength?: number;
  mediaType: string;
  filename: string;
}>;

export type PrivateArtifactDownloadOptions = Readonly<{
  sqlite: SqliteLike;
  principal: Principal;
  kind: PrivateArtifactKind;
  id: string;
  loadMetadata: () => PrivateArtifactMetadata;
  expectedMediaType?: string;
  /**
   * Restricted finance artifacts require a recent proof on this exact session.
   * Operational project reports can explicitly opt out because their repository
   * authorization and access audit already protect the ordinary download path.
   */
  requireStepUp?: boolean | ((subject: PrivateArtifactSubject) => boolean);
  now?: () => number;
  stepUpWindowMs?: number;
  /**
   * When set, the response is this renderer output rather than the stored
   * file. Used for invoice PDFs so Open/Download present the frozen snapshot
   * with the current invoice layout without mutating a terminal stored artifact.
   */
  generateBytes?: () => Uint8Array;
}>;

type SqliteLike = DatabaseSync;

type DeploymentIdentity = Readonly<{ tenant_id: string; deployment_id: string }>;

const STEP_UP_WINDOW_MS = 10 * 60_000;
const B5_AUDIT_CONTRACT_VERSION = 'B5-R4';

const NOT_FOUND_MESSAGE = 'File unavailable';
const STEP_UP_MESSAGE = 'Confirm your identity to continue';
const INTEGRITY_MESSAGE = 'Private artifact integrity check failed';

function notFound(): Response {
  // Missing and unauthorized objects intentionally share a response.  The
  // caller must not learn whether an object exists outside its scope.
  return json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
}

function conflict(message: string): Response {
  return json({ error: message }, { status: 409 });
}

function serverError(): Response {
  return json({ error: 'Private artifact is unavailable' }, { status: 500 });
}

export class PrivateArtifactPathIntegrityError extends Error {}

function isSafeIdentifier(value: string): boolean {
  return (
    Boolean(value) &&
    value.length <= 200 &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    }) &&
    !/[\/\\]/u.test(value)
  );
}

function deployment(sqlite: SqliteLike): DeploymentIdentity | null {
  const row = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as DeploymentIdentity | undefined;
  return row ?? null;
}

function isFinanceRole(principal: Principal): boolean {
  return principal.role === 'owner_admin' || principal.role === 'finance_admin';
}

function isFinanceReadableRole(principal: Principal): boolean {
  return isFinanceRole(principal) || principal.role === 'auditor_read_only';
}

function hasProjectScope(principal: Principal, projectId: string): boolean {
  return principal.projectIds.has(projectId);
}

/**
 * Authorize the object before asking the repository for readiness or metadata.
 * Every denial is represented by null, allowing routes to return the same 404
 * for a missing object and an object outside the caller's scope.
 */
export function authorizePrivateArtifact(
  sqlite: SqliteLike,
  principal: Principal,
  kind: PrivateArtifactKind,
  id: string,
): PrivateArtifactSubject | null {
  if (!isSafeIdentifier(id)) return null;
  const identity = deployment(sqlite);
  if (!identity) return null;

  if (kind === 'accounting_pack') {
    if (!isFinanceRole(principal)) return null;
    const row = sqlite.prepare('SELECT id FROM accounting_pack_run WHERE id=?').get(id) as
      | { id: string }
      | undefined;
    if (!row) return null;
    return {
      kind,
      entityType: 'accounting_pack',
      entityId: row.id,
      tenantId: identity.tenant_id,
      deploymentId: identity.deployment_id,
    };
  }

  if (kind === 'invoice') {
    // The legacy repository exposes invoice PDFs only to finance-read roles;
    // keep that rule here before querying the artifact metadata.
    if (!isFinanceReadableRole(principal)) return null;
    const row = sqlite
      .prepare(
        `SELECT i.id,i.project_id
         FROM invoice i
         JOIN project p ON p.id=i.project_id
         WHERE i.id=?
           AND COALESCE(i.tenant_id,?)=?
           AND COALESCE(i.deployment_id,?)=?`,
      )
      .get(
        id,
        identity.tenant_id,
        identity.tenant_id,
        identity.deployment_id,
        identity.deployment_id,
      ) as { id: string; project_id: string } | undefined;
    if (!row) return null;
    return {
      kind,
      entityType: 'invoice',
      entityId: row.id,
      projectId: row.project_id,
      tenantId: identity.tenant_id,
      deploymentId: identity.deployment_id,
    };
  }

  const row = sqlite
    .prepare(
      `SELECT r.id,r.project_id,r.audience
       FROM period_report r
       JOIN project p ON p.id=r.project_id
       WHERE r.id=?`,
    )
    .get(id) as { id: string; project_id: string; audience: string } | undefined;
  if (!row) return null;

  // Internal reports are finance/auditor material.  Customer reports can be
  // read by an assigned worker or project manager, in addition to the global
  // finance/auditor readers used by the repository contract.
  const globalReader = isFinanceReadableRole(principal);
  const scopedReader = hasProjectScope(principal, row.project_id);
  // Only the reviewed customer audience is eligible for project-scoped access.
  // Unknown, null-like, or future audience values must fail closed as restricted
  // financial material instead of silently inheriting the customer policy.
  if (row.audience !== 'customer' ? !globalReader : !globalReader && !scopedReader) return null;
  return {
    kind,
    entityType: 'period_report',
    entityId: row.id,
    projectId: row.project_id,
    audience: row.audience,
    tenantId: identity.tenant_id,
    deploymentId: identity.deployment_id,
  };
}

function recentStepUp(
  sqlite: SqliteLike,
  principal: Principal,
  now: () => number,
  windowMs: number,
): boolean {
  return readLiveSessionStepUp(sqlite, principal, now(), windowMs) !== null;
}

/**
 * Enforce the session-bound step-up contract at a route/action boundary.
 * Principals without a bound human session are deliberately rejected: this
 * guard is for interactive high-risk operations only.
 */
export function assertRecentStepUp(
  sqlite: SqliteLike,
  principal: Principal,
  now: () => number = Date.now,
  windowMs = STEP_UP_WINDOW_MS,
): void {
  if (!recentStepUp(sqlite, principal, now, windowMs))
    throw new V3AccessDeniedError(STEP_UP_MESSAGE);
}

function safeStorageKey(storageKey: string): boolean {
  return Boolean(
    storageKey &&
    !storageKey.startsWith('/') &&
    !storageKey.startsWith('\\') &&
    !storageKey.includes('\\') &&
    !storageKey.split('/').includes('..') &&
    !storageKey.split('/').includes('.') &&
    !storageKey.includes(':') &&
    ![...storageKey].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    }) &&
    !storageKey.toLowerCase().includes('%2e') &&
    !storageKey.toLowerCase().includes('://'),
  );
}

async function assertNoSymlinkParents(root: string, directory: string): Promise<void> {
  const rootPath = resolve(root);
  const targetDirectory = resolve(directory);
  const relativeDirectory = relative(rootPath, targetDirectory);
  if (
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error('Private artifact path escaped its root');
  const rootStats = await lstat(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('Private artifact root must be a real directory');
  let cursor = rootPath;
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, component);
    const stats = await lstat(cursor);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new PrivateArtifactPathIntegrityError(
        'Private artifact parent must be a real directory',
      );
  }
}

function writeStorageKeyIsSafe(storageKey: string): boolean {
  return safeStorageKey(storageKey) && storageKey.split('/').every((segment) => Boolean(segment));
}

/** Resolve the one configured private-artifact root used by every download path. */
export function privateArtifactRoot(): string {
  return resolve(process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents');
}

type FsConstantsWithDescriptorFlags = typeof fsConstants & {
  O_DIRECTORY?: number;
  O_NOFOLLOW?: number;
};

const descriptorFsConstants = fsConstants as FsConstantsWithDescriptorFlags;
const noFollowFlag = descriptorFsConstants.O_NOFOLLOW ?? 0;
const directoryFlag = descriptorFsConstants.O_DIRECTORY ?? 0;

/**
 * Node does not expose openat(2) directly.  Linux's proc-fd directory handles
 * provide the equivalent descriptor-relative walk: once a parent handle is
 * opened, replacing an ancestor pathname cannot redirect the next component.
 * Windows has no equivalent in the Node fs API, so it uses the conservative
 * lstat + O_EXCL/O_NOFOLLOW fallback below and records that limitation in the
 * security handoff.
 */
const supportsDescriptorRelativeWalk = process.platform === 'linux' && directoryFlag !== 0;

function descriptorChildPath(parent: FileHandle, component: string): string {
  return `/proc/self/fd/${parent.fd}/${component}`;
}

function pathComponentsInsideRoot(root: string, directory: string): string[] {
  const rootPath = resolve(root);
  const targetDirectory = resolve(directory);
  const relativeDirectory = relative(rootPath, targetDirectory);
  if (
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error('Private artifact path escaped its root');
  return relativeDirectory.split(/[\\/]/u).filter(Boolean);
}

async function assertCanonicalPrivatePath(root: string, target: string): Promise<void> {
  const canonicalRoot = resolve(await realpath(root));
  const canonicalTarget = resolve(await realpath(target));
  const canonicalRelative = relative(canonicalRoot, canonicalTarget);
  if (
    !canonicalRelative ||
    canonicalRelative.split(/[\\/]/u).some((segment) => segment === '..') ||
    canonicalRelative.startsWith('/') ||
    canonicalRelative.startsWith('\\')
  )
    throw new Error('Private artifact symlink/reparse path escaped its root');
}

async function openDirectoryDescriptor(
  root: string,
  directory: string,
  createMissing: boolean,
): Promise<FileHandle> {
  const rootPath = resolve(root);
  const components = pathComponentsInsideRoot(rootPath, directory);
  let current: FileHandle | undefined;
  try {
    try {
      current = await openFile(rootPath, fsConstants.O_RDONLY | directoryFlag | noFollowFlag);
    } catch (error) {
      if (!createMissing || !isErrno(error, 'ENOENT')) throw error;
      // The configured root is trusted configuration.  It is still opened
      // with O_NOFOLLOW immediately afterwards so a symlink cannot become the
      // private root silently.
      await mkdirDirectory(rootPath, { recursive: true });
      current = await openFile(rootPath, fsConstants.O_RDONLY | directoryFlag | noFollowFlag);
    }

    for (const component of components) {
      let next: FileHandle;
      try {
        next = await openFile(
          descriptorChildPath(current, component),
          fsConstants.O_RDONLY | directoryFlag | noFollowFlag,
        );
      } catch (error) {
        if (!createMissing || !isErrno(error, 'ENOENT')) throw error;
        try {
          await mkdirDirectory(descriptorChildPath(current, component));
        } catch (mkdirError) {
          if (!isErrno(mkdirError, 'EEXIST')) throw mkdirError;
        }
        next = await openFile(
          descriptorChildPath(current, component),
          fsConstants.O_RDONLY | directoryFlag | noFollowFlag,
        );
      }
      await current.close();
      current = next;
    }
    return current;
  } catch (error) {
    await current?.close().catch(() => undefined);
    // Kernel-specific no-follow failures must not bubble through a portal
    // action/route as filesystem implementation details. The same normalized
    // domain error is used for a symlink, non-directory or unreadable parent.
    if (
      isErrno(error, 'ELOOP') ||
      isErrno(error, 'ENOTDIR') ||
      isErrno(error, 'EPERM') ||
      isErrno(error, 'EACCES')
    )
      throw new PrivateArtifactPathIntegrityError(
        'Private artifact parent must be a real directory',
      );
    throw error;
  }
}

async function ensurePrivateStorageDirectory(root: string, directory: string): Promise<void> {
  const rootPath = resolve(root);
  const targetDirectory = resolve(directory);
  pathComponentsInsideRoot(rootPath, targetDirectory);

  if (supportsDescriptorRelativeWalk) {
    const directoryHandle = await openDirectoryDescriptor(rootPath, targetDirectory, true);
    await directoryHandle.close();
    return;
  }

  // Create one component at a time.  Recursive mkdir can follow a symlinked
  // ancestor between the existence check and the write, so every existing and
  // newly-created component is lstat-validated before the next component.
  const anchor = parse(rootPath).root;
  let cursor = anchor;
  const chain = relative(anchor, targetDirectory).split(/[\\/]/u).filter(Boolean);
  for (const component of chain) {
    cursor = resolve(cursor, component);
    let stats;
    try {
      stats = await lstat(cursor);
    } catch (error) {
      if (!isErrno(error, 'ENOENT')) throw error;
      try {
        await mkdirDirectory(cursor);
      } catch (mkdirError) {
        if (!isErrno(mkdirError, 'EEXIST')) throw mkdirError;
      }
      stats = await lstat(cursor);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new PrivateArtifactPathIntegrityError(
        'Private artifact storage parent must be a real directory',
      );
  }

  // Re-check the complete path after creation, including the root itself.
  await assertNoSymlinkParents(rootPath, targetDirectory);
}

function eexistError(path: string): NodeJS.ErrnoException {
  const error = new Error(
    `Private artifact destination already exists: ${path}`,
  ) as NodeJS.ErrnoException;
  error.code = 'EEXIST';
  return error;
}

function sameSha256(left: Uint8Array, right: Uint8Array): boolean {
  return (
    createHash('sha256').update(left).digest('hex') ===
    createHash('sha256').update(right).digest('hex')
  );
}

async function readOpenedPrivateFile(path: string): Promise<Buffer> {
  const handle = await openFile(path, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error('Private artifact must be a regular file');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/**
 * Publish an uploaded private file without following a symlink or replacing an
 * existing file.  The action layer deliberately treats EEXIST as an idempotent
 * reservation retry; every other filesystem condition fails the upload.
 */
export async function writePrivateFileExclusive(
  root: string,
  storageKey: string,
  bytes: Uint8Array,
): Promise<string> {
  if (!writeStorageKeyIsSafe(storageKey)) throw new Error('Invalid private artifact storage key');
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);
  const targetDirectory = dirname(target);

  if (supportsDescriptorRelativeWalk) {
    const directoryHandle = await openDirectoryDescriptor(rootPath, targetDirectory, true);
    try {
      const destination = descriptorChildPath(directoryHandle, parse(target).base);
      const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag;
      let handle: FileHandle;
      try {
        handle = await openFile(destination, flags, 0o640);
      } catch (error) {
        if (isErrno(error, 'EEXIST')) {
          // Verify the collision while still anchored to the opened parent.
          // The action layer performs the media-type check before finalizing
          // metadata; this helper proves the winner has the same bytes/length.
          const existing = await readOpenedPrivateFile(destination);
          if (existing.byteLength !== bytes.byteLength || !sameSha256(existing, bytes))
            throw eexistError(target);
        }
        throw error;
      }

      try {
        const buffer = Buffer.from(bytes);
        let offset = 0;
        while (offset < buffer.byteLength) {
          const result = await handle.write(buffer, offset, buffer.byteLength - offset, offset);
          if (result.bytesWritten <= 0) throw new Error('Private artifact write made no progress');
          offset += result.bytesWritten;
        }
        await handle.sync();
        return target;
      } finally {
        await handle.close();
        // A descriptor-relative unlink API is not exposed by Node.  Leaving a
        // failed publication orphaned is safer than unlinking a path that may
        // have been replaced by a concurrent publisher; no DB metadata points
        // at it and the cleanup job can remove it later.
      }
    } finally {
      await directoryHandle.close();
    }
  }

  await ensurePrivateStorageDirectory(rootPath, targetDirectory);
  await assertNoSymlinkParents(rootPath, targetDirectory);

  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag;
  let handle: Awaited<ReturnType<typeof openFile>>;
  try {
    handle = await openFile(target, flags, 0o640);
  } catch (error) {
    if (isErrno(error, 'EEXIST')) {
      // O_EXCL protects the no-overwrite invariant.  Validate the winner before
      // allowing the caller to treat this as an idempotent existing reservation.
      const existing = await lstat(target);
      if (existing.isSymbolicLink() || !existing.isFile())
        throw new Error('Private artifact destination must be a regular file');
      await assertCanonicalPrivatePath(rootPath, target);
      const existingBytes = await readRegularFileNoFollow(target);
      if (existingBytes.byteLength !== bytes.byteLength || !sameSha256(existingBytes, bytes))
        throw eexistError(target);
    }
    throw error;
  }

  // Re-validate the complete path after the path-based fallback open, before
  // any bytes are written. Linux never reaches this branch because it uses the
  // descriptor-relative walk above; Windows has no Node openat equivalent.
  try {
    await assertNoSymlinkParents(rootPath, targetDirectory);
    await assertCanonicalPrivatePath(rootPath, target);
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }

  let complete = false;
  try {
    const buffer = Buffer.from(bytes);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const result = await handle.write(buffer, offset, buffer.byteLength - offset, offset);
      if (result.bytesWritten <= 0) throw new Error('Private artifact write made no progress');
      offset += result.bytesWritten;
    }
    await handle.sync();
    complete = true;
    return target;
  } finally {
    await handle.close();
    if (!complete) await unlinkFile(target).catch(() => undefined);
  }
}

/** Remove a private file only after re-validating its parent chain and leaf. */
export async function removePrivateFileIfPresent(root: string, storageKey: string): Promise<void> {
  if (!writeStorageKeyIsSafe(storageKey)) throw new Error('Invalid private artifact storage key');
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);

  if (supportsDescriptorRelativeWalk) {
    let directoryHandle: FileHandle | undefined;
    try {
      directoryHandle = await openDirectoryDescriptor(rootPath, dirname(target), false);
      const destination = descriptorChildPath(directoryHandle, parse(target).base);
      const stats = await lstat(destination);
      if (stats.isSymbolicLink() || !stats.isFile())
        throw new Error('Private artifact destination must be a regular file');
      // unlink(2) does not follow a leaf symlink, and the parent descriptor is
      // pinned for the entire operation, preventing an ancestor pathname race.
      await unlinkFile(destination);
    } catch (error) {
      if (!isErrno(error, 'ENOENT')) throw error;
    } finally {
      await directoryHandle?.close().catch(() => undefined);
    }
    return;
  }

  try {
    await assertNoSymlinkParents(rootPath, dirname(target));
    const stats = await lstat(target);
    if (stats.isSymbolicLink() || !stats.isFile())
      throw new Error('Private artifact destination must be a regular file');
    await unlinkFile(target);
  } catch (error) {
    if (!isErrno(error, 'ENOENT')) throw error;
  }
}

async function readRegularFileNoFollow(path: string): Promise<Buffer> {
  const handle = await openFile(path, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error('Private artifact must be a regular file');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/**
 * Open a private artifact beneath a pinned root and return its bytes.  Linux
 * uses a descriptor-relative proc-fd walk; the fallback performs checks both
 * before and after the no-follow leaf open because Node exposes no portable
 * openat/no-follow-ancestor primitive on Windows.
 */
export async function readPrivateFileNoFollow(root: string, storageKey: string): Promise<Buffer> {
  if (!safeStorageKey(storageKey)) throw new Error('Invalid private artifact storage key');
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);
  const targetDirectory = dirname(target);

  if (supportsDescriptorRelativeWalk) {
    const directoryHandle = await openDirectoryDescriptor(rootPath, targetDirectory, false);
    try {
      return await readOpenedPrivateFile(descriptorChildPath(directoryHandle, parse(target).base));
    } finally {
      await directoryHandle.close();
    }
  }

  await assertNoSymlinkParents(rootPath, targetDirectory);
  const targetStats = await lstat(target);
  if (targetStats.isSymbolicLink() || !targetStats.isFile())
    throw new PrivateArtifactPathIntegrityError('Private artifact symlink or non-regular file');
  await assertCanonicalPrivatePath(rootPath, target);
  const bytes = await readRegularFileNoFollow(target);
  // A second canonical-path check closes the common Windows junction/symlink
  // swap window around the path-based open. The opened handle remains the
  // source of bytes; if an ancestor was replaced while opening, fail closed.
  await assertNoSymlinkParents(rootPath, targetDirectory);
  await assertCanonicalPrivatePath(rootPath, target);
  return bytes;
}

function pdfMagicValid(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  const header = Buffer.from(bytes.subarray(0, 5)).toString('ascii');
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  return header === '%PDF-' && tail.includes('%%EOF');
}

function zipMagicValid(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function utf8TextValid(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function mediaSignatureValid(mediaType: string, bytes: Uint8Array): boolean {
  const baseMediaType = mediaType.split(';', 1)[0]?.trim().toLowerCase();
  if (baseMediaType === 'application/pdf') return pdfMagicValid(bytes);
  if (
    baseMediaType === 'application/zip' ||
    baseMediaType === 'application/x-zip-compressed' ||
    baseMediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return zipMagicValid(bytes);
  if (baseMediaType === 'application/json') {
    if (!utf8TextValid(bytes)) return false;
    try {
      JSON.parse(new TextDecoder().decode(bytes));
      return true;
    } catch {
      return false;
    }
  }
  if (baseMediaType === 'text/csv' || baseMediaType === 'text/plain') return utf8TextValid(bytes);
  return false;
}

function contentDispositionFilename(
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const normalized = filename.normalize('NFKC').replace(/[\r\n]/gu, '_');
  const fallback =
    normalized
      .replace(/[^A-Za-z0-9._ -]/gu, '_')
      .replace(/\s+/gu, ' ')
      .trim() || 'artifact';
  const encoded = encodeURIComponent(normalized).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export type PrivateDocumentResponseMetadata = Readonly<{
  mediaType: string;
  filename: string;
  sensitive: boolean;
}>;

/**
 * Shared response construction for legacy and API document downloads. Keeping
 * the headers here prevents one route from accidentally dropping the private
 * cache policy or the sensitive-document marker.
 */
export function privateDocumentResponse(
  bytes: Uint8Array,
  metadata: PrivateDocumentResponseMetadata,
  disposition: 'attachment' | 'inline' = 'attachment',
): Response {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body.buffer as ArrayBuffer, {
    headers: {
      'content-type': metadata.mediaType,
      'content-length': String(body.byteLength),
      'content-disposition': contentDispositionFilename(metadata.filename, disposition),
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': 'sandbox',
      'x-document-sensitive': String(metadata.sensitive),
    },
  });
}

function auditDetails(
  subject: PrivateArtifactSubject,
  principal: Principal,
  outcome: 'authorized' | 'blocked' | 'integrity',
  extra?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    artifactType: 'legacy_private_artifact',
    kind: subject.kind,
    entityType: subject.entityType,
    entityId: subject.entityId,
    projectId: subject.projectId ?? null,
    actorUserId: principal.userId,
    tenantId: subject.tenantId,
    deploymentId: subject.deploymentId,
    outcome,
    ...extra,
  };
}

/** Record the reviewed B5 artifact.access event without exposing audit data to the HTTP caller. */
function recordAccessAudit(
  sqlite: SqliteLike,
  principal: Principal,
  subject: PrivateArtifactSubject,
  outcome: 'authorized' | 'blocked' | 'integrity',
  extra?: Readonly<Record<string, unknown>>,
): void {
  const details = auditDetails(subject, principal, outcome, extra);
  const metadata = JSON.stringify(details);
  const correlationId = principal.correlationId ?? newId();
  const hasB5Contract = Boolean(
    sqlite
      .prepare("SELECT 1 FROM pragma_table_info('audit_event') WHERE name='audit_contract_version'")
      .get(),
  );
  if (hasB5Contract) {
    const registered = sqlite
      .prepare(
        `SELECT 1 FROM audit_action_registry
         WHERE contract_version=? AND action='artifact.access' AND entity_type=? AND actor_kind='user'`,
      )
      .get(B5_AUDIT_CONTRACT_VERSION, subject.entityType);
    if (!registered) throw new Error('AUDIT_ACTION_NOT_REVIEWED');
    sqlite
      .prepare(
        `INSERT INTO audit_event(
           id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
           project_id,before_json,after_json,reason,correlation_id,metadata_json,
           audit_contract_version,actor_kind,service_actor_id,service_capability,job_id,job_run_id,
           tenant_id,deployment_id,provenance
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,?)`,
      )
      .run(
        newId(),
        principal.userId,
        'artifact.access',
        subject.entityType,
        subject.entityId,
        new Date().toISOString(),
        metadata,
        subject.projectId ?? null,
        null,
        null,
        null,
        correlationId,
        metadata,
        B5_AUDIT_CONTRACT_VERSION,
        'user',
        subject.tenantId,
        subject.deploymentId,
        'native',
      );
    return;
  }
  // This branch keeps the helper usable by a pre-B5 compatibility fixture;
  // production databases always take the reviewed branch above.
  sqlite
    .prepare(
      'INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,project_id,before_json,after_json,reason,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      newId(),
      principal.userId,
      'artifact.access',
      subject.entityType,
      subject.entityId,
      new Date().toISOString(),
      metadata,
      subject.projectId ?? null,
      null,
      null,
      null,
      correlationId,
      metadata,
    );
}

function recordAccessAuditBestEffort(
  sqlite: SqliteLike,
  principal: Principal,
  subject: PrivateArtifactSubject,
  outcome: 'authorized' | 'blocked' | 'integrity',
  extra?: Readonly<Record<string, unknown>>,
): void {
  try {
    recordAccessAudit(sqlite, principal, subject, outcome, extra);
  } catch {
    // The response must remain non-disclosing and must never return artifact
    // bytes when the audit sink is unavailable.  Callers use this only on
    // already-blocked/integrity-failed branches.
  }
}

function mapMetadataError(cause: unknown): Response | null {
  if (cause instanceof V3AccessDeniedError) return notFound();
  if (cause instanceof V3ConflictError) return conflict(cause.message);
  if (cause instanceof V3ValidationError) {
    const lower = cause.message.toLowerCase();
    if (lower.includes('not ready') || lower.includes('processing')) return conflict(cause.message);
    return notFound();
  }
  return null;
}

function isErrno(cause: unknown, code: string): boolean {
  return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === code);
}

/**
 * Authorize, step-up authenticate, verify and stream one legacy private
 * artifact.  The callback is intentionally invoked only after object-scope
 * authorization, preventing repository readiness methods from becoming an
 * existence oracle.
 */
export async function servePrivateArtifact(
  options: PrivateArtifactDownloadOptions,
): Promise<Response> {
  const subject = authorizePrivateArtifact(
    options.sqlite,
    options.principal,
    options.kind,
    options.id,
  );
  if (!subject) return notFound();

  const now = options.now ?? Date.now;
  const windowMs = options.stepUpWindowMs ?? STEP_UP_WINDOW_MS;
  const stepUpRequired =
    typeof options.requireStepUp === 'function'
      ? options.requireStepUp(subject)
      : options.requireStepUp !== false;
  if (stepUpRequired && !recentStepUp(options.sqlite, options.principal, now, windowMs)) {
    recordAccessAudit(options.sqlite, options.principal, subject, 'blocked', {
      reason: 'step_up_required',
    });
    return json({ error: STEP_UP_MESSAGE }, { status: 403 });
  }

  let metadata: PrivateArtifactMetadata;
  try {
    metadata = options.loadMetadata();
  } catch (cause) {
    const mapped = mapMetadataError(cause);
    if (mapped) {
      recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'blocked', {
        reason: 'artifact_metadata_unavailable',
      });
      return mapped;
    }
    throw cause;
  }
  if (
    !metadata ||
    typeof metadata.storageKey !== 'string' ||
    typeof metadata.sha256 !== 'string' ||
    typeof metadata.mediaType !== 'string' ||
    typeof metadata.filename !== 'string'
  ) {
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
      reason: 'metadata_invalid',
    });
    return conflict('Private artifact metadata is invalid');
  }
  if (options.expectedMediaType && metadata.mediaType !== options.expectedMediaType) {
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
      reason: 'media_type_mismatch',
    });
    return conflict('Private artifact media type is invalid');
  }
  if (!/^[a-f0-9]{64}$/u.test(metadata.sha256)) {
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
      reason: 'hash_metadata_invalid',
    });
    return conflict('Private artifact integrity metadata is invalid');
  }
  if (
    metadata.byteLength !== undefined &&
    (!Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0)
  ) {
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
      reason: 'length_metadata_invalid',
    });
    return conflict('Private artifact length metadata is invalid');
  }

  if (!safeStorageKey(metadata.storageKey)) {
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
      reason: 'storage_key_invalid',
    });
    return conflict('Private artifact path is invalid');
  }

  if (options.generateBytes) {
    let generated: Uint8Array;
    try {
      generated = options.generateBytes();
    } catch {
      recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'blocked', {
        reason: 'artifact_renderer_unavailable',
      });
      return serverError();
    }
    if (generated.byteLength <= 0 || !mediaSignatureValid(metadata.mediaType, generated)) {
      recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
        reason: 'generated_content_invalid',
      });
      return conflict(INTEGRITY_MESSAGE);
    }
    const observedHash = createHash('sha256').update(generated).digest('hex');
    try {
      recordAccessAudit(options.sqlite, options.principal, subject, 'authorized', {
        sha256: observedHash,
        byteLength: generated.byteLength,
        mediaType: metadata.mediaType,
        renderer: 'snapshot',
      });
    } catch {
      return serverError();
    }
    const responseBytes = new Uint8Array(generated.byteLength);
    responseBytes.set(generated);
    return new Response(responseBytes.buffer as ArrayBuffer, {
      headers: {
        'content-type': metadata.mediaType,
        'content-length': String(generated.byteLength),
        'content-disposition': contentDispositionFilename(metadata.filename),
        'cache-control': 'private, no-store',
        pragma: 'no-cache',
        expires: '0',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        'content-security-policy': 'sandbox',
      },
    });
  }

  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  const target = resolve(root, metadata.storageKey);
  const relativeTarget = relative(root, target);
  if (
    !relativeTarget ||
    relativeTarget.split(/[\\/]/u).includes('..') ||
    relativeTarget.startsWith('/') ||
    relativeTarget.startsWith('\\')
  ) {
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
      reason: 'storage_path_escaped_root',
    });
    return conflict('Private artifact path is invalid');
  }

  let bytes: Buffer;
  try {
    bytes = await readPrivateFileNoFollow(root, metadata.storageKey);
  } catch (cause) {
    if (isErrno(cause, 'ENOENT')) {
      recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'blocked', {
        reason: 'artifact_not_ready',
      });
      return conflict('Private artifact is not ready');
    }
    if (
      cause instanceof PrivateArtifactPathIntegrityError ||
      isErrno(cause, 'ELOOP') ||
      isErrno(cause, 'ENOTDIR') ||
      isErrno(cause, 'EPERM') ||
      isErrno(cause, 'EACCES')
    ) {
      recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'integrity', {
        reason: 'symlink_or_reparse_path',
      });
      return conflict('Private artifact is unavailable');
    }
    recordAccessAuditBestEffort(options.sqlite, options.principal, subject, 'blocked', {
      reason: 'artifact_filesystem_unavailable',
    });
    return serverError();
  }

  const observedHash = createHash('sha256').update(bytes).digest('hex');
  if (
    (metadata.byteLength !== undefined && bytes.byteLength !== metadata.byteLength) ||
    observedHash !== metadata.sha256 ||
    !mediaSignatureValid(metadata.mediaType, bytes)
  ) {
    try {
      recordAccessAudit(options.sqlite, options.principal, subject, 'integrity', {
        reason: 'content_verification_failed',
        expectedSha256: metadata.sha256,
        observedSha256: observedHash,
        expectedByteLength: metadata.byteLength ?? null,
        observedByteLength: bytes.byteLength,
      });
    } catch {
      // Preserve the generic integrity response even if an audit sink is
      // unavailable; the artifact is never returned in this branch.
    }
    return conflict(INTEGRITY_MESSAGE);
  }

  // Audit before returning the bytes.  A failure here must not result in an
  // un-audited private artifact response.
  try {
    recordAccessAudit(options.sqlite, options.principal, subject, 'authorized', {
      sha256: metadata.sha256,
      byteLength: bytes.byteLength,
      mediaType: metadata.mediaType,
    });
  } catch {
    return serverError();
  }

  const responseBytes = new Uint8Array(bytes.byteLength);
  responseBytes.set(bytes);
  return new Response(responseBytes.buffer as ArrayBuffer, {
    headers: {
      'content-type': metadata.mediaType,
      'content-length': String(bytes.byteLength),
      'content-disposition': contentDispositionFilename(metadata.filename),
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': 'sandbox',
    },
  });
}

export { STEP_UP_WINDOW_MS, contentDispositionFilename, recentStepUp, safeStorageKey };
