import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { invoicePresentationObject } from './invoice-draft-details.ts';

type Row = Record<string, unknown>;
type ErrorConstructor = new (message: string) => Error;
export type PresentationEditErrors = {
  access: ErrorConstructor;
  conflict: ErrorConstructor;
  validation: ErrorConstructor;
};

/**
 * Inline invoice editing (owner request 2026-11-25): header texts printed on an unissued
 * draft. The draft keeps its own copy (`presentationOverrides` / `lineDescriptions` in the
 * draft snapshot) that issuing freezes into the issued snapshot. "Also update the client /
 * project record" writes the source record too, audited. Amounts never change here and
 * time entries or worker pay are never touched.
 */
export const PRESENTATION_FIELDS = {
  clientName: { target: 'client', column: 'legal_name', max: 300, required: true },
  clientAddress: { target: 'client', column: 'billing_address', max: 2000, required: false },
  projectName: { target: 'project', column: 'name', max: 300, required: true },
  costCenter: { target: 'project', column: 'cost_center_code', max: 120, required: false },
} as const;
export type PresentationField = keyof typeof PRESENTATION_FIELDS | 'lineDescription';
export const PRESENTATION_FIELD_NAMES = [
  ...Object.keys(PRESENTATION_FIELDS),
  'lineDescription',
] as PresentationField[];

/** Stable key of an invoice line across draft rebuilds: its source and commercial category. */
export function invoiceLineKey(line: Row): string {
  let snapshot: Row = {};
  try {
    snapshot =
      typeof line.snapshot_json === 'string'
        ? (JSON.parse(line.snapshot_json) as Row)
        : ((line.snapshot as Row) ?? {});
  } catch {
    snapshot = {};
  }
  const category = String(
    snapshot.commercialCategory ?? snapshot.category ?? line.line_kind ?? '',
  );
  const source = String(line.source_id ?? line.sourceId ?? line.id ?? '');
  const date = String(snapshot.work_date ?? '');
  return `${String(line.source_type ?? line.sourceType ?? 'line')}:${source}:${category}:${date}`;
}

export type PresentationOverrides = Partial<
  Record<keyof typeof PRESENTATION_FIELDS, string>
>;

export function presentationOverridesOf(snapshot: unknown): PresentationOverrides {
  const value = invoicePresentationObject(snapshot).presentationOverrides;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Row).filter(
      ([key, text]) => key in PRESENTATION_FIELDS && typeof text === 'string',
    ),
  ) as PresentationOverrides;
}

export function lineDescriptionsOf(snapshot: unknown): Record<string, string> {
  const value = invoicePresentationObject(snapshot).lineDescriptions;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Row).filter(([, text]) => typeof text === 'string'),
  ) as Record<string, string>;
}

/** Apply draft line descriptions to invoice line rows (preview, PDF and issue). */
export function withLineDescriptions<T extends Row>(
  lines: readonly T[],
  descriptions: Record<string, string>,
): T[] {
  if (!Object.keys(descriptions).length) return [...lines];
  return lines.map((line) => {
    const text = descriptions[invoiceLineKey(line)];
    return text ? { ...line, description: text } : line;
  });
}

export type PresentationEditInput = {
  expectedVersion: number;
  field: PresentationField;
  value: string;
  lineKey?: string;
  alsoUpdateRecord?: boolean;
};

