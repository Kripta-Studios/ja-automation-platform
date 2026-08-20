import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'vitest';
import { expect } from '@playwright/test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { e2eCredentials, seedE2ECredentialAccounts } from '../e2e/auth.js';

const root = process.cwd();
const fixtures: string[] = [];
const children: ChildProcess[] = [];
const browsers: Browser[] = [];
const contexts: BrowserContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  for (const browser of browsers.splice(0)) await browser.close();
  const runningChildren = children.splice(0);
  for (const child of runningChildren) {
    if (!child.pid) continue;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        child.kill();
      }
    } else child.kill('SIGTERM');
  }
  await Promise.all(
    runningChildren.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }
          child.once('close', () => resolve());
          setTimeout(resolve, 5_000);
        }),
    ),
  );
  for (const fixture of fixtures.splice(0))
    rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Portal test server did not become ready: ${lastError}`);
}

async function startPortal(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'ja-offline-isolation-'));
  fixtures.push(directory);
  const databasePath = join(directory, 'portal.sqlite');
  const documentRoot = join(directory, 'documents');
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', 'packages/database/src/demo-seed.ts'],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        JA_DATABASE_PATH: databasePath,
        JA_MIGRATIONS_PATH: join(root, 'migrations'),
        JA_DOCUMENT_ROOT: documentRoot,
        JA_FIXTURE_RESET_DOCUMENTS: 'false',
        JA_DEMO_SEED_PRESERVE_DB: 'true',
        JA_AUTH_SECRET: 'offline-isolation-test-secret',
        JA_PUBLIC_BASE_PATH: '/j-aautomation',
        JA_PORTAL_BASE_PATH: '/j-aautomation/app',
      },
      stdio: 'inherit',
    },
  );
  await seedE2ECredentialAccounts(databasePath);
  const port = await freePort();
  const child = spawn(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@ja/portal', 'dev', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ORIGIN: `http://127.0.0.1:${port}`,
        JA_DATABASE_PATH: databasePath,
        JA_MIGRATIONS_PATH: join(root, 'migrations'),
        JA_DOCUMENT_ROOT: documentRoot,
        JA_FIXTURE_RESET_DOCUMENTS: 'false',
        JA_AUTH_SECRET: 'offline-isolation-test-secret',
        JA_PUBLIC_BASE_PATH: '/j-aautomation',
        JA_PORTAL_BASE_PATH: '/j-aautomation/app',
        HOST: '127.0.0.1',
        PORT: String(port),
      },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    },
  );
  children.push(child);
  const childStartupError = new Promise<never>((_, reject) => {
    child.once('error', (error) => reject(error));
  });
  const baseUrl = `http://127.0.0.1:${port}/j-aautomation/app`;
  await Promise.race([waitForServer(`${baseUrl}/login`), childStartupError]);
  return baseUrl;
}

