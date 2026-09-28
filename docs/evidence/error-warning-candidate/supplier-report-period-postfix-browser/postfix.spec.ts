import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'e519cb8ccf3d28b5ce456508967ee0fef38ba618';

function writeResult(value: unknown) {
  writeFileSync(
    join(evidenceRoot, 'results.json'),
    JSON.stringify(
      value,
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
}

function diagnostics(page: Page) {
  const result = {
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    http: [] as string[],
    reportResponses: [] as string[],
  };
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      result.consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/supplier/report'))
      result.reportResponses.push(
        `${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`,
      );
    if (response.status() >= 400 && !response.url().includes('/offline/identity'))
      result.http.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return result;
}

function counts(db: DatabaseSync) {
  return {
    audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
    supplierProfiles: (
      db.prepare('SELECT COUNT(*) count FROM supplier_user_profile').get() as { count: number }
    ).count,
  };
}

async function errorUi(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[action="#supplier-report"]');
    const notice = document.querySelector<HTMLElement>(
      '#supplier-report-period-problem [data-ui="problem-notice"]',
    );
    const bounds = notice?.getBoundingClientRect();
    const input = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const compact = (element: Element | null | undefined) =>
      element?.textContent?.replace(/\s+/gu, ' ').trim() ?? null;
    return {
      url: location.pathname + location.search,
      title: document.title,
      heading: compact(document.querySelector('h1')),
      formPresent: Boolean(form),
      projectValue: form?.querySelector<HTMLSelectElement>('[name="projectId"]')?.value ?? null,
      from: {
        value: input('from')?.value ?? null,
        type: input('from')?.type ?? null,
        error: compact(document.querySelector('#supplier-report-period-from-error')),
      },
      to: {
        value: input('to')?.value ?? null,
        type: input('to')?.type ?? null,
        error: compact(document.querySelector('#supplier-report-period-to-error')),
      },
      noticeCode: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: compact(notice),
      noticeVisible: Boolean(bounds && bounds.top >= 0 && bounds.bottom <= innerHeight),
      remedyLinks: [...(notice?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map((link) => ({
        text: compact(link),
        href: link.getAttribute('href'),
      })),
      focused: document.activeElement?.tagName.toLowerCase() ?? null,
      focusedNotice: document.activeElement === notice,
      focusedSummary: Boolean(
        document.activeElement?.hasAttribute('data-ui') &&
        document.activeElement?.getAttribute('data-ui') === 'validation-summary',
      ),
      reportArticles: document.querySelectorAll('.supplier-report-results article').length,
      downloadCount: document.querySelectorAll<HTMLAnchorElement>(
        '.supplier-report-results a[href*="report.csv"]',
      ).length,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      language: document.documentElement.lang,
    };
  });
}

async function rolePage(
  browser: Browser,
  role: 'owner' | 'worker' | 'worker2',
  width: number,
  locale: 'en' | 'es',
) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
  });
  const page = await context.newPage();
  const events = diagnostics(page);
  await signIn(page, role);
  await page.goto(portal(`/supplier/report?lang=${locale}`));
  return { context, page, events };
}

