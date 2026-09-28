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
    const heading = main?.querySelector('h1')?.textContent?.trim() ?? '';
    const error = heading === 'Error' || heading === 'Acceso restringido';
    const form = main?.querySelector('form[method="GET"]');
    const notice = main?.querySelector('[data-review-filter-problem] [data-ui="problem-notice"]');
    return {
      pathname: location.pathname,
      queryKeys: [...new URLSearchParams(location.search).keys()],
      requested: Object.fromEntries(['project','from','to','lang'].map((key) => [key, new URLSearchParams(location.search).getAll(key).map((value) => key === 'project' && value ? ':record' : value)])),
      pageKind: error ? 'error' : 'report-review',
      errorText: error ? main?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 300) : null,
      filterFormPresent: Boolean(form),
      filterNoticePresent: Boolean(notice),
      fromValue: form?.querySelector('[name="from"]')?.value ?? null,
      toValue: form?.querySelector('[name="to"]')?.value ?? null,
      selectedProjectPresent: Boolean(form?.querySelector('[name="project"]')?.value),
      visibleReportCount: main?.querySelectorAll('[data-period-review-report]').length ?? 0,
      focusTag: document.activeElement?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
    };
  });
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = { target: 'deployed production', mode: 'read-only GET/filter navigation; no follow-up action', testedAtUtc: new Date().toISOString(), roles: [] };
let selectedProject;
try {
  for (const role of [
    { name: 'finance', label: 'Finance Administrator', width: 390, locale: 'en' },
    { name: 'auditor', label: 'Read-only Auditor', width: 1440, locale: 'es' },
  ]) {
    const context = await browser.newContext({ viewport: { width: role.width, height: role.width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const diagnostics = { pageErrors: [], consoleErrors: [], reviewResponses: [] };
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 160)); });
    page.on('response', (response) => { if (response.url().includes('/reports/review')) diagnostics.reviewResponses.push(`${response.status()} ${response.request().resourceType()}`); });
    const output = { role: role.name, viewport: role.width, locale: role.locale, login: null, scenarios: [], diagnostics };
    try {
      output.login = await signIn(page, role.label);
      if (output.login === 'signed-in') {
        const valid = await page.goto(`${base}/reports/review?lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
        output.scenarios.push({ name: 'base-page', status: valid?.status() ?? null, ui: await snapshot(page) });
        if (role.name === 'finance') selectedProject = await page.locator('#review-project option[value]:not([value=""])').first().getAttribute('value');
        if (selectedProject) {
          const encoded = encodeURIComponent(selectedProject);
          for (const [name, query] of [
            ['valid-period', `?project=${encoded}&from=2026-09-01&to=2026-09-30&lang=${role.locale}`],
            ['invalid-date', `?project=${encoded}&from=2026-02-30&to=2026-03-01&lang=${role.locale}`],
            ['reversed-date', `?project=${encoded}&from=2026-09-20&to=2026-09-19&lang=${role.locale}`],
            ['duplicate-start', `?project=${encoded}&from=2026-09-01&from=2026-09-02&to=2026-09-30&lang=${role.locale}`],
            ['unavailable-project', `?project=unavailable-project&from=2026-09-01&to=2026-09-30&lang=${role.locale}`],
          ]) {
            const response = await page.goto(`${base}/reports/review${query}`, { waitUntil: 'domcontentloaded' });
            output.scenarios.push({ name, status: response?.status() ?? null, ui: await snapshot(page) });
          }
          if (role.name === 'finance') {
            await page.goto(`${base}/reports/review?lang=en`, { waitUntil: 'domcontentloaded' });
            const form = page.locator('main form[method="GET"]').first();
            if (await form.count()) {
              await form.locator('[name="project"]').selectOption(selectedProject);
              await form.locator('[name="from"]').fill('2026-09-20');
              await form.locator('[name="to"]').fill('2026-09-19');
              const startingScroll = await page.evaluate(() => { window.scrollTo(0, 250); return Math.round(scrollY); });
              await Promise.all([
                page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
                form.locator('button[type="submit"]').click(),
              ]);
              output.scenarios.push({ name: 'rendered-reversed-form', startingScroll, ui: await snapshot(page) });
            }
          }
        } else output.fixtureIssue = 'No review project option available';
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
console.log('Report Review production read-only browser evidence written.');
