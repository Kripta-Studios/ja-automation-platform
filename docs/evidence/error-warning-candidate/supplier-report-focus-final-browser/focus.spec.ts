import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = '4337255b4c8c9cf3406dd62549582076c6d6b4db';

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

test('Supplier report final period, focus, and role-safe CSV problems', async ({ browser }) => {
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
        expect(reversed.to.error).not.toContain('problem.supplier.');
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
    await expect(
      ownerSetup.page.locator('#supplier-period-problem [data-ui="problem-notice"]'),
    ).toBeVisible();
    await ownerSetup.page.waitForTimeout(250);
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
    const directoryResponse = await ownerSetup.page.goto(
      portal('/supplier?workspaceAction=directory&from=2026-09-20&to=2026-09-19&lang=en'),
    );
    const directory = await ownerSetup.page.evaluate(() => {
      const notice = document.querySelector<HTMLElement>(
        '#supplier-period-problem [data-ui="problem-notice"]',
      );
      return {
        url: location.pathname + location.search,
        title: document.title,
        noticeCount: document.querySelectorAll(
          '#supplier-period-problem [data-ui="problem-notice"]',
        ).length,
        noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        active: document.activeElement?.tagName.toLowerCase() ?? null,
        selectedWorkspace:
          document
            .querySelector('[aria-selected="true"]')
            ?.textContent?.replace(/\s+/gu, ' ')
            .trim() ?? null,
      };
    });
    const unauthorizedCsv = [] as Array<{
      role: 'finance' | 'manager';
      status: number;
      contentType: string | null;
      body: string;
    }>;
    for (const role of ['finance', 'manager'] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const rolePage = await context.newPage();
      await signIn(rolePage, role);
      const response = await rolePage.evaluate(async (url) => {
        const response = await fetch(url);
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: (await response.text()).slice(0, 220),
        };
      }, portal('/supplier/report.csv?from=2026-13-40&to=2026-09-20&lang=es'));
      unauthorizedCsv.push({ role, ...response });
      await context.close();
    }
    writeResult({
      candidateCommit,
      fixtureSetup:
        'Owner created disposable supplier and assigned two disposable worker profiles via rendered Supplier forms',
      scenarios: scenarioResults,
      workspace: { transportStatus: workspaceResponse?.status(), ui: workspace },
      directory: { transportStatus: directoryResponse?.status(), ui: directory },
      missingProjectCsv,
      invalidDateCsv,
      unauthorizedCsv,
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
    expect(unauthorizedCsv.map((response) => response.status)).toEqual([403, 403]);
    expect(
      scenarioResults.map(
        (item) =>
          (item as { reversed: { ui: { focusedNotice: boolean } } }).reversed.ui.focusedNotice,
      ),
    ).toEqual([true, true, true]);
    expect(workspace.focused).toBe(true);
  } finally {
    if (!ownerSetup.context.pages().every((page) => page.isClosed()))
      await ownerSetup.context.close().catch(() => {});
    db.close();
  }
});

test('Supplier report Owner focus timeline after enhanced filter navigation', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/supplier/report'))
      responses.push(
        `${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`,
      );
  });
  await signIn(page, 'owner');
  await page.goto(portal('/supplier/report?lang=en'));
  const form = page.locator('form[action="#supplier-report"]');
  await form.locator('[name="from"]').fill('2026-09-20');
  await form.locator('[name="to"]').fill('2026-09-19');
  await page.evaluate(() => {
    const timeline: Array<{ ms: number; event: string; target: string; active: string }> = [];
    const zero = performance.now();
    const label = (element: Element | null) =>
      element
        ? `${element.tagName.toLowerCase()}#${element.id}[${element.getAttribute('data-ui') ?? ''}]`
        : 'null';
    (
      window as typeof window & { __supplierFocusTimeline?: typeof timeline }
    ).__supplierFocusTimeline = timeline;
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...args) {
      timeline.push({
        ms: Math.round(performance.now() - zero),
        event: 'focus-call',
        target: label(this),
        active: label(document.activeElement),
      });
      originalFocus.apply(this, args);
      timeline.push({
        ms: Math.round(performance.now() - zero),
        event: 'focus-return',
        target: label(this),
        active: label(document.activeElement),
      });
    };
    document.addEventListener('focusin', (event) =>
      timeline.push({
        ms: Math.round(performance.now() - zero),
        event: 'focusin',
        target: label(event.target as Element),
        active: label(document.activeElement),
      }),
    );
  });
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
    form.locator('button').click(),
  ]);
  await expect(
    page.locator('[data-problem-code="SUPPLIER_REPORT_PERIOD_ORDER_INVALID"]'),
  ).toBeVisible();
  const samples: unknown[] = [];
  const sample = async (offset: number) => {
    if (offset) await page.waitForTimeout(offset);
    samples.push(
      await page.evaluate(() => {
        const notice = document.querySelector<HTMLElement>(
          '#supplier-report-period-problem [data-ui="problem-notice"]',
        );
        const bounds = notice?.getBoundingClientRect();
        return {
          url: location.pathname + location.search,
          active: document.activeElement?.tagName.toLowerCase(),
          activeId: document.activeElement?.id,
          activeUi: document.activeElement?.getAttribute('data-ui'),
          noticePresent: Boolean(notice),
          noticeConnected: notice?.isConnected ?? false,
          noticeTabindex: notice?.getAttribute('tabindex') ?? null,
          focusedNotice: document.activeElement === notice,
          noticeVisible: Boolean(bounds && bounds.top >= 0 && bounds.bottom <= innerHeight),
          scrollY: Math.round(scrollY),
        };
      }),
    );
  };
  await sample(0);
  await sample(50);
  await sample(200);
  await sample(250);
  await sample(500);
  const manualFocus = await page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>(
      '#supplier-report-period-problem [data-ui="problem-notice"]',
    );
    notice?.focus();
    return {
      focusedNotice: document.activeElement === notice,
      active: document.activeElement?.tagName.toLowerCase(),
    };
  });
  await page.waitForTimeout(150);
  const afterManual = await page.evaluate(() => ({
    active: document.activeElement?.tagName.toLowerCase(),
    focusedNotice:
      document.activeElement ===
      document.querySelector('#supplier-report-period-problem [data-ui="problem-notice"]'),
  }));
  const focusLog = await page.evaluate(
    () =>
      (window as typeof window & { __supplierFocusTimeline?: unknown[] }).__supplierFocusTimeline ??
      [],
  );
  writeFileSync(
    join(evidenceRoot, `focus-timeline-repeat-${info.repeatEachIndex}.json`),
    JSON.stringify(
      {
        candidateCommit,
        role: 'owner',
        viewport: 390,
        locale: 'en',
        samples,
        manualFocus,
        afterManual,
        focusLog,
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
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(samples.slice(1).every((item) => (item as { focusedNotice: boolean }).focusedNotice)).toBe(
    true,
  );
});
