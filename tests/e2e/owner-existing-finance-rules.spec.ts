import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('Owner can assign with existing authorized finance rules without creating duplicate rates', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const databasePath = readE2EFixturePointer().databasePath;
  const setup = createDatabase(databasePath);
  let projectId = '';
  let workerId = '';
  try {
    const repository = new PortalRepository(setup.sqlite);
    const ownerId = (
      setup.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email) as {
        id: string;
      }
    ).id;
    const owner = repository.principalFor(ownerId);
    const client = repository.createClient(owner, {
      legalName: `Existing finance client ${randomUUID()}`,
      displayName: `Existing finance client ${testInfo.project.name}`,
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingEmail: 'existing-finance@example.test',
      billingAddress: 'Disposable test address',
    });
    projectId = repository.createProject(owner, {
      clientId: client.id,
      name: `Existing finance assignment ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-EXIST-FIN', 80, testInfo.project.name),
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      billingModel: 'tm',
      startDate: '2026-10-01',
    }).id;
    workerId = randomUUID();
    const now = new Date().toISOString();
    setup.sqlite
      .prepare(
        `INSERT INTO user
      (id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
      VALUES (?,?,?,1,'worker','active',0,?,?)`,
      )
      .run(
        workerId,
        `Existing finance worker ${testInfo.project.name}`,
        `existing-finance-${workerId}@example.test`,
        now,
        now,
      );
    setup.sqlite
      .prepare(
        `INSERT INTO internal_cost_rule
      (id,worker_id,project_id,currency,hourly_rate_minor,effective_from,effective_to,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), workerId, projectId, 'EUR', 2800, '2026-10-01', '2026-10-31', now, now);
    setup.sqlite
      .prepare(
        `INSERT INTO compensation_rule
      (id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,effective_to,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        workerId,
        projectId,
        'EUR',
        2000,
        'hourly',
        '2026-10-01',
        '2026-10-31',
        now,
        now,
      );
  } finally {
    setup.sqlite.close();
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/projects?action=assign-worker&project=${projectId}`));
  const form = page.locator(
    '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
  );
  await expect(form).toBeVisible();
  await form.locator('select[name="workerId"]').selectOption(workerId);
  await form.locator('input[name="startsOn"]').fill('2026-10-01');
  await form.locator('input[name="endsOn"]').fill('2026-10-31');
  await form.locator('input[name="useExistingFinanceRules"]').check();
  await expect(form.locator('input[name="internalCostHourlyRate"]')).toBeDisabled();
  await expect(form.locator('input[name="compensationRate"]')).toBeDisabled();
  await expect(form).toContainText(
    'Both internal cost and compensation rules must cover every assignment date',
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/assignWorker'),
  );
  await form.getByRole('button', { name: 'Assign', exact: true }).click();
  expect((await responsePromise).status()).toBeLessThan(400);
  await expect(page.getByRole('status').filter({ hasText: /assignment created/i })).toBeVisible();

  const verify = createDatabase(databasePath);
  try {
    expect(
      verify.sqlite
        .prepare('SELECT COUNT(*) n FROM project_member WHERE project_id=? AND user_id=?')
        .get(projectId, workerId),
    ).toEqual({ n: 1 });
    expect(
      verify.sqlite
        .prepare('SELECT COUNT(*) n FROM internal_cost_rule WHERE project_id=? AND worker_id=?')
        .get(projectId, workerId),
    ).toEqual({ n: 1 });
    expect(
      verify.sqlite
        .prepare('SELECT COUNT(*) n FROM compensation_rule WHERE project_id=? AND worker_id=?')
        .get(projectId, workerId),
    ).toEqual({ n: 1 });
  } finally {
    verify.sqlite.close();
  }
});
