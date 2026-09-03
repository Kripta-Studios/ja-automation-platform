import type { DatabaseSync } from 'node:sqlite';
import { recordAuditEvent } from '@ja/database';
import type { Principal } from '@ja/domain';
import { assertRecentStepUp, contentDispositionFilename } from './private-artifact-access';

const mediaTypes = {
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export function sensitiveExportResponse(
  input: Readonly<{
    sqlite: DatabaseSync;
    principal: Principal;
    auditEntityType: 'document' | 'invoice';
    auditEntityId: string;
    exportKind: 'worker_compensation_statement' | 'invoice_collection_ledger' | 'project_finance';
    format: keyof typeof mediaTypes;
    filename: string;
    bytes: Uint8Array;
    periodStart: string;
    periodEnd: string;
  }>,
): Response {
  // Keep the defense-in-depth check here so a newly added sensitive export
  // cannot accidentally return financial bytes without a current proof on the
  // exact interactive session. Route handlers check before querying/generating
  // and this boundary checks again immediately before the response.
  assertRecentStepUp(input.sqlite, input.principal);
  // Audit before returning restricted financial bytes. If the append-only
  // audit sink is unavailable, the download fails closed.
  recordAuditEvent(
    input.sqlite,
    input.principal,
    'artifact.access',
    input.auditEntityType,
    input.auditEntityId,
    {
      artifactType: input.exportKind,
      outcome: 'authorized',
      format: input.format,
      filename: input.filename,
      byteLength: input.bytes.byteLength,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  );
  const body = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(body).set(input.bytes);
  return new Response(body, {
    headers: {
      'content-type': mediaTypes[input.format],
      'content-length': String(input.bytes.byteLength),
      'content-disposition': contentDispositionFilename(input.filename),
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': 'sandbox',
    },
  });
}
