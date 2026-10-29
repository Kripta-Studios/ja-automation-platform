import { defineConfig } from '@playwright/test';
import base from './billing-invoice-stream-prerequisite.browser.config.js';

const portalServer = (base.webServer as Array<Record<string, unknown>>)[0];
export default defineConfig({
  ...base,
  testMatch: 'local-account-mailbox.browser.spec.ts',
  timeout: 90_000,
  projects: [
    { name: 'phone-360', use: { viewport: { width: 360, height: 800 } } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'node tests/stubs/local-mailbox-jmap.mjs',
      cwd: process.cwd(),
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: false,
    },
    {
      ...portalServer,
      command:
        process.env.JA_MAILBOX_REUSE_BUILD === '1'
          ? 'cd apps/portal && node build'
          : (portalServer.command as string),
      env: {
        ...(portalServer.env as Record<string, string>),
        JA_STALWART_JMAP_URL: 'http://127.0.0.1:4178/jmap',
        JA_STALWART_TOKEN: 'isolated-browser-test',
      },
    },
  ],
});
