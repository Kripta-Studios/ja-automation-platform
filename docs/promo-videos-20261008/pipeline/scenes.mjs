import fs from 'node:fs';
import { BASE, launch, newCtx, startRecording, keepAlive, moveTo, clickOn, typeSlow, smoothScroll, settle, sleep } from './rec-lib.mjs';

const P = '01a10c51-a391-7288-aad1-cb38be43f496';
const PX = 4 / 3; // frames are recorded at 1920x1080 for a 1440x810 CSS viewport // CSS px -> recorded frame px

async function go(page, path) {
  await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 900);
  await keepAlive(page);
}

async function boxOf(page, loc) {
  const b = await (typeof loc === 'string' ? page.locator(loc).first() : loc).boundingBox();
  return b && { x: b.x * PX, y: b.y * PX, w: b.width * PX, h: b.height * PX, cx: (b.x + b.width / 2) * PX, cy: (b.y + b.height / 2) * PX };
}

const mainText = (page, text, exact = true) => page.locator('main').getByText(text, { exact }).first();

const BLUR_BANK = `
  for (const el of document.querySelectorAll('main *')) {
    if (el.children.length === 0 && /Bank (Swift|Account|Name)|Beneficiary|Swift|Routing|IBAN/i.test(el.textContent)) {
      const row = el.closest('tr, li, p, div') || el;
      row.style.filter = 'blur(7px)';
    }
  }`;

