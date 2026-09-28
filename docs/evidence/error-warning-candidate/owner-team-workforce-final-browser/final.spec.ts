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
const candidateCommit = 'f17cd4fdf28f862185f9359958c6d6e735d51ff1';

function writeResult(name: string, value: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      value,
      (_key, item) =>
        typeof item === 'string'
          ? item.replace(
              /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
              ':record',
            )
          : item,
      2,
    ) + '\n',
  );
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

function diagnostics(page: Page) {
  const value = { pageErrors: [] as string[], consoleErrors: [] as string[], http: [] as string[] };
  page.on('pageerror', (error) => value.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      value.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      value.http.push(
        `${response.status()} ${new URL(response.url()).pathname.replace(/\/[0-9a-f-]{36}/giu, '/:record')}`,
      );
  });
  return value;
}

function counts(db: DatabaseSync, userId: string) {
  return {
    profiles: (
      db
        .prepare('SELECT COUNT(*) count FROM supplier_user_profile WHERE user_id=?')
        .get(userId) as {
        count: number;
      }
    ).count,
    audits: (
      db.prepare('SELECT COUNT(*) count FROM audit_event WHERE entity_id=?').get(userId) as {
        count: number;
      }
    ).count,
  };
}

async function visibleState(page: Page, userId: string) {
  return page.evaluate((id) => {
    const card = document.querySelector<HTMLElement>(`[data-worker-id="${id}"]`);
    const editor = card?.querySelector<HTMLElement>('.team-directory__editor');
    const form = card?.querySelector<HTMLFormElement>('form[action*="/setWorkforceProfile"]');
    const notice = document.querySelector<HTMLElement>(
      '[data-team-directory] > [data-ui="problem-notice"]',
    );
    const toast = document.querySelector<HTMLElement>('[data-ui="toast-region"]');
    const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const supplier = form?.querySelector<HTMLSelectElement>('[name="supplierId"]');
    const cue = form?.querySelector<HTMLElement>('.team-directory__form-help');
    const fieldError = form?.querySelector<HTMLElement>('[data-field-error-for]');
    const focused = document.activeElement;
    const bounds = notice?.getBoundingClientRect();
    const focusBounds = focused?.getBoundingClientRect();
    return {
      url: location.pathname + location.search,
      editorOpen: Boolean(editor),
      formPresent: Boolean(form),
      profileValue: form?.querySelector<HTMLSelectElement>('[name="profile"]')?.value ?? null,
      supplierValue: form?.querySelector<HTMLSelectElement>('[name="supplierId"]')?.value ?? null,
      supplierRequired: supplier?.required ?? null,
      supplierValidity: supplier?.validationMessage ?? null,
      supplierCue: cue?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      fieldError: fieldError?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeCode: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeVisible: Boolean(bounds && bounds.bottom > 0 && bounds.top < innerHeight),
      noticeRemedies: [...(notice?.querySelectorAll('a') ?? [])].map((link) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute('href')?.replace(/\/[0-9a-f-]{36}/giu, '/:record'),
      })),
      toastText: toast?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      focusedTag: focused?.tagName.toLowerCase() ?? null,
      focusedName: focused?.getAttribute('name') ?? null,
      focusedNotice: focused === notice,
      focusedSummary: focused?.hasAttribute('data-validation-summary') ?? false,
      focusTop: focusBounds ? Math.round(focusBounds.top) : null,
      focusBottom: focusBounds ? Math.round(focusBounds.bottom) : null,
      selectedTab: tab?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      scrollY: Math.round(scrollY),
      viewportHeight: innerHeight,
      language: document.documentElement.lang,
    };
  }, userId);
}

