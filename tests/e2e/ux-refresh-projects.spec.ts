import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test.describe('project workspace UX refresh', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?lang=en'));
  });

  test('keeps create-project fields reachable while shortening the first decision path', async ({
    page,
  }, testInfo) => {
    await expect(page.locator('[data-project-primary-action]')).toBeVisible();
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await page.waitForLoadState('networkidle');

    const form = page.locator('form[action="?/createProject"]');
    await expect(form).toBeVisible();
    // formValidation adds this marker from its action; waiting for it avoids
    // clicking the first disclosure while Svelte is still hydrating the form.
    await expect(form).toHaveAttribute('data-validation-instance', /.+/);
    await expect
      .poll(() => page.locator('#new-project').evaluate((node) => node.getBoundingClientRect().top))
      .toBeLessThan(160);
    const viewportWidth = page.viewportSize()?.width ?? 'unknown';
    await expect(form.locator('.project-step-nav')).toHaveCSS('grid-column', '1 / -1');
    await expect(form.locator('.project-create-actions')).toHaveCSS('grid-column', '1 / -1');
    await expect(form.locator('#project-create-people')).toHaveCSS('grid-column', '1 / -1');
    if (typeof viewportWidth === 'number' && viewportWidth >= 768) {
      const save = await form.locator('.project-create-actions button').boundingBox();
      const assistant = await page.locator('[data-assistant-launcher]').boundingBox();
      expect(save).toBeTruthy();
      expect(assistant).toBeTruthy();
      expect(save!.y + save!.height).toBeLessThanOrEqual(assistant!.y);
    }
    await page.screenshot({
      path: testInfo.outputPath(`create-form-open-${viewportWidth}.png`),
      fullPage: false,
    });
    await expect(form.locator('.project-step-nav')).toContainText('1 · Basics');
    await expect(form.locator('.project-step-nav')).toContainText('2 · Project context');
    await expect(form.locator('.project-step-nav')).toContainText('3 · People');
    await expect(form.locator('[name="timezone"]')).toBeVisible();
    await expect(form.locator('[name="startDate"]')).toBeVisible();
    await expect(form.locator('[name="plannedEndDate"]')).toBeVisible();
    await expect(form.locator('[name="description"]')).toBeHidden();
    await expect(form.locator('#project-create-people')).toBeVisible();
    await expect(form.locator('[name="billingModel"]')).toBeHidden();
    await expect(form.locator('[data-project-optional-settings]')).toBeVisible();
    await expect(form.locator('[name="budgetType"]')).toBeHidden();
    await expect(form.locator('.project-create-actions button')).toHaveText('Create project');

    const client = form.locator('[name="clientId"] option[value]:not([value=""])').first();
    await expect(client).toHaveCount(1);
    await form
      .locator('[name="clientId"]')
      .selectOption((await client.getAttribute('value')) ?? '');
    await expect(form.locator('.project-inherited-note')).toContainText('client');

    const uniqueProjectName = `Project UX essentials ${Date.now()}`;
    const uniqueCostCenter = `UX${String(Date.now()).slice(-8)}`;
    await form.locator('[name="name"]').fill(uniqueProjectName);
    await form.locator('[name="costCenterCode"]').fill(uniqueCostCenter);
    await form.locator('[name="timezone"]').fill('America/New_York');
    await form.locator('[name="startDate"]').fill('2026-08-01');

    await form.getByRole('link', { name: /2 · Project context/ }).click();
    await expect(form.locator('[data-project-context-settings]')).toHaveAttribute('open', '');
    await expect(form.locator('[name="description"]')).toBeVisible();

    await form.getByRole('link', { name: /3 · People/ }).click();
    await expect(form.locator('#project-create-people')).toHaveAttribute('open', '');
    await expect(form.getByText('Project defaults for people', { exact: false })).toBeVisible();

    await form.getByRole('link', { name: /4 · Commercial/ }).click();
    await expect(form.locator('[data-project-commercial-settings]')).toHaveAttribute('open', '');
    await expect(form.locator('[name="billingModel"]')).toBeVisible();

    const optional = form.locator('[data-project-optional-settings]');
    await form.getByRole('link', { name: /5 · Optional planning/ }).click();
    await expect(optional).toHaveAttribute('open', '');
    await expect(form.locator('[name="budgetType"]')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`create-form-optional-expanded-${viewportWidth}.png`),
      fullPage: false,
    });

    const invalidBudget = optional
      .locator('label')
      .filter({ hasText: 'Revenue budget' })
      .locator('input')
      .first();
    await invalidBudget.fill('-1');
    await optional.locator('summary').click();
    await expect(optional).not.toHaveAttribute('open');
    await form.locator('.project-create-actions button').click();
    const guidedRecovery = page.locator('[data-ui="guided-recovery"]');
    await expect(guidedRecovery).toBeVisible();
    await expect(optional).toHaveAttribute('open', '');
    await expect(invalidBudget).toHaveAttribute('aria-invalid', 'true');
    await expect(optional.locator('[data-validation-generated-error]')).toHaveCount(1);
    await guidedRecovery.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(guidedRecovery).not.toBeVisible();
    await invalidBudget.fill('');

    await expect(form.locator('[name="name"]')).toHaveValue(uniqueProjectName);
    await expect(form.locator('[name="costCenterCode"]')).toHaveValue(uniqueCostCenter);
    await expect(form.locator('[name="timezone"]')).toHaveValue('America/New_York');
    await expect(form.locator('[name="startDate"]')).toHaveValue('2026-08-01');

    await form.locator('.project-create-actions button').click();
    await page.waitForURL(/\/projects\/[^/?]+\?tab=work/);
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    await expect(page.locator('.project-quick-links')).toContainText('Prepare invoice');

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 2);
  });

  test('exposes project context links and a compact detail navigation', async ({ page }) => {
    const firstProject = page.locator('.project-list-link > a').first();
    await expect(firstProject).toBeVisible();
    await expect(page.locator('.project-list-link__shortcuts').first()).toContainText('Work');
    await expect(page.locator('.project-register-summary')).toBeVisible();

    await firstProject.click();
    await page.waitForURL(/\/projects\/[^/]+/);
    await expect(page.locator('.project-quick-links')).toBeVisible();
    await expect(page.locator('.project-quick-links')).toContainText('Log time');
    await expect(page.locator('.project-quick-links')).toContainText('Record expense');
    await expect(page.locator('.project-quick-links')).toContainText('Create work report');
    await expect(page.locator('.project-quick-links')).toContainText('Prepare invoice');
    await expect(page.locator('.project-tab-current')).toBeVisible();
    await expect(page.locator('.attention-grid .attention-card').first()).toBeVisible();

    const tabs = page.locator('.project-tabs');
    await expect(tabs).toBeVisible();
    if ((await page.viewportSize())?.width && (await page.viewportSize())!.width < 600) {
      await expect(tabs).toHaveCSS('overflow-x', 'auto');
      const columns = await page
        .locator('.attention-grid')
        .evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
        );
      expect(columns).toBe(2);
    }
  });
});
