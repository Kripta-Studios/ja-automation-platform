import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { PortalRepository } from '@ja/database';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('owner configures one or two customer invoices from the project at phone, tablet and desktop widths', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const name = `Project billing setup ${testInfo.project.name} ${randomUUID()}`;
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const create = page.locator('form[action="?/createProject"]');
    const clientId = await create
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!clientId) throw new Error('An active client is required for project billing setup');
    await create.locator('[name="clientId"]').selectOption(clientId);
    await create.locator('[name="name"]').fill(name);
    await create.locator('[name="costCenterCode"]').fill(`QA-BILL-SETUP-${testInfo.project.name}`);
    await create.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name))
      .toBeTruthy();
    const project = db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string };
    await page.goto(portal(`/projects/${project.id}?tab=billing`));
    const setup = page.getByRole('region', { name: 'Project billing setup' });
    await expect(setup).toBeVisible();
    await expect(setup.getByText('One invoice with two sections')).toBeVisible();
    await expect(setup.locator('[name="mode"]')).toHaveValue('combined');
    await setup.getByRole('button', { name: 'Continue' }).click();
    await expect(setup.getByText('2. Billing details')).toBeVisible();
    await expect(setup.getByLabel('Issuing legal entity')).not.toHaveValue('');
    await expect(setup.getByLabel('Labor tax profile')).not.toHaveValue('');
    await setup.getByRole('button', { name: 'Continue' }).click();
    await expect(setup.getByText('3. Review each person')).toBeVisible();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await expect(setup.getByText('4. Review and save')).toBeVisible();
    await setup.getByLabel('Save these defaults as a reusable template').check();
    await setup.getByLabel('Template name').fill(`QA invoice ${testInfo.project.name}`);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Viewport is required');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const saveBox = await setup.getByRole('button', { name: 'Save billing setup' }).boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.height).toBeGreaterThanOrEqual(44);
    expect(saveBox!.x + saveBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    await setup.getByRole('button', { name: 'Save billing setup' }).click();
    await expect
      .poll(() =>
        db
          .prepare(
            'SELECT mode FROM project_billing_setup_revision WHERE project_id=? AND version=1',
          )
          .get(project.id),
      )
      .toEqual({ mode: 'combined' });
    expect(
      db
        .prepare('SELECT stream_type,include_expenses FROM billing_rule WHERE project_id=?')
        .all(project.id),
    ).toEqual([{ stream_type: 'labor', include_expenses: 1 }]);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Project billing setup' })).toBeVisible();
    const templateOption = page
      .getByRole('region', { name: 'Project billing setup' })
      .getByLabel('Start from a saved template')
      .locator('option')
      .filter({ hasText: `QA invoice ${testInfo.project.name}` });
    await expect(templateOption).toContainText(`QA invoice ${testInfo.project.name}`);
    await setup
      .getByLabel('Start from a saved template')
      .selectOption((await templateOption.getAttribute('value')) ?? '');
    await expect(setup.locator('[name="mode"]')).toHaveValue('combined');
    await setup.getByText('Two separate invoices').click();
    await expect(setup.locator('[name="mode"]')).toHaveValue('separate');
    await setup.getByRole('button', { name: 'Continue' }).click();
    await expect(setup.getByLabel('Expense tax profile', { exact: true })).toBeVisible();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Save billing setup' }).click();
    await expect
      .poll(() =>
        db
          .prepare(
            'SELECT mode FROM project_billing_setup_revision WHERE project_id=? AND version=2',
          )
          .get(project.id),
      )
      .toEqual({ mode: 'separate' });
    expect(
      db
        .prepare(
          'SELECT stream_type,include_expenses FROM billing_rule WHERE project_id=? AND enabled=1 ORDER BY stream_type',
        )
        .all(project.id),
    ).toEqual([
      { stream_type: 'expense', include_expenses: 0 },
      { stream_type: 'labor', include_expenses: 0 },
    ]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    if (testInfo.project.name === 'desktop') {
      await page.reload();
      await expect(setup.locator('[name="mode"]')).toHaveValue('separate');
      await expect(setup.getByText('Billing setup saved')).toBeVisible();
      await expect(
        setup.getByText('Assign an issuing legal entity revision to this project.'),
      ).toBeVisible();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByLabel('Recipient email').fill('qa-billing@example.test');
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.locator('[name="expectedVersion"]').evaluate((input) => {
        (input as HTMLInputElement).value = '0';
      });
      await setup.getByRole('button', { name: 'Save billing setup' }).click();
      await expect(setup.getByRole('alert')).toContainText('Check billing setup fields');
      await expect(setup.locator('[name="recipientEmail"]')).toHaveValue('qa-billing@example.test');
      await expect(setup.getByRole('button', { name: 'Save billing setup' })).toBeEnabled();
      expect(
        db
          .prepare('SELECT COUNT(*) count FROM project_billing_setup_revision WHERE project_id=?')
          .get(project.id),
      ).toEqual({ count: 2 });
      await page.reload();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByLabel('Recipient email').fill('qa-billing@example.test');
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.locator('[name="recipientEmail"]').evaluate((input) => {
        (input as HTMLInputElement).value = 'invalid-address';
      });
      await setup.getByRole('button', { name: 'Save billing setup' }).click();
      await expect(setup.getByText('2. Billing details')).toBeVisible();
      await expect(setup.getByLabel('Recipient email')).toHaveAttribute('aria-invalid', 'true');
      await expect(setup.getByLabel('Recipient email')).toHaveValue('invalid-address');
      await page.reload();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByLabel('Labor billing cadence').selectOption('every_14_days');
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Save billing setup' }).click();
      await expect(setup.getByText('2. Billing details')).toBeVisible();
      await expect(setup.getByLabel('Labor cadence anchor date')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(setup.getByLabel('Labor cadence anchor date')).toBeFocused();
      await page.reload();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByLabel('Expense billing cadence').selectOption('every_14_days');
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Save billing setup' }).click();
      await expect(setup.getByText('2. Billing details')).toBeVisible();
      await expect(setup.getByLabel('Expense cadence anchor date')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(setup.getByLabel('Expense cadence anchor date')).toBeFocused();
      await page.reload();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByRole('button', { name: 'Continue' }).click();
      await setup.getByLabel('Save these defaults as a reusable template').check();
      await setup.getByLabel('Template name').fill('A');
      await setup.getByRole('button', { name: 'Save billing setup' }).click();
      await expect(setup.getByText('4. Review and save')).toBeVisible();
      await expect(setup.getByLabel('Template name')).toHaveAttribute('aria-invalid', 'true');
      await expect(setup.getByLabel('Template name')).toBeFocused();
    }
  } finally {
    db.close();
  }
});

test('billing setup labels translate in Spanish and Portuguese', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const row = db
      .prepare("SELECT id FROM project WHERE currency='USD' ORDER BY created_at DESC LIMIT 1")
      .get() as { id: string } | undefined;
    if (!row) throw new Error('A project is required for locale verification');
    await signIn(page, 'owner');
    await page.goto(portal(`/projects/${row.id}?tab=billing&lang=es`));
    await expect(page.getByText('Una factura con dos secciones')).toBeVisible();
    await page.goto(portal(`/projects/${row.id}?tab=billing&lang=pt`));
    await expect(page.getByText('Uma fatura com duas seções')).toBeVisible();
  } finally {
    db.close();
  }
});

