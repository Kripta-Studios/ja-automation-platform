import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const locales = ['en', 'es', 'pt'] as const;
const datasets = ['empty', 'ordinary', 'long'] as const;
const expectedFiles = [
  'customer-report.pdf',
  'finance-report.pdf',
  'worker-report.pdf',
  'worker-report.csv',
  'invoice-labor.pdf',
  'invoice-expenses.pdf',
  'credit.pdf',
  'accounting-pack-pdf.pdf',
  'accounting-pack-xlsx.xlsx',
  'accounting-pack-invoice_csv.csv',
  'accounting-pack-expense_csv.csv',
  'accounting-pack-json.json',
  'project-finance.xlsx',
] as const;

describe('client-ready synthetic artifact reader matrix', () => {
  let output = '';

  beforeAll(() => {
    output = mkdtempSync(resolve(tmpdir(), 'ja-client-ready-matrix-test-'));
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        resolve(process.cwd(), 'scripts/generate-synthetic-client-ready-artifacts.ts'),
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, JA_ARTIFACT_SOURCE_DIR: output },
        stdio: 'pipe',
        timeout: 120_000,
      },
    );
  }, 130_000);

  afterAll(() => {
    if (output.startsWith(resolve(tmpdir(), 'ja-client-ready-matrix-test-')))
      rmSync(output, { recursive: true, force: true });
  });

  it.each(locales.flatMap((locale) => datasets.map((dataset) => [locale, dataset] as const)))(
    'preserves all canonical outputs for %s/%s',
    (locale, dataset) => {
      const directory = resolve(output, 'matrix', locale, dataset);
      expect(readdirSync(directory).sort()).toEqual([...expectedFiles].sort());
      for (const file of expectedFiles) {
        const path = resolve(directory, file);
        expect(statSync(path).size, path).toBeGreaterThan(0);
        const bytes = readFileSync(path);
        if (file.endsWith('.pdf')) expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        if (file.endsWith('.xlsx')) expect(bytes.subarray(0, 2).toString()).toBe('PK');
        if (file.endsWith('.json')) expect(() => JSON.parse(bytes.toString('utf8'))).not.toThrow();
      }
    },
  );
});
