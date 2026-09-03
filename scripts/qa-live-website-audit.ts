import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactsDir =
  'C:/Users/Álvaro Schwiedop/.gemini/antigravity-ide/brain/65375eff-65c9-4087-9b1b-908c0d6445d9/screenshots/website';
mkdirSync(artifactsDir, { recursive: true });

async function auditWebsite() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  console.log('=== STARTING LIVE AUDIT OF MARKETING WEBSITE ===');

  try {
    // 1. Audit English Homepage Desktop (1440px)
    console.log('1. Auditing English Homepage (1440px)...');
    await page.goto('http://127.0.0.1:5173/j-aautomation/en');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '01_website_en_desktop_1440.png'),
      fullPage: true,
    });

    // 2. Audit Spanish Homepage Desktop (1440px)
    console.log('2. Auditing Spanish Homepage (1440px)...');
    await page.goto('http://127.0.0.1:5173/j-aautomation/es');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '02_website_es_desktop_1440.png'),
      fullPage: true,
    });

    // 3. Audit Portuguese Homepage Desktop (1440px)
    console.log('3. Auditing Portuguese Homepage (1440px)...');
    await page.goto('http://127.0.0.1:5173/j-aautomation/pt');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '03_website_pt_desktop_1440.png'),
      fullPage: true,
    });

    // 4. Audit Mobile 390px Viewport (iPhone 14 / 15)
    console.log('4. Auditing Mobile 390px Viewport...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:5173/j-aautomation/en');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '04_website_en_mobile_390.png'),
      fullPage: true,
    });

    // Test mobile menu interaction
    const menuBtn = page.locator('button[aria-label*="menu" i], button[aria-expanded]').first();
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(artifactsDir, '05_website_mobile_menu_open.png') });
    }

    // 5. Audit Tablet 768px Viewport (iPad)
    console.log('5. Auditing Tablet 768px Viewport...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('http://127.0.0.1:5173/j-aautomation/en');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(artifactsDir, '06_website_en_tablet_768.png'),
      fullPage: true,
    });

    // 6. Test Contact / Intake Form
    console.log('6. Auditing Contact / Intake form...');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:5173/j-aautomation/en#contact');
    await page.waitForLoadState('networkidle');
    const contactForm = page.locator('form');
    if ((await contactForm.count()) > 0) {
      console.log('Contact form found on page.');
      await page.screenshot({ path: resolve(artifactsDir, '07_website_contact_section.png') });
    }

    console.log('--- WEBSITE CONSOLE ERRORS ---');
    console.log(consoleErrors.length > 0 ? consoleErrors : 'Zero console errors!');
    console.log('=== WEBSITE AUDIT COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('Error auditing website:', error);
  } finally {
    await browser.close();
  }
}

auditWebsite();
