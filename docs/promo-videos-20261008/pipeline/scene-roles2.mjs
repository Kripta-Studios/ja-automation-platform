import { BASE, launch, newCtx, startRecording, keepAlive, moveTo, clickOn, typeSlow, smoothScroll, settle, sleep } from './rec-lib.mjs';

const P = '01a10c51-a391-7288-aad1-cb38be43f496';

async function go(page, path) {
  await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 700);
  await keepAlive(page);
}

const nav = (page, name) => page.locator('aside a, nav a').filter({ hasText: new RegExp(`^${name}$`) }).first();

const scenes = {
  async worker(page, rec) {
    await go(page, '/');
    await page.mouse.move(700, 360);
    const r = await rec();
    await sleep(900);
    await moveTo(page, page.getByRole('link', { name: 'Log actual time' }).first(), { steps: 24 });
    await sleep(500);
    r.mark('expenses');
    await clickOn(page, nav(page, 'Expenses'), { steps: 26 });
    await page.waitForURL(/\/expenses/, { timeout: 15000 });
    await settle(page, 400);
    await keepAlive(page);
    const row = page.getByText('Plant Diner DEMO').first();
    if (await row.count()) { const b = await row.boundingBox(); if (b) await smoothScroll(page, Math.max(0, b.y - 280), 1200); }
    await sleep(900);
    r.mark('form');
    await clickOn(page, page.getByRole('button', { name: /Record expense$/ }).first(), { steps: 22 });
    const f = page.locator('form[action*="createExpense"]');
    await f.waitFor();
    await f.locator('input[name=receipt]').setInputFiles('assets/receipt-shift.png');
    await f.locator('select[name=projectId]').selectOption(P);
    await f.locator('input[name=spentOn]').fill('2026-10-08');
    await f.locator('select[name=category]').selectOption('meals');
    await clickOn(page, f.locator('input[name=vendor]'), { steps: 16 });
    await typeSlow(page, 'Shift Cafe DEMO', 40);
    await clickOn(page, f.locator('input[name=amount]'), { steps: 14 });
    await typeSlow(page, '16.50', 70);
    await clickOn(page, f.locator('textarea[name=description]'), { steps: 14 });
    await typeSlow(page, 'Sandwich after the dry-run', 35);
    await sleep(400);
    const save = f.getByRole('button', { name: 'Save draft' });
    await save.evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 420));
    await sleep(400);
    r.mark('save');
    await clickOn(page, save, { steps: 18 });
    await settle(page, 700);
    await keepAlive(page);
    await sleep(900);
    r.mark('pay');
    await page.goto(`${BASE}/pay?lang=en`, { waitUntil: 'domcontentloaded' });
    await settle(page, 400);
    await keepAlive(page);
    const money = page.getByText('$1,200.00').first();
    const mb = await money.boundingBox();
    if (mb && mb.y > 500) await smoothScroll(page, mb.y - 240, 1000);
    await moveTo(page, money, { steps: 22 });
    await sleep(1800);
    await r.stop();
  },

  async crew(page, rec) {
    await go(page, '/crew');
    const filter = page.locator('form').filter({ has: page.locator('input[name=date]') }).first();
    await filter.locator('input[name=date]').fill('2026-10-09');
    await filter.getByRole('button', { name: 'Show project' }).evaluate(b => b.click());
    await settle(page, 700);
    await keepAlive(page);
    await page.mouse.move(640, 300);
    const r = await rec();
    await sleep(700);
    const t1 = page.getByText('BBS DEMO - Tecnico 1').first();
    await t1.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await sleep(300);
    r.mark('both');
    await moveTo(page, t1, { steps: 26 });
    await sleep(600);
    await moveTo(page, page.getByText('BBS DEMO - Tecnico 2').first(), { steps: 20 });
    await sleep(800);
    const alloc = page.getByText('Allocate one crew receipt').first();
    await alloc.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await sleep(400);
    r.mark('receipt');
    const sel = page.locator('select').filter({ hasText: 'Acceptance lunch' }).first();
    await clickOn(page, sel, { steps: 24 });
    await sleep(400);
    const label = await sel.locator('option').evaluateAll(os => os.map(o => o.textContent.trim()).find(t => t.includes('Acceptance lunch')));
    if (label) await sel.selectOption({ label });
    await sleep(1600);
    await r.stop();
  },

  async finance(page, rec) {
    await go(page, `/finance?view=economic&project=${P}`);
    const kpi0 = page.locator('main').getByText('DIRECT PROJECT RESULT').first();
    const b0 = await kpi0.boundingBox();
    await smoothScroll(page, Math.max(0, b0.y - 160), 400);
    await page.mouse.move(780, 420);
    const r = await rec();
    await sleep(800);
    const kpi = page.locator('main').getByText('DIRECT PROJECT RESULT').first();
    const b = await kpi.boundingBox();
    await smoothScroll(page, Math.max(0, b.y - 180), 1600);
    await sleep(400);
    r.mark('kpi');
    await moveTo(page, kpi, { steps: 24 });
    await sleep(700);
    await moveTo(page, page.locator('main').getByText('INVOICED', { exact: false }).first(), { steps: 18 });
    await sleep(600);
    await moveTo(page, page.locator('main').getByText(/^hours$/i).first(), { steps: 18 });
    await sleep(900);
    const table = page.getByText('Source records').first();
    if (await table.count()) {
      const tb = await table.boundingBox();
      if (tb) await smoothScroll(page, Math.max(0, tb.y - 120), 1400);
      r.mark('sources');
      await sleep(1800);
    }
    await r.stop();
  },

  async tech(page, rec) {
    await go(page, '/time');
    await page.mouse.move(700, 400);
    const r = await rec();
    await sleep(800);
    const hours = page.getByText('6.00h').first();
    if (await hours.count()) { const b = await hours.boundingBox(); if (b && b.y > 600) await smoothScroll(page, b.y - 300, 900); }
    await sleep(700);
    r.mark('form');
    await clickOn(page, page.getByRole('button', { name: 'Log time' }).first(), { steps: 24 });
    const f = page.locator('form[action*="createTime"]').filter({ visible: true }).first();
    await f.locator('select[name=projectId]').selectOption(P);
    await clickOn(page, f.locator('input[name=durationHours]'), { steps: 16 });
    await typeSlow(page, '3', 90);
    await f.locator('select[name=category]').selectOption('remote_support');
    await clickOn(page, f.locator('textarea[name=summary]'), { steps: 16 });
    await typeSlow(page, 'Remote support after the acceptance test', 32);
    await sleep(500);
    const save = f.getByRole('button', { name: 'Save draft' });
    await save.evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 420));
    await sleep(300);
    r.mark('save');
    await clickOn(page, save, { steps: 16 });
    await settle(page, 500);
    await keepAlive(page);
    await sleep(1600);
    await r.stop();
  },
};

const name = process.argv[2];
const role = { worker: 'worker-1', crew: 'crew-chief', finance: 'finance', tech: 'external-technician' }[name];
const browser = await launch();
const ctx = await newCtx(browser, { state: `state/${role}.json` });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
const dir = { worker: 'worker', crew: 'crew', finance: 'finance2', tech: 'tech2' }[name];
await scenes[name](page, () => startRecording(page, `rec/${dir}`));
await ctx.storageState({ path: `state/${role}.json` });
await browser.close();
