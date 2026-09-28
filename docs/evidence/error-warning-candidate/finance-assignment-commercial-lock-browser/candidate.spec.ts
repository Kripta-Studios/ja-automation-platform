import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const lockCode = 'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME';

function diagnostics(page: Page) {
  const result = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  return result;
}

function saveResults(results: Record<string, unknown>) {
  writeFileSync(
    join(evidenceRoot, 'results.json'),
    JSON.stringify(
      results,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, ':record')
          : value,
      2,
    ) + '\n',
  );
}

async function createProject(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
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
  if (!clientId) throw new Error('Disposable client fixture unavailable');
  const projectName = `Commercial lock browser ${randomUUID()}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(projectName);
  await form.locator('[name="costCenterCode"]').fill(`QA-CLOCK-${Date.now() % 100000000}`);
  await form.locator('[name="startDate"]').fill('2026-09-01');
  await form.locator('[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(projectName))
    .toBeTruthy();
  const projectId = (
    db.prepare('SELECT id FROM project WHERE name=?').get(projectName) as { id: string }
  ).id;
  const assignmentId = (
    db
      .prepare("SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active'")
      .get(projectId, workerId) as { id: string }
  ).id;
  return { projectId, assignmentId, workerId };
}

async function createClientRate(finance: Page, db: DatabaseSync, projectId: string) {
  await finance.goto(
    portal(`/finance?view=commercial&project=${projectId}&task=Client%20labor%20rate&lang=en`),
  );
  const form = finance.locator('form[action*="?/createClientLaborRate"]');
  await expect(form).toBeVisible();
  await form.locator('[name="currency"]').selectOption('USD');
  await form.locator('[data-minor-target="hourlyRateMinor"]').fill('71.25');
  await form.locator('[name="effectiveFrom"]').fill('2026-09-01');
  const response = finance.waitForResponse(
    (item) => item.request().method() === 'POST' && item.url().includes('?/createClientLaborRate'),
  );
  await form.getByRole('button', { name: 'Save client rate' }).click();
  expect((await response).status()).toBeLessThan(400);
  await expect
    .poll(() =>
      db
        .prepare('SELECT id FROM client_labor_rate WHERE project_id=? AND hourly_rate_minor=7125')
        .get(projectId),
    )
    .toBeTruthy();
  return (
    db
      .prepare('SELECT id FROM client_labor_rate WHERE project_id=? AND hourly_rate_minor=7125')
      .get(projectId) as { id: string }
  ).id;
}

async function recordWorkerTime(worker: Page, db: DatabaseSync, projectId: string) {
  await signIn(worker, 'worker');
  await worker.goto(portal(`/time?lang=en&project=${projectId}&date=2026-09-25`));
  await worker.locator('[data-time-primary-cta]').click();
  const form = worker.locator('form[data-time-entry-surface]');
  await expect(form).toBeVisible();
  await form.locator('[name="projectId"]').selectOption(projectId);
  await form.locator('[name="workDate"]').fill('2026-09-25');
  await form.getByRole('textbox', { name: 'Actual hours' }).fill('1');
  const marker = `Commercial lock time ${randomUUID()}`;
  await form.locator('[name="summary"]').fill(marker);
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(marker))
    .toBeTruthy();
  return (
    db.prepare('SELECT approval_state FROM time_entry WHERE activity_summary=?').get(marker) as {
      approval_state: string;
    }
  ).approval_state;
}

function assignment(db: DatabaseSync, assignmentId: string) {
  return db
    .prepare(
      'SELECT version,client_bill_rule_id,allow_global_compensation_fallback,allow_global_internal_cost_fallback FROM project_member WHERE id=?',
    )
    .get(assignmentId) as {
    version: number;
    client_bill_rule_id: string | null;
    allow_global_compensation_fallback: number;
    allow_global_internal_cost_fallback: number;
  };
}

async function openCommercial(finance: Page, projectId: string, language: string) {
  await finance.goto(
    portal(`/finance?view=commercial&project=${projectId}&lang=${language}#finance-rule-registers`),
  );
  const editor = finance.locator('.assignment-commercial-editor').first();
  await expect(editor).toBeVisible();
  await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  return editor;
}

