import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';

/**
 * Canonical Client Essential browser evidence.
 *
 * This suite intentionally uses the current accessible contracts rather than
 * implementation classes.  It is a cross-role smoke of the implemented
 * vertical slices; the broader responsive, keyboard and accessibility suites
 * remain the detailed geometry/evidence owners.
 */

const forbiddenCommercialControlPattern =
  /(?:client(?:rate|billing|treatment)|billing(?:rate|treatment)|tax(?:profile|bps|rate|amount)|internal(?:cost|rate)|contribution|margin|markup|overtime(?:rate|multiplier|threshold)|travel(?:billable|billing))/i;

const forbiddenSerializedFinanceKeyPattern =
  /"(?:client(?:_rate|_treatment)|clientRate|clientTreatment|billing(?:_treatment|_rate)|billingTreatment|tax(?:_profile|_bps|_rate|_amount)|taxProfile|taxBps|internal(?:_cost|_rate)|internalCost|contribution(?:_margin)?|margin|markup(?:_bps)?|overtime(?:_threshold|_rate|_multiplier)|overtimeThreshold|travel(?:_billable|_billing)|travelBillable)"\s*:/i;

const forbiddenRenderedFinanceLabelPattern =
  /(?:client rate|client billing|client treatment|tax profile|internal cost|contribution(?: margin)?|markup|overtime threshold|travel billability)/i;

function skipUnlessProject(testInfo: { project: { name: string } }, project: string): void {
  test.skip(testInfo.project.name !== project);
}

async function selectFirstAssignedProject(form: Locator): Promise<void> {
  const select = form.locator('select[name="projectId"]');
  await expect(select).toBeVisible();
  const optionValue = await select.locator('option').evaluateAll((options) => {
    const option = options.find((candidate) => (candidate as HTMLOptionElement).value.trim());
    return option ? (option as HTMLOptionElement).value : '';
  });
  expect(optionValue, 'the fixture must expose an assigned project option').not.toBe('');
  await select.selectOption(optionValue);
}

async function stepUpFinance(page: Page): Promise<void> {
  const response = await page.request.post(portal('/api/step-up'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { password: e2eCredentials.finance.password },
  });
  expect(response.ok(), 'Finance mutation evidence requires a session-bound step-up').toBe(true);
}

async function openFinanceProjectWithUnlockedExpense(page: Page): Promise<void> {
  const projectValues = await page
    .locator('select[name="project"] option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter((value) => value.trim()),
    );
  for (const projectId of projectValues) {
    await page.goto(portal(`/finance?project=${encodeURIComponent(projectId)}`));
    if ((await page.locator('[data-finance-expense-classification]').count()) > 0) return;
  }
  throw new Error('The deterministic fixture has no unlocked Finance expense classification row');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectOperationalOnly(page: Page, route: string): Promise<void> {
  const controls = await page
    .locator('input:not([type="hidden"]), select, textarea')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute('name') ?? '',
        id: element.getAttribute('id') ?? '',
        ariaLabel: element.getAttribute('aria-label') ?? '',
        label: element.closest('label')?.textContent?.trim() ?? '',
      })),
    );
  expect(
    controls.filter((control) =>
      forbiddenCommercialControlPattern.test(
        `${control.name} ${control.id} ${control.ariaLabel} ${control.label}`,
      ),
    ),
    'Worker controls must contain operational inputs only',
  ).toEqual([]);

  const response = await page.request.get(portal(route));
  expect(response.status(), `authenticated ${route} projection must be readable`).toBe(200);
  const serverHtml = await response.text();
  expect(
    serverHtml,
    `server projection for ${route} must not serialize Finance-only fields`,
  ).not.toMatch(forbiddenSerializedFinanceKeyPattern);
}

