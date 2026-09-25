import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('project manager publishes, edits, and cancels a scoped planning shift', async ({
  page,
}, testInfo) => {
  test.skip(!['desktop', 'phone-390'].includes(testInfo.project.name));
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  const workDate = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  let projectId = '';
  try {
    const repo = new PortalRepository(db.sqlite);
    const idFor = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const owner = repo.principalFor(idFor(e2eCredentials.owner.email));
    projectId = repo.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: `Planning manager ${randomUUID()}`,
      costCenterCode: `QA-PLAN-${testInfo.project.name}`,
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    repo.assignWorker(owner, {
      projectId,
      workerId: idFor(e2eCredentials.manager.email),
      startsOn: today,
    });
    repo.assignWorker(owner, {
      projectId,
      workerId: idFor(e2eCredentials.worker.email),
      startsOn: today,
    });
    await signIn(page, 'manager');
    await page.goto(portal(`/planning?project=${projectId}&lang=en`));
    const publish = page.locator('form[action="?/createPlanning"]');
    await expect(publish.locator('select[name="projectId"]')).toHaveValue(projectId);
    await expect(publish.locator('select[name="workerId"] option')).toHaveCount(3);
    await publish
      .locator('select[name="workerId"]')
      .selectOption(idFor(e2eCredentials.worker.email));
    await publish.locator('input[name="startsAt"]').fill(`${workDate}T08:00`);
    await publish.locator('input[name="endsAt"]').fill(`${workDate}T10:00`);
    await publish.getByLabel('Planned hours', { exact: true }).fill('2');
    await publish.getByRole('button', { name: 'Publish assignment' }).click();
    await expect
      .poll(
        () =>
          db.sqlite
            .prepare('SELECT id FROM planning_assignment WHERE project_id=? AND starts_at=?')
            .get(projectId, `${workDate}T08:00:00.000Z`) as { id: string } | undefined,
      )
      .toBeTruthy();
    const assignment = db.sqlite
      .prepare('SELECT id FROM planning_assignment WHERE project_id=? AND starts_at=?')
      .get(projectId, `${workDate}T08:00:00.000Z`) as { id: string };
    expect(assignment.id).toBeTruthy();

    await page.goto(portal(`/planning?project=${projectId}&focus=${assignment.id}&lang=en`));
    const item = page.locator(`#planning-assignment-${assignment.id}`);
    await expect(item).toBeVisible();
    const edit = item.locator('form[action="?/updatePlanning"]');
    await edit.locator('input[name="plannedMinutes"]').fill('90');
    await edit.locator('input[name="site"]').fill('Revised QA site');
    await edit.locator('input[name="endsAt"]').fill(`${workDate}T07:00`);
    await edit.getByRole('button', { name: 'Save assignment' }).click();
    await expect(item.getByText('Planning end must follow a valid start')).toBeVisible();
    await expect(edit.locator('input[name="site"]')).toHaveValue('Revised QA site');
    await expect(edit.locator('input[name="plannedMinutes"]')).toHaveValue('90');
    await edit.locator('input[name="endsAt"]').fill(`${workDate}T10:00`);
    await edit.getByRole('button', { name: 'Save assignment' }).click();
    await expect
      .poll(() =>
        db.sqlite
          .prepare('SELECT planned_minutes,site,version FROM planning_assignment WHERE id=?')
          .get(assignment.id),
      )
      .toEqual({ planned_minutes: 90, site: 'Revised QA site', version: 2 });
    await page.goto(portal(`/planning?project=${projectId}&focus=${assignment.id}&lang=en`));
    await page
      .locator(`#planning-assignment-${assignment.id} form[action="?/cancelPlanning"] button`)
      .click();
    await expect
      .poll(() =>
        db.sqlite
          .prepare('SELECT status,version FROM planning_assignment WHERE id=?')
          .get(assignment.id),
      )
      .toEqual({ status: 'cancelled', version: 3 });

    const futureDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const futureWorkerId = randomUUID();
    const futureWorkerName = `Future planner ${futureWorkerId.slice(0, 8)}`;
    db.sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,'worker','active',?,?)",
      )
      .run(
        futureWorkerId,
        futureWorkerName,
        `${futureWorkerId}@planning.example.test`,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    repo.assignWorker(owner, { projectId, workerId: futureWorkerId, startsOn: futureDate });
    await page.goto(portal(`/profile?worker=${futureWorkerId}&lang=en`));
    await expect(
      page.getByRole('combobox', { name: 'Inspect worker' }).locator(`option[value="${futureWorkerId}"]`),
    ).toHaveCount(0);
    const originalWorkerId = idFor(e2eCredentials.worker.email);
    const changing = repo.createPlanningAssignment(
      repo.principalFor(idFor(e2eCredentials.manager.email)),
      {
        projectId,
        workerId: originalWorkerId,
        startsAt: `${workDate}T11:00:00.000Z`,
        endsAt: `${workDate}T12:00:00.000Z`,
        plannedMinutes: 60,
      },
    );
    await page.goto(portal(`/planning?project=${projectId}&focus=${changing.id}&lang=en`));
    const futureEdit = page.locator(
      `#planning-assignment-${changing.id} form[action="?/updatePlanning"]`,
    );
    const futureSelect = futureEdit.locator('select[name="workerId"]');
    await expect(futureSelect).toHaveValue(originalWorkerId);
    await expect(futureSelect.locator(`option[value="${futureWorkerId}"]`)).toHaveCount(0);
    await futureEdit.locator('input[name="startsAt"]').fill(`${futureDate}T11:00`);
    await futureEdit.locator('input[name="endsAt"]').fill(`${futureDate}T12:00`);
    await expect(futureSelect.locator(`option[value="${futureWorkerId}"]`)).toHaveText(
      futureWorkerName,
    );
    await futureSelect.selectOption(futureWorkerId);
    await futureEdit.getByRole('button', { name: 'Save assignment' }).click();
    await expect
      .poll(() =>
        db.sqlite
          .prepare('SELECT worker_id,version FROM planning_assignment WHERE id=?')
          .get(changing.id),
      )
      .toEqual({ worker_id: futureWorkerId, version: 2 });
  } finally {
    db.sqlite.close();
  }
});
