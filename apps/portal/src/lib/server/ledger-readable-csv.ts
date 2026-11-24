import { formatMinorPlain, isCurrency } from '@ja/billing-engine';
import { translate, type PortalLocale } from '$lib/i18n/catalog';
import { translateControlledValue } from '$lib/i18n/controlled-values';
import { agingLabels, type AgingBucket } from '$lib/portal/collections-analysis';

/**
 * T49 (audit 2026-11-22): the invoice collection ledger CSV people open in a spreadsheet.
 *
 * Headers in the viewer's language, amounts in currency units (exact: converted from the
 * stored integer minor units with bigint, never floats), statuses and aging in words,
 * calendar dates without times, and a UTF-8 BOM so Excel reads accents ("Dürr") correctly,
 * like the hours CSV. The full machine layout (camelCase columns, minor units, source ids)
 * is still available with `layout=raw`.
 */
type LedgerRow = Readonly<Record<string, unknown>>;

const headers = {
  en: [
    'Invoice',
    'Client',
    'Project',
    'Service period from',
    'Service period to',
    'Issue date',
    'Due date',
    'Expected collection',
    'Currency',
    'Subtotal',
    'Tax',
    'Total',
    'Collected',
    'Credit applied',
    'Outstanding',
    'Status',
    'Days overdue',
    'Aging',
    'PO number',
  ],
  es: [
    'Factura',
    'Cliente',
    'Proyecto',
    'Periodo de servicio desde',
    'Periodo de servicio hasta',
    'Fecha de emisión',
    'Vencimiento',
    'Cobro previsto',
    'Moneda',
    'Subtotal',
    'Impuesto',
    'Total',
    'Cobrado',
    'Crédito aplicado',
    'Pendiente',
    'Estado',
    'Días de atraso',
    'Antigüedad',
    'Número de pedido (PO)',
  ],
  pt: [
    'Fatura',
    'Cliente',
    'Projeto',
    'Período de serviço de',
    'Período de serviço até',
    'Data de emissão',
    'Vencimento',
    'Recebimento previsto',
    'Moeda',
    'Subtotal',
    'Imposto',
    'Total',
    'Recebido',
    'Crédito aplicado',
    'Em aberto',
    'Status',
    'Dias em atraso',
    'Antiguidade',
    'Número do pedido (PO)',
  ],
} as const satisfies Record<PortalLocale, readonly string[]>;

const unpaid: Record<PortalLocale, string> = { en: 'Unpaid', es: 'Sin pagar', pt: 'Não pago' };
const overpaid: Record<PortalLocale, string> = {
  en: 'Credit balance',
  es: 'Saldo a favor',
  pt: 'Saldo a favor',
};

function text(row: LedgerRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || typeof value === 'object') continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Exact currency units from integer minor units ("-12345" USD -> "-123.45"; JPY has none). */
export function ledgerCurrencyUnits(minor: string, currency: string): string {
  if (!/^-?\d+$/u.test(minor)) return '';
  const amount = BigInt(minor);
  if (isCurrency(currency)) return formatMinorPlain(amount, currency);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function statusText(locale: PortalLocale, status: string): string {
  if (!status) return '';
  if (status === 'unpaid') return unpaid[locale];
  if (status === 'overpaid' || status === 'credit') return overpaid[locale];
  return translateControlledValue(locale, 'status', status) || status;
}

function agingText(locale: PortalLocale, bucket: string): string {
  const label = agingLabels[bucket as AgingBucket];
  return label ? translate(locale, label) : bucket;
}

function cell(value: string, numeric = false): string {
  let out = value;
  // Spreadsheet formula injection: text starting with = + - @ or a control character is
  // neutralised; exact decimal amounts in numeric columns stay numbers.
  const decimal = /^-?\d+(?:\.\d+)?$/u.test(out);
  if (!(numeric && decimal) && /^[=+\-@\t\r\n]/u.test(out)) out = `'${out}`;
  return /[",\r\n;]/u.test(out) ? `"${out.replace(/"/gu, '""')}"` : out;
}

export function ledgerReadableCsv(rows: readonly LedgerRow[], locale: PortalLocale): Uint8Array {
  const header = headers[locale] ?? headers.en;
  const numericColumns = new Set([9, 10, 11, 12, 13, 14, 16]);
  const lines = rows.map((row) => {
    const currency = text(row, 'currency');
    const amount = (...keys: string[]) => ledgerCurrencyUnits(text(row, ...keys), currency);
    const values = [
      text(row, 'invoiceNumber', 'invoice_number'),
      [text(row, 'clientNumber'), text(row, 'clientName')].filter(Boolean).join(' · '),
      [text(row, 'projectNumber'), text(row, 'projectName')].filter(Boolean).join(' · '),
      text(row, 'periodStart').slice(0, 10),
      text(row, 'periodEnd').slice(0, 10),
      text(row, 'issueDate', 'issue_date').slice(0, 10),
      text(row, 'dueDate', 'due_date').slice(0, 10),
      text(row, 'expectedCollectionDate').slice(0, 10),
      currency,
      amount('subtotalMinor'),
      amount('taxMinor'),
      amount('totalMinor'),
      amount('netCollectedMinor', 'collectedMinor'),
      amount('appliedCreditMinor'),
      amount('netOutstandingMinor', 'outstandingMinor'),
      statusText(locale, text(row, 'paymentStatus', 'payment_status')),
      text(row, 'daysOverdue'),
      agingText(locale, text(row, 'agingBucket')),
      text(row, 'poNumber'),
    ];
    return values.map((value, index) => cell(value, numericColumns.has(index))).join(',');
  });
  return new TextEncoder().encode(
    `﻿${[header.map((value) => cell(value)).join(','), ...lines].join('\r\n')}\r\n`,
  );
}
