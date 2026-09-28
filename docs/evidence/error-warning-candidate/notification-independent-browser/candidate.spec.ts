import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { e2eCredentials } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const origin = 'http://127.0.0.1:4187/j-aautomation/app';
const root = import.meta.dirname;
const candidate = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: join(root, '../../../../'),
  encoding: 'utf8',
}).trim();
const scenarios = {
  'worker-en-phone': { role: 'worker', locale: 'en' },
  'manager-es-desktop': { role: 'manager', locale: 'es' },
  'owner-pt-phone': { role: 'owner', locale: 'pt' },
} as const;

function userId(database: DatabaseSync, role: keyof typeof e2eCredentials): string {
  const row = database
    .prepare('SELECT id FROM user WHERE email=?')
    .get(e2eCredentials[role].email) as { id: string } | undefined;
  if (!row) throw new Error('Disposable role missing');
  return row.id;
}

function seed(database: DatabaseSync, user: string): string {
  const id = randomUUID();
  database
    .prepare('INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)')
    .run(id, user, 'missing_time', `missing-time:qa-${id}`, new Date().toISOString());
  return id;
}

function scrub(value: string): string {
  return value.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
    ':record',
  );
}

async function signIn(page: import('@playwright/test').Page, role: keyof typeof e2eCredentials) {
  await page.goto(`${origin}/login`);
  await page.getByLabel('Work email').fill(e2eCredentials[role].email);
  await page.getByLabel('Password').fill(e2eCredentials[role].password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL(
    (url) =>
      url.origin === new URL(origin).origin &&
      url.pathname.startsWith('/j-aautomation/app') &&
      !url.pathname.endsWith('/login'),
  );
}

for (const [project, scenario] of Object.entries(scenarios)) {
  test(`${project} stale detail and inbox success`, async ({ page }, info) => {
    test.skip(info.project.name !== project);
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const staleId = seed(database, userId(database, scenario.role));
    const currentId = seed(database, userId(database, scenario.role));
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const network: Array<{ status: number; path: string; method: string }> = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        network.push({
          status: response.status(),
          path: scrub(new URL(response.url()).pathname),
          method: response.request().method(),
        });
    });
    try {
      await signIn(page, scenario.role);
      await page.goto(`${origin}/notifications/${staleId}?lang=${scenario.locale}`);
      const detail = page.locator('form[action="?/markRead"]');
      await expect(detail).toBeVisible();
      database.prepare('DELETE FROM notification WHERE id=?').run(staleId);
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/markRead'),
      );
      await detail.getByRole('button').click();
      const response = await responsePromise;
      await page.waitForLoadState('networkidle');
      const staleState = await page.evaluate(() => {
        const main = document.querySelector('main');
        const heading = main?.querySelector('h1');
        const remedy = main?.querySelector<HTMLAnchorElement>('a.secondary-button');
        const rectangle = remedy?.getBoundingClientRect();
        const remedyHitTarget = rectangle
          ? document.elementFromPoint(
              rectangle.left + rectangle.width / 2,
              rectangle.top + rectangle.height / 2,
            )
          : null;
        return {
          url: location.pathname + location.search,
          documentLanguage: document.documentElement.lang,
          heading: heading?.textContent?.trim() ?? null,
          headingFocused: document.activeElement === heading,
          mainText: main?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
          links: [...(main?.querySelectorAll('a') ?? [])].map((link) => ({
            text: link.textContent?.replace(/\s+/gu, ' ').trim(),
            href: link.getAttribute('href'),
          })),
          remedyHitTest: Boolean(remedy && remedyHitTarget && remedy.contains(remedyHitTarget)),
          sourceRecordAbsent: !main?.textContent?.includes('missing-time:qa-'),
          scrollY: Math.round(scrollY),
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth,
        };
      });
      await page.locator('main').screenshot({ path: join(root, `${project}-stale.png`) });
      const remedy = page.locator('main a.secondary-button');
      await expect(remedy).toBeVisible();
      await remedy.click();
      await expect(page.locator('#notification-inbox-title')).toBeVisible();
      const remedyOpenedInbox = new URL(page.url()).pathname === '/j-aautomation/app/notifications';
      const remedyLocaleRetained = new URL(page.url()).searchParams.get('lang') === scenario.locale;
      await page.goto(`${origin}/notifications?lang=${scenario.locale}&read=unread`);
      const row = page.locator(`[data-notification-id="${currentId}"]`);
      await expect(row).toBeVisible();
      const successPromise = page.waitForResponse(
        (reply) =>
          reply.request().method() === 'POST' && reply.url().includes('/markNotificationRead'),
      );
      await row.locator('button[type="submit"]').click();
      const successResponse = await successPromise;
      await expect(row).toHaveCount(0);
      await expect(page.locator('.inbox-feedback')).toBeFocused();
      const successState = await page.evaluate(() => ({
        documentLanguage: document.documentElement.lang,
        feedback: document.querySelector('.inbox-feedback')?.textContent?.trim() ?? null,
        feedbackFocused: document.activeElement?.classList.contains('inbox-feedback') ?? false,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
      }));
      const readAt = (
        database.prepare('SELECT read_at FROM notification WHERE id=?').get(currentId) as {
          read_at: string | null;
        }
      ).read_at;
      const result = {
        candidate,
        role: scenario.role,
        locale: scenario.locale,
        viewport: info.project.use.viewport,
        stale: {
          responseStatus: response.status(),
          ...staleState,
          remedyOpenedInbox,
          remedyLocaleRetained,
        },
        inboxSuccess: {
          responseStatus: successResponse.status(),
          markedRead: Boolean(readAt),
          rowRemoved: true,
          ...successState,
        },
        network,
        pageErrors,
        consoleErrors,
      };
      writeFileSync(
        join(root, `${project}-results.json`),
        `${JSON.stringify(result, (_key, value) => (typeof value === 'string' ? scrub(value) : value), 2)}\n`,
      );
      expect(response.status()).toBe(404);
      expect(successResponse.status()).toBe(200);
      expect(readAt).toBeTruthy();
      expect(staleState.headingFocused).toBe(true);
      expect(staleState.remedyHitTest).toBe(true);
      expect(staleState.sourceRecordAbsent).toBe(true);
      expect(staleState.mainText).not.toContain(staleId);
      expect(staleState.mainText).not.toContain(e2eCredentials[scenario.role].email);
      expect(staleState.scrollWidth).toBeLessThanOrEqual(staleState.innerWidth);
      expect(staleState.links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            href: expect.stringMatching(/\/app\/notifications\?lang=/u),
          }),
        ]),
      );
      expect(staleState.mainText).toContain(
        {
          en: 'This notification is no longer available.',
          es: 'Esta notificación ya no está disponible.',
          pt: 'Esta notificação não está mais disponível.',
        }[scenario.locale],
      );
      expect(remedyOpenedInbox).toBe(true);
      expect(remedyLocaleRetained).toBe(true);
      expect(successState.scrollWidth).toBeLessThanOrEqual(successState.innerWidth);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      database.prepare('DELETE FROM notification WHERE id IN (?,?)').run(staleId, currentId);
      database.close();
    }
  });
}
