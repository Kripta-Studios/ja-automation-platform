import { expect, test } from '@playwright/test';

const sessions = [
  ['technician', process.env.JA_PROD_QA_TECHNICIAN_STATE],
  ['supplier', process.env.JA_PROD_QA_SUPPLIER_STATE],
  ['worker', process.env.JA_PROD_QA_WORKER_STATE],
] as const;

test.beforeAll(() => {
  for (const [role, state] of sessions)
    if (!state) throw new Error(`An existing isolated ${role} session is required`);
});

test('restricted workforce omits unavailable global search and keeps local filters and keyboard navigation', async ({
  browser,
}, testInfo) => {
  for (const [role, storageState] of sessions) {
    const context = await browser.newContext({
      storageState,
      viewport: testInfo.project.use.viewport,
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      const posts: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      await page.goto('/j-aautomation/app/time?lang=en&q=QA');
      await page.waitForLoadState('networkidle');
      if (role === 'worker') {
        await expect(page.locator('#portal-global-search')).toBeVisible();
        await expect(page.locator('.search-results')).toBeVisible();
      } else {
        await expect(page.locator('#portal-global-search')).toHaveCount(0);
        await expect(page.locator('.search-results')).toHaveCount(0);
      }
      const localSearch = page.locator('#time-filters [name="q"]');
      await expect(localSearch).toBeVisible();
      await localSearch.fill('QA local filter only');
      await expect(localSearch).toHaveValue('QA local filter only');
      await localSearch.fill('');
      await page.keyboard.press('Control+k');
      const navigator = page.getByRole('dialog');
      await expect(navigator).toBeVisible();
      await expect(navigator.getByLabel('Find a section')).toBeFocused();
      await expect(navigator.getByRole('link').filter({ hasText: 'Help' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(navigator).not.toBeVisible();
      await expect(localSearch).toBeFocused();
      await page.getByRole('button', { name: 'Account options', exact: true }).click();
      await expect(page.getByRole('menu', { name: 'Account options', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      expect(posts).toEqual([]);
    } finally {
      await context.close();
    }
  }
});
