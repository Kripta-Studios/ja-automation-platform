import { expect, test } from '@playwright/test';
import { createDatabase, V3Repository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const evidenceRoot = resolve('docs/evidence/error-warning-export-qa');

function fixtureCounts(): Record<string, number> {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return Object.fromEntries(
      ['accounting_pack_run', 'accounting_pack_revision', 'accounting_pack_export', 'job'].map(
        (table) => [
          table,
          (
            database.sqlite.prepare(`SELECT count(*) count FROM ${table}`).get() as {
              count: number;
            }
          ).count,
        ],
      ),
    );
  } finally {
    database.sqlite.close();
  }
}

function withClock<T>(iso: string, work: () => T): T {
  const realDate = globalThis.Date;
  const fixedTime = realDate.parse(iso);
  const clockDate = new Proxy(realDate, {
    construct(target, args) {
      return Reflect.construct(target, args.length === 0 ? [fixedTime] : args);
    },
    get(target, property, receiver) {
      if (property === 'now') return () => fixedTime;
      return Reflect.get(target, property, receiver);
    },
  }) as DateConstructor;
  globalThis.Date = clockDate;
  try {
    return work();
  } finally {
    globalThis.Date = realDate;
  }
}

function runArtifactWorker(clock?: string): { processed: number; failed: number } {
  const fixture = readE2EFixturePointer();
  const work = () => {
    const database = createDatabase(fixture.databasePath);
    try {
      const finance = database.sqlite
        .prepare("SELECT id FROM user WHERE email=? AND status='active'")
        .get(e2eCredentials.finance.email) as { id: string } | undefined;
      expect(finance?.id).toBeTruthy();
      const principal = {
        userId: finance!.id,
        role: 'finance_admin' as const,
        projectIds: new Set<string>(),
      };
      const result = runArtifactJobs({
        principal,
        documentRoot: fixture.documentRoot,
        repository: { createInvoiceDraft: () => undefined },
        v3: new V3Repository(database.sqlite),
      });
      return { processed: result.processed, failed: result.failed };
    } finally {
      database.sqlite.close();
    }
  };
  return clock ? withClock(clock, work) : work();
}

async function createPackThroughBrowser(
  page: import('@playwright/test').Page,
  periodStart: string,
  periodEnd: string,
): Promise<string> {
  await page.goto(portal('/accounting'));
  await page.locator('.accounting-section__create summary').click();
  const form = page.locator('form[action="?/createAccountingPack"]');
  await form.locator('input[name="periodStart"]').fill(periodStart);
  await form.locator('input[name="periodEnd"]').fill(periodEnd);
  const response = page.waitForResponse(
    (value) => value.url().includes('createAccountingPack') && value.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Generate pack' }).click();
  expect((await response).status()).toBe(200);
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const pack = database.sqlite
      .prepare(
        'SELECT id FROM accounting_pack_run WHERE period_start=? AND period_end=? ORDER BY created_at DESC LIMIT 1',
      )
      .get(periodStart, periodEnd) as { id: string } | undefined;
    expect(pack?.id).toBeTruthy();
    return pack!.id;
  } finally {
    database.sqlite.close();
  }
}

