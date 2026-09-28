import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Owner can change the table week and keep dated drafts at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    await signIn(page, 'owner');
    await page.goto(portal('/time?lang=en'));
    await page.waitForLoadState('networkidle');

    const logTime = page.locator('button[data-time-primary-cta]');
    const buttonBox = await logTime.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(80);

    await page.getByText('Enter a week in a table', { exact: true }).click();
    const week = page.locator('[data-batch-week-picker]');
    const initial = await week.inputValue();
    const initialDate = new Date(`${initial}T00:00:00Z`);
    expect(initialDate.getUTCDay()).toBe(1);
    expect((Date.now() - initialDate.getTime()) / 86_400_000).toBeGreaterThanOrEqual(0);
    expect((Date.now() - initialDate.getTime()) / 86_400_000).toBeLessThan(7);

    await week.fill('2027-01-13');
    await expect(week).toHaveValue('2027-01-11');
    await expect(page.locator('.time-batch-row').first().locator('strong')).toHaveText(
      '2027-01-11',
    );
    await page.locator('input[name="hours_0"]').fill('7.5');
    await page.locator('input[name="summary_0"]').fill('Future work planning');

    await week.fill('2025-05-07');
    await expect(week).toHaveValue('2025-05-05');
    await expect(page.locator('.time-batch-row').first().locator('strong')).toHaveText(
      '2025-05-05',
    );

    await week.fill('2027-01-13');
    await expect(week).toHaveValue('2027-01-11');
    await expect(page.locator('input[name="hours_0"]')).toHaveValue('7.5');
    await expect(page.locator('input[name="summary_0"]')).toHaveValue('Future work planning');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  });
}

test('Owner native week-table error retains the chosen week and entered day', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-390');
  await signIn(page, 'owner');
  const nativeContext = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
  });
  try {
    const nativePage = await nativeContext.newPage();
    await nativePage.goto(portal('/time?lang=en&batch=1&week=2027-01-11'));
    const table = nativePage.locator('details.time-owner-batch');
    await expect(table).toHaveAttribute('open', '');
    await expect(table.locator('[data-batch-week-picker]')).toHaveValue('2027-01-11');

    const form = table.locator('form[action*="createTimeBatch"]');
    expect(await form.locator('select[name="workerId"] option').count()).toBeGreaterThan(1);
    expect(await form.locator('select[name="projectId"] option').count()).toBeGreaterThan(1);
    await form.locator('select[name="workerId"]').selectOption({ index: 1 });
    await form.locator('select[name="projectId"]').selectOption({ index: 1 });
    const worker = await form.locator('select[name="workerId"]').inputValue();
    const project = await form.locator('select[name="projectId"]').inputValue();
    await form.locator('input[name="hours_0"]').fill('3.5');
    await form.getByRole('button', { name: 'Save daily drafts' }).click();

    await expect(table).toHaveAttribute('open', '');
    await expect(table.locator('[data-batch-week-picker]')).toHaveValue('2027-01-11');
    await expect(form.locator('select[name="workerId"]')).toHaveValue(worker);
    await expect(form.locator('select[name="projectId"]')).toHaveValue(project);
    await expect(form.locator('input[name="hours_0"]')).toHaveValue('3.5');
    await expect(table.locator('[data-time-batch-problem]')).toBeVisible();
  } finally {
    await nativeContext.close();
  }
});
