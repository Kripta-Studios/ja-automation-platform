import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, V3Repository, WorkerStatementRepository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const commit = () =>
  execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

function runJobs(options: { requirePdfFailure?: boolean; clock?: string } = {}) {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const finance = database.sqlite
      .prepare("SELECT id FROM user WHERE email=? AND status='active'")
      .get(e2eCredentials.finance.email) as { id: string };
    const statements = new WorkerStatementRepository(database.sqlite, {
      verify: (storageKey, expected) => {
        try {
          const root = resolve(fixture.documentRoot);
          const target = resolve(root, storageKey);
          const suffix = relative(root, target);
          if (!suffix || suffix.startsWith('..') || suffix.startsWith('/'))
            throw new Error('Invalid fixture storage path');
          const bytes = readFileSync(target);
          const mediaType =
            expected?.mediaType ??
            (bytes.subarray(0, 5).toString('ascii') === '%PDF-' ? 'application/pdf' : 'text/csv');
          return {
            exists: true,
            byteLength: bytes.byteLength,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            mediaType,
            magicValid:
              mediaType === 'application/pdf'
                ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
                  bytes.includes(Buffer.from('%%EOF'))
                : bytes.byteLength > 0 && !bytes.includes(0),
          };
        } catch {
          return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
        }
      },
    });
    const priorDate = globalThis.Date;
    const priorChromium = process.env.JA_CHROMIUM_PATH;
    const priorRequirePdf = process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
    try {
      if (options.clock) {
        const fixed = priorDate.parse(options.clock);
        globalThis.Date = new Proxy(priorDate, {
          construct(target, args) {
            return Reflect.construct(target, args.length ? args : [fixed]);
          },
          get(target, key, receiver) {
            return key === 'now' ? () => fixed : Reflect.get(target, key, receiver);
          },
        }) as DateConstructor;
      }
      if (options.requirePdfFailure) {
        process.env.JA_CHROMIUM_PATH = resolve(fixture.documentRoot, 'missing-chromium');
        process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = 'true';
      }
      return runArtifactJobs({
        principal: { userId: finance.id, role: 'finance_admin', projectIds: new Set<string>() },
        documentRoot: fixture.documentRoot,
        repository: { createInvoiceDraftFromJob: () => undefined },
        v3: new V3Repository(database.sqlite),
        workerStatement: statements,
      });
    } finally {
      globalThis.Date = priorDate;
      if (priorChromium === undefined) delete process.env.JA_CHROMIUM_PATH;
      else process.env.JA_CHROMIUM_PATH = priorChromium;
      if (priorRequirePdf === undefined) delete process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
      else process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = priorRequirePdf;
    }
  } finally {
    database.sqlite.close();
  }
}

function jobCount() {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return (database.sqlite.prepare('SELECT count(*) count FROM job').get() as { count: number })
      .count;
  } finally {
    database.sqlite.close();
  }
}

