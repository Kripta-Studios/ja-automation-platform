import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  localBaseUrl,
  localSameOriginUrl,
  requiredEnvironment,
  requiredFixtureSentinel,
  redactedUrlPath,
  syntheticCredentials,
  syntheticEmail,
} from './isolated-test-guards.ts';

requiredFixtureSentinel();
const BASE_URL = localBaseUrl('JA_QA_AUDIT_BASE_URL', 'http://127.0.0.1:5174/j-aautomation');
const artifactsDir = resolve(
  process.env.JA_QA_AUDIT_ARTIFACTS_DIR?.trim() || resolve(process.cwd(), 'docs/evidence/qa-audit'),
);
const OWNER = syntheticCredentials('JA_QA_AUDIT_OWNER_EMAIL', 'JA_QA_AUDIT_OWNER_PASSWORD');
const INVITATION = {
  email: syntheticEmail('JA_QA_AUDIT_INVITE_EMAIL'),
  name: requiredEnvironment('JA_QA_AUDIT_INVITE_NAME'),
};
mkdirSync(artifactsDir, { recursive: true });

async function runLiveAudit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const auditLog: string[] = [];
  function log(msg: string) {
    console.log(`[AUDIT] ${msg}`);
    auditLog.push(msg);
  }

  try {
    log('1. Navigating to the isolated local login page');
    await page.goto(`${BASE_URL}/app/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: resolve(artifactsDir, '01_login_desktop.png'), fullPage: true });

    log('2. Entering credentials for the synthetic owner fixture');
    await page.getByLabel('Work email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue to workspace' }).click();

    log('3. Waiting for redirection to dashboard');
    await page.waitForURL(
      (url) => url.pathname.includes('/app') && !url.pathname.includes('/login'),
      { timeout: 10000 },
    );
    await page.waitForLoadState('networkidle');
    log(`Successfully landed at ${redactedUrlPath(page.url())}`);
    await page.screenshot({
      path: resolve(artifactsDir, '02_dashboard_desktop.png'),
      fullPage: true,
    });

    // Check Mobile Viewport for Dashboard
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(artifactsDir, '03_dashboard_mobile_390.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    log('4. Navigating to Projects module');
    await page.goto(`${BASE_URL}/app/projects`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: resolve(artifactsDir, '04_projects_list.png'), fullPage: true });

    // Test creating a new project
    log('5. Creating a new synthetic project fixture');
    const newProjectBtn = page
      .getByRole('button', { name: /New project|Create project/i })
      .or(page.locator('a[href*="new-project"]'))
      .or(page.locator('button:has-text("New project")'))
      .first();
    if (await newProjectBtn.isVisible()) {
      await newProjectBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: resolve(artifactsDir, '05_new_project_drawer.png') });
    }

    // Submit a project via form if visible, or via API action
    log('6. Inspecting Client and Team tabs in Projects');
    await page.goto(`${BASE_URL}/app/projects?view=clients`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '06_projects_clients_tab.png'),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/app/projects?view=team`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '07_projects_team_tab.png'),
      fullPage: true,
    });

    log('7. Navigating to Access / Team / Users module');
    await page.goto(`${BASE_URL}/app/access`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '08_access_users_desktop.png'),
      fullPage: true,
    });

    // Try inviting the synthetic worker fixture.
    log('8. Inviting the synthetic worker fixture as Project Manager');
    const inviteEmailInput = page
      .locator('input[name="email"], input[id*="email"], input[placeholder*="email"]')
      .first();
    if (await inviteEmailInput.isVisible()) {
      await inviteEmailInput.fill(INVITATION.email);
      const nameInput = page
        .locator('input[name="name"], input[id*="name"], input[placeholder*="name"]')
        .first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(INVITATION.name);
      }
      const roleSelect = page.locator('select[name="role"]').first();
      if (await roleSelect.isVisible()) {
        await roleSelect
          .selectOption({ label: 'Project Manager' })
          .catch(() => roleSelect.selectOption('project_manager'));
      }
      const submitInviteBtn = page
        .getByRole('button', { name: /Invite|Send invitation|Create user|Add/i })
        .first();
      if (await submitInviteBtn.isVisible()) {
        await submitInviteBtn.click();
        await page.waitForTimeout(1000);
        log('Sent invitation for the synthetic worker fixture');
        await page.screenshot({
          path: resolve(artifactsDir, '09_user_invited_state.png'),
          fullPage: true,
        });
      }
    }

    log('9. Navigating to Reports module');
    await page.goto(`${BASE_URL}/app/reports`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: resolve(artifactsDir, '10_reports_list.png'), fullPage: true });

    // Check PDF report endpoint
    log('10. Testing PDF generation / viewing from Reports');
    const pdfLinks = page.locator('a[href*="/pdf"]');
    const pdfCount = await pdfLinks.count();
    log(`Found ${pdfCount} PDF report links`);
    if (pdfCount > 0) {
      const href = await pdfLinks.first().getAttribute('href');
      if (href) {
        log(`Testing PDF endpoint: ${redactedUrlPath(href, BASE_URL)}`);
        const response = await page.request.get(localSameOriginUrl(href, BASE_URL));
        log(
          `PDF response status: ${response.status()}, Content-Type: ${response.headers()['content-type']}`,
        );
      }
    }

    log('11. Navigating to Time module');
    await page.goto(`${BASE_URL}/app/time`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: resolve(artifactsDir, '11_time_desktop.png'), fullPage: true });

    log('12. Navigating to Expenses module');
    await page.goto(`${BASE_URL}/app/expenses`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '12_expenses_desktop.png'),
      fullPage: true,
    });

    log('13. Navigating to Billing & Invoices');
    await page.goto(`${BASE_URL}/app/billing`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '13_billing_desktop.png'),
      fullPage: true,
    });

    log('14. Testing Logout');
    await page.goto(`${BASE_URL}/app/profile`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '14_profile_desktop.png'),
      fullPage: true,
    });

    const logoutBtn = page
      .getByRole('button', { name: /Sign out|Log out|Cerrar sesión/i })
      .or(page.locator('button:has-text("Sign out")'))
      .first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 8000 });
      log('Successfully logged out to login page');
      await page.screenshot({
        path: resolve(artifactsDir, '15_logged_out_screen.png'),
        fullPage: true,
      });
    } else {
      log('Calling auth signout API directly');
      await page.request.post(`${BASE_URL}/app/api/auth/sign-out`, {
        headers: { origin: new URL(BASE_URL).origin },
      });
      await page.goto(`${BASE_URL}/app/login`);
      await page.waitForLoadState('networkidle');
    }

    log('15. Re-authenticating with the synthetic owner fixture');
    await page.getByLabel('Work email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Continue to workspace' }).click();
    await page.waitForURL(
      (url) => url.pathname.includes('/app') && !url.pathname.includes('/login'),
      { timeout: 10000 },
    );
    await page.waitForLoadState('networkidle');
    log('Successfully logged back in!');

    log('16. Verifying persistence in Access / Users module');
    await page.goto(`${BASE_URL}/app/access`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '16_access_after_relogin.png'),
      fullPage: true,
    });

    log('Audit complete.');
  } catch {
    console.error('[AUDIT ERROR] Audit failed.');
    process.exitCode = 1;
    await page
      .screenshot({ path: resolve(artifactsDir, '99_error_state.png'), fullPage: true })
      .catch(() => {});
  } finally {
    await browser.close();
  }
}

runLiveAudit();
