import { createDatabase, V3Repository } from '@ja/database';
import { runArtifactJobs } from '@ja/reporting';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eDatabasePath, e2eDocumentRoot } from './environment.js';

test('Finance explicitly queues a PDF email without marking invoice sent', async ({
  page,
}, testInfo) => {
  await signIn(page, 'finance');
  const { sqlite } = createDatabase(e2eDatabasePath);
  try {
    runArtifactJobs({
      documentRoot: e2eDocumentRoot,
      repository: { createInvoiceDraftFromJob: () => undefined },
      v3: new V3Repository(sqlite),
    });
    const invoice = sqlite
      .prepare(
        "SELECT id,state,sent_at FROM invoice WHERE state IN ('issued','sent','partially_paid','paid','overdue') AND pdf_status='ready' ORDER BY created_at DESC LIMIT 1",
      )
      .get() as { id: string; state: string; sent_at: string | null };
    expect(invoice).toBeTruthy();
    const openInvoice = async () => {
      await page.goto(portal('/billing'));
      const card = page.locator(`[data-row="${invoice.id}"]`);
      if (await card.isVisible())
        await card.getByRole('link', { name: 'Manage', exact: true }).click();
      else
        await page
          .locator(`tr[data-invoice-row="${invoice.id}"]`)
          .getByRole('button', { name: 'Manage', exact: true })
          .click();
    };
    await openInvoice();
    const row = page.locator(`article[data-invoice-row="${invoice.id}"]`);
    await expect(row).toBeVisible();
    await row.locator('summary').filter({ hasText: 'Send by email' }).click();
    const form = row.locator('form[action="?/emailInvoice"]');
    const input = form.locator('input[name="recipient"]');
    await expect(input).toBeVisible();
    await input.fill(`finance-${testInfo.project.name}@example.test`);
    await expect(form.locator('select[name="emailChoice"]')).toHaveValue('');
    await form.locator('select[name="emailChoice"]').selectOption('no');
    await form.getByRole('button', { name: 'Send by email', exact: true }).click();
    await expect(page.getByText('Email not sent', { exact: true }).first()).toBeVisible();
    expect(
      sqlite
        .prepare(
          "SELECT count(*) n FROM outbox_event WHERE topic='invoice.email.requested' AND aggregate_id=? AND json_extract(payload_json,'$.recipient')=?",
        )
        .get(invoice.id, `finance-${testInfo.project.name}@example.test`),
    ).toEqual({ n: 0 });
    await openInvoice();
    await row.locator('summary').filter({ hasText: 'Send by email' }).click();
    await input.fill(`finance-${testInfo.project.name}@example.test`);
    await form.locator('select[name="emailChoice"]').selectOption('yes');
    const button = form.getByRole('button', { name: 'Send by email', exact: true });
    await expect(button).toBeEnabled();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('emailInvoice'),
    );
    await button.click();
    expect((await response).status()).toBe(200);
    const after = sqlite.prepare('SELECT id,state,sent_at FROM invoice WHERE id=?').get(invoice.id);
    expect(after).toEqual(invoice);
    expect(
      sqlite
        .prepare(
          "SELECT count(*) n FROM outbox_event WHERE topic='invoice.email.requested' AND aggregate_id=? AND json_extract(payload_json,'$.recipient')=?",
        )
        .get(invoice.id, `finance-${testInfo.project.name}@example.test`),
    ).toEqual({ n: 1 });
    await openInvoice();
    await page
      .locator(`article[data-invoice-row="${invoice.id}"] summary`)
      .filter({ hasText: 'Send by email' })
      .click();
    await expect(row).toContainText('Email queued');
    await page.screenshot({
      path: testInfo.outputPath('invoice-email-queued.png'),
      fullPage: false,
    });
  } finally {
    sqlite.close();
  }
});
