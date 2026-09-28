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
const day = '2026-09-25';

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

function timeState(db: DatabaseSync, id: string) {
  return db
    .prepare('SELECT approval_state,version,activity_summary FROM time_entry WHERE id=?')
    .get(id) as {
    approval_state: string;
    version: number;
    activity_summary: string;
  };
}

function auditCount(db: DatabaseSync, id: string) {
  return (
    db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(id) as {
      count: number;
    }
  ).count;
}

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

async function decodeActionData(data: string): Promise<Record<string, unknown>> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return parse(data);
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
  const name = `Time submit post-fix ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-TIMESUB-${Date.now() % 100000000}`);
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

async function createTimeDraft(page: Page, db: DatabaseSync, projectId: string) {
  const marker = `Stale time baseline ${randomUUID()}`;
  await page.goto(portal(`/time?lang=en&project=${projectId}&date=${day}`));
  await page.locator('[data-time-primary-cta]').click();
  const form = page.locator('form[data-time-entry-surface]');
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="workDate"]').fill(day);
  await form.getByRole('textbox', { name: 'Actual hours' }).fill('1');
  await form.locator('textarea[name="summary"]').fill(marker);
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(marker))
    .toBeTruthy();
  const id = (
    db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(marker) as { id: string }
  ).id;
  expect(timeState(db, id)).toMatchObject({ approval_state: 'draft', version: 1 });
  return id;
}

async function captureNativePost(
  page: Page,
  action: string,
  expectedCode: string,
  click: () => Promise<void>,
) {
  const pending = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await click();
  const response = await pending;
  await page.waitForLoadState('networkidle');
  const body = await response.text();
  return {
    status: response.status(),
    contentType: response.headers()['content-type']?.split(';')[0] ?? '',
    hasTypedCode: body.includes(expectedCode),
    hasSubmittedParamString: body.includes('submitted'),
    hasGenericPhrase: body.includes('Check the submitted values'),
  };
}

async function visibleState(page: Page) {
  return page.locator('main').evaluate((main) => {
    const status = main.querySelector('.record-detail-header .state-tag');
    const actions = main.querySelector('form[action="?/submitTime"]');
    const alerts = [...main.querySelectorAll('[role="alert"]')].map(
      (element) => element.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
    );
    const notices = [...main.querySelectorAll('[data-ui="problem-notice"]')].map((element) => ({
      code: element.getAttribute('data-problem-code'),
      text: element.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      top: Math.round(element.getBoundingClientRect().top),
      bottom: Math.round(element.getBoundingClientRect().bottom),
      focused: document.activeElement === element,
      links: [...element.querySelectorAll('a')].map((link) => ({
        text: link.textContent?.trim() ?? '',
        href:
          link.getAttribute('href')?.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/iu, '/:record') ?? '',
        hardReload: link.hasAttribute('data-sveltekit-reload'),
      })),
    }));
    const focused = document.activeElement;
    const focusBox = focused?.getBoundingClientRect();
    return {
      status: status?.textContent?.trim() ?? '',
      submitFormVisible: Boolean(actions),
      submitVersion:
        actions?.querySelector<HTMLInputElement>('input[name="version"]')?.value ?? null,
      alerts,
      notices,
      remedyLinks: [...main.querySelectorAll('a')]
        .filter((link) => /review updated|review current|retry/i.test(link.textContent ?? ''))
        .map((link) => link.textContent?.trim() ?? ''),
      focusedElement: focused?.tagName.toLowerCase() ?? null,
      focusedText: focused?.textContent?.trim().slice(0, 100) ?? '',
      focusTop: focusBox ? Math.round(focusBox.top) : null,
      focusBottom: focusBox ? Math.round(focusBox.bottom) : null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
    };
  });
}

