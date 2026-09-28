import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '6be0adbaf939a51a7f6349292508cdd29b86c440';

test('Owner sees invalid report period on Directory, Setup, and Authorization tabs', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/supplier'))
      responses.push(
        `${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`,
      );
  });
  const counts = () => ({
    audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
    supplierProfiles: (
      db.prepare('SELECT COUNT(*) count FROM supplier_user_profile').get() as { count: number }
    ).count,
  });
  try {
    await signIn(page, 'owner');
    const before = counts();
    const scenarios = [] as unknown[];
    for (const [index, tab] of ['directory', 'setup', 'authorize'].entries()) {
      const response = await page.goto(
        portal(`/supplier?workspaceAction=${tab}&from=2026-09-20&to=2026-09-19&lang=en`),
      );
      const notice = page.locator(
        '#supplier-period-problem [data-problem-code="SUPPLIER_REPORT_PERIOD_ORDER_INVALID"]',
      );
      await expect(notice).toBeVisible();
      await expect(notice).toBeFocused();
      const ui = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('.supplier-jump-links');
        const buttons = [...(nav?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const active = nav?.querySelector<HTMLButtonElement>('button.active');
        const notice = document.querySelector<HTMLElement>(
          '#supplier-period-problem [data-ui="problem-notice"]',
        );
        const remedy = notice?.querySelector<HTMLAnchorElement>('a');
        const bounds = notice?.getBoundingClientRect();
        return {
          url: location.pathname + location.search,
          activeTabIndex: active ? buttons.indexOf(active) : -1,
          activeTabText: active?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
          noticeCount: document.querySelectorAll(
            '#supplier-period-problem [data-ui="problem-notice"]',
          ).length,
          noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
          focusedNotice: document.activeElement === notice,
          noticeVisible: Boolean(bounds && bounds.top >= 0 && bounds.bottom <= innerHeight),
          remedyText: remedy?.textContent?.trim() ?? null,
          remedyHref: remedy?.getAttribute('href') ?? null,
          scrollY: Math.round(scrollY),
          viewport: { width: innerWidth, height: innerHeight },
        };
      });
      await notice.screenshot({ path: join(evidenceRoot, `${tab}-notice.png`) });
      scenarios.push({ tab, transportStatus: response?.status(), ui });
      expect(response?.status()).toBe(200);
      expect(ui.activeTabIndex).toBe(index);
      expect(ui.noticeCount).toBe(1);
      expect(ui.focusedNotice).toBe(true);
      expect(ui.noticeVisible).toBe(true);
      expect(ui.remedyHref).toContain('workspaceAction=report');
      expect(ui.remedyHref).toContain('from=2026-09-20');
      expect(ui.remedyHref).toContain('to=2026-09-19');
      expect(ui.remedyHref).toContain('lang=en');
      if (tab === 'directory') {
        await Promise.all([
          page.waitForURL((url) => url.searchParams.get('workspaceAction') === 'report'),
          notice.locator('a').click(),
        ]);
        await page.waitForTimeout(250);
        await expect(
          page.locator(
            '#supplier-period-problem [data-problem-code="SUPPLIER_REPORT_PERIOD_ORDER_INVALID"]',
          ),
        ).toBeVisible();
        const report = await page.evaluate(() => ({
          url: location.pathname + location.search,
          activeTabText:
            document
              .querySelector('.supplier-jump-links button.active')
              ?.textContent?.replace(/\s+/gu, ' ')
              .trim() ?? null,
          from: document.querySelector<HTMLInputElement>('#supplier-period-from')?.value ?? null,
          to: document.querySelector<HTMLInputElement>('#supplier-period-to')?.value ?? null,
          noticeCount: document.querySelectorAll(
            '#supplier-period-problem [data-ui="problem-notice"]',
          ).length,
        }));
        scenarios.push({ remedyNavigation: report });
        expect(report.url).toContain('workspaceAction=report');
        expect(report.noticeCount).toBe(1);
      }
    }
    const after = counts();
    writeFileSync(
      join(evidenceRoot, 'results.json'),
      JSON.stringify(
        {
          candidateCommit,
          viewport: 390,
          locale: 'en',
          role: 'owner',
          scenarios,
          noWrite: { before, after },
          responses,
          diagnostics: { pageErrors, consoleErrors },
        },
        (_key, item) =>
          typeof item === 'string'
            ? item.replace(
                /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
                ':record',
              )
            : item,
        2,
      ) + '\n',
    );
    expect(after).toEqual(before);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    db.close();
  }
});
