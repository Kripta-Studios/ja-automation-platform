import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-expense-detail');
const today = new Date().toISOString().slice(0, 10);
const nextDay = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function seedExpenses(viewport: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const workerId = userId(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Expense detail recovery ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-EXPENSE-DETAIL', 86, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    const status = (
      db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable expense-detail QA project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: today });
    const worker = repository.principalFor(workerId);
    const time = repository.createTimeEntry(worker, {
      projectId,
      workDate: today,
      category: 'regular',
      minutes: 60,
      summary: 'Linked work for expense-detail QA',
    });
    repository.submitTime(worker, time.id, time.version);
    const ids = ['stale', 'success', 'linked'].map((scenario) => {
      const expense = repository.createExpense(worker, {
        projectId,
        spentOn: today,
        vendor: `Original ${scenario} vendor`,
        category: 'hotel',
        description: 'Original project lodging',
        currency: 'EUR',
        amountMinor: 12_500n,
        whoPaid: 'worker',
        clientTreatment: 'reimbursable',
        receiptRequired: false,
        ...(scenario === 'linked' ? { timeEntryId: time.id } : {}),
      });
      repository.submitExpense(worker, expense.id, expense.version);
      repository.operationalApproveExpense(owner, expense.id, 'needs_changes', 'Clarify vendor');
      return expense.id;
    });
    return {
      databasePath,
      workerId,
      staleId: ids[0]!,
      successId: ids[1]!,
      linkedId: ids[2]!,
      timeId: time.id,
    };
  } finally {
    db.sqlite.close();
  }
}

function createOutsideCorrection(databasePath: string, workerId: string, originalId: string) {
  const db = createDatabase(databasePath);
  try {
    const repository = new PortalRepository(db.sqlite);
    return repository.createCorrectionDraft(repository.principalFor(workerId), {
      recordType: 'expense',
      originalId,
      requestId: randomUUID(),
      reason: 'Concurrent correction in disposable fixture',
      patch: { vendor: 'Concurrent corrected vendor' },
    }).correctionId;
  } finally {
    db.sqlite.close();
  }
}

function correctionId(databasePath: string, originalId: string): string | null {
  const db = createDatabase(databasePath);
  try {
    return (
      (
        db.sqlite
          .prepare(
            `SELECT correction_id FROM record_correction_link
           WHERE record_type='expense' AND original_id=? ORDER BY created_at DESC LIMIT 1`,
          )
          .get(originalId) as { correction_id: string } | undefined
      )?.correction_id ?? null
    );
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

function diagnosticsFor(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { pageErrors, consoleErrors, responses };
}

async function nativeCorrection(page: Page): Promise<number> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createCorrectionDraft'),
  );
  await page
    .locator('form[data-correction-draft-form]')
    .evaluate((form: HTMLFormElement) => form.submit());
  return (await responsePromise).status();
}

async function evidence(
  page: Page,
  name: string,
  diagnostic: ReturnType<typeof diagnosticsFor>,
  steps: Array<Record<string, string | number | boolean>>,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${name}.png`),
    await page.locator('[data-expense-detail-problem] [data-ui="problem-notice"]').screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-network.json`),
    `${JSON.stringify([...new Set(diagnostic.responses.map((r) => `${r.status} ${r.path}`))].sort(), null, 2)}\n`,
  );
  expect(diagnostic.pageErrors).toEqual([]);
  expect(
    diagnostic.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
}

