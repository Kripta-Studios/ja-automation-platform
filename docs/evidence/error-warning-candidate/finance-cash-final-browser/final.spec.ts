import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'fa8eeb6a975e74344ba9351a6f3f5bd7320b08c2';
const redact = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2);

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const notice = main?.querySelector<HTMLElement>('[data-ui="problem-notice"]');
    const summary = main?.querySelector<HTMLElement>('[data-ui="validation-summary"]');
    const focus = document.activeElement;
    const noticeBounds = notice?.getBoundingClientRect();
    const summaryBounds = summary?.getBoundingClientRect();
    const bannerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const form = main?.querySelector('form[method="GET"]');
    return {
      url: location.pathname + location.search,
      locale: main?.getAttribute('lang') ?? null,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      bannerBottom: Math.round(bannerBottom),
      noticeCode: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeTop: noticeBounds?.top ?? null,
      noticeBottom: noticeBounds?.bottom ?? null,
      summaryText: summary?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      summaryTop: summaryBounds?.top ?? null,
      focusIsNotice: focus === notice,
      focusIsSummary: focus === summary,
      remedyHref: notice?.querySelector('a')?.getAttribute('href') ?? null,
      currency: form?.querySelector<HTMLSelectElement>('[name="currency"]')?.value ?? null,
      group: form?.querySelector<HTMLSelectElement>('[name="group"]')?.value ?? null,
      from: form?.querySelector<HTMLInputElement>('[name="from"]')?.value ?? null,
      to: form?.querySelector<HTMLInputElement>('[name="to"]')?.value ?? null,
      fieldErrors: Object.fromEntries(
        [...(main?.querySelectorAll<HTMLElement>('[id$="-error"]') ?? [])]
          .filter((element) => element.id.startsWith('cash-'))
          .map((element) => [element.id, element.textContent?.trim() ?? '']),
      ),
      groupCount: main?.querySelectorAll('[data-cash-group]').length ?? 0,
    };
  });
}

for (const roleCase of [
  { role: 'finance' as const, width: 390, height: 844, locale: 'en' },
  { role: 'owner' as const, width: 1440, height: 900, locale: 'es' },
]) {
  test(`${roleCase.role} ${roleCase.width} unavailable Cash currency/group has two field remedies`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const database = new DatabaseSync(readE2EFixturePointer().databasePath);
    const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/finance/cash')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`);
    });
    const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
    try {
      await signIn(page, roleCase.role);
      const before = audits();
      const response = await page.goto(portal(`/finance/cash?currency=ZZZ&group=quarter&from=2026-09-01&lang=${roleCase.locale}`));
      await expect(page.locator('[data-problem-code="FINANCE_CASH_CURRENCY_INVALID"]')).toBeVisible();
      await expect(page.locator('[data-ui="validation-summary"]')).toBeFocused();
      const combined = await snapshot(page);
      await page.screenshot({ path: join(evidenceRoot, `${roleCase.role}-combined-invalid.png`) });
      expect(response?.status()).toBe(200);
      expect(combined.currency).toBe('ZZZ');
      expect(combined.group).toBe('quarter');
      expect(combined.from).toBe('2026-09-01');
      expect(combined.fieldErrors).toHaveProperty('cash-currency-error');
      expect(combined.fieldErrors).toHaveProperty('cash-group-error');
      expect(combined.summaryText).toBeTruthy();
      expect(combined.focusIsSummary).toBe(true);
      expect(combined.groupCount).toBe(0);

      const groupOnlyResponse = await page.goto(portal(`/finance/cash?group=quarter&lang=${roleCase.locale}`));
      await expect(page.locator('[data-problem-code="FINANCE_CASH_GROUP_INVALID"]')).toBeVisible();
      const groupOnly = await snapshot(page);
      expect(groupOnlyResponse?.status()).toBe(200);
      expect(groupOnly.group).toBe('quarter');
      expect(groupOnly.fieldErrors).toHaveProperty('cash-group-error');
      expect(groupOnly.focusIsNotice).toBe(true);

      await page.goto(portal(`/finance/cash?currency=ZZZ&group=quarter&lang=${roleCase.locale}`));
      const form = page.locator('main form[method="GET"]');
      await form.locator('[name="currency"]').selectOption('USD');
      await form.locator('[name="group"]').selectOption('month');
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('currency') === 'USD' && url.searchParams.get('group') === 'month'),
        form.locator('button[type="submit"]').click(),
      ]);
      await expect(page.locator('[data-ui="problem-notice"]')).toHaveCount(0);
      const corrected = await snapshot(page);
      expect(corrected.currency).toBe('USD');
      expect(corrected.group).toBe('month');
      const after = audits();
      writeFileSync(join(evidenceRoot, `${roleCase.role}-results.json`), redact({ candidateCommit, ...roleCase, combined, groupOnly, corrected, audits: { before, after }, diagnostics }) + '\n');
      expect(after).toBe(before);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.consoleErrors).toEqual([]);
    } finally { database.close(); }
  });
}

test('Finance phone enhanced Cash problem clears sticky header', async ({ page }) => {
  test.setTimeout(120_000);
  const database = new DatabaseSync(readE2EFixturePointer().databasePath);
  const diagnostics = { pageErrors: [] as string[], consoleErrors: [] as string[], responses: [] as string[] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) diagnostics.consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('/finance/cash')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`); });
  const audits = () => (database.prepare('SELECT COUNT(*) count FROM audit_event').get() as {count:number}).count;
  try {
    await signIn(page, 'finance');
    const before = audits();
    await page.goto(portal('/finance/cash?lang=en'));
    const form = page.locator('main form[method="GET"]');
    await form.locator('[name="from"]').fill('2026-09-20');
    await form.locator('[name="to"]').fill('2026-09-19');
    const startingScroll = await page.evaluate(() => { window.scrollTo(0, 300); return Math.round(scrollY); });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
      form.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator('[data-problem-code="FINANCE_CASH_DATE_ORDER_INVALID"]')).toBeVisible();
    const timeline = [] as unknown[];
    for (const [at, delay] of [[0,0],[50,50],[250,200],[500,250],[1000,500]] as const) {
      if (delay) await page.waitForTimeout(delay);
      timeline.push({ atMsAfterNoticeVisible: at, ui: await snapshot(page) });
    }
    const final = await snapshot(page);
    await page.screenshot({ path: join(evidenceRoot, 'finance-enhanced-fixed.png') });
    const after = audits();
    writeFileSync(join(evidenceRoot, 'finance-scroll-results.json'), redact({ candidateCommit, role: 'finance', viewport: 390, startingScroll, timeline, final, audits: { before, after }, diagnostics }) + '\n');
    expect(final.focusIsNotice).toBe(true);
    expect(final.noticeTop).toBeGreaterThanOrEqual(final.bannerBottom + 8);
    expect(final.noticeBottom).toBeLessThanOrEqual(844);
    expect(final.from).toBe('2026-09-20');
    expect(final.to).toBe('2026-09-19');
    expect(after).toBe(before);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
  } finally { database.close(); }
});
