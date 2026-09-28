import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceDir = import.meta.dirname;
type Observation = Record<string, unknown>;

function diagnostics(page: Page) {
  const output = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => output.pageErrors.push(error.message.slice(0, 180)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      output.consoleErrors.push(message.text().slice(0, 180));
  });
  return output;
}

function findExpense(db: DatabaseSync, marker: string) {
  return db.prepare('SELECT id,receipt_document_id FROM expense WHERE vendor=?').get(marker) as
    | { id: string; receipt_document_id: string | null }
    | undefined;
}

async function createFixture(page: Page, db: DatabaseSync) {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = page.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form.locator('select[name="clientId"] option:not([value=""])').first().getAttribute('value');
  const workerId = (db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as { id: string }).id;
  expect(clientId).toBeTruthy();
  const name = `Receipt download QA ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId!);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-RECEIPT-${Date.now() % 100000000}`);
  await form.locator('input[name="startDate"]').fill('2026-09-01');
  await form.locator('input[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const project = db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string };
  return { projectId: project.id };
}

async function createWorkerReceipt(page: Page, db: DatabaseSync, projectId: string) {
  await signIn(page, 'worker');
  await page.goto(portal(`/expenses?lang=en&project=${projectId}`));
  await page.locator('[data-expense-primary-cta]').first().click();
  const form = page.locator('form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="spentOn"]').fill('2026-09-25');
  await form.locator('select[name="category"]').selectOption('parking');
  const marker = `Worker private receipt QA ${randomUUID()}`;
  await form.locator('input[name="vendor"]').fill(marker);
  await form.locator('input[name="amount"]').fill('8.75');
  await form.locator('select[name="currency"]').selectOption('USD');
  await form.locator('select[name="whoPaid"]').selectOption('worker');
  await form.locator('textarea[name="description"]').fill('Disposable private receipt preview check');
  await form.locator('input[name="paymentMethod"]').fill('Cash');
  await form.locator('input[name="receipt"]').setInputFiles({
    name: 'synthetic-receipt.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% QA ${randomUUID()}\n%%EOF\n`),
  });
  const savePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('?/createExpense'));
  await form.getByRole('button', { name: 'Save draft' }).click();
  const save = await savePromise;
  await expect.poll(() => findExpense(db, marker)?.receipt_document_id).toBeTruthy().catch(async (error) => {
    const problems = await form.locator('[data-problem-code]').evaluateAll((elements) => elements.map((element) => ({ code: element.getAttribute('data-problem-code'), text: element.textContent?.replace(/\s+/gu, ' ').slice(0, 250) })));
    let action: Record<string, unknown> = {};
    try {
      const body = await save.json() as { type?: string; status?: number; data?: string };
      const kitRequire = createRequire(realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')));
      const { parse } = await import(pathToFileURL(kitRequire.resolve('devalue')).href) as { parse: (value: string) => Record<string, unknown> };
      const data = body.data ? parse(body.data) : {};
      action = { type: body.type, status: body.status, code: data.code, fieldNames: Object.keys((data.fieldErrors ?? {}) as Record<string, unknown>) };
    } catch { /* Native or malformed response: UI problem codes remain the evidence. */ }
    throw new Error(`Expense receipt fixture was not saved; transport ${save.status()}; action ${JSON.stringify(action)}; problems ${JSON.stringify(problems)}; ${String(error).slice(0, 80)}`);
  });
  return findExpense(db, marker)!;
}

async function noticeState(page: Page, code: string) {
  const notice = page.locator(`[data-expense-receipt-problem] [data-problem-code="${code}"]`);
  await expect(notice).toBeVisible();
  await expect(notice).toBeFocused();
  return page.evaluate((expectedCode) => {
    const notice = document.querySelector<HTMLElement>(`[data-expense-receipt-problem] [data-problem-code="${expectedCode}"]`)!;
    const box = notice.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>('.bottom-nav');
    const navBox = nav?.getBoundingClientRect();
    return {
      code: notice.dataset.problemCode,
      text: notice.textContent?.replace(/\s+/gu, ' ').trim(),
      links: [...notice.querySelectorAll('a')].map((link) => ({ text: link.textContent?.trim(), hrefKind: link.hash ? 'same-page' : link.pathname.endsWith('/login') ? 'login' : 'expense' })),
      focused: document.activeElement === notice,
      lang: document.documentElement.lang,
      viewportWidth: innerWidth,
      noticeBottom: Math.round(box.bottom),
      bottomNavTop: navBox ? Math.round(navBox.top) : null,
      noticeAboveNav: !navBox || getComputedStyle(nav!).display === 'none' || box.bottom <= navBox.top - 8,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      pathKind: location.pathname.includes('/expenses/') ? 'expense-detail' : 'other',
    };
  }, code);
}

