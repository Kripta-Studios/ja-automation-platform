import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('searching a selector does not dirty a sheet, but selecting a real value does', async ({
  page,
}) => {
  await signIn(page, 'worker');
  await page.goto(portal('/time?lang=en'));
  const open = page.getByRole('button', { name: 'Log time', exact: true });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Log time', exact: true });
  const project = sheet.locator('select[name="projectId"]');
  const original = await project.inputValue();
  await project.click();
  const picker = page.locator('.searchable-select-popover:popover-open');
  await picker.getByRole('combobox').fill('No matching assignment');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(project).toHaveValue(original);
  const unexpectedDialogs: string[] = [];
  const dismissUnexpected = async (dialog: import('@playwright/test').Dialog) => {
    unexpectedDialogs.push(dialog.message());
    await dialog.dismiss();
  };
  page.on('dialog', dismissUnexpected);
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  expect(unexpectedDialogs).toEqual([]);
  page.off('dialog', dismissUnexpected);

  await open.click();
  await sheet.locator('select[name="category"]').selectOption('travel');
  const confirmation = page.waitForEvent('dialog');
  const close = sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain('unsaved changes');
  await dialog.dismiss();
  await close;
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('select[name="category"]')).toHaveValue('travel');
  page.once('dialog', (next) => next.accept());
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).not.toBeVisible();
});
