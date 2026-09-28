import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type Row = Record<string, string | number | null>;

function cloneRow(
  db: DatabaseSync,
  table: 'invoice' | 'invoice_line',
  source: Row,
  overrides: Row,
): void {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name,
  );
  const values = columns.map((column) =>
    column in overrides ? overrides[column] : source[column],
  );
  db.prepare(
    `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
  ).run(...values);
}

function createMixedPreviewFixture(): { id: string; labor: string; expense: string } {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const invoices = db
      .prepare(
        `SELECT labor.id labor_id,expense.id expense_id
         FROM invoice labor JOIN invoice expense ON expense.project_id=labor.project_id
        WHERE labor.state='draft' AND expense.state='draft'
          AND labor.stream_type='labor' AND expense.stream_type='expense'
          AND EXISTS(SELECT 1 FROM invoice_line WHERE invoice_id=labor.id)
          AND EXISTS(SELECT 1 FROM invoice_line WHERE invoice_id=expense.id)
        LIMIT 1`,
      )
      .get() as { labor_id: string; expense_id: string } | undefined;
    if (!invoices)
      throw new Error(
        'Disposable browser fixture needs labor and expense draft lines for one project',
      );
    const labor = db.prepare('SELECT * FROM invoice WHERE id=?').get(invoices.labor_id) as Row;
    const laborLines = db
      .prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY rowid')
      .all(invoices.labor_id) as Row[];
    const expenseLines = db
      .prepare('SELECT * FROM invoice_line WHERE invoice_id=? ORDER BY rowid')
      .all(invoices.expense_id) as Row[];
    const lines = [...laborLines, ...expenseLines];
    const subtotal = lines.reduce((sum, line) => sum + BigInt(String(line.subtotal_minor)), 0n);
    const id = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      cloneRow(db, 'invoice', labor, {
        id,
        billing_rule_id: null,
        invoice_number: null,
        state: 'draft',
        subtotal_minor: Number(subtotal),
        tax_minor: 0,
        total_minor: Number(subtotal),
        snapshot_json: null,
        calculation_hash: null,
      });
      lines.forEach((line, index) =>
        cloneRow(db, 'invoice_line', line, {
          id: randomUUID(),
          invoice_id: id,
          line_number: index + 1,
        }),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return {
      id,
      labor: String(laborLines[0]!.description),
      expense: String(expenseLines[0]!.description),
    };
  } finally {
    db.close();
  }
}

test('mixed invoice displays separate labor and expenses on phone, tablet and desktop', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const invoice = createMixedPreviewFixture();
  await signIn(page, 'owner');
  await page.goto(portal(`/billing/invoices/${invoice.id}`));
  const groups = page.locator('.invoice-line-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).getByRole('heading', { name: 'Labor' })).toBeVisible();
  await expect(groups.nth(0)).toContainText(invoice.labor);
  await expect(groups.nth(1).getByRole('heading', { name: 'Expenses' })).toBeVisible();
  await expect(groups.nth(1)).toContainText(invoice.expense);
  await expect(groups.nth(0).locator('tfoot')).toContainText('Subtotal');
  await expect(groups.nth(1).locator('tfoot')).toContainText('Subtotal');
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
});
