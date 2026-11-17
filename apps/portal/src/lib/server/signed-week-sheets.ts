/**
 * Optional signed activity sheet (PDF/photo) attached to one worker's week
 * on one project (owner decision 2026-11-17). Stored as an ordinary private
 * document (`artifact_type='signed_timesheet'`) with link metadata
 * `{ kind, workerId, weekStart }`, so storage, malware scanning, download
 * authorization and audit are the existing document ones. Download URL:
 * `${base}/app/documents/<id>?view=1`.
 *
 * Billing helper: `listSignedWeekSheets(sqlite, { projectId, from, to })`
 * returns the sheets whose week overlaps an invoice period, to offer them as
 * invoice attachments. The caller must already have authorized the project.
 */
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { openPortalRepository } from './portal-repository';
import { removePrivateFileIfPresent, writePrivateFileExclusive } from './private-artifact-access';
import {
  assertRegularPrivateFile,
  assertStoragePathInsideRoot,
  safeDocumentRoot,
  validateReportAttachmentFile,
} from './report-attachment-route';

export const SIGNED_SHEET_TYPE = 'signed_timesheet';
export const SIGNED_SHEET_MEDIA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type SignedWeekSheet = {
  id: string;
  projectId: string;
  workerId: string;
  weekStart: string;
  filename: string;
  mediaType: string;
  createdAt: string;
  uploadedBy: string;
};

const shift = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Committed, non-archived sheets matching the filter (newest first). */
export function listSignedWeekSheets(
  sqlite: DatabaseSync,
  filter: Readonly<{
    projectId?: string;
    projectIds?: readonly string[];
    workerId?: string;
    weekStart?: string;
    /** Weeks overlapping [from, to] (ISO dates). */
    from?: string;
    to?: string;
  }>,
  limit = 200,
): SignedWeekSheet[] {
  const where = [
    "d.artifact_type='signed_timesheet'",
    "d.state='committed'",
    'd.archived_at IS NULL',
    'd.artifact_metadata_json IS NOT NULL',
  ];
  const values: Array<string | number> = [];
  if (filter.projectId) {
    where.push('d.project_id=?');
    values.push(filter.projectId);
  }
  if (filter.projectIds) {
    if (!filter.projectIds.length) return [];
    where.push(`d.project_id IN (${filter.projectIds.map(() => '?').join(',')})`);
    values.push(...filter.projectIds);
  }
  if (filter.workerId) {
    where.push("json_extract(d.artifact_metadata_json,'$.workerId')=?");
    values.push(filter.workerId);
  }
  if (filter.weekStart) {
    where.push("json_extract(d.artifact_metadata_json,'$.weekStart')=?");
    values.push(filter.weekStart);
  }
  if (filter.from) {
    // A week starting up to 6 days before `from` still overlaps it.
    where.push("json_extract(d.artifact_metadata_json,'$.weekStart')>=?");
    values.push(shift(filter.from, -6));
  }
  if (filter.to) {
    where.push("json_extract(d.artifact_metadata_json,'$.weekStart')<=?");
    values.push(filter.to);
  }
  const rows = sqlite
    .prepare(
      `SELECT d.id,d.project_id,d.owner_id,d.safe_filename,d.original_filename,d.media_type,d.created_at,
              json_extract(d.artifact_metadata_json,'$.workerId') worker_id,
              json_extract(d.artifact_metadata_json,'$.weekStart') week_start
         FROM document d
        WHERE ${where.join(' AND ')}
        ORDER BY d.created_at DESC, d.id
        LIMIT ?`,
    )
    .all(...values, limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id ?? ''),
    workerId: String(row.worker_id ?? ''),
    weekStart: String(row.week_start ?? ''),
    filename: String(row.original_filename ?? row.safe_filename ?? 'signed-sheet'),
    mediaType: String(row.media_type ?? ''),
    createdAt: String(row.created_at ?? ''),
    uploadedBy: String(row.owner_id ?? ''),
  }));
}

export class SignedSheetInputError extends Error {
  constructor(
    readonly code: 'file' | 'type' | 'content' | 'scope',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Store one signed sheet for `workerId`'s week on `projectId`. Authorization:
 * the worker for their own week (project access is checked by the document
 * reservation), owner/finance for anyone, a project manager for workers of
 * their projects. The worker must be assigned to the project during the week.
 */
export async function storeSignedWeekSheet(
  context: ReturnType<typeof openPortalRepository>,
  input: Readonly<{ projectId: string; workerId: string; weekStart: string; file: File; workerName: string }>,
): Promise<{ id: string }> {
  const { principal, sqlite } = context;
  const { projectId, workerId, weekStart, file } = input;
  if (
    workerId !== principal.userId &&
    !['owner_admin', 'finance_admin', 'project_manager'].includes(principal.role)
  )
    throw new SignedSheetInputError('scope', 'You can attach a signed sheet only to your own week.');
  const weekEnd = shift(weekStart, 6);
  const assigned = sqlite
    .prepare(
      `SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active'
          AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1`,
    )
    .get(projectId, workerId, weekEnd, weekStart);
  if (!assigned)
    throw new SignedSheetInputError('scope', 'This person is not assigned to the project that week.');
  if (!(file instanceof File) || file.size < 1)
    throw new SignedSheetInputError('file', 'Choose the signed sheet (PDF or photo).');
  if (!SIGNED_SHEET_MEDIA.includes(file.type) || file.size > 20_000_000)
    throw new SignedSheetInputError('type', 'Use a PDF or photo up to 20 MB.');
  let bytes: Uint8Array;
  try {
    bytes = await validateReportAttachmentFile(file);
  } catch {
    throw new SignedSheetInputError('content', 'This file could not be read as a PDF or photo.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reservation = context.v3.reserveUpload(principal, {
    projectId,
    originalFilename: file.name,
    artifactType: SIGNED_SHEET_TYPE,
    description: `Signed activity sheet · ${input.workerName} · week ${weekStart}`.slice(0, 200),
    sensitivity: 'internal',
    artifactMetadata: { kind: SIGNED_SHEET_TYPE, workerId, weekStart },
  });
  const root = safeDocumentRoot();
  let written = false;
  try {
    assertStoragePathInsideRoot(root, reservation.storageKey);
    try {
      await writePrivateFileExclusive(root, reservation.storageKey, bytes);
      written = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await assertRegularPrivateFile(root, reservation.storageKey, sha256, file.size, file.type);
    }
    context.v3.finalizeUpload(principal, reservation.reservationId, {
      sha256,
      mediaType: file.type,
      byteLength: file.size,
    });
    return { id: reservation.reservationId };
  } catch (error) {
    try {
      context.v3.cancelUploadReservation(principal, reservation.reservationId);
    } catch {
      // Stale reservations are cleaned up by the scheduled job.
    }
    if (written) await removePrivateFileIfPresent(root, reservation.storageKey).catch(() => undefined);
    throw error;
  }
}
