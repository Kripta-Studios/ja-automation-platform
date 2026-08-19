import { deflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Cell = string | number | bigint | boolean | null | undefined;
type Row = Readonly<Record<string, Cell>>;

const xmlEscape = (value: string): string =>
  value.replace(
    /[<>&'\"]/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '\"': '&quot;' })[character] ??
      character,
  );

const cellText = (value: Cell): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'bigint'
      ? value.toString()
      : String(value);

export function toCsv(rows: readonly Row[], columns?: readonly string[]): string {
  const headers = columns ? [...columns] : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const encode = (value: Cell): string => {
    const text = cellText(value);
    return /[\",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return (
    [
      headers.map(encode).join(','),
      ...rows.map((row) => headers.map((header) => encode(row[header])).join(',')),
    ].join('\r\n') + '\r\n'
  );
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function zip(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const compressed = deflateRawSync(file.data);
    const checksum = crc32(file.data);
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(checksum),
      u32(compressed.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    local.push(localHeader, compressed);
    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(checksum),
      u32(compressed.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    central.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }
  const centralBytes = concat(central);
  const localBytes = concat(local);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(localBytes.length),
    u16(0),
  ]);
  return concat([localBytes, centralBytes, end]);
}

function worksheet(rows: readonly Row[], columns?: readonly string[]): string {
  const headers = columns ? [...columns] : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const allRows = [Object.fromEntries(headers.map((header) => [header, header])), ...rows];
  const cells = allRows
    .map((row, rowIndex) => {
      const values = headers
        .map((header, columnIndex) => {
          const reference = `${String.fromCharCode(65 + (columnIndex % 26))}${rowIndex + 1}`;
          const value = xmlEscape(cellText(row[header]));
          return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${values}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;
}

export function xlsxFromSheets(
  sheets: readonly { name: string; rows: readonly Row[]; columns?: readonly string[] }[],
): Uint8Array {
  const safeSheets = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }];
  const sheetEntries = safeSheets.map((sheet, index) => ({
    name: sheet.name.replace(/[\\/:?*\[\]]/g, '').slice(0, 31) || `Sheet${index + 1}`,
    rows: worksheet(sheet.rows, sheet.columns),
  }));
  const workbookSheets = sheetEntries
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const relationships = sheetEntries
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const contentTypes = [
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    ...sheetEntries.map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
  ].join('');
  const textFile = (value: string): Uint8Array => new TextEncoder().encode(value);
  return zip([
    {
      name: '[Content_Types].xml',
      data: textFile(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes}</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: textFile(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: textFile(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: textFile(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`,
      ),
    },
    ...sheetEntries.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: textFile(sheet.rows),
    })),
  ]);
}

export const REPORT_TEMPLATE_VERSION = '2026.08.19.2';
export const REPORT_LOCALES = ['en', 'pt', 'es'] as const;
export type ReportLocale = (typeof REPORT_LOCALES)[number];

const normalizeReportLocale = (value: unknown): ReportLocale =>
  value === 'pt' || value === 'es' ? value : 'en';

const localeTag = (locale: ReportLocale): string =>
  locale === 'pt' ? 'pt-BR' : locale === 'es' ? 'es-ES' : 'en-US';

type ReportLabels = Readonly<{
  accountingPack: string;
  totalsByCurrency: string;
  noTotals: string;
  projectPeriodReport: string;
  dailyReports: string;
  technicalRecords: string;
  operationalRecord: string;
  type: string;
  date: string;
  detail: string;
  noReportRecords: string;
  from: string;
  billTo: string;
  invoiceDetail: string;
  description: string;
  amount: string;
  noInvoiceLines: string;
  subtotal: string;
  tax: string;
  total: string;
  noCurrencyBreakdown: string;
  dailyReport: string;
  technicalReport: string;
  technicalChange: string;
  laborDetailedInvoice: string;
  laborSummaryInvoice: string;
  expenseInvoice: string;
  fixedMilestoneInvoice: string;
  creditAdjustment: string;
}>;

const labels: Record<ReportLocale, ReportLabels> = {
  en: {
    accountingPack: 'Accounting Pack',
    totalsByCurrency: 'Totals by currency',
    noTotals: 'No totals recorded.',
    projectPeriodReport: 'Project Period Report',
    dailyReports: 'Daily reports',
    technicalRecords: 'Technical records',
    operationalRecord: 'Operational record',
    type: 'Type',
    date: 'Date',
    detail: 'Detail',
    noReportRecords: 'No report records.',
    from: 'From',
    billTo: 'Bill to',
    invoiceDetail: 'Invoice detail',
    description: 'Description',
    amount: 'Amount',
    noInvoiceLines: 'No invoice lines.',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    noCurrencyBreakdown: 'No currency breakdown.',
    dailyReport: 'Daily report',
    technicalReport: 'Technical report',
    technicalChange: 'Technical change',
    laborDetailedInvoice: 'Labor Detailed Invoice',
    laborSummaryInvoice: 'Labor Summary Invoice',
    expenseInvoice: 'Expense Invoice',
    fixedMilestoneInvoice: 'Fixed / Milestone Invoice',
    creditAdjustment: 'Credit / Adjustment',
  },
  pt: {
    accountingPack: 'Pacote Contábil',
    totalsByCurrency: 'Totais por moeda',
    noTotals: 'Nenhum total registrado.',
    projectPeriodReport: 'Relatório Periódico do Projeto',
    dailyReports: 'Relatórios diários',
    technicalRecords: 'Registros técnicos',
    operationalRecord: 'Registro operacional',
    type: 'Tipo',
    date: 'Data',
    detail: 'Detalhe',
    noReportRecords: 'Nenhum registro de relatório.',
    from: 'De',
    billTo: 'Faturar para',
    invoiceDetail: 'Detalhes da fatura',
    description: 'Descrição',
    amount: 'Valor',
    noInvoiceLines: 'Nenhuma linha de fatura.',
    subtotal: 'Subtotal',
    tax: 'Imposto',
    total: 'Total',
    noCurrencyBreakdown: 'Nenhum detalhamento por moeda.',
    dailyReport: 'Relatório diário',
    technicalReport: 'Relatório técnico',
    technicalChange: 'Alteração técnica',
    laborDetailedInvoice: 'Fatura Detalhada de Mão de Obra',
    laborSummaryInvoice: 'Fatura Resumida de Mão de Obra',
    expenseInvoice: 'Fatura de Despesas',
    fixedMilestoneInvoice: 'Fatura Fixa / por Marco',
    creditAdjustment: 'Crédito / Ajuste',
  },
  es: {
    accountingPack: 'Paquete Contable',
    totalsByCurrency: 'Totales por moneda',
    noTotals: 'No hay totales registrados.',
    projectPeriodReport: 'Informe Periódico del Proyecto',
    dailyReports: 'Informes diarios',
    technicalRecords: 'Registros técnicos',
    operationalRecord: 'Registro operativo',
    type: 'Tipo',
    date: 'Fecha',
    detail: 'Detalle',
    noReportRecords: 'No hay registros de informes.',
    from: 'De',
    billTo: 'Facturar a',
    invoiceDetail: 'Detalle de factura',
    description: 'Descripción',
    amount: 'Importe',
    noInvoiceLines: 'No hay líneas de factura.',
    subtotal: 'Subtotal',
    tax: 'Impuesto',
    total: 'Total',
    noCurrencyBreakdown: 'No hay desglose por moneda.',
    dailyReport: 'Informe diario',
    technicalReport: 'Informe técnico',
    technicalChange: 'Cambio técnico',
    laborDetailedInvoice: 'Factura Detallada de Mano de Obra',
    laborSummaryInvoice: 'Factura Resumida de Mano de Obra',
    expenseInvoice: 'Factura de Gastos',
    fixedMilestoneInvoice: 'Factura Fija / por Hito',
    creditAdjustment: 'Crédito / Ajuste',
  },
};

const htmlEscape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );

const playwrightModule = (() => {
  try {
    return pathToFileURL(createRequire(import.meta.url).resolve('playwright')).href;
  } catch {
    return 'playwright';
  }
})();

const renderScript = `
import playwright from ${JSON.stringify(playwrightModule)};
const { chromium } = playwright;
let html = '';
for await (const chunk of process.stdin) html += chunk;
const browser = await chromium.launch({ headless: true, ...(process.env.JA_CHROMIUM_PATH ? { executablePath: process.env.JA_CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts?.ready);
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font:9px Arial;color:#64748b;text-align:right;padding:0 18mm"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '14mm', right: '14mm', bottom: '18mm', left: '14mm' }
  });
  process.stdout.write(Buffer.from(pdf).toString('base64'));
} finally { await browser.close(); }
`;

/** Render the same immutable HTML snapshot in interactive and scheduled jobs. */
export function renderHtmlToPdf(html: string): Uint8Array {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', renderScript], {
    input: html,
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  });
  if (result.status !== 0 || !result.stdout.trim())
    throw new Error(`Chromium PDF rendering failed: ${result.stderr?.trim() || 'no output'}`);
  return new Uint8Array(Buffer.from(result.stdout.trim(), 'base64'));
}

const pageCss = `
@page { size: A4; margin: 14mm 14mm 18mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #17212b; font: 10pt Arial, sans-serif; line-height: 1.4; }
h1 { margin: 0 0 5mm; color: #0f2d3d; font-size: 24pt; letter-spacing: -.02em; }
h2 { margin: 7mm 0 2mm; color: #0f2d3d; font-size: 13pt; border-bottom: 1px solid #d9e1e7; padding-bottom: 1.5mm; }
.masthead { display:flex; justify-content:space-between; gap:12mm; border-bottom: 4px solid #e23d2d; padding-bottom: 5mm; margin-bottom: 7mm; }
.eyebrow { color:#e23d2d; font-weight:700; text-transform:uppercase; letter-spacing:.12em; font-size:8pt; }
.muted { color:#64748b; }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4mm 10mm; }
.metric { background:#f1f5f7; border-left:3px solid #e23d2d; padding:3mm; break-inside:avoid; }
.metric strong { display:block; color:#0f2d3d; font-size:15pt; margin-top:1mm; }
table { width:100%; border-collapse:collapse; margin-top:3mm; break-inside:auto; }
thead { display:table-header-group; }
tr { break-inside:avoid; }
th { background:#0f2d3d; color:#fff; text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:.06em; padding:2.4mm; }
td { border-bottom:1px solid #d9e1e7; padding:2.4mm; vertical-align:top; }
td.amount, th.amount { text-align:right; white-space:nowrap; }
.total { margin:6mm 0 0 auto; width:70mm; border-top:3px solid #e23d2d; padding-top:3mm; }
.total div { display:flex; justify-content:space-between; gap:4mm; padding:1mm 0; }
.total strong { color:#0f2d3d; font-size:15pt; }
.page-break { break-before: page; }
`;

function layout(title: string, subtitle: string, body: string, locale: ReportLocale): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="template-version" content="${REPORT_TEMPLATE_VERSION}"><meta name="report-locale" content="${locale}"><style>${pageCss}</style></head><body><header class="masthead"><div><div class="eyebrow">J&amp;A Automation</div><h1>${htmlEscape(title)}</h1><div class="muted">${htmlEscape(subtitle)}</div></div><div class="muted">Template ${REPORT_TEMPLATE_VERSION}</div></header>${body}</body></html>`;
}

function moneyText(currency: unknown, minor: unknown, locale: ReportLocale = 'en'): string {
  const code =
    typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD';
  let amount: bigint;
  try {
    amount = BigInt(String(minor ?? 0));
  } catch {
    amount = 0n;
  }
  let fractionDigits = 2;
  try {
    fractionDigits =
      new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // Keep the standard two-decimal fallback for an unrecognised currency code.
  }
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(fractionDigits);
  const formatterLocale = localeTag(locale);
  const decimalParts = new Intl.NumberFormat(formatterLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).formatToParts(1000.5);
  const groupSeparator = decimalParts.find((part) => part.type === 'group')?.value ?? ',';
  const decimalSeparator = decimalParts.find((part) => part.type === 'decimal')?.value ?? '.';
  const integer = (absolute / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  const fraction =
    fractionDigits > 0
      ? `${decimalSeparator}${(absolute % scale).toString().padStart(fractionDigits, '0')}`
      : '';
  let prefix = '';
  let suffix = '';
  try {
    const parts = new Intl.NumberFormat(formatterLocale, {
      style: 'currency',
      currency: code,
    }).formatToParts(0);
    const firstNumeric = parts.findIndex((part) => part.type === 'integer');
    const lastNumeric = [...parts]
      .reverse()
      .findIndex((part) => ['integer', 'group', 'decimal', 'fraction'].includes(part.type));
    const end = parts.length - lastNumeric;
    prefix = parts
      .slice(0, firstNumeric)
      .map((part) => part.value)
      .join('');
    suffix = parts
      .slice(end)
      .map((part) => part.value)
      .join('');
  } catch {
    prefix = `${code} `;
  }
  return htmlEscape(`${negative ? '-' : ''}${prefix}${integer}${fraction}${suffix}`);
}

export function accountingPackCsv(
  snapshot: Readonly<{ invoiceRegister: readonly Row[] }>,
): Uint8Array {
  return new TextEncoder().encode(toCsv(snapshot.invoiceRegister));
}

export function accountingPackXlsx(
  snapshot: Readonly<{
    invoiceRegister: readonly Row[];
    collections: readonly Row[];
    workerCosts: readonly Row[];
    expenseRegister: readonly Row[];
  }>,
): Uint8Array {
  return xlsxFromSheets([
    { name: 'Invoice register', rows: snapshot.invoiceRegister },
    { name: 'Collections', rows: snapshot.collections },
    { name: 'Worker direct costs', rows: snapshot.workerCosts },
    { name: 'Expenses', rows: snapshot.expenseRegister },
  ]);
}

type AccountingPackSourceSnapshot = Readonly<{
  periodStart: string;
  periodEnd: string;
  locale?: ReportLocale | string;
  invoiceRegister: readonly Record<string, unknown>[];
  collections: readonly Record<string, unknown>[];
  workerCosts: readonly Record<string, unknown>[];
  expenseRegister: readonly Record<string, unknown>[];
  totals: Record<string, unknown>;
  totalsByCurrency?: readonly Record<string, unknown>[];
}>;

function exportCell(value: unknown): Cell {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  )
    return value;
  return JSON.stringify(value);
}

function exportRows(rows: readonly Record<string, unknown>[]): readonly Row[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, exportCell(value)])),
  );
}

/** One canonical artifact set for interactive and scheduled Accounting Pack generation. */
export function accountingPackArtifacts(snapshot: AccountingPackSourceSnapshot): readonly {
  type: 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json';
  extension: string;
  bytes: Uint8Array;
}[] {
  const normalized = {
    ...snapshot,
    locale: normalizeReportLocale(snapshot.locale),
    invoiceRegister: exportRows(snapshot.invoiceRegister),
    collections: exportRows(snapshot.collections),
    workerCosts: exportRows(snapshot.workerCosts),
    expenseRegister: exportRows(snapshot.expenseRegister),
    totals: Object.fromEntries(
      Object.entries(snapshot.totals).map(([key, value]) => [key, exportCell(value)]),
    ),
    totalsByCurrency: exportRows(snapshot.totalsByCurrency ?? []),
  };
  return [
    { type: 'pdf', extension: 'pdf', bytes: accountingPackPdf(normalized) },
    { type: 'xlsx', extension: 'xlsx', bytes: accountingPackXlsx(normalized) },
    { type: 'invoice_csv', extension: 'csv', bytes: accountingPackCsv(normalized) },
    {
      type: 'expense_csv',
      extension: 'csv',
      bytes: new TextEncoder().encode(toCsv(normalized.expenseRegister)),
    },
    {
      type: 'json',
      extension: 'json',
      bytes: new TextEncoder().encode(JSON.stringify(normalized)),
    },
  ];
}

export function accountingPackPdf(
  snapshot: Readonly<{
    periodStart: string;
    periodEnd: string;
    locale?: ReportLocale | string;
    totals: Row | null;
    totalsByCurrency?: readonly Row[];
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = labels[locale];
  const totals = Object.entries(snapshot.totals ?? {})
    .map(
      ([key, value]) =>
        `<div class="metric"><span class="muted">${htmlEscape(key)}</span><strong>${htmlEscape(value)}</strong></div>`,
    )
    .join('');
  const byCurrency = (snapshot.totalsByCurrency ?? [])
    .map(
      (row) =>
        `<tr>${Object.values(row)
          .map((value) => `<td>${htmlEscape(value)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return renderHtmlToPdf(
    layout(
      copy.accountingPack,
      `${snapshot.periodStart} → ${snapshot.periodEnd}`,
      `<section class="grid">${totals || `<div class="muted">${copy.noTotals}</div>`}</section><h2>${copy.totalsByCurrency}</h2><table><tbody>${byCurrency || `<tr><td class="muted">${copy.noCurrencyBreakdown}</td></tr>`}</tbody></table>`,
      locale,
    ),
  );
}

export function periodReportPdf(
  snapshot: Readonly<{
    project?: Readonly<{ number?: string; name?: string; clientName?: string }>;
    periodStart: string;
    periodEnd: string;
    audience?: string;
    locale?: ReportLocale | string;
    dailyReports?: readonly Row[];
    technicalReports?: readonly Row[];
    technicalChanges?: readonly Row[];
    backupArtifacts?: readonly Row[];
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = labels[locale];
  const rows = [
    ...(snapshot.dailyReports ?? []).map((row) => ({
      type: copy.dailyReport,
      date: row.work_date ?? row.workDate,
      detail: row.summary,
    })),
    ...(snapshot.technicalReports ?? []).map((row) => ({
      type: copy.technicalReport,
      date: row.created_at ?? row.createdAt,
      detail: row.change_summary ?? row.changeSummary,
    })),
    ...(snapshot.technicalChanges ?? []).map((row) => ({
      type: copy.technicalChange,
      date: row.created_at ?? row.createdAt,
      detail: row.change_made ?? row.changeMade,
    })),
  ];
  const table = rows
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.type)}</td><td>${htmlEscape(row.date)}</td><td>${htmlEscape(row.detail)}</td></tr>`,
    )
    .join('');
  return renderHtmlToPdf(
    layout(
      copy.projectPeriodReport,
      `${snapshot.project?.number ?? ''} ${snapshot.project?.name ?? ''} · ${snapshot.periodStart} → ${snapshot.periodEnd} · ${snapshot.audience ?? ''}`,
      `<div class="grid"><div class="metric"><span class="muted">${copy.dailyReports}</span><strong>${snapshot.dailyReports?.length ?? 0}</strong></div><div class="metric"><span class="muted">${copy.technicalRecords}</span><strong>${(snapshot.technicalReports?.length ?? 0) + (snapshot.technicalChanges?.length ?? 0)}</strong></div></div><h2>${copy.operationalRecord}</h2><table><thead><tr><th>${copy.type}</th><th>${copy.date}</th><th>${copy.detail}</th></tr></thead><tbody>${table || `<tr><td colspan="3" class="muted">${copy.noReportRecords}</td></tr>`}</tbody></table>`,
      locale,
    ),
  );
}

export function invoicePdf(
  snapshot: Readonly<{
    number: string;
    locale?: ReportLocale | string;
    template?: { id?: string; version?: number };
    commercial?: { streamType?: string; groupingMode?: string };
    legalEntity?: { legal_name?: string };
    client?: { legalName?: string };
    calculation?: {
      currency?: string;
      subtotalMinor?: string;
      taxMinor?: string;
      totalMinor?: string;
    };
    lines?: readonly Row[];
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = labels[locale];
  const rows = (snapshot.lines ?? [])
    .map(
      (line) =>
        `<tr><td>${htmlEscape(line.description)}</td><td class="amount">${moneyText(snapshot.calculation?.currency, line.subtotal_minor, locale)}</td></tr>`,
    )
    .join('');
  const legalEntity = snapshot.legalEntity as Record<string, unknown> | undefined;
  const client = snapshot.client as Record<string, unknown> | undefined;
  const calculation = snapshot.calculation;
  const templateId = snapshot.template?.id ?? '';
  const title =
    templateId.includes('credit') || templateId.includes('adjustment')
      ? copy.creditAdjustment
      : templateId.includes('fixed') || templateId.includes('milestone')
        ? copy.fixedMilestoneInvoice
        : templateId.includes('expense')
          ? copy.expenseInvoice
          : templateId.includes('summary') || snapshot.commercial?.groupingMode === 'summary'
            ? copy.laborSummaryInvoice
            : copy.laborDetailedInvoice;
  return renderHtmlToPdf(
    layout(
      `${title} ${snapshot.number}`,
      `${String(legalEntity?.legal_name ?? legalEntity?.legalName ?? '')} → ${String(client?.legalName ?? '')}`,
      `<div class="grid"><div><h2>${copy.from}</h2><p>${htmlEscape(legalEntity?.legal_name ?? legalEntity?.legalName)}<br>${htmlEscape(legalEntity?.billingAddress ?? legalEntity?.billing_address)}</p></div><div><h2>${copy.billTo}</h2><p>${htmlEscape(client?.legalName)}<br>${htmlEscape(client?.billingEmail ?? client?.billing_email)}</p></div></div><h2>${copy.invoiceDetail}</h2><table><thead><tr><th>${copy.description}</th><th class="amount">${copy.amount}</th></tr></thead><tbody>${rows || `<tr><td colspan="2" class="muted">${copy.noInvoiceLines}</td></tr>`}</tbody></table><div class="total"><div><span>${copy.subtotal}</span><span>${moneyText(calculation?.currency, calculation?.subtotalMinor, locale)}</span></div><div><span>${copy.tax}</span><span>${moneyText(calculation?.currency, calculation?.taxMinor, locale)}</span></div><div><strong>${copy.total}</strong><strong>${moneyText(calculation?.currency, calculation?.totalMinor, locale)}</strong></div></div>`,
      locale,
    ),
  );
}
