import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import loginRateLimitConfig from '../../../../playwright.login-rate-limit.config';

const webServer = loginRateLimitConfig.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error('Expected one login preview server');

export default defineConfig({
  ...loginRateLimitConfig,
  testDir: resolve(import.meta.dirname),
  testMatch: 'candidate.spec.ts',
  globalSetup: resolve(import.meta.dirname, '../../../../tests/e2e/global-setup.ts'),
  use: { ...loginRateLimitConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { ...webServer, cwd: resolve(import.meta.dirname, '../../../..') },
});
