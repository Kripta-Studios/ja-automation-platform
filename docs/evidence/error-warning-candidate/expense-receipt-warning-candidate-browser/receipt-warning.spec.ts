import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'cacd8d0aefb48e23d59cc98e2d8758e452f7a55a';
const spentOn = '2026-09-25';
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const redact = (value: unknown) =>
  JSON.stringify(
    value,
    (_key, item) =>
      typeof item === 'string'
        ? item
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
            .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, ':record')
        : item,
    2,
  );

function diagnostics(page: Page) {
  const output = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    expensePosts: [] as Array<{ status: number; contentType: string | null }>,
  };
  page.on('pageerror', (error) => output.pageErrors.push(error.message.slice(0, 160)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      output.consoleErrors.push(message.text().slice(0, 160));
  });
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && response.url().includes('?/createExpense'))
      output.expensePosts.push({
        status: response.status(),
        contentType: response.headers()['content-type'] ?? null,
      });
  });
  return output;
}

async function actionData(response: Awaited<ReturnType<Page['waitForResponse']>>) {
  const body = (await response.json()) as { type: string; status: number; data: string };
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return {
    transportStatus: response.status(),
    type: body.type,
    actionStatus: body.status,
    data: parse(body.data),
  };
}

function auditCount(db: DatabaseSync) {
  return (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count;
}

function savedExpense(db: DatabaseSync, marker: string) {
  return db
    .prepare('SELECT id,approval_state,version,receipt_required FROM expense WHERE vendor=?')
    .get(marker) as
    | { id: string; approval_state: string; version: number; receipt_required: number }
    | undefined;
}

async function createOwnerProject(page: Page, db: DatabaseSync) {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = page.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  expect(clientId).toBeTruthy();
  const name = `Receipt warning QA ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId!);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-RECEIPT-${Date.now() % 100000000}`);
  await form.locator('input[name="startDate"]').fill('2026-09-01');
  await form.locator('input[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const project = db.prepare('SELECT id,status FROM project WHERE name=?').get(name) as {
    id: string;
    status: string;
  };
  expect(project.status).toBe('active');
  return { projectId: project.id, workerId };
}

async function openExpense(
  page: Page,
  locale: 'en' | 'es' | 'pt',
  projectId: string,
  workerId?: string,
) {
  await page.goto(portal(`/expenses?lang=${locale}&project=${projectId}`));
  await page.locator('[data-expense-primary-cta]').first().click();
  const form = page.locator('form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  if (workerId && (await form.locator('select[name="workerId"]').count()))
    await form.locator('select[name="workerId"]').selectOption(workerId);
  if (projectId) await form.locator('select[name="projectId"]').selectOption(projectId);
  else {
    const firstAvailable = await form
      .locator('select[name="projectId"] option:not([value=""]):not([disabled])')
      .first()
      .getAttribute('value');
    if (firstAvailable) await form.locator('select[name="projectId"]').selectOption(firstAvailable);
  }
  return form;
}

async function fillExpense(form: ReturnType<Page['locator']>, marker: string) {
  await form.locator('input[name="spentOn"]').fill(spentOn);
  await form.locator('select[name="category"]').selectOption('parking');
  await form.locator('input[name="vendor"]').fill(marker);
  await form.locator('input[name="amount"]').fill('8.75');
  await form.locator('select[name="currency"]').selectOption('USD');
  await form.locator('select[name="whoPaid"]').selectOption('worker');
  await form
    .locator('textarea[name="description"]')
    .fill('Disposable receipt warning browser check');
  await form.locator('input[name="paymentMethod"]').fill('Cash');
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[data-expense-entry-surface]');
    const notice = form?.querySelector<HTMLElement>(
      '[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]',
    );
    const rect = notice?.getBoundingClientRect();
    const save = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const problem = document.querySelector<HTMLElement>(
      '[data-operational-form-error] [data-ui="problem-notice"]',
    );
    return {
      path: location.pathname,
      queryKeys: [...new URLSearchParams(location.search).keys()],
      lang: document.documentElement.lang,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      formVisible: Boolean(form && form.getBoundingClientRect().width > 0),
      warningVisible: Boolean(notice && rect?.width && rect?.height),
      warningText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      warningTop: rect?.top ?? null,
      warningBottom: rect?.bottom ?? null,
      receiptEmpty: form?.querySelector<HTMLInputElement>('[name="receipt"]')?.value === '',
      receiptSelected: Boolean(
        form?.querySelector<HTMLInputElement>('[name="receipt"]')?.files?.length,
      ),
      payer: form?.querySelector<HTMLSelectElement>('[name="whoPaid"]')?.value ?? null,
      projectSelected: Boolean(form?.querySelector<HTMLSelectElement>('[name="projectId"]')?.value),
      workerSelected: Boolean(form?.querySelector<HTMLSelectElement>('[name="workerId"]')?.value),
      category: form?.querySelector<HTMLSelectElement>('[name="category"]')?.value ?? null,
      vendorPreserved: Boolean(
        form?.querySelector<HTMLInputElement>('[name="vendor"]')?.value?.includes('receipt QA'),
      ),
      date: form?.querySelector<HTMLInputElement>('[name="spentOn"]')?.value ?? null,
      amount: form?.querySelector<HTMLInputElement>('[name="amount"]')?.value ?? null,
      vendorEntered: Boolean(form?.querySelector<HTMLInputElement>('[name="vendor"]')?.value),
      descriptionEntered: Boolean(
        form?.querySelector<HTMLTextAreaElement>('[name="description"]')?.value,
      ),
      saveEnabled: Boolean(save && !save.disabled),
      focusedTag: document.activeElement?.tagName.toLowerCase() ?? null,
      problemCode: problem?.getAttribute('data-problem-code') ?? null,
      problemText: problem?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
    };
  });
}

