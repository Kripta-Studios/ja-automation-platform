import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'fe6ced96320fd166113d5ad8b2059f7fa208e219';

function redact(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'string'
      ? item
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
          .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
      : item,
  2);
}

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const form = main?.querySelector<HTMLFormElement>('form[method="GET"]');
    const notice = main?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const focus = document.activeElement as HTMLElement | null;
    const bounds = notice?.getBoundingClientRect();
    const bannerBounds = document.querySelector('header')?.getBoundingClientRect();
    return {
      url: location.pathname + location.search,
      locale: main?.getAttribute('lang'),
      viewport: { width: innerWidth, height: innerHeight },
      heading: main?.querySelector('h1')?.textContent?.trim() ?? null,
      errorText: form ? null : main?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 300) ?? null,
      formPresent: Boolean(form),
      problemCode: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeCount: main?.querySelectorAll('[data-ui="problem-notice"]').length ?? 0,
      noticeInViewport: Boolean(bounds && bounds.top >= 0 && bounds.bottom <= innerHeight),
      noticeBounds: bounds ? { top: Math.round(bounds.top), bottom: Math.round(bounds.bottom) } : null,
      noticeTopRaw: bounds?.top ?? null,
      bannerBottom: bannerBounds?.bottom ?? null,
      noticeObscuredByBanner: Boolean(bounds && bannerBounds && bounds.top < bannerBounds.bottom),
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      remedyText: notice?.querySelector('a')?.textContent?.trim() ?? null,
      focusId: focus?.id ?? null,
      focusDataUi: focus?.getAttribute('data-ui') ?? null,
      focusIsNotice: focus === notice || Boolean(notice?.contains(focus)),
      scrollY: Math.round(scrollY),
      filter: form?.querySelector<HTMLSelectElement>('[name="filter"]')?.value ?? null,
      currency: form?.querySelector<HTMLSelectElement>('[name="currency"]')?.value ?? null,
      group: form?.querySelector<HTMLSelectElement>('[name="group"]')?.value ?? null,
      from: form?.querySelector<HTMLInputElement>('[name="from"]')?.value ?? null,
      to: form?.querySelector<HTMLInputElement>('[name="to"]')?.value ?? null,
      project: form?.querySelector<HTMLSelectElement>('[name="project"]')?.value ?? null,
      fieldErrors: Object.fromEntries(
        [...(main?.querySelectorAll<HTMLElement>('[id$="-error"]') ?? [])]
          .filter((element) => element.id.startsWith('cash-'))
          .map((element) => [element.id, element.textContent?.trim() ?? '']),
      ),
      cashGroupCount: main?.querySelectorAll('[data-cash-group]').length ?? 0,
    };
  });
}

test('Finance Cash filters preserve attempted values and support recovery', async ({ page }) => {
  test.setTimeout(180_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      diagnostics.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/finance/cash'))
      diagnostics.responses.push(`${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`);
  });
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  const scenarios: unknown[] = [];
  try {
    await signIn(page, 'finance');
    const before = audits();
    for (const [name, suffix, code, key, value] of [
      ['invalid-filter', '?filter=bogus&from=2026-09-01&to=2026-09-30&lang=en', 'FINANCE_CASH_FILTER_INVALID', 'filter', 'bogus'],
      ['invalid-date', '?from=2026-02-30&to=2026-03-01&lang=en', 'FINANCE_CASH_DATE_INVALID', 'from', '2026-02-30'],
      ['reversed-date', '?from=2026-09-20&to=2026-09-19&lang=en', 'FINANCE_CASH_DATE_ORDER_INVALID', 'to', '2026-09-19'],
      ['unavailable-project', '?project=unavailable-project&from=2026-09-01&lang=en', 'FINANCE_CASH_PROJECT_UNAVAILABLE', 'project', 'unavailable-project'],
    ] as const) {
      const response = await page.goto(portal(`/finance/cash${suffix}`));
      await expect(page.locator(`[data-problem-code="${code}"]`)).toBeVisible();
      await page.waitForTimeout(350);
      const ui = await snapshot(page);
      scenarios.push({ name, status: response?.status(), ui });
      expect(response?.status()).toBe(200);
      expect(ui.formPresent).toBe(true);
      expect(ui.problemCode).toBe(code);
      expect(ui.fieldErrors).toHaveProperty(`cash-${key}-error`);
      expect(ui[key]).toBe(value);
      expect(ui.focusIsNotice).toBe(true);
      expect(ui.noticeInViewport).toBe(true);
      expect(ui.cashGroupCount).toBe(0);
      if (name === 'reversed-date') {
        await page.locator('[name="to"]').fill('2026-09-21');
        await Promise.all([
          page.waitForURL((url) => url.searchParams.get('to') === '2026-09-21'),
          page.locator('main form[method="GET"] button[type="submit"]').click(),
        ]);
        await expect(page.locator('[data-ui="problem-notice"]')).toHaveCount(0);
        scenarios.push({ name: 'corrected-retry', ui: await snapshot(page) });
      }
    }
    await page.goto(portal('/finance/cash?lang=en'));
    const form = page.locator('main form[method="GET"]');
    await form.locator('[name="from"]').fill('2026-09-20');
    await form.locator('[name="to"]').fill('2026-09-19');
    const startingScroll = await page.evaluate(() => {
      window.scrollTo(0, 300);
      return Math.round(window.scrollY);
    });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
      form.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-problem-code="FINANCE_CASH_DATE_ORDER_INVALID"]')).toBeVisible();
    const timeline = [] as unknown[];
    for (const [at, delay] of [[0, 0], [50, 50], [250, 200], [500, 250], [1000, 500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot(page) });
    }
    const enhanced = await snapshot(page);
    scenarios.push({ name: 'reversed-rendered-form', navigation: 'enhanced GET', startingScroll, timeline, ui: enhanced });
    await page.screenshot({ path: join(evidenceRoot, 'finance-enhanced-invalid.png') });
    expect(enhanced.from).toBe('2026-09-20');
    expect(enhanced.to).toBe('2026-09-19');
    expect(enhanced.focusIsNotice).toBe(true);
    expect(enhanced.cashGroupCount).toBe(0);
    const unsupported = await page.goto(portal('/finance/cash?currency=ZZZ&group=quarter&lang=en'));
    scenarios.push({ name: 'unsupported-currency-group', status: unsupported?.status(), ui: await snapshot(page) });
    const after = audits();
    writeFileSync(join(evidenceRoot, 'finance-results.json'), redact({ candidateCommit, role: 'finance', scenarios, audits: { before, after }, diagnostics }) + '\n');
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});

test('Auditor permission wins over Cash filter validation', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/finance/cash')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`);
  });
  await signIn(page, 'auditor');
  const scenarios = [] as unknown[];
  for (const [name, suffix] of [
    ['valid', '?lang=es'],
    ['invalid-filter', '?filter=bogus&lang=es'],
    ['invalid-date', '?from=2026-02-30&lang=es'],
    ['reversed-date', '?from=2026-09-20&to=2026-09-19&lang=es'],
  ]) {
    const response = await page.goto(portal(`/finance/cash${suffix}`));
    const ui = await snapshot(page);
    scenarios.push({ name, status: response?.status(), ui });
    if (name === 'valid') await page.screenshot({ path: join(evidenceRoot, 'auditor-denied-es.png') });
    expect(response?.status()).toBe(403);
    expect(ui.formPresent).toBe(false);
  }
  writeFileSync(join(evidenceRoot, 'auditor-results.json'), redact({ candidateCommit, role: 'auditor', scenarios, diagnostics }) + '\n');
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
});
