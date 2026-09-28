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
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-finance-treatment');

function seedTime(viewport: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const userId = (role: keyof typeof e2eCredentials) =>
      (
        db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials[role].email) as {
          id: string;
        }
      ).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId('owner'));
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Finance treatment browser ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-FIN-TREAT', 84, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-09-01',
      projectManagerId: userId('manager'),
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
        reason: 'Disposable browser fixture',
      });
    repository.assignWorker(owner, {
      projectId,
      workerId: userId('worker'),
      startsOn: '2026-09-01',
    });
    const worker = repository.principalFor(userId('worker'));
    const ids = ['reason', 'treatment', 'success', 'stale'].map((kind, index) => {
      const entry = repository.createTimeEntry(worker, {
        projectId,
        workDate: `2026-09-${String(21 + index).padStart(2, '0')}`,
        category: 'regular',
        minutes: 60,
        summary: `Disposable ${kind} Finance QA`,
      });
      repository.submitTime(worker, entry.id, entry.version);
      return entry.id;
    });
    for (const id of ids.slice(1)) repository.operationalApproveTime(owner, id!, 'approved');
    return {
      databasePath,
      projectId,
      reasonId: ids[0]!,
      treatmentId: ids[1]!,
      successId: ids[2]!,
      staleId: ids[3]!,
    };
  } finally {
    db.sqlite.close();
  }
}

function financeApproveOutsideBrowser(databasePath: string, id: string) {
  const db = createDatabase(databasePath);
  try {
    const financeId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.finance.email) as {
        id: string;
      }
    ).id;
    const repository = new PortalRepository(db.sqlite);
    repository.financeApproveTime(repository.principalFor(financeId), id, false);
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

