import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eCredentials } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const root = import.meta.dirname;
const candidateCommit = 'ed1d7a2';
const expectDeepLinkBug = process.env.JA_EXPECT_DEEPLINK_BUG === '1';
const focusedEditOnly = process.env.JA_FOCUSED_EDIT_ONLY === '1';
const date = '2026-09-25';
const url = (path: string) => `http://127.0.0.1:4177/j-aautomation/app${path}`;
const warning = '[data-problem-code="WARNING_EXPENSE_TIME_LINK_REVIEW"]';
const wordings = {
  en: 'This expense will be linked to the selected time entry in its review history. Check that the entry and expense date describe the same work before saving.',
  es: 'Este gasto quedará vinculado al registro de horas seleccionado en su historial de revisión. Comprueba que el registro y la fecha del gasto corresponden al mismo trabajo antes de guardar.',
  pt: 'Esta despesa ficará vinculada ao registo de horas selecionado no histórico de análise. Confirme que o registo e a data da despesa se referem ao mesmo trabalho antes de salvar.',
} as const;
const remedies = {
  en: 'Review the selected time entry and expense date.',
  es: 'Revisa el registro de horas seleccionado y la fecha del gasto.',
  pt: 'Reveja o registo de horas selecionado e a data da despesa.',
} as const;
const fieldRemedies = {
  en: 'Correct the highlighted field',
  es: 'Corregir el campo señalado',
  pt: 'Corrigir o campo destacado',
} as const;
type Locale = keyof typeof wordings;

async function signIn(page: Page, role: 'owner' | 'worker') {
  const account = e2eCredentials[role];
  await page.goto(url('/login'));
  await expect(page.getByLabel('Work email')).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Work email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (target) =>
      (target.pathname === '/j-aautomation/app' ||
        target.pathname.startsWith('/j-aautomation/app/')) &&
      !target.pathname.endsWith('/login'),
    { timeout: 15_000 },
  );
}

function diagnostics(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    lookups: [] as number[],
    actionPosts: [] as number[],
    syncRequests: [] as string[],
  };
  page.on('pageerror', (error) => result.pageErrors.push(error.message.slice(0, 200)));
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(entry.text().slice(0, 200));
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/expenses/time-options'))
      result.lookups.push(response.status());
    if (response.request().method() === 'POST' && response.url().includes('Expense'))
      result.actionPosts.push(response.status());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/j-aautomation/app/api/sync')
      result.syncRequests.push(request.method());
  });
  return result;
}

async function createProjectThroughUI(page: Page, db: DatabaseSync) {
  await signIn(page, 'owner');
  await page.goto(url('/projects?lang=en'));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = page.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const client = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  const worker = db
    .prepare('SELECT id FROM user WHERE email=?')
    .get(e2eCredentials.worker.email) as { id: string };
  expect(client).toBeTruthy();
  const name = `Expense time-link warning QA ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(client!);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-TIME-LINK-${Date.now() % 100000000}`);
  await form.locator('input[name="startDate"]').fill('2026-09-01');
  await form.locator('input[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${worker.id}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const project = db.prepare('SELECT id,status FROM project WHERE name=?').get(name) as {
    id: string;
    status: string;
  };
  expect(project.status).toBe('active');
  return { projectId: project.id, workerId: worker.id };
}

async function createTimeThroughUI(page: Page, db: DatabaseSync, projectId: string) {
  await signIn(page, 'worker');
  await page.goto(url('/time?lang=en'));
  await page.locator('[data-time-primary-cta]').first().click();
  const form = page.locator('form[data-time-entry-surface]');
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="workDate"]').fill(date);
  await form.getByRole('textbox', { name: 'Actual hours' }).fill('2.5');
  const summary = `Linked work QA ${randomUUID()}`;
  await form.locator('textarea[name="summary"]').fill(summary);
  const post = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('createTime'),
  );
  await form.getByRole('button', { name: 'Save draft' }).click();
  expect((await post).status()).toBe(200);
  await expect
    .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary))
    .toBeTruthy();
  const time = db
    .prepare('SELECT id,project_id,work_date,minutes FROM time_entry WHERE activity_summary=?')
    .get(summary) as { id: string; project_id: string; work_date: string; minutes: number };
  expect(time).toMatchObject({ project_id: projectId, work_date: date, minutes: 150 });
  return time.id;
}

