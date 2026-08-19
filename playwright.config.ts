import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { e2eDatabasePath, e2eDocumentRoot, e2eRoot as root } from './tests/e2e/environment';

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
    // Use a deterministic 390px viewport instead of WebKit-style device
    // emulation. This keeps the Chromium CI rehearsal stable while still
    // exercising the real mobile breakpoint and touch-sized layout.
    {
      name: 'phone-390',
      use: { viewport: { width: 390, height: 844 }, isMobile: false, deviceScaleFactor: 1 },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
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
        JA_DEMO_MODE: 'true',
        JA_AUTH_SECRET: 'e2e-only-secret-do-not-use-in-production',
        JA_PUBLIC_BASE_PATH: '/j-aautomation',
        JA_PORTAL_BASE_PATH: '/j-aautomation/app',
        HOST: '127.0.0.1',
        PORT: '4174',
      },
    },
  ],
});
