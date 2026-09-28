import { defineConfig } from '@playwright/test';
import { join, resolve } from 'node:path';
import base from '../../playwright.config.js';
import { e2eDatabasePath, e2eDocumentRoot, e2eRoot } from './environment.js';
import { e2eDeploymentId, e2eTenantId } from './support/deployment-fixture.js';

export default defineConfig({
  ...base,
  testDir: resolve(import.meta.dirname),
  testMatch: 'billing-invoice-stream-prerequisite.browser.spec.ts',
  globalSetup: resolve(import.meta.dirname, 'global-setup.ts'),
  projects: [
    { name: 'billing-invoice-stream-prerequisite', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      cwd: e2eRoot,
      command: 'cd apps/portal && node_modules/.bin/vite build && node build',
      url: 'http://127.0.0.1:4174/j-aautomation/app/login',
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NODE_ENV: 'development',
        ORIGIN: 'http://127.0.0.1:4174',
        JA_DATABASE_PATH: e2eDatabasePath,
        JA_MIGRATIONS_PATH: join(e2eRoot, 'migrations'),
        JA_DOCUMENT_ROOT: e2eDocumentRoot,
        JA_TENANT_ID: e2eTenantId,
        JA_DEPLOYMENT_ID: e2eDeploymentId,
        JA_OFFLINE_ENABLED: 'true',
        JA_AUTH_RATE_LIMIT_MAX: '500',
        JA_REPORTING_LOGO_PATH: join(e2eRoot, 'packages/reporting/assets/logo-jaautomation.png'),
        JA_FIXTURE_RESET_DOCUMENTS: 'false',
        JA_AUTH_SECRET: 'e2e-only-secret-do-not-use-in-production',
        JA_PUBLIC_BASE_PATH: '/j-aautomation',
        JA_PORTAL_BASE_PATH: '/j-aautomation/app',
        HOST: '127.0.0.1',
        PORT: '4174',
      },
    },
  ],
  reporter: [['list']],
});
