import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '41dc838e3f3270fd593d6553d44c0075ec4528a1';
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

function observe(page: Page) {
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('/reports/review')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()}`); });
  return diagnostics;
}
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const problem = main?.querySelector<HTMLElement>('[data-review-filter-problem]');
    const notice = problem?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const summary = problem?.querySelector<HTMLElement>('[data-ui="validation-summary"]');
    const bounds = notice?.getBoundingClientRect();
    const form = main?.querySelector<HTMLFormElement>('form[method="GET"]');
    const project = form?.querySelector<HTMLSelectElement>('#review-project');
    return {
      path: location.pathname,
      query: Object.fromEntries(['project','from','to','lang','viewportScrollY'].map((key) => [key, new URLSearchParams(location.search).getAll(key).map((value) => key === 'project' && value ? ':record' : value)])),
      viewport: { width: innerWidth, height: innerHeight },
      locale: main?.getAttribute('lang') ?? null,
      scrollY: Math.round(scrollY),
      formPresent: Boolean(form),
      projectSelected: Boolean(project?.value),
      projectUnavailableOption: Boolean(project?.selectedOptions[0]?.disabled),
      from: form?.querySelector<HTMLInputElement>('#review-from')?.value ?? null,
      to: form?.querySelector<HTMLInputElement>('#review-to')?.value ?? null,
      code: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeTop: bounds?.top ?? null,
      noticeBottom: bounds?.bottom ?? null,
      headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
      focusIsNotice: document.activeElement === notice,
      focusIsSummary: document.activeElement === summary,
      focusedTag: document.activeElement?.tagName.toLowerCase() ?? null,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      remedyText: notice?.querySelector('a')?.textContent?.trim() ?? null,
      fieldErrors: Object.fromEntries([...(main?.querySelectorAll<HTMLElement>('[id$="-error"]') ?? [])].filter((element) => element.id.startsWith('review-')).map((element) => [element.id, element.textContent?.trim() ?? ''])),
      reportCount: main?.querySelectorAll('[data-period-review-report]').length ?? 0,
    };
  });
}

for (const roleCase of [
  { role: 'finance' as const, width: 390, height: 844, locale: 'en' },
  { role: 'owner' as const, width: 1440, height: 900, locale: 'es' },
  { role: 'manager' as const, width: 390, height: 844, locale: 'en' },
]) {
  test(`${roleCase.role} Report Review filter problems keep role-scoped form`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
    const diagnostics = observe(page);
    const scenarios: unknown[] = [];
    try {
      await signIn(page, roleCase.role);
      const before = audits();
      const base = await page.goto(portal(`/reports/review?lang=${roleCase.locale}`));
      expect(base?.status()).toBe(200);
      const project = await page.locator('#review-project option[value]:not([value=""])').first().getAttribute('value');
      if (!project) test.skip(true, `${roleCase.role} has no active review project in disposable fixture`);
      const encoded = encodeURIComponent(project!);
      for (const [name, query, code, field] of [
        ['invalid-date', `project=${encoded}&from=2026-02-30&to=2026-03-01`, 'REPORT_REVIEW_PERIOD_DATE_INVALID', 'from'],
        ['reversed', `project=${encoded}&from=2026-09-20&to=2026-09-19`, 'REPORT_REVIEW_PERIOD_RANGE_REVERSED', 'to'],
        ['duplicate', `project=${encoded}&from=2026-09-01&from=2026-09-02&to=2026-09-30`, 'REPORT_REVIEW_PERIOD_DATE_DUPLICATE', 'from'],
        ['unavailable-project', `project=unavailable-project&from=2026-09-01&to=2026-09-30`, 'REPORT_REVIEW_PROJECT_UNAVAILABLE', 'project'],
        ['project-required', `from=2026-09-01&to=2026-09-30`, 'REPORT_REVIEW_PROJECT_REQUIRED', 'project'],
      ] as const) {
        const response = await page.goto(portal(`/reports/review?${query}&lang=${roleCase.locale}`));
        await expect(page.locator(`[data-review-filter-problem] [data-problem-code="${code}"]`)).toBeVisible();
        await page.waitForTimeout(250);
        const ui = await snapshot(page);
        scenarios.push({ name, status: response?.status(), ui });
        expect(response?.status()).toBe(200);
        expect(ui.code).toBe(code);
        expect(ui.formPresent).toBe(true);
        expect(ui.fieldErrors).toHaveProperty(`review-${field}-error`);
        expect(ui.focusIsNotice || ui.focusIsSummary).toBe(true);
        expect(ui.reportCount).toBe(0);
        if (name === 'duplicate') await page.locator('[data-review-filter-problem]').screenshot({ path: join(evidenceRoot, `${roleCase.role}-duplicate.png`) });
      }
      const after = audits();
      writeFileSync(join(evidenceRoot, `${roleCase.role}-results.json`), redact({ candidateCommit, ...roleCase, projectOptionAvailable: true, scenarios, audits: { before, after }, diagnostics }) + '\n');
      expect(after).toBe(before);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.consoleErrors).toEqual([]);
    } finally { database.close(); }
  });
}

test('Finance rendered reversed review form focuses retained correction and allows retry', async ({ page }) => {
  test.setTimeout(120_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  const diagnostics = observe(page);
  try {
    await signIn(page, 'finance');
    const before = audits();
    await page.goto(portal('/reports/review?lang=en'));
    const project = await page.locator('#review-project option[value]:not([value=""])').first().getAttribute('value');
    expect(project).toBeTruthy();
    const form = page.locator('main form[method="GET"]').first();
    await form.locator('#review-project').selectOption(project!);
    await form.locator('#review-from').fill('2026-09-20');
    await form.locator('#review-to').fill('2026-09-19');
    const startingScroll = await page.evaluate(() => { window.scrollTo(0, 250); return Math.round(scrollY); });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
      form.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-problem-code="REPORT_REVIEW_PERIOD_RANGE_REVERSED"]')).toBeVisible();
    const timeline = [] as unknown[];
    for (const [at, delay] of [[0,0],[50,50],[250,200],[500,250],[1000,500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot(page) });
    }
    const invalid = await snapshot(page);
    await page.screenshot({ path: join(evidenceRoot, 'finance-enhanced-invalid.png') });
    await page.locator('#review-to').fill('2026-09-21');
    const correction = page.locator('main form[method="GET"]').first();
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('to') === '2026-09-21'),
      correction.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-review-filter-problem]')).toHaveCount(0);
    const corrected = await snapshot(page);
    const after = audits();
    writeFileSync(join(evidenceRoot, 'finance-enhanced-results.json'), redact({ candidateCommit, role: 'finance', viewport: 390, startingScroll, timeline, invalid, corrected, audits: { before, after }, diagnostics }) + '\n');
    expect(invalid.path).toBe('/j-aautomation/app/reports/review');
    expect(invalid.from).toBe('2026-09-20');
    expect(invalid.to).toBe('2026-09-19');
    expect(invalid.projectSelected).toBe(true);
    expect(invalid.focusIsNotice).toBe(true);
    expect(invalid.reportCount).toBe(0);
    expect(corrected.code).toBeNull();
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});

test('Auditor malformed review URL stays role-denied before filter validation', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const diagnostics = observe(page);
  await signIn(page, 'auditor');
  const results = [] as unknown[];
  for (const [name, query] of [
    ['valid', '?lang=es'],
    ['malformed', '?project=unavailable-project&from=2026-02-30&to=2026-03-01&lang=es'],
    ['duplicate', '?project=a&project=b&from=2026-09-01&to=2026-09-30&lang=es'],
  ]) {
    const response = await page.goto(portal(`/reports/review${query}`));
    results.push({ name, status: response?.status(), ui: await snapshot(page) });
    expect(response?.status()).toBe(403);
    await expect(page.locator('[data-review-filter-problem]')).toHaveCount(0);
  }
  writeFileSync(join(evidenceRoot, 'auditor-results.json'), redact({ candidateCommit, role: 'auditor', viewport: 1440, locale: 'es', results, diagnostics }) + '\n');
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});
