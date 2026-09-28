import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

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
  const name = `Time submit baseline ${randomUUID()}`;
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

async function captureNativePost(page: Page, action: string, click: () => Promise<void>) {
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
    hasTypedCode: body.includes('TIME_SUBMISSION_CHANGED'),
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

test('Worker native Time detail stale submit baseline', async ({ browser, page }) => {
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerDiagnostics = diagnostics(page);
  const results: Record<string, unknown> = {
    candidateCommit: 'f5b37aa2604a925ec649af83d61802d2866296cd',
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
    const first = await captureNativePost(tabA, 'submitTime', () =>
      submitA.getByRole('button', { name: 'Submit' }).click(),
    );
    const firstVisible = await visibleState(tabA);
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
    const draftActions = tabA.locator('section[aria-label="Edit draft"]');
    if (await draftActions.count())
      await draftActions.screenshot({
        path: join(evidenceRoot, 'worker-390-en-stale-edit-actions.png'),
      });

    // After the native response, Tab A should reflect the current draft version.
    if (await submitA.count())
      await expect(submitA.locator('input[name="version"]')).toHaveValue('2');
    await tabB.goto(portal(`/time/${timeId}?lang=en`));
    const submitB = tabB.locator('form[action="?/submitTime"]');
    await expect(submitB).toBeVisible();
    await submitB.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(() => timeState(db, timeId).approval_state).toBe('submitted');
    const auditBeforeSecond = auditCount(db, timeId);
    const secondForm = tabA.locator('form[action="?/submitTime"]');
    await expect(secondForm.locator('input[name="version"]')).toHaveValue('2');
    const second = await captureNativePost(tabA, 'submitTime', () =>
      secondForm.getByRole('button', { name: 'Submit' }).click(),
    );
    const secondVisible = await visibleState(tabA);
    expect(timeState(db, timeId).approval_state).toBe('submitted');
    expect(auditCount(db, timeId)).toBe(auditBeforeSecond);
    cases.push({
      name: 'worker_390_en_already_submitted_native_stale_submit',
      response: second,
      visible: secondVisible,
      stateAfter: 'submitted',
      versionAfter: timeState(db, timeId).version,
      auditDeltaAfterStale: 0,
    });
    await tabA
      .locator('.record-detail-header .state-tag')
      .screenshot({ path: join(evidenceRoot, 'worker-390-en-already-submitted-status.png') });

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