test('Worker sees a usable status check after failed download and failed refresh', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = diagnostics(page);
  runJobs();
  await signIn(page, 'worker');
  const period = '2026-08-01&end=2026-08-31';
  await page.goto(portal(`/pay?start=${period}&lang=en`));
  const post = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/worker-statement') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Generate report' }).click();
  expect((await post).status()).toBe(202);
  runJobs();
  await page.reload();
  const pdf = page.getByRole('link', { name: 'Download worker statement PDF' });
  await expect(pdf).toBeVisible();
  const artifactPath = new URL((await pdf.getAttribute('href'))!, page.url()).pathname;
  let downloadIntercepts = 0;
  let refreshIntercepts = 0;
  await page.route(
    (url) => url.pathname === artifactPath,
    async (route) => {
      downloadIntercepts += 1;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'WORKER_STATEMENT_RENDER_FAILED',
          messageKey: 'problem.workerStatement.renderFailed',
          params: {},
          fieldErrors: {},
          remedies: [{ id: 'retry_statement' }],
          correlationId: 'qa-worker-ref-0001',
        }),
      });
    },
  );
  await page.route('**/api/worker-statement?**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    refreshIntercepts += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'WORKER_STATEMENT_SERVICE_UNAVAILABLE',
        messageKey: 'problem.workerStatement.serviceUnavailable',
        params: {},
        fieldErrors: {},
        remedies: [{ id: 'check_statement_status' }],
        correlationId: 'qa-worker-ref-0002',
      }),
    });
  });
  const downloadResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === artifactPath && response.status() === 409,
  );
  const scrollBeforeClick = await page.evaluate(() => Math.round(scrollY));
  await pdf.click();
  await downloadResponse;
  const notice = page.locator(
    '.pay-export-actions [data-problem-code="WORKER_STATEMENT_DOWNLOAD_STATUS_UNKNOWN"]',
  );
  await expect(notice).toBeVisible();
  const measure = () =>
    notice.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      const header = document.querySelector<HTMLElement>('.portal-layout > header');
      const safeBottom =
        nav && getComputedStyle(nav).position === 'fixed'
          ? nav.getBoundingClientRect().top - 16
          : innerHeight - 16;
      return {
        text: element.textContent?.replace(/\s+/gu, ' ').trim(),
        focused: document.activeElement === element,
        visible: bounds.top >= 0 && bounds.bottom <= safeBottom + 1,
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        safeBottom: Math.round(safeBottom),
        bottomGapPx: Number((safeBottom - bounds.bottom).toFixed(3)),
        headerBottom: Math.round(header?.getBoundingClientRect().bottom ?? 0),
        viewportHeight: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        url: location.pathname + location.search,
        scrollY: Math.round(scrollY),
      };
    });
  const immediate = await measure();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const afterFrames = await measure();
  await expect(page.getByRole('button', { name: 'Check statement status' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry statement/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download worker statement PDF' })).toHaveCount(0);
  await expect(page.locator('.pay-export-actions [data-ui="status-badge"]')).toContainText(
    'Check statement status',
  );
  await page.waitForTimeout(250);
  const state = await measure();
  await notice.screenshot({ path: resolve(evidenceRoot, 'worker-390-en-status-unknown.png') });
  const afterScreenshot = await measure();
  const samples = { scrollBeforeClick, immediate, afterFrames, delayed: state, afterScreenshot };
  writeFileSync(
    resolve(evidenceRoot, 'worker-results.json'),
    JSON.stringify(
      {
        commit: commit(),
        role: 'worker',
        viewport: 390,
        locale: 'en',
        originalRequestStatus: 202,
        download: { status: 409, intercepted: true },
        refresh: { status: 503, intercepted: true },
        samples,
        readyLinkMasked: true,
        retryButtonAbsent: true,
        workingStatusButtonPresent: true,
        downloadIntercepts,
        refreshIntercepts,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  expect(state.focused).toBe(true);
  expect(state.visible).toBe(true);
  expect(state.overflow).toBe(false);
  expect(refreshIntercepts).toBe(1);
  expect(downloadIntercepts).toBe(1);
  expect(errors).toEqual([]);
  const secondRefresh = page.waitForResponse(
    (response) => response.url().includes('/api/worker-statement?') && response.status() === 503,
  );
  await page.getByRole('button', { name: 'Check statement status' }).click();
  await secondRefresh;
  await expect(notice).toBeVisible();
  expect(refreshIntercepts).toBe(2);
  writeFileSync(
    resolve(evidenceRoot, 'worker-results.json'),
    JSON.stringify(
      {
        commit: commit(),
        role: 'worker',
        viewport: 390,
        locale: 'en',
        originalRequestStatus: 202,
        download: { status: 409, intercepted: true },
        refresh: { status: 503, intercepted: true },
        samples,
        readyLinkMasked: true,
        retryButtonAbsent: true,
        statusButtonClick: { triggeredSecondRefresh: true, status: 503, noticeStayedVisible: true },
        downloadIntercepts,
        refreshIntercepts,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
});

test('Finance sees distinct pre-invocation 503 retry guidance and uncertain 500', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = diagnostics(page);
  await signIn(page, 'finance');
  runJobs();
  await page.goto(portal('/accounting?lang=en'));
  await page.locator('.accounting-section__create summary').click();
  const form = page.locator('form[action="?/createAccountingPack"]');
  await form.locator('[name="periodStart"]').fill('2028-07-01');
  await form.locator('[name="periodEnd"]').fill('2028-07-31');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('createAccountingPack'),
  );
  await form.getByRole('button', { name: 'Generate pack' }).click();
  expect((await createdResponse).status()).toBe(200);
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  let packId = '';
  try {
    packId = (
      database.sqlite
        .prepare(
          "SELECT id FROM accounting_pack_run WHERE period_start='2028-07-01' AND period_end='2028-07-31' ORDER BY created_at DESC LIMIT 1",
        )
        .get() as { id: string }
    ).id;
  } finally {
    database.sqlite.close();
  }
  const baseTime = Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1)
    runJobs({
      requirePdfFailure: true,
      clock: new Date(baseTime + attempt * 5 * 60_000 + 1).toISOString(),
    });
  await page.reload();
  const row = page.locator(`#accounting-pack-${packId}`);
  const retry = row.getByRole('button', { name: 'Retry PDF' });
  await expect(retry).toBeVisible();
  const beforeJobs = jobCount();
  let retryPosts = 0;
  let responseMode: 503 | 500 = 503;
  await page.route(
    (url) => url.pathname.endsWith(`/api/accounting-pack/${packId}/pdf/retry`),
    async (route) => {
      retryPosts += 1;
      expect(route.request().postDataJSON()).toMatchObject({ idempotencyKey: expect.any(String) });
      await route.fulfill({
        status: responseMode,
        contentType: 'application/json',
        body: JSON.stringify({
          code:
            responseMode === 503 ? 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE' : 'UNEXPECTED_ERROR',
          messageKey:
            responseMode === 503
              ? 'problem.accountingPack.retryServiceUnavailable'
              : 'problem.error.unexpected',
          params: { correlationId: 'qa-accounting-ref-0001' },
          fieldErrors: {},
          remedies: [{ id: 'review_accounting_pack' }],
          correlationId: 'qa-accounting-ref-0001',
          error:
            responseMode === 503
              ? 'The retry was not queued because Accounting Pack access is temporarily unavailable. Review the pack before trying again. Reference: qa-accounting-ref-0001.'
              : 'We could not confirm whether the retry was queued. Check this Accounting Pack before trying again. Reference: qa-accounting-ref-0001.',
        }),
      });
    },
  );
  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/accounting-pack/${packId}/pdf/retry`) &&
      response.status() === 503,
  );
  await retry.click();
  await retryResponse;
  const notice = row.getByRole('alert');
  await expect(notice).toContainText(/retry was not queued|retry was not queued because/i);
  await expect(notice).toContainText('qa-accounting-ref-0001');
  await expect(notice.getByRole('button', { name: 'Check pack status' })).toBeVisible();
  await page.waitForTimeout(250);
  const state = await notice.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>('.bottom-nav');
    const safeBottom =
      nav && getComputedStyle(nav).position === 'fixed'
        ? nav.getBoundingClientRect().top - 16
        : innerHeight - 16;
    return {
      text: element.textContent?.replace(/\s+/gu, ' ').trim(),
      focused: document.activeElement === element,
      visible: bounds.top >= 0 && bounds.bottom <= safeBottom,
      overflow: document.documentElement.scrollWidth > innerWidth,
      scrollY: Math.round(scrollY),
      url: location.pathname + location.search,
    };
  });
  expect(state.focused).toBe(true);
  expect(state.visible).toBe(true);
  expect(state.overflow).toBe(false);
  expect(jobCount()).toBe(beforeJobs);
  expect(retryPosts).toBe(1);
  expect(errors).toEqual([]);
  await notice.screenshot({ path: resolve(evidenceRoot, 'finance-390-en-retry-503.png') });
  await notice.getByRole('button', { name: 'Check pack status' }).click();
  await expect(notice).toHaveCount(0);
  await expect(retry).toBeVisible();
  responseMode = 500;
  const unknownResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/accounting-pack/${packId}/pdf/retry`) &&
      response.status() === 500,
  );
  await retry.click();
  await unknownResponse;
  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText('The retry was not queued because Accounting Pack access');
  const unknownText = (await notice.innerText()).replace(/\s+/gu, ' ').trim();
  expect(retryPosts).toBe(2);
  expect(jobCount()).toBe(beforeJobs);
  expect(errors).toEqual([]);
  await notice.screenshot({ path: resolve(evidenceRoot, 'finance-390-en-retry-500.png') });
  writeFileSync(
    resolve(evidenceRoot, 'accounting-results.json'),
    JSON.stringify(
      {
        commit: commit(),
        role: 'finance',
        viewport: 390,
        locale: 'en',
        packCreation: { status: 200, viaBrowser: true },
        failedExport: { viaDurableWorker: true, format: 'PDF' },
        retry: { status: 503, intercepted: true, jobCountUnchanged: true, notice: state },
        unknownRetry: {
          status: 500,
          intercepted: true,
          noticeText: unknownText,
          jobCountUnchanged: true,
        },
        posts: retryPosts,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
});
