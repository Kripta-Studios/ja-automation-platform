import { DatabaseSync } from 'node:sqlite';
import { test, expect } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('Ledger ignores retired local filters and keeps only shared scope plus sorting and paging', async ({
  page,
}, testInfo) => {
  const database = new DatabaseSync(readE2EFixturePointer().databasePath, { readOnly: true });
  let invoiceNumber: string;
  try {
    const invoice = database
      .prepare(
        "SELECT invoice_number FROM invoice WHERE state IN ('issued','sent','paid','partially_paid','overdue') AND total_minor>0 ORDER BY id LIMIT 1",
      )
      .get();
    expect(invoice).toBeTruthy();
    invoiceNumber = String(invoice!.invoice_number);
  } finally {
    database.close();
  }
  await signIn(page, 'finance');
  await page.goto(portal(`/ledger?lang=en&q=${encodeURIComponent(invoiceNumber)}`));
  const screen = page.locator('[data-ui="collections-ledger-section"]');
  const browser = screen.locator('.record-browser');
  await expect(browser.locator('input[type="search"]')).toHaveCount(0);
  await expect(browser.locator('select')).toHaveCount(1);
  await expect(browser.getByLabel('Sort by')).toBeVisible();
  await expect(screen).toContainText(invoiceNumber);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).some((key) => key.includes(':CollectionsLedger:')),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.includes(':CollectionsLedger:'))
        sessionStorage.setItem(
          key,
          JSON.stringify({
            search: '__no_matching_invoice__',
            status: '__invalid__',
            page: 0,
            order: 'priority',
          }),
        );
    }
  });
  await page.reload();
  await expect(browser.getByRole('status')).toHaveText(/^[1-9]\d*–[1-9]\d* \/ [1-9]\d*$/);
  await expect(screen).toContainText(invoiceNumber);
  const href = await screen
    .getByRole('link', { name: 'Export CSV', exact: true })
    .getAttribute('href');
  const response = await page.request.get(new URL(href!, portal()).href);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(invoiceNumber);
  await page.screenshot({
    path: testInfo.outputPath('ledger-single-filter-scope.png'),
    fullPage: true,
  });
});
