import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const workerState = process.env.JA_PRODUCTION_WORKER_AUTH_STATE;

test.beforeAll(() => {
  if (!projectId || !/^[0-9a-f-]{36}$/iu.test(projectId))
    throw new Error('JA_PROD_QA_PROJECT_ID must identify the designated QA project');
});

test('owner opens the deployed calculation explanation and reloads its source totals', async ({
  page,
}) => {
  const response = await page.goto(`${base}/projects/${projectId}/calculation`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-project-calculation-page]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How this project is calculated' })).toBeVisible();
  await expect(page.locator('[data-calculation-canonical-note]')).toBeVisible();
  await expect(page.locator('[data-calculation-reconciliation]')).toBeVisible();
  await expect(page.locator('[data-calculation-person]').first()).toBeVisible();
  const width = page.viewportSize()?.width;
  if (width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    );
  await page.reload();
  await expect(page.locator('[data-project-calculation-page]')).toBeVisible();
});

test('worker cannot load private calculation terms', async ({ browser }) => {
  if (!workerState) throw new Error('JA_PRODUCTION_WORKER_AUTH_STATE is required');
  const context = await browser.newContext({ storageState: workerState });
  try {
    const page = await context.newPage();
    const response = await page.goto(`https://j-aautomation.com${base}/projects/${projectId}/calculation`);
    expect(response?.status()).toBe(403);
    await expect(page.locator('[data-project-calculation-page]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
