import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('owner recalculates a legacy approved invoice through the billing screen', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    const candidate = db
      .prepare(
        `SELECT i.id,i.version FROM invoice i
       WHERE i.state='draft' AND i.billing_rule_id IS NOT NULL
         AND i.snapshot_json IS NOT NULL
         AND EXISTS(SELECT 1 FROM invoice_source s WHERE s.invoice_id=i.id)
         AND NOT EXISTS(SELECT 1 FROM localized_pdf_variant v
           WHERE v.owner_type='invoice' AND v.owner_id=i.id)
       ORDER BY i.created_at DESC LIMIT 1`,
      )
      .get() as { id: string; version: number } | undefined;
    if (!candidate)
      throw new Error('Disposable browser fixture needs a source-backed draft invoice');
    db.prepare(
      "UPDATE invoice SET state='approved',version=version+1,snapshot_json=NULL WHERE id=?",
    ).run(candidate.id);

    await signIn(page, 'owner');
    await page.goto(portal('/billing'));
    const row = page.locator(`tr[data-invoice-row="${candidate.id}"]`);
    const nextPage = page
      .getByRole('navigation', { name: 'Billing: Pages' })
      .getByRole('button', { name: 'Next' });
    for (let pageNumber = 0; pageNumber < 10 && (await row.count()) === 0; pageNumber += 1) {
      if (!(await nextPage.isEnabled())) break;
      await nextPage.click();
    }
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Manage' }).click();
    const form = page.locator('form[action="?/recalculateApprovedInvoice"]');
    await expect(form).toBeVisible();
    await form
      .getByLabel('Recalculation reason')
      .fill('Rebuild legacy approval with current rules');
    await form.getByRole('button', { name: 'Recalculate and review draft' }).click();
    await expect(
      page.getByText('Invoice recalculated as a draft. Review and approve it again.'),
    ).toBeVisible();
    const recovery = db
      .prepare(
        `SELECT i.id,i.state,ae.details_json FROM audit_event ae
       JOIN invoice i ON i.id=ae.entity_id
       WHERE ae.action='invoice.draft_create'
         AND json_extract(ae.details_json,'$.recalculatedFromInvoiceId')=?
       ORDER BY ae.occurred_at DESC LIMIT 1`,
      )
      .get(candidate.id) as { id: string; state: string; details_json: string } | undefined;
    expect(recovery).toMatchObject({ state: 'draft' });
    expect(JSON.parse(recovery!.details_json)).toMatchObject({
      recalculatedFromInvoiceId: candidate.id,
      recalculatedFromVersion: candidate.version + 1,
      reason: 'Rebuild legacy approval with current rules',
    });
    expect(
      db
        .prepare('SELECT state,subtotal_minor,snapshot_json FROM invoice WHERE id=?')
        .get(candidate.id),
    ).toMatchObject({ state: 'superseded', snapshot_json: null });
    expect(
      db.prepare('SELECT COUNT(*) count FROM invoice_line WHERE invoice_id=?').get(candidate.id),
    ).toMatchObject({ count: expect.any(Number) });
    expect(
      db
        .prepare(
          'SELECT replacement_invoice_id FROM invoice_approved_supersession WHERE prior_invoice_id=?',
        )
        .get(candidate.id),
    ).toEqual({ replacement_invoice_id: recovery!.id });
    await page.goto(portal(`/billing/invoices/${candidate.id}`));
    await expect(page.locator('main')).toContainText('Superseded');
  } finally {
    db.close();
  }
});