test('Accounting Pack ready click, stale-source GET, and final historical bytes', async ({
  page,
}) => {
  const width = page.viewportSize()?.width;
  const label = width === 390 ? 'phone-390' : width === 1440 ? 'desktop-1440' : null;
  test.skip(!label, 'The focused export QA matrix uses phone and desktop.');
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ method: string; path: string; status: number }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 180));
  });
  page.on('response', (response) => {
    if (response.status() >= 500)
      failedResponses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });

  await signIn(page, 'finance');
  const fixture = readE2EFixturePointer();
  // Finish the seed's queued artifacts first. Their canonical evidence can make
  // the seeded pack stale; finance then requests a current version through the UI.
  runArtifactWorker();
  const historicalId = await createPackThroughBrowser(page, '2026-08-01', '2026-08-31');
  runArtifactWorker();
  await page.goto(portal('/accounting'));
  const historicalRow = page.locator(`#accounting-pack-${historicalId}`);
  await historicalRow.locator('details.accounting-pack-review summary').click();
  const finalForm = historicalRow.locator('form[action="?/finalizeAccountingPack"]');
  await expect(finalForm).toBeVisible();
  const finalResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('finalizeAccountingPack'),
  );
  await finalForm.getByRole('button', { name: 'Finalize reviewed version' }).click();
  expect((await finalResponsePromise).status()).toBe(200);

  const staleStart = label === 'phone-390' ? '2028-03-01' : '2028-04-01';
  const staleEnd = label === 'phone-390' ? '2028-03-31' : '2028-04-30';
  const staleId = await createPackThroughBrowser(page, staleStart, staleEnd);
  runArtifactWorker();
  await page.reload();
  const readyRow = page.locator(`#accounting-pack-${staleId}`);
  await expect(readyRow.getByRole('link', { name: 'XLSX Ready' })).toBeVisible();
  const downloadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/accounting-pack/${staleId}/xlsx`) &&
      response.request().method() === 'GET',
  );
  await readyRow.getByRole('link', { name: 'XLSX Ready' }).click();
  const readyResponse = await downloadResponsePromise;
  expect(readyResponse.status()).toBe(200);
  expect(readyResponse.headers()['content-disposition']).toMatch(/\.xlsx/);

  const database = createDatabase(fixture.databasePath);
  try {
    const stalePack = database.sqlite
      .prepare('SELECT created_at FROM accounting_pack_run WHERE id=?')
      .get(staleId) as { created_at: string };
    const sourceChangedAt = new Date(Date.parse(stalePack.created_at) + 1).toISOString();
    database.sqlite
      .prepare(
        `INSERT INTO legal_entity(
           id,code,legal_name,currency,billing_address,company_identifiers,status,
           created_at,updated_at,version
         ) VALUES(?,?,?,?,?,?, 'active',?,?,1)`,
      )
      .run(
        `e2e-stale-${label}`,
        `QA${label === 'phone-390' ? '390' : '1440'}`,
        'Disposable QA entity',
        'EUR',
        'QA address',
        `QA-${label}`,
        sourceChangedAt,
        sourceChangedAt,
      );
  } finally {
    database.sqlite.close();
  }
  const beforeStaleGet = fixtureCounts();
  const changedResponse = await page.request.get(portal(`/api/accounting-pack/${staleId}/xlsx`));
  expect(changedResponse.status()).toBe(409);
  const changed = (await changedResponse.json()) as Record<string, unknown>;
  expect(changed).toMatchObject({
    code: 'ACCOUNTING_PACK_SOURCE_CHANGED',
    messageKey: 'problem.accountingPack.sourceChanged',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_accounting_pack', packId: staleId }],
  });
  expect(changed.correlationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  expect(fixtureCounts(), 'a download GET must not create a new revision or job').toEqual(
    beforeStaleGet,
  );
  await page.reload();
  const staleRow = page.locator(`#accounting-pack-${staleId}`);
  await expect(staleRow).toContainText('Changes since generation');
  await expect(staleRow).toContainText('Yes — generate a new version');
  await staleRow.getByRole('link', { name: 'XLSX Ready' }).click();
  const notice = staleRow.getByRole('alert');
  await expect(notice).toContainText(
    'The source records changed. Review the updated pack before generating another version.',
  );
  await expect(notice).toBeFocused();
  await expect(notice.getByRole('button', { name: 'Check pack status' })).toBeVisible();
  const noticeVisible = await notice.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
  });
  expect(noticeVisible).toBe(true);
  const staleNoticeFocused = await notice.evaluate((element) => document.activeElement === element);
  await staleRow.screenshot({
    path: resolve(evidenceRoot, `${label}-accounting-stale-postfix.png`),
  });

  const historicalResponse = await page.request.get(
    portal(`/api/accounting-pack/${historicalId}/xlsx`),
  );
  expect(historicalResponse.status()).toBe(200);
  expect((await historicalResponse.body()).byteLength).toBeGreaterThan(0);
  await page.reload();
  await expect(historicalRow).toContainText(/Final/i);

  writeFileSync(
    resolve(evidenceRoot, `${label}-accounting-postfix.json`),
    JSON.stringify(
      {
        viewport: label,
        readyClickStatus: readyResponse.status(),
        staleGetStatus: changedResponse.status(),
        staleGetCode: changed.code,
        staleGetRemedyId: (changed.remedies as Array<{ id: string }>)[0]?.id,
        unchangedCountsAfterStaleGet: beforeStaleGet,
        staleNoticeFocused,
        staleNoticeVisible: noticeVisible,
        finalHistoricalStatus: historicalResponse.status(),
        failedResponses,
        consoleErrors,
        pageErrors,
      },
      null,
      2,
    ) + '\n',
  );
  expect(pageErrors).toEqual([]);
});

