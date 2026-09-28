import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('project detail remembers the selected section after reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await signIn(page, 'owner');
  await page.goto(portal('/projects'));
  const project = page.locator('main a[href*="/app/projects/"]').filter({ visible: true }).first();
  await project.click();
  const team = page.getByRole('tab', { name: 'Team', exact: true });
  await team.click();
  await expect(team).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=team/);
  await page.reload();
  await expect(team).toHaveAttribute('aria-selected', 'true');
});
