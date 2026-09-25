import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import workspaceConfig from '../../../playwright.config';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const servers = workspaceConfig.webServer as NonNullable<typeof workspaceConfig.webServer> &
  Array<Record<string, unknown>>;

// Preview a serialized candidate build on a dedicated QA port.
export default defineConfig({
  ...workspaceConfig,
  testDir: join(root, 'tests/e2e'),
  globalSetup: join(root, 'tests/e2e/global-setup.ts'),
  use: { ...workspaceConfig.use, baseURL: 'http://127.0.0.1:4184' },
  webServer: [
    {
      ...servers[1],
      cwd: root,
      command: 'pnpm --filter @ja/portal preview',
      url: 'http://127.0.0.1:4184/j-aautomation/app/login',
      env: {
        ...servers[1]?.env,
        ORIGIN: 'http://127.0.0.1:4184',
        PORT: '4184',
      },
    },
  ],
});
