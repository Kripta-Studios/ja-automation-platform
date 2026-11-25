import type { DatabaseSync } from 'node:sqlite';

/**
 * Issued-invoice versions (owner decision 2026-11-25, migration 0092). Version 1 is the issued
 * invoice row, which never changes. A correction adds version 2, 3 ... in `invoice_revision`
 * with the same invoice number (or a new one chosen by the owner). Amounts owed, payments,
 * balances, the shown/downloaded document and client email use the CURRENT version; finalized
 * accounting packs keep the values they contained.
 */
const available = new WeakMap<DatabaseSync, boolean>();

export function invoiceRevisionsAvailable(sqlite: DatabaseSync): boolean {
  const cached = available.get(sqlite);
  if (cached) return true;
  const exists = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invoice_revision'")
      .get(),
  );
  // Only a positive answer is cached: a database being upgraded gains the table later.
  if (exists) available.set(sqlite, true);
  return exists;
}

type VersionColumn = 'total_minor' | 'subtotal_minor' | 'tax_minor' | 'invoice_number' | 'due_at';

/**
 * SQL expression for the current-version value of an invoice column, for an invoice table
 * alias. `due_at` reads the corrected due date from the version snapshot.
 */
export function currentInvoiceColumnSql(
  sqlite: DatabaseSync,
  alias: string,
  column: VersionColumn,
): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(alias)) throw new Error('Unsafe invoice alias');
  const base = `${alias}.${column}`;
  if (!invoiceRevisionsAvailable(sqlite)) return base;
  const value =
    column === 'due_at' ? "json_extract(current_version.snapshot_json,'$.dueAt')" : `current_version.${column}`;
  return `COALESCE((SELECT ${value} FROM invoice_revision current_version WHERE current_version.invoice_id=${alias}.id ORDER BY current_version.revision_number DESC LIMIT 1),${base})`;
}

export type InvoiceVersionPdf = Readonly<{
  storageKey: string;
  sha256: string;
  byteLength: number;
  generatedAt: string;
}>;

export type InvoiceVersion = Readonly<{
  revisionId: string | null;
  revisionNumber: number;
  invoiceNumber: string;
  snapshotJson: string;
  calculationHash: string;
  currency: string;
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  createdAt: string;
  createdBy: string | null;
  changedFields: unknown[];
  reason: string | null;
  pdf: InvoiceVersionPdf | null;
}>;

type Row = Record<string, unknown>;

function revisionFromRow(row: Row): InvoiceVersion {
  return {
    revisionId: String(row.id),
    revisionNumber: Number(row.revision_number),
    invoiceNumber: String(row.invoice_number),
    snapshotJson: String(row.snapshot_json),
    calculationHash: String(row.calculation_hash),
    currency: String(row.currency),
    subtotalMinor: BigInt(String(row.subtotal_minor)),
    taxMinor: BigInt(String(row.tax_minor)),
    totalMinor: BigInt(String(row.total_minor)),
    createdAt: String(row.created_at),
    createdBy: row.created_by == null ? null : String(row.created_by),
    changedFields: JSON.parse(String(row.changed_fields_json ?? '[]')) as unknown[],
    reason: row.reason == null ? null : String(row.reason),
    pdf: row.pdf_storage_key
      ? {
          storageKey: String(row.pdf_storage_key),
          sha256: String(row.pdf_sha256),
          byteLength: Number(row.pdf_byte_length),
          generatedAt: String(row.pdf_generated_at),
        }
      : null,
  };
}

/** Every version of an issued invoice, oldest first (version 1 = the issued row). */
export function invoiceVersions(sqlite: DatabaseSync, invoiceId: string): InvoiceVersion[] {
  const invoice = sqlite
    .prepare(
      `SELECT id,invoice_number,snapshot_json,calculation_hash,currency,
              CAST(subtotal_minor AS TEXT) subtotal_minor,CAST(tax_minor AS TEXT) tax_minor,
              CAST(total_minor AS TEXT) total_minor,issued_at,pdf_status,pdf_storage_key,pdf_sha256,
              pdf_byte_length,pdf_generated_at
         FROM invoice WHERE id=? AND invoice_number IS NOT NULL AND issued_at IS NOT NULL`,
    )
    .get(invoiceId) as Row | undefined;
  if (!invoice) return [];
  const first: InvoiceVersion = {
    revisionId: null,
    revisionNumber: 1,
    invoiceNumber: String(invoice.invoice_number),
    snapshotJson: String(invoice.snapshot_json ?? '{}'),
    calculationHash: String(invoice.calculation_hash ?? ''),
    currency: String(invoice.currency),
    subtotalMinor: BigInt(String(invoice.subtotal_minor)),
    taxMinor: BigInt(String(invoice.tax_minor)),
    totalMinor: BigInt(String(invoice.total_minor)),
    createdAt: String(invoice.issued_at),
    createdBy: null,
    changedFields: [],
    reason: null,
    pdf:
      invoice.pdf_status === 'ready' && invoice.pdf_storage_key
        ? {
            storageKey: String(invoice.pdf_storage_key),
            sha256: String(invoice.pdf_sha256),
            byteLength: Number(invoice.pdf_byte_length),
            generatedAt: String(invoice.pdf_generated_at),
          }
        : null,
  };
  if (!invoiceRevisionsAvailable(sqlite)) return [first];
  const rows = sqlite
    .prepare(
      `SELECT r.id,r.revision_number,r.invoice_number,r.snapshot_json,r.calculation_hash,r.currency,
              CAST(r.subtotal_minor AS TEXT) subtotal_minor,CAST(r.tax_minor AS TEXT) tax_minor,
              CAST(r.total_minor AS TEXT) total_minor,r.created_at,r.created_by,r.changed_fields_json,
              r.reason,p.storage_key pdf_storage_key,p.sha256 pdf_sha256,p.byte_length pdf_byte_length,
              p.generated_at pdf_generated_at
         FROM invoice_revision r LEFT JOIN invoice_revision_pdf p ON p.revision_id=r.id
        WHERE r.invoice_id=? ORDER BY r.revision_number`,
    )
    .all(invoiceId) as Row[];
  return [first, ...rows.map(revisionFromRow)];
}

/** The current version of an issued invoice (null for an unissued draft). */
export function currentInvoiceVersion(
  sqlite: DatabaseSync,
  invoiceId: string,
): InvoiceVersion | null {
  const versions = invoiceVersions(sqlite, invoiceId);
  return versions[versions.length - 1] ?? null;
}

/** The current version's revision row, or null while the invoice is at version 1. */
export function latestInvoiceRevision(sqlite: DatabaseSync, invoiceId: string): InvoiceVersion | null {
  if (!invoiceRevisionsAvailable(sqlite)) return null;
  const row = sqlite
    .prepare(
      `SELECT r.id,r.revision_number,r.invoice_number,r.snapshot_json,r.calculation_hash,r.currency,
              CAST(r.subtotal_minor AS TEXT) subtotal_minor,CAST(r.tax_minor AS TEXT) tax_minor,
              CAST(r.total_minor AS TEXT) total_minor,r.created_at,r.created_by,r.changed_fields_json,
              r.reason,p.storage_key pdf_storage_key,p.sha256 pdf_sha256,p.byte_length pdf_byte_length,
              p.generated_at pdf_generated_at
         FROM invoice_revision r LEFT JOIN invoice_revision_pdf p ON p.revision_id=r.id
        WHERE r.invoice_id=? ORDER BY r.revision_number DESC LIMIT 1`,
    )
    .get(invoiceId) as Row | undefined;
  return row ? revisionFromRow(row) : null;
}
