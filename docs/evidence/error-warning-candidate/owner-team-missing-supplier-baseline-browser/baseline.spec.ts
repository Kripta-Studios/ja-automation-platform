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
const candidateCommit = '6a08b733c270bafacf1c23fe97f1c8ba8af5221c';

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
    const focused = document.activeElement;
    const bounds = notice?.getBoundingClientRect();
    return {
      url: location.pathname + location.search,
      editorOpen: Boolean(editor),
      formPresent: Boolean(form),
      profileValue: form?.querySelector<HTMLSelectElement>('[name="profile"]')?.value ?? null,
      supplierValue: form?.querySelector<HTMLSelectElement>('[name="supplierId"]')?.value ?? null,
      noticeCode: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeVisible: Boolean(bounds && bounds.bottom > 0 && bounds.top < innerHeight),
      toastText: toast?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      focusedTag: focused?.tagName.toLowerCase() ?? null,
      focusedName: focused?.getAttribute('name') ?? null,
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
  test(`Owner Team missing supplier baseline ${scenario.project}`, async ({ page }, info) => {
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
      await form
        .getByRole('button', { name: scenario.locale === 'es' ? 'Guardar perfil' : 'Save profile' })
        .click();
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
      expect(dbAfter).toEqual(dbBefore);
      expect(problems.pageErrors).toEqual([]);
      expect(problems.consoleErrors).toEqual([]);
    } finally {
      db.close();
    }
  });
}

test('Owner Team absent person status baseline', async ({ page }, info) => {
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
      noWrite: { before, after },
      diagnostics: problems,
    });
    expect(posted.body).toMatchObject({ type: 'failure', status: 400 });
    expect(after.worker).toEqual(before.worker);
    expect(after.audits).toBe(before.audits);
    expect(after.absent).toBeNull();
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});
