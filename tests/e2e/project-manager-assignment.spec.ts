import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('project manager assigns an already-visible worker to an authorized project only', async ({
  page,
}, testInfo) => {
  test.skip(!['desktop', 'phone-390'].includes(testInfo.project.name));
  const databasePath = readE2EFixturePointer().databasePath;
  const today = new Date().toISOString().slice(0, 10);
  const setup = createDatabase(databasePath);
  let sourceProjectId = '';
  let targetProjectId = '';
  let otherProjectId = '';
  let workerId = '';
  try {
    const managerId = String(
      (
        setup.sqlite
          .prepare('SELECT id FROM user WHERE email=?')
          .get(e2eCredentials.manager.email) as {
          id: string;
        }
      ).id,
    );
    workerId = randomUUID();
    const createdAt = new Date().toISOString();
    setup.sqlite
      .prepare(
        `INSERT INTO user
      (id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
      VALUES (?,?,?,1,'worker','active',0,?,?)`,
      )
      .run(
        workerId,
        `Unconfigured worker ${workerId}`,
        `unconfigured-${workerId}@example.test`,
        createdAt,
        createdAt,
      );
    const repo = new PortalRepository(setup.sqlite);
    const ownerId = String(
      (
        setup.sqlite
          .prepare('SELECT id FROM user WHERE email=?')
          .get(e2eCredentials.owner.email) as {
          id: string;
        }
      ).id,
    );
    const owner = repo.principalFor(ownerId);
    let projectCostCenterInstance = 0;
    const createProject = (name: string, projectManagerId?: string): string =>
      repo.createProject(owner, {
        clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
        name: `PM assignment ${name} ${randomUUID()}`,
        costCenterCode: e2eCostCenter(
          'QA-PM',
          9,
          testInfo.project.name,
          ++projectCostCenterInstance,
        ),
        currency: 'USD',
        timezone: 'UTC',
        billingModel: 'tm',
        startDate: today,
        projectManagerId,
      }).id;
    sourceProjectId = createProject('source', managerId);
    targetProjectId = createProject('target', managerId);
    otherProjectId = createProject('outside');
    repo.assignWorker(owner, { projectId: sourceProjectId, workerId, startsOn: today });
  } finally {
    setup.sqlite.close();
  }

  await signIn(page, 'manager');
  await page.goto(portal(`/projects?action=assign-worker&project=${otherProjectId}`));
  await expect(
    page.locator('[data-project-workflow="assign-worker"] select[name="projectId"]'),
  ).toHaveValue('');
  await page.goto(portal(`/projects?action=assign-worker&project=${targetProjectId}`));
  const section = page.locator('[data-ui="project-section"]');
  const form = section.locator(
    '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
  );
  await expect(form).toBeVisible();
  await expect(form.locator('select[name="projectId"]')).toHaveValue(targetProjectId);
  await expect(
    form.locator(`select[name="projectId"] option[value="${otherProjectId}"]`),
  ).toHaveCount(0);
  await expect(form.locator(`select[name="workerId"] option[value="${workerId}"]`)).toHaveCount(1);
  await form.locator('select[name="workerId"]').selectOption(workerId);
  await form.locator('input[name="startsOn"]').fill(today);
  const uncoveredResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/assignWorker'),
  );
  await form.getByRole('button', { name: 'Assign', exact: true }).click();
  const uncovered = await uncoveredResponse;
  expect(uncovered.status()).toBe(409);
  await expect(
    page.locator('[data-project-workflow="assign-worker"] [data-ui="problem-notice"]'),
  ).toHaveAttribute('data-problem-code', 'ASSIGNMENT_FINANCE_SETUP_REQUIRED');
  const coverage = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    coverage.sqlite
      .prepare(
        `INSERT INTO internal_cost_rule
      (id,worker_id,project_id,currency,hourly_rate_minor,effective_from,effective_to,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), workerId, targetProjectId, 'USD', 3000, today, null, now, now);
    coverage.sqlite
      .prepare(
        `INSERT INTO compensation_rule
      (id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,effective_to,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(randomUUID(), workerId, targetProjectId, 'USD', 2000, 'hourly', today, null, now, now);
  } finally {
    coverage.sqlite.close();
  }
  await expect(form.locator('select[name="workerId"]')).toHaveValue(workerId);
  await expect(form.locator('input[name="startsOn"]')).toHaveValue(today);
  await form.getByRole('button', { name: 'Assign', exact: true }).click();

  const forged = await page.request.post(portal('/projects?/assignWorker'), {
    form: { projectId: otherProjectId, workerId, startsOn: today },
  });
  expect(forged.status()).toBe(403);

  const result = createDatabase(databasePath);
  try {
    await expect
      .poll(
        () =>
          (
            result.sqlite
              .prepare(
                "SELECT COUNT(*) count FROM project_member WHERE project_id=? AND user_id=? AND status='active'",
              )
              .get(targetProjectId, workerId) as { count: number }
          ).count,
      )
      .toBe(1);
    expect(
      (
        result.sqlite
          .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=? AND user_id=?')
          .get(otherProjectId, workerId) as { count: number }
      ).count,
    ).toBe(0);
  } finally {
    result.sqlite.close();
  }

  await page.goto(portal(`/projects/${targetProjectId}?tab=team`));
  await expect(page.getByRole('link', { name: /Assign worker/ })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Configure person rates');
});
