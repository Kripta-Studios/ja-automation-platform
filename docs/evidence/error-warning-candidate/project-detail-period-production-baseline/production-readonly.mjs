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
async function login(page, label) {
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
    const heading = main?.querySelector('h1')?.textContent?.trim() ?? '';
    const errorPage = heading === 'Error' || heading === 'Acceso restringido';
    const notice = main?.querySelector('[data-project-period-problem] [data-ui="problem-notice"]');
    return {
      pathname: location.pathname.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/giu, ':record'),
      queryKeys: [...new URLSearchParams(location.search).keys()],
      requested: Object.fromEntries(['periodStart','periodEnd','tab','lang'].map((key) => [key, new URLSearchParams(location.search).getAll(key)])),
      pageKind: errorPage ? 'error' : 'project-detail',
      errorText: errorPage ? main?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 280) : null,
      periodFormPresent: Boolean(main?.querySelector('[data-project-period-form]')),
      periodNoticePresent: Boolean(notice),
      activeTag: document.activeElement?.tagName.toLowerCase() ?? null,
      periodStartValue: main?.querySelector('#project-periodStart')?.value ?? null,
      periodEndValue: main?.querySelector('#project-periodEnd')?.value ?? null,
    };
  });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = { target: 'deployed production', mode: 'read-only GET navigation; no project action', testedAtUtc: new Date().toISOString(), roles: [] };
let projectId;
try {
  for (const role of [
    { name: 'finance', label: 'Finance Administrator', width: 390, locale: 'en' },
    { name: 'auditor', label: 'Read-only Auditor', width: 1440, locale: 'es' },
  ]) {
    const context = await browser.newContext({ viewport: { width: role.width, height: role.width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const diagnostics = { pageErrors: [], consoleErrors: [], responses: [] };
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 180)); });
    page.on('response', (response) => {
      if (response.url().includes('/app/projects/')) diagnostics.responses.push(`${response.status()} ${response.request().resourceType()}`);
    });
    const output = { role: role.name, viewport: role.width, locale: role.locale, login: null, scenarios: [], diagnostics };
    try {
      output.login = await login(page, role.label);
      if (output.login === 'signed-in') {
        if (role.name === 'finance') {
          await page.goto(`${base}/finance/cash?lang=en`, { waitUntil: 'domcontentloaded' });
          projectId = await page.locator('select[name="project"] option[value]:not([value=""])').first().getAttribute('value');
        }
        if (projectId) {
          const path = `/projects/${encodeURIComponent(projectId)}`;
          for (const [name, query] of [
            ['valid', `?lang=${role.locale}`],
            ['invalid-date', `?periodStart=2026-02-30&periodEnd=2026-03-01&lang=${role.locale}`],
            ['reversed-date', `?periodStart=2026-09-20&periodEnd=2026-09-19&lang=${role.locale}`],
            ['duplicate-start', `?periodStart=2026-09-01&periodStart=2026-09-02&periodEnd=2026-09-30&lang=${role.locale}`],
          ]) {
            const response = await page.goto(`${base}${path}${query}`, { waitUntil: 'domcontentloaded' });
            output.scenarios.push({ name, status: response?.status() ?? null, ui: await snapshot(page) });
          }
        } else output.fixtureIssue = 'No project option available to Finance in Cash filter';
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
console.log('Project Detail production read-only browser evidence written.');
