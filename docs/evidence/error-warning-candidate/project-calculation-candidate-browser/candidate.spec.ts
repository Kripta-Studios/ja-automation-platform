import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials, e2eLifecycleFixturesFor } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '9b0a4ffe48b6de479101320dc5b27cb2f4844cb3';
const projectId = e2eLifecycleFixturesFor('phone-390').project.id;
const portal = (path = '') => `http://127.0.0.1:4175/j-aautomation/app${path}`;
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{27,36}\b/giu, ':record')
    : item, 2);

async function signIn(page: Page, role: keyof typeof e2eCredentials) {
  const credentials = e2eCredentials[role];
  await page.goto(portal('/login'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.origin === 'http://127.0.0.1:4175' && (url.pathname === '/j-aautomation/app' || url.pathname.startsWith('/j-aautomation/app/')) && !url.pathname.endsWith('/login'));
  await page.waitForLoadState('networkidle');
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const correction = document.querySelector<HTMLElement>('[data-project-calculation-period-problem]');
    const notice = correction?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const bounds = notice?.getBoundingClientRect();
    const inputs = correction?.querySelector<HTMLFormElement>('[data-project-calculation-period-form]');
    const params = new URLSearchParams(location.search);
    return {
      query: Object.fromEntries(['periodStart', 'periodEnd', 'lang'].map((key) => [key, params.getAll(key)])),
      locale: document.documentElement.lang,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      code: notice?.getAttribute('data-problem-code') ?? null,
      text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      adjacentStart: correction?.querySelector('#calculation-periodStart-error')?.textContent?.trim() ?? null,
      adjacentEnd: correction?.querySelector('#calculation-periodEnd-error')?.textContent?.trim() ?? null,
      remedy: notice?.querySelector('li')?.textContent?.trim() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      startValue: inputs?.querySelector<HTMLInputElement>('[name="periodStart"]')?.value ?? null,
      endValue: inputs?.querySelector<HTMLInputElement>('[name="periodEnd"]')?.value ?? null,
      activeTag: document.activeElement?.tagName.toLowerCase() ?? null,
      focusIsNotice: document.activeElement === notice,
      noticeTop: bounds?.top ?? null,
      noticeBottom: bounds?.bottom ?? null,
      headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? null,
      totalCount: document.querySelectorAll('[data-calculation-total]').length,
      personCount: document.querySelectorAll('[data-calculation-person]').length,
      canonicalNoteCount: document.querySelectorAll('[data-calculation-canonical-note]').length,
    };
  });
}

function observe(page: Page) {
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/app/projects/') && response.url().includes('/calculation'))
      diagnostics.responses.push(`${response.status()} ${response.request().resourceType()}`);
  });
  return diagnostics;
}

const cases = [
  { role: 'owner' as const, width: 390, height: 844, locale: 'en' },
  { role: 'finance' as const, width: 1440, height: 900, locale: 'es' },
  { role: 'finance' as const, width: 390, height: 844, locale: 'pt' },
];

