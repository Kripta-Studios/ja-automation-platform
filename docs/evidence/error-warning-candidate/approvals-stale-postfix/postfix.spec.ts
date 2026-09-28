import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const day = '2026-09-25';
type RecordType = 'time' | 'expense';
type Diagnostics = { pageErrors: string[]; consoleErrors: string[]; badResponses: string[] };

function diagnostics(page: Page): Diagnostics {
  const result: Diagnostics = { pageErrors: [], consoleErrors: [], badResponses: [] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      result.badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return result;
}

function record(db: DatabaseSync, type: RecordType, marker: string) {
  const query =
    type === 'time'
      ? 'SELECT id,approval_state FROM time_entry WHERE activity_summary=?'
      : 'SELECT id,approval_state FROM expense WHERE description=?';
  return db.prepare(query).get(marker) as { id: string; approval_state: string } | undefined;
}

function state(db: DatabaseSync, type: RecordType, id: string) {
  return (
    db
      .prepare(
        `SELECT approval_state FROM ${type === 'time' ? 'time_entry' : 'expense'} WHERE id=?`,
      )
      .get(id) as { approval_state: string }
  ).approval_state;
}

function auditCount(db: DatabaseSync, id: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(id) as {
      count: number;
    }
  ).count;
}

async function createProjectThroughOwnerUI(page: Page, db: DatabaseSync) {
  const marker = `Postfix approval browser ${randomUUID()}`;
  const managerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.manager.email) as {
      id: string;
    }
  ).id;
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = page.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable fixture has no active client');
  await form.locator('select[name="clientId"]').selectOption(clientId);
  await form.locator('input[name="name"]').fill(marker);
  await form.locator('input[name="costCenterCode"]').fill(`QA-POSTFIX-${Date.now() % 100000000}`);
  await form.locator('input[name="startDate"]').fill('2026-09-01');
  await form.locator('select[name="projectManagerId"]').selectOption(managerId);
  await form.locator('input[name="initialWorkersStartOn"]').fill('2026-09-01');
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(marker))
    .toBeTruthy();
  const project = db.prepare('SELECT id,status FROM project WHERE name=?').get(marker) as {
    id: string;
    status: string;
  };
  expect(project.status).toBe('active');
  const assignment = db
    .prepare('SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status=?')
    .get(project.id, workerId, 'active');
  expect(assignment).toBeTruthy();
  return { id: project.id, marker };
}

async function createAndSubmitTime(
  page: Page,
  db: DatabaseSync,
  projectId: string,
  marker: string,
) {
  await page.goto(portal(`/time?lang=en&project=${projectId}&date=${day}`));
  await page.locator('[data-time-primary-cta]').click();
  const form = page.locator('form[data-time-entry-surface]');
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="workDate"]').fill(day);
  await form.getByRole('textbox', { name: 'Actual hours' }).fill('1');
  await form.locator('[name="summary"]').fill(marker);
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect.poll(() => record(db, 'time', marker)?.id).toBeTruthy();
  const id = record(db, 'time', marker)!.id;
  await page.goto(portal(`/time/${id}?lang=en`));
  await page
    .locator('main form[action*="submitTime"]')
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect.poll(() => state(db, 'time', id)).toBe('submitted');
  return id;
}

async function createAndSubmitExpense(
  page: Page,
  db: DatabaseSync,
  projectId: string,
  marker: string,
) {
  await page.goto(portal(`/expenses?lang=en&project=${projectId}`));
  await page.locator('[data-expense-primary-cta]').click();
  const form = page.locator('form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="spentOn"]').fill(day);
  await form.locator('select[name="category"]').selectOption('hotel');
  await form.locator('input[name="vendor"]').fill('Disposable browser hotel');
  await form.locator('input[name="amount"]').fill('24.50');
  await form.locator('select[name="currency"]').selectOption('USD');
  await form.locator('select[name="whoPaid"]').selectOption('worker');
  await form.locator('textarea[name="description"]').fill(marker);
  await form.locator('input[name="paymentMethod"]').fill('Cash');
  const color = Buffer.from(randomUUID().replaceAll('-', '').slice(0, 6), 'hex');
  await form.locator('input[name="receipt"]').setInputFiles({
    name: 'disposable-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: color[0]!, g: color[1]!, b: color[2]! },
      },
    })
      .jpeg()
      .toBuffer(),
  });
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect.poll(() => record(db, 'expense', marker)?.id).toBeTruthy();
  const id = record(db, 'expense', marker)!.id;
  await page.goto(portal(`/expenses/${id}?lang=en`));
  await page
    .locator('main form[action="?/submitExpense"]')
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect.poll(() => state(db, 'expense', id)).toBe('submitted');
  return id;
}

