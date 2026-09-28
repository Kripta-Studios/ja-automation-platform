import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase, V3Repository, WorkerStatementRepository } from '@ja/database';
import { runArtifactJobs, runWorkerStatementArtifactJob } from '@ja/reporting';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

const evidenceRoot = resolve('docs/evidence/error-warning-export-qa');

function finishSeedFixtureJobs(): void {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const finance = database.sqlite
      .prepare("SELECT id FROM user WHERE email=? AND status='active'")
      .get(e2eCredentials.finance.email) as { id: string } | undefined;
    expect(finance?.id).toBeTruthy();
    const v3 = new V3Repository(database.sqlite);
    runArtifactJobs({
      principal: {
        userId: finance!.id,
        role: 'finance_admin',
        projectIds: new Set<string>(),
      },
      documentRoot: fixture.documentRoot,
      repository: { createInvoiceDraft: () => undefined },
      v3,
    });
    const due = database.sqlite
      .prepare(
        "SELECT count(*) count FROM job WHERE contract_version='b5-v1' AND state='queued' AND run_after<=?",
      )
      .get(new Date().toISOString()) as { count: number };
    expect(due.count, 'seed jobs must be settled by the real artifact worker').toBe(0);
  } finally {
    database.sqlite.close();
  }
}

function failDueStatementPdf(
  artifactId: string,
  limit: number,
): {
  status: string;
  retryable: number;
  current_attempt_number: number;
  max_attempts: number;
} {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const statements = new WorkerStatementRepository(database.sqlite, {
      verify: (storageKey, expected) => {
        try {
          const bytes = readFileSync(resolve(fixture.documentRoot, storageKey));
          const mediaType = expected?.mediaType ?? 'text/csv';
          return {
            exists: true,
            byteLength: bytes.byteLength,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            mediaType,
            magicValid:
              mediaType === 'application/pdf'
                ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
                  bytes.includes(Buffer.from('%%EOF'))
                : !bytes.includes(0),
          };
        } catch {
          return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
        }
      },
    });
    new V3Repository(database.sqlite).runDueJobs(limit, {
      worker_statement_artifact_render: (jobPayload, execution) => {
        const currentId = (jobPayload as { artifactId: string }).artifactId;
        const result = runWorkerStatementArtifactJob({
          repository: statements,
          payload: jobPayload,
          execution: {
            jobId: execution.jobId,
            jobRunId: execution.runId,
            leaseFence: execution.fenceVersion,
          },
          documentRoot: fixture.documentRoot,
          ...(currentId === artifactId
            ? {
                publish: () => {
                  throw new Error('DISPOSABLE_WORKER_STATEMENT_PUBLISH_FAILURE');
                },
              }
            : {}),
          deferCompletion: true,
        });
        if (!result.finalize) throw new Error('Worker statement finalizer missing');
        return result.finalize;
      },
    });
    return database.sqlite
      .prepare(
        'SELECT status,retryable,current_attempt_number,max_attempts FROM worker_statement_artifact WHERE artifact_id=?',
      )
      .get(artifactId) as {
      status: string;
      retryable: number;
      current_attempt_number: number;
      max_attempts: number;
    };
  } finally {
    database.sqlite.close();
  }
}