for (const roleCase of cases) {
  test(`${roleCase.role} ${roleCase.width} ${roleCase.locale}: invalid, reversed and duplicate period deep links`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const diagnostics = observe(page);
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count;
    const scenarios: unknown[] = [];
    try {
      await signIn(page, roleCase.role);
      const before = audits();
      for (const scenario of [
        { name: 'invalid', query: 'periodStart=2026-02-30&periodEnd=2026-03-01', code: 'PROJECT_CALCULATION_PERIOD_DATE_INVALID', start: '2026-02-30', end: '2026-03-01' },
        { name: 'reversed', query: 'periodStart=2026-09-20&periodEnd=2026-09-19', code: 'PROJECT_CALCULATION_PERIOD_RANGE_REVERSED', start: '2026-09-20', end: '2026-09-19' },
        { name: 'duplicate', query: 'periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30', code: 'PROJECT_CALCULATION_PERIOD_DATE_DUPLICATE', start: '2026-09-01', end: '2026-09-30' },
      ]) {
        const response = await page.goto(portal(`/projects/${projectId}/calculation?${scenario.query}&lang=${roleCase.locale}`));
        await expect(page.locator(`[data-project-calculation-period-problem] [data-problem-code="${scenario.code}"]`)).toBeVisible();
        await page.waitForTimeout(150);
        const ui = await snapshot(page);
        scenarios.push({ name: scenario.name, status: response?.status(), ui });
        if (scenario.name === 'duplicate') await page.screenshot({ path: join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-duplicate.png`) });
        expect(response?.status()).toBe(200);
        expect(ui.code).toBe(scenario.code);
        expect(ui.startValue).toBe(scenario.start);
        expect(ui.endValue).toBe(scenario.end);
        expect(ui.focusIsNotice).toBe(true);
        expect(ui.totalCount).toBe(0);
        expect(ui.personCount).toBe(0);
        expect(ui.canonicalNoteCount).toBe(0);
        expect(ui.remedy).toBeTruthy();
      }
      const after = audits();
      writeFileSync(join(evidenceRoot, `${roleCase.role}-${roleCase.width}-${roleCase.locale}-results.json`), redact({ candidateCommit, ...roleCase, scenarios, audits: { before, after }, diagnostics }) + '\n');
      expect(after).toBe(before);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.consoleErrors).toEqual([]);
    } finally { database.close(); }
  });
}

test('Owner enhanced correction retains dates and recovers after a valid retry', async ({ page }) => {
  test.setTimeout(150_000);
  const diagnostics = observe(page);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count;
  try {
    await signIn(page, 'owner');
    const before = audits();
    await page.goto(portal(`/projects/${projectId}/calculation?periodStart=2026-09-20&periodEnd=2026-09-19&lang=en`));
    await expect(page.locator('[data-project-calculation-period-problem]')).toBeVisible();
    const form = page.locator('[data-project-calculation-period-form]');
    await form.locator('[name="periodEnd"]').fill('2026-09-18');
    const startingScroll = await page.evaluate(() => { window.scrollTo(0, 300); return Math.round(scrollY); });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('periodEnd') === '2026-09-18'),
      form.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-problem-code="PROJECT_CALCULATION_PERIOD_RANGE_REVERSED"]')).toBeVisible();
    const timeline: unknown[] = [];
    for (const [at, delay] of [[0, 0], [50, 50], [250, 200], [500, 250], [1000, 500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot(page) });
    }
    const invalid = await snapshot(page);
    await page.screenshot({ path: join(evidenceRoot, 'owner-390-enhanced-invalid.png') });
    const correction = page.locator('[data-project-calculation-period-form]');
    await correction.locator('[name="periodEnd"]').fill('2026-09-21');
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('periodEnd') === '2026-09-21'),
      correction.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-project-calculation-period-problem]')).toHaveCount(0);
    const corrected = await snapshot(page);
    const after = audits();
    writeFileSync(join(evidenceRoot, 'owner-390-enhanced-results.json'), redact({ candidateCommit, role: 'owner', viewport: 390, startingScroll, timeline, invalid, corrected, audits: { before, after }, diagnostics }) + '\n');
    expect(invalid.code).toBe('PROJECT_CALCULATION_PERIOD_RANGE_REVERSED');
    expect(invalid.startValue).toBe('2026-09-20');
    expect(invalid.endValue).toBe('2026-09-18');
    expect(invalid.focusIsNotice).toBe(true);
    expect(invalid.noticeTop).toBeGreaterThanOrEqual(80);
    expect(invalid.noticeBottom).toBeLessThanOrEqual(820);
    expect(invalid.totalCount).toBe(0);
    expect(corrected.code).toBeNull();
    expect(corrected.totalCount).toBeGreaterThan(0);
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});
