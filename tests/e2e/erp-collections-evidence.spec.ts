import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('Finance can reconcile current partial collections, aging and filtered exports', async ({
  page,
}, testInfo) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const invoiceId = randomUUID();
  const invoiceNumber = `AGING-${invoiceId}`;
  let projectId = '';
  try {
    const rule = db.sqlite
      .prepare("SELECT id,project_id FROM billing_rule WHERE currency='USD' LIMIT 1")
      .get()!;
    projectId = String(rule.project_id);
    const now = new Date().toISOString();
    db.sqlite
      .prepare(
        "INSERT INTO invoice(id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,snapshot_json,issued_at,due_at,expected_collection_on,created_at,updated_at) VALUES(?,?,?,?,'labor','partially_paid','USD',10000,0,10000,'{}','2020-01-01T12:00:00.000Z','2020-01-31','2099-01-01',?,?)",
      )
      .run(invoiceId, projectId, rule.id, invoiceNumber, now, now);
    db.sqlite
      .prepare(
        "INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at) VALUES(?,?,2500,'USD',?,?,?)",
      )
      .run(randomUUID(), invoiceId, now, 'ERP collection regression', now);
  } finally {
    db.sqlite.close();
  }

  await signIn(page, 'finance');
  await page.goto(portal(`/ledger?lang=en&project=${projectId}&q=${invoiceNumber}&status=overdue`));
  const filter = page.getByRole('form', { name: 'Filter collections ledger' });
  await expect(filter.locator('select[name="project"]')).toHaveValue(projectId);
  const summary = page.locator('[data-aging-currency="USD"]');
  await expect(summary).toContainText('75.00');
  await expect(summary).toContainText('Over 90 days overdue');
  const csvLink = page.getByRole('link', { name: 'Export CSV', exact: true });
  const href = await csvLink.getAttribute('href');
  expect(href).not.toContain('periodEnd');
  const response = await page.request.get(new URL(href!, portal()).href);
  expect(response.status()).toBe(200);
  const csv = await response.text();
  expect(csv).toContain(invoiceNumber);
  expect(csv).toContain('2500,0,2500,2500,7500');
  expect(csv).toContain('over_90');
  expect(csv).toContain(projectId);
  expect(csv).toContain('2099-01-01');
  expect(csv).toContain('balanceAsOf');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  await filter.locator('select[name="aging"]').selectOption('current');
  await expect(page.getByText('No ledger rows found').first()).toBeVisible();
  await filter.locator('select[name="aging"]').selectOption('over_90');
  await filter.getByRole('button', { name: 'Apply filters' }).click();
  await expect(filter.locator('select[name="aging"]')).toHaveValue('over_90');
  const screen = page.locator('[data-ui="collections-ledger-section"]');
  await expect(screen).toContainText(invoiceNumber);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await filter.locator('select, input, button').all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThan(90);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }
  expect(
    (await new AxeBuilder({ page }).include('[data-ui="collections-ledger-section"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('collections-aging.png'), fullPage: true });
  await page.goto(portal(`/ledger?lang=es&q=${invoiceNumber}`));
  await expect(
    page.getByRole('heading', { name: 'Antigüedad de saldos pendientes', exact: true }),
  ).toBeVisible();
});

test('Credits reconcile gross and net balances without losing historical issuance cutoffs', async ({
  page,
}) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const prefix = `CREDIT-${randomUUID()}`;
  try {
    const rule = db.sqlite
      .prepare("SELECT id,project_id FROM billing_rule WHERE currency='USD' LIMIT 1")
      .get()!;
    const insert = db.sqlite.prepare(
      "INSERT INTO invoice(id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,snapshot_json,issued_at,due_at,expected_collection_on,created_at,updated_at) VALUES(?,?,?,?,?,'issued','USD',?,0,?,'{}',?,'2020-01-31','2099-01-01',?,?)",
    );
    const now = new Date().toISOString();
    for (const [suffix, amount, issued] of [
      ['original', 10000, '2020-01-01'],
      ['partial', -2500, '2021-01-01'],
      ['remaining', -7500, '2022-01-01'],
    ] as const)
      insert.run(
        randomUUID(),
        rule.project_id,
        rule.id,
        `${prefix}-${suffix}`,
        amount < 0 ? 'adjustment' : 'labor',
        amount,
        amount,
        `${issued}T12:00:00.000Z`,
        now,
        now,
      );
  } finally {
    db.sqlite.close();
  }
  await signIn(page, 'finance');
  await page.goto(portal(`/ledger?lang=en&q=${prefix}&status=outstanding`));
  const summary = page.locator('[data-aging-currency="USD"]');
  await expect(summary.getByRole('heading')).toContainText('Net outstanding: $0.00');
  await expect(summary).toContainText('Gross receivables: $100.00');
  await expect(summary).toContainText('Credit balances: -$100.00');
  const endpoint = `/api/invoice-collection-ledger/csv?q=${prefix}&status=outstanding`;
  const current = await page.request.get(portal(endpoint));
  expect(current.status()).toBe(200);
  const csv = await current.text();
  for (const suffix of ['original', 'partial', 'remaining'])
    expect(csv).toContain(`${prefix}-${suffix}`);
  expect(csv).toContain('credit');
  for (const [year, included] of [
    ['2020', ['original']],
    ['2021', ['original', 'partial']],
  ] as const) {
    const response = await page.request.get(
      portal(`${endpoint}&periodStart=2020-01-01&periodEnd=${year}-12-31`),
    );
    expect(response.status()).toBe(200);
    const historic = await response.text();
    for (const suffix of included) expect(historic).toContain(`${prefix}-${suffix}`);
    expect(historic).not.toContain(`${prefix}-remaining`);
    if (year === '2020') expect(historic).not.toContain(`${prefix}-partial`);
    expect(historic).not.toContain('2099-01-01');
  }
  for (const invalid of ['currency=GBP', 'aging=invalid', 'project=a&project=b'])
    expect((await page.request.get(portal(`${endpoint}&${invalid}`))).status()).toBe(400);
});

