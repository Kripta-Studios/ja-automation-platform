import { expect, test } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';

const requiredViewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

test('project editor has visible controls and an opaque, reachable action bar', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  await signIn(page, 'owner');
  await page.goto(portal(`/projects/${fixture.project.id}?lang=en`));
  const trigger = page.locator('[data-project-edit-cta]').first();
  await trigger.click();
  const sheet = page.locator('.project-edit-sheet');
  const name = sheet.locator('input[name="name"]');
  await expect(name).toBeVisible();
  await name.focus();
  await expect(name).toBeFocused();

  const appearance = await name.evaluate((input) => {
    const style = getComputedStyle(input);
    return {
      border: Number.parseFloat(style.borderTopWidth),
      borderColor: style.borderTopColor,
      background: style.backgroundColor,
      outline: Number.parseFloat(style.outlineWidth),
    };
  });
  // These failed when the sheet could not inherit the page's surface tokens:
  // inputs looked like plain text and the sticky footer showed fields beneath it.
  expect(appearance.border).toBeGreaterThanOrEqual(1);
  expect(appearance.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(appearance.background).toBe('rgb(255, 255, 255)');
  expect(appearance.outline).toBeGreaterThanOrEqual(2);
  await expect(sheet.locator('.sheet-form-actions')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );

  const body = sheet.locator('.responsive-sheet-body');
  expect(
    await body.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  const cancel = sheet.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.scrollIntoViewIfNeeded();
  const hit = await cancel.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      height: box.height,
      visible: target === button || Boolean(target && button.contains(target)),
    };
  });
  expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(hit.visible).toBe(true);
  await page.screenshot({ path: info.outputPath('project-editor.png') });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
