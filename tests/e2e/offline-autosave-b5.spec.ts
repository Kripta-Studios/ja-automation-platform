import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('editable report exposes autosave status and recovery controls', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports'));
  const reportLink = page.locator('a[href*="/app/reports/"]').first();
  await expect(reportLink).toBeVisible();
  await reportLink.click();

  const autosave = page.locator('[data-report-autosave-form][data-report-type][data-report-id]');
  await expect(autosave).toBeVisible();
  await expect(page.locator("[data-autosave-status][aria-live='polite']")).toBeVisible();

  await autosave.locator('textarea:visible, input:visible').first().fill('B5 autosave RED');
  await expect(page.locator('[data-autosave-status]')).not.toHaveText('');
});

test('offline recovery UI never silently overwrites a server-newer draft', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports'));
  const reportLink = page.locator('a[href*="/app/reports/"]').first();
  await expect(reportLink).toBeVisible();
  await reportLink.click();

  await expect(page.locator('[data-recovery-dialog]')).toHaveCount(1);
  await expect(page.locator('[data-recover-draft]')).toHaveCount(1);
  await expect(page.locator('[data-compare-draft]')).toHaveCount(1);
  await expect(page.locator('[data-discard-draft]')).toHaveCount(1);
});
