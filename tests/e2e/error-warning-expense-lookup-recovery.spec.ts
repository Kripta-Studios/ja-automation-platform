import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-expense-lookup');

function seedLinkedHours(viewport: string, scenario = 96) {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const workerId = userId(e2eCredentials.worker.email);
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Expense lookup recovery ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-EXP-LOOKUP', scenario, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    const project = db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
      status: string;
    };
    if (project.status !== 'active') {
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable expense lookup project',
      });
    }
    repository.assignWorker(owner, { projectId, workerId, startsOn: today });
    const timeEntry = repository.createTimeEntry(repository.principalFor(workerId), {
      projectId,
      workDate: today,
      category: 'regular',
      minutes: 60,
      summary: 'Linked hours for expense lookup recovery',
    });
    return { projectId, workerId, timeEntryId: timeEntry.id, today };
  } finally {
    db.sqlite.close();
  }
}

function seedLinkedExpense(viewport: string, scenario: number, reviewed: boolean) {
  const fixture = seedLinkedHours(viewport, scenario);
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const repository = new PortalRepository(db.sqlite);
    const ownerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const owner = repository.principalFor(ownerId);
    const worker = repository.principalFor(fixture.workerId);
    if (reviewed) {
      const time = db.sqlite
        .prepare('SELECT version FROM time_entry WHERE id=?')
        .get(fixture.timeEntryId) as { version: number };
      repository.submitTime(worker, fixture.timeEntryId, time.version);
    }
    const expense = repository.createExpense(worker, {
      projectId: fixture.projectId,
      spentOn: fixture.today,
      vendor: reviewed ? 'Correction lookup lodging' : 'Edit lookup lodging',
      category: 'hotel',
      description: 'Linked expense in the disposable lookup fixture',
      currency: 'USD',
      amountMinor: 12_500n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      receiptRequired: false,
      timeEntryId: fixture.timeEntryId,
    });
    if (reviewed) {
      repository.submitExpense(worker, expense.id, expense.version);
      repository.operationalApproveExpense(owner, expense.id, 'needs_changes', 'Clarify lodging');
      repository.operationalApproveTime(
        owner,
        fixture.timeEntryId,
        'needs_changes',
        'Clarify linked work',
      );
      repository.createCorrectionDraft(worker, {
        recordType: 'time_entry',
        originalId: fixture.timeEntryId,
        requestId: randomUUID(),
        reason: 'Clarify the linked work summary',
        patch: { activitySummary: 'Corrected linked work summary' },
      });
    }
    return { ...fixture, expenseId: expense.id };
  } finally {
    db.sqlite.close();
  }
}

function diagnosticsFor(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: Array<{ method: string; status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/expenses/time-options')) {
      responses.push({
        method: response.request().method(),
        status: response.status(),
        path: new URL(response.url()).pathname,
      });
    }
  });
  return { pageErrors, consoleErrors, responses };
}

