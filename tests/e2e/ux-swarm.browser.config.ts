import { defineConfig } from '@playwright/test';
import base from './ux-refresh.browser.config.js';

export default defineConfig({
  ...base,
  testMatch: ['ux-swarm-*.spec.ts', 'today-invoice-quick-action.spec.ts'],
});
