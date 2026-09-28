import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const roles = [
  { label: 'Finance Administrator', secret: 'JA_QA_FINANCE', role: 'finance_admin' },
  { label: 'Project Manager', secret: 'JA_QA_MANAGER', role: 'project_manager' },
  { label: 'Read-only Auditor', secret: 'JA_QA_AUDITOR', role: 'auditor_read_only' },
  { label: 'Worker 1', secret: 'JA_QA_WORKER', role: 'worker', profile: 'none' },
  {
    label: 'Supplier Coordinator',
    secret: 'JA_QA_SUPPLIER_COORDINATOR',
    role: 'worker',
    profile: 'supplier_coordinator',
  },
  {
    label: 'External Technician',
    secret: 'JA_QA_EXTERNAL_TECHNICIAN',
    role: 'worker',
    profile: 'external_technician',
  },
];

const manual = process.env.JA_QA_REQUIRE_SECRETS
  ? null
  : readFileSync('docs/manuals/Portal_Test_Accounts.private.md', 'utf8');

function credentialsFor(label) {
  const line = manual?.split(/\r?\n/u).find((item) => item.startsWith(`| ${label} |`));
  if (!line) throw new Error(`Missing test account for ${label}`);
  const cells = line
    .split('|')
    .slice(1, -1)
    .map((item) => item.trim().replace(/^`|`$/gu, ''));
  if (cells.length !== 4 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(cells[1]) || !cells[2]) {
    throw new Error(`Invalid test account row for ${label}`);
  }
  return { email: cells[1], password: cells[2] };
}

// Validate every required role before opening any browser session. Never print
// emails, passwords, request bodies, cookies, or page content to CI logs.
const accounts = roles.map(({ label, secret, role, profile }) => {
  const email = process.env[`${secret}_EMAIL`];
  const password = process.env[`${secret}_PASSWORD`];
  if (process.env.JA_QA_REQUIRE_SECRETS && (!email || !password)) {
    throw new Error(`Missing GitHub environment secrets for ${label}`);
  }
  const credentials = email && password ? { email, password } : credentialsFor(label);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(credentials.email) || !credentials.password) {
    throw new Error(`Invalid test account for ${label}`);
  }
  return { label, role, profile, ...credentials };
});

if (new Set(accounts.map((account) => account.email.toLowerCase())).size !== accounts.length) {
  throw new Error('Role test accounts must have distinct email addresses');
}

if (process.argv.includes('--validate-only')) {
  console.log(`Validated ${accounts.length} role test accounts.`);
  process.exit(0);
}

const base = 'https://j-aautomation.com/j-aautomation/app';
const browser = await chromium.launch({ headless: true });
let failures = 0;
try {
  for (const account of accounts) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    let authStatus;
    let sessionActive = false;
    let stage = 'open login page';
    page.on('response', (response) => {
      if (response.url().includes('/api/auth/sign-in/email')) authStatus = response.status();
    });
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.goto(`${base}/login?lang=en`, { waitUntil: 'domcontentloaded' });
        stage = 'wait for interactive login form';
        await page.locator('form.login-card[data-hydrated="true"]').waitFor({ timeout: 15_000 });
        stage = 'fill login form';
        await page.getByLabel('Work email').fill(account.email);
        await page.getByLabel('Password').fill(account.password);
        stage = 'submit login form';
        const authResponse = page.waitForResponse((response) =>
          response.url().includes('/api/auth/sign-in/email'),
        );
        await page.getByRole('button', { name: 'Continue to workspace' }).click();
        stage = 'receive authentication response';
        const response = await authResponse;
        authStatus = response.status();
        if (authStatus !== 429 || attempt > 0) break;
        const retryAfterSeconds = Number.parseInt(response.headers()['retry-after'] ?? '', 10);
        if (
          !Number.isSafeInteger(retryAfterSeconds) ||
          retryAfterSeconds < 1 ||
          retryAfterSeconds > 900
        ) {
          break;
        }
        console.log(`${account.label}: sign-in rate limited; retrying after server cooldown.`);
        await delay((retryAfterSeconds + 2) * 1000);
        stage = 'open login page after cooldown';
      }
      stage = 'open workspace';
      await page.waitForURL(
        (url) => url.pathname.startsWith('/j-aautomation/app') && !url.pathname.endsWith('/login'),
        { timeout: 20_000 },
      );
      await page.locator('main').waitFor({ state: 'visible', timeout: 10_000 });
      stage = 'verify authenticated identity';
      const sessionResponse = await page.request.get(`${base}/api/auth/get-session`);
      const session = sessionResponse.ok() ? await sessionResponse.json() : null;
      sessionActive = Boolean(session?.user?.id);
      if (session?.user?.email?.toLowerCase() !== account.email.toLowerCase()) {
        throw new Error('Session identity did not match the test account');
      }
      if (session.user.role !== account.role) {
        throw new Error('Session role did not match the expected role');
      }
      if (account.profile) {
        stage = 'verify supplier navigation';
        const supplierLinks = await page.locator('a[href]').evaluateAll((links) => ({
          report: links.some(
            (link) => new URL(link.href).pathname === '/j-aautomation/app/supplier/report',
          ),
          team: links.some((link) => new URL(link.href).pathname === '/j-aautomation/app/supplier'),
        }));
        if (
          (account.profile === 'none' && supplierLinks.report) ||
          (account.profile === 'supplier_coordinator' &&
            (!supplierLinks.report || !supplierLinks.team)) ||
          (account.profile === 'external_technician' &&
            (!supplierLinks.report || supplierLinks.team))
        ) {
          throw new Error('Supplier profile navigation did not match the expected profile');
        }
      }
      console.log(`${account.label}: expected identity, role, and workspace verified.`);
    } catch {
      failures += 1;
      console.error(
        `${account.label}: smoke failed while trying to ${stage} (auth HTTP ${authStatus ?? 'unknown'}).`,
      );
    } finally {
      if (sessionActive || authStatus === 200) {
        let signedOut = false;
        try {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const response = await page.evaluate(async () => {
              const result = await fetch('/j-aautomation/app/api/auth/sign-out', {
                method: 'POST',
                credentials: 'same-origin',
              });
              return {
                ok: result.ok,
                status: result.status,
                retryAfter: result.headers.get('retry-after'),
              };
            });
            if (response.ok) {
              signedOut = true;
              break;
            }
            if (response.status !== 429 || attempt > 0) break;
            const retryAfterSeconds = Number.parseInt(response.retryAfter ?? '', 10);
            if (
              !Number.isSafeInteger(retryAfterSeconds) ||
              retryAfterSeconds < 1 ||
              retryAfterSeconds > 900
            ) {
              break;
            }
            console.log(`${account.label}: sign-out rate limited; retrying after server cooldown.`);
            await delay((retryAfterSeconds + 2) * 1000);
          }
        } catch {
          // Report the failed sign-out below without exposing session details.
        }
        if (!signedOut) {
          failures += 1;
          console.error(`${account.label}: session sign-out failed.`);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
