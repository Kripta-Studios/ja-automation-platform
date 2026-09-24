import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const statePath = process.env.JA_PROD_QA_LIFECYCLE_STATE;
const financeState = process.env.JA_PRODUCTION_FINANCE_AUTH_STATE;

test.use({ storageState: financeState ?? '' });
test.skip(!statePath || !financeState, 'Designated QA project and Finance test session required');

test('QA project setup remains usable at iPhone and iPad WebKit sizes', async ({
  page,
}, testInfo) => {
  test.skip(!['iphone-webkit-390', 'ipad-webkit-768'].includes(testInfo.project.name));
  const state = JSON.parse(readFileSync(statePath!, 'utf8')) as {
    projectId?: string;
    marker?: string;
  };
  if (!state.projectId || !state.marker) throw new Error('The designated QA project is required');
  const response = await page.goto(
    `/j-aautomation/app/projects/${state.projectId}?tab=billing&lang=en`,
  );
  expect(response?.status()).toBe(200);
  await expect(page.locator('main')).toContainText(state.marker);
  const setup = page.getByRole('region', { name: 'Project billing setup' });
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('button', { name: 'Continue' })).toBeVisible();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('A device viewport is required');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  await page.reload();
  await expect(setup).toBeVisible();
});
