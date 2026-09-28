import { expect, test, type Page } from '@playwright/test';

const base = '/j-aautomation/app';
const clientId = process.env.JA_PROD_QA_CLIENT_ID;
const workerId = process.env.JA_PROD_QA_WORKER_ID;

test.beforeAll(() => {
  if (!clientId || !/^[0-9a-f-]{36}$/iu.test(clientId)) throw new Error('Designated QA client required');
  if (!workerId || !/^[0-9a-f-]{36}$/iu.test(workerId)) throw new Error('Designated QA worker required');
});

async function projectIdFor(page: Page, name: string): Promise<string> {
  await page.goto(`${base}/projects`);
  await page.getByRole('searchbox', { name: 'Search: Project' }).fill(name);
  const row = page.locator('.project-list-link').filter({ hasText: name });
  await expect(row).toBeVisible();
  const href = await row.locator('a[href*="/projects/"]').first().getAttribute('href');
  const id = href?.match(/\/projects\/([0-9a-f-]{36})/iu)?.[1];
  if (!id) throw new Error(`No project detail link for ${name}`);
  return id;
}

async function createConfiguredProject(page: Page, mode: 'combined' | 'separate', marker: string) {
  const name = `QA invoice ${mode} ${marker}`;
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`${base}/projects`);
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const create = page.locator('form[action="?/createProject"]');
  await create.locator('[name="clientId"]').selectOption(clientId!);
  await create.locator('[name="name"]').fill(name);
  await create.locator('[name="costCenterCode"]').fill('QA-INVOICE-MODES');
  await create.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('[data-project-setup-next]')).toBeVisible();
  const projectId = await projectIdFor(page, name);

  await page.goto(`${base}/projects?action=assign-worker&project=${projectId}`);
  const assign = page.locator('form[action="?/assignWorker"]');
  await expect(assign).toBeVisible();
  await assign.locator('[name="projectId"]').selectOption(projectId);
  await assign.locator('[name="workerId"]').selectOption(workerId!);
  await assign.locator('[name="startsOn"]').fill(today);
  await assign.getByRole('button', { name: 'Assign', exact: true }).click();
  await page.goto(`${base}/projects/${projectId}?tab=billing`);
  const setup = page.getByRole('region', { name: 'Project billing setup' });
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  const person = setup.locator('.person-terms').first();
  await expect(person).toBeVisible();
  await person.getByLabel('Customer hourly rate').fill('55');
  await person.getByLabel('Worker compensation rate').fill('30');
  await person.getByLabel('Expense payer').selectOption('worker');
  await person.getByLabel('Reimburse worker').selectOption('at_cost');
  await person.getByLabel('Charge customer for expense').selectOption('at_cost');
  await person.getByRole('button', { name: 'Save person terms' }).click();
  await expect(person).toContainText('Configured');
  await page.reload();
  if (mode === 'separate') await setup.getByText('Two separate invoices').click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByLabel('Labor billing cadence').selectOption('manual');
  if (mode === 'separate') await setup.getByLabel('Expense billing cadence').selectOption('manual');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Save billing setup' }).click();
  await expect(setup.getByText('Billing setup saved')).toBeVisible();
  await page.reload();
  await expect(setup.locator('[name="mode"]')).toHaveValue(mode);
  return { projectId, name, today };
}

