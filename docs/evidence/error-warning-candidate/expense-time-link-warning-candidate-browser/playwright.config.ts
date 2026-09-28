import { defineConfig } from '@playwright/test';
import { join, resolve } from 'node:path';
import {
  e2eDatabasePath,
  e2eDocumentRoot,
  e2eFixtureToken,
  e2eRoot,
} from '../../../../tests/e2e/environment.js';
import { e2eDeploymentId, e2eTenantId } from '../../../../tests/e2e/support/deployment-fixture.js';

process.env.JA_E2E_FIXTURE_TOKEN = e2eFixtureToken;
process.env.JA_E2E_DATABASE_PATH = e2eDatabasePath;
process.env.JA_E2E_DOCUMENT_ROOT = e2eDocumentRoot;
process.env.JA_TENANT_ID = e2eTenantId;
process.env.JA_DEPLOYMENT_ID = e2eDeploymentId;

export default defineConfig({
  testDir: resolve(import.meta.dirname),
  testMatch: 'candidate.spec.ts',
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4177',
    viewport: { width: 390, height: 844 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    launchOptions: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        }
      : undefined,
  },
  globalSetup: resolve(import.meta.dirname, '../../../../tests/e2e/global-setup.ts'),
  reporter: [['list']],
  webServer: [
    {
      command:
        process.env.JA_BROWSER_USE_EXISTING_BUILD === '1'
          ? 'node node_modules/vite/bin/vite.js preview --port 4177 --host 127.0.0.1'
          : 'node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --port 4177 --host 127.0.0.1',
      cwd: join(e2eRoot, 'apps/portal'),
      url: 'http://127.0.0.1:4177/j-aautomation/app/login',
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NODE_ENV: 'development',
        ORIGIN: 'http://127.0.0.1:4177',
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
        PORT: '4177',
      },
    },
  ],
});
