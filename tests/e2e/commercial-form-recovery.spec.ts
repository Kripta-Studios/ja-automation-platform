import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

function fixture() {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const project = db
      .prepare(
        `
      SELECT DISTINCT p.id
        FROM project p
        JOIN project_member pm ON pm.project_id=p.id
        JOIN user u ON u.id=pm.user_id
       WHERE p.status='active' AND pm.status='active' AND u.status='active'
         AND u.role IN ('worker','project_manager')
       ORDER BY p.id LIMIT 1
    `,
      )
      .get() as { id: string } | undefined;
    if (!project) throw new Error('Commercial recovery needs a fixture project');
    return { projectId: project.id };
  } finally {
    db.close();
  }
}

async function assertCommercialFailure(page: Page, code: string, task: string) {
  await expect(page.locator('[data-finance-problem] [data-problem-code]')).toHaveAttribute(
    'data-problem-code',
    code,
  );
  await expect(page.locator('#finance-configuration-task')).toHaveValue(task);
  expect(new URL(page.url()).searchParams.get('view')).toBe('commercial');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
}

for (const scenario of ['phone-390', 'desktop']) {
  test(`Commercial policy failure retains the active task and entered choices at ${scenario}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== scenario);
    const { projectId } = fixture();
    await signIn(page, 'finance');
    await page.goto(portal(`/finance?view=commercial&project=${projectId}&lang=en`));
    await page
      .locator('#finance-configuration-task')
      .selectOption('Project commercial and time policy');
    const form = page.locator('form[data-project-commercial-policy-form]');
    await form.locator('[name="projectId"]').selectOption(projectId);
    await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
    await form.locator('[name="overtimeEnabled"][type="checkbox"]').uncheck();
    await form.locator('[name="travelClientBillable"]').selectOption('false');
    await form.locator('[name="customerSignoffRequired"]').selectOption('false');
    // A stale client can submit a threshold after turning overtime off. The
    // server must reject it without losing the rest of the user's policy.
    await form
      .locator('[name="overtimeThresholdMinutes"]')
      .evaluate((input: HTMLInputElement) => (input.value = '42'));
    await form.getByRole('button', { name: 'Save project policy' }).scrollIntoViewIfNeeded();
    await form.getByRole('button', { name: 'Save project policy' }).click();
    await assertCommercialFailure(
      page,
      'FINANCE_PROJECT_COMMERCIAL_POLICY_FIELDS_INVALID',
      'Project commercial and time policy',
    );
    await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
    await expect(form.locator('[name="effectiveFrom"]')).toHaveValue('2026-09-26');
    await expect(form.locator('[name="overtimeEnabled"][type="checkbox"]')).not.toBeChecked();
    await expect(form.locator('[name="travelClientBillable"]')).toHaveValue('false');
    await expect(form.locator('[name="customerSignoffRequired"]')).toHaveValue('false');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(form.locator('[name="overtimeEnabled"][type="checkbox"]')).toBeFocused();
    await expect(form.locator('[name="overtimeEnabled"][type="checkbox"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test(`Worker compensation failure retains conditional amount inputs at ${scenario}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== scenario);
    const { projectId } = fixture();
    await signIn(page, 'finance');
    await page.goto(portal(`/finance?view=commercial&project=${projectId}&lang=en`));
    await page.locator('#finance-configuration-task').selectOption('Worker compensation');
    const form = page.locator('form[action*="?/createCompensationRule"]');
    const workerId = await form
      .locator('[name="workerId"]')
      .evaluate(
        (select: HTMLSelectElement) =>
          Array.from(select.options).find((option) => option.value)?.value,
      );
    if (!workerId) throw new Error('Commercial recovery needs a visible worker option');
    await form.locator('[name="workerId"]').selectOption(workerId);
    await form.locator('[name="ruleType"]').selectOption('PercentageOfEligibleClientLabor');
    await form.locator('[name="overtimeMethod"]').selectOption('FIXED_RATE');
    await form.locator('#finance-comp-percentage').fill('37.5');
    await form.locator('#finance-comp-overtime-rate').fill('12.34');
    await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
    // This bypasses an old client max constraint while keeping a normal submit
    // event, exercising the server's typed field error and native recovery.
    await form.locator('[name="dailyGuaranteeMinutes"]').evaluate((input: HTMLInputElement) => {
      input.removeAttribute('max');
      input.value = '1441';
    });
    await form.getByRole('button', { name: 'Save compensation rule' }).scrollIntoViewIfNeeded();
    await form.getByRole('button', { name: 'Save compensation rule' }).click();
    await assertCommercialFailure(
      page,
      'FINANCE_COMPENSATION_RULE_FIELDS_INVALID',
      'Worker compensation',
    );
    await expect(form.locator('[name="ruleType"]')).toHaveValue('PercentageOfEligibleClientLabor');
    await expect(form.locator('[name="overtimeMethod"]')).toHaveValue('FIXED_RATE');
    await expect(form.locator('#finance-comp-percentage')).toHaveValue('37.5');
    await expect(form.locator('[name="percentageBps"]')).toHaveValue('3750');
    await expect(form.locator('#finance-comp-overtime-rate')).toHaveValue('12.34');
    await expect(form.locator('[name="overtimeRateMinor"]')).toHaveValue('1234');
    await expect(form.locator('[name="dailyGuaranteeMinutes"]')).toHaveValue('1441');
    await expect(form.locator('[name="dailyGuaranteeMinutes"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(form.locator('[name="dailyGuaranteeMinutes"]')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
}

function tableCount(table: string): number {
  const allowed = new Set([
    'legal_entity_revision',
    'project_legal_entity_assignment',
    'compensation_settlement',
    'client_labor_rate',
    'internal_cost_rule',
  ]);
  if (!allowed.has(table)) throw new Error('Unexpected Commercial test table');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    db.close();
  }
}

function projectReimbursementSnapshot(projectId: string): string {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    return JSON.stringify(
      db
        .prepare('SELECT version,worker_expense_reimbursement_default FROM project WHERE id=?')
        .get(projectId),
    );
  } finally {
    db.close();
  }
}

