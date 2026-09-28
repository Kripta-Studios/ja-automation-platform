import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

type Scenario = 'draft' | 'approved' | 'correction';
const evidenceDir = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/report-role-warning-browser',
);
const today = new Date().toISOString().slice(0, 10);

function seedReport(viewport: string, scenarioNumber: number, scenario: Scenario) {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  try {
    const idFor = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const repository = new PortalRepository(db.sqlite);
    const owner = repository.principalFor(idFor(e2eCredentials.owner.email));
    const workerId = idFor(e2eCredentials.worker.email);
    const managerId = idFor(e2eCredentials.manager.email);
    const project = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Disposable report warning ${scenarioNumber}`,
      costCenterCode: e2eCostCenter('QA-REPORT-WARNING', scenarioNumber, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
      projectManagerId: managerId,
      initialWorkerIds: [workerId],
    });
    const worker = repository.principalFor(workerId);
    const manager = repository.principalFor(managerId);
    const report = repository.createDailyReport(worker, {
      projectId: project.id,
      workDate: today,
      summary: `Disposable ${scenario} report`,
      tasksCompleted: 'Verified a synthetic record',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    if (scenario === 'draft') return { reportId: report.id, correctionId: null };
    repository.submitReport(worker, 'daily', report.id, report.version);
    repository.reviewReport(manager, 'daily', report.id, 'approved');
    if (scenario === 'approved') return { reportId: report.id, correctionId: null };
    const correction = repository.createCorrectionDraft(manager, {
      recordType: 'daily_report',
      originalId: report.id,
      requestId: randomUUID(),
      reason: 'Add new synthetic evidence to the correction',
      patch: { summary: 'Corrected synthetic report summary' },
    });
    return { reportId: report.id, correctionId: correction.id };
  } finally {
    db.sqlite.close();
  }
}

function attachmentCount(reportId: string): number {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return (
      db.sqlite
        .prepare('SELECT count(*) AS count FROM report_document_link WHERE report_id=?')
        .get(reportId) as { count: number }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

async function assertWarning(notice: Locator, code: string): Promise<void> {
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-kind', 'warning');
  await expect(notice).toHaveAttribute('data-problem-code', code);
  await expect(notice).not.toContainText('problem.warning.');
}

async function saveNotice(notice: Locator, filename: string): Promise<void> {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, filename), await notice.screenshot());
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Worker draft deletion warning and Draft actions at ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== viewport);
    const { reportId } = seedReport(viewport, 91, 'draft');
    const locale = viewport === 'phone-390' ? 'en' : 'pt';
    await signIn(page, 'worker');
    await page.goto(portal(`/reports/${reportId}?lang=${locale}`));
    const controls = page.locator('.danger-zone');
    await expect(controls.getByRole('heading', { level: 2 })).toHaveText(
      locale === 'pt' ? 'Ações do rascunho' : 'Draft actions',
    );
    const notice = controls.locator('[data-ui="problem-notice"]');
    await assertWarning(notice, 'WARNING_REPORT_DELETE_DRAFT');
    await expect(notice).toContainText(
      locale === 'pt' ? 'Revise os campos do rascunho' : 'Review the draft fields',
    );
    await expect(notice.getByRole('link')).toHaveAttribute('href', '#modify-report-form');
    await expect(
      controls.getByRole('button', { name: /Delete report|Excluir relatório/ }),
    ).toBeVisible();
    await saveNotice(notice, `worker-draft-${viewport}-${locale}.png`);
    const db = createDatabase(readE2EFixturePointer().databasePath);
    try {
      expect(
        db.sqlite.prepare('SELECT count(*) count FROM daily_report WHERE id=?').get(reportId),
      ).toEqual({
        count: 1,
      });
    } finally {
      db.sqlite.close();
    }
  });

  test(`Finance approved attachment guidance stays role safe at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    const { reportId } = seedReport(viewport, 92, 'approved');
    const locale = viewport === 'phone-390' ? 'en' : 'es';
    await signIn(page, 'finance');
    await page.goto(portal(`/reports/${reportId}?lang=${locale}`));
    const attachments = page.locator('[data-report-attachments]');
    const notice = attachments.locator('[data-ui="problem-notice"]');
    await assertWarning(notice, 'WARNING_REPORT_ATTACHMENT_CONTACT_OWNER');
    await expect(notice.locator('.ui-problem-notice__status')).toHaveText(
      locale === 'es' ? 'Aprobado' : 'Approved',
    );
    await expect(notice).toContainText(
      locale === 'es' ? 'Pide al propietario del proyecto' : 'Ask the project owner',
    );
    await expect(notice.getByRole('link')).toHaveCount(0);
    await expect(attachments.locator('[data-report-attachment-upload]')).toHaveCount(0);
    await expect(page.locator('#report-correction-title')).toHaveCount(0);
    await saveNotice(notice, `finance-approved-${viewport}-${locale}.png`);
  });

  test(`Owner approved report offers an audited correction at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    const { reportId } = seedReport(viewport, 93, 'approved');
    const locale = viewport === 'phone-390' ? 'es' : 'en';
    await signIn(page, 'owner');
    await page.goto(portal(`/reports/${reportId}?lang=${locale}`));
    const notice = page.locator('[data-report-attachments] [data-ui="problem-notice"]');
    await assertWarning(notice, 'WARNING_REPORT_ATTACHMENT_CORRECTION_AVAILABLE');
    await expect(notice.locator('.ui-problem-notice__status')).toHaveText(
      locale === 'es' ? 'Aprobado' : 'Approved',
    );
    await expect(notice).toContainText(
      locale === 'es'
        ? 'Crea un borrador de corrección auditado'
        : 'Create an audited correction draft',
    );
    await expect(notice.getByRole('link')).toHaveAttribute('href', '#report-correction-title');
    await expect(page.locator('#report-correction-title')).toBeVisible();
    await saveNotice(notice, `owner-correction-available-${viewport}-${locale}.png`);
  });

  test(`Owner sees history and Manager can add evidence to a correction at ${viewport}`, async ({
    page,
    browser,
  }, info) => {
    test.skip(info.project.name !== viewport);
    const { reportId, correctionId } = seedReport(viewport, 94, 'correction');
    if (!correctionId) throw new Error('Disposable correction report was not created');
    const locale = viewport === 'phone-390' ? 'en' : 'pt';
    await signIn(page, 'owner');
    await page.goto(portal(`/reports/${reportId}?lang=${locale}`));
    const notice = page.locator('[data-report-attachments] [data-ui="problem-notice"]');
    await assertWarning(notice, 'WARNING_REPORT_ATTACHMENT_REVIEW_HISTORY');
    await expect(notice.locator('.ui-problem-notice__status')).toHaveText(
      locale === 'pt' ? 'Aprovado' : 'Approved',
    );
    await expect(notice).toContainText(
      locale === 'pt' ? 'Revise o histórico e qualquer correção existente' : 'Review its history',
    );
    await expect(notice.getByRole('link')).toHaveAttribute('href', '#change-history-title');
    await expect(notice).not.toContainText('Contact the project owner');
    await saveNotice(notice, `owner-review-history-${viewport}-${locale}.png`);

    const managerPage = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
    try {
      await signIn(managerPage, 'manager');
      await managerPage.goto(portal(`/reports/${correctionId}?lang=${locale}`));
      const upload = managerPage.locator('[data-report-attachment-upload]');
      await expect(upload).toBeVisible();
      await expect(managerPage.locator('#modify-report-form')).toHaveCount(0);
      await upload.locator('[name="attachmentKind"]').selectOption('daily_attachment');
      await upload.locator('[name="file"]').setInputFiles({
        name: 'correction-evidence.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(`Synthetic correction evidence ${randomUUID()}\n`),
      });
      const responsePromise = managerPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /\/api\/reports\/[^/]+\/attachments$/.test(new URL(response.url()).pathname),
      );
      await upload.locator('button[type="submit"]').click();
      expect((await responsePromise).status()).toBe(201);
      await expect(managerPage.getByText('correction-evidence.txt', { exact: true })).toBeVisible();
      expect(attachmentCount(correctionId)).toBe(1);
    } finally {
      await managerPage.close();
    }
  });
}
