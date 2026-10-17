import { randomUUID } from 'node:crypto';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { stepUpB5Principal } from '../fixtures/b5-lifecycle-security-fixture.js';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type BillingFixture = Readonly<{
  databasePath: string;
  projectId: string;
  ruleId: string;
  timeId: string;
  sourceLabel: string;
  start: string;
  end: string;
  workDate: string;
}>;

function monthPeriod(now = new Date()): Pick<BillingFixture, 'start' | 'end'> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function seedBillingFixture(info: TestInfo): BillingFixture {
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  try {
    const { sqlite } = database;
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    const userId = (email: string) => {
      const row = sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as
        | { id: string }
        | undefined;
      if (!row) throw new Error(`SOTA billing fixture user is missing: ${email}`);
      return row.id;
    };
    const owner = stepUpB5Principal(
      sqlite,
      repository.principalFor(userId(e2eCredentials.owner.email)),
      `sota-billing-owner-${randomUUID()}`,
    );
    const finance = stepUpB5Principal(
      sqlite,
      repository.principalFor(userId(e2eCredentials.finance.email)),
      `sota-billing-finance-${randomUUID()}`,
    );
    let manager = stepUpB5Principal(
      sqlite,
      repository.principalFor(userId(e2eCredentials.manager.email)),
      `sota-billing-manager-${randomUUID()}`,
    );
    let worker = stepUpB5Principal(
      sqlite,
      repository.principalFor(userId(e2eCredentials.worker.email)),
      `sota-billing-worker-${randomUUID()}`,
    );
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const nameSuffix = `${info.project.name} ${suffix}`;
    const { start, end } = monthPeriod();
    const workerMinutesOnDate = sqlite.prepare(
      `SELECT COALESCE(SUM(minutes),0) AS minutes
       FROM time_entry
       WHERE worker_id=? AND work_date=?
         AND approval_state NOT IN ('void','rejected')
         AND NOT EXISTS(
           SELECT 1 FROM record_correction_link rcl
           JOIN time_entry correction ON correction.id=rcl.correction_id
           WHERE rcl.record_type='time_entry' AND rcl.original_id=time_entry.id
             AND correction.approval_state<>'rejected'
         )`,
    );
    const startInstant = new Date(`${start}T00:00:00Z`);
    const endInstant = new Date(`${end}T00:00:00Z`);
    let workDate = '';
    for (
      const candidate = new Date(startInstant.getTime());
      candidate <= endInstant;
      candidate.setUTCDate(candidate.getUTCDate() + 1)
    ) {
      const workDay = candidate.toISOString().slice(0, 10);
      const minutes = workerMinutesOnDate.get(worker.userId, workDay) as { minutes: number };
      if (Number(minutes?.minutes ?? 0) + 60 <= 1440) {
        workDate = workDay;
        break;
      }
    }
    if (!workDate)
      throw new Error('No prior-month day has capacity for the SOTA billing fixture time entry.');
    const yearStart = `${new Date().getUTCFullYear() - 1}-01-01`;
    const client = repository.createClient(owner, {
      legalName: `SOTA billing client ${nameSuffix} Ltd.`,
      displayName: `SOTA billing ${nameSuffix}`,
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: `sota-billing-${suffix.toLowerCase()}@example.test`,
      billingAddress: 'Disposable SOTA billing fixture, Austin, TX',
      paymentTermsDays: 30,
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: `SOTA billing ${nameSuffix}`,
      costCenterCode: e2eCostCenter(
        'QA-SOTA-BILL',
        88,
        info.project.name,
        parseInt(suffix.slice(0, 2), 16) % 100,
      ),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: yearStart,
    });
    const projectStatus = sqlite
      .prepare('SELECT status FROM project WHERE id=?')
      .get(project.id) as { status: string };
    if (projectStatus.status !== 'active')
      repository.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Activate disposable SOTA billing browser fixture',
      });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: manager.userId,
      startsOn: yearStart,
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: worker.userId,
      startsOn: yearStart,
    });
    manager = { ...manager, projectIds: new Set([...manager.projectIds, project.id]) };
    worker = { ...worker, projectIds: new Set([...worker.projectIds, project.id]) };

    const legalName = `SOTA billing issuer ${suffix}`;
    const entity = repository.createLegalEntity(owner, {
      code: `SOTABILL-${suffix}`,
      legalName,
      currency: 'USD',
      billingAddress: '100 Test Street, Austin, TX 78701, US',
      companyIdentifiers: `SOTA-BILL-${suffix}`,
    });
    const revision = v3.createCanonicalLegalEntityRevision(finance, {
      legacyLegalEntityId: entity.id,
      effectiveFrom: yearStart,
      legalName,
      taxIdentifier: `SOTA-${suffix}`,
      addressLine1: '100 Test Street',
      locality: 'Austin',
      region: 'TX',
      postalCode: '78701',
      countryCode: 'US',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: 'Disposable SOTA billing browser fixture',
      idempotencyKey: `sota-billing-revision-${randomUUID()}`,
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: project.id,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: yearStart,
      reason: 'Disposable SOTA billing browser fixture',
      idempotencyKey: `sota-billing-assignment-${randomUUID()}`,
    });
    v3.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: worker.userId,
      currency: 'USD',
      hourlyRateMinor: 6000n,
      overtimeMethod: 'NONE',
      effectiveFrom: yearStart,
    });
    v3.createInternalCostRule(finance, {
      projectId: project.id,
      workerId: worker.userId,
      currency: 'USD',
      hourlyRateMinor: 1500n,
      overtimeMethod: 'NONE',
      effectiveFrom: yearStart,
    });
    v3.createCompensationRule(finance, {
      workerId: worker.userId,
      projectId: project.id,
      currency: 'USD',
      ruleType: 'Hourly',
      rateMinor: 2000n,
      overtimeMethod: 'NONE',
      travelMethod: 'BASE',
      effectiveFrom: yearStart,
    });
    const rule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      currency: 'USD',
      effectiveFrom: yearStart,
      paymentTermsDays: 30,
    });
    const sourceLabel = `SOTA billing approved source ${suffix}`;
    const time = repository.createTimeEntry(worker, {
      projectId: project.id,
      workDate,
      category: 'regular',
      minutes: 60,
      summary: sourceLabel,
    });
    repository.submitTime(worker, time.id, time.version);
    repository.operationalApproveTime(manager, time.id, 'approved');
    repository.financeApproveTime(finance, time.id, true);

    return {
      databasePath,
      projectId: project.id,
      ruleId: rule.id,
      timeId: time.id,
      sourceLabel,
      start,
      end,
      workDate,
    };
  } finally {
    database.sqlite.close();
  }
}

