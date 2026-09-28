import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'de773448ae030f1a19bf323580460be3571356c2';
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

function observe(page: Page) {
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as Array<{status:number;contentType:string;resourceType:string}>, downloads: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text()); });
  page.on('response', (response) => {
    if (response.url().includes('/expenses/export')) diagnostics.responses.push({ status: response.status(), contentType: response.headers()['content-type'] ?? '', resourceType: response.request().resourceType() });
  });
  page.on('download', (download) => diagnostics.downloads.push(download.suggestedFilename().endsWith('.csv') ? 'csv' : 'other'));
  return diagnostics;
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const disclosure = document.querySelector<HTMLElement>('.expense-export-disclosure');
    const notice = disclosure?.querySelector<HTMLElement>('.expense-custom-export-problem');
    const bounds = notice?.getBoundingClientRect();
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const csv = disclosure?.querySelector<HTMLAnchorElement>('a[href*="/expenses/export"][href*="format=csv"]');
    const url = csv ? new URL(csv.href) : null;
    return {
      path: location.pathname,
      queryKeys: [...new URLSearchParams(location.search).keys()],
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      locale: document.documentElement.lang,
      disclosureOpen: Boolean(disclosure?.querySelector('details[open]')),
      from: disclosure?.querySelector<HTMLInputElement>('#expense-export-field-from')?.value ?? null,
      to: disclosure?.querySelector<HTMLInputElement>('#expense-export-field-to')?.value ?? null,
      csvLinkDates: { from: url?.searchParams.get('from') ?? null, to: url?.searchParams.get('to') ?? null },
      code: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeTop: bounds?.top ?? null,
      noticeBottom: bounds?.bottom ?? null,
      headerBottom,
      focusIsNotice: document.activeElement === notice,
      focusedTag: document.activeElement?.tagName.toLowerCase() ?? null,
      remedyText: notice?.querySelector('a')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      toFieldError: disclosure?.querySelector('#expense-export-error-to')?.textContent?.trim() ?? null,
      problemCount: disclosure?.querySelectorAll('.expense-custom-export-problem').length ?? 0,
    };
  });
}

async function openCustomExport(page: Page) {
  await page.goto(portal('/expenses?lang=en'));
  const section = page.locator('.expense-export-disclosure');
  await expect(section).toBeVisible();
  await section.locator('summary').click();
  await expect(section.locator('#expense-export-field-from')).toBeVisible();
  return section;
}