async function toggleReceipt(page: Page, form: ReturnType<Page['locator']>, prefix: string) {
  const receipt = form.locator('input[name="receipt"]');
  await receipt.setInputFiles({
    name: 'qa-receipt.png',
    mimeType: 'image/png',
    buffer: imageBytes,
  });
  await expect(
    form.locator('[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]'),
  ).toHaveCount(0);
  const image = await snapshot(page);
  await receipt.setInputFiles({
    name: 'qa-receipt.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes,
  });
  await expect(
    form.locator('[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]'),
  ).toHaveCount(0);
  const pdf = await snapshot(page);
  await receipt.setInputFiles([]);
  await expect(
    form.locator('[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]'),
  ).toBeVisible();
  const cleared = await snapshot(page);
  await form
    .locator('[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]')
    .screenshot({ path: join(evidenceRoot, `${prefix}-warning.png`) });
  return { image, pdf, cleared };
}

test('Owner and Worker see optional receipt warning and can save a draft', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const output: Record<string, unknown> = {
    candidateCommit,
    fixture: 'Owner created active project and worker assignment through UI',
    roles: [],
  };
  const ownerDiagnostics = diagnostics(page);
  const workerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const worker = await workerContext.newPage();
  const workerDiagnostics = diagnostics(worker);
  try {
    const fixture = await createOwnerProject(page, db);
    const ownerForm = await openExpense(page, 'en', fixture.projectId, fixture.workerId);
    const ownerMarker = `Owner receipt QA ${randomUUID()}`;
    await fillExpense(ownerForm, ownerMarker);
    const ownerInitial = await snapshot(page);
    const ownerToggle = await toggleReceipt(page, ownerForm, 'owner-390-en');
    const ownerBefore = auditCount(db);
    await ownerForm.locator('input[name="amount"]').fill('0');
    const ownerFailureResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createExpense'),
    );
    await ownerForm.getByRole('button', { name: 'Save draft' }).click();
    const ownerFailure = await actionData(await ownerFailureResponse);
    await expect(page.locator('form[data-expense-entry-surface]')).toBeVisible();
    const ownerAfterFailure = await snapshot(page);
    const ownerNoWrite = !savedExpense(db, ownerMarker) && auditCount(db) === ownerBefore;
    const ownerCorrectedForm = page.locator('form[data-expense-entry-surface]');
    await ownerCorrectedForm.locator('input[name="amount"]').fill('8.75');
    const ownerSuccessResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createExpense'),
    );
    await ownerCorrectedForm.getByRole('button', { name: 'Save draft' }).click();
    const ownerSuccess = await actionData(await ownerSuccessResponse);
    await expect.poll(() => savedExpense(db, ownerMarker)).toBeTruthy();
    (output.roles as unknown[]).push({
      role: 'owner',
      locale: 'en',
      viewport: 390,
      initial: ownerInitial,
      toggle: ownerToggle,
      enhancedFailure: {
        transportStatus: ownerFailure.transportStatus,
        type: ownerFailure.type,
        actionStatus: ownerFailure.actionStatus,
        code: ownerFailure.data.code,
        messageKey: ownerFailure.data.messageKey,
        params: ownerFailure.data.params,
        fieldErrors: ownerFailure.data.fieldErrors,
        remedies: ownerFailure.data.remedies,
        ui: ownerAfterFailure,
        noWrite: ownerNoWrite,
      },
      success: {
        transportStatus: ownerSuccess.transportStatus,
        type: ownerSuccess.type,
        actionStatus: ownerSuccess.actionStatus,
        state: savedExpense(db, ownerMarker)?.approval_state,
        receiptRequired: savedExpense(db, ownerMarker)?.receipt_required,
      },
      diagnostics: ownerDiagnostics,
    });
    writeFileSync(join(evidenceRoot, 'results.json'), redact(output) + '\n');

    await signIn(worker, 'worker');
    const workerForm = await openExpense(worker, 'es', '');
    const workerMarker = `Worker receipt QA ${randomUUID()}`;
    await fillExpense(workerForm, workerMarker);
    await expect(workerForm.locator('button[type="submit"]')).toBeEnabled();
    const workerInitial = await snapshot(worker);
    const workerToggle = await toggleReceipt(worker, workerForm, 'worker-1440-es');
    const workerBefore = auditCount(db);
    await workerForm.locator('input[name="amount"]').fill('0');
    const workerFailureResponse = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createExpense'),
    );
    await workerForm.evaluate((form: HTMLFormElement) =>
      HTMLFormElement.prototype.submit.call(form),
    );
    const workerResponse = await workerFailureResponse;
    await worker.waitForLoadState('domcontentloaded');
    await expect(worker.locator('form[data-expense-entry-surface]')).toBeVisible();
    const workerAfterFailure = await snapshot(worker);
    const workerNoWrite = !savedExpense(db, workerMarker) && auditCount(db) === workerBefore;
    const workerResult: Record<string, unknown> = {
      role: 'worker',
      locale: 'es',
      viewport: 1440,
      initial: workerInitial,
      toggle: workerToggle,
      nativeFailure: {
        status: workerResponse.status(),
        contentType: workerResponse.headers()['content-type'] ?? null,
        ui: workerAfterFailure,
        noWrite: workerNoWrite,
      },
      diagnostics: workerDiagnostics,
    };
    (output.roles as unknown[]).push(workerResult);
    writeFileSync(join(evidenceRoot, 'results.json'), redact(output) + '\n');
    const workerCorrectedForm = worker.locator('form[data-expense-entry-surface]');
    await expect(workerCorrectedForm.locator('button[type="submit"]')).toBeEnabled();
    await workerCorrectedForm.locator('input[name="amount"]').fill('8.75');
    await expect(workerCorrectedForm.locator('input[name="amount"]')).toHaveValue('8.75');
    const workerSuccessResponse = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createExpense'),
    );
    await workerCorrectedForm.locator('button[type="submit"]').click();
    const workerSuccess = await actionData(await workerSuccessResponse);
    workerResult.successAttempt = {
      transportStatus: workerSuccess.transportStatus,
      type: workerSuccess.type,
      actionStatus: workerSuccess.actionStatus,
      code: workerSuccess.data.code,
      ui: await snapshot(worker),
      saved: Boolean(savedExpense(db, workerMarker)),
    };
    writeFileSync(join(evidenceRoot, 'results.json'), redact(output) + '\n');
    await expect.poll(() => savedExpense(db, workerMarker)).toBeTruthy();
    workerResult.success = {
      transportStatus: workerSuccess.transportStatus,
      type: workerSuccess.type,
      actionStatus: workerSuccess.actionStatus,
      state: savedExpense(db, workerMarker)?.approval_state,
      receiptRequired: savedExpense(db, workerMarker)?.receipt_required,
    };
    writeFileSync(join(evidenceRoot, 'results.json'), redact(output) + '\n');

    await page.goto(portal(`/expenses?lang=pt&project=${fixture.projectId}`));
    await page.locator('[data-expense-primary-cta]').first().click();
    const ptForm = page.locator('form[data-expense-entry-surface]');
    await expect(ptForm).toBeVisible();
    await ptForm.locator('select[name="whoPaid"]').selectOption('worker');
    const ptInitial = await snapshot(page);
    const ptToggle = await toggleReceipt(page, ptForm, 'owner-390-pt');
    const cdp = await page.context().newCDPSession(page);
    let noJavaScriptFileSelected: Record<string, unknown>;
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
    try {
      await ptForm
        .locator('input[name="receipt"]')
        .setInputFiles({ name: 'qa-receipt.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
      noJavaScriptFileSelected = {
        warningVisible: await ptForm
          .locator('[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]')
          .isVisible(),
        warningText: await ptForm
          .locator('[data-problem-code="WARNING_EXPENSE_DRAFT_RECEIPT_MISSING"]')
          .textContent(),
        selectedFilename: await ptForm.locator('input[name="receipt"]').inputValue(),
        saveEnabled: await ptForm.locator('button[type="submit"]').isEnabled(),
      };
    } finally {
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
      await cdp.detach();
    }
    (output.roles as unknown[]).push({
      role: 'owner',
      locale: 'pt',
      viewport: 390,
      initial: ptInitial,
      toggle: ptToggle,
      noJavaScriptFileSelected,
      noSubmit: true,
      diagnostics: ownerDiagnostics,
    });
    writeFileSync(join(evidenceRoot, 'results.json'), redact(output) + '\n');
  } finally {
    await workerContext.close();
    db.close();
    writeFileSync(join(evidenceRoot, 'results.json'), redact(output) + '\n');
  }
});
