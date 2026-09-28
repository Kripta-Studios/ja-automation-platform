import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import {
  e2eDatabasePath,
  e2eDocumentRoot,
  e2eFixtureToken,
  e2eRoot,
} from './tests/e2e/environment.js';
import { e2eDeploymentId, e2eTenantId } from './tests/e2e/support/deployment-fixture.js';

// This isolated harness exercises the real auth hook with a low limit. It does
// not change the shared browser suite's rate limit or contact production.
process.env.JA_E2E_FIXTURE_TOKEN = e2eFixtureToken;
process.env.JA_E2E_DATABASE_PATH = e2eDatabasePath;
process.env.JA_E2E_DOCUMENT_ROOT = e2eDocumentRoot;
process.env.JA_TENANT_ID = e2eTenantId;
process.env.JA_DEPLOYMENT_ID = e2eDeploymentId;
process.env.JA_LOGIN_RATE_LIMIT_FIXTURE = 'true';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'error-warning-login-rate-limit.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    launchOptions: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH,
          args:
            process.getuid?.() === 0
              ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
              : undefined,
        }
      : undefined,
  },
  globalSetup: './tests/e2e/global-setup.ts',
  projects: [
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node apps/portal/build',
    url: 'http://127.0.0.1:4174/j-aautomation/app/login',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development',
      ORIGIN: 'http://127.0.0.1:4174',
      HOST: '127.0.0.1',
      PORT: '4174',
      JA_DATABASE_PATH: e2eDatabasePath,
      JA_MIGRATIONS_PATH: join(e2eRoot, 'migrations'),
      JA_DOCUMENT_ROOT: e2eDocumentRoot,
      JA_TENANT_ID: e2eTenantId,
      JA_DEPLOYMENT_ID: e2eDeploymentId,
      JA_AUTH_SECRET: 'e2e-only-secret-do-not-use-in-production',
      JA_PUBLIC_BASE_PATH: '/j-aautomation',
      JA_PORTAL_BASE_PATH: '/j-aautomation/app',
      JA_AUTH_RATE_LIMIT_MAX: '2',
    },
  },
});