async function expectNoPmFinanceProjection(page: Page, route: string): Promise<void> {
  const response = await page.request.get(portal(route));
  expect(response.status(), `PM ${route} projection must be readable`).toBe(200);
  const serverHtml = await response.text();
  expect(
    serverHtml,
    `PM ${route} server projection must omit Finance-only serialized fields`,
  ).not.toMatch(forbiddenSerializedFinanceKeyPattern);

  const rendered = await page.locator('main').innerText();
  expect(
    rendered,
    `PM ${route} rendered projection must not expose Finance-only labels`,
  ).not.toMatch(forbiddenRenderedFinanceLabelPattern);
}

test.describe('Client Essential · Worker operational truth', () => {
  test('Worker can record time, Travel, Standby, receipt expense, reports and own pay', async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, 'phone-390');
    await signIn(page, 'worker');

    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText(/10 H EXPECTED/i)).toHaveCount(0);
    await expectOperationalOnly(page, '/');

    await page.goto(portal('/time'));
    await expect(page.getByRole('heading', { name: 'Time entries', exact: true })).toBeVisible();
    await expectOperationalOnly(page, '/time');
    await page.locator('[data-time-primary-cta]').click();

    const travelForm = page.locator('form[data-time-entry-surface]').first();
    await expect(travelForm).toBeVisible();
    await selectFirstAssignedProject(travelForm);
    await travelForm.locator('input[name="workDate"]').fill('2026-08-24');
    await travelForm.locator('select[name="category"]').selectOption('travel');
    await expect(travelForm.getByText('Travel operational detail')).toBeVisible();
    await expect(travelForm.locator('input[name="activityCode"]')).toBeVisible();
    await travelForm.locator('input[name="activityCode"]').fill('Airport to commissioning site');
    await travelForm.locator('input[name="minutes"]').fill('45');
    await travelForm
      .locator('textarea[name="summary"]')
      .fill('Travelled from the airport to the commissioning site.');
    await expectOperationalOnly(page, '/time');
    await travelForm.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Time draft saved')).toBeVisible();

    await page.locator('[data-time-primary-cta]').click();
    const standbyForm = page.locator('form[data-time-entry-surface]').first();
    await expect(standbyForm).toBeVisible();
    await selectFirstAssignedProject(standbyForm);
    await standbyForm.locator('input[name="workDate"]').fill('2026-08-24');
    await standbyForm.locator('select[name="category"]').selectOption('standby');
    await expect(standbyForm.getByText('Standby reason')).toBeVisible();
    await standbyForm.locator('input[name="activityCode"]').fill('Awaiting controlled test window');
    await standbyForm.locator('input[name="minutes"]').fill('30');
    await standbyForm
      .locator('textarea[name="summary"]')
      .fill('Held available for the controlled test window.');
    await expectOperationalOnly(page, '/time');
    await standbyForm.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Time draft saved')).toBeVisible();

    await page.goto(portal('/expenses'));
    await expect(
      page.getByRole('heading', { name: 'Expenses and reimbursements', exact: true }),
    ).toBeVisible();
    await expectOperationalOnly(page, '/expenses');
    await page.locator('[data-expense-primary-cta]').click();
    const expenseForm = page.locator('form[data-expense-entry-surface]').first();
    await expect(expenseForm).toBeVisible();
    await expect(expenseForm.locator('input[name="clientTreatment"]')).toHaveCount(0);
    await expect(expenseForm.locator('select[name="billingTreatment"]')).toHaveCount(0);
    await expect(expenseForm.locator('input[name="markupBps"]')).toHaveCount(0);
    await selectFirstAssignedProject(expenseForm);
    await expenseForm.locator('input[name="spentOn"]').fill('2026-08-24');
    await expenseForm.locator('select[name="category"]').selectOption('hotel');
    await expenseForm.locator('input[name="vendor"]').fill('Essential Worker Receipt');
    await expenseForm.locator('input[name="amount"]').fill('24.50');
    await expenseForm.locator('select[name="currency"]').selectOption('USD');
    await expenseForm.locator('select[name="whoPaid"]').selectOption('worker');
    await expenseForm
      .locator('textarea[name="description"]')
      .fill('Operational receipt submitted from the Worker flow.');
    await expenseForm.locator('input[name="paymentMethod"]').fill('Cash');
    await expenseForm.locator('input[name="receipt"]').setInputFiles({
      name: 'essential-worker-receipt.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    let expensePostData = '';
    const expenseRequestListener = (request: import('@playwright/test').Request): void => {
      if (request.method() === 'POST' && request.url().includes('?/createExpense'))
        expensePostData = request.postData() ?? '';
    };
    page.on('request', expenseRequestListener);
    await expenseForm.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Expense draft saved')).toBeVisible();
    page.off('request', expenseRequestListener);
    expect(expensePostData).not.toMatch(forbiddenCommercialControlPattern);
    await expect(
      page.locator('[data-expense-record]').filter({ hasText: 'Essential Worker Receipt' }),
    ).toHaveCount(1);

    await page.goto(portal('/reports'));
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Technical / PLC', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toBeVisible();
    await expectOperationalOnly(page, '/reports');

    await page.getByRole('button', { name: 'New daily report', exact: true }).click();
    const dailyForm = page.locator('form[data-report-entry-surface="daily"]');
    await expect(dailyForm).toBeVisible();
    await selectFirstAssignedProject(dailyForm);
    await dailyForm.locator('input[name="workDate"]').fill('2026-08-24');
    await dailyForm.locator('input[name="siteShift"]').fill('Line 4 · first shift');
    await dailyForm
      .locator('textarea[name="summary"]')
      .fill('Recorded the operational transfer and site arrival.');
    await dailyForm
      .locator('textarea[name="tasksCompleted"]')
      .fill('Confirmed site arrival and documented the shift context.');
    await dailyForm.getByRole('button', { name: 'Save daily report' }).click();
    await expect(page.getByText('Daily report draft saved')).toBeVisible();

    await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
    await page.getByRole('button', { name: 'New technical report', exact: true }).click();
    const technicalForm = page.locator('form[data-report-entry-surface="technical"]');
    await expect(technicalForm).toBeVisible();
    await selectFirstAssignedProject(technicalForm);
    await technicalForm.locator('input[name="systemName"]').fill('Line 4 PLC station');
    await technicalForm
      .locator('textarea[name="changeSummary"]')
      .fill('Documented controls validation completed during the shift.');
    await technicalForm.getByRole('button', { name: 'Save PLC report' }).click();
    await expect(page.getByText('PLC report draft saved')).toBeVisible();

    await page.goto(portal('/pay'));
    await expect(page.getByRole('heading', { name: 'My Pay', exact: true })).toBeVisible();
    await expect(
      page.getByText('This view contains only your own time', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText('Alex Rivera', { exact: true })).toBeVisible();
    for (const otherWorker of ['Rafael Santos', 'Maya Chen', 'Daniel Brooks', 'Elena Costa'])
      await expect(page.getByText(otherWorker, { exact: true })).toHaveCount(0);
    await expectOperationalOnly(page, '/pay');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Client Essential · PM operational scope', () => {
  test('PM can review projects, approvals and reports without Finance projection fields', async ({
    page,
  }) => {
    await signIn(page, 'manager');

    await page.goto(portal('/projects'));
    await expect(
      page.getByRole('heading', { name: 'Authorized projects', exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href*="/app/projects/"]').first()).toBeVisible();
    await expectNoPmFinanceProjection(page, '/projects');
    await expect(page.getByRole('heading', { name: 'Commercial', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0);

    const firstProject = page
      .locator('a.project-section__project-link, a.project-list-link')
      .first();
    await expect(firstProject).toBeVisible();
    await firstProject.click();
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Team', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reports & Files', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Commercial', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Billing', exact: true })).toHaveCount(0);
    await expectNoPmFinanceProjection(
      page,
      new URL(page.url()).pathname.replace('/j-aautomation/app', ''),
    );

    await page.goto(portal('/approvals'));
    await expect(page.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible();
    for (const tab of ['Time', 'Expenses', 'Reports'])
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reports', exact: true })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await page.getByRole('tab', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await expectNoPmFinanceProjection(page, '/approvals');

    await page.goto(portal('/reports'));
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Technical / PLC', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toBeVisible();
    await expectNoPmFinanceProjection(page, '/reports');
  });
});

test.describe('Client Essential · Finance and billing control', () => {
  test('Finance sees canonical planned versus actual projections and separate expense treatment', async ({
    page,
  }) => {
    await signIn(page, 'finance');

    await page.goto(portal('/finance'));
    await openFinanceProjectWithUnlockedExpense(page);
    await expect(
      page.getByRole('heading', { name: 'Finance overview', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-finance-actual]')).toBeVisible();
    await expect(page.locator('[data-finance-expected]')).toBeVisible();
    await expect(page.getByText('Direct Project Result', { exact: true })).toBeVisible();
    await expect(page.getByText('Contribution', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Contribution Margin %', { exact: true })).toBeVisible();
    await expect(page.locator('[data-finance-expense-controls]').first()).toBeVisible();
    await expect(page.locator('[data-finance-expense-id]').first()).toBeVisible();
    await expect(page.locator('[data-finance-expense-classification]').first()).toBeVisible();
    await expect(
      page
        .locator('[data-finance-expense-classification]')
        .first()
        .locator('select[name="expensePreset"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-finance-expense-classification]').first().locator('input[name="taxBps"]'),
    ).toHaveValue('0');
    await expect(page.getByText('Expected reimbursement', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Expected client recovery', { exact: true }).first()).toBeVisible();

    await page.goto(portal('/billing'));
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    for (const stage of ['WIP / Ready', 'Drafts', 'Outstanding', 'Overdue'])
      await expect(page.getByRole('button', { name: stage, exact: true })).toBeVisible();
    await expect(page.locator('[data-invoice-row]').first()).toBeVisible();
    await page.goto(portal('/ledger'));
    await expect(
      page.getByRole('heading', { name: 'Collections / Ledger', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByText('Contribution', { exact: true }).first()).toBeVisible();

    await page.goto(portal('/accounting'));
    await expect(page.getByRole('heading', { name: 'Accounting', exact: true })).toBeVisible();
    await expect(page.locator('form[action="?/createAccountingPack"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Accounting Pack register', exact: true }),
    ).toBeVisible();
  });

  test('Finance can classify an unlocked expense and record then reverse a seeded payment', async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, 'desktop');
    await signIn(page, 'finance');

    await page.goto(portal('/finance?view=commercial'));
    const policyForm = page.locator('form[data-project-commercial-policy-form]');
    await expect(policyForm).toBeVisible();
    const lineProjectOption = policyForm
      .locator('select[name="projectId"] option')
      .filter({ hasText: 'Body Shop Line 4 Controls Upgrade' })
      .first();
    await expect(lineProjectOption).toBeVisible();
    const lineProjectId = await lineProjectOption.getAttribute('value');
    const lineProjectLabel = await lineProjectOption.innerText();
    const lineProjectNumber = lineProjectLabel.split(' — ')[0]?.trim() ?? '';
    expect(lineProjectId).toBeTruthy();
    expect(lineProjectNumber).toBeTruthy();
    await policyForm.locator('select[name="projectId"]').selectOption(lineProjectId!);
    await policyForm.locator('input[name="effectiveFrom"]').fill('2026-01-01');
    await policyForm.locator('input[name="overtimeThresholdMinutes"]').fill('600');
    await policyForm.locator('select[name="travelClientBillable"]').selectOption('true');
    await policyForm.locator('select[name="customerSignoffRequired"]').selectOption('true');
    await stepUpFinance(page);
    await policyForm.getByRole('button', { name: 'Save project policy' }).click();
    await expect(page.getByRole('status').filter({ hasText: /policy/i })).toBeVisible();

    await page.goto(portal('/billing'));
    const lineDraft = page
      .locator('[data-invoice-row]')
      .filter({ hasText: lineProjectNumber })
      .filter({ has: page.locator('form[action="?/approveInvoice"]') })
      .first();
    await expect(lineDraft).toBeVisible();
    await stepUpFinance(page);
    await lineDraft
      .locator('form[action="?/approveInvoice"]')
      .getByRole('button', { name: 'Approve' })
      .click();
    await expect(lineDraft.locator('form[action="?/issueInvoice"]')).toBeVisible();
    await lineDraft
      .locator('form[action="?/issueInvoice"]')
      .getByRole('button', { name: 'Issue invoice' })
      .click();
    const blockers = page.locator('[data-issue-blocker]');
    await expect(blockers).toBeVisible();
    await expect(blockers).toContainText('Invoice issue blocked');
    await expect(blockers.getByRole('link', { name: 'Open sign-off' })).toHaveAttribute(
      'href',
      /\/j-aautomation\/app\/reports(?:\/period\/|\?view=signoff)/,
    );

    await page.goto(portal('/finance'));
    await openFinanceProjectWithUnlockedExpense(page);
    const classification = page.locator('[data-finance-expense-classification]').first();
    await expect(classification).toBeVisible();
    await classification
      .locator('textarea[name="reason"]')
      .fill('Essential Finance classification review');
    await classification.getByRole('button', { name: 'Save Finance classification' }).click();
    await expect(page.getByRole('status').filter({ hasText: /classification/i })).toBeVisible();

    await page.goto(portal('/billing'));
    const paymentForm = page.locator('form[action="?/recordPayment"]').first();
    await expect(paymentForm).toBeVisible();
    const invoiceRow = paymentForm.locator('xpath=ancestor::article[@data-invoice-row]');
    await expect(invoiceRow).toBeVisible();
    await paymentForm.locator('input[name="amount"]').fill('1.00');
    await paymentForm.locator('input[name="receivedOn"]').fill('2026-08-24');
    await paymentForm.locator('input[name="reference"]').fill('Essential partial collection');
    await paymentForm.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Payment recorded' })).toBeVisible();
    await expect(invoiceRow).toContainText(/Partially paid|Paid/);

    const paymentHistory = invoiceRow.getByText('Collections and reversals', { exact: true });
    await paymentHistory.click();
    const reversalForm = invoiceRow.locator('form[action="?/reversePayment"]').first();
    await expect(reversalForm).toBeVisible();
    await reversalForm.locator('input[name="effectiveOn"]').fill('2026-08-24');
    await reversalForm.locator('input[name="reason"]').fill('Essential reversal verification');
    await reversalForm.getByRole('button', { name: 'Reverse payment' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Payment reversal recorded' }),
    ).toBeVisible();
    await expect(invoiceRow.getByText('Immutable reversal history', { exact: true })).toBeVisible();
    await expect(invoiceRow).toContainText('Essential reversal verification');
  });
});

test.describe('Client Essential · Customer-safe report and Owner configuration', () => {
  test('authorized reviewer can inspect a zero-money customer report and sign-off contract', async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, 'desktop');
    await signIn(page, 'finance');
    await page.goto(portal('/reports'));
    await page.getByRole('tab', { name: 'Client Sign-off', exact: true }).click();
    const signoffLink = page.locator('.report-signoff-card a.report-register-link').first();
    await expect(signoffLink).toBeVisible();
    await signoffLink.click();
    await expect(page.locator('[data-customer-signoff]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Customer sign-off', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('It contains no financial information.', { exact: false }),
    ).toBeVisible();

    const customerSignoff = page.locator('[data-customer-signoff]');
    const lifecycle = page.locator('[data-report-lifecycle-state]');
    await expect(lifecycle).toBeVisible();
    const initialLifecycleState = await lifecycle.getAttribute('data-report-lifecycle-state');
    expect(initialLifecycleState).toMatch(/^(review|approved|final)$/);

    // Approval is a real user action and must carry the exact immutable
    // report snapshot binding rendered by the server.  A seeded report may
    // already be approved, so keep this idempotent without bypassing the
    // visible action when it is present.
    const approvalForm = page.locator('form[data-period-report-approval]');
    let snapshotVersion: string | undefined;
    let snapshotSha256: string | undefined;
    if (await approvalForm.count()) {
      expect(initialLifecycleState).toBe('review');
      await expect(approvalForm).toHaveAttribute('action', '?/approve');
      const versionInput = approvalForm.locator('input[name="expectedSnapshotVersion"]');
      const hashInput = approvalForm.locator('input[name="expectedSnapshotSha256"]');
      snapshotVersion = (await versionInput.inputValue()).trim();
      snapshotSha256 = (await hashInput.inputValue()).trim();
      expect(snapshotVersion).toMatch(/^[1-9]\d*$/u);
      expect(snapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
      await expect(
        approvalForm.getByRole('button', { name: 'Approve customer report', exact: true }),
      ).toBeVisible();
      const approvalRequest = page.waitForRequest(
        (request) => request.method() === 'POST' && request.url().includes('?/approve'),
      );
      await approvalForm
        .getByRole('button', { name: 'Approve customer report', exact: true })
        .click();
      const request = await approvalRequest;
      const approvalPayload = new URLSearchParams(request.postData() ?? '');
      expect(approvalPayload.get('expectedSnapshotVersion')).toBe(snapshotVersion);
      expect(approvalPayload.get('expectedSnapshotSha256')).toBe(snapshotSha256);
    } else {
      expect(initialLifecycleState).toMatch(/^(approved|final)$/);
    }

    await expect(lifecycle).toHaveAttribute('data-report-lifecycle-state', /^(approved|final)$/);

    // PDF readiness is supplied by the automatic report fixture/job contract.
    // This test deliberately does not use the privileged "Refresh period
    // reports" control or any normal-user queue-processing action.
    const customerPdf = customerSignoff.locator('a.customer-signoff__pdf');
    await expect(customerPdf).toBeVisible();
    await expect(customerPdf).toHaveAttribute('href', /\/app\/api\/reports\/[^/]+\/pdf$/u);
    await expect(
      page.getByRole('link', { name: 'Preview customer-safe PDF', exact: true }),
    ).toBeVisible();

    const signoffState = customerSignoff.locator('[data-signoff-state]');
    await expect(signoffState).toHaveAttribute(
      'data-signoff-state',
      /^(ready_for_signature|signed)$/,
    );

    const signoffForm = page.locator('form[data-signoff-form]');
    const signedByThisJourney = (await signoffForm.count()) > 0;
    if (signedByThisJourney) {
      await expect(signoffForm).toHaveAttribute('action', '?/sign');
      await expect(signoffForm.locator('input[name="signerName"]')).toBeVisible();
      await expect(signoffForm.locator('input[name="signerIdentity"]')).toBeVisible();
      await expect(
        signoffForm.getByRole('button', { name: 'Record customer sign-off', exact: true }),
      ).toBeVisible();

      await stepUpFinance(page);
      await signoffForm
        .locator('input[name="signerName"]')
        .fill('Client Essential Acceptance Signer');
      await signoffForm
        .locator('input[name="signerIdentity"]')
        .fill('client-essential@example.test');
      await signoffForm
        .getByRole('button', { name: 'Record customer sign-off', exact: true })
        .click();
    }

    await expect(signoffState).toHaveAttribute('data-signoff-state', 'signed');
    await expect(customerSignoff.locator('[data-signoff-notice="signed"] strong')).toHaveText(
      'Signed',
    );

    const facts = customerSignoff.locator('dl.customer-signoff__facts');
    await expect(facts).toBeVisible();
    const signerFact = facts
      .locator('dt')
      .filter({ hasText: /^Signer$/u })
      .locator('xpath=..');
    const signerValue = signerFact.locator('dd');
    await expect(signerValue).toHaveText(
      signedByThisJourney ? 'Client Essential Acceptance Signer' : /\S/u,
    );
    const identityFact = facts
      .locator('dt')
      .filter({ hasText: /^Signer identity$/u })
      .locator('xpath=..');
    const identityValue = identityFact.locator('dd');
    await expect(identityValue).toHaveText(
      signedByThisJourney ? 'client-essential@example.test' : /\S/u,
    );
    const signedAtFact = facts
      .locator('dt')
      .filter({ hasText: /^Signed at$/u })
      .locator('xpath=..');
    await expect(signedAtFact.locator('dd')).toHaveText(/\d/u);
    const versionFact = facts
      .locator('dt')
      .filter({ hasText: /^Report version$/u })
      .locator('xpath=..');
    await expect(versionFact.locator('dd')).toHaveText(
      snapshotVersion ? `v${snapshotVersion}` : /^v\d+$/u,
    );
    await expect(customerSignoff).toContainText(
      'Signed record is immutable. Any correction requires a new report version.',
    );

    const customerBody = await page.locator('main.record-detail-page').innerText();
    expect(customerBody).not.toMatch(forbiddenRenderedFinanceLabelPattern);
    const serverHtml = await page.request.get(page.url()).then((response) => response.text());
    expect(serverHtml).not.toMatch(forbiddenSerializedFinanceKeyPattern);
    if (snapshotSha256) {
      // The exact hash is proven at the approval boundary. The signed
      // projection exposes the immutable version facts but intentionally does
      // not expose financial or internal snapshot contents to the customer.
      expect(snapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    }

    // The Finance mutation journey prepares the deterministic line invoice.
    // Once this report is signed, its issue form must no longer be blocked by
    // customer conformity. A previously issued row remains a valid idempotent
    // outcome and is checked as immutable history.
    const projectNumber = (await page.locator('.record-detail-header .portal-kicker').innerText())
      .split('/')[0]
      ?.trim();
    expect(projectNumber).toBeTruthy();
    await page.goto(portal('/billing'));
    const invoiceRow = page
      .locator('[data-invoice-row]')
      .filter({ hasText: projectNumber! })
      .first();
    await expect(invoiceRow).toBeVisible();
    const issueForm = invoiceRow.locator('form[action="?/issueInvoice"]');
    if (await issueForm.count()) {
      await stepUpFinance(page);
      await issueForm.getByRole('button', { name: 'Issue invoice', exact: true }).click();
      await expect(invoiceRow.locator('[data-invoice-issue-blocker]')).toHaveCount(0);
      await expect(invoiceRow).toContainText(/Issued|Sent|Partially paid|Paid|Overdue/u);
    } else {
      await expect(invoiceRow.locator('[data-invoice-issue-blocker]')).toHaveCount(0);
      await expect(invoiceRow).toContainText(/Issued|Sent|Partially paid|Paid|Overdue/u);
    }
  });

  test('Owner can inspect users, clients, project IA and Finance/Admin configuration', async ({
    page,
  }) => {
    await signIn(page, 'owner');

    await page.goto(portal('/projects'));
    await expect(
      page.getByRole('heading', { name: 'Authorized projects', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(page.getByText('Invite/Create Worker', { exact: true })).toBeVisible();
    await page.getByText('Invite/Create Worker', { exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Invite new worker', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create Invitation', exact: true }),
    ).toBeVisible();
    await page
      .locator('details')
      .filter({ hasText: 'Invite/Create Worker' })
      .locator('summary')
      .click();

    const projectLink = page.locator('a[href*="/app/projects/"]').first();
    await expect(projectLink).toBeVisible();
    await projectLink.click();
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    for (const tab of ['Overview', 'Team', 'Reports & Files', 'Commercial', 'Billing'])
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Commercial', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Commercial configuration', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Finance configuration', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Billing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();

    await page.goto(portal('/finance?view=commercial'));
    await expect(
      page.getByRole('heading', { name: 'Finance overview', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Finance configuration', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Project commercial and time policy', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Overtime threshold (minutes)', { exact: true })).toBeVisible();
  });
});
