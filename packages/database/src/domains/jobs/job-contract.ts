import { createHash } from 'node:crypto';

/**
 * The reviewed B5 durable-job contract.  A job kind has exactly one
 * capability; callers must not provide an arbitrary capability alongside a
 * kind.  Keep this map in the database package so enqueue, claim, service
 * actor provisioning and execution authorization share one contract.
 */
export const DURABLE_JOB_CAPABILITY_BY_KIND = Object.freeze({
  invoice_pdf: 'artifact.invoice.render',
  period_close_report: 'artifact.report.render',
  auto_draft: 'billing.draft.generate',
  accounting_pack_artifact_render: 'artifact.accounting_pack.render',
  temporary_upload_cleanup: 'storage.temporary.cleanup',
  localized_pdf_variant_render: 'artifact.localized_pdf.render',
  worker_statement_artifact_render: 'artifact.worker_statement.render',
  document_scan: 'document.scan',
  outbox_deliver: 'outbox.deliver',
  alert_dispatch: 'alert.dispatch',
  email_send: 'email.send',
  backup_verify: 'backup.verify',
} as const);

export type DurableJobKind = keyof typeof DURABLE_JOB_CAPABILITY_BY_KIND;
export type DurableJobCapability = (typeof DURABLE_JOB_CAPABILITY_BY_KIND)[DurableJobKind];

export const DURABLE_JOB_CAPABILITIES = Object.freeze(
  Object.values(DURABLE_JOB_CAPABILITY_BY_KIND),
) as readonly DurableJobCapability[];

export function capabilityForJobKind(kind: string): DurableJobCapability | undefined {
  return DURABLE_JOB_CAPABILITY_BY_KIND[kind as DurableJobKind];
}

/**
 * Serialize JSON values deterministically.  Object key order is not part of
 * the job meaning, while array order is.  This is deliberately strict: a
 * durable payload must be JSON data and cannot contain executable values or
 * non-finite numbers.
 */
export function canonicalJobJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('PAYLOAD_INVALID');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJobJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJobJson(entry)}`)
      .join(',')}}`;
  }
  throw new Error('PAYLOAD_INVALID');
}

/** Parse and hash persisted JSON, or hash an already parsed payload. */
export function jobPayloadHash(payload: unknown): string {
  const parsed = typeof payload === 'string' ? parseJobPayload(payload) : payload;
  return createHash('sha256').update(canonicalJobJson(parsed)).digest('hex');
}

export function parseJobPayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson);
  } catch {
    throw new Error('PAYLOAD_INVALID');
  }
}

export function sameJobPayloadHash(payloadJson: string, expectedHash: string | null): boolean {
  return expectedHash !== null && jobPayloadHash(payloadJson) === expectedHash;
}
