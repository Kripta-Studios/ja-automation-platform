import { execFileSync } from 'node:child_process';
import { expect, test, type Locator } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

async function centered(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const destination =
          element.getBoundingClientRect().height > innerHeight * 0.7
            ? (element.querySelector('h2, h3, h4, legend, summary') ?? element)
            : element;
        const bounds = destination.getBoundingClientRect();
        const desired = scrollY + bounds.top + bounds.height / 2 - innerHeight / 2;
        const attainable = Math.max(
          0,
          Math.min(desired, document.documentElement.scrollHeight - innerHeight),
        );
        return Math.abs(scrollY - attainable);
      }),
    )
    .toBeLessThan(28);
}

test('draft and approved numbers open the exact configuration or role-safe summary without reserving numbers', async ({
  playwright,
}, info) => {
  // Own the browser explicitly so it closes before the PDF renderer starts Chromium.
  // No UI browser and PDF browser run at the same time.
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const db = database.sqlite;
  const repository = new PortalRepository(db);
  const ownerId = String(
    db.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email)!.id,
  );
  const owner = repository.principalFor(ownerId);
  const invoice = db
    .prepare(
      `SELECT i.id,i.project_id,p.client_id FROM invoice i JOIN project p ON p.id=i.project_id
       WHERE i.state='draft' AND i.invoice_number IS NULL AND i.issued_at IS NULL
       AND EXISTS(SELECT 1 FROM invoice_line il WHERE il.invoice_id=i.id)
       ORDER BY i.created_at DESC LIMIT 1`,
    )
    .get() as { id: string; project_id: string; client_id: string };
  expect(invoice).toBeTruthy();
  const preview = repository.invoicePreview(owner, invoice.id).invoice as Record<string, unknown>;
  const number = preview.draft_number_preview as {
    number: string;
    policy: { prefix: string; digits: number; effectiveFrom: string };
  };
  expect(number.number).toMatch(/-\d{4}-\d+$/);
  const sequences = () => db.prepare('SELECT * FROM number_sequence ORDER BY scope,scope_id').all();
  const originalSequences = sequences();
  const browser = await playwright.chromium.launch({
    ...(process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.JA_PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  let ownerStorage: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>;
  try {
    for (const role of ['owner', 'finance', 'auditor', 'manager', 'worker'] as const) {
      const context = await browser.newContext({ viewport: info.project.use.viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await signIn(page, role);
        const invoiceUrl = portal(`/billing/invoices/${invoice.id}?lang=en`);
        const response = await page.goto(invoiceUrl);
        if (role === 'worker' || role === 'manager') {
          expect(response!.status()).toBe(404);
          await expect(page.locator('main')).not.toContainText(number.number);
          expect(errors).toEqual([]);
          continue;
        }
        const numberButtons = page.locator('button[data-invoice-edit="invoiceNumber"]');
        await expect(numberButtons).toHaveCount(2);
        for (const button of await numberButtons.all()) {
          await expect(button).toHaveText(number.number);
          const bounds = await button.boundingBox();
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
          expect(bounds!.width).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator('.invoice-number-notice')).toHaveCount(2);
        await expect(page.locator('.invoice-number-notice').first()).toContainText('not reserved');
        await page.screenshot({ path: info.outputPath(`${role}-draft.png`), fullPage: true });
        if (role === 'owner') {
          // Staying on an edited draft must neither lose values nor cause an unhandled rejection.
          await page.locator('[data-invoice-edit="purchaseNo"]').click();
          const purchase = page.locator('#invoice-draft-details input[name="purchaseNo"]');
          const originalPurchase = await purchase.inputValue();
          await purchase.fill('UNSAVED-NUMBER-NAVIGATION');
          for (const field of ['invoiceNumber', 'client', 'issuingAuthority']) {
            page.once('dialog', (dialog) => dialog.dismiss());
            await page.locator(`button[data-invoice-edit="${field}"]`).first().click();
            await expect(page).toHaveURL(invoiceUrl);
            await expect(purchase).toHaveValue('UNSAVED-NUMBER-NAVIGATION');
          }
          await purchase.fill(originalPurchase);
          await numberButtons.first().click();
          await expect(page).toHaveURL(
            new RegExp('billing\\?view=setup&setup=numbering&numberingEntity='),
          );
          const numbering = page.locator('#billing-numbering-policy');
          await centered(numbering);
          await page.screenshot({ path: info.outputPath('owner-numbering.png'), fullPage: true });
          await expect(numbering.locator('select[name="legalEntityId"]')).toHaveValue(
            String(preview.issuer_legal_entity_id),
          );
          await expect(
            numbering.getByRole('button', { name: 'Save numbering policy' }),
          ).toBeEnabled();
          await page.goto(invoiceUrl);
          await page.locator('[data-invoice-edit="client"]').click();
          await expect(page).toHaveURL(new RegExp(`client=${invoice.client_id}`));
          await centered(page.locator(`#client-directory-client-${invoice.client_id}`));
          await page.goto(invoiceUrl);
          await page.locator('button[data-invoice-edit="issuingAuthority"]').first().click();
          await expect(page).toHaveURL(
            new RegExp(`finance\\?view=commercial&project=${invoice.project_id}`),
          );
          await centered(page.locator('#project-issuing-authority'));
          ownerStorage = await context.storageState();
        } else {
          await numberButtons.first().click();
          const summary = page.locator('#invoice-numbering-summary');
          await expect(summary).toHaveAttribute('open', '');
          await centered(summary);
          await page.screenshot({
            path: info.outputPath(`${role}-numbering-summary.png`),
            fullPage: true,
          });
          await expect(summary).toContainText(number.policy.prefix);
          await expect(summary).toContainText(String(number.policy.digits));
          await expect(summary).toContainText(number.policy.effectiveFrom);
          await expect(summary).toContainText('Only the Owner');
          await expect(summary.locator('input, select, button')).toHaveCount(0);
          if (role === 'auditor')
            await expect(
              page.locator('button[data-invoice-edit]:not([data-invoice-edit="invoiceNumber"])'),
            ).toHaveCount(0);
        }
        await page.goto(invoiceUrl);
        // An approved fixture is still a provisional preview; its details stay immutable.
        db.prepare("UPDATE invoice SET state='approved' WHERE id=?").run(invoice.id);
        await page.reload();
        await expect(page.locator('#invoice-draft-details')).toHaveCount(0);
        await expect(numberButtons).toHaveCount(2);
        await numberButtons.first().click();
        if (role === 'owner') await expect(page.locator('#billing-numbering-policy')).toBeVisible();
        else await expect(page.locator('#invoice-numbering-summary')).toHaveAttribute('open', '');
        db.prepare("UPDATE invoice SET state='draft' WHERE id=?").run(invoice.id);
        expect(errors).toEqual([]);
      } finally {
        db.prepare("UPDATE invoice SET state='draft' WHERE id=?").run(invoice.id);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  try {
    const api = await playwright.request.newContext({ storageState: ownerStorage! });
    try {
      const pdf = await api.get(portal(`/api/invoices/${invoice.id}/draft-preview?lang=es`));
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()['content-type']).toContain('application/pdf');
      const text = execFileSync('pdftotext', ['-layout', '-', '-'], {
        input: await pdf.body(),
        encoding: 'utf8',
      });
      expect(text).toContain(number.number);
      expect(text).toContain('no reservado');
    } finally {
      await api.dispose();
    }
    expect(sequences()).toEqual(originalSequences);
    expect(
      db.prepare('SELECT invoice_number,issued_at,state FROM invoice WHERE id=?').get(invoice.id),
    ).toMatchObject({
      invoice_number: null,
      issued_at: null,
      state: 'draft',
    });
  } finally {
    db.close();
  }
});
