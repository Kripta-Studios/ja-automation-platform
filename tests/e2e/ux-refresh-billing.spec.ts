import { randomUUID } from 'node:crypto';
import { createDatabase, PortalRepository } from '@ja/database';
import { expect, test } from '@playwright/test';
import { e2eDatabasePath } from './environment.js';
import { e2eCredentials, portal, signIn } from './auth.js';
import { e2eCostCenter } from './project-cost-center.js';

function reviewProjectId(): string {
  const database = createDatabase(e2eDatabasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT p.id
         FROM project p
         JOIN project_member pm ON pm.project_id = p.id
         WHERE p.status='active' AND pm.status='active'
         ORDER BY p.id
         LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    if (!row?.id) throw new Error('Billing UX fixture needs an active project member');
    return row.id;
  } finally {
    database.sqlite.close();
  }
}

function projectWithoutBillingRuleId(): string | null {
  const database = createDatabase(e2eDatabasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT p.id
         FROM project p
         LEFT JOIN billing_rule br ON br.project_id = p.id
         WHERE p.status='active' AND br.id IS NULL
         ORDER BY p.id
         LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    return row?.id ?? null;
  } finally {
    database.sqlite.close();
  }
}

type BillingRuleFixture = { id: string; project_id: string; stream_type: string };

type MilestoneFixture = {
  mixedProjectId: string;
  mixedMilestoneRuleId: string;
  milestoneOnlyProjectId: string;
};

let milestoneFixtureInstance = 0;

function seedMilestoneFixture(): MilestoneFixture {
  const database = createDatabase(e2eDatabasePath);
  try {
    const instance = milestoneFixtureInstance++ % 100;
    const ownerId = (
      database.sqlite
        .prepare('SELECT id FROM user WHERE email=?')
        .get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const legalEntity = database.sqlite
      .prepare("SELECT id,currency FROM legal_entity WHERE status='active' ORDER BY id LIMIT 1")
      .get() as { id: string; currency: 'USD' | 'EUR' | 'BRL' } | undefined;
    if (!legalEntity) throw new Error('Disposable fixture needs an active legal entity');
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(ownerId);
    const client = repository.createClient(owner, {
      legalName: `Billing mode client ${randomUUID()}`,
      displayName: `Billing mode client ${randomUUID()}`,
      currency: legalEntity.currency,
      timezone: 'Europe/Madrid',
      billingEmail: `billing-mode-${randomUUID()}@example.test`,
      billingAddress: 'Disposable billing mode fixture',
    });
    const project = (name: string, scenario: number) =>
      repository.createProject(owner, {
        clientId: client.id,
        name: `${name} ${randomUUID()}`,
        costCenterCode: e2eCostCenter('QA-BILL-MODE', scenario, 'desktop', instance),
        currency: legalEntity.currency,
        timezone: 'Europe/Madrid',
        billingModel: 'tm',
        startDate: '2026-01-01',
      }).id;
    const mixedProjectId = project('Mixed milestone billing project', 91);
    const milestoneOnlyProjectId = project('Milestone-only billing project', 92);
    repository.createBillingRule(owner, {
      projectId: mixedProjectId,
      legalEntityId: legalEntity.id,
      streamType: 'labor',
      cadenceType: 'monthly',
      currency: legalEntity.currency,
      effectiveFrom: '2026-01-01',
    });
    const mixedMilestoneRuleId = repository.createBillingRule(owner, {
      projectId: mixedProjectId,
      legalEntityId: legalEntity.id,
      streamType: 'milestone',
      cadenceType: 'milestone',
      currency: legalEntity.currency,
      effectiveFrom: '2026-01-01',
      fixedAmountMinor: 10000n,
    }).id;
    repository.createBillingRule(owner, {
      projectId: milestoneOnlyProjectId,
      legalEntityId: legalEntity.id,
      streamType: 'milestone',
      cadenceType: 'milestone',
      currency: legalEntity.currency,
      effectiveFrom: '2026-01-01',
      fixedAmountMinor: 10000n,
    });
    return { mixedProjectId, mixedMilestoneRuleId, milestoneOnlyProjectId };
  } finally {
    database.sqlite.close();
  }
}

function activeVisibleBillingRules(): BillingRuleFixture[] {
  const database = createDatabase(e2eDatabasePath);
  try {
    return database.sqlite
      .prepare(
        `SELECT br.id,br.project_id,br.stream_type
         FROM billing_rule br
         JOIN project p ON p.id=br.project_id AND p.status='active'
         WHERE br.enabled=1
         ORDER BY br.project_id,br.id`,
      )
      .all() as BillingRuleFixture[];
  } finally {
    database.sqlite.close();
  }
}

function activeLaborRules(): Array<{ id: string; project_id: string }> {
  return activeVisibleBillingRules()
    .filter((rule) => rule.stream_type === 'labor')
    .map(({ id, project_id }) => ({ id, project_id }));
}

function financeUserId(): string {
  const database = createDatabase(e2eDatabasePath);
  try {
    const row = database.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.finance.email) as { id: string } | undefined;
    if (!row?.id) throw new Error('Billing UX fixture needs a finance user');
    return row.id;
  } finally {
    database.sqlite.close();
  }
}

