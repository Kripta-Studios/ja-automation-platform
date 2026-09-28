/** Lightweight, paginated closeout summary; the full authoritative snapshot remains in closeout.json. */
export const CLOSEOUT_SUMMARY_RENDERER_VERSION = 'closeout-summary-2026.09.22.1';

const winAnsi = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);
function displayText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0)!;
    return (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || winAnsi.has(code)
      ? character
      : `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`;
  }).join('');
}
function displayHex(value: string): string {
  return Buffer.from(
    Array.from(displayText(value), (character) => {
      const code = character.codePointAt(0)!;
      return winAnsi.get(code) ?? code;
    }),
  ).toString('hex');
}
function actualHex(value: string): string {
  const little = Buffer.from(value, 'utf16le');
  little.swap16();
  return 'feff' + little.toString('hex');
}
function text(value: string, x: number, y: number, size: number, bold = false): string {
  // ActualText preserves copy/search/accessible Unicode even beyond the built-in font's glyph set.
  return `/Span << /ActualText <${actualHex(value)}> >> BDC BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${displayHex(value)}> Tj ET EMC`;
}
function wrap(value: string, limit: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.replace(/[\r\t]/gu, ' ').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/u).filter(Boolean)) {
      if (line && displayText(line + ' ' + word).length > limit) {
        lines.push(line);
        line = '';
      }
      let remaining = Array.from(word);
      while (displayText(remaining.join('')).length > limit) {
        if (line) {
          lines.push(line);
          line = '';
        }
        let split = 1;
        while (
          split < remaining.length &&
          displayText(remaining.slice(0, split + 1).join('')).length <= limit
        )
          split++;
        lines.push(remaining.slice(0, split).join(''));
        remaining = remaining.slice(split);
      }
      if (remaining.length) line += (line ? ' ' : '') + remaining.join('');
    }
    lines.push(line);
  }
  return lines;
}

export function closeoutSummaryPdf(title: string, lines: readonly string[]): Buffer {
  const titleLines = wrap(title, 29);
  const hasEscapedCharacters = [title, ...lines].some((value) => displayText(value) !== value);
  const displayLines = hasEscapedCharacters
    ? [
        ...lines,
        'Characters unavailable in this summary font use [U+XXXX] notation. Original text is retained in closeout.json and PDF copy/search.',
      ]
    : lines;
  const bodyLines = displayLines.flatMap((line) => [...wrap(line, 54), '']);
  const pages: string[][] = [];
  for (let index = 0; index < bodyLines.length || !pages.length; index += 40)
    pages.push(bodyLines.slice(index, index + 40));
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((page, index) => {
    const stream = [
      '0.78 0.10 0.07 RG 2 w 42 793 m 553 793 l S',
      '0.15 0.15 0.12 rg',
      ...titleLines.map((line, i) => text(line, 42, 766 - i * 22, 17, true)),
      '0.35 0.35 0.32 rg',
      text('Project handover / historical summary', 42, 702, 9),
      '0.15 0.15 0.12 rg',
      ...page.map((line, i) => text(line, 42, 670 - i * 14, 9)),
      '0.35 0.35 0.32 rg',
      text('Full snapshot and document references: closeout.json', 42, 62, 8),
      text(`J&A Automation | ${index + 1} / ${pages.length}`, 42, 43, 8),
    ].join('\n');
    const contentId = 6 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    );
  });
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}
