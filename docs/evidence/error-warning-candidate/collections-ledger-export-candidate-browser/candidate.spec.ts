import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { auditCount, candidateCommit, observe, portal, redact, signIn } from '../project-finance-export-candidate-browser/browser-support.js';

const evidenceRoot = import.meta.dirname;
const endpoint = (format: string, query: string) => portal(`/api/invoice-collection-ledger/${format}?${query}`);

async function requestOnPage(page: Page, url: string) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: 'same-origin' });
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (contentType === 'application/problem+json') {
      const data = await response.json();
      return {
        status: response.status, contentType, code: data.code as string,
        messageKey: data.messageKey as string,
        fields: Object.keys(data.fieldErrors ?? {}),
        remedies: (data.remedies ?? []).map((remedy: { id: string }) => remedy.id),
        hasCorrelationId: Boolean(data.correlationId),
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status, contentType, size: bytes.byteLength,
      signature: [...bytes.slice(0, 4)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      attachment: response.headers.get('content-disposition')?.startsWith('attachment;') ?? false,
    };
  }, url);
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>('.collections-ledger__export-problem [data-ui="problem-notice"]');
    const box = notice?.getBoundingClientRect();
    const input = document.querySelector<HTMLInputElement>('#collections-ledger-field-q');
    return {
      locale: document.documentElement.lang,
      width: innerWidth,
      height: innerHeight,
      scrollY: Math.round(scrollY),
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      remedy: notice?.querySelector('li')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      focusIsNotice: document.activeElement === notice,
      noticeTop: box?.top ?? null,
      noticeBottom: box?.bottom ?? null,
      searchLength: input?.value.length ?? null,
      searchError: document.querySelector('#collections-ledger-error-q')?.textContent?.trim() ?? null,
      issueLink: document.querySelector<HTMLAnchorElement>('.collections-ledger__export-issues a[href="#collections-ledger-field-q"]')?.getAttribute('href') ?? null,
    };
  });
}

