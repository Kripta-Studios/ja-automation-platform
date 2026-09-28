import { expect, test } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('Accounting summary controls filter the register', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/accounting?lang=en'));
  await page
    .locator('.accounting-section__attention')
    .getByRole('button', { name: /Failed/ })
    .click();
  await expect(page.locator('#accounting-register select').first()).toHaveValue('failed');
  await page
    .locator('.accounting-section__attention')
    .getByRole('button', { name: /^Packs/ })
    .click();
  await expect(page.locator('#accounting-register select').first()).toHaveValue('');
});

test('Planning honors project filters and keeps the requested selector', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/planning?lang=en'));
  const selector = page.locator('select[name=project]');
  const project = await selector.locator('option').nth(1).getAttribute('value');
  expect(project).toBeTruthy();
  await selector.selectOption(project!);
  await selector
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Filter', exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get('project') === project);
  await expect(selector).toHaveValue(project!);
  await expect
    .poll(() =>
      page
        .locator('.record-card-link')
        .evaluateAll(
          (rows, id) => rows.every((row) => row.getAttribute('href')?.includes(`project=${id}`)),
          project,
        ),
    )
    .toBe(true);
  await page.goto(portal(`/planning?lang=en&project=${randomUUID()}`));
  await expect(page.locator('.record-card-link')).toHaveCount(0);
});

