import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { auditCount, candidateCommit, observe, portal, projectId, redact, signIn } from './browser-support.js';

const evidenceRoot = import.meta.dirname;
const endpoint = (query: string) => portal(`/api/projects/${projectId}/finance-export?${query}`);

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
    const notice = document.querySelector<HTMLElement>('[data-finance-export-problem] [data-ui="problem-notice"]');
    const box = notice?.getBoundingClientRect();
    const form = document.querySelector<HTMLFormElement>('#finance-export-period-fields');
    return {
      locale: document.documentElement.lang,
      width: innerWidth,
      height: innerHeight,
      scrollY: Math.round(scrollY),
      selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null,
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      remedy: notice?.querySelector('li')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      focusIsNotice: document.activeElement === notice,
      noticeTop: box?.top ?? null,
      noticeBottom: box?.bottom ?? null,
      startValue: form?.querySelector<HTMLInputElement>('[name="periodStart"]')?.value ?? null,
      endValue: form?.querySelector<HTMLInputElement>('[name="periodEnd"]')?.value ?? null,
      startError: form?.querySelector('#finance-export-periodStart-error')?.textContent?.trim() ?? null,
      endError: form?.querySelector('#finance-export-periodEnd-error')?.textContent?.trim() ?? null,
    };
  });
}

for (const roleCase of [
  { role: 'owner' as const, width: 390, height: 844, locale: 'en' },
  { role: 'finance' as const, width: 1440, height: 900, locale: 'es' },
]) {
  test(`${roleCase.role} ${roleCase.width} ${roleCase.locale}: typed API failures and real XLSX download`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const diagnostics = observe(page);
    await signIn(page, roleCase.role);
    const before = auditCount();
    const scenarios = [] as unknown[];
    for (const scenario of [
      { name: 'invalid', query: 'periodStart=2026-02-30&periodEnd=2026-03-01', code: 'PROJECT_FINANCE_EXPORT_PERIOD_DATE_INVALID', field: 'periodStart' },
      { name: 'reversed', query: 'periodStart=2026-09-20&periodEnd=2026-09-19', code: 'PROJECT_FINANCE_EXPORT_PERIOD_RANGE_REVERSED', field: 'periodEnd' },
      { name: 'duplicate', query: 'periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30', code: 'PROJECT_FINANCE_EXPORT_PERIOD_DATE_DUPLICATE', field: 'periodStart' },
    ]) {
      const result = await requestOnPage(page, endpoint(scenario.query));
      scenarios.push({ name: scenario.name, result });
      expect(result.status).toBe(400);
      expect(result.contentType).toBe('application/problem+json');
      expect(result.code).toBe(scenario.code);
      expect(result.fields).toContain(scenario.field);
      expect(result.remedies).toContain('review_finance_period');
      expect(result.hasCorrelationId).toBe(true);
    }
    const afterInvalid = auditCount();
    expect(afterInvalid).toBe(before);
    const binary = await requestOnPage(page, endpoint('periodStart=2026-09-01&periodEnd=2026-09-30'));
    expect(binary.status).toBe(200);
    expect(binary.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(binary.signature).toBe('504b0304');
    expect(binary.size).toBeGreaterThan(0);
    expect(binary.attachment).toBe(true);

    await page.goto(portal(`/projects/${projectId}?tab=billing&periodStart=2026-09-01&periodEnd=2026-09-30&lang=${roleCase.locale}`));
    await expect(page.locator('#finance-export-button')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#finance-export-button').click();
    const download = await downloadPromise;
    const validDownload = { name: download.suggestedFilename(), failure: await download.failure() };
    expect(validDownload.name).toMatch(/\.xlsx$/u);
    expect(validDownload.failure).toBeNull();

    // Simulate a stale client-held export URL after the page loaded. The response is
    // produced by the real candidate API, then rendered by the real button handler.
    await page.locator('#finance-export-button').evaluate((element, url) => element.setAttribute('href', url), endpoint('periodStart=2026-02-30&periodEnd=2026-03-01'));
    await page.locator('#finance-export-button').click();
    await expect(page.locator('[data-finance-export-problem] [data-problem-code="PROJECT_FINANCE_EXPORT_PERIOD_DATE_INVALID"]')).toBeVisible();
    await page.waitForTimeout(150);
    const ui = await snapshot(page);
    await page.locator('[data-finance-export-problem]').screenshot({ path: join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-invalid.png`) });
    const after = auditCount();
    writeFileSync(join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-results.json`), redact({ candidateCommit, ...roleCase, scenarios, audits: { before, afterInvalid, after }, binary, validDownload, ui, diagnostics }) + '\n');
    expect(ui.code).toBe('PROJECT_FINANCE_EXPORT_PERIOD_DATE_INVALID');
    expect(ui.focusIsNotice).toBe(true);
    expect(ui.selectedTab).toBe('project-tab-billing');
    expect(ui.remedyHref).toBe('#finance-export-period-fields');
    expect(ui.startValue).toBe('2026-09-01');
    expect(ui.endValue).toBe('2026-09-30');
    expect(after).toBeGreaterThan(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  });
}

test('Manager cannot receive finance export guidance or XLSX data', async ({ page }) => {
  test.setTimeout(90_000);
  const diagnostics = observe(page);
  await signIn(page, 'manager');
  const before = auditCount();
  const invalid = await requestOnPage(page, endpoint('periodStart=2026-02-30&periodEnd=2026-03-01'));
  const valid = await requestOnPage(page, endpoint('periodStart=2026-09-01&periodEnd=2026-09-30'));
  const after = auditCount();
  writeFileSync(join(evidenceRoot, 'manager-denied-results.json'), redact({ candidateCommit, role: 'manager', invalid, valid, audits: { before, after }, diagnostics }) + '\n');
  for (const result of [invalid, valid]) {
    expect(result.status).toBe(403);
    expect(result.contentType).toBe('application/problem+json');
    expect(result.code).toBe('PROJECT_FINANCE_EXPORT_FINANCE_ROLE_REQUIRED');
    expect(result.remedies).toContain('contact_owner');
  }
  expect(after).toBe(before);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});
