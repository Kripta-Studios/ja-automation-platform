import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const widths = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer];

export default defineConfig({
  ...base,
  // These real-login, multi-step journeys also run during browser swarm QA on
  // the production VPS. Keep a bounded budget without relaxing assertions.
  timeout: 60_000,
  testMatch: ['navigation-assistant.spec.ts', 'navigation-assistant-profiles.spec.ts'],
  projects: base.projects?.filter((project) => widths.has(project.name ?? '')),
  webServer: servers.filter((server) => server?.url?.includes(':4174/')),
  outputDir: 'docs/evidence/navigation-assistant-20261007/browser-artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/evidence/navigation-assistant-20261007/playwright-results.json' }],
    ['html', { outputFolder: 'docs/evidence/navigation-assistant-20261007/report', open: 'never' }],
  ],
});
