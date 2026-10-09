import { defineConfig } from '@playwright/test';
import base from './project-action-navigation.browser.config.js';

export default defineConfig({
  ...base,
  testMatch: 'invoice-number-navigation.browser.spec.ts',
  timeout: 180_000,
  projects: base.projects?.map((project) => ({
    ...project,
    testMatch: 'invoice-number-navigation.browser.spec.ts',
  })),
});
