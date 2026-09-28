import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';
import { auditCount, observe, portal, redact, signIn } from '../project-finance-export-candidate-browser/browser-support.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'f3955489afc09a62df1001fe3a7f80ef662407a6';
const staleWorker = '00000000-0000-4000-8000-ffffffffffff';

function workerId() {
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const row = database.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as { id: string } | undefined;
    if (!row) throw new Error('Disposable worker account is missing');
    return row.id;
  } finally { database.close(); }
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const region = document.querySelector<HTMLElement>('[data-worker-pay-filter-problem]');
    const notice = region?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const summary = region?.querySelector<HTMLElement>('[data-ui="validation-summary"]');
    const focused = document.activeElement;
    const target = summary ?? notice;
    const bounds = target?.getBoundingClientRect();
    const worker = document.querySelector<HTMLSelectElement>('#worker-pay-worker');
    const start = document.querySelector<HTMLInputElement>('#worker-pay-start');
    const end = document.querySelector<HTMLInputElement>('#worker-pay-end');
    const params = new URLSearchParams(location.search);
    return {
      locale: document.documentElement.lang,
      width: innerWidth, height: innerHeight, scrollY: Math.round(scrollY),
      query: Object.fromEntries(['start', 'end', 'worker', 'lang', 'viewportScrollY'].map((key) => [key, params.getAll(key)])),
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      remedy: notice?.querySelector('li')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      summaryPresent: Boolean(summary),
      summaryText: summary?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      summaryLinks: [...(summary?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href')),
      focusIsTarget: focused === target,
      focusedId: focused?.id ?? null,
      targetTop: bounds?.top ?? null, targetBottom: bounds?.bottom ?? null,
      headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? null,
      workerValue: worker?.value ?? null,
      workerUnavailableOption: worker?.selectedOptions[0]?.disabled ?? false,
      startValue: start?.value ?? null,
      startType: start?.type ?? null,
      endValue: end?.value ?? null,
      endType: end?.type ?? null,
      startError: document.querySelector('#worker-pay-start-error')?.textContent?.trim() ?? null,
      endError: document.querySelector('#worker-pay-end-error')?.textContent?.trim() ?? null,
      workerError: document.querySelector('#worker-pay-worker-error')?.textContent?.trim() ?? null,
      paySummaryCount: document.querySelectorAll('#owner-pay-summary-title').length,
      activityTableCount: document.querySelectorAll('[aria-labelledby="owner-pay-activities-title"] table').length,
      errorPageText: !region ? document.querySelector('main')?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 400) ?? null : null,
    };
  });
}

for (const roleCase of [
  { width: 390, height: 844, locale: 'en' },
  { width: 1440, height: 900, locale: 'es' },
  { width: 390, height: 844, locale: 'pt' },
]) {
  test(`Owner ${roleCase.width} ${roleCase.locale}: typed worker-pay filter problems and retry`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const diagnostics = observe(page);
    await signIn(page, 'owner');
    const selectedWorker = workerId();
    const before = auditCount();
    const scenarios = [] as unknown[];
    for (const scenario of [
      { name: 'invalid', query: `start=2026-02-30&end=2026-03-01&worker=${selectedWorker}`, code: 'WORKER_PAY_PERIOD_DATE_INVALID', start: '2026-02-30', end: '2026-03-01', worker: selectedWorker },
      { name: 'reversed', query: `start=2026-09-20&end=2026-09-19&worker=${selectedWorker}`, code: 'WORKER_PAY_PERIOD_RANGE_REVERSED', start: '2026-09-20', end: '2026-09-19', worker: selectedWorker },
      { name: 'duplicate', query: `start=2026-09-01&start=2026-09-02&end=2026-09-30&worker=${selectedWorker}`, code: 'WORKER_PAY_FILTER_DUPLICATE', start: '2026-09-01', end: '2026-09-30', worker: selectedWorker },
      { name: 'stale worker', query: `start=2026-09-01&end=2026-09-30&worker=${staleWorker}`, code: 'WORKER_PAY_WORKER_UNAVAILABLE', start: '2026-09-01', end: '2026-09-30', worker: staleWorker },
      { name: 'duplicate and malformed', query: `start=not-a-date&start=2026-03-01&end=2026-03-31&worker=${selectedWorker}`, code: 'WORKER_PAY_FILTER_DUPLICATE', start: 'not-a-date', end: '2026-03-31', worker: selectedWorker },
      { name: 'multiple malformed fields', query: `start=not-a-date&start=2026-03-01&end=2026-02-30&end=2026-03-31&worker=${selectedWorker}`, code: 'WORKER_PAY_FILTER_DUPLICATE', start: 'not-a-date', end: '2026-02-30', worker: selectedWorker },
    ]) {
      const response = await page.goto(portal(`/manage/worker-pay?${scenario.query}&lang=${roleCase.locale}`));
      await expect(page.locator(`[data-worker-pay-filter-problem] [data-problem-code="${scenario.code}"]`)).toBeVisible();
      await page.waitForTimeout(100);
      const ui = await snapshot(page);
      scenarios.push({ name: scenario.name, status: response?.status(), ui });
      if (scenario.name === 'duplicate and malformed')
        await page.locator('[data-worker-pay-filter-problem]').screenshot({ path: join(evidenceRoot, `owner-${roleCase.width}-${roleCase.locale}-combined.png`) });
      if (scenario.name === 'multiple malformed fields')
        await page.locator('.pay-card').first().screenshot({ path: join(evidenceRoot, `owner-${roleCase.width}-${roleCase.locale}-multi-field.png`) });
      expect(response?.status()).toBe(200);
      expect(ui.code).toBe(scenario.code);
      expect(ui.startValue).toBe(scenario.start);
      if (scenario.name === 'duplicate and malformed') expect(ui.startType).toBe('text');
      if (scenario.name === 'multiple malformed fields') {
        expect(ui.startType).toBe('text');
        expect(ui.endType).toBe('text');
        expect(ui.summaryPresent).toBe(true);
        expect(ui.summaryLinks).toEqual(['#worker-pay-start', '#worker-pay-end']);
      }
      expect(ui.endValue).toBe(scenario.end);
      expect(ui.workerValue).toBe(scenario.worker);
      expect(ui.paySummaryCount).toBe(0);
      expect(ui.activityTableCount).toBe(0);
      expect(ui.focusIsTarget).toBe(true);
      expect(ui.remedyHref).toBeTruthy();
      if (scenario.name === 'stale worker') expect(ui.workerUnavailableOption).toBe(true);
    }
    const after = auditCount();
    writeFileSync(join(evidenceRoot, `owner-${roleCase.width}-${roleCase.locale}-results.json`), redact({ candidateCommit, role: 'owner', ...roleCase, scenarios, audits: { before, after }, diagnostics }) + '\n');
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  });
}