const scenes = {
  async dashboard(page, rec) {
    await go(page, '/');
    await page.mouse.move(980, 420);
    const r = await rec();
    await sleep(1200);
    await moveTo(page, { x: 1290, y: 260 }, { steps: 30 });
    await sleep(300);
    r.mark('scroll');
    await smoothScroll(page, 430, 1500);
    await sleep(900);
    await moveTo(page, mainText(page, 'Cash calendar', false), { steps: 26 });
    await sleep(600);
    await smoothScroll(page, -430, 1100);
    await sleep(300);
    const fab = page.locator('[data-assistant-launcher]');
    r.mark('assistant');
    await clickOn(page, fab, { steps: 30 });
    await sleep(700);
    await typeSlow(page, 'create invoice', 75);
    await sleep(900);
    await moveTo(page, page.getByRole('dialog').getByText('Create an invoice draft').first(), { steps: 24 });
    await sleep(1600);
    r.mark('end');
    await r.stop();
    await page.keyboard.press('Escape');
  },

  async project(page, rec) {
    await go(page, `/projects/${P}`);
    await page.mouse.move(700, 300);
    const r = await rec();
    await sleep(900);
    await moveTo(page, mainText(page, 'ASSIGNED TEAM', false), { steps: 30 });
    await sleep(700);
    await moveTo(page, mainText(page, 'CONTRIBUTION', false), { steps: 24 });
    await sleep(800);
    r.mark('team-tab');
    await clickOn(page, page.locator('main').getByRole('tab', { name: 'Team' }).or(page.locator('main').getByRole('link', { name: 'Team', exact: true })).first(), { steps: 26 });
    await settle(page, 400);
    await keepAlive(page);
    await smoothScroll(page, 380, 1400);
    await sleep(1200);
    await smoothScroll(page, -380, 900);
    r.mark('reports-tab');
    await clickOn(page, page.locator('main').getByRole('tab', { name: /Reports/ }).or(page.locator('main').getByRole('link', { name: /^Reports & Files/ })).first(), { steps: 22 });
    await settle(page, 400);
    await keepAlive(page);
    await smoothScroll(page, 420, 1400);
    await sleep(1500);
    await r.stop();
  },

  async planning(page, rec) {
    await go(page, '/planning?month=2026-10');
    await smoothScroll(page, 180, 10);
    await page.mouse.move(800, 300);
    const r = await rec();
    await sleep(900);
    for (const d of ['9', '12', '14', '19']) {
      await moveTo(page, page.locator('main button').filter({ hasText: new RegExp(`^\\s*${d}\\s*\\d\\s*$`) }).first(), { steps: 22 });
      await sleep(350);
    }
    r.mark('schedule');
    const sched = mainText(page, 'Published schedule', true);
    const sb = await sched.boundingBox();
    await smoothScroll(page, Math.max(0, sb.y - 60), 2200);
    await sleep(500);
    const list = page.locator('main').getByText('Plant 2 · Line 3 packaging cell').first();
    if (await list.count()) { const lb = await list.boundingBox(); await smoothScroll(page, Math.max(0, lb.y - 260), 1400); }
    await sleep(2400);
    await r.stop();
  },

  async approvals(page, rec) {
    await go(page, `/approvals?tab=time&project=${P}`);
    const q = page.locator('main').getByText('Action queue', { exact: false }).first();
    await q.scrollIntoViewIfNeeded();
    await smoothScroll(page, -120, 10);
    await page.mouse.move(900, 300);
    const r = await rec();
    await sleep(1000);
    const target = 'BBS DEMO - Tecnico 1 · 2026-10-07';
    const card = page.locator('main').getByText(target, { exact: true }).first();
    await moveTo(page, card, { steps: 30 });
    await sleep(600);
    const handle = await page.evaluateHandle(text => {
      const btns = [...document.querySelectorAll('main button')].filter(b => b.innerText.trim() === 'Approve' && b.offsetParent);
      let best = null;
      for (const b of btns) { let n = b.parentElement; while (n && !n.innerText.includes(text)) n = n.parentElement; if (n && (!best || n.innerText.length < best.len)) best = { b, len: n.innerText.length }; }
      return best?.b;
    }, target);
    r.mark('approve');
    await clickOn(page, handle.asElement(), { steps: 26 });
    await page.waitForTimeout(600);
    const confirm = page.getByRole('dialog').getByRole('button', { name: /approve|confirm/i }).last();
    if (await confirm.count()) await clickOn(page, confirm, { steps: 16 });
    await settle(page, 300);
    await keepAlive(page);
    r.mark('approved');
    await sleep(2200);
    await r.stop();
  },

  async report(page, rec) {
    await go(page, '/reports/01a11c09-aca5-76b9-adc3-ffdcd24bc168');
    await page.mouse.move(1000, 300);
    const r = await rec();
    await sleep(1000);
    await moveTo(page, mainText(page, 'Approved'), { steps: 26 });
    await sleep(500);
    await smoothScroll(page, 520, 2000);
    await sleep(700);
    await smoothScroll(page, 600, 2200);
    await sleep(700);
    await smoothScroll(page, 600, 2200);
    await sleep(1200);
    await r.stop();
  },

  async finance(page, rec) {
    await go(page, `/finance?view=economic&project=${P}`);
    await page.mouse.move(900, 300);
    const r = await rec();
    await sleep(800);
    const kpi = mainText(page, 'DIRECT PROJECT RESULT', false);
    const b0 = await kpi.boundingBox();
    await smoothScroll(page, Math.max(0, b0.y - 210), 2000);
    await sleep(400);
    fs.writeFileSync('rec/finance-kpi.json', JSON.stringify(await boxOf(page, kpi)));
    r.mark('kpi');
    await moveTo(page, kpi, { steps: 26 });
    await sleep(900);
    await moveTo(page, mainText(page, 'DIRECT COST', false), { steps: 22 });
    await sleep(800);
    await moveTo(page, page.locator('main').getByText(/^hours$/i).first(), { steps: 22 });
    await sleep(1400);
    await r.stop();
  },

  async billing(page, rec) {
    await go(page, `/billing?project=${P}`);
    await page.mouse.move(900, 300);
    const r = await rec();
    await sleep(800);
    const reg = mainText(page, 'Invoice register', true);
    const rb = await reg.boundingBox();
    await smoothScroll(page, Math.max(0, rb.y - 120), 1600);
    await sleep(600);
    const link = page.locator('main a[href*="/billing/invoices/01a10c63-be27-7728-8655-69a5bba6cc72"]').first();
    r.mark('open-invoice');
    await clickOn(page, link, { steps: 30 });
    await page.waitForURL(/billing\/invoices\//, { timeout: 15000 });
    await page.evaluate(new Function(BLUR_BANK));
    await settle(page, 200);
    await page.evaluate(new Function(BLUR_BANK));
    await keepAlive(page);
    r.mark('invoice');
    await sleep(900);
    const bill = mainText(page, 'BILL TO', false);
    const bb = await bill.boundingBox();
    await smoothScroll(page, Math.max(0, bb.y - 260), 1800);
    await page.evaluate(new Function(BLUR_BANK));
    await sleep(700);
    await smoothScroll(page, 520, 2000);
    await page.evaluate(new Function(BLUR_BANK));
    await sleep(1500);
    await r.stop();
  },

  async audit(page, rec) {
    await go(page, '/audit');
    await page.mouse.move(900, 300);
    const r = await rec();
    await sleep(900);
    await clickOn(page, mainText(page, 'View details'), { steps: 30 });
    await sleep(500);
    await smoothScroll(page, 300, 1400);
    await sleep(1600);
    await r.stop();
  },

  async language(page, rec) {
    await go(page, '/');
    await page.mouse.move(900, 300);
    const r = await rec();
    await sleep(900);
    const sel = page.locator('header select, select').filter({ has: page.locator('option[value="es"]') }).first();
    await moveTo(page, sel, { steps: 30 });
    await sleep(300);
    r.mark('es');
    await page.mouse.down(); await sleep(60); await page.mouse.up();
    await sel.selectOption('es');
    await settle(page, 300);
    await keepAlive(page);
    await sleep(1800);
    const sel2 = page.locator('select').filter({ has: page.locator('option[value="pt"]') }).first();
    await moveTo(page, sel2, { steps: 12 });
    r.mark('pt');
    await page.mouse.down(); await sleep(60); await page.mouse.up();
    await sel2.selectOption('pt');
    await settle(page, 300);
    await keepAlive(page);
    await sleep(1800);
    await r.stop();
    const sel3 = page.locator('select').filter({ has: page.locator('option[value="en"]') }).first();
    await sel3.selectOption('en');
    await settle(page, 500);
    console.log('  restored language ->', page.url());
  },

  async mobile(page, rec) {
    await go(page, '/');
    await page.mouse.move(200, 500);
    const r = await rec({ mobile: true });
    await sleep(1200);
    r.mark('scroll');
    const up = page.getByText('Upcoming assignments').first();
    const ub = await up.boundingBox();
    await smoothScroll(page, Math.max(0, ub.y - 120), 1800);
    await sleep(1400);
    r.mark('time');
    await clickOn(page, page.getByRole('link', { name: 'Time', exact: true }).last(), { steps: 22 });
    await page.waitForURL(/\/time/, { timeout: 15000 });
    await settle(page, 300);
    await keepAlive(page);
    await sleep(700);
    await clickOn(page, page.getByRole('button', { name: 'Log time' }).first(), { steps: 22 });
    await sleep(700);
    const f = page.locator('form[action*="createTime"]').filter({ visible: true }).first();
    const tap = async loc => { await loc.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(250); await clickOn(page, loc, { steps: 18 }); await loc.focus(); };
    await tap(f.locator('select[name=projectId]'));
    await f.locator('select[name=projectId]').selectOption(P);
    await sleep(500);
    await tap(f.locator('input[name=durationHours]'));
    await typeSlow(page, '8', 120);
    await sleep(300);
    await tap(f.locator('textarea[name=summary]'));
    await typeSlow(page, 'Customer acceptance test on Line 3', 45);
    await sleep(1200);
    await r.stop();
  },
};

const name = process.argv[2];
const role = process.argv[3] || 'owner';
const mobile = name === 'mobile';
const browser = await launch({ mobile });
const ctx = await newCtx(browser, { state: `state/${role}.json`, mobile });
if (mobile) await ctx.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#__promo_cursor svg{display:none} #__promo_cursor{width:46px;height:46px;border-radius:50%;background:rgba(30,30,30,.22);border:3px solid rgba(255,255,255,.95);box-shadow:0 2px 8px rgba(0,0,0,.35);transform:translate(-23px,-23px)!important}'; document.documentElement.appendChild(s); });`);
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
const out = `rec/${name}`;
await scenes[name](page, opts => startRecording(page, out, opts));
await ctx.storageState({ path: `state/${role}.json` });
await browser.close();
