import playwright from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
import fs from 'node:fs';
const BASE = 'https://j-aautomation.com/j-aautomation/app';
const accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
const wanted = process.argv.slice(2);
const b = await playwright.chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-gpu'] });
for (const [role, email, password] of accounts) {
  const slug = role.toLowerCase().replace(/\W+/g, '-');
  if (wanted.length && !wanted.includes(slug)) continue;
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login?lang=en`, { waitUntil: 'networkidle' });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForLoadState('networkidle'), p.click('button.login-submit')]);
  await p.waitForTimeout(2500);
  const ok = !p.url().includes('/login');
  console.log(slug, ok ? 'OK' : 'FAIL', p.url(), ok ? '' : (await p.locator('.login-card').innerText()).slice(0, 300).replace(/\n+/g, ' | '));
  if (ok) await ctx.storageState({ path: `state/${slug}.json` });
  await ctx.close();
  await new Promise(r => setTimeout(r, 8000));
}
await b.close();