test('worker retains a linked expense draft when time choices fail, then retries', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const fixture = seedLinkedHours(info.project.name);
  const diagnostics = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'worker');

  let releaseFailure: () => void = () => undefined;
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  let requests = 0;
  await page.route('**/app/api/expenses/time-options?*', async (route) => {
    requests += 1;
    if (requests === 1) {
      await failureGate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: { 'cache-control': 'private, no-store' },
        body: JSON.stringify({
          success: false,
          code: 'EXPENSE_LOOKUP_UNAVAILABLE',
          messageKey: 'problem.expenseLookup.unavailable',
          params: { correlationId: 'expense-lookup-disposable-reference' },
          fieldErrors: {},
          remedies: [{ id: 'retry_expense_options' }],
          correlationId: 'expense-lookup-disposable-reference',
        }),
      });
    } else {
      await route.continue();
    }
  });

  try {
    const query = new URLSearchParams({
      lang: locale,
      project: fixture.projectId,
      worker: fixture.workerId,
      date: fixture.today,
      timeEntry: fixture.timeEntryId,
    });
    await page.goto(portal(`/expenses?${query}`));
    const form = page.locator('form[data-expense-entry-surface]');
    await expect(form).toBeVisible();
    await expect.poll(() => requests).toBe(1);
    const project = form.locator('[name="projectId"]');
    const date = form.locator('[name="spentOn"]');
    const linkedHours = form.locator('[name="timeEntryId"]');
    const description = form.locator('[name="description"]');
    await expect(project).toHaveValue(fixture.projectId);
    await expect(date).toHaveValue(fixture.today);
    await expect(linkedHours).toHaveValue(fixture.timeEntryId);
    await description.fill('Retained expense description while time lookup fails');
    await description.scrollIntoViewIfNeeded();
    const positionBefore = await description.evaluate((element) => ({
      viewportTop: element.getBoundingClientRect().top,
      scrollY: window.scrollY,
    }));
    const failedResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/expenses/time-options') && response.status() === 503,
    );
    releaseFailure();
    const failure = await failedResponse;
    expect(new URL(failure.url()).searchParams.get('workerId')).toBe(fixture.workerId);
    expect(await failure.json()).toMatchObject({
      code: 'EXPENSE_LOOKUP_UNAVAILABLE',
      messageKey: 'problem.expenseLookup.unavailable',
      remedies: [{ id: 'retry_expense_options' }],
    });
    const notice = form.locator(
      '[data-ui="problem-notice"][data-problem-code="EXPENSE_LOOKUP_UNAVAILABLE"]',
    );
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toContainText(
      locale === 'es'
        ? 'No se pudieron cargar las opciones de gastos'
        : 'We could not load expense choices',
    );
    await expect(
      form.getByRole('button', {
        name: locale === 'es' ? 'Volver a cargar las opciones' : 'Retry loading choices',
      }),
    ).toBeVisible();
    await expect(project).toHaveValue(fixture.projectId);
    await expect(date).toHaveValue(fixture.today);
    await expect(linkedHours).toHaveValue(fixture.timeEntryId);
    await expect(linkedHours.locator('option:checked')).toContainText(
      /Current linked hours|Horas vinculadas actuales/i,
    );
    await expect(description).toHaveValue('Retained expense description while time lookup fails');
    await expect(notice).toBeFocused();
    await expect(notice).toBeInViewport();
    await expect
      .poll(async () =>
        notice.evaluate((element) => {
          const sheet = element.closest('.responsive-sheet-body');
          if (!sheet) return false;
          const noticeBox = element.getBoundingClientRect();
          const sheetBox = sheet.getBoundingClientRect();
          return noticeBox.top >= sheetBox.top - 2 && noticeBox.bottom <= sheetBox.bottom + 2;
        }),
      )
      .toBe(true);
    await expect(form.getByRole('button', { name: /Save draft|Guardar borrador/i })).toBeEnabled();
    await expect(form.getByText('The selected logged hours are no longer available.')).toHaveCount(
      0,
    );
    const positionAfter = await description.evaluate((element) => ({
      viewportTop: element.getBoundingClientRect().top,
      scrollY: window.scrollY,
    }));
    expect(positionAfter.scrollY).toBe(positionBefore.scrollY);
    steps.push({
      step: 'temporary-lookup-failure',
      code: 'EXPENSE_LOOKUP_UNAVAILABLE',
      retainedProjectWorkerDateTimeAndDescription: true,
      focusedNotice: true,
      scrollBefore: positionBefore.scrollY,
      scrollAfter: positionAfter.scrollY,
    });

    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(
      join(evidenceDirectory, `time-options-${info.project.name}-failure.png`),
      await notice.screenshot(),
    );

    const recoveredResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/expenses/time-options') && response.status() === 200,
    );
    await form
      .getByRole('button', {
        name: locale === 'es' ? 'Volver a cargar las opciones' : 'Retry loading choices',
      })
      .click();
    const recovered = await recoveredResponse;
    const recoveredBody = (await recovered.json()) as { rows?: Array<{ id: string }> };
    expect(recoveredBody.rows?.some((row) => row.id === fixture.timeEntryId)).toBe(true);
    await expect(notice).toHaveCount(0);
    await expect(linkedHours).toHaveValue(fixture.timeEntryId);
    await expect(description).toHaveValue('Retained expense description while time lookup fails');
    await expect(form).toBeVisible();
    steps.push({ step: 'retry', status: recovered.status(), selectedLinkedHoursRetained: true });

    writeFileSync(
      join(evidenceDirectory, `time-options-${info.project.name}-trace.json`),
      `${JSON.stringify(steps, null, 2)}\n`,
    );
    writeFileSync(
      join(evidenceDirectory, `time-options-${info.project.name}-network.json`),
      `${JSON.stringify(diagnostics.responses, null, 2)}\n`,
    );
    expect(diagnostics.responses.map((response) => response.status)).toEqual([503, 200]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally {
    releaseFailure();
  }
});