test('Finance phone reversed custom CSV stays in Expenses; corrected CSV downloads', async ({ page }) => {
  test.setTimeout(150_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  const diagnostics = observe(page);
  try {
    await signIn(page, 'finance');
    const before = audits();
    const section = await openCustomExport(page);
    await section.locator('#expense-export-field-from').fill('2026-09-20');
    await section.locator('#expense-export-field-to').fill('2026-09-19');
    const startingScroll = await page.evaluate(() => Math.round(scrollY));
    const csv = section.locator('a[href*="/expenses/export"][href*="format=csv"]');
    const failedResponse = page.waitForResponse((response) => response.url().includes('/expenses/export') && response.request().resourceType() === 'fetch');
    await csv.click();
    const failure = await failedResponse;
    await expect(section.locator('[data-problem-code="EXPENSE_EXPORT_DATE_ORDER_INVALID"]')).toBeVisible();
    await page.waitForTimeout(100);
    const invalid = await snapshot(page);
    await section.screenshot({ path: join(evidenceRoot, 'finance-inline-invalid.png') });
    await page.screenshot({ path: join(evidenceRoot, 'finance-inline-viewport.png') });
    expect(failure.status()).toBe(400);
    expect(failure.headers()['content-type']).toContain('application/problem+json');
    expect(invalid.path).toBe('/j-aautomation/app/expenses');
    expect(invalid.from).toBe('2026-09-20');
    expect(invalid.to).toBe('2026-09-19');
    expect(invalid.disclosureOpen).toBe(true);
    expect(invalid.focusIsNotice).toBe(true);
    expect(invalid.toFieldError).toBeTruthy();
    expect(invalid.remedyHref).toContain('#expense-export-fields');
    expect(diagnostics.downloads).toEqual([]);

    await section.locator('#expense-export-field-to').fill('2026-09-21');
    const successResponse = page.waitForResponse((response) => response.url().includes('/expenses/export') && response.status() === 200);
    const downloadPromise = page.waitForEvent('download');
    await csv.click();
    const success = await successResponse;
    const download = await downloadPromise;
    const csvHeader = readFileSync(await download.path(), 'utf8').split(/\r?\n/u)[0] ?? '';
    const filename = download.suggestedFilename();
    await download.delete();
    await expect(section.locator('.expense-custom-export-problem')).toHaveCount(0);
    const corrected = await snapshot(page);
    const after = audits();
    writeFileSync(join(evidenceRoot, 'finance-results.json'), redact({ candidateCommit, role: 'finance', viewport: 390, startingScroll, invalid, corrected, failure: { status: failure.status(), contentType: failure.headers()['content-type'] }, success: { status: success.status(), contentType: success.headers()['content-type'], filename, csvHeader }, audits: { before, after }, diagnostics }) + '\n');
    expect(success.headers()['content-type']).toContain('text/csv');
    expect(filename).toMatch(/\.csv$/u);
    expect(csvHeader.split(',').length).toBeGreaterThan(3);
    expect(corrected.path).toBe('/j-aautomation/app/expenses');
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});

test('Owner Spanish desktop sees translated inline export guidance', async ({ page }) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  const diagnostics = observe(page);
  try {
    await signIn(page, 'owner');
    const before = audits();
    await page.goto(portal('/expenses?lang=es'));
    const section = page.locator('.expense-export-disclosure');
    await section.locator('summary').click();
    await section.locator('#expense-export-field-from').fill('2026-09-20');
    await section.locator('#expense-export-field-to').fill('2026-09-19');
    const csv = section.locator('a[href*="/expenses/export"][href*="format=csv"]');
    const failurePromise = page.waitForResponse((response) => response.url().includes('/expenses/export'));
    await csv.click();
    const response = await failurePromise;
    await expect(section.locator('[data-problem-code="EXPENSE_EXPORT_DATE_ORDER_INVALID"]')).toBeVisible();
    const invalid = await snapshot(page);
    await section.screenshot({ path: join(evidenceRoot, 'owner-inline-invalid-es.png') });
    const after = audits();
    writeFileSync(join(evidenceRoot, 'owner-results.json'), redact({ candidateCommit, role: 'owner', viewport: 1440, locale: 'es', status: response.status(), contentType: response.headers()['content-type'], invalid, audits: { before, after }, diagnostics }) + '\n');
    expect(response.status()).toBe(400);
    expect(invalid.path).toBe('/j-aautomation/app/expenses');
    expect(invalid.locale).toMatch(/^es/u);
    expect(invalid.noticeText).not.toContain('problem.expenseExport.');
    expect(invalid.toFieldError).toBeTruthy();
    expect(invalid.focusIsNotice).toBe(true);
    expect(after).toBe(before);
    expect(diagnostics.downloads).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});

test('Worker export scope denial is typed and reveals no other records', async ({ page }) => {
  test.setTimeout(90_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const diagnostics = observe(page);
  try {
    const other = database.prepare("SELECT id FROM user WHERE email='rafael@demo.jaautomation.test'").get() as {id:string};
    await signIn(page, 'worker');
    await page.goto(portal('/expenses?lang=en'));
    const before = (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
    const result = await page.evaluate(async (otherWorkerId) => {
      const url = new URL('/j-aautomation/app/expenses/export', location.origin);
      url.searchParams.set('from', '2026-09-01');
      url.searchParams.set('to', '2026-09-30');
      url.searchParams.set('format', 'csv');
      url.searchParams.set('worker', otherWorkerId);
      const response = await fetch(url, { credentials: 'same-origin' });
      const payload = await response.json();
      return { status: response.status, contentType: response.headers.get('content-type'), code: payload.code, messageKey: payload.messageKey, fieldErrors: payload.fieldErrors, remedies: payload.remedies };
    }, other.id);
    const ui = await snapshot(page);
    const after = (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
    writeFileSync(join(evidenceRoot, 'worker-results.json'), redact({ candidateCommit, role: 'worker', viewport: 390, result, ui, audits: { before, after }, diagnostics }) + '\n');
    expect(result.status).toBe(403);
    expect(result.contentType).toContain('application/problem+json');
    expect(result.code).toBe('EXPENSE_EXPORT_WORKER_SCOPE_DENIED');
    expect(result.fieldErrors).toHaveProperty('worker');
    expect(result.remedies).toContainEqual({ id: 'review_own_expenses' });
    expect(ui.path).toBe('/j-aautomation/app/expenses');
    expect(after).toBe(before);
    expect(diagnostics.downloads).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});

test('Navigating away cancels a delayed Expense export without stale notice or download', async ({ page }) => {
  test.setTimeout(100_000);
  const diagnostics = observe(page);
  await signIn(page, 'finance');
  const section = await openCustomExport(page);
  await section.locator('#expense-export-field-from').fill('2026-09-01');
  await section.locator('#expense-export-field-to').fill('2026-09-30');
  let intercepted = 0;
  await page.route('**/expenses/export?*', async (route) => {
    intercepted += 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      await route.fulfill({ status: 400, contentType: 'application/problem+json', body: JSON.stringify({ code: 'EXPENSE_EXPORT_DATE_ORDER_INVALID', messageKey: 'problem.expenseExport.dateOrderInvalid', params: {}, fieldErrors: { to: ['problem.expenseExport.dateOrderInvalid'] }, remedies: [{ id: 'review_expense_filters' }], correlationId: 'disposable-browser' }) });
    } catch { /* Navigation may abort the delayed request. */ }
  });
  await section.locator('a[href*="/expenses/export"][href*="format=csv"]').click();
  await page.goto(portal('/profile'));
  await page.waitForTimeout(900);
  const result = { candidateCommit, role: 'finance', viewport: 390, intercepted, pathname: new URL(page.url()).pathname, noticeCount: await page.locator('.expense-custom-export-problem').count(), diagnostics };
  writeFileSync(join(evidenceRoot, 'cancel-results.json'), redact(result) + '\n');
  expect(intercepted).toBe(1);
  expect(result.pathname).toBe('/j-aautomation/app/profile');
  expect(result.noticeCount).toBe(0);
  expect(diagnostics.downloads).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});
