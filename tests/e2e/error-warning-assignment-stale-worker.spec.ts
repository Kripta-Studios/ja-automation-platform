import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Response } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type Persona = 'owner' | 'manager';

function seedScenario(persona: Persona, viewport: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const owner = new PortalRepository(database.sqlite).principalFor(
      userId(e2eCredentials.owner.email),
    );
    const managerId = userId(e2eCredentials.manager.email);
    const repository = new PortalRepository(database.sqlite);
    const clientId = e2eLifecycleFixturesFor(viewport).client.id;
    const scenario = persona === 'owner' ? 57 : 58;
    const sourceProjectId = repository.createProject(owner, {
      clientId,
      name: `Stale worker source ${persona} ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-STALE-WORKER', scenario, viewport, 1),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-09-01',
      projectManagerId: managerId,
    }).id;
    const targetProjectId = repository.createProject(owner, {
      clientId,
      name: `Stale worker target ${persona} ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-STALE-WORKER', scenario, viewport, 2),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: '2026-09-01',
      projectManagerId: managerId,
    }).id;
    const createWorker = database.sqlite.prepare(
      `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,created_at,updated_at)
       VALUES(?,?,?,1,'worker','active',0,?,?)`,
    );
    const now = new Date().toISOString();
    const staleWorkerId = randomUUID();
    const replacementWorkerId = randomUUID();
    createWorker.run(
      staleWorkerId,
      `QA Stale Worker ${persona}`,
      `stale-worker-${staleWorkerId}@demo.jaautomation.test`,
      now,
      now,
    );
    createWorker.run(
      replacementWorkerId,
      `QA Replacement Worker ${persona}`,
      `replacement-worker-${replacementWorkerId}@demo.jaautomation.test`,
      now,
      now,
    );
    for (const workerId of [staleWorkerId, replacementWorkerId]) {
      repository.assignWorker(owner, {
        projectId: sourceProjectId,
        workerId,
        startsOn: new Date().toISOString().slice(0, 10),
      });
    }
    if (persona === 'manager') {
      database.sqlite
        .prepare(
          `INSERT INTO internal_cost_rule
        (id,worker_id,project_id,currency,hourly_rate_minor,effective_from,effective_to,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          replacementWorkerId,
          targetProjectId,
          'USD',
          3000,
          '2026-10-01',
          '2026-10-15',
          now,
          now,
        );
      database.sqlite
        .prepare(
          `INSERT INTO compensation_rule
        (id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,effective_to,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          replacementWorkerId,
          targetProjectId,
          'USD',
          2000,
          'hourly',
          '2026-10-01',
          '2026-10-15',
          now,
          now,
        );
    }
    return { databasePath, targetProjectId, staleWorkerId, replacementWorkerId };
  } finally {
    database.sqlite.close();
  }
}

function deactivateWorker(databasePath: string, workerId: string): void {
  const database = createDatabase(databasePath);
  try {
    database.sqlite
      .prepare("UPDATE user SET status='suspended',updated_at=?,version=version+1 WHERE id=?")
      .run(new Date().toISOString(), workerId);
  } finally {
    database.sqlite.close();
  }
}

function assignmentCount(databasePath: string, projectId: string, workerId: string): number {
  const database = createDatabase(databasePath);
  try {
    return (
      database.sqlite
        .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=? AND user_id=?')
        .get(projectId, workerId) as { count: number }
    ).count;
  } finally {
    database.sqlite.close();
  }
}

function assignmentForm(page: Page) {
  return page.locator('[data-project-workflow="assign-worker"] form[action="?/assignWorker"]');
}

