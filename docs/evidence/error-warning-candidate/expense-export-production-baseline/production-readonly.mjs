import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const evidenceRoot = new URL('.', import.meta.url).pathname;
const base = 'https://j-aautomation.com/j-aautomation/app';
const accounts = readFileSync(join(root, 'docs/manuals/Portal_Test_Accounts.private.md'), 'utf8');
function credentialsFor(label) {
  const line = accounts.split(/\r?\n/u).find((item) => item.startsWith(`| ${label} |`));
  if (!line) throw new Error(`Missing ${label} test-account row`);
  const cells = line.split('|').slice(1, -1).map((item) => item.trim().replace(/^`|`$/gu, ''));
  return { email: cells[1], password: cells[2] };
}
async function signIn(page, label) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  const credential = credentialsFor(label);
  await page.getByLabel('Work email').fill(credential.email);
  await page.getByLabel('Password').fill(credential.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  try {
    await page.waitForURL((url) => url.pathname.startsWith('/j-aautomation/app/') && !url.pathname.endsWith('/login'), { timeout: 20_000 });
    return 'signed-in';
  } catch { return 'login did not reach workspace'; }
}
async function snapshot(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const links = [...(main?.querySelectorAll('a[href*="/expenses/export"]') ?? [])];
    const csv = links.find((link) => link.getAttribute('href')?.includes('format=csv'));
    const csvUrl = csv ? new URL(csv.href) : null;
    const heading = main?.querySelector('h1')?.textContent?.trim() ?? '';
    const error = heading === 'Error';
    const exportResponse = location.pathname.endsWith('/expenses/export');
    return {
      pathname: location.pathname,
      queryKeys: [...new URLSearchParams(location.search).keys()],
      headingKind: exportResponse ? 'export-response' : error ? 'error' : 'expenses',
      errorText: error || exportResponse ? document.body.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 300) : null,
      exportLinkCount: links.length,
      csvLinkPresent: Boolean(csv),
      csvQueryKeys: csvUrl ? [...csvUrl.searchParams.keys()] : [],
      customDisclosurePresent: Boolean(main?.querySelector('.expense-export-disclosure')),
      fromInputPresent: Boolean(main?.querySelector('#expense-export-field-from')),
      toInputPresent: Boolean(main?.querySelector('#expense-export-field-to')),
      fromValue: main?.querySelector('#expense-export-field-from')?.value ?? null,
      toValue: main?.querySelector('#expense-export-field-to')?.value ?? null,
      noticeCount: main?.querySelectorAll('[data-ui="problem-notice"]').length ?? 0,
      focusTag: document.activeElement?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
    };
  });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = { target: 'deployed production', mode: 'GET/read-only; no expense action or business write', testedAtUtc: new Date().toISOString(), roles: [] };
try {
  for (const role of [
    { name: 'finance', label: 'Finance Administrator', width: 390, locale: 'en' },
    { name: 'worker', label: 'Worker 1', width: 1440, locale: 'es' },
  ]) {
    const context = await browser.newContext({ viewport: { width: role.width, height: role.width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const diagnostics = { pageErrors: [], consoleErrors: [], exportResponses: [] };
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 160)); });
    page.on('response', (response) => {
      if (response.url().includes('/expenses/export')) diagnostics.exportResponses.push({
        status: response.status(),
        resourceType: response.request().resourceType(),
        contentType: response.headers()['content-type'] ?? null,
        dispositionKind: response.headers()['content-disposition']?.split(';')[0] ?? null,
      });
    });
    const output = { role: role.name, viewport: role.width, locale: role.locale, login: null, scenarios: [], diagnostics };
    try {
      output.login = await signIn(page, role.label);
      if (output.login === 'signed-in') {
        const pageResponse = await page.goto(`${base}/expenses?lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
        output.scenarios.push({ name: 'expenses-page', status: pageResponse?.status() ?? null, ui: await snapshot(page) });
        const disclosure = page.locator('.expense-export-disclosure');
        if (await disclosure.count()) {
          output.disclosure = await disclosure.evaluate((element) => ({
            tag: element.tagName.toLowerCase(),
            summaryCount: element.querySelectorAll('summary').length,
            dateInputCount: element.querySelectorAll('input[type="date"]').length,
            visible: Boolean(element.getClientRects().length),
          }));
          try {
            await disclosure.locator('summary').first().click({ timeout: 5_000 });
            const dates = disclosure.locator('input[type="date"]');
            if (await dates.count() >= 2) {
              await dates.nth(0).fill('2026-09-20');
              await dates.nth(1).fill('2026-09-19');
              const link = disclosure.locator('a[href*="/expenses/export"][href*="format=csv"]').first();
              const href = await link.getAttribute('href');
              const url = href ? new URL(href, base) : null;
              output.scenarios.push({
                name: 'rendered-reversed-export-link',
                enteredDates: ['2026-09-20', '2026-09-19'],
                linkDates: { from: url?.searchParams.get('from') ?? null, to: url?.searchParams.get('to') ?? null },
                ui: await snapshot(page),
              });
              const downloadEvent = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
              await link.click();
              const download = await downloadEvent;
              if (download) {
                output.scenarios.push({ name: 'rendered-reversed-export-click', downloaded: true, filenameKind: download.suggestedFilename().endsWith('.csv') ? 'csv' : 'other', ui: await snapshot(page) });
                await download.cancel();
              } else output.scenarios.push({ name: 'rendered-reversed-export-click', downloaded: false, ui: await snapshot(page) });
            }
          } catch (error) { output.disclosureInteraction = error instanceof Error ? error.name : 'BrowserError'; }
        }
      }
    } catch (error) { output.browserFailure = error instanceof Error ? error.name : 'BrowserError'; }
    finally { results.roles.push(output); await context.close(); }
  }
} finally { await browser.close(); }
writeFileSync(join(evidenceRoot, 'production-results.json'), JSON.stringify(results, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : item, 2) + '\n');
console.log('Expense export production read-only browser evidence written.');
