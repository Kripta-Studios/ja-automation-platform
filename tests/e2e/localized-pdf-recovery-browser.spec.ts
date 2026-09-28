import { createHash } from 'node:crypto';
import { createDatabase, LocalizedPdfRepository, V3Repository } from '@ja/database';
import { runArtifactJobs, runLocalizedPdfVariantJob } from '@ja/reporting';
import { expect, request as apiRequest, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const evidenceDir = resolve('docs/evidence/error-warning-candidate/localized-pdf-recovery');

function withDatabase<T>(work: (sqlite: ReturnType<typeof createDatabase>['sqlite']) => T): T {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return work(database.sqlite);
  } finally {
    database.sqlite.close();
  }
}

function variantState(variantId: string) {
  return withDatabase(
    (sqlite) =>
      sqlite
        .prepare(
          `SELECT status,current_attempt_number,retryable,integrity_blocked,storage_key
           FROM localized_pdf_variant WHERE variant_id=?`,
        )
        .get(variantId) as {
        status: string;
        current_attempt_number: number;
        retryable: number | null;
        integrity_blocked: number;
        storage_key: string;
      },
  );
}

function retryDecisionCount(variantId: string): number {
  return withDatabase(
    (sqlite) =>
      (
        sqlite
          .prepare('SELECT count(*) AS count FROM localized_pdf_retry_decision WHERE variant_id=?')
          .get(variantId) as { count: number }
      ).count,
  );
}

function settleSeedJobs(): void {
  const fixture = readE2EFixturePointer();
  withDatabase((sqlite) => {
    const v3 = new V3Repository(sqlite);
    runArtifactJobs({
      documentRoot: fixture.documentRoot,
      repository: { createInvoiceDraftFromJob: () => undefined },
      v3,
    });
    const due = sqlite
      .prepare(
        "SELECT count(*) AS count FROM job WHERE contract_version='b5-v1' AND state='queued' AND run_after<=?",
      )
      .get(new Date().toISOString()) as { count: number };
    expect(due.count).toBe(0);
  });
}

function processVariant(variantId: string): void {
  const fixture = readE2EFixturePointer();
  withDatabase((sqlite) => {
    const repository = new LocalizedPdfRepository(sqlite, {
      verify: (storageKey) => {
        try {
          const bytes = readFileSync(join(fixture.documentRoot, storageKey));
          return {
            exists: true,
            byteLength: bytes.byteLength,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            mediaType: 'application/pdf',
            magicValid:
              bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
              bytes.includes(Buffer.from('%%EOF')),
          };
        } catch {
          return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
        }
      },
    });
    const v3 = new V3Repository(sqlite);
    const due = sqlite
      .prepare(
        `SELECT count(*) AS count FROM job
         WHERE kind='localized_pdf_variant_render' AND state='queued' AND run_after<=?`,
      )
      .get(new Date().toISOString()) as { count: number };
    expect(due.count).toBe(1);
    v3.runDueJobs(1, {
      localized_pdf_variant_render: (payload, execution) => {
        const candidate = payload as { variantId: string };
        expect(candidate.variantId).toBe(variantId);
        const result = runLocalizedPdfVariantJob({
          repository,
          payload,
          execution: {
            jobId: execution.jobId,
            jobRunId: execution.runId,
            leaseFence: execution.fenceVersion,
          },
          documentRoot: fixture.documentRoot,
          deferCompletion: true,
        });
        return result.finalize;
      },
    });
  });
}

async function requestLocale(page: Page, locale: 'en' | 'es' | 'pt') {
  const panel = page.locator('[data-localized-pdf-panel]');
  await panel.locator('select').selectOption(locale);
  const request = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/api/localized-pdf'),
  );
  await panel.getByRole('button', { name: 'Generate report' }).click();
  const response = await request;
  expect(response.status()).toBe(202);
  const body = (await response.json()) as {
    variant: { variantId: string; locale: string; status: string };
  };
  expect(body.variant).toMatchObject({ locale, status: 'queued' });
  return body.variant.variantId;
}

