import { test, expect } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { portal } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';

test('publish synthetic examples of the real browser print layouts', async ({ browser }, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Chromium print layouts include all supported locales.',
  );
  test.setTimeout(300_000);
  const pointer = readE2EFixturePointer();
  const supplierProject = seedSupplierPersonas(pointer.databasePath);
  const database = createDatabase(pointer.databasePath);
  const first = (table: string) => {
    const row = database.sqlite.prepare(`SELECT id FROM ${table} ORDER BY id LIMIT 1`).get() as
      | { id: string }
      | undefined;
    if (!row) throw new Error(`Synthetic fixture has no ${table} record`);
    return encodeURIComponent(row.id);
  };
  const period = (audience: string) =>
    encodeURIComponent(
      String(
        database.sqlite
          .prepare(
            'SELECT id FROM period_report WHERE audience=? AND snapshot_sha256 IS NOT NULL ORDER BY id DESC LIMIT 1',
          )
          .get(audience)!.id,
      ),
    );
  const routes = [
    { key: 'time-register', route: '/time' },
    {
      key: 'project',
      route: `/projects/${encodeURIComponent(String(database.sqlite.prepare('SELECT project_id FROM time_entry GROUP BY project_id ORDER BY count(*) DESC LIMIT 1').get()!.project_id))}`,
    },
    { key: 'time-entry', route: `/time/${first('time_entry')}` },
    { key: 'expense', route: `/expenses/${first('expense')}` },
    { key: 'daily-report', route: `/reports/${first('daily_report')}` },
    { key: 'technical-report', route: `/reports/${first('technical_report')}` },
    { key: 'period-report-customer', route: `/reports/period/${period('customer')}` },
    { key: 'period-report-internal', route: `/reports/period/${period('internal')}` },
    { key: 'invoice', route: `/billing/invoices/${first('invoice')}` },
    {
      key: 'supplier-report',
      route: `/supplier/report?projectId=${encodeURIComponent(supplierProject)}`,
    },
  ];
  database.sqlite.close();
  const output = resolve('docs/manuals/examples/browser-print');
  mkdirSync(output, { recursive: true });
  const artifacts: Record<string, unknown>[] = [];
  for (const locale of ['en', 'es', 'pt'] as const) {
    for (const account of ['owner', 'supplierCoordinator'] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const page = await context.newPage();
        await signInManualPersona(page, account);
        for (const item of routes.filter(
          (item) => (item.key === 'supplier-report') === (account === 'supplierCoordinator'),
        )) {
          const url = new URL(portal(item.route));
          url.searchParams.set('lang', locale);
          const response = await page.goto(url.href, { waitUntil: 'networkidle' });
          expect(response?.status(), item.key).toBe(200);
          await expect(page.locator('main').first()).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute(
            'lang',
            { en: 'en-US', es: 'es-ES', pt: 'pt-BR' }[locale],
          );
          if (item.key.startsWith('period-report-')) {
            await expect(page.locator('[data-report-lifecycle-state]')).toBeVisible();
            await expect(page.locator('.record-detail-header h1')).not.toBeEmpty();
            await expect(page.locator('[data-customer-signoff]')).toHaveCount(
              item.key.endsWith('customer') ? 1 : 0,
            );
          }
          await page.evaluate(() => document.fonts.ready);
          const filename = `EXAMPLE-browser-${item.key}-${locale === 'pt' ? 'pt-BR' : locale}.pdf`;
          await page.pdf({
            path: resolve(output, filename),
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate:
              '<div style="font:8px Arial;width:100%;text-align:center;color:#666">SYNTHETIC EXAMPLE · Browser print · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
            margin: { top: '12mm', right: '10mm', bottom: '16mm', left: '10mm' },
          });
          const bytes = readFileSync(resolve(output, filename));
          artifacts.push({
            id: `browser-${item.key}-${locale}`,
            family: `browser-print-${item.key}`,
            format: 'pdf',
            locale: locale === 'pt' ? 'pt-BR' : locale,
            file: `browser-print/${filename}`,
            renderer: 'Chromium page.pdf with application print CSS',
            source: 'isolated E2E demo fixture',
            description: `Browser print of ${item.key}; synthetic fixture${item.key === 'supplier-report' ? ' (empty assigned-project report)' : ''}.`,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            bytes: bytes.length,
          });
        }
      } finally {
        await context.close();
      }
    }
  }
  expect(artifacts).toHaveLength(30);
  writeFileSync(
    resolve(output, '../manifest-print.json'),
    JSON.stringify({ synthetic: true, artifacts }, null, 2) + '\n',
  );
});