function financialHistory(databasePath: string, ruleId: string) {
  const database = createDatabase(databasePath);
  try {
    return {
      invoices: (
        database.sqlite
          .prepare('SELECT COUNT(*) AS count FROM invoice WHERE billing_rule_id=?')
          .get(ruleId) as { count: number }
      ).count,
      events: (
        database.sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM invoice_event event
             JOIN invoice ON invoice.id=event.invoice_id
             WHERE invoice.billing_rule_id=?`,
          )
          .get(ruleId) as { count: number }
      ).count,
    };
  } finally {
    database.sqlite.close();
  }
}

function reserveSelectedSource(fixture: BillingFixture): void {
  const database = createDatabase(fixture.databasePath);
  try {
    const repository = new PortalRepository(database.sqlite);
    const user = database.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.finance.email) as { id: string };
    const finance = stepUpB5Principal(
      database.sqlite,
      repository.principalFor(user.id),
      `sota-billing-reserve-${randomUUID()}`,
    );
    repository.createInvoiceDraft(finance, fixture.ruleId, fixture.start, fixture.end);
  } finally {
    database.sqlite.close();
  }
}

async function openComposer(page: Page, fixture: BillingFixture) {
  const row = page.locator(`[data-billing-rule="${fixture.ruleId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Create invoice|Crear factura|Criar fatura/ }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await expect(sheet).toBeVisible();
  const composer = sheet.locator('[data-invoice-composer]');
  await expect(composer).toBeAttached();
  const source = composer
    .locator('.composer-record')
    .filter({ hasText: fixture.sourceLabel })
    .locator('input[type="checkbox"]');
  await expect(source).toBeVisible();
  await expect(source).toBeEnabled();
  await source.check();
  const dateFields = composer.locator('.composer-fields input[type="date"]');
  const dates = [
    await dateFields.nth(0).inputValue(),
    await dateFields.nth(1).inputValue(),
  ] as const;
  expect(dates[0]).toBe(fixture.start);
  expect(dates[1]).toBe(fixture.end);
  expect(fixture.workDate >= dates[0] && fixture.workDate <= dates[1]).toBe(true);
  return { row, sheet, composer, source, dates };
}

test('invoice stream editor preserves scope and selected sources across cancel, server errors and revalidation retry', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  let failNextInventory = false;
  let inventoryFailureCount = 0;
  let updatePostCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/updateBillingRule'))
      updatePostCount += 1;
  });
  await page.route('**/app/api/billing/composer?*', async (route) => {
    if (failNextInventory && inventoryFailureCount === 0 && route.request().method() === 'GET') {
      failNextInventory = false;
      inventoryFailureCount += 1;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  const fixture = seedBillingFixture(info);
  const historyBefore = financialHistory(fixture.databasePath, fixture.ruleId);
  await signIn(page, 'finance');
  await page.goto(
    portal(`/billing?view=streams&project=${encodeURIComponent(fixture.projectId)}&lang=en`),
  );
  await page.waitForLoadState('networkidle');
  const row = page.locator(`[data-billing-rule="${fixture.ruleId}"]`);

  await expect(row.getByRole('button', { name: /Edit stream settings/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Archive billing stream/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Close sources/ })).toBeVisible();

  await row.getByRole('button', { name: /Archive billing stream/ }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await expect(sheet.locator('#billing-stream-archive')).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /Close sources/ }).click();
  await expect(page.locator('[data-ui="responsive-sheet"] #billing-stream-close')).toBeVisible();
  await page
    .locator('[data-ui="responsive-sheet"]')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page.locator('[data-ui="responsive-sheet"]')).toBeHidden();

  const composerState = await openComposer(page, fixture);
  const { composer, source, dates } = composerState;
  await expect(source).toBeChecked();
  await expect(composer.locator('.composer-summary')).toContainText('1');
  await expect(
    composer.locator('.composer-record').filter({ hasText: fixture.sourceLabel }),
  ).toContainText(fixture.workDate);
  await page.screenshot({ path: info.outputPath(`sota-billing-invoice-${info.project.name}.png`) });

  await composer
    .getByRole('button', { name: /Calculate invoice|Preview|Calcular factura/ })
    .click();
  await expect(composer.locator('.composer-line').first()).toBeVisible();
  const modes = sheet.locator('[data-invoice-creation-modes] button');
  await modes.nth(1).click();
  const wholePeriod = sheet.locator('[data-invoice-creation-mode="whole_period"]');
  await expect(wholePeriod).toBeVisible();
  const detailIndex = sheet.locator('[data-invoice-details-overview]');
  await expect(detailIndex.getByRole('button')).toHaveCount(9);
  await expect(detailIndex).toContainText('All 12 details appear in these three stages');
  await page.screenshot({ path: info.outputPath(`sota-billing-index-${info.project.name}.png`) });
  for (const section of [2, 3, 5, 6, 7, 8, 9, 10, 11]) {
    const shortcut = detailIndex
      .getByRole('button')
      .nth([2, 3, 5, 6, 7, 8, 9, 10, 11].indexOf(section));
    await shortcut.click();
    await expect(wholePeriod.locator(`#invoice-wizard-section-${section}`)).toBeVisible();
  }
  await modes.nth(0).click();
  await expect(composer).toBeVisible();
  await expect(source).toBeChecked();
  await expect(composer.locator('.composer-line').first()).toBeVisible();
  const editSelected = sheet.locator(`#invoice-stream-record-edit-${fixture.ruleId}`);
  await expect(editSelected).toBeVisible();
  await editSelected.click();
  const dialog = page.locator('[data-ui="responsive-sheet"]');
  const editor = dialog.locator('[data-billing-stream-editor]');
  await expect(editor).toHaveAttribute('data-returns-to-invoice', 'true');
  await expect(editor).toContainText(`SOTA billing ${info.project.name}`);
  await expect(editor.locator('[name="paymentTermsDays"]')).toHaveValue('30');
  await expect(editor.locator('[name="recipientEmail"]')).not.toHaveAttribute('required', '');
  await expect(page.locator('[data-invoice-creation-mode="records"]')).toHaveJSProperty(
    'hidden',
    true,
  );
  await expect(source).toBeChecked();
  await page.screenshot({ path: info.outputPath(`sota-billing-editor-${info.project.name}.png`) });

  await page.keyboard.press('Tab');
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);

  // A confirmed cancel leaves the server settings, period and selected source unchanged.
  await editor.locator('[name="paymentTermsDays"]').fill('31');
  const discardDialog = page.waitForEvent('dialog').then((dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discardDialog;
  await expect(editor).toBeHidden();
  await expect(source).toBeChecked();
  expect(financialHistory(fixture.databasePath, fixture.ruleId)).toEqual(historyBefore);

  await page.locator(`#invoice-stream-record-edit-${fixture.ruleId}`).click();
  const retryEditor = page.locator('[data-ui="responsive-sheet"] [data-billing-stream-editor]');
  const recipient = retryEditor.locator('[name="recipientEmail"]');
  await recipient.fill('not-an-email');
  const nativeInvalidPostCount = updatePostCount;
  await retryEditor.getByRole('button', { name: 'Save billing stream' }).click();
  expect(await recipient.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(
    true,
  );
  expect(updatePostCount).toBe(nativeInvalidPostCount);
  const guidedRecovery = page.locator('[data-ui="guided-recovery"]');
  await expect(guidedRecovery).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guidedRecovery).toBeHidden();
  await expect(retryEditor).toBeVisible();
  await expect(recipient).toHaveValue('not-an-email');

  await recipient.fill(`billing-${info.project.name.replaceAll('-', '')}@example.test`);
  const terms = retryEditor.locator('[name="paymentTermsDays"]');
  await terms.evaluate((input: HTMLInputElement) => input.removeAttribute('max'));
  await terms.fill('999');
  expect(await terms.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
  const invalidAction = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/updateBillingRule'),
  );
  await retryEditor.getByRole('button', { name: 'Save billing stream' }).click();
  const invalidResponse = await invalidAction;
  expect(invalidResponse.request().method()).toBe('POST');
  expect(updatePostCount).toBe(nativeInvalidPostCount + 1);
  let actionEnvelope: unknown;
  try {
    actionEnvelope = JSON.parse(await invalidResponse.text());
  } catch {
    actionEnvelope = null;
  }
  if (actionEnvelope && typeof actionEnvelope === 'object') {
    const envelope = actionEnvelope as Record<string, unknown>;
    if ('type' in envelope) expect(envelope.type).toBe('failure');
    if ('status' in envelope) expect(Number(envelope.status)).toBeGreaterThanOrEqual(400);
  }
  await expect(guidedRecovery).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guidedRecovery).toBeHidden();
  await expect(retryEditor).toBeVisible();
  await expect(terms).toHaveValue('999');
  await expect(terms).toHaveAttribute('aria-invalid', 'true');
  const errorSummary = retryEditor.locator('[data-billing-recovery-summary]');
  await expect(errorSummary).toBeVisible();
  const errorLink = errorSummary.locator('a');
  await expect(errorLink).toHaveAttribute('href', /^#billing-recovery-\d+-paymentTermsDays$/);
  const fieldId = await terms.getAttribute('id');
  await expect(errorLink).toHaveAttribute('href', `#${fieldId}`);
  await expect(errorLink).toContainText('Payment terms (days)');
  await expect(source).toBeChecked();

  await terms.fill('45');
  failNextInventory = true;
  const failedInventory = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes('/app/api/billing/composer?') &&
      response.status() === 503,
  );
  const goodSave = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/updateBillingRule') &&
      response.status() < 400,
  );
  await retryEditor.getByRole('button', { name: 'Save billing stream' }).click();
  await goodSave;
  await failedInventory;
  await expect(retryEditor).toBeHidden();
  const warning = page.locator('.billing-section__stream-editor-feedback[role="status"]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('revalidation could not be confirmed');
  await expect(warning).toContainText('No invoice draft was created or issued');
  expect(inventoryFailureCount).toBe(1);
  const [dateStart, dateEnd] = await Promise.all([
    composer.locator('.composer-fields input[type="date"]').nth(0).inputValue(),
    composer.locator('.composer-fields input[type="date"]').nth(1).inputValue(),
  ]);
  expect([dateStart, dateEnd]).toEqual(dates);
  await expect(composer.locator('.composer-line')).toHaveCount(0);

  await page.locator(`#invoice-stream-record-edit-${fixture.ruleId}`).click();
  const secondEditor = page.locator('[data-ui="responsive-sheet"] [data-billing-stream-editor]');
  await expect(secondEditor.locator('[name="paymentTermsDays"]')).toHaveValue('45');
  await secondEditor.locator('[name="paymentTermsDays"]').fill('46');
  await secondEditor.getByRole('button', { name: 'Save billing stream' }).click();
  await expect(secondEditor).toBeHidden();
  const success = page.locator('.billing-section__stream-editor-feedback[role="status"]');
  await expect(success).toContainText('same project, dates, and selected records were kept');
  await expect(success).toContainText('readiness and preview were refreshed');
  await expect(source).toBeChecked();
  await expect(composer.locator('.composer-line').first()).toBeVisible();
  expect(await composer.locator('.composer-fields input[type="date"]').nth(0).inputValue()).toBe(
    dates[0],
  );
  expect(await composer.locator('.composer-fields input[type="date"]').nth(1).inputValue()).toBe(
    dates[1],
  );
  expect(financialHistory(fixture.databasePath, fixture.ruleId)).toEqual(historyBefore);
  const persisted = createDatabase(fixture.databasePath);
  try {
    const termsValue = persisted.sqlite
      .prepare('SELECT payment_terms_days AS value FROM billing_rule WHERE id=?')
      .get(fixture.ruleId) as { value: number };
    expect(termsValue.value).toBe(46);
  } finally {
    persisted.sqlite.close();
  }
  expect(runtimeErrors).toEqual([]);
});

test('selected stream editing waits for an active record preview', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(120_000);
  const fixture = seedBillingFixture(info);
  await signIn(page, 'finance');
  await page.goto(
    portal(`/billing?view=streams&project=${encodeURIComponent(fixture.projectId)}&lang=en`),
  );
  await page.waitForLoadState('networkidle');
  const { sheet, composer, source } = await openComposer(page, fixture);
  const historyBefore = financialHistory(fixture.databasePath, fixture.ruleId);
  const editButton = sheet.locator(`#invoice-stream-record-edit-${fixture.ruleId}`);
  const editor = sheet.locator('[data-billing-stream-editor]');
  let releasePreview = () => {};
  let markPreviewStarted = () => {};
  const previewStarted = new Promise<void>((resolve) => {
    markPreviewStarted = resolve;
  });
  await page.route('**/app/api/billing/composer*', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as { operation?: string };
      if (input.operation === 'preview') {
        markPreviewStarted();
        await new Promise<void>((resolve) => {
          releasePreview = resolve;
        });
      }
    }
    await route.continue();
  });

  try {
    const previewButton = composer.getByRole('button', { name: /Calculate invoice|Preview/ });
    const previewClick = previewButton.click();
    await previewStarted;
    await expect(source).toBeChecked();
    await expect(editButton).toBeDisabled();
    await expect(editButton).toHaveAttribute(
      'title',
      'Finish the current invoice operation before editing this stream.',
    );
    await expect(sheet.locator(`#invoice-stream-record-edit-help-${fixture.ruleId}`)).toContainText(
      'Finish the current invoice operation before editing this stream.',
    );
    await expect(editor).toBeHidden();
    releasePreview();
    await previewClick;
    await expect(composer.locator('.composer-line').first()).toBeVisible();
    await expect(editButton).toBeEnabled();
    expect(financialHistory(fixture.databasePath, fixture.ruleId)).toEqual(historyBefore);
  } finally {
    releasePreview();
  }
});

