import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('crew chief edits and discards a colleague draft in the browser', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!['desktop', 'phone-390'].includes(testInfo.project.name));
  test.setTimeout(180_000);
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  const workerId = randomUUID();
  const workerName = `Crew draft ${randomUUID().slice(0, 8)}`;
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
      name: `Crew draft project ${randomUUID()}`,
      costCenterCode: e2eCostCenter('CREW-DRAFT', 11, testInfo.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    const timestamp = new Date().toISOString();
    db.sqlite
      .prepare(
        `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
         VALUES(?,?,?,'worker','active',?,?)`,
      )
      .run(workerId, workerName, `crew-draft-${workerId}@example.test`, timestamp, timestamp);
    for (const id of [chiefId, workerId])
      repository.assignWorker(owner, { projectId, workerId: id, startsOn: today });
  } finally {
    db.sqlite.close();
  }

  await signIn(page, 'owner');
  await page.goto(portal(`/crew?project=${projectId}&date=${today}`));
  const grant = page.locator('form[action="?/grant"]');
  await grant.getByLabel('Chief').selectOption(chiefId);
  await grant.getByLabel('Team member').selectOption(workerId);
  await grant.getByLabel('Effective from').fill(today);
  await grant.getByRole('button', { name: 'Assign chief' }).click();
  await expect(page.locator('.grant-list li').filter({ hasText: workerName })).toBeVisible();

  const chiefContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
  });
  try {
    const chiefPage = await chiefContext.newPage();
    await signIn(chiefPage, 'worker');
    await chiefPage.goto(portal(`/crew?project=${projectId}&date=${today}`));
    const create = chiefPage.locator('form[action="?/createBatch"]');
    await create.locator(`input[name=workerIds][value="${workerId}"]`).check();
    await create.getByLabel('Hours per member').fill('1');
    await create.getByLabel('Work performed').fill('Initial field work');
    await create.getByRole('button', { name: 'Save 1 person' }).click();
    await expect(chiefPage.locator('.entry-list li')).toHaveCount(1);
    await chiefPage.getByRole('link', { name: 'Edit draft' }).click();
    await expect(chiefPage.getByRole('heading', { name: 'Edit draft' })).toBeVisible();
    const edit = chiefPage.locator('form[action="?/update"]');
    await edit.getByLabel('Actual hours').fill('1.25');
    await edit.getByLabel('Work performed').fill('Corrected field work');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(chiefPage.getByRole('heading', { name: 'Edit draft' })).toBeVisible();
    await expect(chiefPage.locator('dl')).toContainText('Corrected field work');
    await expect(chiefPage.locator('dl')).toContainText('1.25 h');
    await chiefPage.getByRole('button', { name: 'Discard draft' }).click();
    await expect(chiefPage.getByText('No crew hours recorded for this date.')).toBeVisible();
    const check = createDatabase(readE2EFixturePointer().databasePath);
    try {
      expect(
        check.sqlite
          .prepare(
            `SELECT t.approval_state state,t.version,t.minutes,rec.recorded_by_user_id actor
             FROM time_entry t JOIN crew_time_entry_recorder rec ON rec.time_entry_id=t.id
             WHERE t.project_id=? AND t.worker_id=? AND t.activity_summary='Corrected field work'`,
          )
          .get(projectId, workerId),
      ).toEqual({ state: 'void', version: 3, minutes: 75, actor: chiefId });
    } finally {
      check.sqlite.close();
    }

    // A returned source remains visible after its append-only correction exists.
    const secondCreate = chiefPage.locator('form[action="?/createBatch"]');
    await secondCreate.locator(`input[name=workerIds][value="${workerId}"]`).check();
    await secondCreate.getByLabel('Hours per member').fill('0.1');
    const returnedSummary = `${workerName} returned synthetic crew work`;
    await secondCreate.getByLabel('Work performed').fill(returnedSummary);
    await secondCreate.getByRole('button', { name: 'Save 1 person' }).click();
    const returnedRow = chiefPage.locator('.entry-list li').filter({ hasText: returnedSummary });
    await expect(returnedRow).toBeVisible();
    const originalHref = await returnedRow
      .locator('a[href*="/crew/time/"]')
      .first()
      .getAttribute('href');
    const originalId = originalHref?.split('/').at(-1);
    if (!originalId) throw new Error('New crew time ID was not visible');
    await returnedRow.getByRole('button', { name: 'Submit' }).click();
    await expect(returnedRow).toContainText('Submitted');
    const reviewDb = createDatabase(readE2EFixturePointer().databasePath);
    try {
      const repository = new PortalRepository(reviewDb.sqlite);
      const ownerId = (
        reviewDb.sqlite
          .prepare('SELECT id FROM user WHERE email=?')
          .get(e2eCredentials.owner.email) as { id: string }
      ).id;
      repository.operationalApproveTime(
        repository.principalFor(ownerId),
        originalId,
        'needs_changes',
        'Please confirm the revised synthetic duration',
      );
    } finally {
      reviewDb.sqlite.close();
    }
    await chiefPage.reload();
    const returned = chiefPage.locator('.entry-list li').filter({ hasText: returnedSummary });
    await expect(returned.getByRole('link', { name: 'Review outcome' })).toBeVisible();
    await expect(returned.getByRole('link', { name: /Add expense for/ })).toHaveCount(0);
    await returned.getByRole('link', { name: 'Review outcome' }).click();
    const correctionForm = chiefPage.locator('form[action="?/correct"]');
    await expect(correctionForm).toBeVisible();
    await correctionForm
      .getByLabel('Correction reason')
      .fill('Confirmed six minute synthetic standby');
    await correctionForm.getByLabel('Actual hours').fill('0.1');
    await correctionForm.getByLabel('Work performed').fill('Corrected synthetic crew work');
    await correctionForm.getByRole('button', { name: 'Create corrected draft' }).click();
    await expect(
      chiefPage.getByText('This correction draft is linked to the reviewed record.'),
    ).toBeVisible();
    await chiefPage.getByRole('button', { name: 'Submit for approval now' }).click();
    await expect(chiefPage.locator('dl')).toContainText('Submitted');
    await chiefPage.reload();
    await expect(chiefPage.locator('dl')).toContainText('Submitted');
    await chiefPage.goto(portal(`/crew?project=${projectId}&date=${today}`));
    const afterCorrection = chiefPage
      .locator('.entry-list li')
      .filter({ hasText: returnedSummary });
    await expect(afterCorrection.getByRole('link', { name: 'Review outcome' })).toBeVisible();
    await afterCorrection.getByRole('link', { name: 'Review outcome' }).click();
    await expect(chiefPage.getByRole('link', { name: 'Open existing correction' })).toBeVisible();

    // A crew chief can revise the expense they recorded for a colleague, and
    // the corrected draft keeps the same grant provenance through submission.
    const expenseDb = createDatabase(readE2EFixturePointer().databasePath);
    let expenseId = '';
    try {
      const repository = new PortalRepository(expenseDb.sqlite);
      const ownerId = (
        expenseDb.sqlite
          .prepare('SELECT id FROM user WHERE email=?')
          .get(e2eCredentials.owner.email) as { id: string }
      ).id;
      const ownerSession = expenseDb.sqlite
        .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
        .get(ownerId) as { id: string } | undefined;
      if (!ownerSession) throw new Error('Owner browser session unavailable in E2E fixture');
      const owner = { ...repository.principalFor(ownerId), sessionId: ownerSession.id };
      const grantId = (
        expenseDb.sqlite
          .prepare(
            "SELECT id FROM crew_leader_grant WHERE project_id=? AND chief_user_id=? AND worker_user_id=? AND status='active'",
          )
          .get(projectId, chiefId, workerId) as { id: string }
      ).id;
      expenseId = repository.createExpense(
        owner,
        {
          projectId,
          spentOn: today,
          occurredTimeLocal: '14:35',
          vendor: 'Unverified crew parking',
          category: 'parking',
          description: 'Parking during installation',
          currency: 'USD',
          amountMinor: 1250n,
          whoPaid: 'worker',
          receiptRequired: false,
        },
        workerId,
      ).id;
      expenseDb.sqlite
        .prepare(
          'INSERT INTO crew_expense_recorder(expense_id,grant_id,recorded_by_user_id,recorded_at) VALUES(?,?,?,?)',
        )
        .run(expenseId, grantId, chiefId, new Date().toISOString());
      repository.submitExpense(owner, expenseId, 1);
      repository.operationalApproveExpense(
        owner,
        expenseId,
        'needs_changes',
        'Confirm the vendor on the receipt',
      );
    } finally {
      expenseDb.sqlite.close();
    }
    await chiefPage.goto(portal(`/expenses/${expenseId}?lang=en`));
    await expect(chiefPage.locator('.record-detail-header .state-tag')).toContainText(
      'Needs changes',
    );
    const expenseCorrectionForm = chiefPage.locator('form[data-correction-draft-form]');
    await expect(expenseCorrectionForm).toBeVisible();
    await expenseCorrectionForm.getByLabel('Vendor').fill('Verified installation parking');
    await expenseCorrectionForm
      .getByLabel('Correction reason')
      .fill('Receipt confirms installation parking');
    await expenseCorrectionForm.getByRole('button', { name: 'Create corrected draft' }).click();
    await expect(chiefPage.locator('.record-detail-header .state-tag')).toContainText('Draft');
    const correctedExpenseId = chiefPage.url().split('/').at(-1)!;
    await chiefPage
      .locator('form[action="?/submitExpense"]')
      .getByRole('button', { name: 'Submit' })
      .click();
    await expect(chiefPage.locator('.record-detail-header .state-tag')).toContainText('Submitted');
    await chiefPage.reload();
    await expect(chiefPage.locator('.record-detail-header .state-tag')).toContainText('Submitted');
    const verifyExpenseDb = createDatabase(readE2EFixturePointer().databasePath);
    try {
      expect(
        verifyExpenseDb.sqlite
          .prepare(
            `SELECT e.approval_state,e.vendor,rec.recorded_by_user_id,rec.grant_id
             FROM expense e JOIN crew_expense_recorder rec ON rec.expense_id=e.id WHERE e.id=?`,
          )
          .get(correctedExpenseId),
      ).toMatchObject({
        approval_state: 'submitted',
        vendor: 'Verified installation parking',
        recorded_by_user_id: chiefId,
      });
      expect(
        verifyExpenseDb.sqlite
          .prepare('SELECT approval_state,vendor FROM expense WHERE id=?')
          .get(expenseId),
      ).toEqual({ approval_state: 'needs_changes', vendor: 'Unverified crew parking' });
    } finally {
      verifyExpenseDb.sqlite.close();
    }

    await page.goto(portal(`/crew/time/${originalId}`));
    await expect(page).toHaveURL(new RegExp(`/time/${originalId}$`));
    const unrelatedContext = await browser.newContext();
    try {
      const unrelatedPage = await unrelatedContext.newPage();
      await signIn(unrelatedPage, 'worker2');
      const denied = await unrelatedPage.goto(portal(`/crew/time/${originalId}`));
      expect(denied?.status()).toBe(404);
      const deniedExpense = await unrelatedPage.goto(portal(`/expenses/${correctedExpenseId}`));
      expect(deniedExpense?.status()).toBe(403);
    } finally {
      await unrelatedContext.close();
    }
  } finally {
    await chiefContext.close();
  }
});
