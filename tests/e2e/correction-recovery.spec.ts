import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('returned time and expense can be revised, withdrawn, recreated, and submitted', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-360', 'phone-390', 'tablet-768', 'desktop'].includes(testInfo.project.name));
  test.setTimeout(180_000);
  const fixture = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  let timeId = '';
  let expenseId = '';
  let reportId = '';
  let returnedReportId = '';
  try {
    const userId = (email: string) =>
      (fixture.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(fixture.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    let worker = repository.principalFor(userId(e2eCredentials.worker.email));
    const projectId = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(testInfo.project.name).client.id,
      name: `Correction browser ${randomUUID()}`,
      costCenterCode: e2eCostCenter('CORRECTION', 13, testInfo.project.name),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    }).id;
    const projectStatus = (
      fixture.sqlite.prepare('SELECT status FROM project WHERE id=?').get(projectId) as {
        status: string;
      }
    ).status;
    if (projectStatus !== 'active')
      repository.transitionProject(owner, {
        projectId,
        status: 'active',
        reason: 'Open disposable browser correction project',
      });
    repository.assignWorker(owner, { projectId, workerId: worker.userId, startsOn: today });
    worker = repository.principalFor(worker.userId);
    const time = repository.createTimeEntry(worker, {
      projectId,
      workDate: today,
      category: 'regular',
      minutes: 60,
      summary: 'Initial activity needing a clearer summary',
    });
    repository.submitTime(worker, time.id, time.version);
    timeId = time.id;
    const expense = repository.createExpense(worker, {
      projectId,
      spentOn: today,
      vendor: 'Original vendor',
      category: 'hotel',
      description: 'Initial project lodging',
      currency: 'EUR',
      amountMinor: 12_500n,
      whoPaid: 'worker',
      clientTreatment: 'reimbursable',
      receiptRequired: false,
      timeEntryId: time.id,
    });
    repository.submitExpense(worker, expense.id, expense.version);
    repository.operationalApproveTime(owner, time.id, 'needs_changes', 'Clarify activity detail');
    repository.operationalApproveExpense(owner, expense.id, 'needs_changes', 'Clarify vendor');
    expenseId = expense.id;
    const report = repository.createDailyReport(worker, {
      projectId,
      workDate: today,
      summary: 'Original daily work summary',
      tasksCompleted: 'Installed the site equipment',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    repository.submitReport(worker, 'daily', report.id, report.version);
    repository.reviewReport(owner, 'daily', report.id, 'approved');
    reportId = report.id;
    const returned = repository.createDailyReport(worker, {
      projectId,
      workDate: today,
      summary: 'Short daily field summary',
      tasksCompleted: 'Checked site equipment',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    repository.submitReport(worker, 'daily', returned.id, returned.version);
    repository.reviewReport(
      owner,
      'daily',
      returned.id,
      'needs_changes',
      'Clarify daily work summary',
    );
    returnedReportId = returned.id;
  } finally {
    fixture.sqlite.close();
  }

  await signIn(page, 'worker');
  await page.goto(portal(`/time/${timeId}?lang=en`));
  const timeForm = page.locator('form[data-correction-draft-form]');
  await expect(timeForm).toBeVisible();
  await timeForm.getByLabel('Activity summary').fill('First revised activity summary');
  await timeForm.getByLabel('Correction reason').fill('Clarify the logged work');
  const firstAttemptId = await timeForm.locator('[name=requestId]').inputValue();
  await timeForm.getByRole('button', { name: 'Create corrected draft' }).click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Draft');
  const abandonedId = page.url().split('/').at(-1)!;
  await page.getByLabel('Why withdraw this draft?').fill('Need a more precise activity summary');
  await page.getByRole('button', { name: 'Withdraw correction draft' }).click();
  await expect(page).toHaveURL(new RegExp(`/time/${timeId}$`));
  const retryForm = page.locator('form[data-correction-draft-form]');
  await expect(retryForm).toBeVisible();
  expect(await retryForm.locator('[name=requestId]').inputValue()).not.toBe(firstAttemptId);
  await retryForm.getByLabel('Activity summary').fill('Final revised activity summary');
  await retryForm.getByLabel('Correction reason').fill('Verified complete operational detail');
  await retryForm.getByRole('button', { name: 'Create corrected draft' }).click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Draft');
  const correctedTimeId = page.url().split('/').at(-1)!;
  expect(correctedTimeId).not.toBe(abandonedId);
  await page.locator('form[action="?/submitTime"]').getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');
  await page.reload();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');

  await page.goto(portal(`/expenses/${expenseId}?lang=en`));
  const expenseForm = page.locator('form[data-correction-draft-form]');
  await expect(expenseForm).toBeVisible();
  await expect(expenseForm.getByLabel('Related logged hours (optional)')).toContainText(
    'Correction',
  );
  await expenseForm.getByLabel('Related logged hours (optional)').selectOption(correctedTimeId);
  await expenseForm.getByLabel('Vendor').fill('Verified project lodging vendor');
  await expenseForm.getByLabel('Correction reason').fill('Confirm the supplier on the receipt');
  await expenseForm.getByRole('button', { name: 'Create corrected draft' }).click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Draft');
  await page
    .locator('form[action="?/submitExpense"]')
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');
  await page.reload();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');

  await page.goto(portal(`/reports/${reportId}?lang=en`));
  const reportForm = page.locator('form[data-correction-draft-form]');
  await expect(reportForm).toBeVisible();
  await reportForm.getByLabel('Shift summary').fill('Revised daily work summary');
  await reportForm.getByLabel('Correction reason').fill('Complete the approved work account');
  await reportForm.getByRole('button', { name: 'Create corrected draft' }).click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Draft');
  const correctedReportId = page.url().split('/').at(-1)!;
  await page
    .locator('form[action="?/submitReport"]')
    .getByRole('button', { name: 'Submit for review' })
    .click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');
  await page.reload();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');

  await page.goto(portal(`/reports/${returnedReportId}?lang=en`));
  const returnedReportForm = page.locator('form[action="?/updateReport"]');
  await expect(returnedReportForm).toBeVisible();
  await returnedReportForm.getByLabel('Shift summary').fill('Complete daily field summary');
  await returnedReportForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Needs changes');
  await expect(page.locator('.action-message.success')).toContainText('Changes saved');
  await expect(page.locator('[data-recovery-dialog]')).toBeHidden();
  await page
    .locator('form[action="?/submitReport"]')
    .getByRole('button', { name: 'Submit for review' })
    .click();
  await expect(page.locator('.record-detail-header .state-tag')).toContainText('Submitted');

  const check = createDatabase(readE2EFixturePointer().databasePath);
  try {
    expect(
      check.sqlite
        .prepare('SELECT approval_state,activity_summary FROM time_entry WHERE id=?')
        .get(timeId),
    ).toEqual({
      approval_state: 'needs_changes',
      activity_summary: 'Initial activity needing a clearer summary',
    });
    expect(
      check.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(abandonedId),
    ).toEqual({ approval_state: 'rejected' });
    expect(
      check.sqlite
        .prepare('SELECT approval_state,activity_summary FROM time_entry WHERE id=?')
        .get(correctedTimeId),
    ).toEqual({ approval_state: 'submitted', activity_summary: 'Final revised activity summary' });
    expect(
      check.sqlite.prepare('SELECT approval_state,vendor FROM expense WHERE id=?').get(expenseId),
    ).toEqual({ approval_state: 'needs_changes', vendor: 'Original vendor' });
    expect(
      check.sqlite
        .prepare('SELECT approval_state,summary FROM daily_report WHERE id=?')
        .get(reportId),
    ).toEqual({ approval_state: 'approved', summary: 'Original daily work summary' });
    expect(
      check.sqlite
        .prepare('SELECT approval_state,summary FROM daily_report WHERE id=?')
        .get(correctedReportId),
    ).toEqual({ approval_state: 'submitted', summary: 'Revised daily work summary' });
    expect(
      check.sqlite
        .prepare('SELECT approval_state,summary FROM daily_report WHERE id=?')
        .get(returnedReportId),
    ).toEqual({ approval_state: 'submitted', summary: 'Complete daily field summary' });
  } finally {
    check.sqlite.close();
  }
});
