import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('customer sale rate Save retains the actual values, repeated Save is idempotent, and conflicts have a recovery route', async ({
  page,
}, info) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(info.project.name));
  await signIn(page, 'owner');
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const repo = new PortalRepository(db.sqlite);
    const v3 = new V3Repository(db.sqlite);
    const ownerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const session = db.sqlite
      .prepare(
        'SELECT id FROM session WHERE user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 1',
      )
      .get(ownerId, new Date().toISOString()) as { id: string };
    const owner = repo.principalFor(ownerId, session.id);
    const workerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
        id: string;
      }
    ).id;
    const client = repo.createClient(owner, {
      legalName: `Sale rate client ${randomUUID()}`,
      displayName: `Sale rate feedback ${info.project.name}`,
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'sale-rate@example.test',
      billingAddress: 'Disposable rate test address',
    });
    const project = repo.createProject(owner, {
      clientId: client.id,
      name: `Sale rate feedback ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-RATE-SAVE', 94, info.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-10-01',
    });
    if (
      (
        db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(project.id) as {
          status: string;
        }
      ).status !== 'active'
    )
      repo.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Activate disposable rate feedback fixture',
      });
    repo.assignWorker(owner, { projectId: project.id, workerId, startsOn: '2026-10-01' });
    const entity = repo.createLegalEntity(owner, {
      code: `R${randomUUID().slice(0, 8).toUpperCase()}`,
      legalName: 'Rate feedback issuer',
      currency: 'USD',
      billingAddress: 'Disposable rate test address',
      companyIdentifiers: 'RATE-TEST',
    });
    const revision = v3.createCanonicalLegalEntityRevision(owner, {
      legacyLegalEntityId: entity.id,
      effectiveFrom: '2026-10-01',
      legalName: 'Rate feedback issuer',
      taxIdentifier: 'RATE-TEST',
      addressLine1: 'Disposable rate test address',
      locality: 'Test City',
      postalCode: '10001',
      countryCode: 'US',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: 'Disposable rate feedback fixture',
      idempotencyKey: randomUUID(),
    });
    v3.assignCanonicalLegalEntityToProject(owner, {
      projectId: project.id,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: '2026-10-01',
      reason: 'Disposable rate feedback fixture',
      idempotencyKey: randomUUID(),
    });
    const tax = repo.createTaxProfile(owner, {
      legalEntityId: entity.id,
      name: `Rate feedback tax ${randomUUID()}`,
      currency: 'USD',
      effectiveFrom: '2026-10-01',
      components: [{ name: 'Zero tax', basisPoints: 0 }],
    });
    const rule = repo.createBillingRule(owner, {
      projectId: project.id,
      legalEntityId: entity.id,
      taxProfileId: tax.id,
      streamType: 'labor',
      cadenceType: 'custom',
      currency: 'USD',
      effectiveFrom: '2026-10-01',
    });
    const sourceId = randomUUID();
    const now = new Date().toISOString();
    // Disposable accepted source isolates rate resolution from the separate approval-policy tests.
    db.sqlite
      .prepare(
        'INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,finance_approved_by,finance_approved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        sourceId,
        project.id,
        workerId,
        '2026-10-15',
        'regular',
        60,
        'approved',
        'billable',
        ownerId,
        now,
        now,
        now,
      );
    db.sqlite
      .prepare(
        'INSERT INTO internal_cost_rule(id,worker_id,project_id,currency,hourly_rate_minor,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(randomUUID(), workerId, project.id, 'USD', 2800, '2026-10-01', now, now);
    db.sqlite
      .prepare(
        'INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(randomUUID(), workerId, project.id, 'USD', 2000, 'hourly', '2026-10-01', now, now);

    await page.goto(
      portal(`/finance?view=commercial&project=${project.id}&task=Client%20labor%20rate&lang=en`),
    );
    const form = page.locator('[data-finance-action="createClientLaborRate"]');
    await expect(form).toBeVisible();
    await form.locator('[name="workerId"]').selectOption('');
    await form.locator('[name="category"]').selectOption('');
    await form.getByRole('textbox', { name: 'Hourly rate', exact: true }).fill('70.00');
    await expect(form.locator('label[for="finance-client-effective"]')).toContainText(
      'Effective from',
    );
    await form.locator('input[name="effectiveFrom"]').fill('2026-10-15');
    const save = form.getByRole('button', { name: 'Save client rate', exact: true });
    await save.scrollIntoViewIfNeeded();
    const bounds = await save.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createClientLaborRate'),
    );
    await save.click();
    expect((await responsePromise).status()).toBeLessThan(400);
    await expect(page.locator('[data-saved-client-rate]')).toContainText('70.00');
    await expect(page.locator('[data-saved-client-rate]')).toContainText('2026-10-15');
    await expect(form.getByRole('textbox', { name: 'Hourly rate', exact: true })).toHaveValue(
      '70.00',
    );
    await expect(form.locator('input[name="effectiveFrom"]')).toHaveValue('2026-10-15');
    const rate = db.sqlite
      .prepare(
        'SELECT id,hourly_rate_minor,effective_from FROM client_labor_rate WHERE project_id=?',
      )
      .get(project.id) as { id: string; hourly_rate_minor: number; effective_from: string };
    expect(rate).toMatchObject({ hourly_rate_minor: 7000, effective_from: '2026-10-15' });
    const repeated = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createClientLaborRate'),
    );
    await save.click();
    expect((await repeated).status()).toBeLessThan(400);
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) n FROM client_labor_rate WHERE project_id=?')
        .get(project.id),
    ).toEqual({ n: 1 });
    await page
      .locator('[data-saved-client-rate]')
      .getByRole('link', { name: 'Client labor rates' })
      .click();
    await page.reload();
    const rates = page.locator('[aria-label="Client labor rates"]');
    await expect(rates).toContainText('70.00');
    await expect(rates).toContainText('2026-10-15');

    const duplicateId = randomUUID();
    const columns = db.sqlite
      .prepare("SELECT name FROM pragma_table_info('client_labor_rate')")
      .all() as { name: string }[];
    const names = columns.map((column) => `"${column.name}"`).join(',');
    const selections = columns
      .map((column) => (column.name === 'id' ? '?' : `"${column.name}"`))
      .join(',');
    db.sqlite
      .prepare(
        `INSERT INTO client_labor_rate(${names}) SELECT ${selections} FROM client_labor_rate WHERE id=?`,
      )
      .run(duplicateId, rate.id);
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) n FROM client_labor_rate WHERE project_id=?')
        .get(project.id),
    ).toEqual({ n: 2 });
    const readinessPath = portal(
      `/api/billing/readiness?billingRuleId=${rule.id}&periodStart=2026-10-15&periodEnd=2026-10-15`,
    );
    const ready = await page.request.get(readinessPath);
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toMatchObject({
      state: 'ready',
      includedSourceCount: 1,
      hasPositiveDraftAmount: true,
    });
    db.sqlite
      .prepare('UPDATE client_labor_rate SET hourly_rate_minor=7100 WHERE id=?')
      .run(duplicateId);
    const conflict = await page.request.get(readinessPath);
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: 'BILLING_READINESS_AMBIGUOUS_CLIENT_RATE',
      messageKey: 'problem.billing.readinessAmbiguousClientRate',
      remedies: [{ id: 'review_client_rates' }],
    });
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) n FROM client_labor_rate WHERE project_id=?')
        .get(project.id),
    ).toEqual({ n: 2 });
  } finally {
    db.sqlite.close();
  }
});
