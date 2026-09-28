import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  localBaseUrl,
  requiredFixtureSentinel,
  syntheticCredentials,
} from './isolated-test-guards.ts';

requiredFixtureSentinel();
const BASE_URL = localBaseUrl('JA_DEMO_REPORT_BASE_URL', 'http://127.0.0.1:5174/j-aautomation');
const artifactsDir = resolve(
  process.env.JA_DEMO_REPORT_ARTIFACTS_DIR?.trim() ||
    resolve(process.cwd(), 'docs/evidence/reports-demo'),
);
const OWNER = syntheticCredentials('JA_DEMO_REPORT_OWNER_EMAIL', 'JA_DEMO_REPORT_OWNER_PASSWORD');
const reportId = process.env.JA_DEMO_REPORT_ID?.trim() || '01a0577d-d537-7528-9c5e-f05d06e2b991';
mkdirSync(artifactsDir, { recursive: true });

async function demoReport() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE_URL}/app/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await page.waitForURL((url) => url.pathname.includes('/app') && !url.pathname.includes('/login'));

  // Open first daily report in English
  await page.goto(`${BASE_URL}/app/reports/${reportId}?lang=en`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: resolve(artifactsDir, 'report_detail_en.png'), fullPage: true });

  // Open the same report in Spanish
  await page.goto(`${BASE_URL}/app/reports/${reportId}?lang=es`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: resolve(artifactsDir, 'report_detail_es.png'), fullPage: true });

  console.log('Screenshots saved for report in EN and ES.');
  await browser.close();
}

demoReport().catch(() => {
  console.error('Report detail demo failed.');
  process.exitCode = 1;
});
