import type { DatabaseSync } from 'node:sqlite';

/** Read the number issuance would allocate today, without reserving or consuming it. */
export function previewInvoiceNumber(sqlite: DatabaseSync, legalEntityId: string, asOf: string) {
  const policy = sqlite
    .prepare(
      `SELECT id,prefix,digits,effective_from FROM invoice_number_policy
     WHERE legal_entity_id=? AND accountant_approved_at IS NOT NULL
       AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
     ORDER BY effective_from DESC LIMIT 1`,
    )
    .get(legalEntityId, asOf, asOf) as
    | { id: string; prefix: string; digits: number; effective_from: string }
    | undefined;
  const year = asOf.slice(0, 4);
  const row = sqlite
    .prepare("SELECT next_value FROM number_sequence WHERE scope='invoice' AND scope_id=?")
    .get(`${legalEntityId}:${year}`) as { next_value: number } | undefined;
  const sequence = row?.next_value ?? 1;
  const valid =
    policy &&
    Number.isInteger(policy.digits) &&
    policy.digits >= 4 &&
    policy.digits <= 10 &&
    Number.isSafeInteger(sequence) &&
    sequence > 0;
  return {
    number: valid
      ? `${policy.prefix}-${year}-${String(sequence).padStart(policy.digits, '0')}`
      : null,
    legalEntityId,
    asOf,
    policy: policy
      ? {
          id: policy.id,
          prefix: policy.prefix,
          digits: policy.digits,
          effectiveFrom: policy.effective_from,
        }
      : null,
  };
}
