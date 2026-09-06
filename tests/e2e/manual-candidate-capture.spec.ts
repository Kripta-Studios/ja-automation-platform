import { test } from '@playwright/test';
import { e2eCredentials } from './auth.js';
import { e2eFixtureToken } from './environment.js';

test('captures the frozen synthetic worker and owner manual screens', async ({
  page: _page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(testInfo.project.name !== 'desktop', 'One canonical capture is sufficient.');
  process.env.JA_FIXTURE_SENTINEL = e2eFixtureToken;
  process.env.JA_CAPTURE_BASE_URL = 'http://127.0.0.1:4174/j-aautomation';
  process.env.JA_CAPTURE_OWNER_EMAIL = e2eCredentials.owner.email;
  process.env.JA_CAPTURE_OWNER_PASSWORD = e2eCredentials.owner.password;
  process.env.JA_CAPTURE_WORKER_EMAIL = e2eCredentials.worker.email;
  process.env.JA_CAPTURE_WORKER_PASSWORD = e2eCredentials.worker.password;

  const { main } = await import('../../scripts/capture-manual-screenshots.js');
  await main();
});
