import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test.describe.configure({ timeout: 90_000 });

function runtimeErrors(
  page: import('@playwright/test').Page,
  includeConsoleErrors = true,
): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (includeConsoleErrors && message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('ledger navigation keeps the register reachable while advanced filters stay optional', async ({
  page,
}) => {
  const errors = runtimeErrors(page);
  await signIn(page, 'finance');
  await page.goto(portal('/ledger?lang=en'), { waitUntil: 'networkidle' });

  await expect(page.getByRole('link', { name: 'Review invoice register' })).toBeVisible();
  await expect(page.locator('[data-ledger-result-count]')).toContainText('authorized ledger rows');
  await expect(page.locator('.collections-ledger__advanced')).not.toHaveAttribute('open', '');

  const advanced = page.locator('.collections-ledger__advanced');
  await advanced.locator('summary').click();
  await expect(advanced.locator('select')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clear filters', exact: true })).toBeVisible();
  const project = advanced.locator('select[name="project"]');
  await expect(project).toBeVisible();
  const projectId = await project.locator('option').nth(1).getAttribute('value');
  expect(projectId).toBeTruthy();
  await project.selectOption(projectId!);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('project') === projectId);
  await expect(page.locator('.collections-ledger__filter-chip')).toContainText('Project');
  await expect(page.locator('.collections-ledger__filter-chip').first()).toHaveAttribute(
    'href',
    /#collections-ledger-register$/u,
  );

  const cardAction = page
    .locator('#collections-ledger-register [data-table-region-cards] [data-card-action]')
    .first();
  await expect(cardAction).toHaveAttribute('aria-label', /Open invoice/u);
  await expect(page.locator('.collections-ledger__empty-actions')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('auditor accounting keeps the compact register and source review path', async ({ page }) => {
  const errors = runtimeErrors(page);
  await signIn(page, 'auditor');
  await page.goto(portal('/accounting?lang=en'), { waitUntil: 'networkidle' });

  const summary = page.locator('.accounting-section__attention');
  await expect(summary.getByRole('button')).toHaveCount(4);
  await expect(page.locator('[data-accounting-register-summary]')).toContainText(
    'accounting packs',
  );
  const stateButtons = summary.getByRole('button');
  const stateCounts = await stateButtons.locator('strong').allTextContents();
  const emptyStateIndex = stateCounts.findIndex((count) => count.trim() === '0');
  if (emptyStateIndex >= 0) {
    await stateButtons.nth(emptyStateIndex).click();
    await expect(page.locator('.accounting-section__empty')).toContainText('Review source records');
    await expect(
      page.locator('.accounting-section__empty-actions').getByRole('link', {
        name: 'Review invoice and collection ledger',
      }),
    ).toHaveAttribute('href', /\/app\/ledger\?lang=en#collections-ledger-register$/u);
  }
  await expect(page.locator('#accounting-generate')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('failed login credentials remain inline and focus the correction field', async ({ page }) => {
  // The rejected credential request is an expected 401 in this scenario; page
  // errors remain fatal while network-console noise is deliberately ignored.
  const errors = runtimeErrors(page, false);
  await page.goto(portal('/login?lang=en'), { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill('finance@demo.jaautomation.test');
  await page.getByLabel('Password').fill('incorrect-password-for-ux-test');
  await page.getByRole('button', { name: 'Continue to workspace' }).click();

  await expect(page.locator('.login-status')).toContainText('could not verify');
  await expect(page.getByRole('button', { name: 'Review credentials' })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review credentials' }).click();
  await expect(page.getByLabel('Password')).toBeFocused();
  expect(errors).toEqual([]);
});

test('login service failures keep recovery guidance separate from credential errors', async ({
  page,
}) => {
  const errors = runtimeErrors(page, false);
  await page.route('**/app/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporary_auth_failure' }),
    }),
  );
  await page.goto(portal('/login?lang=en'), { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill('finance@demo.jaautomation.test');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Continue to workspace' }).click();

  await expect(page.locator('.login-status')).toContainText(
    'secure sign-in service is unavailable',
  );
  await expect(page.getByRole('button', { name: 'Review credentials' })).toHaveCount(0);
  await expect(page.getByLabel('Password')).not.toHaveAttribute('aria-invalid', 'true');
  expect(errors).toEqual([]);
});

test('section navigator exposes a labelled mobile trigger and returns focus after search', async ({
  page,
}) => {
  const errors = runtimeErrors(page);
  await signIn(page, 'finance');
  await page.goto(portal('/ledger?lang=en'), { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: /Go to section/u });
  await expect(trigger).toBeVisible();
  await expect(trigger.locator('.section-trigger-label')).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Go to section' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.section-result-count')).toContainText('sections available');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
