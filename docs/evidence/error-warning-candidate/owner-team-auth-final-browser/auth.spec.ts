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
const candidateCommit = '70838ac14b1f5f99ce94160607c75ae1199fe09b';

function writeResult(name: string, result: unknown) {
  writeFileSync(
    join(evidenceRoot, name),
    JSON.stringify(
      result,
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
  const result = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  return result;
}

function snapshot(db: DatabaseSync) {
  return {
    profiles: (
      db.prepare('SELECT COUNT(*) count FROM supplier_user_profile').get() as { count: number }
    ).count,
    users: (db.prepare('SELECT COUNT(*) count FROM user').get() as { count: number }).count,
    audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
  };
}

async function postAction(
  page: Page,
  action: string,
  values: Record<string, string>,
  enhanced: boolean,
) {
  if (enhanced) {
    const response = await page.evaluate(
      async ({ action, values }) => {
        const body = new FormData();
        for (const [key, value] of Object.entries(values)) body.set(key, value);
        const response = await fetch(action, {
          method: 'POST',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body,
        });
        return {
          transportStatus: response.status,
          contentType: response.headers.get('content-type'),
          body: await response.text(),
        };
      },
      { action, values },
    );
    try {
      const body = JSON.parse(response.body);
      const data = typeof body.data === 'string' ? await decodeActionData(body.data) : null;
      return {
        transportStatus: response.transportStatus,
        contentType: response.contentType,
        type: body.type,
        status: body.status,
        data,
      };
    } catch {
      return {
        transportStatus: response.transportStatus,
        contentType: response.contentType,
        bodySnippet: response.body.slice(0, 180),
      };
    }
  }
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(action.split('/').at(-1) ?? ''),
  );
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(
      ({ action, values }) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = action;
        for (const [key, value] of Object.entries(values)) {
          const input = document.createElement('input');
          input.name = key;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        form.submit();
      },
      { action, values },
    ),
  ]);
  const response = await pending;
  await page.waitForLoadState('networkidle');
  let responseCode: string | null = null;
  if (response.status() < 300 || response.status() >= 400) {
    responseCode = (await response.text()).match(/ACCESS_[A-Z_]+/u)?.[0] ?? null;
  }
  return {
    transportStatus: response.status(),
    url: new URL(page.url()).pathname,
    redirectLocation: response.headers()['location'] ?? null,
    responseCode,
  };
}

test('Manager denied Team change has focused visible contact-owner notice', async ({
  page,
}, info) => {
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
    await signIn(page, 'manager');
    await page.goto(portal('/projects?view=team&lang=es'));
    const before = snapshot(db);
    const action = portal('/projects?view=team&lang=es&/setWorkforceProfile');
    const values = { workerId, profile: 'external_technician', supplierId: '' };
    const enhanced = await postAction(page, action, values, true);
    const native = await postAction(page, action, values, false);
    const notice = page.locator('[data-problem-code="ACCESS_TEAM_OWNER_REQUIRED"]');
    const ui = await page.evaluate(() => {
      const notice = document.querySelector<HTMLElement>(
        '[data-problem-code="ACCESS_TEAM_OWNER_REQUIRED"]',
      );
      const bounds = notice?.getBoundingClientRect();
      return {
        noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        visible: Boolean(bounds && bounds.top >= 0 && bounds.bottom <= innerHeight),
        focused: document.activeElement === notice,
        remedyHref: notice?.querySelector<HTMLAnchorElement>('a')?.getAttribute('href') ?? null,
        scrollY: Math.round(scrollY),
        url: location.pathname + location.search,
      };
    });
    const after = snapshot(db);
    writeResult('manager-denied.json', {
      candidateCommit,
      role: 'manager',
      locale: 'es',
      viewport: 1440,
      enhanced,
      native,
      ui,
      noWrite: { before, after },
      diagnostics: problems,
    });
    if (await notice.isVisible())
      await notice.screenshot({ path: join(evidenceRoot, 'manager-denied-notice.png') });
    expect(enhanced).toMatchObject({
      type: 'failure',
      status: 403,
      data: { code: 'ACCESS_TEAM_OWNER_REQUIRED', remedies: [{ id: 'contact_owner' }] },
    });
    expect(native.transportStatus).toBe(403);
    expect(ui.noticeText).toContain('Propietario');
    expect(ui.visible).toBe(true);
    expect(ui.focused).toBe(true);
    expect(after).toEqual(before);
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});