test('Accounting Pack pending download and role boundaries are truthful', async ({ page }) => {
  const width = page.viewportSize()?.width;
  const label = width === 390 ? 'phone-390' : width === 1440 ? 'desktop-1440' : null;
  test.skip(!label, 'The focused export QA matrix uses phone and desktop.');
  test.setTimeout(120_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const pageErrors: string[] = [];
  const failedResponses: Array<{ method: string; path: string; status: number }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      failedResponses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
  const periodStart = label === 'phone-390' ? '2028-01-01' : '2028-02-01';
  const periodEnd = label === 'phone-390' ? '2028-01-31' : '2028-02-29';
  await signIn(page, 'finance');
  const packId = await createPackThroughBrowser(page, periodStart, periodEnd);
  const pending = await page.request.get(portal(`/api/accounting-pack/${packId}/pdf`));
  expect(pending.status()).toBe(409);
  const pendingPayload = (await pending.json()) as Record<string, unknown>;
  expect(pendingPayload).toMatchObject({
    code: 'ACCOUNTING_PACK_EXPORT_PROCESSING',
    messageKey: 'problem.accountingPack.exportProcessing',
    remedies: [{ id: 'review_accounting_pack', packId }],
  });
  const row = page.locator(`#accounting-pack-${packId}`);
  await expect(row).toBeVisible();
  await expect(row.getByText(/PDF · (Queued|Pending|Processing)/i)).toBeVisible();
  await row.screenshot({ path: resolve(evidenceRoot, `${label}-accounting-pending.png`) });
  const financeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );

  await page.context().clearCookies();
  await signIn(page, 'owner');
  const ownerPage = await page.goto(portal('/accounting'));
  expect(ownerPage?.status()).toBe(200);
  await page.context().clearCookies();
  await signIn(page, 'auditor');
  const auditorPage = await page.goto(portal('/accounting'));
  expect(auditorPage?.status()).toBe(200);
  await expect(page.locator('form[action="?/createAccountingPack"]')).toHaveCount(0);
  const auditorPending = await page.request.get(portal(`/api/accounting-pack/${packId}/pdf`));
  expect(auditorPending.status()).toBe(409);
  await page.context().clearCookies();
  await signIn(page, 'worker');
  const workerDownload = await page.request.get(portal(`/api/accounting-pack/${packId}/pdf`));
  expect(workerDownload.status()).toBe(404);
  writeFileSync(
    resolve(evidenceRoot, `${label}-accounting-pack.json`),
    JSON.stringify(
      {
        viewport: label,
        pendingStatus: pending.status(),
        pendingCode: pendingPayload.code,
        ownerPageStatus: ownerPage?.status(),
        auditorPageStatus: auditorPage?.status(),
        auditorPendingStatus: auditorPending.status(),
        workerDownloadStatus: workerDownload.status(),
        financeHorizontalOverflow: financeOverflow,
        failedResponses,
        pageErrors,
      },
      null,
      2,
    ) + '\n',
  );
  expect(pageErrors).toEqual([]);
});

