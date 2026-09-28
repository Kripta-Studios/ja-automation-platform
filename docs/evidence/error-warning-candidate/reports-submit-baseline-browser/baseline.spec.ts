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

function reportState(db: DatabaseSync, id: string) {
  return db
    .prepare('SELECT approval_state,version,summary FROM daily_report WHERE id=?')
    .get(id) as {
    approval_state: string;
    version: number;
    summary: string;
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
  const name = `Report submit baseline ${randomUUID()}`;
  await form.locator('select[name="clientId"]').selectOption(clientId);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="costCenterCode"]').fill(`QA-REPSUB-${Date.now() % 100000000}`);
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

async function createDailyReport(page: Page, db: DatabaseSync, projectId: string) {
  const marker = `Stale daily baseline ${randomUUID()}`;
  await page.goto(portal(`/reports?lang=en&project=${projectId}`));
  await page.locator('[data-report-primary-cta]').filter({ hasText: 'New daily report' }).click();
  const form = page.locator('form[data-report-entry-surface="daily"]');
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('input[name="workDate"]').fill(day);
  await form.locator('input[name="siteShift"]').fill('Morning QA shift');
  await form.locator('textarea[name="summary"]').fill(marker);
  await form.locator('textarea[name="tasksCompleted"]').fill('Inspected disposable QA equipment.');
  await form.getByRole('button', { name: 'Save daily report', exact: true }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM daily_report WHERE summary=?').get(marker))
    .toBeTruthy();
  const id = (
    db.prepare('SELECT id FROM daily_report WHERE summary=?').get(marker) as { id: string }
  ).id;
  expect(reportState(db, id)).toMatchObject({ approval_state: 'draft', version: 1 });
  return id;
}

async function snapshot(page: Page) {
  return page.locator('main').evaluate((main) => {
    const status = main.querySelector('.record-detail-header .state-tag');
    const submit = main.querySelector('form[action="?/submitReport"]');
    const notice = main.querySelector('[data-report-problem] [data-ui="problem-notice"]');
    const focus = document.activeElement;
    return {
      status: status?.textContent?.trim() ?? '',
      submitVisible: Boolean(submit),
      submitVersion:
        submit?.querySelector<HTMLInputElement>('input[name="version"]')?.value ?? null,
      notice: notice
        ? {
            code: notice.getAttribute('data-problem-code'),
            text: notice.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
            focused: focus === notice,
            top: Math.round(notice.getBoundingClientRect().top),
            bottom: Math.round(notice.getBoundingClientRect().bottom),
            links: [...notice.querySelectorAll('a')].map((link) => ({
              text: link.textContent?.trim() ?? '',
              href:
                link.getAttribute('href')?.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/iu, '/:record') ??
                '',
              hardReload: link.hasAttribute('data-sveltekit-reload'),
            })),
          }
        : null,
      alerts: [...main.querySelectorAll('[role="alert"]')].map(
        (el) => el.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      ),
      focusTag: focus?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
    };
  });
}

test('Worker Daily report stale submit baseline through rendered browser', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const ownerDiagnostics = diagnostics(page);
  const results: Record<string, unknown> = {
    candidateCommit: process.env.JA_QA_CANDIDATE ?? '2d5c9eaa2dfd8f183268aaf4821c5e051c55e7c0',
    fixture:
      'fresh disposable database; Owner project/assignment and Worker Daily report created in rendered UI',
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
    const reportId = await createDailyReport(tabA, db, projectId);
    await tabA.goto(portal(`/reports/${reportId}?lang=en`));
    const submitA = tabA.locator('form[action="?/submitReport"]');
    await expect(submitA.locator('input[name="version"]')).toHaveValue('1');
    const tabB = await workerContext.newPage();
    const tabBDiagnostics = diagnostics(tabB);
    await tabB.goto(portal(`/reports/${reportId}?lang=en`));
    const edit = tabB.locator('form[data-report-autosave-form]');
    await expect(edit).toBeVisible();
    await edit.locator('textarea[name="summary"]').fill('Updated daily facts in Tab B');
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect.poll(() => reportState(db, reportId).version).toBe(2);
    const auditBefore = auditCount(db, reportId);
    await submitA.scrollIntoViewIfNeeded();
    const before = await tabA.evaluate(() => ({
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
    }));
    const pending = tabA.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/submitReport'),
    );
    await submitA.getByRole('button', { name: 'Submit for review' }).click();
    const nativeResponse = await pending;
    await tabA.waitForLoadState('networkidle');
    const nativeBody = await nativeResponse.text();
    const visible = await snapshot(tabA);
    const native = {
      status: nativeResponse.status(),
      contentType: nativeResponse.headers()['content-type']?.split(';')[0] ?? '',
      hasTypedCode: nativeBody.includes('REPORT_SUBMISSION_CHANGED'),
      hasGenericPhrase: nativeBody.includes('Check the submitted values'),
    };
    const stateAfter = reportState(db, reportId);
    const auditDelta = auditCount(db, reportId) - auditBefore;
    expect(native.status).toBe(409);
    expect(stateAfter).toMatchObject({
      approval_state: 'draft',
      version: 2,
      summary: 'Updated daily facts in Tab B',
    });
    expect(auditDelta).toBe(0);
    const probe = await tabA.evaluate(
      async ({ url, id }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({ type: 'daily', id, version: '1' }),
        });
        return { transportStatus: response.status, body: await response.json() };
      },
      { url: portal(`/reports/${reportId}?/submitReport`), id: reportId },
    );
    const decoded = await decodeActionData(probe.body.data);
    expect(probe.body).toMatchObject({ type: 'failure', status: 409 });
    expect(auditCount(db, reportId)).toBe(auditBefore);
    cases.push({
      name: 'worker_390_en_edited_draft_native_stale_submit',
      before,
      native,
      visible,
      enhancedProbe: {
        transportStatus: probe.transportStatus,
        type: probe.body.type,
        actionStatus: probe.body.status,
        code: decoded.code,
        messageKey: decoded.messageKey,
        params: decoded.params,
        remedies: decoded.remedies,
      },
      stateAfter,
      auditDelta,
    });
    writeSanitizedResults(results);
    if (visible.notice) {
      await tabA
        .locator('[data-report-problem] [data-ui="problem-notice"]')
        .screenshot({ path: join(evidenceRoot, 'worker-390-en-stale-edit-notice.png') });
      const link = tabA.locator('[data-report-problem] a').first();
      if (await link.count()) {
        // Change the record again while Tab A still displays its stale notice.
        // This distinguishes a real refresh from merely clearing a notice on the same route.
        await edit.locator('textarea[name="summary"]').fill('Second update after stale notice');
        await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect.poll(() => reportState(db, reportId).version).toBe(3);
        const beforeOrigin = await tabA.evaluate(() => performance.timeOrigin);
        const beforeVersion = await tabA
          .locator('form[action="?/submitReport"] input[name="version"]')
          .inputValue()
          .catch(() => null);
        const href = await link.getAttribute('href');
        await link.click();
        await tabA.waitForLoadState('networkidle');
        const afterOrigin = await tabA.evaluate(() => performance.timeOrigin);
        const afterVersion = await tabA
          .locator('form[action="?/submitReport"] input[name="version"]')
          .inputValue()
          .catch(() => null);
        cases[0]!.remedyNavigation = {
          href: href?.replace(reportId, ':record') ?? null,
          beforeOrigin,
          afterOrigin,
          freshDocument: beforeOrigin !== afterOrigin,
          beforeVersion,
          afterVersion,
          currentDatabaseVersion: reportState(db, reportId).version,
          loadedLatestVersion: afterVersion === String(reportState(db, reportId).version),
          noticeAfter: await tabA.locator('[data-report-problem]').count(),
        };
        writeSanitizedResults(results);
      }
    } else {
      await tabA
        .locator('.record-detail-header')
        .screenshot({ path: join(evidenceRoot, 'worker-390-en-stale-edit-status.png') });
    }
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
