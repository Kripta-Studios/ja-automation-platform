import { deflateRawSync } from 'node:zlib';

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

type PdfInput = Readonly<{ title: string; lines: readonly string[] }>;

const pdfEscape = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]/g, ' ');

export function simplePdf(input: PdfInput): Uint8Array {
  const lines = [input.title, ...input.lines].slice(0, 46);
  const commands = ['BT', '/F1 16 Tf', '50 780 Td', `(${pdfEscape(input.title)}) Tj`, '/F1 9 Tf'];
  for (const line of lines.slice(1)) {
    commands.push('0 -16 Td', `(${pdfEscape(line).slice(0, 150)}) Tj`);
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const chunks: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(chunks.join(''), 'latin1'));
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(''), 'latin1');
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index < offsets.length; index += 1)
    chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return new Uint8Array(Buffer.from(chunks.join(''), 'latin1'));
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

export function accountingPackPdf(
  snapshot: Readonly<{
    periodStart: string;
    periodEnd: string;
    totals: Row | null;
    totalsByCurrency?: readonly Row[];
  }>,
): Uint8Array {
  return simplePdf({
    title: `J&A Automation Accounting Pack ${snapshot.periodStart} to ${snapshot.periodEnd}`,
    lines: [
      ...Object.entries(snapshot.totals ?? {}).map(([key, value]) => `${key}: ${cellText(value)}`),
      ...(snapshot.totalsByCurrency ?? []).flatMap((currency) =>
        Object.entries(currency).map(([key, value]) => `currency.${key}: ${cellText(value)}`),
      ),
    ],
  });
}

export function periodReportPdf(
  snapshot: Readonly<{
    project?: Readonly<{ number?: string; name?: string; clientName?: string }>;
    periodStart: string;
    periodEnd: string;
    audience?: string;
    dailyReports?: readonly Row[];
    technicalReports?: readonly Row[];
    technicalChanges?: readonly Row[];
    backupArtifacts?: readonly Row[];
  }>,
): Uint8Array {
  const lines = [
    `Project: ${snapshot.project?.number ?? ''} ${snapshot.project?.name ?? ''}`,
    `Client: ${snapshot.project?.clientName ?? ''}`,
    `Audience: ${snapshot.audience ?? ''}`,
    `Period: ${snapshot.periodStart} to ${snapshot.periodEnd}`,
    `Daily reports: ${snapshot.dailyReports?.length ?? 0}`,
    `Technical reports: ${snapshot.technicalReports?.length ?? 0}`,
    `Technical changes: ${snapshot.technicalChanges?.length ?? 0}`,
    `Registered artifacts: ${snapshot.backupArtifacts?.length ?? 0}`,
    ...(snapshot.technicalChanges ?? [])
      .slice(0, 12)
      .map(
        (change) =>
          `${cellText(change.component)}: ${cellText(change.changeMade ?? change.change_made)}`,
      ),
  ];
  return simplePdf({
    title: `J&A Automation Project Period Report`,
    lines,
  });
}

export function invoicePdf(
  snapshot: Readonly<{
    number: string;
    legalEntity?: { legal_name?: string };
    client?: { legalName?: string };
    calculation?: { currency?: string; totalMinor?: string };
    lines?: readonly Row[];
  }>,
): Uint8Array {
  return simplePdf({
    title: `Invoice ${snapshot.number}`,
    lines: [
      `From: ${snapshot.legalEntity?.legal_name ?? ''}`,
      `Bill to: ${snapshot.client?.legalName ?? ''}`,
      ...(snapshot.lines ?? []).map(
        (line) => `${cellText(line.description)} | ${cellText(line.subtotal_minor)}`,
      ),
      `Total: ${snapshot.calculation?.currency ?? ''} ${snapshot.calculation?.totalMinor ?? ''}`,
    ],
  });
}
