import { defineConfig } from '@playwright/test';
import base from './billing-invoice-stream-prerequisite.browser.config.js';

export default defineConfig({
  ...base,
  testMatch: [
    'project-action-navigation.browser.spec.ts',
    'project-linked-invoices.browser.spec.ts',
  ],
  projects: [
    {
      name: 'phone-360',
      testMatch: 'project-action-navigation.browser.spec.ts',
      use: { viewport: { width: 360, height: 800 } },
    },
    {
      name: 'phone-390',
      testMatch: 'project-action-navigation.browser.spec.ts',
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet-768',
      testMatch: 'project-action-navigation.browser.spec.ts',
      use: { viewport: { width: 768, height: 1024 } },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: (base.webServer as Array<object>).map((server) => ({
    ...server,
    command: 'cd apps/portal && node build',
  })),
});
