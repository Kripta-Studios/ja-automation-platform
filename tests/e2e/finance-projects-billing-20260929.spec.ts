import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

for (const role of ['owner', 'finance'] as const) {
  test(`${role} billing workspace and setup action survive refresh without reloading on tab selection`, async ({
    page,
    context,
    browser,
  }, info) => {
    test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
    await signIn(page, role);
    await page.goto(portal('/billing?lang=en'));
    const projectFilter = page.getByRole('form', { name: 'Filter billing' }).getByLabel('Project');
    const projectId = await projectFilter.locator('option').nth(1).getAttribute('value');
    if (!projectId) throw new Error('Billing project filter is required');
    const native = await browser.newContext({
      storageState: await context.storageState(),
      javaScriptEnabled: false,
    });
    try {
      const nativePage = await native.newPage();
      await nativePage.goto(portal(`/billing?lang=en&project=${projectId}&stage=drafts`));
      const nativeFilters = nativePage.getByRole('form', { name: 'Filter billing' });
      await expect(nativeFilters.getByLabel('Project')).toHaveValue(projectId);
      await expect(nativeFilters.getByLabel('Stage')).toHaveValue('drafts');
      await expect(
        nativePage.locator('.billing-section__summary-card[aria-pressed="true"]'),
      ).toContainText('Drafts');
    } finally {
      await native.close();
    }
    await projectFilter.selectOption(projectId);
    await page
      .getByRole('form', { name: 'Filter billing' })
      .getByLabel('Stage')
      .selectOption('drafts');
    const documentRequests: string[] = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.resourceType() === 'document')
        documentRequests.push(request.url());
    });

    await page.getByRole('tab', { name: 'Configure billing', exact: true }).click();
    await expect(page).toHaveURL(/view=setup/);
    expect(new URL(page.url()).searchParams.get('project')).toBe(projectId);
    await expect(page).toHaveURL(/stage=drafts/);
    expect(documentRequests).toEqual([]);
    await page.getByRole('button', { name: 'New tax profile', exact: true }).click();
    await expect(page).toHaveURL(/setup=tax/);
    await expect(page.locator('form[action="?/createTaxProfile"]')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Configure billing', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('form[action="?/createTaxProfile"]')).toBeVisible();

    documentRequests.length = 0;
    await page.getByRole('tab', { name: 'Billing streams', exact: true }).click();
    await expect(page).toHaveURL(/view=streams/);
    expect(documentRequests).toEqual([]);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Billing streams', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
    await expect(page).toHaveURL(/view=invoices/);
    expect(new URL(page.url()).searchParams.has('setup')).toBe(false);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Invoices', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Search invoices')).toBeVisible();
    await expect(projectFilter).toHaveValue(projectId);
    await expect(
      page.getByRole('form', { name: 'Filter billing' }).getByLabel('Stage'),
    ).toHaveValue('drafts');
  });
}
