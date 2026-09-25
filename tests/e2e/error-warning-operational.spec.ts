import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type Area = 'time' | 'expense' | 'report';
type Role = 'owner' | 'manager' | 'worker';
type Fixture = { projectId: string; workerId: string; workDate: string; databasePath: string };
type ActionResult = { type?: string; status?: number; data?: unknown };

const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-operational');
const receiptName = 'qa-receipt-invalid-content.png';

function saveEvidence(name: string, data: Buffer | string): void {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(join(evidenceDirectory, name), data);
}

function seedFixture(area: Area, viewport: string): Fixture {
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  const workDate = new Date().toISOString().slice(0, 10);
  try {
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const managerId = userId(e2eCredentials.manager.email);
    const workerId = userId(
      viewport === 'desktop' ? e2eCredentials.worker2.email : e2eCredentials.worker.email,
    );
    const scenario = { time: 55, expense: 56, report: 57 }[area];
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Operational recovery ${area} ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-OP-RECOVERY', scenario, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
      projectManagerId: managerId,
    }).id;
    const status = (
      database.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Activate disposable operational QA project',
      });
    repository.assignWorker(owner, { projectId, workerId, startsOn: workDate });
    if (area === 'time') {
      const worker = repository.principalFor(workerId);
      repository.createTimeEntry(worker, {
        projectId,
        workDate,
        category: 'regular',
        minutes: 60,
        summary: 'Existing interval for overlap QA',
        startTime: '09:30',
        endTime: '10:30',
        breakMinutes: 0,
      });
    }
    return { projectId, workerId, workDate, databasePath };
  } finally {
    database.sqlite.close();
  }
}

function diagnosticsFor(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { pageErrors, consoleErrors, failedResponses };
}

async function enhancedResponse(page: Page, action: string, click: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(action),
  );
  await click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = (await response.json()) as ActionResult;
  expect(result.type).toBe('failure');
  return result;
}

async function nativeResponse(form: Locator, page: Page, action: string): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(action),
  );
  await form.evaluate((element: HTMLFormElement) => element.submit());
  return responsePromise;
}

async function saveSheetEvidence(
  page: Page,
  name: string,
  trace: Array<Record<string, string | number | boolean>>,
  diagnostics: ReturnType<typeof diagnosticsFor>,
) {
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const screenshot = await sheet.screenshot({
    mask: [sheet.locator('[name="workerId"]')],
  });
  saveEvidence(`${name}.png`, screenshot);
  saveEvidence(`${name}-trace.json`, `${JSON.stringify(trace, null, 2)}\n`);
  saveEvidence(
    `${name}-network.json`,
    `${JSON.stringify([...new Set(diagnostics.failedResponses.map((response) => `${response.status} ${response.path}`))].sort(), null, 2)}\n`,
  );
  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
}

