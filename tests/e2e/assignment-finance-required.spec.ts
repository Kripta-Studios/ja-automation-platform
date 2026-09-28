import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('Owner enters EUR cost and compensation terms when assigning a worker', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  let projectId = '';
  let workerId = '';
  try {
    const repository = new PortalRepository(database.sqlite);
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    workerId = userId(e2eCredentials.worker.email);
    const client = repository.createClient(owner, {
      legalName: `EUR assignment finance client ${randomUUID()}`,
      displayName: `EUR assignment finance client ${testInfo.project.name}`,
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: 'eur-assignment@example.test',
      billingAddress: 'Disposable test address',
    });
    projectId = repository.createProject(owner, {
      clientId: client.id,
      name: `EUR assignment finance ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-EUR-ASSIGN', 79, testInfo.project.name),
      currency: 'EUR',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-10-01',
      projectManagerId: userId(e2eCredentials.manager.email),
    }).id;
  } finally {
    database.sqlite.close();
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/projects?action=assign-worker&project=${projectId}`));
  const form = page.locator(
    '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
  );
  await expect(form).toBeVisible();
  await expect(form).toContainText('EUR');
  await form.locator('select[name="workerId"]').selectOption(workerId);
  await form.locator('input[name="startsOn"]').fill('2026-10-01');
  await form.locator('input[name="endsOn"]').fill('2026-10-31');
  await expect(form.locator('input[name="financeEffectiveFrom"]')).toHaveValue('2026-10-01');
  await expect(form.locator('input[name="financeEffectiveTo"]')).toHaveValue('2026-10-31');
  await expect(form.locator('input[name="internalCostHourlyRate"]')).toBeVisible();
  await expect(form.locator('input[name="compensationRate"]')).toBeVisible();
  await expect(form.locator('select[name="compensationBasis"]')).toBeVisible();

  let submitted = 0;
  const onRequest = (request: { url(): string }) => {
    if (request.url().includes('?/assignWorker')) submitted += 1;
  };
  page.on('request', onRequest);
  await form.getByRole('button', { name: 'Assign', exact: true }).click();
  expect(submitted).toBe(0);
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  await expect(form.locator('input[name="internalCostHourlyRate"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  page.off('request', onRequest);

  await form.locator('input[name="internalCostHourlyRate"]').fill('28.00');
  await form.locator('input[name="compensationRate"]').fill('20.00');
  await form.locator('select[name="compensationBasis"]').selectOption('hourly');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await testInfo.attach(`eur-assignment-owner-${testInfo.project.name}`, {
    body: await form.screenshot({
      mask: [
        form.locator('select[name="workerId"]'),
        form.locator('input[name="internalCostHourlyRate"]'),
        form.locator('input[name="compensationRate"]'),
      ],
    }),
    contentType: 'image/png',
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/assignWorker'),
  );
  await form.getByRole('button', { name: 'Assign', exact: true }).click();
  expect((await responsePromise).status()).toBeLessThan(400);
  await expect(page.getByRole('status').filter({ hasText: /assignment|saved/i })).toBeVisible();

  const saved = createDatabase(databasePath);
  try {
    expect(
      saved.sqlite
        .prepare('SELECT COUNT(*) n FROM project_member WHERE project_id=? AND user_id=?')
        .get(projectId, workerId),
    ).toEqual({ n: 1 });
    expect(
      saved.sqlite
        .prepare(
          `SELECT currency,hourly_rate_minor,effective_from,effective_to
      FROM internal_cost_rule WHERE project_id=? AND worker_id=?`,
        )
        .get(projectId, workerId),
    ).toEqual({
      currency: 'EUR',
      hourly_rate_minor: 2800,
      effective_from: '2026-10-01',
      effective_to: '2026-10-31',
    });
    expect(
      saved.sqlite
        .prepare(
          `SELECT currency,rate_minor,rate_basis,effective_from,effective_to
      FROM compensation_rule WHERE project_id=? AND worker_id=?`,
        )
        .get(projectId, workerId),
    ).toEqual({
      currency: 'EUR',
      rate_minor: 2000,
      rate_basis: 'hourly',
      effective_from: '2026-10-01',
      effective_to: '2026-10-31',
    });
  } finally {
    saved.sqlite.close();
  }

  await page.context().clearCookies();
  await signIn(page, 'manager');
  await page.goto(portal(`/projects?action=assign-worker&project=${projectId}`));
  const managerForm = page.locator(
    '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
  );
  await expect(managerForm).toBeVisible();
  await expect(managerForm.locator('input[name="internalCostHourlyRate"]')).toHaveCount(0);
  await expect(managerForm.locator('input[name="compensationRate"]')).toHaveCount(0);
  await expect(managerForm).not.toContainText('28.00');
  await expect(managerForm).not.toContainText('20.00');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(
    consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
});
