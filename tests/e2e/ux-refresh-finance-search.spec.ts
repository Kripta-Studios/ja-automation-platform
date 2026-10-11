import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('finance keeps selected project before totals and connects the complete invoice journey', async ({
  page,
}, info) => {
  await signIn(page, 'finance');
  await page.goto(portal('/finance?view=overview&lang=en'));
  const workspace = page.getByRole('region', { name: 'Project workspace', exact: true });
  const projectSelect = workspace.locator('select[name="project"]');
  const projectId = await projectSelect.inputValue();
  expect(projectId).toBeTruthy();
  const selectorBox = await projectSelect.boundingBox();
  const metricsBox = await page.locator('[data-finance-actual]').boundingBox();
  expect(selectorBox!.y).toBeLessThan(metricsBox!.y);
  for (const label of [
    'Prepare an invoice',
    'Team and billing conditions',
    'Invoices',
    'Collections',
  ]) {
    const link = workspace.getByRole('link', { name: label, exact: true });
    const href = await link.getAttribute('href');
    expect(href).toContain(projectId);
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  await expect(page.locator('a[data-metric="approved-wip"]')).toHaveAttribute(
    'href',
    new RegExp(projectId),
  );
  await expect(page.locator('a[data-metric="revenue-candidate"]')).toHaveAttribute(
    'href',
    /source=portfolio/,
  );
  await page.screenshot({ path: info.outputPath('finance-workspace.png'), fullPage: true });
  await workspace.getByRole('link', { name: 'Prepare an invoice', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/billing\\?.*project=${projectId}`));
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Create invoice', exact: true }) }),
  ).toBeVisible();
});

test('workspace search supports phone layout, clear, arrow navigation, Home End and Escape', async ({
  page,
}, info) => {
  await signIn(page, 'finance');
  const search = page.locator('#portal-global-search');
  const print = page.getByRole('button', { name: 'Print report', exact: true });
  if (page.viewportSize()!.width <= 768) {
    const inputBox = await search.boundingBox();
    const printBox = await print.boundingBox();
    expect(inputBox!.y).toBeGreaterThan(printBox!.y);
    expect(inputBox!.width).toBeGreaterThan(150);
  }
  await search.fill('Body');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  const options = page.locator('#portal-search-popover a[role="option"]');
  await expect(options.first()).toBeVisible();
  await search.press('ArrowUp');
  await expect(options.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(options.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(search).toBeFocused();
  await expect(page.locator('#portal-search-popover')).toBeHidden();
  await page.getByRole('link', { name: 'Workspace home', exact: true }).focus();
  await expect(page.getByRole('link', { name: 'Workspace home', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('search-layout.png') });
});

test('worker can move between project time expenses and reports without selecting the project again', async ({
  page,
}, info) => {
  await signIn(page, 'worker');
  await page.goto(portal('/time?lang=en'));
  const projectId = await page
    .locator('#time-filters select[name="project"] option[value]:not([value=""])')
    .first()
    .getAttribute('value');
  expect(projectId).toBeTruthy();
  await page.goto(portal(`/time?project=${projectId}&lang=en`));
  const nav = page.getByRole('navigation', { name: 'Continue in this project' });
  await expect(nav).toBeVisible();
  await expect(nav.locator('.project-context-nav__identity')).toHaveAttribute(
    'href',
    new RegExp(`/projects/${projectId}`),
  );
  await nav.getByRole('link', { name: /Expenses/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses\\?project=${projectId}`));
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: /Reports/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reports\\?project=${projectId}`));
  await nav.getByRole('link', { name: /Time entries/ }).click();
  await expect(page).toHaveURL(new RegExp(`/time\\?project=${projectId}`));
  await page.screenshot({ path: info.outputPath('worker-project-context.png'), fullPage: true });
});

test('empty time and expense searches have a working reset at the point of need', async ({
  page,
}) => {
  await signIn(page, 'worker');
  for (const section of ['time', 'expenses']) {
    await page.goto(portal(`/${section}?q=ux-no-such-record-20261011&lang=en`));
    const empty = page.locator(section === 'time' ? '.time-empty' : '.expense-empty');
    await expect(empty).toContainText('No matching records');
    await empty.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.locator('input[name="q"]').last()).toHaveValue('');
  }
});

test('project managers can filter by client and use project-specific card actions', async ({
  page,
}, info) => {
  await signIn(page, 'manager');
  await page.goto(portal('/projects?lang=en'), { waitUntil: 'networkidle' });
  const filters = page.locator('.project-section__filters');
  const client = filters.locator('[data-project-client-filter]');
  await expect(client).toBeVisible();
  const clientId = await client.locator('option').nth(1).getAttribute('value');
  const clientLabel = await client.locator('option').nth(1).innerText();
  expect(clientId).toBeTruthy();
  await client.selectOption(clientId!);
  await filters.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`client=${clientId}`));
  await expect(page.locator('.project-section__filter-summary')).toContainText(clientLabel);
  const cardActions = page.locator('[data-card-secondary-actions]').first();
  const scope = (await cardActions.isVisible())
    ? cardActions
    : page.locator('.project-section__shortcut-cell nav').first();
  const team = scope.getByRole('link', { name: /^Team/ });
  await expect(team).toBeVisible();
  const teamUrl = new URL((await team.getAttribute('href'))!, page.url());
  expect(teamUrl.searchParams.get('tab')).toBe('team');
  expect(teamUrl.searchParams.get('lang')).toBe('en');
  await expect(scope.getByRole('link', { name: /^Invoices/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('manager-client-filter.png'), fullPage: true });
  await team.click();
  await expect(page).toHaveURL(/\/projects\/[^/?]+\?.*tab=team/);
  await expect(page.getByRole('tab', { name: 'Commercial', exact: true })).toHaveCount(0);
});
