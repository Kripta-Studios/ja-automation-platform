import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page, type Response as PlaywrightResponse } from '@playwright/test';
import { portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'd9c212ba93625ff9fe37802c771291a1ecfb42de';
const absentId = '00000000-0000-4000-8000-000000000777';
const redact = (value: unknown) =>
  JSON.stringify(
    value,
    (_key, item) =>
      typeof item === 'string'
        ? item
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
            .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, ':record')
        : item,
    2,
  );

function observe(page: Page) {
  const output = { pageErrors: [] as string[], consoleErrors: [] as string[], downloads: 0 };
  page.on('pageerror', (error) => output.pageErrors.push(error.message.slice(0, 160)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      output.consoleErrors.push(message.text().slice(0, 160));
  });
  page.on('download', () => {
    output.downloads += 1;
  });
  return output;
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>(
      '.invoice-pdf-panel__problem [data-ui="problem-notice"]',
    );
    const bounds = notice?.getBoundingClientRect();
    const action = document.querySelector<HTMLElement>('#invoice-draft-preview-action');
    return {
      path: location.pathname.replace(/\/billing\/invoices\/[^/]+/u, '/billing/invoices/:record'),
      lang: document.documentElement.lang,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: Math.round(scrollY),
      noticeCode: notice?.getAttribute('data-problem-code') ?? null,
      noticeText: notice?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
      noticeTop: bounds?.top ?? null,
      noticeBottom: bounds?.bottom ?? null,
      headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? null,
      activeNotice: document.activeElement === notice,
      activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
      remedies: [...(notice?.querySelectorAll('a') ?? [])].map((link) => ({
        text: link.textContent?.trim() ?? '',
        href:
          link
            .getAttribute('href')
            ?.replace(/\/billing\/invoices\/[^/?#]+/u, '/billing/invoices/:record') ?? null,
      })),
      actionHref:
        action
          ?.getAttribute('href')
          ?.replace(/\/api\/invoices\/[^/?#]+/u, '/api/invoices/:record') ?? null,
      actionVisible: Boolean(action && action.getBoundingClientRect().width > 0),
      actionDisabled: action?.getAttribute('aria-disabled') ?? null,
    };
  });
}

function dbStats(db: DatabaseSync) {
  return {
    invoices: (db.prepare('SELECT COUNT(*) count FROM invoice').get() as { count: number }).count,
    audits: (db.prepare('SELECT COUNT(*) count FROM audit_event').get() as { count: number }).count,
  };
}

async function invoiceLinks(page: Page) {
  const response = await page.goto(portal('/billing?view=invoices&lang=en'), {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator('tr[data-invoice-row][data-invoice-state]').first()).toBeAttached();
  return page.locator('tr[data-invoice-row][data-invoice-state]').evaluateAll((rows) =>
    rows
      .map((row) => ({
        state: row.getAttribute('data-invoice-state') ?? '',
        href: row.querySelector('a[href*="/billing/invoices/"]')?.getAttribute('href') ?? '',
      }))
      .filter((row) => row.href),
  );
}

async function successfulDraft(page: Page, links: Awaited<ReturnType<typeof invoiceLinks>>) {
  const attempts = [] as Array<{ state: string; status: number; contentType: string | null }>;
  for (const link of links.filter((row) => row.state === 'draft')) {
    const id = new URL(link.href, portal()).pathname.split('/').at(-1)!;
    const response = await page.request.get(portal(`/api/invoices/${id}/draft-preview?lang=en`));
    attempts.push({
      state: link.state,
      status: response.status(),
      contentType: response.headers()['content-type'] ?? null,
    });
    if (
      response.status() === 200 &&
      response.headers()['content-type']?.startsWith('application/pdf')
    )
      return { href: link.href, id, attempts };
  }
  return { href: null, id: null, attempts };
}

function problemNetwork(response: PlaywrightResponse, payload: unknown) {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    status: response.status(),
    contentType: response.headers()['content-type'] ?? null,
    disposition: response.headers()['content-disposition'] ?? null,
    code: data.code ?? null,
    messageKey: data.messageKey ?? null,
    remedies: Array.isArray(data.remedies)
      ? data.remedies.map((item) =>
          item && typeof item === 'object' ? (item as Record<string, unknown>).id : null,
        )
      : [],
  };
}

async function routedProblem(
  page: Page,
  diagnostics: ReturnType<typeof observe>,
  replacementId: string,
  label: string,
  code: string,
  screenshot = false,
) {
  const originalPath = new URL(page.url()).pathname;
  const originalScroll = await page.evaluate(() => {
    window.scrollTo(0, 260);
    return Math.round(scrollY);
  });
  const beforeDownloads = diagnostics.downloads;
  await page.route(
    '**/app/api/invoices/*/draft-preview?*',
    async (route) => {
      const replacement = new URL(route.request().url());
      replacement.pathname = replacement.pathname.replace(
        /\/invoices\/[^/]+\/draft-preview/u,
        `/invoices/${replacementId}/draft-preview`,
      );
      await route.continue({ url: replacement.toString() });
    },
    { times: 1 },
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/draft-preview') && [404, 409].includes(response.status()),
    { timeout: 20_000 },
  );
  await page.locator('#invoice-draft-preview-action').click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => null);
  await expect(page.locator(`[data-problem-code="${code}"]`)).toBeVisible();
  await page.waitForTimeout(120);
  const ui = await snapshot(page);
  if (screenshot)
    await page
      .locator('.invoice-pdf-panel__problem')
      .screenshot({ path: join(evidenceRoot, `${label}.png`) });
  return {
    label,
    originalScroll,
    samePath: new URL(page.url()).pathname === originalPath,
    network: problemNetwork(response, payload),
    ui,
    downloadDelta: diagnostics.downloads - beforeDownloads,
  };
}

// Each role has a separate browser context from Playwright's page fixture. Errors are tested on
// rendered invoice detail, while the browser route sends the fetch to an unavailable/issued ID.
for (const roleCase of [
  { role: 'owner' as const, width: 390, height: 844, locale: 'en' },
  { role: 'finance' as const, width: 1440, height: 900, locale: 'es' },
  { role: 'owner' as const, width: 390, height: 844, locale: 'pt' },
]) {
  test(`${roleCase.role} ${roleCase.locale} preview recovery and valid PDF`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: roleCase.width, height: roleCase.height });
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    const diagnostics = observe(page);
    const output: Record<string, unknown> = { candidateCommit, roleCase, diagnostics };
    try {
      await signIn(page, roleCase.role);
      const links = await invoiceLinks(page);
      output.invoiceStateCounts = Object.fromEntries(
        [...new Set(links.map((link) => link.state))].map((state) => [
          state,
          links.filter((link) => link.state === state).length,
        ]),
      );
      const success = await successfulDraft(page, links);
      output.successCandidate = { available: Boolean(success.href), attempts: success.attempts };
      expect(success.href, 'seeded draft with a valid PDF preview').toBeTruthy();
      const issued = links.find((link) => link.state === 'issued');
      expect(issued?.href, 'seeded issued invoice').toBeTruthy();
      const issuedId = new URL(issued!.href, portal()).pathname.split('/').at(-1)!;
      await page.goto(`${new URL(success.href!, portal()).toString()}?lang=${roleCase.locale}`);
      await expect(page.locator('#invoice-draft-preview-action')).toBeVisible();
      output.initial = await snapshot(page);
      const before = dbStats(db);
      output.unavailable = await routedProblem(
        page,
        diagnostics,
        absentId,
        `${roleCase.role}-${roleCase.locale}-unavailable`,
        'INVOICE_DRAFT_PREVIEW_INVOICE_UNAVAILABLE',
        roleCase.locale === 'en',
      );
      output.issued = await routedProblem(
        page,
        diagnostics,
        issuedId,
        `${roleCase.role}-${roleCase.locale}-issued`,
        'INVOICE_DRAFT_PREVIEW_STATE_UNAVAILABLE',
        roleCase.locale === 'es',
      );
      output.afterFailures = dbStats(db);
      output.failuresNoWrite = JSON.stringify(before) === JSON.stringify(output.afterFailures);
      const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/draft-preview') && response.status() === 200,
        { timeout: 20_000 },
      );
      await page.locator('#invoice-draft-preview-action').click();
      const [download, response] = await Promise.all([downloadPromise, responsePromise]);
      const path = await download.path();
      output.success = {
        status: response.status(),
        contentType: response.headers()['content-type'] ?? null,
        dispositionMatchesLocale:
          response.headers()['content-disposition']?.endsWith(`-${roleCase.locale}.pdf"`) ?? false,
        filenameMatchesLocale: download.suggestedFilename().endsWith(`-${roleCase.locale}.pdf`),
        magic: path ? readFileSync(path).subarray(0, 5).toString() : null,
        ui: await snapshot(page),
      };
      expect((output.success as { magic: string }).magic).toBe('%PDF-');
      expect(diagnostics.pageErrors).toEqual([]);
    } finally {
      db.close();
      writeFileSync(
        join(evidenceRoot, `${roleCase.role}-${roleCase.locale}-results.json`),
        redact(output) + '\n',
      );
    }
  });
}

