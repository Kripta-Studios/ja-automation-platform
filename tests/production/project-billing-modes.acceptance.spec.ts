import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const clientId = process.env.JA_PROD_QA_CLIENT_ID;

test.beforeAll(() => {
  if (!clientId || !/^[0-9a-f-]{36}$/iu.test(clientId))
    throw new Error('JA_PROD_QA_CLIENT_ID must identify the designated QA client');
});

test('deployed project billing saves one invoice and two-invoice options through the browser', async ({
  page,
}, testInfo) => {
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const name = `QA billing modes ${marker}`;
  const templateName = `QA billing template ${marker}`;
  await page.goto(`${base}/projects`);
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const create = page.locator('form[action="?/createProject"]');
  await create.locator('[name="clientId"]').selectOption(clientId!);
  await create.locator('[name="name"]').fill(name);
  await create.locator('[name="costCenterCode"]').fill('QA-BILLING-MODES');
  await create.getByRole('textbox', { name: 'Expense budget' }).fill('100.25');
  await create.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('[data-project-setup-next]')).toBeVisible();

  await page.goto(`${base}/projects`);
  await page.getByRole('searchbox', { name: 'Search: Project' }).fill(name);
  const row = page.locator('.project-list-link').filter({ hasText: name });
  await expect(row).toBeVisible();
  const detailHref = await row.locator('a[href*="/projects/"]').first().getAttribute('href');
  if (!detailHref) throw new Error('Created QA project has no detail URL');
  const detail = new URL(detailHref, page.url());
  await page.goto(detail.pathname);
  await page.locator('[data-project-edit-cta]').click();
  await expect(
    page.locator('form.project-edit-form:visible').getByRole('textbox', { name: 'Expense budget' }),
  ).toHaveValue('100.25');
  detail.searchParams.set('tab', 'billing');
  await page.goto(`${detail.pathname}${detail.search}`);

  const setup = page.getByRole('region', { name: 'Project billing setup' });
  await expect(setup).toBeVisible();
  await expect(setup.locator('[name="mode"]')).toHaveValue('combined');
  await expect(setup.getByText('One invoice with two sections')).toBeVisible();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByLabel('Save these defaults as a reusable template').check();
  await setup.getByLabel('Template name').fill(templateName);
  await setup.getByRole('button', { name: 'Save billing setup' }).click();
  await expect(setup.getByText('Billing setup saved')).toBeVisible();
  await page.reload();
  await expect(setup.locator('[name="mode"]')).toHaveValue('combined');
  await expect(
    setup
      .getByLabel('Start from a saved template')
      .locator('option')
      .filter({ hasText: templateName }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Create invoice draft', exact: true }).click();
  const draft = page.locator('form.invoice-draft-form');
  await expect(draft).toBeVisible();
  const attemptedDate = new Date().toISOString().slice(0, 10);
  await draft.locator('[name="periodStart"]').fill(attemptedDate);
  await draft.locator('[name="periodEnd"]').fill(attemptedDate);
  const attemptedRuleId = await draft.locator('[name="billingRuleId"]').inputValue();
  await draft.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page).toHaveURL(/tab=billing/u);
  await expect(draft).toBeVisible();
  await expect(draft.locator('.form-notice')).toBeVisible();
  await expect(draft.locator('[name="periodStart"]')).toHaveValue(attemptedDate);
  await expect(draft.locator('[name="periodEnd"]')).toHaveValue(attemptedDate);
  await expect(draft.locator('[name="billingRuleId"]')).toHaveValue(attemptedRuleId);
  await expect(draft.locator('.form-notice a[href*="tab=billing"]')).toBeVisible();
  await page.goto(`${detail.pathname}?tab=billing`);

  await setup.getByText('Two separate invoices').click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await expect(setup.getByLabel('Expense tax profile', { exact: true })).toBeVisible();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Save billing setup' }).click();
  await expect(setup.getByText('Billing setup saved')).toBeVisible();
  await page.reload();
  await expect(setup.locator('[name="mode"]')).toHaveValue('separate');

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Viewport is required');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  const control = await setup.getByRole('button', { name: 'Continue' }).boundingBox();
  expect(control).not.toBeNull();
  expect(control!.height).toBeGreaterThanOrEqual(44);
});