function linkedUrl(locale: Locale, projectId: string, workerId: string, timeId: string) {
  const search = new URLSearchParams({
    lang: locale,
    project: projectId,
    worker: workerId,
    date,
    timeEntry: timeId,
  });
  return url(`/expenses?${search}`);
}

async function warningState(page: Page, form: Locator, locale: Locale, timeId: string) {
  const notice = form.locator(warning);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-kind', 'warning');
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toContainText(wordings[locale]);
  await expect(notice).toContainText(remedies[locale]);
  await expect(form.locator('select[name="timeEntryId"]')).toHaveValue(timeId);
  await expect(form.locator('button[type="submit"]').last()).toBeEnabled();
  const evidence = await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[data-expense-entry-surface]');
    const notice = form?.querySelector<HTMLElement>(
      '[data-problem-code="WARNING_EXPENSE_TIME_LINK_REVIEW"]',
    );
    const box = notice?.getBoundingClientRect();
    const sheet = notice?.closest<HTMLElement>('.responsive-sheet-body');
    const sheetBox = sheet?.getBoundingClientRect();
    return {
      viewport: innerWidth,
      language: document.documentElement.lang,
      focused: document.activeElement?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
      warningVisible: Boolean(box?.width && box?.height),
      warningWithinSheet: Boolean(
        box && sheetBox && box.left >= sheetBox.left - 2 && box.right <= sheetBox.right + 2,
      ),
      selectedLink: Boolean(form?.querySelector<HTMLSelectElement>('[name="timeEntryId"]')?.value),
      projectSelected: form?.querySelector<HTMLSelectElement>('[name="projectId"]')
        ? Boolean(form.querySelector<HTMLSelectElement>('[name="projectId"]')?.value)
        : null,
      date: form?.querySelector<HTMLInputElement>('[name="spentOn"]')?.value ?? null,
    };
  });
  expect(evidence.warningVisible).toBe(true);
  expect(evidence.warningWithinSheet).toBe(true);
  if (evidence.projectSelected !== null) expect(evidence.projectSelected).toBe(true);
  expect(evidence.date).toBe(date);
  return evidence;
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