async function approvalForm(page: Page, type: RecordType, id: string, locale: 'es' | 'pt') {
  await page.goto(portal(`/approvals?tab=${type === 'time' ? 'time' : 'expenses'}&lang=${locale}`));
  const row = page.locator(`[data-approval-row="${id}"]`);
  await expect(row).toBeVisible();
  await row.locator('details.approval-action-menu summary').click();
  const form = row.locator('form[action="?/approveRecord"]').filter({
    has: page.locator('input[name="decision"][value="needs_changes"]'),
  });
  await expect(form).toBeVisible();
  return form;
}

async function submitAndInspect(page: Page, form: Awaited<ReturnType<typeof approvalForm>>) {
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/approveRecord'),
  );
  await form.getByRole('button').click();
  const response = await pending;
  const body = (await response.json()) as {
    type: string;
    status: number;
    data: string;
  };
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return {
    httpStatus: response.status(),
    type: body.type,
    status: body.status,
    data: parse(body.data),
  };
}

async function geometry(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const headerBottom =
      document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0;
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      headerBottom: Math.round(headerBottom),
      viewportHeight: innerHeight,
      scrollY: Math.round(scrollY),
      focused: element === document.activeElement,
    };
  });
}

async function ownerDecision(
  page: Page,
  type: RecordType,
  id: string,
  decision: 'approved' | 'needs_changes',
) {
  await page.goto(portal(`/approvals?tab=${type === 'time' ? 'time' : 'expenses'}&lang=en`));
  const row = page.locator(`[data-approval-row="${id}"]`);
  await expect(row).toBeVisible();
  if (decision === 'approved') {
    await row
      .locator('form[action="?/approveRecord"]')
      .filter({ has: page.locator('input[name="decision"][value="approved"]') })
      .getByRole('button')
      .click();
  } else {
    await row.locator('details.approval-action-menu summary').click();
    const form = row
      .locator('form[action="?/approveRecord"]')
      .filter({ has: page.locator('input[name="decision"][value="needs_changes"]') });
    await form.locator('input[name="reason"]').fill('Owner requests a factual correction');
    await form.getByRole('button').click();
  }
}

async function freshRolePage(
  browser: Browser,
  role: 'worker' | 'manager' | 'owner',
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await signIn(page, role);
  return { context, page };
}

