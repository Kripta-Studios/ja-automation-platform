import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('dashboard invoice CTA opens the global composer without choosing an arbitrary project', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'phone-390',
    'The quick-action role journey is represented at the required 390px viewport.',
  );

  await signIn(page, 'owner');
  const projectPath = await page
    .locator('.dashboard-projects a.project-board-row')
    .first()
    .getAttribute('href');
  expect(projectPath).toBeTruthy();
  const invoiceAction = page.locator('[data-dashboard-invoice-draft]');
  await expect(invoiceAction).toBeVisible();
  const destination = new URL((await invoiceAction.getAttribute('href'))!, page.url());
  expect(destination.pathname).toBe(new URL(portal('/billing')).pathname);
  expect(destination.searchParams.get('assistantSurface')).toBe('invoice-create');
  expect(destination.searchParams.has('project')).toBe(false);
  expect(destination.searchParams.has('tab')).toBe(false);

  await invoiceAction.click();
  const composer = page.locator('[data-invoice-composer]');
  await expect(composer).toBeVisible();
  await expect(composer.locator('.composer-stream-field select')).toBeVisible();
  await expect(composer.locator('input[type="date"]')).toHaveCount(2);

  // Finance can open the same authorized creation surface directly.
  await page.context().clearCookies();
  await signIn(page, 'finance');
  await page.goto(`${portal('/billing')}?assistantSurface=invoice-create&lang=en`);
  await expect(composer).toBeVisible();

  // Retain the existing project-tab authorization checks alongside the new CTA.
  const projectUrl = new URL(projectPath!, portal('/'));
  projectUrl.searchParams.set('tab', 'unexpected');
  await page.goto(projectUrl.toString());
  await expect(page.locator('#project-tab-billing')).toHaveAttribute('aria-selected', 'false');
  projectUrl.searchParams.set('tab', 'billing');
  await page.goto(projectUrl.toString());
  await expect(page.locator('[data-project-detail]')).toHaveAttribute('data-role', 'finance_admin');
  await expect(page.locator('#project-panel-billing')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create invoice draft', exact: true }),
  ).toBeVisible();

  // Operational roles receive no invoice creation shortcut or surface.
  await page.context().clearCookies();
  await signIn(page, 'worker');
  await expect(page.locator('[data-dashboard-invoice-draft]')).toHaveCount(0);
  await page.goto(`${portal('/billing')}?assistantSurface=invoice-create&lang=en`);
  await expect(composer).toHaveCount(0);
  await page.goto(projectUrl.toString());
  await expect(page.locator('#project-tab-billing')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create invoice draft', exact: true })).toHaveCount(
    0,
  );
});
