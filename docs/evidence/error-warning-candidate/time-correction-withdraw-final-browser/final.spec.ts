import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { e2eRoot, readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'cf62c90294023f3a627e7f3599d041be20e73716';
const day = new Date().toISOString().slice(0, 10);

function sanitized(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'string'
        ? item.replace(
            /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
            ':record',
          )
        : item,
    ),
  );
}

function writeResult(name: string, result: Record<string, unknown>) {
  writeFileSync(join(evidenceRoot, name), JSON.stringify(sanitized(result), null, 2) + '\n');
}

function diagnostics(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    failures: [] as string[],
  };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      result.failures.push(
        `${response.status()} ${new URL(response.url()).pathname.replace(/\/[0-9a-f-]{36}/giu, '/:record')}`,
      );
  });
  return result;
}

async function decodeActionData(data: string): Promise<Record<string, unknown>> {
  const kitRequire = createRequire(
    realpathSync(join(e2eRoot, 'apps/portal/node_modules/@sveltejs/kit/package.json')),
  );
  const { parse } = (await import(pathToFileURL(kitRequire.resolve('devalue')).href)) as {
    parse: (value: string) => Record<string, unknown>;
  };
  return parse(data);
}

async function createProject(owner: Page, db: DatabaseSync): Promise<string> {
  await signIn(owner, 'owner');
  await owner.goto(portal('/projects?lang=en'));
  await owner.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = owner.locator('form[action="?/createProject"]');
  await expect(form).toBeVisible();
  const clientId = await form
    .locator('select[name="clientId"] option:not([value=""])')
    .first()
    .getAttribute('value');
  if (!clientId) throw new Error('Disposable client unavailable');
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  const name = `Correction dependency QA ${randomUUID()}`;
  await form.locator('[name="clientId"]').selectOption(clientId);
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="costCenterCode"]').fill(`QA-CORR-${Date.now() % 100000000}`);
  await form.locator('[name="startDate"]').fill(day);
  await form.locator('[name="initialWorkersStartOn"]').fill(day);
  await form.locator(`input[name="initialWorkerId"][value="${workerId}"]`).check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect.poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name)).toBeTruthy();
  return (db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string }).id;
}

async function createAndSubmitTime(
  worker: Page,
  db: DatabaseSync,
  projectId: string,
): Promise<string> {
  await signIn(worker, 'worker');
  await worker.goto(portal(`/time?project=${projectId}&lang=en`));
  await worker.locator('[data-time-primary-cta]').click();
  const form = worker.locator('form[data-time-entry-surface]');
  await expect(form).toBeVisible();
  const summary = `Correction dependency time ${randomUUID()}`;
  await form.locator('[name="projectId"]').selectOption(projectId);
  await form.locator('[name="workDate"]').fill(day);
  await form.getByRole('textbox', { name: 'Actual hours' }).fill('2.5');
  await form.locator('[name="summary"]').fill(summary);
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary))
    .toBeTruthy();
  const id = (
    db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(summary) as { id: string }
  ).id;
  await worker.goto(portal(`/time/${id}?lang=en`));
  await worker
    .locator('form[action="?/submitTime"]')
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect
    .poll(() => db.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(id))
    .toEqual({ approval_state: 'submitted' });
  return id;
}

async function approveTime(owner: Page, db: DatabaseSync, timeId: string) {
  await owner.goto(portal('/approvals?lang=en'));
  const row = owner.locator(`[data-approval-row="${timeId}"]`);
  await expect(row).toBeVisible();
  await row
    .locator('form[action="?/approveRecord"]')
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect
    .poll(() => db.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(timeId))
    .toEqual({ approval_state: 'approved' });
}

async function createCorrection(worker: Page, db: DatabaseSync, timeId: string): Promise<string> {
  await worker.goto(portal(`/time/${timeId}?lang=en`));
  const form = worker.locator('form[data-correction-draft-form]');
  await expect(form).toBeVisible();
  await form.locator('textarea[name="activitySummary"]').fill(`Corrected activity ${randomUUID()}`);
  await form.locator('textarea[name="reason"]').fill('Correcting the activity description for QA.');
  await form.getByRole('button', { name: 'Create corrected draft' }).click();
  await expect
    .poll(() =>
      db
        .prepare(
          "SELECT correction_id FROM record_correction_link WHERE record_type='time_entry' AND original_id=?",
        )
        .get(timeId),
    )
    .toBeTruthy();
  return (
    db
      .prepare(
        "SELECT correction_id FROM record_correction_link WHERE record_type='time_entry' AND original_id=?",
      )
      .get(timeId) as { correction_id: string }
  ).correction_id;
}

