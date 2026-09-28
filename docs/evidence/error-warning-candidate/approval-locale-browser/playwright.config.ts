import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../../../playwright.config.js';

const portalWebServer = Array.isArray(base.webServer) ? base.webServer.at(-1) : base.webServer;
if (!portalWebServer) throw new Error('Portal preview server is missing from Playwright config');

export default defineConfig({
  ...base,
  testDir: resolve(import.meta.dirname),
  testMatch: 'candidate.spec.ts',
  globalSetup: resolve(import.meta.dirname, '../../../../tests/e2e/global-setup.ts'),
  webServer: [
    {
      ...portalWebServer,
      env: { ...portalWebServer.env, JA_OFFLINE_ENABLED: 'true' },
    },
  ],
  projects: [
    {
      name: 'phone-390',
      use: { viewport: { width: 390, height: 844 }, isMobile: false, deviceScaleFactor: 1 },
    },
  ],
  use: { ...base.use, trace: 'off' },
  reporter: [['list']],
});
