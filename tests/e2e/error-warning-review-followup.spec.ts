import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createDatabase, PeriodFollowupRepository, PortalRepository } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-review-followup');

function customerReport() {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const report = db.sqlite
      .prepare(
        `SELECT id,project_id,period_start,period_end,snapshot_version,snapshot_sha256
           FROM period_report WHERE audience='customer' AND length(snapshot_sha256)=64
           ORDER BY created_at,id LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          project_id: string;
          period_start: string;
          period_end: string;
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

function latestEvent(databasePath: string, reportId: string) {
  const db = createDatabase(databasePath);
  try {
    return db.sqlite
      .prepare(
        'SELECT id,sequence_no FROM period_report_followup_event WHERE period_report_id=? ORDER BY sequence_no DESC LIMIT 1',
      )
      .get(reportId) as { id: string; sequence_no: number } | undefined;
  } finally {
    db.sqlite.close();
  }
}

function appendOutsideBrowser(fixture: ReturnType<typeof customerReport>) {
  const db = createDatabase(fixture.databasePath);
  try {
    const session = db.sqlite
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(fixture.ownerId) as { id: string } | undefined;
    if (!session) throw new Error('Owner browser session is missing');
    const principal = new PortalRepository(db.sqlite).principalFor(fixture.ownerId, session.id);
    new PeriodFollowupRepository(db.sqlite).recordEvent(principal, {
      periodReportId: fixture.report.id,
      expectedSnapshotVersion: fixture.report.snapshot_version,
      expectedSnapshotSha256: fixture.report.snapshot_sha256,
      expectedLatestEventId: latestEvent(fixture.databasePath, fixture.report.id)?.id ?? null,
      idempotencyKey: randomUUID(),
      eventType: 'returned',
      method: null,
      eventDate: null,
      reference: null,
      signatoryName: null,
      reason: 'Disposable concurrent follow-up',
      responsibleUserId: fixture.ownerId,
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

test('review follow-up retains values across native invalid/stale responses and denies worker', async ({
  page,
  browser,
}: { page: Page; browser: Browser }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(150_000);
  const fixture = customerReport();
  const locale = info.project.name === 'desktop' ? 'es' : 'en';
  const url = portal(
    `/reports/review?${new URLSearchParams({ project: fixture.report.project_id, from: fixture.report.period_start, to: fixture.report.period_end, lang: locale })}`,
  );
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
  await signIn(page, 'owner');
  await page.goto(url);
  let form = page.locator(`form[data-followup-form="${fixture.report.id}"]`);
  await expect(form).toBeVisible();
  await form.locator('[name="eventType"]').selectOption('returned');
  await form.locator('[name="responsibleUserId"]').selectOption(fixture.ownerId);
  await form.locator('[name="reason"]').fill('Retained native validation reason');
  await form.locator('[name="method"]').evaluate((input: HTMLInputElement) => {
    input.value = 'x'.repeat(201);
  });
  await form.scrollIntoViewIfNeeded();
  const invalidScroll = await page.evaluate(() => window.scrollY);
  let post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordFollowup'),
  );
  await form.evaluate((node: HTMLFormElement) => node.submit());
  expect((await post).status()).toBe(400);
  let notice = page.locator(
    `[data-followup-card]:has(form[data-followup-form="${fixture.report.id}"]) [data-ui="problem-notice"]`,
  );
  await expect(notice).toHaveAttribute('data-problem-code', 'PERIOD_FOLLOWUP_FIELDS_INVALID');
  form = page.locator(`form[data-followup-form="${fixture.report.id}"]`);
  await expect(form.locator('[name="reason"]')).toHaveValue('Retained native validation reason');
  await expect(form.locator('[name="method"]')).toBeFocused();
  const invalidAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(invalidAfter - invalidScroll)).toBeLessThan(12);
  steps.push({
    step: 'native-invalid',
    code: 'PERIOD_FOLLOWUP_FIELDS_INVALID',
    retained: true,
    scrollBefore: invalidScroll,
    scrollAfter: invalidAfter,
  });

  await page.goto(url);
  form = page.locator(`form[data-followup-form="${fixture.report.id}"]`);
  await form.locator('[name="eventType"]').selectOption('returned');
  await form.locator('[name="responsibleUserId"]').selectOption(fixture.ownerId);
  await form.locator('[name="reason"]').fill('Disposable review route success');
  const sequenceBefore = latestEvent(fixture.databasePath, fixture.report.id)?.sequence_no ?? 0;
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordFollowup'),
  );
  await form.locator('button[type="submit"]').click();
  expect((await post).status()).toBe(200);
  await expect
    .poll(() => latestEvent(fixture.databasePath, fixture.report.id)?.sequence_no ?? 0)
    .toBe(sequenceBefore + 1);
  steps.push({ step: 'enhanced-success', saved: true });

  await page.goto(url);
  form = page.locator(`form[data-followup-form="${fixture.report.id}"]`);
  await form.locator('[name="eventType"]').selectOption('returned');
  await form.locator('[name="responsibleUserId"]').selectOption(fixture.ownerId);
  await form.locator('[name="reason"]').fill('Retained stale history reason');
  appendOutsideBrowser(fixture);
  await form.scrollIntoViewIfNeeded();
  const staleScroll = await page.evaluate(() => window.scrollY);
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/recordFollowup'),
  );
  await form.evaluate((node: HTMLFormElement) => node.submit());
  expect((await post).status()).toBe(409);
  notice = page.locator(
    `[data-followup-card]:has(form[data-followup-form="${fixture.report.id}"]) [data-ui="problem-notice"]`,
  );
  await expect(notice).toHaveAttribute('data-problem-code', 'PERIOD_FOLLOWUP_HISTORY_CHANGED');
  await expect(notice).toBeFocused();
  await expect(
    page.locator(`form[data-followup-form="${fixture.report.id}"] [name="reason"]`),
  ).toHaveValue('Retained stale history reason');
  await expect(notice.getByRole('link')).toHaveAttribute(
    'href',
    /\/reports\/period\/.*#period-followup/u,
  );
  const staleAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(staleAfter - staleScroll)).toBeLessThan(12);
  steps.push({
    step: 'native-stale',
    code: 'PERIOD_FOLLOWUP_HISTORY_CHANGED',
    retained: true,
    scrollBefore: staleScroll,
    scrollAfter: staleAfter,
  });

  const worker = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(worker, 'worker');
    await worker.goto(url);
    await expect(worker.locator('form[data-followup-form]')).toHaveCount(0);
    expect(await worker.locator('body').innerText()).not.toContain('Retained stale history reason');
    steps.push({ step: 'worker-denied', noForm: true });
  } finally {
    await worker.close();
  }
  expect(errors).toEqual([]);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `review-${info.project.name}-${locale}.png`),
    await notice.screenshot(),
  );
  writeFileSync(
    join(evidenceDirectory, `review-${info.project.name}-${locale}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `review-${info.project.name}-${locale}-network.json`),
    `${JSON.stringify(responses, null, 2)}\n`,
  );
});
