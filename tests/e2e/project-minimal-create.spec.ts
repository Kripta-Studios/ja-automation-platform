import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('owner creates a project without budgets or planned end', async ({ page }, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const name = `Optional project fields ${testInfo.project.name}`;
  const costCenter =
    testInfo.project.name === 'desktop'
      ? 'QA-9876'
      : e2eCostCenter('QA', 17, testInfo.project.name, 1);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await expect(form).toBeVisible();
    const clientId = await form
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!clientId) throw new Error('Project test requires an active client fixture');
    await form.locator('[name="clientId"]').selectOption(clientId);
    await form.locator('[name="name"]').fill(name);
    await form.locator('[name="costCenterCode"]').fill(costCenter);
    for (const field of [
      'plannedEndDate',
      'revenueBudgetMinor',
      'poCapMinor',
      'laborBudgetMinutes',
      'travelBudgetMinor',
    ])
      await expect(form.locator(`[name="${field}"]`)).toHaveValue('');
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name))
      .toBeTruthy();
    const created = db
      .prepare(
        'SELECT id,project_number,cost_center_code,planned_end_date,revenue_budget_minor,po_cap_minor,labor_budget_minutes,travel_budget_minor FROM project WHERE name=?',
      )
      .get(name) as Record<string, unknown>;
    expect(created).toMatchObject({
      cost_center_code: costCenter,
      planned_end_date: null,
      revenue_budget_minor: null,
      po_cap_minor: null,
      labor_budget_minutes: null,
      travel_budget_minor: null,
    });
    if (testInfo.project.name === 'desktop')
      expect(String(created.project_number)).toMatch(/-P-9876$/);
    const continuation = page.locator('[data-project-setup-next]');
    await expect(continuation).toBeVisible();
    await expect(
      continuation.getByRole('link', { name: 'Assign workers by expertise' }),
    ).toHaveAttribute('href', new RegExp(`action=assign-worker&project=${created.id}`));
    await expect(
      continuation.getByRole('link', { name: 'Configure per-person rates and expenses' }),
    ).toHaveAttribute('href', new RegExp(`view=commercial&project=${created.id}`));
    const pageWidth = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('body *')]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.left < window.innerWidth && box.right > window.innerWidth + 1;
        })
        .slice(0, 15)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className).slice(0, 80),
          text: element.textContent?.trim().slice(0, 80),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    }));
    expect(pageWidth.scrollWidth <= pageWidth.viewport + 1, JSON.stringify(pageWidth)).toBe(true);
    await page.goto(portal(`/projects/${created.id}`));
    await expect(page.locator('main')).toContainText(name);
    await expect(page.locator('main')).toContainText(costCenter);
    await page
      .locator('.attention-grid')
      .getByRole('link', { name: /Actual time/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/time\\?project=${created.id}`));
    await page.getByRole('button', { name: 'Log time', exact: true }).click();
    await expect(page.locator('form[action="?/createTime"] [name="projectId"]')).toHaveValue('');
    await expect(page.locator('form[action="?/createTime"]')).toContainText('Select worker');
    await page.goBack();
    await page
      .locator('.attention-grid')
      .getByRole('link', { name: /Reports/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/reports\\?project=${created.id}`));
  } finally {
    db.close();
  }
});

test('invalid project names show the field error and retain entered values', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await signIn(page, 'owner');
  await page.goto(portal('/projects'));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = page.locator('form[action="?/createProject"]');
  const costCenter = e2eCostCenter('QA-RETAIN', 17, testInfo.project.name, 2);
  await form.locator('[name="name"]').fill('X');
  await form.locator('[name="costCenterCode"]').fill(costCenter);
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('[data-project-field-errors]')).toContainText('Name');
  await expect(form.locator('[name="name"]')).toHaveValue('X');
  await expect(form.locator('[name="costCenterCode"]')).toHaveValue(costCenter);
});

test('project budgets use currency amounts and hours in the browser but persist exact units', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const name = `QA project budget display ${Date.now()}`;
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    await form.locator('[name="name"]').fill(name);
    await form
      .locator('[name="costCenterCode"]')
      .fill(e2eCostCenter('QA-BUDGET-UNITS', 17, testInfo.project.name, 3));
    await form.locator('[name="budgetType"]').selectOption('combined');
    await form.getByRole('textbox', { name: 'Revenue budget' }).fill('15000,25');
    await form.getByRole('textbox', { name: 'PO cap' }).fill('18000.00');
    await form.getByRole('textbox', { name: 'Planned labor hours' }).fill('7.5');
    await form.getByRole('textbox', { name: 'Travel budget' }).fill('2500');
    await expect(form.locator('[name="revenueBudgetMinor"]')).toHaveValue('1500025');
    await expect(form.locator('[name="poCapMinor"]')).toHaveValue('1800000');
    await expect(form.locator('[name="laborBudgetMinutes"]')).toHaveValue('450');
    await expect(form.locator('[name="travelBudgetMinor"]')).toHaveValue('250000');
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(() =>
        db
          .prepare(
            'SELECT revenue_budget_minor,po_cap_minor,labor_budget_minutes,travel_budget_minor FROM project WHERE name=?',
          )
          .get(name),
      )
      .toMatchObject({
        revenue_budget_minor: 1500025,
        po_cap_minor: 1800000,
        labor_budget_minutes: 450,
        travel_budget_minor: 250000,
      });
  } finally {
    db.close();
  }
});
