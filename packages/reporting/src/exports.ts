import { deflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderInvoiceTemplate, type InvoiceTemplateSnapshot } from '@ja/invoice-templates';
import {
  formatReportDate,
  formatReportInteger,
  normalizeReportLocale as normalizeLocale,
  reportCopy as localizedCopy,
  reportLocaleTag,
  translateCalculationBasis,
  translateCalculationType,
  translateReportBoolean,
  translateReportMetric,
  translateReportStatus,
  type ReportLocale,
} from './report-i18n.ts';

export { REPORT_LOCALES } from './report-i18n.ts';
export type { ReportLocale } from './report-i18n.ts';

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
    const raw = cellText(value);
    // CSV is commonly opened directly in a spreadsheet. Preserve signed numeric
    // minor-unit strings, but neutralize values that could otherwise be treated
    // as formulas or DDE commands.
    const text = /^(?:[=+@]|-(?!\d)|[\t\r])/u.test(raw) ? `'${raw}` : raw;
    return /[\",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return (
    [
      headers.map(encode).join(','),
      ...rows.map((row) => headers.map((header) => encode(row[header])).join(',')),
    ].join('\r\n') + '\r\n'
  );
}

function excelColumnName(index: number): string {
  let current = index + 1;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
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
          const reference = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
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

export const REPORT_TEMPLATE_VERSION = '2026.08.23.1';

const normalizeReportLocale = (value: unknown): ReportLocale => normalizeLocale(value);

const localeTag = (locale: ReportLocale): string => reportLocaleTag(locale);

const htmlEscape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );

const companyLogoCandidates = [
  process.env.JA_REPORTING_LOGO_PATH,
  resolve(process.cwd(), 'reporting-assets/logo-jaautomation.png'),
  resolve(process.cwd(), 'packages/reporting/assets/logo-jaautomation.png'),
  resolve(process.cwd(), 'assets/logo-jaautomation.png'),
  fileURLToPath(new URL('../assets/logo-jaautomation.png', import.meta.url)),
  fileURLToPath(new URL('../../../Images/logo_jaautomation.png', import.meta.url)),
].filter((value): value is string => Boolean(value));

