import { defineConfig } from '@playwright/test';
import base from './project-action-navigation.browser.config.js';

export default defineConfig({
  ...base,
  testMatch: 'project-site-contact.browser.spec.ts',
  workers: 1,
  timeout: 120_000,
  projects: (base.projects ?? []).map((project) => ({
    ...project,
    testMatch: 'project-site-contact.browser.spec.ts',
  })),
});
