import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone-390', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'pnpm --filter @ja/site preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/j-aautomation/en/',
    reuseExistingServer: true,
  },
});
