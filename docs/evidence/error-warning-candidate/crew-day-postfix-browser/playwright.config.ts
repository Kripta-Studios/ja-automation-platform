import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import candidate from '../project-finance-export-candidate-browser/playwright.config.js';

export default defineConfig({
  ...candidate,
  testDir: resolve(import.meta.dirname),
  testMatch: 'candidate.spec.ts',
  webServer: candidate.webServer?.map((server) => ({ ...server, command: 'pnpm --filter @ja/portal preview' })),
});