test('localized PDF reconciles a lost retry response and blocks a stale ready download', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);

  const label = info.project.name === 'phone-390' ? 'phone-390' : 'desktop-1440';
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const httpErrors: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
  });

  settleSeedJobs();
  const reportId = withDatabase((sqlite) => {
    const offset = info.project.name === 'phone-390' ? 0 : 1;
    const report = sqlite
      .prepare('SELECT id FROM daily_report ORDER BY id LIMIT 1 OFFSET ?')
      .get(offset) as { id: string } | undefined;
    if (!report) throw new Error('Disposable daily report fixture is required');
    return report.id;
  });
  await signIn(page, 'owner');
  await page.goto(portal(`/reports/${reportId}?lang=en`));
  const panel = page.locator('[data-localized-pdf-panel]');
  await expect(panel).toBeVisible();

  // The Generate POST is persisted, but its response is lost at the browser boundary. A
  // collection read reconciles the queued Spanish variant without a second POST.
  let generatePosts = 0;
  let persistedGenerateStatus = 0;
  let spanishId = '';
  await page.route('**/api/localized-pdf', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    generatePosts += 1;
    const persisted = await route.fetch();
    persistedGenerateStatus = persisted.status();
    const body = (await persisted.json()) as { variant: { variantId: string } };
    spanishId = body.variant.variantId;
    await route.abort('failed');
  });
  await panel.locator('select').selectOption('es');
  await panel.getByRole('button', { name: 'Generate report' }).click();
  await expect(panel.locator('.localized-pdf-selected .localized-pdf-status')).toContainText(
    'Queued',
  );
  await expect(panel.getByRole('button', { name: 'Generate report' })).toBeDisabled();
  expect(persistedGenerateStatus).toBe(202);
  expect(generatePosts).toBe(1);
  expect(variantState(spanishId)).toMatchObject({ status: 'queued', current_attempt_number: 1 });
  await page.unroute('**/api/localized-pdf');

  // A real queued PDF job fails on a disposable destination collision, creating the same
  // append-only attempt and permitted retry decision as a production renderer failure.
  const collisionPath = join(
    readE2EFixturePointer().documentRoot,
    variantState(spanishId).storage_key,
  );
  mkdirSync(dirname(collisionPath), { recursive: true });
  writeFileSync(collisionPath, 'Disposable PDF collision fixture');
  processVariant(spanishId);
  expect(variantState(spanishId)).toMatchObject({ status: 'failed', retryable: 1 });
  await page.reload();
  await panel.locator('select').selectOption('es');
  await expect(panel.locator('.localized-pdf-selected .localized-pdf-status')).toContainText(
    'Failed',
  );

  let retryPosts = 0;
  let persistedRetryStatus = 0;
  let dropStatusOnce = false;
  await page.route('**/api/localized-pdf?*', async (route) => {
    if (dropStatusOnce) {
      dropStatusOnce = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.route(`**/api/localized-pdf/${spanishId}/retry`, async (route) => {
    retryPosts += 1;
    const persisted = await route.fetch();
    persistedRetryStatus = persisted.status();
    dropStatusOnce = true;
    await route.abort('failed');
  });
  await panel.locator('.localized-pdf-selected').getByRole('button', { name: 'Retry' }).click();
  const uncertain = panel.locator('[data-problem-code="LOCALIZED_PDF_RETRY_UNCERTAIN"]');
  await expect(uncertain).toBeVisible();
  await expect(uncertain).toContainText('could not confirm whether the PDF retry started');
  await expect(uncertain).toContainText('Refresh its status');
  await expect(uncertain).not.toContainText('Status: Failed');
  await expect(uncertain).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Refresh' }).last()).toBeVisible();
  await expect(
    panel.locator('.localized-pdf-selected').getByRole('button', { name: 'Retry' }),
  ).toBeDisabled();
  expect(persistedRetryStatus).toBe(202);
  expect(retryPosts).toBe(1);
  expect(retryDecisionCount(spanishId)).toBe(1);
  expect(variantState(spanishId)).toMatchObject({ status: 'queued', current_attempt_number: 2 });
  const uncertainVisible = await uncertain.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= innerHeight;
  });
  expect(uncertainVisible).toBe(true);
  const uncertainText = (await uncertain.innerText()).slice(0, 350);
  mkdirSync(evidenceDir, { recursive: true });
  await uncertain.screenshot({ path: join(evidenceDir, `${label}-retry-uncertain.png`) });

  await panel.getByRole('button', { name: 'Refresh' }).last().click();
  await expect(uncertain).toHaveCount(0);
  await expect(panel.locator('.localized-pdf-selected .localized-pdf-status')).toContainText(
    'Queued',
  );
  expect(retryPosts).toBe(1);
  unlinkSync(collisionPath);
  processVariant(spanishId);
  expect(variantState(spanishId)).toMatchObject({ status: 'ready', current_attempt_number: 2 });

  // The browser still shows a ready Portuguese link when the disposable backing file is lost.
  // The backend must quarantine the manifest and return a typed conflict, never stale bytes.
  const portugueseId = await requestLocale(page, 'pt');
  processVariant(portugueseId);
  expect(variantState(portugueseId)).toMatchObject({ status: 'ready' });
  await panel.getByRole('button', { name: 'Refresh' }).first().click();
  const readyDownload = panel.locator(
    '.localized-pdf-request-controls a.localized-pdf-primary-action',
  );
  await expect(readyDownload).toBeVisible();
  const readyPath = join(
    readE2EFixturePointer().documentRoot,
    variantState(portugueseId).storage_key,
  );
  unlinkSync(readyPath);
  const rejectedDownload = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith(`/api/localized-pdf/${portugueseId}/download`),
  );
  await readyDownload.click();
  const downloadResponse = await rejectedDownload;
  expect(downloadResponse.status()).toBe(409);
  const downloadBody = (await downloadResponse.json()) as {
    code: string;
    messageKey: string;
    remedies: Array<{ id: string }>;
  };
  expect(downloadBody.code).toBe('PDF_DOWNLOAD_INTEGRITY');
  expect(downloadBody.messageKey).toBe('problem.localizedPdf.downloadIntegrity');
  expect(downloadBody.remedies.map((item) => item.id)).toContain('refresh_pdf_status');
  const integrityNotice = panel.locator('[data-problem-code="PDF_DOWNLOAD_INTEGRITY"]');
  await expect(integrityNotice).toBeVisible();
  await expect(integrityNotice).toContainText('failed its integrity check');
  await expect(integrityNotice).toContainText('Status: Failed');
  await expect(integrityNotice).toContainText('Review this document');
  await expect(integrityNotice).toBeFocused();
  await expect(panel.locator('.localized-pdf-selected .localized-pdf-status')).toContainText(
    'Failed',
  );
  await expect(
    panel.locator('.localized-pdf-request-controls a.localized-pdf-primary-action'),
  ).toHaveCount(0);
  expect(variantState(portugueseId)).toMatchObject({ status: 'failed', integrity_blocked: 1 });
  const incidents = withDatabase(
    (sqlite) =>
      (
        sqlite
          .prepare(
            'SELECT count(*) AS count FROM localized_pdf_integrity_incident WHERE variant_id=?',
          )
          .get(portugueseId) as { count: number }
      ).count,
  );
  expect(incidents).toBe(1);
  const integrityVisible = await integrityNotice.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= innerHeight;
  });
  expect(integrityVisible).toBe(true);
  const integrityText = (await integrityNotice.innerText()).slice(0, 350);
  await integrityNotice.screenshot({ path: join(evidenceDir, `${label}-download-conflict.png`) });
  expect(pageErrors).toEqual([]);
  expect(
    httpErrors.filter(
      ({ status, path }) =>
        !(status === 503 && path === '/j-aautomation/app/api/offline/identity') &&
        !(status === 409 && path.endsWith(`/api/localized-pdf/${portugueseId}/download`)),
    ),
  ).toEqual([]);
  writeFileSync(
    join(evidenceDir, `${label}.json`),
    JSON.stringify(
      {
        viewport: label,
        ownerType: 'daily_report',
        requestedLocales: ['es', 'pt'],
        lostGenerate: {
          persistedStatus: persistedGenerateStatus,
          browserGeneratePosts: generatePosts,
          statusAfterReconciliation: 'queued',
        },
        lostRetry: {
          persistedStatus: persistedRetryStatus,
          browserRetryPosts: retryPosts,
          retryDecisions: retryDecisionCount(spanishId),
          attempt: variantState(spanishId).current_attempt_number,
          uncertainCode: 'LOCALIZED_PDF_RETRY_UNCERTAIN',
          visibleText: uncertainText,
          noticeFocused: true,
          noticeVisible: uncertainVisible,
          statusAfterRefresh: 'queued',
        },
        staleReadyDownload: {
          responseStatus: downloadResponse.status(),
          code: downloadBody.code,
          visibleText: integrityText,
          currentStatus: variantState(portugueseId).status,
          integrityIncidents: incidents,
          noticeFocused: true,
          noticeVisible: integrityVisible,
        },
        pageErrors: pageErrors.length,
        consoleErrorCount: consoleErrors.length,
        consoleErrorKinds: consoleErrors.map((message) =>
          message.replace(/https?:\/\/\S+/gu, '<url>').slice(0, 120),
        ),
        unexpectedHttpErrors: [],
      },
      null,
      2,
    ) + '\n',
  );
});

