import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { signIn, portal } from './auth.js';
import { datePresetRange } from '../../apps/portal/src/lib/portal/ui/date-presets';
const evidence = 'docs/evidence/workspace-ux-20260922/after';
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));

test('section navigation is role scoped, keyboard accessible and responsive', async ({
  page,
}, info) => {
  await signIn(page, 'worker');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const trigger = page.getByRole('button', { name: 'Go to section', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Go to section' });
  const search = dialog.getByLabel('Find a section');
  await expect(search).toBeFocused();
  await expect(dialog.getByRole('link', { name: 'Billing', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'My Pay' })).toBeVisible();
  await search.fill('not-a-section');
  await expect(dialog.getByRole('status')).toHaveText('No matching sections');
  await search.fill('expenses');
  await search.press('ArrowDown');
  await expect(dialog.getByRole('link', { name: 'Expenses' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await search.fill('expenses');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/expenses\?lang=en/);
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  const axe = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(axe.violations).toEqual([]);
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.screenshot({ path: `${evidence}/navigator-worker-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('date shortcuts preserve filters and chips remove exactly one criterion', async ({
  page,
}, info) => {
  await signIn(page, 'worker');
  for (const route of ['time', 'expenses', 'reports']) {
    await page.goto(portal(`/${route}?lang=en&status=draft&q=Demo&from=2026-01-01&to=2026-12-31`));
    const dates = page.getByRole('navigation', { name: 'Quick date filters' });
    await dates.getByRole('link', { name: 'Last month', exact: true }).click();
    const expected = datePresetRange('last-month');
    await expect(page).toHaveURL(new RegExp(`from=${expected.from}`));
    let url = new URL(page.url());
    expect(url.searchParams.get('from')).toBe(expected.from);
    expect(url.searchParams.get('to')).toBe(expected.to);
    expect(url.searchParams.get('status')).toBe('draft');
    expect(url.searchParams.get('q')).toBe('Demo');
    expect(url.searchParams.get('lang')).toBe('en');
    await page.getByRole('link', { name: /^Remove filter: Search/ }).click();
    await expect(page).toHaveURL(/[?&]q=(&|$)/);
    url = new URL(page.url());
    expect(url.searchParams.get('q')).toBe('');
    expect(url.searchParams.get('status')).toBe('draft');
    expect(url.searchParams.get('from')).toBe(expected.from);
    await page.reload();
    await expect(page.getByRole('link', { name: /^Remove filter: Search/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Remove filter: Status/ })).toBeVisible();
    await dates.scrollIntoViewIfNeeded();
    for (const link of await dates.getByRole('link').all())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${evidence}/${route}-filters-${info.project.name}.png` });
  }
});

test('week jumps cross years and preserve non-date criteria', async ({ page }, info) => {
  await signIn(page, 'worker');
  await page.goto(portal('/time?week=2026-12-28&status=approved&category=regular&lang=en'));
  await page.getByRole('link', { name: 'Next week' }).click();
  await expect(page).toHaveURL(/week=2027-01-04/);
  const params = new URL(page.url()).searchParams;
  expect(params.get('week')).toBe('2027-01-04');
  expect(params.get('from')).toBe('2027-01-04');
  expect(params.get('to')).toBe('2027-01-10');
  expect(params.get('category')).toBe('regular');
  expect(params.get('status')).toBe('approved');
  await expect(page.locator('.timesheet-heading')).toContainText('2027-01-04');
  await page.getByRole('link', { name: 'Previous week' }).click();
  await expect(page.locator('.timesheet-heading')).toContainText('2026-12-28');
  await page
    .locator('.timesheet-week-navigation')
    .getByRole('link', { name: 'This week', exact: true })
    .click();
  await expect(page.locator('.timesheet-heading')).toContainText(datePresetRange('week').from);
  await page.locator('.timesheet-week-navigation').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/weeks-${info.project.name}.png` });
});

test('owner and finance can find their destinations in Portuguese', async ({ browser }, info) => {
  for (const role of ['owner', 'finance'] as const) {
    const context = await browser.newContext({ viewport: info.project.use.viewport });
    const page = await context.newPage();
    await signIn(page, role);
    await page.goto(portal('/projects?lang=pt'));
    await page.getByRole('button', { name: 'Ir para uma seção', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ir para uma seção' });
    await dialog.getByLabel('Buscar seção').fill('fatur');
    const links = dialog.getByRole('link');
    expect(await links.count()).toBeGreaterThan(0);
    await links.first().click();
    await expect(page).toHaveURL(/lang=pt/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await context.close();
  }
});