test('owner saves different project-person rates, pay and expense treatment inline', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const repository = new PortalRepository(db);
    const ownerRow = db
      .prepare("SELECT id FROM user WHERE email='owner@demo.jaautomation.test'")
      .get() as { id: string } | undefined;
    const client = db
      .prepare("SELECT id FROM client WHERE status='active' AND currency='USD' LIMIT 1")
      .get() as { id: string } | undefined;
    const workers = db
      .prepare(
        "SELECT id,name FROM user WHERE role='worker' AND status='active' ORDER BY id LIMIT 2",
      )
      .all() as Array<{ id: string; name: string }>;
    if (!ownerRow || !client || workers.length !== 2)
      throw new Error('Owner, USD client and two workers required');
    const owner = repository.principalFor(ownerRow.id);
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: `Project person terms ${randomUUID()}`,
      costCenterCode: `QA-PERSON-${testInfo.project.name}`,
      currency: 'USD',
      timezone: 'Europe/Madrid',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    const futureDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    for (const [index, worker] of workers.entries())
      repository.assignWorker(owner, {
        projectId: project.id,
        workerId: worker.id,
        startsOn: index === 1 ? futureDate : '2026-01-01',
      });
    await signIn(page, 'owner');
    await page.goto(portal(`/projects/${project.id}?tab=billing`));
    const setup = page.getByRole('region', { name: 'Project billing setup' });
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Continue' }).click();
    const firstPerson = setup.locator('.person-terms').filter({
      has: page.getByRole('heading', { name: workers[0]!.name }),
    });
    const secondPerson = setup.locator('.person-terms').filter({
      has: page.getByRole('heading', { name: workers[1]!.name }),
    });
    await expect(secondPerson.getByLabel('Terms effective from')).toHaveValue(futureDate);
    await firstPerson.getByLabel('Customer hourly rate (USD)').fill('55.00');
    await firstPerson.getByLabel('Worker compensation rate (USD)').fill('30.00');
    await setup.getByLabel('Copy draft terms from').selectOption(workers[0]!.id);
    await secondPerson.getByLabel('Apply draft defaults to this person').check();
    await setup.getByRole('button', { name: 'Apply to selected people' }).click();
    await expect(secondPerson.getByLabel('Customer hourly rate (USD)')).toHaveValue('55.00');
    await expect(secondPerson.getByLabel('Worker compensation rate (USD)')).toHaveValue('30.00');
    await secondPerson.getByLabel('Customer hourly rate (USD)').fill('70.00');
    await secondPerson.getByLabel('Worker compensation rate (USD)').fill('45.00');
    await secondPerson.getByLabel('Charge customer for expense').selectOption('markup');
    await secondPerson.getByLabel('Expense markup percentage').fill('10');
    await secondPerson.getByLabel('Expense payer').selectOption('company_card');
    await secondPerson.getByLabel('Charge customer for expense').selectOption('included');
    await firstPerson.getByLabel('Apply draft defaults to this person').check();
    await setup.getByRole('button', { name: 'Save selected people' }).click();
    await expect(setup.getByText('3. Review each person')).toBeVisible();
    await expect
      .poll(() =>
        db
          .prepare(
            'SELECT COUNT(*) count FROM assignment_rate_override o JOIN project_member pm ON pm.id=o.project_member_id WHERE pm.project_id=?',
          )
          .get(project.id),
      )
      .toEqual({ count: 2 });
    await page.reload();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Continue' }).click();
    for (const [index, customer, pay] of [
      [0, '55.00', '30.00'],
      [1, '70.00', '45.00'],
    ] as const) {
      const person = setup
        .locator('.person-terms')
        .filter({ has: page.getByRole('heading', { name: workers[index]!.name }) });
      await expect(person.getByLabel('Customer hourly rate (USD)')).toHaveValue(customer);
      await expect(person.getByLabel('Worker compensation rate (USD)')).toHaveValue(pay);
    }
    expect(
      db
        .prepare(
          'SELECT hourly_rate_minor FROM client_labor_rate WHERE project_id=? ORDER BY hourly_rate_minor',
        )
        .all(project.id),
    ).toEqual([{ hourly_rate_minor: 5500 }, { hourly_rate_minor: 7000 }]);
    expect(
      db
        .prepare(
          'SELECT payer,worker_reimbursement,client_recovery FROM assignment_expense_policy ep JOIN project_member pm ON pm.id=ep.project_member_id WHERE pm.project_id=? ORDER BY payer',
        )
        .all(project.id),
    ).toEqual([
      { payer: 'company_card', worker_reimbursement: 'none', client_recovery: 'included' },
      { payer: 'worker', worker_reimbursement: 'at_cost', client_recovery: 'at_cost' },
    ]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  } finally {
    db.close();
  }
});

