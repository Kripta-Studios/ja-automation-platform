import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer!];
const portal = servers.find((server) => server.url?.includes('4174'))!;
export default defineConfig({
  ...base,
  testMatch: ['digital-workers.spec.ts', 'digital-workers-accessibility.spec.ts'],
  outputDir: 'artifacts/digital-workers-browser',
  reporter: [['list'], ['json', { outputFile: 'artifacts/digital-workers-results.json' }]],
  use: { ...base.use, actionTimeout: 15000, baseURL: 'http://127.0.0.1:5174/j-aautomation/app' },
  projects: base.projects
    ?.filter((project) =>
      ['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(project.name!),
    )
    .map((project) => ({
      ...project,
      testIgnore: project.name === 'desktop' ? [] : ['**/digital-workers-accessibility.spec.ts'],
    })),
  webServer: [
    {
      ...portal,
      url: 'http://127.0.0.1:5174/j-aautomation/app/login',
      env: { ...portal.env, ORIGIN: 'http://127.0.0.1:5174', PORT: '5174' },
      reuseExistingServer: false,
    },
  ],
});