async function post(finance: Page, action: string, click: () => Promise<void>) {
  const pending = finance.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await click();
  const response = await pending;
  await finance.waitForLoadState('networkidle');
  const body = await response.text();
  return {
    status: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    code: body.includes(lockCode) ? lockCode : null,
    generic: body.includes('Check the submitted values'),
  };
}

async function visible(finance: Page, action: string) {
  return finance.evaluate((requestedAction) => {
    const form = document.querySelector<HTMLFormElement>(`form[action*="?/${requestedAction}"]`);
    const editor = form?.closest('details');
    const wrapper = form?.querySelector<HTMLElement>('[data-finance-problem]');
    const notice = wrapper?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const box = notice?.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    return {
      routeView: new URL(location.href).searchParams.get('view'),
      language: document.documentElement.lang,
      code: notice?.getAttribute('data-problem-code') ?? null,
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((link) => ({
        text: link.textContent?.trim() ?? '',
        path: new URL(link.href).pathname,
        task: new URL(link.href).searchParams.get('task'),
        hash: new URL(link.href).hash,
      })),
      editorOpen: editor?.open ?? false,
      focusedNotice: document.activeElement === wrapper || document.activeElement === notice,
      top: box ? Math.round(box.top) : null,
      bottom: box ? Math.round(box.bottom) : null,
      headerBottom: Math.round(header?.getBoundingClientRect().bottom ?? 0),
      viewportHeight: innerHeight,
      scrollY: Math.round(scrollY),
      fields: form ? Object.fromEntries(new FormData(form).entries()) : {},
    };
  }, action);
}

