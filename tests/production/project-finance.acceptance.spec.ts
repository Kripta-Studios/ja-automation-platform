import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const qaClientId = process.env.JA_PROD_QA_CLIENT_ID;
const qaTimeId = process.env.JA_PROD_QA_TIME_ID;
const qaReportId = process.env.JA_PROD_QA_REPORT_ID;
const qaMixedInvoiceId = process.env.JA_PROD_QA_MIXED_INVOICE_ID;

test.beforeAll(() => {
  if (!projectId || !/^[0-9a-f-]{36}$/iu.test(projectId))
    throw new Error('JA_PROD_QA_PROJECT_ID must identify the designated QA project');
  if (!qaClientId || !/^[0-9a-f-]{36}$/iu.test(qaClientId))
    throw new Error('JA_PROD_QA_CLIENT_ID must identify the designated QA client');
  if (!qaTimeId || !/^[0-9a-f-]{36}$/iu.test(qaTimeId))
    throw new Error('JA_PROD_QA_TIME_ID must identify the designated QA time record');
  if (!qaReportId || !/^[0-9a-f-]{36}$/iu.test(qaReportId))
    throw new Error('JA_PROD_QA_REPORT_ID must identify the designated QA report');
  if (!qaMixedInvoiceId || !/^[0-9a-f-]{36}$/iu.test(qaMixedInvoiceId))
    throw new Error('JA_PROD_QA_MIXED_INVOICE_ID must identify the designated QA draft');
});

test('owner creates a minimal QA project, reloads it, then removes the empty test record', async ({
  page,
}) => {
  const name = `QA browser project ${Date.now()}`;
  await page.goto(`${base}/projects`);
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const create = page.locator('form[action="?/createProject"]');
  await expect(create).toBeVisible();
  await create.locator('[name="clientId"]').selectOption(qaClientId!);
  await create.locator('[name="name"]').fill(name);
  await create.locator('[name="costCenterCode"]').fill('QA-BROWSER-ACCEPTANCE');
  for (const field of ['plannedEndDate', 'revenueBudgetMinor', 'poCapMinor', 'travelBudgetMinor'])
    await expect(create.locator(`[name="${field}"]`)).toHaveValue('');
  await create.getByRole('button', { name: 'Create project', exact: true }).click();
  try {
    const next = page.locator('[data-project-setup-next]');
    await expect(next).toBeVisible();
    await expect(next.getByRole('link', { name: 'Assign workers by expertise' })).toHaveAttribute(
      'href',
      /action=assign-worker&project=/u,
    );
    await expect(
      next.getByRole('link', { name: 'Configure per-person rates and expenses' }),
    ).toHaveAttribute('href', /view=commercial&project=/u);
    const viewport = page.viewportSize();
    if (viewport)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width + 1,
      );
    await page.goto(`${base}/projects`);
    await page.getByRole('searchbox', { name: 'Search: Project' }).fill(name);
    const row = page.locator('.project-list-link').filter({ hasText: name });
    await expect(row).toBeVisible();
    const href = await row.locator('a[href*="/projects/"]').first().getAttribute('href');
    if (!href) throw new Error('Created project has no detail link');
    await page.goto(href);
    await expect(page.locator('main')).toContainText(name);
    await page.reload();
    await expect(page.locator('main')).toContainText('QA-BROWSER-ACCEPTANCE');
  } finally {
    await page.goto(`${base}/projects`);
    await page.getByRole('searchbox', { name: 'Search: Project' }).fill(name);
    const row = page.locator('.project-list-link').filter({ hasText: name });
    if (await row.isVisible()) {
      await row.getByText('Actions', { exact: true }).click();
      page.once('dialog', (dialog) => dialog.accept());
      await row.getByRole('button', { name: 'Delete project' }).click();
      await expect(row).toHaveCount(0);
    }
  }
});

