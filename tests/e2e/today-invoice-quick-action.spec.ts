import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('dashboard invoice CTA opens the authorized project Billing draft form', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'phone-390',
    'The quick-action role journey is represented at the required 390px viewport.',
  );

  await signIn(page, 'owner');

  const dashboardActions = page.getByRole('navigation', { name: 'Dashboard actions' });
  await expect(dashboardActions).toBeVisible();
  const invoiceAction = dashboardActions.getByRole('link', {
    name: 'Create invoice draft',
    exact: true,
  });
  await expect(invoiceAction).toBeVisible();

  const actionHref = await invoiceAction.getAttribute('href');
  expect(actionHref).toBeTruthy();
  const destination = new URL(actionHref!, page.url());
  const projectPath = destination.pathname;
  const projectMatch = projectPath.match(/\/projects\/([^/]+)$/u);
  expect(projectMatch, 'the CTA must target one project detail route').not.toBeNull();
  const projectId = decodeURIComponent(projectMatch?.[1] ?? '');
  expect(projectId).not.toBe('');
  expect(destination.searchParams.get('tab')).toBe('billing');

  const authorizedBoardHrefs = await page
    .locator('.dashboard-projects a.project-board-row')
    .evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
  expect(authorizedBoardHrefs).toContain(projectPath);

  await invoiceAction.click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL((url) => {
    return url.pathname === projectPath && url.searchParams.get('tab') === 'billing';
  });
  await expect(page.locator('[data-project-detail]')).toHaveAttribute('data-role', 'owner_admin');
  await expect(page.getByRole('tab', { name: 'Billing', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const billingPanel = page.locator('#project-panel-billing');
  await expect(billingPanel).toBeVisible();
  const openDraftForm = billingPanel.getByRole('button', {
    name: 'Create invoice draft',
    exact: true,
  });
  await expect(openDraftForm).toBeVisible();
  await openDraftForm.click();
  const draftForm = page.locator('form.invoice-draft-form');
  await expect(draftForm).toBeVisible();
  await expect(draftForm.locator('select[name="billingRuleId"]')).toBeVisible();
  await expect(draftForm.locator('input[name="periodStart"]')).toBeVisible();
  await expect(draftForm.locator('input[name="periodEnd"]')).toBeVisible();

  // Only the allowlisted tabs are accepted; an arbitrary value cannot select
  // a hidden panel or expose a role-ineligible commercial surface.
  await page.goto(`${portal(`/projects/${encodeURIComponent(projectId)}`)}?tab=unexpected`);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Billing', exact: true })).toHaveAttribute(
    'aria-selected',
    'false',
  );

  // Finance retains the same project-scoped Billing action when navigating to
  // the deep link directly, while the worker role does not receive it.
  await page.context().clearCookies();
  await signIn(page, 'finance');
  await page.goto(`${portal(`/projects/${encodeURIComponent(projectId)}`)}?tab=billing`);
  await expect(page.locator('[data-project-detail]')).toHaveAttribute('data-role', 'finance_admin');
  await expect(page.getByRole('tab', { name: 'Billing', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#project-panel-billing')).toBeVisible();
  await expect(
    page.locator('#project-panel-billing').getByRole('button', {
      name: 'Create invoice draft',
      exact: true,
    }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, 'worker');
  await page.goto(`${portal(`/projects/${encodeURIComponent(projectId)}`)}?tab=billing`);
  await expect(page.locator('[data-project-detail]')).toHaveAttribute('data-role', 'worker');
  await expect(page.getByRole('tab', { name: 'Billing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create invoice draft', exact: true })).toHaveCount(
    0,
  );
});