for (const scenario of [
  { project: 'phone-390', locale: 'en' },
  { project: 'desktop', locale: 'es' },
] as const) {
  test(`Owner Team missing supplier final ${scenario.project}`, async ({ page }, info) => {
    test.skip(info.project.name !== scenario.project);
    test.setTimeout(180_000);
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    const problems = diagnostics(page);
    try {
      const userId = (
        db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
          id: string;
        }
      ).id;
      await signIn(page, 'owner');
      await page.goto(portal(`/projects?view=team&worker=${userId}&lang=${scenario.locale}`));
      const card = page.locator(`[data-worker-id="${userId}"]`);
      await expect(card).toBeVisible();
      const form = card.locator('form[action*="/setWorkforceProfile"]');
      await expect(form).toBeVisible();
      await form.locator('[name="profile"]').selectOption('external_technician');
      await form.locator('[name="supplierId"]').selectOption('');
      await expect(form.locator('[name="supplierId"]')).toHaveAttribute('required', '');
      await expect(form.locator('.team-directory__form-help')).toBeVisible();
      await form
        .getByRole('button', { name: scenario.locale === 'es' ? 'Guardar perfil' : 'Save profile' })
        .click();
      await expect(form.locator('[name="supplierId"]')).toBeFocused();
      const clientValidation = await visibleState(page, userId);
      expect(clientValidation.supplierValidity).toBeTruthy();
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const before = await visibleState(page, userId);
      const dbBefore = counts(db, userId);
      const enhanced = await page.evaluate(async () => {
        const form = document.querySelector<HTMLFormElement>(
          'form[action*="/setWorkforceProfile"]',
        );
        if (!form) throw new Error('Workforce profile form missing');
        const body = new FormData(form);
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body,
        });
        return { transportStatus: response.status, body: await response.json() };
      });
      const enhancedData = await decodeActionData(enhanced.body.data);
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('/setWorkforceProfile'),
      );
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        form.evaluate((element: HTMLFormElement) => element.submit()),
      ]);
      const nativeResponse = await pending;
      await page.waitForLoadState('networkidle');
      const nativeBody = await nativeResponse.text();
      const after = await visibleState(page, userId);
      const dbAfter = counts(db, userId);
      const result = {
        candidateCommit,
        role: 'owner',
        viewport: scenario.project,
        locale: scenario.locale,
        fixture: 'preseeded disposable Worker account; no profile mutation permitted by this case',
        clientValidation,
        before,
        enhanced: {
          transportStatus: enhanced.transportStatus,
          actionStatus: enhanced.body.status,
          type: enhanced.body.type,
          code: enhancedData.code,
          messageKey: enhancedData.messageKey,
          fieldErrors: enhancedData.fieldErrors,
          remedies: enhancedData.remedies,
          values: enhancedData.values,
        },
        native: {
          transportStatus: nativeResponse.status(),
          code: nativeBody.match(/(?:ACCESS|ACTION)_[A-Z_]+/u)?.[0] ?? null,
          genericText: nativeBody.includes('Check the submitted values'),
          after,
        },
        noWrite: { before: dbBefore, after: dbAfter },
        diagnostics: problems,
      };
      writeResult(`results-${scenario.project}.json`, result);
      const toast = page.locator('[data-ui="toast-region"]');
      if (await toast.isVisible())
        await toast.screenshot({
          path: join(evidenceRoot, `${scenario.project}-${scenario.locale}-toast.png`),
        });
      const notice = page.locator('[data-team-directory] > [data-ui="problem-notice"]');
      if (await notice.isVisible())
        await notice.screenshot({
          path: join(evidenceRoot, `${scenario.project}-${scenario.locale}-notice.png`),
        });
      expect(enhanced.body.type).toBe('failure');
      expect(enhanced.body.status).toBe(400);
      expect(enhancedData.code).toBe('ACCESS_WORKFORCE_SUPPLIER_REQUIRED');
      expect(enhancedData.fieldErrors).toMatchObject({
        supplierId: ['problem.access.workforceSupplierRequired'],
      });
      expect(enhancedData.remedies).toContainEqual({
        id: 'review_supplier_profile',
        recordId: userId,
      });
      expect(nativeResponse.status()).toBe(400);
      expect(after.noticeCode).toBe('ACCESS_WORKFORCE_SUPPLIER_REQUIRED');
      expect(after.editorOpen).toBe(true);
      expect(after.profileValue).toBe('external_technician');
      expect(after.supplierValue).toBe('');
      expect(after.focusedSummary).toBe(true);
      expect(after.fieldError).toBeTruthy();
      expect(after.focusTop).toBeGreaterThan(0);
      expect(after.focusBottom).toBeLessThan(after.viewportHeight);
      expect(after.url).toContain(`worker=${userId}`);
      expect(after.selectedTab).toContain(
        scenario.locale === 'es' ? 'Especialistas' : 'Specialists',
      );
      expect(dbAfter).toEqual(dbBefore);
      expect(problems.pageErrors).toEqual([]);
      expect(problems.consoleErrors).toEqual([]);
    } finally {
      db.close();
    }
  });
}