test('manager and signed-out direct preview receive typed role-safe problems', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const output: Record<string, unknown> = { candidateCommit };
  try {
    await signIn(page, 'manager');
    const response = await page.request.get(
      portal(`/api/invoices/${absentId}/draft-preview?lang=es`),
    );
    output.manager = {
      status: response.status(),
      contentType: response.headers()['content-type'],
      payload: await response.json(),
    };
    const anonymous = await browser.newContext();
    try {
      const unauthenticated = await anonymous.request.get(
        portal(`/api/invoices/${absentId}/draft-preview?lang=pt`),
      );
      output.signedOut = {
        status: unauthenticated.status(),
        contentType: unauthenticated.headers()['content-type'],
        payload: await unauthenticated.json(),
      };
    } finally {
      await anonymous.close();
    }
  } finally {
    writeFileSync(join(evidenceRoot, 'role-results.json'), redact(output) + '\n');
  }
});

test('owner network uncertainty waits for explicit retry and keeps invoice page', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const diagnostics = observe(page);
  const output: Record<string, unknown> = { candidateCommit, diagnostics };
  try {
    await signIn(page, 'owner');
    const links = await invoiceLinks(page);
    const draft = await successfulDraft(page, links);
    expect(draft.href).toBeTruthy();
    await page.goto(`${new URL(draft.href!, portal()).toString()}?lang=en`);
    await expect(page.locator('#invoice-draft-preview-action')).toBeVisible();
    let requests = 0;
    await page.route(
      '**/app/api/invoices/*/draft-preview?*',
      async (route) => {
        requests += 1;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.locator('#invoice-draft-preview-action').click();
    await expect(
      page.locator('[data-problem-code="INVOICE_DRAFT_PREVIEW_NETWORK_UNAVAILABLE"]'),
    ).toBeVisible();
    await page.waitForTimeout(500);
    output.failure = { requests, ui: await snapshot(page), downloads: diagnostics.downloads };
    const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
    await page
      .locator('.invoice-pdf-panel__problem a[href="#invoice-draft-preview-action"]')
      .click();
    const download = await downloadPromise;
    output.retry = {
      requests,
      filenameMatches: download.suggestedFilename().endsWith('-en.pdf'),
      ui: await snapshot(page),
      downloads: diagnostics.downloads,
    };
  } finally {
    writeFileSync(join(evidenceRoot, 'network-results.json'), redact(output) + '\n');
  }
});

test('owner two-tab issued-state change blocks stale draft preview', async ({ page, context }) => {
  test.setTimeout(150_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  const diagnostics = observe(page);
  const output: Record<string, unknown> = { candidateCommit, diagnostics };
  try {
    await signIn(page, 'owner');
    const links = await invoiceLinks(page);
    const draft = await successfulDraft(page, links);
    expect(draft.href).toBeTruthy();
    await page.goto(`${new URL(draft.href!, portal()).toString()}?lang=en`);
    await expect(page.locator('#invoice-draft-preview-action')).toBeVisible();
    const other = await context.newPage();
    await other.setViewportSize({ width: 1440, height: 900 });
    try {
      await other.goto(portal('/billing?view=invoices&lang=en'));
      const row = other.locator(`tr[data-invoice-row="${draft.id}"]`);
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: 'Manage' }).click();
      const approve = other.locator('form[action="?/approveInvoice"]');
      await expect(approve).toBeVisible();
      await approve.getByRole('button', { name: 'Approve' }).click();
      await other.waitForTimeout(350);
      output.afterApprove = {
        state: (
          db.prepare('SELECT state FROM invoice WHERE id=?').get(draft.id) as { state: string }
        ).state,
        visibleProblemCodes: await other
          .locator('[data-problem-code]')
          .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-problem-code'))),
      };
      const issue = other.locator('form[action="?/issueInvoice"]');
      if (!(await issue.isVisible())) {
        const updatedRow = other.locator(`tr[data-invoice-row="${draft.id}"]`);
        if (await updatedRow.isVisible())
          await updatedRow.getByRole('button', { name: 'Manage' }).click();
      }
      if (await issue.isVisible()) {
        await issue.getByRole('button', { name: 'Issue invoice' }).click();
        await other.waitForTimeout(800);
      }
      output.afterIssue = {
        state: (
          db.prepare('SELECT state FROM invoice WHERE id=?').get(draft.id) as { state: string }
        ).state,
        visibleProblemCodes: await other
          .locator('[data-problem-code]')
          .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-problem-code'))),
      };
    } finally {
      await other.close();
    }
    if ((output.afterIssue as { state: string }).state === 'issued') {
      const before = dbStats(db);
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/draft-preview') && response.status() === 409,
      );
      await page.locator('#invoice-draft-preview-action').click();
      const response = await responsePromise;
      output.stale = {
        network: problemNetwork(response, await response.json()),
        ui: await snapshot(page),
        before,
        after: dbStats(db),
        downloads: diagnostics.downloads,
      };
      await page
        .locator('.invoice-pdf-panel__problem')
        .screenshot({ path: join(evidenceRoot, 'owner-stale-issued.png') });
      expect((output.stale as { network: { code: string } }).network.code).toBe(
        'INVOICE_DRAFT_PREVIEW_STATE_UNAVAILABLE',
      );
    } else output.stale = 'not reached through available UI lifecycle in this fixture';
  } finally {
    db.close();
    writeFileSync(join(evidenceRoot, 'stale-results.json'), redact(output) + '\n');
  }
});

