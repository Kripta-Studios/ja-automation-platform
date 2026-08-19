import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const portal = (value: string) => `http://127.0.0.1:4174/j-aautomation/app${value}`;

async function expectNoAxeViolations(page: import('@playwright/test').Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

test('public homepage meets WCAG 2.2 AA automated checks', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/j-aautomation/en/', { waitUntil: 'networkidle' });
  await expectNoAxeViolations(page);
});

test('portal login and worker surface meet WCAG 2.2 AA automated checks', async ({ page }) => {
  await page.goto(portal('/login'), { waitUntil: 'networkidle' });
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Field worker' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expectNoAxeViolations(page);
});
