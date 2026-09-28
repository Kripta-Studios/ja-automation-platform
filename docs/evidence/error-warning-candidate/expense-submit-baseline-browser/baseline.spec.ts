import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const date = '2026-09-25';

function writeSanitizedResults(results: Record<string, unknown>) {
  writeFileSync(
    join(evidenceRoot, 'results.json'),
    JSON.stringify(
      results,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(
              /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
              ':record',
            )
          : value,
      2,
    ) + '\n',
  );
}

function diagnostics(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    failedRequests: [] as string[],
  };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      result.failedRequests.push(
        `${response.status()} ${new URL(response.url()).pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/iu, '/:record')}`,
      );
  });
  return result;
}

function expenseState(db: DatabaseSync, id: string) {
  return db
    .prepare('SELECT approval_state,version,receipt_required,vendor FROM expense WHERE id=?')
    .get(id) as {
    approval_state: string;
    version: number;
    receipt_required: number;
    vendor: string;
  };
}

function expenseAuditCount(db: DatabaseSync, id: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(id) as {
      count: number;
    }
  ).count;
}

async function decodeActionData(data: string): Promise<Record<string, unknown>> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return parse(data);
}

async function captureAction(page: Page, action: string, click: () => Promise<void>) {
  const pending = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await click();
  const response = await pending;
  const body = (await response.json()) as { type: string; status: number; data: string };
  return {
    transportStatus: response.status(),
    type: body.type,
    actionStatus: body.status,
    data: await decodeActionData(body.data),
  };
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
  if (!clientId) throw new Error('Disposable client fixture is unavailable');
  const name = `Expense submit baseline ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-EXPSUB-${Date.now() % 100000000}`);
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
  expect(
    db
      .prepare("SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active'")
      .get(project.id, workerId),
  ).toBeTruthy();
  return project.id;
}

async function createReceiptOptionalDraft(page: Page, db: DatabaseSync, projectId: string) {
  await page.goto(portal(`/expenses?lang=en&project=${projectId}`));
  await page.locator('[data-expense-primary-cta]').click();
  const form = page.locator('form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  const marker = `No receipt parking ${randomUUID()}`;
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="spentOn"]').fill(date);
  await form.locator('select[name="category"]').selectOption('parking');
  await form.locator('input[name="vendor"]').fill(marker);
  await form.locator('input[name="amount"]').fill('8.75');
  await form.locator('select[name="currency"]').selectOption('USD');
  await form.locator('select[name="whoPaid"]').selectOption('worker');
  await form
    .locator('textarea[name="description"]')
    .fill('Disposable parking expense without required receipt');
  await form.locator('input[name="paymentMethod"]').fill('Cash');
  await expect(form.locator('input[name="receipt"]')).toHaveValue('');
  const saved = await captureAction(page, 'createExpense', () =>
    form.getByRole('button', { name: 'Save draft' }).click(),
  );
  expect(saved).toMatchObject({ transportStatus: 200, type: 'success', actionStatus: 200 });
  await expect
    .poll(() => db.prepare('SELECT id FROM expense WHERE vendor=?').get(marker))
    .toBeTruthy();
  const id = (db.prepare('SELECT id FROM expense WHERE vendor=?').get(marker) as { id: string }).id;
  expect(expenseState(db, id)).toMatchObject({
    approval_state: 'draft',
    version: 1,
    receipt_required: 0,
  });
  return id;
}

async function noticeSnapshot(page: Page) {
  const notice = page.locator('[data-expense-detail-problem] [data-ui="problem-notice"]');
  await expect(notice).toBeVisible();
  return notice.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      text: element.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      code: element.getAttribute('data-problem-code'),
      focused: document.activeElement === element,
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      viewportHeight: innerHeight,
      scrollY: Math.round(scrollY),
      links: [...element.querySelectorAll('a')].map((link) => ({
        text: link.textContent?.trim() ?? '',
        href:
          link.getAttribute('href')?.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/iu, '/:record') ?? '',
      })),
    };
  });
}