test('Accounting Pack explains a temporary artifact-service 503 without queuing another job', async ({
  page,
}) => {
  const width = page.viewportSize()?.width;
  const label = width === 390 ? 'phone-390' : width === 1440 ? 'desktop-1440' : null;
  test.skip(!label, 'The focused export QA matrix uses phone and desktop.');
  test.setTimeout(120_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ method: string; path: string; status: number }> = [];
  const retryRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 180));
  });
  page.on('response', (response) => {
    if (response.status() >= 500)
      failedResponses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname.replace(
          /(\/api\/accounting-pack\/)[^/]+(?=\/)/u,
          '$1<pack-id>',
        ),
        status: response.status(),
      });
  });
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/api/accounting-pack/') &&
      request.url().endsWith('/retry')
    )
      retryRequests.push(new URL(request.url()).pathname);
  });

  await signIn(page, 'finance');
  // Complete seed work before generation so the current pack is not immediately stale.
  runArtifactWorker();
  const periodStart = label === 'phone-390' ? '2028-09-01' : '2028-10-01';
  const periodEnd = label === 'phone-390' ? '2028-09-30' : '2028-10-31';
  const packId = await createPackThroughBrowser(page, periodStart, periodEnd);
  runArtifactWorker();
  await page.reload();
  const row = page.locator(`#accounting-pack-${packId}`);
  const readyFilter = page.getByRole('button', {
    name: /Ready \d+ Available for review, finalization or download/u,
  });
  await readyFilter.click();
  await expect(readyFilter).toHaveAttribute('aria-pressed', 'true');
  const readyLink = row.getByRole('link', { name: 'XLSX Ready' });
  await expect(readyLink).toBeVisible();
  await readyLink.scrollIntoViewIfNeeded();
  const locationBefore = new URL(page.url()).pathname;
  const scrollBefore = await page.evaluate(() => scrollY);
  const countsBefore = fixtureCounts();
  const artifactPath = `/api/accounting-pack/${packId}/xlsx`;
  const referenceId = '862ed235-6937-4c62-ae42-8714b0bb3b91';
  let intercepted = 0;
  await page.route(
    (url) => url.pathname.endsWith(artifactPath),
    async (route) => {
      intercepted += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: { 'cache-control': 'private, no-store' },
        body: JSON.stringify({
          error: `We could not verify whether the XLSX file is available. Review this Accounting Pack's status before trying again. Reference: ${referenceId}.`,
          code: 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE',
          messageKey: 'problem.accountingPack.exportServiceUnavailable',
          params: { format: 'XLSX', correlationId: referenceId },
          fieldErrors: {},
          remedies: [{ id: 'review_accounting_pack', packId }],
          correlationId: referenceId,
        }),
      });
    },
    { times: 1 },
  );
  const unavailablePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(artifactPath) &&
      response.request().method() === 'GET' &&
      response.status() === 503,
  );
  await readyLink.click();
  const unavailable = await unavailablePromise;
  const contract = (await unavailable.json()) as Record<string, unknown>;
  expect(contract).toMatchObject({
    code: 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE',
    messageKey: 'problem.accountingPack.exportServiceUnavailable',
    params: { format: 'XLSX', correlationId: referenceId },
    fieldErrors: {},
    remedies: [{ id: 'review_accounting_pack', packId }],
    correlationId: referenceId,
  });
  expect(intercepted).toBe(1);
  const notice = row.getByRole('alert');
  await expect(notice).toContainText(
    'The download status is uncertain. Check the pack status before trying again.',
  );
  await expect(notice.getByRole('button', { name: 'Check pack status' })).toBeVisible();
  await expect(notice).toBeFocused();
  const noticeVisible = await notice.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
  });
  expect(noticeVisible).toBe(true);
  expect(new URL(page.url()).pathname).toBe(locationBefore);
  await expect(readyFilter).toHaveAttribute('aria-pressed', 'true');
  const scrollAfter = await page.evaluate(() => scrollY);
  expect(scrollAfter).toBe(scrollBefore);
  expect(fixtureCounts()).toEqual(countsBefore);
  expect(retryRequests).toEqual([]);
  await notice.screenshot({
    path: resolve(evidenceRoot, `${label}-accounting-service-503-notice-postfix.png`),
  });

  await notice.getByRole('button', { name: 'Check pack status' }).click();
  await expect(row).toBeVisible();
  await expect(readyFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(row.getByRole('alert')).toHaveCount(0);
  const recoveredPromise = page.waitForResponse(
    (response) => response.url().endsWith(artifactPath) && response.request().method() === 'GET',
  );
  await readyLink.click();
  const recovered = await recoveredPromise;
  expect(recovered.status()).toBe(200);
  expect(fixtureCounts()).toEqual(countsBefore);
  expect(retryRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  writeFileSync(
    resolve(evidenceRoot, `${label}-accounting-service-503-postfix.json`),
    JSON.stringify(
      {
        viewport: label,
        artifactStatus: unavailable.status(),
        artifactCode: contract.code,
        remedyId: (contract.remedies as Array<{ id: string }>)[0]?.id,
        noticeFocused: true,
        noticeVisible,
        locationPreserved: true,
        readyFilterPreserved: true,
        scrollBefore,
        scrollAfter,
        jobAndRecordCountsUnchanged: true,
        retryPostCount: retryRequests.length,
        recoveredDownloadStatus: recovered.status(),
        failedResponses,
        consoleErrorCount: consoleErrors.length,
        consoleErrorExamples: consoleErrors
          .slice(0, 5)
          .map((message) => message.replace(/https?:\/\/\S+/gu, '<url>')),
        pageErrors,
      },
      null,
      2,
    ) + '\n',
  );
});

