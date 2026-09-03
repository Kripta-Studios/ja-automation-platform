import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import {
  e2eDatabasePath,
  e2eDocumentRoot,
  e2eFixtureToken,
  e2eRoot as root,
} from './tests/e2e/environment.js';
import { e2eDeploymentId, e2eTenantId } from './tests/e2e/support/deployment-fixture.js';

// Hand off this invocation's unique fixture identity to web servers and any workers that inherit
// the runner environment. The stable pointer/lock remains the fallback discovery channel when a
// worker does not inherit these mutations.
process.env.JA_E2E_FIXTURE_TOKEN = e2eFixtureToken;
process.env.JA_E2E_DATABASE_PATH = e2eDatabasePath;
process.env.JA_E2E_DOCUMENT_ROOT = e2eDocumentRoot;
process.env.JA_TENANT_ID = e2eTenantId;
process.env.JA_DEPLOYMENT_ID = e2eDeploymentId;

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
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
    // Keep the required evidence widths explicit. Chromium is used with a
    // deterministic viewport instead of device emulation so CSS breakpoints
    // and touch-sized controls are exercised consistently in CI.
    {
      name: 'phone-360',
      use: { viewport: { width: 360, height: 800 }, isMobile: false, deviceScaleFactor: 1 },
    },
    {
      name: 'phone-390',
      use: { viewport: { width: 390, height: 844 }, isMobile: false, deviceScaleFactor: 1 },
    },
    {
      name: 'phone-430',
      use: { viewport: { width: 430, height: 932 }, isMobile: false, deviceScaleFactor: 1 },
    },
    {
      name: 'tablet-768',
      use: { viewport: { width: 768, height: 1024 }, isMobile: false, deviceScaleFactor: 1 },
    },
    {
      name: 'tablet-1024',
      use: { viewport: { width: 1024, height: 768 }, isMobile: false, deviceScaleFactor: 1 },
    },
    {
      name: 'laptop-1280',
      use: { viewport: { width: 1280, height: 800 }, isMobile: false, deviceScaleFactor: 1 },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'wide-1920',
      use: { viewport: { width: 1920, height: 1080 }, isMobile: false, deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    {
      command:
        'pnpm --filter @ja/site build && pnpm --filter @ja/site start --port 4173 --hostname 127.0.0.1',
      url: 'http://127.0.0.1:4173/j-aautomation/en/',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @ja/portal build && pnpm --filter @ja/portal preview',
      url: 'http://127.0.0.1:4174/j-aautomation/app/login',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'development',
        ORIGIN: 'http://127.0.0.1:4174',
        JA_DATABASE_PATH: e2eDatabasePath,
        JA_MIGRATIONS_PATH: join(root, 'migrations'),
        JA_DOCUMENT_ROOT: e2eDocumentRoot,
        JA_TENANT_ID: e2eTenantId,
        JA_DEPLOYMENT_ID: e2eDeploymentId,
        JA_OFFLINE_ENABLED: 'false',
        // The evidence matrix creates many independent real sessions against
        // one disposable IP/database. Production keeps the default limit of 10.
        JA_AUTH_RATE_LIMIT_MAX: '500',
        JA_REPORTING_LOGO_PATH: join(root, 'packages/reporting/assets/logo-jaautomation.png'),
        JA_FIXTURE_RESET_DOCUMENTS: 'false',
        JA_AUTH_SECRET: 'e2e-only-secret-do-not-use-in-production',
        JA_PUBLIC_BASE_PATH: '/j-aautomation',
        JA_PORTAL_BASE_PATH: '/j-aautomation/app',
        HOST: '127.0.0.1',
        PORT: '4174',
        ...(process.env.JA_CHROMIUM_PATH ? { JA_CHROMIUM_PATH: process.env.JA_CHROMIUM_PATH } : {}),
      },
    },
  ],
});