async function interceptProblem(page: Page, status: number, code: string, messageKey: string, remedies: string[]) {
  await page.route(/\/app\/api\/documents\/.*\?view=1/u, async (route) => {
    await route.fulfill({
      status, contentType: 'application/json',
      headers: { 'x-correlation-id': 'qa-receipt-ref-123' },
      body: JSON.stringify({ code, messageKey, params: {}, fieldErrors: {}, remedies: remedies.map((id) => ({ id })), correlationId: 'qa-receipt-ref-123', error: 'QA synthetic failure' }),
    });
  });
}

test('Expense receipt preview shows role-safe recovery in actual Chromium', async ({ browser, page }) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const output: Observation = { candidate: 'e89e7fa', fixture: 'disposable UI-created project, assignment, expense and synthetic PDF', cases: [] };
  const cases = output.cases as Observation[];
  const ownerDiagnostics = diagnostics(page);
  const workerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const worker = await workerContext.newPage();
  const workerDiagnostics = diagnostics(worker);
  try {
    output.stage = 'create-project';
    const fixture = await createFixture(page, db);
    output.stage = 'create-expense';
    const expense = await createWorkerReceipt(worker, db, fixture.projectId);
    expect(expense.receipt_document_id).toBeTruthy();
    output.stage = 'real-success';
    await worker.goto(portal(`/expenses/${expense.id}?lang=en`));
    await expect(worker.locator('#expense-receipt-preview')).toBeVisible();
    const responsePromise = worker.waitForResponse((response) => response.url().includes('/api/documents/') && response.url().includes('view=1'), { timeout: 12000 });
    const popupPromise = worker.waitForEvent('popup', { timeout: 12000 });
    await worker.locator('#expense-receipt-preview').click();
    const [response, popup] = await Promise.all([responsePromise, popupPromise]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    await worker.waitForTimeout(500);
    const popupKind = popup.isClosed() ? 'closed' : popup.url().startsWith('blob:') ? 'blob' : popup.url().startsWith('about:blank') ? 'blank' : popup.url().split(':', 1)[0];
    const noticeCode = (await worker.locator('[data-expense-receipt-problem] [data-problem-code]').count()) ? await worker.locator('[data-expense-receipt-problem] [data-problem-code]').first().getAttribute('data-problem-code') : null;
    cases.push({ role: 'worker', locale: 'en', width: 390, case: 'actual-success', status: 200, popupKind, noticeCode, originalPageRetained: worker.url().includes('/expenses/') });
    output.stage = 'intercept-409';
    await popup.close();

    await interceptProblem(worker, 409, 'DOCUMENT_DOWNLOAD_FILE_MISSING', 'problem.document.downloadFileMissing', ['contact_owner']);
    const countBefore409 = workerContext.pages().length;
    await worker.locator('#expense-receipt-preview').click();
    const missing = await noticeState(worker, 'DOCUMENT_DOWNLOAD_FILE_MISSING');
    expect(missing.noticeAboveNav).toBe(true);
    expect(missing.horizontalOverflow).toBe(false);
    expect(workerContext.pages().length).toBe(countBefore409);
    await worker.locator('[data-expense-receipt-problem] [data-ui="problem-notice"]').screenshot({ path: join(evidenceDir, 'worker-en-390-409.png') });
    cases.push({ role: 'worker', locale: 'en', width: 390, case: 'intercepted-409', ...missing, noRawJsonTab: true });
    await worker.unroute(/\/app\/api\/documents\/.*\?view=1/u);

    output.stage = 'intercept-401';
    await worker.goto(portal(`/expenses/${expense.id}?lang=es`));
    await interceptProblem(worker, 401, 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED', 'problem.document.downloadSignInRequired', ['sign_in_again']);
    await worker.locator('#expense-receipt-preview').click();
    const signedOut = await noticeState(worker, 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED');
    expect(signedOut.text).toMatch(/sesión terminó/u);
    expect(signedOut.links.some((item) => item.hrefKind === 'login')).toBe(true);
    expect(signedOut.noticeAboveNav).toBe(true);
    cases.push({ role: 'worker', locale: 'es', width: 390, case: 'intercepted-401', ...signedOut });
    await worker.unroute(/\/app\/api\/documents\/.*\?view=1/u);

    output.stage = 'intercept-503';
    await worker.goto(portal(`/expenses/${expense.id}?lang=pt`));
    await interceptProblem(worker, 503, 'DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE', 'problem.document.downloadServiceUnavailable', ['retry_download']);
    await worker.locator('#expense-receipt-preview').click();
    const service = await noticeState(worker, 'DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE');
    expect(service.text).toMatch(/pré-visualização|recibo/u);
    expect(service.noticeAboveNav).toBe(true);
    await worker.locator('[data-expense-receipt-problem] [data-ui="problem-notice"]').screenshot({ path: join(evidenceDir, 'worker-pt-390-503.png') });
    cases.push({ role: 'worker', locale: 'pt', width: 390, case: 'intercepted-503', ...service });
    await worker.unroute(/\/app\/api\/documents\/.*\?view=1/u);

    output.stage = 'blocked-popup';
    await worker.goto(portal(`/expenses/${expense.id}?lang=en`));
    let receiptGets = 0;
    await worker.route(/\/app\/api\/documents\/.*\?view=1/u, async (route) => { receiptGets++; await route.continue(); });
    await worker.evaluate(() => { window.open = () => null; });
    await worker.locator('#expense-receipt-preview').click();
    const blocked = await noticeState(worker, 'DOCUMENT_PREVIEW_POPUP_BLOCKED');
    expect(receiptGets).toBe(0);
    expect(blocked.noticeAboveNav).toBe(true);
    cases.push({ role: 'worker', locale: 'en', width: 390, case: 'browser-blocked-popup', ...blocked, receiptGets });
    await worker.unroute(/\/app\/api\/documents\/.*\?view=1/u);

    output.stage = 'owner-404';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(portal(`/expenses/${expense.id}?lang=pt`));
    await expect(page.locator('#expense-receipt-preview')).toBeVisible();
    await interceptProblem(page, 404, 'DOCUMENT_DOWNLOAD_UNAVAILABLE', 'problem.document.downloadUnavailable', ['review_documents']);
    await page.locator('#expense-receipt-preview').click();
    const unavailable = await noticeState(page, 'DOCUMENT_DOWNLOAD_UNAVAILABLE');
    expect(unavailable.text).toMatch(/recibo não está disponível/u);
    expect(unavailable.links.some((item) => item.hrefKind === 'expense')).toBe(true);
    cases.push({ role: 'owner', locale: 'pt', width: 1440, case: 'intercepted-404', ...unavailable });
    await page.unroute(/\/app\/api\/documents\/.*\?view=1/u);

    output.stage = 'worker2-real-404';
    const worker2Context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const worker2 = await worker2Context.newPage();
    try {
      await signIn(worker2, 'worker2');
      const denial = await worker2.goto(portal(`/api/documents/${expense.receipt_document_id}?view=1`));
      expect(denial?.status()).toBe(404);
      const payload = await denial!.json() as { code?: string };
      expect(payload.code).toBe('DOCUMENT_DOWNLOAD_UNAVAILABLE');
      cases.push({ role: 'worker2', case: 'actual-cross-worker-denial', status: 404, code: payload.code });
    } finally {
      await worker2Context.close();
    }
    expect(ownerDiagnostics.pageErrors).toEqual([]);
    expect(workerDiagnostics.pageErrors).toEqual([]);
    expect(ownerDiagnostics.consoleErrors).toEqual([]);
    expect(workerDiagnostics.consoleErrors).toEqual([]);
    output.diagnostics = { owner: ownerDiagnostics, worker: workerDiagnostics };
  } finally {
    db.close();
    writeFileSync(join(evidenceDir, 'observations.json'), JSON.stringify(output, null, 2) + '\n');
    await workerContext.close().catch(() => undefined);
  }
});

test('Existing synthetic receipt success and duplicate-content recovery', async ({ browser, page }) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const output: Observation = { candidate: 'e89e7fa', case: 'focused-real-success-and-duplicate-content' };
  let ownerContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  try {
    let original = db.prepare("SELECT id,project_id,receipt_document_id FROM expense WHERE vendor LIKE 'Worker private receipt QA %' AND receipt_document_id IS NOT NULL ORDER BY created_at ASC LIMIT 1").get() as { id: string; project_id: string; receipt_document_id: string } | undefined;
    if (!original) {
      ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const owner = await ownerContext.newPage();
      const fixture = await createFixture(owner, db);
      const created = await createWorkerReceipt(page, db, fixture.projectId);
      original = { ...created, project_id: fixture.projectId, receipt_document_id: created.receipt_document_id! };
    } else {
      await signIn(page, 'worker');
    }
    await page.goto(portal(`/expenses/${original!.id}?lang=en`));
    let openerDownloads = 0;
    let popupDownloads = 0;
    page.on('download', () => { openerDownloads++; });
    page.on('popup', (child) => child.on('download', () => { popupDownloads++; }));
    const receiptResponse = page.waitForResponse((response) => response.url().includes('/api/documents/') && response.url().includes('view=1'), { timeout: 12000 });
    const popupPromise = page.waitForEvent('popup', { timeout: 12000 });
    await page.locator('#expense-receipt-preview').click();
    const [response, popup] = await Promise.all([receiptResponse, popupPromise]);
    const disposition = response.headers()['content-disposition'] ?? '';
    output.success = { status: response.status(), contentType: response.headers()['content-type'] ?? null, inlineDisposition: /^inline\s*;/iu.test(disposition), hasFilename: /(?:^|;)\s*filename\*?=/iu.test(disposition) };
    await page.waitForTimeout(4000);
    const popupKind = popup.isClosed() ? 'closed' : popup.url().startsWith('blob:') ? 'blob' : popup.url().startsWith('about:blank') ? 'blank' : popup.url().split(':', 1)[0];
    const inlineCodes = await page.locator('[data-expense-receipt-problem] [data-problem-code]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-problem-code')));
    (output.success as Observation).popupKindAfter4s = popupKind;
    (output.success as Observation).inlineCodes = inlineCodes;
    (output.success as Observation).popupCount = page.context().pages().length;
    (output.success as Observation).popupDOM = popup.isClosed() ? null : await popup.evaluate(() => ({ readyState: document.readyState, title: document.title, firstTag: document.body?.firstElementChild?.tagName ?? null, childCount: document.body?.children.length ?? 0 })).catch(() => null);
    (output.success as Observation).downloads = { opener: openerDownloads, popup: popupDownloads };
    await popup.close().catch(() => undefined);

    const duplicateBytes = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% QA DUPLICATE ${randomUUID()}\n%%EOF\n`);
    async function submitReceipt(marker: string, amount: string) {
      await page.goto(portal(`/expenses?lang=en&project=${original!.project_id}`));
      await page.locator('[data-expense-primary-cta]').first().click();
      const form = page.locator('form[data-expense-entry-surface]');
      await expect(form).toBeVisible();
      await form.locator('select[name="projectId"]').selectOption(original!.project_id);
      await form.locator('input[name="spentOn"]').fill('2026-09-25');
      await form.locator('select[name="category"]').selectOption('parking');
      await form.locator('input[name="vendor"]').fill(marker);
      await form.locator('input[name="amount"]').fill(amount);
      await form.locator('select[name="currency"]').selectOption('USD');
      await form.locator('select[name="whoPaid"]').selectOption('worker');
      await form.locator('textarea[name="description"]').fill('Check duplicate receipt guidance');
      await form.locator('input[name="paymentMethod"]').fill('Cash');
      await form.locator('input[name="receipt"]').setInputFiles({ name: 'synthetic-receipt.pdf', mimeType: 'application/pdf', buffer: duplicateBytes });
      const response = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('?/createExpense'));
      await form.getByRole('button', { name: 'Save draft' }).click();
      return { form, result: await response };
    }
    const baselineMarker = `Original duplicate receipt QA ${randomUUID()}`;
    await submitReceipt(baselineMarker, '9.25');
    await expect.poll(() => findExpense(db, baselineMarker)?.receipt_document_id).toBeTruthy();
    const marker = `Duplicate receipt QA ${randomUUID()}`;
    const { form, result } = await submitReceipt(marker, '9.25');
    const body = await result.json() as { type: string; status: number; data: string };
    const kitRequire = createRequire(realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')));
    const { parse } = await import(pathToFileURL(kitRequire.resolve('devalue')).href) as { parse: (value: string) => Record<string, unknown> };
    const action = parse(body.data);
    const notice = page.locator('[data-operational-form-error] [data-problem-code="EXPENSE_RECEIPT_DUPLICATE_CONTENT"]');
    await expect(notice).toBeVisible();
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName ?? null, id: document.activeElement?.id ?? null, className: document.activeElement?.className ?? null, role: document.activeElement?.getAttribute('role') ?? null, summary: document.activeElement?.hasAttribute('data-validation-summary') ?? false, insideExpenseForm: Boolean(document.activeElement?.closest('form[data-expense-entry-surface]')), textPrefix: document.activeElement?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 100) ?? null, noticeFocused: document.activeElement === document.querySelector('[data-operational-form-error] [data-problem-code="EXPENSE_RECEIPT_DUPLICATE_CONTENT"]') }));
    output.duplicate = {
      transportStatus: result.status(), actionType: body.type, actionStatus: body.status,
      code: action.code, remedies: (action.remedies as Array<{ id: string }> | undefined)?.map((item) => item.id),
      visibleText: (await notice.textContent())?.replace(/\s+/gu, ' ').trim(),
      focus,
      retained: {
        vendor: await form.locator('input[name="vendor"]').inputValue() === marker,
        amount: await form.locator('input[name="amount"]').inputValue(),
        project: await form.locator('select[name="projectId"]').inputValue() === original!.project_id,
        file: (await form.locator('input[name="receipt"]').inputValue()).endsWith('synthetic-receipt.pdf'),
      },
      noNewExpense: !findExpense(db, marker),
    };
    await notice.screenshot({ path: join(evidenceDir, 'worker-en-390-duplicate-content.png') });
  } finally {
    db.close();
    writeFileSync(join(evidenceDir, 'focused-observations.json'), JSON.stringify(output, null, 2) + '\n');
    await ownerContext?.close().catch(() => undefined);
  }
});

test('Postfix receipt preview keeps localized fallback visible after native PDF download', async ({ browser, page }) => {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const output: Observation = { candidate: '1866755', case: 'actual-pdf-success-postfix', locales: [] };
  const locales = output.locales as Observation[];
  const pageDiagnostics = diagnostics(page);
  let ownerContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  try {
    let expense = db.prepare("SELECT id FROM expense WHERE vendor LIKE 'Worker private receipt QA %' AND receipt_document_id IS NOT NULL ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
    if (!expense) {
      ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const owner = await ownerContext.newPage();
      const fixture = await createFixture(owner, db);
      expense = await createWorkerReceipt(page, db, fixture.projectId);
      output.fixtureCreatedThroughUI = true;
    } else {
      await signIn(page, 'worker');
      output.fixtureCreatedThroughUI = false;
    }
    for (const locale of ['en', 'es', 'pt'] as const) {
      await page.goto(portal(`/expenses/${expense!.id}?lang=${locale}`));
      const responsePromise = page.waitForResponse((response) => response.url().includes('/api/documents/') && response.url().includes('view=1'), { timeout: 12000 });
      const popupPromise = page.waitForEvent('popup', { timeout: 12000 });
      let downloaded = false;
      page.once('popup', (child) => child.once('download', () => { downloaded = true; }));
      await page.locator('#expense-receipt-preview').click();
      const [response, popup] = await Promise.all([responsePromise, popupPromise]);
      expect(response.status()).toBe(200);
      await page.waitForTimeout(1200);
      const popupKind = popup.isClosed() ? 'closed' : popup.url().startsWith('about:blank') ? 'blank' : popup.url().startsWith('blob:') ? 'blob' : popup.url().split(':', 1)[0];
      const fallback = popup.isClosed() ? null : await popup.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, heading: document.querySelector('main h1')?.textContent ?? null, explanation: document.querySelector('main p')?.textContent ?? null, linkText: document.querySelector('main a[download]')?.textContent ?? null, linkHrefKind: document.querySelector<HTMLAnchorElement>('main a[download]')?.href.startsWith('blob:') ? 'blob' : null })).catch(() => null);
      if (popupKind === 'blank') {
        expect(fallback?.heading).toBeTruthy();
        expect(fallback?.linkHrefKind).toBe('blob');
      }
      const expectedHeading = { en: 'Verified receipt ready', es: 'Recibo verificado listo', pt: 'Recibo verificado pronto' }[locale];
      expect(fallback?.heading).toBe(expectedHeading);
      expect(fallback?.linkText).toBe({ en: 'Download verified receipt', es: 'Descargar recibo verificado', pt: 'Baixar recibo verificado' }[locale]);
      expect(await page.locator('[data-expense-receipt-problem]').count()).toBe(0);
      locales.push({ locale, width: 390, status: 200, popupKind, nativeDownload: downloaded, fallback, noInlineProblem: true, pageRetained: page.url().includes('/expenses/') });
      if (locale === 'es') await popup.locator('main').screenshot({ path: join(evidenceDir, 'postfix-worker-es-390-success.png') });
      await popup.close();
    }
    expect(pageDiagnostics.pageErrors).toEqual([]);
    expect(pageDiagnostics.consoleErrors).toEqual([]);
    output.diagnostics = pageDiagnostics;
  } finally {
    db.close();
    writeFileSync(join(evidenceDir, 'postfix-observations.json'), JSON.stringify(output, null, 2) + '\n');
    await ownerContext?.close().catch(() => undefined);
  }
});