for (const area of ['time', 'expense', 'report'] as const) {
  test(`${area} recovery preserves entries, context, and typed failure`, async ({ page }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(90_000);
    const role: Role =
      area === 'report' && info.project.name === 'desktop'
        ? 'manager'
        : info.project.name === 'desktop'
          ? 'owner'
          : 'worker';
    const fixture = seedFixture(area, info.project.name);
    const diagnostics = diagnosticsFor(page);
    const trace: Array<Record<string, string | number | boolean>> = [];
    let backgroundScrollBefore = 0;
    await signIn(page, role);

    if (area === 'time') {
      await page.goto(portal(`/time?lang=en&project=${fixture.projectId}`));
      await page.locator('[data-time-primary-cta]').click();
      let form = page.locator('form[data-time-entry-surface]');
      if (role === 'owner') await form.locator('[name="workerId"]').selectOption(fixture.workerId);
      await form.locator('[name="projectId"]').selectOption(fixture.projectId);
      await form.locator('[name="workDate"]').fill(fixture.workDate);
      await form.getByRole('checkbox', { name: 'Add start and end times' }).check();
      await form.locator('[name="startTime"]').fill('09:45');
      await form.locator('[name="endTime"]').fill('10:45');
      await form.locator('[name="summary"]').fill('   ');
      await form.getByRole('button', { name: 'Save draft' }).click();
      await expect(form.locator('[name="summary"]')).toHaveAttribute('aria-invalid', 'true');
      trace.push({ step: 'invalid-summary', adjacentError: true });
      await form.locator('[name="summary"]').fill('Preserved time overlap entry');
      backgroundScrollBefore = await page.evaluate(() => window.scrollY);
      const enhanced = await enhancedResponse(page, '/createTime', () =>
        form.getByRole('button', { name: 'Save draft' }).click(),
      );
      expect(enhanced.status).toBe(400);
      expect(JSON.stringify(enhanced.data)).toContain('TIME_INTERVAL_OVERLAP');
      const sheet = page.locator('[data-ui="responsive-sheet"]');
      await expect(sheet.locator('[data-ui="problem-notice"]')).toContainText(
        'already has time recorded',
      );
      await expect(sheet.getByRole('link', { name: 'Review updated time entry' })).toBeVisible();
      await expect(form.locator('[name="summary"]')).toHaveValue('Preserved time overlap entry');
      await expect(form.locator('[name="startTime"]')).toHaveValue('09:45');
      await expect(form.locator('[name="endTime"]')).toHaveValue('10:45');
      await expect(sheet.locator('[data-operational-form-error]')).toBeFocused();
      trace.push({ step: 'enhanced-overlap', actionStatus: 400, retainedValues: true });
      const native = await nativeResponse(form, page, '/createTime');
      expect(native.status()).toBe(400);
      form = page.locator('form[data-time-entry-surface]');
      await expect(form).toBeVisible();
      await expect(form.locator('[name="summary"]')).toHaveValue('Preserved time overlap entry');
      await expect(page.locator('[data-ui="responsive-sheet"]')).toBeVisible();
      await expect(page.locator('[data-operational-form-error]')).toBeFocused();
      trace.push({ step: 'native-overlap', httpStatus: 400, retainedValues: true });
    } else if (area === 'expense') {
      await page.goto(portal(`/expenses?lang=en&project=${fixture.projectId}`));
      await page.locator('[data-expense-primary-cta]').click();
      let form = page.locator('form[data-expense-entry-surface]');
      if (role === 'owner') await form.locator('[name="workerId"]').selectOption(fixture.workerId);
      await form.locator('[name="projectId"]').selectOption(fixture.projectId);
      await form.locator('[name="spentOn"]').fill(fixture.workDate);
      await form.locator('[name="vendor"]').fill('QA site supplier');
      await form.locator('[name="amount"]').fill('');
      await form.locator('[name="description"]').fill('Preserved receipt description');
      await form.getByRole('button', { name: 'Save draft' }).click();
      await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
      trace.push({ step: 'invalid-amount', adjacentError: true });
      await form.locator('[name="amount"]').fill('12.50');
      await form.locator('[name="receipt"]').setInputFiles({
        name: receiptName,
        mimeType: 'image/png',
        buffer: Buffer.from('This is deliberately not PNG data.'),
      });
      backgroundScrollBefore = await page.evaluate(() => window.scrollY);
      const enhanced = await enhancedResponse(page, '/createExpense', () =>
        form.getByRole('button', { name: 'Save draft' }).click(),
      );
      expect(enhanced.status).toBe(400);
      expect(JSON.stringify(enhanced.data)).toContain('EXPENSE_RECEIPT_CONTENT_INVALID');
      const sheet = page.locator('[data-ui="responsive-sheet"]');
      await expect(sheet.locator('[data-ui="problem-notice"]')).toContainText(
        'Receipt filename or content does not match its declared file type.',
      );
      await expect(sheet).toContainText('Reattach the receipt before saving again.');
      await expect(form.locator('[name="description"]')).toHaveValue(
        'Preserved receipt description',
      );
      await expect(form.locator('[name="amount"]')).toHaveValue('12.50');
      await expect(form.locator('[name="vendor"]')).toHaveValue('QA site supplier');
      await expect(sheet.locator('[data-operational-form-error]')).toBeFocused();
      trace.push({ step: 'enhanced-receipt', actionStatus: 400, retainedValues: true });
      const native = await nativeResponse(form, page, '/createExpense');
      expect(native.status()).toBe(400);
      form = page.locator('form[data-expense-entry-surface]');
      await expect(form).toBeVisible();
      await expect(form.locator('[name="description"]')).toHaveValue(
        'Preserved receipt description',
      );
      await expect(form.locator('[name="amount"]')).toHaveValue('12.50');
      await expect(form.locator('[name="receipt"]')).toHaveValue('');
      await expect(page.locator('[data-ui="responsive-sheet"]')).toContainText(
        'Reattach the receipt before saving again.',
      );
      await expect(page.locator('[data-operational-form-error]')).toBeFocused();
      trace.push({ step: 'native-receipt', httpStatus: 400, receiptMustReattach: true });
    } else {
      await page.goto(portal(`/reports?lang=en&view=technical&project=${fixture.projectId}`));
      await expect(page.getByRole('tab', { name: 'Technical / PLC' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await page.getByRole('button', { name: 'New technical report' }).first().click();
      let form = page.locator('form[data-report-entry-surface="technical"]');
      if (role === 'manager')
        await form.locator('[name="workerId"]').selectOption(fixture.workerId);
      await form.locator('[name="projectId"]').selectOption(fixture.projectId);
      await form.locator('[name="reportDate"]').fill(fixture.workDate);
      await form.locator('[name="systemName"]').fill('');
      await form.locator('[name="problemSymptom"]').fill('Preserved plant symptom');
      await form.locator('[name="diagnosisRootCause"]').fill('Preserved root cause');
      await form.locator('[name="changePerformed"]').fill('Preserved PLC change');
      await form.getByRole('button', { name: 'Save PLC report' }).click();
      await expect(form.locator('[name="systemName"]')).toHaveAttribute('aria-invalid', 'true');
      trace.push({ step: 'invalid-system', adjacentError: true });
      await form.locator('[name="systemName"]').fill('Synthetic PLC controller');
      await form.locator('[name="safetyRelated"]').check();
      backgroundScrollBefore = await page.evaluate(() => window.scrollY);
      const enhanced = await enhancedResponse(page, '/createTechnicalReport', () =>
        form.getByRole('button', { name: 'Save PLC report' }).click(),
      );
      expect(enhanced.status).toBe(400);
      expect(JSON.stringify(enhanced.data)).toContain('REPORT_SAFETY_DETAILS_REQUIRED');
      const sheet = page.locator('[data-ui="responsive-sheet"]');
      await expect(sheet.getByRole('link', { name: 'Review updated report' })).toBeVisible();
      await expect(form.locator('[name="validation"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.locator('[name="rollbackPlan"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.locator('[name="problemSymptom"]')).toHaveValue('Preserved plant symptom');
      await expect(page.getByRole('tab', { name: 'Technical / PLC' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(sheet.locator('[data-operational-form-error]')).toBeFocused();
      trace.push({ step: 'enhanced-safety', actionStatus: 400, retainedValues: true });
      const native = await nativeResponse(form, page, '/createTechnicalReport');
      expect(native.status()).toBe(400);
      form = page.locator('form[data-report-entry-surface="technical"]');
      await expect(form).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Technical / PLC' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(form.locator('[name="problemSymptom"]')).toHaveValue('Preserved plant symptom');
      await expect(form.locator('[name="systemName"]')).toHaveValue('Synthetic PLC controller');
      await expect(page.locator('[data-operational-form-error]')).toBeFocused();
      trace.push({ step: 'native-safety', httpStatus: 400, tabRetained: true });
    }

    const backgroundScrollAfter = await page.evaluate(() => window.scrollY);
    trace.push({
      step: 'background-scroll',
      before: backgroundScrollBefore,
      after: backgroundScrollAfter,
    });
    expect
      .soft(
        Math.abs(backgroundScrollAfter - backgroundScrollBefore),
        'background scroll after native failure',
      )
      .toBeLessThanOrEqual(150);

    const name = `${area}-${role}-${info.project.name}`;
    await saveSheetEvidence(page, name, trace, diagnostics);
  });
}
