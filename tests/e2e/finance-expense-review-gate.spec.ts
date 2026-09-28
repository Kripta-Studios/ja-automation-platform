import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

/** Copy only disposable demo data, leaving the existing Finance history intact. */
function seedApprovedUnclassifiedExpense(
  db: DatabaseSync,
  viewport: string,
): {
  id: string;
  projectId: string;
} {
  const source = db
    .prepare(
      `SELECT e.* FROM expense e
        WHERE e.approval_state='approved'
          AND e.finance_approved_at IS NOT NULL
          AND e.commercial_classification_state='classified'
          AND e.billing_state='unlocked'
          AND e.invoice_id IS NULL
          AND e.who_paid='worker'
          AND EXISTS (
            SELECT 1 FROM project_legal_entity_assignment a
             WHERE a.project_id=e.project_id
               AND a.effective_from<=e.spent_on
               AND (a.effective_to IS NULL OR a.effective_to>=e.spent_on)
          )
        ORDER BY e.id LIMIT 1`,
    )
    .get() as Record<string, string | number | null> | undefined;
  if (!source) throw new Error('The QA fixture needs an approved expense with issuing authority');

  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const clone = {
    ...source,
    id,
    vendor: `QA Finance gate ${viewport}`,
    description: `QA approved expense awaiting Finance classification ${viewport}`,
    commercial_classification_state: 'unclassified',
    expense_policy_required: 0,
    assignment_expense_policy_id: null,
    finance_approved_by: null,
    finance_approved_at: null,
    reimbursement_amount_minor: null,
    billing_amount_minor: null,
    project_currency_amount_minor: null,
    tax_amount_minor: null,
    fx_rate_bps: null,
    invoice_id: null,
    billing_lock_id: null,
    reimbursement_state: 'pending',
    reimbursed_at: null,
    reimbursement_reference: null,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const columns = Object.keys(clone);
  db.prepare(
    `INSERT INTO expense (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
  ).run(...Object.values(clone));
  return { id, projectId: String(source.project_id) };
}

test('Finance classification gates review, then allows it after saving', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const expense = seedApprovedUnclassifiedExpense(db, info.project.name);
    await signIn(page, 'finance');
    await page.goto(
      portal(
        `/approvals?tab=expenses&stage=finance&project=${encodeURIComponent(expense.projectId)}`,
      ),
    );
    const row = page.locator(`[data-finance-review-row="${expense.id}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-finance-classification-required]')).toContainText(
      'Classify this expense before Finance review.',
    );
    await expect(row.getByRole('button', { name: 'Record Finance review' })).toHaveCount(0);
    await row.getByRole('link', { name: 'Classify expense in Finance' }).click();
    await expect(page).toHaveURL(new RegExp(`expense=${expense.id}`));

    const classification = page.locator(
      `[data-finance-expense-id="${expense.id}"] [data-finance-expense-classification]`,
    );
    await expect(classification).toBeVisible();
    await expect(
      classification.getByRole('button', { name: 'Save Finance classification' }),
    ).toBeEnabled();
    await classification
      .locator('textarea[name="reason"]')
      .fill('Browser QA review classification');
    const classifyResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('?/classifyExpenseCommercially'),
    );
    await classification.getByRole('button', { name: 'Save Finance classification' }).click();
    expect((await classifyResponse).status()).toBe(200);
    await expect
      .poll(() =>
        db
          .prepare('SELECT commercial_classification_state FROM expense WHERE id=?')
          .get(expense.id),
      )
      .toEqual({ commercial_classification_state: 'classified' });

    await page.goto(
      portal(
        `/approvals?tab=expenses&stage=finance&project=${encodeURIComponent(expense.projectId)}`,
      ),
    );
    await expect(row).toBeVisible();
    await expect(row.locator('[data-finance-classification-required]')).toHaveCount(0);
    const review = row.getByRole('button', { name: 'Record Finance review' });
    await expect(review).toBeVisible();
    const reviewResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/financeApprove'),
    );
    await review.click();
    expect((await reviewResponse).status()).toBe(200);
    await expect
      .poll(() => db.prepare('SELECT finance_approved_at FROM expense WHERE id=?').get(expense.id))
      .toMatchObject({ finance_approved_at: expect.any(String) });
    await expect(row).toHaveCount(0);

    const reviewed = db
      .prepare('SELECT finance_approved_at,version FROM expense WHERE id=?')
      .get(expense.id);
    // A second browser tab could still hold the old form. Replay its POST through
    // the authenticated browser and prove it cannot revise the recorded review.
    const staleReplay = await page.evaluate(
      async ({ url, id }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({ type: 'expense', id }),
        });
        return { httpStatus: response.status, action: await response.json() };
      },
      { url: portal('/approvals?/financeApprove'), id: expense.id },
    );
    expect(staleReplay.httpStatus).toBe(200);
    expect(staleReplay.action).toMatchObject({ type: 'failure', status: 409 });
    expect(JSON.stringify(staleReplay.action)).toContain('FINANCE_REVIEW_UNAVAILABLE');
    expect(
      db.prepare('SELECT finance_approved_at,version FROM expense WHERE id=?').get(expense.id),
    ).toEqual(reviewed);
  } finally {
    db.close();
  }
});
