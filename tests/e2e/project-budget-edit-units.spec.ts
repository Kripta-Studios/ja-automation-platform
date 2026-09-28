import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const budgetColumns = `budget_minor,revenue_budget_minor,po_cap_minor,fixed_price_minor,
  labor_budget_minutes,travel_budget_minor,expense_budget_minor,other_cost_budget_minor,planned_minutes`;

async function openEditor(page: Page): Promise<Locator> {
  await page.locator('[data-project-edit-cta]').click();
  const form = page.locator('form.project-edit-form:visible');
  await expect(form).toBeVisible();
  return form;
}

test('project edit displays currency and hours, then saves, clears and preserves zero', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const name = `Budget edit units ${testInfo.project.name} ${randomUUID()}`;
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const createForm = page.locator('form[action="?/createProject"]');
    const clientId = await createForm
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!clientId) throw new Error('E2E fixture needs an active client');
    await createForm.locator('[name="clientId"]').selectOption(clientId);
    await createForm.locator('[name="name"]').fill(name);
    await createForm
      .locator('[name="costCenterCode"]')
      .fill(e2eCostCenter('QA-BUDGET', 8, testInfo.project.name));
    await createForm.getByRole('textbox', { name: 'Revenue budget' }).fill('15000.25');
    await createForm.getByRole('textbox', { name: 'Expense budget' }).fill('300.25');
    await createForm.getByRole('textbox', { name: 'Planned labor hours' }).fill('7.5');
    await createForm.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(
        () => (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id?: string })?.id,
      )
      .toBeTruthy();
    const { id } = db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string };
    const saved = () =>
      db.prepare(`SELECT ${budgetColumns} FROM project WHERE id=?`).get(id) as Record<
        string,
        number | null
      >;

    await page.goto(portal(`/projects/${id}`));
    let form = await openEditor(page);
    await expect(form.getByRole('textbox', { name: 'Revenue budget' })).toHaveValue('15000.25');
    await expect(form.getByRole('textbox', { name: 'Expense budget' })).toHaveValue('300.25');
    await expect(form.getByRole('textbox', { name: 'Planned labor hours' })).toHaveValue('7.5');
    await expect(form.getByRole('textbox', { name: 'PO cap' })).toHaveValue('');
    await expect(form.locator('[name="revenueBudgetMinor"]')).toHaveValue('1500025');
    await expect(form.locator('[name="laborBudgetMinutes"]')).toHaveValue('450');

    for (const label of [
      'Revenue budget',
      'Planned labor hours',
      'Expense budget',
      'Other cost budget',
    ]) {
      const box = await form.getByRole('textbox', { name: label, exact: true }).boundingBox();
      const viewport = page.viewportSize();
      expect(box, `${label} must be visible`).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    }

    await form.getByRole('textbox', { name: 'Budget', exact: true }).fill('99,01');
    await form.getByRole('textbox', { name: 'Revenue budget' }).fill('16000,50');
    await form.getByRole('textbox', { name: 'PO cap' }).fill('20000');
    await form.getByRole('textbox', { name: 'Explicit fixed labor price' }).fill('1200.00');
    await form.getByRole('textbox', { name: 'Planned labor hours' }).fill('8.5');
    await form.getByRole('textbox', { name: 'Travel budget' }).fill('250,75');
    await form.getByRole('textbox', { name: 'Expense budget' }).fill('950,50');
    await form.getByRole('textbox', { name: 'Other cost budget' }).fill('75.10');
    await form.getByRole('textbox', { name: 'Planned hours' }).fill('12.5');
    await expect(form.locator('[name="budgetMinor"]')).toHaveValue('9901');
    await expect(form.locator('[name="laborBudgetMinutes"]')).toHaveValue('510');
    await expect(form.locator('[name="plannedMinutes"]')).toHaveValue('750');
    await form.getByRole('button', { name: 'Save project' }).click();
    await expect.poll(saved).toMatchObject({
      budget_minor: 9901,
      revenue_budget_minor: 1600050,
      po_cap_minor: 2000000,
      fixed_price_minor: 120000,
      labor_budget_minutes: 510,
      travel_budget_minor: 25075,
      expense_budget_minor: 95050,
      other_cost_budget_minor: 7510,
      planned_minutes: 750,
    });

    await page.reload();
    form = await openEditor(page);
    await expect(form.getByRole('textbox', { name: 'Budget', exact: true })).toHaveValue('99.01');
    await expect(form.getByRole('textbox', { name: 'Revenue budget' })).toHaveValue('16000.50');
    await expect(form.getByRole('textbox', { name: 'Planned hours' })).toHaveValue('12.5');
    for (const label of [
      'Budget',
      'Revenue budget',
      'PO cap',
      'Explicit fixed labor price',
      'Planned labor hours',
      'Travel budget',
      'Expense budget',
      'Other cost budget',
      'Planned hours',
    ])
      await form.getByRole('textbox', { name: label, exact: true }).fill('');
    await form.getByRole('button', { name: 'Save project' }).click();
    await expect.poll(saved).toMatchObject({
      budget_minor: null,
      revenue_budget_minor: null,
      po_cap_minor: null,
      fixed_price_minor: null,
      labor_budget_minutes: null,
      travel_budget_minor: null,
      expense_budget_minor: null,
      other_cost_budget_minor: null,
      planned_minutes: null,
    });

    await page.reload();
    form = await openEditor(page);
    await form.getByRole('textbox', { name: 'Revenue budget' }).fill('0');
    await form.getByRole('textbox', { name: 'Planned hours' }).fill('0');
    await form.getByRole('button', { name: 'Save project' }).click();
    await expect.poll(saved).toMatchObject({
      revenue_budget_minor: 0,
      planned_minutes: 0,
      budget_minor: null,
    });
  } finally {
    db.close();
  }
});
