import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const unavailableCode = 'FINANCE_ASSIGNMENT_COMMERCIAL_RULE_UNAVAILABLE';
const today = new Date().toISOString().slice(0, 10);

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

function assignment(db: DatabaseSync, id: string) {
  return db
    .prepare(
      'SELECT version,client_bill_rule_id,worker_compensation_rule_id,internal_cost_rule_id FROM project_member WHERE id=?',
    )
    .get(id) as {
    version: number;
    client_bill_rule_id: string | null;
    worker_compensation_rule_id: string | null;
    internal_cost_rule_id: string | null;
  };
}

function auditCount(db: DatabaseSync, id: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(id) as {
      count: number;
    }
  ).count;
}

async function createQaProject(owner: Page, db: DatabaseSync) {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable client fixture unavailable');
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  const marker = randomUUID();
  const name = `Commercial stale rate browser ${marker}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="costCenterCode"]').fill(`QA-RATE-${marker.slice(0, 8).toUpperCase()}`);
  await form.locator('[name="startDate"]').fill(today);
  await form.locator('[name="initialWorkersStartOn"]').fill(today);
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  const creation = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createProject'),
    { timeout: 10_000 },
  );
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  const creationStatus = (await creation).status();
  if (creationStatus >= 400)
    throw new Error(`Disposable project fixture POST returned ${creationStatus}`);
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  const projectId = (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string })
    .id;
  const assignmentId = (
    db
      .prepare("SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active'")
      .get(projectId, workerId) as { id: string }
  ).id;
  return { projectId, assignmentId };
}

async function createQaRate(finance: Page, db: DatabaseSync, projectId: string) {
  await signIn(finance, 'finance');
  await finance.goto(
    portal(`/finance?view=commercial&project=${projectId}&task=Client%20labor%20rate&lang=en`),
  );
  const form = finance.locator('form[action*="?/createClientLaborRate"]');
  await expect(form).toBeVisible();
  await form.locator('[name="currency"]').selectOption('USD');
  await form.locator('[data-minor-target="hourlyRateMinor"]').fill('71.25');
  await form.locator('[name="effectiveFrom"]').fill(today);
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

async function openRuleEditor(page: Page, projectId: string, locale: string, rateId: string) {
  await page.goto(
    portal(`/finance?view=commercial&project=${projectId}&lang=${locale}#finance-rule-registers`),
  );
  const editor = page.locator('.assignment-commercial-editor').first();
  await expect(editor).toBeVisible();
  await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  const form = editor.locator('form[action*="?/setAssignmentCommercialRuleReferences"]');
  await form.locator('[name="clientBillRuleId"]').selectOption(rateId);
  await expect(form.locator('[name="clientBillRuleId"]')).toHaveValue(rateId);
  return form;
}

async function deactivateRate(owner: Page, projectId: string, rateId: string) {
  await owner.goto(
    portal(`/finance?view=commercial&project=${projectId}&task=Client%20labor%20rates&lang=en`),
  );
  const form = owner
    .locator('form[action*="?/deactivateClientLaborRate"]')
    .filter({ has: owner.locator(`input[name="ruleId"][value="${rateId}"]`) });
  await expect(form).toBeVisible();
  const response = owner.waitForResponse(
    (item) =>
      item.request().method() === 'POST' && item.url().includes('?/deactivateClientLaborRate'),
  );
  await form.getByRole('button', { name: 'Deactivate' }).click();
  return { status: (await response).status() };
}

async function nativeFailure(page: Page, form: ReturnType<Page['locator']>) {
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('?/setAssignmentCommercialRuleReferences'),
  );
  await form.locator('button[type="submit"]').click();
  const response = await pending;
  const body = await response.text();
  return {
    status: response.status(),
    codeInResponse: body.includes(unavailableCode),
    genericInResponse: body.includes('Check the submitted values'),
  };
}

async function enhancedFailure(form: ReturnType<Page['locator']>) {
  return form.evaluate(async (node) => {
    const response = await fetch((node as HTMLFormElement).action, {
      method: 'POST',
      body: new FormData(node as HTMLFormElement),
      headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
    });
    const body = await response.text();
    const envelope = JSON.parse(body) as { type?: string; status?: number };
    return {
      transportStatus: response.status,
      actionStatus: envelope.status,
      type: envelope.type,
      codeInResponse: body.includes('FINANCE_ASSIGNMENT_COMMERCIAL_RULE_UNAVAILABLE'),
      genericInResponse: body.includes('Check the submitted values'),
    };
  });
}

