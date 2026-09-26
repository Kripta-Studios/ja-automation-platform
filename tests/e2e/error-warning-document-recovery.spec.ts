import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { e2eCredentials } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';

const origin = 'http://127.0.0.1:4184';
const portal = (path = '') => `${origin}/j-aautomation/app${path}`;
const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-document-recovery');

function sharedActiveProjectId() {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    return (
      db.sqlite
        .prepare(
          `SELECT pm.project_id FROM project_member pm
         JOIN user u ON u.id=pm.user_id
         JOIN project p ON p.id=pm.project_id
         WHERE u.email IN (?,?) AND pm.status='active'
           AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
           AND p.status='active'
         GROUP BY pm.project_id HAVING COUNT(DISTINCT u.id)=2 LIMIT 1`,
        )
        .get(e2eCredentials.manager.email, e2eCredentials.worker.email) as
        | { project_id: string }
        | undefined
    )?.project_id;
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

test('document upload recovers native missing file, saves, and denies Finance scope to manager', async ({
  page,
  browser,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(120_000);
  const locale = info.project.name === 'desktop' ? 'pt' : 'en';
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
  await signIn(page, 'owner');
  await page.goto(portal(`/documents?lang=${locale}`));
  await page.locator('.document-upload-panel details.ui-disclosure summary').click();
  const form = page.locator('form[action="?/uploadPrivateDocument"]');
  await expect(form).toBeVisible();
  const projectId = sharedActiveProjectId();
  expect(projectId).toBeTruthy();
  await form.locator('[name="projectId"]').selectOption(projectId!);
  await form.locator('[name="artifactType"]').fill('browser QA evidence');
  await form.locator('[name="description"]').fill('Retained document description');
  await form.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  let post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/uploadPrivateDocument'),
  );
  await form.evaluate((node: HTMLFormElement) => node.submit());
  expect((await post).status()).toBe(400);
  const notice = page.locator('.document-upload-panel [data-ui="problem-notice"]');
  await expect(notice).toHaveAttribute('data-problem-code', 'DOCUMENT_FILE_REQUIRED');
  const restored = page.locator('form[action="?/uploadPrivateDocument"]');
  await expect(restored.locator('[name="projectId"]')).toHaveValue(projectId!);
  await expect(restored.locator('[name="artifactType"]')).toHaveValue('browser QA evidence');
  await expect(restored.locator('[name="description"]')).toHaveValue(
    'Retained document description',
  );
  await expect(restored.locator('[data-validation-summary]')).toBeFocused();
  await expect(restored.locator('[data-field-error-for]')).toBeVisible();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
  const screenshot = await notice.screenshot();
  steps.push({
    step: 'native-file-required',
    code: 'DOCUMENT_FILE_REQUIRED',
    scrollBefore,
    scrollAfter,
  });

  const filename = `qa-document-${randomUUID()}.txt`;
  await restored.locator('[name="file"]').setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Synthetic private browser QA document ${filename}`),
  });
  post = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('?/uploadPrivateDocument'),
  );
  await restored.getByRole('button', { name: /upload|carregar|enviar/i }).click();
  expect([200, 303]).toContain((await post).status());
  await expect(
    page.getByText(
      locale === 'pt' ? 'Documento enviado.' : 'Private document uploaded and hash-registered.',
      { exact: true },
    ),
  ).toBeVisible();
  steps.push({ step: 'native-upload-success', saved: true });

  const manager = await browser.newPage({ viewport: info.project.use.viewport });
  try {
    await signIn(manager, 'manager');
    await manager.goto(portal(`/documents?lang=${locale}`));
    await manager.locator('.document-upload-panel details.ui-disclosure summary').click();
    const managerProject = sharedActiveProjectId();
    await expect(
      manager.locator(
        `form[action="?/uploadPrivateDocument"] [name="projectId"] option[value="${managerProject}"]`,
      ),
    ).toHaveCount(1);
    const denied = await manager.evaluate(async (project) => {
      const body = new FormData();
      body.set('projectId', project);
      body.set('artifactType', 'browser QA finance scope');
      body.set('description', 'Synthetic denied upload');
      body.set('artifactClassification', 'finance');
      body.set('sensitivity', 'internal');
      body.set(
        'file',
        new File(['Synthetic private browser QA document.'], 'qa-denied.txt', {
          type: 'text/plain',
        }),
      );
      const response = await fetch('/j-aautomation/app/documents?/uploadPrivateDocument', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body,
      });
      return {
        transportStatus: response.status,
        result: (await response.json()) as { type?: string; status?: number; data?: unknown },
      };
    }, managerProject!);
    expect(denied.transportStatus).toBe(200);
    expect(denied.result.type).toBe('failure');
    expect(denied.result.status).toBe(403);
    expect(JSON.stringify(denied.result.data)).toContain('DOCUMENT_FINANCE_ROLE_REQUIRED');
    steps.push({ step: 'manager-finance-scope-denied', code: 'DOCUMENT_FINANCE_ROLE_REQUIRED' });
  } finally {
    await manager.close();
  }

  expect(errors).toEqual([]);
  mkdirSync(evidenceDirectory, { recursive: true });
  const prefix = `document-${info.project.name}-${locale}`;
  writeFileSync(join(evidenceDirectory, `${prefix}.png`), screenshot);
  writeFileSync(
    join(evidenceDirectory, `${prefix}-trace.json`),
    `${JSON.stringify(steps, null, 2)}\n`,
  );
  writeFileSync(
    join(evidenceDirectory, `${prefix}-network.json`),
    `${JSON.stringify(responses, null, 2)}\n`,
  );
  expect.soft(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(12);
});