export function updateInvoiceDraftPresentation(
  sqlite: DatabaseSync,
  principal: Principal,
  invoiceId: string,
  input: PresentationEditInput,
  errors: PresentationEditErrors,
) {
  assertActiveAccount(sqlite, principal, errors.access);
  assertLiveSession(sqlite, principal, errors.access);
  if (!canManageBilling(principal)) throw new errors.access('Finance role required');
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new errors.validation('Reload the invoice and try again.');
  if (!PRESENTATION_FIELD_NAMES.includes(input.field))
    throw new errors.validation('This part of the invoice cannot be edited here.');
  const value = String(input.value ?? '').trim();
  const spec = input.field === 'lineDescription' ? null : PRESENTATION_FIELDS[input.field];
  const max = spec?.max ?? 500;
  if (value.length > max) throw new errors.validation(`Use at most ${max} characters.`);
  if ((spec?.required || input.field === 'lineDescription') && !value)
    throw new errors.validation('This field cannot be empty.');
  return runImmediateTransaction(sqlite, 'invoice-presentation-edit', () => {
    const role = sqlite.prepare('SELECT role FROM user WHERE id=?').get(principal.userId)?.role;
    if (role !== 'owner_admin' && role !== 'finance_admin')
      throw new errors.access('Finance role required');
    const invoice = sqlite
      .prepare(
        `SELECT i.id,i.state,i.version,i.snapshot_json,i.invoice_number,i.issued_at,i.project_id,
                p.client_id,p.name project_name,p.cost_center_code,p.version project_version,
                c.legal_name client_legal_name,c.billing_address client_billing_address,c.version client_version
           FROM invoice i JOIN project p ON p.id=i.project_id JOIN client c ON c.id=p.client_id
          WHERE i.id=?`,
      )
      .get(invoiceId) as Row | undefined;
    if (!invoice) throw new errors.validation('Invoice not found');
    if (invoice.state !== 'draft' || invoice.invoice_number != null || invoice.issued_at != null)
      throw new errors.conflict(
        'Only an unissued Draft can be edited. Issued invoices are corrected with a credit note or a replacement.',
      );
    if (Number(invoice.version) !== input.expectedVersion)
      throw new errors.conflict(
        'This invoice changed in another session. Refresh the preview before saving again.',
      );
    if (
      sqlite
        .prepare(
          "SELECT 1 FROM job WHERE kind='invoice_pdf' AND state IN ('queued','claimed','pending','running') AND json_extract(payload_json,'$.invoiceId')=?",
        )
        .get(invoiceId)
    )
      throw new errors.conflict('An invoice PDF job is in progress. Wait for it to finish before editing.');
    const before = invoicePresentationObject(invoice.snapshot_json);
    const after: Row = { ...before };
    const timestamp = new Date().toISOString();
    let recordUpdated: { entity: 'client' | 'project'; id: string } | null = null;
    if (input.field === 'lineDescription') {
      const key = String(input.lineKey ?? '');
      const lines = sqlite
        .prepare('SELECT id,source_type,source_id,line_kind,snapshot_json FROM invoice_line WHERE invoice_id=?')
        .all(invoiceId) as Row[];
      if (!key || !lines.some((line) => invoiceLineKey(line) === key))
        throw new errors.validation('This invoice line is no longer on the draft. Refresh the preview.');
      after.lineDescriptions = { ...lineDescriptionsOf(before), [key]: value };
    } else {
      const field = PRESENTATION_FIELDS[input.field];
      after.presentationOverrides = { ...presentationOverridesOf(before), [input.field]: value };
      if (input.alsoUpdateRecord) {
        const entityId = String(field.target === 'client' ? invoice.client_id : invoice.project_id);
        const current = String(
          (field.target === 'client'
            ? invoice[`client_${field.column}`]
            : field.column === 'name'
              ? invoice.project_name
              : invoice.cost_center_code) ?? '',
        );
        if (current !== value) {
          const changed = sqlite
            .prepare(
              `UPDATE ${field.target} SET ${field.column}=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
            )
            .run(
              value || null,
              timestamp,
              entityId,
              Number(field.target === 'client' ? invoice.client_version : invoice.project_version),
            );
          if (changed.changes !== 1)
            throw new errors.conflict(
              `The ${field.target} changed in another session. Refresh before saving again.`,
            );
          recordAuditEvent(sqlite, principal, `${field.target}.update`, field.target, entityId, {
            before: { [field.column]: current || null },
            after: { [field.column]: value || null },
            reason: 'Edited on the invoice draft with "also update the record"',
            invoiceId,
          });
          recordUpdated = { entity: field.target, id: entityId };
        }
      }
    }
    const updated = sqlite
      .prepare(
        `UPDATE invoice SET snapshot_json=?,pdf_status='pending',pdf_storage_key=NULL,pdf_sha256=NULL,
         pdf_generated_at=NULL,pdf_byte_length=NULL,updated_at=?,version=version+1
         WHERE id=? AND state='draft' AND version=? AND invoice_number IS NULL AND issued_at IS NULL`,
      )
      .run(JSON.stringify(after), timestamp, invoiceId, input.expectedVersion);
    if (updated.changes !== 1)
      throw new errors.conflict('This invoice changed before the update completed. Refresh the preview.');
    recordAuditEvent(sqlite, principal, 'invoice.draft_details_update', 'invoice', invoiceId, {
      projectId: invoice.project_id,
      field: input.field,
      lineKey: input.lineKey ?? null,
      before: {
        presentationOverrides: before.presentationOverrides ?? null,
        lineDescriptions: before.lineDescriptions ?? null,
      },
      after: {
        presentationOverrides: after.presentationOverrides ?? null,
        lineDescriptions: after.lineDescriptions ?? null,
      },
      recordUpdated,
      expectedVersion: input.expectedVersion,
      resultingVersion: input.expectedVersion + 1,
    });
    return { success: true, version: input.expectedVersion + 1, recordUpdated };
  });
}
