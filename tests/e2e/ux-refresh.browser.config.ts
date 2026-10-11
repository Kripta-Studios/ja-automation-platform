import { defineConfig } from '@playwright/test';
import base from './billing-invoice-stream-prerequisite.browser.config.js';

const reuse = process.env.JA_UX_REUSE_PREVIEW === '1';
export default defineConfig({
  ...base,
  testMatch: [
    'ux-refresh-*.spec.ts',
    'ux-round2-*.spec.ts',
    'project-invoice-journey-audit.spec.ts',
    'accounting-pack-export-browser.spec.ts',
  ],
  globalSetup: reuse ? undefined : base.globalSetup,
  timeout: 60_000,
  projects: [
    { name: 'phone-360', use: { viewport: { width: 360, height: 800 } } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: reuse ? undefined : base.webServer,
});