test('My Pay explains a failed artifact and retries only the same artifact', async ({
  page,
}, info) => {
  test.skip(
    !['phone-390', 'desktop'].includes(info.project.name),
    'Focused retry evidence uses 390 and 1440 px.',
  );
  test.setTimeout(90_000);
  const label = info.project.name === 'phone-390' ? 'phone-390' : 'desktop-1440';
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
  finishSeedFixtureJobs();
  await signIn(page, 'worker');
  const month = info.project.name === 'phone-390' ? '04' : '05';
  await page.goto(portal(`/pay?start=2026-${month}-01&end=2026-${month}-28`));
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/worker-statement') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Generate report' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const requested = (await response.json()) as {
    artifacts: Array<{ artifactId: string; format: string }>;
    jobs: Array<{ artifactId: string; id: string | null }>;
  };
  const pdf = requested.artifacts.find((artifact) => artifact.format === 'pdf');
  expect(pdf?.artifactId).toBeTruthy();

  // Run the real durable worker with a failure at the test-owned PDF publish boundary. This
  // creates a fenced failed attempt and retry decision without bypassing database guards.
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const ownJobIds = new Set(requested.jobs.map((job) => job.id).filter(Boolean));
    const dueJobs = database.sqlite
      .prepare(
        `SELECT id FROM job
          WHERE contract_version='b5-v1' AND state='queued' AND run_after<=?
          ORDER BY run_after,id`,
      )
      .all(new Date().toISOString()) as Array<{ id: string }>;
    expect(dueJobs).toHaveLength(2);
    expect(dueJobs.every((job) => ownJobIds.has(job.id))).toBe(true);
    const statements = new WorkerStatementRepository(database.sqlite, {
      verify: (storageKey, expected) => {
        try {
          const bytes = readFileSync(resolve(fixture.documentRoot, storageKey));
          const mediaType = expected?.mediaType ?? 'text/csv';
          return {
            exists: true,
            byteLength: bytes.byteLength,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            mediaType,
            magicValid:
              mediaType === 'application/pdf'
                ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
                  bytes.includes(Buffer.from('%%EOF'))
                : !bytes.includes(0),
          };
        } catch {
          return { exists: false, byteLength: null, contentSha256: null, magicValid: false };
        }
      },
    });
    const v3 = new V3Repository(database.sqlite);
    v3.runDueJobs(2, {
      worker_statement_artifact_render: (jobPayload, execution) => {
        const artifactId = (jobPayload as { artifactId: string }).artifactId;
        const result = runWorkerStatementArtifactJob({
          repository: statements,
          payload: jobPayload,
          execution: {
            jobId: execution.jobId,
            jobRunId: execution.runId,
            leaseFence: execution.fenceVersion,
          },
          documentRoot: fixture.documentRoot,
          ...(artifactId === pdf!.artifactId
            ? {
                publish: () => {
                  throw new Error('DISPOSABLE_WORKER_STATEMENT_PUBLISH_FAILURE');
                },
              }
            : {}),
          deferCompletion: true,
        });
        if (!result.finalize) throw new Error('Worker statement finalizer missing');
        return result.finalize;
      },
    });
    const failed = database.sqlite
      .prepare(
        'SELECT status,error_code,retryable FROM worker_statement_artifact WHERE artifact_id=?',
      )
      .get(pdf!.artifactId) as { status: string; error_code: string | null; retryable: number };
    expect(failed).toMatchObject({
      status: 'failed',
      error_code: 'WORKER_STATEMENT_RENDER_FAILED',
      retryable: 1,
    });
  } finally {
    database.sqlite.close();
  }

  await page.reload();
  const notice = page.locator('.pay-export-actions [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'WORKER_STATEMENT_RENDER_FAILED');
  await expect(notice).not.toContainText('WORKER_STATEMENT_RENDER_FAILED');
  await expect(notice).toContainText('The statement could not be rendered.');
  await expect(notice).toBeFocused();
  const noticeVisible = await notice.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return rectangle.top >= 0 && rectangle.bottom <= innerHeight;
  });
  expect(noticeVisible, 'focused failure notice should be visible in the viewport').toBe(true);
  const failedNoticeText = (await notice.innerText()).slice(0, 400);
  await notice.screenshot({
    path: resolve(evidenceRoot, `${label}-worker-failed-notice-postfix.png`),
  });
  const failedDownload = await page.request.get(
    portal(`/api/worker-statement/artifacts/${pdf!.artifactId}/download`),
  );
  expect(failedDownload.status()).toBe(409);
  const failedDownloadPayload = (await failedDownload.json()) as Record<string, unknown>;
  expect(failedDownloadPayload).toMatchObject({
    code: 'WORKER_STATEMENT_RENDER_FAILED',
    messageKey: 'problem.workerStatement.renderFailed',
    remedies: [{ id: 'retry_statement' }],
  });
  const retryButton = page.getByRole('button', { name: /Retry statement PDF/u });
  await expect(retryButton).toBeVisible();
  await retryButton.scrollIntoViewIfNeeded();
  const scrollBeforeRetry = await page.evaluate(() => window.scrollY);
  const retryResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(`/api/worker-statement/artifacts/${pdf!.artifactId}/retry`) &&
      candidate.request().method() === 'POST',
  );
  await retryButton.click();
  const retried = await retryResponse;
  expect(retried.status()).toBe(202);
  const payload = (await retried.json()) as {
    artifact: { artifactId: string; status: string; currentAttemptNumber: number };
  };
  expect(payload.artifact).toMatchObject({
    artifactId: pdf!.artifactId,
    status: 'queued',
    currentAttemptNumber: 2,
  });
  await expect(page.getByText(/PDF · Queued/u)).toBeVisible();
  const scrollAfterRetry = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterRetry - scrollBeforeRetry)).toBeLessThan(150);
  expect(new URL(page.url()).pathname).toContain('/pay');
  expect(new URL(page.url()).searchParams.get('start')).toBe(`2026-${month}-01`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  writeFileSync(
    resolve(evidenceRoot, `${label}-worker-retry-postfix.json`),
    JSON.stringify(
      {
        viewport: label,
        failedNoticeText,
        failedNoticeFocused: true,
        failedNoticeVisible: noticeVisible,
        failedDownloadStatus: failedDownload.status(),
        failedDownloadCode: failedDownloadPayload.code,
        retryStatus: retried.status(),
        retriedArtifactStatus: payload.artifact.status,
        scrollBeforeRetry,
        scrollAfterRetry,
        failedResponses,
        pageErrors,
        consoleErrorCount: consoleErrors.length,
        consoleErrorExamples: consoleErrors
          .slice(0, 5)
          .map((message) => message.replace(/https?:\/\/\S+/gu, '<url>').slice(0, 180)),
      },
      null,
      2,
    ) + '\n',
  );
  expect(pageErrors).toEqual([]);
});

