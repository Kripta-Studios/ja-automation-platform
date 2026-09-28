import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';

test.use({ hasTouch: true });

test('one dropdown contains search, accessible results and keyboard selection without changing values on cancel', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));
  await page.locator('[data-time-primary-cta]').click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const project = sheet.locator('select[name="projectId"]');
  const worker = sheet.locator('select[name="workerId"]');
  await expect(page.locator('[data-select-search]:visible')).toHaveCount(0);
  await expect(page.locator('.searchable-select-field')).toHaveCount(0);
  const sheetClose = sheet.getByRole('button', { name: 'Close time form', exact: true });
  const save = sheet.getByRole('button', { name: 'Save draft', exact: true });
  await sheetClose.focus();
  await sheetClose.press('Shift+Tab');
  await expect(save).toBeFocused();
  await save.press('Tab');
  await expect(sheetClose).toBeFocused();
  await project.tap();
  const popup = sheet.locator('.searchable-select-popover:popover-open');
  const search = popup.getByRole('combobox');
  await expect(search).toBeFocused();
  const projectId = e2eLifecycleFixturesFor(info.project.name).project.id;
  await search.fill(projectId);
  const option = popup.getByRole('option');
  await expect(option).toHaveCount(1);
  const closeBounds = await popup.getByRole('button', { name: 'Close selector' }).boundingBox();
  expect(closeBounds!.width).toBeGreaterThanOrEqual(44);
  expect(closeBounds!.height).toBeGreaterThanOrEqual(44);
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const optionBounds = await option.boundingBox();
  expect(optionBounds!.height).toBeGreaterThanOrEqual(44);
  const a11y = await new AxeBuilder({ page })
    .include('.searchable-select-popover:popover-open')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('integrated-picker.png'), fullPage: false });
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(project).toHaveValue(projectId);
  await expect(project).toBeFocused();
  await expect(popup).toHaveCount(0);
  expect(
    await sheet
      .locator('form')
      .evaluate((form: HTMLFormElement) => new FormData(form).get('projectId')),
  ).toBe(projectId);
  await project.press('ArrowDown');
  await expect(search).toHaveValue('');
  await search.fill('no-such-project-zz');
  await expect(popup.getByRole('status')).toContainText('No matches');
  await search.press('Escape');
  await expect(sheet).toBeVisible();
  await expect(project).toHaveValue(projectId);
  await project.press('Enter');
  await search.press('Tab');
  await expect(popup).toHaveCount(0);
  await expect(sheet.locator('[name="workDate"]')).toBeFocused();
  await worker.click();
  await search.fill('worker@demo.jaautomation.test');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(worker).not.toHaveValue('');
  await project.evaluate((select: HTMLSelectElement) => select.click());
  await expect(popup).toBeVisible();
  await sheet.locator('h2').click();
  await expect(popup).toHaveCount(0);
  await expect(project).toHaveValue(projectId);
  expect(errors).toEqual([]);
});

test('native select fallback still submits the same value without popup support', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.addInitScript(() => {
    delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
  });
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));
  await page.locator('[data-time-primary-cta]').click();
  const form = page.locator('form[data-time-entry-surface]');
  const project = form.locator('select[name="projectId"]');
  const id = e2eLifecycleFixturesFor(info.project.name).project.id;
  await project.selectOption(id);
  await expect(project).toHaveValue(id);
  await expect(page.locator('.searchable-select-popover')).toHaveCount(0);
  expect(
    await form.evaluate((element: HTMLFormElement) => new FormData(element).get('projectId')),
  ).toBe(id);
});
