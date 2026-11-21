import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test.describe('auditor read-only views before hydration', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  test('opens the expense overview without capture instructions', async ({ browser, page }) => {
    await signIn(page, 'auditor');
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    try {
      const reader = await context.newPage();
      await reader.goto(portal('/expenses?lang=en'));
      await expect(reader.getByRole('heading', { name: 'Expenses overview' })).toBeVisible();
      await expect(reader.getByRole('heading', { name: 'My expenses' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('opens billing settings from both the workspace view and its legacy link', async ({
    browser,
    page,
  }) => {
    await signIn(page, 'auditor');
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    try {
      const reader = await context.newPage();
      for (const query of ['view=streams', 'tab=settings']) {
        await reader.goto(portal(`/billing?${query}&lang=en`));
        await expect(
          reader.getByRole('tab', { name: 'Per-project settings', selected: true }),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test('falls back to invoices when an auditor opens a billing configuration link', async ({
    browser,
    page,
  }) => {
    await signIn(page, 'auditor');
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    try {
      const reader = await context.newPage();
      for (const view of [reader, page]) {
        await view.goto(portal('/billing?view=setup&lang=en'));
        await view.waitForLoadState('networkidle');
        await expect(view.getByRole('tab', { name: 'Invoices', selected: true })).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test('keeps an explicit tab change after opening billing settings from a link', async ({ page }) => {
    await signIn(page, 'auditor');
    for (const query of ['view=streams', 'tab=settings']) {
      await page.goto(portal(`/billing?${query}&lang=en`));
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('tab', { name: 'Per-project settings', selected: true }),
      ).toBeVisible();

      await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Invoices', selected: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('tab', { name: 'Invoices', selected: true })).toBeVisible();
    }
  });
});
