import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('Owner worker pay review stays usable at phone and desktop widths', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/pay?lang=en'));
  await expect(page).toHaveURL(/\/app\/manage\/worker-pay\?lang=en$/);
  await expect(page.getByRole('heading', { name: 'Worker pay review' })).toBeVisible();
  const worker = page.locator('.pay-filters select[name="worker"]');
  await expect(worker).toBeVisible();
  await worker.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Apply period' }).click();
  await expect(page.getByRole('heading', { name: /Compensation statement/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settlement status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reimbursements' })).toBeVisible();
  const geometry = await page.locator('.owner-pay').evaluate((main) => {
    const viewport = document.documentElement.clientWidth;
    const filter = main.querySelector('.pay-filters') as HTMLElement;
    const select = filter.querySelector('select') as HTMLElement;
    const cards = [...main.querySelectorAll('.pay-card')] as HTMLElement[];
    return {
      viewport,
      documentOverflow: document.documentElement.scrollWidth - viewport,
      filterOverflow: filter.scrollWidth - filter.clientWidth,
      selectWidth: select.getBoundingClientRect().width,
      cardsWithinViewport: cards.every((card) => {
        const box = card.getBoundingClientRect();
        return box.left >= -1 && box.right <= viewport + 1;
      }),
      tableRegionsScrollable: [...main.querySelectorAll('.table-scroll')].every(
        (region) => region.clientWidth <= region.scrollWidth,
      ),
    };
  });
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.filterOverflow).toBeLessThanOrEqual(1);
  expect(geometry.selectWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.cardsWithinViewport).toBe(true);
  expect(geometry.tableRegionsScrollable).toBe(true);
});
