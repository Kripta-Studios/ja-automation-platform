import { test, expect } from '@playwright/test';
import { signIn, portal } from './auth.js';

test('Owner creates a client with email and blank optional contact name', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await page.getByRole('button', { name: 'New Client', exact: true }).click();
  const form = page.locator('form[action="?/createClient"]');
  await form.locator('[name=legalName]').fill(`UX client ${info.project.name}`);
  await form.locator('[name=displayName]').fill(`UX client ${info.project.name}`);
  await form.locator('[name=billingEmail]').fill('billing@example.test');
  await form.locator('[name=billingAddress]').fill('123 Test Street, Madrid');
  await form.getByRole('button', { name: 'Create client', exact: true }).click();
  await expect(page.locator('[data-ui=toast][data-variant=success]')).toBeVisible();
});

test('Expense defaults are valid without touching currency', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/expenses?lang=en'));
  await page.getByRole('button', { name: 'Record expense', exact: true }).click();
  const form = page.locator('form[action="?/createExpense"]');
  const currency = form.locator('select[name=currency]');
  await expect(currency).toHaveValue('USD');
  expect(await currency.evaluate((select: HTMLSelectElement) => select.validity.valid)).toBe(true);
  expect(
    await currency.evaluate((select: HTMLSelectElement) =>
      new FormData(select.form!).get('currency'),
    ),
  ).toBe('USD');
});

test('Secondary screens keep navigation and Back restores the approval queue', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/approvals?lang=en'));
  const open = page.getByRole('link', { name: /Open record/ }).first();
  if (await open.count()) {
    await open.click();
    await expect(page.locator('.portal-layout > aside')).toHaveCount(1);
    await page.locator('.workspace-back').click();
    await expect(page).toHaveURL(/\/approvals\?lang=en/);
  }
  for (const path of ['/help?lang=en', '/finance/cash?lang=en', '/finance/preview?lang=en']) {
    await page.goto(portal(path));
    await expect(page.locator('.portal-layout > aside')).toHaveCount(1);
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('Registers paginate and finance configuration presents a chosen action', async ({ page }) => {
  await signIn(page, 'owner');
  for (const path of [
    '/projects?lang=en',
    '/billing?lang=en',
    '/ledger?lang=en',
    '/accounting?lang=en',
  ]) {
    await page.goto(portal(path));
    await expect(page.locator('.record-browser').first()).toBeVisible();
    await expect(page.locator('.record-browser__pages').first()).toBeVisible();
  }
  await page.goto(portal('/finance?view=commercial&lang=en'));
  const actions = page.getByRole('navigation', { name: 'Finance configuration', exact: true });
  await expect(actions).toBeVisible();
  await actions.getByRole('button', { name: 'Internal loaded cost', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Internal loaded cost', exact: true }),
  ).toBeVisible();
});
