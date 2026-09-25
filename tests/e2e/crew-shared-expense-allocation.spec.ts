import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('chief allocates one saved receipt across two worker shifts on phone, tablet and desktop', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  test.setTimeout(180_000);
  const databasePath = readE2EFixturePointer().databasePath;
  const date = new Date().toISOString().slice(0, 10);
  const workers = [
    { id: randomUUID(), name: `Receipt crew A ${randomUUID().slice(0, 6)}` },
    { id: randomUUID(), name: `Receipt crew B ${randomUUID().slice(0, 6)}` },
  ];
  let projectId = '';
  let chiefId = '';
  {
    const db = createDatabase(databasePath);
    try {
      const userId = (email: string) =>
        (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
      chiefId = userId(e2eCredentials.worker.email);
      const repository = new PortalRepository(db.sqlite);
      const owner = repository.principalFor(userId(e2eCredentials.owner.email));
      projectId = repository.createProject(owner, {
        clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
        name: `Shared receipt installation ${randomUUID()}`,
        costCenterCode: e2eCostCenter('SHR', 4, testInfo.project.name),
        currency: 'USD',
        timezone: 'UTC',
        billingModel: 'tm',
        startDate: date,
      }).id;
      for (const worker of workers) {
        db.sqlite
          .prepare(
            "INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES(?,?,?,'worker','active',?,?)",
          )
          .run(
            worker.id,
            worker.name,
            `receipt-${worker.id}@example.test`,
            new Date().toISOString(),
            new Date().toISOString(),
          );
      }
      for (const id of [chiefId, ...workers.map((worker) => worker.id)])
        repository.assignWorker(owner, { projectId, workerId: id, startsOn: date });
    } finally {
      db.sqlite.close();
    }
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/crew?project=${projectId}&date=${date}`));
  for (const worker of workers) {
    const grant = page.locator('form[action="?/grant"]');
    await grant.getByLabel('Chief').selectOption(chiefId);
    await grant.getByLabel('Team member').selectOption(worker.id);
    await grant.getByLabel('Effective from').fill(date);
    await grant.getByRole('button', { name: 'Assign chief' }).click();
    await expect(page.locator('.grant-list li').filter({ hasText: worker.name })).toBeVisible();
  }

  const chiefContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
  });
  try {
    const chiefPage = await chiefContext.newPage();
    await signIn(chiefPage, 'worker');
    await chiefPage.goto(portal(`/crew?project=${projectId}&date=${date}`));
    const batch = chiefPage.locator('form[action="?/createBatch"]');
    for (const worker of workers)
      await batch.locator(`input[name=workerIds][value="${worker.id}"]`).check();
    await batch.getByLabel('Hours per member').fill('2.5');
    await batch.getByLabel('Work performed').fill('Shared installation materials');
    await batch.getByRole('button', { name: 'Save 2 people' }).click();
    await expect(chiefPage.locator('.entry-list li')).toHaveCount(2);

    let expenseId = '';
    let timeIds: string[] = [];
    {
      const db = createDatabase(databasePath);
      try {
        const repository = new PortalRepository(db.sqlite);
        const session = db.sqlite
          .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
          .get(chiefId) as { id: string };
        const chief = { ...repository.principalFor(chiefId), sessionId: session.id };
        const timeRows = db.sqlite
          .prepare(
            "SELECT id,worker_id workerId FROM time_entry WHERE project_id=? AND activity_summary='Shared installation materials'",
          )
          .all(projectId) as { id: string; workerId: string }[];
        timeIds = workers.map((worker) => timeRows.find((row) => row.workerId === worker.id)!.id);
        const receipt = repository.registerReceipt(chief, {
          projectId,
          sha256: randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
          mediaType: 'image/png',
          byteLength: 101,
          storageKey: `receipts/${randomUUID()}.png`,
          originalFilename: 'shared-crew.png',
        });
        expenseId = repository.createExpense(
          chief,
          {
            projectId,
            spentOn: date,
            timeEntryId: timeIds[0],
            vendor: 'Shared crew parking',
            category: 'parking',
            description: 'One receipt for two crew members',
            currency: 'USD',
            amountMinor: 1250n,
            whoPaid: 'worker',
            receiptRequired: true,
            receiptDocumentId: receipt.id,
          },
          workers[0]!.id,
          `shared-browser-expense-${randomUUID()}`,
        ).id;
      } finally {
        db.sqlite.close();
      }
    }
    await chiefPage.reload();
    const allocation = chiefPage.locator('form[action="?/allocateReceipt"]');
    await expect(allocation.getByRole('option', { name: /Shared crew parking/ })).toHaveCount(1);
    await allocation.getByLabel('Receipt expense').selectOption(expenseId);
    for (const id of timeIds)
      await allocation.locator(`input[name=timeEntryIds][value="${id}"]`).check();
    await allocation.locator(`input[name="amount_${timeIds[0]}"]`).fill('8.00');
    await allocation.locator(`input[name="amount_${timeIds[1]}"]`).fill('4.50');
    await allocation.getByRole('button', { name: 'Save receipt allocation' }).click();
    await expect(allocation.getByRole('option', { name: /Shared crew parking/ })).toHaveCount(0);
    await expect(
      chiefPage.getByRole('heading', { name: 'Saved receipt allocations' }),
    ).toBeVisible();
    await expect(chiefPage.locator('main')).toContainText('12.50 USD · one expense');
    for (const worker of workers)
      await expect(chiefPage.locator('main')).toContainText(worker.name);
    await chiefPage.goto(portal(`/expenses?project=${projectId}`));
    const chiefExpense = chiefPage.locator(`[data-expense-record="${expenseId}"]`);
    await expect(chiefExpense).toContainText('Shared crew receipt · allocation locked');
    await expect(chiefExpense.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    const editResponse = await chiefPage.evaluate(
      async ({ id }) => {
        const response = await fetch('/j-aautomation/app/expenses?/updateExpense', {
          method: 'POST',
          body: new URLSearchParams({ id, version: '1', amount: '13.00' }),
        });
        return { httpStatus: response.status, action: await response.json() };
      },
      { id: expenseId },
    );
    expect(editResponse).toMatchObject({
      httpStatus: 200,
      action: { type: 'failure', status: 409 },
    });
    await page.goto(portal(`/expenses?project=${projectId}`));
    const ownerExpense = page.locator(`[data-expense-record="${expenseId}"]`);
    await expect(ownerExpense).toContainText('Shared crew receipt · allocation locked');
    await expect(ownerExpense.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(ownerExpense.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    const deleteResponse = await page.evaluate(
      async ({ id }) => {
        const response = await fetch('/j-aautomation/app/expenses?/deleteDraft', {
          method: 'POST',
          body: new URLSearchParams({ recordType: 'expense', recordId: id, version: '1' }),
        });
        return { httpStatus: response.status, action: await response.json() };
      },
      { id: expenseId },
    );
    expect(deleteResponse).toMatchObject({
      httpStatus: 200,
      action: { type: 'failure', status: 409 },
    });
    const width = chiefPage.viewportSize()?.width ?? 1440;
    expect(
      await chiefPage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    const check = createDatabase(databasePath);
    try {
      expect(
        check.sqlite
          .prepare('SELECT COUNT(*) count,SUM(amount_minor) total FROM expense WHERE id=?')
          .get(expenseId),
      ).toEqual({ count: 1, total: 1250 });
      expect(
        check.sqlite
          .prepare(
            'SELECT COUNT(*) count,SUM(amount_minor) total FROM crew_shared_expense_allocation a JOIN crew_shared_expense_allocation_group g ON g.id=a.group_id WHERE g.expense_id=?',
          )
          .get(expenseId),
      ).toEqual({ count: 2, total: 1250 });
    } finally {
      check.sqlite.close();
    }
  } finally {
    await chiefContext.close();
  }
});
