import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator } from '@playwright/test';
import { periodForCadence } from '@ja/billing-engine';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

async function wizardStep(sheet: Locator, index: number): Promise<void> {
  const desktop = sheet.locator('.billing-section__wizard-progress');
  if (await desktop.isVisible()) {
    await desktop.locator('li').nth(index).getByRole('button').click();
  } else {
    const mobile = sheet.locator('.billing-section__wizard-mobile-progress');
    await mobile.locator('summary').click();
    await mobile.locator('li').nth(index).getByRole('button').click();
  }
}

test('Finance sale-rate copying needs explicit consent and separately reviewed internal cost', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const rate = db
    .prepare(
      `SELECT rate.id,rate.project_id projectId,rate.worker_id workerId,rate.currency,
    CAST(rate.hourly_rate_minor AS TEXT) amount,rate.effective_from effectiveFrom
    FROM client_labor_rate rate JOIN project ON project.id=rate.project_id
    WHERE project.status='active' AND rate.rate_basis='hourly'
    ORDER BY rate.id LIMIT 1`,
    )
    .get() as {
    id: string;
    projectId: string;
    workerId: string;
    currency: string;
    amount: string;
    effectiveFrom: string;
  };
  expect(rate).toBeTruthy();
  const costCount = () =>
    Number(
      (db.prepare('SELECT COUNT(*) count FROM internal_cost_rule').get() as { count: number })
        .count,
    );
  const before = costCount();
  try {
    await signIn(page, info.project.name === 'desktop' ? 'owner' : 'finance');
    await page.goto(
      portal(
        `/finance?view=commercial&project=${rate.projectId}&task=Client%20labor%20rates&lang=en`,
      ),
    );
    const card = page
      .locator('.record-list-item')
      .filter({ has: page.locator(`input[name="ruleId"][value="${rate.id}"]`) });
    const copy = card.locator('[data-client-rate-cost-copy]');
    await copy.locator('summary').click();
    const prepare = copy.getByRole('button', { name: 'Prepare internal cost' });
    await expect(prepare).toBeDisabled();
    await copy.getByRole('checkbox').check();
    await expect(prepare).toBeEnabled();
    await prepare.click();
    const cost = page.locator('form[data-finance-action="createInternalCostRule"]');
    await expect(cost).toBeVisible();
    await expect(cost.locator('[name="workerId"]')).toHaveValue(rate.workerId ?? '');
    await expect(cost.locator('[name="currency"]')).toHaveValue(rate.currency);
    await expect(cost.locator('[name="effectiveFrom"]')).toHaveValue(rate.effectiveFrom);
    await expect(cost.locator('[name="hourlyRateMinor"]')).toHaveValue(rate.amount);
    await expect(cost.locator('[name="overtimeMethod"]')).toHaveValue('NONE');
    await expect(cost.locator('[name="notes"]')).toHaveCount(1);
    await expect(cost.locator('[name="notes"]')).toHaveValue(new RegExp(rate.id));
    await expect(cost.locator('[data-internal-cost-copy-review]')).toContainText(
      'save this separate cost rule',
    );
    expect(costCount()).toBe(before);
    await expect(cost.getByRole('button', { name: 'Save internal cost' })).toBeVisible();
  } finally {
    db.close();
  }
});

test('checking an incompatible monthly period shows the exact automatic date alignment before draft creation', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const rule = db
    .prepare(
      `SELECT rule.id,rule.project_id projectId,rule.effective_from effectiveFrom,
    rule.effective_to effectiveTo,rule.monthly_cutoff_day cutoff
    FROM billing_rule rule JOIN project ON project.id=rule.project_id
    WHERE rule.enabled=1 AND rule.cadence_type='monthly' AND project.status='active'
    ORDER BY rule.id LIMIT 1`,
    )
    .get() as {
    id: string;
    projectId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    cutoff: number | null;
  };
  db.close();
  expect(rule).toBeTruthy();
  const cadence = periodForCadence('monthly', rule.effectiveFrom, {
    monthlyCutoffDay: rule.cutoff ?? undefined,
  })!;
  const expectedStart = cadence.start < rule.effectiveFrom ? rule.effectiveFrom : cadence.start;
  const expectedEnd =
    rule.effectiveTo && rule.effectiveTo < cadence.end ? rule.effectiveTo : cadence.end;
  const enteredStart = new Date(Date.parse(`${expectedStart}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  await signIn(page, 'finance');
  await page.goto(portal(`/billing?project=${rule.projectId}&lang=en`));
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await sheet.getByRole('combobox', { name: 'Project and billing stream' }).selectOption(rule.id);
  await wizardStep(sheet, 3);
  await sheet.getByLabel('Period start', { exact: true }).fill(enteredStart);
  await sheet.getByLabel('Period end', { exact: true }).fill(expectedEnd);
  const response = page.waitForResponse((response) =>
    response.url().includes('/api/billing/readiness'),
  );
  await sheet.getByRole('button', { name: 'Check selected period' }).click();
  const requested = new URL((await response).url());
  expect(requested.searchParams.get('periodStart')).toBe(expectedStart);
  expect(requested.searchParams.get('periodEnd')).toBe(expectedEnd);
  await expect(sheet.getByLabel('Period start', { exact: true })).toHaveValue(expectedStart);
  const warning = sheet.locator('[data-billing-period-aligned]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(
    `${enteredStart} – ${expectedEnd} → ${expectedStart} – ${expectedEnd}`,
  );
  await expect(warning).toContainText('before creating the draft');
});
