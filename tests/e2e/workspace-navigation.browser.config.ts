import { defineConfig } from '@playwright/test';
import base from './project-action-navigation.browser.config.js';

export default defineConfig({
  ...base,
  testMatch: 'workspace-navigation.browser.spec.ts',
  workers: 1,
  timeout: 90_000,
  projects: (base.projects ?? []).map((project) => ({
    ...project,
    testMatch: 'workspace-navigation.browser.spec.ts',
  })),
});
