import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { portal, signIn } from './auth.js';

const evidenceRoot = resolve('docs/evidence/error-warning-export-qa');

test('My Pay artifact UI, premature retry, and role boundaries in Chromium', async ({ page }) => {
  const width = page.viewportSize()?.width;
  const label = width === 390 ? 'phone-390' : width === 1440 ? 'desktop-1440' : null;
  test.skip(!label, 'The focused export QA matrix uses phone and desktop.');
  test.setTimeout(120_000);
  mkdirSync(evidenceRoot, { recursive: true });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ method: string; path: string; status: number }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 500)
      failedResponses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });

  await signIn(page, 'worker');
  const payResponse = await page.goto(portal('/pay?start=2026-08-01&end=2026-08-31'));
  expect(payResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Worker statement' })).toBeVisible();
  const requestPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/worker-statement') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Generate report' }).click();
  const requestResponse = await requestPromise;
  expect(requestResponse.status()).toBe(202);
  const requested = (await requestResponse.json()) as {
    artifacts?: Array<{ artifactId: string; format: string; status: string }>;
  };
  const pdf = requested.artifacts?.find((artifact) => artifact.format === 'pdf');
  expect(pdf?.artifactId).toBeTruthy();
  await expect(page.getByText(/PDF · (Queued|Running|Ready)/i)).toBeVisible();
  const initialBadge = await page.locator('.pay-export-actions').innerText();
  await page
    .locator('.pay-export-actions')
    .screenshot({ path: resolve(evidenceRoot, `${label}-worker-queued.png`) });

  const retry = await page.request.post(
    portal(`/api/worker-statement/artifacts/${encodeURIComponent(pdf!.artifactId)}/retry`),
    { headers: { origin: new URL(page.url()).origin, referer: page.url() } },
  );
  expect(retry.status()).toBe(409);
  const retryPayload = (await retry.json()) as Record<string, unknown>;
  expect(retryPayload).toMatchObject({
    code: 'WORKER_STATEMENT_RETRY_NOT_FAILED',
    messageKey: 'problem.workerStatement.retryNotFailed',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'check_statement_status' }],
  });
  expect(retryPayload.correlationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  const invalid = await page.request.post(portal('/api/worker-statement'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { periodStart: '2026-08-31', periodEnd: '2026-08-01' },
  });
  expect(invalid.status()).toBe(400);
  const invalidPayload = (await invalid.json()) as Record<string, unknown>;
  expect(invalidPayload).toMatchObject({
    code: 'WORKER_STATEMENT_PERIOD_INVALID',
    messageKey: 'problem.workerStatement.periodInvalid',
    params: {},
    fieldErrors: {
      periodStart: ['Choose a valid start date.'],
      periodEnd: ['Choose a valid end date on or after the start date.'],
    },
    remedies: [{ id: 'review_my_pay' }],
  });
  const queuedDetail = await page.request.get(
    portal(`/api/worker-statement/artifacts/${encodeURIComponent(pdf!.artifactId)}`),
  );
  expect(queuedDetail.status()).toBe(200);

  await page.context().clearCookies();
  await signIn(page, 'worker2');
  const malformedDownload = await page.request.get(
    portal('/api/worker-statement/artifacts/not-a-valid-artifact-id/download'),
  );
  expect(malformedDownload.status()).toBe(404);
  const malformedPayload = (await malformedDownload.json()) as Record<string, unknown>;
  expect(malformedPayload).toMatchObject({
    code: 'WORKER_STATEMENT_NOT_FOUND',
    messageKey: 'problem.workerStatement.notFound',
  });
  const otherWorkerDownload = await page.request.get(
    portal(`/api/worker-statement/artifacts/${encodeURIComponent(pdf!.artifactId)}/download`),
  );
  expect(otherWorkerDownload.status()).toBe(404);
  await page.context().clearCookies();
  await signIn(page, 'owner');
  const ownerList = await page.request.get(portal('/api/worker-statement'));
  expect(ownerList.status()).toBe(403);
  await page.context().clearCookies();
  await signIn(page, 'finance');
  const financeList = await page.request.get(portal('/api/worker-statement'));
  expect(financeList.status()).toBe(403);

  const observation = {
    viewport: label,
    requestStatus: requestResponse.status(),
    artifactStates: requested.artifacts?.map(({ format, status }) => ({ format, status })),
    initialBadge: initialBadge.slice(0, 240),
    queuedDetailStatus: queuedDetail.status(),
    prematureRetryStatus: retry.status(),
    prematureRetryHasTypedCode: typeof retryPayload.code === 'string',
    invalidPeriodStatus: invalid.status(),
    invalidPeriodHasTypedCode: typeof invalidPayload.code === 'string',
    otherWorkerDownloadStatus: otherWorkerDownload.status(),
    malformedDownloadStatus: malformedDownload.status(),
    ownerListStatus: ownerList.status(),
    financeListStatus: financeList.status(),
    pageErrors,
    failedResponses,
    consoleErrorCount: consoleErrors.length,
    consoleErrorExamples: consoleErrors
      .slice(0, 5)
      .map((message) => message.replace(/https?:\/\/\S+/gu, '<url>').slice(0, 180)),
    pageHorizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  };
  writeFileSync(
    resolve(evidenceRoot, `${label}-worker-statement.json`),
    JSON.stringify(observation, null, 2) + '\n',
  );
  expect(pageErrors).toEqual([]);
});