for (const mode of ['combined', 'separate'] as const) test(`actual approved labor and expense create ${mode} draft invoice(s)`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  test.setTimeout(180_000);
  const marker = mode === 'combined'
    ? process.env.JA_PROD_QA_INVOICE_RESUME_MARKER || `${Date.now()}`
    : process.env.JA_PROD_QA_INVOICE_SEPARATE_RESUME_MARKER || `${Date.now()}`;
  const resumedProjectId = mode === 'combined'
    ? process.env.JA_PROD_QA_INVOICE_RESUME_PROJECT_ID
    : process.env.JA_PROD_QA_INVOICE_SEPARATE_RESUME_PROJECT_ID;
  const { projectId, today } = resumedProjectId
    ? { projectId: resumedProjectId, today: new Date().toISOString().slice(0, 10) }
    : await createConfiguredProject(page, mode, marker);
  const summary = `QA ${mode} hours ${marker}`;
  const expenseName = resumedProjectId ? `QA expense ${marker}` : `QA ${mode} expense ${marker}`;
  await page.goto(`${base}/time?project=${projectId}`);
  if (!(await page.locator('.time-record').filter({ hasText: summary }).count())) {
    await page.locator('[data-time-primary-cta]').click();
    const time = page.locator('form[data-time-entry-surface]').first();
    await time.locator('[name="workerId"]').selectOption(workerId!);
    await time.locator('[name="projectId"]').selectOption(projectId);
    await time.locator('[name="workDate"]').fill(today);
    await time.getByLabel('Actual hours').fill('2');
    await time.locator('[name="summary"]').fill(summary);
    await time.getByLabel('Add an expense with these hours').check();
    await time.locator('[name="expenseVendor"]').fill(expenseName);
    await time.locator('[name="expenseAmount"]').fill('10');
    await time.locator('[name="expenseCurrency"]').selectOption('EUR');
    await time.locator('[name="expenseOccurredTimeLocal"]').fill('12:00');
    await time.locator('[name="expenseDescription"]').fill('QA combined labor and expense test');
    await time.getByRole('button', { name: 'Save draft' }).click();
  }
  await page.goto(`${base}/time?project=${projectId}`);
  const row = page.locator('.time-record').filter({ hasText: summary });
  await expect(row).toBeVisible();
  if (await row.locator('form[action="?/submitTime"]').count())
    await row.locator('form[action="?/submitTime"]').getByRole('button', { name: 'Submit' }).click();
  await page.goto(`${base}/time?project=${projectId}`);
  await expect(row).toContainText(/Submitted|Approved/u);
  const timeNeedsApproval = (await row.innerText()).includes('Submitted');
  const timeHref = await row.locator('a.time-record-link').getAttribute('href');
  const timeId = timeHref?.match(/\/time\/([0-9a-f-]{36})/iu)?.[1];
  if (!timeId) throw new Error('Saved QA time has no detail identity');

  await page.goto(`${base}/expenses?project=${projectId}`);
  const expense = page.locator('[data-expense-record]').filter({ hasText: expenseName });
  await expect(expense).toBeVisible();
  const expenseHref = await expense.locator('a').first().getAttribute('href');
  const expenseId = expenseHref?.match(/\/expenses\/([0-9a-f-]{36})/iu)?.[1];
  if (!expenseId) throw new Error('Saved QA expense has no detail identity');
  if (await expense.locator('form[action="?/submitExpense"]').count())
    await expense.locator('form[action="?/submitExpense"]').getByRole('button', { name: 'Submit' }).click();
  await page.goto(`${base}/expenses?project=${projectId}`);
  await expect(expense).toContainText(/Submitted|Approved/u);
  const expenseNeedsApproval = (await expense.innerText()).includes('Submitted');

  await page.goto(`${base}/approvals?project=${projectId}`);
  const timeApproval = page.locator(`[data-approval-row="${timeId}"]`);
  if (timeNeedsApproval) {
    await expect(timeApproval).toBeVisible();
    await timeApproval.locator('form[action="?/approveRecord"]').first().getByRole('button', { name: 'Approve' }).click();
  }
  await page.goto(`${base}/approvals?project=${projectId}`);
  await page.getByRole('tab', { name: /^Expenses\b/ }).click();
  const expenseApproval = page.locator(`[data-approval-row="${expenseId}"]`);
  if (expenseNeedsApproval) {
    await expect(expenseApproval).toBeVisible();
    await expenseApproval.locator('form[action="?/approveRecord"]').first().getByRole('button', { name: 'Approve' }).click();
  }

  await page.goto(`${base}/finance?view=commercial&project=${projectId}`);
  await page.locator('#finance-configuration-task').selectOption('Project issuing authority');
  const authority = page.locator('form[data-project-legal-entity-form]');
  await expect(authority).toBeVisible();
  const existingAuthority = page.locator('[data-project-legal-entity-row]').filter({ hasText: today });
  if (!(await existingAuthority.count())) {
    await authority.locator('[name="projectId"]').selectOption(projectId);
    const revisionOption = authority
      .locator('[name="legalEntityRevisionId"] option')
      .filter({ hasText: 'TEST ONLY' });
    await expect(revisionOption).toContainText('EUR');
    const revisionId = await revisionOption.getAttribute('value');
    if (!revisionId) throw new Error('Reviewed synthetic EUR issuing entity is unavailable');
    await authority.locator('[name="legalEntityRevisionId"]').selectOption(revisionId);
    await authority.locator('[name="effectiveFrom"]').fill(today);
    await authority.locator('[name="reason"]').fill('QA invoice draft verification using synthetic legal entity');
    await authority.getByRole('button', { name: 'Save issuing authority' }).click();
    await page.goto(`${base}/finance?view=commercial&project=${projectId}`);
    await page.locator('#finance-configuration-task').selectOption('Project issuing authority');
  }
  await expect(page.locator('[data-project-legal-entity-row]').filter({ hasText: today })).toBeVisible();
  await page.getByRole('group', { name: 'Expense classification inbox' }).getByRole('button', { name: /^All\b/u }).click();
  const classification = page.locator(`[data-finance-expense-id="${expenseId}"]`);
  await expect(classification).toBeVisible();
  if (await classification.getByRole('button', { name: 'Classify', exact: true }).count()) {
    await classification.getByRole('button', { name: 'Classify', exact: true }).click();
    const classificationForm = classification.locator('form[data-finance-expense-classification]');
    await expect(classificationForm.locator('[data-expense-policy-preview]')).toBeVisible();
    await classificationForm.locator('[name="reason"]').fill('QA browser verified configured worker expense treatment');
    await classificationForm.getByRole('button', { name: 'Save Finance classification' }).click();
  }
  await page.goto(`${base}/finance?view=commercial&project=${projectId}`);
  await page.getByRole('group', { name: 'Expense classification inbox' }).getByRole('button', { name: /^All\b/u }).click();
  await expect(classification).toContainText('Classified');
  await page.reload();
  await page.goto(`${base}/finance?view=commercial&project=${projectId}`);
  await page.getByRole('group', { name: 'Expense classification inbox' }).getByRole('button', { name: /^All\b/u }).click();
  await expect(classification).toContainText('Classified');

  await page.goto(`${base}/approvals?project=${projectId}`);
  const timeFinance = page.locator(`[data-finance-review-row="${timeId}"]`);
  if (await timeFinance.count()) {
    await timeFinance.locator('select[name="billable"]').selectOption('yes');
    await timeFinance.getByRole('button', { name: 'Record Finance review' }).click();
  }
  await expect(timeFinance).toHaveCount(0);
  await page.goto(`${base}/approvals?project=${projectId}`);
  const expenseFinance = page.locator(`[data-finance-review-row="${expenseId}"]`);
  if (await expenseFinance.count())
    await expenseFinance.getByRole('button', { name: 'Record Finance review' }).click();
  await expect(expenseFinance).toHaveCount(0);

  await page.goto(`${base}/projects/${projectId}?tab=billing`);
  const setup = page.getByRole('region', { name: 'Project billing setup' });
  const modeChanged = (await setup.locator('[name="mode"]').inputValue()) !== mode;
  if (modeChanged && mode === 'separate') await setup.getByText('Two separate invoices').click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  if (modeChanged || (await setup.getByLabel('Labor billing cadence').inputValue()) !== 'manual' ||
      (mode === 'separate' && (await setup.getByLabel('Expense billing cadence').inputValue()) !== 'manual')) {
    await setup.getByLabel('Labor billing cadence').selectOption('manual');
    if (mode === 'separate') await setup.getByLabel('Expense billing cadence').selectOption('manual');
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Save billing setup' }).click();
    await expect(setup.getByText('Billing setup saved')).toBeVisible();
    await page.reload();
  }
  for (const stream of mode === 'combined' && resumedProjectId ? [] : mode === 'combined' ? ['labor'] : ['labor', 'expense']) {
    await page.goto(`${base}/projects/${projectId}?tab=billing`);
    await page.getByRole('button', { name: 'Create invoice draft', exact: true }).click();
    const draft = page.locator('form.invoice-draft-form');
    await expect(draft).toBeVisible();
    const rule = draft.locator('[name="billingRuleId"] option').filter({ hasText: new RegExp(stream, 'iu') });
    const ruleId = await rule.getAttribute('value');
    if (!ruleId) throw new Error(`No ${stream} billing stream on ${mode} QA project`);
    await draft.locator('[name="billingRuleId"]').selectOption(ruleId);
    await draft.locator('[name="periodStart"]').fill(today);
    await draft.locator('[name="periodEnd"]').fill(today);
    await draft.getByRole('button', { name: 'Create draft', exact: true }).click();
    await page.goto(`${base}/billing?view=invoices&project=${projectId}`);
    await expect(page.locator('[data-billing-invoice-list] tr[data-invoice-state="draft"]').filter({
      hasText: stream === 'expense' ? '€10.00' : '€110.00',
    })).toBeVisible();
  }

  await page.goto(`${base}/billing?view=invoices&project=${projectId}`);
  const rows = page.locator('[data-billing-invoice-list] tr[data-invoice-state="draft"]');
  await expect(rows).toHaveCount(mode === 'combined' ? 1 : 2);
  const expected = mode === 'combined' ? [{ amount: '€120.00', groups: 2 }] : [{ amount: '€110.00', groups: 1 }, { amount: '€10.00', groups: 1 }];
  for (const item of expected) {
    const invoiceRow = rows.filter({ hasText: item.amount });
    await expect(invoiceRow).toBeVisible();
    const href = await invoiceRow.locator('a[href*="/billing/invoices/"]').first().getAttribute('href');
    const invoiceId = href?.match(/\/invoices\/([0-9a-f-]{36})/iu)?.[1];
    if (!invoiceId) throw new Error('Draft invoice has no detail identity');
    await page.goto(`${base}/billing/invoices/${invoiceId}`);
    await expect(page.locator('main')).toContainText(item.amount);
    await expect(page.locator('.invoice-line-group')).toHaveCount(item.groups);
    if (item.amount !== '€10.00') await expect(page.locator('main')).toContainText(summary);
    if (item.amount !== '€110.00') await expect(page.locator('main')).toContainText(expenseName);
    await page.reload();
    await expect(page.locator('main')).toContainText(item.amount);
    const pdf = await page.request.get(`${base}/api/invoices/${invoiceId}/draft-preview?lang=en`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toMatch(/application\/pdf/u);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    await page.goto(`${base}/billing?view=invoices&project=${projectId}`);
  }
});
