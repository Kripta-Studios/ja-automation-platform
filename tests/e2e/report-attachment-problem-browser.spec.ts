import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Response } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const evidenceDir = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/report-attachment-browser',
);
const workDate = new Date().toISOString().slice(0, 10);

function database() {
  return createDatabase(readE2EFixturePointer().databasePath);
}

function fixture(viewport: string) {
  const db = database();
  try {
    const idFor = (email: string) =>
      (db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string }).id;
    const owner = new PortalRepository(db.sqlite).principalFor(idFor(e2eCredentials.owner.email));
    const managerId = idFor(e2eCredentials.manager.email);
    const workerId = idFor(e2eCredentials.worker.email);
    const repository = new PortalRepository(db.sqlite);
    const project = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Attachment QA ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-ATTACHMENT', 88, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: workDate,
      projectManagerId: managerId,
      initialWorkerIds: [workerId],
    });
    const report = repository.createDailyReport(repository.principalFor(workerId), {
      projectId: project.id,
      workDate,
      summary: 'Attachment browser QA report',
      tasksCompleted: 'Verified a disposable record',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    return { reportId: report.id, projectId: project.id };
  } finally {
    db.sqlite.close();
  }
}

function reportVersion(reportId: string) {
  const db = database();
  try {
    return (
      db.sqlite.prepare('SELECT version FROM daily_report WHERE id=?').get(reportId) as {
        version: number;
      }
    ).version;
  } finally {
    db.sqlite.close();
  }
}

function bumpReportVersion(reportId: string) {
  const db = database();
  try {
    db.sqlite.prepare('UPDATE daily_report SET version=version+1 WHERE id=?').run(reportId);
  } finally {
    db.sqlite.close();
  }
}

function attachmentCount(reportId: string) {
  const db = database();
  try {
    return (
      db.sqlite
        .prepare('SELECT count(*) AS n FROM report_document_link WHERE report_id=?')
        .get(reportId) as { n: number }
    ).n;
  } finally {
    db.sqlite.close();
  }
}

function observe(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function fillUpload(
  page: Page,
  name: string,
  file = {
    name: 'qa-evidence.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`QA evidence ${name} ${randomUUID()}\n`),
  },
) {
  const form = page.locator('form[data-report-attachment-upload]');
  await expect(form).toBeVisible();
  await form.locator('[name="attachmentKind"]').selectOption('daily_attachment');
  await form.locator('[name="file"]').setInputFiles(file);
  await form.locator('[name="notes"]').fill(name);
  return form;
}

async function submitUpload(page: Page): Promise<Response> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      /\/api\/reports\/[^/]+\/attachments$/.test(new URL(candidate.url()).pathname),
  );
  await page
    .locator('form[data-report-attachment-upload]')
    .getByRole('button', { name: 'Upload private evidence' })
    .click();
  return response;
}

async function capture(
  page: Page,
  name: string,
  viewport: string,
  detail: Record<string, unknown>,
) {
  mkdirSync(evidenceDir, { recursive: true });
  const notice = page.locator('[data-report-attachments] .action-message[role="alert"]');
  await expect(notice).toBeVisible();
  writeFileSync(join(evidenceDir, `${name}-${viewport}.png`), await notice.screenshot());
  writeFileSync(
    join(evidenceDir, `${name}-${viewport}.json`),
    `${JSON.stringify({ ...detail, viewport, screenshot: `${name}-${viewport}.png`, scope: 'isolated notice only; disposable data' }, null, 2)}\n`,
  );
}