test('recorded time locks Finance assignment commercial choices in rendered browser', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const owner = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const worker = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  const manager = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const diagnosticsByRole = {
    finance: diagnostics(page),
    owner: diagnostics(owner),
    worker: diagnostics(worker),
    manager: diagnostics(manager),
  };
  const results: Record<string, unknown> = {
    candidateCommit: 'aa469a8',
    fixture: 'fresh disposable database, project/rate/time created through rendered forms',
    viewports: [
      'Finance EN 390',
      'Finance ES 1440',
      'Finance PT 390',
      'Owner 1440',
      'Worker 390',
      'Manager 1440',
    ],
    cases: [],
  };
  const cases = results.cases as Array<Record<string, unknown>>;
  try {
    const { projectId, assignmentId } = await createProject(owner, db);
    await signIn(page, 'finance');
    const rateId = await createClientRate(page, db, projectId);
    let editor = await openCommercial(page, projectId, 'en');
    const initial = assignment(db, assignmentId);
    expect(initial.client_bill_rule_id).toBeNull();
    const fallback = editor.locator('form[action*="?/setAssignmentCommercialFallback"]');
    await fallback
      .locator('[name="allowGlobalCompensation"]')
      .selectOption(initial.allow_global_compensation_fallback ? 'no' : 'yes');
    await fallback
      .locator('[name="allowGlobalInternalCost"]')
      .selectOption(initial.allow_global_internal_cost_fallback ? 'no' : 'yes');
    const attemptedFallback = await fallback.evaluate((form) =>
      Object.fromEntries(new FormData(form as HTMLFormElement).entries()),
    );
    const workerState = await recordWorkerTime(worker, db, projectId);
    const auditBefore = (
      db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(assignmentId) as {
        count: number;
      }
    ).count;
    const enResponse = await post(page, 'setAssignmentCommercialFallback', () =>
      fallback.getByRole('button', { name: 'Save fallback options' }).click(),
    );
    const enVisible = await visible(page, 'setAssignmentCommercialFallback');
    cases.push({
      kind: 'fallback-after-concurrent-worker-time-en-390',
      workerTimeState: workerState,
      attemptedFallback,
      response: enResponse,
      visible: enVisible,
    });
    expect(enResponse).toMatchObject({ status: 409, code: lockCode, generic: false });
    expect(enVisible).toMatchObject({
      code: lockCode,
      editorOpen: true,
      focusedNotice: true,
      routeView: 'commercial',
    });
    expect(enVisible.wording).toContain('Time has been recorded');
    expect(enVisible.remedies.map((item) => item.task)).toEqual(
      expect.arrayContaining([
        'Compensation statement rules',
        'Client labor rates',
        'Assignment budget context / internal loaded cost',
      ]),
    );
    expect(enVisible.top).toBeGreaterThanOrEqual(enVisible.headerBottom - 2);
    expect(enVisible.bottom).toBeLessThanOrEqual(enVisible.viewportHeight);
    expect(assignment(db, assignmentId)).toEqual(initial);
    expect(
      (
        db
          .prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?')
          .get(assignmentId) as { count: number }
      ).count,
    ).toBe(auditBefore);
    await page
      .locator('form[action*="?/setAssignmentCommercialFallback"] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'finance-fallback-phone-390-en.png') });
    await page
      .locator('form[action*="?/setAssignmentCommercialFallback"] [data-ui="problem-notice"] a')
      .first()
      .click();
    await expect(page).toHaveURL(/task=Compensation(?:%20|\+)statement(?:%20|\+)rules/u);
    await expect(page.locator('#finance-configuration-task')).toHaveValue(
      'Compensation statement rules',
    );
    cases.push({
      kind: 'dated-pay-rule-remedy-click',
      taskSelected: true,
      routeView: new URL(page.url()).searchParams.get('view'),
      hash: new URL(page.url()).hash,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    editor = await openCommercial(page, projectId, 'es');
    const references = editor.locator('form[action*="?/setAssignmentCommercialRuleReferences"]');
    await references.locator('[name="clientBillRuleId"]').selectOption(rateId);
    const attemptedReferences = await references.evaluate((form) =>
      Object.fromEntries(new FormData(form as HTMLFormElement).entries()),
    );
    const esResponse = await post(page, 'setAssignmentCommercialRuleReferences', () =>
      references.locator('button[type="submit"]').click(),
    );
    const esVisible = await visible(page, 'setAssignmentCommercialRuleReferences');
    cases.push({
      kind: 'rule-reference-after-recorded-time-es-1440',
      attemptedReferences,
      response: esResponse,
      visible: esVisible,
    });
    expect(esResponse).toMatchObject({ status: 409, code: lockCode, generic: false });
    expect(esVisible).toMatchObject({ code: lockCode, editorOpen: true, focusedNotice: true });
    expect(esVisible.wording).toContain('Ya se han registrado horas');
    expect(esVisible.fields.clientBillRuleId).toBe(rateId);
    expect(esVisible.top).toBeGreaterThanOrEqual(esVisible.headerBottom - 2);
    expect(esVisible.bottom).toBeLessThanOrEqual(esVisible.viewportHeight);
    expect(assignment(db, assignmentId)).toEqual(initial);
    await page
      .locator('form[action*="?/setAssignmentCommercialRuleReferences"] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'finance-rule-desktop-1440-es.png') });

    const enhanced = await page
      .locator('form[action*="?/setAssignmentCommercialRuleReferences"]')
      .evaluate(async (form) => {
        const response = await fetch((form as HTMLFormElement).action, {
          method: 'POST',
          body: new FormData(form as HTMLFormElement),
          headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
        });
        const body = await response.text();
        const envelope = JSON.parse(body) as { type?: string; status?: number };
        return {
          transportStatus: response.status,
          actionStatus: envelope.status,
          type: envelope.type,
          code: body.includes('FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME')
            ? 'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME'
            : null,
          generic: body.includes('Check the submitted values'),
        };
      });
    cases.push({ kind: 'enhanced-action-envelope', response: enhanced });
    expect(enhanced).toMatchObject({
      transportStatus: 200,
      actionStatus: 409,
      type: 'failure',
      code: lockCode,
      generic: false,
    });
    expect(assignment(db, assignmentId)).toEqual(initial);

    await page.setViewportSize({ width: 390, height: 844 });
    editor = await openCommercial(page, projectId, 'pt');
    const ptFallback = editor.locator('form[action*="?/setAssignmentCommercialFallback"]');
    await ptFallback
      .locator('[name="allowGlobalCompensation"]')
      .selectOption(initial.allow_global_compensation_fallback ? 'no' : 'yes');
    const ptResponse = await post(page, 'setAssignmentCommercialFallback', () =>
      ptFallback.getByRole('button').click(),
    );
    const ptVisible = await visible(page, 'setAssignmentCommercialFallback');
    cases.push({
      kind: 'fallback-after-recorded-time-pt-390',
      response: ptResponse,
      visible: ptVisible,
    });
    expect(ptResponse).toMatchObject({ status: 409, code: lockCode });
    expect(ptVisible.wording).toContain('Já foram registadas horas');
    expect(ptVisible.editorOpen).toBe(true);
    expect(ptVisible.focusedNotice).toBe(true);
    expect(assignment(db, assignmentId)).toEqual(initial);
    await page
      .locator('form[action*="?/setAssignmentCommercialFallback"] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'finance-fallback-phone-390-pt.png') });

    await signIn(manager, 'manager');
    await manager.goto(portal(`/finance?view=commercial&project=${projectId}&lang=en`));
    const managerView = {
      formCount: await manager.locator('form[action*="?/setAssignmentCommercialFallback"]').count(),
      text:
        (await manager.locator('main').textContent())?.replace(/\s+/gu, ' ').slice(0, 400) ?? '',
    };
    cases.push({
      kind: 'manager-restricted-view',
      formCount: managerView.formCount,
      roleSafe: !managerView.text.includes('71.25'),
    });
    expect(managerView.formCount).toBe(0);
    expect(!managerView.text.includes('71.25')).toBe(true);
    const managerAction = await manager.evaluate(
      async ({ assignmentId, version }) => {
        const response = await fetch(
          '/j-aautomation/app/finance?/setAssignmentCommercialFallback',
          {
            method: 'POST',
            body: new URLSearchParams({
              projectMemberId: assignmentId,
              expectedVersion: String(version),
              allowGlobalCompensation: 'yes',
              allowGlobalInternalCost: 'yes',
            }),
            headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
          },
        );
        const body = await response.text();
        return {
          transportStatus: response.status,
          code: body.includes('FINANCE_ROLE_REQUIRED') ? 'FINANCE_ROLE_REQUIRED' : null,
          leakedFinanceLock: body.includes('FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME'),
          generic: body.includes('Check the submitted values'),
        };
      },
      { assignmentId, version: initial.version },
    );
    cases.push({ kind: 'manager-action-permission', response: managerAction });
    expect(managerAction).toMatchObject({
      code: 'FINANCE_ROLE_REQUIRED',
      leakedFinanceLock: false,
      generic: false,
    });
    expect(assignment(db, assignmentId)).toEqual(initial);
    results.finalAssignment = assignment(db, assignmentId);
    results.auditUnchanged =
      (
        db
          .prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?')
          .get(assignmentId) as { count: number }
      ).count === auditBefore;
    expect(results.auditUnchanged).toBe(true);
    results.diagnostics = diagnosticsByRole;
    for (const diagnostic of Object.values(diagnosticsByRole)) {
      expect(diagnostic.pageErrors).toEqual([]);
      expect(diagnostic.consoleErrors).toEqual([]);
    }
  } finally {
    saveResults(results);
    db.close();
    await owner.context().close();
    await worker.context().close();
    await manager.context().close();
  }
});