test('linked expense warning follows a verified choice, survives errors, and permits a draft', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const workerDiagnostics = diagnostics(page);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerContext.newPage();
  const ownerDiagnostics = diagnostics(owner);
  const output: Record<string, unknown> = {
    candidateCommit,
    fixture: 'Project, assignment, time, and expense created through browser UI',
    matrix: [],
    defects: [],
    editChecks: [],
    failures: [],
    saves: [],
    diagnostics: { worker: workerDiagnostics, owner: ownerDiagnostics },
  };
  const persist = () =>
    writeFileSync(
      join(
        root,
        expectDeepLinkBug
          ? 'pre-fix-results.json'
          : focusedEditOnly
            ? 'focused-results.json'
            : 'results.json',
      ),
      `${JSON.stringify(
        output,
        (_key, value) =>
          typeof value === 'string'
            ? value
                .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
                .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[record]')
            : value,
        2,
      )}\n`,
    );
  try {
    const fixture = await createProjectThroughUI(owner, db);
    const timeId = await createTimeThroughUI(page, db, fixture.projectId);
    console.log('[linked-time QA] Browser-created project, assignment, and hours are ready.');

    const matrix: Array<{ page: Page; role: string; locale: Locale; width: number }> = [
      { page, role: 'worker', locale: 'en', width: 390 },
      { page, role: 'worker', locale: 'es', width: 1440 },
      { page, role: 'worker', locale: 'pt', width: 390 },
      { page: owner, role: 'owner', locale: 'en', width: 1440 },
      { page: owner, role: 'owner', locale: 'es', width: 390 },
      { page: owner, role: 'owner', locale: 'pt', width: 1440 },
    ];
    for (const scenario of focusedEditOnly ? [] : matrix) {
      await scenario.page.setViewportSize({
        width: scenario.width,
        height: scenario.width === 390 ? 844 : 900,
      });
      const lookup = scenario.page.waitForResponse(
        (response) =>
          response.url().includes('/api/expenses/time-options') && response.status() === 200,
      );
      await scenario.page.goto(
        linkedUrl(scenario.locale, fixture.projectId, fixture.workerId, timeId),
      );
      const form = scenario.page.locator('form[data-expense-entry-surface]');
      await expect(form).toBeVisible();
      const response = await lookup;
      const payload = (await response.json()) as { rows?: Array<{ id: string }> };
      expect(payload.rows?.some((row) => row.id === timeId)).toBe(true);
      const initial = await warningState(scenario.page, form, scenario.locale, timeId);
      await form.locator('select[name="timeEntryId"]').selectOption('');
      await expect(form.locator(warning)).toHaveCount(0);
      await form.locator('select[name="timeEntryId"]').selectOption(timeId);
      await warningState(scenario.page, form, scenario.locale, timeId);
      let keyboardNextField = false;
      if (scenario.role === 'worker' && scenario.locale === 'en') {
        await form.locator('select[name="timeEntryId"]').focus();
        await scenario.page.keyboard.press('Tab');
        keyboardNextField = await form
          .locator('input[name="vendor"]')
          .evaluate((input) => document.activeElement === input);
        expect(keyboardNextField).toBe(true);
      }
      const tag = `${scenario.role}-${scenario.width}-${scenario.locale}`;
      await form.locator(warning).screenshot({
        path: join(root, `${expectDeepLinkBug ? 'pre-fix' : 'post-fix'}-${tag}-warning.png`),
      });
      (output.matrix as unknown[]).push({
        role: scenario.role,
        locale: scenario.locale,
        width: scenario.width,
        lookupStatus: response.status(),
        initial,
        unselectedHidden: true,
        reselectedVisible: true,
        ...(scenario.role === 'worker' && scenario.locale === 'en' ? { keyboardNextField } : {}),
      });
      persist();
      console.log(`[linked-time QA] ${tag}: verified warning and unselected state.`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(linkedUrl('en', fixture.projectId, fixture.workerId, timeId));
    const create = page.locator('form[data-expense-entry-surface]');
    await warningState(page, create, 'en', timeId);
    const marker = `Time-link draft QA ${randomUUID()}`;
    await create.locator('select[name="category"]').selectOption('parking');
    await create.locator('input[name="vendor"]').fill(marker);
    await create.locator('input[name="amount"]').fill('0');
    await create
      .locator('textarea[name="description"]')
      .fill('Disposable linked expense browser evidence');
    const invalidPost = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createExpense'),
    );
    await create.getByRole('button', { name: 'Save draft' }).click();
    const invalid = await actionData(await invalidPost);
    expect(invalid.transportStatus).toBe(200);
    expect(invalid.type).toBe('failure');
    expect(invalid.actionStatus).toBe(400);
    expect(invalid.data.code).toBe('EXPENSE_AMOUNT_INVALID');
    expect(invalid.data.remedies).toEqual([{ id: 'correct_field' }]);
    await expect(create).toBeVisible();
    const amountProblem = page.locator('[data-problem-code="EXPENSE_AMOUNT_INVALID"]');
    await expect(amountProblem).toContainText(fieldRemedies.en);
    await expect(create.locator('input[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(create.locator('[data-validation-generated-error]')).toBeVisible();
    await expect(create.locator('input[name="vendor"]')).toHaveValue(marker);
    await expect(create.locator('select[name="timeEntryId"]')).toHaveValue(timeId);
    await warningState(page, create, 'en', timeId);
    await create.locator('input[name="amount"]').fill('8.75');
    const successPost = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createExpense'),
    );
    await create.getByRole('button', { name: 'Save draft' }).click();
    const success = await actionData(await successPost);
    expect(success.transportStatus).toBe(200);
    await expect
      .poll(() => db.prepare('SELECT id FROM expense WHERE vendor=?').get(marker))
      .toBeTruthy();
    const expense = db
      .prepare('SELECT id,time_entry_id,approval_state FROM expense WHERE vendor=?')
      .get(marker) as { id: string; time_entry_id: string; approval_state: string };
    expect(expense.time_entry_id).toBe(timeId);
    expect(expense.approval_state).toBe('draft');
    (output.saves as unknown[]).push({
      role: 'worker',
      mode: 'enhanced',
      invalidTransportStatus: invalid.transportStatus,
      invalidActionStatus: invalid.actionStatus,
      invalidCode: invalid.data.code,
      invalidRemedyTranslated: true,
      amountFieldErrorVisible: true,
      successStatus: success.transportStatus,
      linkPersisted: true,
      state: 'draft',
      valuesRetainedAfterInvalid: true,
    });
    persist();
    console.log('[linked-time QA] Enhanced linked draft saved after field recovery.');

    for (const locale of focusedEditOnly ? [] : (['es', 'pt'] as const)) {
      await page.goto(linkedUrl(locale, fixture.projectId, fixture.workerId, timeId));
      const localized = page.locator('form[data-expense-entry-surface]');
      await warningState(page, localized, locale, timeId);
      await localized.locator('select[name="category"]').selectOption('parking');
      await localized.locator('input[name="vendor"]').fill(`Invalid amount ${locale}`);
      await localized.locator('input[name="amount"]').fill('0');
      await localized
        .locator('textarea[name="description"]')
        .fill('Disposable invalid amount translation check');
      const localizedPost = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('createExpense'),
      );
      await localized.locator('button[type="submit"]').last().click();
      const localizedResult = await actionData(await localizedPost);
      expect(localizedResult.actionStatus).toBe(400);
      expect(localizedResult.data.code).toBe('EXPENSE_AMOUNT_INVALID');
      expect(localizedResult.data.remedies).toEqual([{ id: 'correct_field' }]);
      await expect(page.locator('[data-problem-code="EXPENSE_AMOUNT_INVALID"]')).toContainText(
        fieldRemedies[locale],
      );
      await expect(localized.locator('input[name="amount"]')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(localized.locator('select[name="timeEntryId"]')).toHaveValue(timeId);
      (output.saves as unknown[]).push({
        role: 'worker',
        locale,
        mode: 'enhanced-invalid',
        actionStatus: localizedResult.actionStatus,
        code: localizedResult.data.code,
        translatedRemedyVisible: true,
        amountFieldErrorVisible: true,
        timeLinkRetained: true,
      });
      persist();
    }

    const deepLinkLookup = page.waitForResponse(
      (response) =>
        response.url().includes('/api/expenses/time-options') && response.status() === 200,
    );
    await page.goto(url(`/expenses?lang=en&edit=${expense.id}`));
    const deepLinkEdit = page.locator('form[data-expense-entry-surface]');
    await expect(deepLinkEdit).toBeVisible();
    const deepLinkResponse = await deepLinkLookup;
    const deepLinkPayload = (await deepLinkResponse.json()) as { rows?: Array<{ id: string }> };
    expect(deepLinkPayload.rows?.some((row) => row.id === timeId)).toBe(true);
    if (expectDeepLinkBug) {
      await expect(deepLinkEdit.locator('select[name="timeEntryId"]')).toHaveValue('');
      await expect(deepLinkEdit.locator(warning)).toHaveCount(0);
      await deepLinkEdit.locator('select[name="timeEntryId"]').screenshot({
        path: join(root, 'pre-fix-worker-390-en-deep-link-edit-unselected.png'),
      });
      (output.defects as unknown[]).push({
        surface: 'edit',
        entry: 'direct URL',
        lookupStatus: deepLinkResponse.status(),
        linkedEntryReturned: true,
        persistedLinkedEntryNotSelected: true,
        warningMissing: true,
      });
      persist();
    } else {
      await warningState(page, deepLinkEdit, 'en', timeId);
      await deepLinkEdit.locator(warning).screenshot({
        path: join(root, 'scroll-fix-worker-390-en-direct-edit-warning.png'),
      });
      (output.editChecks as unknown[]).push({
        entry: 'direct URL',
        lookupStatus: deepLinkResponse.status(),
        linkedEntryReturned: true,
        persistedLinkSelected: true,
        warningVisible: true,
      });
      persist();
    }
    await page.goto(url('/expenses?lang=en'));
    const expenseRow = page.locator('article').filter({ hasText: marker }).first();
    await expect(expenseRow).toBeVisible();
    const editLookup = page.waitForResponse(
      (response) =>
        response.url().includes('/api/expenses/time-options') && response.status() === 200,
    );
    await expenseRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.locator('form[data-expense-entry-surface]');
    await expect(edit).toBeVisible();
    await editLookup;
    await warningState(page, edit, 'en', timeId);
    await edit.locator(warning).screenshot({
      path: join(root, 'scroll-fix-worker-390-en-button-edit-warning.png'),
    });
    (output.editChecks as unknown[]).push({
      entry: 'row Edit button',
      lookupStatus: 200,
      persistedLinkSelected: true,
      warningVisible: true,
    });
    persist();
    await edit.locator('select[name="timeEntryId"]').selectOption('');
    await expect(edit.locator(warning)).toHaveCount(0);
    await edit.locator('select[name="timeEntryId"]').selectOption(timeId);
    await warningState(page, edit, 'en', timeId);
    await edit.locator('input[name="vendor"]').fill(`${marker} edit`);
    const nativePost = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('updateExpense'),
    );
    await edit.evaluate((form: HTMLFormElement) => HTMLFormElement.prototype.submit.call(form));
    expect((await nativePost).status()).toBe(200);
    await expect
      .poll(() => db.prepare('SELECT vendor,time_entry_id FROM expense WHERE id=?').get(expense.id))
      .toMatchObject({ vendor: `${marker} edit`, time_entry_id: timeId });
    (output.saves as unknown[]).push({
      role: 'worker',
      mode: 'native',
      status: 200,
      linkPersisted: true,
      state: 'draft',
      unselectedHidden: true,
      reselectedVisible: true,
    });
    persist();

    let lookupCount = 0;
    let releaseFailure: () => void = () => undefined;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.route('**/app/api/expenses/time-options?*', async (route) => {
      lookupCount += 1;
      if (lookupCount > 1) return route.continue();
      await failureGate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'EXPENSE_LOOKUP_UNAVAILABLE',
          messageKey: 'problem.expenseLookup.unavailable',
          params: { correlationId: 'disposable-reference' },
          fieldErrors: {},
          remedies: [{ id: 'retry_expense_options' }],
          correlationId: 'disposable-reference',
        }),
      });
    });
    await page.goto(linkedUrl('es', fixture.projectId, fixture.workerId, timeId));
    const failedCreate = page.locator('form[data-expense-entry-surface]');
    await expect(failedCreate).toBeVisible();
    await failedCreate
      .locator('input[name="vendor"]')
      .fill('Retained vendor during time lookup outage');
    await expect.poll(() => lookupCount).toBe(1);
    const scrollBefore = await page.evaluate(() => Math.round(scrollY));
    const failureResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/expenses/time-options') && response.status() === 503,
    );
    releaseFailure();
    expect((await failureResponse).status()).toBe(503);
    const failedNotice = failedCreate.locator('[data-problem-code="EXPENSE_LOOKUP_UNAVAILABLE"]');
    await expect(failedNotice).toBeVisible();
    await expect(failedNotice).toContainText(
      'No se pudieron cargar las opciones de gastos. Inténtalo de nuevo',
    );
    await expect(failedCreate.locator(warning)).toHaveCount(0);
    await expect(failedCreate.locator('select[name="timeEntryId"]')).toHaveValue(timeId);
    await expect(failedCreate.locator('input[name="vendor"]')).toHaveValue(
      'Retained vendor during time lookup outage',
    );
    await expect(failedNotice).toBeFocused();
    await expect(failedNotice).toBeInViewport();
    const noticeVisibility = await failedNotice.evaluate((element) => {
      const message = element.querySelector('p');
      const actions = element.closest('form')?.querySelector('.expense-entry-actions');
      const body = element.closest('.responsive-sheet-body');
      const noticeBox = element.getBoundingClientRect();
      const bodyBox = body?.getBoundingClientRect();
      const messageBox = message?.getBoundingClientRect();
      const actionBox = actions?.getBoundingClientRect();
      const hit = messageBox
        ? document.elementFromPoint(
            messageBox.left + Math.min(20, messageBox.width / 2),
            messageBox.top + messageBox.height / 2,
          )
        : null;
      return {
        messageTop: Math.round(messageBox?.top ?? -1),
        messageBottom: Math.round(messageBox?.bottom ?? -1),
        noticeTop: Math.round(noticeBox.top),
        noticeBottom: Math.round(noticeBox.bottom),
        noticeHeight: Math.round(noticeBox.height),
        bodyTop: Math.round(bodyBox?.top ?? -1),
        bodyBottom: Math.round(bodyBox?.bottom ?? -1),
        bodyScrollTop: Math.round(body?.scrollTop ?? -1),
        bodyMaxScroll: Math.round((body?.scrollHeight ?? 0) - (body?.clientHeight ?? 0)),
        actionTop: Math.round(actionBox?.top ?? -1),
        startScrollRequired: Math.round(
          (body?.scrollTop ?? 0) + noticeBox.top - (bodyBox?.top ?? 0),
        ),
        startWouldFitAboveActions: Boolean(
          bodyBox && actionBox && noticeBox.height < actionBox.top - bodyBox.top,
        ),
        messageOverlapsStickyActions: Boolean(
          messageBox && actionBox && messageBox.bottom > actionBox.top,
        ),
        messageHitIsAction: Boolean(actions && hit && actions.contains(hit)),
      };
    });
    expect(noticeVisibility.noticeBottom).toBeLessThan(noticeVisibility.actionTop);
    expect(noticeVisibility.messageBottom).toBeLessThan(noticeVisibility.actionTop);
    expect(noticeVisibility.messageOverlapsStickyActions).toBe(false);
    expect(noticeVisibility.messageHitIsAction).toBe(false);
    const retryControl = failedCreate.getByRole('button', {
      name: /Volver a cargar las opciones/,
    });
    await expect(retryControl).toBeVisible();
    const retryVisibleAboveActions = await retryControl.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const actions = element.closest('form')?.querySelector('.expense-entry-actions');
      const actionTop = actions?.getBoundingClientRect().top ?? 0;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return box.bottom < actionTop && (hit === element || element.contains(hit));
    });
    expect(retryVisibleAboveActions).toBe(true);
    const scrollAfter = await page.evaluate(() => Math.round(scrollY));
    expect(scrollAfter).toBe(scrollBefore);
    await failedNotice.screenshot({
      path: join(root, 'scroll-fix-worker-390-es-lookup-failure.png'),
    });
    await retryControl.screenshot({ path: join(root, 'scroll-fix-worker-390-es-retry.png') });
    const retry = page.waitForResponse(
      (response) =>
        response.url().includes('/api/expenses/time-options') && response.status() === 200,
    );
    await failedCreate.getByRole('button', { name: /Volver a cargar las opciones/ }).click();
    expect((await retry).status()).toBe(200);
    await warningState(page, failedCreate, 'es', timeId);
    (output.failures as unknown[]).push({
      surface: 'create',
      locale: 'es',
      lookupStatus: 503,
      warningSuppressed: true,
      valuesRetained: true,
      focusOnError: true,
      noticeVisibility,
      retryVisibleAboveActions,
      scrollPreserved: true,
      retryStatus: 200,
      warningRestored: true,
    });
    persist();
    await page.unroute('**/app/api/expenses/time-options?*');

    await page.goto(url('/expenses?lang=en'));
    await page.route('**/app/api/expenses/time-options?*', async (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'EXPENSE_LOOKUP_UNAVAILABLE',
          messageKey: 'problem.expenseLookup.unavailable',
          params: {},
          fieldErrors: {},
          remedies: [{ id: 'retry_expense_options' }],
          correlationId: 'disposable-reference',
        }),
      }),
    );
    const failedEditRow = page
      .locator('article')
      .filter({ hasText: `${marker} edit` })
      .first();
    await expect(failedEditRow).toBeVisible();
    await failedEditRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const failedEdit = page.locator('form[data-expense-entry-surface]');
    await expect(failedEdit).toBeVisible();
    await expect(
      failedEdit.locator('[data-problem-code="EXPENSE_LOOKUP_UNAVAILABLE"]'),
    ).toBeVisible();
    await expect(failedEdit.locator(warning)).toHaveCount(0);
    await expect(failedEdit.locator('select[name="timeEntryId"]')).toHaveValue(timeId);
    (output.failures as unknown[]).push({
      surface: 'edit',
      locale: 'en',
      lookupStatus: 503,
      warningSuppressed: true,
      originalLinkRetained: true,
    });
    persist();
    await page.unroute('**/app/api/expenses/time-options?*');

    expect(workerDiagnostics.pageErrors).toEqual([]);
    expect(workerDiagnostics.consoleErrors).toEqual([]);
    expect(ownerDiagnostics.pageErrors).toEqual([]);
    expect(ownerDiagnostics.consoleErrors).toEqual([]);
    await page.goto(url('/?lang=en'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(750);
    await expect(page.getByText('Offline sync could not finish.', { exact: false })).toHaveCount(0);
    expect(workerDiagnostics.syncRequests).toEqual([]);
    output.offlineEmptyQueue = {
      enabled: true,
      onlineEventDispatched: true,
      syncRequests: 0,
      falseFailureToastAbsent: true,
    };
    persist();
  } finally {
    db.close();
    await ownerContext.close();
  }
});