test('Worker native Time detail stale submit post-fix', async ({ browser, page }) => {
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerDiagnostics = diagnostics(page);
  const results: Record<string, unknown> = {
    candidateFingerprint: process.env.JA_QA_CANDIDATE ?? 'f5b37aa plus Time product diff',
    fixture:
      'new disposable E2E database; Owner project/assignment and Worker Time draft created in rendered UI',
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
    const timeId = await createTimeDraft(tabA, db, projectId);
    await tabA.goto(portal(`/time/${timeId}?lang=en`));
    const submitA = tabA.locator('form[action="?/submitTime"]');
    await expect(submitA.locator('input[name="version"]')).toHaveValue('1');
    const tabB = await workerContext.newPage();
    const tabBDiagnostics = diagnostics(tabB);
    await tabB.goto(portal(`/time/${timeId}?lang=en`));
    await tabB.getByRole('link', { name: /Edit draft/ }).click();
    const edit = tabB.locator('form[action="?/updateTime"]');
    await expect(edit).toBeVisible();
    await edit.locator('textarea[name="summary"]').fill('Updated site facts in Tab B');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => timeState(db, timeId).version).toBe(2);
    const auditBeforeStale = auditCount(db, timeId);
    await submitA.scrollIntoViewIfNeeded();
    const before = await tabA.evaluate(() => ({
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
    }));
    const first = await captureNativePost(tabA, 'submitTime', 'TIME_SUBMISSION_CHANGED', () =>
      submitA.getByRole('button', { name: 'Submit' }).click(),
    );
    const firstVisible = await visibleState(tabA);
    expect(first).toMatchObject({ status: 409, contentType: 'text/html', hasTypedCode: true });
    expect(firstVisible.notices).toHaveLength(1);
    expect(firstVisible.notices[0]).toMatchObject({
      code: 'TIME_SUBMISSION_CHANGED',
      focused: true,
    });
    expect(firstVisible.notices[0]!.text).toContain('This draft changed since you opened it');
    expect(firstVisible.notices[0]!.text).toContain('Status: Draft');
    expect(firstVisible.notices[0]!.top).toBeGreaterThanOrEqual(0);
    expect(firstVisible.notices[0]!.bottom).toBeLessThanOrEqual(844);
    expect(firstVisible.submitFormVisible).toBe(false);
    expect(firstVisible.scrollY).toBe(before.scrollY);
    expect(timeState(db, timeId)).toMatchObject({ approval_state: 'draft', version: 2 });
    expect(auditCount(db, timeId)).toBe(auditBeforeStale);
    cases.push({
      name: 'worker_390_en_edited_draft_native_stale_submit',
      before,
      response: first,
      visible: firstVisible,
      stateAfter: 'draft',
      versionAfter: 2,
      auditDeltaAfterStale: 0,
    });
    writeSanitizedResults(results);
    const firstNotice = tabA.locator('[data-time-detail-problem] [data-ui="problem-notice"]');
    await firstNotice.screenshot({ path: join(evidenceRoot, 'worker-390-en-stale-edit.png') });
    const review = firstNotice.getByRole('link', { name: 'Review updated time entry' });
    await expect(review).toHaveAttribute('data-sveltekit-reload', '');
    const beforeOrigin = await tabA.evaluate(() => performance.timeOrigin);
    const reviewHref = await review.getAttribute('href');
    await review.click();
    await tabA.waitForLoadState('networkidle');
    const afterOrigin = await tabA.evaluate(() => performance.timeOrigin);
    expect(afterOrigin).not.toBe(beforeOrigin);
    await expect(tabA.locator('form[action="?/submitTime"] input[name="version"]')).toHaveValue(
      '2',
    );
    await expect(tabA.locator('[data-time-detail-problem]')).toHaveCount(0);
    cases[0]!.remedyNavigation = {
      href: reviewHref?.replace(timeId, ':record') ?? null,
      freshDocument: afterOrigin !== beforeOrigin,
      version: '2',
      noticeGone: true,
    };
    writeSanitizedResults(results);
    await tabB.goto(portal(`/time/${timeId}?lang=en`));
    const submitB = tabB.locator('form[action="?/submitTime"]');
    await expect(submitB).toBeVisible();
    await submitB.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(() => timeState(db, timeId).approval_state).toBe('submitted');
    const auditBeforeSecond = auditCount(db, timeId);
    const secondForm = tabA.locator('form[action="?/submitTime"]');
    await expect(secondForm.locator('input[name="version"]')).toHaveValue('2');
    const second = await captureNativePost(tabA, 'submitTime', 'TIME_SUBMISSION_NOT_DRAFT', () =>
      secondForm.getByRole('button', { name: 'Submit' }).click(),
    );
    const secondVisible = await visibleState(tabA);
    expect(second).toMatchObject({ status: 409, contentType: 'text/html', hasTypedCode: true });
    expect(secondVisible.notices).toHaveLength(1);
    expect(secondVisible.notices[0]).toMatchObject({
      code: 'TIME_SUBMISSION_NOT_DRAFT',
      focused: true,
    });
    expect(secondVisible.notices[0]!.text).toContain('Status: Submitted');
    expect(secondVisible.notices[0]!.top).toBeGreaterThanOrEqual(0);
    expect(secondVisible.notices[0]!.bottom).toBeLessThanOrEqual(844);
    expect(secondVisible.submitFormVisible).toBe(false);
    expect(timeState(db, timeId).approval_state).toBe('submitted');
    expect(auditCount(db, timeId)).toBe(auditBeforeSecond);
    const actionProbe = await tabA.evaluate(
      async ({ url, id }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({ id, version: '2' }),
        });
        return {
          transportStatus: response.status,
          contentType: response.headers.get('content-type')?.split(';')[0] ?? '',
          body: await response.json(),
        };
      },
      { url: portal(`/time/${timeId}?/submitTime`), id: timeId },
    );
    const decodedProbe = await decodeActionData(actionProbe.body.data);
    expect(actionProbe.transportStatus).toBe(200);
    expect(actionProbe.contentType).toBe('application/json');
    expect(actionProbe.body).toMatchObject({ type: 'failure', status: 409 });
    expect(decodedProbe).toMatchObject({
      code: 'TIME_SUBMISSION_NOT_DRAFT',
      params: { status: 'submitted' },
    });
    expect(auditCount(db, timeId)).toBe(auditBeforeSecond);
    cases.push({
      name: 'worker_390_en_already_submitted_native_stale_submit',
      response: second,
      visible: secondVisible,
      stateAfter: 'submitted',
      versionAfter: timeState(db, timeId).version,
      auditDeltaAfterStale: 0,
      actionPayloadProbe: {
        transportStatus: actionProbe.transportStatus,
        type: actionProbe.body.type,
        actionStatus: actionProbe.body.status,
        code: decodedProbe.code,
        params: decodedProbe.params,
        auditDelta: 0,
      },
    });
    await tabA
      .locator('[data-time-detail-problem] [data-ui="problem-notice"]')
      .screenshot({ path: join(evidenceRoot, 'worker-390-en-already-submitted.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(portal(`/time/${timeId}?lang=es`));
    await expect(page.locator('.record-detail-header .state-tag')).toContainText('Enviado');
    await expect(page.locator('form[action="?/submitTime"]')).toHaveCount(0);
    cases.push({
      name: 'owner_1440_es_updated_time_read',
      status: 'Enviado',
      staleSubmitUnavailable: true,
    });

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
