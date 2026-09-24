import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const projectId = process.env.JA_PROD_QA_PROJECT_ID;
function statePath(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must point to an existing browser state`);
  return value;
}
const workerState = statePath('JA_PRODUCTION_WORKER_AUTH_STATE');
const financeState = statePath('JA_PRODUCTION_FINANCE_AUTH_STATE');
const chiefState = statePath('JA_PRODUCTION_CHIEF_AUTH_STATE');

test.beforeAll(() => {
  if (!projectId || !/^[0-9a-f-]{36}$/iu.test(projectId))
    throw new Error('JA_PROD_QA_PROJECT_ID must identify the designated QA project');
});

test.describe('worker session', () => {
  test.use({ storageState: workerState });

  test('can follow the project time workflow without seeing private finance terms', async ({
    page,
  }) => {
    await page.goto(`${base}/projects/${projectId}`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(
      /worker compensation rule|internal cost rate/i,
    );
    await page.goto(`${base}/time?project=${projectId}`);
    await page.getByRole('button', { name: 'Log time', exact: true }).click();
    await expect(page.locator('form[action="?/createTime"] [name="projectId"]')).toHaveValue(
      projectId!,
    );
    const finance = await page.request.get(`${base}/finance?view=commercial&project=${projectId}`, {
      maxRedirects: 0,
    });
    expect([302, 303, 403]).toContain(finance.status());
  });
});

test.describe('finance session', () => {
  test.use({ storageState: financeState });

  test('can inspect project rules and issuing authority after reload', async ({ page }) => {
    await page.goto(`${base}/finance?view=commercial&project=${projectId}`);
    await expect(page.locator('[data-commercial-terms-summary]')).toBeVisible();
    await expect(page.locator('[data-project-legal-entity]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-commercial-terms-summary]')).toBeVisible();
  });
});

test.describe('chief session', () => {
  test.use({ storageState: chiefState });

  test('sees only delegated operational team entry without pay or client rates', async ({
    page,
  }) => {
    const response = await page.goto(`${base}/crew?project=${projectId}&date=2026-09-24`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Log team hours' })).toBeVisible();
    const entry = page.locator('form[action="?/createBatch"]');
    await expect(entry.locator('[name="workerIds"]')).toHaveCount(2);
    await expect(page.locator('main')).not.toContainText(
      /worker compensation|internal cost|client rate/i,
    );
  });

  test('can open a delegated worker expense with project and hours preselected', async ({
    page,
  }) => {
    await page.goto(`${base}/crew?project=${projectId}&date=2026-09-24`);
    const expenseLink = page
      .locator('.entry-list li')
      .filter({ hasText: 'External Technician Test · 45 minutes' })
      .getByRole('link', { name: 'Add expense for External Technician Test' });
    await expect(expenseLink).toBeVisible();
    const href = await expenseLink.getAttribute('href');
    const expenseUrl = new URL(href!, page.url());
    const timeId = expenseUrl.searchParams.get('timeEntry');
    const workerId = expenseUrl.searchParams.get('worker');
    expect(timeId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(workerId).toMatch(/^[0-9a-f-]{36}$/iu);
    await expenseLink.click();
    const form = page.locator('form[data-expense-entry-surface]');
    await expect(form).toBeVisible();
    await expect(form.locator('[name="projectId"]')).toHaveValue(projectId!);
    await expect(form.locator('[name="timeEntryId"]')).toHaveValue(timeId!);
    await expect(form.locator('[name="workerId"]')).toHaveValue(workerId!);
    await expect(page.locator('main')).not.toContainText(
      /worker compensation|internal cost|client rate/i,
    );
    const viewport = page.viewportSize();
    if (viewport)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width + 1,
      );
  });
});
