import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

for (const [path, filterClass, rowSelector, emptySelector] of [
  ['time', '.time-filters', '.time-record', '.time-empty'],
  ['expenses', '.expense-filters', '[data-expense-record]', '.expense-empty'],
] as const) {
  test(`${path}: filter summary survives disclosure and reset restores the register`, async ({
    page,
  }, info) => {
    test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
    await signIn(page, 'owner');
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST') writes++;
    });
    await page.goto(portal(`/${path}?q=`), { waitUntil: 'networkidle' });
    const form = page.locator(filterClass);
    const summary = form.locator('[data-filter-summary]');
    const baselineRows = await page.locator(rowSelector).count();
    expect(baselineRows).toBeGreaterThan(0);
    await expect(summary.getByRole('link', { name: 'Clear filters', exact: true })).toHaveCount(0);

    const unmatched = `No-record-has-this-search-${'long-filter-value-'.repeat(7)}`;
    await form.locator('[name="q"]').fill(unmatched);
    await expect(page.locator(rowSelector)).toHaveCount(0);
    await expect(page.locator(emptySelector)).toContainText('No matching records.');
    await expect(page.locator(emptySelector)).toContainText('Clear filters to see more records.');
    await expect(summary).toContainText('Active filters: 1');
    await expect(summary).toContainText(unmatched);
    await expect(summary).toContainText('0 matching records');
    const chip = await summary.locator('li').boundingBox();
    expect(chip!.x + chip!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );

    // The current reset must clear persisted search too, not just the URL.
    await summary.getByRole('link', { name: 'Clear filters', exact: true }).click();
    await expect(form.locator('[name="q"]')).toHaveValue('');
    await expect(page.locator(rowSelector)).toHaveCount(baselineRows);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(form.locator('[name="q"]')).toHaveValue('');
    await expect(page.locator(rowSelector)).toHaveCount(baselineRows);

    // Time applies this date scope on the server; Expenses also filters the loaded projection.
    await page.goto(portal(`/${path}?from=2400-01-01&to=2400-01-02&q=`), {
      waitUntil: 'networkidle',
    });
    const disclosure = form.locator('.ui-disclosure');
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(disclosure.locator('summary')).toContainText('Active filters: 2');
    await disclosure.locator('summary').click();
    await expect(form.locator('[name="from"]')).not.toBeVisible();
    await expect(summary.getByRole('list', { name: 'Active filters' })).toBeVisible();
    await expect(summary).toContainText('From: 2400-01-01');
    await expect(summary).toContainText('To: 2400-01-02');
    await expect(page.locator(emptySelector)).toContainText('No matching records.');
    const issues = await new AxeBuilder({ page })
      .include(filterClass)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(issues.violations).toEqual([]);
    await form.screenshot({ path: info.outputPath(`${path}-active-filters.png`) });
    await summary.getByRole('link', { name: 'Clear filters', exact: true }).click();
    await expect(page.locator(rowSelector)).toHaveCount(baselineRows);
    await expect(summary.getByRole('list', { name: 'Active filters' })).toHaveCount(0);
    const saved = await page.evaluate((section) => {
      const key = Object.keys(sessionStorage).find((key) =>
        key.startsWith(`ja-operational-register:${section}:`),
      );
      return key ? JSON.parse(sessionStorage.getItem(key)!) : null;
    }, path);
    expect(saved).toMatchObject({ search: '', order: 'newest', page: 1 });
    expect(writes).toBe(0);
  });
}
