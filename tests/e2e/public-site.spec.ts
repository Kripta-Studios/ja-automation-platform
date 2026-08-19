import { expect, test } from '@playwright/test';
test('localized public homepage has no horizontal overflow', async ({ page }) => {
  await page.goto('/j-aautomation/en/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Engineering');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const portalLogin = page.getByRole('link', { name: /Portal login/i }).first();
  await expect(portalLogin).toBeVisible();
  await expect(portalLogin).toHaveAttribute('href', '/j-aautomation/app/login');
});

test('target viewport matrix stays within the canvas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const viewports = [
    [360, 800],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ] as const;
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto('/j-aautomation/en/', { waitUntil: 'domcontentloaded' });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`home-${width}x${height}.png`),
      fullPage: true,
    });
  }
});