test('Owner enhanced correction preserves worker/date/scroll and valid retry shows pay summary', async ({ page }) => {
  test.setTimeout(150_000);
  const diagnostics = observe(page);
  await signIn(page, 'owner');
  const selectedWorker = workerId();
  const before = auditCount();
  await page.goto(portal(`/manage/worker-pay?start=2026-09-20&end=2026-09-19&worker=${selectedWorker}&lang=en`));
  const form = page.locator('form.pay-filters');
  await form.locator('[name="end"]').fill('2026-09-18');
  const startingScroll = await page.evaluate(() => { window.scrollTo(0, 300); return Math.round(scrollY); });
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('end') === '2026-09-18'),
    form.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator('[data-problem-code="WORKER_PAY_PERIOD_RANGE_REVERSED"]')).toBeVisible();
  const timeline = [] as unknown[];
  for (const [at, delay] of [[0, 0], [50, 50], [250, 200], [500, 250]] as const) {
    if (delay) await page.waitForTimeout(delay);
    timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot(page) });
  }
  const invalid = await snapshot(page);
  await page.locator('[data-worker-pay-filter-problem]').screenshot({ path: join(evidenceRoot, 'owner-390-enhanced-invalid.png') });
  await page.locator('form.pay-filters [name="end"]').fill('2026-09-21');
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('end') === '2026-09-21'),
    page.locator('form.pay-filters button[type="submit"]').click(),
  ]);
  await expect(page.locator('[data-worker-pay-filter-problem]')).toHaveCount(0);
  const corrected = await snapshot(page);
  const after = auditCount();
  writeFileSync(join(evidenceRoot, 'owner-390-enhanced-results.json'), redact({ candidateCommit, role: 'owner', startingScroll, timeline, invalid, corrected, audits: { before, after }, diagnostics }) + '\n');
  expect(invalid.code).toBe('WORKER_PAY_PERIOD_RANGE_REVERSED');
  expect(invalid.workerValue).toBe(selectedWorker);
  expect(invalid.startValue).toBe('2026-09-20');
  expect(invalid.endValue).toBe('2026-09-18');
  expect(invalid.focusIsTarget).toBe(true);
  expect(invalid.targetTop).toBeGreaterThanOrEqual(88);
  expect(invalid.targetBottom).toBeLessThanOrEqual(820);
  expect(invalid.paySummaryCount).toBe(0);
  expect(corrected.code).toBeNull();
  expect(corrected.paySummaryCount).toBe(1);
  expect(after).toBe(before);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});

for (const role of ['finance', 'manager', 'worker'] as const) {
  test(`${role} cannot see Owner worker-pay filters or compensation`, async ({ page }) => {
    test.setTimeout(90_000);
    const diagnostics = observe(page);
    await signIn(page, role);
    const selectedWorker = workerId();
    const response = await page.goto(portal(`/manage/worker-pay?start=not-a-date&end=2026-03-01&worker=${selectedWorker}&lang=en`));
    const ui = await snapshot(page);
    writeFileSync(join(evidenceRoot, `${role}-denied-results.json`), redact({ candidateCommit, role, status: response?.status(), ui, diagnostics }) + '\n');
    expect(response?.status()).toBe(403);
    expect(ui.code).toBeNull();
    expect(ui.paySummaryCount).toBe(0);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  });
}
