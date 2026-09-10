import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import { readE2EFixturePointer } from './environment.js';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { signIn, portal } from './auth.js';

test('Owner financial charts drill through to matching filters on every viewport', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const db = createDatabase(readE2EFixturePointer().databasePath);
  try {
    const rule = db.sqlite
      .prepare("SELECT id,project_id,currency FROM billing_rule WHERE currency='USD' LIMIT 1")
      .get() as { id: string; project_id: string; currency: string };
    expect(rule).toBeTruthy();
    const now = new Date();
    for (const due of ['2020-01-01', '2099-01-01']) {
      const invoiceId = randomUUID();
      db.sqlite
        .prepare(
          "INSERT INTO invoice(id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,snapshot_json,issued_at,due_at,created_at,updated_at) VALUES(?,?,?,?,'labor','issued',?,120000,0,120000,'{}',?,?,?,?)",
        )
        .run(
          invoiceId,
          rule.project_id,
          rule.id,
          `DASH-${invoiceId}`,
          rule.currency,
          now.toISOString(),
          due,
          now.toISOString(),
          now.toISOString(),
        );
      if (due === '2020-01-01')
        for (let month = 0; month < 6; month++) {
          const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - month, 1));
          db.sqlite
            .prepare(
              "INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at) VALUES(?,?,?,?,?,'Dashboard browser fixture',?)",
            )
            .run(
              randomUUID(),
              invoiceId,
              (month + 1) * 2000,
              rule.currency,
              date.toISOString(),
              now.toISOString(),
            );
        }
    }
  } finally {
    db.sqlite.close();
  }
  await signIn(page, 'owner');
  await page.goto(portal('?lang=es'));
  const overview = page.locator('[data-owner-finance]');
  await expect(overview.getByRole('heading', { name: 'Finanzas de la empresa' })).toBeVisible();
  await expect(overview.locator('[data-finance-metric]')).toHaveCount(4);
  await expect(overview.locator('.bar-link')).toHaveCount(12);
  expect(Number(await overview.locator('.bar').first().getAttribute('height'))).toBeGreaterThan(0);
  expect((await overview.locator('.bar').first().boundingBox())!.height).toBeGreaterThan(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const card of await overview.locator('[data-finance-metric]').all()) {
    const box = await card.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  mkdirSync('docs/evidence/owner-finance-20260910', { recursive: true });
  await overview.screenshot({
    path: `docs/evidence/owner-finance-20260910/dashboard-${testInfo.project.name}.png`,
  });
  await expect(overview.locator('.donut-content svg a').first()).toBeVisible();
  const chart = overview.locator('.donut-content svg').first();
  await chart.scrollIntoViewIfNeeded();
  const chartBox = (await chart.boundingBox())!;
  // Aim at the middle of the painted arc, even when overdue is a small share.
  const share = Number(
    (await chart.locator('a circle').first().getAttribute('stroke-dasharray'))!.split(' ')[0],
  );
  const angle = ((-90 + share * 1.8) * Math.PI) / 180;
  await page.mouse.click(
    chartBox.x + (chartBox.width * (60 + 44 * Math.cos(angle))) / 120,
    chartBox.y + (chartBox.height * (60 + 44 * Math.sin(angle))) / 120,
  );
  await expect(page.locator('#cash-filter')).toHaveValue('overdue');
  await page.goBack();
  const href = await overview.locator('[data-finance-metric="receivable"]').getAttribute('href');
  await overview.locator('[data-finance-metric="receivable"]').click();
  await expect(page.locator('#cash-filter')).toHaveValue('receivable');
  await expect(page.locator('#cash-currency')).toHaveValue(
    new URL(href!, portal()).searchParams.get('currency')!,
  );
  await page.goBack();
  const bar = page.locator('[data-owner-finance] .bar-link').last();
  const barHref = await bar.getAttribute('href');
  await bar.click();
  await expect(page.locator('#cash-filter')).toHaveValue('outgoing');
  await expect(page.locator('#cash-from')).toHaveValue(
    new URL(barHref!, portal()).searchParams.get('from')!,
  );
  await expect(page.locator('input[name="dated"]')).toBeChecked();
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.locator('#cash-filter')).toHaveValue('outgoing');
  await expect(page.locator('input[name="dated"]')).toBeChecked();
  await page.goto(portal('?lang=pt'));
  await expect(page.getByRole('heading', { name: 'Finanças da empresa' })).toBeVisible();
});

test('Worker receives no Owner finance summary', async ({ page }) => {
  await signIn(page, 'worker');
  const response = await page.goto(portal());
  await expect(page.locator('[data-owner-finance]')).toHaveCount(0);
  expect(await response!.text()).not.toContain('ownerFinance');
  expect((await page.goto(portal('/finance/cash?filter=collected')))?.status()).toBe(403);
});
