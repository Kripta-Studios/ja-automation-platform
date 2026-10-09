import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

type LinkedInvoice = {
  id: string;
  project_id: string;
  billing_rule_id: string;
  period_start: string;
  period_end: string;
};

async function showSources(page: Page, invoice: LinkedInvoice) {
  await page.goto(portal(`/projects/${invoice.project_id}?tab=work&lang=en`));
  const composer = page.locator('[data-invoice-composer]').first();
  await expect(composer.getByLabel('What to invoice')).toBeEnabled();
  await composer.getByLabel('What to invoice').selectOption(invoice.billing_rule_id);
  await composer.getByLabel('From', { exact: true }).fill(invoice.period_start);
  await composer.getByLabel('Through (included)', { exact: true }).fill(invoice.period_end);
  await composer.getByRole('button', { name: 'Show records', exact: true }).click();
  const linked = composer.locator(`[data-containing-invoice="${invoice.id}"]`);
  await expect(linked).toBeVisible();
  return { composer, linked };
}

test('containing drafts open, edit and discard explicitly; issued invoices remain protected', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath, { readOnly: true });
  const query =
    "SELECT DISTINCT i.id,i.project_id,i.billing_rule_id,i.period_start,i.period_end FROM invoice i JOIN invoice_source s ON s.invoice_id=i.id WHERE i.state=? AND i.stream_type='labor' AND s.source_type='time' LIMIT 1";
  const draft = db.prepare(query).get('draft') as LinkedInvoice;
  const issued = db.prepare(query).get('issued') as LinkedInvoice;
  expect(draft).toBeTruthy();
  expect(issued).toBeTruthy();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'owner');
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    let { linked } = await showSources(page, draft);
    await linked.getByRole('link', { name: 'View draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/billing/invoices/${draft.id}`));
    ({ linked } = await showSources(page, draft));
    await linked.getByRole('link', { name: 'Edit draft', exact: true }).click();
    const editor = page.locator('#invoice-draft-details');
    await expect(editor).toHaveAttribute('open', '');
    await expect(editor.locator('form[action="?/updateInvoiceDraftDetails"]')).toBeVisible();
    const { linked: immutable } = await showSources(page, issued);
    await expect(immutable.getByRole('link', { name: 'View invoice', exact: true })).toBeVisible();
    await expect(immutable.getByRole('link', { name: 'Edit draft', exact: true })).toHaveCount(0);
    await expect(immutable.locator('summary')).toHaveCount(0);
  }
  const { composer, linked } = await showSources(page, draft);
  await linked.locator('summary').click();
  expect(db.prepare('SELECT id FROM invoice WHERE id=?').get(draft.id)).toBeTruthy();
  await linked.getByLabel('Reason for discarding').fill('Disposable browser regression draft');
  await linked.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(linked).toHaveCount(0);
  await expect(
    composer.getByText('Draft discarded. Its records are available again.', { exact: true }),
  ).toBeVisible();
  expect(db.prepare('SELECT id FROM invoice WHERE id=?').get(draft.id)).toBeUndefined();
  expect(
    db
      .prepare("SELECT id FROM audit_event WHERE action='invoice.delete_draft' AND entity_id=?")
      .get(draft.id),
  ).toBeTruthy();
  expect(db.prepare('SELECT state FROM invoice WHERE id=?').get(issued.id)).toEqual({
    state: 'issued',
  });
  db.close();
  expect(errors).toEqual([]);
});
