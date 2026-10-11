/** Quote every cell; neutralize spreadsheet formulas, including whitespace prefixes. */
export function supplierCsvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function supplierCsv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(supplierCsvCell).join(',')).join('\r\n') + '\r\n';
}

/** Decimal hours with enough precision to round-trip each canonical whole minute. */
export function supplierHoursFromMinutes(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes) || minutes < 0) return '';
  const scaled = (BigInt(minutes) * 10_000n + 30n) / 60n;
  const fraction = (scaled % 10_000n)
    .toString()
    .padStart(4, '0')
    .replace(/0+$/u, '')
    .padEnd(2, '0');
  return `${scaled / 10_000n}.${fraction}`;
}
