import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const evidenceRoot = new URL('.', import.meta.url).pathname;
const base = 'https://j-aautomation.com/j-aautomation/app';
const accounts = readFileSync(join(root, 'docs/manuals/Portal_Test_Accounts.private.md'), 'utf8');

function credentialsFor(label) {
  if (label === 'Owner') {
    const email = process.env.JA_QA_OWNER_EMAIL;
    const password = process.env.JA_QA_OWNER_PASSWORD;
    if (!email || !password) throw new Error('Owner test credentials are required in private environment variables');
    return { email, password };
  }
  const line = accounts.split(/\r?\n/u).find((item) => item.startsWith(`| ${label} |`));
  if (!line) throw new Error(`Missing ${label} private test-account row`);
  const cells = line.split('|').slice(1, -1).map((item) => item.trim().replace(/^`|`$/gu, ''));
  return { email: cells[1], password: cells[2] };
}

async function signIn(page, label) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  const credentials = credentialsFor(label);
  await page.getByLabel('Work email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  try {
    await page.waitForURL((url) =>
      (url.pathname === '/j-aautomation/app' || url.pathname.startsWith('/j-aautomation/app/')) &&
      !url.pathname.endsWith('/login'), { timeout: 20_000 });
    return 'signed-in';
  } catch { return 'login did not reach workspace'; }
}

async function snapshot(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const params = new URLSearchParams(location.search);
    const project = main?.querySelector('#crew-project');
    const date = main?.querySelector('#crew-date');
    const notice = main?.querySelector('[data-crew-day-filter-problem] [data-ui="problem-notice"]');
    const heading = main?.querySelector('h1')?.textContent?.trim() ?? '';
    const filterForm = main?.querySelector('form.context-form[method="GET"]');
    const errorPage = !filterForm || ['Error', 'Erro', 'Access restricted', 'Acceso restringido'].includes(heading);
    return {
      pathname: location.pathname,
      query: Object.fromEntries(['project', 'date', 'lang'].map((key) => [key, params.getAll(key).map((value) => key === 'project' && value ? ':record' : value)])),
      pageKind: errorPage ? 'error' : 'crew-day',
      errorText: errorPage ? main?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 350) : null,
      filterFormPresent: Boolean(filterForm),
      noticePresent: Boolean(notice),
      noticeCode: notice?.getAttribute('data-problem-code') ?? null,
      selectedProjectPresent: Boolean(project?.value),
      selectedProjectAvailable: Boolean(project?.selectedOptions?.[0] && !project.selectedOptions[0].disabled),
      dateValue: date?.value ?? null,
      dateType: date?.type ?? null,
      focusedTag: document.activeElement?.tagName.toLowerCase() ?? null,
      scrollY: Math.round(scrollY),
      crewEntryCount: main?.querySelectorAll('[data-crew-entry]').length ?? 0,
    };
  });
}

const redact = (value) => JSON.stringify(value, (_key, item) =>
  typeof item === 'string'
    ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{27,36}\b/giu, ':record')
    : item, 2);

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const evidencePath = join(evidenceRoot, 'production-results.json');
const freshResults = {
  target: 'deployed production',
  mode: 'read-only browser GET and filter navigation; no business mutation',
  testedAtUtc: new Date().toISOString(),
  roles: [],
};
const results = process.env.JA_QA_CREW_ROLE && existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8'))
  : freshResults;
const roleCases = [
  { name: 'owner', label: 'Owner', width: 390, locale: 'en' },
  { name: 'manager', label: 'Project Manager', width: 1440, locale: 'es' },
  { name: 'worker1', label: 'Worker 1', width: 390, locale: 'pt' },
  { name: 'worker2', label: 'Worker 2', width: 390, locale: 'en' },
  { name: 'worker3', label: 'Worker 3', width: 1440, locale: 'es' },
];
try {
  for (const role of roleCases.filter((item) => !process.env.JA_QA_CREW_ROLE || process.env.JA_QA_CREW_ROLE.split(',').includes(item.name))) {
    const context = await browser.newContext({ viewport: { width: role.width, height: role.width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const diagnostics = { pageErrorCount: 0, consoleErrorCount: 0, crewResponses: [] };
    page.on('pageerror', () => { diagnostics.pageErrorCount += 1; });
    page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrorCount += 1; });
    page.on('response', (response) => {
      if (response.url().includes('/app/crew'))
        diagnostics.crewResponses.push(`${response.status()} ${response.request().resourceType()}`);
    });
    const output = { role: role.name, viewport: role.width, locale: role.locale, login: null, projectOptionAvailable: false, scenarios: [], diagnostics };
    try {
      output.login = await signIn(page, role.label);
      if (output.login === 'signed-in') {
        const baseResponse = await page.goto(`${base}/crew?lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
        output.scenarios.push({ name: 'base', status: baseResponse?.status() ?? null, ui: await snapshot(page) });
        const projectId = await page.locator('#crew-project option[value]:not([value=""])').first().getAttribute('value').catch(() => null);
        output.projectOptionAvailable = Boolean(projectId);
        const query = projectId ? `project=${encodeURIComponent(projectId)}&` : '';
        for (const [name, suffix] of [
          ['invalid-text-date', `${query}date=not-a-date`],
          ['invalid-calendar-date', `${query}date=2026-02-30`],
          ['duplicate-date', `${query}date=2026-09-01&date=not-a-date`],
          ['inaccessible-project', 'project=unavailable-project&date=2026-09-01'],
          ...(projectId ? [['duplicate-project', `project=${encodeURIComponent(projectId)}&project=unavailable-project&date=2026-09-01`]] : []),
        ]) {
          const response = await page.goto(`${base}/crew?${suffix}&lang=${role.locale}`, { waitUntil: 'domcontentloaded' });
          const ui = await snapshot(page);
          output.scenarios.push({ name, status: response?.status() ?? null, ui });
          if (name === 'invalid-text-date' && ui.pageKind === 'error')
            await page.locator('main').screenshot({ path: join(evidenceRoot, `${role.name}-${role.width}-${role.locale}-invalid.png`) });
        }
      }
    } catch (error) {
      output.browserFailure = error instanceof Error ? error.name : 'BrowserError';
    } finally {
      results.roles = results.roles.filter((item) => item.role !== output.role);
      results.roles.push(output);
      await context.close();
    }
  }
} finally { await browser.close(); }

writeFileSync(evidencePath, redact(results) + '\n');
console.log('Crew day production read-only browser baseline recorded.');
