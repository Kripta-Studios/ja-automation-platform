import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { auditCount, observe, portal, projectId, redact, signIn } from '../project-finance-export-candidate-browser/browser-support.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'd9c212ba93625ff9fe37802c771291a1ecfb42de';
const badExport = portal(`/api/projects/${projectId}/finance-export?periodStart=2026-02-30&periodEnd=2026-03-01`);

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>('[data-finance-export-problem] [data-ui="problem-notice"]');
    const box = notice?.getBoundingClientRect();
    const form = document.querySelector<HTMLFormElement>('#finance-export-period-fields');
    const params = new URLSearchParams(location.search);
    return {
      width: innerWidth, height: innerHeight, locale: document.documentElement.lang,
      scrollY: Math.round(scrollY),
      periodStart: params.get('periodStart'), periodEnd: params.get('periodEnd'),
      selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null,
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      remedy: notice?.querySelector('a')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      noticeTop: box?.top ?? null, noticeBottom: box?.bottom ?? null,
      headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? null,
      focusIsNotice: document.activeElement === notice,
      startValue: form?.querySelector<HTMLInputElement>('[name="periodStart"]')?.value ?? null,
      endValue: form?.querySelector<HTMLInputElement>('[name="periodEnd"]')?.value ?? null,
      startError: form?.querySelector('#finance-export-periodStart-error')?.textContent?.trim() ?? null,
    };
  });
}

for (const roleCase of [
  { role: 'owner' as const, width: 390, height: 844, locale: 'en' },
  { role: 'finance' as const, width: 1440, height: 900, locale: 'es' },
]) {
  test(`${roleCase.role} ${roleCase.width} ${roleCase.locale}: finance export notice becomes visible after failed download`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const diagnostics = observe(page);
    await signIn(page, roleCase.role);
    const before = auditCount();
    await page.goto(portal(`/projects/${projectId}?tab=billing&periodStart=2026-09-01&periodEnd=2026-09-30&lang=${roleCase.locale}`));
    const exportLink = page.locator('#finance-export-button');
    await expect(exportLink).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportLink.click();
    const download = await downloadPromise;
    const validDownload = { name: download.suggestedFilename(), failure: await download.failure() };
    expect(validDownload.name).toMatch(/\.xlsx$/u);
    expect(validDownload.failure).toBeNull();

    await exportLink.evaluate((element, url) => element.setAttribute('href', url), badExport);
    const beforeFailureScroll = await page.evaluate(() => Math.round(scrollY));
    await exportLink.click();
    await expect(page.locator('[data-finance-export-problem] [data-problem-code="PROJECT_FINANCE_EXPORT_PERIOD_DATE_INVALID"]')).toBeVisible();
    const timeline = [] as unknown[];
    for (const [at, delay] of [[0, 0], [50, 50], [250, 200], [500, 250], [1000, 500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot(page) });
    }
    const failed = await snapshot(page);
    await page.locator('[data-finance-export-problem]').screenshot({ path: join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-visible-notice.png`) });
    const after = auditCount();
    writeFileSync(join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-results.json`), redact({ candidateCommit, ...roleCase, beforeFailureScroll, timeline, failed, validDownload, audits: { before, after }, diagnostics }) + '\n');
    expect(failed.code).toBe('PROJECT_FINANCE_EXPORT_PERIOD_DATE_INVALID');
    expect(failed.focusIsNotice).toBe(true);
    expect(failed.noticeTop).toBeGreaterThanOrEqual(88);
    expect(failed.noticeBottom).toBeLessThanOrEqual(roleCase.height - 24);
    expect(failed.selectedTab).toBe('project-tab-billing');
    expect(failed.periodStart).toBe('2026-09-01');
    expect(failed.periodEnd).toBe('2026-09-30');
    expect(failed.startValue).toBe('2026-09-01');
    expect(failed.endValue).toBe('2026-09-30');
    expect(failed.startError).toBeTruthy();
    expect(failed.remedyHref).toBe('#finance-export-period-fields');
    expect(after).toBe(before + 1);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.responses.some((response) => response.startsWith('400 fetch application/problem+json'))).toBe(true);
    expect(diagnostics.responses.some((response) => response.startsWith('200 fetch application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toBe(true);
  });
}
