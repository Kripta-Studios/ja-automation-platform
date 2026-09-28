import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../../../playwright.config.js';

const portalServer = Array.isArray(base.webServer) ? base.webServer[1] : null;

export default defineConfig({
  ...base,
  testDir: resolve(import.meta.dirname),
  testMatch: 'preview.spec.ts',
  globalSetup: resolve(import.meta.dirname, '../../../../tests/e2e/global-setup.ts'),
  webServer: portalServer ? [portalServer] : [],
  workers: 1,
  projects: [
    { name: 'invoice-preview', use: { viewport: { width: 390, height: 844 }, trace: 'off' } },
  ],
  reporter: [['list']],
});