test('owner and finance issuer setup remedy is role safe when fixture has a blocked draft', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const output: Record<string, unknown> = { candidateCommit, roles: [] };
  try {
    for (const role of ['owner', 'finance'] as const) {
      await page.context().clearCookies();
      await signIn(page, role);
      const links = await invoiceLinks(page);
      const candidates = [] as Array<{ status: number; code: string | null }>;
      let blockedId: string | null = null;
      let blockedCode: string | null = null;
      for (const link of links.filter((row) => row.state === 'draft')) {
        const id = new URL(link.href, portal()).pathname.split('/').at(-1)!;
        const response = await page.request.get(
          portal(`/api/invoices/${id}/draft-preview?lang=en`),
        );
        const payload = response.headers()['content-type']?.includes('json')
          ? ((await response.json()) as { code?: string })
          : null;
        const code = payload?.code ?? null;
        candidates.push({ status: response.status(), code });
        if (
          !blockedId &&
          code &&
          [
            'INVOICE_DRAFT_PREVIEW_ISSUER_MISSING',
            'INVOICE_DRAFT_PREVIEW_ISSUER_NOT_EFFECTIVE',
            'INVOICE_DRAFT_PREVIEW_CURRENCY_MISMATCH',
          ].includes(code)
        ) {
          blockedId = id;
          blockedCode = code;
        }
      }
      const roleOutput: Record<string, unknown> = {
        role,
        candidates,
        setupBlockedDraftAvailable: Boolean(blockedId),
      };
      if (blockedId && blockedCode) {
        const success = await successfulDraft(page, links);
        expect(success.href).toBeTruthy();
        await page.goto(`${new URL(success.href!, portal()).toString()}?lang=en`);
        roleOutput.problem = await routedProblem(
          page,
          observe(page),
          blockedId,
          `${role}-issuer-setup`,
          blockedCode,
          role === 'owner',
        );
        if (role === 'owner') {
          await page
            .locator('.invoice-pdf-panel__problem a[href*="#project-issuing-authority"]')
            .click();
          await page.waitForURL(
            (url) =>
              url.pathname.endsWith('/app/finance') && url.hash === '#project-issuing-authority',
          );
          roleOutput.remedyNavigation = {
            financePage: new URL(page.url()).pathname.endsWith('/app/finance'),
            commercialView: new URL(page.url()).searchParams.get('view') === 'commercial',
            projectRetained: Boolean(new URL(page.url()).searchParams.get('project')),
            targetPresent: (await page.locator('#project-issuing-authority').count()) > 0,
            targetVisible: await page.locator('#project-issuing-authority').isVisible(),
          };
        }
      }
      (output.roles as unknown[]).push(roleOutput);
    }
  } finally {
    writeFileSync(join(evidenceRoot, 'issuer-results.json'), redact(output) + '\n');
  }
});

