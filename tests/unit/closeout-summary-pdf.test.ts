import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { closeoutSummaryPdf } from '../../packages/database/src/domains/closeout/closeout-summary-pdf.ts';

describe('closeout summary reader', () => {
  it('preserves all long entries, punctuation and international text across readable pages', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-closeout-pdf-test-'));
    try {
      const lines = Array.from(
        { length: 60 },
        (_, index) =>
          `Entry-${index + 1}: Completed validation (PLC) \\ baseline; ${'commissioning '.repeat(9)}FINAL-${index + 1}`,
      );
      lines.push('João — São Paulo; revisión técnica; € 25,50; 日本語');
      const path = join(directory, 'summary.pdf');
      const bytes = closeoutSummaryPdf('J&A project closeout client revision 1', lines);
      writeFileSync(path, bytes);
      expect(bytes.toString('ascii')).toContain(
        Buffer.from('[U+65E5][U+672C][U+8A9E]').toString('hex'),
      );
      expect(bytes.toString('ascii')).not.toContain('<3f3f3f>');
      const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
      expect(Number(/Pages:\s+(\d+)/u.exec(info)?.[1])).toBeGreaterThan(1);
      const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
      for (let i = 1; i <= 60; i++) expect(text).toContain(`FINAL-${i}`);
      expect(text).toContain('(PLC) \\ baseline');
      expect(text).toContain('João — São Paulo');
      expect(text).toContain('revisión técnica');
      expect(text).toContain('€ 25,50');
      expect(text).toContain('日本語');
      expect(text).toContain('[U+XXXX] notation.');
      const bbox = execFileSync('pdftotext', ['-bbox', path, '-'], { encoding: 'utf8' });
      for (const match of bbox.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/gu,
      )) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(40);
        expect(Number(match[3])).toBeLessThanOrEqual(555);
        expect(Number(match[4])).toBeLessThanOrEqual(810);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