test('expense detail recovers invalid correction, success, concurrent correction, and denied role', async ({
  page,
  browser,
}: {
  page: Page;
  browser: Browser;
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const fixture = seedExpenses(info.project.name);
  const diagnostic = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'worker');
  const staleUrl = portal(`/expenses/${fixture.staleId}?lang=${locale}`);
  await page.goto(staleUrl);
  let form = page.locator('form[data-correction-draft-form]');
  await expect(form).toBeVisible();
  await form.locator('[name="vendor"]').fill('Retained vendor after invalid amount');
  await form.locator('[name="reason"]').fill('Correct the supplier and amount');
  await form.locator('[name="amount"]').evaluate((control: HTMLInputElement) => {
    control.value = '-1';
  });
  await form.scrollIntoViewIfNeeded();
  const invalidScroll = await page.evaluate(() => window.scrollY);
  expect(await nativeCorrection(page)).toBe(400);
  let notice = page.locator('[data-expense-detail-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'EXPENSE_CORRECTION_AMOUNT_INVALID');
  form = page.locator('form[data-correction-draft-form]');
  await expect(form.locator('[name="vendor"]')).toHaveValue('Retained vendor after invalid amount');
  await expect(form.locator('[name="reason"]')).toHaveValue('Correct the supplier and amount');
  await expect(form.locator('[name="amount"]')).toHaveValue('-1');
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  expect
    .soft(Math.abs((await page.evaluate(() => window.scrollY)) - invalidScroll))
    .toBeLessThan(12);
  steps.push({ step: 'invalid-native', code: 'EXPENSE_CORRECTION_AMOUNT_INVALID', retained: true });

  await page.goto(portal(`/expenses/${fixture.successId}?lang=${locale}`));
  form = page.locator('form[data-correction-draft-form]');
  await form.locator('[name="vendor"]').fill('Saved corrected lodging vendor');
  await form.locator('[name="reason"]').fill('Match the corrected receipt');
  await form
    .getByRole('button', { name: /Create corrected draft|Criar rascunho corrigido/i })
    .click();
  await expect.poll(() => correctionId(fixture.databasePath, fixture.successId)).not.toBeNull();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText(/Draft|Rascunho/i);
  steps.push({ step: 'success-enhanced', saved: true });

  await page.goto(portal(`/expenses/${fixture.linkedId}?lang=${locale}`));
  form = page.locator('form[data-correction-draft-form]');
  await expect(form.locator('[name="timeEntryId"]')).toHaveValue(fixture.timeId);
  await form.locator('[name="spentOn"]').fill(nextDay);
  await form.locator('[name="spentOn"]').dispatchEvent('change');
  await expect(form.locator('[name="timeEntryId"]')).toHaveValue(fixture.timeId);
  await expect(form.locator('[name="timeEntryId"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator(`#correction-time-link-warning`)).toBeVisible();
  await expect(form.locator('[name="timeEntryId"] option:checked')).toContainText(
    /Needs review|Revis/i,
  );
  await form.locator('[name="vendor"]').fill('Retained linked-expense vendor');
  await form.locator('[name="reason"]').fill('Review the linked work after changing the date');
  await form.scrollIntoViewIfNeeded();
  const linkedScroll = await page.evaluate(() => window.scrollY);
  const linkedRequest = await form.evaluate((element: HTMLFormElement) => {
    const values = new FormData(element);
    return {
      actionPath: new URL(element.action).pathname,
      actionQuery: new URL(element.action).search,
      spentOn: String(values.get('spentOn') ?? ''),
      hasLinkedTime: Boolean(values.get('timeEntryId')),
      linkedTimeId: String(values.get('timeEntryId') ?? ''),
    };
  });
  expect(linkedRequest.spentOn).toBe(nextDay);
  const linkedStatus = await nativeCorrection(page);
  if (linkedStatus === 303) {
    const database = createDatabase(fixture.databasePath);
    try {
      const created = database.sqlite
        .prepare(
          `SELECT c.spent_on spentOn,c.time_entry_id timeEntryId FROM record_correction_link l
           JOIN expense c ON c.id=l.correction_id WHERE l.record_type='expense' AND l.original_id=?
           ORDER BY l.created_at DESC LIMIT 1`,
        )
        .get(fixture.linkedId) as { spentOn: string; timeEntryId: string | null } | undefined;
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(
        join(evidenceDirectory, `linked-hours-${info.project.name}-diagnostic.json`),
        `${JSON.stringify(
          {
            request: {
              actionPath: linkedRequest.actionPath,
              actionQuery: linkedRequest.actionQuery,
              spentOn: linkedRequest.spentOn,
              hasLinkedTime: linkedRequest.hasLinkedTime,
              linkMatchesOriginal: linkedRequest.linkedTimeId === fixture.timeId,
            },
            responseStatus: linkedStatus,
            created: created
              ? {
                  spentOn: created.spentOn,
                  hasLinkedTime: Boolean(created.timeEntryId),
                  linkMatchesOriginal: created.timeEntryId === fixture.timeId,
                }
              : null,
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      database.sqlite.close();
    }
  }
  expect(linkedStatus).toBe(409);
  notice = page.locator('[data-expense-detail-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'EXPENSE_CORRECTION_TIME_LINK_INVALID');
  form = page.locator('form[data-correction-draft-form]');
  await expect(form.locator('[name="spentOn"]')).toHaveValue(nextDay);
  await expect(form.locator('[name="timeEntryId"]')).toHaveValue(fixture.timeId);
  await expect(form.locator('[name="vendor"]')).toHaveValue('Retained linked-expense vendor');
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  expect
    .soft(Math.abs((await page.evaluate(() => window.scrollY)) - linkedScroll))
    .toBeLessThan(12);
  steps.push({
    step: 'changed-date-linked-hours-native',
    code: 'EXPENSE_CORRECTION_TIME_LINK_INVALID',
    retained: true,
  });

  await page.goto(staleUrl);
  form = page.locator('form[data-correction-draft-form]');
  await form.locator('[name="vendor"]').fill('Retained vendor after another correction');
  await form.locator('[name="reason"]').fill('Retained correction explanation');
  const competingId = createOutsideCorrection(
    fixture.databasePath,
    fixture.workerId,
    fixture.staleId,
  );
  await form.scrollIntoViewIfNeeded();
  const staleScroll = await page.evaluate(() => window.scrollY);
  expect(await nativeCorrection(page)).toBe(409);
  notice = page.locator('[data-expense-detail-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'EXPENSE_CORRECTION_ALREADY_EXISTS');
  await expect(notice.locator(`a[href$="/expenses/${competingId}"]`)).toBeVisible();
  await expect(page.locator('form[data-correction-draft-form]')).toHaveCount(0);
  await expect(page.locator('#expense-retained-values-title')).toBeVisible();
  await expect(page.locator('[aria-labelledby="expense-retained-values-title"]')).toContainText(
    'Retained vendor after another correction',
  );
  await expect(page.locator('[aria-labelledby="expense-retained-values-title"]')).toContainText(
    'Retained correction explanation',
  );
  await expect(notice).toBeFocused();
  const staleScrollAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(staleScrollAfter - staleScroll)).toBeLessThan(12);
  steps.push({
    step: 'concurrent-correction-native',
    code: 'EXPENSE_CORRECTION_ALREADY_EXISTS',
    retained: true,
    scrollBefore: staleScroll,
    scrollAfter: staleScrollAfter,
  });

  const deniedPage = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(deniedPage, 'worker2');
    const denial = await deniedPage.evaluate(
      async ({ id, url, requestId }) => {
        const response = await fetch(`${url}/expenses/${id}?/createCorrectionDraft`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({
            recordType: 'expense',
            correctionFields: 'expense',
            originalId: id,
            requestId,
            reason: 'Unauthorized correction attempt',
            vendor: 'Unauthorized vendor',
            spentOn: new Date().toISOString().slice(0, 10),
            description: 'Unauthorized change',
            category: 'hotel',
            amount: '125.00',
          }),
        });
        const result = (await response.json()) as {
          type?: string;
          status?: number;
          data?: unknown;
        };
        return { status: response.status, result };
      },
      { id: fixture.staleId, url: portal(''), requestId: randomUUID() },
    );
    expect(denial.result.type).toBe('failure');
    expect(denial.result.status).toBe(403);
    expect(JSON.stringify(denial.result.data)).toContain('EXPENSE_CORRECTION_ACCESS_REQUIRED');
    diagnostic.responses.push({ status: denial.status, path: new URL(staleUrl).pathname });
    steps.push({ step: 'worker2-role-denied', code: 'EXPENSE_CORRECTION_ACCESS_REQUIRED' });
  } finally {
    await deniedPage.close();
  }
  await evidence(page, `${info.project.name}-${locale}`, diagnostic, steps);
});
