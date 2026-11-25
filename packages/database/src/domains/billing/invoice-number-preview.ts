import type { DatabaseSync } from 'node:sqlite';
import {
  invoiceNumberFormatColumn,
  previewClientProjectNumber,
  type ProjectNumberContext,
} from './invoice-number-format.ts';

/**
 * Decision D15 (audit 2026-11-22): credit notes are their own document type with their own
 * number series per issuer and year ("CN-<invoice prefix>-<year>-<n>"), never a negative
 * number in the invoice sequence.
 */
export const CREDIT_NOTE_NUMBER_PREFIX = 'CN';
export type FiscalDocumentKind = 'invoice' | 'credit_note';
export const numberSequenceScope = (kind: FiscalDocumentKind) =>
  kind === 'credit_note' ? 'credit_note' : 'invoice';
export function formatDocumentNumber(
  kind: FiscalDocumentKind,
  prefix: string,
  year: string | number,
  sequence: number,
  digits: number,
): string {
  const base = `${prefix}-${year}-${String(sequence).padStart(digits, '0')}`;
  return kind === 'credit_note' ? `${CREDIT_NOTE_NUMBER_PREFIX}-${base}` : base;
}

/** Read the number issuance would allocate today, without reserving or consuming it. */
export function previewInvoiceNumber(
  sqlite: DatabaseSync,
  legalEntityId: string,
  asOf: string,
  kind: FiscalDocumentKind = 'invoice',
  project: ProjectNumberContext | null = null,
) {
  const policy = sqlite
    .prepare(
      `SELECT id,prefix,digits,effective_from,${invoiceNumberFormatColumn(sqlite)} FROM invoice_number_policy
     WHERE legal_entity_id=? AND accountant_approved_at IS NOT NULL
       AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
     ORDER BY effective_from DESC LIMIT 1`,
    )
    .get(legalEntityId, asOf, asOf) as
    | { id: string; prefix: string; digits: number; effective_from: string; number_format: string }
    | undefined;
  const clientProject =
    kind === 'invoice' && policy?.number_format === 'client_project_sequence';
  const year = asOf.slice(0, 4);
  const row = sqlite
    .prepare('SELECT next_value FROM number_sequence WHERE scope=? AND scope_id=?')
    .get(numberSequenceScope(kind), `${legalEntityId}:${year}`) as
    | { next_value: number }
    | undefined;
  const sequence = row?.next_value ?? 1;
  const valid =
    policy &&
    Number.isInteger(policy.digits) &&
    policy.digits >= 4 &&
    policy.digits <= 10 &&
    Number.isSafeInteger(sequence) &&
    sequence > 0;
  return {
    number:
      clientProject && project
        ? previewClientProjectNumber(sqlite, project)
        : valid && !clientProject
          ? formatDocumentNumber(kind, policy.prefix, year, sequence, policy.digits)
          : null,
    kind,
    legalEntityId,
    asOf,
    policy: policy
      ? {
          id: policy.id,
          prefix: policy.prefix,
          digits: policy.digits,
          effectiveFrom: policy.effective_from,
          numberFormat: policy.number_format,
        }
      : null,
  };
}
