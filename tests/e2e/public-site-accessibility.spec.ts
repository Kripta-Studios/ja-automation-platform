import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const publicRoute = (path: string) => `/j-aautomation/en/${path}`;

test('affected public pages meet the WCAG automated contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');

  for (const path of ['solutions/aquarex', 'privacy', 'projects', 'contact']) {
    await page.goto(publicRoute(path), { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible();

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(result.violations, `${path}: ${JSON.stringify(result.violations, null, 2)}`).toEqual([]);
  }
});

test('public image assets load when lazy content enters the viewport', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');

  for (const path of ['', 'industries', 'about']) {
    await page.goto(publicRoute(path), { waitUntil: 'networkidle' });
    const images = page.locator('main img');
    const count = await images.count();
    expect(count, `${path || 'home'} should render approved image content`).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((element) => element.naturalWidth), {
          message: `${path || 'home'} image ${index} did not load after entering the viewport`,
        })
        .toBeGreaterThan(0);
    }
  }
});
