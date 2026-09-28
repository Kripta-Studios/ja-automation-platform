import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '0a0cee42913ba5d14a0584a1296116b67f07917d';
const projectId = e2eLifecycleFixturesFor('phone-390').project.id;
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const problem = main?.querySelector<HTMLElement>('[data-project-period-problem]');
    const notice = problem?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const bounds = notice?.getBoundingClientRect();
    const form = main?.querySelector<HTMLFormElement>('[data-project-period-form]');
    const active = document.activeElement;
    return {
      path: location.pathname.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/giu, ':record'),
      query: Object.fromEntries(['periodStart','periodEnd','tab','lang'].map((key) => [key, new URLSearchParams(location.search).getAll(key)])),
      locale: document.documentElement.lang,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      code: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeTop: bounds?.top ?? null,
      noticeBottom: bounds?.bottom ?? null,
      noticeVisible: Boolean(bounds && bounds.top >= 0 && bounds.bottom <= innerHeight),
      focusIsNotice: active === notice,
      focusedTag: active?.tagName.toLowerCase() ?? null,
      focusedId: active?.id ?? null,
      remedyText: notice?.querySelector('a')?.textContent?.trim() ?? null,
      periodFormPresent: Boolean(form),
      startValue: form?.querySelector<HTMLInputElement>('[name="periodStart"]')?.value ?? null,
      endValue: form?.querySelector<HTMLInputElement>('[name="periodEnd"]')?.value ?? null,
      startError: problem?.querySelector('#project-periodStart-error')?.textContent?.trim() ?? null,
      endError: problem?.querySelector('#project-periodEnd-error')?.textContent?.trim() ?? null,
      selectedTab: main?.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null,
      financeSummaryCount: main?.querySelectorAll('.finance-summary').length ?? 0,
      correctionCount: main?.querySelectorAll('[data-project-period-problem]').length ?? 0,
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
    if (response.url().includes('/app/projects/')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()}`);
  });
  return diagnostics;
}

for (const roleCase of [
  { role: 'owner' as const, width: 390, height: 844, locale: 'en' },
  { role: 'finance' as const, width: 1440, height: 900, locale: 'es' },
  { role: 'auditor' as const, width: 1440, height: 900, locale: 'es' },
]) {
  test(`${roleCase.role} period deep links retain invalid dates and suppress finance projection`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count;
    const diagnostics = observe(page);
    const scenarios: unknown[] = [];
    try {
      await signIn(page, roleCase.role);
      const before = audits();
      for (const [name, query, code, start, end] of [
        ['invalid', `periodStart=2026-02-30&periodEnd=2026-03-01`, 'PROJECT_DETAIL_PERIOD_DATE_INVALID', '2026-02-30', '2026-03-01'],
        ['reversed', `periodStart=2026-09-20&periodEnd=2026-09-19`, 'PROJECT_DETAIL_PERIOD_RANGE_REVERSED', '2026-09-20', '2026-09-19'],
        ['duplicate', `periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30`, 'PROJECT_DETAIL_PERIOD_DATE_DUPLICATE', '2026-09-01', '2026-09-30'],
      ] as const) {
        const response = await page.goto(portal(`/projects/${projectId}?${query}&tab=commercial&lang=${roleCase.locale}`));
        await expect(page.locator(`[data-project-period-problem] [data-problem-code="${code}"]`)).toBeVisible();
        const ui = await snapshot(page);
        scenarios.push({ name, status: response?.status(), ui });
        expect(response?.status()).toBe(200);
        expect(ui.code).toBe(code);
        expect(ui.startValue).toBe(start);
        expect(ui.endValue).toBe(end);
        expect(ui.selectedTab).toBe('project-tab-commercial');
        expect(ui.focusIsNotice).toBe(true);
        expect(ui.financeSummaryCount).toBe(0);
        expect(ui.correctionCount).toBe(1);
        if (name === 'duplicate') {
          await page.screenshot({ path: join(evidenceRoot, `${roleCase.role}-duplicate.png`) });
        }
      }
      const after = audits();
      writeFileSync(join(evidenceRoot, `${roleCase.role}-results.json`), redact({ candidateCommit, ...roleCase, scenarios, audits: { before, after }, diagnostics }) + '\n');
      expect(after).toBe(before);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.consoleErrors).toEqual([]);
    } finally { database.close(); }
  });
}

test('Owner correction form enhanced GET keeps tab and dates after another invalid period', async ({ page }) => {
  test.setTimeout(120_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count;
  const diagnostics = observe(page);
  try {
    await signIn(page, 'owner');
    const before = audits();
    await page.goto(portal(`/projects/${projectId}?periodStart=2026-09-20&periodEnd=2026-09-19&tab=commercial&lang=en`));
    const form = page.locator('[data-project-period-form]');
    await form.locator('[name="periodEnd"]').fill('2026-09-18');
    const startingScroll = await page.evaluate(() => { window.scrollTo(0, 300); return Math.round(scrollY); });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('periodEnd') === '2026-09-18'),
      form.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-problem-code="PROJECT_DETAIL_PERIOD_RANGE_REVERSED"]')).toBeVisible();
    await page.waitForTimeout(350);
    const invalid = await snapshot(page);
    await page.screenshot({ path: join(evidenceRoot, 'owner-enhanced-invalid.png') });
    const correction = page.locator('[data-project-period-form]');
    await correction.locator('[name="periodEnd"]').fill('2026-09-21');
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('periodEnd') === '2026-09-21'),
      correction.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-project-period-problem]')).toHaveCount(0);
    const corrected = await snapshot(page);
    const after = audits();
    writeFileSync(join(evidenceRoot, 'owner-enhanced-results.json'), redact({ candidateCommit, role: 'owner', viewport: 390, startingScroll, invalid, corrected, audits: { before, after }, diagnostics }) + '\n');
    expect(invalid.startValue).toBe('2026-09-20');
    expect(invalid.endValue).toBe('2026-09-18');
    expect(invalid.selectedTab).toBe('project-tab-commercial');
    expect(corrected.code).toBeNull();
    expect(corrected.selectedTab).toBe('project-tab-commercial');
    expect(corrected.financeSummaryCount).toBe(1);
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});

for (const roleCase of [
  { role: 'manager' as const, email: 'pm@demo.jaautomation.test' },
  { role: 'worker' as const, email: 'worker@demo.jaautomation.test' },
]) {
  test(`${roleCase.role} invalid finance period cannot reveal finance problem or figures`, async ({ page }) => {
    test.setTimeout(90_000);
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const diagnostics = observe(page);
    try {
      const membership = database.prepare(`SELECT pm.project_id id FROM project_member pm JOIN user u ON u.id=pm.user_id WHERE u.email=? AND pm.status='active' ORDER BY pm.starts_on,pm.id LIMIT 1`).get(roleCase.email) as { id: string } | undefined;
      await signIn(page, roleCase.role);
      const assignedProject = membership?.id ?? projectId;
      const response = await page.goto(portal(`/projects/${assignedProject}?periodStart=2026-02-30&periodEnd=2026-03-01&tab=overview&lang=en`));
      const ui = await snapshot(page);
      writeFileSync(join(evidenceRoot, `${roleCase.role}-scope-results.json`), redact({ candidateCommit, role: roleCase.role, hasActiveMembership: Boolean(membership), status: response?.status(), ui, diagnostics }) + '\n');
      expect([200, 403]).toContain(response?.status());
      expect(ui.code).toBeNull();
      expect(ui.financeSummaryCount).toBe(0);
      expect(ui.correctionCount).toBe(0);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.consoleErrors).toEqual([]);
    } finally { database.close(); }
  });
}
