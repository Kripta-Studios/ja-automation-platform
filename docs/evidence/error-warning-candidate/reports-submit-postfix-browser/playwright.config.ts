import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../../../playwright.config.js';

export default defineConfig({
  ...base,
  testDir: resolve(import.meta.dirname),
  testMatch: 'postfix.spec.ts',
  globalSetup: resolve(import.meta.dirname, '../../../../tests/e2e/global-setup.ts'),
  projects: [
    {
      name: 'phone-390',
      use: { viewport: { width: 390, height: 844 }, isMobile: false, deviceScaleFactor: 1 },
    },
  ],
  reporter: [['list']],
});
