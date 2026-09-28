import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import previewConfig from '../error-warning-finance-billing/playwright.qa-preview.config';
import { scannerDeploymentId, scannerTenantId } from '../../../tests/e2e/scanner-global-setup';

const servers = previewConfig.webServer as Array<Record<string, unknown>>;
const existingLaunch = previewConfig.use?.launchOptions ?? {};
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
process.env.JA_TENANT_ID = scannerTenantId;
process.env.JA_DEPLOYMENT_ID = scannerDeploymentId;

// Dedicated disposable browser fixture: production's scanner gate is enabled,
// while the tested portal build remains the existing serialized preview output.
export default defineConfig({
  ...previewConfig,
  globalSetup: join(root, 'tests/e2e/scanner-global-setup.ts'),
  use: {
    ...previewConfig.use,
    baseURL: 'https://qa.test:4185',
    ignoreHTTPSErrors: true,
    launchOptions: {
      ...existingLaunch,
      args: [...(existingLaunch.args ?? []), '--host-resolver-rules=MAP qa.test 127.0.0.1'],
    },
  },
  webServer: [
    {
      ...servers[0],
      env: {
        ...(servers[0]?.env as Record<string, string> | undefined),
        ORIGIN: 'https://qa.test:4185',
        NODE_ENV: 'production',
        JA_MALWARE_SCANNER_REQUIRED: 'true',
        JA_TENANT_ID: scannerTenantId,
        JA_DEPLOYMENT_ID: scannerDeploymentId,
      },
    },
    {
      command: `/usr/bin/caddy run --config ${join(root, 'docs/evidence/error-warning-period-report-detail/scanner-proxy.Caddyfile')} --adapter caddyfile`,
      cwd: root,
      port: 4185,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
