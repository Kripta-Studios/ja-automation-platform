export type ReceiptState = 'missing' | 'attached' | 'not_required';

/** One operational search contract for the register and its authorized export. */
export function expenseSearchMatches(
  row: Readonly<Record<string, unknown>>,
  query: string,
): boolean {
  const normalize = (value: unknown) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase();
  const needle = normalize(query).trim();
  return (
    !needle ||
    [
      'vendor',
      'project_number',
      'project_name',
      'client_name',
      'description',
      'spent_on',
      'worker_name',
      'category',
      'currency',
    ].some((field) => normalize(row[field]).includes(needle))
  );
}

/** Uses only the operational receipt metadata allowed to every expense reviewer. */
export function expenseReceiptState(row: Readonly<Record<string, unknown>>): ReceiptState {
  if (typeof row.receipt_document_id === 'string' && row.receipt_document_id.trim())
    return 'attached';
  return row.receipt_required === true || row.receipt_required === 1 || row.receipt_required === '1'
    ? 'missing'
    : 'not_required';
}

export const receiptStateLabels: Record<ReceiptState, string> = {
  missing: 'Required receipt missing',
  attached: 'Receipt attached',
  not_required: 'Receipt not required',
};
