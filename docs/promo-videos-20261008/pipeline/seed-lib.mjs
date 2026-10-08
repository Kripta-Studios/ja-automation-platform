import { BASE, launch, newCtx, settle, sleep } from './rec-lib.mjs';
export const PROJECT = '01a10c51-a391-7288-aad1-cb38be43f496';

export async function open(role) {
  const browser = await launch();
  const ctx = await newCtx(browser, { state: `state/${role}.json` });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  return { browser, ctx, page, async close() { await ctx.storageState({ path: `state/${role}.json` }); await browser.close(); } };
}

async function feedback(page) {
  const txt = await page.locator('[role="status"], [role="alert"], .toast, .form-message, .notice').allInnerTexts().catch(() => []);
  return txt.map(t => t.trim()).filter(Boolean).join(' | ').slice(0, 300);
}

export async function createTime(page, { date, hours, category = 'regular', summary }) {
  await page.goto(`${BASE}/time?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 600);
  await page.getByRole('button', { name: 'Log time' }).first().click();
  const f = page.locator('form[action*="createTime"]');
  await f.waitFor();
  await f.locator('select[name=projectId]').selectOption(PROJECT);
  await f.locator('input[name=workDate]').fill(date);
  await f.locator('select[name=category]').selectOption(category);
  await f.locator('input[name=durationHours]').fill(String(hours));
  await f.locator('textarea[name=summary]').fill(summary);
  await f.getByRole('button', { name: 'Save draft' }).evaluate(b => b.click());
  await settle(page, 1200);
  console.log('  time', date, hours, category, '->', await feedback(page));
}

export async function submitWeek(page, week) {
  await page.goto(`${BASE}/time?lang=en&week=${week}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 800);
  const btn = page.locator('form[action*="submitTimeWeek"] button[type=submit]');
  console.log('  submit week', week, await page.locator('form[action*="submitTimeWeek"]').innerText().catch(() => ''));
  await btn.evaluate(b => b.click());
  await settle(page, 1500);
  console.log('  ->', await feedback(page));
}

export async function createDaily(page, r) {
  await page.goto(`${BASE}/reports?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 600);
  await page.getByRole('button', { name: 'New daily report' }).first().click();
  const f = page.locator('form[action*="createDailyReport"]');
  await f.waitFor();
  await f.locator('select[name=projectId]').selectOption(PROJECT);
  await f.locator('input[name=workDate]').fill(r.date);
  for (const k of ['siteShift', 'summary', 'tasksCompleted', 'problemsFound', 'correctiveActions', 'openItems', 'nextDayPlan', 'standbyReason']) {
    if (r[k]) await f.locator(`[name=${k}]`).fill(r[k]);
  }
  if (r.downtimeMinutes) await f.locator('input[name=downtimeMinutes]').fill(String(r.downtimeMinutes));
  await f.getByRole('button', { name: 'Save daily report' }).evaluate(b => b.click());
  await settle(page, 1500);
  console.log('  daily', r.date, '->', page.url(), await feedback(page));
}

export { sleep, settle, BASE };

export async function submitDraftReports(page, view = "daily") {
  for (let i = 0; i < 6; i++) {
    await page.goto(`${BASE}/reports?lang=en&project=${PROJECT}&status=draft&view=${view}`, { waitUntil: 'domcontentloaded' });
    await settle(page, 800);
    const btn = page.locator('main').getByRole('button', { name: 'Submit', exact: true }).first();
    if (!(await btn.count())) { console.log('  no more draft reports'); return; }
    await btn.evaluate(b => b.click());
    await settle(page, 800);
    const confirm = page.getByRole('dialog').getByRole('button', { name: /submit/i }).last();
    if (await confirm.count()) { await confirm.evaluate(b => b.click()); await settle(page, 1200); }
    const msg = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
    console.log('  submitted report ->', msg.join(' | ').replace(/\s+/g, ' ').slice(0, 200));
  }
}

export async function createTechnical(page, r) {
  await page.goto(`${BASE}/reports?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 600);
  await page.getByRole('button', { name: 'New technical report' }).first().click();
  const f = page.locator('form[action*="createTechnicalReport"]');
  await f.waitFor();
  await f.locator('select[name=projectId]').selectOption(PROJECT);
  await f.locator('input[name=reportDate]').fill(r.reportDate);
  for (const [k, v] of Object.entries(r)) if (k !== 'reportDate') await f.locator(`[name=${k}]`).fill(v);
  await f.getByRole('button', { name: 'Save PLC report' }).evaluate(b => b.click());
  await settle(page, 1500);
  console.log('  technical', r.reportDate, '->', page.url(), (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 200));
}

