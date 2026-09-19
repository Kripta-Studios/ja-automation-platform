import { expect, test, type Locator, type Page } from '@playwright/test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  createDatabase,
  LocalizedPdfRepository,
  PortalRepository,
  V3Repository,
} from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import {
  CLIENT_ESSENTIAL_32_STEPS,
  clientEssentialFixture as fixture,
  expectAccessibleControls,
  expectCardTableRepresentation,
  expectNoHorizontalOverflow,
  expectResponsiveLayout,
  preflightClientEssentialOperationsEvidence,
  readSeededBusinessRows,
  signInFresh,
  assertRoleSession,
  type SeededBusinessRows,
  uatArtifactFile,
} from '../fixtures/client-essential-32-step-fixture.js';
import { portal } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { caddyBoundaryUrl, readCaddyBaseUrl } from './support/deployment-fixture.js';

/**
 * The executable Client Essential acceptance scenario from section 8 of the
 * specification.  This is intentionally a single serial browser journey: it
 * exercises mutations through the visible portal forms and then changes the
 * authenticated role with a clean session before the next owner of the data
 * acts.
 *
 * A failure is collected per step so one missing route does not hide later
 * findings.  The final aggregate assertion remains strict; no failure is
 * downgraded to a skip or an informational pass.
 */

// Global setup creates the disposable database before the test body runs. Do
// not resolve rows at module evaluation time: Playwright discovers test files
// before setup and the database may not exist yet.
let seeded: SeededBusinessRows;
const seededPeriod = fixture.period;
const date = '2026-08-24';
const uatBillingPeriod = { start: date, end: '2026-08-30' } as const;

const forbiddenFinanceKeyPattern =
  /"(?:client(?:_rate|_treatment)|clientRate|clientTreatment|billing(?:_treatment|_rate)|billingTreatment|tax(?:_profile|_bps|_rate|_amount)|taxProfile|taxBps|internal(?:_cost|_rate)|internalCost|contribution(?:_margin)?|margin|markup(?:_bps)?|overtime(?:_threshold|_rate|_multiplier)|overtimeThreshold|travel(?:_billable|_billing)|travelBillable)"\s*:/i;

type UatFailure = Readonly<{ number: number; title: string; error: string }>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function openInvoiceManage(page: Page, invoiceId: string): Promise<Locator> {
  const row = page.locator(`tr[data-invoice-row="${invoiceId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.locator('[data-ui="responsive-sheet"]')).toBeVisible();
  return page.locator(`[data-invoice-row="${invoiceId}"]`);
}

function fixtureRows(sql: string, ...values: SQLInputValue[]) {
  const database = new DatabaseSync(fixture.databasePath, { readOnly: true });
  try {
    return database.prepare(sql).all(...values);
  } finally {
    database.close();
  }
}

/** Execute the real fenced worker only inside this run's disposable fixture.
 * This supplies PDF readiness; step 30 independently requires production timer evidence.
 * All business commands, approvals and signed-copy submissions still use the UI.
 */
function runFixtureArtifactWorker() {
  const pointer = readE2EFixturePointer();
  expect(pointer.databasePath).toBe(fixture.databasePath);
  expect(pointer.documentRoot).toBe(fixture.documentRoot);
  expect(
    fixtureRows('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1'),
  ).toEqual([{ tenant_id: fixture.tenantId, deployment_id: fixture.deploymentId }]);
  expect(fixture.tenantId).toBe('e2e-client-essential-tenant');
  expect(fixture.deploymentId).toBe('e2e-client-essential-deployment');
  const previousRoot = process.env.JA_DOCUMENT_ROOT;
  process.env.JA_DOCUMENT_ROOT = pointer.documentRoot;
  const database = createDatabase(pointer.databasePath);
  try {
    return runArtifactJobs({
      documentRoot: pointer.documentRoot,
      repository: new PortalRepository(database.sqlite),
      v3: new V3Repository(database.sqlite),
      localizedPdf: new LocalizedPdfRepository(database.sqlite),
    });
  } finally {
    database.sqlite.close();
    if (previousRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
    else process.env.JA_DOCUMENT_ROOT = previousRoot;
  }
}

async function openFinanceConfiguration(page: Page, action: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Finance configuration', exact: true })
    .getByRole('button', { name: action, exact: true })
    .click();
}

async function openExpenseClassify(page: Page, expenseId: string): Promise<Locator> {
  await page
    .getByRole('searchbox', { name: 'Search: Expense treatment and planning', exact: true })
    .fill(expenseId);
  const row = page.locator(`[data-finance-expense-id="${expenseId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^(?:Classify|Review)$/ }).click();
  const classification = row.locator('[data-finance-expense-classification]');
  await expect(classification).toBeVisible();
  return classification;
}

async function runStep(
  stepNumber: number,
  body: () => Promise<void>,
  failures: UatFailure[],
  page: Page,
  testInfo: {
    attach: (
      name: string,
      options: { body: Buffer | string; contentType: string },
    ) => Promise<void>;
  },
): Promise<void> {
  const step = CLIENT_ESSENTIAL_32_STEPS.find((candidate) => candidate.number === stepNumber);
  if (!step) throw new Error(`UAT step ${stepNumber} is not in the canonical 32-step catalogue`);
  try {
    await test.step(`Step ${step.number}: ${step.title}`, body);
  } catch (error) {
    const failure = { number: step.number, title: step.title, error: messageOf(error) };
    failures.push(failure);
    await testInfo.attach(
      `client-essential-step-${String(step.number).padStart(2, '0')}-failure.json`,
      {
        body: JSON.stringify(failure, null, 2),
        contentType: 'application/json',
      },
    );
    try {
      await testInfo.attach(
        `client-essential-step-${String(step.number).padStart(2, '0')}-failure.png`,
        {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        },
      );
    } catch {
      // The primary failure is retained in the JSON attachment even if the
      // browser is already navigating or has closed its document.
    }
  }
}

async function navigate(page: Page, path: string): Promise<void> {
  const response = await page.goto(portal(path), { waitUntil: 'networkidle' });
  if (!response || response.status() >= 400)
    throw new Error(`Portal route ${path} returned HTTP ${response?.status() ?? 'no response'}`);
}

async function expectActionMessage(page: Page, pattern: RegExp): Promise<void> {
  const message = page.locator('[role="status"]').filter({ hasText: pattern }).first();
  await expect(message, `Expected action status matching ${pattern}`).toBeVisible({
    timeout: 8_000,
  });
}

async function submitAction(
  page: Page,
  actionName: string,
  submit: () => Promise<void>,
): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes(`?/${actionName}`),
  );
  await submit();
  const response = await responsePromise;
  if (response.ok()) return;
  const feedback = await page
    .locator('[role="alert"], [role="status"]')
    .allTextContents()
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
  throw new Error(
    `${actionName} returned HTTP ${response.status()}${feedback.length ? ` — ${feedback.join(' | ')}` : ''}`,
  );
}

async function selectOptionContaining(
  select: import('@playwright/test').Locator,
  text: string,
): Promise<string> {
  const value = await select.locator('option').evaluateAll((options, expected) => {
    const option = options.find((candidate) =>
      (candidate.textContent ?? '').toLowerCase().includes(String(expected).toLowerCase()),
    ) as HTMLOptionElement | undefined;
    return option?.value ?? '';
  }, text);
  if (!value) throw new Error(`No select option contains ${text}`);
  await select.selectOption(value);
  return value;
}

async function selectFirstValue(select: import('@playwright/test').Locator): Promise<string> {
  const value = await select.locator('option').evaluateAll((options) => {
    const option = options.find((candidate) => (candidate as HTMLOptionElement).value.trim());
    return option ? (option as HTMLOptionElement).value : '';
  });
  if (!value) throw new Error(`Select ${await select.getAttribute('name')} has no usable option`);
  await select.selectOption(value);
  return value;
}

async function projectDetailPath(page: Page, projectName: string): Promise<string> {
  const href = await page
    .locator('.project-list-link')
    .filter({ hasText: projectName })
    .locator('a')
    .first()
    .getAttribute('href');
  if (!href) throw new Error(`Created project ${projectName} is not present in the project list`);
  const url = new URL(href, page.url());
  const prefix = '/j-aautomation/app';
  if (!url.pathname.startsWith(prefix)) throw new Error(`Unexpected project href ${url.pathname}`);
  return url.pathname.slice(prefix.length);
}

async function expectWorkerProjection(page: Page, route: string): Promise<void> {
  const response = await page.request.get(portal(route));
  expect(response.status(), `Worker ${route} must be readable`).toBe(200);
  const html = await response.text();
  expect(html, `Worker ${route} must not serialize Finance-only fields`).not.toMatch(
    forbiddenFinanceKeyPattern,
  );
}

async function expectFinanceProjection(page: Page, route: string): Promise<void> {
  const response = await page.request.get(portal(route));
  expect(response.status(), `Finance ${route} must be readable`).toBe(200);
  expect(await page.locator('main').innerText()).toMatch(
    /Finance|Billing|Accounting|Contribution/i,
  );
}

