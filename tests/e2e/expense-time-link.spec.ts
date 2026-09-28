import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('worker can delete an unlinked own draft from its detail', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  const summary = `Delete unlinked own draft ${info.project.name}`;
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'worker');
    await page.goto(portal('/time?lang=en'));
    await page.locator('[data-time-primary-cta]').click();
    const form = page.locator('form[data-time-entry-surface]');
    const projectId = await form
      .locator('[name="projectId"] option:not([value=""])')
      .first()
      .getAttribute('value');
    if (!projectId) throw new Error('A worker project is required');
    await form.locator('[name="projectId"]').selectOption(projectId);
    await form.getByRole('textbox', { name: 'Actual hours' }).fill('1');
    await form.locator('[name="summary"]').fill(summary);
    await form.getByRole('button', { name: 'Save draft' }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary))
      .toBeTruthy();
    const id = (
      db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary) as {
        id: string;
      }
    ).id;
    await page.goto(portal(`/time/${id}?lang=en`));
    const deleteButton = page.getByRole('button', { name: 'Delete draft' });
    await expect(deleteButton).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await deleteButton.click();
    await expect
      .poll(() => db.prepare('SELECT id FROM time_entry WHERE id=?').get(id))
      .toBeUndefined();
  } finally {
    db.close();
  }
});

test('worker links an expense with a local occurrence time to saved hours', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  const summary = `Expense-linked installation ${info.project.name}`;
  const description = `Parking after installation ${info.project.name}`;
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'worker');
    await page.goto(portal('/time?lang=en'));
    await page.locator('[data-time-primary-cta]').click();
    const timeForm = page.locator('form[data-time-entry-surface]');
    const projectId = await timeForm
      .locator('[name="projectId"] option:not([value=""])')
      .first()
      .getAttribute('value');
    if (!projectId) throw new Error('A worker project is required for this browser scenario');
    await timeForm.locator('[name="projectId"]').selectOption(projectId);
    const date = await timeForm.locator('[name="workDate"]').inputValue();
    await timeForm.getByRole('textbox', { name: 'Actual hours' }).fill('2.5');
    await timeForm.locator('[name="summary"]').fill(summary);
    await timeForm.getByRole('button', { name: 'Save draft' }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary))
      .toBeTruthy();
    const time = db
      .prepare('SELECT id,minutes FROM time_entry WHERE activity_summary=?')
      .get(summary) as {
      id: string;
      minutes: number;
    };
    expect(time.minutes).toBe(150);

    await page.goto(portal(`/time/${time.id}?lang=en`));
    await expect(page.getByRole('link', { name: 'Edit draft' })).toHaveAttribute(
      'href',
      `/j-aautomation/app/time?edit=${time.id}`,
    );
    await page.getByRole('link', { name: 'Edit draft' }).click();
    await expect(page.locator('form[data-time-entry-surface]')).toBeVisible();
    await page.goto(portal(`/time/${time.id}?lang=en`));
    await page
      .locator('main form[action*="submitTime"]')
      .getByRole('button', { name: 'Submit' })
      .click();
    await expect
      .poll(() => db.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(time.id))
      .toEqual({ approval_state: 'submitted' });
    await page.goto(portal(`/time/${time.id}?lang=en`));
    const submitted = page
      .locator('.record-facts div')
      .filter({ has: page.locator('dt', { hasText: 'Submitted' }) })
      .locator('dd');
    await expect(submitted).not.toHaveText(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
    await page.getByRole('link', { name: 'Add related expense' }).click();
    const expenseForm = page.locator('form[data-expense-entry-surface]');
    await expect(expenseForm).toBeVisible();
    const workerName = (
      db.prepare('SELECT name FROM user WHERE email=?').get('worker@demo.jaautomation.test') as {
        name: string;
      }
    ).name;
    await expect(
      page.locator('[data-filter-summary]').getByRole('link', {
        name: `Remove filter: Worker: ${workerName}`,
      }),
    ).toBeVisible();
    await expect(expenseForm.locator('[name="currency"]')).toHaveValue(
      (db.prepare('SELECT currency FROM project WHERE id=?').get(projectId) as { currency: string })
        .currency,
    );
    await expect(expenseForm.locator('[name="projectId"]')).toHaveValue(projectId);
    await expect(expenseForm.locator('[name="spentOn"]')).toHaveValue(date);
    await expect(
      expenseForm.locator(`[name="timeEntryId"] option[value="${time.id}"]`),
    ).toBeAttached();
    await expect(expenseForm.locator('[name="timeEntryId"]')).toHaveValue(time.id);
    await expenseForm.locator('[name="occurredTimeLocal"]').fill('14:35');
    await expenseForm.locator('[name="vendor"]').fill('Test parking operator');
    await expenseForm.locator('[name="amount"]').fill('12.50');
    await expenseForm.locator('[name="description"]').fill(description);
    await expenseForm.getByRole('button', { name: 'Save draft' }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM expense WHERE description=?').get(description))
      .toBeTruthy();
    const expense = db
      .prepare(
        'SELECT id,project_id,spent_on,occurred_time_local,time_entry_id,amount_minor FROM expense WHERE description=?',
      )
      .get(description) as Record<string, unknown>;
    expect(expense).toMatchObject({
      project_id: projectId,
      spent_on: date,
      occurred_time_local: '14:35',
      time_entry_id: time.id,
      amount_minor: 1250,
    });
    await page.goto(portal(`/expenses/${expense.id}?lang=en`));
    await expect(page.getByRole('link', { name: 'Open time record' })).toHaveAttribute(
      'href',
      `/j-aautomation/app/time/${time.id}`,
    );
    await expect(page.locator('main')).toContainText('14:35');
  } finally {
    db.close();
  }
});
