import { expect, test } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('Accounting summary controls filter the register', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/accounting?lang=en'));
  await page.locator('.accounting-section__attention').getByRole('button', { name: /Failed/ }).click();
  await expect(page.locator('#accounting-register select').first()).toHaveValue('failed');
  await page.locator('.accounting-section__attention').getByRole('button', { name: /^Packs/ }).click();
  await expect(page.locator('#accounting-register select').first()).toHaveValue('');
});

test('Planning honors project filters and keeps the requested selector', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/planning?lang=en'));
  const selector = page.locator('select[name=project]');
  const project = await selector.locator('option').nth(1).getAttribute('value');
  expect(project).toBeTruthy();
  await selector.selectOption(project!);
  await selector.locator('xpath=ancestor::form').getByRole('button', { name: 'Filter', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('project') === project);
  await expect(selector).toHaveValue(project!);
  await expect.poll(() => page.locator('.record-card-link').evaluateAll((rows, id) => rows.every(row => row.getAttribute('href')?.includes(`project=${id}`)), project)).toBe(true);
  await page.goto(portal(`/planning?lang=en&project=${randomUUID()}`));
  await expect(page.locator('.record-card-link')).toHaveCount(0);
});

test('Focused management records open beyond the first page', async ({ page }) => {
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const ids: string[] = [];
  try {
    const worker = db.sqlite.prepare("SELECT id FROM user WHERE email='worker@demo.jaautomation.test'").get()!;
    for (let day = 1; day <= 10; day++) {
      const id = randomUUID(); ids.push(id);
      const date = `2098-01-${String(day).padStart(2, '0')}`;
      db.sqlite.prepare("INSERT INTO worker_availability(id,worker_id,starts_at,ends_at,availability,created_at,updated_at) VALUES(?,?,?,?,'tentative',?,?)")
        .run(id, worker.id, `${date}T08:00:00Z`, `${date}T16:00:00Z`, date, date);
    }
  } finally { db.sqlite.close(); }
  await signIn(page, 'owner');
  await page.goto(portal(`/manage?area=worker_availability&focus=${ids.at(-1)}&lang=en`));
  const form = page.locator(`form:has(input[name=id][value="${ids.at(-1)}"])`).first();
  await expect(form).toBeVisible();
});

test('Supplier report keeps a single sidebar and worker exports deny another identity', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/supplier/report?lang=en'));
  await expect(page.locator('.portal-layout > aside')).toHaveCount(1);
  await page.context().clearCookies();
  await signIn(page, 'worker');
  const denied = await page.request.get(portal(`/expenses/export?from=2026-01-01&to=2026-12-31&worker=${randomUUID()}&format=csv`));
  expect(denied.status()).toBe(403);
  const own = await page.request.get(portal('/expenses/export?from=2026-01-01&to=2026-12-31&format=csv'));
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toContain('text/csv');
  expect(await own.text()).not.toMatch(/client_rate|internal_cost|margin/);
  const profileDenied = await page.request.post(portal('/projects?/setWorkforceProfile'), {
    form: { workerId: randomUUID(), profile: 'supplier_coordinator', supplierId: randomUUID() },
    headers: { origin: 'http://127.0.0.1:4174' },
  });
  // SvelteKit returns enhanced action failures in a 200 transport response.
  expect(await profileDenied.json()).toMatchObject({ type: 'failure', status: 403 });
});

test('Register filters survive opening a detail and returning', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  const search = page.locator('.record-browser__controls input[type="search"]').first();
  await search.fill('Body');
  await page.goto(portal('/help?lang=en'));
  await page.goBack();
  await expect(search).toHaveValue('Body');
});