test('deployed project links retain scope through time and reports', async ({ page }) => {
  await page.goto(`${base}/projects/${projectId}`);
  await expect(page.locator('main')).toContainText('QA');
  await page
    .locator('.attention-grid')
    .getByRole('link', { name: /Actual time/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/time\\?project=${projectId}`));
  await page.goBack();
  await page
    .locator('.attention-grid')
    .getByRole('link', { name: /Reports/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/reports\\?project=${projectId}`));
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/reports\\?project=${projectId}`));
});

test('time detail links to its authorized same-day report after reload and back', async ({
  page,
}) => {
  await page.goto(`${base}/time/${qaTimeId}`);
  const report = page.locator(`a[href="${base}/reports/${qaReportId}"]`);
  await expect(report).toHaveAttribute('href', `${base}/reports/${qaReportId}`);
  await report.click();
  await expect(page).toHaveURL(`${base}/reports/${qaReportId}`);
  await expect(page.locator('main')).toContainText(
    'QA browser report for approved installation hours',
  );
  await page.reload();
  await expect(page.locator('main')).toContainText(
    'QA browser report for approved installation hours',
  );
  await page.goBack();
  await expect(page).toHaveURL(`${base}/time/${qaTimeId}`);
});

test('deployed finance shows the selected project and its commercial rules', async ({ page }) => {
  await page.goto(`${base}/finance?view=commercial&project=${projectId}`);
  await expect(page.locator('[data-commercial-terms-summary]')).toBeVisible();
  await expect(page.locator('[data-project-legal-entity]')).toBeVisible();
  await expect(page.locator('#commercial-summary-date')).toHaveValue(/\d{4}-\d{2}-\d{2}/u);
  await page.reload();
  await expect(page.locator('[data-commercial-terms-summary]')).toBeVisible();
});

test('deployed mixed-rate draft shows eight source lines and the exact total', async ({ page }) => {
  const response = await page.goto(`${base}/billing/invoices/${qaMixedInvoiceId}`);
  expect(response?.status()).toBe(200);
  const main = page.locator('main');
  await expect(main).toContainText('Draft');
  for (let worker = 1; worker <= 8; worker++)
    await expect(main).toContainText(`QA mixed-rate invoice worker ${worker}`);
  await expect(main).toContainText('64.00');
  await expect(main).toContainText('€3,640.00');
  await expect(main).toContainText('€70.00');
  await expect(main).toContainText('€55.00');
  await expect(page.getByRole('link', { name: 'Download PDF · Preview' })).toHaveAttribute(
    'href',
    `${base}/api/invoices/${qaMixedInvoiceId}/draft-preview?lang=en`,
  );
  const viewport = page.viewportSize();
  if (viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width + 1,
    );
  await page.reload();
  await expect(main).toContainText('€3,640.00');
});

test('owner can edit the QA project alias and restore it after reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const url = `${base}/projects/${projectId}`;
  await page.goto(url);
  await page.locator('[data-project-edit-cta]').click();
  const form = page.locator('form[action="?/updateProject"]');
  await expect(form).toBeVisible();
  const alias = form.locator('[name="projectAlias"]');
  const original = await alias.inputValue();
  const temporary = `QA browser acceptance ${Date.now()}`;
  try {
    await alias.fill(temporary);
    await form.getByRole('button', { name: 'Save project' }).click();
    await page.goto(url);
    await page.locator('[data-project-edit-cta]').click();
    await expect(page.locator('form[action="?/updateProject"] [name="projectAlias"]')).toHaveValue(
      temporary,
    );
  } finally {
    await page.goto(url);
    await page.locator('[data-project-edit-cta]').click();
    const restore = page.locator('form[action="?/updateProject"]');
    await restore.locator('[name="projectAlias"]').fill(original);
    await restore.getByRole('button', { name: 'Save project' }).click();
    await page.goto(url);
    await page.locator('[data-project-edit-cta]').click();
    await expect(page.locator('form[action="?/updateProject"] [name="projectAlias"]')).toHaveValue(
      original,
    );
  }
});