test('native no-JavaScript preview link downloads only a valid PDF', async ({ page, browser }) => {
  test.setTimeout(100_000);
  const output: Record<string, unknown> = { candidateCommit };
  await signIn(page, 'owner');
  const links = await invoiceLinks(page);
  const draft = await successfulDraft(page, links);
  expect(draft.href).toBeTruthy();
  const native = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    storageState: await page.context().storageState(),
    acceptDownloads: true,
  });
  try {
    const documentPage = await native.newPage();
    const detail = await documentPage.goto(`${new URL(draft.href!, portal()).toString()}?lang=en`, {
      waitUntil: 'domcontentloaded',
    });
    output.detailStatus = detail?.status() ?? null;
    const link = documentPage.locator('#invoice-draft-preview-action');
    await expect(link).toBeVisible();
    output.nativeHrefPresent = Boolean(await link.getAttribute('href'));
    const downloadPromise = documentPage.waitForEvent('download', { timeout: 20_000 });
    await link.click();
    const download = await downloadPromise;
    const path = await download.path();
    output.download = {
      filenameMatchesLocale: download.suggestedFilename().endsWith('-en.pdf'),
      magic: path ? readFileSync(path).subarray(0, 5).toString() : null,
    };
    const invalid = await documentPage.goto(
      portal(`/api/invoices/${absentId}/draft-preview?lang=en`),
    );
    output.invalid = {
      status: invalid?.status() ?? null,
      contentType: invalid?.headers()['content-type'] ?? null,
      visibleCode:
        (await documentPage.locator('body').textContent())?.includes(
          'INVOICE_DRAFT_PREVIEW_INVOICE_UNAVAILABLE',
        ) ?? false,
    };
  } finally {
    await native.close();
    writeFileSync(join(evidenceRoot, 'native-results.json'), redact(output) + '\n');
  }
});