test('independent Chromium verifies stale approval recovery and invalid reason', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const results: Record<string, unknown> = {
    candidateHead: process.env.JA_QA_CANDIDATE_HEAD ?? 'uncommitted candidate diff',
    fixture: 'new disposable Playwright database; all business records created by rendered UI',
    cases: [],
  };
  const cases = results.cases as Array<Record<string, unknown>>;
  const owner = page;
  const ownerDiagnostics = diagnostics(owner);
  let workerRole: Awaited<ReturnType<typeof freshRolePage>> | undefined;
  let managerRole: Awaited<ReturnType<typeof freshRolePage>> | undefined;
  try {
    const project = await createProjectThroughOwnerUI(owner, db);
    workerRole = await freshRolePage(browser, 'worker', { width: 390, height: 844 });
    const worker = workerRole.page;
    const workerDiagnostics = diagnostics(worker);
    const timeId = await createAndSubmitTime(
      worker,
      db,
      project.id,
      `Postfix time ${randomUUID()}`,
    );
    const expenseId = await createAndSubmitExpense(
      worker,
      db,
      project.id,
      `Postfix expense ${randomUUID()}`,
    );
    expect(workerDiagnostics.pageErrors).toEqual([]);
    expect(workerDiagnostics.consoleErrors).toEqual([]);
    managerRole = await freshRolePage(browser, 'manager', { width: 390, height: 844 });
    const manager = managerRole.page;
    const managerDiagnostics = diagnostics(manager);

    for (const scenario of [
      {
        type: 'time' as const,
        id: timeId,
        ownerDecision: 'approved' as const,
        expectedState: 'approved',
        currentStatus: 'Aprobado',
      },
      {
        type: 'expense' as const,
        id: expenseId,
        ownerDecision: 'needs_changes' as const,
        expectedState: 'needs_changes',
        currentStatus: 'Necesita cambios',
      },
    ]) {
      const form = await approvalForm(manager, scenario.type, scenario.id, 'es');
      const reason = `Corrija hechos ${scenario.type} de prueba`;
      await form.locator('input[name="reason"]').fill(reason);
      const before = await geometry(
        manager,
        'form[action="?/approveRecord"] input[name="reason"]:focus',
      );
      if (scenario.type === 'expense') {
        await owner.setViewportSize({ width: 1440, height: 900 });
        const invalidForm = await approvalForm(owner, 'expense', expenseId, 'pt');
        await invalidForm.locator('input[name="reason"]').fill('   ');
        const beforeInvalid = await geometry(
          owner,
          'form[action="?/approveRecord"] input[name="reason"]:focus',
        );
        const auditBeforeInvalid = auditCount(db, expenseId);
        const invalidResult = await submitAndInspect(owner, invalidForm);
        expect(invalidResult).toMatchObject({
          httpStatus: 200,
          type: 'failure',
          status: 400,
          data: { code: 'APPROVAL_REASON_REQUIRED' },
        });
        const summary = invalidForm.locator('[data-validation-summary]');
        await expect(summary).toBeFocused();
        await expect(summary).toContainText('Alteração obrigatória: Informe um motivo');
        await expect(invalidForm.locator('input[name="reason"]')).toHaveValue('   ');
        await expect(
          invalidForm.locator('xpath=ancestor::details[contains(@class,"approval-action-menu")]'),
        ).toHaveAttribute('open', '');
        await expect(owner.getByRole('tab', { name: /Despesas/ })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        const afterInvalid = await geometry(owner, '[data-validation-summary]');
        expect(afterInvalid.top).toBeGreaterThan(afterInvalid.headerBottom + 8);
        expect(afterInvalid.bottom).toBeLessThanOrEqual(afterInvalid.viewportHeight);
        expect(Math.abs(afterInvalid.scrollY - beforeInvalid.scrollY)).toBeLessThanOrEqual(24);
        expect(auditCount(db, expenseId)).toBe(auditBeforeInvalid);
        expect(state(db, 'expense', expenseId)).toBe('submitted');
        cases.push({
          case: 'owner_1440_pt_invalid_expense_return',
          before: beforeInvalid,
          after: afterInvalid,
          transportStatus: invalidResult.httpStatus,
          actionStatus: invalidResult.status,
          code: invalidResult.data.code,
          reasonRetained: true,
          tabRetained: true,
          auditDelta: 0,
          recordState: state(db, 'expense', expenseId),
        });
        await summary.screenshot({ path: join(evidenceRoot, 'owner-1440-pt-invalid-reason.png') });
      }
      await ownerDecision(owner, scenario.type, scenario.id, scenario.ownerDecision);
      await expect.poll(() => state(db, scenario.type, scenario.id)).toBe(scenario.expectedState);
      const auditBeforeStale = auditCount(db, scenario.id);
      const result = await submitAndInspect(manager, form);
      expect(result.httpStatus).toBe(200);
      expect(result.type).toBe('failure');
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({
        code: 'APPROVAL_RECORD_NOT_SUBMITTED',
        params: { currentStatus: scenario.expectedState, recordType: scenario.type },
      });
      const notice = manager.locator('[data-approval-problem] [data-ui="problem-notice"]');
      await expect(notice).toBeFocused();
      await expect(notice).toContainText(scenario.currentStatus);
      await expect(notice).toContainText('Este registro ya no está enviado');
      await expect(
        notice.getByRole('link', { name: 'Revisar el registro actualizado' }),
      ).toHaveAttribute(
        'href',
        new RegExp(`/${scenario.type === 'time' ? 'time' : 'expenses'}/${scenario.id}$`),
      );
      await expect(
        manager.getByRole('tab', { name: scenario.type === 'time' ? /Horas/ : /Gastos/ }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(manager.locator('[data-approval-retained-values]')).toContainText(reason);
      await expect
        .poll(async () => {
          const box = await geometry(manager, '[data-approval-problem] [data-ui="problem-notice"]');
          return box.top >= box.headerBottom + 8 && box.bottom <= box.viewportHeight && box.focused;
        })
        .toBe(true);
      const after = await geometry(manager, '[data-approval-problem] [data-ui="problem-notice"]');
      expect(auditCount(db, scenario.id)).toBe(auditBeforeStale);
      expect(state(db, scenario.type, scenario.id)).toBe(scenario.expectedState);
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toContain('commercial_classification_state');
      expect(serialized).not.toContain('reimbursement_amount');
      cases.push({
        case: `manager_390_es_stale_${scenario.type}_return`,
        before,
        after,
        transportStatus: result.httpStatus,
        actionStatus: result.status,
        code: result.data.code,
        currentStatus: scenario.expectedState,
        remedy: `/${scenario.type === 'time' ? 'time' : 'expenses'}/:record`,
        reasonRetained: true,
        tabRetained: true,
        auditDeltaAfterStale: 0,
        recordStateAfterStale: state(db, scenario.type, scenario.id),
      });
      // Capture only the synthetic notice after all unswayed DOM measurements.
      await notice.screenshot({
        path: join(evidenceRoot, `manager-390-es-stale-${scenario.type}.png`),
      });
    }

    expect(managerDiagnostics.pageErrors).toEqual([]);
    expect(managerDiagnostics.consoleErrors).toEqual([]);
    expect(ownerDiagnostics.pageErrors).toEqual([]);
    expect(ownerDiagnostics.consoleErrors).toEqual([]);
    results.diagnostics = {
      owner: ownerDiagnostics,
      manager: managerDiagnostics,
      worker: workerDiagnostics,
    };
    writeFileSync(join(evidenceRoot, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  } finally {
    await managerRole?.context.close();
    await workerRole?.context.close();
    db.close();
  }
});
