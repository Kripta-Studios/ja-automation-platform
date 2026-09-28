import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import { e2eCredentials, e2eLifecycleFixturesFor } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

export const candidateCommit = '33091be';
export const projectId = e2eLifecycleFixturesFor('phone-390').project.id;
export const portal = (path = '') => `http://127.0.0.1:4175/j-aautomation/app${path}`;
export const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{27,36}\b/giu, ':record')
    : item, 2);

export async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  const credentials = e2eCredentials[role];
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) =>
    url.origin === 'http://127.0.0.1:4175' &&
    (url.pathname === '/j-aautomation/app' || url.pathname.startsWith('/j-aautomation/app/')) &&
    !url.pathname.endsWith('/login'),
  );
  await page.waitForLoadState('networkidle');
}

export function auditCount() {
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    return (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count;
  } finally { database.close(); }
}

export function observe(page: Page) {
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/app/api/'))
      diagnostics.responses.push(`${response.status()} ${response.request().resourceType()} ${response.headers()['content-type']?.split(';')[0] ?? ''}`);
  });
  return diagnostics;
}