test('Worker stale Expense draft submission baseline in real browser', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerDiagnostics = diagnostics(page);
  const results: Record<string, unknown> = {
    candidateCommit: 'f5b37aa2604a925ec649af83d61802d2866296cd',
    fixture: 'new disposable E2E database; Owner project and Worker expense created in rendered UI',
    cases: [],
  };
  const cases = results.cases as Array<Record<string, unknown>>;
  const workerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  try {
    const projectId = await createOwnerProject(page, db);
    const tabA = await workerContext.newPage();
    const tabADiagnostics = diagnostics(tabA);
    await signIn(tabA, 'worker');
    const expenseId = await createReceiptOptionalDraft(tabA, db, projectId);
    await tabA.goto(portal(`/expenses/${expenseId}?lang=en`));
    const submitA = tabA.locator('form[data-expense-detail-action="submitExpense"]');
    await expect(submitA).toBeVisible();
    await expect(submitA.locator('input[name="version"]')).toHaveValue('1');
    const tabB = await workerContext.newPage();
    const tabBDiagnostics = diagnostics(tabB);
    await tabB.goto(portal(`/expenses?lang=en&project=${projectId}`));
    const row = tabB.locator(`[data-expense-record="${expenseId}"]`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = tabB.locator('form[action="?/updateExpense"]');
    await expect(edit).toBeVisible();
    await edit.locator('input[name="vendor"]').fill('Updated parking supplier in Tab B');
    const updated = await captureAction(tabB, 'updateExpense', () =>
      edit.getByRole('button', { name: 'Save changes' }).click(),
    );
    expect(updated).toMatchObject({ transportStatus: 200, type: 'success', actionStatus: 200 });
    await expect.poll(() => expenseState(db, expenseId).version).toBe(2);
    const auditBeforeStale = expenseAuditCount(db, expenseId);
    await submitA.scrollIntoViewIfNeeded();
    const before = await tabA.evaluate(() => ({
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
    }));
    const stale = await captureAction(tabA, 'submitExpense', () =>
      submitA.getByRole('button', { name: 'Submit' }).click(),
    );
    expect(stale).toMatchObject({ transportStatus: 200, type: 'failure', actionStatus: 409 });
    const after = await noticeSnapshot(tabA);
    expect(expenseState(db, expenseId)).toMatchObject({
      approval_state: 'draft',
      version: 2,
      receipt_required: 0,
    });
    expect(expenseAuditCount(db, expenseId)).toBe(auditBeforeStale);
    await tabA
      .locator('[data-expense-detail-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'worker-390-en-stale-edit.png') });
    const review = tabA.locator('[data-expense-detail-problem] a').first();
    const remedyHref = await review.getAttribute('href');
    const beforeOrigin = await tabA.evaluate(() => performance.timeOrigin);
    const getPaths: string[] = [];
    tabA.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes(`/expenses/${expenseId}`))
        getPaths.push(new URL(request.url()).pathname.replace(expenseId, ':record'));
    });
    await review.click();
    await tabA.waitForLoadState('networkidle');
    const afterOrigin = await tabA.evaluate(() => performance.timeOrigin);
    const afterRemedyVersion = await tabA
      .locator('form[data-expense-detail-action="submitExpense"] input[name="version"]')
      .inputValue()
      .catch(() => null);
    const noticeAfterRemedy = await tabA.locator('[data-expense-detail-problem]').count();
    cases.push({
      name: 'worker_390_en_edited_draft_stale_submit',
      before,
      after,
      transportStatus: stale.transportStatus,
      actionStatus: stale.actionStatus,
      code: stale.data.code,
      messageKey: stale.data.messageKey,
      params: stale.data.params,
      remedies: stale.data.remedies,
      remedyHref: remedyHref?.replace(expenseId, ':record') ?? null,
      stateAfter: 'draft',
      versionAfter: 2,
      receiptRequired: false,
      auditDeltaAfterStale: 0,
      remedyNavigation: {
        freshDocument: afterOrigin !== beforeOrigin,
        getPaths,
        version: afterRemedyVersion,
        noticeStillVisible: noticeAfterRemedy > 0,
      },
    });
    writeSanitizedResults(results);
    // The detail tab must hold the current version before Tab B submits it.
    if (afterRemedyVersion !== '2') await tabA.reload();
    await expect(
      tabA.locator('form[data-expense-detail-action="submitExpense"] input[name="version"]'),
    ).toHaveValue('2');
    await tabB.goto(portal(`/expenses/${expenseId}?lang=en`));
    const submitB = tabB.locator('form[data-expense-detail-action="submitExpense"]');
    await expect(submitB).toBeVisible();
    await submitB.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(() => expenseState(db, expenseId).approval_state).toBe('submitted');
    const auditBeforeSecondStale = expenseAuditCount(db, expenseId);
    const secondForm = tabA.locator('form[data-expense-detail-action="submitExpense"]');
    await expect(secondForm.locator('input[name="version"]')).toHaveValue('2');
    const second = await captureAction(tabA, 'submitExpense', () =>
      secondForm.getByRole('button', { name: 'Submit' }).click(),
    );
    expect(second).toMatchObject({ transportStatus: 200, type: 'failure', actionStatus: 409 });
    const secondAfter = await noticeSnapshot(tabA);
    expect(expenseState(db, expenseId).approval_state).toBe('submitted');
    expect(expenseAuditCount(db, expenseId)).toBe(auditBeforeSecondStale);
    cases.push({
      name: 'worker_390_en_already_submitted_stale_submit',
      after: secondAfter,
      transportStatus: second.transportStatus,
      actionStatus: second.actionStatus,
      code: second.data.code,
      messageKey: second.data.messageKey,
      params: second.data.params,
      remedies: second.data.remedies,
      stateAfter: 'submitted',
      versionAfter: expenseState(db, expenseId).version,
      auditDeltaAfterStale: 0,
    });
    await tabA
      .locator('[data-expense-detail-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'worker-390-en-already-submitted.png') });

    expect(ownerDiagnostics.pageErrors).toEqual([]);
    expect(tabADiagnostics.pageErrors).toEqual([]);
    expect(tabBDiagnostics.pageErrors).toEqual([]);
    expect(ownerDiagnostics.consoleErrors).toEqual([]);
    expect(tabADiagnostics.consoleErrors).toEqual([]);
    expect(tabBDiagnostics.consoleErrors).toEqual([]);
    results.diagnostics = {
      owner: ownerDiagnostics,
      workerTabA: tabADiagnostics,
      workerTabB: tabBDiagnostics,
    };
    writeSanitizedResults(results);
  } finally {
    await workerContext.close();
    db.close();
  }
});