async function createRelatedExpense(
  worker: Page,
  db: DatabaseSync,
  correctionId: string,
): Promise<string> {
  await worker.goto(portal(`/time/${correctionId}?lang=en`));
  await worker.getByRole('link', { name: 'Add related expense' }).click();
  const form = worker.locator('form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  await expect(form.locator('select[name="timeEntryId"]')).toHaveValue(correctionId);
  const vendor = `Correction linked parking ${randomUUID()}`;
  await form.locator('[name="category"]').selectOption('parking');
  await form.locator('[name="vendor"]').fill(vendor);
  await form.locator('[name="amount"]').fill('8.75');
  await form
    .locator('[name="description"]')
    .fill('Disposable expense linked to the correction draft.');
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect
    .poll(() => db.prepare('SELECT id FROM expense WHERE vendor=?').get(vendor))
    .toBeTruthy();
  const expense = db.prepare('SELECT id,time_entry_id FROM expense WHERE vendor=?').get(vendor) as {
    id: string;
    time_entry_id: string;
  };
  expect(expense.time_entry_id).toBe(correctionId);
  return expense.id;
}

async function view(worker: Page) {
  return worker.locator('main').evaluate((main) => {
    const notice = main.querySelector<HTMLElement>(
      '[data-problem-code="TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE"]',
    );
    const form = main.querySelector<HTMLFormElement>('form[action="?/withdrawCorrectionDraft"]');
    const section = (notice ?? form)?.closest('section');
    const reason = form?.querySelector<HTMLInputElement>('[name="reason"]');
    const bounds = notice?.getBoundingClientRect();
    return {
      code: notice?.getAttribute('data-problem-code') ?? null,
      kind: notice?.getAttribute('data-kind') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      remedies: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute('href')?.replace(/\/[0-9a-f-]{36}/giu, '/:record'),
      })),
      noticeFocused: document.activeElement === notice,
      focusTag: document.activeElement?.tagName.toLowerCase() ?? null,
      top: bounds ? Math.round(bounds.top) : null,
      bottom: bounds ? Math.round(bounds.bottom) : null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      formPresent: Boolean(form),
      reasonValue: reason?.value ?? null,
      enteredReasonText:
        section?.querySelector('p:has(> strong)')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      language: document.documentElement.lang,
    };
  });
}

