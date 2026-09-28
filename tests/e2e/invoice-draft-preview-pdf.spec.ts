import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('draft PDF contains the same invoice line as the browser preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  let invoice: { id: string; description: string };
  try {
    const row = db
      .prepare(
        "SELECT i.id,il.description FROM invoice i JOIN invoice_line il ON il.invoice_id=i.id WHERE i.state='draft' AND il.description<>'' ORDER BY i.created_at DESC LIMIT 1",
      )
      .get() as { id: string; description: string } | undefined;
    if (!row) throw new Error('Invoice PDF test requires a draft with a line');
    invoice = row;
  } finally {
    db.close();
  }
  await signIn(page, 'owner');
  await page.goto(portal(`/billing/invoices/${invoice.id}`));
  await expect(page.locator('main')).toContainText(invoice.description);
  const downloadLink = page.locator(`a[href*="/invoices/${invoice.id}/draft-preview"]`);
  await expect(downloadLink).toBeVisible();
  const response = await page.request.get(
    new URL((await downloadLink.getAttribute('href'))!, page.url()).toString(),
  );
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  const bytes = await response.body();
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  const pdfText = execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: bytes,
    encoding: 'utf8',
  });
  // Long table descriptions may wrap around the quantity and price columns.
  expect(pdfText).toContain(invoice.description.split(/\s+/).slice(0, 2).join(' '));
  expect(pdfText).not.toContain('No invoice lines.');
});
