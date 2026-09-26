import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-notification-recovery');

function seedNotifications() {
  const databasePath = readE2EFixturePointer().databasePath;
  const db = createDatabase(databasePath);
  const ids = Array.from({ length: 12 }, () => randomUUID());
  try {
    const workerId = (
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
        id: string;
      }
    ).id;
    const insert = db.sqlite.prepare(
      'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
    );
    for (const [index, id] of ids.entries()) {
      const createdAt = new Date(Date.now() + (ids.length - index) * 1_000).toISOString();
      insert.run(id, workerId, 'missing_time', `missing-time:qa-${id}`, createdAt);
    }
    return { databasePath, ids };
  } finally {
    db.sqlite.close();
  }
}

function deleteNotification(databasePath: string, id: string) {
  const db = createDatabase(databasePath);
  try {
    db.sqlite.prepare('DELETE FROM notification WHERE id=?').run(id);
  } finally {
    db.sqlite.close();
  }
}

function readAt(databasePath: string, id: string) {
  const db = createDatabase(databasePath);
  try {
    return (
      (
        db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(id) as
          | { read_at: string | null }
          | undefined
      )?.read_at ?? null
    );
  } finally {
    db.sqlite.close();
  }
}

async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === origin && !url.pathname.endsWith('/login'));
}

test('notification inbox recovers native invalid/stale, enhanced success, and role boundary', async ({
  page,
  browser,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
  const fixture = seedNotifications();
  const steps: Array<Record<string, string | number | boolean>> = [];
  const responses: Array<{ status: number; path: string }> = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  try {
    await signIn(page, 'worker');
    const path = `/notifications?lang=${locale}&read=unread`;
    await page.goto(portal(path));
    let row = page.locator(`[data-notification-id="${fixture.ids[0]}"]`);
    await expect(row).toBeVisible();
    let form = row.locator('form[data-notification-read-form]');
    await form.locator('[name="notificationId"]').evaluate((input: HTMLInputElement) => {
      input.value = 'invalid-link';
    });
    await form.scrollIntoViewIfNeeded();
    const invalidScroll = await page.evaluate(() => window.scrollY);
    let post = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/markNotificationRead'),
    );
    await form.evaluate((node: HTMLFormElement) => node.submit());
    expect((await post).status()).toBe(400);
    let notice = page.locator('.notification-inbox [data-ui="problem-notice"]');
    await expect(notice).toHaveAttribute('data-problem-code', 'NOTIFICATION_INVALID_LINK');
    await expect(notice).toBeFocused();
    await expect(notice.getByRole('link')).toHaveAttribute(
      'href',
      /read=unread.*#notification-inbox-title/u,
    );
    await expect(page).toHaveURL(/read=unread/u);
    const invalidAfter = await page.evaluate(() => window.scrollY);
    expect.soft(Math.abs(invalidAfter - invalidScroll)).toBeLessThan(12);
    steps.push({
      step: 'native-invalid',
      code: 'NOTIFICATION_INVALID_LINK',
      scrollBefore: invalidScroll,
      scrollAfter: invalidAfter,
    });

    await page.goto(portal(path));
    row = page.locator(`[data-notification-id="${fixture.ids[1]}"]`);
    await expect(row).toBeVisible();
    form = row.locator('form[data-notification-read-form]');
    deleteNotification(fixture.databasePath, fixture.ids[1]!);
    await form.scrollIntoViewIfNeeded();
    const staleScroll = await page.evaluate(() => window.scrollY);
    post = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/markNotificationRead'),
    );
    await form.evaluate((node: HTMLFormElement) => node.submit());
    expect((await post).status()).toBe(404);
    notice = page.locator('.notification-inbox [data-ui="problem-notice"]');
    await expect(notice).toHaveAttribute('data-problem-code', 'NOTIFICATION_UNAVAILABLE');
    await expect(notice).toBeFocused();
    await expect(page.locator(`[data-notification-id="${fixture.ids[1]}"]`)).toHaveCount(0);
    const staleAfter = await page.evaluate(() => window.scrollY);
    expect.soft(Math.abs(staleAfter - staleScroll)).toBeLessThan(12);
    steps.push({
      step: 'native-stale',
      code: 'NOTIFICATION_UNAVAILABLE',
      scrollBefore: staleScroll,
      scrollAfter: staleAfter,
    });
    const screenshot = await notice.screenshot();

    await page.goto(portal(path));
    row = page.locator(`[data-notification-id="${fixture.ids[2]}"]`);
    await expect(row).toBeVisible();
    post = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/markNotificationRead'),
    );
    await row.locator('form[data-notification-read-form] button').click();
    expect((await post).status()).toBe(200);
    await expect.poll(() => readAt(fixture.databasePath, fixture.ids[2]!)).toBeTruthy();
    await expect(page.locator(`[data-notification-id="${fixture.ids[2]}"]`)).toHaveCount(0);
    await expect(page.locator('.notification-inbox .inbox-feedback')).toBeFocused();
    steps.push({ step: 'enhanced-success', saved: true });

    const owner = await browser.newPage({ viewport: info.project.use.viewport });
    try {
      await signIn(owner, 'owner');
      const denied = await owner.evaluate(async (id) => {
        const response = await fetch('/j-aautomation/app/notifications?/markNotificationRead', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
          body: new URLSearchParams({ notificationId: id }),
        });
        return {
          transportStatus: response.status,
          result: (await response.json()) as { type?: string; status?: number; data?: unknown },
        };
      }, fixture.ids[3]);
      expect(denied.transportStatus).toBe(200);
      expect(denied.result.type).toBe('failure');
      expect(denied.result.status).toBe(404);
      expect(JSON.stringify(denied.result.data)).toContain('NOTIFICATION_UNAVAILABLE');
      steps.push({ step: 'other-user-denied', code: 'NOTIFICATION_UNAVAILABLE' });
    } finally {
      await owner.close();
    }
    expect(errors).toEqual([]);
    mkdirSync(evidenceDirectory, { recursive: true });
    const prefix = `notification-${info.project.name}-${locale}`;
    writeFileSync(join(evidenceDirectory, `${prefix}.png`), screenshot);
    writeFileSync(
      join(evidenceDirectory, `${prefix}-trace.json`),
      `${JSON.stringify(steps, null, 2)}\n`,
    );
    writeFileSync(
      join(evidenceDirectory, `${prefix}-network.json`),
      `${JSON.stringify(responses, null, 2)}\n`,
    );
  } finally {
    const db = createDatabase(fixture.databasePath);
    try {
      const remove = db.sqlite.prepare('DELETE FROM notification WHERE id=?');
      for (const id of fixture.ids) remove.run(id);
    } finally {
      db.sqlite.close();
    }
  }
});
