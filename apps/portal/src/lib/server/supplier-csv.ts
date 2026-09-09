/** Quote every cell; neutralize spreadsheet formulas, including whitespace prefixes. */
export function supplierCsvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function supplierCsv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(supplierCsvCell).join(',')).join('\r\n') + '\r\n';
}
