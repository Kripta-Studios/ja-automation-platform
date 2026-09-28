import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { PortalRepository, createDatabase } from '@ja/database';
import {
  e2eCredentials,
  e2eLifecycleFixturesFor,
  portal,
  signIn,
} from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';
import { e2eCostCenter } from '../../../../tests/e2e/project-cost-center.js';

const day = new Date().toISOString().slice(0, 10);
const beforeAssignment = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000)
  .toISOString()
  .slice(0, 10);
const evidenceRoot = import.meta.dirname;

function seedPrerequisites(projectName: string) {
  const databasePath = readE2EFixturePointer().databasePath;
  const database = createDatabase(databasePath);
  try {
    const userId = (email: string) =>
      (database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email) as { id: string })
        .id;
    const repository = new PortalRepository(database.sqlite);
    const owner = repository.principalFor(userId(e2eCredentials.owner.email));
    const workerId = userId(e2eCredentials.worker.email);
    const project = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(projectName).client.id,
      name: `Final time correction QA ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-TIME-CORRECTION-FINAL', 95, projectName),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: day,
    });
    const status = (
      database.sqlite.prepare('SELECT status FROM project WHERE id=?').get(project.id) as {
        status: string;
      }
    ).status;
    if (status !== 'active')
      repository.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Open disposable time-correction QA project',
      });
    repository.assignWorker(owner, { projectId: project.id, workerId, startsOn: day });
    return { databasePath, projectId: project.id };
  } finally {
    database.sqlite.close();
  }
}

function recordId(databasePath: string, summary: string) {
  const db = new DatabaseSync(databasePath);
  try {
    return (
      (
        db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary) as
          | { id: string }
          | undefined
      )?.id ?? ''
    );
  } finally {
    db.close();
  }
}

function correctionId(databasePath: string, originalId: string) {
  const db = new DatabaseSync(databasePath);
  try {
    return (
      (
        db
          .prepare(
            "SELECT correction_id FROM record_correction_link WHERE record_type='time_entry' AND original_id=?",
          )
          .get(originalId) as { correction_id: string } | undefined
      )?.correction_id ?? ''
    );
  } finally {
    db.close();
  }
}

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

async function noticeState(page: Page) {
  return page
    .locator('[data-time-detail-problem] [data-ui="problem-notice"]')
    .first()
    .evaluate((notice) => {
      const bounds = notice.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      const header = document.querySelector<HTMLElement>('.portal-layout > header');
      const safeBottom =
        nav && getComputedStyle(nav).position === 'fixed'
          ? nav.getBoundingClientRect().top - 16
          : innerHeight - 16;
      const safeTop =
        (header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
          ? header.getBoundingClientRect().bottom
          : 0) + 8;
      return {
        code: notice.getAttribute('data-problem-code'),
        text: notice.textContent?.replace(/\s+/gu, ' ').trim(),
        focused: document.activeElement === notice,
        visible: bounds.top >= safeTop - 1 && bounds.bottom <= safeBottom + 1,
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        safeTop: Math.round(safeTop),
        safeBottom: Math.round(safeBottom),
        scrollY: Math.round(scrollY),
        locale: document.documentElement.lang,
        overflow: document.documentElement.scrollWidth > innerWidth,
        url: (location.pathname + location.search).replace(/\/[0-9a-f-]{36}/giu, '/:record'),
      };
    });
}

async function fieldState(page: Page) {
  return page.locator('form[data-correction-draft-form]').evaluate((form) => {
    const field = (name: string) =>
      form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    const summary = form.querySelector<HTMLElement>('[data-validation-summary]');
    return {
      workDate: field('workDate')?.value,
      reason: field('reason')?.value,
      summary: field('activitySummary')?.value,
      dateInvalid: field('workDate')?.getAttribute('aria-invalid'),
      reasonInvalid: field('reason')?.getAttribute('aria-invalid'),
      dateError:
        form.querySelector('[data-field-error-for="validation-workdate"]')?.textContent?.trim() ??
        '',
      reasonError: field('reason')?.nextElementSibling?.textContent?.trim() ?? '',
      summaryText: summary?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      summaryLinks: summary?.querySelectorAll('a').length ?? 0,
    };
  });
}

test('correction validation and existing-correction link across Owner and Worker', async ({
  browser,
}, info) => {
  test.setTimeout(210_000);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const height = width === 390 ? 844 : width === 430 ? 932 : 900;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const { databasePath, projectId } = seedPrerequisites(info.project.name);
  const workerContext = await browser.newContext({ viewport: { width, height } });
  const ownerContext = await browser.newContext({ viewport: { width, height } });
  const worker = await workerContext.newPage();
  const owner = await ownerContext.newPage();
  const workerErrors = diagnostics(worker);
  const ownerErrors = diagnostics(owner);
  let originalId = '';
  try {
    await signIn(worker, 'worker');
    await worker.goto(portal(`/time?project=${projectId}&lang=en`));
    await worker.locator('[data-time-primary-cta]').click();
    const entry = worker.locator('form[data-time-entry-surface]');
    await expect(entry).toBeVisible();
    const originalSummary = `Final correction original ${randomUUID()}`;
    await entry.locator('[name="projectId"]').selectOption(projectId);
    await entry.locator('[name="workDate"]').fill(day);
    await entry.locator('[name="durationHours"]').fill('2.5');
    await entry.locator('[name="summary"]').fill(originalSummary);
    await entry.getByRole('button', { name: 'Save draft' }).click();
    await expect.poll(() => recordId(databasePath, originalSummary)).not.toBe('');
    originalId = recordId(databasePath, originalSummary);
    await worker.goto(portal(`/time/${originalId}?lang=en`));
    await worker
      .locator('form[action="?/submitTime"]')
      .getByRole('button', { name: 'Submit' })
      .click();
    await expect(worker.locator('.record-detail-header .state-tag')).toContainText('Submitted');
    await signIn(owner, 'owner');
    await owner.goto(portal('/approvals?lang=en'));
    const approval = owner.locator(`[data-approval-row="${originalId}"]`);
    await expect(approval).toBeVisible();
    await approval
      .locator('form[action="?/approveRecord"]')
      .getByRole('button', { name: 'Approve' })
      .click();
    await expect
      .poll(() => {
        const db = new DatabaseSync(databasePath);
        try {
          return (
            db.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(originalId) as {
              approval_state: string;
            }
          ).approval_state;
        } finally {
          db.close();
        }
      })
      .toBe('approved');
    await worker.goto(portal(`/time/${originalId}?lang=${locale}`));
    const form = worker.locator('form[data-correction-draft-form]');
    await expect(form).toBeVisible();
    const correctionPosts: string[] = [];
    worker.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('createCorrectionDraft'))
        correctionPosts.push('POST');
    });
    await form.locator('[name="activitySummary"]').fill('');
    await form.locator('[name="reason"]').fill('');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('[data-validation-summary] a')).toHaveCount(2);
    const nativeInvalid = await fieldState(worker);
    expect(nativeInvalid.summaryLinks).toBe(2);
    expect(correctionPosts).toHaveLength(0);

    const attemptedSummary = 'Corrected work account from the browser';
    await form.locator('[name="activitySummary"]').fill(attemptedSummary);
    await form.locator('[name="reason"]').fill('   ');
    const reasonResponse = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createCorrectionDraft'),
    );
    await form.locator('button[type="submit"]').click();
    expect((await reasonResponse).status()).toBe(400);
    await expect(
      worker.locator(
        '[data-time-detail-problem] [data-problem-code="TIME_CORRECTION_REASON_INVALID"]',
      ),
    ).toBeVisible();
    await expect(
      worker.locator('form[data-correction-draft-form] [name="reason"]'),
    ).toHaveAttribute('aria-invalid', 'true');
    await worker.waitForTimeout(250);
    const reasonNotice = await noticeState(worker);
    const reasonField = await fieldState(worker);
    expect(reasonField.summary).toBe(attemptedSummary);
    expect(reasonField.reason).toBe('   ');
    expect(reasonField.reasonError.length).toBeGreaterThan(0);
    expect(reasonNotice.focused).toBe(true);
    expect(reasonNotice.visible).toBe(true);
    await worker
      .locator('[data-time-detail-problem] [data-ui="problem-notice"]')
      .first()
      .screenshot({ path: join(evidenceRoot, `${info.project.name}-${locale}-reason.png`) });

    const workerForm = worker.locator('form[data-correction-draft-form]');
    await workerForm.locator('[name="reason"]').fill('A valid reason for the corrected work.');
    await workerForm.locator('[name="workDate"]').fill(beforeAssignment);
    const workerDateResponse = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createCorrectionDraft'),
    );
    await workerForm.locator('button[type="submit"]').click();
    const workerDateStatus = (await workerDateResponse).status();
    expect(workerDateStatus).toBe(403);
    await expect(
      worker.locator('[data-time-detail-problem] [data-ui="problem-notice"]'),
    ).toBeVisible();
    const workerDateNotice = await noticeState(worker);
    const workerDateField = await fieldState(worker);
    expect(workerDateNotice.code).toBe('TIME_CORRECTION_CORRECTED_DATE_ACCESS_REQUIRED');
    expect(workerDateNotice.text).toMatch(
      /corrected work date|fecha de trabajo corregida|data de trabalho corrigida/i,
    );
    expect(workerDateNotice.text).not.toMatch(/report date|fecha del informe|data do relatório/i);
    expect(workerDateField.workDate).toBe(beforeAssignment);
    expect(workerDateField.dateInvalid).toBe('true');
    expect(workerDateField.dateError.length).toBeGreaterThan(0);
    expect(workerDateNotice.focused).toBe(true);
    expect(workerDateNotice.visible).toBe(true);

    await owner.goto(portal(`/time/${originalId}?lang=${locale}`));
    const ownerForm = owner.locator('form[data-correction-draft-form]');
    await expect(ownerForm).toBeVisible();
    await ownerForm.locator('[name="activitySummary"]').fill('Owner corrected work account');
    await ownerForm.locator('[name="reason"]').fill('Owner verified the original work account.');
    await ownerForm.locator('[name="workDate"]').fill(beforeAssignment);
    const ownerDateResponse = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createCorrectionDraft'),
    );
    await ownerForm.locator('button[type="submit"]').click();
    expect((await ownerDateResponse).status()).toBe(409);
    await expect(
      owner.locator(
        '[data-time-detail-problem] [data-problem-code="TIME_CORRECTION_DATE_ASSIGNMENT_REQUIRED"]',
      ),
    ).toBeVisible();
    await expect(
      owner.locator('form[data-correction-draft-form] [name="workDate"]'),
    ).toHaveAttribute('aria-invalid', 'true');
    await owner.waitForTimeout(250);
    const ownerDateNotice = await noticeState(owner);
    const ownerDateField = await fieldState(owner);
    expect(ownerDateField.workDate).toBe(beforeAssignment);
    expect(ownerDateField.dateInvalid).toBe('true');
    expect(ownerDateNotice.focused).toBe(true);
    expect(ownerDateNotice.visible).toBe(true);
    await owner
      .locator('[data-time-detail-problem] [data-ui="problem-notice"]')
      .first()
      .screenshot({ path: join(evidenceRoot, `${info.project.name}-${locale}-date.png`) });

    await owner.goto(portal(`/time/${originalId}?lang=${locale}`));
    const finalForm = owner.locator('form[data-correction-draft-form]');
    await expect(finalForm).toBeVisible();
    await finalForm.locator('[name="activitySummary"]').fill('Owner saved corrected account');
    await finalForm
      .locator('[name="reason"]')
      .fill('Owner completed the permitted audited correction.');
    const successResponse = owner.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createCorrectionDraft'),
    );
    await finalForm.locator('button[type="submit"]').click();
    expect((await successResponse).status()).toBe(303);
    await expect.poll(() => correctionId(databasePath, originalId)).not.toBe('');
    const linkedId = correctionId(databasePath, originalId);
    const roleLinks: Record<string, unknown> = {};
    for (const [role, page] of [
      ['worker', worker],
      ['owner', owner],
    ] as const) {
      await page.goto(portal(`/time/${originalId}?lang=${locale}`));
      const link = page.getByRole('link', {
        name: /Open existing correction|corrección existente|correção existente/i,
      });
      await expect(link).toHaveCount(1);
      const href = await link.getAttribute('href');
      expect(href).toContain(`/time/${linkedId}`);
      expect(href).toContain(`lang=${locale}`);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/time/${linkedId}\\?lang=${locale}`));
      await expect(page.locator('.record-detail-header .state-tag')).toBeVisible();
      roleLinks[role] = {
        count: 1,
        opened: true,
        localeRetained: new URL(page.url()).searchParams.get('lang') === locale,
        detailStatus: (await page.locator('.record-detail-header .state-tag').innerText()).trim(),
      };
    }
    expect(workerErrors).toEqual([]);
    expect(ownerErrors).toEqual([]);
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    writeFileSync(
      join(evidenceRoot, `${info.project.name}-${locale}-results.json`),
      JSON.stringify(
        {
          commit,
          viewport: width,
          locale,
          roles: ['worker', 'owner'],
          nativeInvalid: {
            actionPosts: 0,
            summaryLinks: nativeInvalid.summaryLinks,
            inlineSummary: nativeInvalid.summaryText,
          },
          reason: {
            status: 400,
            code: reasonNotice.code,
            notice: reasonNotice,
            field: reasonField,
          },
          workerOutsideAssignment: {
            status: workerDateStatus,
            code: workerDateNotice.code,
            notice: workerDateNotice,
            field: workerDateField,
          },
          ownerOutsideAssignment: {
            status: 409,
            code: ownerDateNotice.code,
            notice: ownerDateNotice,
            field: ownerDateField,
          },
          correction: { creation: 303, links: roleLinks },
          diagnostics: { worker: workerErrors, owner: ownerErrors },
        },
        null,
        2,
      ).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu, '[qa-id]') +
        '\n',
    );
  } finally {
    await workerContext.close().catch(() => {});
    await ownerContext.close().catch(() => {});
  }
});