for (const scenario of [
  { project: 'phone-390', locale: 'en', label: 'worker-phone-390-en' },
  { project: 'desktop', locale: 'es', label: 'worker-desktop-1440-es' },
] as const) {
  test(`Worker correction withdrawal final ${scenario.project}`, async ({
    browser,
    page,
  }, info) => {
    test.skip(info.project.name !== scenario.project);
    test.setTimeout(240_000);
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const owner = await ownerContext.newPage();
    const ownerErrors = diagnostics(owner);
    const workerErrors = diagnostics(page);
    const result: Record<string, unknown> = {
      candidateCommit,
      role: 'worker',
      viewport: scenario.project,
      locale: scenario.locale,
      fixture:
        'fresh disposable database; project, time, approval, correction and linked expense created through rendered UI in two Worker tabs',
    };
    try {
      const projectId = await createProject(owner, db);
      const timeId = await createAndSubmitTime(page, db, projectId);
      await approveTime(owner, db, timeId);
      const correctionId = await createCorrection(page, db, timeId);
      await page.goto(portal(`/time/${correctionId}?lang=${scenario.locale}`));
      const withdraw = page.locator('form[action="?/withdrawCorrectionDraft"]');
      await expect(withdraw).toBeVisible();
      const reasonControl = withdraw.locator('[name="reason"]');
      await expect(reasonControl).toHaveAttribute('maxlength', '2000');
      const currentVersion = Number(await withdraw.locator('[name="version"]').inputValue());
      const actionUrl = portal(`/time/${correctionId}?/withdrawCorrectionDraft`);
      const validationProbe = await page.evaluate(
        async ({ actionUrl, currentVersion }) => {
          const form = document.querySelector<HTMLFormElement>(
            'form[action="?/withdrawCorrectionDraft"]',
          );
          if (!form) throw new Error('Withdraw form missing');
          const submit = async (reason: string, version: number) => {
            const body = new FormData(form);
            body.set('reason', reason);
            body.set('version', String(version));
            const response = await fetch(actionUrl, {
              method: 'POST',
              headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
              body,
            });
            return { transportStatus: response.status, body: await response.json() };
          };
          return {
            overlong: await submit('x'.repeat(2001), currentVersion),
            staleVersion: await submit('The saved version has changed.', currentVersion + 1),
          };
        },
        { actionUrl, currentVersion },
      );
      const overlongData = await decodeActionData(validationProbe.overlong.body.data);
      const staleVersionData = await decodeActionData(validationProbe.staleVersion.body.data);
      expect(validationProbe.overlong.body).toMatchObject({ type: 'failure', status: 400 });
      expect(overlongData.code).toBe('TIME_CORRECTION_WITHDRAW_REASON_TOO_LONG');
      expect(overlongData.fieldErrors).toMatchObject({
        reason: ['problem.time.correctionWithdrawReasonTooLong'],
      });
      expect(overlongData.remedies).toContainEqual({ id: 'enter_reason' });
      expect(validationProbe.staleVersion.body).toMatchObject({ type: 'failure', status: 409 });
      expect(staleVersionData.code).toBe('TIME_CORRECTION_WITHDRAW_CHANGED');
      expect(staleVersionData.remedies).toContainEqual({ id: 'review_time' });
      result.validation = {
        maxlength: await reasonControl.getAttribute('maxlength'),
        overlong: {
          transportStatus: validationProbe.overlong.transportStatus,
          actionStatus: validationProbe.overlong.body.status,
          type: validationProbe.overlong.body.type,
          code: overlongData.code,
          fieldErrors: overlongData.fieldErrors,
          remedies: overlongData.remedies,
          retainedReasonLength: String(
            (overlongData.values as Record<string, unknown> | undefined)?.reason ?? '',
          ).length,
        },
        staleVersion: {
          transportStatus: validationProbe.staleVersion.transportStatus,
          actionStatus: validationProbe.staleVersion.body.status,
          type: validationProbe.staleVersion.body.type,
          code: staleVersionData.code,
          remedies: staleVersionData.remedies,
          retainedReason:
            (staleVersionData.values as Record<string, unknown> | undefined)?.reason ===
            'The saved version has changed.',
        },
      };
      const reason = 'QA withdrawal because corrected hours were entered in error.';
      await withdraw.locator('[name="reason"]').fill(reason);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const before = await page.evaluate(() => ({
        scrollY: Math.round(scrollY),
        focusTag: document.activeElement?.tagName.toLowerCase() ?? null,
      }));
      const secondTab = await page.context().newPage();
      const secondTabErrors = diagnostics(secondTab);
      const expenseId = await createRelatedExpense(secondTab, db, correctionId);
      await secondTab.goto(portal(`/time/${correctionId}?lang=${scenario.locale}`));
      const warning = await view(secondTab);
      const warningNotice = secondTab.locator(
        '[data-problem-code="TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE"]',
      );
      await expect(warningNotice).toHaveAttribute(
        'data-problem-code',
        'TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE',
      );
      await expect(warningNotice).toHaveAttribute('data-kind', 'warning');
      await expect(secondTab.locator('form[action="?/withdrawCorrectionDraft"]')).toHaveCount(0);
      await warningNotice.screenshot({ path: join(evidenceRoot, `${scenario.label}-warning.png`) });
      const warningReview = warningNotice.locator('a[href*="/expenses/"]');
      await expect(warningReview).toHaveCount(1);
      const warningHref = await warningReview.getAttribute('href');
      expect(warningHref).toContain(`/expenses/${expenseId}?lang=${scenario.locale}`);
      await warningReview.click();
      await expect(secondTab).toHaveURL(
        new RegExp(`/expenses/${expenseId}\\?lang=${scenario.locale}`),
      );
      await expect(secondTab.locator('main')).toContainText('Correction linked parking');
      await owner.goto(portal(`/time/${correctionId}?lang=${scenario.locale}`));
      const ownerWarning = await view(owner);
      const ownerReview = owner.locator(
        '[data-problem-code="TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE"] a[href*="/expenses/"]',
      );
      await expect(ownerReview).toHaveCount(1);
      await ownerReview.click();
      await expect(owner).toHaveURL(new RegExp(`/expenses/${expenseId}\\?lang=${scenario.locale}`));
      result.warning = {
        worker: warning,
        remedyHref: warningHref?.replace(expenseId, ':record') ?? null,
        owner: ownerWarning,
        ownerRemedyNavigated: true,
      };
      const enhanced = await page.evaluate(
        async ({ actionUrl, reason }) => {
          const form = document.querySelector<HTMLFormElement>(
            'form[action="?/withdrawCorrectionDraft"]',
          );
          if (!form) throw new Error('Withdraw form missing');
          const body = new FormData(form);
          body.set('reason', reason);
          const response = await fetch(actionUrl, {
            method: 'POST',
            headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
            body,
          });
          return { transportStatus: response.status, body: await response.json() };
        },
        { actionUrl, reason },
      );
      const enhancedData = await decodeActionData(enhanced.body.data);
      expect(enhancedData.code).toBe('TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE');
      expect((enhancedData.values as Record<string, unknown> | undefined)?.reason).toBe(reason);
      const statusBefore = db
        .prepare('SELECT approval_state,version FROM time_entry WHERE id=?')
        .get(correctionId);
      const auditBefore = (
        db
          .prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?')
          .get(correctionId) as { count: number }
      ).count;
      // The locale selection and a second authenticated tab can hydrate after
      // the initial fill. Verify the still-open tab's actual native control.
      await expect(withdraw).toBeVisible();
      await withdraw.locator('[name="reason"]').fill(reason);
      await expect(withdraw.locator('[name="reason"]')).toHaveValue(reason);
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('?/withdrawCorrectionDraft'),
      );
      await withdraw.locator('button[type="submit"]').click();
      const nativeResponse = await pending;
      await page.waitForLoadState('networkidle');
      const nativeBody = await nativeResponse.text();
      const after = await view(page);
      await expect(
        page.locator('[data-problem-code="TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE"]'),
      ).toBeVisible();
      const statusAfter = db
        .prepare('SELECT approval_state,version FROM time_entry WHERE id=?')
        .get(correctionId);
      const auditAfter = (
        db
          .prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?')
          .get(correctionId) as { count: number }
      ).count;
      const linkedExpense = db
        .prepare('SELECT time_entry_id FROM expense WHERE id=?')
        .get(expenseId);
      result.before = before;
      result.enhanced = {
        transportStatus: enhanced.transportStatus,
        actionStatus: enhanced.body.status,
        type: enhanced.body.type,
        code: enhancedData.code,
        messageKey: enhancedData.messageKey,
        params: enhancedData.params,
        remedies: enhancedData.remedies,
        retainedReason:
          (enhancedData.values as Record<string, unknown> | undefined)?.reason === reason,
      };
      result.native = {
        transportStatus: nativeResponse.status(),
        contentType: nativeResponse.headers()['content-type']?.split(';')[0] ?? '',
        bodyHasCode: nativeBody.includes('CORRECTION_WITHDRAW'),
        bodyHasGenericKey: nativeBody.includes('action.error.conflict'),
        after,
      };
      result.noWrite = {
        statusBefore,
        statusAfter,
        auditDelta: auditAfter - auditBefore,
        linkedExpenseStillPointsToCorrection:
          (linkedExpense as { time_entry_id: string }).time_entry_id === correctionId,
      };
      result.diagnostics = { owner: ownerErrors, worker: workerErrors, secondTab: secondTabErrors };
      writeResult(`results-${scenario.project}.json`, result);
      await page
        .locator('[data-time-detail-problem] [data-ui="problem-notice"]')
        .screenshot({ path: join(evidenceRoot, `${scenario.label}-notice.png`) });
      expect(enhanced.body).toMatchObject({ type: 'failure', status: 409 });
      expect(nativeResponse.status()).toBe(409);
      expect(after.code).toBe('TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE');
      expect(after.enteredReasonText).toContain(reason);
      expect(
        after.remedies.some((remedy) =>
          remedy.href?.includes(`/expenses/:record?lang=${scenario.locale}`),
        ),
      ).toBe(true);
      expect(after.noticeFocused).toBe(true);
      expect(after.formPresent).toBe(false);
      expect(statusAfter).toEqual(statusBefore);
      expect(auditAfter).toBe(auditBefore);
      expect((linkedExpense as { time_entry_id: string }).time_entry_id).toBe(correctionId);
      expect(ownerErrors.pageErrors).toEqual([]);
      expect(workerErrors.pageErrors).toEqual([]);
      expect(secondTabErrors.pageErrors).toEqual([]);
      await secondTab.close();
    } finally {
      await ownerContext.close();
      db.close();
    }
  });
}
