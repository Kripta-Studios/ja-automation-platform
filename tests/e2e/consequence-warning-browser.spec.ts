import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

function seedWarningRecords(viewport: string, instance: number) {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const date = new Date().toISOString().slice(0, 10);
  try {
    const idFor = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(idFor(e2eCredentials.owner.email));
    const managerId = idFor(e2eCredentials.manager.email);
    const workerId = idFor(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Warning browser ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-WARNING', 93, viewport, instance),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: date,
      projectManagerId: managerId,
    }).id;
    const status = (
      database.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable warning browser project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: date });
    const worker = repository.principalFor(workerId);
    const draft = repository.createTimeEntry(worker, {
      projectId,
      workDate: date,
      category: 'regular',
      minutes: 60,
      summary: 'Draft warning browser work',
    });
    const submitted = repository.createTimeEntry(worker, {
      projectId,
      workDate: date,
      category: 'regular',
      minutes: 30,
      summary: 'Submitted warning browser work',
    });
    repository.submitTime(worker, submitted.id, submitted.version);
    const expense = repository.createExpense(worker, {
      projectId,
      spentOn: date,
      vendor: 'Warning browser vendor',
      category: 'hotel',
      description: 'Warning browser expense',
      currency: 'EUR',
      amountMinor: 12_500n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      receiptRequired: false,
    });
    repository.submitExpense(worker, expense.id, expense.version);
    repository.operationalApproveExpense(owner, expense.id, 'approved');
    return { projectId, draftId: draft.id, submittedId: submitted.id, expenseId: expense.id };
  } finally {
    database.sqlite.close();
  }
}

function browserDiagnostics(page: Page) {
  const pageErrors: string[] = [];
  const posts: string[] = [];
  const failedResponses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { pageErrors, posts, failedResponses };
}

test('worker sees time and expense consequences before submission', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const fixture = seedWarningRecords(info.project.name, 1);
  await signIn(page, 'worker');
  const diagnostics = browserDiagnostics(page);

  await page.goto(portal(`/time?lang=es&project=${fixture.projectId}`));
  const timeRow = page.locator('.time-record').filter({
    has: page.locator(`a[href$="/time/${fixture.draftId}"]`),
  });
  const submitWarning = timeRow.locator('[data-problem-code="WARNING_TIME_SUBMIT_REVIEW"]');
  await expect(submitWarning).toBeVisible();
  await expect(submitWarning).toHaveAttribute('data-kind', 'warning');
  await expect(submitWarning).toContainText('Ya no se puede editar directamente');
  await expect(
    submitWarning.getByRole('link', { name: 'Revisar el borrador de horas' }),
  ).toHaveAttribute('href', new RegExp(`/time/${fixture.draftId}$`));
  const weekWarning = page.locator('[data-problem-code="WARNING_TIME_WEEK_SUBMIT_ALL_DRAFTS"]');
  await expect(weekWarning).toBeVisible();
  const weekDraftCount = (
    JSON.parse(
      await page.locator('form[action="?/submitTimeWeek"] input[name="entries"]').inputValue(),
    ) as unknown[] | null
  )?.length;
  await expect(weekWarning).toContainText(`${weekDraftCount} registros de horas en borrador`);
  await expect(
    weekWarning.getByRole('link', { name: 'Revisar los borradores de la semana' }),
  ).toHaveAttribute('href', /#time-records$/);

  await page.goto(portal(`/expenses?lang=pt&project=${fixture.projectId}`));
  await page.getByRole('button', { name: 'Registrar despesa', exact: true }).first().click();
  const expenseForm = page.locator('form[action="?/createExpense"]');
  const payerWarning = expenseForm.locator(
    '[data-problem-code="WARNING_EXPENSE_PAYER_SEPARATE_TREATMENT"]',
  );
  await expect(payerWarning).toBeVisible();
  await expect(payerWarning).toHaveAttribute('data-kind', 'warning');
  await expect(payerWarning).toContainText('O reembolso ao trabalhador');
  await expect(payerWarning).toContainText('cobrança ao cliente');
  await expect(payerWarning.locator('a')).toHaveCount(0);
  await expenseForm.locator('[name="whoPaid"]').selectOption('company_card');
  await expect(payerWarning).toBeVisible();
  await expect(expenseForm.locator('[name="whoPaid"]')).toHaveValue('company_card');
  expect(diagnostics.posts).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.failedResponses.every(
      ({ status, path }) => status === 503 && path.endsWith('/api/offline/identity'),
    ),
  ).toBe(true);
});

