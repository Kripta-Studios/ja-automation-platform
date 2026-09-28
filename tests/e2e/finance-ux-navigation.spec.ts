import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('billing actions reveal their target form and project billing back keeps its step visible', async ({
  page,
}, testInfo) => {
  test.skip(!['desktop', 'phone-390'].includes(testInfo.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/billing?view=setup&lang=en'));
  const action = page.locator('.billing-section__setup-actions button').filter({
    hasText: 'New tax profile',
  });
  await action.click();
  const taxForm = page.locator('form[action="?/createTaxProfile"]');
  await expect(taxForm).toBeVisible();
  await expect(taxForm.locator('select, input').first()).toBeFocused();
  const taxTop = await taxForm.evaluate((element) => element.getBoundingClientRect().top);
  expect(taxTop).toBeGreaterThanOrEqual(70);
  expect(taxTop).toBeLessThan(testInfo.project.use.viewport!.height / 2);

  const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
  await page.goto(portal(`/projects/${projectId}?tab=billing&lang=en`));
  const form = page.locator('.billing-setup > form[action*="saveBillingSetup"]');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Continue' }).click();
  await expect(form.locator('fieldset legend')).toContainText('2. Billing details');
  const secondTop = await form
    .locator('fieldset')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(secondTop).toBeGreaterThanOrEqual(70);
  expect(secondTop).toBeLessThan(testInfo.project.use.viewport!.height / 2);
  await form.getByRole('button', { name: 'Back' }).click();
  await expect(form.locator('fieldset legend')).toContainText('1. Invoice arrangement');
  const firstTop = await form
    .locator('fieldset')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(firstTop).toBeGreaterThanOrEqual(70);
  expect(firstTop).toBeLessThan(testInfo.project.use.viewport!.height / 2);
});

test('invoice wizard keeps its current step, form, and next action reachable', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  await page.getByRole('button', { name: 'Create invoice' }).click();
  const wizard = page.locator('.billing-section__invoice-wizard');
  await expect(wizard.getByRole('heading', { name: 'Client / project' })).toBeVisible();
  await expect(wizard.getByLabel('Project and billing stream')).toBeVisible();
  const next = wizard.getByRole('button', { name: 'Next' });
  await expect(next).toBeVisible();
  const viewport = page.viewportSize()!;
  const nextBox = await next.boundingBox();
  expect(nextBox).not.toBeNull();
  expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(viewport.height);
  const geometry = await wizard.evaluate((form) => {
    const body = form.closest('.responsive-sheet-body');
    const section = form.querySelector('section');
    const description = section?.querySelector('p');
    const label = section?.querySelector('label');
    const select = label?.querySelector('select');
    if (!body || !section || !description || !label || !select)
      throw new Error('Invoice first-step controls are missing');
    const contentRight =
      body.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(body).paddingRight);
    return {
      contentRight,
      bodyOverflow: body.scrollWidth - body.clientWidth,
      elements: [section, description, label, select].map((element) => ({
        right: element.getBoundingClientRect().right,
        overflow: element.scrollWidth - element.clientWidth,
      })),
    };
  });
  expect(geometry.bodyOverflow, 'sheet body must not scroll horizontally').toBeLessThanOrEqual(1);
  for (const [index, element] of geometry.elements.entries()) {
    expect(
      element.right,
      `first-step element ${index} must fit within sheet padding`,
    ).toBeLessThanOrEqual(geometry.contentRight + 1);
    if (index !== 3)
      expect(element.overflow, `first-step element ${index} must wrap content`).toBeLessThanOrEqual(
        1,
      );
  }
  if (viewport.width <= 390) {
    const progress = wizard.locator('.billing-section__wizard-mobile-progress');
    const summary = progress.locator('summary');
    await expect(summary).toContainText('1/12 · Client / project');
    const summaryBox = await summary.boundingBox();
    expect(summaryBox).not.toBeNull();
    expect(summaryBox!.x).toBeGreaterThanOrEqual(0);
    expect(summaryBox!.x + summaryBox!.width).toBeLessThanOrEqual(viewport.width);
    await summary.click();
    await expect(progress.getByRole('button', { name: '12 Save / issue' })).toBeVisible();
    await progress.getByRole('button', { name: '12 Save / issue' }).click();
    await expect(wizard.getByRole('heading', { name: 'Save / issue' })).toBeVisible();
    await expect(summary).toContainText('12/12 · Save / issue');
  } else {
    await expect(
      wizard.locator('.billing-section__wizard-progress li[aria-current="step"]'),
    ).toContainText('Client / project');
  }
});

test('invoice sheet navigation moves focus to the selected section', async ({ page }, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  if (testInfo.project.name === 'phone-390')
    await page.getByRole('link', { name: 'Manage' }).first().click();
  else await page.getByRole('button', { name: 'Manage' }).first().click();
  const navigation = page.getByRole('navigation', { name: 'Jump to' });
  await navigation.getByRole('button', { name: 'Lifecycle' }).click();
  await expect(page.locator('#invoice-lifecycle')).toBeFocused();
  await navigation.getByRole('button', { name: 'Collections' }).click();
  await expect(page.locator('#invoice-collections')).toBeFocused();
});

test('empty hourly period is blocked while a positive fixed fee remains billable', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  let hourlyRule = '';
  let fixedRule = '';
  try {
    const rows = db
      .prepare(
        `SELECT br.id,p.billing_model FROM billing_rule br
      JOIN project p ON p.id=br.project_id
      WHERE br.stream_type='labor' AND br.enabled=1 AND p.billing_model IN ('tm','all_in')`,
      )
      .all() as Array<{ id: string; billing_model: string }>;
    hourlyRule = rows.find((row) => row.billing_model === 'tm')?.id ?? '';
    fixedRule = rows.find((row) => row.billing_model === 'all_in')?.id ?? '';
  } finally {
    db.close();
  }
  if (!hourlyRule || !fixedRule)
    throw new Error('Disposable hourly and fixed labor streams are required');
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  for (const [ruleId, fixed] of [
    [hourlyRule, false],
    [fixedRule, true],
  ] as const) {
    await page.getByRole('button', { name: 'Create invoice' }).click();
    const wizard = page.locator('.billing-section__invoice-wizard');
    await wizard.getByLabel('Project and billing stream').selectOption(ruleId);
    for (let index = 0; index < 3; index++)
      await wizard.getByRole('button', { name: 'Next' }).click();
    await wizard.getByLabel('Period start').fill('2026-09-14');
    await wizard.getByLabel('Period end').fill('2026-09-20');
    await wizard.getByRole('button', { name: 'Check selected period' }).click();
    await wizard.getByRole('button', { name: 'Next' }).click();
    if (fixed) await expect(wizard.getByText('No billable records')).toHaveCount(0);
    else await expect(wizard.getByText('No billable records')).toBeVisible();
    for (let index = 0; index < 7; index++)
      await wizard.getByRole('button', { name: 'Next' }).click();
    if (fixed)
      await expect(wizard.getByRole('button', { name: 'Save invoice draft' })).toBeEnabled();
    else {
      await expect(wizard.getByRole('button', { name: 'Save invoice draft' })).toBeDisabled();
      await expect(
        wizard.getByText('No billable labor records are available in this period.'),
      ).toBeVisible();
    }
    await page
      .locator('[data-ui="responsive-sheet"]')
      .getByRole('button', { name: 'Close' })
      .click();
  }
});
