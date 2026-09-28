import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { e2eCredentials, portal, signIn } from '../../../../tests/e2e/auth.js';
import { readE2EFixturePointer } from '../../../../tests/e2e/environment.js';

const evidenceRoot = import.meta.dirname;
const candidateCommit = 'b9f46b30660284fc34985cb621637ac74040a7ed';

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
  return page.evaluate(() => ({
    url: location.pathname + location.search,
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    body:
      document.querySelector('main')?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 400) ??
      null,
    formPresent: Boolean(document.querySelector('form[action="#supplier-report"]')),
    focused: document.activeElement?.tagName.toLowerCase() ?? null,
    focusedName: document.activeElement?.getAttribute('name') ?? null,
    noticeCount: document.querySelectorAll('[data-ui="problem-notice"]').length,
    remedyLinks: [
      ...document.querySelectorAll<HTMLAnchorElement>('[data-ui="problem-notice"] a'),
    ].map((a) => a.textContent?.trim()),
    viewport: { width: innerWidth, height: innerHeight },
    scrollY: Math.round(scrollY),
    language: document.documentElement.lang,
  }));
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

test('Supplier report rejects reversed and malformed periods across delegated roles', async ({
  browser,
}) => {
  test.setTimeout(240_000);
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
        const [reversedResponse] = await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          form.locator('button').click(),
        ]);
        const reversed = await errorUi(page);
        await page.screenshot({
          path: join(
            evidenceRoot,
            `${scenario.role}-${scenario.width}-${scenario.locale}-reversed.png`,
          ),
          fullPage: false,
        });
        const malformedResponse = await page.goto(
          portal(`/supplier/report?from=2026-13-40&to=2026-09-20&lang=${scenario.locale}`),
        );
        const malformed = await errorUi(page);
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
          reversed: { status: reversedResponse?.status(), ui: reversed },
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
        expect(reversed.heading).toBe('Error');
        expect(malformedResponse?.status()).toBeGreaterThanOrEqual(400);
        expect(after).toEqual(before);
        expect(events.pageErrors).toEqual([]);
        expect(events.consoleErrors).toEqual([]);
      } finally {
        if (active !== ownerSetup) await active.context.close();
      }
    }
    const missingProjectResponse = await ownerSetup.page.goto(
      portal('/supplier/report.csv?lang=en'),
    );
    const missingProjectCsv = {
      status: missingProjectResponse?.status(),
      ui: await errorUi(ownerSetup.page),
    };
    writeResult({
      candidateCommit,
      fixtureSetup:
        'Owner created disposable supplier and assigned two disposable worker profiles via rendered Supplier forms',
      scenarios: scenarioResults,
      missingProjectCsv,
    });
    expect(missingProjectResponse?.status()).toBeGreaterThanOrEqual(400);
  } finally {
    if (!ownerSetup.context.pages().every((page) => page.isClosed()))
      await ownerSetup.context.close().catch(() => {});
    db.close();
  }
});
