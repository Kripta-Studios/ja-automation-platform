import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { portal, signIn } from './auth.js';

test('availability editor keeps dates and status fully usable at every review width', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  await signIn(page, 'worker');
  await page.goto(portal('/profile?lang=en'));
  const calendar = page.locator('[data-availability-calendar]');
  await expect(calendar).toBeVisible();
  await calendar.locator('[aria-current=date]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const form = dialog.locator('form.availability-editor');
  const dates = form.locator('input[type="datetime-local"]');
  const availability = form.locator('select[name="availability"]');
  await expect(dates).toHaveCount(2);
  await expect(dates.nth(0)).toHaveValue(/T08:00$/);
  await expect(dates.nth(1)).toHaveValue(/T16:00$/);
  await expect(availability.locator('option[value="available"]')).toHaveText('Available');
  await expect(dates.nth(0)).toHaveAccessibleName('Starts');
  await expect(dates.nth(1)).toHaveAccessibleName('Ends');
  await expect(availability).toHaveAccessibleName('Availability');

  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  for (const control of [dates.nth(0), dates.nth(1), availability]) {
    const box = await control.boundingBox();
    expect(box, `${info.project.name} date/status control has a rendered box`).not.toBeNull();
    expect(
      box!.width,
      `${info.project.name} date/status control is readable`,
    ).toBeGreaterThanOrEqual(240);
    expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  }
  const submit = form.getByRole('button', { name: 'Save availability' });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeVisible();
  const submitBox = await submit.boundingBox();
  expect(submitBox).not.toBeNull();
  expect(submitBox!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
  expect(submitBox!.x + submitBox!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  expect(submitBox!.y).toBeGreaterThanOrEqual(0);
  expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  mkdirSync(resolve('docs/evidence/manuals-i18n-20260919'), { recursive: true });
  await dialog.screenshot({
    path: resolve(
      `docs/evidence/manuals-i18n-20260919/availability-editor-${info.project.name}.png`,
    ),
  });
});
