import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('refreshed website keeps its menu reachable and loads local typography', async ({
  page,
}, info) => {
  for (const locale of ['en', 'pt']) {
    await page.goto(`/j-aautomation/${locale}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.home-intro h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    const fontFamily = await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('geist');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    if (page.viewportSize()!.width < 1024) {
      const trigger = page.locator('header button[aria-expanded]');
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
      await expect(dialog.locator('a').first()).toBeVisible();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.locator('a').last()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect(dialog).not.toBeVisible();
    }
    await page.screenshot({ path: info.outputPath(`website-${locale}.png`), fullPage: false });
  }
});

test('workspace fonts load and dashboard summary leaves room for work', async ({ page }, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Geist'))).toBe(true);
  for (const filename of ['geist-latin.woff2', 'geist-mono-latin.woff2']) {
    const response = await page.request.get(portal(`/fonts/${filename}`));
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 4).toString()).toBe('wOF2');
  }
  const hero = page.locator('.dashboard-hero');
  await expect(hero).toBeVisible();
  expect((await hero.boundingBox())!.height).toBeLessThan(440);
  await expect(page.locator('.dashboard-project-count')).toContainText('active projects');
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: false });
});