test('Workers can find missing receipts and export the same authorized expenses', async ({
  page,
}, testInfo) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const vendor = `Receipt-${randomUUID()}`;
  const expenseId = randomUUID();
  try {
    const source = db.sqlite
      .prepare(
        "SELECT e.* FROM expense e JOIN user u ON u.id=e.worker_id WHERE u.email='worker@demo.jaautomation.test' LIMIT 1",
      )
      .get()!;
    expect(source).toBeTruthy();
    const other = db.sqlite
      .prepare("SELECT id FROM user WHERE email='rafael@demo.jaautomation.test'")
      .get()!;
    const insert = db.sqlite.prepare(
      "INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,vendor,description,who_paid,payment_method,receipt_required,approval_state,created_at,updated_at) VALUES(?,?,?,?,?,?,1000,'reimbursable',?,'Receipt filter regression','worker','personal_card',1,'draft',?,?)",
    );
    const now = new Date().toISOString();
    for (const [id, worker, suffix] of [
      [expenseId, source.worker_id, ''],
      [randomUUID(), other.id, '-OTHER-PRIVATE'],
    ])
      insert.run(
        id,
        source.project_id,
        worker,
        source.spent_on,
        source.category,
        source.currency,
        `${vendor}${suffix}`,
        now,
        now,
      );
  } finally {
    db.sqlite.close();
  }
  await signIn(page, 'worker');
  await page.goto(portal(`/expenses?lang=en&q=${vendor}`));
  const summary = page.locator('.expense-status-strip');
  await summary.getByRole('link', { name: /Required receipt missing/ }).click();
  await expect(page.locator('select[name="receipt"]')).toHaveValue('missing');
  await expect(page.locator('[data-expense-record]')).toHaveCount(1);
  await expect(page.locator(`[data-expense-record="${expenseId}"]`)).toBeVisible();
  for (const record of await page.locator('[data-expense-record]').all())
    await expect(record).toContainText('Required receipt missing');
  const exportLink = page
    .locator('.expense-export-panel')
    .first()
    .getByRole('link', { name: 'Download CSV' });
  await expect(exportLink).toBeVisible();
  {
    const href = await exportLink.getAttribute('href');
    expect(href).toContain('receipt=missing');
    const response = await page.request.get(new URL(href!, portal()).href);
    expect(response.status()).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(vendor);
    expect(csv).not.toContain('-OTHER-PRIVATE');
    expect(csv).not.toMatch(/client_rate|internal_cost|contribution_margin/iu);
  }
  expect((await page.request.get(portal('/api/invoice-collection-ledger/csv'))).status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('expense-evidence.png'), fullPage: true });
});

test('PM receives operational receipt controls without reimbursement controls', async ({
  page,
}) => {
  await signIn(page, 'manager');
  await page.goto(portal('/expenses?lang=en'));
  await expect(page.locator('select[name="receipt"]')).toBeVisible();
  await expect(page.locator('select[name="reimbursement"]')).toHaveCount(0);
  await expect(page.getByText('Reimbursement status', { exact: true })).toHaveCount(0);
  expect((await page.request.get(portal('/api/invoice-collection-ledger/csv'))).status()).toBe(403);
});
