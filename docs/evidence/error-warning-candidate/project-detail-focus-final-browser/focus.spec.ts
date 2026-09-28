import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '8676c831fa0347c16d2873324bf2bbc3e7c9a56c';
const projectId = e2eLifecycleFixturesFor('phone-390').project.id;
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

test('Owner enhanced period correction retains state and exposes notice below header', async ({ page }) => {
  test.setTimeout(120_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('/app/projects/')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()}`); });
  async function snapshot() {
    return page.evaluate(() => {
      const problem = document.querySelector<HTMLElement>('[data-project-period-problem]');
      const notice = problem?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
      const form = problem?.querySelector<HTMLFormElement>('[data-project-period-form]');
      const bounds = notice?.getBoundingClientRect();
      const bannerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      return {
        query: Object.fromEntries(['periodStart','periodEnd','tab','lang'].map((key) => [key, new URLSearchParams(location.search).get(key)])),
        viewport: { width: innerWidth, height: innerHeight },
        scrollY: Math.round(scrollY),
        code: notice?.getAttribute('data-problem-code') ?? null,
        noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        noticeTop: bounds?.top ?? null,
        noticeBottom: bounds?.bottom ?? null,
        bannerBottom,
        focusIsNotice: document.activeElement === notice,
        focusedTag: document.activeElement?.tagName.toLowerCase() ?? null,
        startValue: form?.querySelector<HTMLInputElement>('[name="periodStart"]')?.value ?? null,
        endValue: form?.querySelector<HTMLInputElement>('[name="periodEnd"]')?.value ?? null,
        selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null,
        financeSummaryCount: document.querySelectorAll('.finance-summary').length,
      };
    });
  }
  try {
    await signIn(page, 'owner');
    const before = audits();
    await page.goto(portal(`/projects/${projectId}?periodStart=2026-09-20&periodEnd=2026-09-19&tab=commercial&lang=en`));
    await expect(page.locator('[data-problem-code="PROJECT_DETAIL_PERIOD_RANGE_REVERSED"]')).toBeVisible();
    const form = page.locator('[data-project-period-form]');
    await form.locator('[name="periodEnd"]').fill('2026-09-18');
    const startingScroll = await page.evaluate(() => { window.scrollTo(0, 300); return Math.round(scrollY); });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('periodEnd') === '2026-09-18'),
      form.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-problem-code="PROJECT_DETAIL_PERIOD_RANGE_REVERSED"]')).toBeVisible();
    const timeline = [] as unknown[];
    for (const [at, delay] of [[0,0],[50,50],[250,200],[500,250],[1000,500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot() });
    }
    const invalid = await snapshot();
    await page.screenshot({ path: join(evidenceRoot, 'owner-enhanced-fixed.png') });
    const correction = page.locator('[data-project-period-form]');
    await correction.locator('[name="periodEnd"]').fill('2026-09-21');
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('periodEnd') === '2026-09-21'),
      correction.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-project-period-problem]')).toHaveCount(0);
    const corrected = await snapshot();
    const after = audits();
    writeFileSync(join(evidenceRoot, 'results.json'), redact({ candidateCommit, role: 'owner', viewport: 390, startingScroll, timeline, invalid, corrected, audits: { before, after }, diagnostics }) + '\n');
    expect(invalid.code).toBe('PROJECT_DETAIL_PERIOD_RANGE_REVERSED');
    expect(invalid.startValue).toBe('2026-09-20');
    expect(invalid.endValue).toBe('2026-09-18');
    expect(invalid.selectedTab).toBe('project-tab-commercial');
    expect(invalid.focusIsNotice).toBe(true);
    expect(invalid.noticeTop).toBeGreaterThanOrEqual(80);
    expect(invalid.noticeBottom).toBeLessThanOrEqual(820);
    expect(invalid.financeSummaryCount).toBe(0);
    expect(corrected.code).toBeNull();
    expect(corrected.selectedTab).toBe('project-tab-commercial');
    expect(corrected.financeSummaryCount).toBe(1);
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});
