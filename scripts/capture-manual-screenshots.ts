import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'http://127.0.0.1:5174/j-aautomation';
const OUT_DIR = resolve(process.cwd(), 'docs/manuals/screenshots');

mkdirSync(resolve(OUT_DIR, 'owner'), { recursive: true });
mkdirSync(resolve(OUT_DIR, 'worker'), { recursive: true });

async function snap(page: Page, path: string, filename: string, waitTime = 1500) {
  console.log(`Navigating to ${path}...`);
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(waitTime);
  const target = resolve(OUT_DIR, filename);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`✓ Saved: ${filename}`);
}

async function captureOwnerScreenshots() {
  console.log('\n--- Capturing Owner Screenshots ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  // Login page screenshot
  await snap(page, '/app/login', 'owner/01_login_screen.png', 1000);

  // Perform Owner Login
  await page.fill('input[name="email"]', 'antonny.luty@j-aautomation.com');
  await page.fill('input[name="password"]', 'antonny.luty');
  await page.click('.login-submit');
  await page.waitForURL('**/app/**', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Projects Hub
  await snap(page, '/app/projects', 'owner/02_projects_hub.png', 2000);

  // Project Detail CP020 (BBS Mexico)
  await snap(page, '/app/projects/cp020', 'owner/03_project_detail_cp020.png', 2000);

  // Master Time Tracking
  await snap(page, '/app/time', 'owner/04_time_tracking.png', 2000);

  // Approvals Queue
  await snap(page, '/app/approvals', 'owner/05_approvals_queue.png', 2000);

  // Daily Field Reports
  await snap(page, '/app/reports', 'owner/06_daily_field_reports.png', 2000);

  // Expenses Management
  await snap(page, '/app/expenses', 'owner/07_expenses_management.png', 2000);

  // Billing & Invoices Hub
  await snap(page, '/app/billing', 'owner/08_billing_hub.png', 2000);

  // Invoice Detail & Preview (CP020-013)
  await snap(page, '/app/billing/invoices/invoice-cp020-013', 'owner/09_invoice_preview.png', 2500);

  // Invoice Draft Customization Accordion
  try {
    const editBtn = page.locator('summary', { hasText: 'Edit Invoice Details' });
    if (await editBtn.count()) {
      await editBtn.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: resolve(OUT_DIR, 'owner/10_invoice_edit_draft.png') });
      console.log('✓ Saved: owner/10_invoice_edit_draft.png');
    }
  } catch (e) {
    console.warn('Could not expand invoice edit accordion:', e);
  }

  // Finance & Profitability
  await snap(page, '/app/finance', 'owner/11_finance_profitability.png', 2000);

  // Collections Ledger
  await snap(page, '/app/ledger', 'owner/12_collections_ledger.png', 2000);

  // Monthly Accounting Packs
  await snap(page, '/app/accounting', 'owner/13_accounting_packs.png', 2000);

  // Audit Log & Traceability
  await snap(page, '/app/audit', 'owner/14_audit_compliance.png', 2000);

  // Profile & Security Settings
  await snap(page, '/app/profile', 'owner/15_profile_security.png', 2000);

  await browser.close();
}

async function captureWorkerScreenshots() {
  console.log('\n--- Capturing Worker Screenshots ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  // Login as Worker
  await page.goto(`${BASE_URL}/app/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'worker@demo.jaautomation.local');
  await page.fill('input[name="password"]', 'worker');
  await page.click('.login-submit');
  await page.waitForURL('**/app/**', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Worker Today Dashboard
  await snap(page, '/app', 'worker/01_worker_home.png', 2000);

  // Worker Time Logging
  await snap(page, '/app/time', 'worker/02_time_logging.png', 2000);

  // Worker Field Reports
  await snap(page, '/app/reports', 'worker/03_field_report_submission.png', 2000);

  // Worker Expenses
  await snap(page, '/app/expenses', 'worker/04_expense_submission.png', 2000);

  // Worker Compensation & Pay
  await snap(page, '/app/pay', 'worker/05_compensation_statement.png', 2000);

  // Worker Documents
  await snap(page, '/app/documents', 'worker/06_documents_hub.png', 2000);

  // Worker Profile
  await snap(page, '/app/profile', 'worker/07_worker_profile.png', 2000);

  await browser.close();

  // Mobile Viewport for Worker Field Use
  console.log('\n--- Capturing Worker Mobile Screenshot ---');
  const mobileBrowser = await chromium.launch({ headless: true });
  const mobileContext = await mobileBrowser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/app/login`, { waitUntil: 'networkidle' });
  await mobilePage.fill('input[name="email"]', 'worker@demo.jaautomation.local');
  await mobilePage.fill('input[name="password"]', 'worker');
  await mobilePage.click('.login-submit');
  await mobilePage.waitForURL('**/app/**', { timeout: 15000 });
  await mobilePage.waitForTimeout(2000);

  await snap(mobilePage, '/app/time', 'worker/08_worker_mobile_view.png', 2000);
  await mobileBrowser.close();
}

async function main() {
  await captureOwnerScreenshots();
  await captureWorkerScreenshots();
  console.log('\nAll user manual screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Fatal error during screenshot capture:', err);
  process.exit(1);
});
