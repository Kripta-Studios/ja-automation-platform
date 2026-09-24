import { expect, test } from '@playwright/test';

test.describe('deployed clean-slate operational views', () => {
  test.skip(process.env.JA_PRODUCTION_CLEAN_SLATE !== '1', 'Run only after the reviewed clean-slate cutover');

  test('owner can open empty time, expenses, reports, finance and billing views', async ({ page }) => {
    const views = [
      ['/j-aautomation/app/time?lang=en', '0 Records'],
      ['/j-aautomation/app/expenses?lang=en', 'No expenses recorded.'],
      ['/j-aautomation/app/reports?lang=en', 'No daily reports recorded.'],
      ['/j-aautomation/app/finance?lang=en', 'Finance records loaded'],
      ['/j-aautomation/app/billing?lang=en', 'No invoices match this view.'],
    ] as const;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    for (const [url, expected] of views) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main'), url).toContainText(expected);
      await expect(page.locator('main'), url).not.toContainText('Internal Server Error');
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main'), `${url} after reload`).toContainText(expected);
      const width = page.viewportSize()?.width;
      if (width) expect(await page.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(width + 1);
    }
    expect(pageErrors).toEqual([]);
  });
});
