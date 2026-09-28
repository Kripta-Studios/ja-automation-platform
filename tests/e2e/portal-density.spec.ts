import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

test.describe.configure({ timeout: 90_000 });

async function readable(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test('secondary register filters preserve criteria and leave primary work visible', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  for (const [path, formClass] of [
    ['expenses', '.expense-filters'],
    ['time', '.time-filters'],
    ['reports', '.report-register-filters'],
  ]) {
    await page.goto(portal(`/${path}?q=`), { waitUntil: 'networkidle' });
    const form = page.locator(formClass);
    const details = form.locator('.ui-disclosure');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(form.locator('[name="project"]')).toBeVisible();
    await expect(form.locator('[name="status"]')).toBeVisible();
    await expect(form.locator('[name="from"]')).not.toBeVisible();
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(form.locator('[name="from"]')).toBeVisible();
    await form.locator('[name="from"]').fill('2026-08-01');
    await details.locator('summary').click();
    await details.locator('summary').click();
    await expect(form.locator('[name="from"]')).toHaveValue('2026-08-01');
    await readable(page);
    await details.locator('summary').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`${path}-calm.png`), fullPage: false });
  }
  await page.goto(portal('/expenses?currency=BRL&q='), { waitUntil: 'networkidle' });
  await expect(page.locator('.expense-filters .ui-disclosure')).toHaveAttribute('open', '');
  await expect(page.locator('.expense-filters [name="currency"]')).toHaveValue('BRL');
});

test('secondary forms stay accessible to keyboard, validation and printing', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/documents'), { waitUntil: 'networkidle' });
  const disclosure = page.locator('.document-upload-panel .ui-disclosure');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await disclosure.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(disclosure.locator('input[type="file"]')).toBeVisible();
  await disclosure.locator('summary').click();
  // Native validation on a closed form must reveal the invalid fields, without sending a write.
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST') writes++;
  });
  await disclosure.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.locator('[aria-invalid="true"]').first()).toBeVisible();
  expect(writes).toBe(0);
  await readable(page);
  await page.screenshot({ path: info.outputPath('document-validation.png'), fullPage: false });
  await page.goto(portal('/accounting'), { waitUntil: 'networkidle' });
  const create = page.locator('.accounting-section__create .ui-disclosure');
  await expect(create).not.toHaveAttribute('open', '');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(create).toHaveAttribute('open', '');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(create).not.toHaveAttribute('open', '');
  await create.locator('summary').click();
  await expect(create.getByRole('button', { name: 'Generate pack', exact: true })).toBeVisible();
  await readable(page);
});

test('project and finance administration opens one chosen task', async ({ page }, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects'), { waitUntil: 'networkidle' });
  const register = page.getByRole('region', { name: 'Authorized projects', exact: true });
  await expect(register.locator('.project-list-link').first()).toBeVisible();
  const rowActions = register.locator('.project-row-actions').first();
  await expect(rowActions).not.toHaveAttribute('open', '');
  await rowActions.locator('summary').click();
  await readable(page);
  await rowActions.locator('summary').click();
  const toolbar = page.locator('nav.project-workflow-actions');
  await expect(toolbar.getByRole('button', { name: 'New Project', exact: true })).toBeVisible();
  const more = toolbar.locator('.workspace-actions-disclosure');
  await more.locator('summary').click();
  const primaryBounds = await toolbar
    .getByRole('button', { name: 'New Project', exact: true })
    .boundingBox();
  expect(primaryBounds!.height).toBeLessThanOrEqual(64);
  await toolbar.screenshot({ path: info.outputPath('project-actions.png') });
  await more.getByRole('button', { name: 'Update Assignment', exact: true }).click();
  await expect(page.locator('[data-project-workflow="update-assignment"]')).toBeVisible();
  await readable(page);
  await page.goto(portal('/finance?view=commercial'), { waitUntil: 'networkidle' });
  const task = page.getByLabel('Commercial policies', { exact: true });
  await expect(task).toBeVisible();
  await task.selectOption({ label: 'Client labor rate' });
  await expect(page.locator('form[action="?/createClientLaborRate"]')).toBeVisible();
  await expect(page.locator('form[action="?/createCompensationRule"]')).toHaveCount(0);
  await readable(page);
  await page.locator('.finance-config-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('finance-task.png'), fullPage: false });
  await page.goto(portal('/projects?view=team'), { waitUntil: 'networkidle' });
  const assignments = page.locator('.team-directory__assignment-details').first();
  await expect(assignments).not.toHaveAttribute('open', '');
  await assignments.locator('summary').click();
  await expect(assignments.locator('.team-directory__assignment-list')).toBeVisible();
  await readable(page);
  await page.screenshot({ path: info.outputPath('team-disclosure.png'), fullPage: false });
});

test('reference directories print fully and linked history opens on demand', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/billing?view=setup'), { waitUntil: 'networkidle' });
  const directories = page.locator('.billing-reference-directory');
  await expect(directories).toHaveCount(2);
  await expect(directories.first()).not.toHaveAttribute('open', '');
  await directories.first().locator('summary').click();
  await expect(directories.first().locator('table')).toBeVisible();
  await readable(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(directories.nth(1)).toHaveAttribute('open', '');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(directories.first()).toHaveAttribute('open', '');
  await expect(directories.nth(1)).not.toHaveAttribute('open', '');
  await page.goto(portal('/accounting'), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    location.hash = 'section-card-generate-monthly-accounting-pack-title';
  });
  await expect(page.locator('.accounting-section__create .ui-disclosure')).toHaveAttribute(
    'open',
    '',
  );
});

test('project action drafts do not move to another paginated record', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects'), { waitUntil: 'networkidle' });
  const register = page.getByRole('region', { name: 'Authorized projects', exact: true });
  const action = register
    .locator('.project-row-actions')
    .filter({ has: page.locator('input[name="reason"]') })
    .first();
  await action.locator('summary').click();
  await action.locator('input[name="reason"]').fill('Reason belongs only to this project');
  const id = await action.locator('input[name="projectId"]').first().inputValue();
  await register
    .locator('.record-browser__pages')
    .getByRole('button', { name: 'Next →', exact: true })
    .click();
  await expect(register.locator('.project-row-actions[open]')).toHaveCount(0);
  const reasons = await register
    .locator('input[name="reason"]')
    .evaluateAll((inputs: HTMLInputElement[]) => inputs.map((input) => input.value));
  expect(reasons).not.toContain('Reason belongs only to this project');
  await expect(register.locator(`input[name="projectId"][value="${id}"]`)).toHaveCount(0);
});