test('a source reserved during editing is pruned and named after same-scope revalidation', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(120_000);
  const fixture = seedBillingFixture(info);
  await signIn(page, 'finance');
  await page.goto(
    portal(`/billing?view=streams&project=${encodeURIComponent(fixture.projectId)}&lang=en`),
  );
  await page.waitForLoadState('networkidle');
  const composerState = await openComposer(page, fixture);
  const { sheet, composer, source, dates } = composerState;
  await expect(source).toBeChecked();
  await composer.getByRole('button', { name: /Calculate invoice|Preview/ }).click();
  await expect(composer.locator('.composer-line').first()).toBeVisible();

  // Simulate the source being reserved by another valid finance operation after selection.
  reserveSelectedSource(fixture);
  const historyAfterExternalDraft = financialHistory(fixture.databasePath, fixture.ruleId);
  expect(historyAfterExternalDraft.invoices).toBe(1);
  await expect(composer.locator('.composer-summary')).toContainText('Selected records: 1');
  await expect(source).toBeChecked();

  await sheet.locator(`#invoice-stream-record-edit-${fixture.ruleId}`).click();
  const editor = sheet.locator('[data-billing-stream-editor]');
  await expect(source).toBeChecked();
  await expect(composer.locator('.composer-summary')).toContainText('Selected records: 1');
  await editor.locator('[name="paymentTermsDays"]').fill('32');
  await editor.getByRole('button', { name: 'Save billing stream' }).click();
  await expect(editor).toBeHidden();
  const notice = page.locator('.billing-section__stream-editor-feedback[role="status"]');
  await expect(notice).toContainText(
    '1 selected source record is no longer eligible and was removed',
  );
  await expect(composer.locator('.composer-summary')).toContainText('Selected records: 0');
  await expect(source).not.toBeChecked();
  await expect(source).toBeDisabled();
  const affected = composer.locator('.composer-record').filter({ hasText: fixture.sourceLabel });
  await expect(affected).toBeVisible();
  await expect(affected).toContainText(
    /already included in a draft or invoice|ya está incluido en un borrador o una factura|já está incluído em um rascunho ou fatura/i,
  );
  await expect(
    affected.getByRole('link', { name: /View draft|Ver borrador|Ver rascunho/ }),
  ).toBeVisible();
  await expect(composer.locator('.composer-line')).toHaveCount(0);
  await expect(composer.locator('.composer-fields input[type="date"]').nth(0)).toHaveValue(
    dates[0],
  );
  await expect(composer.locator('.composer-fields input[type="date"]').nth(1)).toHaveValue(
    dates[1],
  );
  expect(financialHistory(fixture.databasePath, fixture.ruleId)).toEqual(historyAfterExternalDraft);
});

