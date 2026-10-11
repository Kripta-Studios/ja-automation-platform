import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const workDate = new Date().toISOString().slice(0, 10);

function database() {
  return createDatabase(readE2EFixturePointer().databasePath);
}

function seedScenario(viewport: string) {
  const db = database();
  try {
    const userId = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const ownerId = userId(e2eCredentials.owner.email);
    const managerId = userId(e2eCredentials.manager.email);
    const workerId = userId(e2eCredentials.worker.email);
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(ownerId);
    const worker = repository.principalFor(workerId);
    const project = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Report downtime hours QA ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-DOWNTIME', 96, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
      projectManagerId: managerId,
      initialWorkerIds: [workerId],
    });
    const status = db.sqlite.prepare('SELECT status FROM project WHERE id=?').get(project.id) as {
      status: string;
    };
    if (status.status !== 'active')
      repository.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Activate disposable report downtime hours QA project',
      });

    const correctionSource = repository.createDailyReport(worker, {
      projectId: project.id,
      workDate,
      summary: 'Approved report for downtime correction QA',
      tasksCompleted: 'Checked disposable QA equipment',
      downtimeMinutes: 480,
      safetyRelated: false,
    });
    repository.submitReport(worker, 'daily', correctionSource.id, correctionSource.version);
    repository.reviewReport(owner, 'daily', correctionSource.id, 'approved');
    return { projectId: project.id, correctionSourceId: correctionSource.id };
  } finally {
    db.sqlite.close();
  }
}

function reportBySummary(projectId: string, summary: string) {
  const db = database();
  try {
    return db.sqlite
      .prepare('SELECT id,downtime_minutes FROM daily_report WHERE project_id=? AND summary=?')
      .get(projectId, summary) as { id: string; downtime_minutes: number } | undefined;
  } finally {
    db.sqlite.close();
  }
}

function downtimeMinutes(reportId: string): number {
  const db = database();
  try {
    const report = db.sqlite
      .prepare('SELECT downtime_minutes FROM daily_report WHERE id=?')
      .get(reportId) as { downtime_minutes: number };
    return report.downtime_minutes;
  } finally {
    db.sqlite.close();
  }
}

function correctedReportDowntime(originalId: string): number | undefined {
  const db = database();
  try {
    const correction = db.sqlite
      .prepare(
        `SELECT r.downtime_minutes
           FROM record_correction_link link
           JOIN daily_report r ON r.id=link.correction_id
          WHERE link.record_type='daily_report' AND link.original_id=?`,
      )
      .get(originalId) as { downtime_minutes: number } | undefined;
    return correction?.downtime_minutes;
  } finally {
    db.sqlite.close();
  }
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`daily report downtime uses decimal hours through create, autosave, PDF edit, and correction at ${viewport}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== viewport);
    test.setTimeout(150_000);
    page.setDefaultTimeout(10_000);
    const { projectId, correctionSourceId } = seedScenario(viewport);
    const summary = `Decimal downtime report ${randomUUID()}`;

    await signIn(page, 'worker');
    await page.goto(portal('/reports?lang=en'));
    await page.getByRole('button', { name: 'New daily report', exact: true }).first().click();
    const createForm = page.locator('[data-report-entry-surface="daily"]');
    await expect(createForm).toBeVisible();
    await createForm.locator('[name="projectId"]').selectOption(projectId);
    await createForm.locator('[name="workDate"]').fill(workDate);
    await createForm.locator('[name="summary"]').fill(summary);
    await createForm.locator('[name="tasksCompleted"]').fill('Verified decimal downtime entry.');
    const createHours = createForm.getByLabel('Downtime (hours)', { exact: true });
    await createHours.fill('1.5');
    await expect(createForm.locator('input[type="hidden"][name="downtimeMinutes"]')).toHaveValue(
      '90',
    );
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/createDailyReport'),
    );
    await createForm.getByRole('button', { name: 'Save daily report', exact: true }).click();
    expect((await createResponse).status()).toBe(200);
    await expect(page.getByText('Daily report draft saved', { exact: true })).toBeVisible();
    await expect.poll(() => reportBySummary(projectId, summary)?.downtime_minutes).toBe(90);
    const reportId = reportBySummary(projectId, summary)?.id;
    if (!reportId) throw new Error('The submitted daily report was not saved');

    await page.goto(portal(`/reports/${reportId}?lang=en`));
    const editForm = page.locator('form[data-report-autosave-form]');
    const editHours = editForm.getByLabel('Downtime (hours)', { exact: true });
    await expect(editHours).toHaveValue('1.5');
    await page.reload();
    await expect(editHours).toHaveValue('1.5');
    await editHours.fill('2.25');
    const autosaveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/autosaveReport'),
    );
    expect((await autosaveResponse).status()).toBe(200);
    await expect.poll(() => downtimeMinutes(reportId)).toBe(135);
    await page.reload();
    await expect(editForm.getByLabel('Downtime (hours)', { exact: true })).toHaveValue('2.25');

    const preview = page.locator('[data-report-document-preview]');
    const previewFrame = page.frameLocator('[data-report-document-preview] iframe');
    const previewDowntime = previewFrame.locator('[data-report-field="downtimeMinutes"]');
    await expect(previewDowntime).toContainText('2.25');
    await previewDowntime.click();
    const previewEditor = page.getByRole('dialog', { name: 'Edit: Downtime (hours)' });
    await expect(previewEditor.getByLabel('Downtime (hours)', { exact: true })).toHaveValue('2.25');
    await previewEditor.getByLabel('Downtime (hours)', { exact: true }).fill('0,75');
    await expect(editForm.getByLabel('Downtime (hours)', { exact: true })).toHaveValue('0,75');
    await expect(editForm.locator('input[type="hidden"][name="downtimeMinutes"]')).toHaveValue(
      '45',
    );
    await previewEditor.getByRole('button', { name: 'Save and close', exact: true }).click();
    await expect.poll(() => downtimeMinutes(reportId)).toBe(45);
    await page.reload();
    await expect(editForm.getByLabel('Downtime (hours)', { exact: true })).toHaveValue('0.75');
    await expect(preview).toBeVisible();
    await expect(page.locator('form[data-report-autosave-form]')).not.toContainText(
      'Downtime minutes',
    );

    await page.goto(portal(`/reports/${correctionSourceId}?lang=en`));
    await page.locator('#report-correction-title').click();
    const correctionForm = page.locator('form[data-correction-draft-form]');
    await expect(correctionForm).toBeVisible();
    const correctionHours = correctionForm.getByLabel('Downtime (hours)', { exact: true });
    await expect(correctionHours).toHaveValue('8');
    await correctionHours.fill('1.5');
    await expect(
      correctionForm.locator('input[type="hidden"][name="downtimeMinutes"]'),
    ).toHaveValue('90');
    await correctionForm
      .getByLabel('Correction reason')
      .fill('Correct downtime using decimal hours.');
    const correctionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/createCorrectionDraft'),
    );
    await correctionForm.getByRole('button', { name: 'Create corrected draft' }).click();
    expect((await correctionResponse).status()).toBe(303);
    await expect.poll(() => correctedReportDowntime(correctionSourceId)).toBe(90);
  });
}