test('Signed-out Team actions prioritize session failure over invalid fields', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-390');
  test.setTimeout(120_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const problems = diagnostics(page);
  try {
    await page.goto(portal('/login?lang=en'));
    const before = snapshot(db);
    const absentId = randomUUID();
    const statusAction = portal('/projects?view=team&lang=en&/updateUserStatus');
    const createAction = portal('/projects?view=team&lang=en&/createLocalPortalUser');
    const status = await postAction(
      page,
      statusAction,
      { userId: absentId, status: 'offboarded' },
      true,
    );
    const create = await postAction(
      page,
      createAction,
      { name: '', email: 'invalid', password: '' },
      true,
    );
    const native = await postAction(
      page,
      statusAction,
      { userId: absentId, status: 'offboarded' },
      false,
    );
    const ui = await page.evaluate(() => ({
      path: location.pathname,
      title: document.title,
      signInVisible: Boolean(document.querySelector('input[type="password"]')),
      bodyText: document.body.textContent?.replace(/\s+/gu, ' ').slice(0, 250) ?? null,
    }));
    const after = snapshot(db);
    writeResult('signed-out.json', {
      candidateCommit,
      role: 'signed-out',
      locale: 'en',
      viewport: 390,
      status,
      create,
      native,
      ui,
      noWrite: { before, after },
      diagnostics: problems,
    });
    expect(status).toMatchObject({
      type: 'failure',
      status: 401,
      data: { code: 'ACCESS_TEAM_SESSION_REQUIRED', remedies: [{ id: 'sign_in_again' }] },
    });
    expect(create).toMatchObject({
      type: 'failure',
      status: 401,
      data: { code: 'ACCESS_TEAM_SESSION_REQUIRED', remedies: [{ id: 'sign_in_again' }] },
    });
    expect(after).toEqual(before);
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});

test('Owner Spanish native Supplier failure retains explicit locale and open editor', async ({
  page,
}, info) => {
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
    await signIn(page, 'owner');
    await page.goto(portal(`/projects?view=team&worker=${workerId}&lang=es`));
    const form = page.locator(
      `[data-worker-id="${workerId}"] form[action*="/setWorkforceProfile"]`,
    );
    await expect(form).toBeVisible();
    await form.locator('[name="profile"]').selectOption('external_technician');
    await form.locator('[name="supplierId"]').selectOption('');
    const before = snapshot(db);
    const pending = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/setWorkforceProfile'),
    );
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      form.evaluate((element: HTMLFormElement) => element.submit()),
    ]);
    const response = await pending;
    await page.waitForLoadState('networkidle');
    const ui = await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('form[action*="/setWorkforceProfile"]');
      const summary = form?.querySelector<HTMLElement>('[data-validation-summary]');
      return {
        url: location.pathname + location.search,
        locale: document.documentElement.lang,
        formPresent: Boolean(form),
        profile: form?.querySelector<HTMLSelectElement>('[name="profile"]')?.value ?? null,
        supplier: form?.querySelector<HTMLSelectElement>('[name="supplierId"]')?.value ?? null,
        summaryText: summary?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        focusedSummary: document.activeElement === summary,
      };
    });
    const after = snapshot(db);
    writeResult('owner-es-native.json', {
      candidateCommit,
      role: 'owner',
      locale: 'es',
      viewport: 1440,
      transportStatus: response.status(),
      ui,
      noWrite: { before, after },
      diagnostics: problems,
    });
    expect(response.status()).toBe(400);
    expect(ui.url).toContain('lang=es');
    expect(ui.url).toContain(`worker=${workerId}`);
    expect(ui.formPresent).toBe(true);
    expect(ui.profile).toBe('external_technician');
    expect(ui.supplier).toBe('');
    expect(ui.focusedSummary).toBe(true);
    expect(after).toEqual(before);
    expect(problems.pageErrors).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});
