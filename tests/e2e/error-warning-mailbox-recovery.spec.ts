import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-mailbox-recovery');

function externalCommandCount(key: string) {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return (
      db.sqlite
        .prepare('SELECT COUNT(*) AS count FROM mailbox_external_command WHERE idempotency_key=?')
        .get(key) as { count: number }
    ).count;
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials.owner.email);
  await page.getByLabel('Password').fill(e2eCredentials.owner.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

test('invalid native mailbox create keeps request key and mailboxes tab after response navigation', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const errors: string[] = [];
  const responses: Array<{ status: number; path: string }> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  await signIn(page);
  await page.goto(portal(`/projects?view=team&directory=mailboxes&lang=${locale}`));
  await page.waitForLoadState('networkidle');
  const tab = page.locator('#team-tab-mailboxes');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Create email account|Criar conta de e-mail/u }).click();
  let form = page.locator('#create-mailbox-sheet-form');
  await expect(form).toBeVisible();
  await form.locator('[name="username"]').fill('bad alias!');
  await form.locator('[name="name"]').fill('Disposable mailbox recovery');
  await form.locator('[name="password"]').fill('SyntheticPassword123!');
  await form.locator('[name="quotaMb"]').selectOption('1024');
  await form.locator('[name="provisionRole"]').selectOption('worker');
  const beforeKey = await form.locator('[name="idempotencyKey"]').inputValue();
  expect(beforeKey.length).toBeGreaterThanOrEqual(16);
  expect(externalCommandCount(beforeKey)).toBe(0);
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/createMailboxAccount'),
  );
  await form.evaluate((node: HTMLFormElement) => node.submit());
  const failureResponse = await post;
  expect(failureResponse.status()).toBe(400);
  expect(await failureResponse.text()).toContain('ACCESS_MAILBOX_ALIAS_INVALID');
  form = page.locator('#create-mailbox-sheet-form');
  await expect(form).toBeVisible();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/directory=mailboxes/u);
  const notice = page.locator('[data-team-directory] > [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'ACCESS_MAILBOX_ALIAS_INVALID');
  await expect(form.locator('[name="username"]')).toHaveValue('bad alias!');
  await expect(form.locator('[name="name"]')).toHaveValue('Disposable mailbox recovery');
  await expect(form.locator('[name="quotaMb"]')).toHaveValue('1024');
  await expect(form.locator('[name="provisionRole"]')).toHaveValue('worker');
  await expect(form.locator('[name="password"]')).toHaveValue('');
  const afterKey = await form.locator('[name="idempotencyKey"]').inputValue();
  expect(afterKey).toBe(beforeKey);
  expect(externalCommandCount(beforeKey)).toBe(0);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const focus = await page.evaluate(() => ({
    id: document.activeElement?.id ?? '',
    role: document.activeElement?.getAttribute('role') ?? '',
    tag: document.activeElement?.tagName ?? '',
  }));
  expect(errors).toEqual([]);
  mkdirSync(evidenceDirectory, { recursive: true });
  const prefix = `mailbox-${info.project.name}-${locale}`;
  writeFileSync(join(evidenceDirectory, `${prefix}.png`), await notice.screenshot());
  writeFileSync(
    join(evidenceDirectory, `${prefix}-trace.json`),
    `${JSON.stringify({ code: 'ACCESS_MAILBOX_ALIAS_INVALID', requestKeySha256: createHash('sha256').update(beforeKey).digest('hex'), sameKey: afterKey === beforeKey, externalCommandRecorded: false, tab: 'mailboxes', retainedAlias: true, retainedName: true, retainedQuota: true, retainedRole: true, scrollBefore, scrollAfter, focus }, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${prefix}-network.json`),
    `${JSON.stringify(responses, null, 2)}\n`,
  );
  await expect(form.locator('[data-validation-summary]')).toBeFocused();
  expect.soft(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
});