test('invoice details and stream editor copy stay localized with all nine shortcuts visible', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(120_000);
  const fixture = seedBillingFixture(info);
  await signIn(page, 'finance');

  for (const locale of ['en', 'es', 'pt'] as const) {
    await page.goto(
      portal(
        `/billing?view=streams&project=${encodeURIComponent(fixture.projectId)}&lang=${locale}`,
      ),
    );
    await page.waitForLoadState('networkidle');
    const row = page.locator(`[data-billing-rule="${fixture.ruleId}"]`);
    await row.getByRole('button', { name: /Create invoice|Crear factura|Criar fatura/ }).click();
    const sheet = page.locator('[data-ui="responsive-sheet"]');
    await sheet.locator('[data-invoice-creation-modes] button').nth(1).click();
    const index = sheet.locator('[data-invoice-details-overview]');
    await expect(index.getByRole('button')).toHaveCount(9);
    await expect(index).toContainText(
      locale === 'en'
        ? 'All 12 details appear in these three stages'
        : locale === 'es'
          ? 'Los 12 detalles se muestran en estas tres etapas'
          : 'Os 12 detalhes aparecem nestas três etapas',
    );
    await index.getByRole('button').nth(0).click();
    const streamDetails = sheet.locator('#invoice-wizard-section-2');
    await expect(streamDetails).toContainText(
      locale === 'en'
        ? 'The tax profile is read-only in the stream editor'
        : locale === 'es'
          ? 'El perfil fiscal es de solo lectura en el editor'
          : 'O perfil fiscal é somente leitura no editor',
    );
    await index.getByRole('button').nth(4).click();
    const taxDetails = sheet.locator('#invoice-wizard-section-7');
    await expect(taxDetails).toContainText(
      locale === 'en'
        ? 'The invoice editor cannot change the profile'
        : locale === 'es'
          ? 'El editor de facturas no puede cambiar el perfil'
          : 'O editor de faturas não pode alterar o perfil',
    );
    await expect(taxDetails).toContainText(
      locale === 'en'
        ? 'New effective-dated conditions'
        : locale === 'es'
          ? 'Nuevas condiciones con fecha de vigencia'
          : 'Novas condições com data de vigência',
    );
    await sheet.locator('[data-invoice-creation-modes] button').nth(0).click();
    const selectedEditorButton = sheet.locator(`#invoice-stream-record-edit-${fixture.ruleId}`);
    await expect(selectedEditorButton).toContainText(
      locale === 'en'
        ? 'Edit selected stream settings'
        : locale === 'es'
          ? 'Editar ajustes del flujo seleccionado'
          : 'Editar configurações do fluxo selecionado',
    );
    await selectedEditorButton.click();
    const editor = sheet.locator('[data-billing-stream-editor]');
    await expect(editor.locator('h2')).toContainText(
      locale === 'en'
        ? 'Edit this billing stream'
        : locale === 'es'
          ? 'Editar este flujo de facturación'
          : 'Editar este fluxo de faturamento',
    );
    await expect(editor.locator('[name="recipientEmail"]')).not.toHaveAttribute('required', '');
    await expect(editor).toContainText(
      locale === 'en'
        ? 'Origin: the saved recipient for this stream. Optional'
        : locale === 'es'
          ? 'Origen: destinatario guardado para este flujo. Es opcional'
          : 'Origem: destinatário salvo neste fluxo. É opcional',
    );
    if (locale !== 'en') await expect(editor).not.toContainText('Origin:');
    await expect(editor).toContainText(
      locale === 'en'
        ? 'Issued invoice snapshots and history do not change.'
        : locale === 'es'
          ? 'Las facturas emitidas y su historial no cambian.'
          : 'As faturas emitidas e seu histórico não mudam.',
    );
    await expect(
      editor.getByRole('button', {
        name:
          locale === 'en'
            ? 'New effective-dated conditions'
            : locale === 'es'
              ? 'Nuevas condiciones con fecha de vigencia'
              : 'Novas condições com data de vigência',
      }),
    ).toBeVisible();
    const updateHistory = financialHistory(fixture.databasePath, fixture.ruleId);
    await editor.locator('[data-billing-stream-update-form] button[type="submit"]').click();
    await expect(editor).toBeHidden();
    const noSelectionNotice = page.locator(
      '.billing-section__stream-editor-feedback[role="status"]',
    );
    await expect(noSelectionNotice).toContainText(
      locale === 'en'
        ? 'No source records are selected, so no record preview was needed'
        : locale === 'es'
          ? 'No hay registros seleccionados, así que no se necesitaba una vista previa de registros'
          : 'Nenhum registro está selecionado, então não era necessária uma prévia de registros',
    );
    expect(financialHistory(fixture.databasePath, fixture.ruleId)).toEqual(updateHistory);
    await expect(editor).toBeHidden();
    let closePromptAccepted: Promise<void> | null = null;
    const acceptClosePrompt = (dialog: import('@playwright/test').Dialog) => {
      closePromptAccepted = dialog.accept();
    };
    page.once('dialog', acceptClosePrompt);
    await sheet
      .getByRole('button', {
        name: locale === 'en' ? 'Close' : locale === 'es' ? 'Cerrar' : 'Fechar',
      })
      .click();
    if (closePromptAccepted) await closePromptAccepted;
    page.off('dialog', acceptClosePrompt);
    await expect(sheet).toBeHidden();
  }
});
