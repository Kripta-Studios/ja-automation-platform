import { expect, test } from '@playwright/test';
import { portal, signIn, e2eLifecycleFixturesFor } from './auth.js';

test('disabled matching options are truthful and cannot change the selected project', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/time?lang=en'));
  await page.locator('[data-time-primary-cta]').click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const project = sheet.locator('select[name="projectId"]');
  const selected = e2eLifecycleFixturesFor(info.project.name).project.id;
  await project.selectOption(selected);
  // Exercise native disabled optgroup semantics on this disposable DOM only.
  await project.evaluate((select: HTMLSelectElement) => {
    const group = document.createElement('optgroup');
    group.label = 'Unavailable test projects';
    group.disabled = true;
    group.append(new Option('Unavailable matching project', 'disabled-fixture-option'));
    select.append(group);
  });
  await project.click();
  const popup = sheet.locator('.searchable-select-popover:popover-open');
  const search = popup.getByRole('combobox');
  await search.fill('Unavailable matching');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(popup.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
  await expect(popup.getByRole('status')).toHaveText('No available matches.');
  await search.press('Enter');
  await expect(project).toHaveValue(selected);
  await expect(popup).toBeVisible();
  await project.evaluate((select: HTMLSelectElement) => {
    select.disabled = true;
  });
  await expect(popup).toHaveCount(0);
  await expect(project).toHaveValue(selected);
});
