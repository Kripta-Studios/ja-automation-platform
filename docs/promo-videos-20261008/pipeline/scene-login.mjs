import fs from 'node:fs';
import { BASE, launch, newCtx, startRecording, keepAlive, moveTo, clickOn, typeSlow, settle, sleep } from './rec-lib.mjs';

const [, email, password] = JSON.parse(fs.readFileSync('accounts.json', 'utf8')).find(a => a[0] === 'Owner');
const browser = await launch();
const ctx = await newCtx(browser);
const page = await ctx.newPage();
await page.goto(`${BASE}/login?lang=en`, { waitUntil: 'networkidle' });
await keepAlive(page);
await page.mouse.move(1100, 700);
await sleep(500);
const rec = await startRecording(page, 'rec/login');
await sleep(1200);
const emailBox = await page.locator('input[name="email"]').boundingBox();
fs.writeFileSync('rec/login/email-box.json', JSON.stringify(emailBox));
await clickOn(page, 'input[name="email"]');
rec.mark('type-email');
await typeSlow(page, email, 38);
await sleep(250);
await clickOn(page, 'input[name="password"]', { steps: 18 });
await typeSlow(page, password, 45);
await sleep(300);
await moveTo(page, 'button.login-submit', { steps: 22 });
rec.mark('submit');
await page.mouse.down(); await sleep(70); await page.mouse.up();
await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
await settle(page, 300);
await keepAlive(page);
rec.mark('dashboard');
await moveTo(page, { x: 900, y: 420 }, { steps: 40 });
await sleep(2500);
await rec.stop();
const ok = !page.url().includes('/login');
console.log('login', ok ? 'OK' : 'FAIL', page.url());
if (ok) {
  fs.mkdirSync('state', { recursive: true });
  await ctx.storageState({ path: 'state/owner.json' });
  await page.screenshot({ path: 'shots/owner-home.png' });
  const links = await page.$$eval('nav a, aside a', as => [...new Set(as.map(a => `${a.innerText.trim().replace(/\s+/g, ' ')} -> ${a.getAttribute('href')}`))]);
  console.log(links.join('\n'));
} else {
  console.log((await page.locator('body').innerText()).slice(0, 400));
}
await browser.close();