test('missing issuer and tax show a recovery path before billing setup can continue', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const repository = new PortalRepository(db);
    const ownerRow = db
      .prepare("SELECT id FROM user WHERE email='owner@demo.jaautomation.test'")
      .get() as { id: string } | undefined;
    if (!ownerRow) throw new Error('Owner fixture is required');
    const owner = repository.principalFor(ownerRow.id);
    const client = repository.createClient(owner, {
      legalName: `Missing issuer client ${randomUUID()}`,
      displayName: 'Missing issuer client',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      billingEmail: 'billing@example.test',
      billingAddress: 'Test address, São Paulo',
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: `Missing issuer project ${randomUUID()}`,
      costCenterCode: 'QA-BILLING-PREREQUISITE',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      billingModel: 'tm',
      startDate: '2026-01-01',
    });
    await signIn(page, 'owner');
    await page.goto(portal(`/projects/${project.id}?tab=billing`));
    const setup = page.getByRole('region', { name: 'Project billing setup' });
    await setup.getByRole('button', { name: 'Continue' }).click();
    await expect(setup.getByRole('alert')).toContainText(
      'An active issuing entity and tax profile',
    );
    await expect(
      setup.getByRole('link', { name: 'Configure legal entities and tax profiles' }),
    ).toHaveAttribute('href', /\/app\/finance\?view=commercial&project=/);
    await expect(setup.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(
      db
        .prepare('SELECT COUNT(*) count FROM project_billing_setup_revision WHERE project_id=?')
        .get(project.id),
    ).toEqual({ count: 0 });
  } finally {
    db.close();
  }
});
