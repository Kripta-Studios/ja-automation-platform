import playwright from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = playwright;
const BASE = 'https://j-aautomation.com/j-aautomation/app';
const accounts = JSON.parse(process.env.ACCOUNTS);
const only = process.argv[2];
const browser = await chromium.launch({ headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader'] });
for (const [role, email, password] of accounts) {
  if (only && role !== only) continue;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForLoadState('networkidle'), page.click('button.login-submit')]);
  await page.waitForTimeout(1500);
  const slug = role.toLowerCase().replace(/\W+/g, '-');
  await page.waitForTimeout(1500); try { await page.screenshot({ path: `shots/explore-${slug}.png` }); } catch (e) { console.log('SHOT FAIL', e.message.split('\n')[0]); }
  const links = await page.$$eval('a', as => [...new Set(as.map(a => `${a.innerText.trim().replace(/\s+/g, ' ')} -> ${a.getAttribute('href')}`))]);
  console.log(`=== ${role} @ ${page.url()} title=${await page.title()}`);
  console.log(links.filter(l => l.includes('/app')).join('\n'));
  await context.close();
}
await browser.close();
