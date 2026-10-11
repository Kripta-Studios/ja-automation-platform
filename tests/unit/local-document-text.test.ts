import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  extractLocalDocumentText,
  LOCAL_TEXT_MAX_BYTES,
} from '../../apps/portal/src/lib/server/local-document-text';

function textPdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 40 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe('local document extraction without external services', () => {
  it('preserves supplied text, binds original bytes and limits preview length', async () => {
    const bytes = Buffer.from('Trabajo realizado\nTeste pendente\n' + 'x'.repeat(21_000));
    const result = await extractLocalDocumentText(bytes, 'text/plain', 'es');
    expect(result.method).toBe('plain_text');
    expect(result.text).toContain('Teste pendente');
    expect(result.text).toHaveLength(20_000);
    expect(result.truncated).toBe(true);
    expect(result.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
  it('extracts actual PDF text using the installed local reader', async () => {
    const result = await extractLocalDocumentText(
      textPdf('Receipt total EUR 42.50'),
      'application/pdf',
      'en',
    );
    expect(result.text).toContain('Receipt total EUR 42.50');
    expect(result.method).toBe('pdf_text');
    expect(result.pageLimit).toBe(20);
  });
  it('reads a real synthetic receipt image with local OCR', async () => {
    const bytes = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="240"><rect width="1200" height="240" fill="white"/><text x="40" y="100" font-family="DejaVu Sans" font-size="52" fill="black">RECEIPT TOTAL EUR 42.50</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    const result = await extractLocalDocumentText(bytes, 'image/png', 'en');
    expect(result.method).toBe('image_ocr');
    expect(result.text).toContain('42.50');
    expect(result.text.toUpperCase()).toContain('RECEIPT');
  }, 30_000);
  it('rejects unsupported content and oversized input before a tool runs', async () => {
    await expect(
      extractLocalDocumentText(Buffer.from('not a pdf'), 'application/pdf', 'en'),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(
      extractLocalDocumentText(new Uint8Array(LOCAL_TEXT_MAX_BYTES + 1), 'text/plain', 'en'),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(
      extractLocalDocumentText(Buffer.from([255, 0]), 'text/plain', 'en'),
    ).rejects.toMatchObject({ code: 'invalid_file' });
  });
});
