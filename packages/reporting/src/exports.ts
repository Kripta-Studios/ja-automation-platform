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

export const REPORT_TEMPLATE_VERSION = '2026.09.02.2';

const normalizeReportLocale = (value: unknown): ReportLocale => normalizeLocale(value);

const localeTag = (locale: ReportLocale): string => reportLocaleTag(locale);

const htmlEscape = (value: unknown): string => {
  if (value !== null && typeof value === 'object') return '';
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
};

function snapshotText(source: unknown, ...keys: string[]): string {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return '';
  const row = source as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function projectIdentity(snapshot: unknown): {
  number: string;
  name: string;
  clientName: string;
  title: string;
} {
  const row = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : {};
  const nested =
    row.project && typeof row.project === 'object' && !Array.isArray(row.project)
      ? (row.project as Record<string, unknown>)
      : {};
  const number =
    snapshotText(nested, 'number', 'projectNumber', 'project_number') ||
    snapshotText(row, 'projectNumber', 'project_number');
  const name =
    snapshotText(nested, 'name', 'projectName', 'project_name') ||
    snapshotText(row, 'projectName', 'project_name');
  const clientName =
    snapshotText(nested, 'clientName', 'client_name', 'clientNumber', 'client_number') ||
    snapshotText(row, 'clientName', 'client_name', 'client_number', 'clientNumber');
  return {
    number,
    name,
    clientName,
    title: [number, name].filter(Boolean).join(' · '),
  };
}

function reportNarrative(snapshot: unknown, ...keys: string[]): string {
  return snapshotText(snapshot, ...keys);
}

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
table { width:100%; max-width:100%; border-collapse:collapse; margin-top:3mm; break-inside:auto; }
thead, tfoot { display:table-header-group; }
tr { break-inside:avoid; }
th { background:#0f2d3d; color:#fff; text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:.06em; padding:2.4mm; overflow-wrap:anywhere; word-break:break-word; }
td { border-bottom:1px solid #d9e1e7; padding:2.4mm; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; }
td.amount, th.amount { text-align:right; white-space:nowrap; }
tfoot td { font-weight:700; background:#f1f5f7; border-top:2px solid #0f2d3d; }
.metric-stack { margin-top:3mm; }
.metric-stack + .metric-stack { margin-top:5mm; }
.metric-stack h3 { margin:0 0 1mm; color:#0f2d3d; font-size:10pt; }
.metric-stack table { table-layout:fixed; }
.total { margin:6mm 0 0 auto; width:min(92mm, 100%); max-width:100%; border-top:3px solid #e23d2d; padding-top:3mm; }
.total div { display:grid; grid-template-columns:minmax(0,1fr) minmax(30mm,1fr); align-items:start; gap:4mm; padding:1mm 0; }
.total div > :last-child { min-width:0; max-width:100%; text-align:right; overflow-wrap:anywhere; word-break:break-all; }
.total strong { color:#0f2d3d; font-size:15pt; overflow-wrap:anywhere; word-break:break-all; }
.report-section { break-inside:auto; page-break-inside:auto; }
.page-break { break-before: page; }
.signature-block { margin-top:10mm; display:flex; justify-content:space-between; align-items:flex-end; gap:12mm; break-inside:avoid; page-break-inside:avoid; padding-top:5mm; border-top:1px dashed #cbd5e1; }
.signature-block > div { display:flex; flex-direction:column; gap:1.5mm; }
.signature-block span { font-weight:700; font-size:8.5pt; color:#0f2d3d; }
.signature-line { font-family:monospace; font-size:9pt; color:#64748b; letter-spacing:0.05em; }
.signature-block small { font-size:7.5pt; color:#64748b; }
`;

function layout(title: string, subtitle: string, body: string, locale: ReportLocale): string {
  const copy = localizedCopy[locale];
  return `<!doctype html><html lang="${localeTag(locale)}"><head><meta charset="utf-8"><meta name="template-version" content="${REPORT_TEMPLATE_VERSION}"><meta name="report-locale" content="${localeTag(locale)}"><style>${pageCss}</style></head><body><header class="masthead"><div class="brand-lockup"><img class="brand-logo" src="${companyLogo()}" alt="J&amp;A Automation logo"><div class="masthead-copy"><div class="eyebrow">J&amp;A Automation</div><h1>${htmlEscape(title)}</h1><div class="muted">${htmlEscape(subtitle)}</div></div></div><div class="muted">${htmlEscape(copy.template)} ${REPORT_TEMPLATE_VERSION}</div></header>${body}</body></html>`;
}

/**
 * Invoice-only presentation. Shared report `pageCss` styles `.grid` / `.total` but not
 * `.invoice-parties`, `.invoice-meta`, or `.invoice-total`, so wrapping invoice HTML in
 * `layout()` collapsed parties, metadata and totals into unstructured text.
 */
const invoiceCss = `
.invoice-masthead { display:flex; align-items:flex-start; justify-content:space-between; gap:10mm; border-bottom:3px solid #0f2d3d; padding-bottom:5mm; margin-bottom:5mm; }
.invoice-identity { text-align:right; min-width:0; }
.invoice-identity h1 { margin:1mm 0 0; font-size:18pt; letter-spacing:-.02em; }
.invoice-document { min-width:0; }
.invoice-parties { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8mm; padding:5mm 0 4mm; }
.invoice-party { display:grid; gap:1.2mm; min-width:0; }
.invoice-party-label { color:#64748b; font-size:8pt; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
.invoice-party div { margin:0; line-height:1.45; }
.invoice-meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5mm; padding:4mm 0; margin:0; border-block:1px solid #d9e1e7; }
.invoice-field { display:grid; gap:1mm; min-width:0; }
.invoice-field .label { color:#64748b; font-size:8pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
.invoice-field .value { margin:0; font-weight:700; overflow-wrap:anywhere; }
.invoice-document > h2 { margin:6mm 0 2mm; font-size:11pt; }
.invoice-description-block { margin:0 0 3mm; }
.invoice-lines { width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; margin-top:4mm; }
.invoice-lines th { background:#dbebf7; color:#0d3b66; font-size:8.5pt; font-weight:700; letter-spacing:.03em; border-top:1px solid #b8d5ec; border-bottom:1px solid #b8d5ec; padding:2.2mm 2.8mm; overflow-wrap:anywhere; word-break:break-word; white-space:normal; }
.invoice-lines td { padding:2.2mm 2.8mm; border-bottom:1px solid #e2e8f0; font-size:8.5pt; overflow-wrap:anywhere; word-break:break-word; white-space:normal; }
.invoice-lines th.amount, .invoice-lines td.amount { text-align:right; white-space:nowrap; }
.qty-total-cell, .total-amount-cell { border:1.5px solid #0d3b66 !important; background:#ffffff; font-weight:700; text-align:right; }
.invoice-bottom-grid { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:10mm; margin-top:6mm; align-items:start; }
.invoice-terms-card { font-size:8pt; color:#1e293b; line-height:1.45; }
.terms-heading { font-size:9.5pt; font-weight:700; color:#0f2d3d; text-decoration:underline; margin-bottom:2mm; }
.terms-field { margin:0.8mm 0; }
.terms-notice { margin-top:2.5mm; font-style:italic; color:#64748b; font-size:7.5pt; }
.invoice-total { margin:0; width:100%; border-top:2px solid #cbd5e1; padding-top:2mm; }
.invoice-total .total-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(28mm,1fr); align-items:start; gap:4mm; padding:1.2mm 0; }
.invoice-total .total-row span:last-child, .invoice-total .total-row strong:last-child { text-align:right; overflow-wrap:anywhere; }
.invoice-total .grand-total strong { color:#0f2d3d; font-size:12pt; }
.company-contact-masthead { margin-top:1.5mm; font-size:7.5pt; color:#475569; line-height:1.35; }
`;

function invoiceLayout(
  title: string,
  subtitle: string,
  number: string,
  body: string,
  locale: ReportLocale,
): string {
  const copy = localizedCopy[locale];
  return `<!doctype html><html lang="${localeTag(locale)}"><head><meta charset="utf-8"><meta name="template-version" content="${REPORT_TEMPLATE_VERSION}"><meta name="invoice-layout" content="structured-v1"><meta name="report-locale" content="${localeTag(locale)}"><style>${pageCss}${invoiceCss}</style></head><body><header class="invoice-masthead"><div class="brand-lockup"><img class="brand-logo" src="${companyLogo()}" alt="J&amp;A Automation logo"><div class="masthead-copy"><div class="eyebrow">J&amp;A Automation LLC</div><div class="company-contact-masthead"><div>USA division · Phone: +1 (864) 208 4684</div><div>112 Birkshire Dr, Georgetown TX 78626</div><div>field.operations@j-aautomation.com · www.j-aautomation.com</div></div><div class="muted" style="margin-top:1mm;font-size:7pt">${htmlEscape(copy.template)} ${REPORT_TEMPLATE_VERSION}</div></div></div><div class="invoice-identity"><div class="eyebrow">${htmlEscape(title)}</div><h1>${htmlEscape(number)}</h1><div class="muted">${htmlEscape(subtitle)}</div></div></header><article class="invoice-document">${body}</article></body></html>`;
}

function exactMoneyText(currency: unknown, minor: unknown, locale: ReportLocale = 'en'): string {
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
  return `${negative ? '-' : ''}${prefix}${integer}${fraction}${suffix}`;
}

function moneyText(currency: unknown, minor: unknown, locale: ReportLocale = 'en'): string {
  return htmlEscape(exactMoneyText(currency, minor, locale));
}

function metricDisplay(
  key: string,
  value: unknown,
  currency: unknown,
  locale: ReportLocale,
): string {
  const normalized = key.toLowerCase();
  if (normalized.includes('minor')) return exactMoneyText(currency, value, locale);
  if (normalized.includes('minutes')) return formatReportInteger(value, locale);
  if (normalized.includes('bps')) {
    const bps = Number(value ?? 0);
    if (Number.isFinite(bps))
      return `${new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(bps / 100)}%`;
  }
  return value === null || value === undefined ? '' : String(value);
}

function metricValue(key: string, value: unknown, currency: unknown, locale: ReportLocale): string {
  return htmlEscape(metricDisplay(key, value, currency, locale));
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
 * Money stays exact: display uses bigint minor units, and a parallel column keeps the
 * canonical minor-unit string so the workbook cannot introduce binary floating-point rounding.
 */
export function projectFinanceXlsx(
  snapshot: Readonly<{
    project: Readonly<Record<string, Cell>>;
    financial: Readonly<Record<string, unknown>>;
    timeEconomics: readonly Record<string, unknown>[];
    expenseEconomics: readonly Record<string, unknown>[];
    invoices?: readonly Record<string, unknown>[];
    milestones?: readonly Record<string, unknown>[];
    locale?: ReportLocale | string;
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const finance = snapshot.financial;
  const currency = String(finance.currency ?? snapshot.project.currency ?? '');
  const labels = projectFinanceCopy(locale);
  return xlsxFromSheets([
    {
      name: labels.summarySheet,
      rows: projectFinanceSummaryRows(snapshot.project, finance, currency, locale, labels),
      columns: ['section', 'metric', 'value', 'exactMinorUnits'],
    },
    {
      name: labels.laborSheet,
      rows: projectFinanceLaborRows(snapshot.timeEconomics, currency, locale),
      columns: [
        'worker',
        'date',
        'category',
        'actualHours',
        'actualMinutes',
        'billableHours',
        'billableMinutes',
        'clientRevenue',
        'internalCost',
        'workerCompensation',
        'billability',
        'approval',
        'billingStatus',
        'invoiceId',
        'clientRevenueExactMinor',
        'internalCostExactMinor',
        'workerCompensationExactMinor',
      ],
    },
    {
      name: labels.expenseSheet,
      rows: projectFinanceExpenseRows(snapshot.expenseEconomics, currency, locale),
      columns: [
        'worker',
        'date',
        'category',
        'paidBy',
        'treatment',
        'cost',
        'actualCost',
        'revenue',
        'pendingFinanceRevenue',
        'approval',
        'financeApproval',
        'projection',
        'costExactMinor',
        'revenueExactMinor',
      ],
    },
    {
      name: labels.unbilledSheet,
      rows: projectFinanceUnbilledRows(finance.approvedUnbilledSources, currency, locale),
      columns: ['sourceType', 'sourceId', 'date', 'workerId', 'amount', 'amountExactMinor'],
    },
    {
      name: labels.minimumSheet,
      rows: projectFinanceMinimumRows(finance.dailyMinimumAdjustments, currency, locale),
      columns: [
        'workerId',
        'date',
        'adjustmentHours',
        'adjustmentMinutes',
        'revenue',
        'revenueExactMinor',
      ],
    },
    {
      name: labels.invoiceSheet,
      rows: projectFinanceInvoiceRows(snapshot.invoices ?? [], locale),
      columns: [
        'invoiceNumber',
        'stream',
        'state',
        'periodStart',
        'periodEnd',
        'currency',
        'total',
        'collected',
        'issuedAt',
        'dueAt',
        'totalExactMinor',
        'collectedExactMinor',
      ],
    },
    {
      name: labels.milestoneSheet,
      rows: projectFinanceMilestoneRows(snapshot.milestones ?? [], currency, locale),
      columns: ['name', 'dueOn', 'state', 'amount', 'amountExactMinor'],
    },
    {
      name: labels.alertSheet,
      rows: projectFinanceAlertRows(finance),
      columns: ['code', 'sourceId'],
    },
  ]);
}

type ProjectFinanceCopy = Readonly<{
  summarySheet: string;
  laborSheet: string;
  expenseSheet: string;
  unbilledSheet: string;
  minimumSheet: string;
  invoiceSheet: string;
  milestoneSheet: string;
  alertSheet: string;
  project: string;
  economics: string;
  collections: string;
  forecast: string;
}>;

function projectFinanceCopy(locale: ReportLocale): ProjectFinanceCopy {
  if (locale === 'es')
    return {
      summarySheet: 'Resumen',
      laborSheet: 'Mano de obra',
      expenseSheet: 'Gastos',
      unbilledSheet: 'WIP no facturado',
      minimumSheet: 'Minimo diario',
      invoiceSheet: 'Facturas',
      milestoneSheet: 'Hitos',
      alertSheet: 'Alertas',
      project: 'Proyecto',
      economics: 'Economia del proyecto',
      collections: 'Facturacion y cobro',
      forecast: 'Prevision',
    };
  if (locale === 'pt')
    return {
      summarySheet: 'Resumo',
      laborSheet: 'Mao de obra',
      expenseSheet: 'Despesas',
      unbilledSheet: 'WIP nao faturado',
      minimumSheet: 'Minimo diario',
      invoiceSheet: 'Faturas',
      milestoneSheet: 'Marcos',
      alertSheet: 'Alertas',
      project: 'Projeto',
      economics: 'Economia do projeto',
      collections: 'Faturamento e cobranca',
      forecast: 'Previsao',
    };
  return {
    summarySheet: 'Summary',
    laborSheet: 'Labor',
    expenseSheet: 'Expenses',
    unbilledSheet: 'Unbilled WIP',
    minimumSheet: 'Daily minimum',
    invoiceSheet: 'Invoices',
    milestoneSheet: 'Milestones',
    alertSheet: 'Alerts',
    project: 'Project',
    economics: 'Project economics',
    collections: 'Billing and collections',
    forecast: 'Forecast',
  };
}

function minutesAsHours(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isInteger(minutes)) return '';
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  const hours = Math.trunc(absolute / 60);
  const remainder = absolute % 60;
  const hundredths = Math.round((remainder * 100) / 60);
  if (hundredths === 100) return `${sign}${hours + 1}.00`;
  return `${sign}${hours}.${String(hundredths).padStart(2, '0')}`;
}

function formatBpsExact(value: unknown): string {
  try {
    const amount = BigInt(String(value ?? ''));
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const whole = absolute / 100n;
    const fraction = absolute % 100n;
    return `${negative ? '-' : ''}${whole.toString()}.${fraction.toString().padStart(2, '0')}%`;
  } catch {
    return '';
  }
}

function summaryRow(section: string, metric: string, value: Cell, exactMinor: Cell = ''): Row {
  return { section, metric, value, exactMinorUnits: exactMinor };
}

function projectFinanceSummaryRows(
  project: Readonly<Record<string, Cell>>,
  finance: Readonly<Record<string, unknown>>,
  currency: string,
  locale: ReportLocale,
  labels: ProjectFinanceCopy,
): readonly Row[] {
  const money = (key: string): { display: string; exact: string } => {
    const exact = finance[key] == null ? '' : String(finance[key]);
    return { display: exact === '' ? '' : exactMoneyText(currency, exact, locale), exact };
  };
  const hours = (key: string): string => minutesAsHours(finance[key]);
  const text = (key: string): string => (finance[key] == null ? '' : String(finance[key]));
  const laborRevenue = money('laborRevenueMinor');
  const expenseRevenue = money('expenseRevenueMinor');
  const milestoneRevenue = money('milestoneRevenueMinor');
  const revenue = money('revenueCandidateMinor');
  const laborCost = money('directLaborCostMinor');
  const travelCost = money('travelCostMinor');
  const otherCost = money('otherDirectCostMinor');
  const directCost = money('approvedCostMinor');
  const compensation = money('workerCompensationMinor');
  const contribution = money('contributionMarginMinor');
  const invoiced = money('invoicedMinor');
  const invoicedGross = money('invoicedGrossMinor');
  const collected = money('paidMinor');
  const receivable = money('receivableMinor');
  const unbilled = money('approvedUnbilledWipMinor');
  const unapproved = money('unapprovedWipMinor');
  const budget = money('budgetMinor');
  const remaining = money('remainingCapMinor');
  const travelBudget = money('travelBudgetMinor');
  const etc = money('estimateToCompleteMinor');
  const eacCost = money('estimateAtCompletionCostMinor');
  const eacRevenue = money('estimateAtCompletionRevenueMinor');
  const finalMargin = money('expectedFinalMarginMinor');
  return [
    summaryRow(labels.project, 'Project number', project.project_number ?? ''),
    summaryRow(labels.project, 'Project name', project.project_name ?? ''),
    summaryRow(labels.project, 'Client number', project.client_number ?? ''),
    summaryRow(labels.project, 'Client name', project.client_name ?? ''),
    summaryRow(labels.project, 'Currency', currency),
    summaryRow(labels.project, 'Period start', project.period_start ?? ''),
    summaryRow(labels.project, 'Period end', project.period_end ?? ''),
    summaryRow(labels.project, 'Billing model', text('billingModel')),
    summaryRow(labels.project, 'Projection state', text('state')),
    summaryRow(labels.economics, 'Labor revenue', laborRevenue.display, laborRevenue.exact),
    summaryRow(labels.economics, 'Expense revenue', expenseRevenue.display, expenseRevenue.exact),
    summaryRow(
      labels.economics,
      'Milestone revenue',
      milestoneRevenue.display,
      milestoneRevenue.exact,
    ),
    summaryRow(labels.economics, 'Revenue', revenue.display, revenue.exact),
    summaryRow(labels.economics, 'Internal labor cost', laborCost.display, laborCost.exact),
    summaryRow(labels.economics, 'Travel cost', travelCost.display, travelCost.exact),
    summaryRow(labels.economics, 'Other direct cost', otherCost.display, otherCost.exact),
    summaryRow(labels.economics, 'Direct cost', directCost.display, directCost.exact),
    summaryRow(labels.economics, 'Worker compensation', compensation.display, compensation.exact),
    summaryRow(labels.economics, 'Contribution', contribution.display, contribution.exact),
    summaryRow(
      labels.economics,
      'Contribution margin',
      formatBpsExact(finance.contributionMarginBps),
    ),
    summaryRow(labels.economics, 'Actual hours', hours('actualMinutes')),
    summaryRow(labels.economics, 'Approved hours', hours('approvedMinutes')),
    summaryRow(labels.economics, 'Billable hours', hours('billableMinutes')),
    summaryRow(labels.collections, 'Invoiced net', invoiced.display, invoiced.exact),
    summaryRow(labels.collections, 'Invoiced gross', invoicedGross.display, invoicedGross.exact),
    summaryRow(labels.collections, 'Collected', collected.display, collected.exact),
    summaryRow(labels.collections, 'Receivable', receivable.display, receivable.exact),
    summaryRow(labels.collections, 'Approved unbilled WIP', unbilled.display, unbilled.exact),
    summaryRow(labels.collections, 'Unapproved WIP', unapproved.display, unapproved.exact),
    summaryRow(labels.forecast, 'Budget', budget.display, budget.exact),
    summaryRow(labels.forecast, 'Remaining cap', remaining.display, remaining.exact),
    summaryRow(labels.forecast, 'Budget consumed', formatBpsExact(finance.budgetConsumedBps)),
    summaryRow(labels.forecast, 'Travel budget', travelBudget.display, travelBudget.exact),
    summaryRow(labels.forecast, 'Estimate to complete', etc.display, etc.exact),
    summaryRow(labels.forecast, 'Estimate at completion cost', eacCost.display, eacCost.exact),
    summaryRow(
      labels.forecast,
      'Estimate at completion revenue',
      eacRevenue.display,
      eacRevenue.exact,
    ),
    summaryRow(labels.forecast, 'Expected final margin', finalMargin.display, finalMargin.exact),
    summaryRow(labels.forecast, 'Forecast basis', text('forecastBasis')),
  ];
}

function projectFinanceLaborRows(
  rows: readonly Record<string, unknown>[],
  currency: string,
  locale: ReportLocale,
): readonly Row[] {
  return rows.map((row) => ({
    worker: String(row.workerName ?? row.worker_name ?? ''),
    date: String(row.workDate ?? row.work_date ?? ''),
    category: String(row.category ?? ''),
    actualHours: minutesAsHours(row.actualMinutes ?? row.actual_minutes ?? row.minutes),
    actualMinutes:
      row.actualMinutes == null && row.actual_minutes == null && row.minutes == null
        ? ''
        : String(row.actualMinutes ?? row.actual_minutes ?? row.minutes),
    billableHours: minutesAsHours(row.clientBillableMinutes ?? row.client_billable_minutes),
    billableMinutes:
      row.clientBillableMinutes == null && row.client_billable_minutes == null
        ? ''
        : String(row.clientBillableMinutes ?? row.client_billable_minutes),
    clientRevenue: exactMoneyText(
      currency,
      row.clientRevenueMinor ?? row.client_revenue_minor,
      locale,
    ),
    internalCost: exactMoneyText(
      currency,
      row.internalCostMinor ?? row.internal_cost_minor,
      locale,
    ),
    workerCompensation: exactMoneyText(
      currency,
      row.workerCompensationMinor ?? row.worker_compensation_minor,
      locale,
    ),
    billability: String(row.billabilityState ?? row.billability_state ?? ''),
    approval: translateReportStatus(row.approvalState ?? row.approval_state, locale),
    billingStatus: String(row.billingStatus ?? row.billing_status ?? ''),
    invoiceId: String(row.invoiceId ?? row.invoice_id ?? ''),
    clientRevenueExactMinor: String(row.clientRevenueMinor ?? row.client_revenue_minor ?? ''),
    internalCostExactMinor: String(row.internalCostMinor ?? row.internal_cost_minor ?? ''),
    workerCompensationExactMinor: String(
      row.workerCompensationMinor ?? row.worker_compensation_minor ?? '',
    ),
  }));
}

function projectFinanceExpenseRows(
  rows: readonly Record<string, unknown>[],
  currency: string,
  locale: ReportLocale,
): readonly Row[] {
  return rows.map((row) => ({
    worker: String(row.workerName ?? row.worker_name ?? ''),
    date: String(row.spentOn ?? row.spent_on ?? ''),
    category: String(row.category ?? ''),
    paidBy: String(row.paidBy ?? ''),
    treatment: String(row.treatment ?? ''),
    cost: exactMoneyText(currency, row.costMinor, locale),
    actualCost: exactMoneyText(currency, row.actualCostMinor, locale),
    revenue: exactMoneyText(currency, row.revenueMinor, locale),
    pendingFinanceRevenue: exactMoneyText(
      currency,
      row.pendingFinanceRevenueMinor ?? row.pendingApprovalRevenueMinor,
      locale,
    ),
    approval: translateReportStatus(row.approvalState, locale),
    financeApproval: String(row.financeApprovalState ?? ''),
    projection: String(row.financeProjectionState ?? ''),
    costExactMinor: String(row.costMinor ?? ''),
    revenueExactMinor: String(row.revenueMinor ?? ''),
  }));
}

function projectFinanceUnbilledRows(
  sources: unknown,
  currency: string,
  locale: ReportLocale,
): readonly Row[] {
  if (!Array.isArray(sources)) return [];
  return sources.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      sourceType: String(row.sourceType ?? ''),
      sourceId: String(row.sourceId ?? ''),
      date: String(row.workDate ?? row.spentOn ?? row.dueOn ?? ''),
      workerId: String(row.workerId ?? ''),
      amount: exactMoneyText(currency, row.amountMinor, locale),
      amountExactMinor: String(row.amountMinor ?? ''),
    };
  });
}

function projectFinanceMinimumRows(
  sources: unknown,
  currency: string,
  locale: ReportLocale,
): readonly Row[] {
  if (!Array.isArray(sources)) return [];
  return sources.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      workerId: String(row.workerId ?? ''),
      date: String(row.workDate ?? ''),
      adjustmentHours: minutesAsHours(row.adjustmentMinutes),
      adjustmentMinutes: row.adjustmentMinutes == null ? '' : String(row.adjustmentMinutes),
      revenue: exactMoneyText(currency, row.revenueMinor, locale),
      revenueExactMinor: String(row.revenueMinor ?? ''),
    };
  });
}

function projectFinanceInvoiceRows(
  rows: readonly Record<string, unknown>[],
  locale: ReportLocale,
): readonly Row[] {
  return rows.map((row) => {
    const currency = String(row.currency ?? '');
    const total = row.total_minor ?? row.totalMinor ?? '';
    const collected = row.paid_minor ?? row.paidMinor ?? '';
    return {
      invoiceNumber: String(row.invoice_number ?? row.invoiceNumber ?? ''),
      stream: String(row.stream_type ?? row.streamType ?? ''),
      state: translateReportStatus(row.state, locale),
      periodStart: String(row.period_start ?? row.periodStart ?? ''),
      periodEnd: String(row.period_end ?? row.periodEnd ?? ''),
      currency,
      total: exactMoneyText(currency, total, locale),
      collected: exactMoneyText(currency, collected, locale),
      issuedAt: String(row.issued_at ?? row.issuedAt ?? ''),
      dueAt: String(row.due_at ?? row.dueAt ?? ''),
      totalExactMinor: String(total ?? ''),
      collectedExactMinor: String(collected ?? ''),
    };
  });
}

function projectFinanceMilestoneRows(
  rows: readonly Record<string, unknown>[],
  fallbackCurrency: string,
  locale: ReportLocale,
): readonly Row[] {
  return rows.map((row) => {
    const currency = String(row.currency ?? fallbackCurrency);
    const amount = row.amount_minor ?? row.amountMinor ?? '';
    return {
      name: String(row.name ?? ''),
      dueOn: String(row.due_on ?? row.dueOn ?? ''),
      state: translateReportStatus(row.approval_state ?? row.approvalState, locale),
      amount: exactMoneyText(currency, amount, locale),
      amountExactMinor: String(amount ?? ''),
    };
  });
}

function projectFinanceAlertRows(finance: Readonly<Record<string, unknown>>): readonly Row[] {
  const alerts = Array.isArray(finance.alerts)
    ? finance.alerts.map((code) => ({ code: String(code), sourceId: '' }))
    : [];
  const reasons = Array.isArray(finance.reasons)
    ? finance.reasons.map((item) => {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return { code: String(row.code ?? ''), sourceId: String(row.sourceId ?? '') };
      })
    : [];
  return [...alerts, ...reasons];
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
    /** Legacy aliases accepted when rendering historical worker statements. */
    date?: string | null;
    project?: string | null;
    status?: string | null;
    amountMinor?: string | null;
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

function workerActivityCompensation(snapshot: WorkerStatementSnapshot): bigint[] {
  const approvedIndexes: number[] = [];
  const pendingIndexes: number[] = [];
  snapshot.activities.forEach((activity, index) => {
    if (isApprovedRecordState(activity.approvalState)) approvedIndexes.push(index);
    else pendingIndexes.push(index);
  });
  const amounts = snapshot.activities.map(() => 0n);
  const assign = (indexes: readonly number[], totalMinor: string) => {
    const shares = allocateMinorAcrossMinutes(
      indexes.map((index) => snapshot.activities[index]?.actualMinutes ?? 0),
      totalMinor,
    );
    shares.forEach((share, shareIndex) => {
      const activityIndex = indexes[shareIndex];
      if (activityIndex === undefined) return;
      amounts[activityIndex] = share;
    });
  };
  assign(approvedIndexes, snapshot.estimatedApprovedMinor);
  assign(pendingIndexes, snapshot.estimatedPendingMinor);
  return amounts;
}

function workerStatementRows(snapshot: WorkerStatementSnapshot): readonly Row[] {
  const activityCompensation = workerActivityCompensation(snapshot);
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
    ...snapshot.activities.map((activity, index) => ({
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
      currency: snapshot.currency,
      amountMinor: (activityCompensation[index] ?? 0n).toString(),
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
  const activityCompensation = workerActivityCompensation(snapshot);
  const activityHoursTotal = sumFiniteNumbers(
    snapshot.activities.map((activity) => activity.actualMinutes),
  );
  const activityAmountTotal = activityCompensation.reduce((sum, amount) => sum + amount, 0n);
  const settlementAmountTotal = sumMinorUnits(snapshot.settlements.map((row) => row.amountMinor));
  const expenseAmountTotal = sumMinorUnits(
    snapshot.expenses.map((row) => row.reimbursementAmountMinor),
  );
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
  const activityRows = snapshot.activities.map((row, index) => {
    const project =
      [row.projectNumber, row.projectName].filter(Boolean).join(' · ') ||
      row.projectNumber ||
      row.projectName ||
      '—';
    return [
      row.date ?? '—',
      project,
      row.category ?? '—',
      row.activitySummary ?? '—',
      minutesAsHours(row.actualMinutes) || String(row.actualMinutes ?? '—'),
      row.approvalState ?? '—',
      exactMoneyText(snapshot.currency, activityCompensation[index] ?? 0n, 'en'),
    ];
  });
  const settlementRows = snapshot.settlements.map((row) => {
    const project =
      [row.projectNumber, row.projectName].filter(Boolean).join(' · ') ||
      row.projectNumber ||
      row.projectName ||
      '—';
    const period =
      row.periodStart && row.periodEnd
        ? `${row.periodStart} → ${row.periodEnd}`
        : row.periodStart ||
          row.periodEnd ||
          (snapshot.periodStart && snapshot.periodEnd
            ? `${snapshot.periodStart} → ${snapshot.periodEnd}`
            : '—');
    const currency = row.currency || snapshot.currency || 'USD';
    return [
      project,
      period,
      row.state ?? '—',
      row.expectedPaymentOn ?? '—',
      row.settledAt ?? '—',
      exactMoneyText(currency, row.amountMinor, 'en'),
    ];
  });
  const expenseRows = snapshot.expenses.map((row) => [
    row.spentOn ?? row.date ?? '—',
    row.projectNumber ?? row.project ?? '—',
    row.vendor ?? '—',
    row.reimbursementState ?? row.status ?? '—',
    row.expectedReimbursementOn ?? '—',
    row.reimbursedAt ?? '—',
    exactMoneyText(
      row.currency || snapshot.currency,
      row.reimbursementAmountMinor ?? row.amountMinor,
      'en',
    ),
  ]);
  return renderHtmlToPdf(
    layout(
      'Worker compensation statement',
      `${snapshot.worker.name} · ${snapshot.periodStart} → ${snapshot.periodEnd}`,
      `<section class="grid">${summary}</section><p class="muted">Approved hours: ${htmlEscape(minutesAsHours(snapshot.approvedMinutes) || snapshot.approvedMinutes)} · Pending hours: ${htmlEscape(minutesAsHours(snapshot.pendingMinutes) || snapshot.pendingMinutes)}</p><h2>Own activity</h2>${htmlTable(['Date', 'Project', 'Category', 'Activity', 'Hours', 'Approval', 'Estimated pay'], activityRows, 'No activity in this period.', { amountIndexes: [6], footer: activityRows.length ? ['Total', '', '', '', minutesAsHours(activityHoursTotal) || String(activityHoursTotal), '', exactMoneyText(snapshot.currency, activityAmountTotal, 'en')] : undefined })}<h2>Settlements</h2>${htmlTable(['Project', 'Period', 'Status', 'Expected payment', 'Settled', 'Amount'], settlementRows, 'No settlements in this period.', { amountIndexes: [5], footer: settlementRows.length ? ['Total', '', '', '', '', exactMoneyText(snapshot.currency, settlementAmountTotal, 'en')] : undefined })}<h2>Own reimbursable expenses</h2>${htmlTable(['Date', 'Project', 'Vendor', 'Payment status', 'Expected reimbursement', 'Reimbursed', 'Amount'], expenseRows, 'No reimbursable expenses in this period.', { amountIndexes: [6], footer: expenseRows.length ? ['Total', '', '', '', '', '', exactMoneyText(snapshot.currency, expenseAmountTotal, 'en')] : undefined })}`,
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

const ledgerText = (row: InvoiceCollectionLedgerRow, ...keys: string[]): string => {
  const source = row as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined || typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

const invoiceCollectionRows = (rows: readonly InvoiceCollectionLedgerRow[]): readonly Row[] =>
  rows.map((row) => {
    const currency = ledgerText(row, 'currency') || String(row.currency ?? '');
    const totalMinor = ledgerText(row, 'totalMinor', 'total_minor') || row.totalMinor;
    const collectedMinor =
      ledgerText(row, 'collectedMinor', 'collected_minor') || row.collectedMinor;
    const outstandingMinor =
      ledgerText(row, 'outstandingMinor', 'outstanding_minor') || row.outstandingMinor;
    return {
      invoiceId: ledgerText(row, 'invoiceId', 'invoice_id') || row.invoiceId,
      invoiceNumber:
        ledgerText(row, 'invoiceNumber', 'invoice_number') || String(row.invoiceNumber ?? ''),
      clientNumber: ledgerText(row, 'clientNumber', 'client_number') || row.clientNumber,
      clientName: ledgerText(row, 'clientName', 'client_name') || row.clientName,
      projectNumber: ledgerText(row, 'projectNumber', 'project_number') || row.projectNumber,
      projectName: ledgerText(row, 'projectName', 'project_name') || row.projectName,
      issueDate:
        ledgerText(row, 'issueDate', 'issue_date', 'issuedAt', 'issued_at') ||
        String(row.issueDate ?? ''),
      dueDate:
        ledgerText(row, 'dueDate', 'due_date', 'dueAt', 'due_at') || String(row.dueDate ?? ''),
      currency,
      subtotalMinor: ledgerText(row, 'subtotalMinor', 'subtotal_minor') || row.subtotalMinor,
      taxMinor: ledgerText(row, 'taxMinor', 'tax_minor') || row.taxMinor,
      totalMinor,
      grossPaymentsMinor:
        ledgerText(row, 'grossPaymentsMinor', 'gross_payments_minor') || row.grossPaymentsMinor,
      paymentReversalsMinor:
        ledgerText(row, 'paymentReversalsMinor', 'payment_reversals_minor') ||
        row.paymentReversalsMinor,
      netCollectedMinor:
        ledgerText(row, 'netCollectedMinor', 'net_collected_minor') || row.netCollectedMinor,
      collectedMinor,
      outstandingMinor,
      directCostKnownMinor:
        ledgerText(row, 'directCostKnownMinor', 'direct_cost_known_minor') ||
        row.directCostKnownMinor,
      directCostMinor:
        ledgerText(row, 'directCostMinor', 'direct_cost_minor') ||
        String(row.directCostMinor ?? ''),
      directCostComplete: row.directCostComplete,
      directCostMissingSourceIds: (row.directCostMissingSourceIds ?? []).join(';'),
      contributionMinor:
        ledgerText(row, 'contributionMinor', 'contribution_minor') ||
        String(row.contributionMinor ?? ''),
      contributionMarginBps:
        ledgerText(row, 'contributionMarginBps', 'contribution_margin_bps') ||
        String(row.contributionMarginBps ?? ''),
      paymentStatus: ledgerText(row, 'paymentStatus', 'payment_status') || row.paymentStatus,
      billingStatus: ledgerText(row, 'billingStatus', 'billing_status') || row.billingStatus,
      payments: JSON.stringify(row.payments ?? []),
      paymentReversals: JSON.stringify(row.paymentReversals ?? []),
      totalDisplay: exactMoneyText(currency, totalMinor, 'en'),
      collectedDisplay: exactMoneyText(currency, collectedMinor, 'en'),
      outstandingDisplay: exactMoneyText(currency, outstandingMinor, 'en'),
    };
  });

export function invoiceCollectionLedgerCsv(
  rows: readonly InvoiceCollectionLedgerRow[],
): Uint8Array {
  return new TextEncoder().encode(toCsv(invoiceCollectionRows(rows)));
}

export function invoiceCollectionLedgerXlsx(
  rows: readonly InvoiceCollectionLedgerRow[],
): Uint8Array {
  const payments = rows.flatMap((row) =>
    (row.payments ?? []).map((payment) => ({ invoiceId: row.invoiceId, ...payment })),
  );
  const reversals = rows.flatMap((row) =>
    (row.paymentReversals ?? []).map((reversal) => ({ invoiceId: row.invoiceId, ...reversal })),
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

function accountingPackMetricKey(key: string): boolean {
  const normalized = key.replace(/[_\s]/g, '').toLowerCase();
  return !/(?:id|ids)$/u.test(normalized) && normalized !== 'locale';
}

function accountingPackRegisterRows(
  rows: readonly Record<string, unknown>[] | undefined,
  columns: readonly { key: string; fallback?: readonly string[] }[],
): readonly (readonly string[])[] {
  return (rows ?? []).map((row) =>
    columns.map((column) => snapshotText(row, column.key, ...(column.fallback ?? []))),
  );
}

export function accountingPackPdf(
  snapshot: Readonly<{
    periodStart: string;
    periodEnd: string;
    locale?: ReportLocale | string;
    currency?: string;
    legalEntity?: unknown;
    totals: Row | null;
    totalsByCurrency?: readonly Row[];
    invoiceRegister?: readonly Record<string, unknown>[];
    collections?: readonly Record<string, unknown>[];
    workerCosts?: readonly Record<string, unknown>[];
    expenseRegister?: readonly Record<string, unknown>[];
  }>,
): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const snapshotCurrency = snapshot.currency ?? snapshot.totals?.currency ?? 'USD';
  const legalEntityName =
    snapshotText(snapshot.legalEntity, 'legalName', 'legal_name', 'code', 'name') ||
    snapshotText(snapshot.totals, 'legalEntityName', 'legal_entity_name');
  const totals = Object.entries(snapshot.totals ?? {})
    .filter(([key]) => accountingPackMetricKey(key))
    .map(
      ([key, value]) =>
        `<div class="metric"><span class="muted">${htmlEscape(translateReportMetric(key, locale))}</span><strong>${metricValue(key, value, snapshotCurrency, locale)}</strong></div>`,
    )
    .join('');
  const byCurrency = (snapshot.totalsByCurrency ?? [])
    .map((row) => {
      const currency = String(row.currency ?? snapshotCurrency);
      const metrics = Object.entries(row).filter(([key]) => accountingPackMetricKey(key));
      const metricRows = metrics.map(([key, value]) => [
        translateReportMetric(key, locale),
        metricDisplay(key, value, currency, locale),
      ]);
      return `<div class="metric-stack"><h3>${htmlEscape(currency)}</h3>${htmlTable([copy.metric, copy.value], metricRows, copy.noCurrencyBreakdown, { amountIndexes: [1] })}</div>`;
    })
    .join('');
  const invoiceSource = accountingPackRegisterRows(snapshot.invoiceRegister, [
    { key: 'invoiceNumber', fallback: ['invoice_number'] },
    { key: 'client', fallback: ['clientName', 'client_name'] },
    {
      key: 'project',
      fallback: ['projectNumber', 'project_number', 'projectName', 'project_name'],
    },
    { key: 'stream', fallback: ['streamType', 'stream_type'] },
    {
      key: 'servicePeriod',
      fallback: ['periodStart', 'period_start', 'issueDate', 'issue_date', 'issuedAt', 'issued_at'],
    },
    { key: 'grossMinor', fallback: ['gross_minor', 'totalMinor', 'total_minor', 'netMinor'] },
  ]);
  const invoiceRows = invoiceSource.map((row) => [
    row[0] ?? '',
    row[1] ?? '',
    row[2] ?? '',
    row[3] ?? '',
    row[4] ?? '',
    exactMoneyText(snapshotCurrency, row[5], locale),
  ]);
  const parseWorkerHours = (rawVal: unknown): number => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return 0;
    const num = Number(rawVal);
    if (Number.isNaN(num)) return 0;
    if (Number.isInteger(num) && (num >= 600 || num % 60 === 0)) {
      return num / 60;
    }
    return num;
  };

  const formatWorkerHoursDisplay = (rawVal: unknown): string => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return '0.00';
    const hrs = parseWorkerHours(rawVal);
    return hrs.toFixed(2);
  };

  const workerSource = accountingPackRegisterRows(snapshot.workerCosts, [
    { key: 'worker', fallback: ['workerName', 'worker_name', 'name'] },
    {
      key: 'project',
      fallback: ['projectNumber', 'project_number', 'projectName', 'project_name'],
    },
    {
      key: 'actualApprovedMinutes',
      fallback: [
        'actual_approved_minutes',
        'approvedMinutes',
        'approved_minutes',
        'actualMinutes',
        'actual_minutes',
        'minutes',
        'hours',
      ],
    },
    {
      key: 'approvedCompensationMinor',
      fallback: [
        'approved_compensation_minor',
        'compensationMinor',
        'compensation_minor',
        'approvedCostMinor',
        'approved_cost_minor',
        'amountMinor',
        'amount_minor',
        'costMinor',
        'cost_minor',
      ],
    },
  ]);
  const workerRows = workerSource.map((row) => [
    row[0] ?? '',
    row[1] ?? '',
    `${formatWorkerHoursDisplay(row[2])} h`,
    exactMoneyText(snapshotCurrency, row[3], locale),
  ]);
  const totalWorkerHours = workerSource.reduce((acc, row) => acc + parseWorkerHours(row[2]), 0);
  const expenseSource = accountingPackRegisterRows(snapshot.expenseRegister, [
    { key: 'date', fallback: ['spentOn', 'spent_on'] },
    { key: 'worker', fallback: ['workerName', 'worker_name'] },
    { key: 'project', fallback: ['projectNumber', 'project_number'] },
    { key: 'vendor' },
    { key: 'category' },
    {
      key: 'grossMinor',
      fallback: [
        'amountMinor',
        'amount_minor',
        'costMinor',
        'cost_minor',
        'reimbursementAmountMinor',
        'reimbursement_amount_minor',
      ],
    },
  ]);
  const expenseRows = expenseSource.map((row) => [
    row[0] ?? '',
    row[1] ?? '',
    row[2] ?? '',
    row[3] ?? '',
    row[4] ?? '',
    exactMoneyText(snapshotCurrency, row[5], locale),
  ]);
  const collectionSource = accountingPackRegisterRows(snapshot.collections, [
    { key: 'invoiceNumber', fallback: ['invoice_number'] },
    { key: 'client', fallback: ['clientName', 'client_name'] },
    { key: 'receivedAt', fallback: ['received_at', 'date'] },
    { key: 'amountMinor', fallback: ['amount_minor', 'netCollectedMinor'] },
  ]);
  const collectionRows = collectionSource.map((row) => [
    row[0] ?? '',
    row[1] ?? '',
    row[2] ?? '',
    exactMoneyText(snapshotCurrency, row[3], locale),
  ]);
  return renderHtmlToPdf(
    layout(
      copy.accountingPack,
      `${formatReportDate(snapshot.periodStart, locale)} → ${formatReportDate(snapshot.periodEnd, locale)}`,
      `${legalEntityName ? `<p class="muted">${htmlEscape(copy.legalEntity)}: ${htmlEscape(legalEntityName)} · ${htmlEscape(String(snapshotCurrency))}</p>` : ''}<section class="grid">${totals || `<div class="muted">${copy.noTotals}</div>`}</section><h2>${copy.totalsByCurrency}</h2>${byCurrency || `<p class="muted">${copy.noCurrencyBreakdown}</p>`}<h2>${copy.invoiceRegister}</h2>${htmlTable([copy.invoiceNumber, copy.client, copy.project, copy.stream, copy.date, copy.amount], invoiceRows, copy.noInvoiceLines, { amountIndexes: [5], footer: invoiceRows.length ? [copy.total, '', '', '', '', exactMoneyText(snapshotCurrency, sumMinorUnits(invoiceSource.map((row) => row[5])), locale)] : undefined })}<h2>${copy.workerCosts}</h2>${htmlTable([copy.worker, copy.project, copy.hours, copy.amount], workerRows, copy.noTotals, { amountIndexes: [3], footer: workerRows.length ? [copy.total, '', `${totalWorkerHours.toFixed(2)} h`, exactMoneyText(snapshotCurrency, sumMinorUnits(workerSource.map((row) => row[3])), locale)] : undefined })}<h2>${copy.expenses}</h2>${htmlTable([copy.date, copy.worker, copy.project, copy.vendor, copy.detail, copy.amount], expenseRows, copy.noTotals, { amountIndexes: [5], footer: expenseRows.length ? [copy.total, '', '', '', '', exactMoneyText(snapshotCurrency, sumMinorUnits(expenseSource.map((row) => row[5])), locale)] : undefined })}<h2>${copy.collections}</h2>${htmlTable([copy.invoiceNumber, copy.client, copy.date, copy.amount], collectionRows, copy.noTotals, { amountIndexes: [3], footer: collectionRows.length ? [copy.total, '', '', exactMoneyText(snapshotCurrency, sumMinorUnits(collectionSource.map((row) => row[3])), locale)] : undefined })}`,
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
  const project = projectIdentity(snapshot);
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
  const calculationLines = customer ? [] : (snapshot.commercialCalculation ?? []);
  const calculationTableRows = calculationLines.map((line) => [
    translateCalculationType(line.type, locale),
    translateCalculationBasis(line.basis, locale),
    line.minutes === null || line.minutes === undefined ? '—' : `${hours(line.minutes)} h`,
    exactMoneyText(currency, line.amountMinor, locale),
  ]);
  const calculationMinutesTotal = sumFiniteNumbers(calculationLines.map((line) => line.minutes));
  const calculationAmountTotal = sumMinorUnits(calculationLines.map((line) => line.amountMinor));
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
  const operationalRows = [
    ...(snapshot.dailyReports ?? []).map((row) => ({
      type: copy.dailyReport,
      date: formatReportDate(row.work_date ?? row.workDate ?? row.date, locale),
      worker: String(row.worker ?? row.workerName ?? row.worker_name ?? ''),
      detail: String(row.summary ?? ''),
      minutes: null as number | null,
      status: row.approval_state ?? row.approvalState,
    })),
    ...(snapshot.technicalReports ?? []).map((row) => ({
      type: copy.technicalReport,
      date: formatReportDate(
        row.report_date ?? row.reportDate ?? row.date ?? row.created_at ?? row.createdAt,
        locale,
      ),
      worker: String(row.worker ?? row.workerName ?? row.worker_name ?? ''),
      detail: String(row.change_summary ?? row.changeSummary ?? ''),
      minutes: null as number | null,
      status: row.approval_state ?? row.approvalState,
    })),
    ...(snapshot.technicalChanges ?? []).map((row) => ({
      type: copy.technicalChange,
      date: formatReportDate(row.created_at ?? row.createdAt ?? row.date, locale),
      worker: String(row.worker ?? row.workerName ?? row.worker_name ?? ''),
      detail: String(row.change_made ?? row.changeMade ?? ''),
      minutes: null as number | null,
      status: row.approval_state ?? row.approvalState,
    })),
    ...timeSummary.map((row) => ({
      type: copy.sourceTime,
      date: formatReportDate(row.work_date ?? row.workDate ?? row.date, locale),
      worker: String(row.worker ?? row.workerName ?? row.worker_name ?? ''),
      detail: String(row.activity_summary ?? row.activitySummary ?? row.category ?? ''),
      minutes: Number(row.minutes ?? 0),
      status: row.approval_state ?? row.approvalState,
    })),
  ];
  const operationalMinutesTotal = sumFiniteNumbers(operationalRows.map((row) => row.minutes ?? 0));
  const operationalTableRows = operationalRows.map((row) =>
    customer
      ? [
          row.type,
          row.date,
          row.detail,
          row.minutes === null ? '—' : `${hours(row.minutes)} h`,
          translateReportStatus(row.status, locale),
        ]
      : [
          row.type,
          row.date,
          row.worker || '—',
          row.detail,
          row.minutes === null ? '—' : `${hours(row.minutes)} h`,
          translateReportStatus(row.status, locale),
        ],
  );
  const operationalHeaders = customer
    ? [copy.type, copy.date, copy.detail, copy.hours, copy.status]
    : [copy.type, copy.date, copy.worker, copy.detail, copy.hours, copy.status];
  const operationalFooter = operationalRows.length
    ? customer
      ? [copy.total, '', '', `${hours(operationalMinutesTotal)} h`, '']
      : [copy.total, '', '', '', `${hours(operationalMinutesTotal)} h`, '']
    : undefined;
  const calculationTable = customer
    ? ''
    : htmlTable(
        [copy.type, copy.calculationBasis, copy.billableHours, copy.amount],
        calculationTableRows,
        copy.noCalculation,
        {
          amountIndexes: [3],
          footer: calculationTableRows.length
            ? [
                copy.total,
                '',
                `${hours(calculationMinutesTotal)} h`,
                exactMoneyText(currency, calculationAmountTotal, locale),
              ]
            : undefined,
        },
      );
  function customerSignatureBlock(locale: ReportLocale): string {
    const sigLabel =
      locale === 'es'
        ? 'Firma del Representante del Cliente'
        : locale === 'pt'
          ? 'Assinatura do Representante do Cliente'
          : 'Client Representative Signature';
    const nameLabel =
      locale === 'es' ? 'Nombre y Cargo' : locale === 'pt' ? 'Nome e Cargo' : 'Name & Title';
    const dateLabel = locale === 'es' ? 'Fecha' : locale === 'pt' ? 'Data' : 'Date';

    return `<div class="signature-block">
  <div>
    <span>${htmlEscape(sigLabel)}</span>
    <div class="signature-line">____________________________________</div>
    <small>${htmlEscape(nameLabel)}</small>
  </div>
  <div>
    <span>${htmlEscape(dateLabel)}</span>
    <div class="signature-line">__________________</div>
  </div>
</div>`;
  }

  return renderHtmlToPdf(
    layout(
      copy.projectPeriodReport,
      `${project.title}${project.title ? ' · ' : ''}${formatReportDate(snapshot.periodStart, locale)} → ${formatReportDate(snapshot.periodEnd, locale)}`,
      customer
        ? `<h2>${copy.operationalRecord}</h2><div class="grid">${reportField(copy.project, project.title)}${reportField(copy.client, project.clientName)}${publicMetrics}</div><p class="muted">${htmlEscape(copy.sourceRecords)}: ${htmlEscape(sources)}</p>${htmlTable(operationalHeaders, operationalTableRows, copy.noReportRecords, { footer: operationalFooter })}${customerSignatureBlock(locale)}`
        : `<h2>${copy.calculation}</h2><div class="grid">${reportField(copy.project, project.title)}${reportField(copy.client, project.clientName)}${publicMetrics}${internalMetrics}</div><p class="muted">${htmlEscape(copy.sourceRecords)}: ${htmlEscape(sources)}</p>${calculationTable}<h2>${copy.operationalRecord}</h2>${htmlTable(operationalHeaders, operationalTableRows, copy.noReportRecords, { footer: operationalFooter })}`,
      locale,
    ),
  );
}

export function invoicePdf(snapshot: InvoiceTemplateSnapshot): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const rendered = renderInvoiceTemplate(snapshot);
  const number = String(snapshot.number ?? snapshot.invoiceNumber ?? '');
  return renderHtmlToPdf(
    invoiceLayout(rendered.title, rendered.subtitle, number, rendered.body, locale),
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
  problemSymptom?: unknown;
  problem_symptom?: unknown;
  diagnosisRootCause?: unknown;
  diagnosis_root_cause?: unknown;
  changePerformed?: unknown;
  change_performed?: unknown;
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

function reportField(label: string, value: unknown): string {
  const text = value !== null && typeof value === 'object' ? '' : String(value ?? '').trim();
  if (!text) return '';
  return `<div class="metric"><span class="muted">${htmlEscape(label)}</span><strong>${htmlEscape(text)}</strong></div>`;
}

function reportParagraph(title: string, value: unknown): string {
  const text = value !== null && typeof value === 'object' ? '' : String(value ?? '').trim();
  if (!text) return '';
  return `<h2>${htmlEscape(title)}</h2><p>${htmlEscape(text)}</p>`;
}

function sumMinorUnits(values: readonly unknown[]): bigint {
  return values.reduce<bigint>((sum, value) => {
    try {
      return sum + BigInt(String(value ?? 0).trim() || 0);
    } catch {
      return sum;
    }
  }, 0n);
}

function sumFiniteNumbers(values: readonly unknown[]): number {
  return values.reduce<number>((sum, value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

function isApprovedRecordState(value: unknown): boolean {
  const state = String(value ?? '').toLowerCase();
  return state === 'approved' || state === 'locked';
}

function allocateMinorAcrossMinutes(minutes: readonly number[], totalMinor: string): bigint[] {
  let remaining = 0n;
  try {
    remaining = BigInt(String(totalMinor ?? 0));
  } catch {
    remaining = 0n;
  }
  if (minutes.length === 0) return [];
  const amounts = minutes.map(() => 0n);
  if (remaining === 0n) return amounts;
  const totalMinutes = minutes.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (totalMinutes <= 0) {
    amounts[0] = remaining;
    return amounts;
  }
  const pool = remaining;
  for (let index = 0; index < minutes.length; index += 1) {
    const share =
      index === minutes.length - 1
        ? remaining
        : (pool * BigInt(Math.max(0, minutes[index] ?? 0))) / BigInt(totalMinutes);
    amounts[index] = share;
    remaining -= share;
  }
  return amounts;
}

function htmlTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  empty: string,
  options?: Readonly<{
    amountIndexes?: readonly number[];
    footer?: readonly string[];
  }>,
): string {
  if (rows.length === 0) return `<p class="muted">${htmlEscape(empty)}</p>`;
  const amountIndexes = new Set(options?.amountIndexes ?? []);
  const cell = (value: string, index: number, tag: 'th' | 'td'): string => {
    const amountClass = amountIndexes.has(index) ? ' class="amount"' : '';
    return `<${tag}${amountClass}>${htmlEscape(value)}</${tag}>`;
  };
  const head = headers.map((header, index) => cell(header, index, 'th')).join('');
  const body = rows
    .map((row) => `<tr>${row.map((value, index) => cell(value, index, 'td')).join('')}</tr>`)
    .join('');
  const footer =
    options?.footer && options.footer.length === headers.length
      ? `<tfoot><tr>${options.footer.map((value, index) => cell(value, index, 'td')).join('')}</tr></tfoot>`
      : '';
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${footer}</table>`;
}

function technicalReportChangeFields(snapshot: TechnicalReportSnapshot): {
  problemSymptom: unknown;
  diagnosisRootCause: unknown;
  changePerformed: unknown;
} {
  const explicit = {
    problemSymptom: snapshot.problemSymptom ?? snapshot.problem_symptom,
    diagnosisRootCause: snapshot.diagnosisRootCause ?? snapshot.diagnosis_root_cause,
    changePerformed: snapshot.changePerformed ?? snapshot.change_performed,
  };
  if (explicit.problemSymptom || explicit.diagnosisRootCause || explicit.changePerformed)
    return explicit;
  const legacy = snapshot.changeSummary ?? snapshot.change_summary ?? snapshot.changes;
  if (typeof legacy === 'string' && legacy.startsWith('{')) {
    try {
      const parsed = JSON.parse(legacy) as Record<string, unknown>;
      if (parsed.schema === 'ja.technical-report.change.v1')
        return {
          problemSymptom: parsed.problemSymptom,
          diagnosisRootCause: parsed.diagnosisRootCause,
          changePerformed: parsed.changePerformed,
        };
    } catch {
      // Historical free text remains the change-performed fallback.
    }
  }
  return { problemSymptom: '', diagnosisRootCause: '', changePerformed: legacy };
}

/** Render one immutable Daily Field Report source record in the requested locale. */
export function dailyReportPdf(snapshot: DailyReportSnapshot): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const project = projectIdentity(snapshot);
  const date = snapshot.date ?? snapshot.workDate ?? snapshot.work_date;
  const status = snapshot.approvalState ?? snapshot.approval_state;
  const safety = snapshot.safetyRelated ?? snapshot.safety_related;
  const worker =
    snapshotText(snapshot, 'workerName', 'worker_name', 'author_name', 'authorName') ||
    (typeof snapshot.worker === 'string'
      ? snapshot.worker
      : snapshotText(snapshot.worker, 'name', 'workerName', 'worker_name'));
  const fields = [
    reportField(copy.project, project.title),
    reportField(copy.client, project.clientName),
    reportField(copy.date, formatReportDate(date, locale)),
    reportField(copy.worker, worker),
    reportField(copy.status, translateReportStatus(status, locale)),
    reportField(copy.safetyRelated, translateReportBoolean(safety, locale)),
    reportField(
      copy.siteShift,
      reportNarrative(snapshot, 'siteShift', 'site_shift', 'siteName', 'site_name'),
    ),
    reportField(
      copy.downtimeMinutes,
      reportNarrative(snapshot, 'downtimeMinutes', 'downtime_minutes'),
    ),
    reportField(copy.standbyReason, reportNarrative(snapshot, 'standbyReason', 'standby_reason')),
    reportField(
      copy.customerContact,
      reportNarrative(snapshot, 'customerContact', 'customer_contact'),
    ),
  ].join('');
  return renderHtmlToPdf(
    layout(
      copy.dailyReport,
      `${project.title}${project.title && date ? ' · ' : ''}${formatReportDate(date, locale)}`,
      `<h2>${copy.operationalRecord}</h2><div class="grid">${fields}</div>${reportParagraph(copy.summary, snapshot.summary)}${reportParagraph(copy.tasksCompleted, reportNarrative(snapshot, 'tasksCompleted', 'tasks_completed'))}${reportParagraph(copy.problemsFound, reportNarrative(snapshot, 'problemsFound', 'problems_found'))}${reportParagraph(copy.correctiveActions, reportNarrative(snapshot, 'correctiveActions', 'corrective_actions'))}${reportParagraph(copy.clientDecisions, reportNarrative(snapshot, 'clientDecisions', 'client_decisions'))}${reportParagraph(copy.openItems, reportNarrative(snapshot, 'openItems', 'open_items'))}${reportParagraph(copy.blockers, reportNarrative(snapshot, 'blockers'))}${reportParagraph(copy.nextDayPlan, reportNarrative(snapshot, 'nextDayPlan', 'next_day_plan'))}`,
      locale,
    ),
  );
}

/** Render one immutable PLC / Technical Report source record in the requested locale. */
export function technicalReportPdf(snapshot: TechnicalReportSnapshot): Uint8Array {
  const locale = normalizeReportLocale(snapshot.locale);
  const copy = localizedCopy[locale];
  const project = projectIdentity(snapshot);
  const date =
    snapshot.reportDate ??
    snapshot.report_date ??
    snapshot.date ??
    snapshot.createdAt ??
    snapshot.created_at;
  const status = snapshot.approvalState ?? snapshot.approval_state;
  const safety = snapshot.safetyRelated ?? snapshot.safety_related;
  const changeFields = technicalReportChangeFields(snapshot);
  const fields = [
    reportField(copy.project, project.title),
    reportField(copy.client, project.clientName),
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
      `${project.title}${project.title && date ? ' · ' : ''}${formatReportDate(date, locale)}`,
      `<section class="report-section"><h2>${copy.operationalRecord}</h2><div class="grid">${fields}</div></section>${technicalDetails ? `<section class="report-section"><h2>${copy.technicalRecords}</h2><div class="grid">${technicalDetails}</div></section>` : ''}<section class="report-section"><h2>${copy.changeSummary}</h2><div class="grid">${reportField(copy.problemSymptom, changeFields.problemSymptom)}${reportField(copy.diagnosisRootCause, changeFields.diagnosisRootCause)}${reportField(copy.changePerformed, changeFields.changePerformed)}${reportField(copy.productionImpact, snapshot.productionImpact ?? snapshot.production_impact)}${reportField(copy.validation, snapshot.validation)}${reportField(copy.validationResult, snapshot.validationResult ?? snapshot.validation_result)}${reportField(copy.openRisk, snapshot.openRisk ?? snapshot.open_risk)}${reportField(copy.rollbackPlan, snapshot.rollbackPlan ?? snapshot.rollbackInformation ?? snapshot.rollback_information)}</div></section>${changesSection}`,
      locale,
    ),
  );
}
