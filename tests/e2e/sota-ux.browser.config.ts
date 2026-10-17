import { defineConfig } from '@playwright/test';
import base from './ux-refresh.browser.config.js';

export default defineConfig({
  ...base,
  testMatch: ['sota-*.spec.ts'],
});
