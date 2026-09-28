import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const evidenceRoot = new URL('.', import.meta.url).pathname;
const base = 'https://j-aautomation.com/j-aautomation/app';
const accounts = readFileSync(join(root, 'docs/manuals/Portal_Test_Accounts.private.md'), 'utf8');

function credentialsFor(label) {
  const row = accounts.split(/\r?\n/u).find((line) => line.startsWith(`| ${label} |`));
  if (!row) throw new Error(`Missing ${label} test-account row`);
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/gu, ''));
  return { email: cells[1], password: cells[2] };
}

async function signIn(page, label) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  const account = credentialsFor(label);
  await page.getByLabel('Work email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  try {
    await page.waitForURL((url) => url.pathname.startsWith('/j-aautomation/app/') && !url.pathname.endsWith('/login'), { timeout: 20_000 });
    return 'signed-in';
  } catch { return 'login did not reach workspace'; }
}

function invalidExportQuery(url) {
  const parsed = new URL(url);
  const values = parsed.searchParams;
  const starts = values.getAll('periodStart');
  const ends = values.getAll('periodEnd');
  const malformed = [...starts, ...ends].some((value) => value === '2026-02-30' || value === 'not-a-date');
  const reversed = starts.length === 1 && ends.length === 1 && starts[0] > ends[0];
  const duplicated = starts.length > 1 || ends.length > 1;
  const badLedgerFilter = values.get('currency') === 'ZZZ' || values.get('report') === 'not-a-report';
  if (!malformed && !reversed && !duplicated && !badLedgerFilter) throw new Error('Refusing a potentially valid production export URL');
}

async function browserGet(page, url, name) {
  invalidExportQuery(url);
  let response;
  let navigationError = null;
  try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }); }
  catch (error) { navigationError = error instanceof Error ? error.name : 'NavigationError'; }
  const status = response?.status() ?? null;
  const contentType = response?.headers()['content-type'] ?? null;
  const disposition = response?.headers()['content-disposition'] ?? null;
  if (status === 200 || disposition || navigationError) {
    return { name, status, contentType, disposition: disposition ? '[attachment]' : null, navigationError, snapshot: null };
  }
  const snapshot = await page.evaluate(() => {
    const main = document.querySelector('main');
    const title = document.title.trim();
    const text = (main ?? document.body)?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 280) ?? '';
    return {
      pathname: location.pathname.replace(/\/projects\/[^/]+\/finance-export/u, '/projects/:record/finance-export'),
      queryKeys: [...new URLSearchParams(location.search).keys()],
      title,
      visibleText: text,
      activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
    };
  });
  return { name, status, contentType, disposition: disposition ? '[attachment]' : null, navigationError, snapshot };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = {
  target: 'deployed production',
  testedAtUtc: new Date().toISOString(),
  mode: 'read-only deliberately invalid GET only; no valid export or download',
  roles: [],
};
let projectId = null;
try {
  for (const role of [
    { name: 'finance', label: 'Finance Administrator', width: 390, locale: 'en' },
    { name: 'auditor', label: 'Read-only Auditor', width: 1440, locale: 'es' },
  ]) {
    const context = await browser.newContext({ viewport: { width: role.width, height: role.width === 390 ? 844 : 900 }, acceptDownloads: false });
    const page = await context.newPage();
    const output = { role: role.name, viewport: role.width, locale: role.locale, login: null, discovery: {}, scenarios: [], consoleErrors: [], pageErrors: [], downloads: 0 };
    page.on('console', (message) => { if (message.type() === 'error') output.consoleErrors.push(message.text().slice(0, 160)); });
    page.on('pageerror', (error) => output.pageErrors.push(error.message.slice(0, 160)));
    page.on('download', () => { output.downloads += 1; });
    try {
      output.login = await signIn(page, role.label);
      if (output.login === 'signed-in') {
        const review = await page.goto(`${base}/reports/review?lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
        output.discovery.reviewStatus = review?.status() ?? null;
        output.discovery.deployedAssetMarker = await page.locator('script[src*="/_app/immutable/"]').first().getAttribute('src').then((src) => src?.split('/').at(-1) ?? null).catch(() => null);
        if (role.name === 'finance') {
          projectId = await page.locator('#review-project option[value]:not([value=""])').first().getAttribute('value').catch(() => null);
          output.discovery.projectOptionAvailable = Boolean(projectId);
          if (projectId) {
            const detail = await page.goto(`${base}/projects/${encodeURIComponent(projectId)}?tab=billing&lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
            output.discovery.projectDetailStatus = detail?.status() ?? null;
            output.discovery.renderedExportLinkAvailable = await page.locator('a[href*="/finance-export?"]').count() > 0;
          }
        }
        if (projectId) {
          const path = `${base}/api/projects/${encodeURIComponent(projectId)}/finance-export`;
          const financeQueries = [
            ['project-finance-malformed', '?periodStart=2026-02-30&periodEnd=2026-03-01'],
            ['project-finance-reversed', '?periodStart=2026-09-20&periodEnd=2026-09-19'],
            ['project-finance-duplicate-invalid', '?periodStart=2026-02-30&periodStart=not-a-date&periodEnd=2026-03-01'],
          ];
          for (const [name, query] of financeQueries) {
            output.scenarios.push(await browserGet(page, `${path}${query}`, name));
            if (output.downloads || output.scenarios.at(-1)?.status === 200) break;
          }
        }
        if (!output.downloads) {
          const ledgerPage = await page.goto(`${base}/ledger?lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
          output.discovery.ledgerPageStatus = ledgerPage?.status() ?? null;
          output.discovery.renderedLedgerExportLinkAvailable = await page.locator('a[href*="/invoice-collection-ledger/"]').count() > 0;
          const path = `${base}/api/invoice-collection-ledger/csv`;
          const ledgerQueries = [
            ['ledger-malformed', '?periodStart=2026-02-30&periodEnd=2026-03-01'],
            ['ledger-reversed', '?periodStart=2026-09-20&periodEnd=2026-09-19'],
            ['ledger-duplicate-invalid', '?periodStart=2026-02-30&periodStart=not-a-date&periodEnd=2026-03-01'],
            ['ledger-invalid-currency', '?currency=ZZZ'],
            ['ledger-invalid-report', '?report=not-a-report'],
          ];
          for (const [name, query] of ledgerQueries) {
            output.scenarios.push(await browserGet(page, `${path}${query}`, name));
            if (output.downloads || output.scenarios.at(-1)?.status === 200) break;
          }
          if (!output.downloads && output.scenarios.at(-1)?.status !== 200) {
            for (const [name, query] of [
              ['ledger-xlsx-malformed', '?periodStart=2026-02-30&periodEnd=2026-03-01'],
              ['ledger-xlsx-invalid-currency', '?currency=ZZZ'],
              ['ledger-xlsx-invalid-report', '?report=not-a-report'],
            ]) {
              output.scenarios.push(await browserGet(page, `${base}/api/invoice-collection-ledger/xlsx${query}`, name));
              if (output.downloads || output.scenarios.at(-1)?.status === 200) break;
            }
          }
        }
      }
    } catch (error) { output.browserFailure = error instanceof Error ? `${error.name}: ${error.message.slice(0, 150)}` : 'BrowserError'; }
    finally { results.roles.push(output); await context.close(); }
  }
} finally { await browser.close(); }

writeFileSync(join(evidenceRoot, 'production-results.json'), JSON.stringify(results, (_key, value) =>
  typeof value === 'string'
    ? value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
    : value, 2) + '\n');
console.log('Production invalid export GET evidence written.');
