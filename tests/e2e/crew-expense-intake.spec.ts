import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('chief records a worker expense from crew hours without seeing that worker reimbursement', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  test.setTimeout(180_000);
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  const date = new Date().toISOString().slice(0, 10);
  const projectName = `Chief expense installation ${randomUUID()}`;
  const workerId = randomUUID();
  const workerName = `Expense crew ${randomUUID().slice(0, 8)}`;
  const description = `Parking for ${workerName}`;
  let projectId = '';
  let chiefId = '';
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    chiefId = userId(e2eCredentials.worker.email);
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: projectName,
      costCenterCode: e2eCostCenter('EXP', 2, testInfo.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: date,
    }).id;
    db.sqlite
      .prepare(
        `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
       VALUES(?,?,?,'worker','active',?,?)`,
      )
      .run(
        workerId,
        workerName,
        `crew-expense-${workerId}@example.test`,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    for (const id of [chiefId, workerId])
      repository.assignWorker(owner, { projectId, workerId: id, startsOn: date });
  } finally {
    db.sqlite.close();
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/crew?project=${projectId}&date=${date}`));
  const grant = page.locator('form[action="?/grant"]');
  await grant.getByLabel('Chief').selectOption(chiefId);
  await grant.getByLabel('Team member').selectOption(workerId);
  await grant.getByLabel('Effective from').fill(date);
  await grant.getByRole('button', { name: 'Assign chief' }).click();
  await expect(page.locator('.grant-list li').filter({ hasText: workerName })).toBeVisible();

  const chiefContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
  });
  try {
    const chiefPage = await chiefContext.newPage();
    await signIn(chiefPage, 'worker');
    await chiefPage.goto(portal(`/crew?project=${projectId}&date=${date}`));
    const entry = chiefPage.locator('form[action="?/createBatch"]');
    await entry.locator(`input[name=workerIds][value="${workerId}"]`).check();
    await entry.getByLabel('Hours per member').fill('2.5');
    await entry.getByLabel('Work performed').fill('Installed site sensors');
    await entry.getByRole('button', { name: 'Save 1 person' }).click();
    const expenseLink = chiefPage.getByRole('link', { name: `Add expense for ${workerName}` });
    await expect(expenseLink).toBeVisible();
    const expenseHref = await expenseLink.getAttribute('href');
    const shiftId = new URL(expenseHref ?? '', portal()).searchParams.get('timeEntry');
    if (!shiftId) throw new Error('Crew time link must include its saved time record');
    await expenseLink.click();
    const form = chiefPage.locator('form[data-expense-entry-surface]');
    await expect(form).toBeVisible();
    await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
    await expect(form.locator('[name="spentOn"]')).toHaveValue(date);
    await expect(form.locator('[name="workerId"]')).toHaveValue(workerId);
    await expect(form.locator('[name="timeEntryId"]')).toHaveValue(shiftId);
    await form.locator('[name="occurredTimeLocal"]').fill('14:35');
    await form.locator('[name="vendor"]').fill('Test parking');
    await form.locator('[name="amount"]').fill('12.50');
    await form.locator('[name="description"]').fill(description);
    await form.getByRole('button', { name: 'Save draft' }).click();
    await expect(
      chiefPage.locator('[data-expense-record]').filter({ hasText: 'Test parking' }),
    ).toBeVisible();

    const check = createDatabase(databasePath);
    let expenseId = '';
    try {
      const row = check.sqlite
        .prepare(
          `SELECT e.id,e.worker_id,e.project_id,e.time_entry_id,e.occurred_time_local,e.amount_minor,
                rec.recorded_by_user_id
         FROM expense e JOIN crew_expense_recorder rec ON rec.expense_id=e.id
         WHERE e.description=?`,
        )
        .get(description) as Record<string, unknown> | undefined;
      expect(row).toMatchObject({
        worker_id: workerId,
        project_id: projectId,
        time_entry_id: shiftId,
        occurred_time_local: '14:35',
        amount_minor: 1250,
        recorded_by_user_id: chiefId,
      });
      expenseId = String(row?.id ?? '');
    } finally {
      check.sqlite.close();
    }
    await chiefPage.goto(portal(`/expenses/${expenseId}?lang=en`));
    await expect(chiefPage.getByRole('link', { name: 'Open time record' })).toHaveAttribute(
      'href',
      `/j-aautomation/app/crew/time/${shiftId}`,
    );
    await expect(chiefPage.locator('main')).toContainText('14:35');
    await expect(chiefPage.locator('main')).not.toContainText(
      /reimbursement|client treatment|billing treatment|margin/i,
    );
    await chiefPage.getByRole('link', { name: 'Open time record' }).click();
    await expect(chiefPage.getByRole('heading', { name: 'Recorded work' })).toBeVisible();
  } finally {
    await chiefContext.close();
  }
});