async function firstOption(page: Page, selector: string): Promise<string> {
  const value = await page
    .locator(selector)
    .evaluate(
      (select: HTMLSelectElement) =>
        Array.from(select.options).find((option) => option.value)?.value,
    );
  if (!value) throw new Error(`Missing fixture option for ${selector}`);
  return value;
}

async function submitInvalid(page: Page, form: ReturnType<Page['locator']>, button: string) {
  await form.getByRole('button', { name: button }).scrollIntoViewIfNeeded();
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await form.getByRole('button', { name: button }).click();
  return beforeScroll;
}

async function assertFieldRecovery(
  page: Page,
  form: ReturnType<Page['locator']>,
  field: string,
  beforeScroll: number,
) {
  const control = form.locator(`[name="${field}"]`).first();
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  await expect(control).toBeFocused();
  await expect(
    form.locator(`[data-field-error-for="${await control.getAttribute('id')}"]`),
  ).toBeVisible();
  if (beforeScroll > 0)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

for (const scenario of ['phone-390', 'desktop']) {
  test(`Remaining Commercial native failures recover at ${scenario}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== scenario);
    test.setTimeout(120_000);
    const { projectId } = fixture();
    await signIn(page, 'finance');
    const open = async (task: string) => {
      await page.goto(portal(`/finance?view=commercial&project=${projectId}&lang=en`));
      await page.locator('#finance-configuration-task').selectOption(task);
    };

    await test.step('issuing revision', async () => {
      await open('Project issuing authority');
      await page.locator('.finance-authority-revision summary').click();
      const form = page.locator('form[data-canonical-revision-form]');
      const entityId = await firstOption(
        page,
        'form[data-canonical-revision-form] [name="legacyLegalEntityId"]',
      );
      await form.locator('[name="legacyLegalEntityId"]').selectOption(entityId);
      await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
      await form.locator('[name="legalName"]').fill('   ');
      await form.locator('[name="addressLine1"]').fill('QA Review Street');
      await form.locator('[name="locality"]').fill('QA City');
      await form.locator('[name="postalCode"]').fill('00000');
      await form.locator('[name="countryCode"]').fill('US');
      await form.locator('[name="baseCurrency"]').fill('EUR');
      await form.locator('[name="timezone"]').fill('Europe/Madrid');
      await form.locator('[name="reason"]').fill('Review this test revision');
      const beforeCount = tableCount('legal_entity_revision');
      const beforeScroll = await submitInvalid(page, form, 'Save legal entity revision');
      await assertCommercialFailure(
        page,
        'FINANCE_LEGAL_ENTITY_REVISION_FIELDS_INVALID',
        'Project issuing authority',
      );
      await expect(page.locator('.finance-authority-revision')).toHaveAttribute('open', '');
      await expect(form.locator('[name="legacyLegalEntityId"]')).toHaveValue(entityId);
      await expect(form.locator('[name="timezone"]')).toHaveValue('Europe/Madrid');
      await assertFieldRecovery(page, form, 'legalName', beforeScroll);
      expect(tableCount('legal_entity_revision')).toBe(beforeCount);
    });

    await test.step('project issuing authority assignment', async () => {
      await open('Project issuing authority');
      const form = page.locator('form[data-project-legal-entity-form]');
      await form.locator('[name="projectId"]').selectOption(projectId);
      await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
      await form.locator('[name="reason"]').fill('Review this test assignment');
      // A stale option list can leave no reviewed issuer selected. Exercise
      // the typed server response through a normal submit event.
      await form.locator('[name="legalEntityRevisionId"]').evaluate((select: HTMLSelectElement) => {
        select.required = false;
      });
      const beforeCount = tableCount('project_legal_entity_assignment');
      const beforeScroll = await submitInvalid(page, form, 'Save issuing authority');
      await assertCommercialFailure(
        page,
        'FINANCE_PROJECT_LEGAL_ENTITY_ASSIGNMENT_FIELDS_INVALID',
        'Project issuing authority',
      );
      await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
      await expect(form.locator('[name="reason"]')).toHaveValue('Review this test assignment');
      await assertFieldRecovery(page, form, 'legalEntityRevisionId', beforeScroll);
      expect(tableCount('project_legal_entity_assignment')).toBe(beforeCount);
    });

    await test.step('project reimbursement default', async () => {
      await open('Person expense policies');
      const form = page.locator('form[data-project-reimbursement-form]');
      await form.locator('[name="mode"]').selectOption('none');
      await form.locator('[name="reason"]').fill('   ');
      const before = projectReimbursementSnapshot(projectId);
      const beforeScroll = await submitInvalid(page, form, 'Save project reimbursement default');
      await assertCommercialFailure(
        page,
        'FINANCE_PROJECT_REIMBURSEMENT_FIELDS_INVALID',
        'Person expense policies',
      );
      await expect(form.locator('[name="mode"]')).toHaveValue('none');
      await expect(form.locator('[name="reason"]')).toHaveValue('   ');
      await assertFieldRecovery(page, form, 'reason', beforeScroll);
      expect(projectReimbursementSnapshot(projectId)).toBe(before);
    });

    await test.step('settlement snapshot', async () => {
      await open('Settlement status');
      const form = page.locator('form[action*="?/settleCompensation"]');
      const workerId = await firstOption(
        page,
        'form[action*="?/settleCompensation"] [name="workerId"]',
      );
      await form.locator('[name="workerId"]').selectOption(workerId);
      await form.locator('[name="projectId"]').selectOption(projectId);
      await form.locator('[name="periodStart"]').fill('2026-09-26');
      await form.locator('[name="periodEnd"]').evaluate((input: HTMLInputElement) => {
        input.type = 'text';
        input.value = 'not-a-date';
      });
      const beforeCount = tableCount('compensation_settlement');
      const beforeScroll = await submitInvalid(page, form, 'Generate settlement snapshot');
      await assertCommercialFailure(
        page,
        'FINANCE_SETTLEMENT_PERIOD_FIELDS_INVALID',
        'Settlement status',
      );
      await expect(form.locator('[name="workerId"]')).toHaveValue(workerId);
      await expect(form.locator('[name="periodStart"]')).toHaveValue('2026-09-26');
      await assertFieldRecovery(page, form, 'periodEnd', beforeScroll);
      expect(tableCount('compensation_settlement')).toBe(beforeCount);
    });

    await test.step('customer labor rate', async () => {
      await open('Client labor rate');
      const form = page.locator('form[action*="?/createClientLaborRate"]');
      await form.locator('[name="category"]').fill('C'.repeat(101));
      await form.locator('#finance-client-rate').fill('97.35');
      await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
      const beforeCount = tableCount('client_labor_rate');
      const beforeScroll = await submitInvalid(page, form, 'Save client rate');
      await assertCommercialFailure(
        page,
        'FINANCE_CLIENT_LABOR_RATE_FIELDS_INVALID',
        'Client labor rate',
      );
      await expect(form.locator('[name="category"]')).toHaveValue('C'.repeat(101));
      await expect(form.locator('#finance-client-rate')).toHaveValue('97.35');
      await expect(form.locator('[name="hourlyRateMinor"]')).toHaveValue('9735');
      await assertFieldRecovery(page, form, 'category', beforeScroll);
      expect(tableCount('client_labor_rate')).toBe(beforeCount);
    });

    await test.step('internal loaded cost', async () => {
      await open('Internal loaded cost');
      const form = page.locator('form[action*="?/createInternalCostRule"]');
      const workerId = await firstOption(
        page,
        'form[action*="?/createInternalCostRule"] [name="workerId"]',
      );
      await form.locator('[name="workerId"]').selectOption(workerId);
      await form.locator('#finance-internal-cost').fill('54.25');
      await form.locator('[name="costMethod"]').fill('M'.repeat(81));
      await form.locator('[name="effectiveFrom"]').fill('2026-09-26');
      const beforeCount = tableCount('internal_cost_rule');
      const beforeScroll = await submitInvalid(page, form, 'Save internal cost');
      await assertCommercialFailure(
        page,
        'FINANCE_INTERNAL_COST_RULE_FIELDS_INVALID',
        'Internal loaded cost',
      );
      await expect(form.locator('[name="workerId"]')).toHaveValue(workerId);
      await expect(form.locator('#finance-internal-cost')).toHaveValue('54.25');
      await expect(form.locator('[name="hourlyRateMinor"]')).toHaveValue('5425');
      await expect(form.locator('[name="costMethod"]')).toHaveValue('M'.repeat(81));
      await assertFieldRecovery(page, form, 'costMethod', beforeScroll);
      expect(tableCount('internal_cost_rule')).toBe(beforeCount);
    });
  });
}
