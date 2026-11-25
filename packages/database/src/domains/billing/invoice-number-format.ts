import type { DatabaseSync } from 'node:sqlite';

/**
 * Invoice number formats of an accountant-approved invoice-number policy.
 *
 * - `prefix_year_sequence`: "<prefix>-<year>-<n>" per issuer and year (historical default).
 * - `client_project_sequence` (owner decision 2026-11-25): "CP-<client code>-<NNN>", where NNN
 *   counts the issued invoices of that project (001 = its first). The first project of a client
 *   to issue a CP number keeps the short form; any other project of that client uses
 *   "CP-<client code>-<cost center>-<NNN>". The series stem of a project is stored once and never
 *   changes, so every project keeps its own collision-free series.
 *
 * Credit notes always keep their own CN series; issued numbers are never re-numbered.
 */
export const INVOICE_NUMBER_FORMATS = ['prefix_year_sequence', 'client_project_sequence'] as const;
export type InvoiceNumberFormat = (typeof INVOICE_NUMBER_FORMATS)[number];
export const CLIENT_PROJECT_NUMBER_PREFIX = 'CP';
export const PROJECT_INVOICE_SEQUENCE_SCOPE = 'invoice_project';

/** `number_format` (migration 0091), or the historical format on an older schema being upgraded. */
export function invoiceNumberFormatColumn(sqlite: DatabaseSync): string {
  return sqlite
    .prepare("SELECT 1 FROM pragma_table_info('invoice_number_policy') WHERE name='number_format'")
    .get()
    ? 'number_format'
    : "'prefix_year_sequence' number_format";
}

export const isInvoiceNumberFormat = (value: unknown): value is InvoiceNumberFormat =>
  typeof value === 'string' && (INVOICE_NUMBER_FORMATS as readonly string[]).includes(value);

/** A safe number segment: letters and digits, other characters collapse to one dash. */
export function invoiceNumberSegment(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/gu, '')
        .replace(/[^A-Za-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 40)
    : '';
}

export const formatClientProjectNumber = (stem: string, sequence: number): string =>
  `${stem}-${String(sequence).padStart(3, '0')}`;

export type ProjectNumberContext = Readonly<{
  projectId: string;
  clientId: string;
  clientCode: unknown;
  clientNumber: unknown;
  costCenterCode: unknown;
  projectNumber?: unknown;
}>;

function stemTaken(sqlite: DatabaseSync, stem: string): boolean {
  return Boolean(
    sqlite.prepare('SELECT 1 FROM project_invoice_number_series WHERE stem=?').get(stem),
  );
}

/** The project's stored series stem, or the one it would get now (never stored here). */
export function projectInvoiceNumberStem(
  sqlite: DatabaseSync,
  context: ProjectNumberContext,
): { stem: string; stored: boolean } {
  const existing = sqlite
    .prepare('SELECT stem FROM project_invoice_number_series WHERE project_id=?')
    .get(context.projectId) as { stem: string } | undefined;
  if (existing) return { stem: existing.stem, stored: true };
  const client =
    invoiceNumberSegment(context.clientCode) ||
    invoiceNumberSegment(context.clientNumber) ||
    'CLIENT';
  const short = `${CLIENT_PROJECT_NUMBER_PREFIX}-${client}`;
  if (!stemTaken(sqlite, short)) return { stem: short, stored: false };
  const center =
    invoiceNumberSegment(context.costCenterCode) ||
    invoiceNumberSegment(context.projectNumber) ||
    invoiceNumberSegment(context.projectId.slice(-6));
  const long = `${short}-${center}`;
  if (!stemTaken(sqlite, long)) return { stem: long, stored: false };
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${long}-${suffix}`;
    if (!stemTaken(sqlite, candidate)) return { stem: candidate, stored: false };
  }
}

/** Issued invoices of the project before its CP series started (they count in NNN). */
function priorIssuedInvoices(sqlite: DatabaseSync, projectId: string): number {
  return Number(
    (
      sqlite
        .prepare(
          `SELECT COUNT(*) n FROM invoice i
            WHERE i.project_id=? AND i.invoice_number IS NOT NULL
              AND i.invoice_number NOT LIKE 'CN-%'
              AND COALESCE(json_extract(i.snapshot_json,'$.documentType'),'')<>'credit_note'`,
        )
        .get(projectId) as { n: number }
    ).n,
  );
}

export function nextProjectSequence(sqlite: DatabaseSync, projectId: string): number {
  const row = sqlite
    .prepare('SELECT next_value FROM number_sequence WHERE scope=? AND scope_id=?')
    .get(PROJECT_INVOICE_SEQUENCE_SCOPE, projectId) as { next_value: number } | undefined;
  return row?.next_value ?? priorIssuedInvoices(sqlite, projectId) + 1;
}

const hasInvoiceRevisions = (sqlite: DatabaseSync) =>
  Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invoice_revision'").get(),
  );

/**
 * A number is used once any invoice was issued with it or any version of an invoice carried
 * it (migration 0092): such a number is never given out again.
 */
export function invoiceNumberUsed(sqlite: DatabaseSync, number: string): boolean {
  if (sqlite.prepare('SELECT 1 FROM invoice WHERE invoice_number=?').get(number)) return true;
  return (
    hasInvoiceRevisions(sqlite) &&
    Boolean(sqlite.prepare('SELECT 1 FROM invoice_revision WHERE invoice_number=?').get(number))
  );
}
const numberUsed = invoiceNumberUsed;

/** The number the next issued invoice of the project would get, without reserving anything. */
export function previewClientProjectNumber(
  sqlite: DatabaseSync,
  context: ProjectNumberContext,
): string {
  const { stem } = projectInvoiceNumberStem(sqlite, context);
  let sequence = nextProjectSequence(sqlite, context.projectId);
  while (numberUsed(sqlite, formatClientProjectNumber(stem, sequence))) sequence += 1;
  return formatClientProjectNumber(stem, sequence);
}

/** Allocate (inside the caller's issuing transaction) the project's next CP invoice number. */
export function allocateClientProjectNumber(
  sqlite: DatabaseSync,
  context: ProjectNumberContext,
  timestamp: string,
): string {
  const { stem, stored } = projectInvoiceNumberStem(sqlite, context);
  if (!stored)
    sqlite
      .prepare(
        'INSERT INTO project_invoice_number_series(project_id,client_id,stem,created_at) VALUES(?,?,?,?)',
      )
      .run(context.projectId, context.clientId, stem, timestamp);
  let sequence = nextProjectSequence(sqlite, context.projectId);
  while (numberUsed(sqlite, formatClientProjectNumber(stem, sequence))) sequence += 1;
  sqlite
    .prepare(
      `INSERT INTO number_sequence(scope,scope_id,next_value,version) VALUES(?,?,?,1)
       ON CONFLICT(scope,scope_id) DO UPDATE SET next_value=excluded.next_value,version=version+1`,
    )
    .run(PROJECT_INVOICE_SEQUENCE_SCOPE, context.projectId, sequence + 1);
  return formatClientProjectNumber(stem, sequence);
}
