import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('owner sees explicit non-destructive client/project lifecycle controls', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects'));
  await expect(page.locator("[data-action='transitionClient']")).toHaveCount(1);
  await expect(page.locator("[data-action='transitionProject']")).toHaveCount(1);
  await expect(page.getByRole('button', { name: /archive|restore|close/i }).first()).toBeVisible();
});

test('report detail exposes delete-draft rather than legacy hard delete', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/reports'));
  const reportLink = page.locator('a[href*="/app/reports/"]').first();
  await expect(reportLink).toBeVisible();
  await reportLink.click();
  await expect(
    page.locator("[data-action='deleteDraft'][data-record-type][data-record-id]"),
  ).toBeVisible();
  await expect(page.locator('form[action*="deleteReport"]')).toHaveCount(0);
});