for (const persona of ['owner', 'manager'] as const) {
  test(`${persona} recovers from a worker deactivated while assignment is open`, async ({
    page,
  }, testInfo) => {
    test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
    const scenario = seedScenario(persona, testInfo.project.name);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await signIn(page, persona);
    await page.goto(
      portal(
        `/projects?action=assign-worker&project=${encodeURIComponent(scenario.targetProjectId)}#project-assignment`,
      ),
    );
    const form = assignmentForm(page);
    await expect(form).toBeVisible();
    const workerSelect = form.locator('select[name="workerId"]');
    await workerSelect.selectOption(scenario.staleWorkerId);
    await form.locator('input[name="startsOn"]').fill('2026-10-01');
    await form.locator('input[name="endsOn"]').fill('2026-10-15');
    if (persona === 'owner') {
      await form.locator('input[name="internalCostHourlyRate"]').fill('30.00');
      await form.locator('input[name="compensationRate"]').fill('20.00');
      await form.locator('select[name="compensationBasis"]').selectOption('hourly');
    }
    const scrollBefore = await page.evaluate(() => window.scrollY);

    deactivateWorker(scenario.databasePath, scenario.staleWorkerId);
    const actionResponse = page.waitForResponse((response: Response) =>
      response.url().includes('?/assignWorker'),
    );
    await form.getByRole('button', { name: 'Assign', exact: true }).click();
    expect((await actionResponse).status()).toBe(400);
    const failedForm = assignmentForm(page);
    const failedWorkerSelect = failedForm.locator('select[name="workerId"]');
    const notice = page
      .locator('[data-project-workflow="assign-worker"]')
      .locator('[data-ui="problem-notice"]');
    await expect(notice).toHaveAttribute(
      'data-problem-code',
      'PROJECT_ASSIGNMENT_WORKER_UNAVAILABLE',
    );
    await expect(notice).toContainText('This worker is no longer active.');
    const summary = failedForm.locator('[data-validation-summary]');
    await expect(summary).toBeFocused();
    await expect
      .poll(() =>
        summary.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
        }),
      )
      .toBe(true);
    await expect(failedForm.locator('select[name="projectId"]')).toHaveValue(
      scenario.targetProjectId,
    );
    await expect(failedWorkerSelect).toHaveValue(scenario.staleWorkerId);
    await expect(
      failedWorkerSelect.locator(`option[value="${scenario.staleWorkerId}"]`),
    ).toHaveAttribute('disabled', '');
    await expect(
      failedWorkerSelect.locator(`option[value="${scenario.staleWorkerId}"]`),
    ).toHaveText('Previously selected worker · Unavailable');
    await expect(failedWorkerSelect).toHaveAttribute('aria-invalid', 'true');
    await expect(failedForm.locator('#assignment-worker-unavailable')).toHaveText(
      'Choose an active worker.',
    );
    await expect(failedForm.locator('input[name="startsOn"]')).toHaveValue('2026-10-01');
    await expect(failedForm.locator('input[name="endsOn"]')).toHaveValue('2026-10-15');
    if (persona === 'owner') {
      await expect(failedForm.locator('input[name="internalCostHourlyRate"]')).toHaveValue('30.00');
      await expect(failedForm.locator('input[name="compensationRate"]')).toHaveValue('20.00');
    }
    expect(
      await failedWorkerSelect.evaluate((select: HTMLSelectElement) => select.validity.valid),
    ).toBe(false);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThanOrEqual(Math.min(scrollBefore, 1));

    // Capture the actual recovery notice before native validation refocuses the picker.
    // The disposable offline-sync fixture may show an unrelated fixed toast.
    for (const dismiss of await page.locator('[data-ui="toast-region"] .ui-toast-dismiss').all()) {
      await dismiss.click();
    }
    await testInfo.attach(`stale-worker-notice-${persona}-${testInfo.project.name}`, {
      body: await notice.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach(`stale-worker-picker-${persona}-${testInfo.project.name}`, {
      body: await failedWorkerSelect.screenshot(),
      contentType: 'image/png',
    });

    let actionRequests = 0;
    const onRequest = (request: { url(): string }) => {
      if (request.url().includes('?/assignWorker')) actionRequests += 1;
    };
    page.on('request', onRequest);
    await failedForm.getByRole('button', { name: 'Assign', exact: true }).click();
    expect(actionRequests).toBe(0);
    await expect(failedWorkerSelect).toBeFocused();
    page.off('request', onRequest);
    expect(
      assignmentCount(scenario.databasePath, scenario.targetProjectId, scenario.staleWorkerId),
    ).toBe(0);

    await failedWorkerSelect.selectOption(scenario.replacementWorkerId);
    await expect
      .poll(() => failedWorkerSelect.evaluate((select: HTMLSelectElement) => select.validity.valid))
      .toBe(true);
    await expect(failedWorkerSelect).not.toHaveAttribute('aria-invalid', 'true');
    await expect(failedForm.locator('input[name="startsOn"]')).toHaveValue('2026-10-01');
    await expect(failedForm.locator('input[name="endsOn"]')).toHaveValue('2026-10-15');
    await failedForm.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect
      .poll(() =>
        assignmentCount(
          scenario.databasePath,
          scenario.targetProjectId,
          scenario.replacementWorkerId,
        ),
      )
      .toBe(1);
    expect(pageErrors).toEqual([]);
    expect(
      consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
    ).toEqual([]);
    await testInfo.attach(`stale-worker-trace-${persona}-${testInfo.project.name}`, {
      body: Buffer.from(
        JSON.stringify({
          role: persona,
          viewport: testInfo.project.name,
          code: 'PROJECT_ASSIGNMENT_WORKER_UNAVAILABLE',
          retainedProjectWorkerDates: true,
          staleWorkerResubmissionBlocked: true,
          replacementAssignmentCreated: true,
          consoleErrorCount: consoleErrors.length,
          pageErrorCount: pageErrors.length,
        }),
      ),
      contentType: 'application/json',
    });
  });
}
