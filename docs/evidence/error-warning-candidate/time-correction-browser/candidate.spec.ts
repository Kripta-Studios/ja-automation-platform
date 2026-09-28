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
      name: `Time correction race QA ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QA-TIME-CORRECTION-RACE', 94, projectName),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: day,
    });
    const current = database.sqlite
      .prepare('SELECT status FROM project WHERE id=?')
      .get(project.id) as { status: string };
    if (current.status !== 'active')
      repository.transitionProject(owner, {
        projectId: project.id,
        status: 'active',
        reason: 'Open disposable browser time-correction project',
      });
    repository.assignWorker(owner, { projectId: project.id, workerId, startsOn: day });
    return { databasePath, projectId: project.id };
  } finally {
    database.sqlite.close();
  }
}

function timeIdFor(databasePath: string, summary: string): string {
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

function correctionCount(databasePath: string, originalId: string): number {
  const db = new DatabaseSync(databasePath);
  try {
    return (
      db
        .prepare(
          "SELECT count(*) count FROM record_correction_link WHERE record_type='time_entry' AND original_id=?",
        )
        .get(originalId) as { count: number }
    ).count;
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

test('two Worker correction forms resolve a real duplicate-draft conflict', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const { databasePath, projectId } = seedPrerequisites(info.project.name);
  const width =
    info.project.name === 'phone-390' ? 390 : info.project.name === 'phone-430' ? 430 : 1440;
  const locale = width === 390 ? 'en' : width === 430 ? 'pt' : 'es';
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : width === 430 ? 932 : 900 },
  });
  const ownerContext = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : width === 430 ? 932 : 900 },
  });
  const worker = await context.newPage();
  const owner = await ownerContext.newPage();
  const workerErrors = diagnostics(worker);
  const ownerErrors = diagnostics(owner);
  let timeId = '';
  try {
    await signIn(worker, 'worker');
    await worker.goto(portal(`/time?project=${projectId}&lang=en`));
    await worker.locator('[data-time-primary-cta]').click();
    const entry = worker.locator('form[data-time-entry-surface]');
    await expect(entry).toBeVisible();
    const originalSummary = `Original disposable work ${randomUUID()}`;
    await entry.locator('[name="projectId"]').selectOption(projectId);
    await entry.locator('[name="workDate"]').fill(day);
    await entry.getByRole('textbox', { name: 'Actual hours' }).fill('2.5');
    await entry.locator('[name="summary"]').fill(originalSummary);
    await entry.getByRole('button', { name: 'Save draft' }).click();
    await expect.poll(() => timeIdFor(databasePath, originalSummary)).not.toBe('');
    timeId = timeIdFor(databasePath, originalSummary);
    await worker.goto(portal(`/time/${timeId}?lang=en`));
    await worker
      .locator('form[action="?/submitTime"]')
      .getByRole('button', { name: 'Submit' })
      .click();
    await expect(worker.locator('.record-detail-header .state-tag')).toContainText('Submitted');

    await signIn(owner, 'owner');
    await owner.goto(portal('/approvals?lang=en'));
    const approval = owner.locator(`[data-approval-row="${timeId}"]`);
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
            db.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(timeId) as {
              approval_state: string;
            }
          ).approval_state;
        } finally {
          db.close();
        }
      })
      .toBe('approved');

    await worker.goto(portal(`/time/${timeId}?lang=${locale}`));
    const firstForm = worker.locator('form[data-correction-draft-form]');
    await expect(firstForm).toBeVisible();
    const attemptedSummary = 'Second tab conflict attempted work account';
    const attemptedReason = 'The first view has more accurate site detail.';
    await firstForm.locator('[name="activitySummary"]').fill(attemptedSummary);
    await firstForm.locator('[name="durationHours"]').fill('3.25');
    await firstForm.locator('[name="site"]').fill('QA site B');
    await firstForm.locator('[name="reason"]').fill(attemptedReason);
    const secondTab = await context.newPage();
    const secondErrors = diagnostics(secondTab);
    await secondTab.goto(portal(`/time/${timeId}?lang=en`));
    const secondForm = secondTab.locator('form[data-correction-draft-form]');
    await expect(secondForm).toBeVisible();
    await secondForm
      .locator('[name="activitySummary"]')
      .fill('First saved correction in second tab');
    await secondForm
      .locator('[name="reason"]')
      .fill('Saving the first correction from the other tab.');
    const secondResponse = secondTab.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createCorrectionDraft'),
    );
    await secondForm.getByRole('button', { name: 'Create corrected draft' }).click();
    expect((await secondResponse).status()).toBe(303);
    await expect(secondTab.locator('.record-detail-header .state-tag')).toContainText('Draft');
    expect(correctionCount(databasePath, timeId)).toBe(1);

    await firstForm.locator('button[type="submit"]').scrollIntoViewIfNeeded();
    const beforeScroll = await worker.evaluate(() => Math.round(scrollY));
    const conflictResponse = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('createCorrectionDraft'),
    );
    await firstForm.getByRole('button', { name: 'Create corrected draft' }).click();
    expect((await conflictResponse).status()).toBe(409);
    const notice = worker.locator(
      '[data-time-detail-problem] [data-problem-code="TIME_CORRECTION_ALREADY_EXISTS"]',
    );
    await expect(notice).toBeVisible();
    await expect(notice).not.toContainText(/Check submitted values|problem\.time\./i);
    const remedy = notice.locator('a[href*="/time/"]').first();
    await expect(remedy).toBeVisible();
    await expect(worker.locator('form[data-correction-draft-form]')).toHaveCount(0);
    const recap = worker.locator('section[aria-labelledby="time-correction-retained-title"]');
    await expect(recap).toContainText(attemptedSummary);
    await expect(recap).toContainText(attemptedReason);
    await expect(recap).toContainText('195');
    await worker.waitForTimeout(250);
    const state = await notice.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const headerBottom =
        document.querySelector('.portal-layout > header')?.getBoundingClientRect().bottom ?? 0;
      return {
        url: (location.pathname + location.search).replace(/\/[0-9a-f-]{36}/giu, '/:record'),
        documentLang: document.documentElement.lang,
        focused: document.activeElement === element,
        visible: bounds.top >= headerBottom + 8 && bounds.bottom <= innerHeight,
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        scrollY: Math.round(scrollY),
        overflow: document.documentElement.scrollWidth > innerWidth,
        text: element.textContent?.replace(/\s+/gu, ' ').trim(),
      };
    });
    expect(state.focused).toBe(true);
    expect(state.visible).toBe(true);
    expect(state.overflow).toBe(false);
    expect(correctionCount(databasePath, timeId)).toBe(1);
    await notice.screenshot({
      path: join(evidenceRoot, `${info.project.name}-${locale}-duplicate-notice.png`),
    });
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    writeFileSync(
      join(evidenceRoot, `${info.project.name}-${locale}-results.json`),
      JSON.stringify(
        {
          commit,
          role: 'worker',
          ownerApproval: 'UI approved',
          viewport: width,
          locale,
          firstCorrection: { submission: 303, state: 'draft' },
          staleCorrection: {
            submission: 409,
            code: 'TIME_CORRECTION_ALREADY_EXISTS',
            notice: state,
            expectedLocale: locale,
            languagePreserved: state.documentLang.split('-')[0] === locale,
            remedy: 'review_time',
            retained: {
              summary: attemptedSummary,
              reason: attemptedReason,
              minutes: 195,
              site: 'QA site B',
            },
            formRemoved: true,
            beforeScroll,
            correctionRows: correctionCount(databasePath, timeId),
          },
          diagnostics: { worker: workerErrors, secondTab: secondErrors, owner: ownerErrors },
        },
        null,
        2,
      ) + '\n',
    );
    expect(workerErrors).toEqual([]);
    expect(secondErrors).toEqual([]);
    expect(ownerErrors).toEqual([]);
  } finally {
    await context.close().catch(() => {});
    await ownerContext.close().catch(() => {});
  }
});
