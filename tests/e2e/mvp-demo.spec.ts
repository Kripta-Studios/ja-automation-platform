import { expect, test } from '@playwright/test';

const path = (value: string) => `/j-aautomation/app${value}`;

test('critical MVP demo surfaces render without runtime errors', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('requestfailed', (request) =>
    browserErrors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`),
  );
  await page.goto(path('/login'));
  await expect(
    page.getByRole('heading', { name: 'Field work, reports and project records.' }),
  ).toBeVisible();

  if (testInfo.project.name === 'worker-phone-390') {
    await page.getByRole('button', { name: 'Open worker demo' }).click();
    await expect(page).toHaveURL(path(''));
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('TODAY / 10 H EXPECTED')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('worker-today-390.png'), fullPage: true });
    for (const [route, heading, shot] of [
      ['/time', 'Time entries', 'worker-time-390.png'],
      ['/reports', 'Daily and technical reports', 'worker-reports-390.png'],
      ['/expenses', 'Expenses and receipts', 'worker-expense-390.png'],
    ] as const) {
      await page.goto(path(route));
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(
        page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth + 1),
      ).resolves.toBeTruthy();
      await page.screenshot({ path: testInfo.outputPath(shot), fullPage: true });
    }
  } else {
    await page.getByRole('button', { name: 'Open admin demo' }).click();
    await expect(page).toHaveURL(path(''));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Work in motion' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`admin-dashboard-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.getByRole('link', { name: /Body Shop Line 4/ }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Body Shop Line 4/ })).toBeVisible();
    await expect(page.getByText('CONTRIBUTION MARGIN')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`project-detail-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.goto(path('/billing'));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Billing streams' })).toBeVisible();
    await page.getByRole('link', { name: 'Preview' }).first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('DEMONSTRATION · NOT FOR PAYMENT')).toBeVisible();
    await expect(page.getByText('Separate billing treatment')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`invoice-preview-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await expect(
      page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth + 1),
    ).resolves.toBeTruthy();
  }
  expect(browserErrors).toEqual([]);
});

test('worker can record time, a daily report and a receipt expense', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'worker-phone-390');
  await page.goto(path('/login'));
  await page.getByRole('button', { name: 'Open worker demo' }).click();
  await page.goto(path('/time'));
  await page.locator('select[name="projectId"]').selectOption({ index: 1 });
  await page.locator('input[name="workDate"]').fill('2026-08-18');
  await page.locator('select[name="category"]').selectOption('commissioning');
  await page.locator('input[name="minutes"]').fill('30');
  await page
    .locator('textarea[name="summary"]')
    .fill('Demo run: verified station permissives after sensor adjustment.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Time draft saved')).toBeVisible();

  await page.goto(path('/reports'));
  const daily = page.locator('form[action="?/createDailyReport"]');
  await daily.locator('select[name="projectId"]').selectOption({ index: 1 });
  await daily.locator('input[name="workDate"]').fill('2026-08-18');
  await daily.locator('input[name="siteShift"]').fill('Line 4 · first shift');
  await daily
    .locator('textarea[name="summary"]')
    .fill('Demo shift report for the company walkthrough.');
  await daily
    .locator('textarea[name="tasksCompleted"]')
    .fill('Validated the station sequence and recorded the final state.');
  await daily.getByRole('button', { name: 'Save daily report' }).click();
  await expect(page.getByText('Daily report draft saved')).toBeVisible();

  await page.goto(path('/expenses'));
  const expense = page.locator('form[action="?/createExpense"]');
  await expense.locator('select[name="projectId"]').selectOption({ index: 1 });
  await expense.locator('input[name="spentOn"]').fill('2026-08-18');
  await expense.locator('input[name="vendor"]').fill('Demo Field Supply');
  await expense.locator('input[name="amount"]').fill('24.50');
  await expense
    .locator('textarea[name="description"]')
    .fill('Synthetic receipt used to verify the MVP upload flow.');
  await expense.locator('select[name="clientTreatment"]').selectOption('reimbursable');
  await expense.locator('input[name="receipt"]').setInputFiles({
    name: 'demo-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('demo receipt'),
  });
  await expense.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Expense draft saved')).toBeVisible();
});
