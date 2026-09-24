import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('owner configures separate worker reimbursement and customer recovery for a person', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const today = new Date().toISOString().slice(0, 10);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const person = db
      .prepare(
        `SELECT pm.id,pm.project_id FROM project_member pm
         JOIN project p ON p.id=pm.project_id
         WHERE pm.status='active' AND pm.starts_on<=?
           AND (pm.ends_on IS NULL OR pm.ends_on>=?) AND p.status='active'
         ORDER BY pm.id LIMIT 1`,
      )
      .get(today, today) as { id: string; project_id: string } | undefined;
    if (!person) throw new Error('Expense policy test requires an active assignment');
    await signIn(page, 'owner');
    await page.goto(portal(`/finance?view=commercial&project=${person.project_id}`));
    await page.locator('#finance-configuration-task').selectOption('Person expense policies');
    const form = page.locator('form[data-assignment-expense-policy-form]');
    await expect(form).toBeVisible();
    await form.locator('[name="projectMemberId"]').selectOption(person.id);
    await form.locator('[name="payer"]').selectOption('worker');
    await form.locator('[name="category"]').fill('parking');
    await form.locator('[name="effectiveFrom"]').fill(today);
    await form.locator('[name="workerReimbursement"]').selectOption('at_cost');
    await form.locator('[name="clientRecovery"]').selectOption('included');
    await form.locator('[name="reason"]').fill('QA independent reimbursement and billing');
    await form.getByRole('button', { name: 'Save person expense policy' }).click();
    await expect
      .poll(() =>
        db
          .prepare(
            `SELECT worker_reimbursement,client_recovery FROM assignment_expense_policy
             WHERE project_member_id=? AND category='parking' AND effective_from=?`,
          )
          .get(person.id, today),
      )
      .toMatchObject({ worker_reimbursement: 'at_cost', client_recovery: 'included' });
    await page.goto(portal(`/finance?view=commercial&project=${person.project_id}`));
    await page.locator('#finance-configuration-task').selectOption('Person expense policies');
    await expect(page.locator('[data-assignment-expense-policies]')).toContainText('parking');
  } finally {
    db.close();
  }
});

test('person expense policy deep link opens the exact project configuration task', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const today = new Date().toISOString().slice(0, 10);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const person = db
      .prepare(
        `SELECT pm.project_id FROM project_member pm
         JOIN project p ON p.id=pm.project_id
         WHERE pm.status='active' AND pm.starts_on<=?
           AND (pm.ends_on IS NULL OR pm.ends_on>=?) AND p.status='active'
         ORDER BY pm.id LIMIT 1`,
      )
      .get(today, today) as { project_id: string } | undefined;
    if (!person) throw new Error('Expense policy deep-link test requires an active assignment');
    await signIn(page, 'owner');
    await page.goto(
      portal(`/finance?view=commercial&project=${person.project_id}#person-expense-policies`),
    );
    await expect(page.locator('#finance-configuration-task')).toHaveValue(
      'Person expense policies',
    );
    await expect(page.locator('#person-expense-policies')).toBeVisible();
    await expect(page.locator('form[data-assignment-expense-policy-form]')).toBeVisible();
  } finally {
    db.close();
  }
});