export async function createExpense(page, e) {
  await page.goto(`${BASE}/expenses?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 600);
  await page.getByRole('button', { name: /Record expense$/ }).first().click();
  const f = page.locator('form[action*="createExpense"]');
  await f.waitFor();
  if (e.receipt) await f.locator('input[name=receipt]').setInputFiles(e.receipt);
  await f.locator('select[name=projectId]').selectOption(PROJECT);
  await f.locator('input[name=spentOn]').fill(e.date);
  await f.locator('select[name=category]').selectOption(e.category);
  await f.locator('input[name=vendor]').fill(e.vendor);
  await f.locator('input[name=amount]').fill(e.amount);
  await f.locator('textarea[name=description]').fill(e.description);
  if (e.paymentMethod) await f.locator('input[name=paymentMethod]').fill(e.paymentMethod);
  await page.waitForTimeout(1200);
  const resp = page.waitForResponse(r => r.url().includes('createExpense'), { timeout: 20000 }).catch(() => null);
  await f.getByRole('button', { name: 'Save draft' }).evaluate(b => b.click());
  const r = await resp;
  await settle(page, 1500);
  console.log('  createExpense status', r?.status());
  console.log('  expense', e.date, e.amount, '->', (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 200));
}

export async function submitExpenseWeek(page, week) {
  await page.goto(`${BASE}/expenses?lang=en&week=${week}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 800);
  await page.locator('form[action*="submitExpenseWeek"] button[type=submit]').evaluate(b => b.click());
  await settle(page, 800);
  const confirm = page.getByRole('dialog').getByRole('button', { name: /submit/i }).last();
  if (await confirm.count()) { await confirm.evaluate(b => b.click()); await settle(page, 1500); }
  console.log('  submit expense week ->', (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 300));
}

/** Clicks the Approve button inside the smallest queue card that contains `text`. */
export async function approveItem(page, path, text, label = 'Approve') {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 900);
  const resp = page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
  const found = await page.evaluate(([text, label]) => {
    const btns = [...document.querySelectorAll('main button')].filter(b => b.innerText.trim() === label && b.offsetParent);
    let best = null;
    for (const b of btns) {
      let n = b.parentElement;
      while (n && !n.innerText.includes(text)) n = n.parentElement;
      if (n && (!best || n.innerText.length < best.len)) best = { b, len: n.innerText.length };
    }
    if (!best) return false;
    best.b.scrollIntoView({ block: 'center' });
    best.b.click();
    return true;
  }, [text, label]);
  if (!found) { console.log('  approve: not found', text); return; }
  await page.waitForTimeout(700);
  const confirm = page.getByRole('dialog').getByRole('button', { name: /approve|confirm/i }).last();
  if (await confirm.count()) await confirm.evaluate(b => b.click());
  const r = await resp;
  await settle(page, 1200);
  console.log('  approve', text, '->', r?.status(), (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 160));
}

export const WORKERS = { chief: '01a10c51-9ff2-77d1-a994-de141701efe3', t1: '01a10c51-a140-707b-9210-21b341b4d4ee', t2: '01a10c51-a2ad-74c8-ae12-e377be6b6942', ext: '9b913044-af49-479f-8c6f-f82599914a69' };
export async function publishPlan(page, p) {
  await page.goto(`${BASE}/planning?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 700);
  const f = page.locator('#planning-create-form');
  await f.locator('select[name=projectId]').selectOption(PROJECT);
  for (const w of p.workers) await f.locator(`input[name=workerIds][value="${WORKERS[w]}"]`).check();
  await f.locator('input[name=startsAt]').fill(p.start);
  await f.locator('input[name=endsAt]').fill(p.end);
  await f.getByLabel('Planned hours (optional)').fill(String(p.hours));
  await f.locator('input[name=site]').fill(p.site);
  await f.locator('input[name=requiredSkill]').fill(p.skill);
  const resp = page.waitForResponse(r => r.url().includes('createPlanning'), { timeout: 15000 }).catch(() => null);
  await f.getByRole('button', { name: 'Publish assignment' }).evaluate(b => b.click());
  const r = await resp;
  await settle(page, 1000);
  console.log('  plan', p.start, p.workers.join(','), '->', r?.status(), (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 160));
}
