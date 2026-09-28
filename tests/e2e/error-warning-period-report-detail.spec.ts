import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createDatabase, PeriodFollowupRepository, PortalRepository } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-period-report-detail');

function customerReport() {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const report = db.sqlite
      .prepare(
        `SELECT id,project_id,snapshot_version,snapshot_sha256
           FROM period_report
          WHERE audience='customer' AND length(snapshot_sha256)=64
          ORDER BY created_at,id LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          project_id: string;
          snapshot_version: number;
          snapshot_sha256: string;
        }
      | undefined;
    if (!report) throw new Error('Disposable fixture needs a customer period report');
    const ownerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    return { databasePath, report, ownerId };
  } finally {
    db.sqlite.close();
  }
}

function followupState(databasePath: string, reportId: string) {
  const db = createDatabase(databasePath);
  try {
    const row = db.sqlite
      .prepare(
        `SELECT id,sequence_no FROM period_report_followup_event
          WHERE period_report_id=? ORDER BY sequence_no DESC LIMIT 1`,
      )
      .get(reportId) as { id: string; sequence_no: number } | undefined;
    return { id: row?.id ?? null, sequence: row?.sequence_no ?? 0 };
  } finally {
    db.sqlite.close();
  }
}

function appendFollowupOutsideBrowser(
  databasePath: string,
  report: { id: string; snapshot_version: number; snapshot_sha256: string },
  ownerId: string,
) {
  const db = createDatabase(databasePath);
  try {
    const repository = new PortalRepository(db.sqlite);
    const session = db.sqlite
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(ownerId) as { id: string } | undefined;
    if (!session) throw new Error('Owner browser session is missing');
    const owner = repository.principalFor(ownerId, session.id);
    const previous = followupState(databasePath, report.id);
    new PeriodFollowupRepository(db.sqlite).recordEvent(owner, {
      periodReportId: report.id,
      expectedSnapshotVersion: report.snapshot_version,
      expectedSnapshotSha256: report.snapshot_sha256,
      expectedLatestEventId: previous.id,
      idempotencyKey: randomUUID(),
      eventType: 'returned',
      method: null,
      eventDate: null,
      reference: null,
      signatoryName: null,
      reason: 'Disposable concurrent customer follow-up',
      responsibleUserId: ownerId,
      nextFollowUpOn: null,
    });
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

function diagnosticsFor(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  return { pageErrors, consoleErrors, responses };
}

async function nativeSubmit(page: Page): Promise<number> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordFollowup'),
  );
  await page
    .locator('form[data-period-operation="recordFollowup"]')
    .evaluate((form: HTMLFormElement) => form.submit());
  return (await responsePromise).status();
}

async function evidence(
  page: Page,
  name: string,
  diagnostic: ReturnType<typeof diagnosticsFor>,
  steps: Array<Record<string, string | number | boolean>>,
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${name}.png`),
    await page.locator('[data-period-problem] [data-ui="problem-notice"]').screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${name}-network.json`),
    `${JSON.stringify([...new Set(diagnostic.responses.map((r) => `${r.status} ${r.path}`))].sort(), null, 2)}\n`,
  );
  expect(diagnostic.pageErrors).toEqual([]);
  expect(
    diagnostic.consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
}

test('period follow-up explains invalid, success, changed history, and denied role', async ({
  page,
  browser,
}: {
  page: Page;
  browser: Browser;
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const fixture = customerReport();
  const diagnostic = diagnosticsFor(page);
  const steps: Array<Record<string, string | number | boolean>> = [];
  await signIn(page, 'owner');
  const url = portal(`/reports/period/${fixture.report.id}?lang=${locale}`);
  await page.goto(url);
  let form = page.locator('form[data-period-operation="recordFollowup"]');
  await expect(form).toBeVisible();

  await form.locator('[name="eventType"]').selectOption('returned');
  await form.locator('[name="reason"]').fill('Retained explanation for the returned report');
  await form.locator('[name="method"]').evaluate((control: HTMLInputElement) => {
    control.value = 'x'.repeat(201);
  });
  await form.scrollIntoViewIfNeeded();
  const invalidScroll = await page.evaluate(() => window.scrollY);
  expect(await nativeSubmit(page)).toBe(400);
  let notice = page.locator('[data-period-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'PERIOD_FOLLOWUP_FIELDS_INVALID');
  form = page.locator('form[data-period-operation="recordFollowup"]');
  await expect(form.locator('[name="reason"]')).toHaveValue(
    'Retained explanation for the returned report',
  );
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - invalidScroll)).toBeLessThan(12);
  steps.push({ step: 'invalid-native', code: 'PERIOD_FOLLOWUP_FIELDS_INVALID', retained: true });

  await page.goto(url);
  form = page.locator('form[data-period-operation="recordFollowup"]');
  await form.locator('[name="eventType"]').selectOption('returned');
  await form.locator('[name="reason"]').fill('Disposable customer return recorded by owner');
  const beforeSuccess = followupState(fixture.databasePath, fixture.report.id).sequence;
  const successResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordFollowup'),
  );
  await form.getByRole('button', { name: /Record|Registrar/i }).click();
  expect((await successResponse).status()).toBe(200);
  await expect
    .poll(() => followupState(fixture.databasePath, fixture.report.id).sequence)
    .toBe(beforeSuccess + 1);
  steps.push({ step: 'followup-success', saved: true });

  await page.goto(url);
  form = page.locator('form[data-period-operation="recordFollowup"]');
  await form.locator('[name="eventType"]').selectOption('returned');
  await form.locator('[name="reason"]').fill('Retained reason after concurrent follow-up');
  appendFollowupOutsideBrowser(fixture.databasePath, fixture.report, fixture.ownerId);
  await form.scrollIntoViewIfNeeded();
  const staleScroll = await page.evaluate(() => window.scrollY);
  expect(await nativeSubmit(page)).toBe(409);
  notice = page.locator('[data-period-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'PERIOD_FOLLOWUP_HISTORY_CHANGED');
  const staleFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? 'none',
    name: document.activeElement?.getAttribute('name') ?? '',
    role: document.activeElement?.getAttribute('role') ?? '',
    scroll: window.scrollY,
  }));
  expect.soft(staleFocus.role).toBe('alert');
  await expect(
    page.locator('form[data-period-operation="recordFollowup"] [name="reason"]'),
  ).toHaveValue('Retained reason after concurrent follow-up');
  expect.soft(Math.abs(staleFocus.scroll - staleScroll)).toBeLessThan(12);
  steps.push({
    step: 'history-changed-native',
    code: 'PERIOD_FOLLOWUP_HISTORY_CHANGED',
    retained: true,
    focusTag: staleFocus.tag,
    focusName: staleFocus.name,
    focusRole: staleFocus.role,
    scrollBefore: staleScroll,
    scrollAfter: staleFocus.scroll,
  });

  const workerPage = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(workerPage, 'worker');
    await workerPage.goto(url);
    await expect(workerPage.locator('form[data-period-operation="recordFollowup"]')).toHaveCount(0);
    const current = followupState(fixture.databasePath, fixture.report.id);
    const denied = await workerPage.evaluate(
      async ({ report, ownerId, latestId, key }) => {
        const response = await fetch('?/recordFollowup', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({
            expectedSnapshotVersion: String(report.snapshot_version),
            expectedSnapshotSha256: report.snapshot_sha256,
            expectedLatestEventId: latestId ?? '',
            idempotencyKey: key,
            eventType: 'returned',
            reason: 'Worker must not record customer follow-up',
            responsibleUserId: ownerId,
          }),
        });
        const result = (await response.json()) as {
          type?: string;
          status?: number;
          data?: unknown;
        };
        return { status: response.status, result };
      },
      { report: fixture.report, ownerId: fixture.ownerId, latestId: current.id, key: randomUUID() },
    );
    expect(denied.result.type).toBe('failure');
    expect(denied.result.status).toBe(403);
    expect(JSON.stringify(denied.result.data)).toContain('PERIOD_REPORT_PERMISSION_REQUIRED');
    expect(JSON.stringify(denied.result.data)).toContain('contact_project_owner');
    diagnostic.responses.push({ status: denied.status, path: new URL(url).pathname });
    steps.push({ step: 'worker-role-denied', code: 'PERIOD_REPORT_PERMISSION_REQUIRED' });
  } finally {
    await workerPage.close();
  }
  await evidence(page, `${info.project.name}-${locale}`, diagnostic, steps);
});
