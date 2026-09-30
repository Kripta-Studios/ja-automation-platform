import { expect, test } from '@playwright/test';

const projectId = process.env.JA_PROD_QA_PROJECT_ID;

test.beforeAll(() => {
  if (!projectId || !/^[0-9a-f-]{36}$/iu.test(projectId))
    throw new Error('JA_PROD_QA_PROJECT_ID must identify an existing disposable QA project');
});

test('project tab URL, selected tab and panel stay synchronized after a direct tab URL', async ({
  page,
}) => {
  const href = `/j-aautomation/app/projects/${projectId}`;
  await page.goto(`${href}?tab=overview&lang=en`);
  await page.waitForLoadState('networkidle');
  for (const tabId of ['commercial', 'team', 'reports', 'billing', 'overview', 'commercial']) {
    const tab = page.locator(`#project-tab-${tabId}`);
    await tab.click();
    await expect(page).toHaveURL(new RegExp(`tab=${tabId}(?:&|$)`));
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`#project-panel-${tabId}`)).toBeVisible();
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
  }
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#project-tab-commercial')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-panel-commercial')).toBeVisible();
  await page.locator('#project-tab-commercial').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#project-tab-reports')).toBeFocused();
  await expect(page.locator('#project-tab-reports')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-panel-reports')).toBeVisible();
  await page.goto('/j-aautomation/app/projects?lang=en');
  await page.goBack();
  await expect(page).toHaveURL(/tab=reports/);
  await expect(page.locator('#project-tab-reports')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-panel-reports')).toBeVisible();
});
