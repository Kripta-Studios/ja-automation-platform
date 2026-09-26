import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase, V3Repository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { scannerOwnerEmail } from './scanner-global-setup.js';

const origin = 'https://qa.test:4185';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-period-report-detail');

type CustomerReport = {
  id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  state: string;
  pdf_storage_key: string | null;
};

function customerReport(): CustomerReport {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const report = db.sqlite
      .prepare(
        `SELECT id,project_id,period_start,period_end,state,pdf_storage_key
           FROM period_report WHERE audience='customer'
           ORDER BY created_at,id LIMIT 1`,
      )
      .get() as CustomerReport | undefined;
    if (!report) throw new Error('Disposable fixture needs a customer period report');
    return report;
  } finally {
    db.sqlite.close();
  }
}

function currentCustomerReport(original: CustomerReport): CustomerReport {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const report = db.sqlite
      .prepare(
        `SELECT id,project_id,period_start,period_end,state,pdf_storage_key
           FROM period_report
          WHERE project_id=? AND period_start=? AND period_end=? AND audience='customer'
          ORDER BY created_at DESC,id DESC LIMIT 1`,
      )
      .get(original.project_id, original.period_start, original.period_end) as
      | CustomerReport
      | undefined;
    if (!report) throw new Error('Customer report refresh did not leave a report');
    return report;
  } finally {
    db.sqlite.close();
  }
}

function runDisposableArtifactWorker(): void {
  const fixture = readE2EFixturePointer();
  const previousRoot = process.env.JA_DOCUMENT_ROOT;
  process.env.JA_DOCUMENT_ROOT = fixture.documentRoot;
  try {
    const db = createDatabase(fixture.databasePath);
    try {
      const result = runArtifactJobs({
        documentRoot: fixture.documentRoot,
        repository: { createInvoiceDraftFromJob: () => undefined },
        v3: new V3Repository(db.sqlite),
      });
      expect(result.failed).toBe(0);
    } finally {
      db.sqlite.close();
    }
  } finally {
    if (previousRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previousRoot;
  }
}

function documentState(id: string) {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return db.sqlite
      .prepare('SELECT state,scan_status,artifact_type FROM document WHERE id=?')
      .get(id) as { state: string; scan_status: string; artifact_type: string } | undefined;
  } finally {
    db.sqlite.close();
  }
}

