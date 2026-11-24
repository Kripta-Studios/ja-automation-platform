/**
 * Spreadsheet-friendly CSV for the person's language (audit T49).
 *
 * Excel in Spanish and Brazilian Portuguese expects `;` between cells and a
 * decimal comma; English keeps `,` and a decimal point. Every file starts with
 * a UTF-8 BOM so names such as "Dürr" or "João" open correctly, and text cells
 * keep the spreadsheet-formula guard.
 */
import type { PortalLocale } from '$lib/portal-i18n';

export type CsvDialect = Readonly<{ separator: ',' | ';'; decimal: '.' | ',' }>;

export function csvDialect(locale: PortalLocale): CsvDialect {
  return locale === 'en' ? { separator: ',', decimal: '.' } : { separator: ';', decimal: ',' };
}

/** "8.5" → "8,5" for ES/PT; leaves non-numeric text untouched. */
export function localizedDecimal(value: unknown, locale: PortalLocale): string {
  const text = String(value ?? '');
  if (!/^-?\d+(?:\.\d+)?$/u.test(text)) return text;
  return csvDialect(locale).decimal === ',' ? text.replace('.', ',') : text;
}

function cell(value: unknown, separator: string): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(text) && !/^-?\d+(?:[.,]\d+)?$/u.test(text)) text = `'${text}`;
  if (/^[\t\r\n]/u.test(text)) text = `'${text}`;
  return text.includes(separator) || /["\r\n]/u.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/**
 * Rows → CSV text with BOM. `numericColumns` are column indexes whose values
 * are plain decimals ("8.5", "-12.30") rendered with the locale's decimal mark.
 */
export function localizedCsv(
  rows: readonly (readonly unknown[])[],
  locale: PortalLocale,
  numericColumns: ReadonlySet<number> = new Set(),
): string {
  const { separator } = csvDialect(locale);
  return (
    '﻿' +
    rows
      .map((row, rowIndex) =>
        row
          .map((value, column) =>
            cell(
              rowIndex > 0 && numericColumns.has(column) ? localizedDecimal(value, locale) : value,
              separator,
            ),
          )
          .join(separator),
      )
      .join('\r\n') +
    '\r\n'
  );
}
