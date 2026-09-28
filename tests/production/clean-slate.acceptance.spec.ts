import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const enabled = process.env.JA_PRODUCTION_CLEAN_SLATE === '1';

test.describe('clean slate after controlled production cutover', () => {
  test.skip(!enabled, 'Run only after the reviewed clean-slate cutover');

  test('owner sees only the retained IMPC client and BBS example projects', async ({ page }) => {
    const response = await page.goto(`${base}/projects?lang=en`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-client-id]')).toHaveCount(1);
    await expect(page.locator('[data-client-id="client-020-impc"]')).toBeAttached();
    await expect(page.locator('.project-list-link')).toHaveCount(2);
    await expect(page.locator(`.project-list-link a[href="${base}/projects/project-cp020-bbs-mexico"]`)).toHaveCount(1);
    await expect(page.locator(`.project-list-link a[href="${base}/projects/project-cp020-dfw"]`)).toHaveCount(1);
    const width = page.viewportSize()?.width;
    if (width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });

  test('owner can create and remove a client and project from the clean app', async ({ page }) => {
    test.setTimeout(90_000);
    const marker = `QA clean-slate browser ${Date.now()}`;
    let clientId = '';
    let projectId = '';
    try {
      await page.goto(`${base}/projects?lang=en`);
      const newClient = page.getByRole('button', { name: 'New Client', exact: true });
      if (!(await newClient.isVisible()))
        await page.locator('.workspace-actions-disclosure > summary').click();
      await newClient.click();
      const clientForm = page.locator('form[action="?/createClient"]');
      await clientForm.locator('[name="legalName"]').fill(marker);
      await clientForm.locator('[name="displayName"]').fill(marker);
      await clientForm.locator('[name="currency"]').selectOption('EUR');
      await clientForm.locator('[name="timezone"]').fill('Europe/Madrid');
      await clientForm.locator('[name="billingEmail"]').fill('qa-billing@example.test');
      await clientForm.locator('[name="billingAddress"]').fill('QA Test Street 1, Madrid');
      await clientForm.getByRole('button', { name: 'Create client', exact: true }).click();
      const clientCard = page.locator('[data-client-id]').filter({ hasText: marker });
      await expect(clientCard).toHaveCount(1);
      clientId = (await clientCard.getAttribute('data-client-id')) ?? '';
      expect(clientId).not.toBe('');

      await page.getByRole('button', { name: 'New Project', exact: true }).click();
      const projectForm = page.locator('form[action="?/createProject"]');
      await projectForm.locator('[name="clientId"]').selectOption(clientId);
      await projectForm.locator('[name="name"]').fill(marker);
      await projectForm.locator('[name="costCenterCode"]').fill('QA-CLEAN-SLATE');
      await projectForm.getByRole('button', { name: 'Create project', exact: true }).click();
      await expect(page.locator('[data-project-setup-next]')).toBeVisible();
      await page.goto(`${base}/projects?lang=en`);
      await page.getByRole('searchbox', { name: 'Search: Project' }).fill(marker);
      const row = page.locator('.project-list-link').filter({ hasText: marker });
      await expect(row).toHaveCount(1);
      const href = await row.locator('a[href*="/projects/"]').getAttribute('href');
      expect(href).toMatch(/\/projects\/[^/]+$/u);
      projectId = href?.split('/').at(-1) ?? '';
      await page.goto(href!);
      await expect(page.locator('main')).toContainText(marker);
      await page.reload();
      await expect(page.locator('main')).toContainText('QA-CLEAN-SLATE');
    } finally {
      if (projectId) {
        await page.goto(`${base}/projects?lang=en`);
        await page.getByRole('searchbox', { name: 'Search: Project' }).fill(marker);
        const row = page.locator('.project-list-link').filter({ hasText: marker });
        if (await row.count()) {
          await row.getByText('Actions', { exact: true }).click();
          page.once('dialog', (dialog) => dialog.accept());
          await row.getByRole('button', { name: 'Delete project' }).click();
          await expect(row).toHaveCount(0);
        }
      }
      if (clientId) {
        await page.goto(`${base}/projects?lang=en`);
        const clientCard = page.locator(`[data-client-id="${clientId}"]`);
        await expect(clientCard).toHaveCount(1);
        if (!(await clientCard.getByRole('button', { name: 'Delete client' }).isVisible()))
          await page.locator('.client-management-list summary').click();
        page.once('dialog', (dialog) => dialog.accept());
        await clientCard.getByRole('button', { name: 'Delete client' }).click();
        await expect(clientCard).toHaveCount(0);
      }
    }
  });
});