let companyLogoDataUri: string | undefined;
const companyLogo = (): string => {
  if (companyLogoDataUri) return companyLogoDataUri;
  const path = companyLogoCandidates.find((candidate) => existsSync(candidate));
  if (!path)
    throw new Error(
      'J&A Automation report logo is missing; set JA_REPORTING_LOGO_PATH or ship reporting-assets/logo-jaautomation.png',
    );
  companyLogoDataUri = `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  return companyLogoDataUri;
};

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

/**
 * Chromium writes the current clock into the PDF Info dictionary.  Report
 * artifacts are content-addressed downstream, so equivalent immutable
 * snapshots must produce byte-identical documents.  Keep the metadata fields
 * present for reader compatibility, but pin them to a stable value.  The
 * replacement has the same byte length, so xref offsets remain valid and no
 * second PDF writer (with its own nondeterminism) is needed.
 */
function stabilizePdfMetadata(bytes: Uint8Array): Uint8Array {
  const fixedDate = "D:20000101000000+00'00'";
  const source = Buffer.from(bytes).toString('latin1');
  const stabilized = source
    .replace(/\/CreationDate \(D:\d{14}[+-]\d{2}'\d{2}'\)/g, `/CreationDate (${fixedDate})`)
    .replace(/\/ModDate \(D:\d{14}[+-]\d{2}'\d{2}'\)/g, `/ModDate (${fixedDate})`);
  return new Uint8Array(Buffer.from(stabilized, 'latin1'));
}

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
  return stabilizePdfMetadata(new Uint8Array(Buffer.from(result.stdout.trim(), 'base64')));
}

const pageCss = `
@page { size: A4; margin: 14mm 14mm 18mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #17212b; font: 10pt Arial, sans-serif; line-height: 1.4; }
h1 { margin: 0 0 5mm; color: #0f2d3d; font-size: 24pt; letter-spacing: -.02em; }
h2 { margin: 7mm 0 2mm; color: #0f2d3d; font-size: 13pt; border-bottom: 1px solid #d9e1e7; padding-bottom: 1.5mm; break-after:avoid; page-break-after:avoid; }
.masthead { display:flex; align-items:flex-start; justify-content:space-between; gap:12mm; border-bottom: 4px solid #e23d2d; padding-bottom: 5mm; margin-bottom: 7mm; }
.brand-lockup { display:flex; align-items:flex-start; gap:5mm; min-width:0; }
.brand-logo { width:28mm; height:22mm; object-fit:contain; object-position:left center; flex:0 0 auto; }
.masthead-copy { min-width:0; }
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
.total { margin:6mm 0 0 auto; width:min(92mm, 100%); max-width:100%; border-top:3px solid #e23d2d; padding-top:3mm; }
.total div { display:grid; grid-template-columns:minmax(0,1fr) minmax(30mm,1fr); align-items:start; gap:4mm; padding:1mm 0; }
.total div > :last-child { min-width:0; max-width:100%; text-align:right; overflow-wrap:anywhere; word-break:break-all; }
.total strong { color:#0f2d3d; font-size:15pt; overflow-wrap:anywhere; word-break:break-all; }
.report-section { break-inside:auto; page-break-inside:auto; }
.page-break { break-before: page; }
`;

function layout(title: string, subtitle: string, body: string, locale: ReportLocale): string {
  const copy = localizedCopy[locale];
  return `<!doctype html><html lang="${localeTag(locale)}"><head><meta charset="utf-8"><meta name="template-version" content="${REPORT_TEMPLATE_VERSION}"><meta name="report-locale" content="${localeTag(locale)}"><style>${pageCss}</style></head><body><header class="masthead"><div class="brand-lockup"><img class="brand-logo" src="${companyLogo()}" alt="J&amp;A Automation logo"><div class="masthead-copy"><div class="eyebrow">J&amp;A Automation</div><h1>${htmlEscape(title)}</h1><div class="muted">${htmlEscape(subtitle)}</div></div></div><div class="muted">${htmlEscape(copy.template)} ${REPORT_TEMPLATE_VERSION}</div></header>${body}</body></html>`;
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
  // A four-digit probe is not grouped in es-ES, so it can incorrectly look
  // like the locale has no grouping separator. Use a value with two grouping
  // boundaries and an explicit decimal part instead.
  const decimalParts = new Intl.NumberFormat(formatterLocale, {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(1234567.89);
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

function metricValue(key: string, value: unknown, currency: unknown, locale: ReportLocale): string {
  const normalized = key.toLowerCase();
  if (normalized.includes('minor')) return moneyText(currency, value, locale);
  if (normalized.includes('minutes')) return htmlEscape(formatReportInteger(value, locale));
  if (normalized.includes('bps')) {
    const bps = Number(value ?? 0);
    if (Number.isFinite(bps))
      return htmlEscape(
        `${new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(bps / 100)}%`,
      );
  }
  return htmlEscape(value);
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

/**
 * Build the synchronous, current-snapshot workbook used by the project finance screen.
 * The database already returns money as exact minor-unit strings; this exporter deliberately
 * keeps those values as text so the workbook cannot introduce binary floating-point rounding.
 */
export function projectFinanceXlsx(
  snapshot: Readonly<{
    project: Readonly<Record<string, Cell>>;
    financial: Readonly<Record<string, unknown>>;
    timeEconomics: readonly Record<string, unknown>[];
    expenseEconomics: readonly Record<string, unknown>[];
  }>,
): Uint8Array {
  const summaryRows = Object.entries(snapshot.financial)
    .filter(([, value]) => !Array.isArray(value) && (typeof value !== 'object' || value === null))
    .map(([metric, value]) => ({ metric, value: exportCell(value) }));
  const alerts = snapshot.financial.alerts;
  if (Array.isArray(alerts))
    summaryRows.push({ metric: 'alerts', value: alerts.map(String).join('; ') });
  return xlsxFromSheets([
    { name: 'Project overview', rows: [snapshot.project] },
    { name: 'Finance metrics', rows: summaryRows },
    { name: 'Employee cost detail', rows: exportRows(snapshot.timeEconomics) },
    { name: 'Expense detail', rows: exportRows(snapshot.expenseEconomics) },
  ]);
}

export type WorkerStatementSnapshot = Readonly<{
  worker: Readonly<{ id: string; name: string }>;
  periodStart: string;
  periodEnd: string;
  currency: string;
  approvedMinutes: number;
  pendingMinutes: number;
  estimatedApprovedMinor: string;
  estimatedPendingMinor: string;
  approvedReimbursementMinor: string;
  pendingReimbursementMinor: string;
  missingCompensationRules: number;
  activities: readonly Readonly<{
    id: string;
    projectNumber: string;
    projectName: string;
    date: string;
    category: string;
    activitySummary: string;
    actualMinutes: number;
    approvalState: string;
  }>[];
  settlements: readonly Readonly<{
    id: string;
    projectNumber: string;
    projectName: string;
    periodStart: string;
    periodEnd: string;
    amountMinor: string;
    currency: string;
    state: string;
    expectedPaymentOn?: string | null;
    settledAt?: string | null;
  }>[];
  expenses: readonly Readonly<{
    id: string;
    projectNumber: string;
    spentOn: string;
    vendor: string;
    category: string;
    reimbursementAmountMinor: string;
    currency: string;
    approvalState: string;
    reimbursementState: string;
    expectedReimbursementOn?: string | null;
    reimbursedAt?: string | null;
  }>[];
}>;

const workerStatementColumns = [
  'recordType',
  'recordId',
  'workerId',
  'workerName',
  'periodStart',
  'periodEnd',
  'projectNumber',
  'projectName',
  'date',
  'vendor',
  'category',
  'activitySummary',
  'currency',
  'amountMinor',
  'actualMinutes',
  'approvedMinutes',
  'pendingMinutes',
  'approvalState',
  'paymentStatus',
  'expectedPaymentOn',
  'settledAt',
  'expectedReimbursementOn',
  'reimbursedAt',
] as const;

function workerStatementRows(snapshot: WorkerStatementSnapshot): readonly Row[] {
  return [
    {
      recordType: 'compensation_summary',
      recordId: `${snapshot.worker.id}:${snapshot.periodStart}:${snapshot.periodEnd}`,
      workerId: snapshot.worker.id,
      workerName: snapshot.worker.name,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      currency: snapshot.currency,
      amountMinor: snapshot.estimatedApprovedMinor,
      approvedMinutes: snapshot.approvedMinutes,
      pendingMinutes: snapshot.pendingMinutes,
      approvalState: snapshot.missingCompensationRules === 0 ? 'complete' : 'incomplete',
      paymentStatus: 'estimated_approved',
    },
    {
      recordType: 'pending_compensation',
      recordId: `${snapshot.worker.id}:${snapshot.periodStart}:${snapshot.periodEnd}:pending`,
      workerId: snapshot.worker.id,
      workerName: snapshot.worker.name,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      currency: snapshot.currency,
      amountMinor: snapshot.estimatedPendingMinor,
      approvedMinutes: snapshot.approvedMinutes,
      pendingMinutes: snapshot.pendingMinutes,
      approvalState: 'pending',
      paymentStatus: 'estimated_pending',
    },
    ...snapshot.activities.map((activity) => ({
      recordType: 'time_activity',
      recordId: activity.id,
      workerId: snapshot.worker.id,
      workerName: snapshot.worker.name,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      projectNumber: activity.projectNumber,
      projectName: activity.projectName,
      date: activity.date,
      category: activity.category,
      activitySummary: activity.activitySummary,
      actualMinutes: activity.actualMinutes,
      approvalState: activity.approvalState,
    })),
    ...snapshot.settlements.map((settlement) => ({
      recordType: 'compensation_settlement',
      recordId: settlement.id,
      workerId: snapshot.worker.id,
      workerName: snapshot.worker.name,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      projectNumber: settlement.projectNumber,
      projectName: settlement.projectName,
      currency: settlement.currency,
      amountMinor: settlement.amountMinor,
      paymentStatus: settlement.state,
      expectedPaymentOn: settlement.expectedPaymentOn ?? '',
      settledAt: settlement.settledAt ?? '',
    })),
    ...snapshot.expenses.map((expense) => ({
      recordType: 'reimbursable_expense',
      recordId: expense.id,
      workerId: snapshot.worker.id,
      workerName: snapshot.worker.name,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      projectNumber: expense.projectNumber,
      date: expense.spentOn,
      vendor: expense.vendor,
      category: expense.category,
      currency: expense.currency,
      amountMinor: expense.reimbursementAmountMinor,
      approvalState: expense.approvalState,
      paymentStatus: expense.reimbursementState,
      expectedReimbursementOn: expense.expectedReimbursementOn ?? '',
      reimbursedAt: expense.reimbursedAt ?? '',
    })),
  ];
}

export function workerStatementCsv(snapshot: WorkerStatementSnapshot): Uint8Array {
  return new TextEncoder().encode(toCsv(workerStatementRows(snapshot), workerStatementColumns));
}

export function workerStatementPdf(snapshot: WorkerStatementSnapshot): Uint8Array {
  const summary = [
    ['Approved compensation', snapshot.estimatedApprovedMinor],
    ['Pending compensation', snapshot.estimatedPendingMinor],
    ['Approved reimbursements', snapshot.approvedReimbursementMinor],
    ['Pending reimbursements', snapshot.pendingReimbursementMinor],
  ]
    .map(
      ([label, amount]) =>
        `<div class="metric"><span class="muted">${htmlEscape(label)}</span><strong>${moneyText(snapshot.currency, amount, 'en')}</strong></div>`,
    )
    .join('');
  const settlements = snapshot.settlements
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.projectNumber)} ${htmlEscape(row.projectName)}</td><td>${htmlEscape(row.periodStart)} → ${htmlEscape(row.periodEnd)}</td><td>${htmlEscape(row.state)}</td><td>${htmlEscape(row.expectedPaymentOn ?? '—')}</td><td>${htmlEscape(row.settledAt ?? '—')}</td><td class="amount">${moneyText(row.currency, row.amountMinor, 'en')}</td></tr>`,
    )
    .join('');
  const activities = snapshot.activities
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.date)}</td><td>${htmlEscape(row.projectNumber)} ${htmlEscape(row.projectName)}</td><td>${htmlEscape(row.category)}</td><td>${htmlEscape(row.activitySummary)}</td><td>${htmlEscape(row.actualMinutes)}</td><td>${htmlEscape(row.approvalState)}</td></tr>`,
    )
    .join('');
  const expenses = snapshot.expenses
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.spentOn)}</td><td>${htmlEscape(row.projectNumber)}</td><td>${htmlEscape(row.vendor)}</td><td>${htmlEscape(row.reimbursementState)}</td><td>${htmlEscape(row.expectedReimbursementOn ?? '—')}</td><td>${htmlEscape(row.reimbursedAt ?? '—')}</td><td class="amount">${moneyText(row.currency, row.reimbursementAmountMinor, 'en')}</td></tr>`,
    )
    .join('');
  return renderHtmlToPdf(
    layout(
      'Worker compensation statement',
      `${snapshot.worker.name} · ${snapshot.periodStart} → ${snapshot.periodEnd}`,
      `<section class="grid">${summary}</section><p class="muted">Approved minutes: ${htmlEscape(snapshot.approvedMinutes)} · Pending minutes: ${htmlEscape(snapshot.pendingMinutes)} · Missing compensation rules: ${htmlEscape(snapshot.missingCompensationRules)}</p><h2>Own activity</h2><table><thead><tr><th>Date</th><th>Project</th><th>Category</th><th>Activity</th><th>Actual minutes</th><th>Approval</th></tr></thead><tbody>${activities || '<tr><td colspan="6" class="muted">No activity in this period.</td></tr>'}</tbody></table><h2>Settlements</h2><table><thead><tr><th>Project</th><th>Period</th><th>Status</th><th>Expected payment</th><th>Settled</th><th class="amount">Amount</th></tr></thead><tbody>${settlements || '<tr><td colspan="6" class="muted">No settlements in this period.</td></tr>'}</tbody></table><h2>Own reimbursable expenses</h2><table><thead><tr><th>Date</th><th>Project</th><th>Vendor</th><th>Payment status</th><th>Expected reimbursement</th><th>Reimbursed</th><th class="amount">Amount</th></tr></thead><tbody>${expenses || '<tr><td colspan="7" class="muted">No reimbursable expenses in this period.</td></tr>'}</tbody></table>`,
      'en',
    ),
  );
}

export type InvoiceCollectionLedgerRow = Readonly<{
  invoiceId: string;
  invoiceNumber?: string | null;
  clientNumber: string;
  clientName: string;
  projectNumber: string;
  projectName: string;
  issueDate?: string | null;
  dueDate?: string | null;
  currency: string;
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
  grossPaymentsMinor: string;
  paymentReversalsMinor: string;
  netCollectedMinor: string;
  collectedMinor: string;
  outstandingMinor: string;
  directCostKnownMinor: string;
  directCostMinor?: string | null;
  directCostComplete: boolean;
  directCostMissingSourceIds: readonly string[];
  contributionMinor?: string | null;
  contributionMarginBps?: string | null;
  paymentStatus: string;
  billingStatus: string;
  payments: readonly Readonly<Record<string, unknown>>[];
  paymentReversals: readonly Readonly<Record<string, unknown>>[];
}>;

const invoiceCollectionRows = (rows: readonly InvoiceCollectionLedgerRow[]): readonly Row[] =>
  rows.map((row) => ({
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber ?? '',
    clientNumber: row.clientNumber,
    clientName: row.clientName,
    projectNumber: row.projectNumber,
    projectName: row.projectName,
    issueDate: row.issueDate ?? '',
    dueDate: row.dueDate ?? '',
    currency: row.currency,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    grossPaymentsMinor: row.grossPaymentsMinor,
    paymentReversalsMinor: row.paymentReversalsMinor,
    netCollectedMinor: row.netCollectedMinor,
    collectedMinor: row.collectedMinor,
    outstandingMinor: row.outstandingMinor,
    directCostKnownMinor: row.directCostKnownMinor,
    directCostMinor: row.directCostMinor ?? '',
    directCostComplete: row.directCostComplete,
    directCostMissingSourceIds: row.directCostMissingSourceIds.join(';'),
    contributionMinor: row.contributionMinor ?? '',
    contributionMarginBps: row.contributionMarginBps ?? '',
    paymentStatus: row.paymentStatus,
    billingStatus: row.billingStatus,
    payments: JSON.stringify(row.payments),
    paymentReversals: JSON.stringify(row.paymentReversals),
  }));

export function invoiceCollectionLedgerCsv(
  rows: readonly InvoiceCollectionLedgerRow[],
): Uint8Array {
  return new TextEncoder().encode(toCsv(invoiceCollectionRows(rows)));
}

export function invoiceCollectionLedgerXlsx(
  rows: readonly InvoiceCollectionLedgerRow[],
): Uint8Array {
  const payments = rows.flatMap((row) =>
    row.payments.map((payment) => ({ invoiceId: row.invoiceId, ...payment })),
  );
  const reversals = rows.flatMap((row) =>
    row.paymentReversals.map((reversal) => ({ invoiceId: row.invoiceId, ...reversal })),
  );
  return xlsxFromSheets([
    { name: 'Invoice collection ledger', rows: invoiceCollectionRows(rows) },
    { name: 'Payments', rows: exportRows(payments) },
    { name: 'Reversals', rows: exportRows(reversals) },
  ]);
}

export type AccountingPackExportType = 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json';

export type AccountingPackSourceSnapshot = Readonly<{
  periodStart: string;
  periodEnd: string;
  locale?: ReportLocale | string;
  currency?: string;
  invoiceRegister: readonly Record<string, unknown>[];
  collections: readonly Record<string, unknown>[];
  workerCosts: readonly Record<string, unknown>[];
  expenseRegister: readonly Record<string, unknown>[];
  totals: Record<string, unknown>;
  totalsByCurrency?: readonly Record<string, unknown>[];
}>;

export type AccountingPackArtifactBuilder = Readonly<{
  type: AccountingPackExportType;
  extension: string;
  build: () => Uint8Array;
}>;

export type AccountingPackArtifactBuildResult = Readonly<{
  type: AccountingPackExportType;
  extension: string;
  status: 'ready' | 'failed';
  bytes?: Uint8Array;
  error?: string;
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

function normalizeAccountingPackSnapshot(snapshot: AccountingPackSourceSnapshot) {
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
  return normalized;
}

/**
 * Return lazy format builders for one immutable Accounting Pack snapshot.  Keeping renderers
 * lazy is important: a missing Chromium executable must not prevent CSV, XLSX, or JSON builders
 * from being attempted and recorded independently.
 */
export function accountingPackArtifactBuilders(
  snapshot: AccountingPackSourceSnapshot,
): readonly AccountingPackArtifactBuilder[] {
  const normalized = normalizeAccountingPackSnapshot(snapshot);
  return [
    {
      type: 'pdf',
      extension: 'pdf',
      build: () => accountingPackPdf(normalized),
    },
    {
      type: 'xlsx',
      extension: 'xlsx',
      build: () => accountingPackXlsx(normalized),
    },
    {
      type: 'invoice_csv',
      extension: 'csv',
      build: () => accountingPackCsv(normalized),
    },
    {
      type: 'expense_csv',
      extension: 'csv',
      build: () => new TextEncoder().encode(toCsv(normalized.expenseRegister)),
    },
    {
      type: 'json',
      extension: 'json',
      build: () => new TextEncoder().encode(JSON.stringify(normalized)),
    },
  ];
}

/**
 * Attempt every Accounting Pack format and retain scoped failure evidence.  Callers that need
 * the historical all-or-nothing convenience API can use accountingPackArtifacts below; durable
 * jobs should use this result shape or the lazy builders directly.
 */
export function renderAccountingPackArtifacts(
  snapshot: AccountingPackSourceSnapshot,
): readonly AccountingPackArtifactBuildResult[] {
  return accountingPackArtifactBuilders(snapshot).map((builder) => {
    try {
      return {
        type: builder.type,
        extension: builder.extension,
        status: 'ready' as const,
        bytes: builder.build(),
      };
    } catch (error) {
      return {
        type: builder.type,
        extension: builder.extension,
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'artifact generation failed',
      };
    }
  });
}

/** One canonical artifact set for interactive and scheduled Accounting Pack generation. */
export function accountingPackArtifacts(snapshot: AccountingPackSourceSnapshot): readonly {
  type: AccountingPackExportType;
  extension: string;
  bytes: Uint8Array;
}[] {
  const results = renderAccountingPackArtifacts(snapshot);
  const failures = results
    .filter((result) => result.status === 'failed')
    .map((result) => `${result.type}: ${result.error ?? 'artifact generation failed'}`);
  if (failures.length > 0)
    throw new Error(`Accounting Pack artifact generation failed: ${failures.join('; ')}`);
  return results.map((result) => ({
    type: result.type,
    extension: result.extension,
    bytes: result.bytes as Uint8Array,
  }));
}

export function accountingPackPdf(
  snapshot: Readonly<{
    periodStart: string;
    periodEnd: string;
    locale?: ReportLocale | string;
    currency?: string;
    totals: Row | null;
    totalsByCurrency?: readonly Row[];
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const snapshotCurrency = snapshot.currency ?? snapshot.totals?.currency ?? 'USD';
  const totals = Object.entries(snapshot.totals ?? {})
    .map(
      ([key, value]) =>
        `<div class="metric"><span class="muted">${htmlEscape(translateReportMetric(key, locale))}</span><strong>${metricValue(key, value, snapshotCurrency, locale)}</strong></div>`,
    )
    .join('');
  const byCurrency = (snapshot.totalsByCurrency ?? [])
    .map(
      (row) =>
        `<tr>${Object.entries(row)
          .map(
            ([key, value]) =>
              `<td><span class="muted">${htmlEscape(translateReportMetric(key, locale))}</span>: ${metricValue(key, value, row.currency ?? snapshotCurrency, locale)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return renderHtmlToPdf(
    layout(
      copy.accountingPack,
      `${formatReportDate(snapshot.periodStart, locale)} → ${formatReportDate(snapshot.periodEnd, locale)}`,
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
    commercialSummary?: Readonly<Record<string, unknown>>;
    commercialCalculation?: readonly Readonly<Record<string, unknown>>[];
    financialSummary?: Readonly<Record<string, unknown>>;
    dailyReports?: readonly Row[];
    technicalReports?: readonly Row[];
    technicalChanges?: readonly Row[];
    timeSummary?: readonly Row[];
    sourceCounts?: Readonly<Record<string, unknown>>;
    backupArtifacts?: readonly Row[];
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const customer = snapshot.audience === 'customer';
  const summary = customer ? {} : (snapshot.commercialSummary ?? {});
  const finance = customer ? {} : (snapshot.financialSummary ?? {});
  const currency = summary.currency ?? finance.currency ?? 'USD';
  const hours = (minutes: unknown): string =>
    (Number(minutes ?? 0) / 60).toLocaleString(localeTag(locale), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const moneyMetric = (label: string, value: unknown): string =>
    `<div class="metric"><span class="muted">${htmlEscape(label)}</span><strong>${htmlEscape(moneyText(currency, value, locale))}</strong></div>`;
  const hoursMetric = (label: string, value: unknown): string =>
    `<div class="metric"><span class="muted">${htmlEscape(label)}</span><strong>${htmlEscape(`${hours(value)} h`)}</strong></div>`;
  const timeSummary = snapshot.timeSummary ?? [];
  const approvedTimeMinutes = timeSummary.reduce(
    (total, row) =>
      total +
      (row.approval_state === 'approved' ||
      row.approvalState === 'approved' ||
      row.approval_state === 'locked' ||
      row.approvalState === 'locked'
        ? Number(row.minutes ?? 0)
        : 0),
    0,
  );
  const publicMetrics = customer
    ? hoursMetric(copy.approvedHours, approvedTimeMinutes)
    : [
        hoursMetric(copy.actualHours, summary.actualMinutes),
        hoursMetric(copy.approvedHours, summary.approvedMinutes),
        hoursMetric(copy.billableHours, summary.billableMinutes),
        moneyMetric(copy.candidateSubtotal, summary.candidateSubtotalMinor),
        moneyMetric(copy.operationalCandidate, summary.operationalRevenueCandidateMinor),
        moneyMetric(copy.invoiced, summary.invoicedNetMinor),
        moneyMetric(copy.paid, summary.paidMinor),
        moneyMetric(copy.receivable, summary.receivableMinor),
      ].join('');
  const internalMetrics =
    !customer && snapshot.audience === 'internal'
      ? [
          moneyMetric(copy.directCost, finance.approvedCostMinor),
          moneyMetric(copy.contribution, finance.contributionMarginMinor),
          `<div class="metric"><span class="muted">${htmlEscape(copy.contributionMargin)}</span><strong>${htmlEscape(`${(Number(finance.contributionMarginBps ?? 0) / 100).toFixed(1)}%`)}</strong></div>`,
        ].join('')
      : '';
  const calculationRows = customer
    ? ''
    : (snapshot.commercialCalculation ?? [])
        .map(
          (line) =>
            `<tr><td>${htmlEscape(translateCalculationType(line.type, locale))}</td><td>${htmlEscape(translateCalculationBasis(line.basis, locale))}</td><td>${line.minutes === null || line.minutes === undefined ? '—' : htmlEscape(`${hours(line.minutes)} h`)}</td><td class="amount">${htmlEscape(moneyText(currency, line.amountMinor, locale))}</td></tr>`,
        )
        .join('');
  const sourceCounts = ((customer ? snapshot.sourceCounts : summary.sourceCounts) ??
    {}) as Readonly<Record<string, unknown>>;
  const sources = [
    `${localizedCopy[locale].sourceDaily} ${formatReportInteger(sourceCounts.dailyReports ?? 0, locale)}`,
    `${localizedCopy[locale].sourceTechnical} ${formatReportInteger(sourceCounts.technicalReports ?? 0, locale)}`,
    `${localizedCopy[locale].sourceChanges} ${formatReportInteger(sourceCounts.technicalChanges ?? 0, locale)}`,
    `${localizedCopy[locale].sourceTime} ${formatReportInteger(sourceCounts.timeEntries ?? 0, locale)}`,
    ...(customer
      ? []
      : [
          `${localizedCopy[locale].sourceExpenses} ${formatReportInteger(sourceCounts.expenses ?? 0, locale)}`,
        ]),
  ].join(' · ');
  const rows = [
    ...(snapshot.dailyReports ?? []).map((row) => ({
      type: copy.dailyReport,
      date: formatReportDate(row.work_date ?? row.workDate ?? row.date, locale),
      detail: row.summary,
      status: row.approval_state ?? row.approvalState,
    })),
    ...(snapshot.technicalReports ?? []).map((row) => ({
      type: copy.technicalReport,
      date: formatReportDate(
        row.report_date ?? row.reportDate ?? row.date ?? row.created_at ?? row.createdAt,
        locale,
      ),
      detail: row.change_summary ?? row.changeSummary,
      status: row.approval_state ?? row.approvalState,
    })),
    ...(snapshot.technicalChanges ?? []).map((row) => ({
      type: copy.technicalChange,
      date: formatReportDate(row.created_at ?? row.createdAt ?? row.date, locale),
      detail: row.change_made ?? row.changeMade,
      status: row.approval_state ?? row.approvalState,
    })),
    ...(customer
      ? timeSummary.map((row) => ({
          type: copy.sourceTime,
          date: formatReportDate(row.work_date ?? row.workDate ?? row.date, locale),
          detail: row.activity_summary ?? row.activitySummary ?? row.category,
          status: row.approval_state ?? row.approvalState,
        }))
      : []),
  ];
  const table = rows
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.type)}</td><td>${htmlEscape(row.date)}</td><td>${htmlEscape(row.detail)}</td><td>${htmlEscape(translateReportStatus(row.status, locale))}</td></tr>`,
    )
    .join('');
  return renderHtmlToPdf(
    layout(
      copy.projectPeriodReport,
      `${snapshot.project?.number ?? ''} ${snapshot.project?.name ?? ''} · ${formatReportDate(snapshot.periodStart, locale)} → ${formatReportDate(snapshot.periodEnd, locale)}`,
      customer
        ? `<h2>${copy.operationalRecord}</h2><div class="grid">${publicMetrics}</div><p class="muted">${htmlEscape(copy.sourceRecords)}: ${htmlEscape(sources)}</p><table><thead><tr><th>${copy.type}</th><th>${copy.date}</th><th>${copy.detail}</th><th>${localizedCopy[locale].status}</th></tr></thead><tbody>${table || `<tr><td colspan="4" class="muted">${copy.noReportRecords}</td></tr>`}</tbody></table>`
        : `<h2>${copy.calculation}</h2><div class="grid">${publicMetrics}${internalMetrics}</div><p class="muted">${htmlEscape(copy.sourceRecords)}: ${htmlEscape(sources)}</p><table><thead><tr><th>${copy.type}</th><th>${copy.calculationBasis}</th><th>${copy.billableHours}</th><th class="amount">${copy.amount}</th></tr></thead><tbody>${calculationRows || `<tr><td colspan="4" class="muted">${copy.noCalculation}</td></tr>`}</tbody></table><h2>${copy.operationalRecord}</h2><table><thead><tr><th>${copy.type}</th><th>${copy.date}</th><th>${copy.detail}</th><th>${localizedCopy[locale].status}</th></tr></thead><tbody>${table || `<tr><td colspan="4" class="muted">${copy.noReportRecords}</td></tr>`}</tbody></table>`,
      locale,
    ),
  );
}

export function invoicePdf(snapshot: InvoiceTemplateSnapshot): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const rendered = renderInvoiceTemplate(snapshot);
  const number = String(snapshot.number ?? snapshot.invoiceNumber ?? '');
  return renderHtmlToPdf(
    layout(`${rendered.title} ${htmlEscape(number)}`, rendered.subtitle, rendered.body, locale),
  );
}

type ReportProject = Readonly<{
  number?: unknown;
  projectNumber?: unknown;
  name?: unknown;
  clientName?: unknown;
}>;

type DailyReportSnapshot = Readonly<{
  id?: unknown;
  project?: ReportProject;
  projectNumber?: unknown;
  projectName?: unknown;
  date?: unknown;
  workDate?: unknown;
  work_date?: unknown;
  worker?: unknown;
  workerName?: unknown;
  worker_name?: unknown;
  summary?: unknown;
  safetyRelated?: unknown;
  safety_related?: unknown;
  approvalState?: unknown;
  approval_state?: unknown;
  [key: string]: unknown;
}>;

type TechnicalReportSnapshot = Readonly<{
  id?: unknown;
  project?: ReportProject;
  projectNumber?: unknown;
  projectName?: unknown;
  date?: unknown;
  reportDate?: unknown;
  report_date?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  system?: unknown;
  systemName?: unknown;
  system_name?: unknown;
  site?: unknown;
  plantSite?: unknown;
  plant_site?: unknown;
  area?: unknown;
  areaLine?: unknown;
  area_line?: unknown;
  station?: unknown;
  stationMachine?: unknown;
  station_machine?: unknown;
  systemType?: unknown;
  system_type?: unknown;
  plcPlatform?: unknown;
  plc_platform?: unknown;
  controller?: unknown;
  hmiScada?: unknown;
  hmi_scada?: unknown;
  networkProtocol?: unknown;
  network_protocol?: unknown;
  softwareVersion?: unknown;
  software_version?: unknown;
  programReference?: unknown;
  program_reference?: unknown;
  changes?: unknown;
  changeSummary?: unknown;
  change_summary?: unknown;
  safetyRelated?: unknown;
  safety_related?: unknown;
  productionImpact?: unknown;
  production_impact?: unknown;
  validation?: unknown;
  validationResult?: unknown;
  validation_result?: unknown;
  openRisk?: unknown;
  open_risk?: unknown;
  rollbackPlan?: unknown;
  rollback_plan?: unknown;
  rollbackInformation?: unknown;
  rollback_information?: unknown;
  approvalState?: unknown;
  approval_state?: unknown;
  technicalChanges?: readonly Readonly<Record<string, unknown>>[];
  [key: string]: unknown;
}>;

function reportProjectTitle(
  project: ReportProject | undefined,
  fallbackNumber: unknown,
  fallbackName: unknown,
): string {
  const number = project?.number ?? project?.projectNumber ?? fallbackNumber ?? '';
  const name = project?.name ?? fallbackName ?? '';
  return [number, name]
    .filter((value) => String(value).length > 0)
    .map(String)
    .join(' · ');
}

function reportField(label: string, value: unknown): string {
  return `<div class="metric"><span class="muted">${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`;
}

/** Render one immutable Daily Field Report source record in the requested locale. */
export function dailyReportPdf(snapshot: DailyReportSnapshot): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const projectTitle = reportProjectTitle(
    snapshot.project,
    snapshot.projectNumber,
    snapshot.projectName,
  );
  const date = snapshot.date ?? snapshot.workDate ?? snapshot.work_date;
  const status = snapshot.approvalState ?? snapshot.approval_state;
  const safety = snapshot.safetyRelated ?? snapshot.safety_related;
  const worker = snapshot.worker ?? snapshot.workerName ?? snapshot.worker_name;
  const fields = [
    reportField(copy.project, projectTitle),
    reportField(copy.date, formatReportDate(date, locale)),
    ...(worker === undefined || worker === null || worker === ''
      ? []
      : [reportField(copy.worker, worker)]),
    reportField(copy.status, translateReportStatus(status, locale)),
    reportField(copy.safetyRelated, translateReportBoolean(safety, locale)),
  ].join('');
  return renderHtmlToPdf(
    layout(
      copy.dailyReport,
      `${projectTitle}${projectTitle && date ? ' · ' : ''}${formatReportDate(date, locale)}`,
      `<h2>${copy.operationalRecord}</h2><div class="grid">${fields}</div><h2>${copy.summary}</h2><p>${htmlEscape(snapshot.summary)}</p>`,
      locale,
    ),
  );
}

/** Render one immutable PLC / Technical Report source record in the requested locale. */
export function technicalReportPdf(snapshot: TechnicalReportSnapshot): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const projectTitle = reportProjectTitle(
    snapshot.project,
    snapshot.projectNumber,
    snapshot.projectName,
  );
  const date =
    snapshot.reportDate ??
    snapshot.report_date ??
    snapshot.date ??
    snapshot.createdAt ??
    snapshot.created_at;
  const status = snapshot.approvalState ?? snapshot.approval_state;
  const safety = snapshot.safetyRelated ?? snapshot.safety_related;
  const fields = [
    reportField(copy.project, projectTitle),
    reportField(copy.date, formatReportDate(date, locale)),
    reportField(copy.system, snapshot.system ?? snapshot.systemName ?? snapshot.system_name),
    reportField(copy.site, snapshot.site ?? snapshot.plantSite ?? snapshot.plant_site),
    reportField(copy.area, snapshot.area ?? snapshot.areaLine ?? snapshot.area_line),
    reportField(
      copy.station,
      snapshot.station ?? snapshot.stationMachine ?? snapshot.station_machine,
    ),
    reportField(copy.status, translateReportStatus(status, locale)),
    reportField(copy.safetyRelated, translateReportBoolean(safety, locale)),
  ].join('');
  const technicalDetails = [
    [copy.systemType, snapshot.systemType ?? snapshot.system_type],
    [copy.plcPlatform, snapshot.plcPlatform ?? snapshot.plc_platform],
    [copy.controller, snapshot.controller],
    [copy.hmiScada, snapshot.hmiScada ?? snapshot.hmi_scada],
    [copy.networkProtocol, snapshot.networkProtocol ?? snapshot.network_protocol],
    [copy.softwareVersion, snapshot.softwareVersion ?? snapshot.software_version],
    [copy.programReference, snapshot.programReference ?? snapshot.program_reference],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => reportField(String(label), value))
    .join('');
  const changes = snapshot.technicalChanges ?? [];
  const changeRows = changes
    .map((change) => {
      const dateValue = change.created_at ?? change.createdAt ?? change.date;
      const detail = change.change_made ?? change.changeMade ?? change.detail;
      const changeStatus = change.approval_state ?? change.approvalState;
      return `<tr><td>${htmlEscape(formatReportDate(dateValue, locale))}</td><td>${htmlEscape(change.component)}</td><td>${htmlEscape(detail)}</td><td>${htmlEscape(translateReportStatus(changeStatus, locale))}</td></tr>`;
    })
    .join('');
  const changesSection =
    changes.length > 0
      ? `<h2>${copy.technicalChanges}</h2><table><thead><tr><th>${copy.date}</th><th>${copy.detail}</th><th>${copy.changeSummary}</th><th>${copy.status}</th></tr></thead><tbody>${changeRows}</tbody></table>`
      : '';
  return renderHtmlToPdf(
    layout(
      copy.technicalReport,
      `${projectTitle}${projectTitle && date ? ' · ' : ''}${formatReportDate(date, locale)}`,
      `<section class="report-section"><h2>${copy.operationalRecord}</h2><div class="grid">${fields}</div></section>${technicalDetails ? `<section class="report-section"><h2>${copy.technicalRecords}</h2><div class="grid">${technicalDetails}</div></section>` : ''}<section class="report-section"><h2>${copy.changeSummary}</h2><p>${htmlEscape(snapshot.changeSummary ?? snapshot.change_summary ?? snapshot.changes)}</p><div class="grid">${reportField(copy.productionImpact, snapshot.productionImpact ?? snapshot.production_impact)}${reportField(copy.validation, snapshot.validation)}${reportField(copy.validationResult, snapshot.validationResult ?? snapshot.validation_result)}${reportField(copy.openRisk, snapshot.openRisk ?? snapshot.open_risk)}${reportField(copy.rollbackPlan, snapshot.rollbackPlan ?? snapshot.rollbackInformation ?? snapshot.rollback_information)}</div></section>${changesSection}`,
      locale,
    ),
  );
}
