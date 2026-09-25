import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('owner grants project crew; chief logs shared and individual actual hours', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  test.setTimeout(180_000);
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  let projectId = '';
  let chiefId = '';
  const firstId = randomUUID();
  const firstName = `Crew fixture ${randomUUID().slice(0, 8)}`;
  const secondId = randomUUID();
  const secondName = `Crew fixture ${randomUUID().slice(0, 8)}`;
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    chiefId = userId(e2eCredentials.worker.email);
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: `Crew installation ${randomUUID()}`,
      costCenterCode: e2eCostCenter('CREW', 19, testInfo.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    for (const [id, name] of [
      [firstId, firstName],
      [secondId, secondName],
    ])
      db.sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,'worker','active',?,?)`,
        )
        .run(
          id,
          name,
          `crew-${id}@example.test`,
          new Date().toISOString(),
          new Date().toISOString(),
        );
    for (const workerId of [chiefId, firstId, secondId])
      repository.assignWorker(owner, {
        projectId,
        workerId,
        startsOn: today,
      });
  } finally {
    db.sqlite.close();
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/crew?project=${projectId}&date=${today}`));
  await expect(page.getByRole('heading', { name: 'Assign a crew chief' })).toBeVisible();
  const grant = page.locator('form[action="?/grant"]');
  for (const workerId of [firstId, secondId]) {
    await grant.getByLabel('Chief').selectOption(chiefId);
    await grant.getByLabel('Team member').selectOption(workerId);
    await grant.getByLabel('Effective from').fill(today);
    await grant.getByRole('button', { name: 'Assign chief' }).click();
    await expect(
      page
        .locator('.grant-list li')
        .filter({ hasText: workerId === firstId ? firstName : secondName }),
    ).toBeVisible();
  }

  const chiefContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
  });
  try {
    const chiefPage = await chiefContext.newPage();
    await signIn(chiefPage, 'worker');
    await chiefPage.goto(portal(`/crew?project=${projectId}&date=${today}`));
    await expect(chiefPage.getByRole('heading', { name: 'Log team hours' })).toBeVisible();
    const entry = chiefPage.locator('form[action="?/createBatch"]');
    const viewport = chiefPage.viewportSize();
    if (!viewport) throw new Error('Expected a configured browser viewport');
    const buttonBox = await entry.getByRole('button', { name: 'Save 0 people' }).boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    expect(
      await chiefPage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width + 1);
    await entry.locator(`input[name=workerIds][value="${firstId}"]`).check();
    await entry.locator(`input[name=workerIds][value="${secondId}"]`).check();
    await entry.getByLabel('Hours per member').fill('7.5');
    await entry.getByLabel('Work performed').fill('Installed field panels');
    await entry.getByLabel('Submit for approval now').check();
    await entry.getByRole('button', { name: 'Save 2 people' }).click();
    await expect(chiefPage.locator('.entry-list li')).toHaveCount(2);
    await expect(
      chiefPage.getByRole('link', { name: `Add expense for ${firstName}` }),
    ).toHaveAttribute('href', /\/expenses\?project=.*&worker=.*&date=.*&timeEntry=/u);
    await chiefPage.getByRole('link', { name: 'View time' }).first().click();
    await expect(chiefPage.getByRole('heading', { name: 'Recorded work' })).toBeVisible();
    await expect(chiefPage.locator('main')).not.toContainText(/compensation|margin|client rate/i);
    await chiefPage.getByRole('link', { name: 'Back to crew hours' }).click();
    await expect(chiefPage.locator('.entry-list li')).toHaveCount(2);
    const resultDb = createDatabase(readE2EFixturePointer().databasePath);
    try {
      const rows = resultDb.sqlite
        .prepare(
          `SELECT t.worker_id,t.minutes,t.start_time,t.end_time,t.approval_state,rec.recorded_by_user_id
         FROM time_entry t JOIN crew_time_entry_recorder rec ON rec.time_entry_id=t.id
         WHERE t.project_id=? AND t.activity_summary='Installed field panels' ORDER BY t.worker_id`,
        )
        .all(projectId) as {
        worker_id: string;
        minutes: number;
        start_time: string | null;
        end_time: string | null;
        approval_state: string;
        recorded_by_user_id: string;
      }[];
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.worker_id).sort()).toEqual([firstId, secondId].sort());
      for (const row of rows)
        expect(row).toMatchObject({
          minutes: 450,
          start_time: null,
          end_time: null,
          approval_state: 'submitted',
          recorded_by_user_id: chiefId,
        });
    } finally {
      resultDb.sqlite.close();
    }
    await entry.getByLabel('Different hours for each member').check();
    await entry.locator(`input[name=workerIds][value="${firstId}"]`).check();
    await entry.locator(`input[name=workerIds][value="${secondId}"]`).check();
    await entry.getByLabel(`Hours for ${secondName}`).fill('1.5');
    await entry.getByLabel(`Hours for ${firstName}`).fill('2');
    await entry.getByLabel('Work performed').fill('Final panel checks');
    await entry.getByRole('button', { name: 'Save 2 people' }).click();
    await expect(chiefPage.locator('.entry-list li')).toHaveCount(4);
    const checkDb = createDatabase(readE2EFixturePointer().databasePath);
    try {
      const rows = checkDb.sqlite
        .prepare(
          "SELECT worker_id,minutes FROM time_entry WHERE project_id=? AND activity_summary='Final panel checks' ORDER BY worker_id",
        )
        .all(projectId) as { worker_id: string; minutes: number }[];
      expect(rows).toHaveLength(2);
      expect(Object.fromEntries(rows.map((row) => [row.worker_id, row.minutes]))).toEqual({
        [firstId]: 120,
        [secondId]: 90,
      });
    } finally {
      checkDb.sqlite.close();
    }
    await expect(chiefPage.locator('main')).not.toContainText(/compensation|margin|client rate/i);
  } finally {
    await chiefContext.close();
  }
});