test('an older ready PDF does not resolve an uncertain newer Generate request', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const label = info.project.name === 'phone-390' ? 'phone-390' : 'desktop-1440';
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const reportId = withDatabase((sqlite) => {
    const report = sqlite
      .prepare('SELECT id FROM daily_report ORDER BY id LIMIT 1 OFFSET ?')
      .get(info.project.name === 'phone-390' ? 2 : 3) as { id: string } | undefined;
    if (!report) throw new Error('Disposable daily report fixture is required');
    return report.id;
  });
  settleSeedJobs();
  await signIn(page, 'owner');
  await page.goto(portal(`/reports/${reportId}?lang=en`));
  const panel = page.locator('[data-localized-pdf-panel]');
  await expect(panel).toBeVisible();
  const oldId = await requestLocale(page, 'en');
  processVariant(oldId);
  await panel.getByRole('button', { name: 'Refresh' }).first().click();
  await expect(panel.locator('.localized-pdf-selected .localized-pdf-status')).toContainText(
    'Ready',
  );
  const collectionUrl = portal(
    `/api/localized-pdf?ownerType=daily_report&ownerId=${encodeURIComponent(reportId)}`,
  );
  const oldCollection = await page.request.get(collectionUrl);
  expect(oldCollection.status()).toBe(200);
  const oldBody = await oldCollection.json();

  // Another editor changes the disposable source after the old PDF was made ready.
  withDatabase((sqlite) =>
    sqlite
      .prepare(
        "UPDATE daily_report SET summary=summary || ' QA revised',version=version+1,updated_at=? WHERE id=?",
      )
      .run(new Date().toISOString(), reportId),
  );
  let generatePosts = 0;
  let persistedStatus = 0;
  let newId = '';
  let serveOldCollection = false;
  await page.route('**/api/localized-pdf?*', async (route) => {
    if (!serveOldCollection) return route.continue();
    serveOldCollection = false;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(oldBody),
    });
  });
  await page.route('**/api/localized-pdf', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    generatePosts += 1;
    const persisted = await route.fetch();
    persistedStatus = persisted.status();
    const body = (await persisted.json()) as { variant: { variantId: string } };
    newId = body.variant.variantId;
    serveOldCollection = true;
    await route.abort('failed');
  });
  await panel.getByRole('button', { name: 'Generate report' }).click();
  const uncertain = panel.locator('[data-problem-code="LOCALIZED_PDF_REQUEST_UNCERTAIN"]');
  await expect(uncertain).toBeVisible();
  await expect(uncertain).toContainText('could not confirm whether PDF generation started');
  await expect(uncertain).toContainText('Refresh its status');
  await expect(uncertain).not.toContainText('Status: Ready');
  await expect(uncertain).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Generate report' })).toBeDisabled();
  expect(persistedStatus).toBe(202);
  expect(generatePosts).toBe(1);
  expect(newId).not.toBe(oldId);
  expect(variantState(oldId).status).toBe('ready');
  expect(variantState(newId).status).toBe('queued');
  const visible = await uncertain.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= innerHeight;
  });
  expect(visible).toBe(true);
  const uncertainText = (await uncertain.innerText()).slice(0, 350);
  const evidence = resolve('docs/evidence/error-warning-candidate/localized-pdf-recheck');
  mkdirSync(evidence, { recursive: true });
  await uncertain.screenshot({ path: join(evidence, `${label}-old-ready-uncertain.png`) });
  await panel.getByRole('button', { name: 'Refresh' }).last().click();
  await expect(uncertain).toHaveCount(0);
  await expect(panel.locator('.localized-pdf-selected .localized-pdf-status')).toContainText(
    'Queued',
  );
  expect(generatePosts).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) =>
        !/^Failed to load resource: (?:net::ERR_FAILED|the server responded with a status of 503 \(Service Unavailable\))$/u.test(
          message,
        ),
    ),
  ).toEqual([]);
  writeFileSync(
    join(evidence, `${label}-old-ready.json`),
    JSON.stringify(
      {
        viewport: label,
        persistedStatus,
        generationPosts: generatePosts,
        oldVariantStatus: variantState(oldId).status,
        newVariantStatus: variantState(newId).status,
        uncertainCode: 'LOCALIZED_PDF_REQUEST_UNCERTAIN',
        visibleText: uncertainText,
        noticeFocused: true,
        noticeVisible: visible,
        staleReadyStatusShown: uncertainText.includes('Status: Ready'),
        statusAfterRefresh: 'queued',
        pageErrors: pageErrors.length,
        consoleErrorCount: consoleErrors.length,
      },
      null,
      2,
    ) + '\n',
  );
});