test('Supplier report explains reversed and malformed periods across delegated roles', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const supplierName = `QA period ${randomUUID().slice(0, 8)}`;
  const workerId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker.email) as {
      id: string;
    }
  ).id;
  const technicianId = (
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.worker2.email) as {
      id: string;
    }
  ).id;
  const ownerSetup = await rolePage(browser, 'owner', 390, 'en');
  const setup = ownerSetup.page;
  const scenarioResults: unknown[] = [];
  try {
    await setup.goto(portal('/supplier?lang=en'));
    await setup.getByRole('button', { name: 'Setup and access', exact: true }).click();
    const create = setup.locator('form[action^="?/createSupplier"]');
    await create.getByLabel('Name', { exact: true }).fill(supplierName);
    await create.getByRole('button').click();
    await expect(setup.getByRole('status').first()).toBeVisible();
    const profile = setup.locator('form[action^="?/setProfile"]');
    await profile.locator('[name="userId"]').selectOption(workerId);
    await profile.locator('[name="supplierId"]').selectOption({ label: supplierName });
    await profile.locator('[name="profile"]').selectOption('supplier_coordinator');
    await profile.getByRole('button').click();
    await expect(setup.getByRole('status').first()).toBeVisible();
    await setup.getByRole('button', { name: 'Setup and access', exact: true }).click();
    await profile.locator('[name="userId"]').selectOption(technicianId);
    await profile.locator('[name="supplierId"]').selectOption({ label: supplierName });
    await profile.locator('[name="profile"]').selectOption('external_technician');
    await profile.getByRole('button').click();
    await expect(setup.getByRole('status').first()).toBeVisible();

    for (const scenario of [
      { role: 'owner' as const, width: 390, locale: 'en' as const },
      { role: 'worker' as const, width: 1440, locale: 'es' as const },
      { role: 'worker2' as const, width: 390, locale: 'en' as const },
    ]) {
      const active =
        scenario.role === 'owner'
          ? ownerSetup
          : await rolePage(browser, scenario.role, scenario.width, scenario.locale);
      const { page, events } = active;
      try {
        if (scenario.role === 'owner')
          await page.goto(portal(`/supplier/report?lang=${scenario.locale}`));
        const initial = await errorUi(page);
        const form = page.locator('form[action="#supplier-report"]');
        await expect(form).toBeVisible();
        await form.locator('[name="from"]').fill('2026-09-20');
        await form.locator('[name="to"]').fill('2026-09-19');
        const before = counts(db);
        await Promise.all([
          page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
          form.locator('button').click(),
        ]);
        await expect(
          page.locator('[data-problem-code="SUPPLIER_REPORT_PERIOD_ORDER_INVALID"]'),
        ).toBeVisible();
        await page.waitForTimeout(250);
        const reversed = await errorUi(page);
        await page.locator('#supplier-report-period-problem').screenshot({
          path: join(
            evidenceRoot,
            `${scenario.role}-${scenario.width}-${scenario.locale}-reversed.png`,
          ),
        });
        const malformedResponse = await page.goto(
          portal(
            `/supplier/report?${new URLSearchParams({
              ...(initial.projectValue ? { projectId: initial.projectValue } : {}),
              from: '2026-13-40',
              to: '2026-09-20',
              lang: scenario.locale,
            })}`,
          ),
        );
        await expect(
          page.locator('[data-problem-code="SUPPLIER_REPORT_PERIOD_DATE_INVALID"]'),
        ).toBeVisible();
        await page.waitForTimeout(250);
        const malformed = await errorUi(page);
        await page.locator('#supplier-report-period-problem').screenshot({
          path: join(
            evidenceRoot,
            `${scenario.role}-${scenario.width}-${scenario.locale}-malformed.png`,
          ),
        });
        const after = counts(db);
        scenarioResults.push({
          role:
            scenario.role === 'worker'
              ? 'supplier_coordinator'
              : scenario.role === 'worker2'
                ? 'external_technician'
                : 'owner',
          locale: scenario.locale,
          width: scenario.width,
          initial,
          reversed: { ui: reversed },
          malformed: { status: malformedResponse?.status(), ui: malformed },
          noWrite: { before, after },
          diagnostics: events,
        });
        writeResult({
          candidateCommit,
          fixtureSetup:
            'Owner created disposable supplier and assigned two disposable worker profiles via rendered Supplier forms',
          scenarios: scenarioResults,
        });
        expect(reversed.noticeCode).toBe('SUPPLIER_REPORT_PERIOD_ORDER_INVALID');
        expect(reversed.to.value).toBe('2026-09-19');
        expect(reversed.to.error).toBeTruthy();
        expect(
          reversed.remedyLinks.some((link) => link.href === '#supplier-report-period-to'),
        ).toBe(true);
        expect(reversed.noticeVisible).toBe(true);
        expect(reversed.reportArticles).toBe(0);
        expect(reversed.downloadCount).toBe(0);
        expect(malformedResponse?.status()).toBe(200);
        expect(malformed.noticeCode).toBe('SUPPLIER_REPORT_PERIOD_DATE_INVALID');
        expect(malformed.from.value).toBe('2026-13-40');
        expect(malformed.from.error).toBeTruthy();
        expect(malformed.from.type).toBe('text');
        expect(malformed.noticeVisible).toBe(true);
        expect(malformed.reportArticles).toBe(0);
        expect(after).toEqual(before);
        expect(events.pageErrors).toEqual([]);
        expect(events.consoleErrors).toEqual([]);
      } finally {
        if (active !== ownerSetup) await active.context.close();
      }
    }
    const workspaceResponse = await ownerSetup.page.goto(
      portal('/supplier?workspaceAction=report&from=2026-09-20&to=2026-09-19&lang=en'),
    );
    const workspace = await ownerSetup.page.evaluate(() => {
      const notice = document.querySelector<HTMLElement>(
        '#supplier-period-problem [data-ui="problem-notice"]',
      );
      return {
        status: document.title,
        url: location.pathname + location.search,
        code: notice?.getAttribute('data-problem-code') ?? null,
        text: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        focused: document.activeElement === notice,
        reportLinkCount: document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="/supplier/report?"]',
        ).length,
      };
    });
    const missingProjectCsv = await ownerSetup.page.evaluate(async (url) => {
      const response = await fetch(url);
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentDisposition: response.headers.get('content-disposition'),
        body: await response.json(),
      };
    }, portal('/supplier/report.csv?lang=en'));
    const validProjectId = (scenarioResults[0] as { initial: { projectValue: string } }).initial
      .projectValue;
    const invalidDateCsv = await ownerSetup.page.evaluate(
      async (url) => {
        const response = await fetch(url);
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          contentDisposition: response.headers.get('content-disposition'),
          body: await response.json(),
        };
      },
      portal(
        `/supplier/report.csv?${new URLSearchParams({ projectId: validProjectId, from: '2026-13-40', to: '2026-09-20', lang: 'en' })}`,
      ),
    );
    const financeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const financePage = await financeContext.newPage();
    await signIn(financePage, 'finance');
    const unauthorizedFinanceCsv = await financePage.evaluate(async (url) => {
      const response = await fetch(url);
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.text(),
      };
    }, portal('/supplier/report.csv?lang=en'));
    await financeContext.close();
    writeResult({
      candidateCommit,
      fixtureSetup:
        'Owner created disposable supplier and assigned two disposable worker profiles via rendered Supplier forms',
      scenarios: scenarioResults,
      workspace: { transportStatus: workspaceResponse?.status(), ui: workspace },
      missingProjectCsv,
      invalidDateCsv,
      unauthorizedFinanceCsv,
    });
    expect(workspace.code).toBe('SUPPLIER_REPORT_PERIOD_ORDER_INVALID');
    expect(workspace.reportLinkCount).toBe(0);
    expect(missingProjectCsv).toMatchObject({
      status: 400,
      contentType: expect.stringContaining('application/problem+json'),
      body: { code: 'SUPPLIER_REPORT_PROJECT_REQUIRED' },
    });
    expect(invalidDateCsv).toMatchObject({
      status: 400,
      contentType: expect.stringContaining('application/problem+json'),
      body: { code: 'SUPPLIER_REPORT_PERIOD_DATE_INVALID' },
    });
  } finally {
    if (!ownerSetup.context.pages().every((page) => page.isClosed()))
      await ownerSetup.context.close().catch(() => {});
    db.close();
  }
});