async function expectInvoiceIdentifiers(page: Page): Promise<void> {
  const row = page
    .locator('[data-invoice-row]')
    .filter({ hasText: seeded.project.projectNumber })
    .first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(seeded.project.projectNumber);
  await expect(row).toContainText('Northline Mobility');
  await expect(row).toContainText('DEMO-PO-24017');
}

async function expectPrivateFinanceDenied(page: Page, role: 'worker' | 'manager'): Promise<void> {
  const financeResponse = await page.request.get(
    portal(`/finance?project=${encodeURIComponent(seeded.project.id)}`),
  );
  expect(financeResponse.status(), `${role} must not read Finance overview`).toBe(403);
  const exportResponse = await page.request.get(
    portal(
      `/api/projects/${encodeURIComponent(seeded.project.id)}/finance-export?periodStart=${seededPeriod.start}&periodEnd=${seededPeriod.end}`,
    ),
  );
  expect(exportResponse.status(), `${role} must not download Finance export`).toBe(403);
}

test.describe('Client Essential · executable 32-step acceptance journey', () => {
  test('one deterministic authenticated fixture covers steps 1–32', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');
    test.setTimeout(300_000);
    page.setDefaultTimeout(8_000);

    seeded = readSeededBusinessRows();
    const failures: UatFailure[] = [];
    const operationsEvidencePreflight = preflightClientEssentialOperationsEvidence({
      expectedTenantId: process.env.JA_E2E_OPERATIONS_TENANT_ID,
      expectedDeploymentId: process.env.JA_E2E_OPERATIONS_DEPLOYMENT_ID,
      expectedSha256: process.env.JA_E2E_OPERATIONS_EVIDENCE_SHA256,
    });
    await testInfo.attach('client-essential-operations-evidence-preflight.json', {
      body: JSON.stringify(
        operationsEvidencePreflight.status === 'READY'
          ? {
              status: 'READY',
              path: operationsEvidencePreflight.path,
              evidenceId: operationsEvidencePreflight.evidence.evidenceId,
              capturedAt: operationsEvidencePreflight.evidence.capturedAt,
              tenantId: operationsEvidencePreflight.evidence.tenantId,
              deploymentId: operationsEvidencePreflight.evidence.deploymentId,
              sha256: operationsEvidencePreflight.evidence.sha256,
              jobs: {
                status: operationsEvidencePreflight.evidence.jobs.status,
                automaticRuns: operationsEvidencePreflight.evidence.jobs.runs.length,
                manualProcessing: operationsEvidencePreflight.evidence.jobs.manualProcessing,
              },
              continuity: {
                status: operationsEvidencePreflight.evidence.continuity.status,
                ...(operationsEvidencePreflight.evidence.continuity.status === 'PASS'
                  ? {
                      remoteCopy: operationsEvidencePreflight.evidence.continuity.remoteCopy,
                      encrypted: operationsEvidencePreflight.evidence.continuity.encrypted,
                      restoreDrill:
                        operationsEvidencePreflight.evidence.continuity.restoreDrill.status,
                    }
                  : {
                      releaseBlocking:
                        operationsEvidencePreflight.evidence.continuity.releaseBlocking,
                      waivedBy: operationsEvidencePreflight.evidence.continuity.waivedBy,
                      localBackup:
                        operationsEvidencePreflight.evidence.continuity.localBackup.status,
                      rollback: operationsEvidencePreflight.evidence.continuity.rollback.status,
                    }),
              },
            }
          : {
              status: 'BLOCKED',
              prerequisite: operationsEvidencePreflight.prerequisite,
              code: operationsEvidencePreflight.code,
              message: operationsEvidencePreflight.message,
              ...(operationsEvidencePreflight.path
                ? { path: operationsEvidencePreflight.path }
                : {}),
            },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    let uatProjectId = '';
    let uatProjectPath = '';
    let uatTimeEntryId = '';
    const uatExpenseIds: string[] = [];
    let uatLaborBillingRuleId = '';
    let issuedInvoiceId = '';
    let uatCustomerReportId = '';
    let uatSignedSnapshotSha256 = '';
    let createdTimeSummary = 'Client Essential UAT actual time';
    const createdDailySummary = 'Client Essential UAT daily report';
    const createdTechnicalSystem = 'Client Essential UAT PLC';
    const requireOperationsEvidence = (prerequisite: 'automatic-jobs' | 'continuity-backup') => {
      if (operationsEvidencePreflight.status === 'BLOCKED') {
        throw new Error(
          `External prerequisite blocked for ${prerequisite}: ${operationsEvidencePreflight.code} — ${operationsEvidencePreflight.message}`,
        );
      }
      return operationsEvidencePreflight.evidence;
    };

    await runStep(
      1,
      async () => {
        await signInFresh(page, 'owner');
        await navigate(page, '/projects?view=team&directory=specialists');
        await expect(page.getByRole('button', { name: 'Create user', exact: true })).toBeVisible();
        const invitations = [
          [fixture.mutation.workerEmail, 'worker'],
          [fixture.mutation.managerEmail, 'project_manager'],
          [fixture.mutation.financeEmail, 'finance_admin'],
        ] as const;
        for (const [email, role] of invitations) {
          await page.goto(portal('/projects?view=team&directory=specialists'), {
            waitUntil: 'networkidle',
          });
          await page.getByRole('button', { name: 'Create user', exact: true }).click();
          await page
            .locator('label')
            .filter({ has: page.getByText('Access method', { exact: true }) })
            .locator('select')
            .selectOption({ label: 'Invitation link' });
          const form = page.locator('form[action="?view=team&/createInvitation"]');
          await expect(form).toBeVisible();
          await form.locator('input[name="email"]').fill(email);
          await form.locator('select[name="role"]').selectOption(role);
          await assertRoleSession(page, 'owner');
          await form.locator('select[name="emailChoice"]').selectOption('no');
          await form.getByRole('button', { name: 'Create invitation', exact: true }).click();
          await expectActionMessage(page, /invite|created/i);
        }
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      2,
      async () => {
        await signInFresh(page, 'owner');
        await navigate(page, '/projects');
        await page.getByRole('button', { name: 'New Client', exact: true }).click();
        const form = page.locator(
          '[data-project-workflow="new-client"] form[action="?/createClient"]',
        );
        await expect(form).toBeVisible();
        await form.locator('input[name="legalName"]').fill(fixture.mutation.legalName);
        await form.locator('input[name="displayName"]').fill(fixture.mutation.displayName);
        await form.locator('input[name="clientCode"]').fill(fixture.mutation.clientCode);
        await form.locator('select[name="currency"]').selectOption('USD');
        await form.locator('input[name="timezone"]').fill('America/New_York');
        await form.locator('input[name="billingContactName"]').fill('Client Essential Billing');
        await form
          .locator('input[name="billingEmail"]')
          .fill('billing@client-essential.example.test');
        await form
          .locator('textarea[name="billingAddress"]')
          .fill('Client Essential UAT billing address');
        await form.locator('input[name="paymentTermsDays"]').fill('30');
        await form.locator('input[name="poReference"]').fill(fixture.mutation.purchaseOrder);
        await form
          .locator('textarea[name="notes"]')
          .fill('Deterministic Client Essential acceptance fixture.');
        await form.getByRole('button', { name: 'Create client', exact: true }).click();
        await expectActionMessage(page, /client|created/i);
        await expect(
          page.locator('[data-client-id]').filter({ hasText: fixture.mutation.displayName }),
        ).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      3,
      async () => {
        await signInFresh(page, 'owner');
        await navigate(page, '/projects');
        await page.getByRole('button', { name: 'New Project', exact: true }).click();
        const form = page.locator(
          '[data-project-workflow="new-project"] form[action="?/createProject"]',
        );
        await expect(form).toBeVisible();
        await selectOptionContaining(
          form.locator('select[name="clientId"]'),
          fixture.mutation.displayName,
        );
        await form.locator('input[name="name"]').fill(fixture.mutation.projectName);
        await form.locator('input[name="costCenterCode"]').fill(fixture.mutation.costCenter);
        await form
          .locator('textarea[name="description"]')
          .fill('A deterministic Client Essential project.');
        await form.locator('input[name="projectAlias"]').fill('CE-UAT-2026');
        await form.locator('select[name="currency"]').selectOption('USD');
        const managerSelect = form.locator('select[name="projectManagerId"]');
        await selectFirstValue(managerSelect);
        await form.locator('select[name="billingModel"]').selectOption('tm_daily_minimum');
        await form.locator('input[name="timezone"]').fill('America/New_York');
        await form.locator('input[name="startDate"]').fill('2026-08-01');
        await form.locator('input[name="plannedEndDate"]').fill('2026-12-31');
        // Project configuration expresses daily controls in hours; the action
        // boundary converts them to the canonical persisted minute values.
        await form.locator('input[name="expectedHoursPerDay"]').fill('10');
        await form.locator('input[name="clientDailyMinimumHours"]').fill('9');
        await form.locator('select[name="budgetType"]').selectOption('combined');
        await form.locator('input[name="revenueBudgetMinor"]').fill('1500000');
        await form.locator('input[name="poCapMinor"]').fill('1800000');
        await form.locator('input[name="laborBudgetMinutes"]').fill('72000');
        await form.locator('input[name="travelBudgetMinor"]').fill('250000');
        await form.locator('input[name="weeklyCloseEnabled"]').check();
        await form.locator('input[name="dailyReportRequired"]').check();
        await form.locator('input[name="technicalReportingRequired"]').check();
        await form.getByRole('button', { name: 'Create project', exact: true }).click();
        await expectActionMessage(page, /project|created/i);
        uatProjectPath = await projectDetailPath(page, fixture.mutation.projectName);
        uatProjectId = uatProjectPath.split('/').filter(Boolean).pop() ?? '';
        expect(uatProjectId).toMatch(/^[0-9a-f-]{36}$/i);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      4,
      async () => {
        if (!uatProjectPath) throw new Error('BLOCKED by step 3: no UAT project route was created');
        await signInFresh(page, 'owner');
        await navigate(page, uatProjectPath);
        await page.locator('[data-project-edit-cta]').click();
        const form = page.locator('form.project-edit-form');
        await expect(form).toBeVisible();
        await form.locator('input[name="expectedHoursPerDay"]').fill('12');
        await form.locator('input[name="clientDailyMinimumHours"]').fill('10');
        await form.locator('input[name="plannedMinutes"]').fill('86400');
        await form.getByRole('button', { name: 'Save project', exact: true }).click();
        await expectActionMessage(page, /project|updated|saved/i);
        await page.locator('[data-project-edit-cta]').click();
        const saved = page.locator('form.project-edit-form:visible');
        await expect(saved.locator('input[name="expectedHoursPerDay"]')).toHaveValue('12');
        await expect(saved.locator('input[name="clientDailyMinimumHours"]')).toHaveValue('10');
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      5,
      async () => {
        if (!uatProjectPath) throw new Error('BLOCKED by step 3: no UAT project route was created');
        await signInFresh(page, 'owner');
        await navigate(page, uatProjectPath);
        await page.locator('[data-project-edit-cta]').click();
        const form = page.locator('form.project-edit-form:visible');
        await expect(form).toBeVisible();
        await form.locator('input[name="costCenterCode"]').fill(fixture.mutation.costCenter);
        await form.locator('input[name="poNumber"]').fill(fixture.mutation.purchaseOrder);
        await form.locator('select[name="billingModel"]').selectOption('tm_daily_minimum');
        await form.locator('input[name="budgetType"]').fill('combined');
        await form.locator('input[name="revenueBudgetMinor"]').fill('1500000');
        await form.locator('input[name="poCapMinor"]').fill('1800000');
        await form.locator('details.advanced-edit-fields summary').click();
        await form
          .locator('textarea[name="description"]')
          .fill('Configured UAT budget, PO, identifiers and commercial model.');
        await form.getByRole('button', { name: 'Save project', exact: true }).click();
        await expectActionMessage(page, /project|updated|saved/i);
        await expect(page.getByText(fixture.mutation.costCenter, { exact: true })).toBeVisible();
        await expect(page.getByText(fixture.mutation.purchaseOrder, { exact: true })).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      6,
      async () => {
        if (!uatProjectId || !uatProjectPath)
          throw new Error('BLOCKED by steps 3–5: no UAT project identity was created');
        await signInFresh(page, 'owner');
        await navigate(page, '/projects');
        await page.getByRole('button', { name: 'Assign Worker', exact: true }).click();
        const form = page.locator(
          '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
        );
        await expect(form).toBeVisible();
        await form.locator('select[name="projectId"]').selectOption(uatProjectId);
        await selectOptionContaining(form.locator('select[name="workerId"]'), seeded.worker.name);
        await expect(form.locator('input[name="assignmentRole"]')).toHaveValue('worker');
        await form.locator('input[name="startsOn"]').fill('2026-08-01');
        await form.locator('input[name="endsOn"]').fill('2026-12-31');
        await form.getByRole('button', { name: 'Assign', exact: true }).click();
        await expectActionMessage(page, /assignment|created/i);
        await navigate(page, uatProjectPath);
        await page.getByRole('tab', { name: 'Team', exact: true }).click();
        await expect(page.getByText(seeded.worker.name, { exact: true })).toBeVisible();
        await expect(page.getByText(/2026-08-01.*2026-12-31/s)).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      7,
      async () => {
        if (!uatProjectId)
          throw new Error('BLOCKED by step 3: no UAT project for commercial rules');
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await openFinanceConfiguration(page, 'Project commercial and time policy');
        const policy = page.locator('form[data-project-commercial-policy-form]');
        await expect(policy).toBeVisible();
        await policy.locator('select[name="projectId"]').selectOption(uatProjectId);
        await policy.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await policy.locator('input[name="overtimeEnabled"][type="checkbox"]').check();
        await policy.locator('input[name="overtimeThresholdMinutes"]').fill('480');
        await policy.locator('select[name="travelClientBillable"]').selectOption('true');
        await policy.locator('select[name="customerSignoffRequired"]').selectOption('true');
        await assertRoleSession(page, 'finance');
        await policy.getByRole('button', { name: 'Save project policy', exact: true }).click();
        await expectActionMessage(page, /policy|saved|updated/i);
        // Native form actions replace the query string with the action name.
        // Restore the scoped commercial workspace before inspecting its forms.
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        for (const [action, formAction] of [
          ['Worker compensation', 'createCompensationRule'],
          ['Internal loaded cost', 'createInternalCostRule'],
          ['Client labor rate', 'createClientLaborRate'],
        ] as const) {
          await openFinanceConfiguration(page, action);
          await expect(page.locator(`form[action="?/${formAction}"]`)).toBeVisible();
        }

        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        const issuingAuthority = page.locator('form[action="?/assignProjectLegalEntity"]');
        await expect(issuingAuthority).toBeVisible();
        await issuingAuthority.locator('select[name="projectId"]').selectOption(uatProjectId);
        await selectFirstValue(issuingAuthority.locator('select[name="legalEntityRevisionId"]'));
        await issuingAuthority.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await issuingAuthority
          .locator('textarea[name="reason"]')
          .fill('Bind the Client Essential UAT project to the reviewed issuing authority.');
        await assertRoleSession(page, 'finance');
        await submitAction(page, 'assignProjectLegalEntity', () =>
          issuingAuthority
            .getByRole('button', { name: 'Save issuing authority', exact: true })
            .click(),
        );
        await expectActionMessage(page, /issuing authority|assignment.*recorded/i);

        // Native form actions replace the query string with the action name.
        // Restore the selected project before creating project-scoped rates.
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        const clientRate = page.locator('form[action="?/createClientLaborRate"]');
        await openFinanceConfiguration(page, 'Client labor rates');
        const existingClientRates = await page
          .locator('[aria-label="Client labor rates"] .record-list-item')
          .count();
        await openFinanceConfiguration(page, 'Client labor rate');
        // The default visible choice is "All assigned workers", which
        // intentionally covers the UAT worker through project assignment.
        await clientRate.locator('input[name="category"]').fill('regular');
        await clientRate.locator('select[name="currency"]').selectOption('USD');
        await clientRate.locator('input[data-minor-target="hourlyRateMinor"]').fill('150.00');
        await clientRate.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await assertRoleSession(page, 'finance');
        await clientRate.getByRole('button', { name: 'Save client rate', exact: true }).click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await openFinanceConfiguration(page, 'Client labor rates');
        await expect(
          page.locator('[aria-label="Client labor rates"] .record-list-item'),
        ).toHaveCount(existingClientRates + 1);

        const internalCost = page.locator('form[action="?/createInternalCostRule"]');
        await openFinanceConfiguration(page, 'Assignment budget context / internal loaded cost');
        const existingInternalCosts = await page
          .locator('[aria-label="Internal cost rules"] .record-list-item')
          .count();
        await openFinanceConfiguration(page, 'Internal loaded cost');
        await selectOptionContaining(
          internalCost.locator('select[name="workerId"]'),
          seeded.worker.name,
        );
        await internalCost.locator('select[name="currency"]').selectOption('USD');
        await internalCost.locator('input[data-minor-target="hourlyRateMinor"]').fill('65.00');
        await internalCost.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await assertRoleSession(page, 'finance');
        await submitAction(page, 'createInternalCostRule', () =>
          internalCost.getByRole('button', { name: 'Save internal cost', exact: true }).click(),
        );
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await openFinanceConfiguration(page, 'Assignment budget context / internal loaded cost');
        await expect(
          page.locator('[aria-label="Internal cost rules"] .record-list-item'),
        ).toHaveCount(existingInternalCosts + 1);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      8,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT project for percentage rule');
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        const form = page.locator('form[action="?/createCompensationRule"]').first();
        await openFinanceConfiguration(page, 'Worker compensation');
        await expect(form).toBeVisible();
        await selectOptionContaining(form.locator('select[name="workerId"]'), seeded.worker.name);
        await form.locator('select[name="projectId"]').selectOption(uatProjectId);
        await form
          .locator('select[name="ruleType"]')
          .selectOption('PercentageOfEligibleClientLabor');
        await expect(form.locator('input[data-minor-target="rateMinor"]')).toHaveCount(0);
        await form.locator('input[data-bps-target="percentageBps"]').fill('55');
        await form.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await assertRoleSession(page, 'finance');
        await submitAction(page, 'createCompensationRule', () =>
          form.getByRole('button', { name: 'Save compensation rule', exact: true }).click(),
        );
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await openFinanceConfiguration(page, 'Compensation statement rules');
        await expect(
          page
            .locator('[aria-label="Compensation rules"] .record-list-item')
            .filter({ hasText: 'PercentageOfEligibleClientLabor' })
            .first(),
        ).toContainText('PercentageOfEligibleClientLabor');
        expect(
          fixtureRows(
            'SELECT percentage_bps FROM compensation_rule WHERE project_id=? AND worker_id=? AND rule_type=?',
            uatProjectId,
            seeded.worker.id,
            'PercentageOfEligibleClientLabor',
          ),
        ).toEqual([expect.objectContaining({ percentage_bps: 5500 })]);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      9,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT project for expense policy');
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await openFinanceConfiguration(page, 'Project commercial and time policy');
        await expect(page.locator('[data-project-commercial-policy-row]').last()).toContainText(
          'Travel client billable: Yes',
        );
        expect(
          fixtureRows(
            'SELECT travel_client_billable,overtime_threshold_minutes FROM project_commercial_policy WHERE project_id=? ORDER BY version DESC LIMIT 1',
            uatProjectId,
          ),
        ).toEqual([{ travel_client_billable: 1, overtime_threshold_minutes: 480 }]);
        await openFinanceConfiguration(page, 'Client labor rate');
        await expect(page.locator('form[action="?/createClientLaborRate"]')).toBeVisible();
        // The seeded closed project has immutable invoiced expenses. Inspect a
        // genuinely editable fixture source rather than expecting a forbidden CTA.
        const editable = fixtureRows(
          `SELECT id,project_id FROM expense WHERE invoice_id IS NULL AND billing_lock_id IS NULL
           AND billing_state NOT IN ('locked','invoiced','collected','paid') ORDER BY created_at,id LIMIT 1`,
        )[0];
        if (!editable)
          throw new Error('No editable seeded expense is available for policy inspection');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(String(editable.project_id))}`,
        );
        await openExpenseClassify(page, String(editable.id));
        await expect(page.locator('[data-finance-expense-classification]').first()).toBeVisible();
        const preset = page
          .locator('[data-finance-expense-classification]')
          .first()
          .locator('select[name="expensePreset"]');
        await expect(preset.locator('option[value="all_in"]')).toHaveCount(1);
        await expect(preset.locator('option[value="reimbursable_at_cost"]')).toHaveCount(1);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      10,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT project for billing streams');
        await signInFresh(page, 'finance');
        await navigate(page, '/billing');
        await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
        const createStream = async (
          streamType: 'labor' | 'expense',
          cadenceType: 'weekly' | 'monthly',
          templateId: 'labor-detailed' | 'expenses-detailed',
        ): Promise<string> => {
          await navigate(page, `/billing?view=streams&project=${encodeURIComponent(uatProjectId)}`);
          await page.getByRole('tab', { name: 'Billing streams', exact: true }).click();
          const existingIds = new Set(
            await page
              .locator('[data-billing-rule]')
              .evaluateAll((rows) =>
                rows.map((row) => row.getAttribute('data-billing-rule')).filter(Boolean),
              ),
          );
          await page.getByRole('tab', { name: 'Configure billing', exact: true }).click();
          const form = page.locator('form[action="?/createBillingRule"]');
          await expect(form).toBeVisible();
          for (const name of [
            'projectId',
            'streamType',
            'cadenceType',
            'legalEntityId',
            'taxProfileId',
            'currency',
            'templateId',
          ])
            await expect(form.locator(`select[name="${name}"]`)).toBeVisible();
          await form.locator('select[name="projectId"]').selectOption(uatProjectId);
          await form.locator('select[name="streamType"]').selectOption(streamType);
          await form.locator('select[name="cadenceType"]').selectOption(cadenceType);
          await form.locator('input[name="effectiveFrom"]').fill('2026-08-01');
          await selectFirstValue(form.locator('select[name="legalEntityId"]'));
          await selectFirstValue(form.locator('select[name="taxProfileId"]'));
          await form.locator('select[name="currency"]').selectOption('USD');
          await form.locator('select[name="templateId"]').selectOption(templateId);
          await form.locator('input[name="paymentTermsDays"]').fill('30');
          await form.locator('input[name="poNumberOverride"]').fill(fixture.mutation.purchaseOrder);
          await assertRoleSession(page, 'finance');
          await form.getByRole('button', { name: 'Save billing stream', exact: true }).click();
          await expectActionMessage(page, /billing stream|saved|created/i);
          await navigate(page, `/billing?view=streams&project=${encodeURIComponent(uatProjectId)}`);
          const createdId = (
            await page
              .locator('[data-billing-rule]')
              .evaluateAll((rows) =>
                rows.map((row) => row.getAttribute('data-billing-rule')).filter(Boolean),
              )
          ).find((id) => !existingIds.has(id));
          if (!createdId)
            throw new Error(`The ${streamType} billing rule identity was not exposed`);
          return createdId;
        };

        uatLaborBillingRuleId = await createStream('labor', 'weekly', 'labor-detailed');
        await navigate(page, '/billing');
        await createStream('expense', 'monthly', 'expenses-detailed');
        const createdRules = page
          .locator('[data-billing-rule]')
          .filter({ hasText: /Labor|Expenses/i });
        expect(
          await createdRules.count(),
          'both labor and expense stream rules must be visible',
        ).toBeGreaterThanOrEqual(2);
        expect(uatLaborBillingRuleId).toMatch(/^[0-9a-f-]{36}$/i);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      11,
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        await navigate(page, '/');
        await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
        await expectWorkerProjection(page, '/');
        await expectResponsiveLayout(page);
        await expectNoHorizontalOverflow(page);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      12,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT assignment project');
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        await navigate(page, '/time');
        await page.locator('[data-time-primary-cta]').click();
        const form = page.locator('form[data-time-entry-surface]').first();
        await selectOptionContaining(
          form.locator('select[name="projectId"]'),
          fixture.mutation.projectName,
        );
        await form.locator('input[name="workDate"]').fill(date);
        await form.locator('select[name="category"]').selectOption('regular');
        await form.locator('input[name="minutes"]').fill('480');
        createdTimeSummary = 'Client Essential UAT actual time · 480 minutes';
        await form.locator('textarea[name="summary"]').fill(createdTimeSummary);
        await form.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expectActionMessage(page, /time draft saved/i);
        await navigate(page, '/time');
        const row = page.locator('.time-record').filter({ hasText: createdTimeSummary }).first();
        await expect(row).toBeVisible();
        const timeHref = await row.locator('a.time-record-link').getAttribute('href');
        uatTimeEntryId = timeHref?.split('/').filter(Boolean).pop() ?? '';
        expect(uatTimeEntryId).toMatch(/^[0-9a-f-]{36}$/i);
        await row
          .locator('form[action="?/submitTime"]')
          .getByRole('button', { name: 'Submit', exact: true })
          .click();
        await expectActionMessage(page, /time submitted|submitted/i);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      13,
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        await navigate(page, `/pay?start=${seededPeriod.start}&end=${seededPeriod.end}`);
        await expect(page.getByRole('heading', { name: 'My Pay', exact: true })).toBeVisible();
        await expect(
          page.getByText(
            'Download your own activity, compensation, settlement, and reimbursement statement for this period.',
            { exact: true },
          ),
        ).toBeVisible();
        const settlements = page.getByRole('table', { name: 'Settlement status', exact: true });
        for (const heading of [
          'Payment state',
          'Expected payment',
          'Latest actual payment',
          'Actual paid',
          'Remaining',
        ]) {
          await expect(
            settlements.getByRole('columnheader', { name: heading, exact: true }),
          ).toBeVisible();
        }
        await expectWorkerProjection(
          page,
          `/pay?start=${seededPeriod.start}&end=${seededPeriod.end}`,
        );
        await expectResponsiveLayout(page);
        await expectNoHorizontalOverflow(page);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      14,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT report project');
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        await navigate(page, '/reports');
        await page
          .getByLabel('Create report', { exact: true })
          .getByRole('button', { name: 'New daily report', exact: true })
          .click();
        const form = page.locator('form[data-report-entry-surface="daily"]');
        await selectOptionContaining(
          form.locator('select[name="projectId"]'),
          fixture.mutation.projectName,
        );
        await form.locator('input[name="workDate"]').fill(date);
        await form.locator('input[name="siteShift"]').fill('Client Essential UAT first shift');
        await form.locator('textarea[name="summary"]').fill(createdDailySummary);
        await form
          .locator('textarea[name="tasksCompleted"]')
          .fill('Completed deterministic UAT tasks.');
        await form.locator('textarea[name="problemsFound"]').fill('No blocking operational issue.');
        await form
          .locator('textarea[name="correctiveActions"]')
          .fill('Recorded evidence for review.');
        await form.locator('textarea[name="openItems"]').fill('Review by PM.');
        await form.locator('textarea[name="nextDayPlan"]').fill('Close the acceptance window.');
        await form.getByRole('button', { name: 'Save daily report', exact: true }).click();
        await expectActionMessage(page, /daily.*draft.*saved/i);
        await navigate(page, '/reports');
        const row = page
          .locator('.report-register-card')
          .filter({ hasText: createdDailySummary })
          .first();
        await expect(row).toBeVisible();
        await row
          .locator('form[action="?/submitReport"]')
          .getByRole('button', { name: 'Submit', exact: true })
          .click();
        await expectActionMessage(page, /report submitted|submitted/i);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      15,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT technical report project');
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        await navigate(page, '/reports');
        await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
        await page
          .getByLabel('Create report', { exact: true })
          .getByRole('button', { name: 'New technical report', exact: true })
          .click();
        const form = page.locator('form[data-report-entry-surface="technical"]');
        await selectOptionContaining(
          form.locator('select[name="projectId"]'),
          fixture.mutation.projectName,
        );
        await form.locator('input[name="reportDate"]').fill(date);
        await form.locator('input[name="systemName"]').fill(createdTechnicalSystem);
        await form.locator('input[name="plantSite"]').fill('Client Essential UAT plant');
        await form.locator('input[name="areaLine"]').fill('Line UAT');
        await form.locator('input[name="stationMachine"]').fill('Station CE-01');
        await form.locator('input[name="systemType"]').fill('Controls');
        await form.locator('input[name="plcPlatform"]').fill('Rockwell Automation');
        await form.locator('input[name="controller"]').fill('ControlLogix 5580');
        await form.locator('input[name="hmiScada"]').fill('FactoryTalk View');
        await form.locator('input[name="networkProtocol"]').fill('EtherNet/IP');
        await form.locator('input[name="softwareVersion"]').fill('Studio 5000 v35');
        await form.locator('input[name="programReference"]').fill('CE-UAT-PLC-2026');
        await form
          .locator('textarea[name="problemSymptom"]')
          .fill('The UAT station sequence stopped before completion.');
        await form
          .locator('textarea[name="diagnosisRootCause"]')
          .fill('A timing mismatch prevented the completion signal from being retained.');
        await form
          .locator('textarea[name="changePerformed"]')
          .fill('Adjusted the timing and documented the Client Essential technical validation.');
        await form.locator('textarea[name="productionImpact"]').fill('No production bypass.');
        await form
          .locator('textarea[name="validation"]')
          .fill('Dry-cycle and controlled production checks.');
        await form.locator('textarea[name="validationResult"]').fill('Passed for the UAT fixture.');
        await form.locator('textarea[name="openRisk"]').fill('None for the deterministic fixture.');
        await form
          .locator('textarea[name="rollbackPlan"]')
          .fill('Restore the registered backup revision.');
        await form.getByRole('button', { name: 'Save PLC report', exact: true }).click();
        await expectActionMessage(page, /technical.*draft.*saved|PLC.*draft.*saved/i);
        await navigate(page, '/reports');
        await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
        const row = page
          .locator('.report-register-card')
          .filter({ hasText: createdTechnicalSystem })
          .first();
        await expect(row).toBeVisible();
        const reportHref = await row.locator('a.report-register-link').getAttribute('href');
        if (!reportHref) throw new Error('Technical report detail link is missing');
        await navigate(
          page,
          new URL(reportHref, page.url()).pathname.replace('/j-aautomation/app', ''),
        );
        const upload = page.locator('form[data-report-attachment-upload]');
        await expect(upload).toBeVisible();
        await upload.locator('select[name="attachmentKind"]').selectOption('plc_backup_before');
        await upload
          .locator('input[name="file"]')
          .setInputFiles(uatArtifactFile('client-essential-uat-plc-backup.pdf'));
        await upload
          .locator('textarea[name="notes"]')
          .fill('Private PLC backup tied to this report version.');
        await upload.getByRole('button', { name: 'Upload private evidence', exact: true }).click();
        await expectActionMessage(page, /uploaded|attachment|evidence/i);
        await expect(
          page.getByText('client-essential-uat-plc-backup.pdf', { exact: true }),
        ).toBeVisible();
        await navigate(page, '/reports');
        await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
        const submittedReport = page
          .locator('.report-register-card')
          .filter({ hasText: createdTechnicalSystem });
        await submittedReport
          .locator('form[action="?/submitReport"]')
          .getByRole('button', { name: 'Submit', exact: true })
          .click();
        await expectActionMessage(page, /report submitted|submitted/i);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      16,
      async () => {
        if (!uatProjectId) throw new Error('BLOCKED by step 3: no UAT expense project');
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        const createAndSubmitExpense = async (
          vendor: string,
          amount: string,
          category: 'hotel' | 'meals',
          receiptFile: string,
        ) => {
          await navigate(page, '/expenses');
          await page.locator('[data-expense-primary-cta]').click();
          const form = page.locator('form[data-expense-entry-surface]').first();
          await selectOptionContaining(
            form.locator('select[name="projectId"]'),
            fixture.mutation.projectName,
          );
          await form.locator('input[name="spentOn"]').fill(date);
          await form.locator('select[name="category"]').selectOption(category);
          await form.locator('input[name="vendor"]').fill(vendor);
          await form.locator('input[name="amount"]').fill(amount);
          await form.locator('select[name="currency"]').selectOption('USD');
          await form.locator('select[name="whoPaid"]').selectOption('worker');
          await form
            .locator('textarea[name="description"]')
            .fill('Receipt captured in the UAT expense flow.');
          await form.locator('input[name="paymentMethod"]').fill('Cash');
          await form.locator('input[name="receipt"]').setInputFiles(uatArtifactFile(receiptFile));
          await form.getByRole('button', { name: 'Save draft', exact: true }).click();
          await expectActionMessage(page, /expense draft saved/i);
          await navigate(page, '/expenses');
          const row = page.locator('[data-expense-record]').filter({ hasText: vendor }).first();
          await expect(row).toBeVisible();
          const href = await row.locator('a').first().getAttribute('href');
          const expenseId = href?.split('/').filter(Boolean).pop() ?? '';
          expect(expenseId).toMatch(/^[0-9a-f-]{36}$/i);
          uatExpenseIds.push(expenseId);
          await row
            .locator('form[action="?/submitExpense"]')
            .getByRole('button', { name: 'Submit', exact: true })
            .click();
          await expectActionMessage(page, /expense submitted|submitted/i);
        };
        await createAndSubmitExpense(
          'Client Essential UAT all-in receipt',
          '24.50',
          'hotel',
          'client-essential-uat-receipt.jpg',
        );
        await createAndSubmitExpense(
          'Client Essential UAT reimbursable receipt',
          '18.75',
          'meals',
          'client-essential-uat-expense-receipt.pdf',
        );
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      17,
      async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await signInFresh(page, 'manager');
        await navigate(page, '/approvals');
        await expect(page.getByRole('heading', { name: 'Approvals', exact: true })).toBeVisible();
        // Each approval refreshes the route data and resets the local domain
        // state to Time. Remount and explicitly reopen Expenses for every row;
        // the tab's accessible name includes its live count.
        for (const expenseId of uatExpenseIds) {
          await navigate(page, '/projects');
          await navigate(page, '/approvals');
          await page.getByRole('tab', { name: /^Expenses\b/ }).click();
          const expenseRow = page.locator(`[data-approval-row="${expenseId}"]`);
          await expect(expenseRow).toBeVisible();
          await expenseRow
            .locator('form[action="?/approveRecord"]')
            .first()
            .getByRole('button', { name: 'Approve', exact: true })
            .click();
          await expectActionMessage(page, /approval|approved|recorded/i);
        }
        if (!uatTimeEntryId) throw new Error('BLOCKED by step 12: no time entry identity');
        await navigate(page, '/projects');
        await navigate(page, '/approvals');
        const row = page.locator(`[data-approval-row="${uatTimeEntryId}"]`);
        await expect(row).toBeVisible();
        const approve = row.locator('form[action="?/approveRecord"]').first();
        await expect(approve).toBeVisible();
        await approve.getByRole('button', { name: 'Approve', exact: true }).click();
        await expectActionMessage(page, /approval|approved|recorded/i);
        const reports = fixtureRows(
          `SELECT id FROM daily_report WHERE project_id=? AND summary=?
           UNION ALL SELECT id FROM technical_report WHERE project_id=? AND system_name=?`,
          uatProjectId,
          createdDailySummary,
          uatProjectId,
          createdTechnicalSystem,
        );
        expect(reports).toHaveLength(2);
        for (const report of reports) {
          await navigate(
            page,
            `/approvals?tab=reports&project=${encodeURIComponent(uatProjectId)}`,
          );
          const reportRow = page.locator(`[data-approval-row="${String(report.id)}"]`);
          await reportRow
            .locator('form[action="?/reviewReport"]')
            .first()
            .getByRole('button', { name: 'Approve report', exact: true })
            .click();
          await expectActionMessage(page, /report|approved|recorded/i);
        }
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      18,
      async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await signInFresh(page, 'finance');
        if (!uatTimeEntryId) throw new Error('BLOCKED by step 12: no time entry identity');
        await navigate(page, '/approvals');
        const financeReview = page.locator(`[data-finance-review-row="${uatTimeEntryId}"]`);
        await expect(financeReview).toBeVisible();
        await financeReview.locator('select[name="billable"]').selectOption('yes');
        await assertRoleSession(page, 'finance');
        await financeReview
          .getByRole('button', { name: 'Record Finance review', exact: true })
          .click();
        await expectActionMessage(page, /finance.*review.*recorded/i);
        await navigate(page, `/finance?project=${encodeURIComponent(seeded.project.id)}`);
        await expectFinanceProjection(
          page,
          `/finance?project=${encodeURIComponent(seeded.project.id)}`,
        );
        await expect(page.locator('[data-finance-actual]')).toBeVisible();
        await expect(page.locator('[data-finance-expected]')).toBeVisible();
        await expect(page.getByText('Direct Project Result', { exact: true })).toBeVisible();
        await expect(
          page
            .locator('[data-finance-actual]')
            .getByText(/Contribution after approved direct cost/u),
        ).toBeVisible();
        await expect(page.getByText(/Expected|Actual/).first()).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      19,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, `/projects/${encodeURIComponent(seeded.project.id)}`);
        await expect(page.locator('[data-project-detail]')).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Commercial', exact: true })).toBeVisible();
        await page.getByRole('tab', { name: 'Commercial', exact: true }).click();
        await expect(
          page.getByText('Canonical project finance projection', { exact: true }),
        ).toBeVisible();
        await expect(page.getByText('Contribution', { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/source|drill-down|direct cost/i).first()).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      20,
      async () => {
        if (!uatExpenseIds[0]) throw new Error('BLOCKED by step 16: no all-in expense');
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        const classification = await openExpenseClassify(page, uatExpenseIds[0]);
        await expect(classification).toBeVisible();
        const expenseId = await classification.locator('input[name="expenseId"]').inputValue();
        expect(expenseId).toMatch(/^[0-9a-f-]{36}$/i);
        await classification.locator('select[name="expensePreset"]').selectOption('all_in');
        await classification.locator('select[name="taxPercent"]').selectOption('0');
        await classification
          .locator('textarea[name="reason"]')
          .fill('Client Essential all-in expense classification.');
        await assertRoleSession(page, 'finance');
        await classification
          .getByRole('button', { name: 'Save Finance classification', exact: true })
          .click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await expect(page.locator(`[data-finance-expense-id="${expenseId}"]`)).toContainText(
          'Classified',
        );
        expect(
          fixtureRows(
            'SELECT approval_state,billing_treatment,invoice_id FROM expense WHERE id=?',
            expenseId,
          ),
        ).toEqual([{ approval_state: 'approved', billing_treatment: 'all_in', invoice_id: null }]);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      21,
      async () => {
        if (!uatExpenseIds[1]) throw new Error('BLOCKED by step 16: no reimbursable expense');
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        const classification = await openExpenseClassify(page, uatExpenseIds[1]);
        await classification
          .locator('select[name="expensePreset"]')
          .selectOption('reimbursable_at_cost');
        await classification.locator('select[name="taxPercent"]').selectOption('0');
        await classification
          .locator('textarea[name="reason"]')
          .fill('Client Essential reimbursable expense classification.');
        await assertRoleSession(page, 'finance');
        await classification
          .getByRole('button', { name: 'Save Finance classification', exact: true })
          .click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await expect(
          page.getByText('Expected client recovery', { exact: true }).first(),
        ).toBeVisible();
        expect(
          fixtureRows(
            'SELECT approval_state,billing_treatment FROM expense WHERE id=?',
            uatExpenseIds[1],
          ),
        ).toEqual([{ approval_state: 'approved', billing_treatment: 'reimbursable_at_cost' }]);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      22,
      async () => {
        if (!uatLaborBillingRuleId || !uatTimeEntryId)
          throw new Error('BLOCKED by steps 10/12: the causal labor billing scope is missing');
        const invoiceScope = [uatLaborBillingRuleId, uatBillingPeriod.start, uatBillingPeriod.end];
        expect(
          fixtureRows(
            'SELECT id FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=?',
            ...invoiceScope,
          ),
        ).toHaveLength(0);
        expect(
          fixtureRows(
            'SELECT customer_signoff_required FROM project_commercial_policy WHERE project_id=? ORDER BY version DESC LIMIT 1',
            uatProjectId,
          ),
        ).toEqual([{ customer_signoff_required: 1 }]);
        await signInFresh(page, 'finance');
        await navigate(page, `/billing?view=streams&project=${encodeURIComponent(uatProjectId)}`);
        const rule = page.locator(`[data-billing-rule="${uatLaborBillingRuleId}"]`);
        const draftForm = rule.locator('form[action="?/createDraft"]');
        await draftForm.locator('input[name="periodStart"]').fill(uatBillingPeriod.start);
        await draftForm.locator('input[name="periodEnd"]').fill(uatBillingPeriod.end);
        await submitAction(page, 'createDraft', () =>
          draftForm.getByRole('button', { name: 'Create invoice draft', exact: true }).click(),
        );
        await expectActionMessage(page, /invoice.*draft|draft.*created|built/i);
        const drafts = fixtureRows(
          'SELECT id,project_id,state FROM invoice WHERE billing_rule_id=? AND period_start=? AND period_end=?',
          ...invoiceScope,
        );
        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ project_id: uatProjectId, state: 'draft' });
        issuedInvoiceId = String(drafts[0]!.id);
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        const draft = await openInvoiceManage(page, issuedInvoiceId);
        await draft
          .locator('form[action="?/approveInvoice"]')
          .getByRole('button', { name: 'Approve', exact: true })
          .click();
        await expectActionMessage(page, /invoice|approved/i);
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        const blocked = await openInvoiceManage(page, issuedInvoiceId);
        const deniedResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' && response.url().includes('?/issueInvoice'),
        );
        await blocked
          .locator('form[action="?/issueInvoice"]')
          .getByRole('button', { name: 'Issue invoice', exact: true })
          .click();
        const denied = await deniedResponse;
        expect(denied.status()).toBe(409);
        expect(await denied.text()).toContain('customer_signoff_required');
        expect(fixtureRows('SELECT state FROM invoice WHERE id=?', issuedInvoiceId)).toEqual([
          { state: 'approved' },
        ]);
        await expect(page.locator('[data-issue-blocker]')).toBeVisible();

        // Close the exact labor stream through its product command. This locks
        // the approved sources and creates the report pair for this invoice.
        await navigate(
          page,
          `/billing?view=streams&project=${encodeURIComponent(uatProjectId)}&focus=${encodeURIComponent(uatLaborBillingRuleId)}`,
        );
        const closeDetails = page.locator(
          `[data-billing-rule="${uatLaborBillingRuleId}"] details.billing-section__close-sources`,
        );
        await closeDetails.locator('summary').click();
        const close = closeDetails.locator('form[action="?/closePeriod"]');
        await close.locator('input[name="periodStart"]').fill(uatBillingPeriod.start);
        await close.locator('input[name="periodEnd"]').fill(uatBillingPeriod.end);
        await close.locator('select[name="reportLocale"]').selectOption('en');
        await submitAction(page, 'closePeriod', () =>
          close.getByRole('button', { name: 'Close sources', exact: true }).click(),
        );
        await expectActionMessage(page, /period closed|sources locked/i);
        expect(
          fixtureRows(
            'SELECT state FROM billing_period WHERE billing_rule_id=? AND period_start=? AND period_end=?',
            ...invoiceScope,
          ),
        ).toEqual([{ state: 'closed' }]);
        const reports = fixtureRows(
          'SELECT id,audience FROM period_report WHERE project_id=? AND period_start=? AND period_end=? ORDER BY audience',
          uatProjectId,
          uatBillingPeriod.start,
          uatBillingPeriod.end,
        );
        expect(reports.map((report) => report.audience)).toEqual(['customer', 'internal']);
        uatCustomerReportId = String(reports.find((report) => report.audience === 'customer')!.id);
        await navigate(page, '/reports');
        await page.locator('details.report-generator > summary').click();
        await page.locator('[data-report-generator-cta]').click();
        const form = page.locator('form[action="?/generatePeriodReports"]');
        await form.locator('select[name="projectId"]').selectOption(uatProjectId);
        await form.locator('input[name="periodStart"]').fill(uatBillingPeriod.start);
        await form.locator('input[name="periodEnd"]').fill(uatBillingPeriod.end);
        await form.locator('select[name="reportLocale"]').selectOption('en');
        await submitAction(page, 'generatePeriodReports', () =>
          form.getByRole('button', { name: 'Refresh reports', exact: true }).click(),
        );
        await expectActionMessage(page, /period reports|queued|refreshed/i);
        const workerRuns = [];
        for (let attempt = 0; attempt < 5; attempt++) {
          const run = runFixtureArtifactWorker();
          workerRuns.push(run);
          expect(run.failed, JSON.stringify(workerRuns)).toBe(0);
          if (
            fixtureRows('SELECT pdf_sha256 FROM period_report WHERE id=?', uatCustomerReportId)[0]
              ?.pdf_sha256
          )
            break;
        }
        await testInfo.attach('client-essential-fixture-artifact-worker.json', {
          body: JSON.stringify(workerRuns, null, 2),
          contentType: 'application/json',
        });
        const rendered = fixtureRows(
          'SELECT snapshot_json,snapshot_version,snapshot_sha256,pdf_sha256,pdf_byte_length FROM period_report WHERE id=?',
          uatCustomerReportId,
        )[0]!;
        const snapshot = JSON.parse(String(rendered.snapshot_json));
        expect(snapshot.project.id).toBe(uatProjectId);
        expect(snapshot.periodStart).toBe(uatBillingPeriod.start);
        expect(snapshot.periodEnd).toBe(uatBillingPeriod.end);
        expect(snapshot.audience).toBe('customer');
        expect(snapshot.customerPrivacyVersion).toBeTruthy();
        expect(String(rendered.snapshot_json)).not.toMatch(forbiddenFinanceKeyPattern);
        for (const forbidden of [
          'financialSummary',
          'commercialSummary',
          'commercialCalculation',
          'expenses',
        ])
          expect(snapshot).not.toHaveProperty(forbidden);
        expect(snapshot.timeSummary).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: uatTimeEntryId, minutes: 480 })]),
        );
        expect(
          fixtureRows(
            'SELECT source_id FROM report_source WHERE report_id=? AND source_type=?',
            uatCustomerReportId,
            'time_entry',
          ),
        ).toEqual([{ source_id: uatTimeEntryId }]);
        expect(String(rendered.pdf_sha256)).toMatch(/^[a-f0-9]{64}$/u);
        expect(Number(rendered.pdf_byte_length)).toBeGreaterThan(0);
        await navigate(page, `/reports/period/${encodeURIComponent(uatCustomerReportId)}`);
        await expect(page.locator('[data-signoff-form]')).toHaveCount(0);
        const approve = page.locator('form[data-period-report-approval]');
        await expect(approve.locator('input[name="expectedSnapshotVersion"]')).toHaveValue(
          String(rendered.snapshot_version),
        );
        await expect(approve.locator('input[name="expectedSnapshotSha256"]')).toHaveValue(
          String(rendered.snapshot_sha256),
        );
        await submitAction(page, 'approve', () =>
          approve.getByRole('button', { name: 'Approve customer report', exact: true }).click(),
        );
        await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
          'data-signoff-state',
          'ready_for_signature',
        );
        // A ready and approved PDF alone must still not release this invoice.
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        const unsignedInvoice = await openInvoiceManage(page, issuedInvoiceId);
        const unsignedResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' && response.url().includes('?/issueInvoice'),
        );
        await unsignedInvoice
          .locator('form[action="?/issueInvoice"]')
          .getByRole('button', { name: 'Issue invoice', exact: true })
          .click();
        const unsignedDenied = await unsignedResponse;
        expect(unsignedDenied.status()).toBe(409);
        expect(await unsignedDenied.text()).toContain('customer_signoff_required');
        await expect(
          page.locator('[data-issue-blocker]').getByRole('link', { name: 'Open sign-off' }),
        ).toHaveAttribute('href', `/j-aautomation/app/reports/period/${uatCustomerReportId}`);
        expect(fixtureRows('SELECT state FROM invoice WHERE id=?', issuedInvoiceId)).toEqual([
          { state: 'approved' },
        ]);
        await navigate(page, `/reports/period/${encodeURIComponent(uatCustomerReportId)}`);
        const pdfLink = page.getByRole('link', { name: 'Preview customer-safe PDF', exact: true });
        const pdf = await page.request.get(
          new URL((await pdfLink.getAttribute('href'))!, page.url()).toString(),
        );
        expect(pdf.status()).toBe(200);
        expect(pdf.headers()['content-type']).toMatch(/^application\/pdf/u);
        const bytes = await pdf.body();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(rendered.pdf_sha256);
        expect(bytes.byteLength).toBe(Number(rendered.pdf_byte_length));
        const sign = page.locator('form[data-signoff-form]');
        await sign
          .locator('input[name="signerName"]')
          .fill('Synthetic Client Essential UAT Signer');
        await sign
          .locator('input[name="signerIdentity"]')
          .fill('synthetic-uat-signer@example.test');
        await sign
          .locator('input[name="signatureDate"]')
          .fill(new Date().toISOString().slice(0, 10));
        await sign.locator('input[name="signatureFile"]').setInputFiles({
          name: 'synthetic-uat-signed-copy.pdf',
          mimeType: 'application/pdf',
          buffer: bytes,
        });
        await submitAction(page, 'sign', () =>
          sign
            .getByRole('button', { name: 'Record verified signed-copy evidence', exact: true })
            .click(),
        );
        await expect(page.locator('[data-signoff-state]')).toHaveAttribute(
          'data-signoff-state',
          'signed',
        );
        uatSignedSnapshotSha256 = String(rendered.snapshot_sha256);
        expect(
          fixtureRows(
            'SELECT snapshot_version,snapshot_sha256,report_pdf_sha256 FROM customer_conformity WHERE period_report_id=?',
            uatCustomerReportId,
          ),
        ).toEqual([
          {
            snapshot_version: rendered.snapshot_version,
            snapshot_sha256: uatSignedSnapshotSha256,
            report_pdf_sha256: rendered.pdf_sha256,
          },
        ]);
        expect(fixtureRows('SELECT state FROM invoice WHERE id=?', issuedInvoiceId)).toEqual([
          { state: 'approved' },
        ]);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      23,
      async () => {
        if (!issuedInvoiceId || !uatCustomerReportId || !uatSignedSnapshotSha256)
          throw new Error(
            'BLOCKED by step 22: the same labor invoice lacks its verified customer report/signature',
          );
        await signInFresh(page, 'finance');
        await navigate(page, '/billing?view=invoices');
        await expectInvoiceIdentifiers(page);
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        expect(
          fixtureRows(
            'SELECT project_id,billing_rule_id,period_start,period_end,state FROM invoice WHERE id=?',
            issuedInvoiceId,
          ),
        ).toEqual([
          {
            project_id: uatProjectId,
            billing_rule_id: uatLaborBillingRuleId,
            period_start: uatBillingPeriod.start,
            period_end: uatBillingPeriod.end,
            state: 'approved',
          },
        ]);
        const issueable = await openInvoiceManage(page, issuedInvoiceId);
        const issue = issueable.locator('form[action="?/issueInvoice"]');
        await expect(issue).toBeVisible();
        await assertRoleSession(page, 'finance');
        await submitAction(page, 'issueInvoice', () =>
          issue.getByRole('button', { name: 'Issue invoice', exact: true }).click(),
        );
        await expectActionMessage(page, /invoice|issued|sent/i);
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        const issuedRow = page.locator(`tr[data-invoice-row="${issuedInvoiceId}"]`);
        await expect(issuedRow).toContainText(/Issued|Sent|Partially paid|Paid|Overdue/i);
        await expect(issuedRow.locator('[data-invoice-pdf-status]')).toHaveAttribute(
          'data-invoice-pdf-status',
          /queued|running|ready/,
        );
        expect(
          fixtureRows(
            'SELECT source_id FROM invoice_source WHERE invoice_id=? AND source_type=?',
            issuedInvoiceId,
            'time',
          ),
        ).toEqual([{ source_id: uatTimeEntryId }]);
        expect(
          fixtureRows('SELECT snapshot_sha256 FROM period_report WHERE id=?', uatCustomerReportId),
        ).toEqual([{ snapshot_sha256: uatSignedSnapshotSha256 }]);
        expect(
          fixtureRows(
            'SELECT snapshot_sha256 FROM customer_conformity WHERE period_report_id=?',
            uatCustomerReportId,
          ),
        ).toEqual([{ snapshot_sha256: uatSignedSnapshotSha256 }]);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      24,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        if (!issuedInvoiceId) throw new Error('BLOCKED by step 23: no issued invoice identity');
        const issued = await openInvoiceManage(page, issuedInvoiceId);
        await issued.locator('summary').filter({ hasText: 'Record payment' }).click();
        const paymentForm = issued.locator('form[action="?/recordPayment"]');
        await expect(paymentForm).toBeVisible();
        await paymentForm.locator('input[name="amount"]').fill('1.00');
        await paymentForm
          .locator('input[name="receivedOn"]')
          .fill(new Date().toISOString().slice(0, 10));
        await paymentForm
          .locator('input[name="reference"]')
          .fill('Client Essential UAT partial collection');
        await assertRoleSession(page, 'finance');
        await paymentForm.getByRole('button', { name: 'Record payment', exact: true }).click();
        await expectActionMessage(page, /payment recorded|recorded/i);
        await navigate(page, `/billing?view=invoices&project=${encodeURIComponent(uatProjectId)}`);
        await expect(page.locator(`tr[data-invoice-row="${issuedInvoiceId}"]`)).toContainText(
          /Partially paid|Paid/i,
        );
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      25,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, '/ledger');
        await expect(
          page.getByRole('heading', { name: 'Collections / Ledger', exact: true }).first(),
        ).toBeVisible();
        const ledger = page.getByRole('table', {
          name: 'Master Invoice / Cost / Collection Ledger',
        });
        await expect(ledger).toBeVisible();
        await expect(
          ledger.getByRole('columnheader', { name: 'Contribution', exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/Collected|Outstanding|Payment/i).first()).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      26,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, '/accounting');
        const form = page.locator('form[action="?/createAccountingPack"]');
        await expect(form).toBeVisible();
        await form.locator('input[name="periodStart"]').fill(seededPeriod.start);
        await form.locator('input[name="periodEnd"]').fill(seededPeriod.end);
        await form.locator('select[name="reportLocale"]').selectOption('en');
        await assertRoleSession(page, 'finance');
        await submitAction(page, 'createAccountingPack', () =>
          form.getByRole('button', { name: 'Generate pack', exact: true }).click(),
        );
        await expectActionMessage(page, /accounting|pack|queued|generated/i);
        await expect(
          page.getByRole('heading', { name: 'Accounting Pack register', exact: true }),
        ).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      27,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, '/accounting');
        const pack = page.locator('.accounting-pack-artifact-row').first();
        await expect(pack).toBeVisible();
        const statuses = await pack
          .locator('[data-ui="status-badge"]')
          .evaluateAll((elements) =>
            elements.map(
              (element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
            ),
          );
        expect(
          statuses.length,
          'Accounting Pack must expose every artifact status',
        ).toBeGreaterThanOrEqual(5);
        expect(
          statuses.every((status) => /Ready|Failed|Processing|Queued|Pending/i.test(status)),
        ).toBe(true);
        const nonReadyLinks = await pack
          .locator('a.preview-link')
          .evaluateAll(
            (links) =>
              links.filter((link) => !/Ready/i.test(link.getAttribute('aria-label') ?? '')).length,
          );
        expect(
          nonReadyLinks,
          'non-ready Accounting Pack artifacts must not be download links',
        ).toBe(0);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      28,
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signInFresh(page, 'worker');
        await expectPrivateFinanceDenied(page, 'worker');
        await signInFresh(page, 'manager');
        await expectPrivateFinanceDenied(page, 'manager');
        await expectResponsiveLayout(page);
        await expectNoHorizontalOverflow(page);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      29,
      async () => {
        await signInFresh(page, 'worker');
        for (const viewport of [
          { width: 360, height: 800 },
          { width: 390, height: 844 },
          { width: 768, height: 1024 },
          { width: 1440, height: 900 },
        ]) {
          await page.setViewportSize(viewport);
          for (const [route, heading] of [
            ['/', 'Today'],
            ['/time', 'Time entries'],
            ['/reports', 'Reports'],
            ['/expenses', 'Expenses and reimbursements'],
          ] as const) {
            await navigate(page, route);
            await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
            await expectAccessibleControls(page);
            await expectCardTableRepresentation(page);
            await expectResponsiveLayout(page);
            await expectNoHorizontalOverflow(page);
          }
        }
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      30,
      async () => {
        const evidence = requireOperationsEvidence('automatic-jobs');
        await signInFresh(page, 'owner');
        const response = await page.request.get('http://127.0.0.1:4174/j-aautomation/health/ready');
        expect(response.status(), 'readiness endpoint must be reachable').toBe(200);
        const body = (await response.json()) as { status?: unknown };
        expect(body.status).toBe('ok');
        const health = await page.request.get(portal('/api/health'));
        expect(health.status()).toBe(200);
        const healthBody = (await health.json()) as { job?: { queue?: unknown }; status?: unknown };
        expect(healthBody.status).toBe('ok');
        expect(healthBody.job?.queue).toBe('sqlite');
        expect(evidence.jobs.status).toBe('PASS');
        expect(evidence.jobs.manualProcessing).toBe(false);
        expect(
          evidence.jobs.runs.length,
          'operations evidence must prove two automatic timer runs',
        ).toBeGreaterThanOrEqual(2);
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      31,
      async () => {
        const evidence = requireOperationsEvidence('continuity-backup');
        await signInFresh(page, 'owner');
        const response = await page.request.get('http://127.0.0.1:4174/j-aautomation/health/ready');
        expect(response.status()).toBe(200);
        if (evidence.continuity.status === 'PASS') {
          expect(evidence.continuity.remoteCopy).toBe(true);
          expect(evidence.continuity.encrypted).toBe(true);
          expect(evidence.continuity.restoreDrill.status).toBe('PASS');
        } else {
          expect(evidence.continuity.releaseBlocking).toBe(false);
          expect(evidence.continuity.waivedBy).toBe('owner');
          expect(evidence.continuity.localBackup.status).toBe('PASS');
          expect(evidence.continuity.rollback.status).toBe('PASS');
        }
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      32,
      async () => {
        const response = await page.request.get('http://127.0.0.1:4174/j-aautomation/health/live');
        expect(response.status()).toBe(200);
        const body = (await response.json()) as { status?: unknown };
        expect(body.status).toBe('ok');
        const caddyBaseUrl = readCaddyBaseUrl();
        if (!caddyBaseUrl) {
          throw new Error(
            'External prerequisite blocked for caddy-boundary: set JA_E2E_CADDY_BASE_URL to the deployed Caddy origin; local preview is not Caddy evidence.',
          );
        }
        const deployed = await page.request.get(caddyBoundaryUrl(caddyBaseUrl, '/health/live'));
        expect(deployed.status()).toBe(200);
        const site = await page.request.get(caddyBoundaryUrl(caddyBaseUrl, '/j-aautomation/en'));
        expect(site.status()).toBe(200);
        const login = await page.request.get(
          caddyBoundaryUrl(caddyBaseUrl, '/j-aautomation/app/login'),
        );
        expect(login.status()).toBe(200);
        const privateHealth = await page.request.get(
          caddyBoundaryUrl(caddyBaseUrl, '/j-aautomation/health/ready'),
        );
        expect(privateHealth.status()).toBe(404);
      },
      failures,
      page,
      testInfo,
    );

    await testInfo.attach('client-essential-32-step-results.json', {
      body: JSON.stringify(
        {
          fixture: fixture.mutation,
          steps: CLIENT_ESSENTIAL_32_STEPS,
          failures,
          operationsEvidence:
            operationsEvidencePreflight.status === 'READY'
              ? {
                  status: 'READY',
                  path: operationsEvidencePreflight.path,
                  evidenceId: operationsEvidencePreflight.evidence.evidenceId,
                  capturedAt: operationsEvidencePreflight.evidence.capturedAt,
                  sha256: operationsEvidencePreflight.evidence.sha256,
                  jobs: {
                    status: operationsEvidencePreflight.evidence.jobs.status,
                    automaticRuns: operationsEvidencePreflight.evidence.jobs.runs.length,
                    manualProcessing: operationsEvidencePreflight.evidence.jobs.manualProcessing,
                  },
                  continuity: {
                    status: operationsEvidencePreflight.evidence.continuity.status,
                    ...(operationsEvidencePreflight.evidence.continuity.status === 'PASS'
                      ? {
                          remoteCopy: operationsEvidencePreflight.evidence.continuity.remoteCopy,
                          encrypted: operationsEvidencePreflight.evidence.continuity.encrypted,
                          restoreDrill:
                            operationsEvidencePreflight.evidence.continuity.restoreDrill.status,
                        }
                      : {
                          releaseBlocking:
                            operationsEvidencePreflight.evidence.continuity.releaseBlocking,
                          waivedBy: operationsEvidencePreflight.evidence.continuity.waivedBy,
                          localBackup:
                            operationsEvidencePreflight.evidence.continuity.localBackup.status,
                          rollback: operationsEvidencePreflight.evidence.continuity.rollback.status,
                        }),
                  },
                }
              : {
                  status: 'BLOCKED',
                  prerequisite: operationsEvidencePreflight.prerequisite,
                  code: operationsEvidencePreflight.code,
                  message: operationsEvidencePreflight.message,
                  ...(operationsEvidencePreflight.path
                    ? { path: operationsEvidencePreflight.path }
                    : {}),
                },
          status: failures.length === 0 ? 'PASS' : 'NOT_READY',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    expect(
      failures,
      'Client Essential 32-step UAT failures (see attached per-step evidence)',
    ).toEqual([]);
  });
});