async function signInAt(
  page: Page,
  baseUrl: string,
  role: keyof typeof e2eCredentials,
): Promise<void> {
  const credentials = e2eCredentials[role];
  await page.goto(`${baseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.toString() === baseUrl || url.toString() === `${baseUrl}/`);
  await page.waitForLoadState('networkidle');
}

async function waitForServiceWorkerCache(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return false;
          await navigator.serviceWorker.ready;
          return Boolean(await caches.match(location.href));
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function assignmentOptionTexts(page: Page): Promise<string[]> {
  return page
    .locator('form[action="?/createTime"] select[name="projectId"] option')
    .allTextContents();
}

describe('offline authenticated-user partitioning', () => {
  it('does not expose one user’s queued draft after a session changes on the same device', async () => {
    const baseUrl = await startPortal();
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext();
    contexts.push(context);
    // Prime the Manager's own responses before the Worker cache is written. The Recovery project is
    // assigned to Manager but not Worker, so it is a positive partition marker rather than a
    // vacuous empty-list assertion.
    const managerSessionPage = await context.newPage();
    await signInAt(managerSessionPage, baseUrl, 'manager');
    const managerOnlyAssignment = 'Caustic Recovery Skid Integration · Demo';
    await managerSessionPage.goto(`${baseUrl}/time`);
    await managerSessionPage.waitForLoadState('networkidle');
    await expect(managerSessionPage.locator('form[action="?/createTime"]')).toHaveCount(1);
    const managerTimeAssignments = await assignmentOptionTexts(managerSessionPage);
    expect(
      managerTimeAssignments.some((label) => label.includes(managerOnlyAssignment)),
      'Manager fixture must positively contain its private Recovery assignment before cache isolation is tested',
    ).toBe(true);
    await waitForServiceWorkerCache(managerSessionPage);

    await managerSessionPage.goto(`${baseUrl}/reports`);
    await managerSessionPage.waitForLoadState('networkidle');
    const managerReportForm = managerSessionPage.locator('form[action="?/createDailyReport"]');
    await expect(managerReportForm).toHaveCount(1);
    await expect(
      managerReportForm.locator(`select[name="projectId"] option`).filter({
        hasText: managerOnlyAssignment,
      }),
    ).toHaveCount(1);
    await waitForServiceWorkerCache(managerSessionPage);

    // Save the Manager session after priming both of its routes. Restoring only this session cookie
    // later lets the Manager open its own cached routes offline without re-authenticating online.
    const managerCookies = await context.cookies();
    await managerSessionPage.close();
    await context.clearCookies();

    const workerPage = await context.newPage();
    await signInAt(workerPage, baseUrl, 'worker');
    await workerPage.goto(`${baseUrl}/time`);
    await workerPage.waitForLoadState('networkidle');
    await expect(workerPage.locator('.connection')).toHaveText('Online');
    await expect(workerPage.locator('.queue')).toHaveCount(0);
    await expect(workerPage.locator('.sync-message')).toHaveText('Synced');

    const workerOnlyAssignment = 'Remote Controls Support Retainer · Demo';
    const workerAssignments = await assignmentOptionTexts(workerPage);
    expect(
      workerAssignments.some((label) => label.includes(workerOnlyAssignment)),
      'Worker fixture must visibly contain its private assignment before cache isolation is tested',
    ).toBe(true);
    await waitForServiceWorkerCache(workerPage);

    await workerPage.goto(`${baseUrl}/reports`);
    await workerPage.waitForLoadState('networkidle');
    const workerPrivateReport =
      'Startup support, sensor timing investigation and customer handover notes.';
    await expect(workerPage.getByText(workerPrivateReport, { exact: true })).toBeVisible();
    await waitForServiceWorkerCache(workerPage);
    await workerPage.close();

    // The same browser storage now carries the Worker assignment cache and private SSR responses,
    // but only the Manager's authenticated cookie is restored. A correct partition must not render
    // either private Worker value from a cached /time or /reports response.
    await context.clearCookies();
    await context.addCookies(managerCookies);
    await context.setOffline(true);
    const managerOfflinePage = await context.newPage();
    const cachedTimeResponse = await managerOfflinePage.goto(`${baseUrl}/time`);
    expect
      .soft(
        cachedTimeResponse?.status(),
        'cached private time response must remain loadable offline',
      )
      .toBe(200);
    await expect.soft(managerOfflinePage.locator('.user-copy b')).toHaveText('Daniel Brooks');
    await expect
      .soft(
        managerOfflinePage.locator('form[action="?/createTime"]'),
        'Manager offline time route must retain its actionable form',
      )
      .toHaveCount(1);
    const managerAssignments = await assignmentOptionTexts(managerOfflinePage);
    expect
      .soft(
        managerAssignments.some((label) => label.includes(managerOnlyAssignment)),
        'Manager must retain its own Recovery assignment marker offline',
      )
      .toBe(true);
    expect
      .soft(
        managerAssignments.some((label) => label.includes(workerOnlyAssignment)),
        'Manager must not see the Worker-only cached assignment',
      )
      .toBe(false);

    const cachedReportsResponse = await managerOfflinePage.goto(`${baseUrl}/reports`);
    expect
      .soft(
        cachedReportsResponse?.status(),
        'cached private report response must remain loadable offline',
      )
      .toBe(200);
    await expect.soft(managerOfflinePage.locator('.user-copy b')).toHaveText('Daniel Brooks');
    const managerOfflineReportForm = managerOfflinePage.locator(
      'form[action="?/createDailyReport"]',
    );
    await expect
      .soft(managerOfflineReportForm, 'Manager offline reports route must retain its form')
      .toHaveCount(1);
    await expect
      .soft(
        managerOfflineReportForm
          .locator('select[name="projectId"] option')
          .filter({ hasText: managerOnlyAssignment }),
        'Manager offline reports form must retain its Recovery assignment marker',
      )
      .toHaveCount(1);
    expect
      .soft(
        await managerOfflinePage.getByText(workerPrivateReport, { exact: true }).count(),
        'Manager must not see the Worker-only cached report response',
      )
      .toBe(0);
    await managerOfflinePage.close();

    await context.clearCookies();
    await context.setOffline(false);
    const workerQueuePage = await context.newPage();
    await signInAt(workerQueuePage, baseUrl, 'worker');
    await workerQueuePage.goto(`${baseUrl}/time`);
    await workerQueuePage.waitForLoadState('networkidle');
    await expect(workerQueuePage.locator('.connection')).toHaveText('Online');
    await expect(workerQueuePage.locator('.queue')).toHaveCount(0);
    await expect(workerQueuePage.locator('.sync-message')).toHaveText('Synced');
    await context.setOffline(true);
    await workerQueuePage.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          let attempts = 0;
          const dispatch = () => {
            dispatchEvent(new Event('offline'));
            if (document.querySelector('.connection')?.textContent?.trim() === 'Offline') {
              resolve();
              return;
            }
            attempts += 1;
            if (attempts >= 120) {
              reject(new Error('Portal did not render its offline indicator'));
              return;
            }
            requestAnimationFrame(dispatch);
          };
          dispatch();
        }),
    );
    await expect(workerQueuePage.getByText('Offline', { exact: true })).toBeVisible();

    const form = workerQueuePage.locator('form[action="?/createTime"]');
    await form.locator('select[name="projectId"]').selectOption({ index: 1 });
    await form.locator('input[name="workDate"]').fill('2026-08-20');
    await form.locator('select[name="category"]').selectOption('regular');
    await form.locator('input[name="minutes"]').fill('30');
    await form.locator('textarea[name="summary"]').fill('Worker-only queued draft');
    await form.locator('button').click();
    await expect(workerQueuePage.locator('.connection')).toHaveText('Offline');
    await expect(workerQueuePage.locator('.queue')).toHaveText('1 queued');
    await expect(workerQueuePage.locator('.sync-message')).toHaveText(
      'Offline — saved on this device',
    );
    await workerQueuePage.close();

    await context.clearCookies();
    await context.setOffline(false);
    const financePage = await context.newPage();
    const syncAttributions: string[] = [];
    financePage.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/app/api/sync'))
        syncAttributions.push(request.postData() ?? '');
    });
    await signInAt(financePage, baseUrl, 'finance');
    await expect(financePage.locator('.connection')).toHaveText('Online');
    await expect.soft(financePage.locator('.queue')).toHaveCount(0);
    // The assertion uses only the visible Finance queue and the real sync request payload. It
    // does not assume a database name, object-store name, or any other IndexedDB implementation.
    expect
      .soft(
        syncAttributions.some((body) => body.includes('Worker-only queued draft')),
        'Finance must not submit the Worker mutation for synchronization',
      )
      .toBe(false);
  }, 120_000);
});
