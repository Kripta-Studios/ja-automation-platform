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
      {
        name: 'Expenses',
        rows,
        columns,
        dateColumns: ['Date'],
        numericColumns: ['Amount'],
        moneyColumns: ['Amount'],
      },
      {
        name: 'Totals by currency',
        rows: summary,
        columns: ['Currency', 'Amount'],
        numericColumns: ['Amount'],
        moneyColumns: ['Amount'],
      },
    ]);
  // Keep every export field, giving the description and status context their own full-width row.
  const mainColumns = ['Date', 'Project', 'Worker', 'Vendor', 'Currency', 'Amount'];
  const detailColumns = columns.filter(
    (column) => !mainColumns.includes(column) && column !== 'Description',
  );
  const sections = rows
    .map(
      (row) =>
        `<tbody class="expense-record"><tr>${mainColumns.map((column) => `<td${column === 'Amount' ? ' class="amount"' : ''}>${escape(row[column])}</td>`).join('')}</tr><tr class="expense-detail"><td colspan="6"><p class="expense-context">${detailColumns
          .filter((column) => column in row)
          .map(
            (column) => `<span><strong>${escape(column)}:</strong> ${escape(row[column])}</span>`,
          )
          .join(
            '',
          )}</p><p><strong>Description:</strong> ${escape(row.Description)}</p></td></tr></tbody>`,
    )
    .join('');
  return renderHtmlToPdf(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:12mm 14mm 16mm}
*{box-sizing:border-box}body{margin:0;font:9pt Arial,sans-serif;line-height:1.4;color:#183247}h1{font-size:20pt;margin:0 0 3mm}p{margin:2mm 0}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin-top:5mm}th,td{padding:2mm;text-align:left;overflow-wrap:break-word;word-break:normal;vertical-align:top}th{background:#eaf0f4;border-block:1px solid #cbd5e1;font-size:8.5pt}thead{display:table-header-group}.amount{text-align:right;overflow-wrap:anywhere}
.expense-record{break-inside:avoid;page-break-inside:avoid}.expense-detail td{padding-top:0;padding-bottom:3mm;border-bottom:1px solid #cbd5e1}.expense-context{display:flex;flex-wrap:wrap;gap:1mm 5mm;color:#334155}.expense-record:nth-of-type(even){background:#f6f8fa}
</style></head><body><h1>J&amp;A · Expense register</h1><p>${escape(period)} · ${records.length} records</p><p>${summary.map((row) => `${escape(row.Currency)} ${escape(row.Amount)}`).join(' · ')}</p><table><colgroup>${[10, 24, 16, 27, 8, 15].map((width) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${mainColumns.map((column) => `<th${column === 'Amount' ? ' class="amount"' : ''}>${escape(column)}</th>`).join('')}</tr></thead>${sections || '<tbody><tr><td colspan="6">No expenses in this period.</td></tr></tbody>'}</table></body></html>`,
  );
}