test('reviewer sees factual approval warning and record-scoped remedy', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const fixture = seedWarningRecords(info.project.name, 2);
  const role = info.project.name === 'phone-390' ? 'manager' : 'owner';
  await signIn(page, role);
  const diagnostics = browserDiagnostics(page);
  await page.goto(portal('/approvals?tab=time&lang=en'));
  const approveForm = page
    .locator('form[action="?/approveRecord"]')
    .filter({ has: page.locator(`input[name="id"][value="${fixture.submittedId}"]`) })
    .filter({ has: page.locator('input[name="decision"][value="approved"]') });
  const approveWarning = approveForm.locator(
    '[data-problem-code="WARNING_OPERATIONAL_APPROVAL_FINANCE_SEPARATE"]',
  );
  await expect(approveWarning).toBeVisible();
  await expect(approveWarning).toHaveAttribute('data-kind', 'warning');
  await expect(approveWarning).toContainText(
    'does not decide customer billing or worker reimbursement',
  );
  await expect(approveWarning.getByRole('link', { name: 'Review this record' })).toHaveAttribute(
    'href',
    new RegExp(`/time/${fixture.submittedId}$`),
  );

  const row = approveForm.locator('xpath=..');
  await row.getByText('Review actions').first().click();
  const returnForm = row
    .locator('form[action="?/approveRecord"]')
    .filter({ has: page.locator('input[name="decision"][value="needs_changes"]') });
  const returnWarning = returnForm.locator(
    '[data-problem-code="WARNING_OPERATIONAL_RETURN_FACTUAL_CORRECTION"]',
  );
  await expect(returnWarning).toBeVisible();
  await expect(returnWarning).toContainText('State the specific change needed');
  await expect(returnWarning.getByRole('link', { name: 'Review this record' })).toHaveAttribute(
    'href',
    new RegExp(`/time/${fixture.submittedId}$`),
  );
  expect(diagnostics.posts).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('finance sees invoice issuance and adjustment consequences in context', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const database = createDatabase(readE2EFixturePointer().databasePath);
  let approvedId = '';
  let issuedId = '';
  try {
    const draft = database.sqlite
      .prepare("SELECT id FROM invoice WHERE state='draft' ORDER BY created_at LIMIT 1")
      .get() as { id: string } | undefined;
    const issued = database.sqlite
      .prepare("SELECT id FROM invoice WHERE state='issued' ORDER BY created_at LIMIT 1")
      .get() as { id: string } | undefined;
    expect(draft).toBeDefined();
    expect(issued).toBeDefined();
    approvedId = draft!.id;
    issuedId = issued!.id;
    // This disposable UI fixture exposes the pre-issue state without issuing an invoice.
    database.sqlite.prepare("UPDATE invoice SET state='approved' WHERE id=?").run(approvedId);
  } finally {
    database.sqlite.close();
  }

  await signIn(page, 'finance');
  const diagnostics = browserDiagnostics(page);
  await page.goto(portal('/billing?view=invoices&lang=en'));
  const openInvoice = async (id: string) => {
    if (info.project.name === 'phone-390') {
      await page.locator(`[data-billing-invoice-list] a[href="#invoice-${id}"]`).click();
    } else {
      const row = page.locator(`tr[data-invoice-row="${id}"]`);
      await expect(row).toBeVisible();
      await row.locator('td:last-child button').click();
    }
  };
  await openInvoice(approvedId);
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const issueWarning = sheet.locator('[data-problem-code="WARNING_BILLING_ISSUE_LOCKS_DRAFT"]');
  await expect(issueWarning).toBeVisible();
  await expect(issueWarning).toHaveAttribute('data-kind', 'warning');
  await expect(issueWarning).toContainText('immutable issued snapshot');
  await expect(sheet.locator('form[action="?/issueInvoice"]')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.goto(portal('/billing?view=invoices&lang=es'));
  await openInvoice(issuedId);
  const adjustment = sheet.locator('details').filter({
    has: page.locator('form[action="?/createInvoiceAdjustment"]'),
  });
  await adjustment.locator('summary').click();
  const adjustmentWarning = adjustment.locator(
    '[data-problem-code="WARNING_BILLING_ADJUSTMENT_AUDIT"]',
  );
  await expect(adjustmentWarning).toBeVisible();
  await expect(adjustmentWarning).toContainText('La factura emitida no cambia');
  expect(diagnostics.posts).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('accounting warns about versioned artifacts before generating a pack', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const locale = info.project.name === 'phone-390' ? 'es' : 'pt';
  await signIn(page, 'finance');
  const diagnostics = browserDiagnostics(page);
  await page.goto(portal(`/accounting?lang=${locale}`));
  await page.locator('#accounting-generate details.ui-disclosure summary').click();
  const form = page.locator('form[action="?/createAccountingPack"]');
  await expect(form).toBeVisible();
  const warning = form.locator('[data-problem-code="WARNING_ACCOUNTING_PACK_NEW_VERSION"]');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('data-kind', 'warning');
  await expect(warning).toContainText(
    locale === 'es' ? 'genera una nueva versión del paquete' : 'gere uma nova versão do pacote',
  );
  expect(diagnostics.posts).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('finance classification warning separates billing from reimbursement', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const fixture = seedWarningRecords(info.project.name, 3);
  await signIn(page, 'finance');
  const diagnostics = browserDiagnostics(page);
  await page.goto(portal(`/finance?view=commercial&lang=en&project=${fixture.projectId}`));
  const expense = page.locator(`[data-finance-expense-id="${fixture.expenseId}"]`);
  await expect(expense).toBeVisible();
  await expense.getByRole('button', { name: 'Classify' }).click();
  const warning = expense.locator(
    '[data-problem-code="WARNING_FINANCE_CLASSIFICATION_BILLING_ONLY"]',
  );
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('data-kind', 'warning');
  await expect(warning).toContainText('Worker reimbursement is decided separately');
  await expect(warning.locator('a')).toHaveCount(0);
  expect(diagnostics.posts).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});
