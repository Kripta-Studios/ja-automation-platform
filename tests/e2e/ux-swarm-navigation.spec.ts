import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('owner can reach invoice creation before the financial dashboard', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/?lang=en'), { waitUntil: 'networkidle' });
  const actions = page.locator('.dashboard-quick-actions');
  const invoice = actions.locator('[data-dashboard-invoice-draft]');
  await expect(invoice).toBeVisible();
  const actionBounds = await actions.boundingBox();
  const financialBounds = await page.locator('[data-owner-finance]').boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(financialBounds).not.toBeNull();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(financialBounds!.y);
  expect((await invoice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await invoice.click();
  await expect(page.locator('[data-invoice-composer]')).toBeVisible();
});

test('finance opens compensation settings through keyboard search with its deep link', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'finance');
  await page.goto(portal('/billing?lang=en'), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Go to section/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Go to section', exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog
      .locator('.section-settings')
      .getByRole('link', { name: 'Configure billing', exact: true }),
  ).toBeVisible();
  await dialog.locator('input').fill('Worker compensation');
  await expect(dialog.locator('.section-result')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(dialog.locator('.section-result')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('task') === 'Worker compensation');
  expect(new URL(page.url()).hash).toBe('#finance-worker-compensation');
  await expect(page.locator('#finance-worker-compensation')).toBeVisible();
  await expect(page.locator('#finance-comp-worker')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const role of ['worker', 'manager', 'auditor'] as const) {
  test(`${role} navigation keeps financial configuration out of search`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(portal('/profile?lang=en'), { waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: /Go to section/ });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Go to section', exact: true });
    await expect(dialog.locator('a[href*="view=setup"],a[href*="view=commercial"]')).toHaveCount(0);
    await dialog.locator('input').fill('Worker compensation');
    await expect(dialog.locator('.section-result')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
}
