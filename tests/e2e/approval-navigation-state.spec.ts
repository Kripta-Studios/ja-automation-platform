import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('approval domain clicks and keyboard changes replace stale URL tabs without resetting filters', async ({
  page,
}) => {
  await signIn(page, 'manager');
  await page.goto(portal('/approvals?tab=time&order=oldest'));
  const expensesTab = page.getByRole('tab', { name: /Expenses/ });
  await expensesTab.click();
  await expect(expensesTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=expenses/);
  await expect(page).toHaveURL(/order=oldest/);
  await page.reload();
  await expect(expensesTab).toHaveAttribute('aria-selected', 'true');
  await expensesTab.focus();
  await page.keyboard.press('ArrowRight');
  const reportsTab = page.getByRole('tab', { name: /Reports/ });
  await expect(reportsTab).toHaveAttribute('aria-selected', 'true');
  await expect(reportsTab).toBeFocused();
  await expect(page).toHaveURL(/tab=reports/);
  await expect(page).toHaveURL(/order=oldest/);
  await page.reload();
  await expect(reportsTab).toHaveAttribute('aria-selected', 'true');
});

test('approval filters and report actions keep the selected tab and browser position', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await signIn(page, 'owner');
  await page.goto(portal('/approvals?tab=reports'));

  const reportsTab = page.getByRole('tab', { name: /Reports/ });
  await expect(reportsTab).toHaveAttribute('aria-selected', 'true');
  const filters = page.getByRole('form', { name: 'Filter approvals' });
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(reportsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=reports/);

  const approve = page
    .locator('form[action="?/reviewReport"] button:has-text("Approve report")')
    .first();
  await expect(approve).toBeVisible();
  await approve.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => {
    (window as Window & { __approvalBrowserMarker?: string }).__approvalBrowserMarker = 'retained';
    return window.scrollY;
  });
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes('?/reviewReport'),
  );
  await approve.click();
  expect((await response).ok()).toBe(true);
  await expect(reportsTab).toHaveAttribute('aria-selected', 'true');
  expect(
    await page.evaluate(
      () => (window as Window & { __approvalBrowserMarker?: string }).__approvalBrowserMarker,
    ),
  ).toBe('retained');
  if (before > 10)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 15);

  await page.reload();
  await expect(reportsTab).toHaveAttribute('aria-selected', 'true');
});
