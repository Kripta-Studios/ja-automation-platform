import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import { assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { verifyPrivatePdfArtifact } from '../../core/private-pdf-proof.ts';

function authorize(sqlite: DatabaseSync, principal: Principal) {
  const user = sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(principal.userId);
  if (!canManageBilling(principal) || user?.status !== 'active' || user.role !== principal.role)
    throw new AccessDeniedError('Active Finance or Owner account required');
  assertLiveSession(sqlite, principal, AccessDeniedError);
}

export function invoiceEmailRecipient(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new ValidationError('Valid invoice recipient required');
  const recipient = value.trim();
  if (
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/u.test(
      recipient,
    )
  )
    throw new ValidationError('Valid invoice recipient required');
  const [local, domain] = recipient.split('@');
  if (
    local!.length > 64 ||
    local!.startsWith('.') ||
    local!.endsWith('.') ||
    recipient.includes('..')
  )
    throw new ValidationError('Valid invoice recipient required');
  if (
    domain!
      .split('.')
      .some((label) => label.length > 63 || label.startsWith('-') || label.endsWith('-'))
  )
    throw new ValidationError('Valid invoice recipient required');
  return `${local}@${domain}`.toLowerCase();
}

function deliveryStatus(row: {
  delivered_at?: unknown;
  failed_at?: unknown;
  last_error?: unknown;
}) {
  if (String(row.last_error ?? '').startsWith('SMTP_DELIVERY_UNCERTAIN')) return 'uncertain';
  if (String(row.last_error ?? '').startsWith('DELIVERY_IN_PROGRESS:')) return 'sending';
  return row.delivered_at
    ? 'accepted'
    : row.failed_at
      ? 'failed'
      : row.last_error
        ? 'retrying'
        : 'queued';
}

/** Explicit user command only. Enqueueing never asserts that mail has been transmitted. */
export function queueInvoiceEmail(
  sqlite: DatabaseSync,
  principal: Principal,
  input: { invoiceId: string; recipient: string },
) {
  return runImmediateTransaction(sqlite, 'invoice-email', () => {
    authorize(sqlite, principal);
    const recipient = invoiceEmailRecipient(input.recipient);
    const invoice = sqlite
      .prepare(
        `SELECT id,invoice_number,pdf_status,pdf_storage_key,pdf_sha256,pdf_byte_length
      FROM invoice WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue')`,
      )
      .get(input.invoiceId);
    if (!invoice?.invoice_number || invoice.pdf_status !== 'ready')
      throw new ValidationError('Issued invoice with ready PDF required');
    if (Number(invoice.pdf_byte_length) > 20 * 1024 * 1024)
      throw new ValidationError('Invoice PDF exceeds email size limit');
    try {
      verifyPrivatePdfArtifact({
        storageKey: String(invoice.pdf_storage_key ?? ''),
        sha256: String(invoice.pdf_sha256 ?? ''),
        byteLength: Number(invoice.pdf_byte_length),
      });
    } catch {
      throw new ValidationError('Invoice PDF integrity verification failed');
    }
    const pdfSha256 = String(invoice.pdf_sha256);
    const key = `invoice-email:${createHash('sha256')
      .update(JSON.stringify([input.invoiceId, recipient, pdfSha256]))
      .digest('hex')}`;
    const existing = sqlite.prepare('SELECT * FROM outbox_event WHERE idempotency_key=?').get(key);
    if (existing) {
      const payload = JSON.parse(String(existing.payload_json));
      if (
        existing.topic !== 'invoice.email.requested' ||
        existing.aggregate_id !== input.invoiceId ||
        payload.invoiceId !== input.invoiceId ||
        payload.recipient !== recipient ||
        payload.pdfSha256 !== pdfSha256
      )
        throw new ConflictError('Invoice email idempotency conflict');
      return { id: String(existing.id), status: deliveryStatus(existing), recipient };
    }
    const id = newId();
    const timestamp = new Date().toISOString();
    sqlite
      .prepare(
        'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        id,
        'invoice.email.requested',
        input.invoiceId,
        key,
        JSON.stringify({
          invoiceId: input.invoiceId,
          recipient,
          requestedBy: principal.userId,
          pdfSha256,
        }),
        timestamp,
        timestamp,
      );
    recordAuditEvent(sqlite, principal, 'invoice.send', 'invoice', input.invoiceId, {
      deliveryMethod: 'email',
      deliveryStatus: 'queued',
      outboxEventId: id,
      recipient,
      pdfSha256,
    });
    return { id, status: 'queued', recipient };
  });
}

export function listInvoiceEmailDeliveries(sqlite: DatabaseSync, principal: Principal) {
  authorize(sqlite, principal);
  return sqlite
    .prepare(
      "SELECT aggregate_id,payload_json,delivered_at,failed_at,last_error,created_at FROM outbox_event WHERE topic='invoice.email.requested' ORDER BY created_at DESC",
    )
    .all()
    .map((row) => ({
      invoiceId: String(row.aggregate_id),
      recipient: String(JSON.parse(String(row.payload_json)).recipient),
      status: deliveryStatus(row),
      acceptedAt: row.delivered_at,
      requestedAt: row.created_at,
    }));
}
