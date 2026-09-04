import { expect, test, type Locator, type Page } from '@playwright/test';
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
  stepUp,
  type SeededBusinessRows,
  uatArtifactFile,
} from '../fixtures/client-essential-32-step-fixture.js';
import { portal } from './auth.js';
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

async function openExpenseClassify(page: Page, index = 0): Promise<Locator> {
  await page.getByRole('button', { name: 'Classify', exact: true }).nth(index).click();
  const classification = page.locator('[data-finance-expense-classification]').first();
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
    let uatLaborBillingRuleId = '';
    let issuedInvoiceId = '';
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
        await navigate(page, '/projects?view=team');
        await expect(page.getByRole('button', { name: 'Create user', exact: true })).toBeVisible();
        const invitations = [
          [fixture.mutation.workerEmail, 'worker'],
          [fixture.mutation.managerEmail, 'project_manager'],
          [fixture.mutation.financeEmail, 'finance_admin'],
        ] as const;
        for (const [email, role] of invitations) {
          await page.goto(portal('/projects?view=team'), { waitUntil: 'networkidle' });
          await page.getByRole('button', { name: 'Create user', exact: true }).click();
          const form = page.locator('form[action="?view=team&/createInvitation"]');
          await expect(form).toBeVisible();
          await form.locator('input[name="email"]').fill(email);
          await form.locator('select[name="role"]').selectOption(role);
          await stepUp(page, 'owner');
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
        await form.locator('input[name="assignmentRole"]').fill('worker');
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
        await navigate(page, '/finance?view=commercial');
        const policy = page.locator('form[data-project-commercial-policy-form]');
        await expect(policy).toBeVisible();
        await policy.locator('select[name="projectId"]').selectOption(uatProjectId);
        await policy.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await policy.locator('input[name="overtimeEnabled"][type="checkbox"]').check();
        await policy.locator('input[name="overtimeThresholdMinutes"]').fill('480');
        await policy.locator('select[name="travelClientBillable"]').selectOption('true');
        await policy.locator('select[name="customerSignoffRequired"]').selectOption('false');
        await stepUp(page, 'finance');
        await policy.getByRole('button', { name: 'Save project policy', exact: true }).click();
        await expectActionMessage(page, /policy|saved|updated/i);
        // Native form actions replace the query string with the action name.
        // Restore the scoped commercial workspace before inspecting its forms.
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await expect(page.locator('form[action="?/createCompensationRule"]')).toBeVisible();
        await expect(page.locator('form[action="?/createInternalCostRule"]')).toBeVisible();
        await expect(page.locator('form[action="?/createClientLaborRate"]')).toBeVisible();

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
        await stepUp(page, 'finance');
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
        const existingClientRates = await page
          .locator('[aria-label="Client labor rates"] .record-list-item')
          .count();
        // The default visible choice is "All assigned workers", which
        // intentionally covers the UAT worker through project assignment.
        await clientRate.locator('input[name="category"]').fill('regular');
        await clientRate.locator('select[name="currency"]').selectOption('USD');
        await clientRate.locator('input[data-minor-target="hourlyRateMinor"]').fill('150.00');
        await clientRate.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await stepUp(page, 'finance');
        await clientRate.getByRole('button', { name: 'Save client rate', exact: true }).click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await expect(
          page.locator('[aria-label="Client labor rates"] .record-list-item'),
        ).toHaveCount(existingClientRates + 1);

        const internalCost = page.locator('form[action="?/createInternalCostRule"]');
        const existingInternalCosts = await page
          .locator('[aria-label="Internal cost rules"] .record-list-item')
          .count();
        await selectFirstValue(internalCost.locator('select[name="workerId"]'));
        await internalCost.locator('select[name="currency"]').selectOption('USD');
        await internalCost.locator('input[data-minor-target="hourlyRateMinor"]').fill('65.00');
        await internalCost.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await stepUp(page, 'finance');
        await internalCost.getByRole('button', { name: 'Save internal cost', exact: true }).click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
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
        await selectFirstValue(form.locator('select[name="workerId"]'));
        await form.locator('select[name="projectId"]').selectOption(uatProjectId);
        await form
          .locator('select[name="ruleType"]')
          .selectOption('PercentageOfEligibleClientLabor');
        await form.locator('input[data-minor-target="rateMinor"]').fill('0.00');
        await form.locator('input[data-bps-target="percentageBps"]').fill('55');
        await form.locator('input[name="effectiveFrom"]').fill('2026-08-01');
        await stepUp(page, 'finance');
        await form.getByRole('button', { name: 'Save compensation rule', exact: true }).click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(uatProjectId)}`,
        );
        await expect(
          page
            .locator('[aria-label="Compensation rules"] .record-list-item')
            .filter({ hasText: 'PercentageOfEligibleClientLabor' })
            .first(),
        ).toContainText('PercentageOfEligibleClientLabor');
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
        await expect(page.locator('#finance-policy-travel')).toHaveValue('true');
        await expect(page.locator('form[action="?/createClientLaborRate"]')).toBeVisible();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(seeded.project.id)}`,
        );
        await openExpenseClassify(page);
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
          await stepUp(page, 'finance');
          await form.getByRole('button', { name: 'Save billing stream', exact: true }).click();
          await expectActionMessage(page, /billing stream|saved|created/i);
          await page.getByRole('tab', { name: 'Billing streams', exact: true }).click();
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
          page.getByText('This view contains only your own time', { exact: false }),
        ).toBeVisible();
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
        await page.getByRole('button', { name: 'New daily report', exact: true }).click();
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
        await page.getByRole('button', { name: 'New technical report', exact: true }).click();
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
        await navigate(page, '/expenses');
        await page.locator('[data-expense-primary-cta]').click();
        const form = page.locator('form[data-expense-entry-surface]').first();
        await selectOptionContaining(
          form.locator('select[name="projectId"]'),
          fixture.mutation.projectName,
        );
        await form.locator('input[name="spentOn"]').fill(date);
        await form.locator('select[name="category"]').selectOption('hotel');
        await form.locator('input[name="vendor"]').fill('Client Essential UAT receipt');
        await form.locator('input[name="amount"]').fill('24.50');
        await form.locator('select[name="currency"]').selectOption('USD');
        await form.locator('select[name="whoPaid"]').selectOption('worker');
        await form
          .locator('textarea[name="description"]')
          .fill('Receipt captured in the UAT expense flow.');
        await form.locator('input[name="paymentMethod"]').fill('Cash');
        await form
          .locator('input[name="receipt"]')
          .setInputFiles(uatArtifactFile('client-essential-uat-receipt.jpg'));
        await form.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expectActionMessage(page, /expense draft saved/i);
        await navigate(page, '/expenses');
        const row = page
          .locator('[data-expense-record]')
          .filter({ hasText: 'Client Essential UAT receipt' })
          .first();
        await expect(row).toBeVisible();
        await row
          .locator('form[action="?/submitExpense"]')
          .getByRole('button', { name: 'Submit', exact: true })
          .click();
        await expectActionMessage(page, /expense submitted|submitted/i);
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
        if (!uatTimeEntryId) throw new Error('BLOCKED by step 12: no time entry identity');
        const row = page.locator(`[data-approval-row="${uatTimeEntryId}"]`);
        await expect(row).toBeVisible();
        const approve = row.locator('form[action="?/approveRecord"]').first();
        await expect(approve).toBeVisible();
        await approve.getByRole('button', { name: 'Approve', exact: true }).click();
        await expectActionMessage(page, /approval|approved|recorded/i);
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
        await stepUp(page, 'finance');
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
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(seeded.project.id)}`,
        );
        const classification = await openExpenseClassify(page);
        await expect(classification).toBeVisible();
        const expenseId = await classification.locator('input[name="expenseId"]').inputValue();
        expect(expenseId).toMatch(/^[0-9a-f-]{36}$/i);
        await classification.locator('select[name="expensePreset"]').selectOption('all_in');
        await classification.locator('select[name="taxPercent"]').selectOption('0');
        await classification
          .locator('textarea[name="reason"]')
          .fill('Client Essential all-in expense classification.');
        await stepUp(page, 'finance');
        await classification
          .getByRole('button', { name: 'Save Finance classification', exact: true })
          .click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(seeded.project.id)}`,
        );
        await expect(page.locator(`[data-finance-expense-id="${expenseId}"]`)).toContainText(
          'Classified',
        );
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      21,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(seeded.project.id)}`,
        );
        const classifications = page.locator('[data-finance-expense-id]');
        if ((await classifications.count()) < 2)
          throw new Error(
            'The deterministic fixture has fewer than two unlocked expenses for separate treatment',
          );
        const classification = await openExpenseClassify(page, 1);
        await classification
          .locator('select[name="expensePreset"]')
          .selectOption('reimbursable_at_cost');
        await classification.locator('select[name="taxPercent"]').selectOption('0');
        await classification
          .locator('textarea[name="reason"]')
          .fill('Client Essential reimbursable expense classification.');
        await stepUp(page, 'finance');
        await classification
          .getByRole('button', { name: 'Save Finance classification', exact: true })
          .click();
        await navigate(
          page,
          `/finance?view=commercial&project=${encodeURIComponent(seeded.project.id)}`,
        );
        await expect(
          page.getByText('Expected client recovery', { exact: true }).first(),
        ).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      22,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, '/reports');
        await page.locator('details.report-generator > summary').click();
        await page.locator('[data-report-generator-cta]').click();
        const form = page.locator('form[action="?/generatePeriodReports"]');
        await expect(form).toBeVisible();
        await selectOptionContaining(
          form.locator('select[name="projectId"]'),
          seeded.project.projectNumber,
        );
        await form.locator('input[name="periodStart"]').fill(seededPeriod.start);
        await form.locator('input[name="periodEnd"]').fill(seededPeriod.end);
        await form.locator('select[name="reportLocale"]').selectOption('en');
        await stepUp(page, 'finance');
        await form.getByRole('button', { name: 'Refresh reports', exact: true }).click();
        await expectActionMessage(page, /period reports|queued|refreshed/i);
        await page.getByRole('tab', { name: 'Client Sign-off', exact: true }).click();
        await expect(page.locator('[data-conformity-state]').first()).toBeVisible();
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      23,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, '/billing');
        await expectInvoiceIdentifiers(page);
        if (!uatLaborBillingRuleId)
          throw new Error('BLOCKED by step 10: no labor billing rule identity');
        const existingInvoiceIds = new Set(
          await page
            .locator('tr[data-invoice-row]')
            .evaluateAll((rows) =>
              rows.map((row) => row.getAttribute('data-invoice-row')).filter(Boolean),
            ),
        );
        await page.getByRole('tab', { name: 'Billing streams', exact: true }).click();
        const rule = page.locator(`[data-billing-rule="${uatLaborBillingRuleId}"]`);
        await expect(rule).toBeVisible();
        const createDraft = rule.locator('form[action="?/createDraft"]');
        await createDraft.locator('input[name="periodStart"]').fill('2026-08-24');
        await createDraft.locator('input[name="periodEnd"]').fill('2026-08-30');
        await stepUp(page, 'finance');
        await submitAction(page, 'createDraft', () =>
          createDraft.getByRole('button', { name: 'Create invoice draft', exact: true }).click(),
        );
        await expectActionMessage(page, /invoice.*draft|draft.*created|built/i);
        await navigate(page, '/billing');
        const createdInvoiceId = (
          await page
            .locator('tr[data-invoice-row]')
            .evaluateAll((rows) =>
              rows.map((row) => row.getAttribute('data-invoice-row')).filter(Boolean),
            )
        ).find((id) => !existingInvoiceIds.has(id));
        if (!createdInvoiceId) throw new Error('Created invoice draft identity was not exposed');
        issuedInvoiceId = createdInvoiceId;
        expect(issuedInvoiceId).toMatch(/^[0-9a-f-]{36}$/i);
        const draft = await openInvoiceManage(page, issuedInvoiceId);
        await stepUp(page, 'finance');
        await draft
          .locator('form[action="?/approveInvoice"]')
          .getByRole('button', { name: 'Approve', exact: true })
          .click();
        await expectActionMessage(page, /invoice|approved/i);
        await navigate(page, '/billing');
        const issueable = await openInvoiceManage(page, issuedInvoiceId);
        const issue = issueable.locator('form[action="?/issueInvoice"]');
        await expect(issue).toBeVisible();
        await stepUp(page, 'finance');
        await submitAction(page, 'issueInvoice', () =>
          issue.getByRole('button', { name: 'Issue invoice', exact: true }).click(),
        );
        await expectActionMessage(page, /invoice|issued|sent/i);
        const issuedRow = page.locator(`tr[data-invoice-row="${issuedInvoiceId}"]`);
        await expect(issuedRow).toContainText(/Issued|Sent|Partially paid|Paid|Overdue/i);
        await expect(issuedRow.locator('[data-invoice-pdf-status]')).toHaveAttribute(
          'data-invoice-pdf-status',
          /queued|running|ready/,
        );
      },
      failures,
      page,
      testInfo,
    );

    await runStep(
      24,
      async () => {
        await signInFresh(page, 'finance');
        await navigate(page, '/billing');
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
        await stepUp(page, 'finance');
        await paymentForm.getByRole('button', { name: 'Record payment', exact: true }).click();
        await expectActionMessage(page, /payment recorded|recorded/i);
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
        await stepUp(page, 'finance');
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
