import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('project manager report status options target only visible registers', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  await signIn(page, 'manager');
  await page.goto(portal('/reports?view=signoff&q='));
  await expect(page.locator('.report-period-register')).toHaveCount(0);
  const status = page.locator('.report-register-filters select[name="status"]');
  expect(
    await status
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).sort(),
      ),
  ).toEqual(['', 'needs_report', 'ready_for_signature', 'signed', 'invalid'].sort());
  await page.getByRole('tab', { name: 'Daily', exact: true }).click();
  expect(
    await status
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).sort(),
      ),
  ).toEqual(['', 'attention', 'draft', 'submitted', 'approved', 'needs_changes'].sort());
});

test('project manager ignores inapplicable reimbursement filter from a URL', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  await signIn(page, 'manager');
  await page.goto(portal('/expenses?q='));
  const rows = page.locator('[data-expense-record]');
  await expect(rows.first()).toBeVisible();
  const before = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-expense-record')),
  );
  await page.goto(portal('/expenses?reimbursement=pending&q='));
  await expect(page.locator('.expense-filters [name="reimbursement"]')).toHaveCount(0);
  await expect(page.locator('[data-filter-summary]')).not.toContainText('Reimbursement');
  await expect(page.locator('[data-filter-summary] li')).toHaveCount(0);
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-expense-record')),
    ),
  ).toEqual(before);
});
