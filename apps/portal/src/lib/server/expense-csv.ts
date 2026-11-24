/**
 * Expense register CSV in the person's language (audit T49): translated
 * headers, category, payer and status words, display names instead of login
 * names, and the locale's separator and decimal mark. The column allowlist is
 * the shared `expenseRegisterRows` projection, so no extra field leaks.
 */
import { expenseRegisterRows } from '@ja/reporting';
import type { PortalLocale } from '$lib/portal-i18n';
import { translateControlledValue } from '$lib/i18n/controlled-values';
import { personDisplayName } from '$lib/portal/display-name';
import { localizedCsv } from './localized-csv';

type Tuple = readonly [string, string, string];
const HEADERS: Record<string, Tuple> = {
  Date: ['Date', 'Fecha', 'Data'],
  Client: ['Client', 'Cliente', 'Cliente'],
  Project: ['Project', 'Proyecto', 'Projeto'],
  Worker: ['Worker', 'Trabajador', 'Colaborador'],
  Vendor: ['Vendor', 'Proveedor', 'Fornecedor'],
  Category: ['Category', 'Categoría', 'Categoria'],
  Description: ['Description', 'Descripción', 'Descrição'],
  Currency: ['Currency', 'Moneda', 'Moeda'],
  'Recorded amount': ['Amount', 'Importe', 'Valor'],
  Payer: ['Paid by', 'Pagado por', 'Pago por'],
  Status: ['Status', 'Estado', 'Status'],
  'Reimbursement amount': ['Reimbursement amount', 'Importe a reembolsar', 'Valor a reembolsar'],
  'Reimbursed amount': ['Reimbursed amount', 'Importe reembolsado', 'Valor reembolsado'],
  'Reimbursement status': ['Reimbursement status', 'Estado del reembolso', 'Status do reembolso'],
};
const PAYER: Record<string, Tuple> = {
  worker: ['Worker (to reimburse)', 'Trabajador (a reembolsar)', 'Colaborador (a reembolsar)'],
  company_card: ['Company card', 'Tarjeta de la empresa', 'Cartão da empresa'],
  company_direct: ['Company paid directly', 'Pagado por la empresa', 'Pago pela empresa'],
  third_party: ['Third party', 'Terceros', 'Terceiros'],
  client: ['Client', 'Cliente', 'Cliente'],
};
const REIMBURSEMENT: Record<string, Tuple> = {
  pending: ['Pending', 'Pendiente', 'Pendente'],
  scheduled: ['Scheduled', 'Programado', 'Agendado'],
  reimbursed: ['Reimbursed', 'Reembolsado', 'Reembolsado'],
  paid: ['Paid', 'Pagado', 'Pago'],
};
const index = (locale: PortalLocale) => (locale === 'es' ? 1 : locale === 'pt' ? 2 : 0);
const NUMERIC = new Set(['Recorded amount', 'Reimbursement amount', 'Reimbursed amount']);

export function localizedExpenseCsv(
  records: readonly Record<string, unknown>[],
  locale: PortalLocale,
): string {
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
    'Recorded amount',
    'Payer',
    'Status',
    ...(rows.some((row) => 'Reimbursement status' in row)
      ? ['Reimbursement amount', 'Reimbursed amount', 'Reimbursement status']
      : []),
  ];
  const i = index(locale);
  const word = (map: Record<string, Tuple>, value: string) => map[value]?.[i] ?? value;
  const body = rows.map((row, rowIndex) => {
    const source = records[rowIndex] ?? {};
    return columns.map((column) => {
      const value = row[column] ?? '';
      if (column === 'Worker') return personDisplayName(value, source.worker_email);
      if (column === 'Category')
        return value ? translateControlledValue(locale, 'expenseCategory', value) : '';
      if (column === 'Status') return value ? translateControlledValue(locale, 'status', value) : '';
      if (column === 'Payer') return value ? word(PAYER, value) : '';
      if (column === 'Reimbursement status') return value ? word(REIMBURSEMENT, value) : '';
      return value;
    });
  });
  const numeric = new Set(
    columns.flatMap((column, position) => (NUMERIC.has(column) ? [position] : [])),
  );
  return localizedCsv(
    [columns.map((column) => HEADERS[column]?.[i] ?? column), ...body],
    locale,
    numeric,
  );
}
