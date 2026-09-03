import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactsDir =
  'C:/Users/Álvaro Schwiedop/.gemini/antigravity-ide/brain/65375eff-65c9-4087-9b1b-908c0d6445d9/screenshots/reports_demo';
mkdirSync(artifactsDir, { recursive: true });

async function demoReport() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Login
  await page.goto('http://127.0.0.1:5174/j-aautomation/app/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill('antonny.luty@j-aautomation.com');
  await page.getByLabel('Password').fill('antonny.luty');
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.pathname.includes('/app') && !url.pathname.includes('/login'));

  // Open first daily report in English
  const reportId = '01a0577d-d537-7528-9c5e-f05d06e2b991';
  await page.goto(`http://127.0.0.1:5174/j-aautomation/app/reports/${reportId}?lang=en`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: resolve(artifactsDir, 'report_detail_en.png'), fullPage: true });

  // Open the same report in Spanish
  await page.goto(`http://127.0.0.1:5174/j-aautomation/app/reports/${reportId}?lang=es`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: resolve(artifactsDir, 'report_detail_es.png'), fullPage: true });

  console.log('Screenshots saved for report in EN and ES.');
  await browser.close();
}

demoReport();
