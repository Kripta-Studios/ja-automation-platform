import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

async function checkControls(page: Page, selector: string) {
  const controls = page.locator(selector);
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
}

test('Finance compares included and recoverable expenses without changing actual work', async ({
  page,
}) => {
  await signIn(page, 'finance');
  await page.goto(portal('/finance/preview?lang=en'));
  await expect(
    page.getByRole('heading', { name: 'Commercial agreement and example', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: 'Actual work (hours)', exact: true }),
  ).toHaveValue('8');
  await checkControls(
    page,
    '.agreement-page input, .agreement-page select, .agreement-page button',
  );
  await page.getByRole('button', { name: 'Calculate example', exact: true }).click();
  const result = page
    .locator('.facts')
    .filter({ has: page.getByText('Direct contribution', { exact: true }) });
  await expect(result).toContainText('250.00');
  await page.getByLabel('Expense responsibility', { exact: true }).selectOption('recoverable');
  await page.getByRole('button', { name: 'Calculate example', exact: true }).click();
  await expect(result).toContainText('440.00');
  await page.screenshot({ path: test.info().outputPath('commercial-example.png'), fullPage: true });
  await expect(
    page.getByRole('spinbutton', { name: 'Actual work (hours)', exact: true }),
  ).toHaveValue('8');
  await page.getByLabel('Expense responsibility', { exact: true }).selectOption('customer_direct');
  await page.getByRole('button', { name: 'Calculate example', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Review the entered values');
  await expect(
    page.getByRole('spinbutton', { name: 'Customer hourly rate', exact: true }),
  ).toHaveValue('120');
  await expect(page.getByLabel('Expense responsibility', { exact: true })).toHaveValue(
    'customer_direct',
  );
});

test('Finance opens the localized cash calendar and retains date filters', async ({ page }) => {
  await signIn(page, 'finance');
  await page.goto(portal('/finance/cash?lang=es'));
  await expect(
    page.getByRole('heading', { name: 'Calendario de caja', exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('No es un saldo bancario.', { exact: false })).toBeVisible();
  await page.getByLabel('Desde', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-09-30');
  await page.getByRole('combobox', { name: 'Agrupar por', exact: true }).selectOption('month');
  await checkControls(page, '.cash-page input, .cash-page select, .cash-page button');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await page.screenshot({ path: test.info().outputPath('cash-calendar.png'), fullPage: true });
  await expect(page.getByLabel('Desde', { exact: true })).toHaveValue('2026-09-01');
  await expect(page.getByRole('combobox', { name: 'Agrupar por', exact: true })).toHaveValue(
    'month',
  );
  await expect(
    page.getByRole('heading', { name: 'Calendario de caja', exact: true }).first(),
  ).toBeVisible();
});

test('Worker cannot open commercial calculations or private cash', async ({ page }) => {
  await signIn(page, 'worker');
  for (const path of ['/finance/preview', '/finance/cash']) {
    const response = await page.request.get(portal(path));
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain('Loaded hourly cost');
  }
});
