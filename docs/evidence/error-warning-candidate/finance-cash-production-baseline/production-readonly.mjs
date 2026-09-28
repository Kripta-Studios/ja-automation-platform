import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const evidenceRoot = new URL('.', import.meta.url).pathname;
const origin = 'https://j-aautomation.com';
const base = `${origin}/j-aautomation/app`;
const privateAccounts = readFileSync(join(root, 'docs/manuals/Portal_Test_Accounts.private.md'), 'utf8');

function credentialsFor(label) {
  const line = privateAccounts.split(/\r?\n/u).find((item) => item.startsWith(`| ${label} |`));
  if (!line) throw new Error(`Missing disposable ${label} row`);
  const cells = line.split('|').slice(1, -1).map((item) => item.trim().replace(/^`|`$/gu, ''));
  if (cells.length !== 4) throw new Error(`Unexpected ${label} credential row shape`);
  return { email: cells[1], password: cells[2] };
}

async function state(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const form = main?.querySelector('form[method="GET"]');
    const active = document.activeElement;
    return {
      path: location.pathname,
      queryKeys: [...new URLSearchParams(location.search).keys()],
      requested: Object.fromEntries(['currency','filter','from','to','group'].map((key) => [key, new URLSearchParams(location.search).get(key)])),
      title: document.title,
      heading: main?.querySelector('h1')?.textContent?.trim() ?? null,
      guidance: main?.querySelector('p')?.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 180) ?? null,
      errorText: form ? null : main?.innerText.replace(/\s+/gu, ' ').trim().slice(0, 300) ?? null,
      formPresent: Boolean(form),
      focusedTag: active?.tagName.toLowerCase() ?? null,
      focusedName: active?.getAttribute('name') ?? null,
      noticeCount: main?.querySelectorAll('[data-ui="problem-notice"]').length ?? 0,
      remedyCount: main?.querySelectorAll('[data-ui="problem-notice"] a').length ?? 0,
      filterValue: form?.querySelector('select[name="filter"]')?.value ?? null,
      currencyValue: form?.querySelector('select[name="currency"]')?.value ?? null,
      groupValue: form?.querySelector('select[name="group"]')?.value ?? null,
      fromValue: form?.querySelector('input[name="from"]')?.value ?? null,
      toValue: form?.querySelector('input[name="to"]')?.value ?? null,
      groupCount: main?.querySelectorAll('[data-cash-group]').length ?? 0,
      viewport: { width: innerWidth, height: innerHeight },
      language: document.documentElement.lang,
    };
  });
}

async function navigate(page, suffix) {
  const response = await page.goto(`${base}/finance/cash${suffix}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  return { status: response?.status() ?? null, ui: await state(page) };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = { testedAtUtc: new Date().toISOString(), target: 'deployed production', mode: 'read-only GET/filter navigation; no business record action', roles: [] };
try {
  for (const scenario of [
    { role: 'finance', label: 'Finance Administrator', width: 390, locale: 'en' },
    { role: 'auditor', label: 'Read-only Auditor', width: 1440, locale: 'es' },
    { role: 'manager', label: 'Project Manager', width: 1440, locale: 'es' },
    { role: 'worker', label: 'Worker 1', width: 390, locale: 'en' },
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const events = { pageErrors: [], consoleErrors: [], cashResponses: [] };
    page.on('pageerror', (error) => events.pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') events.consoleErrors.push(message.text().slice(0, 160)); });
    page.on('response', (response) => { if (response.url().includes('/finance/cash')) events.cashResponses.push(`${response.status()} ${response.request().resourceType()} ${new URL(response.url()).pathname}`); });
    const result = { role: scenario.role, viewport: scenario.width, locale: scenario.locale, login: null, scenarios: [], diagnostics: events };
    try {
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const credential = credentialsFor(scenario.label);
      await page.getByLabel('Work email').fill(credential.email);
      await page.getByLabel('Password').fill(credential.password);
      await page.getByRole('button', { name: 'Continue to workspace' }).click();
      try {
        await page.waitForURL((url) => url.pathname.startsWith('/j-aautomation/app/') && !url.pathname.endsWith('/login'), { timeout: 20_000 });
        result.login = 'signed-in';
      } catch {
        result.login = 'login did not reach workspace';
      }
      if (result.login === 'signed-in') {
        result.scenarios.push({ case: 'valid', ...await navigate(page, `?lang=${scenario.locale}`) });
        result.scenarios.push({ case: 'bad-filter', ...await navigate(page, `?filter=not-a-filter&lang=${scenario.locale}`) });
        result.scenarios.push({ case: 'bad-date', ...await navigate(page, `?from=2026-02-30&to=2026-03-01&lang=${scenario.locale}`) });
        result.scenarios.push({ case: 'reversed-direct', ...await navigate(page, `?from=2026-09-20&to=2026-09-19&lang=${scenario.locale}`) });
        result.scenarios.push({ case: 'unavailable-currency-group', ...await navigate(page, `?currency=ZZZ&group=quarter&lang=${scenario.locale}`) });
        if (scenario.role === 'finance') {
          await navigate(page, '?lang=en');
          const form = page.locator('main form[method="GET"]');
          if (await form.count()) {
            await form.locator('[name="from"]').fill('2026-09-20');
            await form.locator('[name="to"]').fill('2026-09-19');
            await Promise.all([
              page.waitForURL((url) => url.searchParams.get('to') === '2026-09-19'),
              form.locator('button[type="submit"]').click(),
            ]);
            result.scenarios.push({ case: 'reversed-form', ui: await state(page) });
          }
        }
      }
    } catch (error) {
      result.browserFailure = error instanceof Error ? error.name : 'BrowserError';
    } finally {
      results.roles.push(result);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(evidenceRoot, 'production-results.json'), JSON.stringify(results, (_key, item) => typeof item === 'string'
  ? item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email]').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, ':record')
  : item, 2) + '\n');
console.log('Production Finance Cash read-only browser evidence written.');