test('editing an expense warns when its linked hours do not cover a changed date', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const fixture = seedLinkedExpense(info.project.name, 97, false);
  const nextDay = new Date(Date.parse(`${fixture.today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const diagnostics = diagnosticsFor(page);
  const actionPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('?/updateExpense'))
      actionPosts.push(new URL(request.url()).pathname);
  });
  await signIn(page, 'worker');
  await page.goto(portal(`/expenses?lang=${locale}&project=${fixture.projectId}`));
  await page
    .locator(`[data-expense-record="${fixture.expenseId}"]`)
    .getByRole('button', { name: locale === 'es' ? 'Editar' : 'Edit' })
    .click();
  const form = page.locator('form[data-expense-entry-surface]');
  const date = form.locator('[name="spentOn"]');
  const linkedHours = form.locator('[name="timeEntryId"]');
  const save = form.getByRole('button', {
    name: locale === 'es' ? 'Guardar cambios' : 'Save changes',
  });
  await expect(form).toBeVisible();
  await expect(date).toHaveValue(fixture.today);
  await expect(linkedHours).toHaveValue(fixture.timeEntryId);
  const changedResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/expenses/time-options') &&
      new URL(response.url()).searchParams.get('date') === nextDay,
  );
  await date.fill(nextDay);
  await date.dispatchEvent('change');
  const response = await changedResponse;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { rows?: Array<{ id: string }> };
  expect(body.rows?.some((row) => row.id === fixture.timeEntryId)).toBe(false);
  await expect(linkedHours).toHaveValue(fixture.timeEntryId);
  await expect(linkedHours).toHaveAttribute('aria-invalid', 'true');
  await expect(linkedHours.locator('option:checked')).toContainText(
    /Linked hours unavailable|Horas vinculadas no disponibles/i,
  );
  const warning = form.locator('.operational-form-error[role="alert"]');
  await expect(warning).toContainText(
    locale === 'es'
      ? 'Las horas enlazadas pertenecen a la fecha anterior'
      : 'The linked hours belong to the previous date',
  );
  await expect(save).toBeDisabled();
  await expect(date).toHaveValue(nextDay);
  // Dismiss unrelated offline-sync fixture toasts before capturing the form warning.
  for (const dismiss of await page.locator('[data-ui="toast-region"] .ui-toast-dismiss').all()) {
    await dismiss.click();
  }
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `edit-date-${info.project.name}-warning.png`),
    await warning.screenshot(),
  );
  await linkedHours.selectOption('');
  await expect(linkedHours).toHaveValue('');
  await expect(linkedHours).toHaveAttribute('aria-invalid', 'false');
  await expect(warning).toHaveCount(0);
  await expect(save).toBeEnabled();
  await expect(date).toHaveValue(nextDay);
  expect(actionPosts).toEqual([]);
  expect(diagnostics.responses.every((item) => item.status === 200)).toBe(true);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  writeFileSync(
    join(evidenceDirectory, `edit-date-${info.project.name}-trace.json`),
    `${JSON.stringify(
      [
        {
          step: 'changed-date',
          linkedHoursPreserved: true,
          warningVisible: true,
          saveDisabled: true,
        },
        { step: 'remove-link', datePreserved: true, warningCleared: true, saveEnabled: true },
      ],
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `edit-date-${info.project.name}-network.json`),
    `${JSON.stringify(diagnostics.responses, null, 2)}\n`,
  );
});

test('correction keeps an unchanged original time link with an active time correction', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const fixture = seedLinkedExpense(info.project.name, 98, true);
  const diagnostics = diagnosticsFor(page);
  await signIn(page, 'worker');
  await page.goto(portal(`/expenses/${fixture.expenseId}?lang=${locale}`));
  const form = page.locator('form[data-correction-draft-form]');
  const linkedHours = form.locator('[name="timeEntryId"]');
  await expect(form).toBeVisible();
  await expect(form.locator('[name="spentOn"]')).toHaveValue(fixture.today);
  await expect(linkedHours).toHaveValue(fixture.timeEntryId);
  await expect(linkedHours).toHaveAttribute('aria-invalid', 'false');
  await expect(linkedHours.locator('option:checked')).toContainText(
    /Current linked hours|Horas vinculadas actuales/i,
  );
  await expect(linkedHours.locator('option:checked')).not.toContainText(
    /Needs review|Necesita revisión/i,
  );
  await expect(form.locator('#correction-time-link-warning')).toHaveCount(0);
  await expect(form.locator('[data-ui="problem-notice"]')).toHaveCount(0);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `correction-original-link-${info.project.name}.png`),
    await linkedHours.screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `correction-original-link-${info.project.name}-trace.json`),
    `${JSON.stringify(
      {
        originalTimeHasActiveCorrection: true,
        originalExpenseLinkRetained: true,
        unchangedDate: true,
        falseUnavailableWarning: false,
      },
      null,
      2,
    )}\n`,
  );
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});
