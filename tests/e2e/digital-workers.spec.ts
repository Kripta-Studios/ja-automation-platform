import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  createDatabase,
  DigitalWorkersRepository,
  PortalRepository,
  V3Repository,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import sharp from 'sharp';
import { e2eCredentials } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

// This suite has its own server. Port 4174 belongs to the separate UX worktree.
const portal = (path = '') => `http://127.0.0.1:5174/j-aautomation/app${path}`;
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/app/workflow') && response.status() >= 500)
      errors.push(`${response.status()} ${response.url()}`);
  });
});
test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  await page.goto(portal('/login?lang=en'));
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (url) => url.pathname.startsWith('/j-aautomation/app') && !url.pathname.endsWith('/login'),
  );
}

function database() {
  // The validated, disposable run pointer is the only database this suite opens.
  return createDatabase(readE2EFixturePointer().databasePath);
}

function fixture(
  testInfo: TestInfo,
  withApprovedTime = false,
  workerRole: 'worker' | 'worker2' = 'worker',
) {
  const { sqlite } = database();
  try {
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
    const actor = (role: 'owner' | 'finance' | 'manager' | 'worker' | 'worker2'): Principal => {
      const user = sqlite
        .prepare('SELECT id FROM user WHERE email=?')
        .get(e2eCredentials[role].email) as { id: string };
      const sessionId = randomUUID();
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,NULL)',
        )
        .run(
          sessionId,
          randomUUID(),
          user.id,
          new Date(Date.now() + 3_600_000).toISOString(),
          now,
          now,
        );
      return { ...repository.principalFor(user.id), sessionId };
    };
    const owner = actor('owner');
    const finance = actor('finance');
    let manager = actor('manager');
    let worker = actor(workerRole);
    const client = repository.createClient(owner, {
      legalName: `Digital work ${suffix} SL`,
      displayName: `Digital work ${suffix}`,
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: `dw-${suffix}@example.test`,
      billingAddress: 'Disposable browser fixture, Madrid',
      paymentTermsDays: 30,
    });
    const project = repository.createProject(owner, {
      costCenterCode: `QA-DW-${suffix}-1`,
      clientId: client.id,
      name: `Digital work ${suffix}`,
      timezone: 'Europe/Madrid',
      currency: 'EUR',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: manager.userId,
      startsOn: '2026-01-01',
      canReview: true,
    });
    repository.assignWorker(owner, {
      projectId: project.id,
      workerId: worker.userId,
      startsOn: '2026-01-01',
    });
    manager = { ...manager, projectIds: new Set([...manager.projectIds, project.id]) };
    worker = { ...worker, projectIds: new Set([...worker.projectIds, project.id]) };
    v3.createClientLaborRate(finance, {
      projectId: project.id,
      workerId: worker.userId,
      currency: 'EUR',
      hourlyRateMinor: 6001n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-01-01',
    });
    v3.createInternalCostRule(finance, {
      workerId: worker.userId,
      projectId: project.id,
      currency: 'EUR',
      hourlyRateMinor: 1500n,
      overtimeMethod: 'NONE',
      effectiveFrom: '2026-01-01',
    });
    v3.createCompensationRule(finance, {
      workerId: worker.userId,
      projectId: project.id,
      currency: 'EUR',
      ruleType: 'Hourly',
      rateMinor: 2000n,
      overtimeMethod: 'NONE',
      travelMethod: 'BASE',
      effectiveFrom: '2026-01-01',
    });
    const entity = repository.createLegalEntity(owner, {
      code: `DW-${suffix}`,
      legalName: `Digital issuer ${suffix}`,
      currency: 'EUR',
      billingAddress: 'Fixture address',
      companyIdentifiers: suffix,
    });
    const rule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      currency: 'EUR',
      effectiveFrom: '2026-01-01',
    });
    let timeId: string | undefined;
    if (withApprovedTime) {
      const time = repository.createTimeEntry(worker, {
        projectId: project.id,
        workDate: '2026-10-05',
        category: 'regular',
        minutes: 60,
        summary: 'Browser-verified commissioning work',
      });
      repository.submitTime(worker, time.id, time.version);
      repository.operationalApproveTime(manager, time.id, 'approved');
      repository.financeApproveTime(finance, time.id, true);
      timeId = time.id;
    }
    return {
      projectId: project.id,
      ruleId: rule.id,
      workerId: worker.userId,
      finance,
      worker,
      manager,
      timeId,
      suffix,
    };
  } finally {
    sqlite.close();
  }
}

