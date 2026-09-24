import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const qaProjectId = process.env.JA_PROD_QA_PROJECT_ID;

test('phone and tablet navigation and project setup remain usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop');
  if (!qaProjectId) throw new Error('Designated QA project ID is required');

  await page.goto(`${base}/projects`);
  const menu = page.getByRole('button', { name: 'Toggle navigation' });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.width).toBeGreaterThanOrEqual(40);
  expect(menuBox!.height).toBeGreaterThanOrEqual(40);
  await menu.click();
  const drawer = page.locator('#portal-navigation');
  await expect(drawer).toBeVisible();
  for (const label of ['Projects', 'Team', 'Time', 'Expenses'])
    await expect(drawer.getByRole('link', { name: label, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const create = page.locator('form[action="?/createProject"]');
  await expect(create.getByLabel('Cost center code')).toBeVisible();
  await expect(create.getByLabel('Planned end date (optional)')).toBeVisible();
  await expect(create.getByLabel('Revenue budget')).toBeVisible();
  await expect(create.getByRole('button', { name: 'Create project' })).toBeVisible();
  for (const control of [
    create.getByLabel('Cost center code'),
    create.getByLabel('Planned end date (optional)'),
    create.getByLabel('Revenue budget'),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }

  await page.goto(`${base}/projects/${qaProjectId}`);
  await expect(page.locator('main')).toContainText('QA');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
});
