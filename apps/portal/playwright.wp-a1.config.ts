import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import rootConfig from '../../playwright.config';

export default defineConfig({
  ...rootConfig,
  testDir: resolve(process.cwd(), 'apps/portal'),
  testMatch: 'wp-a1-parity.spec.ts',
  globalSetup: resolve(process.cwd(), 'tests/e2e/global-setup.ts'),
});