function simulateCompletedScan(id: string): void {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const now = new Date().toISOString();
    const changed = db.sqlite
      .prepare(
        `UPDATE document
            SET state='committed',scan_status='clean',scanned_at=?,scan_provider='e2e-fixture',
                updated_at=?,version=version+1
          WHERE id=? AND state='quarantined' AND scan_status='pending'`,
      )
      .run(now, now, id);
    expect(changed.changes).toBe(1);
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(scannerOwnerEmail);
  await page.getByLabel('Password').fill(e2eCredentials.owner.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

test('pending customer sign-off scan survives reload and retries without another upload', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(180_000);
  const steps: Array<Record<string, string | number | boolean>> = [];
  const responses: Array<{ status: number; path: string }> = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.request().method() === 'POST')
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  await signIn(page);
  const original = customerReport();
  const initialUrl = portal(`/reports/period/${original.id}`);
  await page.goto(`${initialUrl}?lang=en`);
  const refreshStatus = await page.evaluate(
    async ({ projectId, periodStart, periodEnd }) => {
      const response = await fetch('?/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        body: new URLSearchParams({
          projectId,
          periodStart,
          periodEnd,
          reportLocale: 'en',
        }),
      });
      return response.status;
    },
    {
      projectId: original.project_id,
      periodStart: original.period_start,
      periodEnd: original.period_end,
    },
  );
  expect(refreshStatus).toBe(200);
  runDisposableArtifactWorker();
  const report = currentCustomerReport(original);
  expect(report.pdf_storage_key).toBeTruthy();
  const fixture = readE2EFixturePointer();
  const pdf = readFileSync(resolve(fixture.documentRoot, ...report.pdf_storage_key!.split('/')));
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  const reportUrl = portal(`/reports/period/${report.id}?lang=en`);
  await page.goto(reportUrl);
  const approval = page.locator('form[data-period-report-approval]');
  if (await approval.count()) {
    await approval.getByRole('button', { name: 'Approve customer report' }).click();
    await expect(page.locator('[data-report-lifecycle-state]')).toHaveAttribute(
      'data-report-lifecycle-state',
      /approved|final/,
    );
  }
  let form = page.locator('form[data-signoff-form]');
  await expect(form).toBeVisible();
  await form.locator('[name="signerName"]').fill('Disposable customer signer');
  await form.locator('[name="signerIdentity"]').fill('signer@example.test');
  await form.locator('[name="signatureDate"]').fill(new Date().toISOString().slice(0, 10));
  await form.locator('[name="signatureFile"]').setInputFiles({
    name: 'disposable-signed-copy.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const pendingResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('?/sign'),
  );
  await form.getByRole('button', { name: 'Record verified signed-copy evidence' }).click();
  const pendingTransport = await pendingResponse;
  expect(pendingTransport.status()).toBe(200);
  const pendingBody = JSON.stringify(await pendingTransport.json());
  expect(pendingBody).toContain('PERIOD_SIGNOFF_SCAN_PENDING');
  expect(pendingBody).toContain('409');
  const notice = page.locator('[data-period-problem] [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'PERIOD_SIGNOFF_SCAN_PENDING');
  await expect(notice).toBeFocused();
  form = page.locator('form[data-signoff-form]');
  const pendingId = await form.locator('[name="pendingSignatureDocumentId"]').inputValue();
  expect(pendingId).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(form.locator('[name="signatureFile"]')).toBeDisabled();
  await expect(form.locator('[name="signerName"]')).toHaveValue('Disposable customer signer');
  await expect(form.locator('[data-signoff-scan-pending]')).toBeVisible();
  expect(documentState(pendingId)).toEqual({
    state: 'quarantined',
    scan_status: 'pending',
    artifact_type: 'customer_signoff_evidence',
  });
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect.soft(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
  steps.push({
    step: 'scan-pending',
    code: 'PERIOD_SIGNOFF_SCAN_PENDING',
    retained: true,
    scrollBefore,
    scrollAfter,
  });
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `scan-${info.project.name}-pending.png`),
    await notice.screenshot(),
  );

  await page.reload();
  form = page.locator('form[data-signoff-form]');
  await expect(form.locator('[name="pendingSignatureDocumentId"]')).toHaveValue(pendingId);
  await expect(form.locator('[name="signatureFile"]')).toBeDisabled();
  await expect(form.locator('[data-signoff-scan-pending]')).toBeVisible();
  steps.push({ step: 'reload-pending', sameEvidenceId: true, fileUploadDisabled: true });

  // A fixture-only state transition models the authorized scanner completion;
  // scanner-job authorization itself is covered by repository tests.
  simulateCompletedScan(pendingId);
  await form.locator('[name="signerName"]').fill('Disposable customer signer');
  await form.locator('[name="signerIdentity"]').fill('signer@example.test');
  await form.locator('[name="signatureDate"]').fill(new Date().toISOString().slice(0, 10));
  const retryResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('?/sign'),
  );
  await form.getByRole('button', { name: 'Retry after security scan' }).click();
  expect((await retryResponse).status()).toBe(200);
  await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
    'data-signoff-state',
    'signed',
  );
  steps.push({ step: 'retry-after-fixture-scan', sameEvidenceId: true, signed: true });
  writeFileSync(
    join(evidenceDirectory, `scan-${info.project.name}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `scan-${info.project.name}-network.json`),
    `${JSON.stringify(responses, null, 2)}\n`,
  );
  expect(errors).toEqual([]);
});
