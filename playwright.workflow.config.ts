import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: [
    'guided-recovery.spec.ts',
    'guided-management-contact.spec.ts',
    'finance-guided-recovery.browser.spec.ts',
    'project-client-workflow.spec.ts',
    'assistant-panel-stacking.spec.ts',
    'published-assignment-filter.spec.ts',
    'time-project-worker-filter.spec.ts',
  ],
  webServer: (Array.isArray(base.webServer) ? base.webServer : [base.webServer!])
    .filter((server) => server.url?.includes('4174'))
    .map((server) => ({
      ...server,
      ...(process.env.JA_WORKFLOW_PREBUILT === '1'
        ? { command: 'pnpm --filter @ja/portal preview' }
        : {}),
      timeout: 600_000,
      env: { ...server.env, NODE_OPTIONS: '--max-old-space-size=2048', RAYON_NUM_THREADS: '2' },
    })),
  projects: base.projects?.filter((project) =>
    ['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(project.name!),
  ),
  reporter: [['list'], ['json', { outputFile: '/tmp/ja-workflow-browser-results.json' }]],
});