test('lost PDF Generate responses surface typed sign-in and access recheck problems', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const label = info.project.name === 'phone-390' ? 'phone-390' : 'desktop-1440';
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const reportId = withDatabase((sqlite) => {
    const report = sqlite
      .prepare('SELECT id FROM daily_report ORDER BY id LIMIT 1 OFFSET ?')
      .get(info.project.name === 'phone-390' ? 4 : 5) as { id: string } | undefined;
    if (!report) throw new Error('Disposable daily report fixture is required');
    return report.id;
  });
  await signIn(page, 'owner');
  await page.goto(portal(`/reports/${reportId}?lang=en`));
  const panel = page.locator('[data-localized-pdf-panel]');
  await expect(panel).toBeVisible();

  // Source the problem envelopes from the real API, then route those exact responses into
  // the browser's post-loss status check without changing its authenticated fixture account.
  const anonymous = await apiRequest.newContext();
  let signInBody: Record<string, unknown>;
  try {
    const response = await anonymous.get(
      portal(`/api/localized-pdf?ownerType=daily_report&ownerId=${encodeURIComponent(reportId)}`),
    );
    expect(response.status()).toBe(401);
    signInBody = (await response.json()) as Record<string, unknown>;
    expect(signInBody.code).toBe('PDF_SIGN_IN_REQUIRED');
  } finally {
    await anonymous.dispose();
  }
  const unavailable = await page.request.get(
    portal('/api/localized-pdf?ownerType=daily_report&ownerId=missing-qa-report'),
  );
  expect(unavailable.status()).toBe(404);
  const unavailableBody = (await unavailable.json()) as Record<string, unknown>;
  expect(unavailableBody.code).toBe('PDF_DOWNLOAD_UNAVAILABLE');

  let recheckStatus: 401 | 404 = 401;
  let generatePosts = 0;
  const acceptedStatuses: number[] = [];
  await page.route('**/api/localized-pdf?*', async (route) =>
    route.fulfill({
      status: recheckStatus,
      contentType: 'application/json',
      body: JSON.stringify(recheckStatus === 401 ? signInBody : unavailableBody),
    }),
  );
  await page.route('**/api/localized-pdf', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    generatePosts += 1;
    const persisted = await route.fetch();
    acceptedStatuses.push(persisted.status());
    await route.abort('failed');
  });

  await panel.locator('select').selectOption('en');
  await panel.getByRole('button', { name: 'Generate report' }).click();
  const signInNotice = panel.locator('[data-problem-code="PDF_SIGN_IN_REQUIRED"]');
  await expect(signInNotice).toBeVisible();
  await expect(signInNotice).toContainText('Sign in again');
  await expect(signInNotice.getByRole('link', { name: /Sign in again/u })).toHaveAttribute(
    'href',
    /\/app\/login$/u,
  );
  await expect(signInNotice).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Generate report' })).toBeDisabled();
  expect(generatePosts).toBe(1);

  recheckStatus = 404;
  await panel.locator('select').selectOption('es');
  await panel.getByRole('button', { name: 'Generate report' }).click();
  const accessNotice = panel.locator('[data-problem-code="PDF_DOWNLOAD_UNAVAILABLE"]');
  await expect(accessNotice).toBeVisible();
  await expect(accessNotice).toContainText('unavailable or your access changed');
  await expect(accessNotice).toContainText('Refresh');
  await expect(accessNotice).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Generate report' })).toBeDisabled();
  expect(generatePosts).toBe(2);
  expect(acceptedStatuses).toEqual([202, 202]);
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) =>
        !/^Failed to load resource: (?:net::ERR_FAILED|the server responded with a status of (?:401 \(Unauthorized\)|404 \(Not Found\)|503 \(Service Unavailable\)))$/u.test(
          message,
        ),
    ),
  ).toEqual([]);
  const evidence = resolve('docs/evidence/error-warning-candidate/localized-pdf-recheck');
  mkdirSync(evidence, { recursive: true });
  await accessNotice.screenshot({ path: join(evidence, `${label}-access-recheck.png`) });
  writeFileSync(
    join(evidence, `${label}-typed-rechecks.json`),
    JSON.stringify(
      {
        viewport: label,
        persistedGenerateStatuses: acceptedStatuses,
        browserGeneratePosts: generatePosts,
        signInRecheck: { status: 401, code: signInBody.code, remedy: 'sign_in_again' },
        accessRecheck: { status: 404, code: unavailableBody.code, remedy: 'refresh_pdf_status' },
        noticesFocused: true,
        duplicatePost: false,
        recheckBodies: 'real API responses routed to browser after simulated lost POST',
        pageErrors: pageErrors.length,
        consoleErrorCount: consoleErrors.length,
      },
      null,
      2,
    ) + '\n',
  );
});