test('Owner Team absent person status final', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(120_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const problems = diagnostics(page);
  try {
    const workerId = (
      db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
        id: string;
      }
    ).id;
    let absentId = randomUUID();
    while (db.prepare('SELECT 1 FROM user WHERE id=?').get(absentId)) absentId = randomUUID();
    await signIn(page, 'owner');
    await page.goto(portal(`/projects?view=team&worker=${workerId}&lang=es`));
    const form = page.locator(`[data-worker-id="${workerId}"] form[action*="/updateUserStatus"]`);
    await expect(form).toBeVisible();
    const before = {
      worker: db.prepare('SELECT status,version FROM user WHERE id=?').get(workerId),
      audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number })
        .count,
    };
    const posted = await page.evaluate(async (missingId) => {
      const form = document.querySelector<HTMLFormElement>('form[action*="/updateUserStatus"]');
      if (!form) throw new Error('Status form missing');
      const body = new FormData(form);
      body.set('userId', missingId);
      body.set('status', 'offboarded');
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body,
      });
      return { transportStatus: response.status, body: await response.json() };
    }, absentId);
    const decoded = await decodeActionData(posted.body.data);
    await form.locator('input[name="userId"]').evaluate((input: HTMLInputElement, missingId) => {
      input.value = missingId;
    }, absentId);
    const pending = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/updateUserStatus'),
    );
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      form.evaluate((element: HTMLFormElement) => element.submit()),
    ]);
    const nativeResponse = await pending;
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('[data-problem-code="ACCESS_STATUS_PERSON_UNAVAILABLE"]'),
    ).toBeVisible();
    const visible = await visibleState(page, workerId);
    const after = {
      worker: db.prepare('SELECT status,version FROM user WHERE id=?').get(workerId),
      absent: db.prepare('SELECT id FROM user WHERE id=?').get(absentId) ?? null,
      audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number })
        .count,
    };
    writeResult('results-absent-person.json', {
      candidateCommit,
      role: 'owner',
      locale: 'es',
      viewport: 'desktop',
      fixture:
        'syntactically valid absent UUID posted from rendered status form through browser DevTools-style fetch',
      response: {
        transportStatus: posted.transportStatus,
        actionStatus: posted.body.status,
        type: posted.body.type,
        code: decoded.code,
        messageKey: decoded.messageKey,
        remedies: decoded.remedies,
        fieldErrors: decoded.fieldErrors,
      },
      native: {
        transportStatus: nativeResponse.status(),
        visible,
      },
      noWrite: { before, after },
      diagnostics: problems,
    });
    const notice = page.locator('[data-problem-code="ACCESS_STATUS_PERSON_UNAVAILABLE"]');
    await notice.screenshot({ path: join(evidenceRoot, 'desktop-es-absent-person-notice.png') });
    expect(posted.body).toMatchObject({ type: 'failure', status: 409 });
    expect(decoded.code).toBe('ACCESS_STATUS_PERSON_UNAVAILABLE');
    expect(decoded.remedies).toContainEqual({ id: 'review_user_access' });
    expect(nativeResponse.status()).toBe(409);
    expect(visible.noticeCode).toBe('ACCESS_STATUS_PERSON_UNAVAILABLE');
    expect(visible.noticeVisible).toBe(true);
    expect(visible.focusedNotice).toBe(true);
    expect(
      visible.noticeRemedies.some((remedy) => remedy.href?.includes('/projects?view=team')),
    ).toBe(true);
    expect(after.worker).toEqual(before.worker);
    expect(after.audits).toBe(before.audits);
    expect(after.absent).toBeNull();
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});

test('Manager cannot assign supplier workforce profile', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(120_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const problems = diagnostics(page);
  try {
    const workerId = (
      db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
        id: string;
      }
    ).id;
    const before = counts(db, workerId);
    await signIn(page, 'manager');
    await page.goto(portal('/projects?view=team&lang=es'));
    const denied = await page.evaluate(
      async ({ action, workerId }) => {
        const body = new FormData();
        body.set('workerId', workerId);
        body.set('profile', 'external_technician');
        body.set('supplierId', '');
        const response = await fetch(action, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body,
        });
        return { transportStatus: response.status, body: await response.json() };
      },
      { action: portal('/projects?view=team&/setWorkforceProfile'), workerId },
    );
    const decoded = await decodeActionData(denied.body.data);
    const pending = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/setWorkforceProfile'),
    );
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.evaluate(
        ({ action, workerId }) => {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = action;
          for (const [name, value] of Object.entries({
            workerId,
            profile: 'external_technician',
            supplierId: '',
          })) {
            const input = document.createElement('input');
            input.name = name;
            input.value = value;
            form.append(input);
          }
          document.body.append(form);
          form.submit();
        },
        { action: portal('/projects?view=team&/setWorkforceProfile'), workerId },
      ),
    ]);
    const nativeResponse = await pending;
    await page.waitForLoadState('networkidle');
    const managerUi = await page.evaluate(() => ({
      noticeCount: document.querySelectorAll('[data-problem-code="ACCESS_TEAM_OWNER_REQUIRED"]')
        .length,
      toastText:
        document
          .querySelector<HTMLElement>('[data-ui="toast-region"]')
          ?.textContent?.replace(/\s+/gu, ' ')
          .trim() ?? null,
      setupLinkCount: document.querySelectorAll('[data-team-directory] a[href*="worker="]').length,
      focusTag: document.activeElement?.tagName.toLowerCase() ?? null,
    }));
    const after = counts(db, workerId);
    writeResult('results-manager-denied.json', {
      candidateCommit,
      role: 'manager',
      locale: 'es',
      viewport: 'desktop',
      response: {
        transportStatus: denied.transportStatus,
        actionStatus: denied.body.status,
        type: denied.body.type,
        code: decoded.code,
        messageKey: decoded.messageKey,
        remedies: decoded.remedies,
        fieldErrors: decoded.fieldErrors,
      },
      native: { transportStatus: nativeResponse.status(), ui: managerUi },
      noWrite: { before, after },
      diagnostics: problems,
    });
    const toast = page.locator('[data-ui="toast-region"]');
    if (await toast.isVisible())
      await toast.screenshot({ path: join(evidenceRoot, 'desktop-es-manager-denied-toast.png') });
    expect(denied.body).toMatchObject({ type: 'failure', status: 403 });
    expect(decoded.code).toBe('ACCESS_TEAM_OWNER_REQUIRED');
    expect(decoded.remedies).toContainEqual({ id: 'contact_owner' });
    expect(nativeResponse.status()).toBe(403);
    expect(after).toEqual(before);
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});
