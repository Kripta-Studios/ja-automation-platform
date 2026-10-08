import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

const requiredViewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

async function assertHitTarget(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const result = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = Math.min(box.right - 3, window.innerWidth - 1);
    const y = Math.min(box.top + box.height / 2, window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return {
      height: box.height,
      width: box.width,
      hit: Boolean(hit && (hit === element || element.contains(hit))),
      right: box.right,
      x,
      y,
    };
  });
  expect(result.height).toBeGreaterThanOrEqual(44);
  expect(result.width).toBeGreaterThanOrEqual(44);
  expect(result.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(result.hit, `control must receive pointer input at (${result.x}, ${result.y})`).toBe(true);
}

test('assistant launcher stays out of open drawers, dialogs, and sheets', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));

  const launcher = page.locator('[data-assistant-launcher]');
  await assertHitTarget(page, launcher);

  if ((page.viewportSize()?.width ?? 0) <= 1024) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('#portal-navigation')).toHaveAttribute('aria-modal', 'true');
    await expect(launcher).toBeHidden();
    await page.getByRole('button', { name: 'Close navigation' }).click();
    await expect(launcher).toBeVisible();
  }

  await page.keyboard.press('Control+Shift+k');
  const sectionDialog = page.getByRole('dialog', { name: 'Go to section' });
  await expect(sectionDialog).toBeVisible();
  await expect(launcher).toBeHidden();
  await sectionDialog.getByRole('button', { name: 'Close' }).click();
  await expect(launcher).toBeVisible();

  await launcher.click();
  const assistantDialog = page.locator('[data-navigation-assistant] dialog');
  await expect(assistantDialog).toBeVisible();
  await assistantDialog.locator('[data-assistant-task="time-create"]').click();

  const timeSheet = page.locator('[data-ui="responsive-sheet"].time-entry-sheet');
  await expect(timeSheet).toBeVisible();
  await expect(launcher).toBeHidden();
  await page.keyboard.press('Control+k');
  await expect(assistantDialog).not.toBeVisible();

  const saveDraft = page.locator('[data-time-entry-surface]').getByRole('button', {
    name: 'Save draft',
  });
  await saveDraft.scrollIntoViewIfNeeded();
  await assertHitTarget(page, saveDraft);
  await timeSheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(timeSheet).toHaveCount(0);
  await expect(launcher).toBeVisible();
});
