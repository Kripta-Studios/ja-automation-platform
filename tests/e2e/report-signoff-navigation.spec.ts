import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

function skipUnlessDesktop(testInfo: { project: { name: string } }): void {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The report navigation contract is represented at the required desktop viewport.',
  );
}

test('project report cards and report view links preserve the authorized tab contract', async ({
  page,
}, testInfo) => {
  skipUnlessDesktop(testInfo);
  await signIn(page, 'owner');

  await page.goto(portal('/projects'));
  // Owner/Admin uses the management project register while PM uses the
  // ProjectSection table. Both expose the project as an accessible link, but
  // with different surrounding copy; keep the selector on the stable project
  // name/open affordance instead of the PM-only component class.
  const projectLink = page
    .getByRole('link')
    .filter({ hasText: /(?:OPEN PROJECT|Body Shop Line 4 Controls Upgrade)/iu })
    .first();
  await expect(projectLink).toBeVisible();
  await projectLink.click();
  await expect(page.locator('[data-project-detail]')).toBeVisible();

  await page.getByRole('tab', { name: 'Reports & Files', exact: true }).click();
  const reportCards = page.locator('.report-surface-grid a.report-type-card');
  await expect(reportCards).toHaveCount(3);

  const expectedViews = ['daily', 'technical', 'signoff'] as const;
  for (const [index, expectedView] of expectedViews.entries()) {
    const href = await reportCards.nth(index).getAttribute('href');
    expect(href).toBeTruthy();
    const destination = new URL(href!, page.url());
    expect(destination.pathname).toBe('/j-aautomation/app/reports');
    expect(destination.searchParams.get('view')).toBe(expectedView);
    expect(destination.searchParams.getAll('view')).toEqual([expectedView]);
  }

  const projectUrl = page.url();
  await reportCards.nth(0).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/j-aautomation/app/reports' && url.searchParams.get('view') === 'daily',
  );
  await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-report-tab="daily"]')).toBeVisible();

  await page.goto(`${projectUrl.split('?')[0]}?tab=reports`);
  await expect(page.locator('[data-project-detail]')).toBeVisible();
  await page.getByRole('tab', { name: 'Reports & Files', exact: true }).click();
  await page.locator('.report-surface-grid a.report-type-card').nth(1).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/j-aautomation/app/reports' && url.searchParams.get('view') === 'technical',
  );
  await expect(page.getByRole('tab', { name: 'Technical / PLC', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-report-tab="technical"]')).toBeVisible();

  await page.goto(`${projectUrl.split('?')[0]}?tab=reports`);
  await expect(page.locator('[data-project-detail]')).toBeVisible();
  await page.getByRole('tab', { name: 'Reports & Files', exact: true }).click();
  await page.locator('.report-surface-grid a.report-type-card').nth(2).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/j-aautomation/app/reports' && url.searchParams.get('view') === 'signoff',
  );
  await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-report-tab="signoff"]')).toBeVisible();

  // An invalid view must fail closed to the operational Daily panel rather
  // than selecting an unimplemented or unauthorized surface.
  await page.goto(`${portal('/reports')}?view=untrusted&view=signoff`);
  await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toHaveAttribute(
    'aria-selected',
    'false',
  );
});
