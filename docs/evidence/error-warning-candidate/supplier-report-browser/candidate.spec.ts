import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';
import {
  seedSupplierPersonas,
  signInManualPersona,
} from '../../../../tests/e2e/manual-persona-fixture.js';

type Role = 'owner' | 'manager' | 'supplier_coordinator' | 'external_technician';

async function rolePage(browser: Browser, role: Role, width: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
  });
  const page = await context.newPage();
  if (role === 'owner' || role === 'manager') await signIn(page, role);
  else if (role === 'supplier_coordinator') await signInManualPersona(page, 'supplierCoordinator');
  else await signIn(page, 'worker2');
  return page;
}

async function noticeState(page: Page, selector: string) {
  return page.locator(selector).evaluate((notice) => {
    const bounds = notice.getBoundingClientRect();
    return {
      code: notice.getAttribute('data-problem-code'),
      text: notice.textContent?.replace(/\s+/gu, ' ').trim(),
      focused: document.activeElement === notice,
      visible: bounds.top >= 0 && bounds.bottom <= innerHeight,
      width: innerWidth,
      scrollY: Math.round(scrollY),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

test('Supplier report candidate: roles, locales, filters, CSV and stale project', async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const databasePath = readE2EFixturePointer().databasePath;
  const projectId = seedSupplierPersonas(databasePath);
  const results: Array<Record<string, unknown>> = [];
  const pages: Page[] = [];
  const diagnostics: string[] = [];
  try {
    for (const scenario of [
      { role: 'owner' as const, width: 390, locale: 'en' as const },
      { role: 'supplier_coordinator' as const, width: 1440, locale: 'es' as const },
      { role: 'external_technician' as const, width: 390, locale: 'pt' as const },
    ]) {
      const page = await rolePage(browser, scenario.role, scenario.width);
      pages.push(page);
      page.on('pageerror', (error) => diagnostics.push(`${scenario.role}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
          diagnostics.push(`${scenario.role}: ${message.text()}`);
      });
      const query = new URLSearchParams({
        projectId,
        from: '2026-09-27',
        to: '2026-09-27',
        lang: scenario.locale,
      });
      const response = await page.goto(portal(`/supplier/report?${query}`));
      expect(response?.status()).toBe(200);
      await expect(page.locator('#supplier-report-download')).toBeVisible();
      await expect(page.locator('.supplier-report-results')).toContainText(
        /check the dates|revisa las fechas|reveja as datas/i,
      );
      const empty = await page.locator('.supplier-report-results').evaluate((element) => ({
        text: element.textContent?.replace(/\s+/gu, ' ').trim(),
        rows: element.querySelectorAll('article').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(empty.rows).toBe(0);
      expect(empty.overflow).toBe(false);

      const form = page.locator('form[action="#supplier-report"]');
      await form.locator('[name="from"]').fill('2026-09-28');
      await form.locator('[name="to"]').fill('2026-09-27');
      await form.locator('button').scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => Math.round(scrollY));
      await form.locator('button').click();
      const notice = page.locator('#supplier-report-period-problem [data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute(
        'data-problem-code',
        'SUPPLIER_REPORT_PERIOD_ORDER_INVALID',
      );
      await page.waitForTimeout(250);
      const reversed = await noticeState(
        page,
        '#supplier-report-period-problem [data-ui="problem-notice"]',
      );
      await notice.screenshot({
        path: join(
          import.meta.dirname,
          `${scenario.role}-${scenario.width}-${scenario.locale}-period.png`,
        ),
      });
      const retained = await form.evaluate((element) => ({
        project: (element.querySelector('[name="projectId"]') as HTMLSelectElement).value,
        from: (element.querySelector('[name="from"]') as HTMLInputElement).value,
        to: (element.querySelector('[name="to"]') as HTMLInputElement).value,
        locale: (element.querySelector('[name="lang"]') as HTMLSelectElement).value,
      }));
      expect(retained).toMatchObject({
        project: projectId,
        from: '2026-09-28',
        to: '2026-09-27',
        locale: scenario.locale,
      });
      expect(reversed.visible).toBe(true);
      expect(reversed.overflow).toBe(false);
      expect(reversed.text).not.toMatch(
        /problem\.supplier|The action could not be completed|Check submitted values/i,
      );
      expect(await page.locator('#supplier-report-period-to-error').isVisible()).toBe(true);
      results.push({
        role: scenario.role,
        width: scenario.width,
        locale: scenario.locale,
        emptyCopy: empty.text?.replace(
          /Manual role guides synthetic installation/gu,
          '[QA project]',
        ),
        reversed: {
          status: 200,
          ...reversed,
          scrollBefore,
          requestedScroll: new URL(page.url()).searchParams.get('viewportScrollY'),
          retained: { ...retained, project: '[QA project]' },
        },
      });
    }

    const owner = pages[0];
    const valid = new URLSearchParams({
      projectId,
      from: '2026-09-27',
      to: '2026-09-27',
      lang: 'en',
    });
    await owner.goto(portal(`/supplier/report?${valid}`));
    const download = owner.waitForEvent('download');
    await owner.locator('#supplier-report-download').click();
    const csvDownload = await download;
    expect(csvDownload.suggestedFilename()).toMatch(/^operational-report-.*\.csv$/);
    expect(await csvDownload.failure()).toBeNull();
    for (const simulated of [
      {
        status: 409,
        code: 'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
        key: 'problem.supplier.reportProjectScopeChanged',
        remedy: 'contact_owner',
      },
      {
        status: 503,
        code: 'SUPPLIER_REPORT_SERVICE_UNAVAILABLE',
        key: 'problem.supplier.reportServiceUnavailable',
        remedy: 'retry_supplier_report_download',
      },
    ]) {
      await owner.route('**/supplier/report.csv?**', async (route) =>
        route.fulfill({
          status: simulated.status,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            success: false,
            code: simulated.code,
            messageKey: simulated.key,
            params: {},
            fieldErrors: {},
            remedies: [{ id: simulated.remedy }],
            correlationId: 'qa-supplier-report-ref',
          }),
        }),
      );
      await owner.locator('#supplier-report-download').click();
      const notice = owner.locator('.csv-problem-container [data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute('data-problem-code', simulated.code);
      await owner.waitForTimeout(100);
      const state = await noticeState(owner, '.csv-problem-container [data-ui="problem-notice"]');
      if (simulated.status === 503)
        await notice.screenshot({
          path: join(import.meta.dirname, 'owner-390-en-simulated-503.png'),
        });
      expect(state.text?.length).toBeGreaterThan(40);
      expect(state.focused).toBe(true);
      expect(state.visible).toBe(true);
      results.push({
        simulatedCsv: {
          status: simulated.status,
          code: state.code,
          text: state.text,
          focused: state.focused,
          visible: state.visible,
          overflow: state.overflow,
        },
      });
      await owner.unroute('**/supplier/report.csv?**');
    }
    const malformed = await owner.request.get(
      portal(
        `/supplier/report.csv?${new URLSearchParams({ projectId, from: '2026-13-40', to: '2026-09-27', lang: 'en' })}`,
      ),
    );
    expect(malformed.status()).toBe(400);
    expect(malformed.headers()['content-type']).toContain('application/problem+json');
    expect((await malformed.json()).code).toBe('SUPPLIER_REPORT_PERIOD_DATE_INVALID');
    const missing = await owner.request.get(portal('/supplier/report.csv?lang=en'));
    expect(missing.status()).toBe(400);
    expect((await missing.json()).code).toBe('SUPPLIER_REPORT_PROJECT_REQUIRED');
    const unauth = await browser.newContext();
    const unauthResponse = await unauth.request.get(portal(`/supplier/report.csv?${valid}`));
    expect(unauthResponse.status()).toBe(401);
    expect((await unauthResponse.json()).code).toBe('SUPPLIER_REPORT_SIGN_IN_REQUIRED');
    await unauth.close();
    const manager = await rolePage(browser, 'manager', 1440);
    pages.push(manager);
    const forbidden = await manager.request.get(portal(`/supplier/report.csv?${valid}`));
    expect(forbidden.status()).toBe(403);
    expect((await forbidden.json()).code).toBe('SUPPLIER_REPORT_ROLE_REQUIRED');
    results.push({
      csv: {
        download: '200 text/csv attachment',
        malformed: 400,
        missing: 400,
        signIn: 401,
        role: 403,
      },
    });

    const db = new DatabaseSync(databasePath);
    try {
      db.prepare("UPDATE project SET status='closing' WHERE id=?").run(projectId);
    } finally {
      db.close();
    }
    const staleResponse = await owner.request.get(portal(`/supplier/report.csv?${valid}`));
    expect(staleResponse.status()).toBe(404);
    expect((await staleResponse.json()).code).toBe('SUPPLIER_REPORT_PROJECT_UNAVAILABLE');
    const staleFetch = owner.waitForResponse(
      (response) => response.url().includes('/supplier/report.csv') && response.status() === 404,
    );
    await owner.locator('#supplier-report-download').click();
    await staleFetch;
    const staleDownloadNotice = owner.locator('.csv-problem-container [data-ui="problem-notice"]');
    await expect(staleDownloadNotice).toHaveAttribute(
      'data-problem-code',
      'SUPPLIER_REPORT_PROJECT_UNAVAILABLE',
    );
    await owner.waitForTimeout(100);
    const staleDownload = await noticeState(
      owner,
      '.csv-problem-container [data-ui="problem-notice"]',
    );
    expect(staleDownload.focused).toBe(true);
    expect(staleDownload.visible).toBe(true);
    expect(await owner.locator('[name="projectId"]').inputValue()).toBe(projectId);
    const ownerResponse = await owner.goto(portal(`/supplier/report?${valid}`));
    expect(ownerResponse?.status()).toBe(200);
    const ownerNotice = owner.locator(
      '#supplier-report-project-problem [data-ui="problem-notice"]',
    );
    await expect(ownerNotice).toHaveAttribute(
      'data-problem-code',
      'SUPPLIER_REPORT_PROJECT_UNAVAILABLE',
    );
    await expect(ownerNotice.locator('a')).toBeVisible();
    await owner.waitForTimeout(250);
    const ownerStale = await noticeState(
      owner,
      '#supplier-report-project-problem [data-ui="problem-notice"]',
    );
    const coordinator = pages[1];
    const scopedResponse = await coordinator.goto(
      portal(
        `/supplier/report?${new URLSearchParams({ projectId, from: '2026-09-27', to: '2026-09-27', lang: 'es' })}`,
      ),
    );
    expect(scopedResponse?.status()).toBe(200);
    const scopeNotice = coordinator.locator(
      '#supplier-report-project-problem [data-ui="problem-notice"]',
    );
    await expect(scopeNotice).toHaveAttribute(
      'data-problem-code',
      'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
    );
    await coordinator.waitForTimeout(250);
    const scope = await noticeState(
      coordinator,
      '#supplier-report-project-problem [data-ui="problem-notice"]',
    );
    expect(scope.text).not.toContain('Manual role guides synthetic installation');
    results.push({
      stale: {
        csv: 404,
        download: {
          ...staleDownload,
          text: staleDownload.text?.replace(
            /Manual role guides synthetic installation/gu,
            '[QA project]',
          ),
        },
        owner: {
          ...ownerStale,
          text: ownerStale.text?.replace(
            /Manual role guides synthetic installation/gu,
            '[QA project]',
          ),
        },
        coordinator: scope,
      },
    });
    expect(diagnostics).toEqual([]);
    console.log(JSON.stringify({ commit: '847e99e', scenarios: results, diagnostics }, null, 2));
  } finally {
    for (const page of pages)
      await page
        .context()
        .close()
        .catch(() => {});
  }
});
