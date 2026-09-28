import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const versionCode = 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED';
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
      `SELECT version,client_bill_rule_id,worker_compensation_rule_id,
    internal_cost_rule_id,allow_global_compensation_fallback,allow_global_internal_cost_fallback
    FROM project_member WHERE id=?`,
    )
    .get(id) as {
    version: number;
    client_bill_rule_id: string | null;
    worker_compensation_rule_id: string | null;
    internal_cost_rule_id: string | null;
    allow_global_compensation_fallback: number;
    allow_global_internal_cost_fallback: number;
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
  const name = `Commercial version race browser ${marker}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form
    .locator('[name="costCenterCode"]')
    .fill(`QA-VRACE-${parseInt(marker.slice(0, 8), 16)}`);
  await form.locator('[name="startDate"]').fill(today);
  await form.locator('[name="initialWorkersStartOn"]').fill(today);
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  const pending = owner.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createProject'),
  );
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  expect((await pending).status()).toBeLessThan(400);
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

async function createQaRate(
  finance: Page,
  db: DatabaseSync,
  projectId: string,
  amount: string,
  minor: number,
) {
  await finance.goto(
    portal(`/finance?view=commercial&project=${projectId}&task=Client%20labor%20rate&lang=en`),
  );
  const form = finance.locator('form[action*="?/createClientLaborRate"]');
  await expect(form).toBeVisible();
  await form.locator('[name="currency"]').selectOption('USD');
  await form.locator('[data-minor-target="hourlyRateMinor"]').fill(amount);
  await form.locator('[name="effectiveFrom"]').fill(today);
  const pending = finance.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/createClientLaborRate'),
  );
  await form.getByRole('button', { name: 'Save client rate' }).click();
  expect((await pending).status()).toBeLessThan(400);
  await expect
    .poll(() =>
      db
        .prepare('SELECT id FROM client_labor_rate WHERE project_id=? AND hourly_rate_minor=?')
        .get(projectId, minor),
    )
    .toBeTruthy();
  return (
    db
      .prepare('SELECT id FROM client_labor_rate WHERE project_id=? AND hourly_rate_minor=?')
      .get(projectId, minor) as { id: string }
  ).id;
}

async function openEditor(page: Page, projectId: string, locale: string) {
  await page.goto(
    portal(`/finance?view=commercial&project=${projectId}&lang=${locale}#finance-rule-registers`),
  );
  const editor = page.locator('.assignment-commercial-editor').first();
  await expect(editor).toBeVisible();
  if ((await editor.getAttribute('open')) === null) await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  return editor;
}

async function submitNative(page: Page, form: Locator, action: string) {
  const pending = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await form.locator('button[type="submit"]').click();
  const response = await pending;
  const body = await response.text();
  return {
    status: response.status(),
    codeInResponse: body.includes(versionCode),
    genericInResponse: body.includes('Check the submitted values'),
  };
}

async function submitEnhanced(form: Locator) {
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
      codeInResponse: body.includes('FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED'),
      genericInResponse: body.includes('Check the submitted values'),
    };
  });
}

async function visibleState(page: Page, action: string) {
  return page.evaluate((requestedAction) => {
    const form = document.querySelector<HTMLFormElement>(`form[action*="?/${requestedAction}"]`);
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
    const selection = (name: string) =>
      form?.querySelector<HTMLSelectElement>(`[name="${name}"]`)?.value ?? null;
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      notice: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((link) => ({
        label: link.textContent?.trim() ?? '',
        href: new URL(link.href).pathname + new URL(link.href).search + new URL(link.href).hash,
      })),
      comparison: [
        ...(form?.querySelectorAll<HTMLElement>('.assignment-commercial-comparison > div') ?? []),
      ].map((row) => ({
        field: row.querySelector('dt')?.textContent?.trim() ?? '',
        current: row.querySelectorAll('dd')[0]?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        attempted: row.querySelectorAll('dd')[1]?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        outcome: row.querySelectorAll('dd')[2]?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      })),
      routeView: new URL(location.href).searchParams.get('view'),
      language: document.documentElement.lang,
      editorOpen: editor?.open ?? false,
      expectedVersion:
        form?.querySelector<HTMLInputElement>('[name="expectedVersion"]')?.value ?? null,
      attempted: {
        compensation: selection('allowGlobalCompensation'),
        internalCost: selection('allowGlobalInternalCost'),
        clientRule: selection('clientBillRuleId'),
      },
      focusOnNotice:
        document.activeElement === notice || document.activeElement === notice?.parentElement,
      activeTag: document.activeElement?.tagName ?? null,
      top: bounds ? Math.round(bounds.top) : null,
      bottom: bounds ? Math.round(bounds.bottom) : null,
      safeTop: Math.round(safeTop),
      safeBottom: Math.round(safeBottom),
      scrollY: Math.round(scrollY),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, action);
}

function saveEvidence(name: string, data: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      data,
      (_key, value) =>
        typeof value === 'string'
          ? value.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[qa-id]')
          : value,
      2,
    ) + '\n',
  );
}

