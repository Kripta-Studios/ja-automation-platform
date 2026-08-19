import { expect, test } from '@playwright/test';

const portal = (value: string) => `http://127.0.0.1:4174/j-aautomation/app${value}`;

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const result = await page.evaluate(() => {
    const offenders = [...document.querySelectorAll<HTMLElement>('*')]
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter(({ right }) => right > innerWidth + 1)
      .slice(-12);
    return {
      innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      offenders,
      layout: [
        ...document.querySelectorAll<HTMLElement>(
          '.portal-layout > main, .worker-form, .entry-panel, .record-list, .record-card',
        ),
      ]
        .map((element) => ({
          className: element.className,
          width: Math.round(element.getBoundingClientRect().width),
          right: Math.round(element.getBoundingClientRect().right),
          display: getComputedStyle(element).display,
          gridTemplateColumns: getComputedStyle(element).gridTemplateColumns,
        }))
        .filter(({ right }) => right > innerWidth + 1),
    };
  });
  if (result.bodyScrollWidth > result.innerWidth + 1)
    console.log(`[horizontal-overflow] ${JSON.stringify(result)}`);
  expect(result.bodyScrollWidth).toBeLessThanOrEqual(result.innerWidth + 1);
}

test('critical portal surfaces render without runtime errors', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('requestfailed', (request) =>
    browserErrors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`),
  );
  await page.goto(portal('/login'), { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('heading', { name: 'Everything in the field, clearly in view.' }),
  ).toBeVisible();

  if (testInfo.project.name === 'phone-390') {
    await page.getByRole('button', { name: 'Field worker' }).click();
    await expect(page).toHaveURL(portal(''));
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('TODAY / 10 H EXPECTED')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('worker-today-390.png'), fullPage: true });
    for (const [route, heading, shot] of [
      ['/time', 'Time entries', 'worker-time-390.png'],
      ['/reports', 'Daily and technical reports', 'worker-reports-390.png'],
      ['/expenses', 'Expenses and receipts', 'worker-expense-390.png'],
    ] as const) {
      await page.goto(portal(route));
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(shot), fullPage: true });
    }
  } else {
    await page.getByRole('button', { name: 'Admin view' }).click();
    await expect(page).toHaveURL(portal(''));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Field operations overview' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`admin-dashboard-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.goto(portal('/?q=Body%20Shop'));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
    await expect(page.getByText(/Body Shop Line 4/).first()).toBeVisible();
    await page.locator('a.search-result').filter({ hasText: 'Body Shop Line 4' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Body Shop Line 4/ })).toBeVisible();
    await expect(page.getByText('CONTRIBUTION MARGIN')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`project-detail-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.goto(portal('/billing'));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Billing streams' })).toBeVisible();
    await page.getByRole('link', { name: 'Preview' }).first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Separate billing treatment')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`invoice-preview-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page);
  }
  expect(browserErrors).toEqual([]);
});

test('worker can record time, a daily report and a receipt expense', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390');
  await page.goto(portal('/login'));
  await page.getByRole('button', { name: 'Field worker' }).click();
  await expect(page).toHaveURL(portal(''));
  await page.goto(portal('/time'));
  await page.locator('select[name="projectId"]').selectOption({ index: 1 });
  await page.locator('input[name="workDate"]').fill('2026-08-18');
  await page.locator('select[name="category"]').selectOption('commissioning');
  await page.locator('input[name="minutes"]').fill('30');
  await page
    .locator('textarea[name="summary"]')
    .fill('Demo run: verified station permissives after sensor adjustment.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Time draft saved')).toBeVisible();

  await page.goto(portal('/reports'));
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

  await page.goto(portal('/expenses'));
  const expense = page.locator('form[action="?/createExpense"]');
  await expense.locator('select[name="projectId"]').selectOption({ index: 1 });
  await expense.locator('input[name="spentOn"]').fill('2026-08-18');
  await expense.locator('input[name="vendor"]').fill('Demo Field Supply');
  await expense.locator('input[name="amount"]').fill('24.50');
  await expense
    .locator('textarea[name="description"]')
    .fill('Synthetic receipt used to verify the test-only upload flow.');
  await expense.locator('select[name="clientTreatment"]').selectOption('reimbursable');
  await expense.locator('input[name="receipt"]').setInputFiles({
    name: 'demo-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expense.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Expense draft saved')).toBeVisible();
});

test('worker can create an offline time draft and sync it once online', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto(portal('/login'));
  await page.getByRole('button', { name: 'Field worker' }).click();
  await expect(page).toHaveURL(portal(''));
  await page.goto(portal('/time'));
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.context().setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  const time = page.locator('form[action="?/createTime"]');
  await time.locator('select[name="projectId"]').selectOption({ index: 1 });
  await time.locator('input[name="workDate"]').fill('2026-08-19');
  await time.locator('select[name="category"]').selectOption('regular');
  await time.locator('input[name="minutes"]').fill('45');
  await time
    .locator('textarea[name="summary"]')
    .fill('Offline field draft for reconnect verification.');
  await time.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Offline — saved on this device')).toBeVisible();
  await expect(page.getByText(/1 queued/)).toBeVisible();
  await page.context().setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByText(/1 synced/)).toBeVisible({ timeout: 15_000 });
});
