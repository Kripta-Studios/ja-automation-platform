import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const workerId = process.env.JA_PROD_QA_WORKER_ID;
const resumeExpenseId = process.env.JA_PROD_QA_GUIDANCE_EXPENSE_ID;

test.beforeAll(() => {
  for (const [name, value] of [
    ['JA_PROD_QA_PROJECT_ID', projectId],
    ['JA_PROD_QA_WORKER_ID', workerId],
  ]) {
    if (!value || !/^[0-9a-f-]{36}$/iu.test(value))
      throw new Error(`${name} must identify a designated disposable QA record`);
  }
});

test('unclassified expense guides Finance review to its exact classification form', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One guarded live write on desktop');
  test.setTimeout(120_000);
  let expenseId = resumeExpenseId;
  await page.goto(`${base}/expenses?project=${projectId}&lang=en`);
  if (!expenseId) {
    const marker = `QA GUIDANCE ${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('[data-expense-primary-cta]').click();
    const create = page.locator('form[data-expense-entry-surface]').first();
    await expect(create).toBeVisible();
    await create.locator('[name="workerId"]').selectOption(workerId!);
    await create.locator('[name="projectId"]').selectOption(projectId!);
    await create.locator('[name="spentOn"]').fill(today);
    await create.locator('[name="occurredTimeLocal"]').fill('11:25');
    await create.locator('[name="vendor"]').fill(marker);
    await create.locator('[name="amount"]').fill('1');
    await create.locator('[name="currency"]').selectOption('EUR');
    await create
      .locator('[name="description"]')
      .fill('Disposable browser check of expense review guidance');
    await create.getByRole('button', { name: 'Save draft' }).click();
    await expect(create).toBeHidden({ timeout: 15_000 });
    await page.reload();
    const created = page.locator('[data-expense-record]').filter({ hasText: marker });
    await expect(created).toBeVisible();
    expenseId = (await created.getAttribute('data-expense-record')) ?? undefined;
  }
  const expense = page.locator(`[data-expense-record="${expenseId}"]`);
  await expect(expense).toBeVisible();
  expect(expenseId).toMatch(/^[0-9a-f-]{36}$/iu);
  if (await expense.locator('form[action="?/submitExpense"]').count())
    await expense
      .locator('form[action="?/submitExpense"]')
      .getByRole('button', { name: 'Submit' })
      .click();
  await page.goto(`${base}/approvals?project=${projectId}&lang=en`);
  await page.getByRole('tab', { name: /^Expenses\b/u }).click();
  const operational = page.locator(`[data-approval-row="${expenseId}"]`);
  if (await operational.count())
    await operational
      .locator('form[action="?/approveRecord"]')
      .getByRole('button', { name: 'Approve' })
      .click();

  await page.goto(`${base}/approvals?project=${projectId}&lang=en`);
  const finance = page.locator(`[data-finance-review-row="${expenseId}"]`);
  await expect(finance).toBeVisible();
  await expect(finance.locator('[data-finance-classification-required]')).toContainText(
    'Classify this expense before Finance review.',
  );
  await expect(finance.locator('form[action="?/financeApprove"]')).toHaveCount(0);
  await expect(finance.getByRole('button', { name: 'Record Finance review' })).toHaveCount(0);
  const classificationLink = finance.getByRole('link', { name: 'Classify expense in Finance →' });
  const href = await classificationLink.getAttribute('href');
  expect(href).toContain(`project=${projectId}`);
  expect(href).toContain(`expense=${expenseId}`);
  expect(href).toContain('#expense-classification');
  await classificationLink.click();
  await expect(page).toHaveURL(
    new RegExp(`project=${projectId}.*expense=${expenseId}#expense-classification`),
  );
  const classification = page.locator(`[data-finance-expense-id="${expenseId}"]`);
  await expect(classification).toBeVisible();
  await expect(classification.locator('form[data-finance-expense-classification]')).toBeVisible();
  await expect(
    classification.locator('form[data-finance-expense-classification] input[name="expenseId"]'),
  ).toHaveValue(expenseId!);
  await page.reload();
  await expect(classification.locator('form[data-finance-expense-classification]')).toBeVisible();
});