test('Accounting Pack failed PDF retries alone through the browser', async ({ page }) => {
  const width = page.viewportSize()?.width;
  const label = width === 390 ? 'phone-390' : width === 1440 ? 'desktop-1440' : null;
  test.skip(!label, 'The focused export QA matrix uses phone and desktop.');
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const pageErrors: string[] = [];
  const failedResponses: Array<{ method: string; path: string; status: number }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      failedResponses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });

  await signIn(page, 'finance');
  const periodStart = label === 'phone-390' ? '2028-07-01' : '2028-08-01';
  const periodEnd = label === 'phone-390' ? '2028-07-31' : '2028-08-31';
  const packId = await createPackThroughBrowser(page, periodStart, periodEnd);
  const fixture = readE2EFixturePointer();
  const originalChromiumPath = process.env.JA_CHROMIUM_PATH;
  const originalRequirePdf = process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
  process.env.JA_CHROMIUM_PATH = `${fixture.documentRoot}/missing-chromium`;
  process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = 'true';
  try {
    const baseTime = Date.now();
    for (let attempt = 0; attempt < 5; attempt += 1)
      runArtifactWorker(new Date(baseTime + attempt * 5 * 60_000 + 1).toISOString());
  } finally {
    if (originalChromiumPath === undefined) delete process.env.JA_CHROMIUM_PATH;
    else process.env.JA_CHROMIUM_PATH = originalChromiumPath;
    if (originalRequirePdf === undefined) delete process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF;
    else process.env.JA_ACCOUNTING_PACK_REQUIRE_PDF = originalRequirePdf;
  }

  const database = createDatabase(fixture.databasePath);
  let readySiblingBefore: { sha256: string; byte_length: number } | undefined;
  try {
    const job = database.sqlite
      .prepare(
        "SELECT state,attempts FROM job WHERE kind='accounting_pack_artifact_render' AND idempotency_key=?",
      )
      .get(`accounting-pack:${packId}`) as { state: string; attempts: number } | undefined;
    expect(job).toEqual({ state: 'dead_letter', attempts: 5 });
    readySiblingBefore = database.sqlite
      .prepare(
        "SELECT sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? AND export_type='xlsx'",
      )
      .get(packId) as { sha256: string; byte_length: number } | undefined;
    expect(readySiblingBefore?.byte_length).toBeGreaterThan(0);
  } finally {
    database.sqlite.close();
  }

  await page.reload();
  const row = page.locator(`#accounting-pack-${packId}`);
  await expect(row.getByLabel('PDF Failed')).toBeVisible();
  await expect(row.getByRole('link', { name: 'XLSX Ready' })).toBeVisible();
  await expect(row).toContainText('Review this pack, then retry only this failed export.');
  await expect(row.getByRole('link', { name: /Review project economics/i })).toBeVisible();
  const failedGet = await page.request.get(portal(`/api/accounting-pack/${packId}/pdf`));
  expect(failedGet.status()).toBe(409);
  const failedPayload = (await failedGet.json()) as Record<string, unknown>;
  expect(failedPayload).toMatchObject({
    code: 'ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE',
    messageKey: 'problem.accountingPack.exportFailedRetryable',
    remedies: [{ id: 'retry_accounting_pack_export', packId, format: 'pdf' }],
  });
  await page.context().clearCookies();
  await signIn(page, 'owner');
  await page.goto(portal('/accounting'));
  await expect(
    page.locator(`#accounting-pack-${packId}`).getByRole('button', { name: 'Retry PDF' }),
  ).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, 'auditor');
  await page.goto(portal('/accounting'));
  const auditorRow = page.locator(`#accounting-pack-${packId}`);
  await expect(auditorRow).toContainText(
    'Contact a finance administrator to review the failed export.',
  );
  await expect(auditorRow.getByRole('button', { name: 'Retry PDF' })).toHaveCount(0);
  const auditorFailed = await page.request.get(portal(`/api/accounting-pack/${packId}/pdf`));
  expect(auditorFailed.status()).toBe(409);
  const auditorPayload = (await auditorFailed.json()) as Record<string, unknown>;
  expect(auditorPayload).toMatchObject({
    code: 'ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE',
    remedies: [{ id: 'contact_finance_owner' }],
  });
  await page.context().clearCookies();
  await signIn(page, 'worker');
  const workerFailed = await page.request.get(portal(`/api/accounting-pack/${packId}/pdf`));
  expect(workerFailed.status()).toBe(404);
  await page.context().clearCookies();
  await signIn(page, 'finance');
  await page.goto(portal('/accounting'));

  const retryButton = row.getByRole('button', { name: 'Retry PDF' });
  await expect(retryButton).toBeVisible();
  const retryResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/accounting-pack/${packId}/pdf/retry`) &&
      response.request().method() === 'POST',
  );
  await retryButton.click();
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.status()).toBe(202);
  const retry = (await retryResponse.json()) as {
    job: { id: string; created: boolean; state: string };
  };
  expect(retry.job).toMatchObject({ created: true, state: 'queued' });
  const after = createDatabase(fixture.databasePath);
  try {
    const retryJob = after.sqlite
      .prepare('SELECT kind,payload_json,state FROM job WHERE id=?')
      .get(retry.job.id) as { kind: string; payload_json: string; state: string } | undefined;
    expect(retryJob?.kind).toBe('accounting_pack_artifact_render');
    expect(retryJob?.state).toBe('queued');
    expect(JSON.parse(retryJob!.payload_json)).toMatchObject({
      packId,
      formats: ['pdf'],
    });
    const readySiblingAfter = after.sqlite
      .prepare(
        "SELECT sha256,byte_length FROM accounting_pack_export WHERE pack_run_id=? AND export_type='xlsx'",
      )
      .get(packId);
    expect(readySiblingAfter).toEqual(readySiblingBefore);
  } finally {
    after.sqlite.close();
  }
  const alert = row.getByRole('alert');
  await expect(alert).toContainText('The export retry was queued.');
  await expect(alert).toBeFocused();
  const alertVisible = await alert.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
  });
  expect(alertVisible).toBe(true);
  await alert.screenshot({
    path: resolve(evidenceRoot, `${label}-accounting-retry-notice-postfix.png`),
  });
  writeFileSync(
    resolve(evidenceRoot, `${label}-accounting-retry-postfix.json`),
    JSON.stringify(
      {
        viewport: label,
        failedDownloadStatus: failedGet.status(),
        failedDownloadCode: failedPayload.code,
        retryStatus: retryResponse.status(),
        retryCreated: retry.job.created,
        queuedFormats: ['pdf'],
        readySiblingUnchanged: true,
        alertVisible,
        failedResponses,
        pageErrors,
      },
      null,
      2,
    ) + '\n',
  );
  expect(pageErrors).toEqual([]);
});
