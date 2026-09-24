import { defineConfig } from '@playwright/test';

const origin = process.env.JA_PRODUCTION_ACCEPTANCE_ORIGIN;
const ownerState = process.env.JA_PRODUCTION_OWNER_AUTH_STATE;

if (!origin || !/^https:\/\/[^/]+$/u.test(origin))
  throw new Error('JA_PRODUCTION_ACCEPTANCE_ORIGIN must be an HTTPS origin');
if (!ownerState)
  throw new Error('JA_PRODUCTION_OWNER_AUTH_STATE must point to an existing owner browser state');

/**
 * Deliberately separate from playwright.config.ts: no fixture reset, local server,
 * synthetic tenant, or development auth secret may be pointed at production.
 */
export default defineConfig({
  testDir: 'tests/production',
  workers: 1,
  retries: 0,
  use: {
    baseURL: origin,
    storageState: ownerState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
  projects: [
    { name: 'phone-360', use: { viewport: { width: 360, height: 800 } } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'iphone-touch-390',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'ipad-touch-768',
      use: {
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'iphone-webkit-390',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'ipad-webkit-768',
      use: {
        browserName: 'webkit',
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
