import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open as openFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
  type ReportAttachmentKind,
  type ReportAttachmentType,
} from '@ja/database';
import type { DatabaseSync } from 'node:sqlite';

/** The only report attachment kinds exposed by the report-detail surface. */
export const reportAttachmentKindSchema = z.enum([
  'daily_attachment',
  'technical_attachment',
  'plc_backup_before',
  'plc_backup_after',
]);

const reportAttachmentMetadataSchema = z
  .object({
    attachmentKind: reportAttachmentKindSchema,
    notes: z.string().trim().max(5_000).optional(),
    version: z.preprocess(
      (value) => (typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value),
      z.number().int().positive(),
    ),
    supersedesDocumentId: z
      .string()
      .trim()
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();

export type ReportAttachmentMetadata = Readonly<{
  attachmentKind: ReportAttachmentKind;
  notes?: string;
  version: number;
  supersedesDocumentId?: string;
}>;

const allowedFormKeys = new Set([
  'attachmentKind',
  'notes',
  'version',
  'supersedesDocumentId',
  'file',
]);

export function parseReportAttachmentMetadata(form: FormData): ReportAttachmentMetadata {
  for (const key of form.keys()) {
    if (!allowedFormKeys.has(key)) throw new V3ValidationError('Unknown report attachment field');
  }
  for (const key of allowedFormKeys) {
    if (form.getAll(key).length > 1)
      throw new V3ValidationError(`Only one ${key} value is allowed`);
  }
  const readString = (name: string): string | undefined => {
    const value = form.get(name);
    if (value === null) return undefined;
    if (typeof value !== 'string') throw new V3ValidationError(`${name} must be text`);
    return value;
  };
  const parsed = reportAttachmentMetadataSchema.safeParse({
    attachmentKind: readString('attachmentKind'),
    notes: readString('notes') || undefined,
    version: readString('version'),
    supersedesDocumentId: readString('supersedesDocumentId') || undefined,
  });
  if (!parsed.success) throw new V3ValidationError('Invalid report attachment fields');
  return parsed.data as ReportAttachmentMetadata;
}

export function reportAttachmentTypeForId(
  sqlite: DatabaseSync,
  reportId: string,
): ReportAttachmentType {
  if (
    !reportId ||
    reportId.length > 200 ||
    [...reportId].some((character) => (character.codePointAt(0) ?? 0) < 0x20)
  )
    throw new V3NotFoundError('Report not found');
  const daily = sqlite.prepare('SELECT id FROM daily_report WHERE id=?').get(reportId) as
    | { id: string }
    | undefined;
  const technical = sqlite.prepare('SELECT id FROM technical_report WHERE id=?').get(reportId) as
    | { id: string }
    | undefined;
  if (Boolean(daily) === Boolean(technical)) throw new V3NotFoundError('Report not found');
  return daily ? 'daily' : 'technical';
}

export function reportVersionForId(
  sqlite: DatabaseSync,
  reportType: ReportAttachmentType,
  reportId: string,
): number {
  const table = reportType === 'daily' ? 'daily_report' : 'technical_report';
  const row = sqlite.prepare(`SELECT version FROM ${table} WHERE id=?`).get(reportId) as
    | { version: number }
    | undefined;
  if (!row || !Number.isSafeInteger(row.version) || row.version < 1)
    throw new V3NotFoundError('Report not found');
  return row.version;
}

export function assertReportVersion(
  sqlite: DatabaseSync,
  reportType: ReportAttachmentType,
  reportId: string,
  expectedVersion: number,
): void {
  const actualVersion = reportVersionForId(sqlite, reportType, reportId);
  if (actualVersion !== expectedVersion)
    throw new V3ConflictError('The report changed. Refresh before attaching a file.');
}

type MediaRule = Readonly<{
  extensions: ReadonlySet<string>;
  signature: (bytes: Uint8Array) => boolean;
}>;

const textSignature = (bytes: Uint8Array): boolean => {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

const mediaRules: Readonly<Record<string, MediaRule>> = {
  'application/pdf': {
    extensions: new Set(['.pdf']),
    signature: (bytes) =>
      bytes.byteLength >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-',
  },
  'application/zip': {
    extensions: new Set(['.zip']),
    signature: (bytes) =>
      bytes.byteLength >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08),
  },
  'image/jpeg': {
    extensions: new Set(['.jpg', '.jpeg']),
    signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  'image/png': {
    extensions: new Set(['.png']),
    signature: (bytes) =>
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  'image/webp': {
    extensions: new Set(['.webp']),
    signature: (bytes) =>
      bytes.byteLength >= 12 &&
      Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP',
  },
  'image/heic': {
    extensions: new Set(['.heic']),
    signature: (bytes) => isIsoBaseMedia(bytes),
  },
  'image/heif': {
    extensions: new Set(['.heif']),
    signature: (bytes) => isIsoBaseMedia(bytes),
  },
  'text/plain': {
    extensions: new Set(['.txt']),
    signature: textSignature,
  },
};

function isIsoBaseMedia(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12 || Buffer.from(bytes.subarray(4, 8)).toString('ascii') !== 'ftyp')
    return false;
  const brand = Buffer.from(bytes.subarray(8, 12)).toString('ascii').toLowerCase();
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
}

export async function validateReportAttachmentFile(file: File): Promise<Uint8Array> {
  if (file.size < 1 || file.size > 50_000_000)
    throw new V3ValidationError('Attachment must be between 1 byte and 50 MB');
  const filename = file.name.normalize('NFKC');
  if (
    !filename ||
    filename !== filename.trim() ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    filename === '.' ||
    filename === '..'
  )
    throw new V3ValidationError('Attachment filename is invalid');
  const mediaType = file.type.trim().toLowerCase();
  const rule = mediaRules[mediaType];
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (!rule || !rule.extensions.has(extension))
    throw new V3ValidationError('Attachment type and filename do not match');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength !== file.size || !rule.signature(bytes))
    throw new V3ValidationError('Attachment content does not match its media type');
  return bytes;
}

export function attachmentMediaType(file: File): string {
  return file.type.trim().toLowerCase();
}

export function attachmentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function safeDocumentRoot(): string {
  return resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
}

export function assertStoragePathInsideRoot(root: string, storageKey: string): string {
  if (
    !storageKey ||
    storageKey.startsWith('/') ||
    storageKey.startsWith('\\') ||
    storageKey.includes('\\') ||
    storageKey.includes(':') ||
    storageKey.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    [...storageKey].some((character) => (character.codePointAt(0) ?? 0) < 0x20) ||
    storageKey.toLowerCase().includes('%2e')
  )
    throw new V3ValidationError('Attachment storage path is invalid');
  const rootPath = resolve(root);
  const target = resolve(rootPath, storageKey);
  const relativeTarget = relative(rootPath, target);
  if (
    !relativeTarget ||
    relativeTarget.split(/[\\/]/u).includes('..') ||
    relativeTarget.startsWith('/') ||
    relativeTarget.startsWith('\\')
  )
    throw new V3ValidationError('Attachment storage path escaped its root');
  return target;
}

export async function assertRegularPrivateFile(
  root: string,
  storageKey: string,
  expectedHash: string,
  expectedLength: number,
  expectedMediaType: string,
): Promise<Uint8Array> {
  const target = assertStoragePathInsideRoot(root, storageKey);
  const rootPath = resolve(root);
  const parent = dirname(target);
  const parentRelative = relative(rootPath, parent);
  const parentParts = parentRelative.split(/[\\/]/u).filter(Boolean);
  const rootStats = await lstat(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new V3ConflictError('Attachment storage root is unavailable');
  let cursor = rootPath;
  for (const part of parentParts) {
    cursor = resolve(cursor, part);
    const parentStats = await lstat(cursor);
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory())
      throw new V3ConflictError('Attachment storage path is unavailable');
  }
  const stats = await lstat(target);
  if (stats.isSymbolicLink() || !stats.isFile())
    throw new V3ConflictError('Attachment is unavailable');
  const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const handle = await openFile(target, fsConstants.O_RDONLY | noFollow);
  let bytes: Uint8Array;
  try {
    const openedStats = await handle.stat();
    if (!openedStats.isFile()) throw new V3ConflictError('Attachment is unavailable');
    bytes = new Uint8Array(await handle.readFile());
  } finally {
    await handle.close();
  }
  const rule = mediaRules[expectedMediaType.toLowerCase()];
  if (
    bytes.byteLength !== expectedLength ||
    !Number.isSafeInteger(expectedLength) ||
    expectedLength < 1 ||
    attachmentHash(bytes) !== expectedHash ||
    !rule ||
    !rule.signature(bytes)
  )
    throw new V3ConflictError('Attachment integrity verification failed');
  return bytes;
}