test('Finance time treatment and operational reason recover at both widths', async ({
  page,
  browser,
}: { page: Page; browser: Browser }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(180_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const fixture = seedTime(info.project.name);
  const path = `/approvals?tab=time&project=${fixture.projectId}&lang=${locale}`;
  const steps: Array<Record<string, string | number | boolean>> = [];
  const responses: Array<{ status: number; path: string }> = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  await signIn(page, 'finance');
  await page.goto(portal(path));
  let treatment = page.locator(
    `[data-finance-review-row="${fixture.treatmentId}"] form[action="?/financeApprove"]`,
  );
  await expect(treatment).toBeVisible();
  await expect(treatment.locator('[data-time-billability-help]')).toContainText(
    /customer|cliente/u,
  );
  await treatment.scrollIntoViewIfNeeded();
  const missingScroll = await page.evaluate(() => window.scrollY);
  let post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/financeApprove'),
  );
  await treatment.evaluate((form: HTMLFormElement) => form.submit());
  expect((await post).status()).toBe(400);
  let notice = page.locator('[data-approval-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'FINANCE_REVIEW_TREATMENT_REQUIRED');
  treatment = page.locator(
    `[data-finance-review-row="${fixture.treatmentId}"] form[action="?/financeApprove"]`,
  );
  await expect(treatment.locator('[name="billable"]')).toHaveValue('');
  await expect(treatment.locator('[data-validation-summary]')).toBeFocused();
  await expect(notice.getByRole('link')).toHaveAttribute('href', /\/time\//u);
  const missingAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(missingAfter - missingScroll)).toBeLessThan(12);
  steps.push({
    step: 'finance-treatment-required',
    code: 'FINANCE_REVIEW_TREATMENT_REQUIRED',
    scrollBefore: missingScroll,
    scrollAfter: missingAfter,
  });

  await page.goto(portal(path));
  const success = page.locator(
    `[data-finance-review-row="${fixture.successId}"] form[action="?/financeApprove"]`,
  );
  await expect(success).toBeVisible();
  await success.locator('[name="billable"]').selectOption('no');
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/financeApprove'),
  );
  await success.locator('button[type="submit"]').click();
  expect((await post).status()).toBe(200);
  steps.push({ step: 'finance-nonbillable-success', saved: true });

  await page.goto(portal(path));
  const stale = page.locator(
    `[data-finance-review-row="${fixture.staleId}"] form[action="?/financeApprove"]`,
  );
  await expect(stale).toBeVisible();
  await stale.locator('[name="billable"]').selectOption('yes');
  financeApproveOutsideBrowser(fixture.databasePath, fixture.staleId);
  const db = createDatabase(fixture.databasePath);
  let currentTreatment: string;
  try {
    currentTreatment = (
      db.sqlite
        .prepare('SELECT billability_state FROM time_entry WHERE id=?')
        .get(fixture.staleId) as { billability_state: string }
    ).billability_state;
  } finally {
    db.sqlite.close();
  }
  expect(currentTreatment).toBe('non_billable');
  await stale.scrollIntoViewIfNeeded();
  const staleScroll = await page.evaluate(() => window.scrollY);
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/financeApprove'),
  );
  await stale.evaluate((form: HTMLFormElement) => form.submit());
  expect((await post).status()).toBe(409);
  notice = page.locator('[data-approval-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'FINANCE_REVIEW_UNAVAILABLE');
  await expect(notice).toBeFocused();
  const visibleStatus = (await notice.locator('.ui-problem-notice__status').textContent()) ?? '';
  expect(visibleStatus).toMatch(locale === 'pt' ? /Não faturável/u : /Non-billable/u);
  const enteredValues = page.locator('[data-approval-retained-values]');
  await expect(enteredValues).toBeVisible();
  await expect(enteredValues).toContainText(locale === 'pt' ? 'Faturável' : 'Billable');
  const staleAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(staleAfter - staleScroll)).toBeLessThan(12);
  steps.push({
    step: 'finance-stale',
    code: 'FINANCE_REVIEW_UNAVAILABLE',
    currentTreatment,
    visibleStatus,
    scrollBefore: staleScroll,
    scrollAfter: staleAfter,
  });

  const owner = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(owner, 'owner');
    await owner.goto(portal(path));
    const row = owner.locator(`[data-approval-row="${fixture.reasonId}"]`);
    await expect(row).toBeVisible();
    await row.locator('details.approval-action-menu summary').click();
    let reasonForm = row.locator(
      'form[action="?/approveRecord"]:has(input[name="decision"][value="needs_changes"])',
    );
    await reasonForm.locator('[name="reason"]').fill('Retained reason before invalid length');
    await reasonForm.locator('[name="reason"]').evaluate((input: HTMLInputElement) => {
      input.value = 'R'.repeat(1001);
    });
    const reasonPost = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/approveRecord'),
    );
    await reasonForm.evaluate((form: HTMLFormElement) => form.submit());
    expect((await reasonPost).status()).toBe(400);
    await expect(
      owner.locator('[data-approval-problem] [data-ui="problem-notice"]'),
    ).toHaveAttribute('data-problem-code', 'APPROVAL_REASON_INVALID');
    reasonForm = owner.locator(
      `[data-approval-row="${fixture.reasonId}"] form[action="?/approveRecord"]:has(input[name="decision"][value="needs_changes"])`,
    );
    await expect(reasonForm.locator('[name="reason"]')).toHaveValue('R'.repeat(1001));
    await expect(reasonForm.locator('[data-validation-summary]')).toBeFocused();
    steps.push({
      step: 'operational-reason-invalid',
      code: 'APPROVAL_REASON_INVALID',
      retained: true,
    });
  } finally {
    await owner.close();
  }

  const manager = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(manager, 'manager');
    const denied = await manager.evaluate(async (id) => {
      const response = await fetch('/j-aautomation/app/approvals?/financeApprove', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: new URLSearchParams({ type: 'time', id, billable: 'yes' }),
      });
      return {
        transportStatus: response.status,
        result: (await response.json()) as { type?: string; status?: number; data?: unknown },
      };
    }, fixture.treatmentId);
    expect(denied.transportStatus).toBe(200);
    expect(denied.result.type).toBe('failure');
    expect(denied.result.status).toBe(403);
    expect(JSON.stringify(denied.result.data)).toContain('FINANCE_ROLE_REQUIRED');
    steps.push({ step: 'manager-finance-denied', code: 'FINANCE_ROLE_REQUIRED' });
  } finally {
    await manager.close();
  }

  expect(errors).toEqual([]);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `finance-treatment-${info.project.name}-${locale}.png`),
    await notice.screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `finance-treatment-${info.project.name}-${locale}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `finance-treatment-${info.project.name}-${locale}-network.json`),
    `${JSON.stringify(responses, null, 2)}\n`,
  );
});

test('Finance malformed treatment shows the owning field summary', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const fixture = seedTime(info.project.name);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  await signIn(page, 'finance');
  await page.goto(portal(`/approvals?tab=time&project=${fixture.projectId}&lang=${locale}`));
  const row = page.locator(`[data-finance-review-row="${fixture.treatmentId}"]`);
  const form = row.locator('form[action="?/financeApprove"]');
  await expect(form).toBeVisible();
  await form.scrollIntoViewIfNeeded();
  const beforeGeometry = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((value) =>
      value.startsWith('ja-approval-scroll:'),
    );
    const snapshot = key
      ? (JSON.parse(sessionStorage.getItem(key) ?? '{}') as { top?: number })
      : null;
    return {
      scroll: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
      storedTopBefore: snapshot?.top ?? null,
    };
  });
  const scrollBefore = beforeGeometry.scroll;
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes('?/financeApprove'),
  );
  await form.evaluate((node: HTMLFormElement) => {
    const select = node.elements.namedItem('billable') as HTMLSelectElement;
    select.removeAttribute('name');
    const invalid = document.createElement('input');
    invalid.type = 'hidden';
    invalid.name = 'billable';
    invalid.value = 'maybe';
    node.append(invalid);
    node.submit();
    const key = Object.keys(sessionStorage).find((value) =>
      value.startsWith('ja-approval-scroll:'),
    );
    const snapshot = key
      ? (JSON.parse(sessionStorage.getItem(key) ?? '{}') as { top?: number })
      : null;
    sessionStorage.setItem('qa-finance-scroll-top-at-submit', String(snapshot?.top ?? 'missing'));
  });
  const invalidResponse = await response;
  expect(invalidResponse.status()).toBe(400);
  expect(new URLSearchParams(invalidResponse.request().postData() ?? '').get('billable')).toBe(
    'maybe',
  );
  const notice = page.locator('[data-approval-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'FINANCE_REVIEW_FIELDS_INVALID');
  const restored = page.locator(
    `[data-finance-review-row="${fixture.treatmentId}"] form[action="?/financeApprove"]`,
  );
  await expect(restored.locator('[data-validation-summary]')).toBeFocused();
  await expect(restored.locator('[data-field-error-for]')).toBeVisible();
  await expect(notice.getByRole('link')).toHaveAttribute('href', '#approval-queue');
  const afterGeometry = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((value) =>
      value.startsWith('ja-approval-scroll:'),
    );
    const snapshot = key
      ? (JSON.parse(sessionStorage.getItem(key) ?? '{}') as { top?: number })
      : null;
    const submittedTop = sessionStorage.getItem('qa-finance-scroll-top-at-submit');
    sessionStorage.removeItem('qa-finance-scroll-top-at-submit');
    return {
      scroll: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
      storedTopAfter: snapshot?.top ?? null,
      storedTopAtSubmit: submittedTop ?? 'missing',
    };
  });
  const scrollAfter = afterGeometry.scroll;
  mkdirSync(evidenceDirectory, { recursive: true });
  const prefix = `finance-generic-input-${info.project.name}-${locale}`;
  writeFileSync(join(evidenceDirectory, `${prefix}.png`), await notice.screenshot());
  writeFileSync(
    join(evidenceDirectory, `${prefix}-trace.json`),
    `${JSON.stringify({ code: 'FINANCE_REVIEW_FIELDS_INVALID', ...beforeGeometry, ...afterGeometry, scrollBefore, scrollAfter }, null, 2)}\n`,
  );
  expect
    .soft(
      Math.abs(scrollAfter - scrollBefore),
      `Finance generic input native scroll ${scrollBefore}→${scrollAfter}`,
    )
    .toBeLessThan(12);
  expect(errors).toEqual([]);
});
