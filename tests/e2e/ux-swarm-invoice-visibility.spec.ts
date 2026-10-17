import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`${locale}: every invoice detail appears in the normal three-stage journey`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signIn(page, locale === 'es' ? 'owner' : 'finance');
    const writes: string[] = [];
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url());
    });
    await page.goto(portal(`/billing?assistantSurface=invoice-create&lang=${locale}`));
    await page.locator('[data-invoice-creation-modes] button').nth(1).click();
    const surface = page.locator('[data-invoice-creation-mode="whole_period"]');
    const overview = surface.locator('[data-invoice-details-overview]');
    await expect(overview).toBeVisible();
    await expect(overview.locator('button')).toHaveCount(9);
    await expect(surface.locator('details')).toHaveCount(0);
    await expect(surface.locator('[data-invoice-configuration-help]')).toBeVisible();
    const preservedRule = await surface.locator('input[name="billingRuleId"]').inputValue();
    const preservedStart = await surface.locator('input[name="periodStart"]').inputValue();
    const preservedEnd = await surface.locator('input[name="periodEnd"]').inputValue();

    const stages = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ];
    for (const [stage, sections] of stages.entries()) {
      await expect(surface.locator('[data-invoice-detail]')).toHaveCount(sections.length);
      for (const section of sections) {
        const panel = surface.locator(`[data-invoice-detail="${section}"]`);
        await expect(panel).toBeVisible();
        const heading = panel.getByRole('heading', { level: 3 });
        await expect(heading).toBeVisible();
        expect((await heading.innerText()).trim().length).toBeGreaterThan(0);
        expect(
          await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
        ).toBeLessThanOrEqual(1);
      }
      await surface.locator(`[data-invoice-detail="${sections[0]}"]`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`invoice-${locale}-stage-${stage + 1}.png`) });
      if (stage < 2)
        await surface.locator('.billing-section__wizard-actions button').last().click();
    }
    await expect(surface.locator('[data-invoice-review-help]')).toBeVisible();
    await expect(surface.locator('button[type="submit"]')).toBeDisabled();
    // No detail activation is required to see tax, PO, payment terms, adjustments or preview.
    await expect(surface.locator('[data-invoice-detail="8"] dl > div')).toHaveCount(5);
    await expect(surface.locator('[data-invoice-detail="9"] dl > div')).toHaveCount(2);
    await expect(surface.locator('[data-invoice-detail="10"] p')).toHaveCount(2);

    // All detail shortcuts remain readable, touch-sized, and usable with the keyboard.
    for (const button of await overview.locator('button').all()) {
      const appearance = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, clipped: element.scrollWidth > element.clientWidth + 1 };
      });
      expect(appearance.height).toBeGreaterThanOrEqual(44);
      expect(appearance.clipped).toBe(false);
    }
    const billingStream = overview.locator('button').first();
    await billingStream.focus();
    await page.keyboard.press('Enter');
    await expect(surface.locator('[data-invoice-detail="2"]')).toBeFocused();
    await expect(surface.locator('[data-invoice-detail]')).toHaveCount(3);
    await expect(surface.locator('select')).toHaveValue(preservedRule);
    await expect(surface.locator('input[name="periodStart"]')).toHaveValue(preservedStart);
    await expect(surface.locator('input[name="periodEnd"]')).toHaveValue(preservedEnd);
    await overview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`invoice-${locale}-overview.png`) });
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });
}
