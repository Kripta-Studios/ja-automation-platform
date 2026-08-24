import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'apps/portal/src/lib/i18n/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: { reporter: ['text', 'json'] },
  },
  resolve: {
    alias: {
      $lib: resolve(process.cwd(), 'apps/portal/src/lib'),
    },
  },
});