test('Operational summary cards open complete filters and expose ordering', async ({ page }) => {
  await signIn(page, 'worker');

  await page.goto(portal('/time?lang=en'));
  await expect(page.locator('.time-filters select[name=order]')).toHaveValue('newest');
  await page
    .locator('.time-status-strip')
    .getByRole('link', { name: /Needs attention/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('attention');

  await page.goto(portal('/expenses?lang=en'));
  await expect(page.locator('.expense-filters select[name=order]')).toHaveValue('newest');
  await page
    .locator('.expense-status-strip')
    .getByRole('link', { name: /Needs attention/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('attention');
  await page
    .locator('.expense-status-strip')
    .getByRole('link', { name: /Reimbursement/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('reimbursement')).toBe('pending');

  await page.goto(portal('/reports?lang=en&view=technical'));
  await expect(page.locator('.report-register-filters select[name=order]')).toHaveValue('newest');
  await page
    .locator('.report-attention')
    .getByRole('link', { name: /Needs attention/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('technical');
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('attention');
});

test('Approval queue keeps unresolved and completed groups independently ordered', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/approvals?lang=en'));

  await expect(page.locator('.approval-filters select[name=order]')).toHaveValue('oldest');
  await page
    .locator('.approval-attention')
    .getByRole('link', { name: /Needs attention/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('attention');
});

test('Client sign-off and generated files stay within eight-row pages', async ({ page }) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const insertedIds: string[] = [];
  let projectId = '';
  try {
    const owner = db.sqlite
      .prepare("SELECT id FROM user WHERE email='owner@demo.jaautomation.test'")
      .get()!;
    const project = db.sqlite
      .prepare(
        'SELECT p.id FROM project p WHERE NOT EXISTS (SELECT 1 FROM period_report r WHERE r.project_id=p.id) ORDER BY p.id LIMIT 1',
      )
      .get()!;
    projectId = String(project.id);
    const insert = db.sqlite.prepare(
      "INSERT INTO period_report(id,project_id,period_start,period_end,audience,report_type,state,snapshot_json,created_by,created_at,updated_at) VALUES(?,?,?,?,'customer','weekly_summary','draft','{}',?,?,?)",
    );
    for (let index = 1; index <= 10; index += 1) {
      const id = randomUUID();
      const day = String(index).padStart(2, '0');
      insertedIds.push(id);
      insert.run(
        id,
        projectId,
        `2099-01-${day}`,
        `2099-01-${day}`,
        owner.id,
        `2099-01-${day}`,
        `2099-01-${day}`,
      );
    }
  } finally {
    db.sqlite.close();
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/reports?lang=en&view=signoff&project=${projectId}`));

  const signoffCards = page.locator('.report-signoff-register .report-signoff-card');
  await expect(signoffCards).toHaveCount(8);
  await page
    .locator('.report-signoff-register .record-browser__pages')
    .getByRole('button', { name: /Next/ })
    .click();
  await expect(signoffCards).toHaveCount(2);

  const generatedCards = page.locator('.report-period-register .report-period-card');
  await expect(generatedCards).toHaveCount(8);
  for (const id of insertedIds.slice(0, 8)) {
    await expect(page.locator(`[data-period-report-id="${id}"]`).first()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  }
});

test('Finance summary cards drill into the selected project workflows', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/finance?lang=en&view=economic'));

  await expect(page.locator('.finance-overview__attention a')).toHaveCount(4);
  await expect(page.locator('.finance-overview__hero a')).toHaveCount(4);
  await page
    .locator('.finance-overview__attention')
    .getByRole('link', { name: /Settlement review/ })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('source')).toBe('settlements');
  await expect.poll(() => new URL(page.url()).hash).toBe('#worker-payments');
  await expect(page.locator('#worker-payments')).toBeVisible();

  await page.goto(portal('/finance?lang=en&view=economic'));
  await page
    .locator('.finance-overview__hero')
    .getByRole('link', { name: /^Hours/ })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/time$/);
  await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBeTruthy();
});

test('Collections summaries filter and invoice rows open their detail', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/ledger?lang=en'));

  const status = page.locator('.collections-ledger__filters select');
  await page
    .locator('.collections-ledger__attention')
    .getByRole('button', { name: /Partially paid/ })
    .click();
  await expect(status).toHaveValue('partially_paid');
  await page
    .locator('.collections-ledger__attention')
    .getByRole('button', { name: /Issued invoices/ })
    .click();
  await expect(status).toHaveValue('');

  const invoice = page
    .locator('.collections-ledger__invoice-link:visible, [data-card-action]:visible')
    .first();
  await expect(invoice).toBeVisible();
  await invoice.click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/billing\/invoices\//);
});

test('Billing setup reveals one guided configuration action at a time', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  await page.getByRole('tab', { name: 'Configure billing' }).click();

  const setup = page.locator('.billing-section__config-body');
  await expect(setup.locator('.billing-section__directories')).toBeVisible();
  await expect(setup.locator('form[action="?/createBillingRule"]')).toBeVisible();
  await expect(setup.locator('.billing-section__config-form:visible')).toHaveCount(1);

  await setup.getByRole('button', { name: 'New tax profile' }).click();
  await expect(setup.locator('form[action="?/createTaxProfile"]')).toBeVisible();
  await expect(setup.locator('.billing-section__config-form:visible')).toHaveCount(1);

  await setup.getByRole('button', { name: 'Invoice numbering policy' }).click();
  await expect(setup.locator('form[action="?/createInvoiceNumberPolicy"]')).toBeVisible();
  await expect(setup.locator('.billing-section__config-form:visible')).toHaveCount(1);
  await expect(setup.locator('.billing-section__directories')).toBeVisible();
});

test('Focused management records open beyond the first page', async ({ page }) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const ids: string[] = [];
  try {
    const worker = db.sqlite
      .prepare("SELECT id FROM user WHERE email='worker@demo.jaautomation.test'")
      .get()!;
    for (let day = 1; day <= 10; day++) {
      const id = randomUUID();
      ids.push(id);
      const date = `2098-01-${String(day).padStart(2, '0')}`;
      db.sqlite
        .prepare(
          "INSERT INTO worker_availability(id,worker_id,starts_at,ends_at,availability,created_at,updated_at) VALUES(?,?,?,?,'tentative',?,?)",
        )
        .run(id, worker.id, `${date}T08:00:00Z`, `${date}T16:00:00Z`, date, date);
    }
  } finally {
    db.sqlite.close();
  }
  await signIn(page, 'owner');
  await page.goto(portal(`/manage?area=worker_availability&focus=${ids.at(-1)}&lang=en`));
  const form = page.locator(`form:has(input[name=id][value="${ids.at(-1)}"])`).first();
  await expect(form).toBeVisible();
});

test('Supplier report keeps a single sidebar and worker exports deny another identity', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/supplier/report?lang=en'));
  await expect(page.locator('.portal-layout > aside')).toHaveCount(1);
  await page.context().clearCookies();
  await signIn(page, 'worker');
  const denied = await page.request.get(
    portal(`/expenses/export?from=2026-01-01&to=2026-12-31&worker=${randomUUID()}&format=csv`),
  );
  expect(denied.status()).toBe(403);
  const own = await page.request.get(
    portal('/expenses/export?from=2026-01-01&to=2026-12-31&format=csv'),
  );
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toContain('text/csv');
  expect(await own.text()).not.toMatch(/client_rate|internal_cost|margin/);
  const profileDenied = await page.request.post(portal('/projects?/setWorkforceProfile'), {
    form: { workerId: randomUUID(), profile: 'supplier_coordinator', supplierId: randomUUID() },
    headers: { origin: 'http://127.0.0.1:4174' },
  });
  // SvelteKit returns enhanced action failures in a 200 transport response.
  expect(await profileDenied.json()).toMatchObject({ type: 'failure', status: 403 });
});

test('Register filters survive opening a detail and returning', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  const search = page.locator('.record-browser__controls input[type="search"]').first();
  await search.fill('Body');
  await page.goto(portal('/help?lang=en'));
  await page.goBack();
  await expect(search).toHaveValue('Body');
});
