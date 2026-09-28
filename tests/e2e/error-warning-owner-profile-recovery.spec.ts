import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Response } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const evidenceDirectory = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/owner-profile-recovery',
);

type Worker = {
  id: string;
  name: string;
  email: string;
  role: string;
  updated_at: string;
};

function eligibleWorker(): Worker {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const worker = db
      .prepare(
        `SELECT u.id,u.name,u.email,u.role,u.updated_at
           FROM user u
          WHERE u.role='worker' AND u.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM mail_identity m WHERE m.user_id=u.id AND m.status='active'
            )
          ORDER BY u.id LIMIT 1`,
      )
      .get() as Worker | undefined;
    if (!worker) throw new Error('Owner profile fixture has no eligible worker');
    return worker;
  } finally {
    db.close();
  }
}

function workerSnapshot(workerId: string): Worker {
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const worker = db
      .prepare('SELECT id,name,email,role,updated_at FROM user WHERE id=?')
      .get(workerId) as Worker | undefined;
    if (!worker) throw new Error('Owner profile fixture worker disappeared');
    return worker;
  } finally {
    db.close();
  }
}

for (const viewport of ['phone-390', 'desktop']) {
  test(`Owner profile editor recovers a rejected email at ${viewport}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== viewport);
    const worker = eligibleWorker();
    const before = workerSnapshot(worker.id);
    const invalidEmail = `${'a'.repeat(250)}@example.test`;
    const enteredName = 'QA Retained Profile Name';
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        runtimeErrors.push(message.text());
    });

    await signIn(page, 'owner');
    await page.goto(portal(`/projects?view=team&worker=${encodeURIComponent(worker.id)}&lang=es`));
    const card = page.locator(`[data-worker-id="${worker.id}"]`);
    await expect(card).toBeVisible();
    const edit = card.getByRole('button', { name: 'Editar miembro del equipo' });
    if ((await edit.getAttribute('aria-expanded')) === 'false') await edit.click();
    const form = card.locator('form[action*="/updateWorkerProfile"]');
    await expect(form).toBeVisible();
    await form.locator('[name="name"]').fill(enteredName);
    await form.locator('[name="email"]').fill(invalidEmail);
    await form.locator('[name="role"]').selectOption('worker');
    expect(
      await form
        .locator('[name="email"]')
        .evaluate((element: HTMLInputElement) => element.checkValidity()),
    ).toBe(true);

    // A saved RecordBrowser filter and page can hide this row after the
    // native failure reload. The failed profile must still be revealed.
    const savedRegisterState = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find(
        (candidate) =>
          candidate.startsWith('ja-record-browser:') && candidate.includes(':TeamDirectory:'),
      );
      if (!key) return false;
      sessionStorage.setItem(
        key,
        JSON.stringify({
          search: 'qa-no-matching-worker',
          status: 'suspended',
          order: 'name',
          page: 99,
        }),
      );
      return true;
    });
    expect(savedRegisterState).toBe(true);

    const responsePromise = page.waitForResponse(
      (response: Response) =>
        response.request().method() === 'POST' && response.url().includes('/updateWorkerProfile'),
    );
    await form.locator('button[type="submit"]').click();
    const response = await responsePromise;
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain('ACCESS_WORKER_EMAIL_INVALID');

    const notice = page.locator(
      '[data-team-directory] [data-problem-code="ACCESS_WORKER_EMAIL_INVALID"]',
    );
    await expect(notice).toContainText('254 caracteres');
    await expect(notice).toContainText('Corregir el correo');
    await expect(card.getByRole('button', { name: 'Editar miembro del equipo' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const failedForm = card.locator('form[action*="/updateWorkerProfile"]');
    await expect(failedForm).toBeVisible();
    await expect(failedForm.locator('[name="name"]')).toHaveValue(enteredName);
    await expect(failedForm.locator('[name="email"]')).toHaveValue(invalidEmail);
    await expect(failedForm.locator('[name="role"]')).toHaveValue('worker');
    const summary = failedForm.locator('[data-validation-summary]');
    await expect(summary).toBeFocused();
    await expect
      .poll(() =>
        summary.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.top >= -2 && box.bottom <= window.innerHeight + 2;
        }),
      )
      .toBe(true);
    expect(workerSnapshot(worker.id)).toEqual(before);
    expect(runtimeErrors).toEqual([]);

    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(join(evidenceDirectory, `${viewport}.png`), await notice.screenshot());
    writeFileSync(
      join(evidenceDirectory, `${viewport}.json`),
      `${JSON.stringify(
        {
          viewport,
          role: 'owner',
          locale: 'es',
          responseStatus: response.status(),
          code: 'ACCESS_WORKER_EMAIL_INVALID',
          retainedNameEmailRole: true,
          editorOpen: true,
          recoveredFromSavedHiddenRegisterState: true,
          validationSummaryFocusedAndVisible: true,
          workerRecordChanged: false,
          runtimeErrors,
          screenshot: `${viewport}.png`,
        },
        null,
        2,
      )}\n`,
    );
  });
}