test('My Pay hides Retry after the last failed artifact attempt', async ({ page }, info) => {
  test.skip(
    !['phone-390', 'desktop'].includes(info.project.name),
    'Focused retry-limit evidence uses 390 and 1440 px.',
  );
  test.setTimeout(150_000);
  const label = info.project.name === 'phone-390' ? 'phone-390' : 'desktop-1440';
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
  finishSeedFixtureJobs();
  await signIn(page, 'worker');
  const month = info.project.name === 'phone-390' ? '10' : '11';
  await page.goto(portal(`/pay?start=2026-${month}-01&end=2026-${month}-28`));
  const requestResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/worker-statement') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Generate report' }).click();
  const requestResponse = await requestResponsePromise;
  expect(requestResponse.status()).toBe(202);
  const requested = (await requestResponse.json()) as {
    artifacts: Array<{ artifactId: string; format: string }>;
    jobs: Array<{ id: string | null }>;
  };
  const pdfId = requested.artifacts.find((artifact) => artifact.format === 'pdf')?.artifactId;
  expect(pdfId).toBeTruthy();
  const first = failDueStatementPdf(pdfId!, 2);
  expect(first).toMatchObject({
    status: 'failed',
    retryable: 1,
    current_attempt_number: 1,
    max_attempts: 5,
  });
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    await page.reload();
    const retry = page.getByRole('button', { name: /Retry statement PDF/u });
    await expect(retry).toBeVisible();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/worker-statement/artifacts/${pdfId}/retry`) &&
        response.request().method() === 'POST',
    );
    await retry.click();
    const response = await responsePromise;
    expect(response.status()).toBe(202);
    const failed = failDueStatementPdf(pdfId!, 1);
    expect(failed).toMatchObject({
      status: 'failed',
      // The cause remains retryable; the separate attempt limit blocks attempt 6.
      retryable: 1,
      current_attempt_number: attempt,
      max_attempts: 5,
    });
  }
  await page.reload();
  const row = page.locator('.pay-export-actions');
  await expect(row.getByRole('button', { name: /Retry statement PDF/u })).toHaveCount(0);
  const notice = row.locator('[data-ui="problem-notice"]');
  await expect(notice).toContainText('contact the owner or finance team');
  await notice.screenshot({
    path: resolve(evidenceRoot, `${label}-worker-retry-limit-notice-postfix.png`),
  });
  const denied = await page.request.post(portal(`/api/worker-statement/artifacts/${pdfId}/retry`), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
  });
  expect(denied.status()).toBe(409);
  const deniedPayload = (await denied.json()) as Record<string, unknown>;
  expect(deniedPayload).toMatchObject({
    code: 'WORKER_STATEMENT_RETRY_LIMIT',
    messageKey: 'problem.workerStatement.retryLimit',
    remedies: [{ id: 'contact_finance_owner' }],
  });
  writeFileSync(
    resolve(evidenceRoot, `${label}-worker-retry-limit-postfix.json`),
    JSON.stringify(
      {
        viewport: label,
        attemptCount: 5,
        retryControlVisibleAtLimit: false,
        deniedStatus: denied.status(),
        deniedCode: deniedPayload.code,
        pageErrors,
        failedResponses,
        consoleErrorCount: consoleErrors.length,
        consoleErrorExamples: consoleErrors
          .slice(0, 5)
          .map((message) => message.replace(/https?:\/\/\S+/gu, '<url>').slice(0, 180)),
      },
      null,
      2,
    ) + '\n',
  );
  expect(pageErrors).toEqual([]);
});