test('stale commercial fallback and rule reference edits show current versus attempted choices', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const height = width === 390 ? 844 : width === 430 ? 932 : 900;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() => browser.newContext({ viewport: { width, height } })),
  );
  const [owner, financeA, financeB, financeEnhanced] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const logs = {
    owner: diagnostics(owner),
    financeA: diagnostics(financeA),
    financeB: diagnostics(financeB),
    financeEnhanced: diagnostics(financeEnhanced),
  };
  try {
    const { projectId, assignmentId } = await createQaProject(owner, db);
    await Promise.all([
      signIn(financeA, 'finance'),
      signIn(financeB, 'finance'),
      signIn(financeEnhanced, 'finance'),
    ]);
    const firstRate = await createQaRate(financeB, db, projectId, '71.25', 7125);
    const secondRate = await createQaRate(financeB, db, projectId, '75.50', 7550);
    let editorA = await openEditor(financeA, projectId, locale);
    let editorB = await openEditor(financeB, projectId, 'en');
    let editorEnhanced = await openEditor(financeEnhanced, projectId, locale);
    const baseline = assignment(db, assignmentId);
    const auditBaseline = auditCount(db, assignmentId);
    const invert = (value: number) => (value ? 'no' : 'yes');
    const originalComp = baseline.allow_global_compensation_fallback ? 'yes' : 'no';
    const originalCost = baseline.allow_global_internal_cost_fallback ? 'yes' : 'no';
    const fallbackA = editorA.locator('form[action*="?/setAssignmentCommercialFallback"]');
    const fallbackB = editorB.locator('form[action*="?/setAssignmentCommercialFallback"]');
    const fallbackEnhanced = editorEnhanced.locator(
      'form[action*="?/setAssignmentCommercialFallback"]',
    );
    for (const form of [fallbackA, fallbackEnhanced]) {
      await form.locator('[name="allowGlobalCompensation"]').selectOption(originalComp);
      await form
        .locator('[name="allowGlobalInternalCost"]')
        .selectOption(invert(baseline.allow_global_internal_cost_fallback));
    }
    await fallbackB
      .locator('[name="allowGlobalCompensation"]')
      .selectOption(invert(baseline.allow_global_compensation_fallback));
    await fallbackB.locator('[name="allowGlobalInternalCost"]').selectOption(originalCost);
    const bFallback = await submitNative(financeB, fallbackB, 'setAssignmentCommercialFallback');
    expect(bFallback.status).toBeLessThan(400);
    const savedFallback = assignment(db, assignmentId);
    expect(savedFallback.version).toBe(baseline.version + 1);
    expect(auditCount(db, assignmentId)).toBe(auditBaseline + 1);
    const staleFallback = await submitNative(
      financeA,
      fallbackA,
      'setAssignmentCommercialFallback',
    );
    expect(staleFallback).toEqual({ status: 409, codeInResponse: true, genericInResponse: false });
    await expect
      .poll(
        async () => (await visibleState(financeA, 'setAssignmentCommercialFallback')).focusOnNotice,
      )
      .toBe(true);
    const fallbackVisible = await visibleState(financeA, 'setAssignmentCommercialFallback');
    expect(fallbackVisible).toMatchObject({
      code: versionCode,
      routeView: 'commercial',
      editorOpen: true,
      overflow: false,
    });
    expect(fallbackVisible.remedies).toHaveLength(1);
    expect(fallbackVisible.comparison).toHaveLength(2);
    expect(
      fallbackVisible.comparison.every((row) => row.field && row.current && row.attempted),
    ).toBe(true);
    expect(fallbackVisible.attempted.compensation).toBe(originalComp);
    expect(fallbackVisible.attempted.internalCost).toBe(
      invert(baseline.allow_global_internal_cost_fallback),
    );
    await expect(
      financeA.locator('form[action*="?/setAssignmentCommercialFallback"] button[type="submit"]'),
    ).toBeDisabled();
    expect(fallbackVisible.top).toBeGreaterThanOrEqual((fallbackVisible.safeTop ?? 0) - 2);
    expect(fallbackVisible.bottom).toBeLessThanOrEqual((fallbackVisible.safeBottom ?? height) + 2);
    expect(assignment(db, assignmentId)).toEqual(savedFallback);
    expect(auditCount(db, assignmentId)).toBe(auditBaseline + 1);
    const enhancedFallback = await submitEnhanced(fallbackEnhanced);
    expect(enhancedFallback).toEqual({
      transportStatus: 200,
      actionStatus: 409,
      type: 'failure',
      codeInResponse: true,
      genericInResponse: false,
    });
    expect(assignment(db, assignmentId)).toEqual(savedFallback);
    await financeA
      .locator('form[action*="?/setAssignmentCommercialFallback"] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, `${info.project.name}-${locale}-fallback.png`) });

    // Clicking the permitted remedy must load B's saved choices without submitting A's attempted values.
    const auditBeforeReview = auditCount(db, assignmentId);
    await financeA
      .locator('form[action*="?/setAssignmentCommercialFallback"] [data-ui="problem-notice"] a')
      .first()
      .click();
    await expect(financeA).toHaveURL(/view=commercial/u);
    editorA = financeA.locator('.assignment-commercial-editor').first();
    if ((await editorA.getAttribute('open')) === null) await editorA.locator('summary').click();
    const reviewedFallback = editorA.locator('form[action*="?/setAssignmentCommercialFallback"]');
    await expect(reviewedFallback.locator('[name="allowGlobalCompensation"]')).toHaveValue(
      savedFallback.allow_global_compensation_fallback ? 'yes' : 'no',
    );
    await expect(reviewedFallback.locator('[name="allowGlobalInternalCost"]')).toHaveValue(
      savedFallback.allow_global_internal_cost_fallback ? 'yes' : 'no',
    );
    await expect(reviewedFallback.locator('button[type="submit"]')).toBeEnabled();
    expect(assignment(db, assignmentId)).toEqual(savedFallback);
    expect(auditCount(db, assignmentId)).toBe(auditBeforeReview);

    editorA = await openEditor(financeA, projectId, locale);
    editorB = await openEditor(financeB, projectId, 'en');
    editorEnhanced = await openEditor(financeEnhanced, projectId, locale);
    const refsA = editorA.locator('form[action*="?/setAssignmentCommercialRuleReferences"]');
    const refsB = editorB.locator('form[action*="?/setAssignmentCommercialRuleReferences"]');
    const refsEnhanced = editorEnhanced.locator(
      'form[action*="?/setAssignmentCommercialRuleReferences"]',
    );
    await refsA.locator('[name="clientBillRuleId"]').selectOption(secondRate);
    await refsEnhanced.locator('[name="clientBillRuleId"]').selectOption(secondRate);
    await refsB.locator('[name="clientBillRuleId"]').selectOption(firstRate);
    const bReferences = await submitNative(
      financeB,
      refsB,
      'setAssignmentCommercialRuleReferences',
    );
    expect(bReferences.status).toBeLessThan(400);
    const savedReferences = assignment(db, assignmentId);
    expect(savedReferences.version).toBe(savedFallback.version + 1);
    expect(savedReferences.client_bill_rule_id).toBe(firstRate);
    const auditAfterBReferences = auditCount(db, assignmentId);
    const staleReferences = await submitNative(
      financeA,
      refsA,
      'setAssignmentCommercialRuleReferences',
    );
    expect(staleReferences).toEqual({
      status: 409,
      codeInResponse: true,
      genericInResponse: false,
    });
    await expect
      .poll(
        async () =>
          (await visibleState(financeA, 'setAssignmentCommercialRuleReferences')).focusOnNotice,
      )
      .toBe(true);
    const referencesVisible = await visibleState(financeA, 'setAssignmentCommercialRuleReferences');
    expect(referencesVisible).toMatchObject({
      code: versionCode,
      routeView: 'commercial',
      editorOpen: true,
      overflow: false,
    });
    expect(referencesVisible.attempted.clientRule).toBe(secondRate);
    expect(referencesVisible.comparison).toHaveLength(3);
    expect(referencesVisible.comparison[0]?.current).not.toBe(
      referencesVisible.comparison[0]?.attempted,
    );
    await expect(
      financeA.locator(
        'form[action*="?/setAssignmentCommercialRuleReferences"] button[type="submit"]',
      ),
    ).toBeDisabled();
    expect(assignment(db, assignmentId)).toEqual(savedReferences);
    expect(auditCount(db, assignmentId)).toBe(auditAfterBReferences);
    const enhancedReferences = await submitEnhanced(refsEnhanced);
    expect(enhancedReferences).toEqual({
      transportStatus: 200,
      actionStatus: 409,
      type: 'failure',
      codeInResponse: true,
      genericInResponse: false,
    });
    expect(assignment(db, assignmentId)).toEqual(savedReferences);
    await financeA
      .locator('form[action*="?/setAssignmentCommercialRuleReferences"] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, `${info.project.name}-${locale}-references.png`) });
    const auditBeforeReferenceReview = auditCount(db, assignmentId);
    await financeA
      .locator(
        'form[action*="?/setAssignmentCommercialRuleReferences"] [data-ui="problem-notice"] a',
      )
      .first()
      .click();
    await expect(financeA).toHaveURL(/view=commercial/u);
    editorA = financeA.locator('.assignment-commercial-editor').first();
    if ((await editorA.getAttribute('open')) === null) await editorA.locator('summary').click();
    const reviewedReferences = editorA.locator(
      'form[action*="?/setAssignmentCommercialRuleReferences"]',
    );
    await expect(reviewedReferences.locator('[name="clientBillRuleId"]')).toHaveValue(firstRate);
    await expect(reviewedReferences.locator('button[type="submit"]')).toBeEnabled();
    expect(assignment(db, assignmentId)).toEqual(savedReferences);
    expect(auditCount(db, assignmentId)).toBe(auditBeforeReferenceReview);
    expect(logs).toEqual({ owner: [], financeA: [], financeB: [], financeEnhanced: [] });

    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    saveEvidence(`${info.project.name}-${locale}-results.json`, {
      commit,
      viewport: { width, height },
      locale,
      fixture:
        'QA project/assignment and two rates created through rendered forms; two Finance saves and four stale submissions',
      baseline: {
        version: baseline.version,
        flags: [
          baseline.allow_global_compensation_fallback,
          baseline.allow_global_internal_cost_fallback,
        ],
        audit: auditBaseline,
      },
      fallback: {
        bResponse: bFallback.status,
        native: staleFallback,
        enhanced: enhancedFallback,
        visible: fallbackVisible,
        savedVersion: savedFallback.version,
        savedFlags: [
          savedFallback.allow_global_compensation_fallback,
          savedFallback.allow_global_internal_cost_fallback,
        ],
        reviewReloadedCurrent: true,
      },
      references: {
        bResponse: bReferences.status,
        native: staleReferences,
        enhanced: enhancedReferences,
        visible: referencesVisible,
        savedVersion: savedReferences.version,
        currentIsBChoice: true,
        noExtraWrite: true,
      },
      diagnostics: logs,
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    db.close();
  }
});