function invoiceProjectFixture(): { projectId: string } {
  const database = createDatabase(e2eDatabasePath);
  try {
    const row = database.sqlite
      .prepare(
        `SELECT i.project_id
         FROM invoice i
         JOIN project p ON p.id=i.project_id AND p.status='active'
         ORDER BY i.created_at DESC
         LIMIT 1`,
      )
      .get() as { project_id: string } | undefined;
    if (!row?.project_id) throw new Error('Billing UX fixture needs an invoice with a project');
    return { projectId: row.project_id };
  } finally {
    database.sqlite.close();
  }
}

async function selectWholePeriodStep(page: import('@playwright/test').Page, label: string) {
  const surface = page.locator('[data-invoice-creation-mode="whole_period"]');
  await expect(surface).toBeVisible();
  const mobile = surface.locator('.billing-section__wizard-mobile-progress');
  if (await mobile.isVisible()) {
    await mobile.locator('summary').click();
    await mobile.getByRole('button', { name: new RegExp(label) }).click();
  } else {
    await surface
      .locator('.billing-section__wizard-progress')
      .getByRole('button', { name: new RegExp(label) })
      .click();
  }
}

test.describe('billing UX refresh · read-only feature parity', () => {
  test('keeps stream setup options visible and separates invoice creation modes', async ({
    page,
  }) => {
    await signIn(page, 'finance');
    await page.goto(portal('/billing?view=setup&setup=stream&lang=en'));
    await page.waitForLoadState('networkidle');

    const streamForm = page.locator('[data-billing-new-stream]');
    await expect(streamForm).toBeVisible();
    await expect(streamForm.locator('select[name="streamType"] option')).toHaveCount(4);
    const cadence = streamForm.locator('select[name="cadenceType"]');
    await expect(cadence.locator('option[value="custom"]')).toHaveCount(1);
    await expect(cadence.locator('option[value="manual"]')).toHaveCount(1);
    await expect(cadence.locator('option[value="milestone"]')).toHaveCount(1);
    await cadence.selectOption('custom');
    await expect(streamForm.locator('input[name="effectiveFrom"]')).toBeVisible();
    await expect(streamForm.locator('input[name="anchorDate"]')).not.toHaveAttribute(
      'required',
      '',
    );
    await cadence.selectOption('every_14_days');
    await expect(streamForm.locator('input[name="anchorDate"]')).toBeVisible();
    await expect(streamForm.locator('input[name="anchorDate"]')).toHaveAttribute('required', '');
    await cadence.selectOption('semi_monthly');
    await expect(streamForm.locator('select[name="semiMonthlyRule"]')).toBeVisible();
    await expect(streamForm.locator('select[name="semiMonthlyRule"]')).toHaveAttribute(
      'required',
      '',
    );
    await cadence.selectOption('monthly');
    await expect(streamForm.locator('input[name="effectiveFrom"]')).toBeVisible();
    await cadence.selectOption('manual');
    await cadence.selectOption('milestone');
    await streamForm.locator('select[name="streamType"]').selectOption('expense');
    await expect(streamForm.locator('[data-expense-billability-help]')).toBeVisible();
    for (const field of [
      'projectId',
      'streamType',
      'cadenceType',
      'effectiveFrom',
      'legalEntityId',
      'taxProfileId',
      'currency',
      'templateId',
      'recipientEmail',
      'billingContactId',
      'paymentTermsDays',
      'poNumberOverride',
      'autoGenerateDraft',
    ]) {
      await expect(streamForm.locator(`[name="${field}"]`)).toHaveCount(1);
    }

    await page.goto(portal('/billing?view=streams&lang=en'));
    await page.waitForLoadState('networkidle');
    const create = page.getByRole('button', { name: 'Create invoice', exact: true }).first();
    await expect(create).toBeVisible();
    await create.click();
    await expect(page.locator('[data-invoice-creation-modes]')).toBeVisible();
    await expect(page.locator('[data-invoice-creation-modes] button[aria-pressed]')).toHaveCount(2);
    await expect(page.locator('[data-invoice-creation-mode="records"]')).toBeVisible();
    await expect(page.locator('[data-invoice-creation-mode="whole_period"]')).toBeHidden();
    await page
      .locator('[data-invoice-creation-modes] button[aria-pressed]')
      .filter({ hasText: 'Whole period' })
      .click();
    await expect(page.locator('[data-invoice-creation-mode="records"]')).toBeHidden();
    await expect(page.locator('[data-invoice-creation-mode="whole_period"]')).toBeVisible();
  });

  test('keeps per-person pricing controls visible on project billing', async ({ page }) => {
    const projectId = reviewProjectId();
    await signIn(page, 'finance');
    await page.goto(
      portal(`/projects/${encodeURIComponent(projectId)}?tab=billing&billingStep=people&lang=en`),
    );
    await page.waitForLoadState('networkidle');

    const setup = page.locator('.billing-setup');
    await expect(setup).toBeVisible();
    await expect(setup.locator('#project-person-conditions')).toBeVisible();
    await expect(setup.locator('input[id$="-customerHourlyRate"]').first()).toBeVisible();
    await expect(setup.locator('input[id$="-internalCostHourlyRate"]').first()).toBeVisible();
    await expect(setup.locator('select[id$="-workerPayType"]').first()).toBeVisible();
    await expect(setup.locator('input[id$="-workerPayAmount"]').first()).toBeVisible();
  });

  test('keeps a project with no stream on a guided conditions-to-invoice path', async ({
    page,
  }) => {
    const projectId = projectWithoutBillingRuleId();
    expect(projectId, 'Disposable fixture needs a project without a stream').toBeTruthy();
    await signIn(page, 'finance');
    await page.goto(portal(`/projects/${encodeURIComponent(projectId!)}?tab=work&lang=en`));
    await page.waitForLoadState('networkidle');
    const composer = page.locator('[data-invoice-composer]');
    await expect(composer).toBeVisible();
    await expect(
      composer.getByText('Configure the project billing conditions first.'),
    ).toBeVisible();
    const setup = composer.getByRole('link', { name: 'Set up project billing', exact: true });
    await expect(setup).toHaveAttribute(
      'href',
      `/j-aautomation/app/projects/${projectId}?tab=billing&billingStep=people&lang=en`,
    );
    await setup.click();
    await expect(page.locator('#project-person-conditions')).toBeVisible();
  });

  test('carries the selected record stream and period into whole-period mode and back', async ({
    page,
  }) => {
    const rules = activeLaborRules();
    const first = rules[0];
    const other = rules.find((rule) => rule.project_id !== first?.project_id);
    expect(first, 'Disposable fixture needs an active labor stream').toBeTruthy();
    expect(other, 'Disposable fixture needs two project labor streams').toBeTruthy();

    await signIn(page, 'finance');
    await page.goto(portal('/billing?lang=en'));
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();

    const composer = page.locator('[data-invoice-composer]');
    const recordStream = composer.locator('.composer-fields select').first();
    await expect(recordStream).toBeEnabled();
    await recordStream.selectOption(other!.id);
    const recordDates = composer.locator('.composer-fields input[type="date"]');
    await recordDates.nth(0).fill('2026-09-01');
    await recordDates.nth(1).fill('2026-09-30');
    await page
      .locator('[data-invoice-creation-modes] button')
      .filter({ hasText: 'Whole period' })
      .click();

    const wholeSurface = page.locator('[data-invoice-creation-mode="whole_period"]');
    await selectWholePeriodStep(page, 'Client / project');
    const wholeStream = wholeSurface.getByRole('combobox', {
      name: 'Project and billing stream',
      exact: true,
    });
    await expect(wholeStream).toHaveValue(other!.id);
    await expect(page.locator('input[name="periodStart"]')).toHaveValue('2026-09-01');
    await expect(page.locator('input[name="periodEnd"]')).toHaveValue('2026-09-30');

    await page
      .locator('[data-invoice-creation-modes] button')
      .filter({ hasText: 'Choose records' })
      .click();
    await expect(recordStream).toHaveValue(other!.id);
    await expect(recordDates.nth(0)).toHaveValue('2026-09-01');
    await expect(recordDates.nth(1)).toHaveValue('2026-09-30');
  });

  test('restores an unresolved record operation atomically and keeps both modes locked', async ({
    page,
  }) => {
    const rules = activeLaborRules();
    const first = rules[0];
    const other = rules.find((rule) => rule.project_id !== first?.project_id);
    expect(first, 'Disposable fixture needs an active labor stream').toBeTruthy();
    expect(other, 'Disposable fixture needs two project labor streams').toBeTruthy();

    await signIn(page, 'finance');
    const storageKey = `ja-invoice-composer:${financeUserId()}:standalone`;
    await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: {
        ruleId: other!.id,
        start: '2026-09-01',
        end: '2026-09-30',
        selected: [],
        requestKey: 'billing-review-unresolved',
        invoice: null,
        frozenCreate: {
          operation: 'create',
          projectId: other!.project_id,
          billingRuleId: other!.id,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          sources: [],
          requestKey: 'billing-review-unresolved',
        },
        uncertainCreate: true,
      },
    });
    await page.goto(
      portal(
        `/billing?billingRuleId=${encodeURIComponent(first!.id)}&periodStart=2026-10-01&periodEnd=2026-10-31&lang=en`,
      ),
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();

    const composer = page.locator('[data-invoice-composer]');
    await expect(composer.locator('.composer-fields select').first()).toHaveValue(other!.id);
    const restoredDates = composer.locator('.composer-fields input[type="date"]');
    await expect(restoredDates.nth(0)).not.toHaveValue('2026-10-01');
    await expect(restoredDates.nth(1)).not.toHaveValue('2026-10-31');
    await expect(restoredDates.nth(0)).toHaveValue(/\d{4}-\d{2}-\d{2}/);
    await expect(restoredDates.nth(1)).toHaveValue(/\d{4}-\d{2}-\d{2}/);
    await expect(composer.getByRole('alert')).toBeVisible();
    await expect(page.locator('[data-invoice-resume-context]')).toBeVisible();
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Choose records' }),
    ).toBeDisabled();
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Whole period' }),
    ).toBeDisabled();
  });

  test('explicit row scope overrides a stale saved stream and period', async ({ page }) => {
    const rules = activeLaborRules();
    const first = rules[0];
    const other = rules.find((rule) => rule.project_id !== first?.project_id);
    expect(first, 'Disposable fixture needs an active labor stream').toBeTruthy();
    expect(other, 'Disposable fixture needs two project labor streams').toBeTruthy();

    await signIn(page, 'finance');
    const storageKey = `ja-invoice-composer:${financeUserId()}:standalone`;
    await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: {
        ruleId: other!.id,
        start: '2026-09-01',
        end: '2026-09-30',
        selected: [],
        requestKey: 'billing-review-stale',
        invoice: null,
        frozenCreate: null,
        uncertainCreate: false,
      },
    });
    await page.goto(
      portal(
        `/billing?billingRuleId=${encodeURIComponent(first!.id)}&periodStart=2026-10-01&periodEnd=2026-10-31&lang=en`,
      ),
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();

    const composer = page.locator('[data-invoice-composer]');
    await expect(composer.locator('.composer-fields select').first()).toHaveValue(first!.id);
    const explicitDates = composer.locator('.composer-fields input[type="date"]');
    await expect(explicitDates.nth(0)).not.toHaveValue('2026-09-01');
    await expect(explicitDates.nth(1)).not.toHaveValue('2026-09-30');
    await expect(page.locator('[data-invoice-resume-context]')).toHaveCount(0);
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Whole period' }),
    ).toBeEnabled();
  });

  test('opens a milestone stream directly in whole-period mode', async ({ page }) => {
    const fixture = seedMilestoneFixture();

    await signIn(page, 'finance');
    await page.goto(
      portal(`/billing?view=streams&project=${encodeURIComponent(fixture.mixedProjectId)}&lang=en`),
    );
    await page.waitForLoadState('networkidle');
    const streamsTab = page.getByRole('tab', { name: 'Billing streams', exact: true });
    await expect(streamsTab).toBeVisible();
    await streamsTab.click();
    const row = page.locator(`[data-billing-rule="${fixture.mixedMilestoneRuleId}"]`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /^Create invoice ·/u }).click();
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Whole period' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Choose records' }),
    ).toBeDisabled();
    await expect(page.locator('[data-invoice-creation-mode="whole_period"]')).toBeVisible();
  });

  test('keeps milestone-only project invoice entry usable', async ({ page }) => {
    const fixture = seedMilestoneFixture();

    await signIn(page, 'finance');
    await page.goto(
      portal(`/billing?project=${encodeURIComponent(fixture.milestoneOnlyProjectId)}&lang=en`),
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Whole period' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('[data-invoice-creation-modes] button').filter({ hasText: 'Choose records' }),
    ).toBeDisabled();
    await expect(page.locator('[data-invoice-creation-mode="whole_period"]')).toBeVisible();
  });

  test('keeps the mobile invoice project action inside its card', async ({ page }) => {
    const fixture = invoiceProjectFixture();
    await signIn(page, 'finance');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      portal(
        `/billing?view=invoices&project=${encodeURIComponent(fixture.projectId)}&reset=1&lang=en`,
      ),
    );
    await page.waitForLoadState('networkidle');

    const projectLink = page
      .locator('[data-table-region-cards] [data-card-secondary-actions] a')
      .filter({ hasText: 'Open project' })
      .first();
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toHaveAttribute(
      'href',
      new RegExp(`/app/projects/${fixture.projectId}\\?tab=billing`),
    );
    await projectLink.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}\\?`));
  });
});

test('global invoice creation allows every project while a project launch stays scoped', async ({
  page,
}) => {
  const database = createDatabase(e2eDatabasePath);
  const rules = database.sqlite
    .prepare(
      `SELECT br.id,br.project_id
       FROM billing_rule br
       JOIN project p ON p.id=br.project_id AND p.status='active'
       WHERE br.enabled=1 AND br.stream_type='labor'
       ORDER BY br.project_id`,
    )
    .all() as { id: string; project_id: string }[];
  database.sqlite.close();
  const first = rules[0];
  const other = rules.find((rule) => rule.project_id !== first?.project_id);
  expect(first).toBeTruthy();
  expect(other).toBeTruthy();
  await signIn(page, 'finance');
  await page.goto(portal('/billing?lang=en'));
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();
  const composerSelect = page.locator('[data-invoice-composer] .composer-fields select').first();
  await expect(composerSelect.locator(`option[value="${first.id}"]`)).toHaveCount(1);
  await expect(composerSelect.locator(`option[value="${other!.id}"]`)).toHaveCount(1);
  await composerSelect.selectOption(other!.id);
  await expect(composerSelect).toHaveValue(other!.id);
  await page
    .locator('[data-invoice-creation-modes] button')
    .filter({ hasText: 'Whole period' })
    .click();
  const wholeSurface = page.locator('[data-invoice-creation-mode="whole_period"]');
  await selectWholePeriodStep(page, 'Client / project');
  const wholeSelect = wholeSurface.getByRole('combobox', {
    name: 'Project and billing stream',
    exact: true,
  });
  await expect(wholeSelect.locator(`option[value="${first.id}"]`)).toHaveCount(1);
  await expect(wholeSelect.locator(`option[value="${other!.id}"]`)).toHaveCount(1);
  await expect(wholeSelect).toHaveValue(other!.id);
  // A fresh route is a new, deliberately scoped invoice entry point.
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(portal(`/billing?project=${first.project_id}&lang=en`));
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();
  await expect(composerSelect.locator(`option[value="${first.id}"]`)).toHaveCount(1);
  await expect(composerSelect.locator(`option[value="${other!.id}"]`)).toHaveCount(0);
});

test('current billing period follows the project timezone across a month boundary', async ({
  page,
}) => {
  const fixture = seedMilestoneFixture();
  await signIn(page, 'finance');
  // Madrid is already in November while UTC is still in October.
  await page.clock.setFixedTime(new Date('2026-10-31T23:30:00Z'));
  await page.goto(portal(`/billing?project=${fixture.mixedProjectId}&lang=en`), {
    waitUntil: 'networkidle',
  });
  await page.getByRole('button', { name: 'Create invoice', exact: true }).first().click();
  const composer = page.locator('[data-invoice-composer]');
  await composer.getByRole('button', { name: 'Current billing period', exact: true }).click();
  const dates = composer.locator('.composer-fields input[type="date"]');
  await expect(dates.nth(0)).toHaveValue('2026-11-01');
  await expect(dates.nth(1)).toHaveValue('2026-11-30');
});
