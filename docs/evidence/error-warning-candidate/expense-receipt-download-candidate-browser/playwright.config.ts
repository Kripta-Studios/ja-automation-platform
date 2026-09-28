import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pointer = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/e2e/data/e2e-fixture-current.json'), 'utf8'),
) as { runToken: string };
process.env.JA_E2E_FIXTURE_TOKEN = pointer.runToken;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: 'receipt-download.spec.ts',
  workers: 1,
  timeout: 180_000,
  reporter: [['list']],
  projects: [{ name: 'receipt-download', use: { viewport: { width: 390, height: 844 } } }],
});
