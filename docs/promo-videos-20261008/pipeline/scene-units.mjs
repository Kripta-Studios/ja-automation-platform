import { BASE, launch, newCtx, startRecording, keepAlive, smoothScroll, settle, sleep } from './rec-lib.mjs';

const BLUR = `for (const el of document.querySelectorAll('main *')) {
  if (el.children.length === 0 && /Bank (Swift|Account|Name)|Beneficiary|Swift|Routing|IBAN/i.test(el.textContent || '')) {
    (el.closest('tr, li, p, div') || el).style.filter = 'blur(7px)';
  }
}`;

const browser = await launch();
const ctx = await newCtx(browser, { state: 'state/owner.json' });
const page = await ctx.newPage();
await page.goto(`${BASE}/billing/invoices/01a10cb5-ec04-7109-af1a-c49ae34b0116?lang=en`, { waitUntil: 'domcontentloaded' });
await settle(page, 800);
await page.evaluate(new Function(BLUR));
await keepAlive(page);
await page.mouse.move(1100, 400);
const rec = await startRecording(page, 'rec/units');
await sleep(900);
const row = page.locator('main').getByText('Full unit rate (day)', { exact: false }).first();
const b = await row.boundingBox();
await smoothScroll(page, Math.max(0, b.y - 280), 1800);
await page.evaluate(new Function(BLUR));
await keepAlive(page);
rec.mark('lines');
await sleep(2200);
const actual = page.locator('main').getByText('Actual recorded time', { exact: false }).first();
const ab = await actual.boundingBox();
if (ab && ab.y > 700) await smoothScroll(page, ab.y - 620, 1400);
await page.evaluate(new Function(BLUR));
await sleep(2200);
rec.mark('total');
await sleep(1600);
await rec.stop();
await browser.close();