for (const roleCase of [
  { role: 'owner' as const, width: 390, height: 844, locale: 'en' },
  { role: 'finance' as const, width: 1440, height: 900, locale: 'es' },
  { role: 'finance' as const, width: 390, height: 844, locale: 'pt' },
]) {
  test(`${roleCase.role} ${roleCase.width} ${roleCase.locale}: typed ledger API failures and UI recovery`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const diagnostics = observe(page);
    await signIn(page, roleCase.role);
    const before = auditCount();
    const scenarios = [] as unknown[];
    for (const scenario of [
      { name: 'invalid', query: 'periodStart=2026-02-30&periodEnd=2026-03-01', code: 'COLLECTION_LEDGER_EXPORT_PERIOD_DATE_INVALID', field: 'periodStart' },
      { name: 'reversed', query: 'periodStart=2026-09-20&periodEnd=2026-09-19', code: 'COLLECTION_LEDGER_EXPORT_PERIOD_RANGE_REVERSED', field: 'periodEnd' },
      { name: 'duplicate', query: 'periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30', code: 'COLLECTION_LEDGER_EXPORT_FILTER_DUPLICATE', field: 'periodStart' },
    ]) {
      const result = await requestOnPage(page, endpoint('csv', scenario.query));
      scenarios.push({ name: scenario.name, result });
      expect(result.status).toBe(400);
      expect(result.contentType).toBe('application/problem+json');
      expect(result.code).toBe(scenario.code);
      expect(result.fields).toContain(scenario.field);
      expect(result.remedies).toContain('review_ledger_filters');
      expect(result.hasCorrelationId).toBe(true);
    }
    const afterInvalid = auditCount();
    expect(afterInvalid).toBe(before);
    const csv = await requestOnPage(page, endpoint('csv', 'periodStart=2026-09-01&periodEnd=2026-09-30'));
    const xlsx = await requestOnPage(page, endpoint('xlsx', 'periodStart=2026-09-01&periodEnd=2026-09-30'));
    expect(csv.status).toBe(200);
    expect(csv.contentType).toBe('text/csv');
    expect(csv.size).toBeGreaterThan(0);
    expect(csv.attachment).toBe(true);
    expect(xlsx.status).toBe(200);
    expect(xlsx.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(xlsx.signature).toBe('504b0304');
    expect(xlsx.size).toBeGreaterThan(0);
    expect(xlsx.attachment).toBe(true);

    await page.goto(portal(`/ledger?lang=${roleCase.locale}`));
    const search = page.locator('#collections-ledger-field-q');
    const exportLink = page.locator('a[href*="/app/api/invoice-collection-ledger/csv"]').first();
    await expect(exportLink).toBeVisible();
    await search.fill('DEMO');
    await expect(exportLink).toBeVisible();
    await expect(exportLink).toHaveAttribute('href', /q=DEMO/u);
    // A stale client-held URL can duplicate a filter while the valid filter
    // remains in the form. Exercise the real API and real click handler.
    const originalHref = await exportLink.getAttribute('href');
    await exportLink.evaluate((element, href) => element.setAttribute('href', `${href}&q=second`), originalHref);
    await exportLink.click();
    await expect(page.locator('.collections-ledger__export-problem [data-problem-code="COLLECTION_LEDGER_EXPORT_FILTER_DUPLICATE"]')).toBeVisible();
    await page.waitForTimeout(150);
    const ui = await snapshot(page);
    await page.locator('.collections-ledger__export-problem').screenshot({ path: join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-invalid.png`) });
    expect(ui.code).toBe('COLLECTION_LEDGER_EXPORT_FILTER_DUPLICATE');
    expect(ui.searchLength).toBe(4);
    expect(ui.issueLink).toBe('#collections-ledger-field-q');
    expect(ui.remedyHref).toBe('#collections-ledger-filters');
    expect(ui.focusIsNotice).toBe(true);
    await page.locator('.collections-ledger__export-issues a[href="#collections-ledger-field-q"]').click();
    const issueFocus = await page.evaluate(() => document.activeElement?.id ?? null);
    expect(issueFocus).toBe('collections-ledger-field-q');
    await search.fill('');
    const downloadPromise = page.waitForEvent('download');
    await exportLink.click();
    const download = await downloadPromise;
    const validDownload = { name: download.suggestedFilename(), failure: await download.failure() };
    expect(validDownload.name).toMatch(/\.csv$/u);
    expect(validDownload.failure).toBeNull();
    await expect(page.locator('.collections-ledger__export-problem')).toHaveCount(0);
    const after = auditCount();
    writeFileSync(join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-results.json`), redact({ candidateCommit, ...roleCase, scenarios, audits: { before, afterInvalid, after }, csv, xlsx, ui, issueFocus, validDownload, diagnostics }) + '\n');
    expect(after).toBeGreaterThan(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  });
}

test('Manager cannot download ledger or see filter details before role check', async ({ page }) => {
  test.setTimeout(90_000);
  const diagnostics = observe(page);
  await signIn(page, 'manager');
  const before = auditCount();
  const invalid = await requestOnPage(page, endpoint('csv', 'periodStart=2026-02-30&periodEnd=2026-03-01'));
  const valid = await requestOnPage(page, endpoint('xlsx', 'periodStart=2026-09-01&periodEnd=2026-09-30'));
  const after = auditCount();
  writeFileSync(join(evidenceRoot, 'manager-denied-results.json'), redact({ candidateCommit, role: 'manager', invalid, valid, audits: { before, after }, diagnostics }) + '\n');
  for (const result of [invalid, valid]) {
    expect(result.status).toBe(403);
    expect(result.contentType).toBe('application/problem+json');
    expect(result.code).toBe('COLLECTION_LEDGER_EXPORT_ACCESS_DENIED');
    expect(result.remedies).toContain('contact_owner');
  }
  expect(after).toBe(before);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});