async function expectNoticePosition(page: Page) {
  const position = await page
    .locator('[data-report-attachments] .action-message[role="alert"]')
    .evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    }));
  expect(position.scrollY).toBeGreaterThan(100);
  expect(position.top).toBeGreaterThanOrEqual(-2);
  expect(position.bottom).toBeLessThanOrEqual(position.viewportHeight + 2);
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Report attachment upload and recovery at ${viewport}`, async ({ page, browser }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(180_000);
    const { reportId } = fixture(viewport);
    const path = `/reports/${reportId}?lang=en`;
    const diagnostics = observe(page);
    const workerFile = {
      name: 'qa-evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(`QA evidence ${viewport} ${randomUUID()}\n`),
    };

    await signIn(page, 'worker');
    await page.goto(portal(path));
    await fillUpload(page, 'Worker proof', workerFile);
    const workerResponse = await submitUpload(page);
    expect(workerResponse.status()).toBe(201);
    await expect(page.getByText('qa-evidence.txt', { exact: true })).toBeVisible();
    expect(attachmentCount(reportId)).toBe(1);

    const manager = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
    try {
      await signIn(manager, 'manager');
      await manager.goto(portal(path));
      await fillUpload(manager, 'Manager proof', {
        name: 'qa-manager.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(`%PDF-1.4\nQA disposable PDF ${randomUUID()}\n%%EOF\n`),
      });
      const managerResponse = await submitUpload(manager);
      expect(managerResponse.status()).toBe(201);
      await expect(manager.getByText('qa-manager.pdf', { exact: true })).toBeVisible();
      expect(attachmentCount(reportId)).toBe(2);
    } finally {
      await manager.close();
    }

    const committedDocumentId = await page
      .locator('[data-attachment-document-id]')
      .first()
      .getAttribute('data-attachment-document-id');
    expect(committedDocumentId).toBeTruthy();
    const immutableCancel = await page.evaluate(
      async ({ reportId, documentId }) => {
        const response = await fetch(
          `/j-aautomation/app/api/reports/${reportId}/attachments/${documentId}/cancel`,
          { method: 'POST' },
        );
        return { status: response.status, body: await response.json() };
      },
      { reportId, documentId: committedDocumentId! },
    );
    expect(immutableCancel.status).toBe(409);
    expect(immutableCancel.body.code).toBe('REPORT_ATTACHMENT_IMMUTABLE');
    expect(attachmentCount(reportId)).toBe(2);

    await page.goto(portal(path));
    const duplicateForm = await fillUpload(page, 'Duplicate worker proof', workerFile);
    const duplicateResponse = await submitUpload(page);
    expect(duplicateResponse.status()).toBe(409);
    const duplicateBody = await duplicateResponse.json();
    expect(duplicateBody.code).toBe('REPORT_ATTACHMENT_DUPLICATE_CONTENT');
    expect(duplicateBody).toMatchObject({
      success: false,
      fieldErrors: {},
      remedies: expect.any(Array),
    });
    expect(duplicateBody.correlationId).toEqual(expect.any(String));
    const duplicateNotice = page.locator('[data-report-attachments] .action-message[role="alert"]');
    await expect(duplicateNotice).toContainText('already');
    await expect(duplicateNotice).toBeFocused();
    await expectNoticePosition(page);
    await expect(
      duplicateNotice.getByRole('link', { name: 'Review current attachments in another tab' }),
    ).toBeVisible();
    await expect(duplicateForm.locator('[name="notes"]')).toHaveValue('Duplicate worker proof');
    expect(attachmentCount(reportId)).toBe(2);
    await capture(page, 'duplicate-content', viewport, {
      code: duplicateBody.code,
      status: duplicateResponse.status(),
      role: 'worker',
      persistedCount: attachmentCount(reportId),
    });

    await page.goto(portal(path));
    const invalidForm = await fillUpload(page, 'Keep invalid notes', {
      name: 'wrong.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not a PDF'),
    });
    const invalidResponse = await submitUpload(page);
    expect(invalidResponse.status()).toBe(400);
    const invalidBody = await invalidResponse.json();
    expect(invalidBody).toMatchObject({
      code: 'REPORT_ATTACHMENT_FILE_INVALID',
      messageKey: 'problem.reportAttachment.fileInvalid',
      success: false,
      fieldErrors: {},
      remedies: expect.any(Array),
    });
    const invalidNotice = page.locator('[data-report-attachments] .action-message[role="alert"]');
    await expect(invalidNotice).toContainText('Choose a PDF, ZIP, image, or text file up to 50 MB');
    await expect(invalidNotice).toBeFocused();
    await expectNoticePosition(page);
    await expect(invalidForm.locator('[name="notes"]')).toHaveValue('Keep invalid notes');
    expect(
      await invalidForm
        .locator('[name="file"]')
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe('wrong.pdf');
    await capture(page, 'invalid-file', viewport, {
      code: invalidBody.code,
      status: invalidResponse.status(),
      role: 'worker',
    });

    await page.goto(portal(path));
    const staleForm = await fillUpload(page, 'Keep stale notes');
    const openedVersion = Number(await staleForm.locator('[name="version"]').inputValue());
    bumpReportVersion(reportId);
    expect(reportVersion(reportId)).toBe(openedVersion + 1);
    const staleResponse = await submitUpload(page);
    expect(staleResponse.status()).toBe(409);
    const staleBody = await staleResponse.json();
    expect(staleBody.code).toBe('REPORT_ATTACHMENT_STALE_VERSION');
    expect(staleBody.correlationId).toEqual(expect.any(String));
    const staleNotice = page.locator('[data-report-attachments] .action-message[role="alert"]');
    await expect(staleNotice).toContainText('The report changed while the file was uploading');
    await expect(staleNotice).toBeFocused();
    await expectNoticePosition(page);
    await expect(
      staleNotice.getByRole('link', { name: 'Review current attachments in another tab' }),
    ).toHaveAttribute('target', '_blank');
    await expect(staleForm.locator('[name="notes"]')).toHaveValue('Keep stale notes');
    expect(
      await staleForm
        .locator('[name="file"]')
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe('qa-evidence.txt');
    expect(attachmentCount(reportId)).toBe(2);
    await capture(page, 'stale-report', viewport, {
      code: staleBody.code,
      status: staleResponse.status(),
      role: 'worker',
      openedVersion,
      currentVersion: reportVersion(reportId),
    });

    const finance = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
    try {
      await signIn(finance, 'finance');
      const detail = await finance.goto(portal(path));
      if (detail?.status() === 200) {
        await expect(finance.locator('form[data-report-attachment-upload]')).toHaveCount(0);
        await expect(finance.locator('[data-report-attachments]')).toContainText(
          'read-only access',
        );
      } else expect(detail?.status()).toBe(404);
      const denial = await finance.evaluate(
        async ({ reportId, version }) => {
          const form = new FormData();
          form.set('attachmentKind', 'daily_attachment');
          form.set('version', String(version));
          form.set('file', new File(['QA evidence'], 'qa-evidence.txt', { type: 'text/plain' }));
          const response = await fetch(`/j-aautomation/app/api/reports/${reportId}/attachments`, {
            method: 'POST',
            body: form,
          });
          return { status: response.status, body: await response.json() };
        },
        { reportId, version: reportVersion(reportId) },
      );
      expect(denial.status).toBe(403);
      expect(denial.body.code).toBe('REPORT_ATTACHMENT_ACCESS_REQUIRED');
      expect(attachmentCount(reportId)).toBe(2);
    } finally {
      await finance.close();
    }

    await page.goto(portal(path));
    const lostForm = await fillUpload(page, 'Keep uncertain notes');
    let intercepted = 0;
    await page.route('**/api/reports/*/attachments', async (route) => {
      intercepted += 1;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    });
    await lostForm.getByRole('button', { name: 'Upload private evidence' }).click();
    const uncertain = page.locator('[data-report-attachments] .action-message[role="alert"]');
    await expect(uncertain).toContainText('The upload response was lost');
    await expect(uncertain).toBeFocused();
    await expectNoticePosition(page);
    await expect(lostForm.locator('[name="notes"]')).toHaveValue('Keep uncertain notes');
    await expect(lostForm.locator('[name="attachmentKind"]')).toHaveValue('daily_attachment');
    expect(
      await lostForm
        .locator('[name="file"]')
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe('qa-evidence.txt');
    expect(intercepted).toBe(1);
    expect(attachmentCount(reportId)).toBe(3);
    const reviewLink = uncertain.getByRole('link', {
      name: 'Review current attachments in another tab',
    });
    await expect(reviewLink).toHaveAttribute('target', '_blank');
    const popupPromise = page.waitForEvent('popup');
    await reviewLink.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup.locator('[data-attachment-document-id]')).toHaveCount(3);
    await popup.close();
    await capture(page, 'lost-response', viewport, {
      code: 'REPORT_ATTACHMENT_UPLOAD_UNCERTAIN',
      role: 'worker',
      interceptedPosts: intercepted,
      persistedCount: attachmentCount(reportId),
    });
    expect(diagnostics.pageErrors).toEqual([]);
    expect(
      diagnostics.consoleErrors.filter((message) => !message.includes('Failed to load resource')),
    ).toEqual([]);
  });
}