async function visibleState(page: Page, rateId: string) {
  return page.evaluate((selectedRate) => {
    const form = document.querySelector<HTMLFormElement>(
      'form[action*="?/setAssignmentCommercialRuleReferences"]',
    );
    const editor = form?.closest('details');
    const notice = form?.querySelector<HTMLElement>(
      '[data-finance-problem] [data-ui="problem-notice"]',
    );
    const bounds = notice?.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.portal-layout > header');
    const nav = document.querySelector<HTMLElement>('.bottom-nav');
    const safeTop =
      (header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
        ? header.getBoundingClientRect().bottom
        : 0) + 8;
    const safeBottom =
      nav && getComputedStyle(nav).position === 'fixed'
        ? nav.getBoundingClientRect().top - 16
        : innerHeight - 16;
    const select = form?.querySelector<HTMLSelectElement>('[name="clientBillRuleId"]');
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      wording: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((link) => ({
        text: link.textContent?.trim() ?? '',
        task: new URL(link.href).searchParams.get('task'),
      })),
      routeView: new URL(location.href).searchParams.get('view'),
      language: document.documentElement.lang,
      editorOpen: editor?.open ?? false,
      selectedRateRetained: select?.value === selectedRate,
      selectedOptionDisabled: select?.selectedOptions[0]?.disabled ?? null,
      expectedVersion:
        form?.querySelector<HTMLInputElement>('[name="expectedVersion"]')?.value ?? null,
      focusedNotice:
        document.activeElement === notice || document.activeElement === notice?.parentElement,
      active: {
        tag: document.activeElement?.tagName ?? null,
        id: document.activeElement?.id ?? null,
        name: document.activeElement?.getAttribute('name') ?? null,
        ui: document.activeElement?.getAttribute('data-ui') ?? null,
        financeProblem: document.activeElement?.hasAttribute('data-finance-problem') ?? false,
        className: document.activeElement?.getAttribute('class') ?? null,
      },
      top: bounds ? Math.round(bounds.top) : null,
      bottom: bounds ? Math.round(bounds.bottom) : null,
      safeTop: Math.round(safeTop),
      safeBottom: Math.round(safeBottom),
      scrollY: Math.round(scrollY),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, rateId);
}

test('stale selected customer rate has a specific recoverable commercial rule error', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const height = width === 390 ? 844 : width === 430 ? 932 : 900;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width, height } })),
  );
  const [owner, financeNative, financeEnhanced] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const logs = {
    owner: diagnostics(owner),
    financeNative: diagnostics(financeNative),
    financeEnhanced: diagnostics(financeEnhanced),
  };
  try {
    const { projectId, assignmentId } = await createQaProject(owner, db);
    const rateId = await createQaRate(financeNative, db, projectId);
    await signIn(financeEnhanced, 'finance');
    const nativeForm = await openRuleEditor(financeNative, projectId, locale, rateId);
    const enhancedForm = await openRuleEditor(financeEnhanced, projectId, locale, rateId);
    const before = assignment(db, assignmentId);
    const beforeAudit = auditCount(db, assignmentId);
    expect(before.client_bill_rule_id).toBeNull();
    const deactivation = await deactivateRate(owner, projectId, rateId);
    expect(deactivation.status).toBeLessThan(400);
    const rateClosedOn = (
      db.prepare('SELECT effective_to FROM client_labor_rate WHERE id=?').get(rateId) as {
        effective_to: string | null;
      }
    ).effective_to;
    expect(rateClosedOn).toBe(today);

    const native = await nativeFailure(financeNative, nativeForm);
    expect(native).toEqual({ status: 409, codeInResponse: true, genericInResponse: false });
    const immediately = await visibleState(financeNative, rateId);
    await financeNative.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const afterTwoFrames = await visibleState(financeNative, rateId);
    await financeNative.waitForTimeout(250);
    const visible = await visibleState(financeNative, rateId);
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    writeFileSync(
      join(evidenceRoot, `${info.project.name}-${locale}-focus-debug.json`),
      JSON.stringify(
        {
          commit,
          viewport: { width, height },
          locale,
          native,
          immediately,
          afterTwoFrames,
          after250Ms: visible,
        },
        null,
        2,
      ) + '\n',
    );
    expect(visible).toMatchObject({
      code: unavailableCode,
      routeView: 'commercial',
      editorOpen: true,
      selectedRateRetained: true,
      focusedNotice: true,
      overflow: false,
    });
    expect(visible.remedies.some((remedy) => remedy.task === 'Client labor rates')).toBe(true);
    expect(visible.top).toBeGreaterThanOrEqual((visible.safeTop ?? 0) - 2);
    expect(visible.bottom).toBeLessThanOrEqual((visible.safeBottom ?? height) + 2);
    await financeNative
      .locator('form[action*="?/setAssignmentCommercialRuleReferences"] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, `${info.project.name}-${locale}-notice.png`) });
    expect(assignment(db, assignmentId)).toEqual(before);
    expect(auditCount(db, assignmentId)).toBe(beforeAudit);

    const enhanced = await enhancedFailure(enhancedForm);
    expect(enhanced).toEqual({
      transportStatus: 200,
      actionStatus: 409,
      type: 'failure',
      codeInResponse: true,
      genericInResponse: false,
    });
    expect(assignment(db, assignmentId)).toEqual(before);
    expect(auditCount(db, assignmentId)).toBe(beforeAudit);
    expect(logs).toEqual({ owner: [], financeNative: [], financeEnhanced: [] });

    const observation = {
      commit,
      viewport: { width, height },
      locale,
      roles: ['owner', 'finance'],
      fixture:
        'QA project and rate created through UI; rate deactivated through Owner UI after two Finance forms opened',
      deactivation,
      native,
      visible,
      enhanced,
      unchangedAssignment: true,
      unchangedAssignmentAudit: true,
      diagnostics: logs,
    };
    writeFileSync(
      join(evidenceRoot, `${info.project.name}-${locale}-results.json`),
      JSON.stringify(
        observation,
        (_key, value) =>
          typeof value === 'string'
            ? value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[qa-id]')
            : value,
        2,
      ) + '\n',
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    db.close();
  }
});
