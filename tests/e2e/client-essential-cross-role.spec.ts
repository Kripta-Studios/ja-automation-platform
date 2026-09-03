import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase, V3Repository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

/**
 * Canonical Client Essential browser evidence.
 *
 * This suite intentionally uses the current accessible contracts rather than
 * implementation classes.  It is a cross-role smoke of the implemented
 * vertical slices; the broader responsive, keyboard and accessibility suites
 * remain the detailed geometry/evidence owners.
 */

const forbiddenCommercialControlPattern =
  /(?:client(?:rate|billing|treatment)|billing(?:rate|treatment)|tax(?:profile|bps|rate|amount)|internal(?:cost|rate)|contribution|margin|markup|overtime(?:rate|multiplier|threshold)|travel(?:billable|billing))/i;

const forbiddenSerializedFinanceKeyPattern =
  /"(?:client(?:_rate|_treatment)|clientRate|clientTreatment|billing(?:_treatment|_rate)|billingTreatment|tax(?:_profile|_bps|_rate|_amount)|taxProfile|taxBps|internal(?:_cost|_rate)|internalCost|contribution(?:_margin)?|margin|markup(?:_bps)?|overtime(?:_threshold|_rate|_multiplier)|overtimeThreshold|travel(?:_billable|_billing)|travelBillable)"\s*:/i;

const forbiddenRenderedFinanceLabelPattern =
  /(?:client rate|client billing|client treatment|tax profile|internal cost|contribution(?: margin)?|markup|overtime threshold|travel billability)/i;

function skipUnlessProject(testInfo: { project: { name: string } }, project: string): void {
  test.skip(testInfo.project.name !== project);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match the stable visible label at the start of a tab's accessible text.
 * Counts/help copy may be appended by the surface without changing its
 * semantic label, so exact-name selectors would make this evidence brittle.
 */
function tabWithLabel(page: Page, label: string): Locator {
  return page
    .getByRole('tab')
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}(?:\\s|$)`, 'u') });
}

/**
 * Billing stage cards intentionally include a count and helper text. Anchor
 * the assertion to their dedicated label span so the test still proves the
 * correct stage control rather than relying on an exact composite name.
 */
function billingStageButton(page: Page, label: string): Locator {
  return page.locator('button.billing-section__summary-card').filter({
    has: page
      .locator('span')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'u') }),
  });
}

async function selectFirstAssignedProject(form: Locator): Promise<void> {
  const select = form.locator('select[name="projectId"]');
  await expect(select).toBeVisible();
  const optionValue = await select.locator('option').evaluateAll((options) => {
    const option = options.find((candidate) => (candidate as HTMLOptionElement).value.trim());
    return option ? (option as HTMLOptionElement).value : '';
  });
  expect(optionValue, 'the fixture must expose an assigned project option').not.toBe('');
  await select.selectOption(optionValue);
}

async function stepUpFinance(page: Page): Promise<void> {
  const response = await page.request.post(portal('/api/step-up'), {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    data: { password: e2eCredentials.finance.password },
  });
  expect(response.ok(), 'Finance mutation evidence requires a session-bound step-up').toBe(true);
}

async function switchRole(page: Page, role: 'manager' | 'worker' | 'finance'): Promise<void> {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  if (await signOut.count()) {
    await signOut.click();
    await page.waitForURL((url) => url.pathname.endsWith('/login'));
  }
  // Role transitions must not inherit a stale Better Auth cookie. The product
  // logout is still exercised above; clearing the disposable browser context
  // makes the following credential login an independent identity boundary
  // even when a navigation races the Set-Cookie deletion in WebKit/Chromium.
  await page.context().clearCookies();
  await signIn(page, role);
}

async function enableCustomerSignoffPolicy(
  page: Page,
  projectId: string,
  effectiveFrom: string,
): Promise<void> {
  await page.goto(portal('/finance?view=commercial'));
  const policyForm = page.locator('form[data-project-commercial-policy-form]');
  await expect(policyForm).toBeVisible();
  await policyForm.locator('select[name="projectId"]').selectOption(projectId);
  await policyForm.locator('input[name="effectiveFrom"]').fill(effectiveFrom);
  await policyForm.locator('input[name="overtimeThresholdMinutes"]').fill('600');
  await policyForm.locator('select[name="travelClientBillable"]').selectOption('true');
  await policyForm.locator('select[name="customerSignoffRequired"]').selectOption('true');
  await stepUpFinance(page);
  await policyForm.getByRole('button', { name: 'Save project policy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /policy/i })).toBeVisible();
  await expect(page.locator('[data-project-commercial-policy-row]').last()).toContainText(
    'Customer sign-off',
  );
}

/**
 * Enqueue the real period-report render command through the authenticated
 * refresh action. The subsequent worker helper is fixture infrastructure only;
 * no normal user action or portal endpoint can process this job.
 */
type PeriodReportRefreshJobEvidence = Readonly<{
  id: string;
  kind: string;
  state: string;
  attempts: number;
  createdAt: string;
  payloadJson: string;
  lastErrorCode: string | null;
  runStartedAt: string | null;
  runFinishedAt: string | null;
  runState: string | null;
  runOutcome: string | null;
  runErrorCode: string | null;
}>;

type BackgroundArtifactWorkerResult = Readonly<{
  processed: number;
  failed: number;
  target?: PeriodReportRefreshJobEvidence;
  failures: readonly PeriodReportRefreshJobEvidence[];
  exceptions: readonly string[];
}>;

type ExpenseClassificationEvidence = Readonly<{
  id: string;
  version: number;
  commercialClassificationState: string;
  revisionCount: number;
}>;

type PeriodReportArtifactEvidence = Readonly<{
  id: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  state: string;
  snapshotVersion: number;
  snapshotSha256: string | null;
  pdfStorageKey: string | null;
  pdfSha256: string | null;
  pdfByteLength: number | null;
  approvedAt: string | null;
  actualSha256: string | null;
  actualByteLength: number | null;
}>;

type CustomerConformityEvidence = Readonly<{
  id: string;
  periodReportId: string;
  snapshotVersion: number;
  snapshotSha256: string;
  reportPdfStorageKey: string;
  reportPdfSha256: string;
  reportPdfByteLength: number;
  invalidatedAt: string | null;
}>;

type InvoiceLifecycleEvidence = Readonly<{
  id: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  state: string;
  version: number;
}>;

function readExpenseClassificationEvidence(expenseId: string): ExpenseClassificationEvidence {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT e.id,e.version,e.commercial_classification_state AS commercialClassificationState,
                (SELECT COUNT(*) FROM expense_classification_revision r WHERE r.expense_id=e.id) AS revisionCount
           FROM expense e
          WHERE e.id=?`,
      )
      .get(expenseId) as ExpenseClassificationEvidence | undefined;
    if (!row) throw new Error(`Expense classification evidence is missing for ${expenseId}`);
    return row;
  } finally {
    database.sqlite.close();
  }
}

function readPeriodReportArtifactEvidence(reportId: string): PeriodReportArtifactEvidence {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT id,project_id AS projectId,period_start AS periodStart,period_end AS periodEnd,
                state,snapshot_version AS snapshotVersion,snapshot_sha256 AS snapshotSha256,
                pdf_storage_key AS pdfStorageKey,pdf_sha256 AS pdfSha256,
                pdf_byte_length AS pdfByteLength,approved_at AS approvedAt
           FROM period_report WHERE id=?`,
      )
      .get(reportId) as PeriodReportArtifactEvidence | undefined;
    if (!row) throw new Error(`Period report evidence is missing for ${reportId}`);
    if (!row.pdfStorageKey) return { ...row, actualSha256: null, actualByteLength: null };
    const artifactPath = resolve(fixture.documentRoot, ...row.pdfStorageKey.split('/'));
    const bytes = readFileSync(artifactPath);
    return {
      ...row,
      actualSha256: createHash('sha256').update(bytes).digest('hex'),
      actualByteLength: bytes.byteLength,
    };
  } finally {
    database.sqlite.close();
  }
}

function readCustomerConformityEvidence(
  periodReportId: string,
): CustomerConformityEvidence | undefined {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return database.sqlite
      .prepare(
        `SELECT c.id,c.period_report_id AS periodReportId,c.snapshot_version AS snapshotVersion,
                c.snapshot_sha256 AS snapshotSha256,c.report_pdf_storage_key AS reportPdfStorageKey,
                c.report_pdf_sha256 AS reportPdfSha256,c.report_pdf_byte_length AS reportPdfByteLength,
                i.occurred_at AS invalidatedAt
           FROM customer_conformity c
           LEFT JOIN customer_conformity_invalidation i ON i.conformity_id=c.id
          WHERE c.period_report_id=?
          ORDER BY c.created_at DESC,c.id DESC LIMIT 1`,
      )
      .get(periodReportId) as CustomerConformityEvidence | undefined;
  } finally {
    database.sqlite.close();
  }
}

function readCustomerConformityById(conformityId: string): CustomerConformityEvidence | undefined {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return database.sqlite
      .prepare(
        `SELECT c.id,c.period_report_id AS periodReportId,c.snapshot_version AS snapshotVersion,
                c.snapshot_sha256 AS snapshotSha256,c.report_pdf_storage_key AS reportPdfStorageKey,
                c.report_pdf_sha256 AS reportPdfSha256,c.report_pdf_byte_length AS reportPdfByteLength,
                i.occurred_at AS invalidatedAt
           FROM customer_conformity c
           LEFT JOIN customer_conformity_invalidation i ON i.conformity_id=c.id
          WHERE c.id=?`,
      )
      .get(conformityId) as CustomerConformityEvidence | undefined;
  } finally {
    database.sqlite.close();
  }
}

function readInvoiceForReport(
  projectId: string,
  periodStart: string,
  periodEnd: string,
): InvoiceLifecycleEvidence {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT id,project_id AS projectId,period_start AS periodStart,period_end AS periodEnd,
                state,version
           FROM invoice
          WHERE project_id=? AND period_start=? AND period_end=?
          ORDER BY created_at DESC,id DESC LIMIT 1`,
      )
      .get(projectId, periodStart, periodEnd) as InvoiceLifecycleEvidence | undefined;
    if (!row)
      throw new Error(`Invoice evidence is missing for ${projectId}:${periodStart}:${periodEnd}`);
    return row;
  } finally {
    database.sqlite.close();
  }
}

