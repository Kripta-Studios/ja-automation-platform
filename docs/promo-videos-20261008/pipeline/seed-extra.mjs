import { open, createExpense, createTime, submitExpenseWeek, submitWeek, PROJECT, settle, BASE, sleep } from './seed-lib.mjs';

const T1 = '01a10c51-a140-707b-9210-21b341b4d4ee';
const T2 = '01a10c51-a2ad-74c8-ae12-e377be6b6942';

async function crewDay(page, { date, hours, category, summary, submit = true }) {
  await page.goto(`${BASE}/crew?lang=en`, { waitUntil: 'domcontentloaded' });
  await settle(page, 600);
  const filter = page.locator('form').filter({ has: page.locator('input[name=date]') }).first();
  await filter.locator('input[name=date]').fill(date);
  await filter.getByRole('button', { name: 'Show project' }).evaluate(b => b.click());
  await settle(page, 800);
  const f = page.locator('form').filter({ has: page.locator('input[name=sharedHours]') }).first();
  await f.locator(`input[name=workerIds][value="${T1}"]`).check();
  await f.locator(`input[name=workerIds][value="${T2}"]`).check();
  await f.locator('input[name=mode][value=shared]').check();
  await f.locator('input[name=sharedHours]').fill(String(hours));
  await f.locator('select[name=category]').selectOption(category);
  await f.locator('textarea[name=summary]').fill(summary);
  if (submit) await f.locator('input[name=submit]').check();
  const resp = page.waitForResponse(r => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
  await f.getByRole('button', { name: /Save/ }).evaluate(b => b.click());
  const r = await resp;
  await settle(page, 1500);
  console.log('  crew', date, r?.status(), (await page.locator('[role="status"], [role="alert"], main').first().innerText()).replace(/\s+/g, ' ').slice(0, 240));
}

if (process.argv[2] === 'worker') {
  const s = await open('worker-1');
  await createExpense(s.page, { date: '2026-10-07', category: 'meals', vendor: 'Plant Diner DEMO', amount: '28.40', description: 'Dinner after the servo tuning shift.', paymentMethod: 'Personal card', receipt: 'assets/receipt-dinner.png' });
  await createExpense(s.page, { date: '2026-10-08', category: 'parking', vendor: 'Plant 2 Parking DEMO', amount: '18.00', description: 'Site parking during the operator dry-run.', paymentMethod: 'Cash', receipt: 'assets/receipt-parking.png' });
  await submitExpenseWeek(s.page, '2026-10-05');
  await s.close();
}
if (process.argv[2] === 'crew') {
  const s = await open('crew-chief');
  await crewDay(s.page, { date: '2026-10-09', hours: 8, category: 'regular', summary: 'Both technicians on the Line 3 customer acceptance test. Chief recorded the crew hours.' });
  await s.close();
}
if (process.argv[2] === 'tech') {
  const s = await open('external-technician');
  const opts = await s.page.goto(`${BASE}/time?lang=en`, { waitUntil: 'domcontentloaded' }).then(() => settle(s.page, 500)).then(() => s.page.getByRole('button', { name: 'Log time' }).first().click()).then(() => s.page.locator('form[action*="createTime"] select[name=projectId]').locator('option').allTextContents());
  console.log('  tech projects', opts);
  await s.page.keyboard.press('Escape');
  await createTime(s.page, { date: '2026-10-08', hours: 6, category: 'commissioning', summary: 'External support on Line 3: safety circuit witness test with the crew chief.' });
  await createTime(s.page, { date: '2026-10-09', hours: 4, category: 'regular', summary: 'Witnessed the customer acceptance run and signed the punch list.' });
  await submitWeek(s.page, '2026-10-05');
  await s.close();
}
