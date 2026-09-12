import { renderHtmlToPdf, toCsv, xlsxFromSheets } from './exports.ts';

type Row = Record<string, unknown>;
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
const decimal = (value: unknown) => {
  const amount = BigInt(String(value ?? '0'));
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};
/** Explicit public columns; finance-only repository fields are never serialized implicitly. */
export function expenseRegisterRows(records: readonly Row[]): Record<string, string>[] {
  return records.map((row) => ({
    Date: String(row.spent_on ?? ''),
    Client: String(row.client_name ?? ''),
    Project: `${row.project_number ?? ''} ${row.project_name ?? ''}`.trim(),
    Worker: String(row.worker_name ?? ''),
    Vendor: String(row.vendor ?? ''),
    Category: String(row.category ?? ''),
    Description: String(row.description ?? ''),
    Currency: String(row.currency ?? ''),
    Amount: decimal(row.amount_minor),
    Payer: String(row.who_paid ?? ''),
    Status: String(row.approval_state ?? ''),
    ...('reimbursement_state' in row
      ? { Reimbursement: String(row.reimbursement_state ?? '') }
      : {}),
  }));
}
export function expenseRegisterExport(
  records: readonly Row[],
  format: 'csv' | 'xlsx' | 'pdf',
  period: string,
): Uint8Array {
  const rows = expenseRegisterRows(records);
  const columns = [
    'Date',
    'Client',
    'Project',
    'Worker',
    'Vendor',
    'Category',
    'Description',
    'Currency',
    'Amount',
    'Payer',
    'Status',
    ...(rows.some((row) => 'Reimbursement' in row) ? ['Reimbursement'] : []),
  ];
  const totals = new Map<string, bigint>();
  for (const row of records)
    totals.set(
      String(row.currency),
      (totals.get(String(row.currency)) ?? 0n) + BigInt(String(row.amount_minor ?? 0)),
    );
  const summary = [...totals].map(([Currency, Amount]) => ({ Currency, Amount: decimal(Amount) }));
  if (format === 'csv') return new TextEncoder().encode(toCsv(rows, columns));
  if (format === 'xlsx')
    return xlsxFromSheets([
      { name: 'Expenses', rows, columns, moneyColumns: ['Amount'] },
      { name: 'Totals by currency', rows: summary },
    ]);
  return renderHtmlToPdf(
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}body{font:9pt Arial;color:#183247}h1{font-size:20pt}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{padding:5px;border-bottom:1px solid #cbd5e1;text-align:left;overflow-wrap:anywhere;vertical-align:top}th{background:#eaf0f4}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>J&amp;A · Expense register</h1><p>${escape(period)} · ${records.length} records</p><p>${summary.map((row) => `${escape(row.Currency)} ${escape(row.Amount)}`).join(' · ')}</p><table><thead><tr>${columns.map((column) => `<th>${escape(column)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escape(row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`,
  );
}
