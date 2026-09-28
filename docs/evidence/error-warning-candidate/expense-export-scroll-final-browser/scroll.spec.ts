import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '41dc838e3f3270fd593d6553d44c0075ec4528a1';
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

test('Finance phone export notice clears header and corrected CSV has real header', async ({ page }) => {
  test.setTimeout(150_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as Array<{status:number;contentType:string}>, downloads: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('/expenses/export')) diagnostics.responses.push({ status: response.status(), contentType: response.headers()['content-type'] ?? '' }); });
  page.on('download', (download) => diagnostics.downloads.push(download.suggestedFilename().endsWith('.csv') ? 'csv' : 'other'));
  async function snapshot() {
    return page.evaluate(() => {
      const section = document.querySelector<HTMLElement>('.expense-export-disclosure');
      const notice = section?.querySelector<HTMLElement>('.expense-custom-export-problem');
      const bounds = notice?.getBoundingClientRect();
      const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      return {
        path: location.pathname,
        queryKeys: [...new URLSearchParams(location.search).keys()],
        viewport: { width: innerWidth, height: innerHeight },
        scrollY: Math.round(scrollY),
        locale: document.documentElement.lang,
        disclosureOpen: Boolean(section?.querySelector('details[open]')),
        from: section?.querySelector<HTMLInputElement>('#expense-export-field-from')?.value ?? null,
        to: section?.querySelector<HTMLInputElement>('#expense-export-field-to')?.value ?? null,
        code: notice?.getAttribute('data-problem-code') ?? null,
        noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        noticeTop: bounds?.top ?? null,
        noticeBottom: bounds?.bottom ?? null,
        headerBottom,
        focusIsNotice: document.activeElement === notice,
        toFieldError: section?.querySelector('#expense-export-error-to')?.textContent?.trim() ?? null,
        remedyText: notice?.querySelector('a')?.textContent?.trim() ?? null,
      };
    });
  }
  try {
    await signIn(page, 'finance');
    const before = audits();
    await page.goto(portal('/expenses?lang=en'));
    const section = page.locator('.expense-export-disclosure');
    await section.locator('summary').click();
    await section.locator('#expense-export-field-from').fill('2026-09-20');
    await section.locator('#expense-export-field-to').fill('2026-09-19');
    const startingScroll = await page.evaluate(() => Math.round(scrollY));
    const csv = section.locator('a[href*="/expenses/export"][href*="format=csv"]');
    const failurePromise = page.waitForResponse((response) => response.url().includes('/expenses/export'));
    await csv.click();
    const failure = await failurePromise;
    await expect(section.locator('[data-problem-code="EXPENSE_EXPORT_DATE_ORDER_INVALID"]')).toBeVisible();
    const timeline = [] as unknown[];
    for (const [at, delay] of [[0,0],[50,50],[250,200],[500,250],[1000,500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot() });
    }
    const invalid = await snapshot();
    await page.screenshot({ path: join(evidenceRoot, 'finance-inline-fixed.png') });
    expect(failure.status()).toBe(400);
    expect(failure.headers()['content-type']).toContain('application/problem+json');
    expect(invalid.path).toBe('/j-aautomation/app/expenses');
    expect(invalid.from).toBe('2026-09-20');
    expect(invalid.to).toBe('2026-09-19');
    expect(invalid.disclosureOpen).toBe(true);
    expect(invalid.focusIsNotice).toBe(true);
    expect(invalid.noticeTop).toBeGreaterThanOrEqual(invalid.headerBottom + 8);
    expect(invalid.noticeBottom).toBeLessThanOrEqual(844);
    expect(invalid.toFieldError).toBeTruthy();
    expect(diagnostics.downloads).toEqual([]);

    await section.locator('#expense-export-field-to').fill('2026-09-21');
    const successPromise = page.waitForResponse((response) => response.url().includes('/expenses/export') && response.status() === 200);
    const downloadPromise = page.waitForEvent('download');
    await csv.click();
    const success = await successPromise;
    const download = await downloadPromise;
    const csvHeader = readFileSync(await download.path(), 'utf8').split(/\r?\n/u)[0] ?? '';
    const filename = download.suggestedFilename();
    await download.delete();
    await expect(section.locator('.expense-custom-export-problem')).toHaveCount(0);
    const corrected = await snapshot();
    const after = audits();
    writeFileSync(join(evidenceRoot, 'results.json'), redact({ candidateCommit, role: 'finance', viewport: 390, startingScroll, timeline, invalid, corrected, failure: { status: failure.status(), contentType: failure.headers()['content-type'] }, success: { status: success.status(), contentType: success.headers()['content-type'], filename, csvHeader }, audits: { before, after }, diagnostics }) + '\n');
    expect(success.headers()['content-type']).toContain('text/csv');
    expect(filename).toMatch(/\.csv$/u);
    expect(csvHeader).toContain('Date,Client,Project,Worker');
    expect(corrected.path).toBe('/j-aautomation/app/expenses');
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});