function readPeriodReportId(
  projectId: string,
  periodStart: string,
  periodEnd: string,
  audience: 'customer' | 'internal',
): string {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT id
           FROM period_report
          WHERE project_id=? AND period_start=? AND period_end=? AND audience=?
          ORDER BY created_at DESC,id DESC LIMIT 1`,
      )
      .get(projectId, periodStart, periodEnd, audience) as { id: string } | undefined;
    if (!row?.id) throw new Error(`Period report evidence is missing for ${projectId}:${audience}`);
    return row.id;
  } finally {
    database.sqlite.close();
  }
}

async function enqueueCustomerPeriodReportRefresh(page: Page): Promise<string> {
  const projectHref = await page
    .getByRole('link', { name: 'Open project', exact: true })
    .getAttribute('href');
  const projectMatch = projectHref?.match(/\/projects\/([^/?#]+)$/u);
  expect(projectMatch, 'the customer report must expose an authorized project link').not.toBeNull();
  const projectId = decodeURIComponent(projectMatch?.[1] ?? '');
  expect(projectId).not.toBe('');

  const periodText = await page
    .locator('.record-detail-header > div')
    .first()
    .locator('p')
    .last()
    .innerText();
  const periodMatch = periodText.match(/(\d{4}-\d{2}-\d{2})\s+→\s+(\d{4}-\d{2}-\d{2})/u);
  expect(periodMatch, 'the customer report must expose its canonical period').not.toBeNull();
  const periodStart = periodMatch?.[1] ?? '';
  const periodEnd = periodMatch?.[2] ?? '';
  expect(periodStart).not.toBe('');
  expect(periodEnd).not.toBe('');

  await stepUpFinance(page);
  const response = await page.request.post(`${page.url()}?/refresh`, {
    headers: { origin: new URL(page.url()).origin, referer: page.url() },
    form: { projectId, periodStart, periodEnd, reportLocale: 'en' },
  });
  expect(response.status(), 'period report refresh must enqueue a durable job').toBe(200);

  // Read the durable identity written by the action instead of relying on a
  // browser-only queued label.  This lets the service-worker proof assert the
  // exact refresh job and report any unrelated fixture failures separately.
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const job = database.sqlite
      .prepare(
        `SELECT id
           FROM job
          WHERE kind='period_close_report'
            AND idempotency_key=?
          ORDER BY created_at DESC,id DESC
          LIMIT 1`,
      )
      .get(`period-report-refresh:${projectId}:${periodStart}:${periodEnd}:en`) as
      | { id: string }
      | undefined;
    if (!job?.id) throw new Error('The period report refresh action did not persist its job');
    return job.id;
  } finally {
    database.sqlite.close();
  }
}

async function refreshCustomerPeriodReportWithChangedLocale(
  page: Page,
  expectedProjectId: string,
  expectedPeriodStart: string,
  expectedPeriodEnd: string,
): Promise<string> {
  // The customer-safe detail intentionally does not expose the internal
  // refresh control. Use the Finance Reports surface, which is the
  // authenticated product action for recalculating both audiences.
  await page.goto(portal('/reports'));
  await page.locator('details.report-generator > summary').click();
  const generator = page.locator('[data-report-generator-cta]');
  await expect(generator).toBeVisible();
  await generator.click();
  const refreshForm = page.locator('form[action="?/generatePeriodReports"]');
  await expect(refreshForm).toHaveCount(1);
  const projectId = expectedProjectId;
  const periodStart = expectedPeriodStart;
  const periodEnd = expectedPeriodEnd;
  await refreshForm.locator('select[name="projectId"]').selectOption(projectId);
  await refreshForm.locator('input[name="periodStart"]').fill(periodStart);
  await refreshForm.locator('input[name="periodEnd"]').fill(periodEnd);
  const localeSelect = refreshForm.locator('select[name="reportLocale"]');
  const replacementLocale = 'es';
  await localeSelect.selectOption(replacementLocale);
  await stepUpFinance(page);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/generatePeriodReports'),
  );
  await refreshForm.getByRole('button', { name: 'Refresh reports', exact: true }).click();
  const response = await responsePromise;
  const body = await response.text();
  expect(response.status(), body).toBe(200);
  expect(body).toContain('action.reports.periodReportsRefreshed');

  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const job = database.sqlite
      .prepare(
        `SELECT id
           FROM job
          WHERE kind='period_close_report'
            AND idempotency_key=?
          ORDER BY created_at DESC,id DESC
          LIMIT 1`,
      )
      .get(
        `period-report-refresh:${projectId}:${periodStart}:${periodEnd}:${replacementLocale}`,
      ) as { id: string } | undefined;
    if (!job?.id) throw new Error('The changed report refresh action did not persist its job');
    return job.id;
  } finally {
    database.sqlite.close();
  }
}

/**
 * Run the same fenced artifact worker used by the production service against
 * the disposable E2E fixture. This is deliberately outside the human HTTP
 * surface and keeps the ready-path proof deterministic.
 */
function readPeriodReportRefreshJobEvidence(
  database: ReturnType<typeof createDatabase>['sqlite'],
  jobId: string,
): PeriodReportRefreshJobEvidence | undefined {
  return database
    .prepare(
      `SELECT j.id,j.kind,j.state,j.attempts,j.created_at AS createdAt,j.payload_json AS payloadJson,
              j.last_error_code AS lastErrorCode,
              (SELECT r.started_at FROM job_run r
                WHERE r.job_id=j.id
                ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runStartedAt,
              (SELECT r.finished_at FROM job_run r
                WHERE r.job_id=j.id
                ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runFinishedAt,
              (SELECT r.state FROM job_run r
                WHERE r.job_id=j.id
                ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runState,
              (SELECT r.outcome FROM job_run r
                WHERE r.job_id=j.id
                ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runOutcome,
              (SELECT r.error_code FROM job_run r
                WHERE r.job_id=j.id
                ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runErrorCode
         FROM job j
        WHERE j.id=?`,
    )
    .get(jobId) as PeriodReportRefreshJobEvidence | undefined;
}

function readPeriodReportRefreshJobFromFixture(
  jobId: string,
): PeriodReportRefreshJobEvidence | undefined {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return readPeriodReportRefreshJobEvidence(database.sqlite, jobId);
  } finally {
    database.sqlite.close();
  }
}

function runBackgroundArtifactWorker(targetJobId?: string): BackgroundArtifactWorkerResult {
  const fixture = readE2EFixturePointer();
  // The browser web-server receives this value through its own environment,
  // while this helper runs in the Playwright process.  The V3 repository
  // verifies the file proof through JA_DOCUMENT_ROOT, so keep the worker's
  // explicit root and the repository's proof root identical for this run.
  const previousDocumentRoot = process.env.JA_DOCUMENT_ROOT;
  process.env.JA_DOCUMENT_ROOT = fixture.documentRoot;
  const exceptions: string[] = [];
  try {
    const database = createDatabase(fixture.databasePath);
    try {
      const startedAt = new Date().toISOString();
      const v3 = new V3Repository(database.sqlite);
      // The durable runner persists the stable error code by design.  Keep
      // the underlying exception in the E2E evidence as well, so a generic
      // HANDLER_FAILED can never hide a producer/payload/renderer defect.
      const originalRefresh = v3.refreshPeriodReportsFromJob.bind(v3);
      v3.refreshPeriodReportsFromJob = ((input, execution) => {
        try {
          return originalRefresh(input, execution);
        } catch (error) {
          exceptions.push(`refreshPeriodReportsFromJob: ${describeWorkerException(error)}`);
          throw error;
        }
      }) as V3Repository['refreshPeriodReportsFromJob'];
      const originalRecordPdf = v3.recordPeriodReportPdfFromJob.bind(v3);
      v3.recordPeriodReportPdfFromJob = ((reportId, storageKey, sha256, byteLength, execution) => {
        try {
          return originalRecordPdf(reportId, storageKey, sha256, byteLength, execution);
        } catch (error) {
          exceptions.push(
            `recordPeriodReportPdfFromJob(${reportId}): ${describeWorkerException(error)}`,
          );
          throw error;
        }
      }) as V3Repository['recordPeriodReportPdfFromJob'];
      const result = runArtifactJobs({
        documentRoot: fixture.documentRoot,
        repository: { createInvoiceDraftFromJob: () => undefined },
        v3,
      });
      const failures = database.sqlite
        .prepare(
          `SELECT j.id,j.kind,j.state,j.attempts,j.created_at AS createdAt,j.payload_json AS payloadJson,
                  j.last_error_code AS lastErrorCode,
                  (SELECT r.started_at FROM job_run r
                    WHERE r.job_id=j.id
                    ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runStartedAt,
                  (SELECT r.finished_at FROM job_run r
                    WHERE r.job_id=j.id
                    ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runFinishedAt,
                  (SELECT r.state FROM job_run r
                    WHERE r.job_id=j.id
                    ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runState,
                  (SELECT r.outcome FROM job_run r
                    WHERE r.job_id=j.id
                    ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runOutcome,
                  (SELECT r.error_code FROM job_run r
                    WHERE r.job_id=j.id
                    ORDER BY r.started_at DESC,r.id DESC LIMIT 1) AS runErrorCode
             FROM job j
            WHERE j.id IN (
              SELECT DISTINCT r.job_id
                FROM job_run r
               WHERE r.started_at>=? AND r.error_code IS NOT NULL
            )
            ORDER BY j.id`,
        )
        .all(startedAt) as PeriodReportRefreshJobEvidence[];
      return {
        processed: result.processed,
        failed: result.failed,
        target: targetJobId
          ? readPeriodReportRefreshJobEvidence(database.sqlite, targetJobId)
          : undefined,
        failures,
        exceptions,
      };
    } finally {
      database.sqlite.close();
    }
  } finally {
    if (previousDocumentRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previousDocumentRoot;
  }
}

function describeWorkerException(error: unknown): string {
  if (error instanceof Error)
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  return String(error);
}

async function openFinanceProjectWithUnlockedExpense(page: Page): Promise<void> {
  const projectValues = await page
    .locator('select[name="project"] option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter((value) => value.trim()),
    );
  for (const projectId of projectValues) {
    await page.goto(portal(`/finance?view=commercial&project=${encodeURIComponent(projectId)}`));
    const classify = page.getByRole('button', { name: 'Classify', exact: true }).first();
    if ((await classify.count()) > 0) {
      await classify.click();
      if ((await page.locator('[data-finance-expense-classification]').count()) > 0) return;
    }
  }
  throw new Error('The deterministic fixture has no unlocked Finance expense classification row');
}

async function manageInvoice(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole('button', { name: 'Manage', exact: true }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await expect(sheet).toBeVisible();
  return sheet;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectOperationalOnly(page: Page, route: string): Promise<void> {
  const controls = await page
    .locator('input:not([type="hidden"]), select, textarea')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute('name') ?? '',
        id: element.getAttribute('id') ?? '',
        ariaLabel: element.getAttribute('aria-label') ?? '',
        label: element.closest('label')?.textContent?.trim() ?? '',
      })),
    );
  expect(
    controls.filter((control) =>
      forbiddenCommercialControlPattern.test(
        `${control.name} ${control.id} ${control.ariaLabel} ${control.label}`,
      ),
    ),
    'Worker controls must contain operational inputs only',
  ).toEqual([]);

  const response = await page.request.get(portal(route));
  expect(response.status(), `authenticated ${route} projection must be readable`).toBe(200);
  const serverHtml = await response.text();
  expect(
    serverHtml,
    `server projection for ${route} must not serialize Finance-only fields`,
  ).not.toMatch(forbiddenSerializedFinanceKeyPattern);
}

async function expectNoPmFinanceProjection(page: Page, route: string): Promise<void> {
  const response = await page.request.get(portal(route));
  expect(response.status(), `PM ${route} projection must be readable`).toBe(200);
  const serverHtml = await response.text();
  expect(
    serverHtml,
    `PM ${route} server projection must omit Finance-only serialized fields`,
  ).not.toMatch(forbiddenSerializedFinanceKeyPattern);

  const rendered = await page.locator('main').innerText();
  expect(
    rendered,
    `PM ${route} rendered projection must not expose Finance-only labels`,
  ).not.toMatch(forbiddenRenderedFinanceLabelPattern);
}

test.describe('Client Essential · Worker operational truth', () => {
  test('Worker can record time, Travel, Standby, receipt expense, reports and own pay', async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, 'phone-390');
    await signIn(page, 'worker');

    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText(/10 H EXPECTED/i)).toHaveCount(0);
    await expectOperationalOnly(page, '/');

    await page.goto(portal('/time'));
    await expect(page.getByRole('heading', { name: 'Time entries', exact: true })).toBeVisible();
    await expectOperationalOnly(page, '/time');
    await page.locator('[data-time-primary-cta]').click();

    const travelForm = page.locator('form[data-time-entry-surface]').first();
    await expect(travelForm).toBeVisible();
    await selectFirstAssignedProject(travelForm);
    await travelForm.locator('input[name="workDate"]').fill('2026-08-24');
    await travelForm.locator('select[name="category"]').selectOption('travel');
    await expect(travelForm.getByText('Travel operational detail')).toBeVisible();
    await expect(travelForm.locator('input[name="activityCode"]')).toBeVisible();
    await travelForm.locator('input[name="activityCode"]').fill('Airport to commissioning site');
    await travelForm.locator('input[name="minutes"]').fill('45');
    await travelForm
      .locator('textarea[name="summary"]')
      .fill('Travelled from the airport to the commissioning site.');
    await expectOperationalOnly(page, '/time');
    await travelForm.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Time draft saved')).toBeVisible();

    await page.locator('[data-time-primary-cta]').click();
    const standbyForm = page.locator('form[data-time-entry-surface]').first();
    await expect(standbyForm).toBeVisible();
    await selectFirstAssignedProject(standbyForm);
    await standbyForm.locator('input[name="workDate"]').fill('2026-08-24');
    await standbyForm.locator('select[name="category"]').selectOption('standby');
    await expect(standbyForm.getByText('Standby reason')).toBeVisible();
    await standbyForm.locator('input[name="activityCode"]').fill('Awaiting controlled test window');
    await standbyForm.locator('input[name="minutes"]').fill('30');
    await standbyForm
      .locator('textarea[name="summary"]')
      .fill('Held available for the controlled test window.');
    await expectOperationalOnly(page, '/time');
    await standbyForm.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Time draft saved')).toBeVisible();

    await page.goto(portal('/expenses'));
    await expect(
      page.getByRole('heading', { name: 'Expenses and reimbursements', exact: true }),
    ).toBeVisible();
    await expectOperationalOnly(page, '/expenses');
    await page.locator('[data-expense-primary-cta]').click();
    const expenseForm = page.locator('form[data-expense-entry-surface]').first();
    await expect(expenseForm).toBeVisible();
    await expect(expenseForm.locator('input[name="clientTreatment"]')).toHaveCount(0);
    await expect(expenseForm.locator('select[name="billingTreatment"]')).toHaveCount(0);
    await expect(expenseForm.locator('input[name="markupBps"]')).toHaveCount(0);
    await selectFirstAssignedProject(expenseForm);
    await expenseForm.locator('input[name="spentOn"]').fill('2026-08-24');
    await expenseForm.locator('select[name="category"]').selectOption('hotel');
    await expenseForm.locator('input[name="vendor"]').fill('Essential Worker Receipt');
    await expenseForm.locator('input[name="amount"]').fill('24.50');
    await expenseForm.locator('select[name="currency"]').selectOption('USD');
    await expenseForm.locator('select[name="whoPaid"]').selectOption('worker');
    await expenseForm
      .locator('textarea[name="description"]')
      .fill('Operational receipt submitted from the Worker flow.');
    await expenseForm.locator('input[name="paymentMethod"]').fill('Cash');
    await expenseForm.locator('input[name="receipt"]').setInputFiles({
      name: 'essential-worker-receipt.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    let expensePostData = '';
    const expenseRequestListener = (request: import('@playwright/test').Request): void => {
      if (request.method() === 'POST' && request.url().includes('?/createExpense'))
        expensePostData = request.postData() ?? '';
    };
    page.on('request', expenseRequestListener);
    await expenseForm.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Expense draft saved')).toBeVisible();
    page.off('request', expenseRequestListener);
    expect(expensePostData).not.toMatch(forbiddenCommercialControlPattern);
    await expect(
      page.locator('[data-expense-record]').filter({ hasText: 'Essential Worker Receipt' }),
    ).toHaveCount(1);

    await page.goto(portal('/reports'));
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Technical / PLC', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toBeVisible();
    await expectOperationalOnly(page, '/reports');

    await page.getByRole('button', { name: 'New daily report', exact: true }).click();
    const dailyForm = page.locator('form[data-report-entry-surface="daily"]');
    await expect(dailyForm).toBeVisible();
    await selectFirstAssignedProject(dailyForm);
    await dailyForm.locator('input[name="workDate"]').fill('2026-08-24');
    await dailyForm.locator('input[name="siteShift"]').fill('Line 4 · first shift');
    await dailyForm
      .locator('textarea[name="summary"]')
      .fill('Recorded the operational transfer and site arrival.');
    await dailyForm
      .locator('textarea[name="tasksCompleted"]')
      .fill('Confirmed site arrival and documented the shift context.');
    await dailyForm.getByRole('button', { name: 'Save daily report' }).click();
    await expect(page.getByText('Daily report draft saved')).toBeVisible();

    await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
    await page.getByRole('button', { name: 'New technical report', exact: true }).click();
    const technicalForm = page.locator('form[data-report-entry-surface="technical"]');
    await expect(technicalForm).toBeVisible();
    await selectFirstAssignedProject(technicalForm);
    await technicalForm.locator('input[name="systemName"]').fill('Line 4 PLC station');
    await technicalForm
      .locator('textarea[name="problemSymptom"]')
      .fill('Intermittent station sequence did not complete.');
    await technicalForm
      .locator('textarea[name="diagnosisRootCause"]')
      .fill('The completion input debounce was shorter than the field signal.');
    await technicalForm
      .locator('textarea[name="changePerformed"]')
      .fill('Adjusted the debounce and documented controls validation during the shift.');
    await technicalForm.getByRole('button', { name: 'Save PLC report' }).click();
    await expect(page.getByText('PLC report draft saved')).toBeVisible();

    await page.goto(portal('/pay'));
    await expect(page.getByRole('heading', { name: 'My Pay', exact: true })).toBeVisible();
    await expect(
      page.getByText('This view contains only your own time', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText('Alex Rivera', { exact: true })).toBeVisible();
    for (const otherWorker of ['Rafael Santos', 'Maya Chen', 'Daniel Brooks', 'Elena Costa'])
      await expect(page.getByText(otherWorker, { exact: true })).toHaveCount(0);
    await expectOperationalOnly(page, '/pay');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Client Essential · PM operational scope', () => {
  test('PM can review projects, approvals and reports without Finance projection fields', async ({
    page,
  }) => {
    await signIn(page, 'manager');

    await page.goto(portal('/projects'));
    await expect(
      page.getByRole('heading', { name: 'Authorized projects', exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href*="/app/projects/"]').first()).toBeVisible();
    await expectNoPmFinanceProjection(page, '/projects');
    await expect(page.getByRole('heading', { name: 'Commercial', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toHaveCount(0);

    const firstProject = page
      .locator('a.project-section__project-link, a.project-list-link')
      .first();
    await expect(firstProject).toBeVisible();
    await firstProject.click();
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    for (const tab of ['Overview', 'Team', 'Reports & Files']) {
      const tabControl = tabWithLabel(page, tab);
      await expect(tabControl).toHaveCount(1);
      await expect(tabControl).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Commercial', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Billing', exact: true })).toHaveCount(0);
    await expectNoPmFinanceProjection(
      page,
      new URL(page.url()).pathname.replace('/j-aautomation/app', ''),
    );

    await page.goto(portal('/approvals'));
    await expect(page.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible();
    for (const tab of ['Time', 'Expenses', 'Reports']) {
      const tabControl = tabWithLabel(page, tab);
      await expect(tabControl).toHaveCount(1);
      await expect(tabControl).toBeVisible();
    }
    await expect(tabWithLabel(page, 'Reports')).toHaveAttribute('aria-selected', 'false');
    await tabWithLabel(page, 'Reports').click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await expectNoPmFinanceProjection(page, '/approvals');

    await page.goto(portal('/reports'));
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Technical / PLC', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toBeVisible();
    await expectNoPmFinanceProjection(page, '/reports');
  });
});

test.describe('Client Essential · Finance and billing control', () => {
  test('Finance sees canonical planned versus actual projections and separate expense treatment', async ({
    page,
  }) => {
    await signIn(page, 'finance');

    await page.goto(portal('/finance'));
    await expect(
      page.getByRole('heading', { name: 'Finance overview', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-finance-actual]')).toBeVisible();
    await expect(page.locator('[data-finance-expected]')).toBeVisible();
    await expect(page.getByText('Direct Project Result', { exact: true })).toBeVisible();
    await expect(page.getByText('Contribution', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Contribution Margin %', { exact: true })).toBeVisible();

    await page.goto(portal('/finance?view=commercial'));
    await openFinanceProjectWithUnlockedExpense(page);
    await expect(page.locator('[data-finance-expense-controls]').first()).toBeVisible();
    await expect(page.locator('[data-finance-expense-id]').first()).toBeVisible();
    await expect(page.locator('[data-finance-expense-classification]').first()).toBeVisible();
    await expect(
      page
        .locator('[data-finance-expense-classification]')
        .first()
        .locator('select[name="expensePreset"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-finance-expense-classification]').first().locator('input[name="taxBps"]'),
    ).toHaveValue('0');
    await expect(page.getByText('Expected reimbursement', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Expected client recovery', { exact: true }).first()).toBeVisible();

    await page.goto(portal('/billing'));
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    for (const stage of ['WIP / Ready', 'Drafts', 'Outstanding', 'Overdue']) {
      const stageControl = billingStageButton(page, stage);
      await expect(stageControl).toHaveCount(1);
      await expect(stageControl).toBeVisible();
    }
    await expect(page.locator('[data-invoice-row]').first()).toBeVisible();
    await page.goto(portal('/ledger'));
    await expect(
      page.getByRole('heading', { name: 'Collections / Ledger', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByText('Contribution', { exact: true }).first()).toBeVisible();

    await page.goto(portal('/accounting'));
    await expect(page.getByRole('heading', { name: 'Accounting', exact: true })).toBeVisible();
    await expect(page.locator('form[action="?/createAccountingPack"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Accounting Pack register', exact: true }),
    ).toBeVisible();
  });

  test('Finance can classify an unlocked expense and record then reverse a seeded payment', async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, 'desktop');
    await signIn(page, 'finance');

    await page.goto(portal('/finance?view=commercial'));
    const policyForm = page.locator('form[data-project-commercial-policy-form]');
    await expect(policyForm).toBeVisible();
    const projectSelect = policyForm.locator('select[name="projectId"]');
    const lineProjectOption = projectSelect
      .locator('option')
      .filter({ hasText: 'Body Shop Line 4 Controls Upgrade' });
    await expect(lineProjectOption).toHaveCount(1);
    await expect(lineProjectOption).toHaveAttribute('value', /\S/u);
    await expect(lineProjectOption).toContainText('Body Shop Line 4 Controls Upgrade');
    const lineProjectId = await lineProjectOption.getAttribute('value');
    const lineProjectLabel = await lineProjectOption.innerText();
    const lineProjectNumber = lineProjectLabel.split(' — ')[0]?.trim() ?? '';
    expect(lineProjectId).toBeTruthy();
    expect(lineProjectNumber).toBeTruthy();
    await projectSelect.selectOption(lineProjectId!);
    await expect(projectSelect).toHaveValue(lineProjectId!);
    await expect(projectSelect.locator('option:checked')).toHaveText(lineProjectLabel);
    await policyForm.locator('input[name="effectiveFrom"]').fill('2026-01-01');
    await policyForm.locator('input[name="overtimeThresholdMinutes"]').fill('600');
    await policyForm.locator('select[name="travelClientBillable"]').selectOption('true');
    await policyForm.locator('select[name="customerSignoffRequired"]').selectOption('true');
    await stepUpFinance(page);
    await policyForm.getByRole('button', { name: 'Save project policy' }).click();
    await expect(page.getByRole('status').filter({ hasText: /policy/i })).toBeVisible();

    await page.goto(portal('/billing'));
    const lineDraft = page
      .locator('tr[data-invoice-row]')
      .filter({ hasText: lineProjectNumber })
      .filter({ has: page.locator('[data-invoice-status="draft"]') })
      .first();
    await expect(lineDraft).toBeVisible();
    await manageInvoice(page, lineDraft);
    await stepUpFinance(page);
    await page
      .locator('[data-ui="responsive-sheet"]')
      .locator('form[action="?/approveInvoice"]')
      .getByRole('button', { name: 'Approve' })
      .click();
    const approvedLineRow = page
      .locator('tr[data-invoice-row]')
      .filter({ hasText: lineProjectNumber })
      .filter({ has: page.locator('[data-invoice-status="approved"]') })
      .first();
    await expect(approvedLineRow).toBeVisible();
    await manageInvoice(page, approvedLineRow);
    await expect(approvedLineRow).toBeVisible();
    const issueResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/issueInvoice'),
    );
    await page
      .locator('[data-ui="responsive-sheet"]')
      .locator('form[action="?/issueInvoice"]')
      .getByRole('button', { name: 'Issue invoice' })
      .click();
    const issueResponse = await issueResponsePromise;
    const issueResponseBody = await issueResponse.text();
    expect(issueResponseBody).toContain('customer_signoff_required');
    const blockers = page.locator('[data-issue-blocker]');
    await expect(blockers).toBeVisible();
    await expect(blockers).toContainText('Invoice issue blocked');
    await expect(blockers.getByRole('link', { name: 'Open sign-off' })).toHaveAttribute(
      'href',
      /\/j-aautomation\/app\/reports(?:\/period\/|\?view=signoff)/,
    );

    await page.goto(portal('/finance?view=commercial'));
    await openFinanceProjectWithUnlockedExpense(page);
    const classification = page.locator('[data-finance-expense-classification]').first();
    await expect(classification).toBeVisible();
    const classifiedExpenseId = await classification
      .locator('input[name="expenseId"]')
      .inputValue();
    const classificationVersion = Number(
      await classification.locator('input[name="expectedVersion"]').inputValue(),
    );
    expect(classifiedExpenseId).toMatch(/\S/u);
    expect(Number.isSafeInteger(classificationVersion)).toBe(true);
    await classification
      .locator('textarea[name="reason"]')
      .fill('Essential Finance classification review');
    const classificationResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('?/classifyExpenseCommercially'),
    );
    await classification.getByRole('button', { name: 'Save Finance classification' }).click();
    const classificationResponse = await classificationResponsePromise;
    expect(classificationResponse.status(), 'Finance classification action must succeed').toBe(200);
    const classificationResponseBody = await classificationResponse.text();
    expect(classificationResponseBody).toContain('action.finance.expenseClassified');
    // The canonical action key is rendered through the locale catalog as the
    // user-facing semantic message "Finance Expense Classified".  It does
    // not contain the implementation noun "classification", so matching
    // `/classification/i` would test a stale copy rather than the action.
    await expect(
      page.getByRole('status').filter({ hasText: /expense\s+classified/i }),
    ).toBeVisible();
    // Classification is a state transition: the form intentionally disappears
    // after the POST.  Assert the surviving expense card and independently
    // read the committed row/revision so a successful HTTP response cannot be
    // mistaken for persistence.
    const classifiedExpense = page.locator(`[data-finance-expense-id="${classifiedExpenseId}"]`);
    await expect(classifiedExpense).toContainText('Classified');
    const classificationEvidence = readExpenseClassificationEvidence(classifiedExpenseId);
    expect(classificationEvidence).toMatchObject({
      id: classifiedExpenseId,
      version: classificationVersion + 1,
      commercialClassificationState: 'classified',
    });
    expect(classificationEvidence.revisionCount).toBeGreaterThan(0);
    // Enhanced forms keep the pre-action projection in the page until the
    // next load.  Reload against the same server/DB and prove that the
    // classified state is the durable projection (the form is now gone).
    await page.reload();
    const reloadedClassifiedExpense = page.locator(
      `[data-finance-expense-id="${classifiedExpenseId}"]`,
    );
    await expect(reloadedClassifiedExpense).toContainText('Classified');

    await page.goto(portal('/billing'));
    const issuedRow = page
      .locator('tr[data-invoice-row][data-invoice-issued-on]:not([data-invoice-issued-on=""])')
      .filter({
        has: page.locator(
          '[data-invoice-status="issued"], [data-invoice-status="sent"], [data-invoice-status="partially_paid"], [data-invoice-status="overdue"]',
        ),
      })
      .first();
    await expect(issuedRow).toBeVisible();
    const causalInvoiceDate = (await issuedRow.getAttribute('data-invoice-issued-on')) ?? '';
    expect(causalInvoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    await manageInvoice(page, issuedRow);
    const paymentForm = page
      .locator('[data-ui="responsive-sheet"]')
      .locator('form[action="?/recordPayment"]')
      .first();
    await expect(paymentForm).toBeVisible();
    const invoiceRow = page.locator(
      `[data-invoice-row="${await issuedRow.getAttribute('data-invoice-row')}"]`,
    );
    await paymentForm.locator('input[name="amount"]').fill('1.00');
    await paymentForm.locator('input[name="receivedOn"]').fill(causalInvoiceDate);
    await paymentForm.locator('input[name="reference"]').fill('Essential partial collection');
    await paymentForm.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Payment recorded' })).toBeVisible();
    await expect(invoiceRow).toContainText(/Partially paid|Paid/);

    const paymentHistory = invoiceRow.getByText('Collections and reversals', { exact: true });
    await paymentHistory.click();
    const reversalForm = invoiceRow.locator('form[action="?/reversePayment"]').first();
    await expect(reversalForm).toBeVisible();
    await reversalForm.locator('input[name="effectiveOn"]').fill(causalInvoiceDate);
    await reversalForm.locator('input[name="reason"]').fill('Essential reversal verification');
    await reversalForm.getByRole('button', { name: 'Reverse payment' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Payment reversal recorded' }),
    ).toBeVisible();
    // The enhanced POST re-renders the closed details element. Re-open it
    // before asserting the immutable payment/reversal timeline.
    await invoiceRow.getByText('Collections and reversals', { exact: true }).click();
    const paymentHistoryAfterReversal = invoiceRow.locator('.billing-section__payment-history');
    await expect(paymentHistoryAfterReversal).toHaveAttribute('open', '');
    await expect(paymentHistoryAfterReversal).toContainText('Immutable reversal history');
    await expect(paymentHistoryAfterReversal).toContainText('$1.00');
    await expect(paymentHistoryAfterReversal).toContainText(causalInvoiceDate);
    await expect(paymentHistoryAfterReversal).toContainText('Essential partial collection');
    await expect(paymentHistoryAfterReversal).toContainText('Essential reversal verification');
  });
});

test.describe('Client Essential · Customer-safe report and Owner configuration', () => {
  test('authorized reviewer sees queued customer report state without a fake download', async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, 'desktop');
    await signIn(page, 'finance');
    await page.goto(`${portal('/reports')}?view=signoff`);
    await expect(page.getByRole('tab', { name: 'Client Sign-off', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const signoffLink = page.locator('.report-signoff-card a.report-register-link').first();
    await expect(signoffLink).toBeVisible();
    await signoffLink.click();
    await expect(page.locator('[data-customer-signoff]')).toBeVisible();
    await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
      'data-signoff-state',
      'needs_report',
    );
    await expect(page.locator('a.customer-signoff__pdf')).toHaveCount(0);
    await expect(page.locator('form[data-signoff-form]')).toHaveCount(0);
    await expect(page.locator('[data-localized-pdf-panel]')).toBeVisible();
    await expect(
      page.locator('[data-localized-pdf-panel]').getByRole('link', { name: /Download/u }),
    ).toHaveCount(0);
  });

  test('authorized reviewer can inspect a ready zero-money customer report and sign-off contract', async ({
    page,
  }, testInfo) => {
    // This is the complete contractual lifecycle (two renders, two approvals,
    // two conformities, billing gates, downloads and three role boundaries),
    // not a 30-second smoke. Keep a bounded per-journey budget while retaining
    // the normal timeout for the smaller tests in this suite.
    test.setTimeout(120_000);
    skipUnlessProject(testInfo, 'desktop');
    await signIn(page, 'finance');
    await page.goto(portal('/reports'));
    await page.getByRole('tab', { name: 'Client Sign-off', exact: true }).click();
    const signoffLink = page.locator('.report-signoff-card a.report-register-link').first();
    await expect(signoffLink).toBeVisible();
    const detailHref = await signoffLink.getAttribute('href');
    const linkedReportId = await signoffLink.getAttribute('data-period-report-id');
    expect(linkedReportId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(detailHref).toBe(`/j-aautomation/app/reports/period/${linkedReportId}`);
    await signoffLink.click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(detailHref ?? '')}(?:\\?.*)?$`, 'u'));
    await expect(page.locator('[data-customer-signoff]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Customer sign-off', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('It contains no financial information.', { exact: false }),
    ).toBeVisible();

    const projectHref = await page
      .getByRole('link', { name: 'Open project', exact: true })
      .getAttribute('href');
    const projectMatch = projectHref?.match(/\/projects\/([^/?#]+)$/u);
    expect(projectMatch, 'the report must expose its project binding').not.toBeNull();
    const reportProjectId = decodeURIComponent(projectMatch?.[1] ?? '');
    expect(reportProjectId).toMatch(/^\S+$/u);
    const reportPeriodText = await page
      .locator('.record-detail-header > div')
      .first()
      .locator('p')
      .last()
      .innerText();
    const reportPeriodMatch = reportPeriodText.match(
      /(\d{4}-\d{2}-\d{2})\s+→\s+(\d{4}-\d{2}-\d{2})/u,
    );
    expect(reportPeriodMatch, 'the report must expose its period binding').not.toBeNull();
    const reportPeriodStart = reportPeriodMatch?.[1] ?? '';
    const reportPeriodEnd = reportPeriodMatch?.[2] ?? '';
    expect(reportPeriodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(reportPeriodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

    // Make the billing gate explicit for this independent journey. Its
    // effective date is the report's causal period start, never a wall-clock
    // or arbitrary fixture date.
    await enableCustomerSignoffPolicy(page, reportProjectId, reportPeriodStart);
    await page.goto(new URL(detailHref ?? '', page.url()).toString());
    await expect(page.locator('[data-customer-signoff]')).toBeVisible();

    // Prepare a deterministic ready fixture through the same durable job
    // contract used in production.  The browser never receives a process-job
    // control and this proof is independent of a stale queued-only screen.
    const refreshJobId = await enqueueCustomerPeriodReportRefresh(page);
    expect(readPeriodReportRefreshJobFromFixture(refreshJobId)).toMatchObject({
      id: refreshJobId,
      kind: 'period_close_report',
      state: 'queued',
      lastErrorCode: null,
      runState: null,
      runOutcome: null,
      runErrorCode: null,
    });
    const workerResult = runBackgroundArtifactWorker(refreshJobId);
    expect(
      workerResult.failed,
      `durable artifact worker reported failures: ${JSON.stringify(workerResult.failures)}`,
    ).toBe(0);
    expect(
      workerResult.exceptions,
      'the worker must not hide an exception behind HANDLER_FAILED',
    ).toEqual([]);
    expect(
      workerResult.processed,
      'the refresh must be consumed by the background worker',
    ).toBeGreaterThan(0);
    expect(
      workerResult.target,
      'the refresh job must remain observable after the worker run',
    ).toMatchObject({
      id: refreshJobId,
      kind: 'period_close_report',
      state: 'succeeded',
      lastErrorCode: null,
      runStartedAt: expect.any(String),
      runFinishedAt: expect.any(String),
      runState: 'succeeded',
      runOutcome: 'succeeded',
      runErrorCode: null,
    });
    const renderedReport = readPeriodReportArtifactEvidence(linkedReportId!);
    expect(renderedReport).toMatchObject({
      id: linkedReportId,
      projectId: reportProjectId,
      periodStart: reportPeriodStart,
      periodEnd: reportPeriodEnd,
      state: 'review',
      snapshotVersion: expect.any(Number),
      snapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      pdfStorageKey: expect.stringMatching(
        new RegExp(`^reports/${escapeRegExp(linkedReportId!)}/[^/]+\\.pdf$`, 'u'),
      ),
      pdfSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      pdfByteLength: expect.any(Number),
      actualSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      actualByteLength: expect.any(Number),
    });
    expect(renderedReport.actualSha256).toBe(renderedReport.pdfSha256);
    expect(renderedReport.actualByteLength).toBe(renderedReport.pdfByteLength);
    expect(renderedReport.pdfByteLength).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('[data-customer-signoff]')).toBeVisible();

    const customerSignoff = page.locator('[data-customer-signoff]');
    const lifecycle = page.locator('[data-report-lifecycle-state]');
    await expect(lifecycle).toBeVisible();
    const initialLifecycleState = await lifecycle.getAttribute('data-report-lifecycle-state');
    expect(initialLifecycleState).toBe('review');

    // Approval is a real user action and must carry the exact immutable
    // report snapshot binding rendered by the server.
    const approvalForm = page.locator('form[data-period-report-approval]');
    await expect(approvalForm).toHaveCount(1);
    await expect(approvalForm).toHaveAttribute('action', '?/approve');
    const versionInput = approvalForm.locator('input[name="expectedSnapshotVersion"]');
    const hashInput = approvalForm.locator('input[name="expectedSnapshotSha256"]');
    const snapshotVersion = (await versionInput.inputValue()).trim();
    const snapshotSha256 = (await hashInput.inputValue()).trim();
    expect(snapshotVersion).toMatch(/^[1-9]\d*$/u);
    expect(snapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(
      approvalForm.getByRole('button', { name: 'Approve customer report', exact: true }),
    ).toBeVisible();
    const approvalRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('?/approve'),
    );
    await approvalForm
      .getByRole('button', { name: 'Approve customer report', exact: true })
      .click();
    const request = await approvalRequest;
    const approvalPayload = new URLSearchParams(request.postData() ?? '');
    expect(approvalPayload.get('expectedSnapshotVersion')).toBe(snapshotVersion);
    expect(approvalPayload.get('expectedSnapshotSha256')).toBe(snapshotSha256);

    await expect(lifecycle).toHaveAttribute('data-report-lifecycle-state', /^(approved|final)$/);
    const approvedReport = readPeriodReportArtifactEvidence(linkedReportId!);
    expect(approvedReport).toMatchObject({
      id: linkedReportId,
      state: expect.stringMatching(/^(approved|final)$/u),
      snapshotVersion: Number(snapshotVersion),
      snapshotSha256,
      pdfStorageKey: renderedReport.pdfStorageKey,
      pdfSha256: renderedReport.pdfSha256,
      pdfByteLength: renderedReport.pdfByteLength,
      approvedAt: expect.any(String),
      actualSha256: renderedReport.pdfSha256,
      actualByteLength: renderedReport.pdfByteLength,
    });

    const targetInvoice = readInvoiceForReport(reportProjectId, reportPeriodStart, reportPeriodEnd);
    // Establish the negative side of the billing gate with the exact invoice
    // whose period/project caused this report. A failed action is expected,
    // and HTTP 200 is explicitly rejected as a false success.
    await page.goto(portal('/billing'));
    let invoiceRow = page.locator(`tr[data-invoice-row="${targetInvoice.id}"]`);
    await expect(invoiceRow).toBeVisible();
    await manageInvoice(page, invoiceRow);
    invoiceRow = page.locator(`[data-invoice-row="${targetInvoice.id}"]`);
    if (await invoiceRow.locator('form[action="?/approveInvoice"]').count()) {
      await stepUpFinance(page);
      await invoiceRow
        .locator('form[action="?/approveInvoice"]')
        .getByRole('button', { name: 'Approve', exact: true })
        .click();
      await page.goto(portal('/billing'));
      invoiceRow = page.locator(`tr[data-invoice-row="${targetInvoice.id}"]`);
      await manageInvoice(page, invoiceRow);
      invoiceRow = page.locator(`[data-invoice-row="${targetInvoice.id}"]`);
      await expect(invoiceRow.locator('form[action="?/issueInvoice"]')).toHaveCount(1);
    }
    const blockedIssueForm = invoiceRow.locator('form[action="?/issueInvoice"]');
    await expect(blockedIssueForm).toHaveCount(1);
    await stepUpFinance(page);
    const blockedIssueResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/issueInvoice'),
    );
    await blockedIssueForm.getByRole('button', { name: 'Issue invoice', exact: true }).click();
    const blockedIssueResponse = await blockedIssueResponsePromise;
    expect(blockedIssueResponse.status()).not.toBe(200);
    const blockedIssueBody = await blockedIssueResponse.text();
    expect(blockedIssueBody).toContain('customer_signoff_required');
    const blockedIssueNotice = page.locator('[data-issue-blocker]');
    await expect(blockedIssueNotice).toBeVisible();
    await expect(blockedIssueNotice).toContainText('Invoice issue blocked');
    await expect(blockedIssueNotice.getByRole('link', { name: 'Open sign-off' })).toHaveAttribute(
      'href',
      new RegExp(`/j-aautomation/app/reports/period/${escapeRegExp(linkedReportId!)}`, 'u'),
    );
    expect(readInvoiceForReport(reportProjectId, reportPeriodStart, reportPeriodEnd)).toMatchObject(
      {
        id: targetInvoice.id,
        state: 'approved',
      },
    );
    await page.goto(new URL(detailHref ?? '', page.url()).toString());
    await expect(page.locator('[data-customer-signoff]')).toBeVisible();

    // PDF readiness is supplied by the automatic report fixture/job contract;
    // this ready-path test must never silently downgrade to a queued-only
    // assertion.
    const customerPdf = customerSignoff.locator('a.customer-signoff__pdf');
    const localizedPdfPanel = page.locator('[data-localized-pdf-panel]');
    await expect(localizedPdfPanel).toBeVisible();
    await expect(customerPdf).toHaveCount(1);

    await expect(customerPdf).toHaveAttribute('href', /\/app\/api\/reports\/[^/]+\/pdf$/u);
    await expect(
      page.getByRole('link', { name: 'Preview customer-safe PDF', exact: true }),
    ).toBeVisible();

    const pdfResponse = await page.request.get(
      new URL(await customerPdf.getAttribute('href')!, page.url()).toString(),
    );
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toMatch(/^application\/pdf(?:;|$)/iu);
    expect(pdfResponse.headers()['content-length']).toBe(String(renderedReport.pdfByteLength));
    expect(pdfResponse.headers()['content-disposition']).toMatch(
      new RegExp(
        `period-report-${escapeRegExp(reportPeriodStart)}-${escapeRegExp(reportPeriodEnd)}\\.pdf`,
        'u',
      ),
    );
    const servedPdf = await pdfResponse.body();
    expect(servedPdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(servedPdf.subarray(Math.max(0, servedPdf.length - 1024)).toString('latin1')).toContain(
      '%%EOF',
    );
    expect(servedPdf.byteLength).toBe(renderedReport.pdfByteLength);
    expect(createHash('sha256').update(servedPdf).digest('hex')).toBe(renderedReport.pdfSha256);
    const pdfDownload = page.waitForEvent('download');
    await customerPdf.click();
    const downloaded = await pdfDownload;
    expect(downloaded.suggestedFilename()).toBe(
      `period-report-${reportPeriodStart}-${reportPeriodEnd}.pdf`,
    );

    const signoffState = customerSignoff.locator('[data-signoff-state]');
    await expect(signoffState).toHaveAttribute(
      'data-signoff-state',
      /^(ready_for_signature|signed)$/,
    );

    const signoffForm = page.locator('form[data-signoff-form]');
    const signedByThisJourney = (await signoffForm.count()) > 0;
    if (signedByThisJourney) {
      await expect(signoffForm).toHaveAttribute('action', '?/sign');
      await expect(signoffForm.locator('input[name="signerName"]')).toBeVisible();
      await expect(signoffForm.locator('input[name="signerIdentity"]')).toBeVisible();
      await expect(
        signoffForm.getByRole('button', { name: 'Record customer sign-off', exact: true }),
      ).toBeVisible();

      await stepUpFinance(page);
      await signoffForm
        .locator('input[name="signerName"]')
        .fill('Client Essential Acceptance Signer');
      await signoffForm
        .locator('input[name="signerIdentity"]')
        .fill('client-essential@example.test');
      await signoffForm
        .getByRole('button', { name: 'Record customer sign-off', exact: true })
        .click();
    }

    await expect(signoffState).toHaveAttribute('data-signoff-state', 'signed');
    await expect(customerSignoff.locator('[data-signoff-notice="signed"] strong')).toHaveText(
      'Signed',
    );

    const facts = customerSignoff.locator('dl.customer-signoff__facts');
    await expect(facts).toBeVisible();
    const signerFact = facts
      .locator('dt')
      .filter({ hasText: /^Signer$/u })
      .locator('xpath=..');
    const signerValue = signerFact.locator('dd');
    await expect(signerValue).toHaveText(
      signedByThisJourney ? 'Client Essential Acceptance Signer' : /\S/u,
    );
    const identityFact = facts
      .locator('dt')
      .filter({ hasText: /^Signer identity$/u })
      .locator('xpath=..');
    const identityValue = identityFact.locator('dd');
    await expect(identityValue).toHaveText(
      signedByThisJourney ? 'client-essential@example.test' : /\S/u,
    );
    const signedAtFact = facts
      .locator('dt')
      .filter({ hasText: /^Signed at$/u })
      .locator('xpath=..');
    await expect(signedAtFact.locator('dd')).toHaveText(/\d/u);
    const versionFact = facts
      .locator('dt')
      .filter({ hasText: /^Report version$/u })
      .locator('xpath=..');
    await expect(versionFact.locator('dd')).toHaveText(
      snapshotVersion ? `v${snapshotVersion}` : /^v\d+$/u,
    );
    await expect(customerSignoff).toContainText(
      'Signed record is immutable. Any correction requires a new report version.',
    );
    const firstConformity = readCustomerConformityEvidence(linkedReportId!);
    expect(firstConformity).toMatchObject({
      periodReportId: linkedReportId,
      snapshotVersion: Number(snapshotVersion),
      snapshotSha256,
      reportPdfStorageKey: renderedReport.pdfStorageKey,
      reportPdfSha256: renderedReport.pdfSha256,
      reportPdfByteLength: renderedReport.pdfByteLength,
      invalidatedAt: null,
    });
    expect(firstConformity?.id).toMatch(/^\S+$/u);

    const customerBody = await page.locator('main.record-detail-page').innerText();
    expect(customerBody).not.toMatch(forbiddenRenderedFinanceLabelPattern);
    const serverHtml = await page.request.get(page.url()).then((response) => response.text());
    expect(serverHtml).not.toMatch(forbiddenSerializedFinanceKeyPattern);
    if (snapshotSha256) {
      // The exact hash is proven at the approval boundary. The signed
      // projection exposes the immutable version facts but intentionally does
      // not expose financial or internal snapshot contents to the customer.
      expect(snapshotSha256).toMatch(/^[a-f0-9]{64}$/u);
    }

    // The Finance mutation journey prepares the deterministic line invoice.
    // Once this report is signed, its issue form must no longer be blocked by
    // customer conformity. A previously issued row remains a valid idempotent
    // outcome and is checked as immutable history.
    const projectNumber = (await page.locator('.record-detail-header .portal-kicker').innerText())
      .split('/')[0]
      ?.trim();
    expect(projectNumber).toBeTruthy();
    await page.goto(portal('/billing'));
    invoiceRow = page.locator(`tr[data-invoice-row="${targetInvoice.id}"]`);
    await expect(invoiceRow).toBeVisible();
    await expect(invoiceRow).toContainText(projectNumber!);
    await manageInvoice(page, invoiceRow);
    invoiceRow = page.locator(`[data-invoice-row="${targetInvoice.id}"]`);
    if (await invoiceRow.locator('form[action="?/approveInvoice"]').count()) {
      await stepUpFinance(page);
      await invoiceRow
        .locator('form[action="?/approveInvoice"]')
        .getByRole('button', { name: 'Approve', exact: true })
        .click();
      await expect(invoiceRow.locator('form[action="?/issueInvoice"]')).toHaveCount(1);
    }
    await expect(invoiceRow.locator('[data-invoice-issue-blocker]')).toHaveCount(0);
    const issueForm = invoiceRow.locator('form[action="?/issueInvoice"]');
    await expect(issueForm).toHaveCount(1);

    // Keep the approved draft unissued while invalidating the active
    // conformity. The same invoice must become blocked again, with no
    // financial write or partial transition.
    await page.goto(new URL(detailHref ?? '', page.url()).toString());
    const invalidation = page.locator('[data-signoff-invalidation]');
    await expect(invalidation).toBeVisible();
    await invalidation.locator('summary').click();
    const invalidationForm = invalidation.locator('form[action="?/invalidateSignoff"]');
    await invalidationForm
      .locator('textarea[name="reason"]')
      .fill('Client Essential supersession verification');
    await stepUpFinance(page);
    const invalidationResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/invalidateSignoff'),
    );
    await invalidationForm
      .getByRole('button', { name: 'Confirm invalidation', exact: true })
      .click();
    const invalidationResponse = await invalidationResponsePromise;
    expect(invalidationResponse.status()).toBe(200);
    expect(await invalidationResponse.text()).toContain(
      'action.reports.customerSignoffInvalidated',
    );
    await page.reload();
    await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
      'data-signoff-state',
      'invalid',
    );
    const invalidatedConformity = readCustomerConformityEvidence(linkedReportId!);
    expect(invalidatedConformity?.id).toBe(firstConformity?.id);
    expect(invalidatedConformity?.invalidatedAt).toMatch(/^\S+$/u);

    await page.goto(portal('/billing'));
    invoiceRow = page.locator(`tr[data-invoice-row="${targetInvoice.id}"]`);
    await expect(invoiceRow).toBeVisible();
    await manageInvoice(page, invoiceRow);
    invoiceRow = page.locator(`[data-invoice-row="${targetInvoice.id}"]`);
    const invalidatedIssueForm = invoiceRow.locator('form[action="?/issueInvoice"]');
    await expect(invalidatedIssueForm).toHaveCount(1);
    await stepUpFinance(page);
    const invalidatedIssueResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/issueInvoice'),
    );
    await invalidatedIssueForm.getByRole('button', { name: 'Issue invoice', exact: true }).click();
    const invalidatedIssueResponse = await invalidatedIssueResponsePromise;
    expect(invalidatedIssueResponse.status()).not.toBe(200);
    expect(await invalidatedIssueResponse.text()).toContain('customer_signoff_required');
    const invalidatedIssueNotice = page.locator('[data-issue-blocker]');
    await expect(invalidatedIssueNotice).toBeVisible();
    await expect(invalidatedIssueNotice).toContainText('Invoice issue blocked');
    await expect(
      invalidatedIssueNotice.getByRole('link', { name: 'Open sign-off' }),
    ).toHaveAttribute(
      'href',
      new RegExp(`/j-aautomation/app/reports/period/${escapeRegExp(linkedReportId!)}`, 'u'),
    );
    expect(readInvoiceForReport(reportProjectId, reportPeriodStart, reportPeriodEnd)).toMatchObject(
      {
        id: targetInvoice.id,
        state: 'approved',
      },
    );

    // A replacement conformity must bind a strictly newer snapshot. The
    // immutable old row cannot be re-used for the same version: change the
    // report locale through the real refresh action, render its durable job,
    // and approve the exact new version before signing it.
    await page.goto(new URL(detailHref ?? '', page.url()).toString());
    const replacementRefreshJobId = await refreshCustomerPeriodReportWithChangedLocale(
      page,
      reportProjectId,
      reportPeriodStart,
      reportPeriodEnd,
    );
    expect(readPeriodReportRefreshJobFromFixture(replacementRefreshJobId)).toMatchObject({
      id: replacementRefreshJobId,
      kind: 'period_close_report',
      state: 'queued',
      lastErrorCode: null,
      runState: null,
      runOutcome: null,
      runErrorCode: null,
    });
    const replacementWorkerResult = runBackgroundArtifactWorker(replacementRefreshJobId);
    expect(
      replacementWorkerResult.failed,
      `replacement artifact worker reported failures: ${JSON.stringify(
        replacementWorkerResult.failures,
      )}`,
    ).toBe(0);
    expect(replacementWorkerResult.exceptions).toEqual([]);
    expect(replacementWorkerResult.processed).toBeGreaterThan(0);
    expect(replacementWorkerResult.target).toMatchObject({
      id: replacementRefreshJobId,
      state: 'succeeded',
      lastErrorCode: null,
      runStartedAt: expect.any(String),
      runFinishedAt: expect.any(String),
      runState: 'succeeded',
      runOutcome: 'succeeded',
      runErrorCode: null,
    });
    const replacementReadyReport = readPeriodReportArtifactEvidence(linkedReportId!);
    expect(replacementReadyReport).toMatchObject({
      id: linkedReportId,
      projectId: reportProjectId,
      periodStart: reportPeriodStart,
      periodEnd: reportPeriodEnd,
      state: 'review',
      snapshotVersion: expect.any(Number),
      snapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      pdfStorageKey: expect.stringMatching(
        new RegExp(`^reports/${escapeRegExp(linkedReportId!)}/[^/]+\\.pdf$`, 'u'),
      ),
      pdfSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      pdfByteLength: expect.any(Number),
      actualSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      actualByteLength: expect.any(Number),
    });
    expect(replacementReadyReport.snapshotVersion).toBeGreaterThan(Number(snapshotVersion));
    expect(replacementReadyReport.snapshotSha256).not.toBe(snapshotSha256);
    expect(replacementReadyReport.actualSha256).toBe(replacementReadyReport.pdfSha256);
    expect(replacementReadyReport.actualByteLength).toBe(replacementReadyReport.pdfByteLength);
    expect(readCustomerConformityById(firstConformity!.id)).toMatchObject({
      id: firstConformity?.id,
      snapshotVersion: Number(snapshotVersion),
      snapshotSha256,
      invalidatedAt: expect.any(String),
    });

    await page.goto(new URL(detailHref ?? '', page.url()).toString());
    await page.reload();
    await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
      'data-signoff-state',
      'invalid',
    );
    const replacementApprovalForm = page.locator('form[data-period-report-approval]');
    await expect(replacementApprovalForm).toHaveCount(1);
    const replacementSnapshotVersion = (
      await replacementApprovalForm.locator('input[name="expectedSnapshotVersion"]').inputValue()
    ).trim();
    const replacementSnapshotSha256 = (
      await replacementApprovalForm.locator('input[name="expectedSnapshotSha256"]').inputValue()
    ).trim();
    expect(replacementSnapshotVersion).toBe(String(replacementReadyReport.snapshotVersion));
    expect(replacementSnapshotSha256).toBe(replacementReadyReport.snapshotSha256);
    await stepUpFinance(page);
    const replacementApprovalResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('?/approve'),
    );
    await replacementApprovalForm
      .getByRole('button', { name: 'Approve customer report', exact: true })
      .click();
    const replacementApprovalResponse = await replacementApprovalResponsePromise;
    const replacementApprovalBody = await replacementApprovalResponse.text();
    expect(replacementApprovalResponse.status(), replacementApprovalBody).toBe(200);
    expect(replacementApprovalBody).toContain('action.reports.periodReportApproved');
    await expect(page.locator('[data-report-lifecycle-state]')).toHaveAttribute(
      'data-report-lifecycle-state',
      /^(approved|final)$/,
    );
    const replacementApprovedReport = readPeriodReportArtifactEvidence(linkedReportId!);
    expect(replacementApprovedReport).toMatchObject({
      id: linkedReportId,
      state: expect.stringMatching(/^(approved|final)$/u),
      snapshotVersion: Number(replacementSnapshotVersion),
      snapshotSha256: replacementSnapshotSha256,
      pdfStorageKey: replacementReadyReport.pdfStorageKey,
      pdfSha256: replacementReadyReport.pdfSha256,
      pdfByteLength: replacementReadyReport.pdfByteLength,
      approvedAt: expect.any(String),
      actualSha256: replacementReadyReport.pdfSha256,
      actualByteLength: replacementReadyReport.pdfByteLength,
    });

    const replacementCustomerSignoff = page.locator('[data-customer-signoff]');
    const replacementPdf = replacementCustomerSignoff.locator('a.customer-signoff__pdf');
    await expect(replacementPdf).toHaveCount(1);
    const replacementPdfResponse = await page.request.get(
      new URL(await replacementPdf.getAttribute('href')!, page.url()).toString(),
    );
    expect(replacementPdfResponse.status()).toBe(200);
    expect(replacementPdfResponse.headers()['content-type']).toMatch(/^application\/pdf(?:;|$)/iu);
    expect(replacementPdfResponse.headers()['content-length']).toBe(
      String(replacementReadyReport.pdfByteLength),
    );
    expect(replacementPdfResponse.headers()['content-disposition']).toMatch(
      new RegExp(
        `period-report-${escapeRegExp(reportPeriodStart)}-${escapeRegExp(reportPeriodEnd)}\\.pdf`,
        'u',
      ),
    );
    const replacementServedPdf = await replacementPdfResponse.body();
    expect(replacementServedPdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(replacementServedPdf.byteLength).toBe(replacementReadyReport.pdfByteLength);
    expect(createHash('sha256').update(replacementServedPdf).digest('hex')).toBe(
      replacementReadyReport.pdfSha256,
    );

    const replacementSignoffForm = page.locator('form[data-signoff-form]');
    await expect(replacementSignoffForm).toBeVisible();
    await stepUpFinance(page);
    await replacementSignoffForm
      .locator('input[name="signerName"]')
      .fill('Client Essential Reapproval Signer');
    await replacementSignoffForm
      .locator('input[name="signerIdentity"]')
      .fill('client-essential-reapproval@example.test');
    const replacementSignResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('?/sign'),
    );
    await replacementSignoffForm
      .getByRole('button', { name: 'Record customer sign-off', exact: true })
      .click();
    const replacementSignResponse = await replacementSignResponsePromise;
    const replacementSignBody = await replacementSignResponse.text();
    expect(replacementSignResponse.status(), replacementSignBody).toBe(200);
    expect(replacementSignBody).toContain('action.reports.customerSignoffRecorded');
    await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
      'data-signoff-state',
      'signed',
    );
    const replacementConformity = readCustomerConformityEvidence(linkedReportId!);
    expect(replacementConformity).toMatchObject({
      periodReportId: linkedReportId,
      snapshotVersion: Number(replacementSnapshotVersion),
      snapshotSha256: replacementSnapshotSha256,
      reportPdfStorageKey: replacementReadyReport.pdfStorageKey,
      reportPdfSha256: replacementReadyReport.pdfSha256,
      reportPdfByteLength: replacementReadyReport.pdfByteLength,
      invalidatedAt: null,
    });
    expect(replacementConformity?.id).not.toBe(firstConformity?.id);
    expect(readCustomerConformityById(firstConformity!.id)?.invalidatedAt).toMatch(/^\S+$/u);

    // Prove the object-level privacy boundary against a real customer report
    // and the same-project internal report. The customer projection is
    // readable, but private artifact metadata and internal objects must fail
    // closed for both operational roles; cross-project IDOR coverage remains
    // owned by the dedicated security matrix.
    const internalReportId = readPeriodReportId(
      reportProjectId,
      reportPeriodStart,
      reportPeriodEnd,
      'internal',
    );
    const customerDetailUrl = new URL(detailHref ?? '', page.url()).toString();
    const internalDetailUrl = portal(`/reports/period/${internalReportId}`);
    for (const role of ['manager', 'worker'] as const) {
      await switchRole(page, role);
      const customerDetailResponse = await page.goto(customerDetailUrl);
      expect(customerDetailResponse?.status(), `${role} customer report status`).toBe(200);
      await expect(page.locator('[data-customer-signoff]')).toBeVisible();
      const roleCustomerText = await page.locator('main.record-detail-page').innerText();
      expect(roleCustomerText).not.toMatch(forbiddenRenderedFinanceLabelPattern);
      const roleCustomerHtml = await page.request
        .get(page.url())
        .then((response) => response.text());
      expect(roleCustomerHtml).not.toMatch(forbiddenSerializedFinanceKeyPattern);
      expect((await page.request.get(internalDetailUrl)).status()).toBe(404);
    }
    await switchRole(page, 'finance');

    await page.goto(portal('/billing'));
    invoiceRow = page.locator(`tr[data-invoice-row="${targetInvoice.id}"]`);
    await expect(invoiceRow).toBeVisible();
    await manageInvoice(page, invoiceRow);
    invoiceRow = page.locator(`[data-invoice-row="${targetInvoice.id}"]`);
    await expect(invoiceRow.locator('[data-invoice-issue-blocker]')).toHaveCount(0);
    const replacementIssueForm = invoiceRow.locator('form[action="?/issueInvoice"]');
    await expect(replacementIssueForm).toHaveCount(1);
    await stepUpFinance(page);
    const issueAfterReplacementResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/issueInvoice'),
    );
    await replacementIssueForm.getByRole('button', { name: 'Issue invoice', exact: true }).click();
    const issueAfterReplacementResponse = await issueAfterReplacementResponsePromise;
    expect(issueAfterReplacementResponse.status()).toBe(200);
    expect(await issueAfterReplacementResponse.text()).toContain('action.billing.invoiceIssued');
    await expect(invoiceRow).toContainText(/Issued|Sent|Partially paid|Paid|Overdue/u);
    expect(readInvoiceForReport(reportProjectId, reportPeriodStart, reportPeriodEnd)).toMatchObject(
      {
        id: targetInvoice.id,
        state: 'issued',
      },
    );
  });

  test('Owner can inspect users, clients, project IA and Finance/Admin configuration', async ({
    page,
  }) => {
    await signIn(page, 'owner');

    await page.goto(portal('/projects'));
    await expect(
      page.getByRole('heading', { name: 'Authorized projects', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await page.goto(portal('/projects?view=team'));
    await expect(page.locator('[data-team-directory]')).toBeVisible();
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await expect(page.locator('form[action="?view=team&/createInvitation"]')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create invitation', exact: true }),
    ).toBeVisible();

    await page.goto(portal('/projects'));

    const projectLink = page.locator('a[href*="/app/projects/"]').first();
    await expect(projectLink).toBeVisible();
    await projectLink.click();
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    for (const tab of ['Overview', 'Team', 'Reports & Files', 'Commercial', 'Billing'])
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Commercial', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Commercial configuration', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Finance configuration', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Billing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();

    await page.goto(portal('/finance?view=commercial'));
    await expect(
      page.getByRole('heading', { name: 'Finance overview', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Finance configuration', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Project commercial and time policy', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Overtime threshold (minutes)', { exact: true })).toBeVisible();
  });
});
