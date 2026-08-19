import { defineConfig, devices } from '@playwright/test';

// Archived compatibility runner for the original demo screenshots. The active production gate is
// `playwright.config.ts`; this file is retained only for historical reproducibility.

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'mvp-demo.spec.ts',
  outputDir: 'test-results/mvp-demo',
  reporter: [['list']],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'worker-phone-390',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    { name: 'admin-tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'admin-desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