async function readableControl(control: Locator, page: Page) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(43);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await control.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  const visibleFocus = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== 'none'
    );
  });
  expect(visibleFocus).toBe(true);
}

async function responsiveEvidence(page: Page, testInfo: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const overflowingControls = await page
    .locator('.workspace-grid input, .workspace-grid select, .workspace-grid textarea')
    .evaluateAll((controls) =>
      controls
        .filter((control) => {
          const bounds = control.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return false;
          const card = control.closest('.record-card, [data-ui="form-card"]');
          if (!card) return false;
          const container = card.getBoundingClientRect();
          return bounds.left < container.left - 1 || bounds.right > container.right + 1;
        })
        .map((control) => control.id),
    );
  expect(overflowingControls).toEqual([]);
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
}

async function caseAccessibility(page: Page, testInfo: TestInfo, state: string) {
  if (testInfo.project.name !== 'desktop') return;
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, `${state}: ${JSON.stringify(result.violations)}`).toEqual([]);
}

test('worker reviews one capture, recovers local facts, and creates linked drafts exactly once', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const f = fixture(testInfo);
  await signIn(page, 'worker');
  // Exercise the explicit unsupported-browser fallback; this does not pretend to test a microphone.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(portal('/workflow/capture?lang=en'));
  await expect(page.getByRole('heading', { name: 'Finish today', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await page.getByLabel('Work date').fill('2026-10-05');
  const summary = `Checked emergency-stop recovery · ${f.suffix}`;
  await page.getByLabel('What work happened?').fill(summary);
  await page.getByRole('button', { name: 'Dictate on this device', exact: true }).click();
  await expect(
    page.getByRole('status').filter({
      hasText:
        'Local dictation is unavailable for this browser or language. Please type your notes.',
    }),
  ).toBeVisible();
  await expect(page.getByLabel('What work happened?')).toHaveValue(summary);
  await page.getByLabel('Create time draft').check();
  await page.getByLabel('Category').fill('regular');
  await expect(page.getByLabel('Actual minutes worked')).toHaveValue('');
  await page.getByLabel('Actual minutes worked').fill('37');
  await page.getByLabel('Create daily report draft').check();
  const receiptPng = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="240"><rect width="1200" height="240" fill="white"/><text x="40" y="100" font-family="DejaVu Sans" font-size="52" fill="black">RECEIPT TOTAL EUR 42.50</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  await page
    .getByLabel('Tasks completed')
    .fill('Checked recovery; final customer acceptance is still pending.');
  const reportFacts = {
    'Site / shift': 'Shift A · safety checks',
    'Problems found': 'One interlock requires retest',
    'Corrective actions': 'Restored wiring label',
    'Client decisions': 'No acceptance decision yet',
    'Standby reason': 'Awaiting site access',
    Blockers: 'Waiting for customer witness',
    'Open items': 'Witnessed restart test',
    'Next day plan': 'Run witnessed restart',
    'Customer contact': 'Fixture customer liaison',
  };
  for (const [label, value] of Object.entries(reportFacts))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Downtime minutes').fill('7');
  await page.getByLabel('Safety related').check();
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved on this device only' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await page.getByLabel('Work date').fill('2026-10-05');
  // Scope selection must recover automatically without overwriting saved facts.
  await expect(page.getByLabel('What work happened?')).toHaveValue(summary);
  await expect(page.getByLabel('Actual minutes worked')).toHaveValue('37');
  await page.getByLabel('Create expense draft').check();
  await page.getByRole('combobox', { name: 'Expense category', exact: true }).selectOption('meals');
  await page.getByLabel('Vendor').fill('Fixture site cafeteria');
  await page.getByText('Read text from a document', { exact: true }).click();
  await page
    .getByLabel('Receipt or document (PNG, JPEG, PDF or UTF-8 text; up to 8 MB)')
    .setInputFiles({
      name: 'meal-receipt.png',
      mimeType: 'image/png',
      buffer: receiptPng,
    });
  await page.getByRole('button', { name: 'Extract text locally', exact: true }).click();
  const reviewedText = page.getByLabel('Review and correct extracted text');
  await expect(reviewedText).toHaveValue(/42\.50/);
  await expect(page.getByLabel('Expense description')).toHaveValue('');
  await reviewedText.fill('Reviewed meal receipt: EUR 42.50; no customer acceptance claimed.');
  await page.getByRole('button', { name: 'Use reviewed text', exact: true }).click();
  await expect(page.getByLabel('Expense description')).toHaveValue(
    'Reviewed meal receipt: EUR 42.50; no customer acceptance claimed.',
  );
  await page.getByLabel('Actual amount').fill('42.50');
  await page.getByRole('combobox', { name: 'Currency', exact: true }).selectOption('EUR');
  await page.getByRole('combobox', { name: 'Who paid?', exact: true }).selectOption('worker');
  await readableControl(page.getByLabel('Expense description'), page);
  await readableControl(page.getByRole('button', { name: 'Review facts', exact: true }), page);
  await page.getByRole('button', { name: 'Review facts', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Review facts', exact: true })).toBeVisible();
  const review = page.locator('.review');
  for (const value of Object.values(reportFacts)) await expect(review).toContainText(value);
  await expect(review).toContainText('Meals');
  await expect(review).toContainText('Fixture site cafeteria');
  await expect(review.getByText('Downtime minutes', { exact: true })).toBeVisible();
  await expect(review.getByText('7', { exact: true })).toBeVisible();
  await expect(review.getByText('Safety related', { exact: true })).toBeVisible();
  await expect(review.getByText('Yes', { exact: true })).toBeVisible();
  await readableControl(
    page.getByRole('button', { name: 'Create server drafts', exact: true }),
    page,
  );
  await responsiveEvidence(page, testInfo, 'capture-reviewed-facts');
  const submitted = (await page
    .locator('form:has(input[name="requestKey"])')
    .evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement)))) as Record<
    string,
    string
  >;
  // The extractor's File input is deliberately not part of this server capture payload.
  await page.getByRole('button', { name: 'Create server drafts', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Server drafts created. Open each record to review and submit it.',
      exact: true,
    }),
  ).toBeVisible();
  for (const name of ['Open time entry', 'Open daily report', 'Open expense'])
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create server drafts', exact: true })).toHaveCount(
    0,
  );
  const retry = await page.request.post(portal('/workflow/capture'), {
    form: submitted,
    headers: { origin: new URL(portal()).origin },
  });
  expect(retry.status()).toBe(200);
  const { sqlite } = database();
  try {
    expect(
      sqlite
        .prepare('SELECT count(*) n FROM capture_request WHERE actor_user_id=? AND request_key=?')
        .get(f.workerId, submitted.requestKey)?.n,
    ).toBe(1);
    const time = sqlite
      .prepare('SELECT id,minutes,approval_state FROM time_entry WHERE project_id=?')
      .all(f.projectId);
    expect(time).toHaveLength(1);
    expect(time[0]).toMatchObject({ minutes: 37, approval_state: 'draft' });
    expect(
      sqlite.prepare('SELECT count(*) n FROM daily_report WHERE project_id=?').get(f.projectId)?.n,
    ).toBe(1);
    const expense = sqlite
      .prepare(
        'SELECT amount_minor,approval_state,time_entry_id,receipt_document_id FROM expense WHERE project_id=?',
      )
      .all(f.projectId);
    expect(expense).toHaveLength(1);
    expect(String(expense[0].amount_minor)).toBe('4250');
    expect(expense[0]).toMatchObject({
      approval_state: 'draft',
      time_entry_id: time[0].id,
      receipt_document_id: null,
    });
    expect(
      sqlite.prepare('SELECT count(*) n FROM invoice WHERE project_id=?').get(f.projectId)?.n,
    ).toBe(0);
  } finally {
    sqlite.close();
  }
  await page.goto(portal('/workflow?lang=en'));
  await expect(page.getByRole('heading', { name: 'Finish your work', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open case', exact: true })).toHaveCount(0);
  await responsiveEvidence(page, testInfo, 'worker-follow-up');
});

test('Finance opens and reviews a current case before preparing one invoice draft', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const f = fixture(testInfo, true);
  await signIn(page, 'finance');
  await page.goto(portal('/workflow?lang=en'));
  await expect(page.getByRole('heading', { name: 'Ready to invoice', exact: true })).toBeVisible();
  const filters = page
    .locator('form[method="GET"]')
    .filter({ has: page.getByRole('button', { name: 'Apply filters', exact: true }) });
  await filters.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await filters.getByLabel('Period start').fill('2026-10-01');
  await filters.getByLabel('Period end').fill('2026-10-31');
  await filters.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(filters.getByRole('combobox', { name: 'Billing stream', exact: true })).toHaveValue(
    f.ruleId,
  );
  await page.goto(portal('/workflow?lang=en'));
  await page.goBack();
  await expect(filters.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(
    f.projectId,
  );
  await expect(filters.getByLabel('Period start')).toHaveValue('2026-10-01');
  await expect(filters.getByRole('combobox', { name: 'Billing stream', exact: true })).toHaveValue(
    f.ruleId,
  );
  const create = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Open case', exact: true }) });
  await expect(create.locator('input[name="projectId"]')).toHaveValue(f.projectId);
  await expect(create.locator('input[name="billingRuleId"]')).toHaveValue(f.ruleId);
  await expect(create.locator('input[name="periodStart"]')).toHaveValue('2026-10-01');
  await expect(create.locator('input[name="periodEnd"]')).toHaveValue('2026-10-31');
  await create
    .getByRole('combobox', { name: 'Case scope', exact: true })
    .selectOption('whole_period');
  await readableControl(create.getByRole('button', { name: 'Open case', exact: true }), page);
  await create.getByRole('button', { name: 'Open case', exact: true }).click();
  await page.waitForURL(/\/workflow\/cases\//);
  await expect(page.getByRole('heading', { name: 'Finance case', exact: true })).toBeVisible();
  await readableControl(
    page.getByRole('button', { name: 'Refresh the current source snapshot', exact: true }),
    page,
  );
  await caseAccessibility(page, testInfo, 'Fresh finance case');
  const caseId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(
    page.getByRole('button', { name: 'Create invoice draft', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Refresh the current source snapshot', exact: true })
    .click();
  await page
    .getByLabel('Review reason')
    .fill('Reviewed the complete period source manifest and exact billing basis.');
  await page.getByRole('button', { name: 'Record case review', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create invoice draft', exact: true }),
  ).toBeEnabled();
  await responsiveEvidence(page, testInfo, 'finance-reviewed-case');
  await caseAccessibility(page, testInfo, 'Reviewed finance case');
  // A different authorized actor records completed work after this review. Exercise
  // the canonical approval lifecycle so the case must include the new source.
  const changed = database();
  try {
    const repository = new PortalRepository(changed.sqlite);
    const time = repository.createTimeEntry(f.worker, {
      projectId: f.projectId,
      workDate: '2026-10-06',
      category: 'regular',
      minutes: 60,
      summary: 'Additional completed work after the case review',
    });
    repository.submitTime(f.worker, time.id, time.version);
    repository.operationalApproveTime(f.manager, time.id, 'approved');
    repository.financeApproveTime(f.finance, time.id, true);
  } finally {
    changed.sqlite.close();
  }
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Create invoice draft', exact: true }),
  ).toBeDisabled();
  await responsiveEvidence(page, testInfo, 'finance-stale-review');
  await page
    .getByRole('button', { name: 'Refresh the current source snapshot', exact: true })
    .click();
  await page
    .getByLabel('Review reason')
    .fill('Rechecked the whole period including the new completed work.');
  await page.getByRole('button', { name: 'Record case review', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create invoice draft', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Create invoice draft', exact: true }).click();
  await expect
    .poll(() => {
      const { sqlite } = database();
      try {
        return sqlite
          .prepare('SELECT draft_invoice_id FROM digital_work_case WHERE id=?')
          .get(caseId)?.draft_invoice_id;
      } finally {
        sqlite.close();
      }
    })
    .toBeTruthy();
  const { sqlite } = database();
  try {
    const invoices = sqlite
      .prepare('SELECT id,state FROM invoice WHERE project_id=?')
      .all(f.projectId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].state).toBe('draft');
    expect(
      sqlite
        .prepare(
          "SELECT count(*) n FROM invoice_source WHERE invoice_id=? AND source_type='time' AND source_id=?",
        )
        .get(invoices[0].id, f.timeId)?.n,
    ).toBe(1);
    expect(
      sqlite
        .prepare("SELECT count(*) n FROM invoice_source WHERE invoice_id=? AND source_type='time'")
        .get(invoices[0].id)?.n,
    ).toBe(2);
  } finally {
    sqlite.close();
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create invoice draft', exact: true })).toHaveCount(
    0,
  );
  await responsiveEvidence(page, testInfo, 'finance-prepared-draft');
});

test('PM sees operational decisions while financial cases remain restricted', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const f = fixture(testInfo, true);
  const alternate = fixture(testInfo, false, 'worker2');
  const { sqlite } = database();
  let caseId: string;
  try {
    caseId = new DigitalWorkersRepository(sqlite).openCase(f.finance, {
      projectId: f.projectId,
      billingRuleId: f.ruleId,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      scopeKind: 'whole_period',
      requestKey: randomUUID(),
    }).id;
  } finally {
    sqlite.close();
  }
  await signIn(page, 'manager');
  await page.goto(portal('/workflow?lang=en'));
  await expect(
    page.getByRole('heading', { name: 'Needs your decision', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open case', exact: true })).toHaveCount(0);
  const followup = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save follow-up', exact: true }) });
  await followup.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await followup.getByRole('combobox', { name: 'Work type', exact: true }).selectOption('handover');
  const title = `Capture final handover evidence ${f.suffix}`;
  await followup.getByLabel('Factual title').fill(title);
  await followup.getByRole('combobox', { name: 'Owner', exact: true }).selectOption(f.workerId);
  await followup
    .getByRole('combobox', { name: 'Project', exact: true })
    .selectOption(alternate.projectId);
  await expect(followup.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue('');
  await expect(
    followup.locator(`select[name="ownerId"] option[value="${f.workerId}"]`),
  ).toHaveCount(0);
  await followup
    .getByRole('combobox', { name: 'Owner', exact: true })
    .selectOption(alternate.workerId);
  await followup.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await expect(followup.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue('');
  await expect(
    followup.locator(`select[name="ownerId"] option[value="${alternate.workerId}"]`),
  ).toHaveCount(0);
  await expect(followup.getByLabel('Factual title')).toHaveValue(title);
  await followup.getByRole('combobox', { name: 'Owner', exact: true }).selectOption(f.workerId);
  await followup.getByLabel('Due date').fill('2026-10-12');
  await readableControl(
    followup.getByRole('button', { name: 'Save follow-up', exact: true }),
    page,
  );
  await followup.getByRole('button', { name: 'Save follow-up', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await responsiveEvidence(page, testInfo, 'manager-operational-workspace');
  const denied = await page.goto(portal(`/workflow/cases/${caseId}`));
  expect(denied?.status()).toBe(403);
  await expect(page.getByRole('button', { name: 'Create invoice draft', exact: true })).toHaveCount(
    0,
  );
  await page.context().clearCookies();
  await signIn(page, 'worker');
  await page.goto(portal(`/workflow?project=${f.projectId}&lang=en`));
  const workItem = page
    .locator('[id^="item-"]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(workItem).toBeVisible();
  await expect(
    workItem
      .getByRole('combobox', { name: 'Status', exact: true })
      .locator('option[value="accepted"]'),
  ).toHaveCount(0);
  await workItem
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('ready_for_review');
  await workItem
    .getByLabel('Review reason')
    .fill('Field notes assembled; manager must review and accept the handover.');
  await readableControl(
    workItem.getByRole('button', { name: 'Update follow-up', exact: true }),
    page,
  );
  await workItem.getByRole('button', { name: 'Update follow-up', exact: true }).click();
  await expect(workItem.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(
    'ready_for_review',
  );
  await page.reload();
  await expect(workItem.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(
    'ready_for_review',
  );
  await responsiveEvidence(page, testInfo, 'worker-handover-awaits-review');
});

test('Finance records a manual policy proposal without changing billing or worker pay', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const f = fixture(testInfo, true);
  const alternate = fixture(testInfo, false, 'worker2');
  const snapshot = () => {
    const { sqlite } = database();
    try {
      return {
        rule: sqlite.prepare('SELECT * FROM billing_rule WHERE id=?').get(f.ruleId),
        time: sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(f.timeId!),
        pay: sqlite
          .prepare('SELECT * FROM compensation_rule WHERE project_id=? ORDER BY id')
          .all(f.projectId),
        cost: sqlite
          .prepare('SELECT * FROM internal_cost_rule WHERE project_id=? ORDER BY id')
          .all(f.projectId),
        invoices: sqlite
          .prepare('SELECT count(*) n FROM invoice WHERE project_id=?')
          .get(f.projectId)?.n,
      };
    } finally {
      sqlite.close();
    }
  };
  const before = snapshot();
  await signIn(page, 'finance');
  await page.goto(portal(`/workflow?project=${f.projectId}&lang=en`));
  const policy = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save follow-up', exact: true }) });
  await policy.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await expect(policy.locator(`select[name="ownerId"] option[value="${f.workerId}"]`)).toHaveCount(
    0,
  );
  await policy.getByRole('combobox', { name: 'Owner', exact: true }).selectOption(f.finance.userId);
  await policy
    .getByRole('combobox', { name: 'Project', exact: true })
    .selectOption(alternate.projectId);
  await expect(policy.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue('');
  await expect(
    policy.locator(`select[name="ownerId"] option[value="${alternate.workerId}"]`),
  ).toHaveCount(0);
  await policy.getByRole('combobox', { name: 'Owner', exact: true }).selectOption(f.finance.userId);
  await policy.getByRole('combobox', { name: 'Project', exact: true }).selectOption(f.projectId);
  await expect(policy.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue('');
  await policy.getByRole('combobox', { name: 'Owner', exact: true }).selectOption(f.finance.userId);
  const title = `Review quoted minimum-hours clause ${f.suffix}`;
  await policy.getByLabel('Factual title').fill(title);
  await policy.getByLabel('Policy reference').fill('Manual quotation: signed order, section 4.2');
  await policy
    .getByLabel('Description or source quote')
    .fill(
      'A reviewer must confirm the scope and effective date before any billing configuration change.',
    );
  await policy.getByText('Proposed billing settings', { exact: true }).click();
  await policy.getByLabel('Billing rule reference').fill(f.ruleId);
  await policy.getByLabel('Minimum minutes per day').fill('120');
  await policy.getByLabel('Effective from').fill('2026-10-01');
  await policy.getByLabel('Effective to').fill('2026-09-01');
  await policy
    .getByLabel('Proposal note')
    .fill('Proposal only; actual minutes remain recorded facts.');
  await readableControl(policy.getByRole('button', { name: 'Save follow-up', exact: true }), page);
  const rejected = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).searchParams.has('/saveWorkItem'),
  );
  await policy.getByRole('button', { name: 'Save follow-up', exact: true }).click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByRole('alert')).toHaveText(
    'Enter valid dates, with the end date on or after the start date.',
  );
  await expect(policy.getByLabel('Factual title')).toHaveValue(title);
  await expect(policy.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(
    f.projectId,
  );
  await expect(policy.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue(
    f.finance.userId,
  );
  await policy.getByText('Proposed billing settings', { exact: true }).click();
  await expect(policy.getByLabel('Minimum minutes per day')).toHaveValue('120');
  await expect(policy.getByLabel('Effective from')).toHaveValue('2026-10-01');
  await expect(policy.getByLabel('Effective to')).toHaveValue('2026-09-01');
  await policy.getByLabel('Effective to').fill('2026-10-31');
  await policy.getByRole('button', { name: 'Save follow-up', exact: true }).click();
  const item = page
    .locator('[id^="item-"]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(item).toBeVisible();
  await item
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('ready_for_review');
  await item
    .getByLabel('Review reason')
    .fill('Quoted proposal assembled for an authorized commercial review.');
  await item.getByRole('button', { name: 'Update follow-up', exact: true }).click();
  await expect(item.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(
    'ready_for_review',
  );
  await page.reload();
  await item.getByText('Edit proposed billing settings', { exact: true }).click();
  await expect(item.getByLabel('Minimum minutes per day')).toHaveValue('120');
  expect(snapshot()).toEqual(before);
  await responsiveEvidence(page, testInfo, 'finance-manual-policy-proposal');
});

test('Spanish Worker validation, Owner workspace and Portuguese Auditor case preserve role boundaries', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const f = fixture(testInfo, true);
  const { sqlite } = database();
  let caseId: string;
  try {
    caseId = new DigitalWorkersRepository(sqlite).openCase(f.finance, {
      projectId: f.projectId,
      billingRuleId: f.ruleId,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      scopeKind: 'whole_period',
      requestKey: randomUUID(),
    }).id;
  } finally {
    sqlite.close();
  }
  await signIn(page, 'worker');
  await page.goto(portal('/workflow/capture?lang=es'));
  await page.getByRole('combobox', { name: 'Proyecto', exact: true }).selectOption(f.projectId);
  await page.getByLabel('Fecha de trabajo').fill('2026-10-05');
  await page
    .getByLabel('¿Qué trabajo se realizó?')
    .fill('Validación localizada sin crear registros.');
  await page.getByLabel('Crear borrador de gasto').check();
  await page
    .getByRole('combobox', { name: 'Categoría de gasto', exact: true })
    .selectOption('meals');
  await page.getByLabel('Descripción del gasto').fill('Comida del equipo');
  await page.getByLabel('Importe real').fill('0');
  await page.getByRole('combobox', { name: 'Moneda', exact: true }).selectOption('EUR');
  await page.getByRole('combobox', { name: '¿Quién pagó?', exact: true }).selectOption('worker');
  await page.getByRole('button', { name: 'Revisar hechos', exact: true }).click();
  const invalidCapture = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/workflow/capture'),
  );
  await page.getByRole('button', { name: 'Crear borradores en el servidor', exact: true }).click();
  const captureResponse = await invalidCapture;
  expect(captureResponse.ok()).toBe(true);
  expect(await captureResponse.json()).toMatchObject({ type: 'failure', status: 400 });
  await expect(page.getByRole('alert')).toHaveText('Introduce un importe mayor que cero.');
  await expect(page.getByLabel('Importe real')).toHaveValue('0');
  await expect(page.getByLabel('Descripción del gasto')).toHaveValue('Comida del equipo');
  await expect(page.getByLabel('¿Qué trabajo se realizó?')).toHaveValue(
    'Validación localizada sin crear registros.',
  );
  const rejectedDatabase = database();
  try {
    expect(
      rejectedDatabase.sqlite
        .prepare('SELECT count(*) n FROM expense WHERE project_id=?')
        .get(f.projectId)?.n,
    ).toBe(0);
  } finally {
    rejectedDatabase.sqlite.close();
  }
  await responsiveEvidence(page, testInfo, 'worker-spanish-validation');
  await page.context().clearCookies();
  await signIn(page, 'owner');
  await page.goto(portal('/workflow?lang=es'));
  await expect(
    page.getByRole('heading', { name: 'Trabajadores digitales', exact: true }),
  ).toBeVisible();
  await expect(page.locator('form[action="?/openCase"]')).toHaveCount(1);
  await responsiveEvidence(page, testInfo, 'owner-spanish-workspace');
  await page.context().clearCookies();
  await signIn(page, 'auditor');
  await page.goto(portal(`/workflow/cases/${caseId}?lang=pt`));
  await expect(page.getByRole('heading', { name: 'Caso financeiro', exact: true })).toBeVisible();
  await expect(
    page.locator(
      'form[action="?/reconcile"],form[action="?/recordReview"],form[action="?/prepareDraft"]',
    ),
  ).toHaveCount(0);
  await responsiveEvidence(page, testInfo, 'auditor-portuguese-case');
});
